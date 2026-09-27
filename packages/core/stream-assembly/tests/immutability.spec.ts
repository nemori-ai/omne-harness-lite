import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { accept } from '../src/index.ts'
import { start, snapshot, closeOut } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical } from './helpers.ts'

function initial(): AssemblyState {
  const result = start({ kind: 'model_call', callId: 'mc_owned', dispatch: 1 })
  if ('rejected' in result) throw new Error('bad fixture target')
  return result.ok
}
function step(state: AssemblyState, event: unknown): AssemblyState {
  const result = accept(state, event)
  if ('rejected' in result) throw new Error(`bad fixture event ${result.rejected}`)
  return result.ok
}
function settle(state: AssemblyState) {
  const result = closeOut(state)
  if ('rejected' in result) throw new Error('fixture unfinished')
  return result.ok
}

describe('S-4/S-7/SC-4 owns frozen values across raw callers and readers', () => {
  it('OWNED-OPEN copies nested opening facts and forbids writes through snapshots', () => {
    const raw = {
      t: 'open',
      index: 0,
      kind: 'text',
      fill: 'append',
      id: 'b',
      visibility: { toHuman: true, toModel: true },
      head: { mediaType: 'text/plain' },
    }
    const state = step(initial(), raw)
    const before = snapshot(state)
    raw.visibility.toHuman = false
    raw.head.mediaType = 'image/png'
    expect(before.blocks[0]).toMatchObject({
      opened: { visibility: { toHuman: true, toModel: true }, head: { mediaType: 'text/plain' } },
    })
    const item = before.blocks[0]
    if (item === undefined || item.closed) throw new Error('opening not in snapshot')
    expect(() =>
      Object.defineProperty(item.opened.visibility, 'toModel', { value: false }),
    ).toThrow()
    expect(() =>
      Object.defineProperty(item.opened.head, 'mediaType', { value: 'image/png' }),
    ).toThrow()
    const after = step(state, { t: 'fill', index: 0, payload: 'real text' })
    expect(canonical(snapshot(state))).toEqual(canonical(before))
    expect(snapshot(after).blocks[0]).toMatchObject({ content: 'real text' })
  })
  it('OWNED-REPLACE owns whole-block attachments and keeps old snapshots after another replacement', () => {
    let state = step(initial(), {
      t: 'open',
      index: 8,
      kind: 'file',
      fill: 'replace',
      id: 'f',
      visibility: { toHuman: true, toModel: true },
    })
    const raw = {
      kind: 'file',
      id: 'f',
      visibility: { toHuman: true, toModel: true },
      attachment: {
        storage: 'attachments',
        key: 'first',
        mediaType: 'application/pdf',
        bytes: new LosslessNumber('9007199254740993'),
      },
    }
    state = step(state, { t: 'fill', index: 8, payload: raw })
    const before = snapshot(state)
    raw.attachment.key = 'second'
    const changed = step(state, { t: 'fill', index: 8, payload: raw })
    expect(before.blocks[0]).toMatchObject({ content: { attachment: { key: 'first' } } })
    expect(snapshot(changed).blocks[0]).toMatchObject({
      content: { attachment: { key: 'second' } },
    })
    const item = before.blocks[0]
    if (
      item === undefined ||
      item.closed ||
      typeof item.content === 'string' ||
      item.content?.kind !== 'file'
    )
      throw new Error('file content missing')
    const attachment = item.content.attachment
    expect(() => Object.defineProperty(attachment, 'key', { value: 'mutated' })).toThrow()
    expect(canonical(snapshot(state))).toEqual(canonical(before))
  })
  it('OWNED-OPAQUE transports nulls, nesting and exact numbers without changing the opaque wrapper into business data', () => {
    let state = step(initial(), {
      t: 'open',
      index: 0,
      kind: 'thinking',
      fill: 'append',
      id: 'thought',
      visibility: { toHuman: true, toModel: true },
    })
    const raw = {
      kind: 'thinking',
      id: 'thought',
      visibility: { toHuman: true, toModel: true },
      text: '',
      opaque: { explicitNull: null, nested: [{ n: new LosslessNumber('1e400') }] },
    }
    state = step(state, { t: 'close', index: 0, block: raw })
    const before = snapshot(state)
    raw.opaque.nested.push({ n: new LosslessNumber('2') })
    state = step(state, { t: 'finish', reason: 'lost' })
    const block = settle(state).blocks[0]
    if (block?.kind !== 'thinking' || block.opaque === undefined)
      throw new Error('opaque block missing')
    // Only this transport verification crosses the explicit opaque read boundary.
    expect(writeJsonLossless(readOpaqueJson(block.opaque))).toBe(
      '{"explicitNull":null,"nested":[{"n":1e400}]}',
    )
    expect(Object.isFrozen(block.opaque)).toBe(true)
    expect(Object.isFrozen(readOpaqueJson(block.opaque))).toBe(true)
    expect(Object.hasOwn(settle(state).ending, 'firstContentAt')).toBe(false)
    expect(writeJsonLossless(before)).toContain('"nested":[{"n":1e400}]')
  })
  it('OWNED-ACCOUNT reported usage, cost and finish error remain original owned values', () => {
    const account = {
      t: 'account',
      usage: {
        input_tokens: new LosslessNumber('9007199254740993'),
        output_tokens: 4,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      },
      cost: { cost_usd: new LosslessNumber('0.1234567890123456789'), source: 'upstream_usage' },
    }
    let state = step(initial(), account)
    const error = {
      cause: 'request_rejected',
      statusCode: new LosslessNumber('429.0'),
      inBand: true,
    }
    state = step(state, { t: 'finish', reason: 'lost', error })
    account.usage.output_tokens = 99
    account.cost.source = 'none'
    error.cause = 'unrecognized'
    const result = settle(state)
    expect(writeJsonLossless(result)).toContain('"output_tokens":4')
    expect(writeJsonLossless(result)).toContain('"input_tokens":9007199254740993')
    expect(writeJsonLossless(result)).toContain('"cost_usd":0.1234567890123456789')
    expect(writeJsonLossless(result.ending)).toContain('"cause":"request_rejected"')
    const ownedAccount = result.account
    if ('frames' in ownedAccount) throw new Error('model account expected')
    expect(() =>
      Object.defineProperty(ownedAccount.usage, 'output_tokens', { value: 99 }),
    ).toThrow()
    expect(() =>
      Object.defineProperty(ownedAccount.trims.byReason, 'rejected', { value: 99 }),
    ).toThrow()
    expect(() => Object.defineProperty(result.ending, 'reason', { value: 'end' })).toThrow()
  })
})
