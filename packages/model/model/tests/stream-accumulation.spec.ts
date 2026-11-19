import { expect, it } from 'vitest'
import {
  applyModelStreamDelta,
  decodeDispatchId,
  type ModelBlock,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { judgePart } from '@omne-harness/message'
import {
  createModelCommandsCore,
  createModelObservationStorage,
  modelCommands,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

/** A small deterministic generator, so a failing seed can be run again as it was. */
function random(seed: number) {
  let state = seed >>> 0
  return (below: number) => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) % below) as number
  }
}

function sealedText(index: number, text: string): ModelBlock {
  const part = judgePart({
    kind: 'text',
    id: `text-${index}`,
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('fixture block')
  return part.ok
}

/** One to three text blocks in order, each appended or replaced in pieces, then the ending. */
function facts(next: (below: number) => number): TransportFact[] {
  const out: TransportFact[] = []
  const blocks = 1 + next(3)
  for (let index = 0; index < blocks; index += 1) {
    const mode = next(2) === 0 ? 'append' : 'replace'
    const at = String(index)
    out.push({ kind: 'block-open', index: at, mode, content: 'text' })
    let value = ''
    for (let piece = 0, pieces = 1 + next(4); piece < pieces; piece += 1) {
      const chunk = `b${index}p${piece}-${'x'.repeat(next(5))}`
      value = mode === 'append' ? value + chunk : chunk
      out.push(
        mode === 'append'
          ? { kind: 'block-delta', index: at, delta: chunk }
          : { kind: 'block-replace', index: at, value },
      )
    }
    out.push({ kind: 'block-seal', index: at, block: sealedText(index, value) })
  }
  out.push({ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } })
  return out
}

/** Real commands over memory with the observation source on their commits, and one dispatch open. */
async function streaming() {
  const f = fixture()
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    report: () => {},
    observation: {
      limits: {
        maxSnapshotBytes: 1_000_000,
        maxDeltaBytes: 1_000_000,
        maxQueuedFrames: 256,
        maxQueuedBytes: 10_000_000,
        maxObserversPerTenant: 4,
        maxObservers: 4,
        maxPendingSourceOperations: 4,
        maxRetainedCalls: 8,
        maxRetainedBytes: 10_000_000,
        maxTotalBytes: 50_000_000,
        maxQueueResidenceMs: 1_000_000,
        checkIntervalMs: 1_000_000,
      },
      timing: { nowMs: () => 0, waitUntil: () => new Promise(() => {}) },
    },
  })
  if (!bridge.observations) throw new Error('fixture observations')
  const commands = modelCommands(createModelCommandsCore(f.options, bridge.storage))
  const host = unbox(bridge.observations.openHost())
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(f.admit.call),
    }),
  )
  host.attach({ execution, registration: 'one' })
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: op(`write-${++serial}`),
    expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
  })
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  const access = { tenant: f.tenant, principal: f.principal }
  const current = unbox(await host.references.current({ access, reference: f.reference })).current
  if (!current) throw new Error('fixture stream')
  return {
    f,
    commands,
    host,
    write,
    dispatch,
    access,
    ref: current.ref,
    close: bridge.observations.close,
  }
}

async function readAll(s: Awaited<ReturnType<typeof streaming>>, result: string) {
  const call = { ...s.f.admit }
  const started = unbox(
    await s.commands.acquireRead({ ...call, operation: op('read'), result: result as never }),
  )
  if (started.kind !== 'started') throw new Error('read fixture')
  const blocks: ModelBlock[] = []
  let state = started.value
  for (;;) {
    if (state.kind !== 'reading') throw new Error(`read ended: ${JSON.stringify(state)}`)
    for (const part of state.page.parts) if (part.kind === 'sealed') blocks.push(part.block)
    if (state.page.next === null) break
    state = unbox(
      await s.commands.nextRead({ ...call, read: started.read, after: state.page.next }),
    )
  }
  return blocks
}

it.each(Array.from({ length: 12 }, (_, seed) => seed + 1))(
  'the observed snapshot with every delta applied in turn equals the read result, block for block (seed %i, C11)',
  async seed => {
    const next = random(seed)
    const s = await streaming()
    const frames: unknown[] = []
    const stop = new AbortController()
    const observed = (async () => {
      for await (const frame of s.host.observation.observe({
        ref: s.ref,
        access: s.access,
        signal: stop.signal,
      }))
        frames.push(frame)
    })()
    const all = facts(next)
    for (let at = 0; at < all.length;) {
      const size = 1 + next(4)
      const window = `window-${at}`
      unbox(
        await s.commands.openReceiveWindow({ ...(await s.write()), dispatch: s.dispatch, window }),
      )
      unbox(
        await s.commands.preserve({
          ...(await s.write()),
          dispatch: s.dispatch,
          window,
          facts: all.slice(at, at + size),
        }),
      )
      at += size
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
    }
    const settlement = unbox(
      await s.commands.settle({
        ...(await s.write()),
        termination: { kind: 'completed', reason: 'stop' },
      }),
    )
    for (let turn = 0; turn < 50; turn += 1) await Promise.resolve()
    stop.abort()
    await observed.catch(() => {})

    const [first, ...rest] = frames as { kind: string; value: unknown }[]
    if (first?.kind !== 'snapshot') throw new Error('the first frame is not the snapshot')
    expect(rest.filter(frame => frame.kind === 'delta').length).toBeGreaterThan(1)
    let snapshot = first.value as ModelStreamSnapshot
    expect(snapshot.value.blocks).toEqual([])
    for (const frame of rest) {
      if (frame.kind !== 'delta') continue
      snapshot = unbox(
        applyModelStreamDelta({
          tenant: s.f.tenant,
          before: snapshot,
          delta: frame.value as never,
        }),
      )
    }
    const accumulated = snapshot.value.blocks.flatMap(block =>
      block.kind === 'sealed' ? [block.block] : [],
    )
    expect(snapshot.value.blocks.every(block => block.kind === 'sealed')).toBe(true)
    expect(accumulated).toEqual(await readAll(s, settlement.version))
    expect(accumulated.length).toBeGreaterThan(0)
    s.close()
  },
)
