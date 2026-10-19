// Runs every role fixture of a member and prints one report. Exit code 0: every fixture ran clean
// and every required role has one. 1: a fixture or the set failed (the JSON report names it).
// 2: usage or tool error.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { runFixtureSet } from './fixture-set.ts'
import { memberOptions, parseArguments } from './options.ts'

const USAGE = [
  'usage: fixtures.ts [--member <dir>] [--workspace-root <dir>] [--policy <file>] [--store-dir <dir>]',
  '                   [--consumers <dir>] [--work-dir <dir>] [--out <report.json>] [--allow-network]',
  'Runs each directory below <member>/tests/fixtures/consumers (or --consumers) in a consumer',
  'directory of its own, <work-dir>/<role>. The work directory is <workspace-root>/tmp/install-closure/fixtures',
  'unless --work-dir names another one below <workspace-root>/tmp/install-closure. roles.json in the',
  'consumers directory lists the roles that must have a fixture.',
].join('\n')

function main(argv: readonly string[]): number {
  const options = parseArguments(argv, USAGE)
  const member = memberOptions(options)
  const report = runFixtureSet({
    ...member,
    consumersDirectory: resolve(
      options.get('--consumers') ?? join(member.memberDirectory, 'tests/fixtures/consumers'),
    ),
    workDirectory: resolve(
      options.get('--work-dir') ?? join(member.workspaceRoot, 'tmp/install-closure/fixtures'),
    ),
  })
  const text = `${JSON.stringify(report, null, 2)}\n`
  const out = options.get('--out')
  if (out !== undefined) {
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), text)
  }
  process.stdout.write(text)
  return report.ok ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
