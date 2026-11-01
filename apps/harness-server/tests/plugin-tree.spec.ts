import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { ConfigError, parseBoundary } from '../src/config-schema.ts'
import { loadTree, printTree } from '../src/plugin-tree.ts'

const allowlist = ['stubPlugin', 'probePlugin'] as const
const sample: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/config/sample.json', import.meta.url), 'utf8'),
)

const row = (id: string, plugin = 'stubPlugin', config: unknown = {}) => ({ id, plugin, config })
const distribution = (...rows: unknown[]) => ({ rows })
const load = (dist: unknown, ops?: unknown[]) =>
  loadTree(dist, ops === undefined ? undefined : { ops }, allowlist)

function configError(fn: () => unknown): ConfigError {
  try {
    fn()
  } catch (error) {
    if (error instanceof ConfigError) return error
    throw error
  }
  throw new Error('expected ConfigError')
}

describe('boundary validation: each case violates exactly one rule', () => {
  test('the sample fixture is accepted', () => {
    const tree = load(sample)
    expect(tree.rows.map(r => r.id)).toEqual(['storage', 'identity', 'server-entry'])
    expect(tree.rows.every(r => r.source === 'distribution')).toBe(true)
  })

  test('unknown key on the distribution is rejected', () => {
    const error = configError(() => load({ rows: [row('a')], extra: 1 }))
    expect(error.code).toBe('invalid-config')
  })

  test('unknown key on a row is rejected', () => {
    const error = configError(() => load(distribution({ ...row('a'), extra: 1 })))
    expect(error.code).toBe('invalid-config')
  })

  test('illegal row id value is rejected', () => {
    const error = configError(() => load(distribution(row('Bad Id'))))
    expect(error.code).toBe('invalid-config')
  })

  test('non-data config value is rejected', () => {
    const error = configError(() => load(distribution(row('a', 'stubPlugin', () => 1))))
    expect(error.code).toBe('invalid-config')
  })

  test('duplicate row id is rejected', () => {
    const error = configError(() => load(distribution(row('a'), row('b'), row('a'))))
    expect(error.code).toBe('duplicate-row-id')
    expect(error.message).toContain('a')
  })

  test('plugin export outside the allowlist is rejected', () => {
    const error = configError(() => load(distribution(row('a', 'dynamicPlugin'))))
    expect(error.code).toBe('unknown-plugin')
    expect(error.message).toContain('dynamicPlugin')
  })

  test('unknown operator kind is rejected', () => {
    const error = configError(() => load(distribution(row('a')), [{ kind: 'move', id: 'a' }]))
    expect(error.code).toBe('invalid-config')
  })

  test('operator op with an unknown key is rejected', () => {
    const error = configError(() =>
      load(distribution(row('a')), [{ kind: 'disable', id: 'a', config: {} }]),
    )
    expect(error.code).toBe('invalid-config')
  })

  test('inserted row with a plugin outside the allowlist is rejected', () => {
    const error = configError(() =>
      load(distribution(row('a')), [
        { kind: 'insert', after: 'a', row: row('b', 'dynamicPlugin') },
      ]),
    )
    expect(error.code).toBe('unknown-plugin')
  })

  test('operator target that does not exist is rejected, naming op and target', () => {
    for (const op of [
      { kind: 'replace', id: 'ghost', config: {} },
      { kind: 'disable', id: 'ghost' },
      { kind: 'insert', after: 'ghost', row: row('b') },
    ]) {
      const error = configError(() => load(distribution(row('a')), [op]))
      expect(error.code).toBe('unknown-target')
      expect(error.message).toContain(op.kind)
      expect(error.message).toContain('ghost')
    }
  })

  test('operator target that was already disabled is unknown', () => {
    const error = configError(() =>
      load(distribution(row('a'), row('b')), [
        { kind: 'disable', id: 'a' },
        { kind: 'replace', id: 'a', config: {} },
      ]),
    )
    expect(error.code).toBe('unknown-target')
  })

  test('inserted row id that already exists is rejected', () => {
    const error = configError(() =>
      load(distribution(row('a'), row('b')), [{ kind: 'insert', after: 'a', row: row('b') }]),
    )
    expect(error.code).toBe('duplicate-row-id')
  })

  test('async schema is rejected instead of silently passing', () => {
    const asyncSchema = z.string().refine(async value => value.length > 0)
    const error = configError(() => parseBoundary(asyncSchema, 'x'))
    expect(error.code).toBe('async-schema')
  })

  test('boundary input of the wrong shape is rejected', () => {
    const error = configError(() => loadTree('rows', undefined, allowlist))
    expect(error.code).toBe('invalid-config')
  })
})

describe('operator layer', () => {
  const base = () => distribution(row('a', 'stubPlugin', { n: 1 }), row('b'), row('c'))

  test('replace swaps config in place and marks operator source', () => {
    const tree = load(base(), [{ kind: 'replace', id: 'a', config: { n: 2 } }])
    expect(tree.rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(tree.rows[0]).toMatchObject({
      id: 'a',
      plugin: 'stubPlugin',
      config: { n: 2 },
      source: 'operator',
    })
    expect(tree.rows[1]?.source).toBe('distribution')
  })

  test('disable removes the row from the tree and records it', () => {
    const tree = load(base(), [{ kind: 'disable', id: 'b' }])
    expect(tree.rows.map(r => r.id)).toEqual(['a', 'c'])
    expect(tree.disabled).toEqual([{ id: 'b', source: 'operator' }])
  })

  test('insert places the row right after the anchor with operator source', () => {
    const tree = load(base(), [
      { kind: 'insert', after: 'a', row: row('x', 'probePlugin', { k: 1 }) },
    ])
    expect(tree.rows.map(r => r.id)).toEqual(['a', 'x', 'b', 'c'])
    expect(tree.rows[1]).toMatchObject({ plugin: 'probePlugin', source: 'operator' })
  })

  test('ops apply in order and can anchor on a previously inserted row', () => {
    const tree = load(base(), [
      { kind: 'insert', after: 'c', row: row('x') },
      { kind: 'insert', after: 'x', row: row('y') },
    ])
    expect(tree.rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'x', 'y'])
  })

  test('the distribution input is not mutated', () => {
    const input = base()
    const snapshot = JSON.stringify(input)
    load(input, [{ kind: 'disable', id: 'a' }])
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe('final tree print', () => {
  test('is deterministic regardless of config key order', () => {
    const a = load(distribution(row('a', 'stubPlugin', { x: 1, y: { p: 1, q: 2 } })))
    const b = load(distribution(row('a', 'stubPlugin', { y: { q: 2, p: 1 }, x: 1 })))
    expect(printTree(a)).toBe(printTree(b))
  })

  test('shows order, plugin, source and disabled rows', () => {
    const tree = load(sample, [
      { kind: 'replace', id: 'identity', config: { z: 1 } },
      { kind: 'disable', id: 'storage' },
      { kind: 'insert', after: 'identity', row: row('extra') },
    ])
    expect(printTree(tree)).toBe(
      [
        '0 identity plugin=stubPlugin source=operator config={"z":1}',
        '1 extra plugin=stubPlugin source=operator config={}',
        '2 server-entry plugin=probePlugin source=distribution config={"port":0}',
        '- storage disabled source=operator',
        '',
      ].join('\n'),
    )
  })

  test('differs when the tree differs', () => {
    expect(printTree(load(sample))).not.toBe(
      printTree(load(sample, [{ kind: 'disable', id: 'identity' }])),
    )
  })
})
