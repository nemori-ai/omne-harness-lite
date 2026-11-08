import { tenantCodec } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence, Modes, WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionPermissionMode } from '@omne-harness/session-storage-sql/participants'
import { projectSessionPermissionMode } from './permission-mode.ts'
import {
  sessionModesPublicationSchema,
  type SessionModesPublication,
} from './mode-publication-schema.ts'

export type SessionModeDefaults =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'available'; adoption: Adoption; modes: Modes; source: DurableEvidence }>

export type SessionModesPublicationInput = Readonly<{
  work: Pick<WorkSnapshot, 'tenant' | 'session' | 'revision' | 'permissions' | 'changes'>
  permission: SessionPermissionMode
  defaults: SessionModeDefaults
}>

export type SessionModesPublicationResult =
  | Readonly<{ kind: 'ready'; value: SessionModesPublication }>
  | Readonly<{
      kind: 'unavailable'
      reason:
        | 'scope-mismatch'
        | 'permission-revision-mismatch'
        | 'default-mode-missing'
        | 'default-mode-mismatch'
        | 'invalid-source-material'
    }>

function adoptedModes(input: SessionModesPublicationInput): Modes | undefined {
  const adopted = input.permission.mode.adopted
  if (adopted.kind === 'explicit') return adopted.value
  const observed = input.defaults
  if (observed.kind === 'unavailable') return undefined
  return (['owner', 'name', 'revision', 'digest'] as const).every(
    key => adopted.source[key] === observed.adoption[key],
  )
    ? observed.modes
    : undefined
}

function currentModes(input: SessionModesPublicationInput): Modes | undefined {
  const base = adoptedModes(input)
  let environment = base?.environment
  let collaboration = base?.collaboration
  for (const change of input.work.changes ?? []) {
    if (change.kind === 'environment-mode') environment = change.value
    if (change.kind === 'collaboration-mode') collaboration = change.value
  }
  const permission = input.permission.mode.override?.value ?? base?.permission
  return environment === undefined || collaboration === undefined || permission === undefined
    ? undefined
    : { environment, collaboration, permission }
}

/** Joins owner observations before publication. A later capture must guard this exact basis. */
export function createSessionModesPublication(
  input: SessionModesPublicationInput,
): SessionModesPublicationResult {
  const { work, permission, defaults } = input
  const tenant = tenantCodec.encode(work.tenant)
  if (!tenant.ok || tenant.value !== permission.tenant || work.session !== permission.session)
    return { kind: 'unavailable', reason: 'scope-mismatch' }
  if (work.permissions.revision !== permission.revision)
    return { kind: 'unavailable', reason: 'permission-revision-mismatch' }
  const inquiry = projectSessionPermissionMode({
    ...permission.mode,
    creationSource: permission.creationSource,
    defaultMode:
      defaults.kind === 'unavailable'
        ? defaults
        : {
            kind: 'available',
            adoption: defaults.adoption,
            value: defaults.modes.permission,
            source: defaults.source,
          },
  })
  if (inquiry.kind === 'unavailable') return inquiry
  const modes = currentModes(input)
  if (modes === undefined)
    return {
      kind: 'unavailable',
      reason: defaults.kind === 'unavailable' ? 'default-mode-missing' : 'default-mode-mismatch',
    }
  const parsed = sessionModesPublicationSchema.safeParse({
    modes,
    inquiry: inquiry.value,
    basis: {
      tenant: tenant.value,
      session: work.session,
      sessionRevision: work.revision,
      permissionRevision: permission.revision,
      permissionSource: permission.source,
    },
  })
  return parsed.success
    ? { kind: 'ready', value: parsed.data }
    : { kind: 'unavailable', reason: 'invalid-source-material' }
}
