import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import {
  access,
  tenantCodec,
  workspaceCodec,
  type Access,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import {
  operationId,
  typeName,
  type Answer,
  type InstanceView,
  type OperationId,
  type OperationKind,
  type RegisteredWorkspace,
  type WorkspaceSummary,
} from '@omne-harness/workspace-contract'
import type {
  WorkspaceInstanceBody,
  WorkspaceProtocol,
  WorkspaceSummaryBody,
} from '@omne-harness/workspace-protocol'
import type { WorkspaceFaces, WorkspacePrincipals } from './ports.ts'

export type WorkspaceContributionInput = Readonly<{
  principals: WorkspacePrincipals
  faces: () => WorkspaceFaces | undefined
}>

type Handlers = AccessContribution<WorkspaceProtocol>['operations']
type Login = Parameters<WorkspacePrincipals['actingFor']>[0]

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NOT_FOUND = { outcome: 'not-found', body: {} } as const
const NOT_COMMITTED = { outcome: 'not-committed', body: {} } as const
const invalid = (reason: string) => ({ outcome: 'invalid', body: { reason } }) as const

type Ready = Readonly<{ outcome: null; faces: WorkspaceFaces; caller: Access<unknown> }>
type ChangeBody = Readonly<{ tenant: TenantId; operation: string; workspace: string }>
type Named = Readonly<{ operation: OperationId; workspace: WorkspaceId }>

/** Steps one to three: the login acts for the tenant, the principal is current, the faces are here. */
async function prepare(
  input: WorkspaceContributionInput,
  login: Login,
  tenant: TenantId,
): Promise<Ready | typeof DENIED | typeof UNAVAILABLE> {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) return DENIED
  let issued: Awaited<ReturnType<WorkspacePrincipals['actingFor']>>
  try {
    issued = await input.principals.actingFor(login, encoded.value)
  } catch {
    return UNAVAILABLE
  }
  if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
  const faces = input.faces()
  if (faces === undefined) return UNAVAILABLE
  return { outcome: null, faces, caller: access(issued.ok, tenant) }
}

function registeredOf(value: RegisteredWorkspace) {
  const workspace = workspaceCodec.encode(value.workspace)
  if (!workspace.ok) throw new TypeError('workspace-access: the workspace identity was not minted')
  return { workspace: workspace.value, instance: value.instance, type: value.type }
}

function summaryOf(summary: WorkspaceSummary): WorkspaceSummaryBody {
  const { workspace, type } = registeredOf({ ...summary, instance: '' as never })
  return { workspace, type, standing: summary.standing }
}

function instanceOf({ instance, address, availability }: InstanceView): WorkspaceInstanceBody {
  return {
    instance,
    address,
    availability: availability.kind === 'unknown' ? { kind: 'unknown' } : availability,
  }
}

type Registration = Readonly<{ operation: string; address: string; type?: string }>

/** The body as the domain takes it. A name that is not one is refused before the domain is asked. */
function registrationOf(body: Registration) {
  const operation = operationId(body.operation)
  const type = body.type === undefined ? undefined : typeName(body.type)
  if (operation === null || type === null) return null
  return { operation, address: body.address, ...(type === undefined ? {} : { type }) }
}

/** What a commit answered, with the body its success carries. */
function committed<T, B>(answer: Answer<T>, body: (value: T) => B) {
  switch (answer.kind) {
    case 'done':
      return {
        outcome: answer.changed ? 'succeeded' : 'no-change',
        body: body(answer.value),
      } as const
    case 'not-permitted':
      return DENIED
    case 'not-performed':
      return invalid(answer.reason)
    case 'conflict':
      return { outcome: 'conflict', body: {} } as const
    case 'unavailable':
      return UNAVAILABLE
    case 'unknown':
      return UNKNOWN
  }
}

