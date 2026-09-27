import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'
import { judgeEffectiveAssembly } from '../src/index.ts'

type MutableObject = { [key: string]: JsonValue }

const examples = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/capabilities/asset-evaluation/v4/examples.md',
    import.meta.url,
  ),
  'utf8',
)
const text = /```json\n([\s\S]*?)\n```/u.exec(examples.slice(examples.indexOf('## E-10')))?.[1]
if (text === undefined) throw new Error('missing E-10 normative input')
function fixture(): MutableObject {
  const parsed = readJsonStrict(text ?? '')
  if ('failed' in parsed || !object(parsed.ok)) throw new Error('bad E-10 JSON')
  return thaw(parsed.ok) as MutableObject
}
function thaw(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(thaw)
  if (object(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, thaw(item)]))
  return value
}
function object(value: unknown): value is MutableObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function list(value: MutableObject, name: string): JsonValue[] {
  const entries = value[name]
  if (!Array.isArray(entries)) throw new Error('fixture list missing')
  return entries as JsonValue[]
}
function entry(value: MutableObject, name: string, index: number): MutableObject {
  const item = list(value, name)[index]
  if (!object(item)) throw new Error('fixture entry missing')
  return item
}
const negative: readonly [string, (value: MutableObject) => void][] = [
  [
    'closed top-level',
    value => {
      value.extra = true
    },
  ],
  [
    'required list',
    value => {
      delete value.assets
    },
  ],
  [
    'list is not null',
    value => {
      value.values = null
    },
  ],
  [
    'closed asset',
    value => {
      entry(value, 'assets', 0).extra = true
    },
  ],
  [
    'closed value',
    value => {
      entry(value, 'values', 0).extra = true
    },
  ],
  [
    'closed filter',
    value => {
      entry(value, 'filteredOut', 0).extra = true
    },
  ],
  [
    'closed unresolved',
    value => {
      entry(value, 'unresolved', 0).extra = true
    },
  ],
  [
    'closed capability',
    value => {
      if (object(value.root)) value.root = { ...value.root, extra: true }
    },
  ],
  [
    'unique assets',
    value => {
      list(value, 'assets').push({ ...entry(value, 'assets', 1), asset: 'ast_another' })
    },
  ],
  [
    'unique composition',
    value => {
      list(value, 'composition').push(list(value, 'composition')[0] ?? null)
    },
  ],
  [
    'unique value pair',
    value => {
      list(value, 'values').push({ ...entry(value, 'values', 1), value: { allowed: [] } })
    },
  ],
  [
    'unique filter triple',
    value => {
      list(value, 'filteredOut').push(entry(value, 'filteredOut', 0))
    },
  ],
  [
    'unique unresolved pair',
    value => {
      list(value, 'unresolved').push(entry(value, 'unresolved', 0))
    },
  ],
  [
    'positive version',
    value => {
      entry(value, 'assets', 0).version = 0
    },
  ],
  [
    'integer version',
    value => {
      entry(value, 'assets', 0).version = 0.5
    },
  ],
  [
    'asset identity lexical constraint',
    value => {
      entry(value, 'assets', 0).asset = ''
    },
  ],
  [
    'capability name lexical constraint',
    value => {
      if (object(value.root)) value.root = { ...value.root, name: 'bad/name' }
    },
  ],
  [
    'root category',
    value => {
      if (object(value.root)) value.root = { ...value.root, category: 'tool' }
    },
  ],
  [
    'composition excludes root',
    value => {
      list(value, 'composition').push(value.root ?? null)
    },
  ],
  [
    'composition subset of assets',
    value => {
      list(value, 'composition').push({ category: 'skill', name: 'missing' })
    },
  ],
  [
    'values belong to composition or root',
    value => {
      entry(value, 'values', 1).capability = { category: 'skill', name: 'missing' }
    },
  ],
  [
    'disabled is consumed before values',
    value => {
      entry(value, 'values', 2).item = 'disabled'
    },
  ],
  [
    'unresolved target must be absent',
    value => {
      entry(value, 'unresolved', 0).capability = value.root ?? null
    },
  ],
  [
    'unresolved requires actual referent',
    value => {
      entry(value, 'unresolved', 0).referencedBy = { category: 'skill', name: 'missing' }
    },
  ],
  [
    'unresolved requires referent when root exists',
    value => {
      delete entry(value, 'unresolved', 0).referencedBy
    },
  ],
  [
    'replaced strictly outside selected layer',
    value => {
      entry(value, 'assets', 1).replaced = ['tenant']
    },
  ],
  [
    'replaced has no session layer',
    value => {
      entry(value, 'assets', 1).replaced = ['session']
    },
  ],
  [
    'resident required for composed tool',
    value => {
      delete entry(value, 'assets', 1).resident
    },
  ],
  [
    'resident forbidden on root',
    value => {
      entry(value, 'assets', 0).resident = false
    },
  ],
  [
    'asset lock excludes workspace',
    value => {
      entry(value, 'assets', 1).lockedAt = 'workspace'
    },
  ],
  [
    'workspace filter must come from workspace',
    value => {
      entry(value, 'filteredOut', 0).reason = 'workspace_permission'
      entry(value, 'filteredOut', 0).from = 'tenant'
    },
  ],
  [
    'factory cannot be disabled',
    value => {
      entry(value, 'filteredOut', 0).from = 'factory'
    },
  ],
  [
    'effective layer cannot be filtered',
    value => {
      entry(value, 'filteredOut', 0).from = 'tenant'
    },
  ],
  [
    'replaced layer cannot be filtered',
    value => {
      entry(value, 'filteredOut', 0).from = 'factory'
    },
  ],
  [
    'locked_below requires real lock',
    value => {
      entry(value, 'filteredOut', 0).reason = 'locked_below'
    },
  ],
  [
    'root duration must be positive',
    value => {
      entry(value, 'values', 0).value = 'PT0S'
    },
  ],
  [
    'root setting cannot carry provenance',
    value => {
      entry(value, 'values', 0).provenance = 'factory'
    },
  ],
  [
    'root setting lock equals source',
    value => {
      entry(value, 'values', 0).lockedAt = 'organization'
    },
  ],
  [
    'root cannot output usableBy',
    value => {
      entry(value, 'values', 0).item = 'usableBy'
      entry(value, 'values', 0).value = { allowed: ['self'] }
    },
  ],
  [
    'composition requires usableBy',
    value => {
      list(value, 'values').splice(1, 1)
    },
  ],
  [
    'usableBy fixed domain',
    value => {
      entry(value, 'values', 1).value = { allowed: ['arbitrary'] }
    },
  ],
  [
    'usableBy set cannot repeat',
    value => {
      entry(value, 'values', 1).value = { allowed: ['self', 'self'] }
    },
  ],
  [
    'usableBy is closed',
    value => {
      entry(value, 'values', 1).value = { allowed: ['self'], extra: true }
    },
  ],
  [
    'usableBy cannot come from workspace',
    value => {
      entry(value, 'values', 1).from = 'workspace'
    },
  ],
  [
    'factory provenance follows actual asset',
    value => {
      entry(value, 'values', 2).provenance = 'organization'
    },
  ],
  [
    'execution metadata requires permission domain',
    value => {
      entry(value, 'values', 2).tenantAutoWritable = true
    },
  ],
  [
    'null optional metadata is not absence',
    value => {
      entry(value, 'values', 2).provenance = null
    },
  ],
]
test('E-10 admits precise arbitrary settings and two distinct unresolved referents without mutation', () => {
  const value = fixture()
  const before = writeJsonLossless(value)
  expect(before).toContain('12345678901234567890.125')
  expect(judgeEffectiveAssembly(value)).toBe(true)
  expect(writeJsonLossless(value)).toBe(before)
})
test.each(negative)('S47 rejects %s without repairing the value', (_name, change) => {
  const value = fixture()
  change(value)
  const before = writeJsonLossless(value)
  expect(judgeEffectiveAssembly(value)).toBe(false)
  expect(writeJsonLossless(value)).toBe(before)
})
test('a missing root can coexist with unused assets; no root declarations are invented', () => {
  const value = fixture()
  list(value, 'assets').shift()
  delete entry(value, 'assets', 0).resident
  value.composition = []
  value.values = []
  value.unresolved = [{ capability: value.root ?? null }]
  expect(judgeEffectiveAssembly(value)).toBe(true)
})
test('correct represented metadata is admitted without proving actual declarations', () => {
  const value = fixture()
  entry(value, 'values', 2).provenance = 'tenant'
  expect(judgeEffectiveAssembly(value)).toBe(true)
  delete entry(value, 'values', 2).provenance
  entry(value, 'values', 2).value = { allowed: ['ask'] }
  entry(value, 'values', 2).tenantAutoWritable = true
  expect(judgeEffectiveAssembly(value)).toBe(true)
})
test('unknown setting JSON stays open, and empty usableBy does not infer authorization', () => {
  const value = fixture()
  entry(value, 'values', 1).value = { allowed: [] }
  entry(value, 'values', 2).value = {
    allowed: ['x', 'x'],
    capability: null,
    arrays: [null, [], [2, 2]],
  }
  expect(judgeEffectiveAssembly(value)).toBe(true)
})
