// The factory (docs/public-api.md「工厂与实例」). It checks the start conditions and the configuration
// before it builds or calls anything, then wires the command handler, the faces of each caller
// class and the scheduler subset of this member.
import type {
  MutationName,
  Reply,
  SessionCallerClass,
  SessionFaces,
  SessionId,
  SessionRevision,
  DurableEvidence,
} from '@omne-harness/session-contract'
import { createAdvance, type Advance } from './advance.ts'
import { ADVANCE_KINDS, createCommandHandler } from './command.ts'
import { checkStartConditions, type SessionDependencies } from './dependencies.ts'
import { createFaces } from './faces.ts'
import { Lifecycle } from './lifecycle.ts'
import { checkSessionConfiguration, type SessionConfiguration } from './policy.ts'
import { createReads } from './reads.ts'
import { createResolution } from './resolution.ts'
import { createScan, type MaintenanceHandle } from './scan.ts'
import { createScheduling, type TenantId } from './scheduling.ts'

export type { MaintenanceHandle } from './scan.ts'

export type SessionInstance<P> = Readonly<{
  /** The four faces as one caller class sees them. */
  facesFor(caller: SessionCallerClass): SessionFaces<P>
  /** Wakes S1, S2 and C5 from a commit notice that another process or a participant commit produced. */
  committed(
    notice: Readonly<{
      tenant: TenantId
      session: SessionId
      revision: SessionRevision
      source: DurableEvidence
      kinds: readonly string[]
    }>,
  ): void
  /** Wakes S7 from an asset, workspace or settings change notice. */
  changed(
    notice: Readonly<{
      tenant: TenantId
      scope: string
      counters: Readonly<Record<string, string>>
    }>,
  ): void
  /** Starts the S3 scanner for one tenant, with a startup scan. One scanner per tenant. */
  maintain(tenant: TenantId): Reply<MaintenanceHandle>
  close(): Promise<void>
}>

/** Commands of this instance whose commit may let a new Run start: S1 is woken locally after them. */
const WAKES_ADVANCE: ReadonlySet<MutationName> = new Set([
  'accept',
  'finishRun',
  'receive',
  'control',
  'cancelRun',
  'interrupt',
  'completeInitialization',
])

const CALLERS: readonly SessionCallerClass[] = ['intake', 'coordinator', 'maintainer', 'reader']

export function createSessionInstance<P>(
  dependencies: SessionDependencies<P>,
  configuration: SessionConfiguration,
): SessionInstance<P> {
  checkStartConditions(dependencies)
  const { policy } = checkSessionConfiguration(configuration)
  const lifecycle = new Lifecycle()
  const reads = createReads(dependencies, lifecycle)
  // Bound below; the handler only calls it after a commit, never during construction.
  let advance: Advance | null = null
  const handle = createCommandHandler({
    dependencies,
    policy,
    lifecycle,
    committed: command => {
      if (WAKES_ADVANCE.has(command.kind))
        advance?.trigger({ tenant: command.input.tenant, session: command.input.session })
    },
  })
  const facesOf = new Map<SessionCallerClass, SessionFaces<P>>(
    CALLERS.map(caller => [caller, createFaces({ caller, handle, reads, dependencies })]),
  )
  const facesFor = (caller: SessionCallerClass): SessionFaces<P> =>
    facesOf.get(caller) ?? createFaces({ caller, handle, reads, dependencies })
  const faces = { coordinator: facesFor('coordinator'), maintainer: facesFor('maintainer') }
  const scheduling = createScheduling(dependencies, lifecycle)
  const resolution = createResolution({
    lifecycle,
    policy,
    scheduling,
    maintainer: faces.maintainer,
  })
  const wired = createAdvance({ dependencies, lifecycle, policy, scheduling, resolution, faces })
  advance = wired
  const scan = createScan({
    lifecycle,
    policy,
    scheduling,
    principals: dependencies.principals,
    maintainer: faces.maintainer,
    advance: wired,
    resolution,
  })

  return Object.freeze({
    facesFor,
    committed: notice => {
      if (lifecycle.closed) return
      if (notice.kinds.some(kind => ADVANCE_KINDS.has(kind)))
        wired.trigger({ tenant: notice.tenant, session: notice.session })
    },
    // S7 is not in this member yet (SPEC「实现现状」): the notice wakes nothing.
    changed: () => undefined,
    maintain: tenant => scan.maintain(tenant),
    close: async () => {
      scan.stopAll()
      await lifecycle.close()
    },
  })
}
