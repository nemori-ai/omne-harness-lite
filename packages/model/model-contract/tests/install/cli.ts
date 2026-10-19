// Install-closure facility entry point. Exit code 0: closure and consumer install are clean.
// 1: a check failed (the JSON report names it). 2: usage or tool error.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readManifest } from './closure.ts'
import { runConsumerInstall } from './consumer.ts'
import { memberOptions, parseArguments } from './options.ts'

const USAGE = [
  'usage: cli.ts [--member <dir>] [--workspace-root <dir>] [--policy <file>] [--work-dir <dir>]',
  '              [--store-dir <dir>] [--out <report.json>] [--scenario <file.mjs>]',
  '              [--fixture <dir>] [--allow-network]',
  '--scenario runs the script inside the consumer directory after the probe (check id scenario-run).',
  '--fixture installs only what the fixture declares, compiles it there and runs its paths in the',
  'consumer directory; it cannot be combined with --scenario.',
  '--work-dir must lie below <member>/tmp or <workspace-root>/tmp/install-closure.',
  '--allow-network (or OMNE_INSTALL_ALLOW_NETWORK=1) lets a failed --offline install fall back to',
  'a run that may reach the registry. Without it that failure fails the run. The report field',
  'install.mode says which attempt installed.',
].join('\n')

/** The script or the fixture that the run exercises; at most one of the two. */
function exercise(options: ReadonlyMap<string, string>) {
  const scenario = options.get('--scenario')
  const fixture = options.get('--fixture')
  if (scenario !== undefined && fixture !== undefined)
    throw new Error(`--scenario and --fixture cannot be combined\n${USAGE}`)
  if (scenario !== undefined && !existsSync(resolve(scenario)))
    throw new Error(`scenario script not found: ${resolve(scenario)}`)
  if (fixture !== undefined && !existsSync(resolve(fixture)))
    throw new Error(`fixture directory not found: ${resolve(fixture)}`)
  return {
    ...(scenario === undefined ? {} : { scenarioScript: resolve(scenario) }),
    ...(fixture === undefined ? {} : { fixtureDirectory: resolve(fixture) }),
  }
}

function main(argv: readonly string[]): number {
  const options = parseArguments(argv, USAGE)
  const member = memberOptions(options)
  const name = readManifest(member.memberDirectory).name.replace(/^@/u, '').replace('/', '-')
  const report = runConsumerInstall({
    ...member,
    ...exercise(options),
    consumerDirectory: resolve(
      options.get('--work-dir') ?? join(member.workspaceRoot, 'tmp/install-closure', name),
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
