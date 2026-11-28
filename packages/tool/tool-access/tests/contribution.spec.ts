import { describe, expect, it } from 'vitest'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolFailure, ToolState, ToolStreamSelection } from '@omne-harness/tool-contract'
import { createToolAccessContribution } from '@omne-harness/tool-access'
import type { ToolCallFaces, ToolCallPrincipals } from '@omne-harness/tool-access'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!parsed.ok) throw new Error('fixture tenant did not parse')
const tenant: TenantId = parsed.value
const login = { login: 'a' } as unknown as LoginIdentity
const principal = { principal: 'a' } as unknown as Principal
const reference = 'tool-invocation:v1:call:admission'
const signal = new AbortController().signal

const running = {
  phase: 'running',
  relation: 'background',
  effect: { kind: 'unknown' },
  controls: [{ operation: 'top_1', intent: { kind: 'stop' }, progress: { kind: 'accepted' } }],
} as unknown as ToolState
const settled = {
  phase: 'settled',
  relation: 'background',
  result: 'tres_1',
  terminal: { kind: 'failed', cause: 'exit', diagnostic: 'code 2' },
  effect: { kind: 'occurred' },
  controls: [],
} as unknown as ToolState
const runningView = {
  phase: 'running',
  relation: 'background',
  result: null,
  terminal: null,
  effect: 'unknown',
  controls: [{ operation: 'top_1', intent: 'stop', progress: 'accepted' }],
}

type Scripted = Readonly<{
  acting?: Awaited<ReturnType<ToolCallPrincipals['actingFor']>> | 'throw'
  current?: Awaited<ReturnType<ToolCallFaces['instances']['current']>> | 'throw'
  result?: Awaited<ReturnType<ToolCallFaces['queries']['readResult']>> | 'throw'
  output?: Awaited<ReturnType<ToolCallFaces['queries']['readOutput']>> | 'throw'
  frames?: readonly unknown[]
  source?: AsyncIterable<unknown>
  faces?: 'absent'
}>

function world(script: Scripted = {}) {
  const calls: { kind: string; input: unknown }[] = []
  const answer = <T>(value: T | 'throw' | undefined, fallback: T): Promise<T> =>
    value === 'throw' ? Promise.reject(new Error('down')) : Promise.resolve(value ?? fallback)
  const faces: ToolCallFaces = {
    queries: {
      readResult: input => {
        calls.push({ kind: 'result', input })
        return answer(script.result, fail({ kind: 'invalid', field: 'result', reason: 'none' }))
      },
      readOutput: input => {
        calls.push({ kind: 'output', input })
        return answer(script.output, succeed({ kind: 'none' as const }))
      },
    },
    instances: {
      current: input => {
        calls.push({ kind: 'current', input })
        return answer(script.current, succeed({ state: running, current: null }))
      },
    },
    children: () => undefined,
    observation: {
      observe: input => {
        calls.push({ kind: 'observe', input })
        if (script.source !== undefined) return script.source as never
        const frames = script.frames ?? []
        return (async function* () {
          yield* frames as never[]
        })()
      },
    },
  }
  const contribution = createToolAccessContribution({
    faces: () => (script.faces === 'absent' ? undefined : faces),
    principals: {
      actingFor: (actor, tenantText) => {
        calls.push({ kind: 'acting', input: { actor, tenantText } })
        return answer(script.acting, { ok: principal })
      },
    },
  })
  const context = { principal: login, messageId: 'm1', revision: 1, signal }
  return {
    calls,
    readCall: () => contribution.operations['read-call'](context, { tenant, reference }),
    readResult: () =>
      contribution.operations['read-call-result'](context, {
        tenant,
        reference,
        result: 'tres_1',
        cursor: 'page-2',
      }),
    readOutput: (after: string | null = null) =>
      contribution.operations['read-call-output'](context, { tenant, reference, after }),
    observe: () => contribution.observations['observe-call'](context, { tenant, reference }),
  }
}

const denials: readonly ToolFailure[] = [
  {
    kind: 'invalid',
    field: 'reference',
    reason: 'the admission of the reference was not accepted',
  },
  { kind: 'invalid', field: 'reference', reason: 'type' },
  { kind: 'denied', action: 'lookup' },
  { kind: 'not-found', target: 'result', reason: 'released' },
]

async function drain(opened: Awaited<ReturnType<ReturnType<typeof world>['observe']>>) {
  if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
  const frames: unknown[] = []
  for (;;) {
    const step = await opened.frames.next()
    if (step.done === true) return { frames, end: step.value }
    frames.push(step.value)
  }
}

