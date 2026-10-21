import { invocationReference } from './reference-input.ts'
import { judgeContentBlock } from '@omne-harness/content-block'
import { judgePart } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { ModelBlock, TransportFact, VisibleBlock } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import {
  access,
  ackInput,
  admitCall,
  callRef,
  dispatch,
  evidence,
  failureOf,
  liveHandle,
  must,
  operation,
  scriptedProvider,
  settleCall,
  textBlock,
  version,
  watch,
} from './scripted-support.ts'

const open = (
  index: string,
  content: 'text' | 'thinking' | 'tool-arguments' | 'voice',
  mode: 'append' | 'replace' = 'append',
): TransportFact => ({ kind: 'block-open', index, mode, content })
const delta = (index: string, text: string): TransportFact => ({
  kind: 'block-delta',
  index,
  delta: text,
})
const replace = (index: string, value: string): TransportFact => ({
  kind: 'block-replace',
  index,
  value,
})
const seal = (index: string, block: ModelBlock): TransportFact => ({
  kind: 'block-seal',
  index,
  block,
})

function blockOf(value: unknown): ModelBlock {
  const judged = judgeContentBlock(value)
  if (!('ok' in judged)) throw new Error('fixture block')
  return judged.ok
}

const visibility = { toHuman: true, toModel: true }
const thinkingBlock = blockOf({ kind: 'thinking', id: 'th', visibility, text: 'hm' })
const fileBlock = blockOf({
  kind: 'file',
  id: 'fi',
  visibility,
  storage: 'store',
  key: 'key',
  mediaType: 'text/plain',
})

const object = (key: string, lexeme: string): JsonValue => ({
  kind: 'object',
  entries: [{ key, value: { kind: 'number', lexeme } }],
})

function toolCall(args: JsonValue): ModelBlock {
  const judged = judgePart({
    kind: 'tool_call',
    id: 'tc',
    visibility: { toHuman: false, toModel: true },
    callId: 'call-1',
    name: 'lookup',
    arguments: args,
  })
  if (!('ok' in judged) || judged.ok.kind !== 'tool_call') throw new Error('fixture tool call')
  return judged.ok
}

/** Plays the facts into a running call and returns the blocks that a new observer sees. */
async function shown(facts: readonly TransportFact[]): Promise<readonly VisibleBlock[]> {
  const scripted = scriptedProvider()
  await admitCall(scripted, 'a')
  scripted.controller.start({
    ...callRef('a'),
    dispatch: dispatch('first'),
    firstContent: 'none-proven',
  })
  scripted.controller.play({ ...callRef('a'), facts })
  const observation = watch(await liveHandle(scripted, 'a'))
  const first = await observation.next()
  await observation.stop()
  if (first === 'finished' || first.kind !== 'snapshot') throw new Error('no snapshot')
  return first.value.blocks
}

const growing = (
  index: string,
  content: 'text' | 'thinking' | 'tool-arguments' | 'voice',
  value: string,
  mode: 'append' | 'replace' = 'append',
): VisibleBlock => ({ kind: 'growing', index, mode, content, value })

