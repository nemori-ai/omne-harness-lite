import { describe, expect, it } from 'vitest'
import type { AgentEvent, ExecutionSnapshot, Position } from '@omne-harness/agent-contract'
import { decodeDispatchId, decodeResultVersion } from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import {
  acceptedInput,
  evidence,
  execution,
  ok,
  operation,
  withLineage,
} from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'
import {
  declare,
  implementations,
  observed,
  output,
  recordingPasses,
  reminder,
  tenantView,
  type Behavior,
} from './extension-support.ts'

const stop = output({ kind: 'stop', terminal: 'failed', reason: 'enough' })
const veto = output({ kind: 'veto', reason: 'not allowed' })
const kinds = (events: readonly AgentEvent[]) => events.map(event => event.body.kind)

type Assembly = Awaited<ReturnType<typeof loopAssembly>> | Awaited<ReturnType<typeof toolAssembly>>

function parts() {
  const view = tenantView()
  const extensions = implementations()
  const saved: { current: ReturnType<typeof recordingPasses> | null } = { current: null }
  const wrap = <D extends Parameters<typeof recordingPasses>[0]>(dependencies: D): D => {
    saved.current = recordingPasses({
      ...dependencies,
      extensions: extensions.port,
      enabledExtensions: view.port,
    })
    return saved.current.dependencies as D
  }
  const trace = () => saved.current?.total.trace ?? []
  const commits = () => saved.current?.commits ?? []
  return { view, extensions, wrap, trace, commits }
}

const loaded = async (assembly: Assembly): Promise<ExecutionSnapshot> =>
  ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))

/** A run without tools: one main model call that replies with text. */
async function plain(position: Position, behavior: Behavior, extra = {}) {
  const p = parts()
  p.view.enable(declare('probe', position, extra))
  p.extensions.define('probe', behavior)
  const assembly = await loopAssembly([execution()], p.wrap)
  assembly.release.open()
  const handle = ok(await invoke(assembly))
  return { ...p, assembly, handle }
}

/** A run whose first reply suggests tools; `calls` names them. The tool results are pushed by `finishTools`. */
async function tools(position: Position, behavior: Behavior, extra = {}, calls = ['call-a']) {
  const p = parts()
  p.view.enable(declare('probe', position, extra))
  p.extensions.define('probe', behavior)
  const assembly = await toolAssembly({ toolConcurrency: 2 }, {}, {}, p.wrap)
  let count = 0
  assembly.controls.tools.invoke.always(async () => {
    count += 1
    const reference = ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call: ok(decodeToolCallId(`tcall_call-${count}`)),
        admission: ok(decodeToolOperationId(`top_call-${count}`)),
      }),
    )
    return { kind: 'accepted', reference, state: {} as never, recovered: false }
  })
  ok(await invoke(assembly))
  await deliverToolSuggestion(
    assembly,
    calls.map(id => toolCall(id)),
  )
  return { ...p, assembly }
}

async function settled(assembly: Assembly, state: ExecutionSnapshot['state']['kind']) {
  await eventually(async () => (await loaded(assembly)).state.kind === state)
  return loaded(assembly)
}

