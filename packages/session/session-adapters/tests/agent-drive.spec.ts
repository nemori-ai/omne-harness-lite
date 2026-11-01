// AD-14 on real Cordis: the session slot reference rule and the `sessionAgentDrive` provider. What
// is checked: the two fixed samples encode to their texts and parse back, and every malformed text
// is refused; `invoke` and `resume` read the active Run as `coordinator`, check the slot reference
// against it, and reach the runtime only through `acquire` and `resolve`, with the coordinator
// principal on every outbound call; each Agent answer maps by the SPEC table; a reference that does
// not match the Run, and an Agent `invalid` that is not an input refusal, answer `unavailable`;
// another tenant's principal, session or handle is never used; the plugin is absent while any
// dependency is absent and drops its handles when an instance retires or the plugin runs again.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
  type Access,
  type AgentExecutionHandle,
  type AgentInstanceId,
  type AgentRuntime,
  type CommandReceipt,
  type ExecutionControl,
  type ExecutionSnapshot,
  type Failure,
  type Reply,
} from '@omne-harness/agent-contract'
import {
  AgentExecutionControlService,
  AgentExecutionRecoveryService,
  AgentInstanceProvisionService,
  agentInstancesKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { createMemoryInstanceProvision } from '@omne-harness/agent-cordis-contract/testing'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  AgentDrivePort,
  AgentInstanceRef,
  DriveTarget,
  RunState,
  SessionAccess,
  SessionFaces,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  inputId,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  sessionId,
  userMessage,
} from '@omne-harness/session-contract/testing'
import { SessionService, sessionAgentDriveKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionAgentDrivePlugin, sessionScopeEvidence } from '../src/cordis/agent-drive.ts'
import { decodeSessionSlotRef, encodeSessionSlotRef } from '../src/slot-ref.ts'

// --- the slot reference rule -------------------------------------------------------------------

// The two fixed samples of SPEC AD-14; the session coordinator's tests assert the same texts.
const samples = [
  {
    name: 'plain texts',
    session: sessionId('session-1'),
    adoption: {
      owner: 'conformance',
      name: 'assistant@1',
      revision: '1',
      digest: 'sha256:assistant@1',
    },
    text: '["slot1","session-1","conformance","assistant@1","1","sha256:assistant@1"]',
  },
  {
    name: 'texts that JSON must escape, and non-ASCII text that it keeps',
    session: sessionId('sess-"引号"\\终'),
    adoption: { owner: 'assets/agents', name: '定义 A', revision: '42', digest: 'sha256:00ff' },
    text: '["slot1","sess-\\"引号\\"\\\\终","assets/agents","定义 A","42","sha256:00ff"]',
  },
] as const

describe('the session slot reference (SPEC AD-14)', () => {
  for (const sample of samples)
    it(`${sample.name}: encodes to the sample text and parses back to its slot`, () => {
      const ref = encodeSessionSlotRef({ session: sample.session, adoption: sample.adoption })
      expect(ref).toEqual({ owner: 'agent', id: sample.text })
      expect(decodeSessionSlotRef({ owner: 'agent', id: sample.text })).toEqual({
        ok: { session: sample.session, adoption: sample.adoption },
      })
    })

  it.each([
    ['an owner that is not agent', { owner: 'tool', id: samples[0].text }],
    ['an id that is not JSON', { owner: 'agent', id: 'slot1:session-1' }],
    ['five elements', { owner: 'agent', id: '["slot1","s","o","n","1"]' }],
    ['seven elements', { owner: 'agent', id: '["slot1","s","o","n","1","d","x"]' }],
    ['an element that is not a text', { owner: 'agent', id: '["slot1","s","o","n",1,"d"]' }],
    ['another rule version', { owner: 'agent', id: '["slot2","s","o","n","1","d"]' }],
    [
      'a text that is not the canonical encoding',
      { owner: 'agent', id: '[ "slot1","s","o","n","1","d"]' },
    ],
    ['an object instead of an array', { owner: 'agent', id: '{"slot1":"s"}' }],
  ])('refuses %s', (_name, ref) => {
    const decoded = decodeSessionSlotRef(ref as AgentInstanceRef)
    expect(decoded).toHaveProperty('failure.kind', 'malformed')
  })
})

// --- the provider fixture ----------------------------------------------------------------------

const A = memoryAccess<unknown>('unused')
const B = memoryOtherAccess<unknown>('unused')
const runAdoption: Adoption = samples[0].adoption
const EXECUTION = 'execution-1'
const INVOKE = 'dop_invoke-1'

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}
/** The coordinator principal that the fixture's assembly issues for one session. */
const coordinatorOf = (tenant: TenantId, session: SessionId) =>
  `coordinator:${textOf(tenant)}:${session}`