export function createWorkspaceContribution(
  input: WorkspaceContributionInput,
): Omit<AccessContribution<WorkspaceProtocol>, 'protocol'> {
  const register: Handlers['register'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const registration = registrationOf(body)
    if (registration === null) return invalid('invalid-request')
    try {
      const answer = await ready.faces.governance.register(ready.caller, registration)
      return committed(answer, registeredOf)
    } catch {
      return UNKNOWN
    }
  }

  const queryRegister: Handlers['query-register'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const registration = registrationOf(body)
    if (registration === null) return NOT_COMMITTED
    try {
      const view = await ready.faces.governance.operation(ready.caller, registration.operation)
      if (view.kind === 'not-permitted') return DENIED
      if (view.kind === 'unavailable') return UNAVAILABLE
      if (view.kind !== 'recorded' || view.operation !== 'register') return NOT_COMMITTED
      const { workspace, instance, type } = view.value as Record<string, string>
      return {
        outcome: 'succeeded',
        body: { workspace: workspace!, instance: instance!, type: type! },
      }
    } catch {
      return UNAVAILABLE
    }
  }

  const list: Handlers['list'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    try {
      const read = await ready.faces.catalog.list(ready.caller)
      if (read.kind === 'unavailable') return UNAVAILABLE
      return { outcome: 'succeeded', body: { workspaces: read.value.map(summaryOf) } }
    } catch {
      return UNAVAILABLE
    }
  }

  const describe: Handlers['describe'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const workspace = workspaceCodec.parse(body.workspace)
    if (!workspace.ok) return NOT_FOUND
    try {
      const read = await ready.faces.catalog.describe(ready.caller, workspace.value)
      if (read.kind === 'not-permitted') return NOT_FOUND
      if (read.kind === 'unavailable') return UNAVAILABLE
      const { instances, ...summary } = read.value
      return {
        outcome: 'succeeded',
        body: { ...summaryOf(summary), instances: instances.map(instanceOf) },
      }
    } catch {
      return UNAVAILABLE
    }
  }

  /** A change names its workspace and itself. A text that is no workspace identity is no workspace. */
  const changed =
    (
      run: (faces: WorkspaceFaces, caller: Access<unknown>, named: Named) => Promise<Answer<null>>,
    ) =>
    async (call: { principal: Login }, body: ChangeBody) => {
      const ready = await prepare(input, call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const operation = operationId(body.operation)
      if (operation === null) return invalid('invalid-request')
      const workspace = workspaceCodec.parse(body.workspace)
      if (!workspace.ok) return DENIED
      try {
        const named = { operation, workspace: workspace.value }
        return committed(await run(ready.faces, ready.caller, named), () => ({}))
      } catch {
        return UNKNOWN
      }
    }

  const queried = (kind: OperationKind) => async (call: { principal: Login }, body: ChangeBody) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const operation = operationId(body.operation)
    if (operation === null) return NOT_COMMITTED
    try {
      const view = await ready.faces.governance.operation(ready.caller, operation)
      if (view.kind === 'not-permitted') return DENIED
      if (view.kind === 'unavailable') return UNAVAILABLE
      const done = view.kind === 'recorded' && view.operation === kind
      return done ? ({ outcome: 'succeeded', body: {} } as const) : NOT_COMMITTED
    } catch {
      return UNAVAILABLE
    }
  }

  const onTarget = (method: 'grantParticipation' | 'grantAdmin' | 'revokeAdmin' | 'remove') =>
    ((call, body) =>
      changed((faces, caller, named) =>
        faces.governance[method](caller, { ...named, target: body.target }),
      )(call, body)) satisfies Handlers['remove']
  const onSelf = (method: 'leave' | 'destroy') =>
    changed((faces, caller, named) => faces.governance[method](caller, named))

  return {
    operations: {
      register,
      'query-register': queryRegister,
      list,
      describe,
      'grant-participation': onTarget('grantParticipation'),
      'query-grant-participation': queried('grant-participation'),
      'grant-admin': onTarget('grantAdmin'),
      'query-grant-admin': queried('grant-admin'),
      'revoke-admin': onTarget('revokeAdmin'),
      'query-revoke-admin': queried('revoke-admin'),
      remove: onTarget('remove'),
      'query-remove': queried('remove'),
      leave: onSelf('leave'),
      'query-leave': queried('leave'),
      destroy: onSelf('destroy'),
      'query-destroy': queried('destroy'),
    },
    observations: {},
  }
}
