import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { standingReservationId, type StandingRequest } from '@omne-harness/identity'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  createSettingsPreparationBackend,
  type PreparationPlan,
  type SettingsPreparationOptions,
} from '../src/preparation.ts'
import { json } from '../src/encoding.ts'
import { secretItemsOf } from '../src/secret-items.ts'
import { allocation } from './intent-world.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { definition } from './world.ts'
export type Context = { allowed: boolean; principalRef: string }
export async function openPreparedServiceWorld(
  configure?: (options: SettingsPreparationOptions<Context>) => SettingsPreparationOptions<Context>,
  bound?: {
    scopeRef?: string
    principalRef?: string
    sourceCapture?: boolean
    root?: string
    /** Participants of the test, added to the catalog next to the preparation materials. */
    extraParticipants?: SqlMaterialCatalog['participants']
  },
) {
  const input = allocation()
  const ids = randomIdentifiers()
  const tenantRef = tenantCodec.encode(tenant(ids.organization(), ids.account()))
  if (!tenantRef.ok) throw new Error('Invalid fixture tenant')
  const scopeRef = bound?.scopeRef ?? tenantRef.value
  input.identity.principalRef = bound?.principalRef ?? input.identity.principalRef
  input.identity.domain.scope = { kind: 'tenant', tenant: scopeRef }
  input.intent.command.target.scopeRef = scopeRef
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-prepared-service/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = bound?.root ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const world = await openRecoveryWorld(
    root,
    input.identity.domain,
    bound?.sourceCapture,
    undefined,
    bound?.extraParticipants,
  )
  let current: PreparationPlan = {
    kind: 'planned',
    basis: input.plan,
    purpose: input.purpose,
    standing: { kind: 'identity', destination: 'settings.preparation', scopeRef, required: [] },
    sources: { route: 'settings.destination', sources: [] },
    secretItems: [],
  }
  let currentDefinition = definition
  const requests: StandingRequest[] = []
  const context: Context = { allowed: true, principalRef: input.identity.principalRef }
  const options: SettingsPreparationOptions<Context> = {
    domain: input.identity.domain,
    destination: 'settings.preparation',
    storage: world.storage,
    registrations: world.registrations,
    access: {
      async authorize(c, request) {
        return c.allowed
          ? {
              kind: 'authorized',
              scope: request.scope,
              target: request.target,
              principalRef: c.principalRef,
            }
          : { kind: 'rejected', reason: 'forbidden' }
      },
    },
    async plan() {
      return { ...current, secretItems: secretItemsOf(currentDefinition) }
    },
    currentCommands(_context, { phase, binding }) {
      const { kind: _, purpose: __, secretItems: ___, ...material } = current
      return phase === 'ready'
        ? [
            {
              participant: 'fixture.preparation-current',
              facts: { current: json({ binding, ...material }) },
            },
          ]
        : [
            {
              participant: 'fixture.commit-current',
              facts: {
                current: json({
                  binding,
                  observation: {
                    kind: 'available',
                    material: {
                      ...material,
                      definition: currentDefinition,
                      grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
                    },
                  },
                }),
              },
            },
          ]
    },
    standing: {
      async reserve(_context, request) {
        requests.push(request)
        return {
          kind: 'held',
          reservation: { ...request, id: standingReservationId(request.binding, request.required) },
        }
      },
      async settle(request) {
        return backend.control.destination.seal({
          ...request,
          id: standingReservationId(request.binding, request.required),
        })
      },
    },
    sources: {
      async reserve() {
        throw new Error('Unexpected fixture source reserve')
      },
      async settle() {
        throw new Error('Unexpected fixture source settle')
      },
    },
  }
  const backend = createSettingsPreparationBackend(configure?.(options) ?? options)
  if (input.intent.kind !== 'change') throw new Error('Expected change fixture')
  return {
    ...backend,
    options,
    world,
    root,
    input,
    context,
    command: input.intent.command,
    requests,
    updateDefinition(value: typeof definition) {
      currentDefinition = value
    },
    updateCurrent(change: (current: PreparationPlan) => PreparationPlan) {
      current = change(current)
    },
    async close() {
      await backend.control.close()
      await world.close()
    },
  }
}
