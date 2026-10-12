import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type {
  MembershipStandingResult,
  ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { describe, expect, it } from 'vitest'
import {
  configEligibility,
  credentialSlot,
  manifestDisposition,
  sameWriter,
  scopeChain,
  scopeMatches,
  winningRow,
  type LoadedManifest,
  type OfficialManifest,
} from '../src/index.ts'
import { content, row, tenant } from './fixtures.ts'

describe('directory scope and authorization judgments', () => {
  const alice = tenant()
  const bob = tenant('bob')
  const other = tenant('alice', 'other')
  const tenantScope = { layer: 'tenant', tenant: alice } as const
  const organizationScope = { layer: 'organization', organization: alice.organization } as const

  it('builds the tenant, organization, factory chain in priority order', () => {
    expect(scopeChain(alice)).toEqual([tenantScope, organizationScope, { layer: 'factory' }])
  })

  it('matches every scope component without cross-layer or cross-tenant fallback', () => {
    expect(scopeMatches(tenantScope, { layer: 'tenant', tenant: tenant() })).toBe(true)
    expect(scopeMatches(tenantScope, { layer: 'tenant', tenant: bob })).toBe(false)
    expect(scopeMatches(tenantScope, { layer: 'tenant', tenant: other })).toBe(false)
    expect(scopeMatches(organizationScope, { ...organizationScope })).toBe(true)
    expect(
      scopeMatches(organizationScope, { layer: 'organization', organization: other.organization }),
    ).toBe(false)
    expect(scopeMatches({ layer: 'factory' }, { layer: 'factory' })).toBe(true)
    expect(scopeMatches(tenantScope, organizationScope)).toBe(false)
    expect(scopeMatches(organizationScope, { layer: 'factory' })).toBe(false)
    expect(sameWriter(alice, tenantScope)).toBe(true)
    expect(sameWriter(bob, tenantScope)).toBe(false)
    expect(sameWriter(bob, organizationScope)).toBe(true)
    expect(sameWriter(other, organizationScope)).toBe(false)
  })

  it.each<readonly [ScopeLayerIdentity, MembershipStandingResult, string]>([
    [tenantScope, { standing: 'effective', role: 'member' }, 'eligible'],
    [tenantScope, { standing: 'ineffective' }, 'notAuthorized'],
    [tenantScope, { failure: 'unavailable' }, 'unavailable'],
    [organizationScope, { standing: 'effective', role: 'member' }, 'notAuthorized'],
    [organizationScope, { standing: 'effective', role: 'superAdministrator' }, 'eligible'],
    [{ layer: 'tenant', tenant: bob }, { failure: 'unavailable' }, 'notAuthorized'],
  ])('requires writer identity before reading membership outcome', (scope, standing, expected) => {
    expect(configEligibility(alice, scope, standing)).toBe(expected)
  })
})

describe('effective profile and credential selection', () => {
  it('chooses tenant over organization over official among listed allowed rows', () => {
    const official = row()
    const organization = row(
      { ...content, origin: 'custom' },
      {
        origin: 'custom',
        routeName: content.routeName,
        scope: { layer: 'organization', organization: tenant().organization },
      },
    )
    const own = row(
      { ...content, origin: 'custom' },
      {
        origin: 'custom',
        routeName: content.routeName,
        scope: { layer: 'tenant', tenant: tenant() },
      },
    )
    const withdrawn = { ...own, profile: { ...own.profile, registration: 'withdrawn' as const } }
    expect(
      winningRow([own, official, organization], content.routeName, new Set([content.routeName])),
    ).toBe(own)
    expect(
      winningRow([official, withdrawn, organization], content.routeName, [content.routeName]),
    ).toBe(organization)
    expect(winningRow([official, withdrawn], content.routeName, [content.routeName])).toBe(official)
    expect(winningRow([official, own], content.routeName, [])).toBeUndefined()
    expect(winningRow([official], 'missing', ['missing'])).toBeUndefined()
    expect(winningRow([withdrawn], content.routeName, [content.routeName])).toBeUndefined()
    expect(
      winningRow([organization, { ...organization }], content.routeName, [content.routeName]),
    ).toBe(organization)
  })

  it('gives an existing tenant binding priority and never exposes its credential reference', () => {
    const time = instantFromRfc3339('2026-10-08T01:00:00Z')
    if ('invalidInput' in time) throw new Error(time.invalidInput)
    const binding = { tenant: tenant(), credentialRef: 'private', boundAt: time.ok }
    expect(credentialSlot(undefined, 'custom', true)).toEqual({ present: false })
    expect(credentialSlot(undefined, 'official', false)).toEqual({ present: false })
    expect(credentialSlot(undefined, 'official', true)).toEqual({
      present: true,
      scope: { layer: 'factory' },
    })
    expect(credentialSlot(binding, 'official', true)).toEqual({
      present: true,
      scope: { layer: 'tenant', tenant: binding.tenant },
      boundAt: binding.boundAt,
    })
    expect(credentialSlot(binding, 'custom', false)).toEqual({
      present: true,
      scope: { layer: 'tenant', tenant: binding.tenant },
      boundAt: binding.boundAt,
    })
  })
})

describe('official manifest recognition and dispositions', () => {
  const loaded: LoadedManifest = {
    ordinal: 10,
    dispositions: [{ ref: row().ref, disposition: 'added' }],
    rows: [row()],
  }

  it('recognizes an equivalent ordinal/content and returns the original disposition', () => {
    expect(
      manifestDisposition(loaded, {
        ordinal: new LosslessNumber('1.00e1'),
        entries: [{ ...content }],
      }),
    ).toEqual({ ordinal: loaded.ordinal, dispositions: loaded.dispositions })
    const result = manifestDisposition(loaded, { ordinal: 10, entries: [content] })
    if ('failure' in result) throw new Error('expected recognition')
    expect(result.dispositions).toBe(loaded.dispositions)
  })

  it('rejects equal ordinal with changed content and rejects older ordinals', () => {
    expect(manifestDisposition(loaded, { ordinal: 10, entries: [] })).toEqual({
      failure: 'manifestNotNewer',
    })
    expect(
      manifestDisposition(loaded, { ordinal: 10, entries: [{ ...content, allowFallback: true }] }),
    ).toEqual({ failure: 'manifestNotNewer' })
    expect(manifestDisposition(loaded, { ordinal: 9, entries: [content] })).toEqual({
      failure: 'manifestNotNewer',
    })
    const large = { ...loaded, ordinal: new LosslessNumber('9007199254740993') }
    expect(
      manifestDisposition(large, {
        ordinal: new LosslessNumber('9007199254740992'),
        entries: [content],
      }),
    ).toEqual({ failure: 'manifestNotNewer' })
    expect(
      manifestDisposition(large, {
        ordinal: new LosslessNumber('9007199254740994'),
        entries: [content],
      }),
    ).toEqual({
      ordinal: new LosslessNumber('9007199254740994'),
      dispositions: [{ ref: row().ref, disposition: 'unchanged' }],
    })
  })

  it('compares enormous integral exponents without expansion or numeric rounding', () => {
    const large = { ...loaded, ordinal: new LosslessNumber('9e1000000') }
    const next: OfficialManifest = { ordinal: new LosslessNumber('1e1000001'), entries: [content] }
    expect(manifestDisposition(large, next)).toEqual({
      ordinal: next.ordinal,
      dispositions: [{ ref: row().ref, disposition: 'unchanged' }],
    })
    expect(
      manifestDisposition(
        { ...large, ordinal: next.ordinal },
        { ordinal: large.ordinal, entries: [content] },
      ),
    ).toEqual({ failure: 'manifestNotNewer' })
  })

  it('reports added, relisted, unchanged, updated and withdrawn in manifest order', () => {
    function named(routeName: string) {
      return {
        ...content,
        routeName,
        adaptation: {
          ...content.adaptation,
          definition: { ...content.adaptation.definition, modelId: routeName },
        },
      }
    }
    const old = {
      ordinal: 1,
      dispositions: [],
      rows: [
        row(named('same')),
        row(named('changed')),
        row(named('back'), undefined, 'withdrawn'),
        row(named('gone')),
      ],
    }
    const next = {
      ordinal: 2,
      entries: [
        named('new'),
        named('back'),
        named('same'),
        { ...named('changed'), allowFallback: true },
      ],
    }
    expect(manifestDisposition(old, next)).toEqual({
      ordinal: 2,
      dispositions: [
        { ref: { origin: 'official', routeName: 'new' }, disposition: 'added' },
        { ref: { origin: 'official', routeName: 'back' }, disposition: 'relisted' },
        { ref: { origin: 'official', routeName: 'same' }, disposition: 'unchanged' },
        { ref: { origin: 'official', routeName: 'changed' }, disposition: 'updated' },
        { ref: { origin: 'official', routeName: 'gone' }, disposition: 'withdrawn' },
      ],
    })
  })
})
