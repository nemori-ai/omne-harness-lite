// Install-closure facility entry point. Exit code 0: closure and consumer install are clean.
// 1: a check failed (the JSON report names it). 2: usage or tool error.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readManifest, readPolicy } from './closure.ts'
import { runConsumerInstall } from './consumer.ts'

const USAGE = [
  'usage: cli.ts [--member <dir>] [--workspace-root <dir>] [--policy <file>] [--work-dir <dir>]',
  '              [--store-dir <dir>] [--out <report.json>] [--allow-network]',
  '--work-dir must lie below <member>/tmp or <workspace-root>/tmp/install-closure.',
  '--allow-network (or OMNE_INSTALL_ALLOW_NETWORK=1) lets a failed --offline install fall back to',
  'a run that may reach the registry. Without it that failure fails the run. The report field',
  'install.mode says which attempt installed.',
].join('\n')

const FLAGS = new Set(['--allow-network'])

function parse(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === undefined || !key.startsWith('--'))
      throw new Error(`cannot read arguments\n${USAGE}`)
    if (FLAGS.has(key)) {
      values.set(key, 'true')
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`cannot read arguments\n${USAGE}`)
    values.set(key, value)
    index += 1
  }
  return values
}

function findWorkspaceRoot(from: string): string {
  for (let directory = from; ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory
    if (dirname(directory) === directory) throw new Error(`no pnpm-workspace.yaml above ${from}`)
  }
}

function main(argv: readonly string[]): number {
  const options = parse(argv)
  const memberDirectory = resolve(options.get('--member') ?? process.cwd())
  const workspaceRoot = resolve(
    options.get('--workspace-root') ?? findWorkspaceRoot(memberDirectory),
  )
  const policy = readPolicy(
    resolve(options.get('--policy') ?? join(memberDirectory, 'tests/fixtures/install-policy.json')),
  )
  const name = readManifest(memberDirectory).name.replace(/^@/u, '').replace('/', '-')
  const storeDirectory = options.get('--store-dir')
  const report = runConsumerInstall({
    memberDirectory,
    workspaceRoot,
    policy,
    allowNetwork:
      options.has('--allow-network') || process.env['OMNE_INSTALL_ALLOW_NETWORK'] === '1',
    ...(storeDirectory === undefined ? {} : { storeDirectory: resolve(storeDirectory) }),
    consumerDirectory: resolve(
      options.get('--work-dir') ?? join(workspaceRoot, 'tmp/install-closure', name),
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
