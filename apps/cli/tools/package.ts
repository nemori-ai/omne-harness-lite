import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, isAbsolute, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliDir = resolve(repoRoot, 'apps/cli')
const target = process.argv[2]
/** The archive's name inside staging; tar writes it there and it is copied next to the target. */
const STAGED_ARCHIVE = 'omne-cli.tar.gz'

type Step = { command: string; args: string[]; cwd: string }

/**
 * The command line that starts a step. On Windows `pnpm` on PATH is `pnpm.cmd` and a shell shim,
 * which Node cannot start without a shell; there pnpm runs as `node_modules/pnpm/bin/pnpm.cjs` next
 * to `pnpm.cmd` (the npm global layout) with this process's Node. A missing entry fails the step.
 */
function commandLine(step: Step): [string, string[]] {
  if (process.platform !== 'win32' || step.command !== 'pnpm') return [step.command, step.args]
  for (const directory of (process.env['PATH'] ?? process.env['Path'] ?? '').split(delimiter)) {
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (directory !== '' && existsSync(join(directory, 'pnpm.cmd')) && existsSync(entry))
      return [process.execPath, [entry, ...step.args]]
  }
  throw new Error('pnpm.cjs not found next to pnpm.cmd on PATH')
}

// The same steps as the member's `build` script, with the output moved to staging; change both together.
// Source maps are left out: the archive carries no sources, and maps built outside `apps/cli/dist`
// would record this machine's paths.
// tar runs inside staging with relative names: GNU tar (Git for Windows) reads an absolute `C:\…`
// archive name as a remote `host:file`.
function buildSteps(dist: string, staging: string): Step[] {
  return [
    {
      command: 'pnpm',
      args: [
        '--filter',
        '@omne-harness/cli',
        'exec',
        'tsc',
        '-p',
        'tsconfig.build.json',
        '--outDir',
        dist,
        '--sourceMap',
        'false',
        '--declarationMap',
        'false',
      ],
      cwd: repoRoot,
    },
    {
      command: process.execPath,
      args: [join(cliDir, 'scripts/write-identity.mjs'), dist],
      cwd: repoRoot,
    },
    { command: 'tar', args: ['-czf', STAGED_ARCHIVE, 'dist'], cwd: staging },
  ]
}

/** Builds into a private staging directory, so `apps/cli/dist` is never removed or rewritten. */
function packageInto(target: string): number {
  const staging = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
  // The archive is copied next to the target and renamed into place, so a failed run leaves no partial target.
  const partial = join(dirname(target), `.${basename(target)}.partial`)
  try {
    for (const step of buildSteps(join(staging, 'dist'), staging)) {
      const [command, args] = commandLine(step)
      const result = spawnSync(command, args, { cwd: step.cwd, stdio: 'inherit' })
      const status = result.status ?? 1
      if (result.error !== undefined || status !== 0) {
        const reason = result.error?.message ?? result.signal ?? `exit code ${status}`
        process.stderr.write(`omne-package: ${step.command} failed: ${reason}\n`)
        return status
      }
    }
    copyFileSync(join(staging, STAGED_ARCHIVE), partial)
    renameSync(partial, target)
    return 0
  } finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(partial, { force: true })
  }
}

if (target === undefined || !isAbsolute(target) || !target.endsWith('.tar.gz')) {
  process.stderr.write('usage: package-cli.sh /absolute/new/omne-cli.tar.gz\n')
  process.exitCode = 2
} else if (existsSync(target)) {
  process.stderr.write('omne-package: target already exists\n')
  process.exitCode = 1
} else if (!existsSync(dirname(target)) || !statSync(dirname(target)).isDirectory()) {
  process.stderr.write('omne-package: parent directory does not exist\n')
  process.exitCode = 1
} else {
  process.exitCode = packageInto(target)
}
