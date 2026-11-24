import { randomUUID } from 'node:crypto'
import { canonicalText } from '@omne-harness/authorization'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type StandingReservations,
  type TenantStandingSource,
} from '@omne-harness/identity'
import type {
  SettingDefinitions,
  SettingsDefinitionRef,
  SettingsRebase,
  SettingsState,
  SettingsTarget,
  TenantSettingsWriter,
} from '@omne-harness/settings'
import {
  createIdentityQualifiedSettingsPreparation,
  createSettingsPreparationBackend,
  secretItemsOf,
  type SettingsPreparationOptions,
  type SettingsPreparationService,
} from '@omne-harness/settings-local/preparation'
import { assetsPublicationCommand } from '@omne-harness/assets-local'
import {
  SettingsValueProjectionSchema,
  settingsValueProjectionCommand,
  standaloneSettingsPublicationCommand,
} from '@omne-harness/settings-local'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import {
  declarationOfTarget,
  governedDeclarations,
  type PermissionDeclaration,
} from '../../entry/permission-declarations.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { INDEPENDENT_SETTINGS_CONFIGURATION } from './independent-settings.ts'
import { createIndependentSettingsPreparation } from './independent-settings-write.ts'
import { HELD_SETTINGS_CONFIGURATION } from './held-settings-current.ts'
import { createHeldSettingsPreparation } from './held-settings-write.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { GOVERNANCE_PROJECTION_READ } from './storage-materials.ts'
import { NAMED_TARGETS } from './governed-capture.ts'
import { readProjection } from './projection-read.ts'
import {
  TARGET_SNAPSHOT,
  targetCapture,
  targetSnapshotCommands,
  targetSnapshotSchema,
  type TargetSnapshot,
} from './target-snapshot.ts'
import {
  TENANT_SETTINGS_CONFIGURATION,
  tenantSettingsCurrentMaterial,
  tenantSettingsCurrentParticipant,
} from './tenant-settings-current.ts'

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
  writer: Principal
  release(): ToolRelease | undefined
  declared?(): readonly PermissionDeclaration[]
  epoch(): Promise<string | undefined>
}>

const reference = (value: Registration): Registration => ({
  combinationVersion: value.combinationVersion,
  manifestDigest: value.manifestDigest,
})
const failure = (reason: 'forbidden' | 'unavailable' | 'unsupported') =>
  ({ kind: 'rejected', reason }) as const

const unsupported = async () => failure('unsupported')

export type ReleaseSettingsStored = Readonly<{
  definitionRef: SettingsDefinitionRef
  state: SettingsState
}>
export type ReleaseSettingsRebaseDecision = (
  stored: ReleaseSettingsStored,
  definition: SettingDefinitions,
) => SettingsRebase['assignments'] | undefined
export type ReleaseSettingsRebaseResult =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'rebased'; revision: number }>
  | Readonly<{ kind: 'undecided' }>
  | Readonly<{ kind: 'unavailable'; phase: 'snapshot' | 'prepare' | 'commit' }>
export type ReleaseSettingsObservation =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'changed'; stored: ReleaseSettingsStored }>
  | Readonly<{ kind: 'unknown' }>

type Prepared = ReturnType<typeof createIdentityQualifiedSettingsPreparation>

/** Runs one change through a preparation: recall, the caller's last check, prepare, commit. */
async function writeThrough(
  service: Prepared['service'],
  writer: Principal,
  { command, beforeWrite }: Parameters<TenantSettingsWriter['write']>[0],
) {
  const operation = { target: command.target, operationId: command.operationId }
  const known = await service.getOperation(writer, operation)
  if (known.kind === 'not_found' || known.kind === 'pending') {
    const refused = await beforeWrite()
    if (refused !== null) return { kind: 'refused' as const, outcome: refused }
  } else if (known.kind === 'rejected') return known
  const staged = await service.prepareChange(writer, command)
  if (staged.kind !== 'prepared') return staged
  return service.commitChange(writer, {
    requestId: command.requestId,
    preparation: staged.preparation,
  })
}

type Shared = Readonly<{
  options: TenantSettingsWriteOptions
  scope: GovernanceScope
  domain: DomainRef
  combinations: ReturnType<typeof governanceStorageCombinations>
  writerRef: string
  entryOf(target: SettingsTarget): PermissionDeclaration | undefined
}>

