import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import {
  judgeDefinition,
  judgePositionedSubject,
  type Conclusion,
} from '@omne-harness-lite/loop-extension'
import { prepareRunnerConclusion, type ReadPassConclusionsInput } from '@omne-harness-lite/loop-extension-runner'
import { readPassConclusions } from '../src/pass-history.ts'

const tenant = parseTenantId({ organization: 'history-org', account: 'history-account' })
const session = parseOpaqueIdentifier('history-session', 'SessionRef')
const subject = judgePositionedSubject({
  position: 'after_persist_message',
  subject: {
    message: { id: 'message', type: 'user', blocks: [], createdAt: '2026-09-29T00:00:00Z' },
  },
})
const definition = judgeDefinition({
  name: 'extension',
  position: 'after_persist_message',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'extension' },
})
if (!('ok' in tenant) || !('ok' in session) || !('ok' in subject) || !('ok' in definition))
  throw new Error('invalid fixture')
const binding = {
  session: session.ok,
  tenant: tenant.ok,
  logGeneration: 'history-generation',
}
const input: ReadPassConclusionsInput = {
  initial: subject.ok,
  anchor: 'message',
  run: 'history-run',
  binding,
  chain: [{ definition: definition.ok, power: 'veto' }],
  entries: [],
  tail: 0,
}
function entry(position: number, attempt: number, ask = false) {
  const value: Conclusion = {
    extension: 'extension',
    position: 'after_persist_message',
    power: 'veto',
    at: '2026-09-29T00:00:00Z',
    output: ask
      ? {
          kind: 'ask',
          card: {
            explanation: 'choose',
            options: [{ id: 'yes', label: 'Yes' }],
            about: { position: 'after_persist_message' },
          },
        }
      : { kind: 'observed' },
  }
  const result = prepareRunnerConclusion({
    session: binding.session,
    tenant: binding.tenant,
    execution: { kind: 'withRun', run: 'history-run', attempt },
    anchor: 'message',
    occurrence: ask ? { kind: 'ask', ordinal: 1 } : { kind: 'final' },
    value,
    reminders: [],
  })
  if (!('entry' in result)) throw new Error('invalid entry')
  const checked = checkAppendInput(
    binding.session,
    [result.entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if (!('ok' in checked) || checked.ok.entries[0] === undefined)
    throw new Error('invalid entry shell')
  return { ...checked.ok.entries[0], session: binding.session, position }
}
describe('pure S-22 pass history without current attempt', () => {
  it('returns an owned ordered ask and final across attempts without execution ports', () => {
    const entries = [entry(1, 1, true), entry(2, 2)]
    const result = readPassConclusions({ ...input, entries, tail: 2 })
    expect(result).toMatchObject([{ output: { kind: 'ask' } }, { output: { kind: 'observed' } }])
    expect(Object.isFrozen(result)).toBe(true)
  })
  it('returns a pending ask without an answer or filling reminders', () => {
    expect(readPassConclusions({ ...input, entries: [entry(1, 1, true)], tail: 1 })).toMatchObject([
      { output: { kind: 'ask' } },
    ])
  })
  it('rejects accessor-backed history without executing it', () => {
    let reads = 0
    const accessor = { ...input }
    Object.defineProperty(accessor, 'entries', {
      get() {
        reads++
        return []
      },
      enumerable: true,
    })
    expect(readPassConclusions(accessor)).toEqual({ failure: 'invalidInput' })
    expect(reads).toBe(0)
  })
  it('distinguishes empty history, invalid tail, false attempt and missing required Run', () => {
    expect(readPassConclusions(input)).toEqual([])
    expect(readPassConclusions({ ...input, tail: -1 })).toEqual({ failure: 'replayInconsistent' })
    expect(readPassConclusions({ ...input, ...{ attempt: 0 } })).toEqual({
      failure: 'invalidInput',
    })
    const { run: _run, ...missingRun } = input
    expect(readPassConclusions(missingRun)).toEqual({ failure: 'invalidInput' })
  })
  it('rejects changed chains, wrong tenant/run, out-of-order and partial history', () => {
    const entries = [entry(1, 1, true), entry(2, 2)]
    expect(readPassConclusions({ ...input, entries, tail: 2, chain: [] })).toEqual({
      failure: 'replayInconsistent',
    })
    expect(readPassConclusions({ ...input, entries, tail: 2, run: 'other-run' })).toEqual({
      failure: 'replayInconsistent',
    })
    expect(readPassConclusions({ ...input, entries: [...entries].reverse(), tail: 2 })).toEqual({
      failure: 'replayInconsistent',
    })
    expect(readPassConclusions({ ...input, entries, tail: 1 })).toEqual({
      failure: 'replayInconsistent',
    })
  })
})