describe('before_model_call, main', () => {
  it('observed: the request is made and the pass leaves the checkpoint with the request record', async () => {
    const s = await plain('before_model_call', () => observed)
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    expect(s.extensions.invocations.map(item => item.input.passage)).toEqual([
      'step-1/main/before_model_call/call/0',
    ])
    expect(s.assembly.controls.requests.prepare.calls.at(-1)?.beforeModelCall).toEqual([
      'step-1/main/before_model_call/call/0',
    ])
    expect(s.commits().find(commit => commit.node === 'M0')).toMatchObject({
      chain: null,
      calls: [],
    })
  })

  it('veto: the request is not made; the run waits and does not complete', async () => {
    const s = await plain('before_model_call', () => veto)
    const waiting = await settled(s.assembly, 'waiting')
    expect(waiting.state).toMatchObject({
      waits: [{ kind: 'dependency', owner: 'agentExtensions', position: 'I8' }],
    })
    expect(s.trace().some(commit => commit.startsWith('M0'))).toBe(false)
    expect(s.extensions.invocations).toHaveLength(1)
  })

  it('rewrite: the request is prepared from the rewritten input, and the rewrite is named as an alteration', async () => {
    const system = [{ kind: 'text', text: 'be brief' }]
    const s = await plain('before_model_call', input => {
      const subject = input.subject as { purpose: 'main'; preparation: { input: object } }
      const preparation = {
        ...subject.preparation,
        input: { ...subject.preparation.input, system },
      }
      return output({ kind: 'rewrite', subject: { ...subject, preparation } })
    })
    await eventsOf(s.handle)
    const last = s.assembly.controls.requests.prepare.calls.at(-1)
    expect(last?.previous).toMatchObject({ kind: 'assembled', input: { system } })
    expect(last?.alterations).toHaveLength(1)
  })

  it('select_model: the selection is read again with the conclusion as its alteration', async () => {
    const s = await plain('before_model_call', () =>
      output({ kind: 'select_model', route: 'cheap' }),
    )
    await eventsOf(s.handle)
    expect(s.assembly.controls.selection.select.calls.at(-1)?.alterations).toHaveLength(1)
  })
})

describe('after_model_call, complete_reply', () => {
  const complete = { dimension: { ending: 'complete_reply' } } as const

  it('observed: the member reads the reply and the run goes on', async () => {
    const s = await plain('after_model_call', () => observed, complete)
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      purpose: 'main',
      reply: { role: 'assistant' },
      termination: { kind: 'completed' },
    })
    expect((await loaded(s.assembly)).state).toMatchObject({ conclusion: { kind: 'complete' } })
  })

  it('stop: the execution ends failed and the reply is not admitted', async () => {
    const s = await plain('after_model_call', () => stop, complete)
    const events = await eventsOf(s.handle)
    expect((await loaded(s.assembly)).settlement.candidate?.failure).toMatchObject({
      kind: 'extension-stop',
    })
    expect(
      events.filter(
        event => event.body.kind === 'message' && event.body.message.role === 'assistant',
      ),
    ).toEqual([])
  })
})

