// @module-tag slow
import { existsSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { treeOf } from '../media-intake/support.ts'
import { goalsOf, reminders } from './journey.ts'

const workspaceOf = (tree: ReleaseTree) => join(dirname(tree.storageRoot), 'workspace')
const write = (id: string, path: string, text: string, mode = 'create') => ({
  id,
  tool: 'Files',
  arguments: JSON.stringify({ command: 'write', intent: 'write', params: { path, mode, text } }),
})
/** The acceptance command the person gives. It leaves a mark where it ran, and may wait for a gate outside the workspace. */
const acceptance = (gate: string | null) => `
const fs = require('node:fs')
fs.writeFileSync('ran.txt', 'the acceptance command ran here')
const gate = ${JSON.stringify(gate)}
const until = Date.now() + 60000
while (gate !== null && !fs.existsSync(gate) && Date.now() < until)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
const { turn } = require('./snake.js')
if (turn('up', 'right') !== 'right') {
  console.error('turn(up, right) did not turn right')
  process.exit(1)
}
console.log('accept: ok')
`
const HOLLOW = write('call-hollow', 'snake.js', 'exports.turn = (from, to) => from\n')
const OWN_TEST = write('call-own-test', 'snake.test.js', "console.log('1 passed')\n")
const RIGHT = write('call-right', 'snake.js', 'exports.turn = (from, to) => to\n', 'replace')
const FIRST_RIGHT = write('call-first-right', 'snake.js', 'exports.turn = (from, to) => to\n')
const README = write('call-readme', 'README.md', '# 贪吃蛇\n')
const SNAKE = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [{ statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } }],
}

async function setGoal(tree: ReleaseTree, session: string) {
  const where = { tenant: tenantOf(savedTenant(tree.home)), session: sessionRef(session) }
  const proposal = { kind: 'set', draft: treeOf(SNAKE) }
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

describe('a criterion the system runs again, on the release tree', () => {
  it(
    'the acceptance command runs in a clean copy without a model: gutted work is read as not done and the agent is sent on with what the command printed; the fixed work is achieved with nobody asked; the workspace holds nothing the command wrote',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = toolCallsByRequest(body => {
        if (body.includes(RIGHT.id)) return []
        if (body.includes('did not turn right')) return [RIGHT]
        if (body.includes(HOLLOW.id)) return []
        return body.includes('A goal was set') ? [HOLLOW, OWN_TEST] : []
      })
      const options = {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['message.system_reminder'],
      }
      await onReleaseTree(options, async tree => {
        const workspace = workspaceOf(tree)
        writeFileSync(join(workspace, 'accept.js'), acceptance(null))
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' }, rounds: 1 })
        expect(done.examination).toMatchObject({ batch: null, used: 2 })
        expect(done.readings.criteria.A1).toMatchObject({
          value: 'holds',
          source: 'system',
          note: 'exit 0: accept: ok',
        })
        const sentOn = reminders(await historyOf(tree, session)).filter(text =>
          text.includes('exit 1'),
        )
        expect(sentOn).toHaveLength(1)
        expect(sentOn[0]).toContain('exit 1: turn(up, right) did not turn right')
        expect(readdirSync(workspace).sort()).toEqual(['accept.js', 'snake.js', 'snake.test.js'])
        expect(existsSync(join(workspace, 'ran.txt'))).toBe(false)
      })
    },
  )

  it(
    'a reading that came back holds until a file is written: the agent writes after it, the reading is out of date, and the next time it is about to stop the command is run again',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const gate = join(realpathSync(mkdtempSync(join(tmpdir(), 'rerun-gate-'))), 'go')
      let release = () => {}
      const released = new Promise<void>(resolve => (release = resolve))
      const calls = toolCallsByRequest(body => {
        if (body.includes(README.id)) return []
        if (body.includes('再加一份说明')) return [README]
        if (body.includes(FIRST_RIGHT.id)) return []
        return body.includes('A goal was set') ? [FIRST_RIGHT] : []
      })
      const script: GatewayScript = async request => {
        const { body } = request
        if (body.includes('再加一份说明') && !body.includes(README.id)) await released
        return calls(request)
      }
      await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
        const workspace = workspaceOf(tree)
        writeFileSync(join(workspace, 'accept.js'), acceptance(gate))
        const session = await settledSession(tree, 'hello')
        await setGoal(tree, session)
        await pollUntil(
          'the batch to be out',
          () => recordOf(tree, session),
          record => record.examination.batch !== null,
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
        writeFileSync(gate, '')
        const back = await pollUntil(
          'the first reading to be back while the round is going',
          () => recordOf(tree, session),
          record => record.examination.read.A1 !== undefined,
        )
        expect(back.state.status).toBe('active')
        expect(back.examination).toMatchObject({ batch: null, used: 1 })
        expect(back.readings.criteria.A1?.value).toBe('holds')
        release()
        const done = await settled(tree, session)
        expect(done.state).toMatchObject({ outcome: { kind: 'achieved' } })
        expect(done.examination.used).toBe(2)
        expect(done.examination.read.A1?.key.written).toBe(README.id)
        expect(existsSync(join(workspace, 'ran.txt'))).toBe(false)
      })
    },
  )
})
