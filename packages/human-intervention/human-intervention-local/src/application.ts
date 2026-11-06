import type { z } from 'zod'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  HitlCommandSchemas,
  RecoveryCommandSchemas,
  GetOperationSchema,
  GetRequestSchema,
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
  type RecoveryWrites,
} from '@omne-harness/human-intervention'
import { createIdentityQualifiedHitl, type IdentityHitlCommand } from './identity.ts'
import { createIndependentHitlQueries, type IndependentHitlQueryOptions } from './queries.ts'
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

/** Independent-wait application entry. Its preparation belongs to the trusted original-work owner. */
export function createIndependentHitlApplication(
  options: IndependentHitlQueryOptions,
): Application & { close(): Promise<void> } {
  const identity = createIdentityQualifiedHitl(options)
  const queries = createIndependentHitlQueries(options)
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
        return { kind: 'routed', wait: input.command.origin.wait } as const
      case 'invalidateWait':
        return { kind: 'routed', wait: input.command.waitRef } as const
      case 'acknowledgeDelivery':
        return { kind: 'routed', wait: input.command.consumerReceipt.wait } as const
      case 'submitReply': {
        const found = await queries.getRequest(
          access,
          GetRequestSchema.parse({ protocol: 'hitl/1', requestRef: input.command.cardRef.request }),
        )
        return found.kind === 'found'
          ? ({ kind: 'routed', wait: found.request.origin.wait } as const)
          : found
      }
    }
  }
  async function execute<T>(
    access: Access,
    command: IdentityHitlCommand,
    schema: z.ZodType<T>,
    operationRef: OperationRef,
  ): Promise<T> {
    const result = await identity.execute(access, command)
    const parsed = schema.safeParse('operationRef' in result ? result : { ...result, operationRef })
    return parsed.success ? parsed.data : schema.parse({ kind: 'unknown', operationRef })
  }
  function write<M extends HitlMethod>(
    access: Access,
    method: M,
    input: HitlCommands[M],
  ): Promise<CommandResult<M>> {
    const operationRef = input.operation
    return run(
      async (): Promise<CommandResult<M>> => {
        if (Buffer.byteLength(canonical(input), 'utf8') > HITL_COMMAND_MAX_BYTES)
          return {
            kind: 'limited',
            resource: 'command-bytes',
            limit: HITL_COMMAND_MAX_BYTES,
            operationRef,
          }
        const parsed = HitlCommandSchemas[method].safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'command', operationRef }
        const command = SqlCommandSchema.parse({ method, command: parsed.data })
        const routed = await route(access, command)
        if (routed.kind !== 'routed') return { ...routed, operationRef }
        return execute(
          access,
          { kind: 'request', input: command, waitRef: routed.wait },
          CommandResultSchemas[method],
          operationRef,
        )
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
