// One session service over one backend, with doubles for every port and a counting delegated
// entry. Principals are texts that carry their tenant: `a:` for tenant A, `b:` for tenant B, and
// `system:` for the internal principals. The access policy allows a principal on its own tenant
// only, and a test may script the next decisions ahead of the policy.
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitReceipt,
  GuardCommand,
  SessionAccess,
  SessionAccessRequest,
  SessionCallerClass,
  SessionCommand,
  SessionEvidenceBridge,
  SessionFaces,
  SessionFailure,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  createMemoryAgentDrive,
  createMemorySessionClock,
  createMemorySessionContextInput,
  createMemorySessionEvidenceBridge,
  createMemorySessionIdleInput,
  createMemorySessionNotifier,
  createMemoryScopeRelease,
  createPolicySessionAccessCheck,
  createScriptedSessionIdentityBridge,
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  sessionId,
  succeeded,
  type MemoryAgentDrive,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import {
  createMemorySessionPrincipalBindings,
  createMemorySessionWorkPrincipals,
} from '@omne-harness/session-cordis-contract/testing'
import {
  createSessionInstance,
  defaultSchedulingPolicy,
  type BeforeAdmitSlot,
  type SchedulingPolicy,
  type SessionDependencies,
  type SessionInstance,
} from '../../src/index.ts'
import type { Backend, BackendFactory, InitializationCommand } from './backends.ts'

export const TENANT_A: TenantId = memoryAccess('a:tester').tenant
export const TENANT_B: TenantId = memoryOtherAccess('b:stranger').tenant

function tenantOf(principal: string): TenantId | null {
  if (principal.startsWith('a:')) return TENANT_A
  if (principal.startsWith('b:')) return TENANT_B
  return null
}

function prefixOf(tenant: TenantId): string {
  return tenantEquals(tenant, TENANT_A) ? 'a' : 'b'
}

/** A principal acts on its own tenant; `system:` principals act on any tenant and the system scope. */
export function policy(request: SessionAccessRequest<string>): SessionAccessScript {
  const principal = request.access.principal
  const allowed: SessionAccessScript = {
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }
  if (principal.startsWith('system:')) return allowed
  const own = tenantOf(principal)
  if (!('tenant' in request.access) || own === null) return { kind: 'denied' }
  return tenantEquals(request.access.tenant, own) ? allowed : { kind: 'denied' }
}

/** One delegated-view call, by method name, with the face operation it served. */
export type ViewCall = Readonly<{ method: string; bound: string }>

type CommitInput = Parameters<SessionTransactionPort<string>['commit']>[0]
type CommitAnswer = Promise<Outcome<unknown, SessionFailure>>

/** Stands in front of the commit of a view: it may move the tail, drop the answer, or throw. */
export type CommitHook = (input: CommitInput, next: () => CommitAnswer) => CommitAnswer

export type HarnessOptions = Readonly<{
  backend: BackendFactory
  /** Bind each created session in the binding source, so the coordinators may act on it. */
  advance?: boolean
  policy?: Partial<SchedulingPolicy>
  admission?: readonly BeforeAdmitSlot[] | null
  notifier?: boolean
  drive?: boolean
}>

