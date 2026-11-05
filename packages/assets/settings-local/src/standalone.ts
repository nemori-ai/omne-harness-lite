import { z } from 'zod'
import type { CommitResultV2, QueryResultV2, FactCommandV2 } from '@omne-harness/sql-contract'
import { digest, json, equal, withinBudget } from './encoding.ts'
import { domainSchema, failureSchema } from './schema.ts'
import {
  StandaloneMutationSchema,
  STANDALONE_PARTICIPANT,
  type StandaloneMutation,
} from './standalone-schema.ts'
import type { SettingsSqlGuards } from './types.ts'
import type { SettingsSqlTerminalOptions } from './terminals.ts'
import type { SettingsProjectionBinding } from './projection.ts'
import type { SettingsCommitResult, SettingsFailure } from '@omne-harness/settings'
export const standaloneSettingsGuards: SettingsSqlGuards = {
  participant: STANDALONE_PARTICIPANT,
  command: binding => ({
    participant: STANDALONE_PARTICIPANT,
    facts: { kind: 'guard', binding: json(binding) },
  }),
}
export function standaloneSettingsProjectionCommand(
  binding: SettingsProjectionBinding,
): FactCommandV2 {
  return { participant: STANDALONE_PARTICIPANT, facts: { kind: 'capture', binding: json(binding) } }
}
export function createStandaloneSettingsOwner(input: SettingsSqlTerminalOptions) {
  const options = { ...input, domain: domainSchema.parse(input.domain) }
  const identity = (operationId: string) => ({
    ...options.domain,
    operation: 'settings.target',
    protocolVersion: '2' as const,
    operationKey: digest(operationId),
  })
  function result(
    value: CommitResultV2 | QueryResultV2,
    operationId: string,
  ): SettingsCommitResult {
    if (!equal(value.identity, identity(operationId))) return { kind: 'unknown', operationId }
    if (value.kind === 'identity_conflict')
      return { kind: 'rejected', reason: 'operation_conflict' }
    if (value.kind === 'committed') {
      const response = z
        .strictObject({ kind: z.literal('changed'), revision: z.number().int().positive() })
        .safeParse(
          value.responses.find(r => r.participant === STANDALONE_PARTICIPANT)?.reply.response,
        )
      if (response.success)
        return { kind: 'committed', operationId, revision: response.data.revision, changed: true }
    }
    if (value.kind === 'rolled_back') {
      const response = value.responses.at(-1)?.reply
      if (response?.kind === 'conflict') {
        const failure = failureSchema.safeParse(response.basis)
        if (failure.success) return failure.data
      }
      return { kind: 'rejected', reason: 'unavailable' }
    }
    if (value.kind === 'rejected_before_accept')
      return { kind: 'rejected', reason: value.reason === 'closing' ? 'closing' : 'unavailable' }
    return { kind: 'unknown', operationId }
  }
  const active = new Set<Promise<SettingsCommitResult>>()
  let closing: Promise<void> | undefined
  return {
    mutate(raw: StandaloneMutation): Promise<SettingsCommitResult> {
      const reject = (reason: SettingsFailure['reason']) =>
        Promise.resolve({ kind: 'rejected' as const, reason })
      if (closing) return reject('closing')
      if (!withinBudget(raw)) return reject('limit_exceeded')
      const parsed = StandaloneMutationSchema.safeParse(raw)
      if (!parsed.success) return reject('invalid_input')
      const command = parsed.data
      const pending = options.storage
        .commit({
          identity: identity(command.operationId),
          combinationVersion: options.combinationVersion,
          manifestDigest: options.manifestDigest,
          commands: [
            {
              participant: STANDALONE_PARTICIPANT,
              facts: { kind: 'mutate', domain: json(options.domain), command: json(command) },
            },
          ],
        })
        .then(r => result(r, command.operationId))
        .catch((): SettingsCommitResult => ({ kind: 'unknown', operationId: command.operationId }))
      active.add(pending)
      void pending.then(() => active.delete(pending))
      return pending
    },
    async getOperation(operationId: string): Promise<SettingsCommitResult> {
      if (closing) return { kind: 'rejected', reason: 'closing' }
      if (!StandaloneMutationSchema.options[0].shape.operationId.safeParse(operationId).success)
        return { kind: 'rejected', reason: 'invalid_input' }
      try {
        return result(await options.storage.query(identity(operationId)), operationId)
      } catch {
        return { kind: 'unknown', operationId }
      }
    },
    close() {
      return (closing ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}
export type { StandaloneMutation } from './standalone-schema.ts'
