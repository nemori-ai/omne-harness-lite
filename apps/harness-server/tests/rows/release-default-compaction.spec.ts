// @module-tag slow
import { expect, it } from 'vitest'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { readHistoryFrom, readHistoryPage, type HistoryEntry } from '../support/protocol-clients.ts'
import { savedTenant } from '../r9/support.ts'
import { observeCompactionFailures } from '../support/compaction-observation.ts'
import { liveCompactionSummary } from '../support/live-compaction-summary.ts'
import { decodeCompactionOutcome } from '@omne-harness/agent-contract'

const SUMMARY =
  'default-summary-marker: the earlier investigation is complete; finish the original task.'
const FIRST =
  'FIRST: Harbor investigation decisions: tenant isolation is mandatory. ' +
  'The compaction contract belongs to Agent and its provider is injected with Cordis. ' +
  'The contract file is packages/agent/agent-contract/src/compaction.ts. ' +
  'Keep the original operation compaction-task-42 when reconciling an unknown result. ' +
  'Remaining work: add cancellation recovery tests before release. Never replay already compressed prefixes. ' +
  'memo '.repeat(12_000)
const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

async function allHistory(world: ReleaseTree, session: string): Promise<readonly HistoryEntry[]> {
  const tenant = savedTenant(world.home)
  let page = await readHistoryPage(world.clients, tenant, session)
  const entries: HistoryEntry[] = []
  for (;;) {
    if (page.outcome !== 'succeeded') throw new Error(`history read: ${page.outcome}`)
    entries.push(...page.body.entries)
    if (page.body.exhausted) return entries
    if (page.body.next === null) throw new Error('a partial history page has no cursor')
    page = await readHistoryFrom(world.clients, tenant, session, page.body.next)
  }
}

it(
  'runs the default provider through Model and resumes the same Run after its summary',
  { timeout: 240_000 },
  async () => {
    const main: string[] = []
    const summaries: string[] = []
    const live = process.env['OMNE_LIVE_COMPACTION'] === '1' ? liveCompactionSummary() : null
    await onReleaseTree(
      {
        permission: 'bypass-permissions',
        collaboration: 'co-work',
        compactionTriggerPercent: '20',
        script: ({ body }) => {
          const request = JSON.parse(body) as { model: string }
          const serving = { model: request.model, provider: 'OpenAI' }
          if (body.includes('Summarize the conversation so far for a later request')) {
            summaries.push(body)
            if (live !== null) return live.summarize(body)
            return {
              status: 200,
              contentType: 'text/event-stream',
              body: sse([
                { ...serving, choices: [{ delta: { content: SUMMARY } }] },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ]),
            }
          }
          main.push(body)
          if (main.length > 25) throw new Error('the long conversation did not trigger compaction')
          const continuing = summaries.length === 0
          const content = continuing
            ? main.length === 1
              ? FIRST
              : `STEP ${main.length}: ` + 'memo '.repeat(12_000)
            : 'original-task-complete'
          const events: unknown[] = []
          for (let start = 0; start < content.length; start += 50_000)
            events.push({
              ...serving,
              choices: [{ delta: { content: content.slice(start, start + 50_000) } }],
            })
          if (continuing)
            events.push({
              ...serving,
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_${main.length}`,
                        type: 'function',
                        function: {
                          name: 'Ask',
                          arguments: JSON.stringify({ command: 'unknown-command', params: {} }),
                        },
                      },
                    ],
                  },
                },
              ],
            })
          events.push({
            choices: [{ delta: {}, finish_reason: continuing ? 'tool_calls' : 'stop' }],
          })
          return { status: 200, contentType: 'text/event-stream', body: sse(events) }
        },
      },
      async world => {
        const failures = observeCompactionFailures(world.scope)
        const session = await world.startSession('Investigate and finish the original task.')
        let history: readonly HistoryEntry[] = []
        const observation = await pollUntil(
          'default compaction and Run completion',
          async () => {
            history = await allHistory(world, session)
            return {
              kinds: history.map(entry => entry.kind),
              main: main.length,
              summaries: summaries.length,
              failures,
            }
          },
          observation => observation.kinds.includes('run.terminal'),
        )
        expect(observation.kinds, JSON.stringify(observation)).toContain('run.terminal')
        expect(main.length).toBeGreaterThan(3)
        expect(main.length).toBeLessThanOrEqual(25)
        expect(summaries).toHaveLength(1)
        expect(summaries[0]).toContain(FIRST)
        const entry = history.find(entry => entry.kind === 'message.compaction')
        const decoded = decodeCompactionOutcome(
          JSON.stringify({ kind: 'completed', message: entry?.payload['message'] }),
        )
        if ('failure' in decoded || decoded.ok.kind !== 'completed')
          throw new Error('no legal adopted compaction message')
        const summary = decoded.ok.message.blocks
          .flatMap(block => (block.kind === 'text' ? [block.text] : []))
          .join('\n')
        const checks = {
          project: summary.includes('Harbor'),
          tenantIsolation: /tenant.{0,40}isolat/is.test(summary),
          ownership: summary.includes('Agent') && summary.includes('Cordis'),
          file: summary.includes('packages/agent/agent-contract/src/compaction.ts'),
          identity: summary.includes('compaction-task-42'),
          cancellation: /cancel.{0,40}recover/is.test(summary),
          noOldPrefix: /compressed.{0,40}prefix|prefix.{0,40}compress/is.test(summary),
        }
        live?.record({
          stage: 'run-completed',
          summary,
          checks,
          session,
          beforeBytes: Buffer.byteLength(main.at(-2) ?? ''),
          afterBytes: Buffer.byteLength(main.at(-1) ?? ''),
          mainRequests: main.length,
          summaryRequests: summaries.length,
          runStarts: history.filter(entry => entry.kind === 'run.started').length,
          runTerminals: history.filter(entry => entry.kind === 'run.terminal').length,
        })
        if (live === null) expect(summary).toBe(SUMMARY)
        else expect(Object.values(checks).every(Boolean), JSON.stringify(checks)).toBe(true)
        expect(Buffer.byteLength(main.at(-1) ?? '')).toBeLessThan(
          Buffer.byteLength(main.at(-2) ?? ''),
        )
        expect(main.at(-1)).toContain(JSON.stringify(summary).slice(1, -1))
        expect(main.at(-1)).not.toContain(FIRST)
        expect(history.filter(entry => entry.kind === 'message.compaction')).toHaveLength(1)
        expect(history.filter(entry => entry.kind === 'run.started')).toHaveLength(1)
        expect(history.filter(entry => entry.kind === 'run.terminal')).toHaveLength(1)
        expect(JSON.stringify(history)).toContain(FIRST)
        expect(JSON.stringify(history)).toContain('original-task-complete')
      },
    )
  },
)
