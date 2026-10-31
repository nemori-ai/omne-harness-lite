import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

async function moduleFiles(): Promise<string[]> {
  const read = async (directory: string, extension: string) => {
    const entries = await readdir(join(packageRoot, directory), {
      recursive: true,
      withFileTypes: true,
    })
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith(extension))
      .map(entry => join(entry.parentPath, entry.name))
  }
  try {
    return await read('dist', '.js')
  } catch {
    return read('src', '.ts')
  }
}

it('exports the registry factory and the retirement error from the package root', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/execution-environment')
  expect(Object.keys(root).sort()).toEqual(['RetirementPending', 'createEnvironmentRegistry'])
  expect(typeof root['createEnvironmentRegistry']).toBe('function')
})

it('does not import Cordis from any module of the package', async () => {
  const files = await moduleFiles()
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), file).toBe(false)
  }
})
