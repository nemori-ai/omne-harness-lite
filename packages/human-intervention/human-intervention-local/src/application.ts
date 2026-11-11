import type { z } from 'zod'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  HitlCommandSchemas,
  RecoveryCommandSchemas,
  GetOperationSchema,
  HITL_COMMAND_MAX_BYTES,
  type HumanInterventionCommands,
  type RecoveryCommands,
  type HumanInterventionQueries,
  type RecoveryQueries,
  type CommandResult,
  type RecoveryCommandResult,
  type OperationRef,
  type HitlMethod,
  type RecoveryMethod,
  type HitlCommands,
  type Origin,
  type RecoveryWrites,
} from '@omne-harness/human-intervention'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { createIdentityQualifiedHitl, type IdentityHitlCommand } from './identity.ts'
import { createIndependentHitlQueryRuntime, type IndependentHitlQueryOptions } from './queries.ts'
import { CommandResultSchemas, RecoveryResultSchemas } from './operation-schema.ts'
import { canonical } from './encoding.ts'
import { SqlCommandSchema, type SqlCommand } from './request-schema.ts'
import { createIndependentRecoveryQueries } from './recovery-queries.ts'
import { IndependentCommandSchema } from './independent-schema.ts'

type Access = ActingForTenantPrincipal
type Application = HumanInterventionCommands<Access> &
  RecoveryCommands<Access> &
  HumanInterventionQueries<Access> &
  RecoveryQueries<Access>

/**
 * 原工作拥有者为一个来源要求的守卫命令。装配提供它；登记与答复把返回的命令放进同一笔提交。
 * 来源带 sessionRef 时 Session 守卫是必需的：返回空清单表示装配缺少守卫，不表示不适用。
 */
export type HitlGuards = (origin: Origin) => readonly FactCommandV2[]
export type HitlApplicationOptions = IndependentHitlQueryOptions & Readonly<{ guards: HitlGuards }>

