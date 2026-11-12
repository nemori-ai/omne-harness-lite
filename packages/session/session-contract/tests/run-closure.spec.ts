// The end of a Run answers its open tool calls (SPEC "Run 结束时关上未答的调用"): the commit that
// writes the terminal of a Run first writes one tool message for every call of the Run that has
// none, so a terminal Run has no open call and the next model request reads a whole history.
import { describe, expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness/message'
import {
  decide,
  reduce,
  type BoundedClose,
  type HistoryEntry,
  type RunId,
  type SessionLogConsequence,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>
const VISIBLE = { toHuman: true, toModel: true }

const assistant = (name: string, calls: readonly string[]): Message =>
  ({
    id: `msg_assistant000000000000${name}`,
    role: 'assistant',
    blocks: calls.map(callId => ({
      kind: 'tool_call',
      id: `${callId}/call`,
      visibility: VISIBLE,
      callId,
      name: 'Ask',
      arguments: { kind: 'object', entries: [] },
    })),
  }) as unknown as Message

const answer = (callId: string): Message =>
  ({
    id: `msg_tool0000000000000000${callId}`,
    role: 'tool',
    blocks: [
      { kind: 'tool_result', id: `${callId}/result`, visibility: VISIBLE, callId },
      { kind: 'text', id: `${callId}/text`, visibility: VISIBLE, text: 'done' },
    ],
  }) as unknown as Message

/** Records one message of the active Run through the message hand-over. */
async function record(s: Scene, name: string, message: Message, written: string) {
  const { run } = await s.active()
  return s.commit({
    kind: 'recordMessage',
    input: {
      ...s.base,
      operation: operationId(`message-${name}`),
      participation: {
        execution: run.execution.execution,
        operation: `agent-message-${name}`,
        joint: 'message',
        written,
        handover: evidence(`agent/message/${name}`),
      },
      value: {
        message,
        source: evidence(`agent/source/${name}`),
        admission: evidence(`agent/admission/${name}`),
        consumption: null,
      },
    },
  })
}

const cancel = (s: Scene, run: RunId) =>
  s.commit({
    kind: 'cancelRun',
    input: { ...s.base, operation: operationId('cancel'), run, urgency: 'graceful' },
  })

/** The entries of the session in commit order; an entry that needs its SE01 to decode has no kind. */
function rows(s: Scene) {
  return s.port.controls.entriesOf(s.base.tenant, s.base.session).map(row => {
    const decoded = decodeEntry(row)
    return 'ok' in decoded ? decoded.ok : { kind: null }
  })
}

/** The tool messages that the commits after `from` wrote, with the call each one answers. */
function closings(s: Scene, from: number) {
  return rows(s)
    .slice(from)
    .flatMap(entry => {
      if (entry.kind !== 'message.tool') return []
      const marker = entry.message.blocks[0]
      const text = entry.message.blocks[1]
      return [
        {
          callId: marker?.kind === 'tool_result' ? marker.callId : null,
          text: text?.kind === 'text' ? text.text : null,
          entry,
        },
      ]
    })
}

async function running(calls: readonly string[]) {
  const s = await open()
  const { run } = await s.active()
  succeeded(await record(s, 'calls', assistant('calls', calls), '2'), 'assistant message')
  return { s, run: run.run }
}

describe('the commit that ends a Run answers its open tool calls', () => {
  it('a cancelled Run gets one tool message for its open call, before the terminal', async () => {
    const { s, run } = await running(['call-a'])
    expect((await s.read()).unansweredCalls).toEqual(['call-a'])
    const before = rows(s).length
    succeeded(await cancel(s, run), 'cancelRun')

    const written = rows(s).slice(before)
    const kinds = written.map(entry => entry.kind)
    expect(kinds).toContain('message.tool')
    expect(kinds.indexOf('control.requested')).toBeLessThan(kinds.indexOf('message.tool'))
    expect(kinds.indexOf('message.tool')).toBeLessThan(kinds.indexOf('run.terminal'))

    const [closing, ...rest] = closings(s, before)
    expect(rest).toEqual([])
    expect(closing?.callId).toBe('call-a')
    expect(closing?.text).toBe(
      'No result of this call is in the conversation: the run was cancelled before the call returned. The tool was asked to stop. It may have had effects before it stopped. Do not assume that the call completed or was approved.',
    )
    expect(closing?.entry).toMatchObject({
      admission: null,
      consumption: null,
      participation: null,
    })
    expect(judgeMessage(closing?.entry.message)).toHaveProperty('ok')

    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'cancelled' } })
    expect(after.unansweredCalls ?? []).toEqual([])
  })

  it('answers only the calls that have no tool message yet', async () => {
    const { s, run } = await running(['call-a', 'call-b'])
    succeeded(await record(s, 'answer-a', answer('call-a'), '3'), 'tool message')
    expect((await s.read()).unansweredCalls).toEqual(['call-b'])
    const before = rows(s).length
    succeeded(await cancel(s, run), 'cancelRun')
    expect(closings(s, before).map(closing => closing.callId)).toEqual(['call-b'])
  })

  it('writes no tool message when every call has one', async () => {
    const { s, run } = await running(['call-a'])
    succeeded(await record(s, 'answer-a', answer('call-a'), '3'), 'tool message')
    const before = rows(s).length
    succeeded(await cancel(s, run), 'cancelRun')
    expect(closings(s, before)).toEqual([])
  })

  it('a Run that ends with a failure answers its open call and says so', async () => {
    const { s } = await running(['call-a'])
    const { run } = await s.active()
    const bounded: BoundedClose = {
      kind: 'uninterpretable',
      evidence: evidence('agent/uninterpretable'),
    }
    const before = rows(s).length
    succeeded(
      await s.commit({
        kind: 'finishRun',
        input: {
          ...s.base,
          operation: operationId('finish'),
          run: run.run,
          expected: run.revision,
          bounded,
        },
      }),
      'finishRun',
    )
    const [closing] = closings(s, before)
    expect(closing?.callId).toBe('call-a')
    expect(closing?.text).toBe(
      'No result of this call is in the conversation: the run failed before the call returned. It may have had effects. Do not assume that the call completed or was approved.',
    )
    const kinds = rows(s)
      .slice(before)
      .map(entry => entry.kind)
    expect(kinds.indexOf('message.tool')).toBeLessThan(kinds.indexOf('run.terminal'))
  })

  it('a tool message after the terminal is still refused, so each call has one tool message', async () => {
    const { s, run } = await running(['call-a'])
    const { run: active } = await s.active()
    succeeded(await cancel(s, run), 'cancelRun')
    const late = await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId('message-late'),
        participation: {
          execution: active.execution.execution,
          operation: 'agent-message-late',
          joint: 'message',
          written: '3',
          handover: evidence('agent/message/late'),
        },
        value: {
          message: answer('call-a'),
          source: evidence('agent/source/late'),
          admission: evidence('agent/admission/late'),
          consumption: null,
        },
      },
    })
    refused(late, 'late tool message')
    expect(
      rows(s).filter(
        entry =>
          entry.kind === 'message.tool' &&
          entry.message.blocks.some(
            block => block.kind === 'tool_result' && block.callId === 'call-a',
          ),
      ),
    ).toHaveLength(1)
  })

  it('a call that the model does not see is not an open call', async () => {
    const s = await open()
    const { run } = await s.active()
    const hidden = assistant('hidden', ['call-a'])
    const message = {
      ...hidden,
      blocks: hidden.blocks.map(block => ({
        ...block,
        visibility: { toHuman: true, toModel: false },
      })),
    } as unknown as Message
    succeeded(await record(s, 'hidden', message, '2'), 'assistant message')
    expect((await s.read()).unansweredCalls ?? []).toEqual([])
    const before = rows(s).length
    succeeded(await cancel(s, run.run), 'cancelRun')
    expect(closings(s, before)).toEqual([])
  })

  it('an internal tool message does not answer a call: the model never reads it', async () => {
    const { s, run } = await running(['call-a'])
    const internal = { ...answer('call-a'), role: 'tool_internal' } as unknown as Message
    succeeded(await record(s, 'internal', internal, '3'), 'internal tool message')
    expect((await s.read()).unansweredCalls).toEqual(['call-a'])
    const before = rows(s).length
    succeeded(await cancel(s, run), 'cancelRun')
    expect(closings(s, before).map(closing => closing.callId)).toEqual(['call-a'])
  })

  it('a call that two assistant messages name is one open call', async () => {
    const { s, run } = await running(['call-a'])
    succeeded(await record(s, 'again', assistant('again', ['call-a']), '3'), 'assistant message')
    expect((await s.read()).unansweredCalls).toEqual(['call-a'])
    const before = rows(s).length
    succeeded(await cancel(s, run), 'cancelRun')
    expect(closings(s, before).map(closing => closing.callId)).toEqual(['call-a'])
  })

  it('a Run that the execution ended answers its open call with the same commit', async () => {
    const { s } = await running(['call-a'])
    const { run } = await s.active()
    const before = rows(s).length
    succeeded(
      await s.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '5',
          source: evidence('ended'),
          sequence: '1',
          consequences: [
            { kind: 'ended', outcome: 'completed', cause: null, disposition: evidence('complete') },
          ] satisfies readonly SessionLogConsequence[],
        },
        operationId('interpret-end'),
      ),
      'project',
    )
    const [closing, ...rest] = closings(s, before)
    expect(rest).toEqual([])
    expect(closing?.callId).toBe('call-a')
    expect(closing?.text).toBe(
      'No result of this call is in the conversation: the run ended before the call returned. It may have had effects. Do not assume that the call completed or was approved.',
    )
    expect((await s.read()).run).toMatchObject({ kind: 'terminal' })
  })

  it('the history refuses a terminal while a call of the Run has no tool message', async () => {
    const { s } = await running(['call-a'])
    const snapshot = await s.read()
    if (snapshot.run.kind !== 'active') throw new Error('no active Run')
    const decision = decide(
      snapshot,
      {
        kind: 'finishRun',
        input: {
          ...s.base,
          operation: operationId('finish'),
          run: snapshot.run.run,
          expected: snapshot.run.revision,
          bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
        },
      },
      [],
      null,
      { compaction: null },
    )
    if (decision.kind !== 'entries') throw new Error('finishRun did not decide entries')
    const revision = String(Number(snapshot.revision) + 1) as WorkSnapshot['revision']
    const batch = (kept: typeof decision.entries) => ({
      revision,
      entries: kept.map((entry, index): HistoryEntry => ({
        ...entry,
        id: String(1000 + index) as HistoryEntry['id'],
        revision,
      })),
    })
    expect(reduce(snapshot, batch(decision.entries))).toMatchObject({ kind: 'reduced' })
    const withoutClosing = decision.entries.filter(entry => entry.kind !== 'message.tool')
    expect(withoutClosing).toHaveLength(decision.entries.length - 1)
    const refused = reduce(snapshot, batch(withoutClosing))
    expect(refused.kind).not.toBe('reduced')
    expect(JSON.stringify(refused)).toContain(
      'a terminal while a tool call of the Run has no tool message',
    )
  })
})
