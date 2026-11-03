// The Session history rows a Ja of the production session-log Journal writes (Agent SPEC
// "真实历史的提交点"; AD-01): the main reply, whose caller is none and whose admission fact the Ja
// carries, enters the Session history as `message.assistant`; a tool result whose caller is the
// `message` hand-over enters it as `message.tool`. Either row and the Agent records are one storage
// commit: a failure of either write leaves neither, and the same operation then commits once. A
// rejected reply writes no row. On the node:sqlite double that runs the published modules.
import { describe, expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type DurableEvidence,
} from '@omne-harness/agent-contract'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Commit = Parameters<Journal['commit']>[0]
type Request = Extract<NonNullable<Commit['handoff']>, { kind: 'prepare' }>['request']
type Decision = Extract<NonNullable<Commit['handoff']>, { kind: 'resolve' }>['outcome']['decision']

const PROVIDER = { owner: 'suite', name: 'message-handoff', revision: '1', digest: 'suite:handoff' }
const proof = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: `suite:${record}`,
})
const MODEL_CALL = ok(decodeModelCallId(`mcall_${'0'.repeat(20)}r1`))
const ACTION = ok(decodeActionId('core-r1/action'))
const RESULT_VERSION = 'v1'

function toolMessage(): Message {
  return {
    id: 'msg_c0nf0rmance0000000000002',
    role: 'tool',
    blocks: [
      {
        kind: 'tool_result',
        id: 'block-result',
        visibility: { toHuman: true, toModel: true },
        callId: 'tc-1',
      },
      { kind: 'text', id: 'block-body', visibility: { toHuman: true, toModel: true }, text: 'ok' },
    ],
  } as unknown as Message
}

type Source = 'model-reply' | 'tool-result'

async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

async function load(s: SqlScene) {
  return ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
}

/** P: the complete request of one H of `source`, saved at the Journal before any prepare. */
async function prepared(s: SqlScene, authority: Commit['authority'], source: Source) {
  const loaded = await load(s)
  const candidate = judgeMessage(
    source === 'model-reply' ? assistantMessage('reply') : toolMessage(),
  )
  if (!('ok' in candidate)) throw new Error('the candidate message is invalid')
  const result = (producer: unknown) => ({
    producer,
    version: RESULT_VERSION,
    delivery: null,
    source: proof(`result/${source}`),
  })
  const request = {
    kind: 'execution',
    reference: { kind: 'execution', execution: s.execution, operation: operation(`h-${source}`) },
    predecessor: loaded.revision,
    position: {
      step: loaded.checkpoint.step,
      node: source === 'model-reply' ? 'I3' : 'T5',
      slot: null,
    },
    source:
      source === 'model-reply'
        ? {
            kind: 'model-reply',
            step: loaded.checkpoint.step,
            action: ACTION,
            call: MODEL_CALL,
            result: result({ kind: 'model', call: MODEL_CALL }),
          }
        : {
            kind: 'tool-result',
            action: ACTION,
            call: ok(decodeToolCallId('tc-1')),
            result: result({ kind: 'tool', call: 'tc-1' }),
          },
    candidate: candidate.ok,
    originalAdvance: authority,
    predecessorHandoff: null,
  } as Request
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`p-${source}`),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, position: 'Q2', currentHandoff: request.reference },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: { kind: 'prepare', request },
      finish: null,
    }),
  )
  return request
}

/**
 * Ja: the fixed outcome of H with the real history of its source. The main reply carries its
 * admission fact and a caller of none; the tool result carries the `message` hand-over.
 */
async function applied(
  s: SqlScene,
  authority: Commit['authority'],
  request: Request,
  decision: Decision,
): Promise<Commit> {
  const loaded = await load(s)
  const reply = request.source.kind === 'model-reply'
  const admission = decision.kind === 'prepared' ? decision.admission : decision.evidence
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(`ja-${request.source.kind}`),
    authority,
    expected: loaded.revision,
    checkpoint: { ...loaded.checkpoint, position: 'Q4', currentHandoff: null },
    state: { kind: 'advancing' },
    events:
      decision.kind === 'prepared'
        ? [{ kind: 'message', message: decision.message, source: decision.admission }]
        : [],
    effects: [],
    caller:
      !reply && decision.kind === 'prepared'
        ? {
            kind: 'message',
            message: decision.message,
            source: proof('record/h'),
            admission: decision.admission,
          }
        : { kind: 'none' },
    replyAdmission: reply
      ? {
          step: loaded.checkpoint.step,
          action: ACTION,
          call: MODEL_CALL,
          resultVersion: RESULT_VERSION,
          decision: decision.kind === 'prepared' ? 'admitted' : 'rejected',
          source: admission,
        }
      : null,
    handoff: {
      kind: 'resolve',
      outcome: {
        request,
        origin: null,
        provider: PROVIDER,
        qualification: proof('qualification/h'),
        record: proof('record/h'),
        decision,
      },
    },
    finish: null,
  } as Commit
}

const admitted = (request: Request): Decision => ({
  kind: 'prepared',
  message: request.candidate,
  admission: proof('admission/h'),
})

