export type PluginTreeErrorCode =
  | 'invalid-tree'
  | 'duplicate-id'
  | 'duplicate-edit'
  | 'missing-target'
  | 'disabled-target'
  | 'invalid-reference'
  | 'invalid-config'
export type PluginTreePreparationCode =
  | 'invalid-tree'
  | 'module-unavailable'
  | 'invalid-export'
  | 'missing-schema'
  | 'invalid-config'
  | 'invalid-declaration'
  | 'missing-service'
  | 'service-order'
  | 'duplicate-service'
export type PluginTreeUsageCode =
  'invalid-prepared' | 'lifetime-mismatch' | 'lifetime-used' | 'missing-external-service'
export type PluginTreeStartCode =
  | 'apply-failed'
  | 'dependency-unavailable'
  | 'missing-registration'
  | 'provided-service-missing'
  | 'stopped'

export function validRowId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-z0-9]/u.test(value) &&
    !/[^a-z0-9-]/u.test(value)
  )
}

interface Position {
  readonly rowId?: string
  readonly layer?: 'distribution' | 'operator'
  readonly index?: number
}
class LocatedError extends Error {
  readonly rowId?: string
  readonly layer?: 'distribution' | 'operator'
  readonly index?: number
  constructor(position: Position = {}) {
    super('Plugin tree rejected')
    if (validRowId(position.rowId)) this.rowId = position.rowId
    if (position.layer === 'distribution' || position.layer === 'operator')
      this.layer = position.layer
    if (
      typeof position.index === 'number' &&
      Number.isSafeInteger(position.index) &&
      position.index >= 0
    )
      this.index = position.index
  }
}
export class PluginTreeError extends LocatedError {
  override readonly name = 'PluginTreeError'
  constructor(
    readonly code: PluginTreeErrorCode,
    position: Position = {},
  ) {
    super(position)
  }
}
export class PluginTreePreparationError extends LocatedError {
  override readonly name = 'PluginTreePreparationError'
  constructor(
    readonly code: PluginTreePreparationCode,
    position: Position = {},
  ) {
    super(position)
  }
}
export class PluginTreeUsageError extends Error {
  override readonly name = 'PluginTreeUsageError'
  constructor(readonly code: PluginTreeUsageCode) {
    super('Plugin tree rejected')
  }
}
export class PluginTreeStartError extends LocatedError {
  override readonly name = 'PluginTreeStartError'
  constructor(
    readonly code: PluginTreeStartCode,
    rowId?: string,
  ) {
    super(rowId === undefined ? {} : { rowId })
  }
}
