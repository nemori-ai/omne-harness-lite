import { expect, it } from 'vitest'
import { sampleCompactionInput } from '@omne-harness/agent-contract/testing'
import { judgeMessage, parseRecordEntryRef } from '@omne-harness/message'
import { succeed } from '@omne-harness/operation-result'
import { planDefaultCompaction } from '../src/default-plan.ts'
import { ok } from './request-fixture.ts'
import { DEFAULT_COMPACTION_CONFIGURATION } from '../src/default-configuration.ts'

function input() {
  const value = sampleCompactionInput()
  const entries = Array.from({ length: 4 }, (_, i) => {
    const ref = parseRecordEntryRef(`entry-${i}`)
    if (ref === null) throw new Error('entry')
    const message = judgeMessage({
      ...value.history.entries[0]!.message,
      id: `msg_${String(i).padStart(22, 'a')}`,
    })
    if ('rejected' in message) throw new Error('message')
    return { ref, sequence: String(i), message: message.ok, represented: [message.ok] }
  })
  return {
    ...value,
    history: {
      ...value.history,
      origin: entries[0]!.ref,
      upper: entries[3]!.ref,
      logOrder: entries.map(e => e.ref),
      entries,
    },
  }
}

it('retains newest messages within 16% of the window without copying hidden old history', async () => {
  const value = input()
  const plan = ok(
    await planDefaultCompaction(value, async refs => succeed(String(refs.length * 60))),
  )
  expect(plan).toMatchObject({
    kind: 'planned',
    retained: ['entry-2', 'entry-3'],
    coverTo: 'entry-3',
  })
  if (plan.kind !== 'planned') throw new Error('no plan')
  expect(plan.messages.map(m => m.id)).toEqual(
    value.history.entries.slice(0, 2).map(e => e.message.id),
  )
})

it('returns protected-floor when required visible history alone exceeds retention budget', async () => {
  const value = input()
  const protectedInput = {
    ...value,
    history: { ...value.history, protected: [value.history.origin] },
  }
  expect(ok(await planDefaultCompaction(protectedInput, async () => succeed('161')))).toMatchObject(
    { kind: 'cannot-fit', reason: 'protected-floor' },
  )
})

it('cuts coverage before an invisible barrier and never turns the barrier into retained history', async () => {
  const value = input()
  const barrier = value.history.entries[2]!.ref
  const bounded = {
    ...value,
    history: {
      ...value.history,
      entries: value.history.entries.filter(e => e.ref !== barrier),
      barriers: [barrier],
    },
  }
  const plan = ok(await planDefaultCompaction(bounded, async () => succeed('200')))
  expect(plan).toMatchObject({ kind: 'planned', coverTo: 'entry-1', retained: [] })
  if (plan.kind !== 'planned') throw new Error('no plan')
  expect(plan.messages.map(m => m.id)).toEqual(
    value.history.entries.slice(0, 2).map(e => e.message.id),
  )
})

it('refuses a window with no summarizable prefix before a barrier', async () => {
  const value = input()
  const blocked = {
    ...value,
    history: {
      ...value.history,
      entries: value.history.entries.slice(1),
      barriers: [value.history.origin],
    },
  }
  expect(ok(await planDefaultCompaction(blocked, async () => succeed('0')))).toMatchObject({
    kind: 'cannot-fit',
    reason: 'protected-floor',
  })
})

function pairedInput(text = 'tool result') {
  const value = input()
  const visibility = { toModel: true, toHuman: true }
  const messages = [
    {
      role: 'assistant',
      id: value.history.entries[1]!.message.id,
      blocks: [
        {
          kind: 'tool_call',
          id: 'call',
          callId: 'call-1',
          name: 'read_file',
          arguments: { kind: 'null' },
          visibility,
        },
      ],
    },
    {
      role: 'tool',
      id: value.history.entries[2]!.message.id,
      blocks: [
        { kind: 'tool_result', id: 'result', callId: 'call-1', visibility },
        { kind: 'text', id: 'body', text, visibility },
      ],
    },
  ].map(value => {
    const result = judgeMessage(value)
    if ('rejected' in result) throw new Error(result.rejected)
    return result.ok
  })
  const entries = value.history.entries.map((entry, index) => {
    const message = messages[index - 1]
    return message === undefined ? entry : { ...entry, message, represented: [message] }
  })
  return {
    ...value,
    history: {
      ...value.history,
      entries,
      base: {
        kind: 'initial' as const,
        pairings: [{ call: entries[1]!.ref, result: entries[2]!.ref }],
      },
    },
  }
}

