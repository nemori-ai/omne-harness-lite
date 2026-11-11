import { defineSettings } from '@omne-harness/settings'
import {
  definePermission,
  projectPermissionSettings,
  type PermissionDefinition,
} from '@omne-harness/permissions'
import type { GovernanceDefinitionBundle } from '@omne-harness/governance-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, definitionKey, equal, digest } from './encoding.ts'

function permissionMapping(bundle: GovernanceDefinitionBundle, permission: PermissionDefinition) {
  const projected = projectPermissionSettings(permission)
  if (projected.kind === 'not-configurable') return true
  if (projected.kind !== 'projected') return false
  const expected = projected.definition
  const actual = bundle.settings.find(
    d =>
      d.providerId === expected.providerId &&
      d.definitionId === expected.definitionId &&
      d.version === expected.version,
  )
  return (
    actual !== undefined &&
    expected.items.every(item => actual.items.some(found => equal(found, item))) &&
    expected.groups.every(group => actual.groups.some(found => equal(found, group)))
  )
}
function permissionsValid(bundle: GovernanceDefinitionBundle) {
  return bundle.permissions.every(permission => {
    if (
      definePermission(permission).kind !== 'defined' ||
      !equal(permission.reference.origin, bundle.origin) ||
      !permissionMapping(bundle, permission)
    )
      return false
    return bundle.enforcementBindings.some(
      binding =>
        binding.capabilityId === permission.capabilityId &&
        binding.enforcementKey === permission.enforcementKey,
    )
  })
}
export function validateBundle(bundle: GovernanceDefinitionBundle) {
  const itemCount =
    bundle.settings.reduce((sum, d) => sum + d.items.length, 0) + bundle.permissions.length
  if (itemCount > 128 || Buffer.byteLength(canonical(bundle)) > 256 * 1024)
    return { kind: 'limited' as const, resource: 'declaration' }
  const settingsKeys = bundle.settings.map(d => canonical([d.providerId, d.definitionId]))
  const permissionKeys = bundle.permissions.map(p =>
    canonical([p.reference.origin, p.reference.itemId]),
  )
  const bindings = bundle.enforcementBindings.map(b =>
    canonical([b.capabilityId, b.enforcementKey]),
  )
  if ([settingsKeys, permissionKeys, bindings].some(keys => new Set(keys).size !== keys.length))
    return { kind: 'conflict' as const, reason: 'definition' as const }
  if (
    !bundle.settings.every(d => defineSettings(d).kind === 'defined') ||
    !permissionsValid(bundle)
  )
    return { kind: 'conflict' as const, reason: 'definition' as const }
  return { kind: 'valid' as const, itemCount }
}
export function saveDefinition(
  port: ParticipantPort,
  bundle: GovernanceDefinitionBundle,
  itemCount: number,
) {
  const key = definitionKey(bundle.reference)
  const existing = port.execute(
    'SELECT digest,body_json FROM gc_definition WHERE definition_key=? LIMIT 1',
    [key],
  ).rows[0]
  if (existing)
    return existing[0] === bundle.reference.digest && equal(JSON.parse(String(existing[1])), bundle)
      ? { kind: 'stored' as const, key }
      : { kind: 'conflict' as const, reason: 'definition' as const }
  const { ownerId, definitionId, version, digest: referenceDigest } = bundle.reference
  port.execute('INSERT INTO gc_definition VALUES (?,?,?,?,?,?,?,?)', [
    key,
    ownerId,
    definitionId,
    version,
    referenceDigest,
    digest(bundle.origin),
    canonical(bundle),
    itemCount,
  ])
  for (const definition of bundle.settings) {
    for (const item of definition.items) {
      port.execute("INSERT INTO gc_item VALUES (?,'setting',?,NULL,NULL,?)", [
        key,
        canonical([definition.providerId, definition.definitionId, item.id]),
        canonical(item),
      ])
    }
  }
  for (const permission of bundle.permissions) {
    port.execute("INSERT INTO gc_item VALUES (?,'permission',?,?,?,?)", [
      key,
      canonical(permission.reference),
      permission.capabilityId,
      permission.enforcementKey,
      canonical(permission),
    ])
  }
  return { kind: 'stored' as const, key }
}
