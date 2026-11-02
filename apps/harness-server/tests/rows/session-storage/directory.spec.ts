import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openTenantDirectory } from '../../../src/rows/session-storage/directory.ts'
import { TENANT_A, TENANT_B, textOf } from '../storage/fixtures/tree.ts'

const workspaces: string[] = []
afterEach(() => {
  for (const path of workspaces.splice(0)) rmSync(path, { recursive: true, force: true })
})

function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tenant-directory-')))
  workspaces.push(root)
  return { root, file: join(root, 'tenants.json') }
}

function writeEmpty(file: string) {
  writeFileSync(
    file,
    JSON.stringify({
      format: 'tenant-domain-directory/1',
      domainRule: 'organization-account/1',
      tenants: [],
    }),
  )
}

test('opening a missing registration file fails instead of publishing an empty directory', () => {
  const { file } = workspace()
  expect(() =>
    openTenantDirectory({ file, register: async () => ({ kind: 'registered' }) }),
  ).toThrow('tenant domain directory')
  expect(existsSync(file)).toBe(false)
})

test('a lost registration file cannot be recreated by a subsequent tenant registration', async () => {
  const { file } = workspace()
  writeEmpty(file)
  const directory = openTenantDirectory({ file, register: async () => ({ kind: 'registered' }) })
  await directory.ensureRegistered(textOf(TENANT_A))
  rmSync(file)
  expect(await directory.ensureRegistered(textOf(TENANT_B))).toMatchObject({ kind: 'unavailable' })
  expect(existsSync(file)).toBe(false)
  expect(await directory.access.snapshot()).toMatchObject({
    kind: 'ready',
    value: { revision: '1', entries: [{ tenant: textOf(TENANT_A) }] },
  })
})

test('concurrent registrations publish the complete durable set and a failed write publishes nothing', async () => {
  const { file } = workspace()
  writeEmpty(file)
  const directory = openTenantDirectory({ file, register: async () => ({ kind: 'registered' }) })
  mkdirSync(`${file}.${String(process.pid)}.tmp`)
  expect(await directory.ensureRegistered(textOf(TENANT_A))).toMatchObject({ kind: 'unavailable' })
  expect(await directory.access.snapshot()).toEqual({
    kind: 'ready',
    value: { revision: '0', entries: [] },
  })
  rmSync(`${file}.${String(process.pid)}.tmp`, { recursive: true })
  expect(
    (
      await Promise.all([
        directory.ensureRegistered(textOf(TENANT_A)),
        directory.ensureRegistered(textOf(TENANT_B)),
      ])
    ).map(result => result.kind),
  ).toEqual(['ready', 'ready'])
  const snapshot = await directory.access.snapshot()
  expect(snapshot).toMatchObject({
    kind: 'ready',
    value: { revision: '2', entries: [{ tenant: textOf(TENANT_A) }, { tenant: textOf(TENANT_B) }] },
  })
  expect(JSON.parse(readFileSync(file, 'utf8')).tenants).toEqual([
    textOf(TENANT_A),
    textOf(TENANT_B),
  ])
})
