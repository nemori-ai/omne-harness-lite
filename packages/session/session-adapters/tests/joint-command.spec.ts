import { describe, expect, it } from 'vitest'
import type { CallerCommit, Failure } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { deriveSessionOperation, type ProducedResult } from '@omne-harness/session-contract'
import {
  assistantMessage,
  evidence,
  memoryAccess,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { jointCommandOf, joinsSession, type JointState } from '../src/joint-command.ts'

const access = memoryAccess('tester')
const scope = { tenant: access.tenant, session: access.session }
const receipt = { revision: '3', evidence: evidence('receipt') } as never
const none: CallerCommit = { kind: 'none' }
const reply: CallerCommit = {
  kind: 'message',
  message: assistantMessage('answer'),
  source: evidence('source'),
  admission: evidence('admission'),
}
const accepted = (...ids: string[]) =>
  ids.map(id => ({
    id,
    content: ordinaryInput(id).message,
    source: evidence(`source/${id}`),
    priority: 'ordinary',
  })) as never
const write = (ordered: readonly string[] | null) =>
  ({
    ...access,
    execution: 'execution-1',
    operation: 'operation-1',
    events:
      ordered === null
        ? []
        : [{ kind: 'input-taken', batch: { id: 'batch-1', watermark: evidence('w'), ordered } }],
  }) as never
const noResult: JointState['resultOf'] = () => fail<Failure>({ kind: 'denied', action: 'result' })
const state = (over: Partial<JointState> = {}): JointState => ({
  accepted: accepted('a', 'b'),
  snapshot: {},
  resultOf: noResult,
  ...over,
})
const command = (ordered: readonly string[] | null, caller: CallerCommit, s = state()) =>
  jointCommandOf(scope, write(ordered), 'commit', receipt, caller, s)

describe('the Session command of a joint write', () => {
  it('a write that takes a batch delivers the inputs the model has not been shown, in batch order', () => {
    expect(command(['b', 'a'], none)).toEqual({
      ok: {
        kind: 'recordMessage',
        input: {
          ...scope,
          operation: deriveSessionOperation({
            kind: 'participation',
            execution: 'execution-1' as never,
            operation: 'operation-1' as never,
            joint: 'delivered',
          }),
          participation: {
            execution: 'execution-1',
            operation: 'operation-1',
            joint: 'delivered',
            written: '3',
            handover: evidence('receipt'),
          },
          value: {
            deliveries: [
              { input: 'b', message: ordinaryInput('b').message },
              { input: 'a', message: ordinaryInput('a').message },
            ],
            source: evidence('receipt'),
            admission: evidence('receipt'),
          },
        },
      },
    })
    const shown = state({ snapshot: { deliveredTail: ['a'] as never } })
    expect(command(['b', 'a'], none, shown)).toMatchObject({
      ok: { input: { value: { deliveries: [{ input: 'b' }] } } },
    })
  })

  it('a write with nothing to deliver carries no command and does not join', () => {
    const shown = state({ snapshot: { deliveredTail: ['a', 'b'] as never } })
    for (const [ordered, s] of [
      [null, state()],
      [[], state()],
      [['a', 'b'], shown],
    ] as const) {
      expect(command(ordered, none, s)).toBeUndefined()
      expect(joinsSession(write(ordered), 'commit', none, s)).toBe(false)
    }
    expect(jointCommandOf(scope, write(['a']), 'submit', receipt, none, state())).toBeUndefined()
    expect(joinsSession(write(['a']), 'submit', none, state())).toBe(false)
  })

  it('a batch to deliver joins the Session; without the Session state or a message it fails', () => {
    expect(joinsSession(write(['a']), 'commit', none, state())).toBe(true)
    for (const s of [
      state({ snapshot: null }),
      state({ snapshot: undefined }),
      state({ accepted: undefined }),
      state({ accepted: accepted('b') }),
    ]) {
      expect(joinsSession(write(['a']), 'commit', none, s)).toBe(true)
      expect(command(['a'], none, s)).toMatchObject({
        failure: { kind: 'unavailable', owner: 'session-delivery' },
      })
    }
  })

  it('a caller hands its own command over; with an empty batch it still does, with a batch it fails', () => {
    expect(joinsSession(write(null), 'commit', reply, state())).toBe(true)
    for (const ordered of [null, []] as const)
      expect(command(ordered, reply)).toMatchObject({
        ok: {
          kind: 'recordMessage',
          input: { participation: { joint: 'message' }, value: { consumption: null } },
        },
      })
    expect(command(['a'], reply)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-delivery' },
    })
  })

  it('a context transition must carry a compaction message; a result caller needs its original result', () => {
    const transition = {
      kind: 'context-transition',
      value: { message: assistantMessage('not a summary'), epoch: 'epoch:1' },
      admission: evidence('admission'),
    } as never
    expect(command(null, transition)).toMatchObject({
      failure: { kind: 'invalid', field: 'caller.value.message' },
    })
    const custody = {
      kind: 'custody',
      result: { producer: { kind: 'tool', call: 'call-1' } },
      consumption: 'consumption-1',
      retained: evidence('retained'),
    } as never
    expect(command(null, custody)).toEqual({ failure: { kind: 'denied', action: 'result' } })
    const original = { version: '1' } as unknown as ProducedResult
    expect(command(null, custody, state({ resultOf: () => succeed(original) }))).toMatchObject({
      ok: {
        kind: 'preserveResult',
        input: { consumption: 'consumption-1', result: original, custody: evidence('retained') },
      },
    })
  })
})
