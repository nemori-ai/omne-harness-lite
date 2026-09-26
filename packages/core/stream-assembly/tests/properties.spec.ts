import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { judgeContentBlock, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { accept } from '../src/index.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical } from './helpers.ts'

const model = { kind: 'model_call', callId: 'mc_property', dispatch: 1 }
const tool = { kind: 'tool_execution', callId: 'tool_property' }
function initial(target: unknown): AssemblyState {
  const result = start(target)
  if ('rejected' in result) throw new Error('bad generator target')
  return result.ok
}
function accepted(state: AssemblyState, event: unknown): AssemblyState {
  const result = accept(state, event)
  if ('rejected' in result) throw new Error(`bad generated event: ${result.rejected}`)
  return result.ok
}
function settled(state: AssemblyState) {
  const result = closeOut(state)
  if ('rejected' in result) throw new Error('generator did not finish')
  return result.ok
}
function generator(seed: number) {
  let value = seed >>> 0
  return (limit: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return (value >>> 8) % limit
  }
}
function parts<Value>(
  values: readonly Value[],
  draw: (limit: number) => number,
): readonly (readonly Value[])[] {
  const result: Value[][] = []
  for (let offset = 0; offset < values.length;) {
    const length = 1 + draw(Math.min(values.length - offset, 11))
    result.push(values.slice(offset, offset + length))
    offset += length
  }
  return result
}

describe('V-3 fixed-seed independent partition, byte and trim oracles', () => {
  it.each(Array.from({ length: 32 }, (_, seed) => seed + 0x51a100))(
    'PROP-TEXT-%i split/interleaved/merged text has the same settled blocks',
    seed => {
      const draw = generator(seed)
      const alphabet = Array.from('a中🙂\nβ')
      const text = Array.from(
        { length: 40 + draw(80) },
        () => alphabet[draw(alphabet.length)] ?? 'a',
      ).join('')
      const chunks = parts(Array.from(text), draw).map(chunk => chunk.join(''))
      const opened = {
        t: 'open',
        index: 3,
        kind: 'text',
        fill: 'append',
        id: 'text',
        visibility: { toHuman: true, toModel: true },
      }
      let split = accepted(initial(model), opened)
      const other = { ...opened, index: 30, id: 'other' }
      split = accepted(split, other)
      const old = snapshot(split)
      for (const chunk of chunks) {
        split = accepted(split, { t: 'fill', index: 3, payload: chunk })
        split = accepted(split, { t: 'fill', index: 30, payload: '#' })
      }
      split = accepted(split, { t: 'trim', index: 3, reason: 'rate_merged', merged: chunks.length })
      split = accepted(split, { t: 'finish', reason: 'end' })
      let whole = accepted(initial(model), opened)
      whole = accepted(whole, { t: 'fill', index: 3, payload: text })
      whole = accepted(whole, other)
      whole = accepted(whole, { t: 'fill', index: 30, payload: '#'.repeat(chunks.length) })
      whole = accepted(whole, { t: 'finish', reason: 'end' })
      expect(canonical(settled(split).blocks)).toEqual(canonical(settled(whole).blocks))
      expect(settled(split).blocks[0]).toMatchObject({ text })
      expect(Object.hasOwn(old.blocks[0] ?? {}, 'content')).toBe(false)
    },
  )
  it.each(Array.from({ length: 32 }, (_, seed) => seed + 0x51b200))(
    'PROP-VOICE-%i concatenates decoded bytes across independent base64 padding boundaries',
    seed => {
      const draw = generator(seed)
      const bytes = Array.from({ length: 1 + draw(100) }, () => draw(256))
      const chunks = parts(bytes, draw)
      let state = accepted(initial(model), {
        t: 'open',
        index: 100,
        kind: 'voice',
        fill: 'append',
        id: 'voice',
        visibility: { toHuman: true, toModel: true },
        head: { mediaType: 'audio/wav' },
      })
      for (const chunk of chunks)
        state = accepted(state, {
          t: 'fill',
          index: 100,
          payload: Buffer.from(chunk).toString('base64'),
        })
      const view = snapshot(state)
      expect(view.blocks[0]).toMatchObject({ content: Buffer.from(bytes).toString('base64') })
      state = accepted(state, { t: 'finish', reason: 'lost' })
      expect(settled(state).blocks[0]).toMatchObject({
        kind: 'voice',
        mediaType: 'audio/wav',
        data: { inline: Buffer.from(bytes).toString('base64') },
      })
    },
  )
  it.each(Array.from({ length: 32 }, (_, seed) => seed + 0x51c300))(
    'PROP-TRIM-%i incremental accounting equals independent whole-sequence formulas',
    seed => {
      const draw = generator(seed)
      const events: { t: string; reason?: string; merged?: number; omittedBytes?: number }[] = []
      let state = initial(tool)
      const send = (event: {
        t: string
        reason?: string
        merged?: number
        omittedBytes?: number
        [key: string]: unknown
      }) => {
        state = accepted(state, event)
        events.push(event)
      }
      send({
        t: 'open',
        index: 7,
        kind: 'text',
        fill: 'append',
        id: 'log',
        visibility: { toHuman: true, toModel: false },
      })
      for (let item = 0; item < 30; item++) {
        switch (draw(4)) {
          case 0:
            send({ t: 'trim', index: 7, reason: 'rate_merged', merged: 1 + draw(4) })
            break
          case 1:
            send({ t: 'trim', reason: 'quota_exhausted', omittedBytes: draw(128) })
            break
          case 2:
            send({ t: 'trim', reason: 'rejected', omittedBytes: draw(128) })
            break
          case 3: {
            send({ t: 'trim', index: 7, reason: 'frame_too_long', omittedBytes: 1 + draw(512) })
            if (draw(2) === 0) send({ t: 'fill', index: 7, payload: 'delivered' })
            else {
              const before = canonical(snapshot(state))
              expect(accept(state, { t: 'fill', index: 99, payload: 'rejected' })).toEqual({
                rejected: 'block_not_open',
              })
              expect(canonical(snapshot(state))).toEqual(before)
              send({ t: 'trim', reason: 'rejected', omittedBytes: draw(32) })
            }
          }
        }
      }
      send({ t: 'finish', reason: 'end' })
      const result = settled(state)
      if (!('frames' in result.account)) throw new Error('tool account expected')
      const merged = events
        .filter(event => event.reason === 'rate_merged')
        .reduce((sum, event) => sum + (event.merged ?? 0), 0)
      const quota = events.filter(event => event.reason === 'quota_exhausted').length
      const rejected = events.filter(event => event.reason === 'rejected').length
      const long = events.filter(
        (event, index) =>
          event.reason === 'frame_too_long' &&
          !(events[index + 1]?.t === 'trim' && events[index + 1]?.reason === 'rejected'),
      ).length
      const omitted = events
        .filter(event => event.t === 'trim' && event.reason !== 'rate_merged')
        .reduce((sum, event) => sum + (event.omittedBytes ?? 0), 0)
      const frames =
        events.filter(event => ['open', 'fill', 'close'].includes(event.t)).length +
        merged +
        quota +
        rejected
      expect(canonical(result.account.frames)).toEqual(
        canonical({
          emitted: frames,
          trims: {
            merged,
            cut: quota + rejected,
            omittedBytes: omitted,
            byReason: {
              rate_merged: merged,
              frame_too_long: long,
              quota_exhausted: quota,
              rejected,
            },
          },
        }),
      )
      expect(judgeAccountValue('FrameAccount', result.account.frames)).toEqual({ ok: true })
    },
  )
  it.each(Array.from({ length: 32 }, (_, seed) => seed + 0x51d400))(
    'PROP-TOOL-%i raw UTF-16 splits, merge and replace-last yield the same parsed call without rounding',
    seed => {
      const draw = generator(seed)
      const label = `中🙂β-${draw(10000)}`
      const raw = `{"label":"${label}","exact":9007199254740993,"fraction":0.1234567890123456789}`
      // String.split intentionally includes boundaries between UTF-16 surrogate code units.
      const chunks = parts(raw.split(''), draw).map(chunk => chunk.join(''))
      const opened = {
        t: 'open',
        index: 0,
        kind: 'tool_call',
        fill: 'append',
        id: 'call-block',
        visibility: { toHuman: true, toModel: true },
        head: { callId: 'call-property', tool: 'ns__probe' },
      }
      let split = accepted(initial(model), opened)
      for (const chunk of chunks) split = accepted(split, { t: 'fill', index: 0, payload: chunk })
      expect(snapshot(split).blocks[0]).toMatchObject({ closed: false, content: raw })
      split = accepted(split, { t: 'trim', index: 0, reason: 'rate_merged', merged: chunks.length })
      split = accepted(split, { t: 'close', index: 0 })
      split = accepted(split, { t: 'finish', reason: 'end' })
      let replacement = accepted(initial(model), { ...opened, fill: 'replace' })
      replacement = accepted(replacement, { t: 'fill', index: 0, payload: '{invalid old text' })
      replacement = accepted(replacement, { t: 'fill', index: 0, payload: raw })
      replacement = accepted(replacement, { t: 'close', index: 0 })
      replacement = accepted(replacement, { t: 'finish', reason: 'end' })
      expect(canonical(settled(split).blocks)).toEqual(canonical(settled(replacement).blocks))
      const block = settled(split).blocks[0]
      if (block?.kind !== 'tool_call' || !block.complete || 'unparseable' in block)
        throw new Error('legal generated call not parsed')
      expect('ok' in judgeContentBlock(block)).toBe(true)
      expect(writeJsonLossless(block.arguments)).toBe(raw)
    },
  )
  it('PROP-FORK keeps retained states and snapshots unchanged after branching and replacements', () => {
    let state = accepted(initial(model), {
      t: 'open',
      index: 1,
      kind: 'text',
      fill: 'replace',
      id: 'panel',
      visibility: { toHuman: true, toModel: true },
    })
    const retained: {
      state: AssemblyState
      view: ReturnType<typeof snapshot>
      expected: unknown
    }[] = []
    for (let item = 0; item < 64; item++) {
      state = accepted(state, { t: 'fill', index: 1, payload: `step-${item}` })
      const view = snapshot(state)
      retained.push({ state, view, expected: canonical(view) })
    }
    for (const old of retained) {
      const fork = accepted(old.state, { t: 'fill', index: 1, payload: 'fork' })
      expect(snapshot(fork).blocks[0]).toMatchObject({ content: 'fork' })
      expect(canonical(old.view)).toEqual(old.expected)
      expect(canonical(snapshot(old.state))).toEqual(old.expected)
      expect(() =>
        Object.defineProperty(old.view.blocks[0], 'content', { value: 'mutated' }),
      ).toThrow()
    }
  })
})
