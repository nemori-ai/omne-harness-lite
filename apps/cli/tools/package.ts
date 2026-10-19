import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliDir = resolve(repoRoot, 'apps/cli')
const target = process.argv[2]

/** Builds into a private staging directory, so `apps/cli/dist` is never removed or rewritten. */
function packageInto(archive: string): number {
  const staging = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
  const dist = join(staging, 'dist')
  try {
    const steps: [string, string[]][] = [
      ['pnpm', ['--filter', '@omne-harness/cli', 'exec', 'tsc', '-p', 'tsconfig.build.json', '--outDir', dist]],
      [process.execPath, [join(cliDir, 'scripts/write-identity.mjs'), dist]],
      ['tar', ['-czf', archive, '-C', staging, 'dist']],
    ]
    for (const [command, args] of steps) {
      const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' })
      if ((result.status ?? 1) !== 0) return result.status ?? 1
    }
    return 0
  } finally {
    rmSync(staging, { recursive: true, force: true })
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
