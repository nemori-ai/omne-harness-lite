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

it(
  'a release card left open over a restart is answered after it, and the call runs once',
  { timeout: 300_000 },
  async () => {
    let session = ''
    await onReleaseTreeRuns(options, [
      async tree => {
        session = await tree.startSession('start: echo open')
        await pendingCard(tree, session, 'open, before the restart')
      },
      async tree => {
        const card = await pendingCard(tree, session, 'open, after the restart')
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-open')
        await ranOnce(tree, session, 'open')
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