function snapshotBinding(
  { scope, domain, writerRef }: Shared,
  epoch: string,
  entry: PermissionDeclaration,
  target: SettingsTarget,
) {
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

async function snapshotOf(
  shared: Shared,
  epoch: string,
  entry: PermissionDeclaration,
  target: SettingsTarget,
): Promise<TargetSnapshot | undefined> {
  const result = await shared.options.storage.commit({
    identity: {
      ...shared.domain,
      operation: 'harness.tenant-settings-plan',
      protocolVersion: '2',
      operationKey: randomUUID(),
    },
    ...reference(shared.combinations.tenantSettingsSnapshot),
    commands: targetSnapshotCommands(snapshotBinding(shared, epoch, entry, target)),
  })
  if (result.kind !== 'committed') return undefined
  const parsed = targetSnapshotSchema.safeParse(
    result.responses.find(value => value.participant === TARGET_SNAPSHOT.participant)?.reply
      .response,
  )
  return parsed.success ? parsed.data : undefined
}

async function observeStored(
  shared: Shared,
  epoch: string,
  entry: PermissionDeclaration,
  target: SettingsTarget,
): Promise<ReleaseSettingsObservation> {
  const handler = shared.options.materials.readHandlers.find(
    item => item.handler === GOVERNANCE_PROJECTION_READ,
  )
  if (handler === undefined) return { kind: 'unknown' }
  const capture = targetCapture(snapshotBinding(shared, epoch, entry, target))
  const read = await readProjection(shared.options.storage, shared.domain, handler, [
    assetsPublicationCommand(capture, NAMED_TARGETS),
    standaloneSettingsPublicationCommand(capture),
    settingsValueProjectionCommand(capture),
  ])
  if (read.kind !== 'completed') return { kind: 'unknown' }
  const parsed = SettingsValueProjectionSchema.safeParse(read.response)
  const view = parsed.success && parsed.data.views.length === 1 ? parsed.data.views[0] : undefined
  if (view === undefined) return { kind: 'unknown' }
  if (view.presence !== 'unavailable') return { kind: 'current' }
  return view.reason === 'definition_changed'
    ? { kind: 'changed', stored: view.stored }
    : { kind: 'unknown' }
}

async function rebaseThrough(
  service: SettingsPreparationService<Principal>,
  writer: Principal,
  target: SettingsTarget,
  values: TargetSnapshot['values'] | undefined,
  decide: ReleaseSettingsRebaseDecision,
): Promise<ReleaseSettingsRebaseResult> {
  if (values === undefined) return { kind: 'unavailable', phase: 'snapshot' }
  if (values.presence !== 'unavailable') return { kind: 'current' }
  if (values.reason !== 'definition_changed') return { kind: 'unavailable', phase: 'snapshot' }
  const assignments = decide(values.stored, values.view.definition)
  if (assignments === undefined) return { kind: 'undecided' }
  const operationId = randomUUID()
  const staged = await service.prepareRebase(writer, {
    protocol: 'settings-rebase/1',
    requestId: operationId,
    operationId,
    target,
    from: values.stored.definitionRef,
    to: values.view.definitionRef,
    expectedRevision: values.stored.state.revision,
    assignments: [...assignments],
  })
  if (staged.kind !== 'prepared') return { kind: 'unavailable', phase: 'prepare' }
  const committed = await service.commitChange(writer, {
    requestId: `commit-${operationId}`,
    preparation: staged.preparation,
  })
  return committed.kind === 'committed'
    ? { kind: 'rebased', revision: committed.revision }
    : { kind: 'unavailable', phase: 'commit' }
}

/** Changes to a release tool's targets: its governance declaration and adoption are current facts. */
function createReleaseSettingsPreparation(shared: Shared) {
  const { options, domain, combinations, writerRef, entryOf } = shared
  let planned: string | undefined

  const plan: Backend['plan'] = async (principal, { identity, intent }) => {
    if (standingPrincipalRef(principal) !== writerRef) return failure('forbidden')
    const target = identity.operation.target
    const entry = entryOf(target)
    if (entry === undefined) return failure('forbidden')
    const epoch = await options.epoch()
    if (epoch === undefined) return failure('unavailable')
    const snapshot = await snapshotOf(shared, epoch, entry, target)
    const material =
      snapshot === undefined
        ? undefined
        : tenantSettingsCurrentMaterial(snapshot, TENANT_SETTINGS_CONFIGURATION, intent.kind)
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
    const snapshot = snapshotBinding(shared, epoch, entry, target)
    return [
      ...targetSnapshotCommands(snapshot),
      {
        participant: tenantSettingsCurrentParticipant(phase),
        facts: { request: JSON.parse(JSON.stringify({ binding, snapshot })) },
      },
    ]
  }

  const backend: Omit<Backend, 'standing'> = {
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
    sources: { reserve: unsupported, settle: unsupported },
  }
  const prepared = createIdentityQualifiedSettingsPreparation({
    identity: options.identity,
    required: [],
    backend,
  })
  const maintenance = createSettingsPreparationBackend<Principal>({
    ...backend,
    plan: (principal, input) =>
      input.intent.kind === 'rebase' ? plan(principal, input) : unsupported(),
    standing: {
      reserve: async () => ({ kind: 'denied' }),
      settle: async () => ({ kind: 'operation-conflict' }),
    },
  })

  async function rebase(
    target: SettingsTarget,
    decide: ReleaseSettingsRebaseDecision,
  ): Promise<ReleaseSettingsRebaseResult> {
    const entry = entryOf(target)
    const epoch = await options.epoch()
    if (entry === undefined || epoch === undefined)
      return { kind: 'unavailable', phase: 'snapshot' }
    planned = epoch
    const snapshot = await snapshotOf(shared, epoch, entry, target)
    return rebaseThrough(maintenance.service, options.writer, target, snapshot?.values, decide)
  }

  async function observe(target: SettingsTarget): Promise<ReleaseSettingsObservation> {
    const entry = entryOf(target)
    const epoch = await options.epoch()
    if (entry === undefined || epoch === undefined) return { kind: 'unknown' }
    return observeStored(shared, epoch, entry, target)
  }

  return {
    control: {
      destination: prepared.control.destination,
      async close() {
        await prepared.control.close()
        await maintenance.control.close()
      },
    },
    observe,
    rebase,
    async write(input: Parameters<TenantSettingsWriter['write']>[0]) {
      planned = (await options.epoch()) ?? planned
      return writeThrough(prepared.service, options.writer, input)
    },
  }
}

/** One writer, three kinds of target: governed capabilities, the other held assets, independent targets. */
export function createTenantSettingsWrite(options: TenantSettingsWriteOptions) {
  const scope = structuredClone(options.scope)
  const domain = structuredClone(options.domain)
  const combinations = governanceStorageCombinations(options.materials)
  function entryOf(target: SettingsTarget): PermissionDeclaration | undefined {
    if (target.scopeRef !== scope.tenantRef) return undefined
    return declarationOfTarget(
      governedDeclarations(options.release(), options.declared?.() ?? []),
      target,
    )
  }
  const writerRef = standingPrincipalRef(options.writer)
  const shared = { options, scope, domain, combinations, writerRef, entryOf }
  const release = createReleaseSettingsPreparation(shared)
  const independent = createIndependentSettingsPreparation({ ...options, domain, combinations })
  const held = createHeldSettingsPreparation({
    ...options,
    domain,
    combinations,
    deploymentRef: scope.deploymentId,
  })
  const writer: TenantSettingsWriter = {
    async write(input) {
      const target = input.command.target
      if (target.kind === 'independent')
        return writeThrough(independent.service, options.writer, input)
      if (entryOf(target) === undefined) return writeThrough(held.service, options.writer, input)
      return release.write(input)
    },
  }
  const controlOf = (destination: string) =>
    destination === INDEPENDENT_SETTINGS_CONFIGURATION.destination
      ? independent.control
      : destination === HELD_SETTINGS_CONFIGURATION.destination
        ? held.control
        : release.control
  return {
    writer,
    observe: release.observe,
    rebase: release.rebase,
    destination: {
      seal: (reservation: Parameters<typeof release.control.destination.seal>[0]) =>
        controlOf(reservation.binding.destination).destination.seal(reservation),
    },
    close: async () => {
      await release.control.close()
      await independent.control.close()
      await held.control.close()
    },
  }
}
