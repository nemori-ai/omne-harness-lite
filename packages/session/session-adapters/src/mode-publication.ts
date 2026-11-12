import { tenantCodec } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence, Modes, WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionPermissionMode } from '@omne-harness/session-storage-sql/participants'
import { projectSessionCollaborationMode } from './collaboration-mode.ts'
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

type Sourced<T> = Readonly<{ value: T; source: DurableEvidence }>

/** The modes adopted at creation, each with the evidence that adopted them. */
function adoptedModes(input: SessionModesPublicationInput): Sourced<Modes> | undefined {
  const adopted = input.permission.mode.adopted
  if (adopted.kind === 'explicit')
    return { value: adopted.value, source: input.permission.creationSource }
  const observed = input.defaults
  if (observed.kind === 'unavailable') return undefined
  return (['owner', 'name', 'revision', 'digest'] as const).every(
    key => adopted.source[key] === observed.adoption[key],
  )
    ? { value: observed.modes, source: observed.source }
    : undefined
}

type CurrentModes = Readonly<{ modes: Modes; collaboration: Sourced<Modes['collaboration']> }>

function currentModes(input: SessionModesPublicationInput): CurrentModes | undefined {
  const base = adoptedModes(input)
  let environment = base?.value.environment
  let collaboration =
    base === undefined ? undefined : { value: base.value.collaboration, source: base.source }
  for (const change of input.work.changes ?? []) {
    if (change.kind === 'environment-mode') environment = change.value
    if (change.kind === 'collaboration-mode')
      collaboration = { value: change.value, source: change.authorization }
  }
  const permission = input.permission.mode.override?.value ?? base?.value.permission
  return environment === undefined || collaboration === undefined || permission === undefined
    ? undefined
    : { modes: { environment, collaboration: collaboration.value, permission }, collaboration }
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
  const current = currentModes(input)
  if (current === undefined)
    return {
      kind: 'unavailable',
      reason: defaults.kind === 'unavailable' ? 'default-mode-missing' : 'default-mode-mismatch',
    }
  const parsed = sessionModesPublicationSchema.safeParse({
    modes: current.modes,
    inquiry: inquiry.value,
    interaction: projectSessionCollaborationMode(
      current.collaboration.value,
      current.collaboration.source,
    ),
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
