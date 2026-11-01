import { ConfigError, distributionSchema, operatorSchema, parseBoundary } from './config-schema.ts'
import type { OperatorOp, RowId, TreeRow } from './types.ts'

export type DisabledRow = Readonly<{ id: RowId; source: 'operator' }>

/** Final tree: enabled rows in load order, plus the rows the operator disabled. */
export type ResolvedTree = Readonly<{
  rows: readonly TreeRow[]
  disabled: readonly DisabledRow[]
}>

function unknownTarget(op: OperatorOp, target: RowId): ConfigError {
  return new ConfigError(
    'unknown-target',
    `operator ${op.kind}: target row "${target}" does not exist`,
  )
}

/** Apply operator operations in order over the distribution rows. Inputs are not mutated. */
export function applyOperatorOps(
  distributionRows: readonly TreeRow[],
  ops: readonly OperatorOp[],
): ResolvedTree {
  let rows = [...distributionRows]
  const disabled: DisabledRow[] = []
  const usedIds = new Set(rows.map(r => r.id))

  for (const op of ops) {
    const target = op.kind === 'insert' ? op.after : op.id
    const index = rows.findIndex(r => r.id === target)
    const current = rows[index]
    if (current === undefined) throw unknownTarget(op, target)

    switch (op.kind) {
      case 'replace':
        rows[index] = { ...current, config: op.config, source: 'operator' }
        break
      case 'disable':
        rows = rows.filter((_, i) => i !== index)
        disabled.push({ id: current.id, source: 'operator' })
        break
      case 'insert': {
        if (usedIds.has(op.row.id)) {
          throw new ConfigError(
            'duplicate-row-id',
            `operator insert: row id "${op.row.id}" already exists`,
          )
        }
        usedIds.add(op.row.id)
        rows.splice(index + 1, 0, { ...op.row, source: 'operator' })
        break
      }
    }
  }
  return { rows, disabled }
}

/** Validate both layers at the boundary, then layer them. `operatorInput` is optional. */
export function loadTree(
  distributionInput: unknown,
  operatorInput: unknown,
  pluginAllowlist: readonly string[],
): ResolvedTree {
  const distribution = parseBoundary(distributionSchema(pluginAllowlist), distributionInput)
  const operator =
    operatorInput === undefined
      ? { ops: [] }
      : parseBoundary(operatorSchema(pluginAllowlist), operatorInput)
  const rows: TreeRow[] = distribution.rows.map(row => ({ ...row, source: 'distribution' }))
  return applyOperatorOps(rows, operator.ops)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/** Deterministic text form of the final tree. One line per row, disabled rows last. */
export function printTree(tree: ResolvedTree): string {
  const lines = tree.rows.map(
    (row, index) =>
      `${index} ${row.id} plugin=${row.plugin} source=${row.source} config=${canonicalJson(row.config)}`,
  )
  for (const row of tree.disabled) lines.push(`- ${row.id} disabled source=${row.source}`)
  return `${lines.join('\n')}\n`
}