describe('a scripted call that is fed upstream facts', () => {
  it('appends each delta to an append block and takes the last value of a replace block', async () => {
    expect(
      await shown([
        open('0', 'text'),
        delta('0', 'a'),
        delta('0', 'b'),
        open('1', 'thinking', 'replace'),
        replace('1', 'x'),
        replace('1', 'y'),
      ]),
    ).toEqual([growing('0', 'text', 'ab'), growing('1', 'thinking', 'y', 'replace')])
  })

  it('keeps the blocks in the order in which they were opened', async () => {
    expect(await shown([open('1', 'text'), open('0', 'text')])).toEqual([
      growing('1', 'text', ''),
      growing('0', 'text', ''),
    ])
  })

  it('refuses a fill for a block that was not opened and drops the facts after it', async () => {
    expect(await shown([open('0', 'text'), delta('9', 'lost'), delta('0', 'never')])).toEqual([
      growing('0', 'text', ''),
    ])
  })

  it('refuses a delta for a replace block and a replace for an append block', async () => {
    expect(
      await shown([open('0', 'text', 'replace'), delta('0', 'lost'), replace('0', 'never')]),
    ).toEqual([growing('0', 'text', '', 'replace')])
    expect(await shown([open('0', 'text'), replace('0', 'lost'), delta('0', 'never')])).toEqual([
      growing('0', 'text', ''),
    ])
  })

  it('refuses to open an index twice', async () => {
    expect(await shown([open('0', 'text'), delta('0', 'kept'), open('0', 'thinking')])).toEqual([
      growing('0', 'text', 'kept'),
    ])
  })

  it('stops at the first fact that is refused, so a block that was opened twice takes no later fill', async () => {
    expect(
      await shown([
        open('0', 'text'),
        delta('0', 'kept'),
        open('0', 'thinking'),
        delta('0', 'later'),
      ]),
    ).toEqual([growing('0', 'text', 'kept')])
  })

  it('goes on with the facts after a trim, and after an account fact', async () => {
    expect(
      await shown([
        open('0', 'tool-arguments'),
        delta('0', '{"a":1}'),
        { kind: 'trim', index: '0', removed: '', reason: 'limit' },
        open('1', 'text'),
        delta('1', 'x'),
      ]),
    ).toEqual([growing('0', 'tool-arguments', '{"a":1}'), growing('1', 'text', 'x')])
    expect(
      await shown([
        open('0', 'text'),
        {
          kind: 'account',
          event: 'e',
          value: {
            subject: { kind: 'model_call', id: 'c' },
            usage: [],
            cost: [],
            trimmed: { state: 'unknown', unit: 'USD' },
            place: 'p',
            duration: { state: 'unknown' },
            receipt: 'received',
            revision: '1',
          },
        },
        delta('0', 'b'),
      ]),
    ).toEqual([growing('0', 'text', 'b')])
  })

  it('refuses to seal arguments that hold a lone surrogate instead of failing on them', async () => {
    expect(
      await shown([
        open('0', 'tool-arguments'),
        delta('0', '\uD800'),
        seal('0', toolCall(object('a', '1'))),
      ]),
    ).toEqual([growing('0', 'tool-arguments', '\uD800')])
  })

  it('seals a whole image block at an index that was never opened', async () => {
    const image = blockOf({
      kind: 'image',
      id: 'im',
      visibility,
      mediaType: 'image/png',
      inline: 'AA==',
    })
    expect(await shown([seal('0', image)])).toEqual([{ kind: 'sealed', index: '0', block: image }])
  })

  it('seals a whole reasoning state part at an index that was never opened', async () => {
    const judged = judgePart({
      kind: 'reasoning_state',
      id: 'rs',
      visibility: { toHuman: false, toModel: true },
      payload: 'opaque',
      pairs: [],
    })
    if (!('ok' in judged) || judged.ok.kind !== 'reasoning_state') throw new Error('fixture part')
    const state: ModelBlock = judged.ok
    expect(await shown([seal('0', state)])).toEqual([{ kind: 'sealed', index: '0', block: state }])
  })

  it('seals a text block only with a text block that holds the gathered value', async () => {
    expect(
      await shown([open('0', 'text'), delta('0', 'ab'), seal('0', textBlock('s', 'ab'))]),
    ).toEqual([{ kind: 'sealed', index: '0', block: textBlock('s', 'ab') }])
    expect(
      await shown([open('0', 'text'), delta('0', 'ab'), seal('0', textBlock('s', 'abc'))]),
    ).toEqual([growing('0', 'text', 'ab')])
    expect(await shown([open('0', 'text'), delta('0', 'hm'), seal('0', thinkingBlock)])).toEqual([
      growing('0', 'text', 'hm'),
    ])
  })

  it('seals a thinking block only with a thinking block that holds the gathered value', async () => {
    expect(
      await shown([open('0', 'thinking'), delta('0', 'hm'), seal('0', thinkingBlock)]),
    ).toEqual([{ kind: 'sealed', index: '0', block: thinkingBlock }])
    expect(
      await shown([open('0', 'thinking'), delta('0', 'hm'), seal('0', textBlock('s', 'hm'))]),
    ).toEqual([growing('0', 'thinking', 'hm')])
  })

  it('takes no more fill, trim or seal for a block that is sealed', async () => {
    const sealed: VisibleBlock = { kind: 'sealed', index: '0', block: textBlock('s', 'ab') }
    for (const later of [
      delta('0', 'c'),
      replace('0', 'c'),
      { kind: 'trim', index: '0', removed: 'x', reason: 'limit' } as const,
      seal('0', textBlock('t', 'ab')),
    ])
      expect(
        await shown([open('0', 'text'), delta('0', 'ab'), seal('0', textBlock('s', 'ab')), later]),
      ).toEqual([sealed])
  })

  it('refuses a fill for a block that is sealed and drops the facts after it', async () => {
    expect(
      await shown([
        open('0', 'text'),
        delta('0', 'ab'),
        seal('0', textBlock('s', 'ab')),
        delta('0', 'c'),
        open('1', 'text'),
      ]),
    ).toEqual([{ kind: 'sealed', index: '0', block: textBlock('s', 'ab') }])
  })

  it('seals a whole file block at an index that was never opened, and refuses a whole text block', async () => {
    expect(await shown([seal('0', fileBlock)])).toEqual([
      { kind: 'sealed', index: '0', block: fileBlock },
    ])
    expect(await shown([seal('0', textBlock('s', 'ab'))])).toEqual([])
  })

  it('seals tool arguments only with the tool call that the gathered text decodes to', async () => {
    const arrived = [open('0', 'tool-arguments'), delta('0', '{"a":'), delta('0', '1}')]
    expect(await shown([...arrived, seal('0', toolCall(object('a', '1')))])).toEqual([
      { kind: 'sealed', index: '0', block: toolCall(object('a', '1')) },
    ])
    expect(await shown([...arrived, seal('0', toolCall(object('a', '2')))])).toEqual([
      growing('0', 'tool-arguments', '{"a":1}'),
    ])
  })

  it('refuses to seal arguments that are not JSON, and arguments that a trim cut off', async () => {
    expect(
      await shown([
        open('0', 'tool-arguments'),
        delta('0', '{"a":'),
        seal('0', toolCall(object('a', '1'))),
      ]),
    ).toEqual([growing('0', 'tool-arguments', '{"a":')])
    expect(
      await shown([
        open('0', 'tool-arguments'),
        delta('0', '{"a":1}'),
        { kind: 'trim', index: '0', removed: '', reason: 'limit' },
        seal('0', toolCall(object('a', '1'))),
      ]),
    ).toEqual([growing('0', 'tool-arguments', '{"a":1}')])
  })

  it('refuses to seal a tool argument block with a text block', async () => {
    expect(
      await shown([open('0', 'tool-arguments'), delta('0', '{}'), seal('0', textBlock('s', '{}'))]),
    ).toEqual([growing('0', 'tool-arguments', '{}')])
  })

  it('refuses a trim for a block that was not opened', async () => {
    expect(
      await shown([{ kind: 'trim', index: '0', removed: '', reason: 'limit' }, open('1', 'text')]),
    ).toEqual([])
  })

  it('leaves the blocks as they are for an account fact and an ended fact', async () => {
    expect(
      await shown([
        open('0', 'text'),
        delta('0', 'a'),
        { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
        delta('0', 'b'),
      ]),
    ).toEqual([growing('0', 'text', 'ab')])
  })

  it('takes a voice block only as the seal of a voice block', async () => {
    const voice = blockOf({
      kind: 'voice',
      id: 'vo',
      visibility,
      mediaType: 'audio/wav',
      inline: 'AA==',
    })
    expect(await shown([open('0', 'voice'), delta('0', 'AA=='), seal('0', voice)])).toEqual([
      { kind: 'sealed', index: '0', block: voice },
    ])
    expect(
      await shown([open('0', 'voice'), delta('0', 'AA=='), seal('0', textBlock('s', 'AA=='))]),
    ).toEqual([growing('0', 'voice', 'AA==')])
  })

  it('shows the blocks of the last use, whether they came from facts or from emit', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'none-proven',
    })
    scripted.controller.play({ ...callRef('a'), facts: [open('0', 'text')] })
    scripted.controller.emit({
      ...callRef('a'),
      blocks: [{ kind: 'sealed', index: '5', block: textBlock('e', 'emitted') }],
    })
    const shownAfterEmit = watch(await liveHandle(scripted, 'a'))
    const first = await shownAfterEmit.next()
    await shownAfterEmit.stop()
    expect(first !== 'finished' && first.kind === 'snapshot' && first.value.blocks).toEqual([
      { kind: 'sealed', index: '5', block: textBlock('e', 'emitted') },
    ])
  })

  it('seals a thinking block only with the thinking text that was gathered', async () => {
    expect(
      await shown([
        open('0', 'thinking'),
        delta('0', 'hm'),
        seal('0', blockOf({ kind: 'thinking', id: 'th2', visibility, text: 'other' })),
      ]),
    ).toEqual([growing('0', 'thinking', 'hm')])
  })

  it('wakes an observer that is waiting when facts are played', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'none-proven',
    })
    const watcher = watch(await liveHandle(scripted, 'a'))
    await watcher.next()
    const next = watcher.next()
    scripted.controller.play({ ...callRef('a'), facts: [open('0', 'text'), delta('0', 'hi')] })
    const changed = await next
    await watcher.stop()
    expect(changed !== 'finished' && changed.kind === 'changed' && changed.value.blocks).toEqual([
      growing('0', 'text', 'hi'),
    ])
  })

  it('throws for facts that are played into an unknown call and into a call that ended', async () => {
    const scripted = scriptedProvider()
    expect(() => scripted.controller.play({ ...callRef('missing'), facts: [] })).toThrow(
      expect.objectContaining({ name: 'ScriptedModelError', reason: 'unknown-call' }),
    )
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    expect(() => scripted.controller.play({ ...callRef('a'), facts: [] })).toThrow(
      expect.objectContaining({ name: 'ScriptedModelError', reason: 'invalid-script' }),
    )
  })
})

