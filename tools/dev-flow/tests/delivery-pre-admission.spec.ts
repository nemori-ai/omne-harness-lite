import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { preAdmission, preAdmissionSteps } from '../src/delivery/pre-admission.ts'
import { UUID, NEXT_UUID } from './fixtures/collaboration.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-')))
  roots.push(root)
  execFileSync('git', ['init', '-q', root])
  return { worktree: root, journalRoot: join(root, 'logs'), operationId: UUID }
}
describe('pre-admission script migration', () => {
  it('preserves all ordered commands and reads task binding from the actual checkout', () => {
    const input = setup()
    const calls: unknown[] = []
    const run = (step: unknown) => {
      calls.push(step)
      return 0
    }
    const result = preAdmission({ ...input, run })
    expect(result.status).toBe('passed')
    expect(calls).toEqual(preAdmissionSteps(false))
    expect(result.results.map(item => item.step)).toEqual([
      'acceptance-lock',
      'build',
      'declarations',
      'contract-api',
      'lines',
      'docs',
      'design',
      'deps',
      'rules',
      'oxlint',
      'format',
    ])
    expect(calls[0]).toEqual({
      name: 'acceptance-lock',
      command: 'pnpm',
      args: ['-s', 'run', 'acceptance:lock', '--base', 'origin/integration/legacy-refactor'],
    })
    writeFileSync(join(input.worktree, '.git', 'omne-integration-context.json'), '{}')
    calls.length = 0
    preAdmission({ ...input, operationId: NEXT_UUID, run })
    expect(calls[0]).toEqual({
      name: 'acceptance-lock',
      command: 'pnpm',
      args: ['-s', 'run', 'acceptance:lock'],
    })
  })
  it.each(preAdmissionSteps(false).map((step, index) => [step.name, index] as const))(
    'propagates %s failure, stops immediately and retains the last 20 lines',
    (name, index) => {
      const input = setup()
      const calls: string[] = []
      const result = preAdmission({
        ...input,
        run: (step, _cwd, fd) => {
          calls.push(step.name)
          writeFileSync(fd, 'first\n' + 'detail\n'.repeat(25))
          return step.name === name ? 17 : 0
        },
      })
      expect(result.exitCode).toBe(17)
      expect(calls).toHaveLength(index + 1)
      expect(result.results.at(-1)).toMatchObject({ step: name, exitCode: 17 })
      expect(result.results.at(-1)?.tail).not.toContain('first')
    },
  )
  it('isolates logs for independent operations and refuses reuse instead of overwriting evidence', () => {
    const input = setup()
    const a = preAdmission({ ...input, run: () => 0 })
    const b = preAdmission({ ...input, operationId: NEXT_UUID, run: () => 0 })
    expect(a.results[0]?.log).not.toBe(b.results[0]?.log)
    expect(() => preAdmission({ ...input, run: () => 0 })).toThrow('EEXIST')
  })
  it.each([...preAdmissionSteps(false).map(step => step.name), 'success'])(
    'the real executable propagates child outcome %s to the shell',
    failStep => {
      const input = setup()
      const bin = join(input.worktree, 'bin')
      mkdirSync(bin)
      mkdirSync(join(input.worktree, 'scripts'))
      const source = `#!${process.execPath}
const args = process.argv.slice(2)
const names = {'acceptance:lock':'acceptance-lock','check:declarations':'declarations','contract:api':'contract-api','check:lines':'lines','check:docs':'docs','check:design':'design','lint:deps':'deps','lint:rules':'rules','lint:oxlint':'oxlint'}
const name = args[0] === 'scripts/with-test-slot.mjs' ? 'build' : args[0] === 'check' ? 'format' : names[args[args.indexOf('run') + 1]]
process.stdout.write(name + '\\n')
process.exitCode = process.env.N10_FAIL_STEP === name ? 29 : 0
`
      for (const path of [
        join(bin, 'pnpm'),
        join(bin, 'node'),
        join(input.worktree, 'scripts/format.sh'),
      ])
        writeFileSync(path, source, { mode: 0o755 })
      const cli = new URL('../src/delivery/pre-admission-cli.ts', import.meta.url).pathname
      const child = spawnSync(
        process.execPath,
        [
          cli,
          '--worktree',
          input.worktree,
          '--journal',
          join(input.worktree, 'run'),
          '--operation-id',
          UUID,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            N10_FAIL_STEP: failStep,
          },
        },
      )
      const exitCode = failStep === 'success' ? 0 : 29
      expect(child.status, child.stderr).toBe(exitCode)
      const result: unknown = JSON.parse(child.stdout)
      expect(result).toMatchObject({
        operation: 'pre-admission',
        status: failStep === 'success' ? 'passed' : 'failed',
        exitCode,
      })
      if (failStep !== 'success') expect(JSON.stringify(result)).toContain(`${failStep}.log`)
    },
  )
})
