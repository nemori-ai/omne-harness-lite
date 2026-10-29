import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { constants } from 'node:os'
import { join, resolve } from 'node:path'
import { operationJournal } from './operation-journal.ts'

export type AdmissionStep = { name: string; command: string; args: string[] }
export function preAdmissionSteps(bound: boolean): AdmissionStep[] {
  return [
    {
      name: 'acceptance-lock',
      command: 'pnpm',
      args: [
        '-s',
        'run',
        'acceptance:lock',
        ...(bound ? [] : ['--base', 'origin/integration/legacy-refactor']),
      ],
    },
    {
      name: 'build',
      command: 'node',
      args: ['scripts/with-test-slot.mjs', 'pnpm', 'turbo', 'run', 'build', '--affected'],
    },
    ...[
      ['declarations', 'check:declarations'],
      ['contract-api', 'contract:api', '--check'],
      ['lines', 'check:lines'],
      ['docs', 'check:docs'],
      ['design', 'check:design'],
      ['deps', 'lint:deps'],
      ['rules', 'lint:rules'],
      ['oxlint', 'lint:oxlint'],
    ].map(([name = '', script = '', ...args]) => ({
      name,
      command: 'pnpm',
      args: ['run', script, ...args],
    })),
    { name: 'format', command: './scripts/format.sh', args: ['check'] },
  ]
}

export type AdmissionRunner = (step: AdmissionStep, cwd: string, log: number) => number
const runStep: AdmissionRunner = (step, cwd, log) => {
  const result = spawnSync(step.command, step.args, {
    cwd,
    stdio: ['ignore', log, log],
    shell: false,
  })
  if (result.error !== undefined) {
    if ('code' in result.error && result.error.code === 'ENOENT') return 127
    if ('code' in result.error && result.error.code === 'EACCES') return 126
    throw result.error
  }
  return result.status ?? (result.signal === null ? 1 : 128 + constants.signals[result.signal])
}

export function preAdmission(input: {
  worktree: string
  journalRoot: string
  operationId: string
  run?: AdmissionRunner
}) {
  const cwd = realpathSync(input.worktree)
  const context = execFileSync(
    'git',
    ['rev-parse', '--git-path', 'omne-integration-context.json'],
    { cwd, encoding: 'utf8' },
  ).trim()
  const bound = existsSync(resolve(cwd, context))
  const journal = operationJournal(input.journalRoot, input.operationId)
  const steps = preAdmissionSteps(bound)
  journal.save('intent.json', { cwd, operationId: input.operationId, steps })
  const results: { step: string; exitCode: number; log: string; tail: string }[] = []
  for (const step of steps) {
    const path = join(journal.directory, `${step.name}.log`)
    const fd = openSync(path, 'wx', 0o600)
    let exitCode: number
    try {
      exitCode = (input.run ?? runStep)(step, cwd, fd)
    } finally {
      closeSync(fd)
    }
    const tail = exitCode === 0 ? '' : readFileSync(path, 'utf8').split('\n').slice(-21).join('\n')
    results.push({ step: step.name, exitCode, log: path, tail })
    journal.save(`${step.name}.json`, results.at(-1))
    if (exitCode !== 0) return { status: 'failed' as const, exitCode, results }
  }
  return { status: 'passed' as const, exitCode: 0, results }
}