export async function harness(options: HarnessOptions) {
  const scripted: SessionAccessScript[] = []
  const checks = createPolicySessionAccessCheck<string>(
    request => scripted.shift() ?? policy(request),
  )
  const backend: Backend = await options.backend.open(checks)

  const calls: ViewCall[] = []
  let commitHook: CommitHook | null = null
  const delegated: SessionDependencies<string>['transactions'] = {
    bind: checked => {
      const view = backend.delegated.bind(checked)
      const bound = checked.request.operation
      const log = (method: string): void => {
        calls.push({ method, bound })
      }
      return {
        ...view,
        // The hook sees every kind of commit, so it speaks the untyped outcome; the view keeps its type.
        commit: ((input: CommitInput): CommitAnswer => {
          log('commit')
          const next = (): CommitAnswer => view.commit(input)
          return commitHook === null ? next() : commitHook(input, next)
        }) as SessionTransactionPort<string>['commit'],
        readWork: input => {
          log('readWork')
          return view.readWork(input)
        },
        readInput: input => {
          log('readInput')
          return view.readInput(input)
        },
        queryOperation: input => {
          log('queryOperation')
          return view.queryOperation(input)
        },
        queryControlOperation: input => {
          log('queryControlOperation')
          return view.queryControlOperation(input)
        },
        readModelSelection: input => {
          log('readModelSelection')
          return view.readModelSelection(input)
        },
        history: {
          begin: input => {
            log('history.begin')
            return view.history.begin(input)
          },
          next: input => {
            log('history.next')
            return view.history.next(input)
          },
          since: input => {
            log('history.since')
            return view.history.since(input)
          },
          readModelView: input => {
            log('history.readModelView')
            return view.history.readModelView(input)
          },
        },
      }
    },
  }

  /** Guards relayed by operation (the port facade of the transaction suite), ahead of the doubles. */
  const relayed = new Map<string, readonly GuardCommand[]>()
  const baseEvidence = createMemorySessionEvidenceBridge()
  let evidenceCalls = 0
  const evidenceBridge: SessionEvidenceBridge & { calls(): number } = {
    prepare: async command => {
      evidenceCalls += 1
      const relay = relayed.get(command.input.operation)
      if (relay !== undefined) return succeed(relay)
      if (command.kind === 'create' || command.kind === 'completeInitialization')
        return succeed(await backend.initializationGuards(command))
      return baseEvidence.prepare(command)
    },
    calls: () => evidenceCalls,
  }

  const bindings = createMemorySessionPrincipalBindings()
  const workPrincipals = createMemorySessionWorkPrincipals<string>({
    bindings,
    issue: request => `${prefixOf(request.tenant)}:${request.actor}`,
  })
  const identity = createScriptedSessionIdentityBridge<string>('allow')
  let identityThrows = false
  const context = createMemorySessionContextInput<string>()
  const clock = createMemorySessionClock()
  const notifier = createMemorySessionNotifier()
  const drive: MemoryAgentDrive = createMemoryAgentDrive()
  const scopeRelease = createMemoryScopeRelease()
  const idle = createMemorySessionIdleInput<string>({
    kind: 'unknown',
    at: {
      at: '2026-01-01T00:00:00.000Z',
      protocol: { owner: 'c', name: 'c', revision: '1', digest: 'd' },
      source: evidence('idle/at'),
    },
    scope: evidence('idle/scope'),
    source: evidence('idle/source'),
  })
  let directoryPresent = true
  let admission = options.admission === undefined ? [] : options.admission
  let drivePresent = options.drive ?? true

  const dependencies: SessionDependencies<string> = {
    accessCheck: checks,
    transactions: delegated,
    workPrincipals,
    directory: { current: () => (directoryPresent ? backend.transactions : null) },
    identity: {
      prepare: (access, command) =>
        identityThrows
          ? Promise.reject(new Error('bridge crashed'))
          : identity.prepare(access, command),
    },
    evidence: evidenceBridge,
    clock,
    idle,
    context,
    notifier: { current: () => (options.notifier === false ? null : notifier) },
    agentDrive: { current: () => (drivePresent ? drive : null) },
    scopeRelease: { current: () => scopeRelease },
    principals: { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
    admission: { current: () => admission },
  }
  const instance: SessionInstance<string> = createSessionInstance(dependencies, {
    policy: { ...defaultSchedulingPolicy, ...options.policy },
  })

  const faces = (caller: SessionCallerClass): SessionFaces<string> => instance.facesFor(caller)
  const access = (session = 'session-1'): SessionAccess<string> => memoryAccess('a:tester', session)
  const other = (session = 'session-1'): SessionAccess<string> =>
    memoryOtherAccess('b:stranger', session)

  const create = async (session = 'session-1'): Promise<CommitReceipt> => {
    const created = succeeded(
      await faces('intake').management.create({
        ...access(session),
        operation: operationId(`create-${session}`),
        creation: creation(),
      }),
      `create ${session}`,
    )
    if (options.advance === true) bindings.controls.bind(TENANT_A, sessionId(session))
    return created.receipt
  }
  const accept = async (input: string, session = 'session-1'): Promise<CommitReceipt> =>
    succeeded(
      await faces('intake').work.accept({
        ...access(session),
        operation: operationId(`accept-${input}`),
        value: ordinaryInput(input),
      }),
      `accept ${input}`,
    )

  return {
    instance,
    dependencies,
    backend,
    checks: {
      asked: () => checks.controls.asked(),
      count: () => checks.controls.asked().length,
      script: (...answers: SessionAccessScript[]) => {
        scripted.push(...answers)
      },
    },
    view: {
      calls: () => [...calls],
      reset: () => {
        calls.length = 0
      },
      onCommit: (hook: CommitHook | null) => {
        commitHook = hook
      },
    },
    relay: (operation: string, guards: readonly GuardCommand[]) => {
      relayed.set(operation, guards)
    },
    evidence: evidenceBridge,
    baseEvidence,
    identity,
    context,
    idle,
    clock,
    notifier,
    drive,
    bindings,
    workPrincipals,
    setIdentityThrows: (throws: boolean) => {
      identityThrows = throws
    },
    setDirectory: (present: boolean) => {
      directoryPresent = present
    },
    setAdmission: (slots: readonly BeforeAdmitSlot[] | null) => {
      admission = slots
    },
    setDrive: (present: boolean) => {
      drivePresent = present
    },
    faces,
    access,
    other,
    create,
    accept,
    initializationGuards: (command: InitializationCommand) => backend.initializationGuards(command),
    close: async () => {
      await instance.close()
      await backend.dispose()
    },
  }
}

export type Harness = Awaited<ReturnType<typeof harness>>

/** The command of a face call, as the handler builds it: the input without the principal. */
export function commandOf<K extends SessionCommand['kind']>(
  kind: K,
  input: Readonly<Record<string, unknown>>,
): SessionCommand {
  const { principal: _principal, ...rest } = input
  return { kind, input: rest } as SessionCommand
}
