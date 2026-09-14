import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const script = join(packageRoot, 'scripts/build-schemas.mjs')
const scratch: string[] = []

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(): Promise<{ source: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), 'work-data-schema-build-'))
  scratch.push(root)
  const source = join(root, 'source')
  const target = join(root, 'target')
  await mkdir(source)
  for (const name of ['agent-runtime-identity.schema.json', 'core-work.schema.json']) {
    await copyFile(join(packageRoot, 'src/schemas', name), join(source, name))
  }
  return { source, target }
}

describe('A30 schema build gate', () => {
  it('checks the fixed sources and copies their exact bytes', async () => {
    const { source, target } = await fixture()
    const result = spawnSync(process.execPath, [script, source, target], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    for (const name of ['agent-runtime-identity.schema.json', 'core-work.schema.json']) {
      expect(await readFile(join(target, name))).toEqual(await readFile(join(source, name)))
    }
  })

  it('fails before copying a schema whose bytes no longer match the frozen hash', async () => {
    const { source, target } = await fixture()
    await writeFile(join(source, 'core-work.schema.json'), '{}\n')
    const result = spawnSync(process.execPath, [script, source, target], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('core-work.schema.json SHA-256 mismatch')
    await expect(readFile(join(target, 'core-work.schema.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
