import type {
  MutationName,
  Reply,
  SessionCallerClass,
  SessionId,
  SessionRevision,
  DurableEvidence,
} from '@omne-harness/session-contract'
import { createAdvance, type Advance } from './advance.ts'
import { createCascadeDrive, type CascadeDrive } from './cascade.ts'
import { ADVANCE_KINDS, createCommandHandler } from './command.ts'
import { createControlPropagation, type ControlPropagation } from './control.ts'
import { checkStartConditions, type SessionDependencies } from './dependencies.ts'
import type { SessionDiagnose } from './diagnostics.ts'
import { createFaces, type SessionFacesWithDirectory } from './faces.ts'
import { createKnownHandovers } from './known-handovers.ts'
import { Lifecycle } from './lifecycle.ts'
import { createSessionMeasurer, type SessionMeasure } from './measure.ts'
import { checkSessionConfiguration, type SessionConfiguration } from './policy.ts'
import { createReads } from './reads.ts'
import { createResolution } from './resolution.ts'
import { createRecovery } from './recover.ts'
import { createScan, type MaintenanceHandle } from './scan.ts'
import { createScheduling, type TenantId } from './scheduling.ts'

export type { MaintenanceHandle } from './scan.ts'

export type SessionInstanceOptions = Readonly<{
  measure?: SessionMeasure
  diagnose?: SessionDiagnose
}>

export type SessionInstance<P> = Readonly<{
  facesFor(caller: SessionCallerClass): SessionFacesWithDirectory<P>
  committed(
    notice: Readonly<{
      tenant: TenantId
      session: SessionId
      revision: SessionRevision
      source: DurableEvidence
      kinds: readonly string[]
    }>,
  ): void
  changed(
    notice: Readonly<{
      tenant: TenantId
      scope: string
      counters: Readonly<Record<string, string>>
    }>,
  ): void
  maintain(tenant: TenantId): Reply<MaintenanceHandle>
  close(): Promise<void>
}>

const WAKES_ADVANCE: ReadonlySet<MutationName> = new Set([
  'accept',
  'finishRun',
  'receive',
  'control',
  'cancelRun',
  'retryRun',
  'interrupt',
  'completeInitialization',
])

/** The commands whose commit can archive a session and so save cascade tasks. */
const ARCHIVES: ReadonlySet<MutationName> = new Set(['control', 'considerAutoArchive'])

const CALLERS: readonly SessionCallerClass[] = ['intake', 'coordinator', 'maintainer', 'reader']

export function createSessionInstance<P>(
  dependencies: SessionDependencies<P>,
  configuration: SessionConfiguration,
  options: SessionInstanceOptions = {},
): SessionInstance<P> {
  checkStartConditions(dependencies)
  const { policy } = checkSessionConfiguration(configuration)
  const lifecycle = new Lifecycle(options.diagnose)
  const measurer = createSessionMeasurer(options.measure)
  const reads = createReads(dependencies, lifecycle, measurer)
  // Bound below; the handler calls it only after a commit, never during construction.
  let advance: Advance | null = null
  let controls: ControlPropagation | null = null
  let cascade: CascadeDrive | null = null
  const handle = createCommandHandler({
    dependencies,
    policy,
    lifecycle,
    measurer,
    committed: command => {
      if (['cancelRun', 'control', 'interrupt', 'finishRun'].includes(command.kind))
        advance?.interrupt({ tenant: command.input.tenant, session: command.input.session })
      if (['cancelRun', 'stopCall', 'control', 'interrupt'].includes(command.kind))
        controls?.trigger({ tenant: command.input.tenant, session: command.input.session })
      if (ARCHIVES.has(command.kind))
        cascade?.trigger({ tenant: command.input.tenant, session: command.input.session })
      if (WAKES_ADVANCE.has(command.kind))
        advance?.trigger({ tenant: command.input.tenant, session: command.input.session })
    },
  })
  const facesOf = new Map<SessionCallerClass, SessionFacesWithDirectory<P>>(
    CALLERS.map(caller => [caller, createFaces({ caller, handle, reads, dependencies })]),
  )
  const facesFor = (caller: SessionCallerClass): SessionFacesWithDirectory<P> =>
    facesOf.get(caller) ?? createFaces({ caller, handle, reads, dependencies })
  const faces = { coordinator: facesFor('coordinator'), maintainer: facesFor('maintainer') }
  const scheduling = createScheduling(dependencies, lifecycle)
  const resolution = createResolution({
    lifecycle,
    policy,
    scheduling,
    maintainer: faces.maintainer,
  })
  const known = createKnownHandovers()
  const recovery = createRecovery({
    dependencies,
    lifecycle,
    scheduling,
    coordinator: faces.coordinator,
    known,
  })
  const wired = createAdvance({
    dependencies,
    lifecycle,
    policy,
    scheduling,
    resolution,
    faces,
    known,
    recover: recovery.trigger,
  })
  advance = wired
  controls = createControlPropagation({
    dependencies,
    lifecycle,
    policy,
    scheduling,
    coordinator: faces.coordinator,
  })
  const controlPropagation = controls
  const cascading = createCascadeDrive({
    lifecycle,
    policy,
    scheduling,
    maintainer: faces.maintainer,
  })
  cascade = cascading
  const scan = createScan({
    lifecycle,
    policy,
    scheduling,
    principals: dependencies.principals,
    maintainer: faces.maintainer,
    advance: wired,
    resolution,
    controls: controlPropagation,
    recovery,
    cascade: cascading,
  })

  return Object.freeze({
    facesFor,
    committed: notice => {
      if (lifecycle.closed) return
      const control = notice.kinds.some(
        kind => kind === 'control.requested' || kind === 'control.progress',
      )
      const interrupted =
        (control || notice.kinds.includes('run.terminal')) &&
        wired.interrupt({ tenant: notice.tenant, session: notice.session })
      if (control) controlPropagation.trigger({ tenant: notice.tenant, session: notice.session })
      if (notice.kinds.includes('session.archived'))
        cascading.trigger({ tenant: notice.tenant, session: notice.session })
      if (interrupted || notice.kinds.some(kind => ADVANCE_KINDS.has(kind)))
        wired.trigger({ tenant: notice.tenant, session: notice.session })
    },
    changed: () => undefined,
    maintain: tenant => scan.maintain(tenant),
    close: async () => {
      scan.stopAll()
      await lifecycle.close()
    },
  })
}
