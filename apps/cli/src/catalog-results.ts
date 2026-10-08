import { isOk, parseTenantId, parseTenantRole } from '@omne-harness-lite/identity-values'
import { CliCatalogFailure, type CapturedCreation, type CreationRecord } from './catalog-types.ts'
import { object } from './catalog-values.ts'
import { SESSION_PREPARATION_BLOCK_REASONS, parseRunLoginBinding } from './session-preparation.ts'
import { sameOrigin, resultOf, reportBlock } from './session-preparation.ts'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import type { CreatedTenantPreparation } from './tenant-preparation.ts'
import { validReport } from './validation.ts'

type Preparation = Extract<CreatedTenantPreparation, { kind: 'created' }>['preparation']
function invalid(): never {
  throw new CliCatalogFailure('invalid-record')
}
function prepared(value: unknown): Preparation {
  if (!object(value)) return invalid()
  if (value['kind'] === 'blocked') {
    const reason = SESSION_PREPARATION_BLOCK_REASONS.find(reason => reason === value['reason'])
    if (reason === undefined) return invalid()
    return { kind: 'blocked', reason }
  }
  if (value['kind'] !== 'observed' || !object(value['identity'])) return invalid()
  return observedPreparation(value)
}
function observedPreparation(value: Record<string, unknown>): Preparation {
  if (!object(value['identity'])) return invalid()
  const identity = value['identity']
  const login = parseRunLoginBinding(identity)
  const name = parseOrganizationName(value['name'])
  const tenant = parseTenantId(identity['tenant'])
  const role = parseTenantRole(identity['role'])
  if (login === undefined || !isOk(name)) return invalid()
  if (!isOk(tenant) || !isOk(role) || tenant.ok.account !== login.accountId) return invalid()
  return {
    kind: 'observed',
    identity: { ...login, tenant: tenant.ok, role: role.ok },
    name: name.ok,
  }
}
export function creationResult(value: unknown): CreatedTenantPreparation {
  if (!object(value)) return invalid()
  if (value['kind'] === 'invalid-input') return { kind: 'invalid-input' }
  const report = value['report']
  if (!validReport(report) || report.operation !== 'capability.organization-governance/v2#S-21')
    return invalid()
  if (value['kind'] === 'unresolved') return { kind: 'unresolved', report }
  if (value['kind'] !== 'created') return invalid()
  const tenant = parseTenantId(value['tenant'])
  if (!isOk(tenant)) return invalid()
  return { kind: 'created', tenant: tenant.ok, report, preparation: prepared(value['preparation']) }
}
export function settledStatus(result: CreatedTenantPreparation): CreationRecord['status'] {
  if (result.kind === 'created') return 'settled'
  if (result.kind === 'invalid-input') return 'settled'
  const report = result.report
  if (report.remote.status === 'unknown') return 'submitted'
  if (report.defect !== undefined) return 'submitted'
  if (
    report.remote.status === 'success' &&
    report.remote.reply !== undefined &&
    'failure' in report.remote.reply.reply
  )
    return 'settled'
  return report.remote.sendAttempted ? 'submitted' : 'settled'
}
export function sameCreation(request: CapturedCreation, stored: CapturedCreation): boolean {
  return JSON.stringify(request) === JSON.stringify(stored)
}

export function checkCreationResult(
  request: CapturedCreation,
  result: CreatedTenantPreparation,
): void {
  if (result.kind !== 'created') return
  if (!sameOrigin(request.login, result.report) || reportBlock(result.report) !== undefined)
    return invalid()
  if (
    result.tenant.account !== request.login.accountId ||
    result.tenant.organization !==
      resultOf(result.report, 'capability.organization-governance/v2#S-21')
  )
    return invalid()
  if (result.preparation.kind !== 'observed') return
  checkPreparedIdentity(request, result.tenant, result.preparation)
}
function checkPreparedIdentity(
  request: CapturedCreation,
  tenant: Extract<CreatedTenantPreparation, { kind: 'created' }>['tenant'],
  prepared: Extract<Preparation, { kind: 'observed' }>,
): void {
  if (
    JSON.stringify(prepared.identity.tenant) !== JSON.stringify(tenant) ||
    prepared.name !== request.name
  )
    return invalid()
  if (
    prepared.identity.centerId !== request.login.centerId ||
    prepared.identity.accountId !== request.login.accountId ||
    prepared.identity.loginStateHandle !== request.login.loginStateHandle
  )
    return invalid()
}

export function checkResultStatus(
  status: CreationRecord['status'],
  result: CreatedTenantPreparation | null,
): void {
  if (status === 'prepared' && result !== null) return invalid()
  if (status === 'settled' && result === null) return invalid()
  if (result !== null && status !== settledStatus(result)) return invalid()
}
