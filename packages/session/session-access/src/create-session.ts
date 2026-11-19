import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SavedModelSelection,
  SessionCreation,
  SessionId,
} from '@omne-harness/session-contract'
import {
  commitCall,
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import { createOperation, sessionIdentity, tenantTextOf } from './derivation.ts'
import type {
  DefinitionResolver,
  ModelTargets,
  PrincipalFact,
  SessionAccessFaces,
  SessionAccessSettings,
  WorkspaceTargets,
} from './ports.ts'
import { checkedWorkspace } from './select-workspace.ts'

export type CreateSessionPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
  faces: () => SessionAccessFaces | undefined
  definitions: () => DefinitionResolver | undefined
  targets: () => ModelTargets | undefined
  workspaces: () => WorkspaceTargets | undefined
  settings: SessionAccessSettings
}>

const INVALID = Object.freeze({ outcome: 'invalid' as const, body: Object.freeze({}) })

// The model a session starts with: the one asked for, judged by Model before anything is
// committed, or the one the deployment maps the definition to.
async function initialSelection(
  ports: CreateSessionPorts,
  asked: Readonly<{ principal: Principal; tenant: TenantId; route: string | undefined }>,
  mapped: SavedModelSelection | undefined,
): Promise<SavedModelSelection | typeof INVALID | typeof UNAVAILABLE> {
  const { principal, tenant, route } = asked
  if (route === undefined) return mapped ?? UNAVAILABLE
  const targets = ports.targets()
  if (targets === undefined) return UNAVAILABLE
  const target = await readCall(() => targets.check({ principal, tenant, route }))
  if (target === 'basis-unavailable' || target.kind === 'unavailable') return UNAVAILABLE
  return target.kind === 'refused' ? INVALID : { name: route, basis: target.basis }
}

type Attached = Pick<SessionCreation, 'workspace' | 'workspaceAttachment'>

// The workspace a session starts in is verified by Workspace before anything is committed. A
// target it refuses fails the creation: the session is not created without the workspace instead.
async function initialWorkspace(
  ports: CreateSessionPorts,
  caller: Readonly<{ principal: Principal; tenant: TenantId }>,
  asked: Body<'create-session'>['workspace'],
): Promise<Attached | typeof INVALID | typeof UNAVAILABLE> {
  if (asked === undefined) return { workspace: null, workspaceAttachment: null }
  const target = await checkedWorkspace(ports.workspaces, caller, asked)
  if (target.kind === 'unavailable') return UNAVAILABLE
  if (target.kind === 'refused') return INVALID
  return { workspace: target.workspace, workspaceAttachment: target.attachment }
}

export async function createSession(
  ports: CreateSessionPorts,
  principal: Principal,
  body: Body<'create-session'>,
): Promise<Answer<'create-session'>> {
  const definitions = ports.definitions()
  if (definitions === undefined) return UNAVAILABLE
  const name = body.definition ?? ports.settings.defaultDefinition
  if (name === undefined) return INVALID
  const resolved = definitions(name)
  if (resolved === undefined) return INVALID
  const fact = ports.factOf(principal)
  if (fact === undefined) return UNAVAILABLE
  const asked = { principal, tenant: fact.tenant, route: body.model }
  const initialModelSelection = await initialSelection(ports, asked, resolved.initialModelSelection)
  if ('outcome' in initialModelSelection) return initialModelSelection
  const attached = await initialWorkspace(ports, { principal, tenant: fact.tenant }, body.workspace)
  if ('outcome' in attached) return attached
  const faces = ports.faces()
  if (faces === undefined) return UNAVAILABLE
  const tenantText = tenantTextOf(fact.tenant)
  const session = sessionIdentity(tenantText, body.createCallId) as SessionId
  const creation: SessionCreation = {
    definition: { name, candidate: resolved.candidate },
    execution: resolved.execution,
    requiredIdentities: resolved.requiredIdentities,
    purpose: body.purpose,
    ...attached,
    modes: { kind: 'tenant-default', source: resolved.tenantDefaults },
    initial: null,
    entryContract: resolved.entryContract,
    initialModelSelection,
  }
  const result = await commitCall(() =>
    faces.management.create({
      principal,
      tenant: fact.tenant,
      session,
      operation: createOperation(tenantText, body.createCallId),
      creation,
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('create-session', result.failure)
  return { outcome: 'succeeded', body: { session, recovered: result.ok.receipt.recovered } }
}

export async function queryCreateSession(
  ports: Pick<CreateSessionPorts, 'admit'>,
  login: LoginIdentity,
  body: Body<'query-create-session'>,
): Promise<Answer<'query-create-session'>> {
  const session = sessionIdentity(tenantTextOf(body.tenant), body.createCallId)
  const admitted = await ports.admit(login, body.tenant, session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const result = await readCall(() =>
    faces.work.queryOperation({
      ...access,
      operation: createOperation(tenantText, body.createCallId),
    }),
  )
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('query-create-session', result.failure)
  switch (result.ok.kind) {
    case 'committed':
      return { outcome: 'succeeded', body: { session: access.session } }
    case 'not-committed':
      return { outcome: 'denied' }
    case 'attempt-rejected':
    case 'unknown':
      return { outcome: 'unknown' }
  }
}
