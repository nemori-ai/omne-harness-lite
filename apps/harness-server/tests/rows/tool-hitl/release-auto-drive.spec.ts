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
const APPROVAL = JSON.stringify({
  command: 'request_approval',
  params: {
    action: 'Delete the build directory',
    reason: 'It holds stale output from an earlier branch.',
    impact: 'The next build takes longer.',
    reversibility: 'The output can be built again.',
    fallback: 'I keep the directory and build into a new one.',
  },
})

describe('Ask in an auto-drive session (I-14)', () => {
  it(
    'neither command runs: no card, no Tool record, and the model reads why',
    { timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(() => [
        { id: 'call_ask', tool: 'Ask', arguments: ASK },
        { id: 'call_approval', tool: 'Ask', arguments: APPROVAL },
      ])
      await onReleaseTree(
        { script, permission: 'bypass-permissions', collaboration: 'auto-drive' },
        async world => {
          const session = await world.startSession('start')
          const history = await pollUntil(
            'the two results of Ask',
            () => historyOf(world, session),
            seen => seen.filter(entry => entry.kind === 'message.tool').length === 2,
          )
          expect(toolResults(history)).toEqual([
            'Ask: the command "ask" is not available now. This session does not let you ask a person (collaboration mode). Continue without the answer, or stop and report what you need.',
            'Ask: the command "request_approval" is not available now. This session does not let you ask a person for approval (collaboration mode). This is not permission: do not do the action.',
          ])
          expect(await world.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
          expect(toolLedger(world.storageRoot)).toEqual([])
        },
      )
    },
  )
})
