// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolLedger,
  toolResults,
} from '../../support/release-tree.ts'

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})
describe('Ask in an auto-drive session', () => {
  it(
    'ask does not run: no card, no Tool record, and the model reads why',
    { timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(() => [{ id: 'call_ask', tool: 'Ask', arguments: ASK }])
      await onReleaseTree(
        { script, permission: 'bypass-permissions', collaboration: 'auto-drive' },
        async world => {
          const session = await world.startSession('start')
          const history = await pollUntil(
            'the result of Ask',
            () => historyOf(world, session),
            seen => seen.some(entry => entry.kind === 'message.tool'),
          )
          expect(toolResults(history)).toEqual([
            'Ask: the command "ask" is not available here: no person can be asked for an answer in this session now. Continue without it, or stop and report what you need.',
          ])
          expect(await world.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
          expect(toolLedger(world.storageRoot)).toEqual([])
        },
      )
    },
  )
})
