// @module-tag slow
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { freePort, killTree, serverBin } from '../r9/support.ts'

const DAY = 86_400_000
const labBin = join(dirname(serverBin), 'lab', 'bin.js')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'lab-process-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

type Outcome = { code: number | null; stdout: string; stderr: string }
type Record = { [key: string]: unknown }

function envFor(serverHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'] ?? '',
    HOME: root,
    USERPROFILE: root,
    OMNE_SERVER_HOME: serverHome,
    NO_COLOR: '1',
  }
}

function run(
  bin: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  input = '',
): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: root, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

const key = () => ['sk', 'or', 'v1', 'sentinel', randomBytes(12).toString('hex')].join('-')

/** Starts a lab serve, sends each control line once it is accepting and reads the reply, then closes its input. */
function labServe(env: NodeJS.ProcessEnv, args: readonly string[], lines: readonly string[]) {
  return new Promise<Outcome & { replies: Record[]; start: Record | undefined }>(resolve => {
    const child = spawn(process.execPath, [labBin, 'serve', '--stop-on-stdin-close', ...args], {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let sent = false
    const timer = setTimeout(() => killTree(child), 90_000)
    const records = () =>
      stdout
        .split('\n')
        .filter(line => line.startsWith('{'))
        .map(line => JSON.parse(line) as Record)
    const labRecords = () => records().filter(record => record['kind'] === 'lab-time')
    const next = (index: number) => {
      if (index === lines.length) return void child.stdin.end()
      const waitFor = labRecords().length + 1
      child.stdin.write(`${lines[index]}\n`)
      const poll = setInterval(() => {
        if (labRecords().length < waitFor) return
        clearInterval(poll)
        next(index + 1)
      }, 20)
    }
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
      if (!sent && stdout.includes('"kind":"startup-result"')) {
        sent = true
        next(0)
      }
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('close', code => {
      clearTimeout(timer)
      const lab = labRecords()
      resolve({ code, stdout, stderr, start: lab[0], replies: lab.slice(1) })
    })
  })
}

describe('the lab assembly: the real server on a simulated time', () => {
  it(
    'serves on its own state root, takes control lines, keeps its reading across a restart, and never shares a root with a release instance',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const home = join(root, 'lab-home')
      const env = envFor(home)
      const port = await freePort()
      const setup = await run(labBin, ['setup', '--port', String(port)], env, `${key()}\n`)
      expect(setup.code, setup.stderr).toBe(0)
      expect(existsSync(join(home, 'state', 'lab-instance.json'))).toBe(true)

      const first = await labServe(
        env,
        [],
        ['read', 'skip 1d', 'set 2027-01-31T08:59:00Z', 'speed 60', 'nonsense', 'read'],
      )
      expect(first.code, first.stderr).toBe(0)
      const startup = first.stdout
        .split('\n')
        .filter(line => line.includes('"kind":"startup-result"'))
        .map(line => JSON.parse(line) as Record)[0]
      expect(startup?.['appliedRows']).toContain('lab-programs')
      const [read, skipped, set, speed, refused, last] = first.replies
      expect(first.start).toMatchObject({ ok: true, command: 'start', speed: 1 })
      expect(read).toMatchObject({ ok: true, command: 'read' })
      expect(
        Date.parse(String(skipped?.['wall'])) - Date.parse(String(read?.['wall'])),
      ).toBeGreaterThanOrEqual(DAY)
      expect(
        Date.parse(String(skipped?.['wall'])) - Date.parse(String(read?.['wall'])),
      ).toBeLessThan(DAY + 5000)
      expect(Number(skipped?.['elapsed']) - Number(read?.['elapsed'])).toBeLessThan(5000)
      expect(set).toMatchObject({ ok: true, wall: '2027-01-31T08:59:00.000Z' })
      expect(speed).toMatchObject({ ok: true, speed: 60 })
      expect(refused).toMatchObject({ ok: false })
      expect(last).toMatchObject({ ok: true, speed: 60 })
      const saved = JSON.parse(readFileSync(join(home, 'state', 'lab-time.json'), 'utf8')) as Record
      expect(saved['speed']).toBe(60)
      expect(Number(saved['wall'])).toBeGreaterThanOrEqual(Date.parse('2027-01-31T08:59:00Z'))

      const again = await labServe(env, ['--skip', '3d', '--speed', '1'], ['read'])
      expect(again.code, again.stderr).toBe(0)
      expect(
        Date.parse(String(again.start?.['wall'])) - Number(saved['wall']),
      ).toBeGreaterThanOrEqual(3 * DAY - 1)
      expect(again.start).toMatchObject({ speed: 1 })

      const release = await run(serverBin, ['serve', '--stop-on-stdin-close'], env)
      expect(release.code).toBe(3)
      expect(release.stderr).toContain('state-root-is-lab')

      const releaseHome = join(root, 'release-home')
      const releaseEnv = envFor(releaseHome)
      const releaseSetup = await run(
        serverBin,
        ['setup', '--port', String(await freePort())],
        releaseEnv,
        `${key()}\n`,
      )
      expect(releaseSetup.code, releaseSetup.stderr).toBe(0)
      const lab = await run(labBin, ['serve', '--stop-on-stdin-close'], releaseEnv)
      expect(lab.code).toBe(3)
      expect(lab.stderr).toContain('state-root-not-lab')
      expect(existsSync(join(releaseHome, 'state', 'lab-instance.json'))).toBe(false)
    },
  )
})
