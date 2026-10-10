import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { compareInteger, type SessionLog } from '@omne-harness-lite/session-log'
import type { ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'
import { captureToolJournalValue } from '@omne-harness-lite/tool-execution-runtime'
import { createRuntimeJournal } from '../src/runtime-journal.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { ref, request } from './execution-owner-fixture.ts'

export function journalIntent() {
  const captured = captureToolJournalValue({
    revision: 1,
    kind: 'execution_intended',
    ref,
    origin: request.origin,
    input: { parameter: 'captured' },
  })
  if ('invalid' in captured) throw new Error('invalid original journal intent')
  return captured
}

/** Actual FULL SQLite append/read; application history and backing identity are controlled ports. */
export async function journalBoundaryFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-journal-boundaries-'))
  const log = await openSqlLogFixture({ dir })
  const append = vi.fn<SessionLog['append']>(log.append)
  const readSince = vi.fn(log.readSince)
  const release = vi.fn(async () => {})
  const borrow = vi.fn(() => ({ log: { append, readSince, readByKey: log.readByKey }, release }))
  const history = {
    inspect: vi.fn<ToolActionHistoryOperations['inspect']>(prefix =>
      compareInteger(prefix.tail, prefix.entries.length) === 0 &&
      prefix.entries.every((entry, i) => compareInteger(entry.position, i + 1) === 0)
        ? { kind: 'notFound' }
        : { kind: 'unavailable' },
    ),
  }
  const journal = createRuntimeJournal({
    history,
    backing: { ownerGeneration: 'boundary-generation', borrow },
  })
  function commitInput() {
    return {
      ref: { ...ref },
      origin: { ...request.origin },
      expected: { ownerGeneration: journal.generation, tail: 0 },
      values: [journalIntent()],
    }
  }
  return {
    journal,
    log,
    append,
    readSince,
    borrow,
    release,
    history,
    commitInput,
    async close() {
      await journal.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
