import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { inventory, runtime } from '@omne-harness-lite/artifact-builder'
import { packageHost } from '../tools/package.ts'

it('host adapter selects the host closure and preserves shared publication format', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omne-host-package-')),
    seen: string[][] = []
  try {
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lock')
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'workspace')
    await packageHost(root, join(root, 'host.tar.gz'), {
      run: async (command, args, cwd) => {
        seen.push([...args])
        if (command === 'tar') return runtime.run(command, args, cwd)
        if (args.includes('deploy')) {
          await mkdir(join(args.at(-1)!, 'dist'), { recursive: true })
          await writeFile(join(args.at(-1)!, 'dist/cli.js'), 'host code')
        }
      },
      output: async () => {},
    })
    expect(seen[0]).toEqual(['--filter', '@omne-harness-lite/tenancy-host...', 'run', 'build'])
    expect(seen[1]?.[1]).toBe('@omne-harness-lite/tenancy-host')
    const unpack = join(root, 'unpack')
    await mkdir(unpack)
    execFileSync('tar', ['-xzf', join(root, 'host.tar.gz'), '-C', unpack])
    const app = join(unpack, 'app'),
      manifest = JSON.parse(await readFile(join(app, 'build-info.json'), 'utf8'))
    expect(manifest.format).toBe('omne-tenancy-host-build/1')
    expect(
      (await inventory(app)).filter(entry => !['BUILD_ID', 'build-info.json'].includes(entry.path)),
    ).toEqual(manifest.files)
    const readme = await readFile(join(app, 'README.md'), 'utf8')
    expect(readme).toContain('dist/cli.js serve')
    expect(readme).toContain('OMNE_TENANCY_STORAGE_FILE')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
