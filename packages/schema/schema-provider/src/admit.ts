import type { NumberProjection, SchemaBudget, SchemaDefinition, StandardTyped } from './index.ts'

const REFUSED_TYPES: ReadonlySet<string> = new Set([
  'default',
  'prefault',
  'catch',
  'lazy',
  'pipe',
  'transform',
  'custom',
])

const CALLBACK_CHECKS: ReadonlySet<string> = new Set(['custom', 'overwrite'])

type ConstructBudget = Pick<SchemaBudget, 'maxConstructDepth' | 'maxConstructNodes'>

export type Admission =
  | {
      readonly kind: 'allowed'
      readonly engine: 'zod'
      readonly revision: string
      readonly numbers: NumberProjection
      readonly schema: StandardTyped<unknown>
      readonly digest: string
    }
  | {
      readonly kind: 'allowed'
      readonly engine: 'json-schema'
      readonly revision: string
      readonly numbers: NumberProjection
      readonly document: Readonly<Record<string, unknown>>
      readonly digest: string
    }
  | { readonly kind: 'refused'; readonly reason: 'unsupported-construct' | 'runtime-path-closed' }

type Walk = { count: number }

export function admit(definition: SchemaDefinition<unknown>, budget: ConstructBudget): Admission {
  if (definition.engine === 'json-schema') return admitJsonSchema(definition.document, definition.numbers, budget)
  const nodes: Walk = { count: 0 }
  if (!allowed(definition.schema, 1, nodes, budget, new Set())) {
    return { kind: 'refused', reason: 'unsupported-construct' }
  }
  return {
    kind: 'allowed',
    engine: 'zod',
    revision: definition.revision,
    numbers: definition.numbers,
    schema: definition.schema,
    digest: digestZod(definition.schema),
  }
}

function admitJsonSchema(
  document: Readonly<Record<string, unknown>>,
  numbers: NumberProjection,
  budget: ConstructBudget,
): Admission {
  const found = walkJsonSchema(document, budget)
  if (found === 'cycle') return { kind: 'refused', reason: 'runtime-path-closed' }
  if (found === 'unsupported' || found === 'budget') return { kind: 'refused', reason: 'unsupported-construct' }
  const digest = canonical(document)
  return {
    kind: 'allowed',
    engine: 'json-schema',
    revision: digest,
    numbers,
    document,
    digest,
  }
}

function digestZod(schema: object): string {
  return digestNode(schema, new Set())
}

function digestNode(node: unknown, seen: Set<object>): string {
  if (typeof node === 'bigint') return JSON.stringify(node.toString())
  if (!isRecord(node)) return JSON.stringify(node) ?? 'null'
  if (seen.has(node)) return '#'
  seen.add(node)
  const def = record(node.def)
  if (def === undefined) return digestCheck(node, seen)
  const parts: string[] = []
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(def)) {
    if (CHILD_KEYS.has(key)) continue
    const packed = packData(value, seen)
    if (packed !== undefined) data[key] = packed
  }
  parts.push(canonical(data))
  if (Array.isArray(def.checks)) parts.push(`checks=${def.checks.map(check => digestCheck(check, seen)).join('&')}`)
  const shape = record(def.shape)
  if (shape !== undefined) {
    const keys = Object.keys(shape).sort()
    parts.push(
      `shape={${keys.map(key => `${JSON.stringify(key)}:${digestNode(shape[key], seen)}`).join(',')}}`,
    )
  }
  for (const key of [
    'element',
    'innerType',
    'rest',
    'keyType',
    'valueType',
    'left',
    'right',
    'in',
    'out',
    'catchall',
  ] as const) {
    if (def[key] !== undefined) parts.push(`${key}=${digestNode(def[key], seen)}`)
  }
  if (Array.isArray(def.options)) {
    parts.push(`options=${def.options.map(option => digestNode(option, seen)).join('|')}`)
  }
  if (Array.isArray(def.items)) parts.push(`items=${def.items.map(item => digestNode(item, seen)).join('|')}`)
  return parts.join(';')
}

