// @module-tag slow
// Restarts the release tree at the points between a person's release and the start of the call.
import { expect, it } from 'vitest'
import { toolTargetPolicyOf } from '../../../src/rows/authorization/tool-target-policy.ts'
import {
  historyOf,
  hostRecords,
  onReleaseTreeRuns,
  pollUntil,
  startAcceptances,
  toolCalls,
  toolCallsByRequest,
  toolLedger,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { ONCE, answerCard, pendingCard, perMessageShell } from './release-flow-support.ts'

const options = {
  script: perMessageShell,
  permission: 'auto_permission',
  extraHistoryKinds: [ONCE],
}

async function releaseOnce(tree: ReleaseTree, label: string, released: () => void) {
  const session = await tree.startSession(`start: echo ${label}`)
  const card = await pendingCard(tree, session, label)
  released()
  await answerCard(tree, card, ['--option', 'allow-once'], `reply-${label}`)
  return session
}

// A dependency that cannot answer now: its caller waits in a place the restart resumes from.
function counted() {
  let entered = 0
  return {
    entered: () => entered,
    enter() {
      entered += 1
    },
  }
}
const NOT_NOW = 'test: not reachable before the restart'

// What the Tool holds for the calls, for a failed wait to say where the call stopped.
const toolSide = (tree: ReleaseTree) =>
  JSON.stringify({
    ledger: toolLedger(tree.storageRoot),
    host: hostRecords(tree.storageRoot).map(record => [record['kind'], record['call']]),
  })

async function ranOnce(tree: ReleaseTree, session: string, label: string) {
  const { entries } = await pollUntil(
    `the Run of ${label} to end after the restart`,
    async () => ({
      entries: await historyOf(tree, session),
      tool: toolSide(tree),
    }),
    value => value.entries.some(entry => entry.kind === 'run.terminal'),
  )
  expect(toolResults(entries).join('\n')).toContain(`${label}-done`)
  expect(entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
  expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(1)
  expect(startAcceptances(tree.storageRoot).filter(row => 'authorizations' in row)).toHaveLength(1)
}

// The working directory of a session has no value in a rebuilt process until a step begins. A Shell
// call released there is answered unavailable; the model makes it again in its next step.
const NO_DIRECTORY = 'unavailable: this session has no working directory in force now'
type Turn = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
const echoAgain = toolCallsByRequest(body => {
  const { messages } = JSON.parse(body) as { messages: readonly Turn[] }
  const made = messages.filter(turn => (turn.tool_calls?.length ?? 0) > 0).length
  const refused = messages.some(
    turn => turn.role === 'tool' && JSON.stringify(turn.content).includes(NO_DIRECTORY),
  )
  if (made > 0 && !(made === 1 && refused)) return []
  const script = { script: 'echo open-done' }
  const call = JSON.stringify({ command: 'execute', intent: 'test call', params: script })
  return [{ id: `call_open_${String(made)}`, tool: 'Shell', arguments: call }]
})

it(
  'a release card left open over a restart is answered after it; the call is answered unavailable, and made again in the next step it runs once',
  { timeout: 300_000 },
  async () => {
    let session = ''
    await onReleaseTreeRuns({ ...options, script: echoAgain }, [
      async tree => {
        session = await tree.startSession('start: echo open')
        await pendingCard(tree, session, 'open, before the restart')
      },
      async tree => {
        const card = await pendingCard(tree, session, 'open, after the restart')
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-open')
        const again = await pendingCard(tree, session, 'open, made again in the next step')
        expect(again.ref.request.requestId).not.toBe(card.ref.request.requestId)
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(0)
        await answerCard(tree, again, ['--option', 'allow-once'], 'reply-open-again')
        const entries = await pollUntil(
          'the Run of open to end after the restart',
          () => historyOf(tree, session),
          value => value.some(entry => entry.kind === 'run.terminal'),
        )
        const results = toolResults(entries).join('\n')
        expect(results.split(NO_DIRECTORY)).toHaveLength(2)
        expect(results).toContain('open-done')
        // The first answer released nothing: its call was answered before it was admitted. The
        // answer to the call made again released that call, and the Tool was handed it once.
        expect(entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(1)
      },
    ])
  },
)

it(
  'a restart after the release and before the call is handed to the Tool hands it once',
  { timeout: 300_000 },
  async () => {
    let session = ''
    await onReleaseTreeRuns(options, [
      async tree => {
        const runtime = tree.toolRuntime()
        const invoke = runtime.invoke.bind(runtime)
        const stopped = counted()
        Object.assign(runtime, {
          invoke: async (input: Parameters<typeof invoke>[0]) => {
            if (input.request.availability.definition.name !== 'Shell') return invoke(input)
            stopped.enter()
            const failure = { kind: 'unavailable', dependency: 'toolRuntime', diagnostic: NOT_NOW }
            return { kind: 'rejected', failure } as Awaited<ReturnType<typeof invoke>>
          },
        })
        session = await releaseOnce(tree, 'handed', () => {})
        await pollUntil(
          'the Agent to hand the call over',
          async () => stopped.entered(),
          n => n > 0,
        )
        const entries = await historyOf(tree, session)
        expect(entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(0)
      },
      tree => ranOnce(tree, session, 'handed'),
    ])
  },
)

// The environment the Tool prepared is gone with the process, so the Tool ends the call as never
// started and the Run goes on. The release is still held and nobody is asked again.
it(
  'a restart after the Tool took the call and before it started ends the call never started, and the Run goes on',
  { timeout: 180_000 },
  async () => {
    let session = ''
    await onReleaseTreeRuns(options, [
      async tree => {
        const policy = toolTargetPolicyOf(tree.scope)
        if (policy === undefined) throw new Error('no target policy installed')
        const qualify = policy.qualify.bind(policy)
        const stopped = counted()
        let released = false
        let asked = 0
        // Once released, the Tool asks when it takes the call, then again when it would start it.
        Object.assign(policy, {
          qualify: (input: Parameters<typeof qualify>[0]) => {
            if (!released || input.request.availability.definition.name !== 'Shell')
              return qualify(input)
            asked += 1
            if (asked === 1) return qualify(input)
            stopped.enter()
            return { kind: 'unavailable', diagnostic: NOT_NOW } as const
          },
        })
        session = await releaseOnce(tree, 'taken', () => {
          released = true
        })
        await pollUntil(
          'the Tool to reach the start',
          async () => stopped.entered(),
          n => n > 0,
        )
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(1)
        expect(startAcceptances(tree.storageRoot)).toHaveLength(0)
      },
      async tree => {
        const { entries } = await pollUntil(
          'the Run of the taken call to end after the restart',
          async () => ({ entries: await historyOf(tree, session), tool: toolSide(tree) }),
          value => value.entries.some(entry => entry.kind === 'run.terminal'),
        )
        expect(toolResults(entries).join('\n')).not.toContain('taken-done')
        expect(toolLedger(tree.storageRoot).filter(row => row.tool === 'Shell')).toMatchObject([
          { phase: 'settled', terminal: 'unavailable', execution: 'not-started' },
        ])
        expect(entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
        expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
        expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(1)
        expect(startAcceptances(tree.storageRoot)).toHaveLength(0)
      },
    ])
  },
)
