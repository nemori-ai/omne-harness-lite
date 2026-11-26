// @module-tag slow
import { expect, it } from 'vitest'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import { onReleaseTree, sse } from '../../support/release-tree.ts'
import { ASKED, confirmedToTheEnd, proposed, PROPOSE, reminders } from './journey.ts'

const SUMMARIZE = 'Summarize the conversation so far for a later request'
const SUMMARY = 'goal-summary-marker: the change note is still to be written.'
const COMPACTED = 'The context of this session was compacted. Its goal still stands'
const PADDING = 'memo '.repeat(12_000)

type Delta = Readonly<Record<string, unknown>>
const call = (id: string, name: string, args: string): Delta => ({
  tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: args } }],
})

/**
 * The scripted agent: it proposes the goal when asked for one; once the goal stands it fills its
 * context with long replies and a call each, until the context was compacted; then it stops.
 */
function agentScript(main: string[], summaries: string[]) {
  return ({ body }: { body: string }) => {
    const serving = { model: (JSON.parse(body) as { model: string }).model, provider: 'OpenAI' }
    const reply = (deltas: readonly Delta[], finish: string) => ({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        ...deltas.map(delta => ({ ...serving, choices: [{ delta }] })),
        { choices: [{ delta: {}, finish_reason: finish }] },
      ]),
    })
    if (body.includes(SUMMARIZE)) {
      summaries.push(body)
      return reply([{ content: SUMMARY }], 'stop')
    }
    main.push(body)
    if (main.length > 30) throw new Error('the long conversation did not trigger compaction')
    if (summaries.length > 0 || !body.includes(ASKED)) return reply([{ content: 'done' }], 'stop')
    if (!body.includes(PROPOSE.id))
      return reply([call(PROPOSE.id, PROPOSE.tool, PROPOSE.arguments)], 'tool_calls')
    const step = `call_pad_${String(main.length)}`
    const unknown = JSON.stringify({ command: 'unknown-command', params: {} })
    return reply(
      [{ content: `STEP ${String(main.length)}: ${PADDING}` }, call(step, 'Ask', unknown)],
      'tool_calls',
    )
  }
}

it(
  'after the context of a session was compacted, the agent is told what its goal is for and what is still open, once, before its next request',
  { timeout: 300_000 },
  async () => {
    const main: string[] = []
    const summaries: string[] = []
    const judged: AskedDecision[] = []
    const script = answeringDecisions(
      agentScript(main, summaries),
      () => ({ criterion: 'holds' }),
      judged,
    )
    const options = {
      script,
      permission: 'bypass-permissions',
      compactionTriggerPercent: '20',
      extraHistoryKinds: ['message.system_reminder', 'message.compaction'],
    }
    await onReleaseTree(options, async tree => {
      const { session, card, agent, goals } = await proposed(tree)
      const entries = await confirmedToTheEnd(tree, session, card)
      expect(summaries).toHaveLength(1)
      expect(entries.filter(entry => entry.kind === 'message.compaction')).toHaveLength(1)

      const told = reminders(entries).filter(text => text.includes(COMPACTED))
      expect(told).toHaveLength(1)
      expect(told[0]).toContain('Purpose: 把改动说明写进 CHANGELOG')
      expect(told[0]).toContain('Still open:\n- [A1] 改动说明写进了 CHANGELOG：没读过')
      const after = main.at(-1) ?? ''
      expect(after).toContain(JSON.stringify(SUMMARY).slice(1, -1))
      expect(after.split(COMPACTED)).toHaveLength(2)
      expect(after).toContain('Purpose: 把改动说明写进 CHANGELOG')
      expect(main.slice(0, -1).join('\n')).not.toContain(COMPACTED)
      expect(summaries[0]).not.toContain(COMPACTED)

      expect(judged).toHaveLength(1)
      expect(await goals.read(agent, session)).toMatchObject({
        kind: 'done',
        value: { state: { status: 'settled', outcome: { kind: 'achieved' }, rounds: 0 } },
      })
    })
  },
)