describe('after_model_call, failure', () => {
  const failure = { dimension: { ending: 'failure' } } as const
  const failed = {
    kind: 'failed',
    fault: { cause: 'stream-lost', diagnostic: 'response-body-lost', upstreamStatus: null },
  } as const
  const plan = {
    supplier: {
      adoption: evidence('supplier'),
      provider: 'recipient',
      model: 'model',
      credential: { layer: 'official' },
    },
    notBefore: null,
    basis: { owner: 'test', name: 'retry', revision: '1', digest: 'd' },
  }

  /** A run whose first main call fails; `content` says whether any content was seen before the failure. */
  async function failing(behavior: Behavior, content: 'none' | 'observed') {
    const p = parts()
    p.view.enable(declare('probe', 'after_model_call', failure))
    p.extensions.define('probe', behavior)
    const calls: string[] = []
    const assembly = await loopAssembly([execution()], d =>
      p.wrap({
        ...d,
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            async admit(input) {
              const admitted = await d.models.calls.admit(input)
              if ('failure' in admitted) return admitted
              calls.push(input.call)
              const first = calls.length === 1
              const call = { tenant: input.tenant, call: input.call }
              if (first && content === 'observed') {
                const dispatch = ok(decodeDispatchId('mdisp_1'))
                assembly.controls.models.start({ ...call, dispatch, firstContent: 'observed' })
                assembly.controls.models.recordDispatch({
                  ...call,
                  record: {
                    dispatch,
                    supplier: input.request.suppliers[0],
                    intent: input.operation,
                    send: 'started',
                    firstContent: 'observed',
                    terminal: failed,
                    account: null,
                    materialization: null,
                  },
                })
              }
              assembly.controls.models.settle({
                ...call,
                version: ok(decodeResultVersion(`mrver_${calls.length}`)),
                termination: first ? failed : { kind: 'completed', reason: 'stop' },
                parts: first
                  ? []
                  : [{ kind: 'sealed', trims: [], block: textBlock('the reply', 'blk_reply') }],
                source: evidence(`settled-${calls.length}`),
                pageSize: 4,
                pageTargetBytes: 65536,
              })
              await assembly.controls.pusher?.settled(call)
              return admitted
            },
          },
        },
      }),
    )
    const handle = ok(await invoke(assembly))
    return { ...p, assembly, handle, calls }
  }

  it.each(['none', 'observed'] as const)(
    'a settled failure (first content %s): retry is no output of it, Agent makes no second call, and the run fails with the model fault',
    async firstContent => {
      const s = await failing(() => output({ kind: 'retry', plan }), firstContent)
      await eventsOf(s.handle)
      expect(s.calls).toHaveLength(1)
      expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
        purpose: 'main',
        request: { suppliers: [expect.any(Object)] },
        fault: { cause: 'stream-lost' },
      })
      const ended = await loaded(s.assembly)
      expect(ended.settlement.candidate?.failure).toMatchObject({ kind: 'no-reply' })
      expect(
        s
          .commits()
          .flatMap(commit => commit.calls.map(call => call.output))
          .filter(Boolean),
      ).toContain('errored')
    },
  )

  it('observed: the run fails with the model fault, and the pass has left the checkpoint', async () => {
    const s = await failing(() => observed, 'none')
    await eventsOf(s.handle)
    expect(s.calls).toHaveLength(1)
    const ended = await loaded(s.assembly)
    expect(ended.settlement.candidate?.failure).toMatchObject({ kind: 'no-reply' })
    expect(ended.checkpoint).toMatchObject({ chain: null, passages: [] })
  })

  it('stop: the run ends with the extension as the cause, not with a retry', async () => {
    const s = await failing(() => stop, 'none')
    await eventsOf(s.handle)
    expect(s.calls).toHaveLength(1)
    expect((await loaded(s.assembly)).settlement.candidate?.failure).toMatchObject({
      kind: 'extension-stop',
    })
  })
})

describe('before_action', () => {
  it('observed: the action goes on to the official admission and is sent', async () => {
    const s = await tools('before_action', () => observed)
    await associatedTools(s.assembly, 1)
    expect(s.assembly.controls.admission.admit.calls).toHaveLength(1)
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      original: { callId: 'call-a' },
      definition: { name: 'read_file' },
      batch: [expect.any(String)],
    })
  })

  it('veto: the action is denied without asking the official admission, and no tool runs', async () => {
    const s = await tools('before_action', () => veto)
    await eventually(async () => (await toolMessages(s.assembly)).length === 1)
    expect(s.assembly.controls.admission.admit.calls).toHaveLength(0)
    expect(s.assembly.controls.tools.invoke.calls).toHaveLength(0)
  })

  it('rewrite: the official admission judges the rewritten arguments', async () => {
    const s = await tools('before_action', input =>
      output({
        kind: 'rewrite',
        subject: { ...input.subject, effectiveArguments: '{"path":"/safe"}' },
      }),
    )
    await eventually(async () => s.assembly.controls.admission.admit.calls.length === 1)
    expect(s.assembly.controls.admission.admit.calls[0]?.effectiveArguments).toBe(
      '{"path":"/safe"}',
    )
  })

  it('a batch of two actions reads the enabled extensions once, and each action has its own chain', async () => {
    const s = await tools('before_action', () => observed, {}, ['call-a', 'call-b'])
    await associatedTools(s.assembly, 2)
    const reads = s.view.state.positions.filter(position => position === 'before_action')
    expect(reads).toHaveLength(1)
    expect(s.extensions.invocations.map(item => item.input.passage)).toHaveLength(2)
    expect(new Set(s.extensions.invocations.map(item => item.input.passage)).size).toBe(2)
    const opened = s.commits().find(commit => commit.chain?.position === 'before_action')
    expect(opened?.calls.map(call => call.state)).toEqual(['requested', 'requested'])
  })
})

