import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  organizationCodec,
  organizationEquals,
  tenantCodec,
  tenantEquals,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { ModelFailure } from '../result.ts'
import type {
  ModalityRequirement,
  ModelChoices,
  ModelProfile,
  ProfileResolution,
  ProfileScope,
} from '../profile.ts'
import { frozenCopy, sameValue, tenantText } from './values.ts'

export function profileScopeFailure(
  scope: ProfileScope,
  tenant: TenantId,
): 'invalid-identity' | 'foreign' | null {
  switch (scope.kind) {
    case 'factory':
      return null
    case 'organization': {
      if (!organizationCodec.encode(scope.organization).ok) return 'invalid-identity'
      return organizationEquals(scope.organization, tenant.organization) ? null : 'foreign'
    }
    case 'tenant': {
      if (!tenantCodec.encode(scope.tenant).ok) return 'invalid-identity'
      return tenantEquals(scope.tenant, tenant) ? null : 'foreign'
    }
  }
}

export function covers(profile: ModelProfile, required: ModalityRequirement): boolean {
  const input: readonly string[] = profile.definition.input
  return required.modalities.every(modality => input.includes(modality))
}

function copyScope(scope: ProfileScope): ProfileScope {
  switch (scope.kind) {
    case 'factory':
      return Object.freeze({ kind: 'factory' })
    case 'organization':
      return Object.freeze({ kind: 'organization', organization: scope.organization })
    case 'tenant':
      return Object.freeze({ kind: 'tenant', tenant: scope.tenant })
  }
}

export function copyProfile(profile: ModelProfile): ModelProfile {
  const { identity, ...rest } = profile
  return Object.freeze({
    ...frozenCopy(rest),
    identity: Object.freeze({ scope: copyScope(identity.scope), route: identity.route }),
  })
}

export function copyResolution(resolution: ProfileResolution): ProfileResolution {
  if (resolution.kind === 'absent') return frozenCopy(resolution)
  const { profile, ...rest } = resolution
  return Object.freeze({ ...frozenCopy(rest), profile: copyProfile(profile) })
}

export function copyChoices(choices: ModelChoices): ModelChoices {
  return Object.freeze({
    choices: Object.freeze(choices.choices.map(copyResolution)),
    selected:
      choices.selected === null
        ? null
        : Object.freeze({
            route: choices.selected.route,
            resolution: copyResolution(choices.selected.resolution),
          }),
    source: frozenCopy(choices.source),
  })
}

export function frozenAnswer<T>(
  answer: Outcome<T, ModelFailure>,
  copy: (value: T) => T,
): Outcome<T, ModelFailure> {
  return Object.freeze('ok' in answer ? succeed(copy(answer.ok)) : fail(frozenCopy(answer.failure)))
}

export function refusal(failure: ModelFailure): Outcome<never, ModelFailure> {
  return Object.freeze(fail(Object.freeze(failure)))
}

export type ScriptRow<P, K, T> = Readonly<{
  tenant: string
  principal: P
  key: K
  answer: Outcome<T, ModelFailure>
}>

function sameRow<P, K>(
  row: Readonly<{ tenant: string; principal: P; key: K }>,
  tenant: string,
  principal: P,
  key: K,
): boolean {
  return row.tenant === tenant && Object.is(row.principal, principal) && sameValue(row.key, key)
}

export function putRow<P, K, T>(rows: ScriptRow<P, K, T>[], row: ScriptRow<P, K, T>): void {
  const at = rows.findIndex(item => sameRow(item, row.tenant, row.principal, row.key))
  if (at === -1) rows.push(row)
  else rows[at] = row
}

export function findRow<P, K, T>(
  rows: readonly ScriptRow<P, K, T>[],
  access: Access<P>,
  key: K,
): ScriptRow<P, K, T> | undefined {
  const tenant = tenantText(access.tenant)
  return rows.find(row => sameRow(row, tenant, access.principal, key))
}