it('keeps a protected result and its call as a unit before selecting other history', async () => {
  const value = pairedInput()
  const protectedInput = {
    ...value,
    history: { ...value.history, protected: [value.history.entries[2]!.ref] },
  }
  expect(
    ok(
      await planDefaultCompaction(protectedInput, async refs => succeed(String(refs.length * 60))),
    ),
  ).toMatchObject({ kind: 'planned', retained: ['entry-1', 'entry-2'] })
})

it('trims only the summary copy of oversized tool text at a UTF-8 boundary', async () => {
  const value = pairedInput('汉'.repeat(30_000))
  const original = JSON.stringify(value)
  const plan = ok(await planDefaultCompaction(value, async () => succeed('200')))
  if (plan.kind !== 'planned') throw new Error('no plan')
  expect(plan.trimmed).toEqual([
    {
      message: value.history.entries[2]!.message.id,
      block: 'body',
      originalBytes: '90000',
      keptBytes: '65535',
    },
  ])
  const tool = plan.messages.find(message => message.role === 'tool')
  const text = tool?.blocks.find(block => block.kind === 'text')
  expect(text?.kind === 'text' && text.text).toBe('汉'.repeat(21845))
  expect(JSON.stringify(value)).toBe(original)
})

it('uses configured retention and tool-text limits without changing stored history', async () => {
  const value = pairedInput('汉字汉字')
  const configuration = {
    ...DEFAULT_COMPACTION_CONFIGURATION,
    retainPercent: 0,
    maxToolTextBytes: 4,
  }
  const trimmed = ok(await planDefaultCompaction(value, async () => succeed('1'), configuration))
  expect(trimmed).toMatchObject({ kind: 'planned', retained: [], trimmed: [{ keptBytes: '3' }] })
  const untrimmed = ok(
    await planDefaultCompaction(value, async () => succeed('1'), {
      ...configuration,
      trimToolText: false,
    }),
  )
  expect(untrimmed).toMatchObject({ kind: 'planned', retained: [], trimmed: [] })
  if (untrimmed.kind !== 'planned') throw new Error('no plan')
  expect(untrimmed.messages).toEqual(value.history.entries.flatMap(entry => entry.represented))
})

it('never retains only half of an unprotected call-result unit at the budget boundary', async () => {
  const value = pairedInput()
  const plan = ok(
    await planDefaultCompaction(value, async refs => succeed(String(refs.length * 80))),
  )
  expect(plan).toMatchObject({ kind: 'planned', retained: ['entry-0', 'entry-3'] })
  if (plan.kind !== 'planned') throw new Error('no plan')
  expect(plan.messages.map(message => message.role)).toEqual(['assistant', 'tool'])
})

it('retains a call whose matching result lies after the coverage barrier', async () => {
  const value = pairedInput()
  const barrier = parseRecordEntryRef('invisible-work')
  if (barrier === null) throw new Error('barrier')
  const bounded = {
    ...value,
    history: {
      ...value.history,
      barriers: [barrier],
      logOrder: ['entry-0', 'entry-1']
        .map(ref => value.history.entries.find(entry => entry.ref === ref)!.ref)
        .concat([barrier, ...value.history.entries.slice(2).map(entry => entry.ref)]),
    },
  }
  expect(
    ok(await planDefaultCompaction(bounded, async refs => succeed(String(refs.length * 100)))),
  ).toMatchObject({ kind: 'planned', coverTo: 'entry-1', retained: ['entry-1'] })
})