/** HITL 应用入口。等待的准备材料归可信的原工作拥有者。 */
export function createIndependentHitlApplication(
  options: HitlApplicationOptions,
): Application & { close(): Promise<void> } {
  const identity = createIdentityQualifiedHitl(options)
  const queries = createIndependentHitlQueryRuntime(options)
  const recovery = createIndependentRecoveryQueries(options, identity)
  const active = new Set<Promise<unknown>>()
  let closing = false,
    closed: Promise<void> | undefined
  function run<T>(work: () => Promise<T>, failure: T): Promise<T> {
    if (closing) return Promise.resolve(failure)
    const pending = Promise.resolve()
      .then(work)
      .catch(() => failure)
    active.add(pending)
    void pending.finally(() => active.delete(pending))
    return pending
  }
  const unavailable = { kind: 'unavailable', reason: 'application-unavailable' } as const
  async function route(access: Access, input: SqlCommand) {
    switch (input.method) {
      case 'registerRequest':
        return {
          kind: 'routed',
          wait: input.command.origin.wait,
          origin: input.command.origin,
        } as const
      case 'invalidateWait':
        return { kind: 'routed', wait: input.command.waitRef } as const
      case 'acknowledgeDelivery':
        return { kind: 'routed', wait: input.command.consumerReceipt.wait } as const
      case 'submitReply':
        return queries.route(access, input.command.cardRef.request)
    }
  }
  /** 登记与答复按原来源取守卫；失效与确认交接不取。缺少必需的 Session 守卫时返回 undefined。 */
  function guardsOf(origin: Origin | undefined): readonly FactCommandV2[] | undefined {
    if (origin === undefined) return []
    const guards = options.guards(origin)
    return origin.sessionRef !== undefined && guards.length === 0 ? undefined : guards
  }
  async function execute<T>(
    access: Access,
    command: IdentityHitlCommand,
    schema: z.ZodType<T>,
    operationRef: OperationRef,
    guards: readonly FactCommandV2[] = [],
  ): Promise<T> {
    const result = await identity.execute(access, command, guards)
    const parsed = schema.safeParse('operationRef' in result ? result : { ...result, operationRef })
    return parsed.success ? parsed.data : schema.parse({ kind: 'unknown', operationRef })
  }
  const guardRejected = (answer: { kind: string; reason?: unknown }): boolean =>
    answer.kind === 'conflict' && answer.reason === 'guard-rejected'
  /**
   * 原来源守卫拒绝了一次答复：原工作已经不在进行。卡片若已有终态，答复的人得到的是卡片的终态
   * （已失效，或已有的决定），不是守卫的拒绝：卡片的终态不再变化，所以这次读取就是定论。卡片仍
   * 待答时返回 undefined，守卫的拒绝照旧。
   */
  async function closedCardAnswer<M extends HitlMethod>(
    access: Access,
    reply: HitlCommands['submitReply'],
    operationRef: OperationRef,
  ): Promise<CommandResult<M> | undefined> {
    const read = await queries.getCard(access, { protocol: reply.protocol, cardRef: reply.cardRef })
    if (read.kind !== 'found') return undefined
    const { card } = read.item
    const closed =
      card.kind === 'invalidated'
        ? { kind: 'invalidated', reason: card.reason, operationRef }
        : card.kind === 'decided'
          ? { kind: 'already-decided', decision: card.decision, operationRef }
          : undefined
    const parsed = CommandResultSchemas.submitReply.safeParse(closed)
    return parsed.success ? (parsed.data as CommandResult<M>) : undefined
  }
  function write<M extends HitlMethod>(
    access: Access,
    method: M,
    input: HitlCommands[M],
  ): Promise<CommandResult<M>> {
    const operationRef = input.operation
    return run(
      async (): Promise<CommandResult<M>> => {
        const parsed = HitlCommandSchemas[method].safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'command', operationRef }
        if (Buffer.byteLength(canonical(parsed.data), 'utf8') > HITL_COMMAND_MAX_BYTES)
          return {
            kind: 'limited',
            resource: 'command-bytes',
            limit: HITL_COMMAND_MAX_BYTES,
            operationRef,
          }
        const command = SqlCommandSchema.parse({ method, command: parsed.data })
        const routed = await route(access, command)
        if (routed.kind !== 'routed') return { ...routed, operationRef }
        const guards = guardsOf('origin' in routed ? routed.origin : undefined)
        if (!guards) return { kind: 'unavailable', reason: 'session-guard-missing', operationRef }
        const answer = await execute(
          access,
          { kind: 'request', input: command, waitRef: routed.wait },
          CommandResultSchemas[method],
          operationRef,
          guards,
        )
        return command.method === 'submitReply' && guardRejected(answer)
          ? ((await closedCardAnswer(access, command.command, operationRef)) ?? answer)
          : answer
      },
      { ...unavailable, operationRef },
    )
  }
  function recover<M extends RecoveryMethod>(
    access: Access,
    method: M,
    input: RecoveryWrites[M],
  ): Promise<RecoveryCommandResult<M>> {
    const operationRef = input.operation
    return run(
      async (): Promise<RecoveryCommandResult<M>> => {
        const parsed = RecoveryCommandSchemas[method].safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'command', operationRef }
        const command = IndependentCommandSchema.parse({
          kind: method === 'bindReceiver' ? 'bind' : 'consume',
          command: parsed.data,
        })
        if (command.kind !== 'bind' && command.kind !== 'consume')
          return { kind: 'invalid-input', reason: 'command', operationRef }
        return execute(access, command, RecoveryResultSchemas[method], operationRef)
      },
      { ...unavailable, operationRef },
    )
  }
  async function inspect(
    access: Access,
    input: Parameters<HumanInterventionQueries<Access>['getOperation']>[1],
  ) {
    const parsed = GetOperationSchema.safeParse(input)
    if (!parsed.success) return { kind: 'invalid-input', reason: 'query' } as const
    const result = await identity.inspect(access, {
      operationRef: parsed.data.operationRef,
      inputDigest: parsed.data.inputDigest,
    })
    const current = await identity.qualify(access)
    return current.kind === 'qualified' ? result : current
  }
  const application: Application = {
    registerRequest: (access, command) => write(access, 'registerRequest', command),
    submitReply: (access, command) => write(access, 'submitReply', command),
    invalidateWait: (access, command) => write(access, 'invalidateWait', command),
    acknowledgeDelivery: (access, command) => write(access, 'acknowledgeDelivery', command),
    bindReceiver: (access, command) => recover(access, 'bindReceiver', command),
    consumeDecision: (access, command) => recover(access, 'consumeDecision', command),
    getRequest: (access, query) => run(() => queries.getRequest(access, query), unavailable),
    getCard: (access, query) => run(() => queries.getCard(access, query), unavailable),
    listPool: (access, query) => run(() => queries.listPool(access, query), unavailable),
    listDeliveries: (access, query) =>
      run(() => recovery.listDeliveries(access, query), unavailable),
    getWait: (access, query) => run(() => recovery.getWait(access, query), unavailable),
    readInbox: (access, query) => run(() => recovery.readInbox(access, query), unavailable),
    getOperation(access, query) {
      return run(async () => {
        const result = await inspect(access, query)
        if (result.kind !== 'committed') return result
        switch (result.method) {
          case 'registerRequest':
          case 'submitReply':
          case 'invalidateWait':
          case 'acknowledgeDelivery':
            return result
          default:
            return {
              kind: 'conflict',
              operationRef: query.operationRef,
              reason: 'operation-method',
            }
        }
      }, unavailable)
    },
    getRecoveryOperation(access, query) {
      return run(async () => {
        const result = await inspect(access, query)
        if (result.kind !== 'committed') return result
        switch (result.method) {
          case 'bindReceiver':
          case 'consumeDecision':
            return result
          default:
            return {
              kind: 'conflict',
              operationRef: query.operationRef,
              reason: 'operation-method',
            }
        }
      }, unavailable)
    },
  }
  return {
    ...application,
    close() {
      closing = true
      return (closed ??= Promise.allSettled(active).then(async () => {
        await queries.close()
        await identity.close()
      }))
    },
  }
}
