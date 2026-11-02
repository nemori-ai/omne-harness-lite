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
import { afterEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'
import {
  initializeTenantDirectory,
  prepareTenantDirectory,
} from '../../../src/rows/session-storage/initialize.ts'

vi.mock('node:fs', { spy: true })

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function location() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tenant-prepare-')))
  roots.push(base)
  const storageRoot = join(base, 'storage')
  return { storageRoot, directoryFile: join(storageRoot, 'tenants.json') }
}

test('first preparation claims a new root, flushes its empty file, and subsequent preparation preserves it', () => {
  const target = location()
  const mkdir = vi.spyOn(fs, 'mkdirSync')
  const open = vi.spyOn(fs, 'openSync')
  const sync = vi.spyOn(fs, 'fsyncSync')
  prepareTenantDirectory(target)
  expect(mkdir).toHaveBeenCalledExactlyOnceWith(target.storageRoot)
  expect(open).toHaveBeenCalledWith(target.directoryFile, 'wx')
  expect(sync).toHaveBeenCalled()
  const before = readFileSync(target.directoryFile, 'utf8')
  expect(JSON.parse(before)).toEqual({
    format: 'tenant-domain-directory/1',
    domainRule: 'organization-account/1',
    tenants: [],
  })
  prepareTenantDirectory(target)
  expect(readFileSync(target.directoryFile, 'utf8')).toBe(before)
  expect(mkdir).toHaveBeenCalledTimes(1)
})

test('an existing root without a file and a half-initialized root both fail without repair', () => {
  const target = location()
  mkdirSync(target.storageRoot)
  expect(() => prepareTenantDirectory(target)).toThrow('could not be read')
  expect(() => initializeTenantDirectory(target)).toThrow('initialization failed')
  expect(existsSync(target.directoryFile)).toBe(false)
  writeFileSync(target.directoryFile, '')
  expect(() => prepareTenantDirectory(target)).toThrow('corrupt')
  expect(readFileSync(target.directoryFile, 'utf8')).toBe('')
})

test('a competing root creation is a failure and never repairs the winner root', () => {
  const target = location()
  const original = fs.mkdirSync
  vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(path => {
    original(path)
    const failure = new Error('private filesystem path')
    Object.assign(failure, { code: 'EEXIST' })
    throw failure
  })
  expect(() => prepareTenantDirectory(target)).toThrow(
    'tenant domain directory initialization failed',
  )
  expect(existsSync(target.directoryFile)).toBe(false)
})

test('invalid locations and absent ancestors fail before an empty registration file can be created', () => {
  const target = location()
  for (const directoryFile of [
    join(target.storageRoot, 'nested', 'table.json'),
    join(target.storageRoot, '..', 'outside.json'),
    target.storageRoot,
    'relative.json',
  ]) {
    expect(() => prepareTenantDirectory({ ...target, directoryFile })).toThrow('direct child')
    expect(existsSync(target.storageRoot)).toBe(false)
  }
  const nestedRoot = join(target.storageRoot, 'nested')
  expect(() =>
    prepareTenantDirectory({
      storageRoot: nestedRoot,
      directoryFile: join(nestedRoot, 'table.json'),
    }),
  ).toThrow('initialization failed')
  expect(existsSync(target.storageRoot)).toBe(false)
})

test.each([
  '{secret-json',
  JSON.stringify({ format: 'wrong-secret', domainRule: 'organization-account/1', tenants: [] }),
  JSON.stringify({ format: 'tenant-domain-directory/1', domainRule: 'secret-rule', tenants: [] }),
  JSON.stringify({
    format: 'tenant-domain-directory/1',
    domainRule: 'organization-account/1',
    tenants: ['secret-tenant'],
  }),
])('corrupt persisted data fails without exposing its contents: %s', content => {
  const target = location()
  mkdirSync(target.storageRoot)
  writeFileSync(target.directoryFile, content)
  expect(() => prepareTenantDirectory(target)).toThrow(/^tenant domain directory/)
  try {
    prepareTenantDirectory(target)
  } catch (error) {
    expect(String(error)).not.toContain('secret')
  }
  expect(readFileSync(target.directoryFile, 'utf8')).toBe(content)
})
