// @module-tag slow
import { expect, it } from 'vitest'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import { setModelSwitches } from '../../support/model-switches.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
} from '../../support/release-tree.ts'
import { count, WRITE } from './journey.ts'

const JUDGE = 'openai/gpt-6-luna-decisions'

it(
  'a decisions model the tenant turned off is not sent the judging of a goal, and the round still ends (C5)',
  { timeout: 300_000 },
  async () => {
    const judged: AskedDecision[] = []
    const chat = toolCallsByRequest(body => (body.includes(WRITE.id) ? [] : [WRITE]))
    const script = answeringDecisions(chat, () => ({ criterion: 'holds' }), judged)
    const options = {
      script,
      permission: 'bypass-permissions',
      collaboration: 'auto-drive',
    } as const
    await onReleaseTree(options, async tree => {
      const listed = JSON.parse((await tree.cli(['list-models'])).stdout || '{}') as {
        outcome?: string
        body?: { models?: { kind?: string }[]; supply?: { state: string } }
      }
      expect(listed.outcome).toBe('succeeded')
      expect(listed.body?.supply).toEqual({ state: 'ready' })
      expect(new Set(listed.body?.models?.map(model => model.kind))).toEqual(new Set(['llm']))

      await setModelSwitches(tree, { [JUDGE]: false }, 'decisions')
      const session = await tree.startSession('把改动说明写进 CHANGELOG')
      const entries = await pollUntil(
        'the round to end',
        () => historyOf(tree, session),
        found => count(found, 'run.terminal') === 1,
      )
      expect(count(entries, 'run.started')).toBeGreaterThan(0)
      expect(judged).toEqual([])
    })
  },
)
