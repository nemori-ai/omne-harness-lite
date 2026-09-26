import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { packageArtifact, runPackaging, runtime } from '../src/index.ts'

it('static application description controls member selection and the published manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omne-artifact-tool-'))
  const seen: string[][] = []
  try {
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lock')
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'workspace')
    const definition = {
      member: '@omne/test-app',
      stagingPrefix: '.owned-',
      format: 'test-build/1',
      version: 'test-version',
      readme: 'test instructions',
    }
    await packageArtifact(root, join(root, 'app.tar.gz'), definition, {
      run: async (command, args, cwd) => {
        seen.push([...args])
        if (command === 'tar') return runtime.run(command, args, cwd)
        if (args.includes('deploy')) {
          const app = args.at(-1)!
          await mkdir(app)
          await writeFile(join(app, 'entry.js'), 'test code')
        }
      },
      output: async () => {},
    })
    expect(seen[0]).toEqual(['--filter', '@omne/test-app...', 'run', 'build'])
    expect(seen[1]?.slice(0, 3)).toEqual([
      '--filter',
      '@omne/test-app',
      '--config.inject-workspace-packages=true',
    ])
    const unpack = join(root, 'unpack')
    await mkdir(unpack)
    execFileSync('tar', ['-xzf', join(root, 'app.tar.gz'), '-C', unpack])
    const manifest = JSON.parse(await readFile(join(unpack, 'app/build-info.json'), 'utf8'))
    expect(manifest).toMatchObject({
      format: 'test-build/1',
      version: 'test-version',
      node: '24.21.0',
      pnpm: '10.28.1',
    })
    expect(await readFile(join(unpack, 'app/README.md'), 'utf8')).toBe(definition.readme)
    await expect(runPackaging(root, [], definition)).rejects.toThrow(
      'toolchain-or-arguments-invalid',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
