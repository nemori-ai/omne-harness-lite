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
  startAcceptances,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  ONCE,
  admittedReleases,
  answerCard,
  pendingCard,
  perMessageShell,
  perMessageTodoThroughTools,
  setGate,
} from './release-flow-support.ts'

const NOT_RELEASED = 'The tool call did not run: the person did not allow it this time.'
const GUIDED =
  'The tool call did not run. The person answered the approval card with guidance instead of a decision. Their words follow.'

// In auto_permission a Shell call, asked by default, waits on a release card; the answer ends the Run.
async function answered(
  tree: ReleaseTree,
  label: string,
  reply: readonly string[],
  into?: string,
  whileRunning?: () => Promise<void>,
) {
  let session = into
  if (session === undefined) session = await tree.startSession(`start: echo ${label}`)
  else {
    const sent = await tree.cli([
      'send-input',
      '--session',
      session,
      '--text',
      `start: echo ${label}`,
    ])
    expect(sent.status, sent.stderr).toBe(0)
  }
  const card = await pendingCard(tree, session, label)
  await answerCard(tree, card, reply, `reply-${label}`)
  await whileRunning?.()
  const ends = into === undefined ? 1 : 2
  const entries = await pollUntil(
    `the Run of ${label} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length === ends,
  )
  return {
    session,
    entries,
    question: card.question,
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

it('cancelling the Run while its release card is open withdraws the card and ends the Run', async () => {
  const exit = await onReleaseTree(
    { script: perMessageShell, permission: 'auto_permission' },
    async tree => {
      const session = await tree.startSession('start: echo cancelled')
      await pollUntil(
        'the release card of the Run',
        () => tree.cards({ sessionRef: session, states: ['pending'] }),
        cards => cards.length === 1,
      )
      const started = (await historyOf(tree, session)).find(entry => entry.kind === 'run.started')
      const run = (started?.payload as { run?: string } | undefined)?.run
      if (run === undefined) throw new Error('no Run started')
      const cancelled = await tree.cli(['cancel-run', '--session', session, '--run', run])
      expect(cancelled.status, cancelled.stderr).toBe(0)
      await pollUntil(
        'the cancelled Run to end',
        () => historyOf(tree, session),
        value => value.some(entry => entry.kind === 'run.terminal'),
      )
      await pollUntil(
        'the card to leave the pending list',
        () => tree.cards({ sessionRef: session, states: ['pending'] }),
        cards => cards.length === 0,
      )
      // Session ends the Run at once; the Agent winds down after it and may withdraw the card later.
      // The session takes the next input: a new Run asks again, and its answer ends it.
      const next = await answered(tree, 'after', ['--option', 'deny-once'], session)
      expect(next.result).toContain(NOT_RELEASED)
      expect(toolCalls(tree.storageRoot).some(row => row.tool === 'Shell')).toBe(false)
    },
  )
  expect(exit).toBe(0)
})

// The fallback check is ten minutes away, so only the change of the card can wake the waiting Run.
it(
  'the answer to a release card wakes the Run that waits on it, without the fallback check',
  { timeout: 120_000 },
  async () => {
    const exit = await onReleaseTree(
      { script: perMessageShell, permission: 'auto_permission', reconciliationDelaysMs: [600_000] },
      async tree => {
        const woken = await answered(tree, 'woken', ['--option', 'allow-once'])
        expect(woken.result).not.toContain('did not run')
        expect(woken.started).toBe(true)
      },
    )
    expect(exit).toBe(0)
  },
)

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
        ['allow-once', true],
        ['allow-session', true],
        ['allow-always', true],
        ['deny-always', true],
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

// One action either way: a resident tool called directly, or a nonresident one carried by Tools.
// The carried TodoItems is automatic by default; its gate is set to ask, so the call has a card.
// The admission record lives as long as its execution, so it is read while the slow Shell call runs.
it.each([
  ['directly', 'Shell', { script: perMessageShell }, false, 'slow-released'],
  [
    'through Tools',
    'TodoItems',
    { script: perMessageTodoThroughTools, nonresident: ['TodoItems'] },
    true,
    'released',
  ],
] as const)(
  'a call made %s and released once runs once, its admission records the consumption, and the next call asks again',
  async (_how, tool, how, asks, label) => {
    const exit = await onReleaseTree(
      { ...how, permission: 'auto_permission', extraHistoryKinds: [ONCE] },
      async tree => {
        if (asks)
          await setGate(
            tree,
            { kind: 'asset', category: 'tool', name: tool },
            'invoke',
            'ask',
            'todo-asks',
          )
        let recorded: ReturnType<typeof admittedReleases> = []
        const released = await answered(
          tree,
          label,
          ['--option', 'allow-once'],
          undefined,
          async () => {
            if (label.startsWith('slow-'))
              recorded = await pollUntil(
                'the admission to record the release it used',
                () => admittedReleases(tree.storageRoot),
                rows => rows.some(row => row.by === 'once'),
              )
          },
        )
        expect(released.question).toMatchObject({ kind: 'release', target: { tool } })
        expect(released.result).not.toContain('did not run')
        const granted = released.entries.filter(entry => entry.kind === ONCE)
        expect(granted).toHaveLength(1)
        const payload = granted[0]?.payload as {
          expression: { scope: { consumer: unknown }; source: unknown }
        }
        const { expression } = payload
        expect(expression).toMatchObject({
          scope: { kind: 'once', consumer: { owner: '@omne-harness/agent' } },
          direction: 'grant',
        })
        if (label.startsWith('slow-'))
          expect(recorded).toContainEqual({
            by: 'once',
            grant: expect.objectContaining({ via: 'once', source: expression.source }),
          })
        expect(startAcceptances(tree.storageRoot)).not.toHaveLength(0)
        expect(startAcceptances(tree.storageRoot).filter(row => 'authorizations' in row)).toEqual(
          [],
        )

        const again = await answered(tree, 'again', ['--option', 'deny-once'], released.session)
        expect(again.result).toContain(NOT_RELEASED)
        expect(again.entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === tool)).toHaveLength(1)
      },
    )
    expect(exit).toBe(0)
  },
)
