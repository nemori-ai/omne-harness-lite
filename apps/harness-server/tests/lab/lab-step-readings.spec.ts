// @module-tag slow
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { freePort, killTree, runOmne, serverBin } from '../r9/support.ts'

const labBin = join(dirname(serverBin), 'lab', 'bin.js')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'lab-step-readings-')))
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

type Readings = Readonly<{
  reads: readonly Readonly<{ read: number }>[]
  commits: readonly Readonly<{ committed: number }>[]
}>
type Line = Readonly<Record<string, unknown>> & Readonly<{ kind?: string; storage?: Readings }>

const linesOf = (out: string, kind: string): Line[] =>
  out
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line) as Line)
    .filter(line => line.kind === kind)

const committed = (line: Line | undefined): number =>
  (line?.storage?.commits ?? []).reduce((sum, item) => sum + item.committed, 0)
const read = (line: Line | undefined): number =>
  (line?.storage?.reads ?? []).reduce((sum, item) => sum + item.read, 0)

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
    { when: { has: [WORDS, 'call_lab_list'] }, say: '整理好了。' },
  ],
}

describe('the lab assembly says what the storage counted at each model request', () => {
  it(
    'writes one line for each request the script answered, with the readings of the storage then, and answers a readings line on demand',
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
      expect((await omne(['send-input', '--session', session, '--text', WORDS])).status).toBe(0)
      await until(async () => {
        const history = (await omne(['read-history', '--session', session])).stdout
        return /run\.terminal: .* ended: completed/u.test(history)
      }, 'the run to end')

      const steps = linesOf(serving.out(), 'lab-step')
      expect(steps.map(step => step['request'])).toEqual([1, 2])
      for (const step of steps) {
        expect(step['requestBytes']).toBeGreaterThan(0)
        expect(step['requestDigest']).toMatch(/^sha256:[0-9a-f]{64}$/u)
      }
      expect(steps[0]?.['requestDigest']).not.toBe(steps[1]?.['requestDigest'])
      expect(committed(steps[0])).toBeGreaterThan(0)
      expect(committed(steps[1])).toBeGreaterThan(committed(steps[0]))
      expect(read(steps[1])).toBeGreaterThan(read(steps[0]))

      serving.child.stdin?.write('readings\n')
      await until(() => linesOf(serving.out(), 'lab-storage').length === 1, 'the readings line')
      const [answered] = linesOf(serving.out(), 'lab-storage')
      expect(answered?.['ok']).toBe(true)
      expect(committed(answered)).toBeGreaterThanOrEqual(committed(steps[1]))

      serving.child.stdin?.end()
      expect(await serving.ended, serving.err()).toBe(0)
    },
  )
})
