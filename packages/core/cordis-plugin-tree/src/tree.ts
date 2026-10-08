import validatePackageName from 'validate-npm-package-name'
import { isIdentifierName } from '@babel/helper-validator-identifier'
import { array, captureJson, record } from './data.ts'
import { PluginTreeError, validRowId } from './errors.ts'
import type {
  ComposedRow,
  OperatorEdit,
  PluginReference,
  PluginRow,
  PluginTreeDescription,
} from './types.ts'

interface Position {
  readonly layer: 'distribution' | 'operator'
  readonly index: number
  readonly rowId?: string
}
function id(value: unknown, position: Position): string {
  if (!validRowId(value)) throw new PluginTreeError('invalid-tree', position)
  return value
}
function reference(value: unknown, position: Position): PluginReference {
  try {
    const item = record(value, ['package', 'export'])
    if (
      typeof item.package !== 'string' ||
      item.package.includes('..') ||
      !validatePackageName(item.package).validForNewPackages ||
      typeof item.export !== 'string' ||
      !isIdentifierName(item.export)
    )
      throw new Error()
    return Object.freeze({ package: item.package, export: item.export })
  } catch {
    throw new PluginTreeError('invalid-reference', position)
  }
}
function config(value: unknown, position: Position) {
  try {
    return captureJson(value)
  } catch {
    throw new PluginTreeError('invalid-config', position)
  }
}
function row(value: unknown, position: Position): PluginRow {
  const item = record(value, ['id', 'plugin', 'config'])
  const rowId = id(item.id, position)
  const site = { ...position, rowId }
  return Object.freeze({
    id: rowId,
    plugin: reference(item.plugin, site),
    config: config(item.config, site),
  })
}
function edit(value: unknown, index: number): OperatorEdit {
  const site: Position = { layer: 'operator', index }
  const item = record(value)
  if (item.op === 'insert') {
    record(item, ['op', 'row', 'position'])
    const placement = record(item.position, ['before', 'after'])
    if (Object.keys(placement).length !== 1) throw new PluginTreeError('invalid-tree', site)
    const position =
      'before' in placement
        ? { before: id(placement.before, site) }
        : { after: id(placement.after, site) }
    return Object.freeze({
      op: 'insert',
      row: row(item.row, site),
      position: Object.freeze(position),
    })
  }
  if (item.op === 'disable') {
    record(item, ['op', 'id'])
    return Object.freeze({ op: 'disable', id: id(item.id, site) })
  }
  if (item.op === 'replace') {
    record(item, ['op', 'id', 'plugin', 'config'])
    const rowId = id(item.id, site)
    const position = { ...site, rowId }
    return Object.freeze({
      op: 'replace',
      id: rowId,
      config: config(item.config, position),
      ...('plugin' in item ? { plugin: reference(item.plugin, position) } : {}),
    })
  }
  throw new PluginTreeError('invalid-tree', site)
}
function guarded<T>(operation: () => T, position?: Position): T {
  try {
    return operation()
  } catch (error) {
    if (error instanceof PluginTreeError) throw error
    throw new PluginTreeError('invalid-tree', position)
  }
}

export function composePluginTree(
  distribution: unknown,
  operator: unknown = [],
): readonly ComposedRow[] {
  return guarded(() => {
    const rows = array(distribution).map((value, index): ComposedRow =>
      guarded(
        () =>
          Object.freeze({
            ...row(value, { layer: 'distribution', index }),
            enabled: true,
            source: 'distribution',
          }),
        { layer: 'distribution', index },
      ),
    )
    const edits = array(operator).map((value, index) =>
      guarded(() => edit(value, index), { layer: 'operator', index }),
    )
    const ids = new Set<string>(),
      modified = new Set<string>()
    rows.forEach((item, index) => {
      if (ids.has(item.id))
        throw new PluginTreeError('duplicate-id', { layer: 'distribution', index, rowId: item.id })
      ids.add(item.id)
    })
    edits.forEach((item, index) => {
      const rowId = item.op === 'insert' ? item.row.id : item.id
      const site: Position = { layer: 'operator', index, rowId }
      if (modified.has(rowId)) throw new PluginTreeError('duplicate-edit', site)
      const targetId =
        item.op === 'insert'
          ? 'before' in item.position
            ? item.position.before
            : item.position.after
          : rowId
      const at = rows.findIndex(value => value.id === targetId)
      const target = rows[at]
      if (target === undefined) throw new PluginTreeError('missing-target', site)
      if (!target.enabled) throw new PluginTreeError('disabled-target', site)
      if (item.op === 'insert') {
        if (ids.has(rowId)) throw new PluginTreeError('duplicate-id', site)
        rows.splice(
          at + ('after' in item.position ? 1 : 0),
          0,
          Object.freeze({ ...item.row, enabled: true, source: 'operator', editIndex: index }),
        )
        ids.add(rowId)
      } else {
        rows[at] = Object.freeze({
          ...target,
          ...(item.op === 'replace'
            ? { plugin: item.plugin ?? target.plugin, config: item.config }
            : { enabled: false }),
          source: 'operator',
          editIndex: index,
        })
      }
      modified.add(rowId)
    })
    return Object.freeze(rows)
  })
}

function sourceFlags(
  item: Record<string, unknown>,
  site: Position,
): Pick<ComposedRow, 'enabled' | 'source'> {
  if (
    typeof item.enabled !== 'boolean' ||
    (item.source !== 'distribution' && item.source !== 'operator')
  )
    throw new PluginTreeError('invalid-tree', site)
  if (item.source === 'distribution' && 'editIndex' in item)
    throw new PluginTreeError('invalid-tree', site)
  if (
    item.source === 'operator' &&
    (typeof item.editIndex !== 'number' ||
      !Number.isSafeInteger(item.editIndex) ||
      item.editIndex < 0)
  )
    throw new PluginTreeError('invalid-tree', site)
  return { enabled: item.enabled, source: item.source }
}

/** Revalidate public composed values before trusting them at the binding boundary. */
export function captureComposedTree(tree: unknown): readonly ComposedRow[] {
  return guarded(() => {
    const ids = new Set<string>()
    return Object.freeze(
      array(tree).map((value, index): ComposedRow => {
        const item = record(value, ['id', 'plugin', 'config', 'enabled', 'source', 'editIndex'])
        const site: Position = {
          layer: item.source === 'operator' ? 'operator' : 'distribution',
          index,
        }
        const captured = row({ id: item.id, plugin: item.plugin, config: item.config }, site)
        if (ids.has(captured.id))
          throw new PluginTreeError('duplicate-id', { ...site, rowId: captured.id })
        ids.add(captured.id)
        const flags = sourceFlags(item, site)
        return Object.freeze({
          ...captured,
          ...flags,
          ...(typeof item.editIndex === 'number' ? { editIndex: item.editIndex } : {}),
        })
      }),
    )
  })
}

export function describePluginTree(tree: readonly ComposedRow[]): readonly PluginTreeDescription[] {
  return Object.freeze(
    captureComposedTree(tree).map((item, position) =>
      Object.freeze({ ...item, position, config: '[redacted]' as const }),
    ),
  )
}
