import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  createShippedCalendarSeedRegistry,
  shippedCalendarSeedRelease,
} from '../../src/seeds/index.ts'

describe('fixed offline seed registry', () => {
  it('reads the exact released bytes and returns an isolated registration map', async () => {
    const registry = createShippedCalendarSeedRegistry()
    const source = registry.get(shippedCalendarSeedRelease.packRef)
    expect(source?.kind).toBe('bytes')
    if (source?.kind !== 'bytes') throw new Error('Expected fixed byte reader')
    const raw = await source.read()
    const original = await readFile(
      new URL('../../data/seeds/calendar-2026-11-06.json', import.meta.url),
    )
    expect(Buffer.from(raw)).toEqual(original)
    expect(createHash('sha256').update(raw).digest('hex')).toBe(shippedCalendarSeedRelease.packHash)
    expect(registry.get('/etc/passwd')).toBeUndefined()
    expect(registry.get('file:///etc/passwd')).toBeUndefined()
    expect(registry).not.toBe(createShippedCalendarSeedRegistry())
  })
})

it('fails for changed or missing installed bytes, even when a caller supplies a matching new hash', async () => {
  const { copyFile, mkdir, mkdtemp, writeFile } = await import('node:fs/promises')
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath, pathToFileURL } = await import('node:url')
  const parent = fileURLToPath(
    new URL('../../../../../tmp/calendar-a1-seeds/registry-tests/', import.meta.url),
  )
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(`${parent}case-`)
  await mkdir(`${root}/dist/seeds`, { recursive: true })
  await mkdir(`${root}/data/seeds`, { recursive: true })
  await copyFile(
    new URL('../../dist/seeds/index.js', import.meta.url),
    `${root}/dist/seeds/index.mjs`,
  )
  await writeFile(`${root}/data/seeds/calendar-2026-11-06.json`, '{}')
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { unlink } from 'node:fs/promises';
    const module = await import(process.env.SEED_TEST_MODULE_URL);
    const source = module.createShippedCalendarSeedRegistry().get(module.shippedCalendarSeedRelease.packRef);
    await assert.rejects(source.read(), /digest mismatch/);
    await unlink(new URL('../../data/seeds/calendar-2026-11-06.json', process.env.SEED_TEST_MODULE_URL));
    await assert.rejects(source.read(), /ENOENT/);
    console.log('damaged and missing artifacts rejected');
  `,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SEED_TEST_MODULE_URL: pathToFileURL(`${root}/dist/seeds/index.mjs`).href,
      },
    },
  )
  expect(output).toContain('damaged and missing artifacts rejected')
})
