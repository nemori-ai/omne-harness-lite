// @module-tag slow
import { describe, expect, it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../support/release-tree.ts'
import { noticeTable, recordNotices, settledLog, tableLines } from './commit-notices-support.ts'

const ECHO = JSON.stringify({
  command: 'execute',
  intent: 'test call',
  params: { script: 'echo notices' },
})
const script = toolCallsThenText(() => [{ id: 'call_echo', tool: 'Shell', arguments: ECHO }])
const options = { script, permission: 'bypass-permissions' }

const sorted = (kinds: readonly string[]) => [...kinds].sort()

// The facts of one call reach the log from two reporters: the producer's own report, and what the
// Session reads off the Agent's output. The log takes the two commits in either order, so the
// commits of one call are compared as a set.
function callsAsSets(lines: readonly string[]): string[] {
  const out: string[] = []
  let facts: string[] = []
  for (const line of [...lines, '']) {
    if (line.startsWith('call.execution-fact')) {
      facts.push(line)
      continue
    }
    out.push(...facts.sort())
    facts = []
    if (line !== '') out.push(line)
  }
  return out
}

const TURN = [
  'session.created, session.adoption, session.tool-resident-admitted, session.context-registration-changed, session.initialization-item',
  'message.user, intake.routed',
  'run.started, run.attempt-started',
  // The first step takes the input: the Session delivers it to the model view in that commit.
  'message.delivered',
  'run.batch-taken, history.annotated',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.assistant',
  'call.result-processed',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.tool',
  'call.result-processed',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.assistant',
  'call.result-processed',
  'run.attempt-released, run.terminal, history.annotated',
]

describe('the commit notices of one turn with a tool call', () => {
  it('every revision of the session log has exactly one notice, with its kinds', async () => {
    await onReleaseTree(options, async tree => {
      const recorder = recordNotices(tree.scope)
      try {
        const session = await tree.startSession('call a tool, then answer')
        const batches = await settledLog(tree.storageRoot, session)
        const notices = recorder.notices().filter(notice => notice.session === session)
        const rows = noticeTable(batches, notices, session)
        process.stdout.write(`${tableLines(rows).join('\n')}\n`)
        expect(callsAsSets(batches.map(batch => batch.kinds.join(', ')))).toEqual(TURN)
        expect(rows.filter(row => row.notices !== 1)).toEqual([])
        for (const batch of batches) {
          const notice = notices.find(item => item.revision === batch.revision)
          expect(sorted(notice?.kinds ?? []), `revision ${batch.revision}`).toEqual(
            sorted(batch.kinds),
          )
          expect(notice?.source.revision, `revision ${batch.revision}`).toBe(batch.revision)
        }
      } finally {
        recorder.stop()
      }
    })
  }, 180_000)

  it('the same commit again is recalled and tells nothing more', async () => {
    await onReleaseTree(options, async tree => {
      const recorder = recordNotices(tree.scope)
      try {
        const session = await tree.startSession('call a tool, then answer')
        await settledLog(tree.storageRoot, session)
        const told = () => recorder.notices().filter(notice => notice.session === session)
        const before = told().length
        const first = await tree.archive(session)
        if (!('ok' in first)) throw new Error(`the archive: ${JSON.stringify(first)}`)
        const again = await tree.archive(session)
        if (!('ok' in again)) throw new Error(`the archive again: ${JSON.stringify(again)}`)
        expect(again.ok.receipt.revision).toBe(first.ok.receipt.revision)
        await new Promise(resolve => setTimeout(resolve, 500))
        expect(
          told()
            .map(notice => notice.revision)
            .slice(before),
        ).toEqual([first.ok.receipt.revision])
      } finally {
        recorder.stop()
      }
    })
  }, 180_000)
})
