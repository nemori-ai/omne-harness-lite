import type { NumberProjection, SchemaBudget, SchemaDefinition, StandardTyped } from './index.ts'

const REFUSED_TYPES: ReadonlySet<string> = new Set([
  'default',
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
    }
  | { readonly kind: 'refused'; readonly reason: 'unsupported-construct' }

type Walk = { count: number }

export function admit(definition: SchemaDefinition<unknown>, budget: ConstructBudget): Admission {
  if (definition.engine !== 'zod') {
    throw new Error('json-schema admission is not implemented')
  }
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
  }
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
  if (def?.coerce === true) return true
  const marker = record(node._zod)
  const zodDef = marker === undefined ? undefined : record(marker.def)
  return typeof zodDef?.check === 'string' && CALLBACK_CHECKS.has(zodDef.check)
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
  if (Array.isArray(def.checks)) found.push(...def.checks)
  return found
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}
