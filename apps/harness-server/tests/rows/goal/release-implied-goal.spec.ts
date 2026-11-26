// @module-tag slow
import { expect, it } from 'vitest'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
} from '../../support/release-tree.ts'
import { count, goalsOf, judgingRecords, reminders, WRITE } from './journey.ts'

const INPUT = '把改动说明写进 CHANGELOG'
const SENT_ON = 'what the input that opened this run asked for does not look done yet'
type Shown = {
  goal: { purpose: string }
  evidence: { A1: { ref: string; tool: string; excerpt: string }[] }
}

it(
  'a session that drives itself and has no goal is judged by the input that opened its round: it is sent on while that does not look done, and no goal appears in the session',
  { timeout: 300_000 },
  async () => {
    const requests: string[] = []
    const judged: AskedDecision[] = []
    const chat = toolCallsByRequest(body => {
      requests.push(body)
      return body.includes(WRITE.id) ? [] : [WRITE]
    })
    const script = answeringDecisions(
      chat,
      (_ask, nth) => ({ criterion: nth === 0 ? 'fails' : 'holds' }),
      judged,
    )
    const options = {
      script,
      permission: 'bypass-permissions',
      collaboration: 'auto-drive',
      extraHistoryKinds: ['message.system_reminder'],
    } as const
    await onReleaseTree(options, async tree => {
      const session = await tree.startSession(INPUT)
      const entries = await pollUntil(
        'the round to end',
        () => historyOf(tree, session),
        found => count(found, 'run.terminal') === 1,
      )
      expect(count(entries, 'run.started')).toBe(1)
      expect(requests).toHaveLength(3)

      expect(judged).toHaveLength(2)
      expect(judged.map(ask => Object.keys(ask.questions))).toEqual([['A1'], ['A1']])
      const shown = judged[0]?.state as Shown
      expect(shown.goal.purpose).toBe(INPUT)
      expect(shown.evidence.A1.map(item => [item.ref, item.tool, item.excerpt])).toEqual([
        [WRITE.id, 'Files write', '- 首页提速'],
        ['reply', 'Reply', 'done'],
      ])

      const sentOn = reminders(entries).filter(text => text.includes(SENT_ON))
      expect(sentOn).toHaveLength(1)
      expect(sentOn[0]).toContain('- [A1] 这段输入要的事做完了：证据显示没做到（判定）')
      expect(reminders(entries).join('\n')).not.toContain('the goal of this session')
      expect(requests[1]).not.toContain(SENT_ON)
      expect(requests[2]?.split(SENT_ON)).toHaveLength(2)

      const { agent, goals } = await goalsOf(tree, session)
      expect(await goals.read(agent, session)).toEqual({
        kind: 'done',
        value: null,
        recalled: false,
      })
      const records = await judgingRecords(tree)
      expect(records.map(record => [record.consumer.position, record.outcome])).toEqual([
        ['implied.1.1.0/0/0/0', 'completed'],
        ['implied.1.1.1/0/0/0', 'completed'],
      ])
    })
  },
)
