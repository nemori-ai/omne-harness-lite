import { randomUUID } from 'node:crypto'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import type { SettingDefinitions, SettingsTarget } from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsValueProjectionSchema,
  type SettingsProjectionBinding,
} from '@omne-harness/settings-local'
import {
  createIdentityQualifiedSettingsPreparation,
  secretItemsOf,
  type IdentityQualifiedPreparationOptions,
} from '@omne-harness/settings-local/preparation'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import {
  HELD_SETTINGS_CONFIGURATION,
  heldSettingsCommands,
  heldSettingsCurrentMaterial,
  heldSettingsCurrentParticipant,
} from './held-settings-current.ts'
import type { governanceStorageCombinations } from './storage-combinations.ts'

type Registration = Readonly<{ combinationVersion: string; manifestDigest: string }>
const reference = (value: Registration): Registration => ({
  combinationVersion: value.combinationVersion,
  manifestDigest: value.manifestDigest,
})
const failure = (reason: 'forbidden' | 'unavailable' | 'unsupported') =>
  ({ kind: 'rejected', reason }) as const

/** A permission item needs the governance declaration that interprets it; a held target has none. */
function governedItem(definition: SettingDefinitions, itemId: string): boolean {
  return definition.items.some(item => item.id === itemId && item.category === 'governance')
}

/** Changes to the asset targets no release governs: the current facts come from the holding. */
export function createHeldSettingsPreparation(options: {
  storage: SqlStorage
  domain: DomainRef
  deploymentRef: string
  identity: IdentityQualifiedPreparationOptions['identity']
  combinations: ReturnType<typeof governanceStorageCombinations>
  writer: ActingForTenantPrincipal
}) {
  const { storage, domain, combinations } = options
  const writerRef = standingPrincipalRef(options.writer)
  const unsupported = async () => failure('unsupported')

  function captureOf(target: SettingsTarget): SettingsProjectionBinding {
    return SettingsProjectionBindingSchema.parse({
      domain,
      principalRef: writerRef,
      captureId: randomUUID(),
      request: {
        deploymentRef: options.deploymentRef,
        mode: 'management',
        targets: [target],
        selectionRef: null,
      },
    })
  }

  async function currentOf(target: SettingsTarget) {
    const capture = captureOf(target)
    const result = await storage.commit({
      identity: {
        ...domain,
        operation: 'harness.held-settings-plan',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...reference(combinations.heldSettingsSnapshot),
      commands: heldSettingsCommands(capture),
    })
    if (result.kind !== 'committed') return undefined
    const values = SettingsValueProjectionSchema.safeParse(
      result.responses.find(value => value.participant === 'settings.value-projection')?.reply
        .response,
    )
    return values.success
      ? heldSettingsCurrentMaterial(values.data, capture, HELD_SETTINGS_CONFIGURATION)
      : undefined
  }

  const mine = (principal: ActingForTenantPrincipal) =>
    standingPrincipalRef(principal) === writerRef

  return createIdentityQualifiedSettingsPreparation({
    identity: options.identity,
    required: [],
    backend: {
      storage,
      domain,
      destination: HELD_SETTINGS_CONFIGURATION.destination,
      registrations: {
        checkpoint: reference(combinations.tenantSettingsCheckpoint),
        ready: reference(combinations.heldSettingsReady),
        commit: reference(combinations.heldSettingsCommit),
        recovery: reference(combinations.tenantSettingsRecovery),
      },
      async plan(principal, { identity, intent }) {
        const target = identity.operation.target
        if (!mine(principal) || target.kind !== 'asset') return failure('forbidden')
        const material = await currentOf(target)
        if (material === undefined) return failure('unavailable')
        if (intent.kind === 'change' && governedItem(material.definition, intent.command.itemId))
          return failure('unsupported')
        const { basis, standing, sources, definition } = material
        return {
          kind: 'planned',
          purpose: { kind: 'target-change' },
          basis,
          standing,
          sources,
          secretItems: secretItemsOf(definition),
        }
      },
      currentCommands(_principal, { phase, binding }) {
        const capture = captureOf(binding.identity.operation.target)
        return [
          ...heldSettingsCommands(capture),
          {
            participant: heldSettingsCurrentParticipant(phase),
            facts: { request: JSON.parse(JSON.stringify({ binding, capture })) },
          },
        ]
      },
      access: {
        async authorize(principal, request) {
          return mine(principal) &&
            canonicalText(request.scope) === canonicalText(domain.scope) &&
            request.target.kind === 'asset'
            ? {
                kind: 'authorized',
                scope: request.scope,
                target: request.target,
                principalRef: writerRef,
              }
            : failure('forbidden')
        },
      },
      sources: { reserve: unsupported, settle: unsupported },
    },
  })
}
