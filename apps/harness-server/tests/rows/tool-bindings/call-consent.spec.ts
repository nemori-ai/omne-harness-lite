import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { grantRefText } from '@omne-harness/authorization'
import type { ToolStartRelease } from '@omne-harness/tool-contract/provider'
import { tenantCodec } from '@omne-harness/legal-identity'
import { callConsent, consentOfReading } from '../../../src/rows/tool-bindings/call-consent.ts'
import { holdLiveCall, liveCallKey, liveCalls } from '../../../src/rows/tool-bindings/live-calls.ts'
import { fixtureTenant } from '../../entry/support.ts'

const gate = { capability: 'tool.Schedules', key: 'tool.activate' }
const source = { owner: 'session', record: 'r', revision: '1', digest: 'd' }
const verdict = (layer: 'tenant' | 'session') =>
  grantRefText({ via: 'verdict', layer, holder: 'h', gate, revision: 'r1' })
const sessionGrant = grantRefText({ via: 'session-grant', holder: 's', gate, source })
const once = grantRefText({ via: 'once', holder: 's', source })
const skip = grantRefText({ via: 'skip-ask', holder: 's', source })

describe('the consent a release gives a domain write', () => {
  it.each([
    ['a verdict of the tenant', { by: 'verdict', grant: verdict('tenant') }, 'blanket', 'standing'],
    [
      'a verdict the session took part in',
      { by: 'verdict', grant: verdict('session') },
      'blanket',
      'session',
    ],
    ['a release for the session', { by: 'session', grant: sessionGrant }, 'blanket', 'session'],
    ['a run mode that skips asking', { by: 'skip-ask', grant: skip }, 'blanket', 'session'],
    ['a release of this one call', { by: 'once', grant: once }, 'granular', 'session'],
  ] as const)('reads %s as %s %s, naming the grant', (_, release, kind, scope) => {
    expect(consentOfReading({ kind: 'released', release })).toEqual({
      kind: 'consented',
      basis: { kind, scope, grant: release.grant },
    })
  })

  it.each([
    ['nothing was released', { kind: 'absent' } as const, { kind: 'none' }],
    [
      'a carrier',
      { kind: 'released', release: { by: 'carrier', grant: null } } as const,
      { kind: 'none' },
    ],
    [
      'an ungated command',
      { kind: 'released', release: { by: 'ungated', grant: null } } as const,
      { kind: 'none' },
    ],
    [
      'a verdict whose grant does not read',
      { kind: 'released', release: { by: 'verdict', grant: '{}' } } as const,
      { kind: 'unavailable' },
    ],
  ])('gives no consent when %s', (_, reading, answer) => {
    expect(consentOfReading(reading)).toEqual(answer)
  })
})

describe('the consent of a live call', () => {
  const access = { principal: { who: 'agent' }, tenant: 'tenant-a', call: 'call-1' }
  function contextWith(releases: unknown) {
    const ctx = { root: {}, get: () => releases } as unknown as Context
    liveCalls(ctx).set(liveCallKey('tenant-a', 'call-1'), access as never)
    return ctx
  }
  const released: ToolStartRelease = { by: 'once', grant: once }

  it('reads the release of that call with its own access', async () => {
    const seen: unknown[] = []
    const ctx = contextWith({
      releaseOf: async (input: unknown) => {
        seen.push(input)
        return { ok: { kind: 'released', release: released } }
      },
    })
    expect(await callConsent(ctx)('tenant-a', 'call-1')).toMatchObject({ kind: 'consented' })
    expect(seen).toEqual([access])
  })

  it('gives no consent for a call that is not live in this tenant, without reading a release', async () => {
    const seen: unknown[] = []
    const ctx = contextWith({
      releaseOf: async (input: unknown) => {
        seen.push(input)
        return { ok: { kind: 'released', release: released } }
      },
    })
    expect(await callConsent(ctx)('tenant-b', 'call-1')).toEqual({ kind: 'none' })
    expect(await callConsent(ctx)('tenant-a', 'call-2')).toEqual({ kind: 'none' })
    expect(seen).toEqual([])
  })

  it.each([
    ['the read port is absent', undefined],
    ['the read fails', { releaseOf: async () => ({ failure: { kind: 'unavailable' } }) }],
    [
      'the read throws',
      {
        releaseOf: async () => {
          throw new Error('down')
        },
      },
    ],
  ])('answers unavailable when %s', async (_, releases) => {
    expect(await callConsent(contextWith(releases))('tenant-a', 'call-1')).toEqual({
      kind: 'unavailable',
    })
  })
})

describe('a call held live while its scope is open', () => {
  const tenant = fixtureTenant('a')
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('tenant')
  const access = { principal: { who: 'agent' }, tenant, call: 'call-1' as never }
  const key = liveCallKey(text.value, 'call-1')
  const scope = () => {
    const finished: string[] = []
    return {
      finished,
      scope: {
        context: {},
        limits: {},
        finish: async (exit: string) => {
          finished.push(exit)
          return { ok: undefined }
        },
      } as never,
    }
  }

  it('is registered with its access until its scope finishes', async () => {
    const ctx = { root: {} } as unknown as Context
    const { finished, scope: open } = scope()
    const held = holdLiveCall(ctx, access, open)
    expect(liveCalls(ctx).get(key)).toEqual(access)
    await held.finish('returned')
    expect(finished).toEqual(['returned'])
    expect(liveCalls(ctx).has(key)).toBe(false)
  })

  it('leaves a later hold of the same call in place when an earlier one finishes', async () => {
    const ctx = { root: {} } as unknown as Context
    const first = holdLiveCall(ctx, access, scope().scope)
    holdLiveCall(ctx, access, scope().scope)
    const later = liveCalls(ctx).get(key)
    await first.finish('returned')
    expect(liveCalls(ctx).get(key)).toBe(later)
  })
})
