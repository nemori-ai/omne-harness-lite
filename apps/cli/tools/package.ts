import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliDir = resolve(repoRoot, 'apps/cli')
const target = process.argv[2]

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
  const build = spawnSync('pnpm', ['--filter', '@omne-harness/cli', 'run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if ((build.status ?? 1) !== 0) {
    process.exitCode = build.status ?? 1
  } else {
    const archive = spawnSync('tar', ['-czf', target, '-C', cliDir, 'dist'], { stdio: 'inherit' })
    process.exitCode = archive.status ?? 1
  }
}
