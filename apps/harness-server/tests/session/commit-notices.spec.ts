// @module-tag slow
// The commit notices on the release tree (#1230, RFC-0015 §8「会话观察」: every commit sends a
// notice). Slow: the case starts the release tree in this process (real SQLite, real Agent and Tool
// hosts) and runs the `omne` CLI as child processes; build `apps/cli` first. The Model gateway asks
// for one Shell call, then answers with text, so one turn commits through the command entry, the
// entries channel, the log channel and the Session participation of the Agent journal commit (the
// main reply and the tool message). The case listens to `session-cordis-contract/committed` on the
// root of the formal assembly and puts every revision of the session log beside the notices that
// named it. On 4aee38a64 only the command entry sends them, so the case fails there. The entry kinds
// of each revision are those of 4aee38a64 (C6): telling every batch changes no write, and a turn
// that ends early (a refused drive) fails here even when each of its revisions is told once.
import { describe, expect, it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../support/release-tree.ts'
import { noticeTable, recordNotices, settledLog, tableLines } from './commit-notices-support.ts'

const ECHO = JSON.stringify({ command: 'execute', params: { script: 'echo notices' } })
const script = toolCallsThenText(() => [{ id: 'call_echo', tool: 'Shell', arguments: ECHO }])
const options = { script, permission: 'bypass-permissions' }

const sorted = (kinds: readonly string[]) => [...kinds].sort()

/** The entry kinds of each revision of this turn on 4aee38a64, in their first order (C6). */
const TURN = [
  'session.created, session.adoption, session.tool-resident-admitted, session.context-registration-changed, session.initialization-item',
  'message.user, intake.routed',
  'run.started, run.attempt-started',
  'run.batch-taken, history.annotated',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.assistant',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.tool',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'call.execution-fact, history.annotated',
  'message.assistant',
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
        expect(batches.map(batch => batch.kinds.join(', '))).toEqual(TURN)
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
        // The archive of the tree uses one operation for each session, so the second is the same
        // commit again: both answers name the revision the first wrote, and it is told once.
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
