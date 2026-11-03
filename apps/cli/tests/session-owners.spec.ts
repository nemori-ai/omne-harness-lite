import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSessionOwners, sessionOwnersPath, writeSessionOwners } from '../src/session-owners.ts'
import { otherTenantText, tenantText } from './support/fake-service.ts'

let directory: string
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-owners-')))
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('session owner records', () => {
  it('reads a missing file, and a missing directory, as no records', () => {
    expect(readSessionOwners(directory)).toEqual({ kind: 'owners', owners: new Map() })
    expect(readSessionOwners(join(directory, 'absent'))).toEqual({
      kind: 'owners',
      owners: new Map(),
    })
  })

  it('reads back what it wrote, including a key that names an object property', () => {
    const owners = new Map([
      ['a'.repeat(64), tenantText],
      ['__proto__', otherTenantText],
    ])
    expect(writeSessionOwners(directory, owners)).toEqual({
      kind: 'written',
      path: sessionOwnersPath(directory),
    })
    expect(readSessionOwners(directory)).toEqual({ kind: 'owners', owners })
  })

  it.each([
    ['an array', '[]'],
    ['a string', '"x"'],
    ['null', 'null'],
    ['no sessions', '{"version":1}'],
    ['sessions as an array', '{"version":1,"sessions":[]}'],
    ['an empty session id', JSON.stringify({ version: 1, sessions: { '': tenantText } })],
    ['a tenant that is not text', JSON.stringify({ version: 1, sessions: { a: 5 } })],
    ['an empty file', ''],
  ])('refuses %s instead of reading it as no records', (_label, content) => {
    writeFileSync(sessionOwnersPath(directory), content)
    expect(readSessionOwners(directory)).toMatchObject({ kind: 'failure' })
  })

  it('reports a failed write with the code', () => {
    expect(writeSessionOwners(join(directory, 'absent'), new Map())).toMatchObject({
      kind: 'failed',
      code: 'ENOENT',
    })
  })

  it('writes one file with the documented content and leaves no temporary file', () => {
    writeSessionOwners(directory, new Map([['a', tenantText]]))
    expect(readdirSync(directory)).toEqual(['sessions.json'])
    expect(readFileSync(sessionOwnersPath(directory), 'utf8')).toBe(
      `{"version":1,"sessions":{"a":${JSON.stringify(tenantText)}}}\n`,
    )
  })
})
