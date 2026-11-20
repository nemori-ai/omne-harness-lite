import type { PortRead } from '@omne-harness/dispatch'
import { acceptedDispatch, sessionNamed, tenantOf } from '@omne-harness/dispatch/testing'
import type { Dispatch, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import type {
  HistoryPage,
  InputFate,
  Modes,
  SessionFailure,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { createDispatchSessions, type Called, type SessionCalls } from '../src/index.ts'

const organization = organizationCodec.parse('org_c0nf0rmance000000000000000')
const account = accountCodec.parse('acc_c0nf0rmance000000000000000')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
export const LEGAL_TENANT = tenant(organization.value, account.value)
const encoded = tenantCodec.encode(LEGAL_TENANT)
if (!encoded.ok) throw new Error('the test tenant has no text')
export const TENANT = encoded.value as TenantId
export const OTHER_TENANT = tenantOf('not-a-tenant-text')
export const PARENT = 'a'.repeat(64) as SessionRef
export const PEER = 'b'.repeat(64) as SessionRef
export const MODES: Modes = {
  permission: 'auto_permission',
  environment: { owner: 'env', name: 'local', revision: '1', digest: 'sha256:env' },
  collaboration: 'auto-drive',
}

export function work(session: string, change: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    session,
    lifecycle: 'dormant',
    definition: { name: 'coding', adopted: MODES.environment },
    creation: { workspace: null, workspaceAttachment: null },
    run: { kind: 'none' },
    ...change,
  } as unknown as WorkSnapshot
}

export const dispatchOf = (change: Partial<Dispatch> = {}): Dispatch =>
  acceptedDispatch(1, { tenant: TENANT, dispatcher: PARENT, ...change })

type Scripted = {
  works: Map<string, PortRead<WorkSnapshot | null>>
  modes: PortRead<Modes>
  create: Called<unknown> | Error
  accept: Called<unknown> | Error
  fates: Map<string, Called<InputFate> | Error>
  cancel: Called<unknown> | Error
  pages: (Called<HistoryPage> | Error)[]
}

export function world() {
  const script: Scripted = {
    works: new Map([[PARENT, { kind: 'read', value: work(PARENT) }]]),
    modes: { kind: 'read', value: MODES },
    create: { ok: null },
    accept: { ok: null },
    fates: new Map(),
    cancel: { ok: null },
    pages: [],
  }
  const calls: { name: string; input: unknown }[] = []
  const answer = async <T>(name: string, input: unknown, value: T | Error): Promise<T> => {
    calls.push({ name, input })
    if (value instanceof Error) throw value
    return value
  }
  const denied: { failure: SessionFailure } = { failure: { kind: 'denied', action: 'read' } }
  const port: SessionCalls = {
    create: input => answer('create', input, script.create),
    accept: input => answer('accept', input, script.accept),
    fate: input => answer('fate', input, script.fates.get(input.input) ?? denied),
    work: input =>
      answer('work', input, script.works.get(input.session) ?? { kind: 'read', value: null }),
    modes: input => answer('modes', input, script.modes),
    cancelRun: input => answer('cancelRun', input, script.cancel),
    history: input => answer('history', input, script.pages.shift() ?? denied),
  }
  const sessions = createDispatchSessions(port)
  const made = (name: string) => calls.filter(call => call.name === name).map(call => call.input)
  return { script, calls, made, sessions, port }
}

export { sessionNamed }
