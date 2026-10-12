import { createHash } from 'node:crypto'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import { validIntent } from './validation.ts'
import { CliCatalogFailure, type CapturedCreation, type CatalogPolicy } from './catalog-types.ts'
import type { CenterProfile } from './center-preparation.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import { StateLayoutFailure } from './state-layout-values.ts'

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function capturedCreation(value: unknown): CapturedCreation {
  if (!object(value) || !object(value['login'])) throw new CliCatalogFailure('invalid-input')
  const login = parseRunLoginBinding(value['login'])
  const name = parseOrganizationName(value['name'])
  const key = parseOpaqueIdentifier(value['creationKey'], 'CreationKey')
  if (login === undefined) throw new CliCatalogFailure('invalid-input')
  if (!isOk(name) || !isOk(key)) throw new CliCatalogFailure('invalid-input')
  return { login, name: name.ok, creationKey: key.ok }
}
export function centerProfile(value: unknown): CenterProfile {
  if (!object(value) || !object(value['center'])) throw new CliCatalogFailure('invalid-input')
  const name = value['name']
  const center = value['center']
  const centerId = center['centerId']
  if (typeof name !== 'string' || name.trim().length === 0 || !isGovernanceCenterId(centerId))
    throw new CliCatalogFailure('invalid-input')
  const intent = { action: 'configure', endpoint: center['endpoint'], trust: center['trust'] }
  if (!validIntent(intent) || intent.action !== 'configure')
    throw new CliCatalogFailure('invalid-input')
  return {
    name,
    center: { centerId, endpoint: intent.endpoint, trust: structuredClone(intent.trust) },
  }
}
export function creationIdentity(request: CapturedCreation): string {
  return createHash('sha256')
    .update(JSON.stringify([request.login.centerId, request.login.accountId, request.creationKey]))
    .digest('hex')
}
export function encoded(value: unknown, policy: CatalogPolicy): string {
  const json = JSON.stringify(value)
  if (json === undefined || Buffer.byteLength(json) > policy.maxRecordBytes)
    throw new CliCatalogFailure('capacity')
  return json
}
export function decode<T>(json: string, parse: (value: unknown) => T, policy: CatalogPolicy): T {
  if (typeof json !== 'string' || Buffer.byteLength(json) > policy.maxRecordBytes)
    throw new CliCatalogFailure('invalid-record')
  try {
    const value = parse(JSON.parse(json))
    if (JSON.stringify(value) !== json) throw new CliCatalogFailure('invalid-record')
    return value
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof StateLayoutFailure ||
      (error instanceof CliCatalogFailure && error.reason === 'invalid-input')
    )
      throw new CliCatalogFailure('invalid-record')
    throw error
  }
}
export function checkedCatalogPolicy(policy: CatalogPolicy): CatalogPolicy {
  if (
    Object.values(policy).length !== 3 ||
    Object.values(policy).some(
      value => !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER,
    )
  )
    throw new CliCatalogFailure('invalid-input')
  return { ...policy }
}
