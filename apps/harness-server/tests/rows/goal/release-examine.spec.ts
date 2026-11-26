// @module-tag slow
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
  type ScriptedToolCall,
} from '../../support/release-tree.ts'
import { treeOf } from '../media-intake/support.ts'
import { goalsOf, reminders } from './journey.ts'

const workspaceOf = (tree: ReleaseTree) => join(dirname(tree.storageRoot), 'workspace')
const write = (id: string, path: string, text: string, mode = 'create') => ({
  id,
  tool: 'Files',
  arguments: JSON.stringify({ command: 'write', intent: 'write', params: { path, mode, text } }),
})
const HOLLOW = write('call-hollow', 'snake.js', 'exports.turn = (from, to) => from\n')
const RIGHT = write('call-right', 'snake.js', 'exports.turn = (from, to) => to\n', 'replace')
const FIRST_RIGHT = write('call-first-right', 'snake.js', 'exports.turn = (from, to) => to\n')
const README = write('call-readme', 'README.md', '# 贪吃蛇\n')
const PLAY = `grep -q '=> to' snake.js`
const METHOD = '用 node 载入 snake.js，喂方向键，看蛇头转不转'
const SNAKE = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [{ statement: '方向键能控制蛇', evidence: { kind: 'examination', method: METHOD } }],
}
const BATCH = /Batch: (examine\/\d+\/\d+\/[A-Za-z0-9_-]*)/gu
const NOT_TURNING = '按右键蛇不转向'

type Reading = Readonly<{ value: 'holds' | 'fails' | 'cannot-tell'; refs?: string[]; note: string }>
/** What a scripted examiner does with one batch: run the play command, then hand in this reading citing that run; `refs` cites something else instead. */
function examinerCalls(body: string, batch: string, reading: Reading): ScriptedToolCall[] {
  const mark = batch.replace(/[^A-Za-z0-9]/gu, '-')
  const play = `x-play-${mark}`
  const handIn = `x-submit-${mark}`
  if (body.includes(handIn)) return []
  if (reading.refs === undefined && !body.includes(play))
    return [
      {
        id: play,
        tool: 'Shell',
        arguments: JSON.stringify({
          command: 'execute',
          intent: 'play the game',
          params: { script: PLAY },
        }),
      },
    ]
  const readings = [{ criterion: 'A1', refs: [play], ...reading }]
  const params = { batch, readings }
  return [{ id: handIn, tool: 'Goal', arguments: JSON.stringify({ command: 'submit', params }) }]
}

type Parts = Readonly<{
  worker(body: string): readonly ScriptedToolCall[]
  examiner(body: string, batch: string): readonly ScriptedToolCall[]
}>
/** One scripted gateway for both sessions: a request that carries a brief is the examining session's. */
function scripted(parts: Parts) {
  const seen = { worker: [] as string[], examiner: [] as string[] }
  const script = toolCallsByRequest(body => {
    const batch = [...body.matchAll(BATCH)].at(-1)?.[1]
    ;(batch === undefined ? seen.worker : seen.examiner).push(body)
    return batch === undefined ? parts.worker(body) : parts.examiner(body, batch)
  })
  return { script, seen }
}

async function setGoal(tree: ReleaseTree, session: string, draft: object = SNAKE) {
  const where = { tenant: tenantOf(savedTenant(tree.home)), session: sessionRef(session) }
  const proposal = { kind: 'set', draft: treeOf(draft) }
  const input = { ...where, operation: 'op-set-1', proposal, words: null }
  const set = await tree.clients.goal['write-goal'](input as never)
  expect(set).toMatchObject({ outcome: 'succeeded' })
}
async function recordOf(tree: ReleaseTree, session: string) {
  const { goals, agent } = await goalsOf(tree, session)
  const read = await goals.read(agent, session)
  if (read.kind !== 'done' || read.value === null) throw new Error(JSON.stringify(read))
  return read.value
}
const settled = (tree: ReleaseTree, session: string) =>
  pollUntil(
    'the goal to settle',
    () => recordOf(tree, session),
    record => record.state.status === 'settled',
  )
const OPTIONS = {
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder', 'run.terminal'],
}
const commandsOfGoal = (body: string): string[] => {
  const { tools } = JSON.parse(body) as {
    tools: {
      function: { name: string; parameters: { properties: { command: { enum: string[] } } } }
    }[]
  }
  return tools.find(tool => tool.function.name === 'Goal')!.function.parameters.properties.command
    .enum
}
const briefsIn = async (tree: ReleaseTree, examiner: string) =>
  reminders(await historyOf(tree, examiner)).filter(text => text.startsWith('Batch: examine/'))

