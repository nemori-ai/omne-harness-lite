import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  SettingsChangeSchema,
  SettingsIdSchema,
  SettingsTargetSchema,
  type SettingsChange,
  type SettingsCommitResult,
  type SettingsTarget,
} from '@omne-harness/settings'
import {
  commandDigest,
  equal,
  identity,
  json,
  withinBudget,
  settingsSqlOperationBinding,
} from './encoding.ts'
import {
  accessGrantSchema,
  changesSchema,
  domainSchema,
  failureSchema,
  HANDLER,
  PARTICIPANT,
  PROTOCOL,
  readRequestSchema,
  stateResultSchema,
  type Binding,
} from './schema.ts'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import { createSettingsSqlTerminals } from './terminals.ts'
import { receiptResult, rejected } from './results.ts'
import type { SettingsSqlAccessRequest, SettingsSqlBackend, SettingsSqlOptions } from './types.ts'

async function authorize<Context>(
  options: SettingsSqlOptions<Context>,
  context: Context,
  target: SettingsTarget,
  action: SettingsSqlAccessRequest['action'],
) {
  const result = await options.access.authorize(context, {
    scope: options.domain.scope,
    target,
    action,
  })
  if (result.kind === 'rejected') return failureSchema.parse(result)
  const grant = accessGrantSchema.safeParse(result)
  if (
    !grant.success ||
    !equal(grant.data.scope, options.domain.scope) ||
    !equal(grant.data.target, target)
  )
    return rejected('forbidden')
  return grant.data
}
async function commit<Context>(
  options: SettingsSqlOptions<Context>,
  context: Context,
  input: SettingsChange,
): Promise<SettingsCommitResult> {
  if (!withinBudget(input)) return rejected('limit_exceeded')
  const parsed = SettingsChangeSchema.safeParse(input)
  if (!parsed.success) return rejected('invalid_input')
  const command = parsed.data
  const access = await authorize(options, context, command.target, 'commit')
  if (access.kind === 'rejected') return access
  const binding: Binding = {
    domain: options.domain,
    principalRef: access.principalRef,
    command,
    commandDigest: commandDigest(command),
  }
  const lookup = { ...binding, target: command.target, operationId: command.operationId }
  const sqlIdentity = identity(
    options.domain,
    access.principalRef,
    command.target,
    command.operationId,
  )
  const unknown = { kind: 'unknown' as const, operationId: command.operationId }
  try {
    const terminal = await createSettingsSqlTerminals(options).inspect(
      settingsSqlOperationBinding(binding),
    )
    if (terminal.kind === 'conflict') return rejected('operation_conflict')
    if (terminal.kind === 'unavailable') return unknown
    const original = receiptResult(
      await options.storage.query(sqlIdentity),
      lookup,
      options.guards.participant,
    )
    if (original.kind !== 'not_found') return original
    if (terminal.kind === 'terminal')
      return terminal.terminal.state === 'aborted' ? rejected('basis_changed') : unknown
    const guard = options.guards.command(binding)
    const commands = 'participant' in guard ? [guard] : guard
    if (!commands.some(command => command.participant === options.guards.participant))
      return rejected('unsupported')
    const result = await options.storage.commit({
      identity: sqlIdentity,
      combinationVersion: options.combinationVersion,
      manifestDigest: options.manifestDigest,
      commands: [
        {
          participant: TERMINAL_PARTICIPANT,
          facts: { kind: 'consume', binding: json(settingsSqlOperationBinding(binding)) },
        },
        ...commands,
        { participant: PARTICIPANT, facts: { binding: json(binding) } },
      ],
    })
    const mapped = receiptResult(result, lookup, options.guards.participant)
    return mapped.kind === 'not_found' ? unknown : mapped
  } catch {
    return unknown
  }
}
const operationInputSchema = z.strictObject({
  target: SettingsTargetSchema,
  operationId: SettingsIdSchema,
})
const changesInputSchema = z.strictObject({
  target: SettingsTargetSchema,
  afterRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  limit: z.number().int().min(1).max(100),
})

export function createSettingsSqlBackend<Context>(
  input: SettingsSqlOptions<Context>,
): SettingsSqlBackend<Context> {
  const options = { ...input, domain: domainSchema.parse(input.domain) }
  SettingsIdSchema.parse(options.combinationVersion)
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(options.manifestDigest)
  SettingsIdSchema.parse(options.guards.participant)
  if (options.guards.participant === PARTICIPANT)
    throw new TypeError('Settings requires a distinct guard participant')
  const active = new Set<Promise<unknown>>()
  let closed: Promise<void> | undefined
  function run<T>(task: () => Promise<T>) {
    if (closed) return Promise.resolve(rejected('closing'))
    const promise = task().catch(() => rejected('unavailable'))
    active.add(promise)
    void promise.then(() => active.delete(promise))
    return promise
  }
  async function read(
    context: Context,
    target: SettingsTarget,
    action: 'readState' | 'readChanges',
    fields: object,
  ) {
    const access = await authorize(options, context, target, action)
    if (access.kind === 'rejected') return access
    const request = readRequestSchema.parse({
      domain: options.domain,
      principalRef: access.principalRef,
      target,
      ...fields,
    })
    const result = await options.storage.read({
      domain: options.domain,
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: json(request),
    })
    return result.kind === 'read'
      ? result
      : rejected(
          result.kind === 'unavailable' && result.reason === 'closing' ? 'closing' : 'unavailable',
        )
  }
  return {
    commit: (context, command) => run(() => commit(options, context, command)),
    getOperation: (context, input) =>
      run(async () => {
        const parsed = operationInputSchema.safeParse(input)
        if (!parsed.success) return rejected('invalid_input')
        const access = await authorize(options, context, parsed.data.target, 'getOperation')
        if (access.kind === 'rejected') return access
        const lookup = { domain: options.domain, principalRef: access.principalRef, ...parsed.data }
        try {
          const result = receiptResult(
            await options.storage.query(
              identity(options.domain, access.principalRef, lookup.target, lookup.operationId),
            ),
            lookup,
            options.guards.participant,
          )
          if (result.kind !== 'not_found') return result
          const terminal = await createSettingsSqlTerminals(options).inspect(lookup)
          if (terminal.kind === 'absent') return result
          if (terminal.kind === 'terminal' && terminal.terminal.state === 'aborted')
            return rejected('basis_changed')
          return { kind: 'unknown' as const, operationId: lookup.operationId }
        } catch {
          return { kind: 'unknown' as const, operationId: lookup.operationId }
        }
      }),
    readState: (context, target) =>
      run(async () => {
        const parsed = SettingsTargetSchema.safeParse(target)
        if (!parsed.success) return rejected('invalid_input')
        const result = await read(context, parsed.data, 'readState', { kind: 'state' })
        return result.kind === 'read' ? stateResultSchema.parse(result.output) : result
      }),
    readChanges: (context, input) =>
      run(async () => {
        const parsed = changesInputSchema.safeParse(input)
        if (!parsed.success) return rejected('invalid_input')
        const result = await read(context, parsed.data.target, 'readChanges', {
          kind: 'changes',
          afterRevision: parsed.data.afterRevision,
          limit: parsed.data.limit,
        })
        return result.kind === 'read' ? changesSchema.parse(result.output) : result
      }),
    close() {
      return (closed ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}