const CHILD_KEYS: ReadonlySet<string> = new Set([
  'shape',
  'checks',
  'options',
  'items',
  'element',
  'innerType',
  'rest',
  'keyType',
  'valueType',
  'left',
  'right',
  'in',
  'out',
  'catchall',
])

function digestCheck(check: unknown, seen: Set<object>): string {
  const marker = record(check)
  const zodDef = marker === undefined ? undefined : record(record(marker._zod)?.def)
  const source = zodDef ?? marker
  if (source === undefined) return ''
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    const packed = packData(value, seen)
    if (packed !== undefined) data[key] = packed
  }
  return canonical(data)
}

/** Data that changes check behavior. Functions are omitted; regular expressions keep source and flags. */
function packData(value: unknown, seen: Set<object>): unknown {
  if (typeof value === 'function') return undefined
  if (value instanceof RegExp) return `${value.source}/${value.flags}`
  if (typeof value === 'bigint') return value
  if (Array.isArray(value)) return value.map(item => packData(item, seen))
  if (!isRecord(value)) return value
  if (record(value.def) !== undefined) return digestNode(value, seen)
  const packed: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const next = packData(child, seen)
    if (next !== undefined) packed[key] = next
  }
  return packed
}

const SCHEMA_NODES: ReadonlySet<string> = new Set([
  'additionalProperties',
  'unevaluatedProperties',
  'items',
  'additionalItems',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'unevaluatedItems',
  'contentSchema',
])

const SCHEMA_ARRAYS: ReadonlySet<string> = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])

const SCHEMA_MAPS: ReadonlySet<string> = new Set([
  'properties',
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
])

function walkJsonSchema(
  document: Readonly<Record<string, unknown>>,
  budget: ConstructBudget,
): 'ok' | 'cycle' | 'unsupported' | 'budget' {
  const anchors = new Map<string, Record<string, unknown>>()
  const counted = new Set<object>()
  let count = 0

  const collect = (node: unknown, depth: number): 'ok' | 'budget' => {
    if (!isRecord(node) || counted.has(node)) return 'ok'
    counted.add(node)
    count += 1
    if (depth > budget.maxConstructDepth || count > budget.maxConstructNodes) return 'budget'
    if (typeof node.$id === 'string' && node.$id.startsWith('#')) anchors.set(node.$id, node)
    for (const child of schemaChildren(node)) {
      if (collect(child, depth + 1) === 'budget') return 'budget'
    }
    return 'ok'
  }
  if (collect(document, 1) === 'budget') return 'budget'

  const visiting = new Set<object>()
  const linked = new Set<object>()
  const link = (node: unknown): 'ok' | 'cycle' | 'unsupported' => {
    if (!isRecord(node)) return 'ok'
    if (visiting.has(node)) return 'cycle'
    if (linked.has(node)) return 'ok'
    visiting.add(node)
    if (node.$ref !== undefined) {
      if (typeof node.$ref !== 'string') return 'unsupported'
      const resolved = resolveRef(document, anchors, node.$ref)
      if (resolved === undefined) return 'unsupported'
      const status = link(resolved)
      if (status !== 'ok') return status
    }
    for (const child of schemaChildren(node)) {
      const status = link(child)
      if (status !== 'ok') return status
    }
    visiting.delete(node)
    linked.add(node)
    return 'ok'
  }
  return link(document)
}

