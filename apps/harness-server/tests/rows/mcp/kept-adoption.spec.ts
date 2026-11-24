import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint, AdoptionView } from '@omne-harness/mcp-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EndpointSettingRead } from '../../../src/rows/mcp/endpoints.ts'
import { keptAdoption, keptSettings } from '../../../src/rows/mcp/kept-adoption.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

const home = tenantOf('s')
const away = tenantOf('t')
const ref = (name: string) => ({ name, holding: `held-${name}` }) as unknown as EndpointRef
const asker = (who: TenantId) => ({ principal: null, tenant: who })

function world() {
  const reads: string[] = []
  const answers = new Map<string, Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>>()
  let revision = 0
  let stamp: string | undefined = 's1'
  const inner: AdoptionView<unknown, unknown> = {
    async endpoint(who, endpoint) {
      reads.push(endpoint.name)
      revision += 1
      return (
        answers.get(endpoint.name) ??
        succeed({
          ref: endpoint,
          revision: `r${String(revision)}`,
          body: { kind: 'null' },
          settings: {
            target: { kind: 'absent' },
            credential: { kind: 'absent' },
            connectTimeout: { kind: 'absent' },
          },
        } as unknown as AdoptedEndpoint)
      )
    },
    endpoints: () => Promise.reject(new Error('the kept view composes endpoints itself')),
  }
  const held = new Map<TenantId, readonly EndpointRef[]>([[home, [ref('docs'), ref('wiki')]]])
  const view = keptAdoption(
    inner,
    async who => succeed(held.get(who) ?? []),
    () => stamp,
  )
  return {
    view,
    reads,
    answers,
    move: (next: string | undefined) => {
      stamp = next
    },
  }
}

describe('the adoption kept for each tenant', () => {
  it('is read once for each endpoint until the stamp moves, and read again after', async () => {
    const w = world()
    const first = await w.view.endpoints(asker(home), null)
    await w.view.endpoint(asker(home), ref('docs'))
    expect(w.reads).toEqual(['docs', 'wiki'])
    w.move('s2')
    const second = await w.view.endpoints(asker(home), null)
    expect(w.reads).toEqual(['docs', 'wiki', 'docs', 'wiki'])
    expect(second).not.toEqual(first)
  })

  it('keeps nothing while the stamp cannot be told', async () => {
    const w = world()
    w.move(undefined)
    await w.view.endpoint(asker(home), ref('docs'))
    await w.view.endpoint(asker(home), ref('docs'))
    expect(w.reads).toEqual(['docs', 'docs'])
  })

  it('does not keep an answer that could not be read, and it leaves the other endpoints answered', async () => {
    const w = world()
    w.answers.set('wiki', fail('unknown'))
    expect(await w.view.endpoint(asker(home), ref('docs'))).toHaveProperty('ok')
    expect(await w.view.endpoint(asker(home), ref('wiki'))).toEqual(fail('unknown'))
    expect(await w.view.endpoints(asker(home), null)).toEqual(fail('unknown'))
    w.answers.delete('wiki')
    expect(await w.view.endpoint(asker(home), ref('wiki'))).toHaveProperty('ok')
    expect(w.reads.filter(name => name === 'docs')).toEqual(['docs'])
  })

  it('keeps each tenant apart', async () => {
    const w = world()
    await w.view.endpoint(asker(home), ref('docs'))
    await w.view.endpoint(asker(away), ref('docs'))
    expect(w.reads).toEqual(['docs', 'docs'])
    expect(await w.view.endpoints(asker(away), null)).toEqual(succeed([]))
  })
})

const item = (revision: string): EndpointSettingRead => ({ kind: 'unset', revision })

function settingsWorld() {
  const reads: TenantId[] = []
  let answer: 'unknown' | undefined
  let stamp: string | undefined = 's1'
  const settings = keptSettings(
    async who => {
      reads.push(who)
      if (answer !== undefined) return answer
      return new Map([
        ['docs', new Map([['target', item(String(reads.length))]])],
        ['wiki', new Map([['target', item('w')]])],
      ])
    },
    () => stamp,
  )
  return {
    settings,
    reads,
    fail: (unknown: boolean) => {
      answer = unknown ? 'unknown' : undefined
    },
    move: (next: string | undefined) => {
      stamp = next
    },
  }
}

describe('the settings kept for each tenant', () => {
  it('reads a tenant once for all its endpoints asked at the same time', async () => {
    const w = settingsWorld()
    const [docs, wiki, none] = await Promise.all([
      w.settings(home, 'docs'),
      w.settings(home, 'wiki'),
      w.settings(home, 'none'),
    ])
    expect(w.reads).toEqual([home])
    expect(docs).toEqual(new Map([['target', item('1')]]))
    expect(wiki).toEqual(new Map([['target', item('w')]]))
    expect(none).toEqual(new Map())
  })

  it('reads the tenant again when the stamp moves, and each time while it cannot be told', async () => {
    const w = settingsWorld()
    await w.settings(home, 'docs')
    await w.settings(home, 'docs')
    w.move('s2')
    expect(await w.settings(home, 'docs')).toEqual(new Map([['target', item('2')]]))
    w.move(undefined)
    await w.settings(home, 'docs')
    await w.settings(home, 'docs')
    expect(w.reads).toHaveLength(4)
  })

  it('does not keep a read that could not be made', async () => {
    const w = settingsWorld()
    w.fail(true)
    expect(await w.settings(home, 'docs')).toBe('unknown')
    w.fail(false)
    expect(await w.settings(home, 'docs')).toEqual(new Map([['target', item('2')]]))
    expect(w.reads).toHaveLength(2)
  })

  it('keeps each tenant apart', async () => {
    const w = settingsWorld()
    await w.settings(home, 'docs')
    await w.settings(away, 'docs')
    expect(w.reads).toEqual([home, away])
  })
})
