import { Service, type Plugin } from '@deepseek-ai/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { array, captureJson, record } from './data.ts'
import { PluginTreePreparationError } from './errors.ts'
import { captureComposedTree, describePluginTree } from './tree.ts'
import { rememberPrepared, type PreparedRow } from './prepared.ts'
import type {
  AssemblyDeclaration,
  ComposedRow,
  PreparationOptions,
  PreparedPluginTree,
} from './types.ts'

interface ManagedMetadata {
  readonly Config: StandardSchemaV1<unknown, unknown>
  readonly describeAssembly: (config: unknown) => unknown
}
type ManagedPlugin = Plugin<unknown> & ManagedMetadata
function member(value: unknown, key: string): unknown {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    ? Reflect.get(value, key)
    : undefined
}
function syncResult(value: unknown): unknown {
  if (typeof member(value, 'then') === 'function') {
    // Reject async hooks, but still own a rejection they may already have produced.
    void Promise.resolve(value).catch(() => undefined)
    throw new TypeError('Asynchronous preparation is not supported')
  }
  return value
}
function failure(
  code: ConstructorParameters<typeof PluginTreePreparationError>[0],
  row?: ComposedRow,
  index?: number,
): never {
  throw new PluginTreePreparationError(code, {
    ...(row === undefined ? {} : { rowId: row.id }),
    ...(index === undefined ? {} : { index }),
  })
}
function selectedPlugin(value: unknown, row: ComposedRow, index: number): ManagedPlugin {
  const objectPlugin =
    value !== null && typeof value === 'object' && typeof member(value, 'apply') === 'function'
  const serviceClass = typeof value === 'function' && value.prototype instanceof Service
  if ((!objectPlugin && !serviceClass) || member(value, 'assemblyLifecycle') !== 1)
    return failure('invalid-export', row, index)
  const schema = member(value, 'Config'),
    standard = member(schema, '~standard')
  if (member(standard, 'version') !== 1 || typeof member(standard, 'validate') !== 'function')
    return failure('missing-schema', row, index)
  if (typeof member(value, 'describeAssembly') !== 'function')
    return failure('invalid-declaration', row, index)
  // Shape, plugin kind and synchronous-hook presence have been checked above.
  return value as ManagedPlugin
}
function keys(value: unknown): readonly string[] {
  const items = array(value)
  const result: string[] = []
  for (const item of items) {
    if (typeof item !== 'string' || item.length === 0 || result.includes(item))
      throw new TypeError('Invalid service keys')
    result.push(item)
  }
  return Object.freeze(result)
}
function declaration(value: unknown): AssemblyDeclaration {
  const item = record(syncResult(value), [
    'provides',
    'requires',
    'optional',
    'dynamicProvides',
    'dynamicRequires',
    'claims',
  ])
  const provides = keys(item.provides),
    requires = keys(item.requires),
    optional = keys(item.optional),
    dynamicProvides = keys(item.dynamicProvides),
    dynamicRequires = keys(item.dynamicRequires)
  if (
    [...provides, ...dynamicProvides, ...dynamicRequires].includes('assemblyLifetime') ||
    provides.some(key => dynamicProvides.includes(key)) ||
    requires.some(key => optional.includes(key) || dynamicRequires.includes(key)) ||
    optional.some(key => dynamicRequires.includes(key))
  )
    throw new TypeError('Invalid declaration')
  const seen = new Map<string, Set<number>>()
  const claims = array(item.claims).map(value => {
    const claim = record(value, ['name', 'version', 'config'])
    if (
      typeof claim.name !== 'string' ||
      claim.name.length === 0 ||
      typeof claim.version !== 'number' ||
      !Number.isSafeInteger(claim.version) ||
      claim.version < 1
    )
      throw new TypeError('Invalid claim')
    const versions = seen.get(claim.name) ?? new Set<number>()
    if (versions.has(claim.version)) throw new TypeError('Duplicate claim')
    versions.add(claim.version)
    seen.set(claim.name, versions)
    return Object.freeze({
      name: claim.name,
      version: claim.version,
      config: captureJson(claim.config),
    })
  })
  return Object.freeze({
    provides,
    requires,
    optional,
    dynamicProvides,
    dynamicRequires,
    claims: Object.freeze(claims),
  })
}
async function prepareRow(
  row: ComposedRow,
  index: number,
  options: PreparationOptions,
): Promise<PreparedRow> {
  let module: unknown
  try {
    module = await options.resolveModule(row.plugin)
  } catch {
    return failure('module-unavailable', row, index)
  }
  let plugin: ManagedPlugin
  try {
    plugin = selectedPlugin(member(module, row.plugin.export), row, index)
  } catch (error) {
    if (error instanceof PluginTreePreparationError) throw error
    return failure('invalid-export', row, index)
  }
  let output: unknown
  try {
    const result = syncResult(plugin.Config['~standard'].validate(row.config))
    if (
      result === null ||
      typeof result !== 'object' ||
      member(result, 'issues') !== undefined ||
      !('value' in result)
    )
      return failure('invalid-config', row, index)
    output = result.value
  } catch {
    return failure('invalid-config', row, index)
  }
  try {
    return Object.freeze({ row, plugin, declaration: declaration(plugin.describeAssembly(output)) })
  } catch {
    return failure('invalid-declaration', row, index)
  }
}
function checkDependencies(
  rows: readonly PreparedRow[],
  externalServices: readonly string[],
): void {
  const owners = new Map(externalServices.map(key => [key, { index: -1, dynamic: false }]))
  owners.set('assemblyLifetime', { index: -1, dynamic: false })
  rows.forEach((item, index) => {
    for (const [dynamic, provided] of [
      [false, item.declaration.provides],
      [true, item.declaration.dynamicProvides],
    ] as const) {
      for (const key of provided) {
        if (owners.has(key)) failure('duplicate-service', item.row, index)
        owners.set(key, { index, dynamic })
      }
    }
  })
  rows.forEach((item, index) => {
    for (const [dynamic, required] of [
      [false, item.declaration.requires],
      [false, item.declaration.optional],
      [true, item.declaration.dynamicRequires],
    ] as const) {
      for (const key of required) {
        const owner = owners.get(key)
        if (owner === undefined) {
          if (item.declaration.optional.includes(key)) continue
          failure('missing-service', item.row, index)
        }
        if (owner.index >= index) failure('service-order', item.row, index)
        if (owner.dynamic !== dynamic) failure('invalid-declaration', item.row, index)
      }
    }
  })
}

export async function preparePluginTree(
  tree: readonly ComposedRow[],
  options: PreparationOptions,
): Promise<PreparedPluginTree> {
  let captured: readonly ComposedRow[], externalServices: readonly string[]
  try {
    captured = captureComposedTree(tree)
    externalServices = keys(options.externalServices)
    if (
      externalServices.includes('assemblyLifetime') ||
      typeof options.resolveModule !== 'function'
    )
      return failure('invalid-tree')
  } catch {
    return failure('invalid-tree')
  }
  const rows: PreparedRow[] = []
  for (const [index, row] of captured.entries()) {
    if (row.enabled) rows.push(await prepareRow(row, index, options))
  }
  checkDependencies(rows, externalServices)
  const prepared: PreparedPluginTree = Object.freeze({
    ids: Object.freeze(rows.map(item => item.row.id)),
    rows: describePluginTree(captured),
    declarations: Object.freeze(
      rows.map(item => Object.freeze({ id: item.row.id, declaration: item.declaration })),
    ),
  })
  rememberPrepared(prepared, { rows: Object.freeze(rows), externalServices })
  return prepared
}
