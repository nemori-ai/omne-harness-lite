// Copies and scope checks of profiles that the profile and preparation doubles share. Nothing here
// is exported from the entry. A minted identity cannot be copied: a structured clone of it is a
// plain object that the identity package no longer knows. So the identities of a profile scope
// keep their reference, and every other plain value is a frozen copy.
import {
  organizationCodec,
  organizationEquals,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { ModelChoices, ModelProfile, ProfileResolution, ProfileScope } from '../profile.ts'
import { frozenCopy } from './values.ts'

/**
 * Why a profile scope does not apply to a tenant, or null when it applies. `invalid-identity`: the
 * scope holds an identity that is not minted. `foreign`: the scope belongs to another tenant or
 * organization. The factory scope applies to every tenant; it grants no access by itself.
 */
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
      const own = tenantCodec.encode(scope.tenant)
      if (!own.ok) return 'invalid-identity'
      const asked = tenantCodec.encode(tenant)
      return asked.ok && asked.value === own.value ? null : 'foreign'
    }
  }
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

/** A frozen copy of a profile whose scope identities are the original minted references. */
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