async function finishTools(assembly: Awaited<ReturnType<typeof toolAssembly>>, count = 1) {
  const pending = await associatedTools(assembly, count)
  for (const [index, call] of pending.entries())
    ok(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(call, {
          name: `r${index}`,
          content: [textBlock(`result ${index}`, `blk_${index}`)],
        }),
      ),
    )
}

const toolMessages = async (assembly: Assembly) => {
  const messages: unknown[] = []
  for await (const page of assembly.dependencies.journal.output.events({
    ...alice,
    execution: execution(),
    after: null,
    signal: AbortSignal.timeout(50),
  })) {
    if ('failure' in page || page.ok.kind !== 'page') break
    for (const event of page.ok.events)
      if (event.body.kind === 'message' && event.body.message.role === 'tool')
        messages.push(event.body.message.blocks)
    if (page.ok.caughtUp) break
  }
  return messages
}

describe('after_action', () => {
  const each = { dimension: { scope: 'each' } } as const
  const batch = { dimension: { scope: 'batch' } } as const
  const second = async (assembly: Assembly) =>
    eventually(async () =>
      (await loaded(assembly)).checkpoint.calls.some(
        call => call.kind === 'model' && call.action.startsWith('step-2/'),
      ),
    )

  it('each, observed: the member reads the candidate and the result is admitted unchanged', async () => {
    const s = await tools('after_action', () => observed, each)
    await finishTools(s.assembly)
    await second(s.assembly)
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      candidate: { role: 'tool' },
      outcome: { kind: 'executed' },
    })
    expect(JSON.stringify(await toolMessages(s.assembly))).toContain('result 0')
  })

  it('each, rewrite: the rewritten blocks are what message admission takes', async () => {
    const s = await tools(
      'after_action',
      input => {
        const subject = input.subject as { candidate: { blocks: readonly unknown[] } }
        const blocks = [subject.candidate.blocks[0], textBlock('redacted', 'blk_redacted')]
        return output({
          kind: 'rewrite',
          subject: { ...subject, candidate: { ...subject.candidate, blocks } },
        })
      },
      each,
    )
    await finishTools(s.assembly)
    await second(s.assembly)
    const admitted = JSON.stringify(await toolMessages(s.assembly))
    expect(admitted).toContain('redacted')
    expect(admitted).not.toContain('result 0')
  })

  it('batch, observed: the member reads how every action ended, once for the batch', async () => {
    const s = await tools('after_action', () => observed, batch, ['call-a', 'call-b'])
    await finishTools(s.assembly, 2)
    await second(s.assembly)
    expect(s.extensions.invocations).toHaveLength(1)
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      outcomes: [{ outcome: 'executed' }, { outcome: 'executed' }],
    })
  })

  it('batch, inject: the reminder is admitted and the run goes on', async () => {
    const s = await tools('after_action', () => output(reminder('check the diff')), batch)
    await finishTools(s.assembly)
    await second(s.assembly)
    expect(
      s.assembly.controls.handoff.prepare.calls.some(
        call => call.request.kind === 'execution' && call.request.source.kind === 'reminder',
      ),
    ).toBe(true)
  })
})

