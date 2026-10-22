import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

it('exports the host files facility, its object token reader and the host provider from the root', async () => {
  const root: Record<string, unknown> =
    await import('@omne-harness/execution-environment-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'createHostFiles',
    'createHostFilesProvider',
    'hostObjectToken',
  ])
  for (const name of Object.keys(root)) expect(typeof root[name]).toBe('function')
})

it('keeps Cordis out of every module the root entry reaches', async () => {
  const directory = join(packageRoot, 'dist')
  const names = await readdir(directory).catch(() => undefined)
  const files =
    names === undefined
      ? ['src/index.ts', 'src/host-files.ts', 'src/host-provider.ts'].map(name =>
          join(packageRoot, name),
        )
      : ['index.js', 'host-files.js', 'host-provider.js'].map(name => join(directory, name))
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), file).toBe(false)
    expect(source.includes('./cordis'), file).toBe(false)
  }
})
