import { describe, expect, it } from 'vitest'
import type { CardChangeListener } from '@omne-harness/human-intervention-access'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createToolHitlHost,
  withChanges,
  type HitlApplication,
} from '../../../src/rows/tool-hitl/host.ts'
import { fixtureTenant } from '../../entry/support.ts'

const authority = inProcessPrincipalAuthority()
const textOf = (tenant: TenantId) => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant')
  return text.value
}
const entryOf = (tenant: TenantId) => {
  const actor = authority.issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'harness.hitl', work: 'cards' },
  })
  if ('failure' in issued) throw new Error('principal')
  return issued.ok
}
const alice = fixtureTenant('a')
const bob = fixtureTenant('b')

function makeHost() {
  return createToolHitlHost({
    storage: {} as never,
    domains: {
      lookup: async ({ tenant }) => ({
        kind: 'ready',
        domain: { scope: { kind: 'tenant', tenant }, transactionDomain: `hitl:${tenant}` },
      }),
    },
    combination: { combinationVersion: 'v', manifestDigest: 'd' },
    verifier: () => authority.verifier,
    standing: () => ({ read: async () => ({ kind: 'not-member', evidence: {} }) as never }),
    reservations: () => ({}) as never,
  })
}

function listener() {
  const heard: string[] = []
  const it: CardChangeListener = {
    changed: () => heard.push('changed'),
    closed: () => heard.push('closed'),
  }
  return { heard, listener: it }
}

async function applicationOf(host: ReturnType<typeof makeHost>, tenant: TenantId) {
  const at = await host.tenant(textOf(tenant))
  if (at.kind !== 'ready') throw new Error(`tenant is ${at.kind}`)
  return at.tenant.application
}

describe('the card change signal of the HITL host', () => {
  it('a registration of a card tells the listeners of its tenant and no one else', async () => {
    const host = makeHost()
    const mine = listener()
    const other = listener()
    host.changes.subscribe(textOf(alice), mine.listener)
    host.changes.subscribe(textOf(bob), other.listener)
    const application = await applicationOf(host, alice)
    const answer = await application.registerRequest(entryOf(alice), {} as never)
    expect(answer.kind).toBe('invalid-input')
    expect(mine.heard).toEqual(['changed'])
    expect(other.heard).toEqual([])
  })

  it('a reply to a card tells the listeners of its tenant, and a read tells nobody', async () => {
    const host = makeHost()
    const mine = listener()
    host.changes.subscribe(textOf(alice), mine.listener)
    const application = await applicationOf(host, alice)
    await application.listPool(entryOf(alice), {} as never)
    expect(mine.heard).toEqual([])
    await application.submitReply(entryOf(alice), {} as never)
    expect(mine.heard).toEqual(['changed'])
  })

  it('a listener that throws neither stops the others nor changes the answer of the write', async () => {
    const host = makeHost()
    const second = listener()
    host.changes.subscribe(textOf(alice), {
      changed: () => {
        throw new Error('listener fault')
      },
      closed: () => {},
    })
    host.changes.subscribe(textOf(alice), second.listener)
    const application = await applicationOf(host, alice)
    const answer = await application.invalidateWait(entryOf(alice), {} as never)
    expect(answer.kind).toBe('invalid-input')
    expect(second.heard).toEqual(['changed'])
  })

  it('a listener that unsubscribed hears nothing, and unsubscribing twice does nothing', async () => {
    const host = makeHost()
    const mine = listener()
    const stop = host.changes.subscribe(textOf(alice), mine.listener)
    stop()
    stop()
    const application = await applicationOf(host, alice)
    await application.acknowledgeDelivery(entryOf(alice), {} as never)
    expect(mine.heard).toEqual([])
  })

  it('closing the host tells every listener closed, and a later subscriber hears closed at once', async () => {
    const host = makeHost()
    const a = listener()
    const b = listener()
    host.changes.subscribe(textOf(alice), a.listener)
    host.changes.subscribe(textOf(bob), b.listener)
    await host.close()
    expect(a.heard).toEqual(['closed'])
    expect(b.heard).toEqual(['closed'])
    const late = listener()
    const stop = host.changes.subscribe(textOf(alice), late.listener)
    expect(late.heard).toEqual(['closed'])
    expect(() => stop()).not.toThrow()
  })
})

describe('the write wrapper', () => {
  const methods = [
    'registerRequest',
    'submitReply',
    'invalidateWait',
    'acknowledgeDelivery',
    'bindReceiver',
    'consumeDecision',
  ] as const

  it.each(methods)('%s tells after it settles, also when it throws', async method => {
    let told = 0
    let settled = false
    const fake = {
      [method]: async () => {
        await Promise.resolve()
        settled = true
        throw new Error('write fault')
      },
    } as unknown as HitlApplication
    const wrapped = withChanges(fake, () => {
      expect(settled).toBe(true)
      told += 1
    })
    await expect((wrapped[method] as (...args: never[]) => Promise<unknown>)()).rejects.toThrow(
      'write fault',
    )
    expect(told).toBe(1)
  })

  it('leaves the reads unwrapped', () => {
    const read = async () => ({ kind: 'page' })
    const fake = { listPool: read, getCard: read, getOperation: read } as unknown as HitlApplication
    const wrapped = withChanges(fake, () => {})
    expect([wrapped.listPool, wrapped.getCard, wrapped.getOperation]).toEqual([read, read, read])
  })
})
