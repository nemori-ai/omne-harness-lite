import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { TENANT_A, TENANT_B, textOf } from '../storage/fixtures/tree.ts'

async function assembly(register: SqlStorage['registerCombination']) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'registration-lifecycle-')))
  const file = join(directory, 'tenants.json')
  writeFileSync(
    file,
    JSON.stringify({
      format: 'tenant-domain-directory/1',
      domainRule: 'organization-account/1',
      tenants: [textOf(TENANT_A), textOf(TENANT_B)],
    }),
  )
  const root = new Context()
  root.logger.exporter({ levels: { default: 0 }, export: () => {} })
  const registered = vi.fn()
  const dependency = await root.plugin({
    apply(ctx: Context) {
      ctx.provide('storage', { registerCombination: register })
      ctx.provide('sessionAccessCheck', {})
      ctx.provide('s0.assemblyLifecycle', { register: registered })
    },
  })
  const row = root.plugin(sessionStorageRow, {
    combinationVersion: 'registration-current',
    directoryFile: file,
    domainRule: 'organization-account/1',
  })
  return {
    root,
    dependency,
    row,
    registered,
    close: async () => {
      await root.fiber.dispose()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

it('publishes services only after all existing tenants are registered', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const register = vi.fn<SqlStorage['registerCombination']>(async input => {
    entered.resolve()
    await release.promise
    return { kind: 'registered', registration: input }
  })
  const app = await assembly(register)
  try {
    await entered.promise
    expect(app.root.get('tenantDomainLookup', false)).toBeUndefined()
    expect(app.registered).not.toHaveBeenCalled()
    release.resolve()
    await app.row
    expect(register).toHaveBeenCalledTimes(2)
    expect(app.root.get('tenantDomainLookup', false)).toBeDefined()
    expect(app.registered).toHaveBeenCalledTimes(1)
  } finally {
    release.resolve()
    await app.close()
  }
})

it('does not publish or retry unknown registration after dependency withdrawal', async () => {
  const entered = Promise.withResolvers<void>()
  const reply = Promise.withResolvers<void>()
  const register = vi.fn<SqlStorage['registerCombination']>(async input => {
    entered.resolve()
    await reply.promise
    return {
      kind: 'unknown',
      key: {
        scope: input.scope,
        transactionDomain: input.transactionDomain,
        combinationVersion: input.combinationVersion,
      },
      diagnostic: 'reply lost',
    }
  })
  const app = await assembly(register)
  try {
    await entered.promise
    const failed = expect(app.row).rejects.toThrow('current combination registration failed')
    const retiring = app.dependency.dispose()
    reply.resolve()
    await Promise.all([retiring, failed])
    expect(register).toHaveBeenCalledTimes(1)
    expect(app.root.get('tenantDomainLookup', false)).toBeUndefined()
    expect(app.registered).not.toHaveBeenCalled()
  } finally {
    reply.resolve()
    await app.close()
  }
})

it('does not publish services when an existing tenant registration fails', async () => {
  const register = vi.fn<SqlStorage['registerCombination']>(async () => ({
    kind: 'rejected_before_accept',
    reason: 'registration_conflict',
    diagnostic: null,
  }))
  const app = await assembly(register)
  try {
    await expect(app.row).rejects.toThrow('current combination registration failed')
    expect(register).toHaveBeenCalledTimes(1)
    expect(app.root.get('tenantDomainLookup', false)).toBeUndefined()
    expect(app.registered).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})