describe('acting for the tenant and the faces come first', () => {
  it.each([
    ['denied', { refused: 'denied' }, 'denied'],
    ['basis-unavailable', { refused: 'basis-unavailable' }, 'basis-unavailable'],
    ['a throw', 'throw', 'basis-unavailable'],
  ] as const)(
    'a refusal of acting (%s) answers before Tool is asked',
    async (_, acting, outcome) => {
      const w = world({ acting })
      expect(await w.readCall()).toEqual({ outcome })
      expect(await w.readResult()).toEqual({ outcome })
      expect(await w.observe()).toEqual({ outcome })
      expect(w.calls.map(call => call.kind)).toEqual(['acting', 'acting', 'acting'])
    },
  )

  it('acts with the text of the body tenant and reads without faces as basis-unavailable', async () => {
    const w = world({ faces: 'absent' })
    expect(await w.readCall()).toEqual({ outcome: 'basis-unavailable' })
    expect(await w.observe()).toEqual({ outcome: 'basis-unavailable' })
    const encoded = tenantCodec.encode(tenant)
    expect(w.calls[0]).toEqual({
      kind: 'acting',
      input: { actor: login, tenantText: encoded.ok ? encoded.value : null },
    })
  })
})

describe('read-call', () => {
  it('reads the state of the reference with the issued principal and the body tenant', async () => {
    const w = world()
    expect(await w.readCall()).toEqual({ outcome: 'succeeded', body: { call: runningView } })
    expect(w.calls[1]).toEqual({
      kind: 'current',
      input: { access: { principal, tenant }, reference },
    })
  })

  it('answers a settled call with its result, its terminal and its effect', async () => {
    const w = world({ current: succeed({ state: settled, current: null }) })
    expect(await w.readCall()).toEqual({
      outcome: 'succeeded',
      body: {
        call: {
          phase: 'settled',
          relation: 'background',
          result: 'tres_1',
          terminal: { kind: 'failed', detail: 'exit: code 2' },
          effect: 'occurred',
          controls: [],
        },
      },
    })
  })

  it('answers every refusal of Tool with the same bytes: not accepted, unparsable, unqualified, released', async () => {
    const answers = await Promise.all(
      denials.map(failure => world({ current: fail(failure) }).readCall()),
    )
    expect(new Set(answers.map(answer => JSON.stringify(answer)))).toEqual(
      new Set([JSON.stringify({ outcome: 'denied' })]),
    )
  })

  it.each([
    ['unavailable', fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' })],
    ['stale-instance', fail({ kind: 'stale-instance', instance: 'i1' as never })],
    ['a throw', 'throw'],
  ] as const)('answers %s of the read as basis-unavailable', async (_, current) => {
    expect(await world({ current: current as never }).readCall()).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('read-call-result', () => {
  it('reads the named result after the cursor and keeps only the blocks meant for people', async () => {
    const block = (text: string, toHuman: boolean) => ({
      kind: 'text',
      text,
      visibility: { toHuman, toModel: true },
    })
    const page = {
      result: 'tres_1',
      terminal: { kind: 'completed' },
      effect: { kind: 'not-occurred' },
      value: { content: [block('shown', true), block('hidden', false)] },
      next: 'page-3',
    }
    const w = world({ result: succeed(page) as never })
    expect(await w.readResult()).toEqual({
      outcome: 'succeeded',
      body: {
        result: 'tres_1',
        terminal: { kind: 'completed', detail: null },
        effect: 'not-occurred',
        content: {
          kind: 'array',
          items: [
            {
              kind: 'object',
              entries: [
                { key: 'kind', value: { kind: 'string', value: 'text' } },
                { key: 'text', value: { kind: 'string', value: 'shown' } },
                {
                  key: 'visibility',
                  value: {
                    kind: 'object',
                    entries: [
                      { key: 'toHuman', value: { kind: 'boolean', value: true } },
                      { key: 'toModel', value: { kind: 'boolean', value: true } },
                    ],
                  },
                },
              ],
            },
          ],
        },
        next: 'page-3',
      },
    })
    expect(w.calls[1]).toEqual({
      kind: 'result',
      input: { principal, tenant, reference, result: 'tres_1', after: 'page-2' },
    })
  })

  it('answers the refusals of Tool as denied and its absence as basis-unavailable', async () => {
    for (const failure of denials)
      expect(await world({ result: fail(failure) }).readResult()).toEqual({ outcome: 'denied' })
    expect(await world({ result: 'throw' }).readResult()).toEqual({ outcome: 'basis-unavailable' })
    expect(
      await world({
        result: fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' }),
      }).readResult(),
    ).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('read-call-output (C12)', () => {
  it('reads the output body after the position with the issued principal and a bounded part', async () => {
    const part = { kind: 'open' as const, from: '6', through: '11', total: '11', text: 'world' }
    const w = world({ output: succeed(part) })
    expect(await w.readOutput('6')).toEqual({ outcome: 'succeeded', body: part })
    expect(w.calls.at(-1)).toEqual({
      kind: 'output',
      input: { principal, tenant, reference, after: '6', maxBytes: 32_768 },
    })
    expect(await world().readOutput()).toEqual({ outcome: 'succeeded', body: { kind: 'none' } })
  })

  it('answers every refusal of Tool with the same bytes, and its absence as basis-unavailable', async () => {
    const answers = await Promise.all(
      [...denials, { kind: 'not-found', target: 'body', reason: 'expired' } as const].map(
        async failure => JSON.stringify(await world({ output: fail(failure) }).readOutput()),
      ),
    )
    expect(new Set(answers)).toEqual(new Set([JSON.stringify({ outcome: 'denied' })]))
    expect(await world({ output: 'throw' }).readOutput()).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(await world({ acting: { refused: 'denied' } }).readOutput()).toEqual({
      outcome: 'denied',
    })
  })
})

describe('observe-call', () => {
  const live = (frames: readonly unknown[], source?: AsyncIterable<unknown>) =>
    world({
      ...(source === undefined ? {} : { source }),
      current: succeed({
        state: running,
        current: {
          ref: 'stream-1',
          instance: 'i1',
          generation: 'g1',
          projection: 'tool-process-v1',
        },
      } as unknown as ToolStreamSelection),
      frames,
    })

  it('answers a call with no live stream with one snapshot of its state, then closed', async () => {
    const w = world()
    expect(await drain(await w.observe())).toEqual({
      frames: [{ kind: 'snapshot', call: runningView, process: { kind: 'array', items: [] } }],
      end: 'closed',
    })
    expect(w.calls.map(call => call.kind)).toEqual(['acting', 'current'])
  })

  it('observes the live stream with the principal and the signal, and maps each frame', async () => {
    const block = {
      index: '0',
      mode: 'append',
      state: 'open',
      sequence: '1',
      content: null,
      trim: null,
    }
    const w = live([
      { kind: 'snapshot', cursor: 'c1', value: { state: running, process: [], foreground: null } },
      { kind: 'delta', from: 'c1', cursor: 'c2', value: { state: running, blocks: [block] } },
      { kind: 'gap', after: 'c2', reason: 'buffer' },
    ])
    const drained = await drain(await w.observe())
    expect(drained.frames.map(frame => (frame as { kind: string }).kind)).toEqual([
      'snapshot',
      'delta',
      'gap',
    ])
    const text = (value: string) => ({ kind: 'string', value })
    expect(drained.frames[1]).toEqual({
      kind: 'delta',
      call: runningView,
      process: {
        kind: 'array',
        items: [
          {
            kind: 'object',
            entries: [
              { key: 'index', value: text('0') },
              { key: 'mode', value: text('append') },
              { key: 'state', value: text('open') },
              { key: 'sequence', value: text('1') },
              { key: 'content', value: { kind: 'null' } },
              { key: 'trim', value: { kind: 'null' } },
            ],
          },
        ],
      },
    })
    expect(drained.end).toBe('closed')
    expect(w.calls[2]).toEqual({
      kind: 'observe',
      input: { ref: 'stream-1', access: { principal, tenant }, signal },
    })
  })

  it.each([
    [
      { kind: 'ended', reason: 'producer-ended', value: { reason: 'stale-instance' } },
      'stale-instance',
    ],
    [{ kind: 'ended', reason: 'producer-ended', value: { reason: 'closed' } }, 'closed'],
    [{ kind: 'ended', reason: 'source-closed' }, 'closed'],
    [{ kind: 'ended', reason: 'observer-closed' }, 'closed'],
    [{ kind: 'ended', reason: 'stale-stream' }, 'stale-instance'],
    [{ kind: 'ended', reason: 'denied' }, 'denied'],
    [{ kind: 'ended', reason: 'unavailable' }, 'unavailable'],
    [{ kind: 'ended', reason: 'capacity' }, 'unavailable'],
  ] as const)('ends %o as %s', async (frame, end) => {
    expect(await drain(await live([frame]).observe())).toEqual({ frames: [], end })
  })

  it('closes the Tool stream when the client stops reading', async () => {
    let closed = 0
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: { kind: 'gap', after: null, reason: 'buffer' } }),
        return: async () => {
          closed += 1
          return { done: true, value: undefined }
        },
      }),
    }
    const opened = await live([], source).observe()
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    expect((await opened.frames.next()).value).toEqual({ kind: 'gap' })
    await opened.frames.return('closed')
    expect(closed).toBe(1)
  })

  it('ends closed on a Tool stream whose iterator has no return', async () => {
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
    }
    expect(await drain(await live([], source).observe())).toEqual({ frames: [], end: 'closed' })
  })

  it('opens with the same refusals as read-call', async () => {
    for (const failure of denials)
      expect(await world({ current: fail(failure) }).observe()).toEqual({ outcome: 'denied' })
    expect(await world({ current: 'throw' }).observe()).toEqual({ outcome: 'basis-unavailable' })
  })
})