const count = (s: SqlScene, table: string): number =>
  Number(s.controls?.select(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? -1)
/** The history rows a Ja writes: the message rows other than the user's initial input. */
const written = (s: SqlScene): string[] =>
  (s.controls?.select(`SELECT kind FROM sl_entry ORDER BY position`).rows ?? [])
    .map(row => String(row[0]))
    .filter(kind => kind.startsWith('message.') && kind !== 'message.user')

type Tagged =
  | { kind: 'null' }
  | { kind: 'boolean' | 'string'; value: unknown }
  | { kind: 'number'; lexeme: string }
  | { kind: 'array'; items: Tagged[] }
  | { kind: 'object'; entries: { key: string; value: Tagged }[] }
/** The plain value of the tagged JSON tree in which an entry stores its payload. */
function plainOf(tree: Tagged): unknown {
  switch (tree.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return tree.items.map(plainOf)
    case 'object':
      return Object.fromEntries(tree.entries.map(item => [item.key, plainOf(item.value)]))
  }
}

/** The recorded payload of the history row a Ja wrote, as the Session log stores it. */
const writtenEntry = (s: SqlScene, kind: string): Record<string, unknown> => {
  const rows = s.controls?.select(`SELECT entry FROM sl_entry WHERE kind = '${kind}'`).rows ?? []
  expect(rows).toHaveLength(1)
  const stored = JSON.parse(String(rows[0]?.[0])) as { payload: Tagged }
  return plainOf(stored.payload) as Record<string, unknown>
}

describe('a Ja writes the real history of its source into the Session log', () => {
  for (const [source, role] of [
    ['model-reply', 'message.assistant'],
    ['tool-result', 'message.tool'],
  ] as const) {
    it(`the ${source} enters the Session history as ${role} in the storage commit of the Agent records`, async () => {
      const { s, authority } = await opened(`history-${source}`)
      const request = await prepared(s, authority, source)
      const before = (await load(s)).revision
      s.commits.length = 0
      const receipt = ok(
        await s.view.journal.commit(await applied(s, authority, request, admitted(request))),
      )
      expect(s.commits).toEqual([['execution-record', 'session']])
      expect(written(s)).toEqual([role])
      expect(Number(receipt.revision)).toBe(Number(before) + 1)
    })

    it(`the ${source} row carries the message, the original handoff record and the prepared admission`, async () => {
      const { s, authority } = await opened(`history-${source}-pointers`)
      const request = await prepared(s, authority, source)
      ok(await s.view.journal.commit(await applied(s, authority, request, admitted(request))))
      const entry = writtenEntry(s, role)
      expect(entry.message).toEqual(request.candidate)
      // The record of the handoff and the admission of the prepared result: not one for the other.
      expect(entry.source).toEqual(proof('record/h'))
      expect(entry.admission).toEqual(proof('admission/h'))
    })

    for (const [where, pattern] of [
      ['the Session write', /INSERT INTO sl_operation/],
      ['the Agent records write', /INSERT OR REPLACE INTO er_root/],
    ] as const)
      it(`the ${source}: a failure at ${where} leaves neither side, and the same operation then commits once`, async () => {
        const { s, authority } = await opened(`history-${source}-fault-${where.length}`)
        const request = await prepared(s, authority, source)
        const ja = await applied(s, authority, request, admitted(request))
        const before = {
          rows: count(s, 'sl_entry'),
          agent: (await load(s)).revision,
          published: count(s, 'er_operation'),
        }
        s.controls?.failWrite(pattern)
        expect(await s.view.journal.commit(ja)).toHaveProperty('failure')
        expect(count(s, 'sl_entry')).toBe(before.rows)
        expect(count(s, 'er_operation')).toBe(before.published)
        expect((await load(s)).revision).toBe(before.agent)
        expect(written(s)).toEqual([])
        const receipt = ok(await s.view.journal.commit(ja))
        expect(Number(receipt.revision)).toBe(Number(before.agent) + 1)
        expect(written(s)).toEqual([role])
      })
  }

  it('a message hand-over whose source is not the original handoff record is refused (Agent SPEC: message source)', async () => {
    const { s, authority } = await opened('history-foreign-source')
    const request = await prepared(s, authority, 'tool-result')
    const ja = await applied(s, authority, request, admitted(request))
    if (ja.caller.kind !== 'message') throw new Error('fixture: a tool result Ja carries message')
    const foreign = { ...ja, caller: { ...ja.caller, source: proof('record/another') } } as Commit
    const before = { rows: count(s, 'sl_entry'), agent: (await load(s)).revision }
    const refused = await s.view.journal.commit(foreign)
    expect(refused).toMatchObject({ failure: { kind: 'invalid', field: 'caller' } })
    expect(count(s, 'sl_entry')).toBe(before.rows)
    expect((await load(s)).revision).toBe(before.agent)
    ok(await s.view.journal.commit(ja))
    expect(written(s)).toEqual(['message.tool'])
  })

  it('a rejected main reply writes no history row and asks no Session participation', async () => {
    const { s, authority } = await opened('history-rejected')
    const request = await prepared(s, authority, 'model-reply')
    const rejected: Decision = {
      kind: 'rejected',
      reason: 'invalid',
      evidence: proof('rejected/h'),
    }
    s.commits.length = 0
    ok(await s.view.journal.commit(await applied(s, authority, request, rejected)))
    expect(s.commits).toEqual([['execution-record']])
    expect(written(s)).toEqual([])
  })

  it('a retry of the main reply Ja recognizes the original receipt and writes no second row', async () => {
    const { s, authority } = await opened('history-retry')
    const request = await prepared(s, authority, 'model-reply')
    const ja = await applied(s, authority, request, admitted(request))
    const first = ok(await s.view.journal.commit(ja))
    expect(ok(await s.view.journal.commit(ja))).toEqual(first)
    expect(ok(await s.fresh().journal.commit(ja))).toEqual(first)
    expect(written(s)).toEqual(['message.assistant'])
  })
})
