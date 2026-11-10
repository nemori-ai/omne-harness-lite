import { sourceWriteCommands, sourceTargetWriteBinding } from './source-write.ts'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { CommitResultV2, QueryResultV2, FactCommandV2 } from '@omne-harness/sql-contract'
import { digest, json, equal, withinBudget } from './encoding.ts'
import { domainSchema, failureSchema } from './schema.ts'
import {
  StandaloneMutationSchema,
  STANDALONE_PARTICIPANT,
  STANDALONE_PROJECTION,
  type StandaloneMutation,
} from './standalone-schema.ts'
import type { SettingsSqlTerminalOptions } from './terminal-schema.ts'
import type { SettingsProjectionBinding } from './projection.ts'
import type {
  SettingsCommitResult,
  SettingsOperationResult,
  SettingsFailure,
  SettingsTarget,
} from '@omne-harness/settings'
import { SettingsTargetSchema } from '@omne-harness/settings'
import { isIndependentTargetInDomain } from './standalone-records.ts'
import {
  STANDALONE_READ,
  StandaloneTargetReadResultSchema,
  type StandaloneTargetReadResult,
} from './standalone-read-schema.ts'
export function standaloneSettingsProjectionCommand(
  binding: SettingsProjectionBinding,
): FactCommandV2 {
  return { participant: STANDALONE_PROJECTION, facts: { kind: 'capture', binding: json(binding) } }
}
export function standaloneSettingsPublicationCommand(
  binding: SettingsProjectionBinding,
): FactCommandV2 {
  return {
    participant: STANDALONE_PROJECTION,
    facts: { kind: 'capturePublication', binding: json(binding) },
  }
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
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  return {
    readTarget(raw: SettingsTarget): Promise<StandaloneTargetReadResult> {
      const fail = (reason: SettingsFailure['reason']): StandaloneTargetReadResult => ({
        kind: 'rejected',
        reason,
      })
      if (closing) return Promise.resolve(fail('closing'))
      const target = SettingsTargetSchema.safeParse(raw)
      if (!target.success) return Promise.resolve(fail('invalid_input'))
      if (!isIndependentTargetInDomain(options.domain, target.data))
        return Promise.resolve(fail('forbidden'))
      const pending = Promise.resolve()
        .then(() =>
          options.storage.read({
            domain: options.domain,
            ...STANDALONE_READ,
            requestKey: randomUUID(),
            input: json({ domain: options.domain, target: target.data }),
          }),
        )
        .then((result): StandaloneTargetReadResult => {
          if (result.kind !== 'read') return fail('unavailable')
          const parsed = StandaloneTargetReadResultSchema.parse(result.output)
          return parsed.kind === 'found' && !equal(parsed.projection.target, target.data)
            ? fail('unavailable')
            : parsed
        })
        .catch(() => fail('unavailable'))
      active.add(pending)
      void pending.then(() => active.delete(pending))
      return pending
    },
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
            ...sourceWriteCommands(sourceTargetWriteBinding(options.domain, command)),
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
    async getOperation(operationId: string): Promise<SettingsOperationResult> {
      if (closing) return { kind: 'rejected', reason: 'closing' }
      if (!StandaloneMutationSchema.options[0].shape.operationId.safeParse(operationId).success)
        return { kind: 'rejected', reason: 'invalid_input' }
      try {
        const found = await options.storage.query(identity(operationId))
        if (found.kind === 'not_committed' && equal(found.identity, identity(operationId)))
          return { kind: 'not_found' }
        return result(found, operationId)
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