describe('a scripted call that was given evidence', () => {
  it('takes only the evidence that the script gave, and says so with handoff-invalid', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    scripted.controller.expectEvidence({ ...callRef('a'), evidence: evidence('given') })
    const { consumption, calls } = scripted.provider.runtime
    expect(failureOf(await consumption.acknowledge(ackInput('a', 'other')))).toEqual({
      kind: 'handoff-invalid',
      reason: 'the evidence is not one that the script gave for the call',
    })
    expect(
      must(
        await calls.inspect({
          ...access('a'),
          reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
        }),
      ),
    ).toMatchObject({ kind: 'found', state: { custody: { kind: 'producer' } } })
    const receipt = must(await consumption.acknowledge(ackInput('a', 'given')))
    expect(receipt.custody.receipt).toEqual(evidence('given'))
  })

  it('takes the evidence of a retained handoff as well', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    scripted.controller.expectEvidence({ ...callRef('a'), evidence: evidence('kept') })
    const { consumption } = scripted.provider.runtime
    const retained = (label: string) => ({
      ...access('a'),
      operation: operation(`ack-${label}`),
      result: version('a'),
      evidence: { kind: 'retained' as const, custody: evidence(label) },
    })
    expect(failureOf(await consumption.acknowledge(retained('lost')))).toMatchObject({
      kind: 'handoff-invalid',
    })
    expect(must(await consumption.acknowledge(retained('kept'))).custody.receipt).toEqual(
      evidence('kept'),
    )
  })

  it('takes any of several evidence records, and any evidence when it was given none', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    settleCall(scripted, 'a')
    settleCall(scripted, 'b')
    scripted.controller.expectEvidence({ ...callRef('a'), evidence: evidence('one') })
    scripted.controller.expectEvidence({ ...callRef('a'), evidence: evidence('two') })
    const { consumption } = scripted.provider.runtime
    expect(must(await consumption.acknowledge(ackInput('a', 'two'))).custody.receipt).toEqual(
      evidence('two'),
    )
    expect(must(await consumption.acknowledge(ackInput('b', 'anything'))).custody.receipt).toEqual(
      evidence('anything'),
    )
  })

  it('reports not-settled before it looks at the evidence', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.expectEvidence({ ...callRef('a'), evidence: evidence('given') })
    expect(
      failureOf(await scripted.provider.runtime.consumption.acknowledge(ackInput('a', 'other'))),
    ).toEqual({ kind: 'not-settled' })
  })

  it('throws for evidence that is given to an unknown call', () => {
    expect(() =>
      scriptedProvider().controller.expectEvidence({
        ...callRef('missing'),
        evidence: evidence('x'),
      }),
    ).toThrow(expect.objectContaining({ name: 'ScriptedModelError', reason: 'unknown-call' }))
  })
})

describe('a scripted directory that cannot be reached', () => {
  it('answers unavailable for every call, those that exist and those that do not', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.failDirectory()
    const expected = {
      kind: 'unavailable',
      dependency: 'model-directory',
      diagnostic: 'the directory of live routes cannot be reached',
    }
    const { instances, calls } = scripted.provider.runtime
    expect(failureOf(await instances.connect(access('a')))).toEqual(expected)
    expect(failureOf(await instances.connect(access('missing')))).toEqual(expected)
    expect(
      failureOf(await instances.connect({ ...access('a'), principal: { name: 'bob' } })),
    ).toEqual(expected)
    expect(
      must(
        await calls.inspect({
          ...access('a'),
          reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
        }),
      ).kind,
    ).toBe('found')
  })

  it('leaves the directory working until the script breaks it', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(must(await scripted.provider.runtime.instances.connect(access('a'))).kind).toBe('live')
  })
})
