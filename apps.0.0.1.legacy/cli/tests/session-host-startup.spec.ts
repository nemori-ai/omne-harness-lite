import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSessionHostStartup } from '../src/session-host-startup.ts'

const startup = {
  format: 'omne-session-host-startup/1',
  home: '/tmp/omne-startup',
  binding: {
    formatVersion: 1,
    centerId: 'a'.repeat(32),
    tenant: { organization: 'team', account: 'owner' },
  },
  routeName: 'explicit/registered-model',
}
it('preserves the complete tenant and explicit model without accepting a credential', () => {
  const read = parseSessionHostStartup(JSON.stringify(startup))
  expect(read).toEqual(startup)
  expect(Object.isFrozen(read)).toBe(true)
  expect(Object.isFrozen(read.binding)).toBe(true)
})
for (const changed of [
  { ...startup, credential: 'forbidden-credential' },
  { ...startup, source: { principal: 'someone' } },
  { ...startup, home: '/tmp/omne-startup/../other' },
  { ...startup, home: 'relative' },
  { ...startup, routeName: '' },
  { ...startup, binding: { ...startup.binding, centerId: 'invalid' } },
  { ...startup, binding: { ...startup.binding, tenant: { organization: 'team' } } },
  { ...startup, format: 'unknown' },
]) {
  it(`rejects invalid process input ${JSON.stringify(changed)}`, () => {
    expect(() => parseSessionHostStartup(JSON.stringify(changed))).toThrow()
  })
}
it('rejects oversized input before decoding', () => {
  expect(() => parseSessionHostStartup(' '.repeat(65_537))).toThrow('too large')
})
it('the compiled private entry rejects injected secrets without outputting them or creating state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'host-startup-'))
  try {
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../dist/session-host-main.js', import.meta.url)),
        JSON.stringify({ ...startup, home, credential: 'must-not-appear-in-output' }),
      ],
      { encoding: 'utf8', timeout: 10_000 },
    )
    expect(child.error).toBeUndefined()
    expect(child.status).toBe(64)
    expect(child.stdout + child.stderr).not.toContain('must-not-appear-in-output')
    expect(await readdir(home)).toEqual([])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('rejects malformed JSON as an input error', () => {
  expect(() => parseSessionHostStartup('{')).toThrow(TypeError)
})
