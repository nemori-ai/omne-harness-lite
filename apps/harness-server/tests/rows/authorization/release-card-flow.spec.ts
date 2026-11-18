// @module-tag slow
// Starts the release tree with a Model script and answers a release card through the CLI.
import { expect, it } from 'vitest'
import { shellScript } from '../../governance/tenant-settings-support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const NOT_RELEASED = 'The tool call did not run: the person did not allow it this time.'
const GUIDED =
  'The tool call did not run. The person answered the approval card with guidance instead of a decision. Their words follow.'

// In auto_permission a Shell call, asked by default, waits on a release card; the answer ends the Run.
async function answered(tree: ReleaseTree, label: string, reply: readonly string[]) {
  const session = await tree.startSession(`start: echo ${label}`)
  const [item] = await pollUntil(
    `the release card of ${label}`,
    () => tree.cards({ sessionRef: session, states: ['pending'] }),
    cards => cards.length === 1,
  )
  if (item === undefined) throw new Error('no card')
  const answer = await tree.cli([
    'submit-reply',
    '--request',
    item.card.ref.request.requestId,
    '--card',
    item.card.ref.cardId,
    '--revision',
    item.card.revision,
    ...reply,
    '--reply-id',
    `reply-${label}`,
  ])
  expect(answer.status, answer.stderr).toBe(0)
  const entries = await pollUntil(
    `the Run of ${label} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  return {
    question: item.card.question,
    result: toolResults(entries).join('\n'),
    started: toolCalls(tree.storageRoot).some(row => row.tool === 'Shell'),
  }
}

const toolsScript = toolCallsThenText(body => {
  const label = /start: tools ([a-z0-9-]+)/.exec(body)?.[1]
  return label === undefined
    ? []
    : [
        {
          id: `call_${label}`,
          tool: 'Tools',
          arguments: JSON.stringify({
            command: 'execute',
            intent: 'run Shell through Tools',
            params: {
              name: 'Shell',
              command: 'execute',
              arguments: { script: `echo ${label}-done` },
            },
          }),
        },
      ]
})

// Every release tool is resident, so Tools forwards none of them: admission judges only Tools,
// which answers the model, and the Run ends instead of waiting on a target it cannot resolve.
it('a call through Tools naming a resident tool ends the Run without starting the tool', async () => {
  const exit = await onReleaseTree(
    { script: toolsScript, permission: 'bypass-permissions' },
    async tree => {
      const session = await tree.startSession('start: tools carried')
      const entries = await pollUntil(
        'the Run through Tools to end',
        () => historyOf(tree, session),
        value => value.some(entry => entry.kind === 'run.terminal'),
      )
      expect(toolResults(entries).join('\n')).not.toContain('carried-done')
      expect(toolCalls(tree.storageRoot).some(row => row.tool === 'Shell')).toBe(false)
    },
  )
  expect(exit).toBe(0)
})

it('a release card the person does not release never starts the call, whatever the answer', async () => {
  const exit = await onReleaseTree(
    { script: shellScript, permission: 'auto_permission' },
    async tree => {
      const refused = await answered(tree, 'refused', ['--option', 'deny-once'])
      expect(refused.question).toMatchObject({
        kind: 'release',
        target: { tool: 'Shell', command: 'execute', preview: 'echo refused-done' },
        origin: { agent: expect.any(String) },
      })
      expect(
        'options' in refused.question
          ? refused.question.options.map(option =>
              'offered' in option ? [option.id, option.offered] : [option.id],
            )
          : [],
      ).toEqual([
        ['deny-once', true],
        ['allow-once', false],
        ['allow-session', false],
        ['allow-always', false],
        ['deny-always', false],
      ])
      expect(refused.result).toBe(NOT_RELEASED)

      const guided = await answered(tree, 'guided', ['--text', '先别跑，看一下 README'])
      expect(guided.result).toBe(`${GUIDED}\n先别跑，看一下 README`)

      const skipped = await answered(tree, 'skipped', ['--decline'])
      expect(skipped.result).toBe(NOT_RELEASED)

      expect(skipped.started).toBe(false)
    },
  )
  expect(exit).toBe(0)
})
