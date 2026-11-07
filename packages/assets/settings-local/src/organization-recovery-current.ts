import { z } from 'zod'
import type { RolledBackV2 } from '@omne-harness/sql-contract'
import { businessRefusalSchema } from './commit-current.ts'
import type { StandingRequest } from '@omne-harness/identity'
import type { SettingsAttemptBinding } from './attempt-binding.ts'
import { decodeSettingsRecoveryReference } from './recovery-reference.ts'
import { matchesOrganizationCurrentSource } from './organization-current-material.ts'
import {
  organizationCurrentParticipant,
  organizationCurrentRequestSchema,
  type OrganizationCurrentConfiguration,
} from './organization-current-schema.ts'
import { digest, equal, json } from './encoding.ts'
export function organizationRecoveryCommands(
  configuration: OrganizationCurrentConfiguration,
  request: StandingRequest,
  phase: 'ready' | 'commit',
  binding: SettingsAttemptBinding,
) {
  const original = request.binding
  const reference = decodeSettingsRecoveryReference(original.targetRef)
  const expectedReference = {
    version: 'settings-recovery/1',
    kind: 'attempt',
    target: binding.identity.operation.target,
    rootOperationId: binding.identity.operation.operationId,
    rootCommandDigest: binding.commandDigest,
    commandKind: binding.commandKind,
  }
  const originalIdentity = {
    owner: original.owner,
    destination: original.destination,
    principalRef: original.principalRef,
    operationId: original.operationId,
    inputDigest: original.inputDigest,
  }
  if (
    !equal(originalIdentity, {
      owner: 'settings',
      destination: configuration.destination,
      principalRef: binding.identity.principalRef,
      operationId: binding.attemptId,
      inputDigest: binding.commandDigest,
    }) ||
    !equal(reference, expectedReference) ||
    !equal(request.required, ['organization-settings-manage']) ||
    !matchesOrganizationCurrentSource(
      { domain: binding.identity.domain, target: binding.identity.operation.target },
      original.scopeRef,
    )
  )
    throw new Error('Organization recovery must retain the exact original authority')
  return [
    {
      participant: organizationCurrentParticipant(phase),
      facts: {
        request: json(
          organizationCurrentRequestSchema.parse({
            identity: binding.identity,
            commandKind: binding.commandKind,
            actorTenantRef: original.scopeRef,
            attempt: binding,
          }),
        ),
      },
    },
  ]
}

const refusalSchema = z.strictObject({ kind: z.literal('rejected'), reason: businessRefusalSchema })
export function organizationReadyRefused(
  receipt: RolledBackV2,
  configuration: OrganizationCurrentConfiguration,
) {
  const stopping = receipt.responses.at(-1)
  return (
    receipt.identity.operation === 'settings.ready' &&
    stopping?.participant === organizationCurrentParticipant('ready') &&
    stopping.protocol === `settings-organization-current/1/ready/${digest(configuration)}` &&
    stopping.reply.kind === 'unsupported' &&
    refusalSchema.safeParse(stopping.reply.basis).success
  )
}
