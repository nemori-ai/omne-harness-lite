// readRunBoundary (SPEC「稳定调用引用的读取」, #1248): the run of a `run.started` and of a
// `run.terminal` entry. Every entry is built with this member's own encoder, the writer of both
// payloads.
import { describe, expect, it } from 'vitest'
import { encodeEntry } from '../src/entries.ts'
import type { SessionEntry } from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'
import { readRunBoundary } from '../src/run-boundary.ts'

const ORIGIN = {
  owner: 'session',
  via: null,
  source: { owner: 'session', record: 'r', digest: 'd', revision: '1' },
} as unknown as HistoryEntry['origin']

function encoded(entry: Readonly<Record<string, unknown>>) {
  return encodeEntry(entry as unknown as SessionEntry, ORIGIN)
}

function started(run: unknown) {
  return encoded({
    kind: 'run.started',
    run,
    execution: 'x',
    entry: 'interactive',
    first: 'i-1',
    predecessor: null,
    adoption: {},
  })
}

function terminal(run: unknown) {
  return encoded({
    kind: 'run.terminal',
    terminal: { run, outcome: 'completed' },
    sequence: null,
    cause: null,
    disposition: null,
    bounded: null,
  })
}

describe('readRunBoundary', () => {
  it('reads the run of a run.started entry', () => {
    expect(readRunBoundary(started('run_1'))).toEqual({ kind: 'started', run: 'run_1' })
  })

  it('reads the run of a run.terminal entry', () => {
    expect(readRunBoundary(terminal('run_1'))).toEqual({ kind: 'terminal', run: 'run_1' })
  })

  it('answers null for another entry kind, even one that carries a run', () => {
    const attempt = encoded({
      kind: 'run.attempt-started',
      run: 'run_1',
      attempt: 'a-1',
      ordinal: '1',
      instance: 'agent-1',
      reason: 'start',
    })
    expect(readRunBoundary(attempt)).toBeNull()
    expect(readRunBoundary({ kind: 'call.bound', payload: started('run_1').payload })).toBeNull()
  })

  it('answers null when the payload does not carry the run', () => {
    const withoutRun = {
      kind: 'run.started',
      execution: 'x',
      entry: 'interactive',
      first: 'i-1',
      predecessor: null,
      adoption: {},
    }
    expect(readRunBoundary(encoded(withoutRun))).toBeNull()
    expect(
      readRunBoundary(
        encoded({ kind: 'run.terminal', sequence: null, cause: null, disposition: null }),
      ),
    ).toBeNull()
    expect(readRunBoundary(terminal(undefined))).toBeNull()
  })

  it('answers null when the run is not text', () => {
    expect(readRunBoundary(started(7))).toBeNull()
    expect(readRunBoundary(terminal({ id: 'run_1' }))).toBeNull()
  })
})
