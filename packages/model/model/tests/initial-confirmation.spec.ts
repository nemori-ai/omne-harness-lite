import { expect, it } from 'vitest'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
  createModelObservationStorage,
  modelCommands,
} from '../src/commands/index.ts'
import { initialRunPort } from '../src/commands/initial.ts'
import type {
  Binding,
  CallDocument,
  ModelConfirmationPass,
  ModelRunCompletion,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { callId, fixture, instance, op, unbox } from './memory-fixture.ts'

// Which confirmed passes advance a first-execution record. The run's private port receives hand-made
// passes over real records: only the record's own committed admit admits it, and only its own
// confirmed claim gives the bound record its execution. Outcomes are read through the channel.

function assembly() {
  const f = fixture()
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 2 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  let initial: ReturnType<typeof createModelInitialExecution<typeof f.principal>>
  const core = createModelCommandsCore(
    {
      ...f.options,
      initialRun: run,
      evidence: f.options.evidence.map(e => ({
        ...e,
        continuity: input => initial.continuity(input),
      })),
    },
    bridge.storage,
  )
  initial = createModelInitialExecution({ run, core })
  const access = { tenant: f.tenant, principal: f.principal, call: f.admit.call }
  const key = core.identity(access)
  if (typeof key !== 'string') throw new Error('fixture tenant')
  const stored = () => {
    const documents = memory.documents(key)
    const call = documents.calls.get(f.admit.call)
    if (!call) throw new Error('fixture call')
    return { call, admit: documents.operations.get(f.admit.operation) }
  }
  const confirm = (
    pass: ModelConfirmationPass | null,
    completion: ModelRunCompletion = { kind: 'confirmed' },
  ) => initialRunPort(run).finishConfirmation(pass, completion)
  return { f, memory, initial, commands: modelCommands(core), access, key, stored, confirm }
}

type Pending = Awaited<ReturnType<typeof pending>>
type Bound = Awaited<ReturnType<typeof bound>>

/** A record still pending: its admit committed in storage without a confirmation pass. */
async function pending() {
  const a = assembly()
  a.memory.control.injectUnknown({ ...a.f.admit, method: 'admit', effect: 'applied' })
  expect(await a.commands.admit(a.f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  a.memory.control.reveal({ ...a.f.admit, result: 'committed' })
  const channel = unbox(a.initial.openHost({ instance: instance() }))
  expect(await channel.prepare(a.access)).toMatchObject({
    failure: { diagnostic: 'initial-record-missing' },
  })
  const { call, admit } = a.stored()
  if (!admit) throw new Error('fixture admit binding')
  const pass = (
    change: Partial<{
      call: CallDocument | undefined
      binding: Binding | undefined
      operation: string
    }> = {},
  ): ModelConfirmationPass => ({
    scope: {
      tenant: a.key,
      call: a.f.admit.call,
      operation: ('operation' in change ? change.operation : a.f.admit.operation) as never,
    },
    seen: {
      call: 'call' in change ? change.call : call,
      operation: 'binding' in change ? change.binding : admit,
    },
    staged: null,
  })
  return { ...a, channel, call, admit, pass }
}

it('admits a pending record from its own committed admit', async () => {
  const p = await pending()
  p.confirm(p.pass())
  expect(await p.channel.prepare(p.access)).toHaveProperty('ok')
})

it.each([
  ['another operation', (p: Pending) => p.pass({ operation: op('other') })],
  [
    'a binding of another call',
    (p: Pending) => p.pass({ binding: { ...p.admit, call: callId('two') } }),
  ],
  [
    'a binding of another method',
    (p: Pending) => p.pass({ binding: { ...p.admit, method: 'claim' } }),
  ],
  [
    'a binding of another fingerprint',
    (p: Pending) => p.pass({ binding: { ...p.admit, fingerprint: 'other' } }),
  ],
  ['no binding', (p: Pending) => p.pass({ binding: undefined })],
  [
    'an unknown binding',
    (p: Pending) => p.pass({ binding: { ...p.admit, status: 'unknown', effect: 'applied' } }),
  ],
  ['no call', (p: Pending) => p.pass({ call: undefined })],
  [
    'a call document of another call',
    (p: Pending) =>
      p.pass({ call: { ...p.call, state: { ...p.call.state, call: callId('two') } } }),
  ],
  [
    'a call document of another admission',
    (p: Pending) => p.pass({ call: { ...p.call, admission: op('other') } }),
  ],
  [
    'a staged publish of another admission',
    (p: Pending) => ({
      ...p.pass(),
      staged: {
        kind: 'publish' as const,
        tenant: p.key,
        call: { ...p.call, admission: op('other') },
      },
    }),
  ],
] as const)('keeps the record pending for a pass with %s', async (_name, make) => {
  const p = await pending()
  p.confirm(make(p))
  expect(await p.channel.prepare(p.access)).toMatchObject({
    failure: { diagnostic: 'initial-record-missing' },
  })
  p.confirm(p.pass())
  expect(await p.channel.prepare(p.access)).toHaveProperty('ok')
})

it('advances nothing for a failed run or a pass that saw nothing', async () => {
  const p = await pending()
  p.confirm(p.pass(), { kind: 'failed', failure: { kind: 'denied', action: 'test' } })
  expect(() => p.confirm({ scope: p.pass().scope, seen: null, staged: null })).not.toThrow()
  expect(await p.channel.prepare(p.access)).toMatchObject({
    failure: { diagnostic: 'initial-record-missing' },
  })
})

/** A bound record without execution, and the claim pass that would confirm its execution. */
async function bound() {
  const a = assembly()
  unbox(await a.commands.admit(a.f.admit))
  const channel = unbox(a.initial.openHost({ instance: instance() }))
  const prepared = unbox(await channel.prepare(a.access))
  const { call } = a.stored()
  const execution = {
    tenant: a.f.tenant,
    call: a.f.admit.call,
    instance: prepared.instance,
    generation: '1',
  }
  const claim = {
    call: a.f.admit.call,
    method: 'claim',
    fingerprint: 'claim',
    revision: call.state.revision,
    receipt: { kind: 'claim', instance: prepared.instance, generation: '1' },
    status: 'committed',
  } as Binding
  const pass = (
    change: Partial<{ binding: Binding; operation: string; execution: typeof execution }> = {},
  ): ModelConfirmationPass => ({
    scope: {
      tenant: a.key,
      call: a.f.admit.call,
      operation: (change.operation ?? prepared.operation) as never,
    },
    seen: {
      call: { ...call, execution: change.execution ?? execution },
      operation: change.binding ?? claim,
    },
    staged: null,
  })
  return { ...a, channel, prepared, execution, claim, pass }
}

it('gives the bound record the execution of its own confirmed claim and keeps it bound', async () => {
  const b = await bound()
  expect(b.channel.qualifyExecution(b.execution)).toMatchObject({ failure: { kind: 'denied' } })
  b.confirm(b.pass())
  expect(b.channel.qualifyExecution(b.execution)).toHaveProperty('ok')
})

it.each([
  ['another operation', (b: Bound) => b.pass({ operation: op('other') })],
  [
    'a binding of another call',
    (b: Bound) => b.pass({ binding: { ...b.claim, call: callId('two') } }),
  ],
  [
    'a binding of another method',
    (b: Bound) => b.pass({ binding: { ...b.claim, method: 'admit' } }),
  ],
  [
    'a receipt that is not a claim',
    (b: Bound) =>
      b.pass({
        binding: {
          ...b.claim,
          receipt: { kind: 'control', generation: '1' } as unknown as Binding['receipt'],
        },
      }),
  ],
  [
    'an execution of another instance',
    (b: Bound) => b.pass({ execution: { ...b.execution, instance: instance('other') } }),
  ],
  [
    'an execution of another generation',
    (b: Bound) => b.pass({ execution: { ...b.execution, generation: '2' } }),
  ],
] as const)(
  'keeps the bound record without execution for a claim pass with %s',
  async (_name, make) => {
    const b = await bound()
    b.confirm(make(b))
    expect(b.channel.qualifyExecution(b.execution)).toMatchObject({ failure: { kind: 'denied' } })
    expect(unbox(await b.channel.prepare(b.access))).toEqual(b.prepared)
  },
)
