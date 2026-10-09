import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeMessageInLog,
  judgePairing,
  judgeCompactionList,
  isReadable,
} from '@omne-harness-lite/messages'
import { accepted, logged, compact, ref, text, at, assistant, tool, finished } from './helpers.ts'

describe('V4 pairing S32 ①–⑦', () => {
  const call = logged(assistant('call1'))
  it('unique ids use exact spelling and ignore timestamps', () => {
    const one = logged({ id: 'same', type: 'user', blocks: [], createdAt: at })
    expect(judgePairing(one, [one])).toEqual({ valid: false, rule: 1 })
    expect(
      judgePairing(logged({ ...one, id: 'Same', createdAt: '2000-01-01T00:00:00Z' }), [one]),
    ).toEqual({ valid: true })
  })
  it('tool results require an earlier complete top-level call and at most one result', () => {
    const result = logged(tool('call1'))
    expect(judgePairing(result, [])).toEqual({ valid: false, rule: 2 })
    expect(judgePairing(result, [logged(assistant('call1', 'half', false))])).toEqual({
      valid: false,
      rule: 2,
    })
    expect(judgePairing(result, [call])).toEqual({ valid: true })
    expect(judgePairing(logged(tool('call1', 'completed', 'second')), [call, result])).toEqual({
      valid: false,
      rule: 2,
    })
  })
  it('internal and result tracks are independent and each internal track is unique', () => {
    const process = logged({
      id: 'internal',
      type: 'tool_internal',
      callId: 'call1',
      ending: 'lost',
      blocks: [text('frame', false)],
      createdAt: at,
    })
    expect(judgePairing(process, [])).toEqual({ valid: false, rule: 3 })
    expect(judgePairing(process, [call, logged(tool('call1'))])).toEqual({ valid: true })
    expect(judgePairing(logged({ ...process, id: 'internal2' }), [call, process])).toEqual({
      valid: false,
      rule: 3,
    })
  })
  it('both background ending kinds jointly require a preceding background placeholder', () => {
    const ending = logged(finished('call1'))
    const placeholder = logged(
      tool('call1', 'backgrounded', 'placeholder', { code: 'backgrounded_auto', text: 'running' }),
    )
    expect(judgePairing(ending, [call])).toEqual({ valid: false, rule: 4 })
    expect(judgePairing(ending, [call, logged(tool('call1'))])).toEqual({ valid: false, rule: 4 })
    expect(judgePairing(ending, [call, placeholder])).toEqual({ valid: true })
    expect(
      judgePairing(logged(finished('call1', 'ending2', true)), [call, placeholder, ending]),
    ).toEqual({ valid: false, rule: 4 })
  })
  it('one response has at most one assistant message, but missing responses are not invented', () => {
    const duplicate = logged({ ...assistant('call2', 'a2'), response: 'assistant1_response' })
    expect(judgePairing(duplicate, [call])).toEqual({ valid: false, rule: 5 })
    expect(judgePairing(logged(assistant('call2', 'a2')), [call])).toEqual({ valid: true })
  })
  it('nonempty compaction needs separate external inputs; empty lists are vacuously valid', () => {
    expect(
      judgePairing(compact('c', [{ messageId: 'assistant1', blockId: 'assistant1_call' }]), [call]),
    ).toEqual({ undetermined: 'compaction_list' })
    expect(judgePairing(compact('c', []), [call])).toEqual({ valid: true })
  })
  it('system values pass shape but never pairing into a log', () => {
    expect(
      judgePairing(accepted({ id: 'system', type: 'system', blocks: [], createdAt: at }), []),
    ).toEqual({ valid: false, rule: 7 })
  })
})
describe('V4 compaction list S29 and two-stage representation', () => {
  const m = logged({ id: 'm', type: 'user', blocks: [text('b')], createdAt: at })
  const c = compact('c', [{ messageId: 'm', blockId: 'b' }])
  it('first-stage self/type errors precede forward references', () => {
    expect(
      judgeMessageInLog({ ...c, silenced: [{ messageId: 'c', blockId: 'b' }], extra: true }, []),
    ).toEqual({ rejected: 'compaction_self_reference' })
    expect(judgeMessageInLog({ ...c, type: 'unknown' }, [])).toEqual({ rejected: 'type_unknown' })
    expect(judgeMessageInLog(c, [])).toEqual({ rejected: 'compaction_forward_reference' })
    expect('ok' in judgeMessageInLog(c, [m])).toBe(true)
  })
  it('a nonexistent block is a judgment, not a representation failure', () => {
    const wrong = compact('c', [{ messageId: 'm', blockId: 'missing' }])
    expect('ok' in judgeMessageInLog(wrong, [m])).toBe(true)
    expect(judgeCompactionList(wrong, [m], {})).toEqual({ valid: false, rule: 3 })
  })
  it('missing card/request inputs stay undetermined rather than empty/defaulted', () => {
    expect(judgeCompactionList(c, [m], {})).toEqual({
      undetermined: ['pending_card_blocks', 'last_model_request'],
    })
    expect(judgeCompactionList(c, [m], { pendingCardBlocks: [] })).toEqual({
      undetermined: ['last_model_request'],
    })
    expect(judgeCompactionList(c, [m], { lastModelRequestPrefixLength: 1 })).toEqual({
      undetermined: ['pending_card_blocks'],
    })
    expect(
      judgeCompactionList(c, [m], { pendingCardBlocks: [], lastModelRequestPrefixLength: 1 }),
    ).toEqual({ valid: true })
    expect(judgeCompactionList(compact('empty', []), [m], {})).toEqual({ valid: true })
  })
  it('card owner protects a named placeholder and its nested blocks', () => {
    expect(
      judgeCompactionList(c, [m], {
        pendingCardBlocks: [ref('m', 'b')],
        lastModelRequestPrefixLength: 1,
      }),
    ).toEqual({ valid: false, rule: 5 })
  })
  it('background placeholders are evaluated at this exact prefix, including their nested blocks', () => {
    const a = logged(assistant('call1')),
      p = logged(
        tool('call1', 'backgrounded', 'p', { code: 'backgrounded_auto', text: 'running' }),
      ),
      r = logged(finished('call1'))
    for (const blockId of ['p_result', 'p_nested']) {
      const list = compact('c', [{ messageId: 'p', blockId }])
      expect(
        judgeCompactionList(list, [a, p], {
          pendingCardBlocks: [],
          lastModelRequestPrefixLength: 2,
        }),
      ).toEqual({ valid: false, rule: 5 })
      expect(
        judgeCompactionList(list, [a, p, r], {
          pendingCardBlocks: [],
          lastModelRequestPrefixLength: 3,
        }),
      ).toEqual({ valid: true })
    }
    const spoof = logged({
      id: 'spoof',
      type: 'user',
      blocks: [{ ...text('spoofText'), text: '后台执行 call1 已结束' }],
      createdAt: at,
    })
    expect(
      judgeCompactionList(
        compact('c', [{ messageId: 'p', blockId: 'p_nested' }]),
        [a, p, spoof],
        {},
      ),
    ).toEqual({ valid: false, rule: 5 })
  })
  it('never-requested and messages after the latest request are invalid even if other inputs are absent', () => {
    expect(judgeCompactionList(c, [m], { lastModelRequestPrefixLength: null })).toEqual({
      valid: false,
      rule: 6,
    })
    expect(judgeCompactionList(c, [m], { lastModelRequestPrefixLength: 0 })).toEqual({
      valid: false,
      rule: 6,
    })
    for (const invalid of [-1, 0.5, 2, Infinity])
      expect(
        judgeCompactionList(c, [m], {
          pendingCardBlocks: [],
          lastModelRequestPrefixLength: invalid,
        }),
      ).toEqual({ undetermined: ['last_model_request'] })
  })
  it('already unreadable blocks remain legal to name and caller data is unchanged', () => {
    const prior = compact('prior', [{ messageId: 'm', blockId: 'b' }])
    const prefix = [m, prior]
    const before = writeJsonLossless({ prefix, c })
    expect(isReadable(ref('m', 'b'), prefix)).toBe(false)
    expect(
      judgeCompactionList(c, prefix, { pendingCardBlocks: [], lastModelRequestPrefixLength: 2 }),
    ).toEqual({ valid: true })
    expect(writeJsonLossless({ prefix, c })).toBe(before)
  })
})
describe('V5 canonical five-message readability and three variants', () => {
  const source = readFileSync(new URL('fixtures/message-examples.md', import.meta.url), 'utf8')
  const scene = source.slice(source.indexOf('## 11.'), source.indexOf('## 12.'))
  const messages = [...scene.matchAll(/^\| m[1-5] \| `(.+)` \|$/gm)].map(match => {
    const value = readJsonStrict(match[1] ?? '')
    if ('failed' in value) throw new Error('bad scene JSON')
    return logged(value.ok)
  })
  const refs = ['m1:b1', 'm1:b2', 'm2:b3', 'm2:b4', 'm3:b5', 'm3:b6', 'm3:b7', 'm4:b8', 'm5:b9']
  function readable(prefix: typeof messages) {
    return refs.filter(key => {
      const [m, b] = key.split(':')
      return m !== undefined && b !== undefined && isReadable(ref(m, b), prefix)
    })
  }
  it('matches the hand-computed sets before and after compaction without changing any flags', () => {
    const before = writeJsonLossless(messages)
    expect(messages).toHaveLength(5)
    expect(readable(messages.slice(0, 4))).toEqual([
      'm1:b1',
      'm1:b2',
      'm2:b4',
      'm3:b5',
      'm3:b6',
      'm3:b7',
      'm4:b8',
    ])
    expect(readable(messages)).toEqual(['m1:b1', 'm2:b4', 'm3:b5', 'm3:b6', 'm4:b8', 'm5:b9'])
    expect(
      readable([...messages, logged({ id: 'later', type: 'user', blocks: [], createdAt: at })]),
    ).toEqual(readable(messages))
    expect(writeJsonLossless(messages)).toBe(before)
  })
  it('variant 1 rejects naming m4, which appeared after R2', () => {
    expect(
      judgeCompactionList(
        compact('c', [{ messageId: 'm4', blockId: 'b8' }]),
        messages.slice(0, 4),
        { pendingCardBlocks: [], lastModelRequestPrefixLength: 3 },
      ),
    ).toEqual({ valid: false, rule: 6 })
  })
  it('variant 2 naming the result container hides all descendants and leaves the call readable', () => {
    const c = compact('c', [{ messageId: 'm3', blockId: 'b5' }]),
      prefix = [...messages.slice(0, 4), c]
    expect(
      judgeCompactionList(c, messages.slice(0, 4), {
        pendingCardBlocks: [],
        lastModelRequestPrefixLength: 3,
      }),
    ).toEqual({ valid: true })
    for (const b of ['b5', 'b6', 'b7']) expect(isReadable(ref('m3', b), prefix)).toBe(false)
    expect(isReadable(ref('m2', 'b4'), prefix)).toBe(true)
  })
  it('variant 3 does not discard surviving blocks before the latest compaction', () => {
    expect(readable(messages)).not.toEqual(['m5:b9'])
    expect(isReadable(ref('missing', 'b1'), messages)).toBe(false)
    expect(isReadable(ref('m1', 'missing'), messages)).toBe(false)
  })
})
