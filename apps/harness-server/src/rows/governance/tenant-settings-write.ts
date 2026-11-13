// The tenant-layer write of Settings on the real assembly (settings-local SPEC「Application current
// consumer」): the plan and the current participants come from the target snapshot of this row,
// the qualification from Identity. The write acts as one stable principal of the tenant, so the
// root of an operation depends on the tenant and its account and never on one login: a caller that
// logs in again and sends the same operation recalls the same write. Who may write is decided
// before this module by the face; this module only writes the tenant layer of the tenant's own
// asset targets.
import { randomUUID } from 'node:crypto'
import { canonicalText } from '@omne-harness/authorization'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type StandingReservations,
  type TenantStandingSource,
} from '@omne-harness/identity'
import type { SettingsTarget, TenantSettingsWriter } from '@omne-harness/settings'
import {
  createIdentityQualifiedSettingsPreparation,
  secretItemsOf,
  type SettingsPreparationOptions,
} from '@omne-harness/settings-local/preparation'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import {
  TARGET_SNAPSHOT,
  targetSnapshotCommands,
  targetSnapshotSchema,
  type TargetSnapshot,
} from './target-snapshot.ts'
import {
  TENANT_SETTINGS_CONFIGURATION,
  tenantSettingsCurrentMaterial,
  tenantSettingsCurrentParticipant,
} from './tenant-settings-current.ts'
import { toolAssetTarget } from './tool-installation-assets.ts'

type Principal = ActingForTenantPrincipal
type Backend = SettingsPreparationOptions<Principal>
type Registration = Readonly<{ combinationVersion: string; manifestDigest: string }>

export type TenantSettingsWriteOptions = Readonly<{
  scope: GovernanceScope
  domain: DomainRef
  storage: SqlStorage
  materials: Parameters<typeof governanceStorageCombinations>[0]
  identity: Readonly<{
    verifier: PrincipalVerifier
    standing: TenantStandingSource
    reservations: StandingReservations
  }>
  /** The stable principal of the tenant that writes; it depends on the tenant only. */
  writer: Principal
  release(): ToolRelease | undefined
  /** The epoch of the opened Governance runtime of the tenant; undefined when it is not open. */
  epoch(): Promise<string | undefined>
}>

const reference = (value: Registration): Registration => ({
  combinationVersion: value.combinationVersion,
  manifestDigest: value.manifestDigest,
})
const failure = (reason: 'forbidden' | 'unavailable' | 'unsupported') =>
  ({ kind: 'rejected', reason }) as const

export function createTenantSettingsWrite(options: TenantSettingsWriteOptions) {
  const scope = structuredClone(options.scope)
  const domain = structuredClone(options.domain)
  const combinations = governanceStorageCombinations(options.materials)
  const writerRef = standingPrincipalRef(options.writer)
  /** The epoch of the open runtime, as the last plan read it; one runtime keeps one epoch. */
  let planned: string | undefined

  function entryOf(target: SettingsTarget): ToolReleaseEntry | undefined {
    const release = options.release()
    if (release?.kind !== 'trusted') return undefined
    const matches = release.manifest.entries.filter(
      entry => canonicalText(toolAssetTarget(entry, scope.tenantRef)) === canonicalText(target),
    )
    return matches.length === 1 ? matches[0] : undefined
  }

  function snapshotBinding(epoch: string, entry: ToolReleaseEntry, target: SettingsTarget) {
    return {
      scope,
      epoch,
      mode: 'management' as const,
      principalRef: writerRef,
      captureId: randomUUID(),
      transactionDomain: domain.transactionDomain,
      definition: entry.governance.declaration.reference,
      target,
    }
  }

  async function snapshotOf(epoch: string, entry: ToolReleaseEntry, target: SettingsTarget) {
    const result = await options.storage.commit({
      identity: {
        ...domain,
        operation: 'harness.tenant-settings-plan',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...reference(combinations.tenantSettingsSnapshot),
      commands: targetSnapshotCommands(snapshotBinding(epoch, entry, target)),
    })
    if (result.kind !== 'committed') return undefined
    const parsed = targetSnapshotSchema.safeParse(
      result.responses.find(value => value.participant === TARGET_SNAPSHOT.participant)?.reply
        .response,
    )
    return parsed.success ? parsed.data : undefined
  }

  const plan: Backend['plan'] = async (principal, { identity }) => {
    if (standingPrincipalRef(principal) !== writerRef) return failure('forbidden')
    const target = identity.operation.target
    const entry = entryOf(target)
    if (entry === undefined) return failure('forbidden')
    const epoch = await options.epoch()
    if (epoch === undefined) return failure('unavailable')
    const snapshot: TargetSnapshot | undefined = await snapshotOf(epoch, entry, target)
    const material =
      snapshot === undefined
        ? undefined
        : tenantSettingsCurrentMaterial(snapshot, TENANT_SETTINGS_CONFIGURATION)
    if (material === undefined) return failure('unavailable')
    planned = epoch
    const { basis, standing, sources, definition } = material
    return {
      kind: 'planned',
      purpose: { kind: 'target-change' },
      basis,
      standing,
      sources,
      secretItems: secretItemsOf(definition),
    }
  }

  const currentCommands: Backend['currentCommands'] = (_principal, { phase, binding }) => {
    const target = binding.identity.operation.target
    const entry = entryOf(target)
    const epoch = planned
    if (entry === undefined || epoch === undefined)
      throw new Error('A tenant Settings write has no current before its plan')
    const snapshot = snapshotBinding(epoch, entry, target)
    return [
      ...targetSnapshotCommands(snapshot),
      {
        participant: tenantSettingsCurrentParticipant(phase),
        facts: { request: JSON.parse(JSON.stringify({ binding, snapshot })) },
      },
    ]
  }

  const prepared = createIdentityQualifiedSettingsPreparation({
    identity: options.identity,
    required: [],
    backend: {
      storage: options.storage,
      domain,
      destination: TENANT_SETTINGS_CONFIGURATION.destination,
      registrations: {
        checkpoint: reference(combinations.tenantSettingsCheckpoint),
        ready: reference(combinations.tenantSettingsReady),
        commit: reference(combinations.tenantSettingsCommit),
        recovery: reference(combinations.tenantSettingsRecovery),
      },
      plan,
      currentCommands,
      access: {
        async authorize(principal, request) {
          return standingPrincipalRef(principal) === writerRef &&
            canonicalText(request.scope) === canonicalText(domain.scope) &&
            entryOf(request.target) !== undefined
            ? {
                kind: 'authorized',
                scope: request.scope,
                target: request.target,
                principalRef: writerRef,
              }
            : failure('forbidden')
        },
      },
      // A tenant asset target has no source in another domain: the plan names none.
      sources: {
        reserve: async () => failure('unsupported'),
        settle: async () => failure('unsupported'),
      },
    },
  })

  const writer: TenantSettingsWriter = {
    async write({ command, beforeWrite }) {
      const service = prepared.service
      const operation = { target: command.target, operationId: command.operationId }
      const known = await service.getOperation(options.writer, operation)
      if (known.kind === 'not_found' || known.kind === 'pending') {
        const refused = await beforeWrite()
        if (refused !== null) return { kind: 'refused', outcome: refused }
      } else if (known.kind === 'rejected') return known
      const staged = await service.prepareChange(options.writer, command)
      if (staged.kind !== 'prepared') return staged
      return service.commitChange(options.writer, {
        requestId: command.requestId,
        preparation: staged.preparation,
      })
    },
  }

  return {
    writer,
    destination: prepared.control.destination,
    close: () => prepared.control.close(),
  }
}
