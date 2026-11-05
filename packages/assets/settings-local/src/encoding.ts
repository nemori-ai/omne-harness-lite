import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { SettingsChange, SettingsTarget } from '@omne-harness/settings'
import type { DomainRef, JsonValue, SqlIdentity, StorageScope } from '@omne-harness/sql-contract'
import type { Binding, OperationBinding } from './schema.ts'

export function canonical(value: unknown): string {
  const result = canonicalize(value)
  if (result === undefined) throw new TypeError('Expected JSON value')
  return result
}
export function json(value: unknown): JsonValue {
  return JSON.parse(canonical(value))
}
export function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function commandDigest(command: SettingsChange): string {
  const { requestId: _requestId, ...semantic } = command
  return digest(semantic)
}
export function stateKey(scope: StorageScope, target: SettingsTarget): string {
  return canonical([scope, target])
}
export function operationKey(
  principalRef: string,
  target: SettingsTarget,
  operationId: string,
): string {
  return digest([principalRef, target, operationId])
}
export function identity(
  domain: DomainRef,
  principalRef: string,
  target: SettingsTarget,
  operationId: string,
): SqlIdentity {
  return {
    ...domain,
    operation: 'settings.change',
    protocolVersion: '2',
    operationKey: operationKey(principalRef, target, operationId),
  }
}
export function settingsSqlOperationBinding(binding: Binding): OperationBinding {
  return {
    domain: binding.domain,
    principalRef: binding.principalRef,
    target: binding.command.target,
    operationId: binding.command.operationId,
    commandDigest: binding.commandDigest,
  }
}
export function withinBudget(value: unknown): boolean {
  const active = new Set<object>()
  let nodes = 0
  let bytes = 0
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 50000 || depth > 32) return false
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item)
      return bytes <= 1024 * 1024
    }
    if (item === null || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object' || active.has(item)) return false
    active.add(item)
    const valid = Object.entries(item).every(
      ([key, child]) => visit(key, depth + 1) && visit(child, depth + 1),
    )
    active.delete(item)
    return valid
  }
  return visit(value, 0)
}