describe('before_terminal', () => {
  it('observed: the candidate ends', async () => {
    const s = await plain('before_terminal', () => observed)
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      proposed: { kind: 'complete' },
    })
    expect((await loaded(s.assembly)).checkpoint.chain).toBeNull()
  })

  it('veto: the completion does not hold; the run waits and is not ended', async () => {
    const s = await plain('before_terminal', () => veto)
    const waiting = await settled(s.assembly, 'waiting')
    expect(waiting.state).toMatchObject({
      waits: [{ kind: 'dependency', owner: 'agentExtensions', position: 'I8' }],
    })
    expect(s.extensions.invocations).toHaveLength(1)
  })

  it('veto after an input was accepted for the same run: the run takes it in a new step at once, asks the model again, and ends when the next candidate is let through', async () => {
    const held: { journal: Assembly['dependencies']['journal'] | null } = { journal: null }
    let asked = 0
    const s = await plain('before_terminal', async () => {
      asked += 1
      if (asked > 1) return observed
      ok(
        await held.journal!.submit(
          withLineage({
            ...alice,
            execution: execution(),
            operation: operation('goal-continue-1'),
            value: acceptedInput('goal-continue-1', 'not done yet: A2 is open'),
          }),
        ),
      )
      return veto
    })
    held.journal = s.assembly.dependencies.journal
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    const ended = await loaded(s.assembly)
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ended.checkpoint.chain).toBeNull()
    expect(s.assembly.controls.clock.pending()).toEqual([])
    const taken = s.assembly.controls.requests.prepare.calls.map(call => call.inputs?.ordered)
    expect(taken.at(0)).toEqual(['input-exec-1'])
    expect(taken.at(-1)).toEqual(['goal-continue-1'])
    const passes = s.extensions.invocations.map(item => item.input.passage)
    expect(passes).toHaveLength(2)
    expect(new Set(passes).size).toBe(2)
  })

  it('veto before the input is accepted: the run waits, and takes the input at its next check time', async () => {
    let asked = 0
    const s = await plain('before_terminal', () => {
      asked += 1
      return asked === 1 ? veto : observed
    })
    await settled(s.assembly, 'waiting')
    ok(
      await s.assembly.dependencies.journal.submit(
        withLineage({
          ...alice,
          execution: execution(),
          operation: operation('goal-continue-1'),
          value: acceptedInput('goal-continue-1'),
        }),
      ),
    )
    await new Promise(resolve => setTimeout(resolve, 200))
    expect((await loaded(s.assembly)).state.kind).toBe('waiting')
    const [due] = s.assembly.controls.clock.pending()
    if (due === undefined) throw new Error('no check time is armed')
    ok(s.assembly.controls.clock.advanceTo(due))
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    expect(s.assembly.controls.requests.prepare.calls.at(-1)?.inputs?.ordered).toEqual([
      'goal-continue-1',
    ])
  })
})

describe('after_terminal', () => {
  it('observed: the member runs after the end, reads the terminal, and its observation is recorded', async () => {
    const s = await plain('after_terminal', () => observed)
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    await eventually(async () =>
      (await loaded(s.assembly)).terminalObservations.every(item => item.observed !== null),
    )
    const ended = await loaded(s.assembly)
    expect(ended.terminalObservations).toHaveLength(1)
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      terminal: { kind: 'complete' },
    })
  })

  it('an output other than observed is an error and changes nothing: the terminal stands', async () => {
    const s = await plain('after_terminal', () => veto, { power: 'observe' })
    expect(kinds(await eventsOf(s.handle)).at(-1)).toBe('ended')
    await eventually(async () =>
      (await loaded(s.assembly)).terminalObservations.every(item => item.observed !== null),
    )
    expect((await loaded(s.assembly)).state).toMatchObject({ conclusion: { kind: 'complete' } })
  })

  it('the enabled extensions are not readable: the pass is recorded as not observed and the execution still ends', async () => {
    const p = parts()
    p.view.enable(declare('probe', 'after_terminal'))
    p.extensions.define('probe', () => observed)
    p.view.state.unreadableAt = ['after_terminal']
    const assembly = await loopAssembly([execution()], p.wrap)
    assembly.release.open()
    expect(kinds(await eventsOf(ok(await invoke(assembly)))).at(-1)).toBe('ended')
    const ended = await loaded(assembly)
    expect(ended.checkpoint.chain).toMatchObject({ position: 'after_terminal', members: [] })
    expect(ended.checkpoint.chain?.unread).toBeDefined()
    expect(ended.terminalObservations).toEqual([])
    expect(p.extensions.invocations).toEqual([])
  })
})
