import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
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
  SessionCallControl,
} from '@omne-harness/session-contract'
import {
  createMemoryAgentDrive,
  createMemorySessionClock,
  createMemorySessionContextInput,
  createMemorySessionEvidenceBridge,
  createMemorySessionIdleInput,
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
  type SessionDiagnostic,
  type SessionMeasure,
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

export type ViewCall = Readonly<{ method: string; bound: string }>

type CommitInput = Parameters<SessionTransactionPort<string>['commit']>[0]
type CommitAnswer = Promise<Outcome<unknown, SessionFailure>>

export type CommitHook = (input: CommitInput, next: () => CommitAnswer) => CommitAnswer

export type HarnessOptions = Readonly<{
  backend: BackendFactory
  advance?: boolean
  policy?: Partial<SchedulingPolicy>
  admission?: readonly BeforeAdmitSlot[] | null
  drive?: boolean
  measure?: SessionMeasure
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
          readCompactionContext: input => {
            log('history.readCompactionContext')
            return view.history.readCompactionContext(input)
          },
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

  const relayed = new Map<string, readonly GuardCommand[]>()
  const baseEvidence = createMemorySessionEvidenceBridge()
  let evidenceCalls = 0
  const evidenceAccesses: SessionAccess<string>[] = []
  const evidenceBridge: SessionEvidenceBridge<string> & {
    calls(): number
    accesses(): readonly SessionAccess<string>[]
  } = {
    prepare: async (command, access) => {
      evidenceCalls += 1
      if (access === undefined || access.session !== command.input.session)
        return fail({
          kind: 'unavailable',
          owner: 'evidence',
          diagnostic: 'the evidence bridge was not given the access of the original call',
        })
      evidenceAccesses.push(access)
      const relay = relayed.get(command.input.operation)
      if (relay !== undefined) return succeed(relay)
      if (command.kind === 'create' || command.kind === 'completeInitialization')
        return succeed(await backend.initializationGuards(command))
      return baseEvidence.prepare(command)
    },
    calls: () => evidenceCalls,
    accesses: () => [...evidenceAccesses],
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
  const callControl: { port: SessionCallControl | null } = { port: null }

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
    agentDrive: { current: () => (drivePresent ? drive : null) },
    scopeRelease: { current: () => scopeRelease },
    callControl: { current: () => callControl.port },
    principals: { coordinator: 'system:coordinator', maintainer: 'system:maintainer' },
    admission: { current: () => admission },
  }
  const diagnostics: SessionDiagnostic[] = []
  const instance: SessionInstance<string> = createSessionInstance(
    dependencies,
    { policy: { ...defaultSchedulingPolicy, ...options.policy } },
    {
      ...(options.measure === undefined ? {} : { measure: options.measure }),
      diagnose: diagnostic => {
        diagnostics.push(diagnostic)
      },
    },
  )

  const faces = (
    caller: SessionCallerClass,
  ): SessionFaces<string> & Pick<ReturnType<typeof instance.facesFor>, 'directory'> =>
    instance.facesFor(caller)
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
    callControl,
    diagnostics: (): readonly SessionDiagnostic[] => [...diagnostics],
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

export function commandOf<K extends SessionCommand['kind']>(
  kind: K,
  input: Readonly<Record<string, unknown>>,
): SessionCommand {
  const { principal: _principal, ...rest } = input
  return { kind, input: rest } as SessionCommand
}
