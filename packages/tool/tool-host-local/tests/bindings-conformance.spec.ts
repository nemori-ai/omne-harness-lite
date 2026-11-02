import type { ContentBlock } from '@omne-harness/content-block'
// The G7 suite of the binding registry (`toolBindingRegistryConformance`) against the local
// registry, and the rules of the registry that the suite does not name: no verifier means no
// admission, a failed check leaves nothing behind, a pin shows in `pins` and `drain`, and a fiber
// that ended registers no more. The origin check is scripted here; this package ships none.
import { describe, expect, it } from 'vitest'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  memoryToolBindingRegistryFixture,
  toolBindingRegistryConformance,
  type ToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { fail } from '@omne-harness/operation-result'
import { createLocalToolBindingRegistry } from '@omne-harness/tool-host-local'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  loadedFor,
  officialLayer,
  register,
  scriptedVerifier,
  tenantA,
  tenantB,
  tenantLayer,
} from './binding-values.ts'

/** The cases that this registry cannot run, with the handle each one misses. */
const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

function fixture(): ToolBindingRegistryFixture<string> {
  // The contract double only lends the authorities and the loaded-registration builder.
  const lent = memoryToolBindingRegistryFixture()
  const granted = [lent.authority, lent.otherAuthority!]
  const { registry, asFiber } = fiberedRegistry(scriptedVerifier(granted))
  return {
    registry,
    access: lent.access,
    authority: lent.authority,
    otherAuthority: lent.otherAuthority!,
    foreignAuthority: lent.foreignAuthority!,
    loaded: lent.loaded,
    asFiber,
    endFiber: fiber => {
      registry.retire(fiber)
      return Promise.resolve()
    },
  }
}

describe('G7 conformance: the local binding registry against the registry suite', () => {
  const cases = toolBindingRegistryConformance<string>()

  it('runs every case of the suite', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases)('$clause $name', async conformance => {
    const verdict = await runConformanceCase(conformance, fixture())
    const missing = NOT_APPLICABLE[conformance.name]
    expect(verdict).toEqual(
      missing === undefined ? { kind: 'passed' } : { kind: 'not-applicable', handle: missing },
    )
  })
})

const access = accessOf(tenantA)
const official = authorityFor(officialLayer, 'read_file')
const call = (text: string) => {
  const decoded = decodeToolCallId(text)
  if (!('ok' in decoded)) throw new Error(text)
  return decoded.ok
}

describe('G7 registry rules beyond the suite', () => {
  it('G7 without an injected verifier register answers unavailable and registers nothing', () => {
    const { registry } = fiberedRegistry(null)
    const outcome = register(registry, access, official)
    expect(outcome).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
  })

  it('G7 a verifier failure passes through unchanged and registers nothing', () => {
    for (const failure of [
      { kind: 'denied' },
      { kind: 'invalid', reason: 'layer' },
      { kind: 'unavailable', diagnostic: 'store' },
    ] as const) {
      const { registry } = fiberedRegistry({
        verify: () => fail(failure),
        admits: () => fail({ kind: 'denied' }),
      })
      expect(register(registry, access, official)).toEqual({ failure })
      expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
    }
  })

  it('G7 a registrant without the registration right at the verified layer is denied', () => {
    const foreign = authorityFor(tenantLayer(tenantB), 'read_file', 'holding-b')
    const { registry } = fiberedRegistry(scriptedVerifier([foreign]))
    expect(register(registry, access, foreign)).toEqual({ failure: { kind: 'denied' } })
    expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
  })

  it('G7 a loaded registration whose shape is not the shape of its definition is invalid', () => {
    const { registry } = fiberedRegistry(scriptedVerifier([official]))
    const loaded = loadedFor(official)
    const forged = { ...loaded, shape: { ...loaded.shape, name: 'other_name' } }
    const outcome = registry.register({ ...access, loaded: forged, authority: official })
    expect(outcome).toEqual({ failure: { kind: 'invalid', reason: 'shape' } })
    expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
  })

  it('G7 a pin shows in pins and drain until it is released, and a repeat release changes nothing', () => {
    const { registry } = fiberedRegistry(scriptedVerifier([official]))
    const registered = register(registry, access, official)
    if (!('ok' in registered)) throw new Error('register')
    const { key } = registered.ok
    const first = registry.pin(key, call('call-1'))
    const second = registry.pin(key, call('call-2'))
    if (!('ok' in first) || !('ok' in second)) throw new Error('pin')
    expect(registry.pins(key)).toEqual({ ok: '2' })
    expect(registry.drain(key)).toEqual({ ok: { pins: '2', inflight: ['call-1', 'call-2'] } })
    first.ok.release()
    first.ok.release()
    expect(registry.pins(key)).toEqual({ ok: '1' })
    expect(registry.drain(key)).toEqual({ ok: { pins: '1', inflight: ['call-2'] } })
    second.ok.release()
    expect(registry.drain(key)).toEqual({ ok: { pins: '0', inflight: [] } })
  })

  it('G7 a pin on an unknown key is refused', () => {
    const { registry } = fiberedRegistry(scriptedVerifier([official]))
    const registered = register(registry, access, official)
    if (!('ok' in registered)) throw new Error('register')
    registered.ok.release()
    expect(registry.pin(registered.ok.key, call('call-1'))).toEqual({
      failure: { kind: 'unknown-key' },
    })
  })

  it('G7 a fiber that ended registers no more, and its contributions are gone', () => {
    const { registry, asFiber } = fiberedRegistry(scriptedVerifier([official]))
    asFiber('fiber-1', () => register(registry, access, official))
    registry.retire('fiber-1')
    expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
    const later = asFiber('fiber-1', () => register(registry, access, official))
    expect(later).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('G7 an unknown caller fiber is unavailable, not an anonymous registration', () => {
    const registry = createLocalToolBindingRegistry<string, unknown, ContentBlock>({
      verifier: scriptedVerifier([official]),
      fiber: () => null,
    })
    expect(register(registry, access, official)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(registry.snapshot({ scope: 'system' })).toEqual({ ok: [] })
  })
})