function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture: ${JSON.stringify(outcome)}`)
}
const agentRevision = must(decodeExecutionRevision('revision-7'))

function activeRun(instance: AgentInstanceRef | null, adopted: Adoption = runAdoption): RunState {
  return {
    kind: 'active',
    run: 'run-1' as never,
    adoption: adopted,
    first: inputId('input-1'),
    advance:
      instance === null ? null : { run: 'run-1' as never, attempt: 'attempt-1' as never, instance },
    ordinal: '1',
    execution: { execution: EXECUTION, revision: null, evidence: null, readThrough: '0' },
  }
}

type Call = Readonly<{ method: string; input: unknown }>

function receiptFor(operation: unknown, record: string): CommandReceipt {
  return {
    operation: must(decodeAgentOperationId(operation)),
    execution: must(decodeAgentExecutionId(EXECUTION)),
    revision: agentRevision,
    evidence: evidence(record),
    state: 'accepted',
  }
}

/**
 * A real Cordis root with the five dependencies of AD-14 and the plugin. The session service
 * serves `readWork` and `readInput` for the sessions in `runs`, only to the coordinator principal
 * of that session; the provision double builds scripted runtimes and refuses `reserve` to any
 * principal that is not the coordinator of the tenant.
 */
async function assembled(options: { mount?: readonly string[] } = {}) {
  const ctx = new Context()
  const logged: { name: string; type: string }[] = []
  ctx.logger.exporter({
    export: message => logged.push({ name: message.name, type: message.type }),
  })
  const faults = { principal: false }
  const calls: Call[] = []
  const callers: unknown[] = []
  const principalsAsked: unknown[] = []
  const runs = new Map<string, RunState>([
    [
      JSON.stringify([textOf(A.tenant), A.session]),
      activeRun(encodeSessionSlotRef({ session: A.session, adoption: runAdoption })),
    ],
  ])
  const runKey = (access: { tenant: TenantId; session: SessionId }) =>
    JSON.stringify([textOf(access.tenant), access.session])
  const owns = (access: SessionAccess<unknown>) =>
    runs.has(runKey(access)) && access.principal === coordinatorOf(access.tenant, access.session)

  // Scripted answers. Each queue answers the next call; an empty queue answers the default.
  const script = {
    invoke: [] as ((
      instance: AgentInstanceId,
    ) => Outcome<'handle', Failure> | Promise<Outcome<'handle', Failure>>)[],
    query: [] as Awaited<ReturnType<AgentExecutionRecoveryService<unknown>['query']>>[],
    load: [] as Awaited<ReturnType<AgentExecutionRecoveryService<unknown>['load']>>[],
    submit: [] as Outcome<CommandReceipt, Failure>[],
    control: [] as Outcome<CommandReceipt, Failure>[],
  }

  const handleOf = (instance: AgentInstanceId): AgentExecutionHandle<unknown> => ({
    execution: must(decodeAgentExecutionId(EXECUTION)),
    input: {
      submit: async input => {
        calls.push({ method: `submit@${instance}`, input })
        return script.submit.shift() ?? succeed(receiptFor(input.operation, 'submitted'))
      },
    },
    control: { control: async () => fail({ kind: 'unsupported' }) },
    output: {
      read: async () => fail({ kind: 'unsupported' }),
      events: () => {
        throw new Error('not used')
      },
      acknowledge: async () => fail({ kind: 'unsupported' }),
    },
  })
  const runtimeOf = (instance: AgentInstanceId): AgentRuntime<unknown> => {
    const started = async (
      method: string,
      input: unknown,
    ): Reply<AgentExecutionHandle<unknown>> => {
      calls.push({ method: `${method}@${instance}`, input })
      const next = script.invoke.shift()
      const answer = next === undefined ? succeed('handle' as const) : await next(instance)
      return 'ok' in answer ? succeed(handleOf(instance)) : answer
    }
    return {
      instance,
      invoke: input => started('invoke', input),
      resume: input => started('resume', input),
    }
  }

  const provision = createMemoryInstanceProvision<unknown>({
    create: async (_slot, instance) => succeed(runtimeOf(instance)),
    check: (access: Access<unknown>, operation) => {
      if (operation !== 'reserve') return succeed(undefined)
      const ownTenant =
        typeof access.principal === 'string' &&
        access.principal.startsWith(`coordinator:${textOf(access.tenant)}:`)
      return ownTenant ? succeed(undefined) : fail({ kind: 'denied', action: 'reserve' })
    },
  })
  const acquired: unknown[] = []

  class Provision extends AgentInstanceProvisionService<unknown> {
    readonly acquire: AgentInstanceProvisionService<unknown>['acquire'] = input => {
      acquired.push(input)
      return provision.provision.acquire(input)
    }
  }
  class Directory extends Service {
    constructor(scope: Context) {
      super(scope, agentInstancesKey)
    }
    readonly resolve = (input: Parameters<typeof provision.directory.resolve>[0]) => {
      calls.push({ method: 'resolve', input })
      return provision.directory.resolve(input)
    }
    readonly connect = provision.directory.connect
  }
  class Recovery extends AgentExecutionRecoveryService<unknown> {
    readonly query: AgentExecutionRecoveryService<unknown>['query'] = async input => {
      calls.push({ method: 'query', input })
      return (
        script.query.shift() ??
        succeed({ kind: 'committed', receipt: receiptFor(input.operation, 'committed') })
      )
    }
    readonly load: AgentExecutionRecoveryService<unknown>['load'] = async input => {
      calls.push({ method: 'load', input })
      return (
        script.load.shift() ??
        fail({ kind: 'unavailable', owner: 'test', diagnostic: 'no load scripted' })
      )
    }
    readonly reconcile: AgentExecutionRecoveryService<unknown>['reconcile'] = async input => {
      calls.push({ method: 'reconcile', input })
      return fail({ kind: 'unsupported' })
    }
    readonly detach: AgentExecutionRecoveryService<unknown>['detach'] = async input => {
      calls.push({ method: 'detach', input })
      return succeed(evidence('handed-back'))
    }
  }
  class Control extends AgentExecutionControlService<unknown> {
    readonly control: AgentExecutionControlService<unknown>['control'] = async input => {
      calls.push({ method: 'control', input })
      return script.control.shift() ?? succeed(receiptFor(input.operation, 'controlled'))
    }
  }
  const workFace: Pick<SessionFaces<unknown>['work'], 'readWork' | 'readInput'> = {
    readWork: async access => {
      calls.push({ method: 'readWork', input: access })
      if (!owns(access)) return fail({ kind: 'denied', action: 'readWork' })
      const run = runs.get(runKey(access))
      return succeed({ run } as unknown as WorkSnapshot)
    },
    readInput: async input => {
      calls.push({ method: 'readInput', input })
      if (!owns(input)) return fail({ kind: 'denied', action: 'readInput' })
      return succeed({
        kind: 'ordinary',
        input: input.input,
        message: userMessage(`text of ${input.input}`),
        origin: evidence('origin'),
      })
    },
  }
  class Session extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      callers.push(this[Service.resolveConfig]())
      return workFace as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }

  const services = { Provision, Directory, Recovery, Control, Session } as const
  const fibers = new Map<string, Awaited<ReturnType<Context['plugin']>>>()
  for (const name of options.mount ?? Object.keys(services))
    fibers.set(name, await mount(ctx, services[name as keyof typeof services]))

  const plugin = await mount(
    ctx,
    createSessionAgentDrivePlugin<unknown>({
      coordinator: async input => {
        principalsAsked.push(input)
        if (faults.principal) throw new Error('the principal source broke')
        return runs.has(runKey(input))
          ? succeed(coordinatorOf(input.tenant, input.session))
          : fail({ kind: 'denied', action: 'forSession' })
      },
    }),
  )
  const port = () => ctx.get(sessionAgentDriveKey) as AgentDrivePort | undefined
  const drive = () => {
    const current = port()
    if (current === undefined) throw new Error('sessionAgentDrive is absent')
    return current
  }
  return {
    ctx,
    calls,
    callers,
    acquired,
    principalsAsked,
    runs,
    runKey,
    script,
    provision,
    services,
    fibers,
    plugin,
    port,
    drive,
    methods: () => calls.map(call => call.method),
    faults,
    /** The error records that AD-14 wrote. */
    errors: () =>
      logged.filter(
        entry => entry.type === 'error' && entry.name === 'session-adapters/agent-drive',
      ),
  }
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

/** Mounts a plugin on the root and disposes its fiber after the test. */
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

const target = (access: SessionAccess<unknown> = A, operation = INVOKE): DriveTarget => ({
  tenant: access.tenant,
  session: access.session,
  execution: EXECUTION,
  operation,
})
const invokeInput = (access: SessionAccess<unknown> = A) => ({
  ...target(access),
  first: inputId('input-1'),
  source: evidence('se13-receipt'),
  grant: evidence('se15-grant'),
})

// --- invoke and resume ---------------------------------------------------------------------------

describe('invoke: the slot of the active Run, then acquire, resolve and invoke', () => {
  it('reads as coordinator, takes the instance of the slot, and invokes with the coordinator principal', async () => {
    const f = await assembled()
    const answer = await f.drive().invoke(invokeInput())
    expect(answer).toEqual({ ok: { revision: 'revision-7', evidence: evidence('committed') } })

    const principal = coordinatorOf(A.tenant, A.session)
    expect(f.principalsAsked).toEqual([{ tenant: A.tenant, session: A.session }])
    // Every read of `session` went through the coordinator class.
    expect(f.callers.length).toBeGreaterThan(0)
    expect(
      f.callers.every(caller => (caller as { caller?: unknown }).caller === 'coordinator'),
    ).toBe(true)
    expect(f.acquired).toEqual([
      {
        principal,
        tenant: A.tenant,
        scope: sessionScopeEvidence(textOf(A.tenant), A.session),
        definition: runAdoption,
      },
    ])
    const methods = f.methods()
    expect(methods.slice(0, 3)).toEqual(['readWork', 'readInput', 'resolve'])
    expect(methods[3]).toMatch(/^invoke@/)
    expect(methods[4]).toBe('query')
    const invoked = f.calls[3]!.input as Record<string, unknown>
    expect(invoked).toEqual({
      principal,
      tenant: A.tenant,
      execution: EXECUTION,
      operation: INVOKE,
      initial: {
        id: 'input-1',
        content: userMessage('text of input-1'),
        source: evidence('se13-receipt'),
        priority: 'ordinary',
      },
      grant: evidence('se15-grant'),
    })
    // The same principal reaches every outbound call.
    for (const call of f.calls)
      expect((call.input as { principal?: unknown }).principal, call.method).toBe(principal)
  })

  it('the scope of a slot is the same for the same session and differs by tenant and session', () => {
    const tenant = textOf(A.tenant)
    expect(sessionScopeEvidence(tenant, A.session)).toEqual(sessionScopeEvidence(tenant, A.session))
    expect(sessionScopeEvidence(tenant, A.session)).toMatchObject({
      owner: 'session',
      record: 'session-1',
      revision: '1',
    })
    expect(sessionScopeEvidence(textOf(B.tenant), A.session).digest).not.toBe(
      sessionScopeEvidence(tenant, A.session).digest,
    )
    expect(sessionScopeEvidence(tenant, sessionId('session-2')).digest).not.toBe(
      sessionScopeEvidence(tenant, A.session).digest,
    )
  })

  it('an invoke whose receipt is not known yet answers commit-unknown with the original operation', async () => {
    const f = await assembled()
    f.script.query.push(succeed({ kind: 'unknown' }))
    expect(await f.drive().invoke(invokeInput())).toEqual({
      failure: { kind: 'commit-unknown', operation: INVOKE },
    })
  })

  it.each([
    [
      'a malformed reference',
      { owner: 'agent', id: 'not a slot' } as AgentInstanceRef,
      runAdoption,
    ],
    [
      'a reference to another session',
      encodeSessionSlotRef({ session: sessionId('session-9'), adoption: runAdoption }),
      runAdoption,
    ],
    [
      'a reference to another adoption than the Run',
      encodeSessionSlotRef({ session: A.session, adoption: { ...runAdoption, revision: '2' } }),
      runAdoption,
    ],
    [
      'a reference to the right slot under a Run of another adoption',
      encodeSessionSlotRef({ session: A.session, adoption: runAdoption }),
      { ...runAdoption, digest: 'sha256:other' },
    ],
  ])(
    '%s: unavailable as a translation defect, and no instance is taken',
    async (_name, ref, adopted) => {
      const f = await assembled()
      f.runs.set(f.runKey(A), activeRun(ref, adopted))
      const answer = await f.drive().invoke(invokeInput())
      expect(answer).toHaveProperty('failure.kind', 'unavailable')
      expect(answer).toHaveProperty(
        'failure.diagnostic',
        expect.stringMatching(/^translation defect/),
      )
      expect(f.acquired).toHaveLength(0)
      expect(f.methods().some(method => method.startsWith('invoke@'))).toBe(false)
    },
  )

  it('a Run without an advance is a translation defect; a session without an active Run is unavailable', async () => {
    const f = await assembled()
    f.runs.set(f.runKey(A), activeRun(null))
    expect(await f.drive().invoke(invokeInput())).toHaveProperty(
      'failure.diagnostic',
      expect.stringMatching(/^translation defect/),
    )
    f.runs.set(f.runKey(A), { kind: 'none' })
    expect(await f.drive().invoke(invokeInput())).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the session has no active Run' },
    })
    expect(f.acquired).toHaveLength(0)
  })

  it('an invoke that meets a reclaimed instance takes the slot again and retries once on the new instance', async () => {
    const f = await assembled()
    f.script.invoke.push(async () => {
      // The host reclaims the instance between acquire and invoke; the draining runtime refuses.
      await f.provision.reclaimIdle()
      return fail({ kind: 'unavailable', owner: 'runtime', diagnostic: 'draining' })
    })
    const answer = await f.drive().invoke(invokeInput())
    expect(answer).toHaveProperty('ok')
    const invokes = f.methods().filter(method => method.startsWith('invoke@'))
    expect(invokes).toHaveLength(2)
    expect(invokes[0]).not.toBe(invokes[1])
    expect(f.acquired).toHaveLength(2)
  })

  it('an unavailable invoke on the instance that is still current is not retried', async () => {
    const f = await assembled()
    f.script.invoke.push(() => fail({ kind: 'unavailable', owner: 'runtime', diagnostic: 'down' }))
    const answer = await f.drive().invoke(invokeInput())
    expect(answer).toEqual({ failure: { kind: 'unavailable', diagnostic: 'runtime: down' } })
    expect(f.methods().filter(method => method.startsWith('invoke@'))).toHaveLength(1)
  })

  it('resume takes the slot the same way, resumes with recovery and grant, and keeps the handle', async () => {
    const f = await assembled()
    const answer = await f.drive().resume({
      ...target(A, 'dop_resume-1'),
      recovery: evidence('recovery'),
      grant: evidence('grant-2'),
    })
    expect(answer).toHaveProperty('ok.revision', 'revision-7')
    const resumed = f.calls.find(call => call.method.startsWith('resume@'))
    expect(resumed?.input).toMatchObject({
      operation: 'dop_resume-1',
      recovery: evidence('recovery'),
      grant: evidence('grant-2'),
    })
    expect(f.acquired).toHaveLength(1)
    expect(
      await f.drive().submit({
        ...target(A, 'dop_submit-1'),
        input: inputId('input-2'),
        source: evidence('se11'),
      }),
    ).toHaveProperty('ok')
  })
})

// --- the result table ----------------------------------------------------------------------------

describe('the Agent answers map by the result table', () => {
  it.each(['busy', 'terminal', 'changed', 'stale-advance', 'unsupported'] as const)(
    '%s keeps its kind',
    async kind => {
      const f = await assembled()
      f.script.invoke.push(() => fail({ kind }))
      expect(await f.drive().invoke(invokeInput())).toEqual({ failure: { kind } })
    },
  )

  it('denied and conflict keep their kind', async () => {
    const f = await assembled()
    f.script.invoke.push(() => fail({ kind: 'denied', action: 'invoke' }))
    expect(await f.drive().invoke(invokeInput())).toEqual({ failure: { kind: 'denied' } })
    f.script.invoke.push(() =>
      fail({ kind: 'conflict', operation: must(decodeAgentOperationId(INVOKE)) }),
    )
    expect(await f.drive().invoke(invokeInput())).toEqual({ failure: { kind: 'conflict' } })
  })

  it('a refusal of the message admission that carries the admission record is invalid with that record', async () => {
    const f = await assembled()
    const record = evidence('admission-rejection')
    f.script.invoke.push(() =>
      fail({ kind: 'invalid', field: 'value', reason: 'refused by admission', rejection: record }),
    )
    expect(await f.drive().invoke(invokeInput())).toEqual({
      failure: { kind: 'invalid', reason: 'refused by admission', rejection: record },
    })
  })

  it.each([
    ['no rejection record', {}],
    ['a rejection that is not evidence', { rejection: { owner: 'admission' } }],
  ])(
    'a refusal of the message admission with %s is unavailable (NP-12), and no record is made',
    async (_name, extra) => {
      const f = await assembled()
      f.script.invoke.push(() =>
        fail({ kind: 'invalid', field: 'value', reason: 'refused by admission', ...extra }),
      )
      expect(await f.drive().invoke(invokeInput())).toEqual({
        failure: { kind: 'unavailable', diagnostic: 'Agent invalid 未带拒收证据（NP-12）' },
      })
    },
  )

  it('any other invalid is unavailable as a translation defect, never a refusal', async () => {
    const f = await assembled()
    f.script.invoke.push(() => fail({ kind: 'invalid', field: 'grant', reason: 'not evidence' }))
    const answer = await f.drive().invoke(invokeInput())
    expect(answer).toHaveProperty('failure.kind', 'unavailable')
    expect(answer).toHaveProperty(
      'failure.diagnostic',
      expect.stringMatching(/^translation defect/),
    )
  })

  it('a dependency that throws is reported as a defect and answers unavailable', async () => {
    const f = await assembled()
    f.faults.principal = true
    expect(f.errors()).toHaveLength(0)
    expect(await f.drive().query(target())).toEqual({
      failure: {
        kind: 'unavailable',
        diagnostic: 'translation defect: threw: the principal source broke',
      },
    })
    expect(f.errors()).toHaveLength(1)
  })

  it('unavailable, not-ready and commit-unknown', async () => {
    const f = await assembled()
    f.script.invoke.push(() =>
      fail({ kind: 'commit-unknown', operation: must(decodeAgentOperationId(INVOKE)) }),
    )
    expect(await f.drive().invoke(invokeInput())).toEqual({
      failure: { kind: 'commit-unknown', operation: INVOKE },
    })
    f.script.invoke.push(() => fail({ kind: 'not-ready' }))
    expect(await f.drive().invoke(invokeInput())).toHaveProperty('failure.kind', 'unavailable')
  })

  it('query passes committed, excluded and unknown through, and answers rejected as a translation defect', async () => {
    const f = await assembled()
    const query = () => f.drive().query(target())
    f.script.query.push(succeed({ kind: 'committed', receipt: receiptFor(INVOKE, 'r') }))
    expect(await query()).toEqual({ ok: 'committed' })
    f.script.query.push(succeed({ kind: 'excluded', evidence: evidence('x') }))
    expect(await query()).toEqual({ ok: 'excluded' })
    f.script.query.push(succeed({ kind: 'unknown' }))
    expect(await query()).toEqual({ ok: 'unknown' })
    f.script.query.push(
      succeed({
        kind: 'rejected',
        failure: { kind: 'conflict', operation: must(decodeAgentOperationId(INVOKE)) },
        audit: evidence('a'),
        revision: agentRevision,
      }),
    )
    const rejected = await query()
    expect(rejected).toHaveProperty('failure.kind', 'unavailable')
    expect(rejected).toHaveProperty(
      'failure.diagnostic',
      expect.stringMatching(/^translation defect/),
    )
  })
})

// --- tenants -------------------------------------------------------------------------------------

describe('another tenant is never served', () => {
  it('a session that the principal source refuses is denied before anything is read or taken', async () => {
    const f = await assembled()
    expect(await f.drive().invoke(invokeInput(B))).toEqual({ failure: { kind: 'denied' } })
    expect(f.calls).toHaveLength(0)
    expect(f.acquired).toHaveLength(0)
  })

  it('a session read that Session refuses is denied, and no instance is taken', async () => {
    const f = await assembled()
    // The principal source answers for tenant B, but the session belongs to tenant A only.
    f.runs.set(
      f.runKey(B),
      activeRun(encodeSessionSlotRef({ session: B.session, adoption: runAdoption })),
    )
    const coordinator = coordinatorOf(B.tenant, B.session)
    expect(coordinator).not.toBe(coordinatorOf(A.tenant, A.session))
    f.runs.delete(f.runKey(A))
    expect(await f.drive().invoke(invokeInput(A))).toEqual({ failure: { kind: 'denied' } })
  })

  it('a handle kept for tenant A is not reached by tenant B for the same execution text', async () => {
    const f = await assembled()
    expect(await f.drive().invoke(invokeInput(A))).toHaveProperty('ok')
    f.runs.set(f.runKey(B), activeRun(null))
    const answer = await f
      .drive()
      .submit({ ...target(B, 'dop_submit-b'), input: inputId('input-b'), source: evidence('se11') })
    expect(answer).toHaveProperty('failure.kind', 'unavailable')
    expect(f.methods().some(method => method.startsWith('submit@'))).toBe(false)
  })

  it('an Agent refusal of the recovery entry is denied', async () => {
    const f = await assembled()
    f.script.query.push(fail({ kind: 'denied', action: 'query' }))
    expect(await f.drive().query(target())).toEqual({ failure: { kind: 'denied' } })
    f.script.load.push(fail({ kind: 'denied', action: 'load' }))
    expect(
      await f.drive().inspect({ tenant: A.tenant, session: A.session, execution: EXECUTION }),
    ).toEqual({ failure: { kind: 'denied' } })
  })
})

// --- submit, control, detach, inspect, recordResult, prewarm ------------------------------------

describe('submit uses the handle that invoke or resume kept', () => {
  const submitInput = {
    ...target(A, 'dop_submit-1'),
    input: inputId('input-2'),
    source: evidence('se11-receipt'),
  }

  it('without a handle it answers unavailable and calls nothing (NP-03)', async () => {
    const f = await assembled()
    expect(await f.drive().submit(submitInput)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'no execution handle for submit (NP-03)' },
    })
    expect(f.calls).toHaveLength(0)
  })

  it('after invoke it submits the read content with its SE11 source on the kept handle', async () => {
    const f = await assembled()
    await f.drive().invoke(invokeInput())
    const answer = await f.drive().submit(submitInput)
    expect(answer).toEqual({ ok: { revision: 'revision-7', evidence: evidence('submitted') } })
    const submitted = f.calls.find(call => call.method.startsWith('submit@'))
    expect(submitted?.input).toEqual({
      principal: coordinatorOf(A.tenant, A.session),
      tenant: A.tenant,
      execution: EXECUTION,
      operation: 'dop_submit-1',
      value: {
        id: 'input-2',
        content: userMessage('text of input-2'),
        source: evidence('se11-receipt'),
        priority: 'ordinary',
      },
    })
  })

  it('a refusal of the message admission on submit is invalid only with the admission record', async () => {
    const f = await assembled()
    await f.drive().invoke(invokeInput())
    const record = evidence('submit-rejection')
    f.script.submit.push(
      fail({ kind: 'invalid', field: 'value', reason: 'refused', rejection: record } as Failure),
    )
    expect(await f.drive().submit(submitInput)).toEqual({
      failure: { kind: 'invalid', reason: 'refused', rejection: record },
    })
    f.script.submit.push(fail({ kind: 'invalid', field: 'value', reason: 'refused' }))
    expect(await f.drive().submit(submitInput)).toHaveProperty('failure.kind', 'unavailable')
  })

  it('the handle is dropped when its instance retires', async () => {
    const f = await assembled()
    await f.drive().invoke(invokeInput())
    const instance = f
      .methods()
      .find(method => method.startsWith('invoke@'))!
      .slice('invoke@'.length) as AgentInstanceId
    // Another tenant's retirement of the same instance text drops nothing.
    await f.ctx.parallel(
      'agent-cordis-contract/instance-retired',
      B.tenant,
      instance,
      1,
      'withdrawn',
    )
    expect(await f.drive().submit(submitInput)).toHaveProperty('ok')
    await f.ctx.parallel(
      'agent-cordis-contract/instance-retired',
      A.tenant,
      instance,
      1,
      'withdrawn',
    )
    expect(await f.drive().submit(submitInput)).toHaveProperty('failure.kind', 'unavailable')
  })

  it('the handle is dropped when the plugin runs again on a new dependency', async () => {
    const f = await assembled()
    await f.drive().invoke(invokeInput())
    await f.fibers.get('Control')!.dispose()
    expect(f.port()).toBeUndefined()
    await mount(f.ctx, f.services.Control)
    expect(f.port()).toBeDefined()
    expect(await f.drive().submit(submitInput)).toHaveProperty('failure.kind', 'unavailable')
  })
})

describe('control goes to the long-term control entry, without a handle', () => {
  const controlInput = (intent: Parameters<AgentDrivePort['control']>[0]['intent']) => ({
    ...target(A, 'dop_control-1'),
    control: operationId('cancel'),
    intent,
  })
  const reason = () => ({
    owner: 'session',
    record: 'sop_cancel',
    revision: '1',
    digest: expect.stringMatching(/^[0-9a-f]{64}$/),
  })

  it.each<[string, Parameters<AgentDrivePort['control']>[0]['intent'], Partial<ExecutionControl>]>([
    [
      'stop-call of a Model call',
      { kind: 'stop-call', producer: { kind: 'model', call: 'mcall_1' } },
      { kind: 'interrupt-model', call: 'mcall_1' as never },
    ],
    [
      'stop-call of a Tool call',
      { kind: 'stop-call', producer: { kind: 'tool', call: 'tcall-1' } },
      { kind: 'interrupt-tool', call: 'tcall-1' as never },
    ],
    [
      'background-tool',
      { kind: 'background-tool', producer: { kind: 'tool', call: 'tcall-1' } },
      { kind: 'background-tool', call: 'tcall-1' as never },
    ],
    [
      'cancel-run',
      { kind: 'cancel-run', run: 'run-1' as never, urgency: 'graceful' },
      { kind: 'cancel' },
    ],
    ['archive', { kind: 'archive' }, { kind: 'cancel' }],
  ])('%s', async (_name, intent, command) => {
    const f = await assembled()
    const answer = await f.drive().control(controlInput(intent))
    expect(answer).toEqual({ ok: { revision: 'revision-7', evidence: evidence('controlled') } })
    expect(f.calls).toEqual([
      {
        method: 'control',
        input: {
          principal: coordinatorOf(A.tenant, A.session),
          tenant: A.tenant,
          execution: EXECUTION,
          operation: 'dop_control-1',
          command: { ...command, reason: reason() },
        },
      },
    ])
  })

  it('unarchive calls nothing', async () => {
    const f = await assembled()
    expect(await f.drive().control(controlInput({ kind: 'unarchive' }))).toEqual({
      failure: { kind: 'unsupported' },
    })
    expect(f.calls).toHaveLength(0)
  })

  it('a Model call that is not a Model call identity is a translation defect', async () => {
    const f = await assembled()
    const answer = await f
      .drive()
      .control(
        controlInput({ kind: 'stop-call', producer: { kind: 'model', call: 'not-a-model-call' } }),
      )
    expect(answer).toHaveProperty(
      'failure.diagnostic',
      expect.stringMatching(/^translation defect/),
    )
    expect(f.calls).toHaveLength(0)
  })
})

const authority = {
  execution: must(decodeAgentExecutionId(EXECUTION)),
  executionAttachment: must(decodeExecutionAttachmentId('attachment-1')),
  instance: 'instance-1' as AgentInstanceId,
  generation: '1',
  source: evidence('attached'),
}
function snapshot(
  state: ExecutionSnapshot['state'],
  attachment: typeof authority | null,
): ExecutionSnapshot {
  return {
    revision: agentRevision,
    state,
    executionAttachment: attachment,
    history: evidence('history'),
  } as unknown as ExecutionSnapshot
}

describe('detach hands back the loaded attachment', () => {
  const detachInput = {
    ...target(A, 'dop_detach-1'),
    advance: {
      run: 'run-1' as never,
      attempt: 'attempt-1' as never,
      instance: encodeSessionSlotRef({ session: A.session, adoption: runAdoption }),
    },
  }

  it('loads the Authority and detaches with it and a reason basis', async () => {
    const f = await assembled()
    f.script.load.push(succeed(snapshot({ kind: 'advancing' }, authority)))
    expect(await f.drive().detach(detachInput)).toEqual({ ok: evidence('handed-back') })
    expect(f.methods()).toEqual(['load', 'detach'])
    expect(f.calls[1]!.input).toMatchObject({
      operation: 'dop_detach-1',
      authority,
      reason: { owner: 'session', record: 'dop_detach-1' },
    })
  })

  it('without an attachment it answers unavailable and does not detach', async () => {
    const f = await assembled()
    f.script.load.push(succeed(snapshot({ kind: 'advancing' }, null)))
    expect(await f.drive().detach(detachInput)).toHaveProperty('failure.kind', 'unavailable')
    expect(f.methods()).toEqual(['load'])
  })
})

describe('inspect maps the snapshot and never says missing', () => {
  const inspect = (f: Awaited<ReturnType<typeof assembled>>) =>
    f.drive().inspect({ tenant: A.tenant, session: A.session, execution: EXECUTION })

  it.each<
    [
      string,
      ExecutionSnapshot['state'],
      typeof authority | null,
      Partial<Awaited<ReturnType<AgentDrivePort['inspect']>>>,
    ]
  >([
    [
      'an advancing execution',
      { kind: 'advancing' },
      authority,
      {
        ok: {
          revision: 'revision-7',
          state: 'open',
          attachment: 'active',
          conclusion: null,
          evidence: evidence('history'),
        },
      },
    ],
    [
      'a suspended execution',
      { kind: 'suspended', handoff: evidence('h') },
      authority,
      {
        ok: {
          revision: 'revision-7',
          state: 'suspended',
          attachment: 'detached',
          conclusion: null,
          evidence: evidence('history'),
        },
      },
    ],
    [
      'an execution without attachment',
      { kind: 'reconciling' },
      null,
      {
        ok: {
          revision: 'revision-7',
          state: 'open',
          attachment: null,
          conclusion: null,
          evidence: evidence('history'),
        },
      },
    ],
    [
      'an ended execution',
      {
        kind: 'ended',
        conclusion: { kind: 'fail', cause: evidence('cause') },
        disposition: evidence('disposition'),
      },
      authority,
      {
        ok: {
          revision: 'revision-7',
          state: 'ended',
          attachment: null,
          conclusion: {
            outcome: 'fail',
            cause: evidence('cause'),
            disposition: evidence('disposition'),
          },
          evidence: evidence('history'),
        },
      },
    ],
  ])('%s', async (_name, state, attachment, expected) => {
    const f = await assembled()
    f.script.load.push(succeed(snapshot(state, attachment)))
    expect(await inspect(f)).toEqual(expected)
  })

  it('an unavailable load stays unavailable', async () => {
    const f = await assembled()
    expect(await inspect(f)).toHaveProperty('failure.kind', 'unavailable')
  })
})

describe('the two operations that have no Agent entry', () => {
  it('recordResult answers unavailable (NP-04) and prewarm unsupported (P-7), calling nothing', async () => {
    const f = await assembled()
    const recorded = await f.drive().recordResult({
      ...target(),
      consumption: 'consumption-1' as never,
      result: {} as never,
      transfer: { kind: 'none' },
      release: { kind: 'pending' },
    })
    expect(recorded).toHaveProperty('failure.kind', 'unavailable')
    expect(
      await f.drive().prewarm({
        tenant: A.tenant,
        session: A.session,
        adoption: runAdoption,
        counters: evidence('c'),
      }),
    ).toEqual({ failure: { kind: 'unsupported' } })
    expect(f.calls).toHaveLength(0)
  })
})

// --- Cordis --------------------------------------------------------------------------------------

describe('loading and stopping on real Cordis 4.0.4', () => {
  it('provides sessionAgentDrive with all five dependencies and removes it when it stops', async () => {
    const f = await assembled()
    expect(sessionAgentDriveKey).toBe('sessionAgentDrive')
    expect(f.port()).toBeDefined()
    const held = f.drive()
    await f.plugin.dispose()
    expect(f.port()).toBeUndefined()
    // A handle held after the stop answers unavailable and calls nothing.
    expect(await held.invoke(invokeInput())).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the agent drive has stopped' },
    })
    expect(f.calls).toHaveLength(0)
  })

  it.each(['Provision', 'Directory', 'Recovery', 'Control', 'Session'])(
    'stays absent while %s is absent',
    async missing => {
      const all = ['Provision', 'Directory', 'Recovery', 'Control', 'Session']
      const f = await assembled({ mount: all.filter(name => name !== missing) })
      expect(f.port()).toBeUndefined()
      await mount(f.ctx, f.services[missing as keyof typeof f.services])
      expect(f.port()).toBeDefined()
    },
  )
})
