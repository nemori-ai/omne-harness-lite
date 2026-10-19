import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliDir = resolve(repoRoot, 'apps/cli')
const target = process.argv[2]

// The same steps as the member's `build` script, with the output moved to staging; change both together.
// Source maps are left out: the archive carries no sources, and maps built outside `apps/cli/dist`
// would record this machine's paths.
function buildSteps(dist: string, archive: string, staging: string): [string, string[]][] {
  return [
    [
      'pnpm',
      [
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
    ],
    [process.execPath, [join(cliDir, 'scripts/write-identity.mjs'), dist]],
    ['tar', ['-czf', archive, '-C', staging, 'dist']],
  ]
}

/** Builds into a private staging directory, so `apps/cli/dist` is never removed or rewritten. */
function packageInto(target: string): number {
  const staging = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
  // The archive is written next to the target and renamed into place, so a failed run leaves no partial target.
  const partial = join(dirname(target), `.${basename(target)}.partial`)
  try {
    for (const [command, args] of buildSteps(join(staging, 'dist'), partial, staging)) {
      const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' })
      const status = result.status ?? 1
      if (result.error !== undefined || status !== 0) {
        const reason = result.error?.message ?? result.signal ?? `exit code ${status}`
        process.stderr.write(`omne-package: ${command} failed: ${reason}\n`)
        return status
      }
    }
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