describe('a criterion examined by a session of its own, on the release tree', () => {
  it(
    'the examiner is handed the brief the system wrote and nothing the working agent said, plays, and hands in what it saw: with everything right the goal is achieved at once and nobody is sent on; its Goal has brief and submit only',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script, seen } = scripted({
        worker: body =>
          body.includes(FIRST_RIGHT.id) || !body.includes('A goal was set') ? [] : [FIRST_RIGHT],
        examiner: (body, batch) =>
          examinerCalls(body, batch, { value: 'holds', note: '蛇头转向了' }),
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' }, rounds: 0 })
        expect(done.examination).toMatchObject({ batch: null, used: 1 })
        expect(done.readings.criteria.A1).toMatchObject({
          value: 'holds',
          source: 'examiner',
          note: '蛇头转向了',
        })
        const examiner = done.examination.examiner!
        expect(examiner).not.toBe(session)
        const batch = `examine/1/1/${FIRST_RIGHT.id}`
        expect(await briefsIn(tree, examiner)).toEqual([
          [
            `Batch: ${batch}`,
            'Examine each of these criteria yourself and hand in one reading for each with Goal submit, naming this batch.',
            `- [A1] 方向键能控制蛇\n  - 证据: 查验\n  - 查法: ${METHOD}`,
            `Where the work is: ${workspaceOf(tree)}`,
            'Written since the last batch: snake.js',
          ].join('\n\n'),
        ])
        expect(commandsOfGoal(seen.examiner[0]!).sort()).toEqual(['brief', 'help', 'submit'])
        const toolsOf = (body: string) =>
          (JSON.parse(body) as { tools: { function: { name: string } }[] }).tools
            .map(tool => tool.function.name)
            .sort()
        expect(toolsOf(seen.examiner[0]!)).toEqual(['Files', 'Goal', 'Shell'])
        expect(seen.examiner[0]).toContain('You examine work that another agent did')
        expect(seen.examiner[0]).not.toContain('You are the coding agent')
        expect(commandsOfGoal(seen.worker.at(-1)!).sort()).toEqual([
          'help',
          'propose',
          'show',
          'track',
        ])
        const told = reminders(await historyOf(tree, session))
        expect(told.filter(text => text.includes('You were about to stop'))).toEqual([])
        const read = await recordOf(tree, session)
        expect(read.version).toBe(done.version)
      })
    },
  )

  it(
    'an examiner that finds the work wrong sends the agent on with what it saw; the fixed work is examined again in the same session and the goal is achieved',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script } = scripted({
        worker: body => {
          if (body.includes(RIGHT.id)) return []
          if (body.includes(NOT_TURNING)) return [RIGHT]
          if (body.includes(HOLLOW.id)) return []
          return body.includes('A goal was set') ? [HOLLOW] : []
        },
        examiner: (body, batch) =>
          examinerCalls(
            body,
            batch,
            batch.endsWith(RIGHT.id)
              ? { value: 'holds', note: '蛇头转向了' }
              : { value: 'fails', note: NOT_TURNING },
          ),
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' }, rounds: 1 })
        expect(done.examination.used).toBe(2)
        const sentOn = reminders(await historyOf(tree, session)).filter(text =>
          text.includes(NOT_TURNING),
        )
        expect(sentOn).toHaveLength(1)
        const briefs = await briefsIn(tree, done.examination.examiner!)
        expect(briefs.map(text => text.split('\n')[0])).toEqual([
          `Batch: examine/1/1/${HOLLOW.id}`,
          `Batch: examine/1/1/${RIGHT.id}`,
        ])
      })
    },
  )

  it(
    'a reading that cites a call which is not of this examination cannot be told: the agent is sent on and reads why',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script } = scripted({
        worker: body => {
          if (body.includes(README.id)) return []
          if (body.includes('a call that is not of this examination')) return [README]
          return body.includes(FIRST_RIGHT.id) || !body.includes('A goal was set')
            ? []
            : [FIRST_RIGHT]
        },
        examiner: (body, batch) =>
          examinerCalls(
            body,
            batch,
            batch.endsWith(README.id)
              ? { value: 'holds', note: '蛇头转向了' }
              : { value: 'holds', refs: [FIRST_RIGHT.id], note: '看了它的代码' },
          ),
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const first = await pollUntil(
          'the first readings to be back',
          () => recordOf(tree, session),
          record => record.examination.read.A1 !== undefined,
        )
        expect(first.examination.read.A1).toMatchObject({ value: 'cannot-tell' })
        expect(first.examination.read.A1?.note).toContain('a call that is not of this examination')
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' } })
        expect(done.examination.used).toBe(2)
      })
    },
  )

  it(
    'an examiner that ends its round without handing anything in leaves the criterion untold: the agent is sent on, and the next batch is examined',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script } = scripted({
        worker: body => {
          if (body.includes(README.id)) return []
          if (body.includes('ended without handing in its readings')) return [README]
          return body.includes(FIRST_RIGHT.id) || !body.includes('A goal was set')
            ? []
            : [FIRST_RIGHT]
        },
        examiner: (body, batch) =>
          batch.endsWith(README.id)
            ? examinerCalls(body, batch, { value: 'holds', note: '蛇头转向了' })
            : [],
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const first = await pollUntil(
          'the round that handed nothing in to be read as over',
          () => recordOf(tree, session),
          record => record.examination.read.A1 !== undefined,
        )
        expect(first.examination.read.A1).toMatchObject({
          value: 'cannot-tell',
          note: 'the examination ended without handing in its readings',
        })
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' } })
        expect(done.examination.used).toBe(2)
      })
    },
  )

  it(
    'a batch that is out while the agent writes again is replaced by the next one: the examiner is stopped on the old batch, and what counts is the reading of the new one',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const gate = join(realpathSync(mkdtempSync(join(tmpdir(), 'examine-gate-'))), 'go')
      const WAIT = 'x-wait-for-the-gate'
      const waiting = {
        id: WAIT,
        tool: 'Shell',
        arguments: JSON.stringify({
          command: 'execute',
          intent: 'play a long game',
          params: {
            script: `n=0; while [ ! -f '${gate}' ] && [ $n -lt 300 ]; do sleep 0.2; n=$((n+1)); done`,
          },
        }),
      }
      const { script } = scripted({
        worker: body => {
          if (body.includes(README.id)) return []
          if (body.includes('再加一份说明')) return [README]
          return body.includes(FIRST_RIGHT.id) || !body.includes('A goal was set')
            ? []
            : [FIRST_RIGHT]
        },
        examiner: (body, batch) => {
          if (batch.endsWith(README.id))
            return examinerCalls(body, batch, { value: 'holds', note: '带着说明再走了一局' })
          return body.includes(WAIT)
            ? examinerCalls(body, batch, { value: 'holds', note: '第一局' })
            : [waiting]
        },
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const out = await pollUntil(
          'the first batch to be taken',
          () => recordOf(tree, session),
          record => record.examination.batch?.delivery === 'handed',
        )
        const sent = await tree.clients.session['send-input']({
          tenant: tenantOf(savedTenant(tree.home)),
          session: sessionRef(session),
          acceptId: 'accept-more-1',
          inputId: 'in-more-1',
          message: treeOf({
            id: await userMessageId('in-more-1'),
            role: 'user',
            blocks: [
              {
                kind: 'text',
                id: 'b1',
                visibility: { toHuman: true, toModel: true },
                text: '再加一份说明',
              },
            ],
          }),
        } as never)
        expect(sent).toMatchObject({ outcome: 'succeeded' })
        const replaced = await pollUntil(
          'the next batch to be out',
          () => recordOf(tree, session),
          record => record.examination.batch?.key.written === README.id,
        )
        expect(replaced.examination.used).toBe(2)
        writeFileSync(gate, '')
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' } })
        expect(done.examination.read.A1).toMatchObject({
          key: { written: README.id },
          note: '带着说明再走了一局',
        })
        expect(done.examination.examiner).toBe(out.examination.examiner)
        const ended = (await historyOf(tree, done.examination.examiner!))
          .filter(entry => entry.kind === 'run.terminal')
          .map(entry => (entry.payload as { terminal: { outcome: string } }).terminal.outcome)
        expect(ended[0]).toBe('cancelled')
      })
    },
  )

  it(
    'once the examinations of the budget are used up no further batch is handed over: the goal ends by its budget, with what the last examination saw',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const budget = {
        statement: '预算用尽',
        kind: 'budget',
        limits: [
          { amount: 20, unit: 'rounds' },
          { amount: 1, unit: 'examinations' },
        ],
        deliver: '做到哪一步、还差什么',
        counts: 'failure',
      }
      const { script, seen } = scripted({
        worker: body => {
          if (body.includes(README.id)) return []
          if (body.includes(NOT_TURNING)) return [README]
          return body.includes(HOLLOW.id) || !body.includes('A goal was set') ? [] : [HOLLOW]
        },
        examiner: (body, batch) =>
          examinerCalls(body, batch, { value: 'fails', note: NOT_TURNING }),
      })
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session, { ...SNAKE, exits: [budget] })
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'exit', exit: 'X1' } })
        expect(done.examination).toMatchObject({ batch: null, used: 1 })
        expect(await briefsIn(tree, done.examination.examiner!)).toHaveLength(1)
        expect(new Set(seen.examiner.map(body => [...body.matchAll(BATCH)].at(-1)?.[1]))).toEqual(
          new Set([`examine/1/1/${HOLLOW.id}`]),
        )
      })
    },
  )
})
