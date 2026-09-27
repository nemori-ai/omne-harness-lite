import { expect, it } from 'vitest'
import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ownEvent, ownTarget } from '../src/values.ts'

it('VALUES-01 copies and validates targets without a session or target registry', () => {
  const raw = { kind: 'model_call', callId: 'mc_1', dispatch: 1 }
  const target = ownTarget(raw)
  expect(target).toBeDefined()
  expect(target).not.toBe(raw)
  expect(Object.isFrozen(target)).toBe(true)
  expect(ownTarget({ kind: 'model_call', callId: 'mc_1' })).toBeUndefined()
})

it('VALUES-02 establishes authoritative opaque wrappers instead of pretending a JSON copy is a typed block', () => {
  const raw = {
    t: 'close',
    index: 0,
    block: {
      kind: 'thinking',
      id: 'b',
      visibility: { toHuman: true, toModel: true },
      text: '',
      opaque: { opaque: ['raw'] },
    },
  }
  expect(
    judgeArrivalEnvelope({ target: { kind: 'model_call', callId: 'mc', dispatch: 1 }, event: raw }),
  ).toHaveProperty('ok')
  const owned = ownEvent(raw)
  if (owned.t !== 'close' || owned.block?.kind !== 'thinking' || owned.block.opaque === undefined)
    throw new Error('fixture narrowing failed')
  expect(writeJsonLossless(readOpaqueJson(owned.block.opaque))).toBe('{"opaque":["raw"]}')
  raw.block.opaque.opaque.push('later')
  expect(writeJsonLossless(readOpaqueJson(owned.block.opaque))).toBe('{"opaque":["raw"]}')
  expect(Object.isFrozen(owned.block)).toBe(true)
})

it('VALUES-03 normalizes nested result thinking blocks through the CB domain producer', () => {
  const owned = ownEvent({
    t: 'fill',
    index: 0,
    payload: {
      kind: 'tool_result',
      id: 'r',
      callId: 'c',
      visibility: { toHuman: true, toModel: true },
      outcome: 'completed',
      blocks: [
        {
          kind: 'thinking',
          id: 'nested',
          visibility: { toHuman: false, toModel: false },
          text: '',
          opaque: [1],
        },
      ],
    },
  })
  if (
    owned.t !== 'fill' ||
    typeof owned.payload === 'string' ||
    owned.payload.kind !== 'tool_result'
  )
    throw new Error('fixture invalid')
  const nested = owned.payload.blocks[0]
  if (nested?.kind !== 'thinking' || nested.opaque === undefined) throw new Error('fixture invalid')
  expect(writeJsonLossless(readOpaqueJson(nested.opaque))).toBe('[1]')
  expect(Object.isFrozen(owned.payload.blocks)).toBe(true)
})
