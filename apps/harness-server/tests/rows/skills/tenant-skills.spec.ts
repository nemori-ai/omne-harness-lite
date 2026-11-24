import { describe, expect, it } from 'vitest'
import { access } from '@omne-harness/legal-identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  directoryOf,
  routedSkills,
  sessionSkillsOf,
  TenantSkillsHost,
  type TenantSkills,
} from '../../../src/rows/skills/tenant-skills.ts'
import { fixtureTenant } from '../../entry/support.ts'

const alpha = fixtureTenant('a')
const beta = fixtureTenant('b')

function keyOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant')
  return encoded.value
}

function setOf(label: string): TenantSkills {
  return {
    catalog: {
      summaries: async () => ({ ok: [] }),
      search: async () => ({ ok: [{ kind: 'adopted', name: label } as never] }),
    },
    access: {
      read: async () => ({ failure: { kind: 'resource-missing' } }),
      list: async () => ({ failure: { kind: 'source-unavailable' } }),
    },
    sessionCatalog: {
      summaries: async () => ({ ok: [{ kind: 'adopted', name: label } as never] }),
      search: async () => ({ ok: [] }),
    },
  }
}

function world() {
  const opened: string[] = []
  let answer: 'set' | 'none' | 'throw' = 'set'
  const gates: (() => void)[] = []
  let gated = false
  const host = new TenantSkillsHost({
    async open(tenant, tenantRef) {
      if (gated) await new Promise<void>(resolve => gates.push(resolve))
      opened.push(tenantRef)
      if (answer === 'throw') throw new Error('store down')
      if (answer === 'none') return undefined
      return setOf(keyOf(tenant) === keyOf(alpha) ? 'alpha' : 'beta')
    },
  })
  return {
    host,
    routed: routedSkills(host),
    opened,
    answer: (value: typeof answer) => {
      answer = value
    },
    hold: () => {
      gated = true
    },
    release: () => {
      gated = false
      for (const go of gates.splice(0)) go()
    },
  }
}

describe('one Skill service set per tenant, over the local assets of the tenant', () => {
  it('builds one set for concurrent first calls and reuses it after', async () => {
    const w = world()
    w.hold()
    const first = w.host.get(alpha)
    const second = w.host.get(alpha)
    expect(second).toBe(first)
    w.release()
    expect(await first).toBe(await second)
    expect(await w.host.get(alpha)).toBe(await first)
    expect(w.opened).toEqual([keyOf(alpha)])
  })

  it('routes each call to the set of the tenant in its access', async () => {
    const w = world()
    expect(await w.routed.catalog.search(access('p', alpha), null, { text: '' })).toMatchObject({
      ok: [{ name: 'alpha' }],
    })
    expect(await w.routed.catalog.search(access('p', beta), null, { text: '' })).toMatchObject({
      ok: [{ name: 'beta' }],
    })
    expect(await w.routed.catalog.summaries(access('p', beta), null)).toStrictEqual({ ok: [] })
    expect(
      await w.routed.access.read(access('p', alpha), null, {
        capability: { category: 'skill', name: 'x' } as never,
        part: { kind: 'body' },
      }),
    ).toStrictEqual({ failure: { kind: 'resource-missing' } })
    expect(
      await w.routed.access.list(access('p', beta), null, {
        category: 'skill',
        name: 'x',
      } as never),
    ).toStrictEqual({ failure: { kind: 'source-unavailable' } })
  })

  it('asks the session catalog of the tenant it is given, and answers unknown when that tenant has no set', async () => {
    const w = world()
    const sessionSkills = sessionSkillsOf(w.host)
    expect(await sessionSkills(alpha, [])).toMatchObject({ ok: [{ name: 'alpha' }] })
    expect(await sessionSkills(beta, [])).toMatchObject({ ok: [{ name: 'beta' }] })
    w.answer('none')
    const fresh = world()
    fresh.answer('none')
    expect(await sessionSkillsOf(fresh.host)(alpha, [])).toStrictEqual({ failure: 'unknown' })
  })

  it('answers no set, and keeps no failure, when the local assets are not there or the set cannot be built', async () => {
    const w = world()
    w.answer('none')
    expect(await w.host.get(alpha)).toBeUndefined()
    w.answer('throw')
    expect(await w.host.get(alpha)).toBeUndefined()
    w.answer('set')
    expect(await w.host.get(alpha)).toBeDefined()
    expect(w.opened).toHaveLength(3)
  })

  it('answers unknown through the routed services when there is no set', async () => {
    const w = world()
    w.answer('none')
    expect(await w.routed.catalog.search(access('p', alpha), null, { text: '' })).toStrictEqual({
      failure: 'unknown',
    })
    expect(await w.routed.catalog.summaries(access('p', alpha), null)).toStrictEqual({
      failure: 'unknown',
    })
    expect(
      await w.routed.access.list(access('p', alpha), null, {
        category: 'skill',
        name: 'x',
      } as never),
    ).toStrictEqual({ failure: { kind: 'unknown' } })
    expect(
      await w.routed.access.read(access('p', alpha), null, {
        capability: { category: 'skill', name: 'x' } as never,
        part: { kind: 'body' },
      }),
    ).toStrictEqual({ failure: { kind: 'unknown' } })
  })

  it('answers no set after closing, also for a set that finishes building after', async () => {
    const w = world()
    await w.host.get(alpha)
    w.hold()
    const late = w.host.get(beta)
    w.host.close()
    w.release()
    expect(await late).toBeUndefined()
    const opened = w.opened.length
    expect(await w.host.get(alpha)).toBeUndefined()
    expect(await w.host.get(fixtureTenant('c'))).toBeUndefined()
    expect(w.opened).toHaveLength(opened)
  })

  it('gives the local directory of a Skill version, none when it has none, and unavailable when the store cannot tell', async () => {
    const asked: unknown[] = []
    const at = (place: object) =>
      directoryOf({
        packages: {
          locate: async (request: unknown) => {
            asked.push(request)
            return place
          },
        },
      } as never)({ ref: 'skill/x', digest: 'sha256:0' } as never)
    expect(await at({ kind: 'local-directory', path: '/skills/x' })).toStrictEqual({
      ok: '/skills/x',
    })
    expect(await at({ kind: 'absent' })).toStrictEqual({ ok: null })
    expect(await at({ kind: 'unavailable' })).toStrictEqual({ failure: 'unavailable' })
    expect(asked[0]).toStrictEqual({ assetRef: 'skill/x', version: 'sha256:0' })
  })
})
