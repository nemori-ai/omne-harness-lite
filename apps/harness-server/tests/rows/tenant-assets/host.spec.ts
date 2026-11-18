import { describe, expect, it } from 'vitest'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import { TenantAssetsHost } from '../../../src/rows/tenant-assets/host.ts'

function fake(tenant: string) {
  let closed = 0
  const assets = {
    tenant,
    close: async () => {
      closed += 1
    },
  } as unknown as AssetsLocal
  return { assets, closed: () => closed }
}

function setup(registered: readonly string[]) {
  const opened: string[] = []
  const made = new Map<string, ReturnType<typeof fake>>()
  let gate: Promise<void> = Promise.resolve()
  const domains: TenantDomainLookup = {
    async lookup({ tenant }) {
      return registered.includes(tenant)
        ? {
            kind: 'ready',
            domain: { scope: { kind: 'tenant', tenant }, transactionDomain: tenant },
          }
        : { kind: 'unregistered' }
    },
  }
  const host = new TenantAssetsHost({
    domains,
    async open(domain: DomainRef) {
      const tenant = domain.scope.kind === 'tenant' ? domain.scope.tenant : 'system'
      opened.push(tenant)
      await gate
      const one = fake(tenant)
      made.set(tenant, one)
      return one.assets
    },
  })
  return {
    host,
    opened,
    made,
    hold() {
      let release = () => {}
      gate = new Promise(resolve => {
        release = resolve
      })
      return () => release()
    },
  }
}

describe('the tenant assets host: one local assets per tenant', () => {
  it('同一个租户并发取两次是同一份，只开一次（恢复随开只跑一次）', async () => {
    const w = setup(['alpha'])
    const release = w.hold()
    const first = w.host.open('alpha')
    const second = w.host.open('alpha')
    release()
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(await w.host.open('alpha')).toBe(a)
    expect(w.opened).toEqual(['alpha'])
  })

  it('不同的租户各一份', async () => {
    const w = setup(['alpha', 'beta'])
    const a = await w.host.open('alpha')
    const b = await w.host.open('beta')
    expect(a).not.toBe(b)
    expect(w.opened).toEqual(['alpha', 'beta'])
  })

  it('租户域没登记：答没有，不记住失败，登记之后再取能开', async () => {
    const registered: string[] = []
    const w = setup(registered)
    expect(await w.host.open('alpha')).toBeUndefined()
    registered.push('alpha')
    expect(await w.host.open('alpha')).toBeDefined()
    expect(w.opened).toEqual(['alpha'])
  })

  it('查到的事务域属于别的租户：答没有，不开', async () => {
    const opened: string[] = []
    const host = new TenantAssetsHost({
      domains: {
        lookup: async () => ({
          kind: 'ready',
          domain: { scope: { kind: 'tenant', tenant: 'beta' }, transactionDomain: 'beta' },
        }),
      },
      async open(domain) {
        opened.push(domain.transactionDomain)
        return fake('beta').assets
      },
    })
    expect(await host.open('alpha')).toBeUndefined()
    expect(opened).toEqual([])
  })

  it('开的时候抛出：答没有，不记住失败', async () => {
    let fail = true
    const host = new TenantAssetsHost({
      domains: {
        lookup: async ({ tenant }) => ({
          kind: 'ready',
          domain: { scope: { kind: 'tenant', tenant }, transactionDomain: tenant },
        }),
      },
      async open(domain) {
        if (fail) throw new Error('the recovery scan could not read a record')
        return fake(domain.transactionDomain).assets
      },
    })
    expect(await host.open('alpha')).toBeUndefined()
    fail = false
    expect(await host.open('alpha')).toBeDefined()
  })

  it('关闭时关掉它开的每一份，之后答没有', async () => {
    const w = setup(['alpha', 'beta'])
    await w.host.open('alpha')
    await w.host.open('beta')
    await w.host.close()
    expect(w.made.get('alpha')?.closed()).toBe(1)
    expect(w.made.get('beta')?.closed()).toBe(1)
    expect(await w.host.open('alpha')).toBeUndefined()
  })

  it('开着的时候关闭：开成的那一份随即关掉，不交出去', async () => {
    const w = setup(['alpha'])
    const release = w.hold()
    const pending = w.host.open('alpha')
    const closing = w.host.close()
    release()
    expect(await pending).toBeUndefined()
    await closing
    expect(w.made.get('alpha')?.closed()).toBe(1)
  })
})
