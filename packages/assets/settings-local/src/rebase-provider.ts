import { sourceWriteCommands } from './source-write.ts'
import {
  SettingsRebaseSchema,
  type SettingsRebase,
  type SettingsCommitResult,
} from '@omne-harness/settings'
import type { SettingsSqlOptions } from './types.ts'
import type { SettingsProjectionCommands } from './catalog.ts'
import { accessGrantSchema, PARTICIPANT } from './schema.ts'
import { equal, identity, json, withinBudget } from './encoding.ts'
import { receiptResult, rejected } from './results.ts'
import { TARGET_GUARD } from './target-guard.ts'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import { createSettingsSqlTerminals } from './terminals.ts'
import {
  projectionForRebase,
  rebaseDigest,
  rebaseOperation,
  type RebaseBinding,
} from './rebase-schema.ts'
async function authorizeRebase<Context>(
  options: SettingsSqlOptions<Context>,
  context: Context,
  command: SettingsRebase,
) {
  const authorized = await options.access.authorize(context, {
    scope: options.domain.scope,
    target: command.target,
    action: 'commit',
  })
  if (authorized.kind === 'rejected') return authorized
  const grant = accessGrantSchema.safeParse(authorized)
  if (
    !grant.success ||
    !equal(grant.data.scope, options.domain.scope) ||
    !equal(grant.data.target, command.target)
  )
    return rejected('forbidden')
  return { kind: 'authorized' as const, principalRef: grant.data.principalRef }
}
export function createSettingsSqlRebaser<Context>(
  options: SettingsSqlOptions<Context> & { project: SettingsProjectionCommands },
) {
  return async (context: Context, raw: SettingsRebase): Promise<SettingsCommitResult> => {
    if (!withinBudget(raw)) return rejected('limit_exceeded')
    const parsed = SettingsRebaseSchema.safeParse(raw)
    if (!parsed.success) return rejected('invalid_input')
    const command = parsed.data
    const grant = await authorizeRebase(options, context, command)
    if (grant.kind === 'rejected') return grant
    const binding: RebaseBinding = {
      domain: options.domain,
      principalRef: grant.principalRef,
      command,
      commandDigest: rebaseDigest(command),
    }
    const operation = rebaseOperation(binding),
      sqlIdentity = identity(
        options.domain,
        binding.principalRef,
        command.target,
        command.operationId,
      )
    const lookup = { ...operation }
    const original = receiptResult(await options.storage.query(sqlIdentity), lookup, TARGET_GUARD)
    if (original.kind !== 'not_found') return original
    const terminal = await createSettingsSqlTerminals(options).inspect(operation)
    if (terminal.kind === 'terminal')
      return terminal.terminal.state === 'aborted'
        ? rejected('basis_changed')
        : { kind: 'unknown', operationId: command.operationId }
    if (terminal.kind === 'conflict') return rejected('operation_conflict')
    if (terminal.kind === 'unavailable')
      return { kind: 'unknown', operationId: command.operationId }
    const result = await options.storage.commit({
      identity: sqlIdentity,
      combinationVersion: options.combinationVersion,
      manifestDigest: options.manifestDigest,
      commands: [
        ...sourceWriteCommands({ kind: 'rebase', operation }),
        { participant: TERMINAL_PARTICIPANT, facts: { kind: 'consume', binding: json(operation) } },
        ...options.project(projectionForRebase(binding)),
        { participant: TARGET_GUARD, facts: { kind: 'rebase', binding: json(binding) } },
        { participant: PARTICIPANT, facts: { kind: 'rebase', binding: json(binding) } },
      ],
    })
    const answer = receiptResult(result, lookup, TARGET_GUARD)
    return answer.kind === 'not_found'
      ? { kind: 'unknown', operationId: command.operationId }
      : answer
  }
}
