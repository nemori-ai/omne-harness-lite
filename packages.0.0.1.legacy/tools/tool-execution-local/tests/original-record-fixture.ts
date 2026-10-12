import { vi } from 'vitest'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { unwrap } from '@omne-harness-lite/identity-values'
import {
  captureToolJournalValue,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolOriginalIssue } from '../src/original-issue.ts'
import { at, definition, fixture, ref, request, scope } from './execution-owner-fixture.ts'

export function recordValue(input: unknown): ToolJournalPayload {
  const value = captureToolJournalValue(input)
  if ('invalid' in value) throw new Error('invalid test record')
  return value
}

export async function originalRecordFixture() {
  const f = await fixture()
  const source = await f.log.participant.source(f.support.access, scope)
  if ('failure' in source) throw new Error('test source unavailable')
  const original = createToolOriginalIssue({
    support: f.support,
    generation: 'record-test-owner',
    expected: { scope, ownerGeneration: f.journal.generation, tail: source.source.tail },
    value: {
      revision: 1,
      kind: 'execution_intended',
      ref,
      origin: request.origin,
      selected: {
        capability: 'tool:echo',
        asset: 'echo-asset',
        version: '1',
        adoption: 'adopted',
        definition,
      },
      input: {
        format: 'tool-input/1',
        submission: { adoption: 'adopted' },
        acceptedAt: at,
        chain: [],
        pass: 'after-action-pass',
      },
    },
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
    stopped: new Promise(() => {}),
    isOpen: f.journal.isCurrent,
    isRetained: f.journal.isCurrent,
  })
  const issued = await f.support.admission.admitOriginal(original.participant)
  if (issued.kind !== 'issued') throw new Error('test original not issued')
  const consumed = await f.support.admission.consumeOriginal(issued.claim)
  if (consumed.kind !== 'launch') throw new Error('test original not consumed')
  f.appendIn.mockClear()
  const readByKeyIn = vi.fn(f.support.log.readByKeyIn)
  f.support.log.readByKeyIn = readByKeyIn
  async function read() {
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error(`test read failed: ${view.reason}`)
    return view
  }
  async function commitInput() {
    const view = await read()
    return {
      ref: { ...ref },
      origin: { ...request.origin },
      expected: { ownerGeneration: f.journal.generation, tail: view.prefix.tail },
      values: [
        recordValue({
          revision: 1,
          ref,
          kind: 'execution_context_read',
          readIndex: 1,
          values: [{ key: 'workspace', revision: 'one', value: 'original', observedAt: at }],
        }),
      ],
    }
  }
  return { ...f, read, readByKeyIn, commitInput }
}
