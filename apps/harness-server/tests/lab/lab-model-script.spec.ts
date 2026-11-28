// @module-tag slow
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { freePort, killTree, runOmne, serverBin } from '../r9/support.ts'

const labBin = join(dirname(serverBin), 'lab', 'bin.js')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'lab-model-script-')))
const started: ChildProcess[] = []
afterAll(() => {
  for (const child of started) killTree(child)
  rmSync(root, { recursive: true, force: true })
})

const env = (serverHome: string): NodeJS.ProcessEnv => ({
  PATH: process.env['PATH'] ?? '',
  HOME: root,
  USERPROFILE: root,
  OMNE_SERVER_HOME: serverHome,
  NO_COLOR: '1',
})
const key = () => ['sk', 'or', 'v1', 'sentinel', randomBytes(12).toString('hex')].join('-')

function lab(args: readonly string[], serverHome: string, input?: string) {
  const child = spawn(process.execPath, [labBin, ...args], {
    cwd: root,
    env: env(serverHome),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  started.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  child.stdin.on('error', () => {})
  if (input !== undefined) child.stdin.end(input)
  const ended = new Promise<number | null>(resolve => child.on('close', resolve))
  return { child, ended, out: () => stdout, err: () => stderr }
}

async function until(holds: () => boolean | Promise<boolean>, what: string, ms = 60_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await holds()) return
    await new Promise(done => setTimeout(done, 200))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const WORDS = '把待办整理一下'
const SCRIPT = {
  steps: [
    {
      when: { has: [WORDS], lacks: ['call_lab_list'] },
      call: [
        {
          id: 'call_lab_list',
          tool: 'Files',
          arguments: { command: 'list', params: { path: '.' } },
        },
      ],
    },
    { when: { has: [WORDS, 'call_lab_list'] }, say: '整理好了：目录里只有一份 todo.md。' },
  ],
}

describe('the lab assembly with a scripted model', () => {
  it(
    'runs a round of the real agent by the script file: the tool call the script names is made, and its words are the reply',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const home = join(root, 'home')
      const workspace = join(root, 'workspace')
      mkdirSync(workspace, { recursive: true })
      writeFileSync(join(workspace, 'todo.md'), '- 买菜\n')
      const script = join(root, 'script.json')
      writeFileSync(script, JSON.stringify(SCRIPT))
      const port = await freePort()
      const setup = lab(
        ['setup', '--port', String(port), '--workspace', workspace],
        home,
        `${key()}\n`,
      )
      expect(await setup.ended, setup.err()).toBe(0)

      const serving = lab(['serve', '--stop-on-stdin-close', '--model-script', script], home)
      await until(() => serving.out().includes('"accepting":true'), 'the lab to accept', 120_000)
      const server = `http://127.0.0.1:${String(port)}`
      const omne = (args: readonly string[], credential?: string) =>
        runOmne({
          args,
          home: join(root, 'omne'),
          server,
          cwd: root,
          ...(credential === undefined ? {} : { credential }),
        })
      const credential = `pw-${randomBytes(8).toString('hex')}`
      for (const step of ['register', 'login'])
        expect((await omne([step, '--login-identifier', 'lab'], credential)).status).toBe(0)
      const created = await omne(['create-session', '--definition', 'coding'])
      const session = (created.result?.['body'] as { session?: string } | undefined)?.session ?? ''
      expect(session, created.stdout + created.stderr).not.toBe('')
      const sent = await omne(['send-input', '--session', session, '--text', WORDS])
      expect(sent.status, sent.stdout + sent.stderr).toBe(0)

      let history = ''
      await until(async () => {
        history = (await omne(['read-history', '--session', session])).stdout
        return /run\.terminal: .* ended: completed/u.test(history)
      }, 'the run to end')
      expect(history).toContain('[tool call Files call_lab_list]')
      expect(history).toContain('"todo.md"')
      expect(history).toContain('整理好了：目录里只有一份 todo.md。')

      serving.child.stdin?.end()
      expect(await serving.ended, serving.err()).toBe(0)
    },
  )

  it(
    'refuses to serve by a script that does not stand, saying what is wrong with it',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const home = join(root, 'home-bad')
      const setup = lab(['setup', '--port', String(await freePort())], home, `${key()}\n`)
      expect(await setup.ended, setup.err()).toBe(0)
      const script = join(root, 'bad.json')
      writeFileSync(script, '{"steps":[{"when":{}}]}')
      const serving = lab(['serve', '--stop-on-stdin-close', '--model-script', script], home, '')
      expect(await serving.ended).toBe(2)
      expect(serving.err()).toContain('--model-script')
      expect(serving.err()).toContain('model script:')
    },
  )
})