function schemaChildren(node: Record<string, unknown>): readonly unknown[] {
  const found: unknown[] = []
  for (const key of SCHEMA_NODES) {
    const value = node[key]
    if (Array.isArray(value)) {
      found.push(...value.filter(isSchemaObject))
      continue
    }
    if (isSchemaObject(value)) found.push(value)
  }
  for (const key of SCHEMA_ARRAYS) {
    const value = node[key]
    if (Array.isArray(value)) found.push(...value.filter(isSchemaObject))
  }
  for (const key of SCHEMA_MAPS) {
    const value = node[key]
    if (isSchemaObject(value)) found.push(...Object.values(value).filter(isSchemaObject))
  }
  const dependencies = node.dependencies
  if (isSchemaObject(dependencies)) {
    for (const child of Object.values(dependencies)) {
      if (isSchemaObject(child)) found.push(child)
    }
  }
  return found
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(
  document: Readonly<Record<string, unknown>>,
  anchors: ReadonlyMap<string, Record<string, unknown>>,
  ref: string,
): Record<string, unknown> | undefined {
  if (ref === '#') return document
  if (ref.startsWith('#/')) {
    let current: unknown = document
    let keys: string[]
    try {
      keys = ref
        .slice(2)
        .split('/')
        .map(segment => decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~'))
    } catch {
      return undefined
    }
    for (const key of keys) {
      if (Array.isArray(current)) {
        const index = Number(key)
        current = Number.isInteger(index) ? current[index] : undefined
      } else if (isRecord(current)) current = current[key]
      else return undefined
      if (current === undefined) return undefined
    }
    return isRecord(current) ? current : undefined
  }
  if (ref.startsWith('#')) return anchors.get(ref)
  return undefined
}

function canonical(value: unknown): string {
  if (typeof value === 'bigint') return `bigint:${value.toString()}`
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  if (!isRecord(value)) return JSON.stringify(value) ?? 'null'
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function allowed(
  node: unknown,
  depth: number,
  nodes: Walk,
  budget: ConstructBudget,
  seen: Set<object>,
): boolean {
  if (!isRecord(node)) return true
  if (seen.has(node)) return true
  seen.add(node)
  nodes.count += 1
  // A construct past the budget was not read. Compiling it could admit that construct.
  if (depth > budget.maxConstructDepth || nodes.count > budget.maxConstructNodes) return false
  if (refused(node)) return false
  const def = record(node.def)
  if (def === undefined) return true
  for (const child of children(def)) {
    if (!allowed(child, depth + 1, nodes, budget, seen)) return false
  }
  return true
}

function refused(node: Record<string, unknown>): boolean {
  if (typeof node.type === 'string' && REFUSED_TYPES.has(node.type)) return true
  const def = record(node.def)
  if (def?.coerce === true || typeof def?.error === 'function') return true
  const internal = engineWhen(node)
  if (def !== undefined && Array.isArray(def.checks)) {
    for (const check of def.checks) {
      if (callerCheck(check, internal)) return true
    }
  }
  return callerCheck(node, internal)
}

/** The `when` installed by this schema's own `.min`. A caller callback is a different function. */
function engineWhen(schema: Record<string, unknown>): Function | undefined {
  const min = schema.min
  if (typeof min !== 'function') return undefined
  let sample: { def?: { checks?: unknown[] } }
  try {
    sample = min.call(schema, 0) as { def?: { checks?: unknown[] } }
  } catch {
    return undefined
  }
  const checks = sample.def?.checks
  if (!Array.isArray(checks) || checks.length === 0) return undefined
  const last = checks[checks.length - 1]
  const when = record(record(record(last)?._zod)?.def)?.when
  return typeof when === 'function' ? when : undefined
}

function callerCheck(node: unknown, internal: Function | undefined): boolean {
  const marker = record(node)
  const zodDef = marker === undefined ? undefined : record(record(marker._zod)?.def)
  if (zodDef === undefined) return false
  if (typeof zodDef.fn === 'function' || typeof zodDef.error === 'function') return true
  if (typeof zodDef.when === 'function' && zodDef.when !== internal) return true
  return typeof zodDef.check === 'string' && CALLBACK_CHECKS.has(zodDef.check)
}

function children(def: Record<string, unknown>): readonly unknown[] {
  const found: unknown[] = []
  const shape = record(def.shape)
  if (shape !== undefined) found.push(...Object.values(shape))
  for (const key of [
    'element',
    'innerType',
    'rest',
    'keyType',
    'valueType',
    'left',
    'right',
    'in',
    'out',
    'catchall',
  ] as const) {
    if (def[key] !== undefined) found.push(def[key])
  }
  if (Array.isArray(def.options)) found.push(...def.options)
  if (Array.isArray(def.items)) found.push(...def.items)
  return found
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}
