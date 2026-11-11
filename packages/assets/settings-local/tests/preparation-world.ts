import { z } from 'zod'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import {
  isStandingBinding,
  standingReservationId,
  type StandingBinding,
} from '@omne-harness/identity'
import { allocation, openIntentWorld } from './intent-world.ts'
import { openRecoveryWorld, recoveryRequest } from './recovery-world.ts'
import type { ReadySettingsIntent } from '../src/intent-ready.ts'
import type { IntentAllocation } from '../src/intent-schema.ts'
export function reply(result: CommitResultV2, participant = 'settings.persistence') {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses.find(response => response.participant === participant)?.reply.response
}
export async function openPreparationWorld(
  options: {
    held?: boolean
    manifest?: boolean
    configure?: (input: IntentAllocation) => void
    initialize?: (root: string, input: IntentAllocation) => void
  } = {},
) {
  const { held = true, manifest = true } = options
  const ids = randomIdentifiers()
  const encoded = tenantCodec.encode(tenant(ids.organization(), ids.account()))
  if (!encoded.ok) throw new Error('Invalid fixture tenant')
  const input = allocation()
  input.identity.domain.scope = { kind: 'tenant', tenant: encoded.value }
  input.intent.command.target.scopeRef = encoded.value
  input.identity.operation.target = input.intent.command.target
  input.plan.target = input.intent.command.target
  options.configure?.(input)
  const seed = await openIntentWorld(undefined, input.identity.domain)
  const request = recoveryRequest(input)
  const current: Omit<ReadySettingsIntent, 'terminal'> = {
    binding: request.binding,
    basis: input.plan,
    standing: {
      kind: 'identity',
      destination: 'settings.ready',
      scopeRef: encoded.value,
      required: [],
    },
    sources: { route: 'settings.destination', sources: [] },
  }
  try {
    await seed.write(input)
    const ref = { identity: input.identity, attemptId: input.attemptId }
    if (held) {
      const planned = reply(
        await seed.standing({
          kind: 'plan',
          input: {
            ...ref,
            destination: 'settings.ready',
            scopeRef: encoded.value,
            required: [],
          },
        }),
      )
      const standing = z
        .object({
          request: z.object({
            binding: z.custom<StandingBinding>(isStandingBinding),
            required: z.array(z.never()),
          }),
        })
        .parse(planned).request
      await seed.standing({ kind: 'request', input: ref })
      await seed.standing({
        kind: 'held',
        input: {
          ...ref,
          reservation: {
            ...standing,
            id: standingReservationId(standing.binding, standing.required),
          },
        },
      })
    }
    if (manifest) await seed.source({ kind: 'plan', input: { ...ref, ...current.sources } })
  } finally {
    await seed.close()
  }
  if (options.initialize) {
    const migrated = await openRecoveryWorld(seed.root, input.identity.domain)
    await migrated.close()
    options.initialize(seed.root, input)
  }
  const world = await openRecoveryWorld(seed.root, input.identity.domain)
  return { world, input, request, current }
}
