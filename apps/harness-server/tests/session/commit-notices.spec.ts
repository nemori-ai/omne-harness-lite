// @module-tag slow
// The commit notices on the release tree (#1230, RFC-0015 §8「会话观察」: every commit sends a
// notice). Slow: the case starts the release tree in this process (real SQLite, real Agent and Tool
// hosts) and runs the `omne` CLI as child processes; build `apps/cli` first. The Model gateway asks
// for one Shell call, then answers with text, so one turn commits through the command entry, the
// entries channel, the log channel and the Session participation of the Agent journal commit (the
// main reply and the tool message). The case listens to `session-cordis-contract/committed` on the
// root of the formal assembly and puts every revision of the session log beside the notices that
// named it. On 4aee38a64 only the command entry sends them, so the case fails there.
import { describe, expect, it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../support/release-tree.ts'
import { noticeTable, recordNotices, settledLog, tableLines } from './commit-notices-support.ts'

const ECHO = JSON.stringify({ command: 'execute', params: { script: 'echo notices' } })
const script = toolCallsThenText(() => [{ id: 'call_echo', tool: 'Shell', arguments: ECHO }])
const options = { script, permission: 'bypass-permissions' }

const sorted = (kinds: readonly string[]) => [...kinds].sort()

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
})
