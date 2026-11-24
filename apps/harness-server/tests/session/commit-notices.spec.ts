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

const REPORT = 'call.execution-fact, history.annotated'

// The producer of a call reports its fact on its own, and the turn does not wait for the report:
// its commit lands anywhere after the call is bound, so the turn is compared without those commits.
function everyCallIsReported(lines: readonly string[]): boolean {
  let unreported = 0
  for (const line of lines) {
    if (line.startsWith('call.bound')) unreported += 1
    if (line !== REPORT) continue
    unreported -= 1
    if (unreported < 0) return false
  }
  return unreported === 0
}

const TURN = [
  'session.created, session.adoption, session.tool-resident-admitted, session.context-registration-changed, session.initialization-item',
  'message.user, intake.routed',
  'run.started, run.attempt-started',
  // Before the first step the working directory in force is committed at the step boundary.
  'session.recovery-input-adopted',
  // Before the first step the model is told the runtime context, in a commit of its own.
  'message.system_reminder',
  // The first step takes the input: the Session delivers it to the model view in that commit.
  'message.delivered',
  'run.batch-taken, history.annotated',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'message.assistant',
  'call.result-processed',
  'call.bound, extension.passage, history.annotated',
  // The commit that records which call the tool action became tells what the step waits for.
  'extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
  'message.tool',
  'call.result-processed',
  'call.bound, extension.passage, history.annotated',
  'call.execution-fact, account.linked, entries.interpreted',
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
        const kinds = batches.map(batch => batch.kinds.join(', '))
        expect(kinds.filter(line => line !== REPORT)).toEqual(TURN)
        expect(everyCallIsReported(kinds)).toBe(true)
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
