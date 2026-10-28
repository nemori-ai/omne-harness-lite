import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fullSha, uuid } from '../src/delivery/input-values.ts'
import { operationJournal } from '../src/delivery/operation-journal.ts'
import { strictJson } from '../src/delivery/strict-json.ts'
import { NEXT_UUID, UUID } from './fixtures/identifiers.ts'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function root(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'operation-journal-')))
  roots.push(path)
  return path
}

describe('strict JSON', () => {
  it.each(['{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"a":1,"\\u0061":2}'])(
    'rejects duplicate keys in %s',
    value => {
      expect(() => strictJson(value)).toThrow('json-duplicate-key')
    },
  )
  it('accepts nested strings, escaped keys, arrays and JSON primitives without executing data', () => {
    const value = { 'key"': ['$(echo never-executed)', true, null, 1.2e-5, { a: 2 }], b: '\\u0061' }
    expect(strictJson(JSON.stringify(value))).toEqual(value)
    for (const primitive of ['null', 'false', '42', '"string"'])
      expect(strictJson(primitive)).toEqual(JSON.parse(primitive))
  })
  it.each(['{', '{"a":}', '[1,]', '{"a":1} extra'])('rejects malformed JSON %s', value => {
    expect(() => strictJson(value)).toThrow('json-invalid')
  })
  it('bounds nested and oversized input', () => {
    expect(() => strictJson('['.repeat(130) + '0' + ']'.repeat(130))).toThrow('json-too-deep')
    expect(() => strictJson('"' + 'x'.repeat(1024 * 1024) + '"')).toThrow('json-too-large')
  })
})

describe('input identifiers', () => {
  it('accepts SHA-1 and SHA-256 object ids and lower-cases them', () => {
    expect(fullSha('A'.repeat(40), 'commit')).toBe('a'.repeat(40))
    expect(fullSha('b'.repeat(64), 'commit')).toBe('b'.repeat(64))
  })
  it.each(['a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 7])('rejects %s as a Git SHA', value => {
    expect(() => fullSha(value, 'commit')).toThrow('commit')
  })
  it('accepts RFC 4122 UUIDs and lower-cases them', () => {
    expect(uuid(UUID.toUpperCase(), 'operationId')).toBe(UUID)
  })
  it.each(['11111111-1111-0111-8111-111111111111', '11111111-1111-4111-c111-111111111111', 'x'])(
    'rejects %s as a UUID',
    value => {
      expect(() => uuid(value, 'operationId')).toThrow('operationId: UUID required')
    },
  )
})

describe('operation journal', () => {
  it('keeps each operation in its own directory and reads back what was saved', () => {
    const base = root()
    const journal = operationJournal(base, UUID)
    expect(journal.read('intent.json')).toBeUndefined()
    journal.save('intent.json', { step: 1 })
    expect(journal.read('intent.json')).toEqual({ step: 1 })
    expect(operationJournal(base, NEXT_UUID).read('intent.json')).toBeUndefined()
    expect(readdirSync(base).sort()).toEqual([UUID, NEXT_UUID].sort())
  })
  it('never overwrites an entry, so a retry after a crash must recover instead of repost', () => {
    const journal = operationJournal(root(), UUID)
    journal.save('intent.json', { step: 1 })
    expect(() => journal.save('intent.json', { step: 2 })).toThrow(/EEXIST/)
    expect(journal.read('intent.json')).toEqual({ step: 1 })
  })
  it('refuses entry names and operation ids that could leave the journal directory', () => {
    const base = root()
    expect(() => operationJournal(base, '../escape')).toThrow('UUID required')
    expect(() => operationJournal(base, UUID).save('../x.json', {})).toThrow(
      'Invalid journal entry name',
    )
  })
})
