import { expect, it } from 'vitest'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type { RuntimeContextDiagnostic } from '@omne-harness/runtime-context'
import {
  firstBlock,
  harness,
  issue,
  open,
  producer,
  reader,
  register,
  scope,
  supplied,
  tenantA,
} from './support.js'

// RC-08: diagnostics carry block keys, revisions, generations and result kinds, never a value.
const SECRET = 424242

it('an old generation publication, a supply timeout and a failing change outlet leave no value in diagnostics', async () => {
  const h = harness({ supplyBoundMs: 10 })
  const a = scope('diag/a')
  await open(h, a, tenantA)
  const declaration = supplied('test.secret', { disclosure: 'eligibility-checked' })
  const old = await producer(h, tenantA, 'test.secret', { declaration })
  await register(h, a, tenantA, 'test.secret')
  const current = await producer(h, tenantA, 'test.secret', { declaration })
  expect(await old.publish({ scope: a, tenant: tenantA, value: SECRET })).toEqual({
    kind: 'rejected',
    reason: 'stale-generation',
  })
  expect((await current.publish({ scope: a, tenant: tenantA, value: SECRET })).kind).toBe(
    'published',
  )
  await producer(h, tenantA, 'test.slow', {
    declaration: { ...supplied('test.slow'), volatility: 'per-request' },
    supply: () => new Promise(() => {}),
  })
  await register(h, a, tenantA, 'test.slow', 1)
  const r = await reader(h, await issue(h, a, tenantA, ['test.secret', 'test.slow']))
  const s = await r.snapshot()
  expect(s.kind).toBe('success')
  const kinds = new Set(h.diagnostics.map(d => d.kind))
  expect(kinds).toContain('stale-publication')
  expect(kinds).toContain('supply-timeout')
  expect(JSON.stringify(h.diagnostics)).not.toContain(String(SECRET))
})

it('a change outlet that throws is diagnosed and the write stands', async () => {
  const ports = createTestAuthorityPorts<string>()
  const diagnostics: RuntimeContextDiagnostic[] = []
  const rc = createRuntimeContext<string>({
    trust: ports,
    onChange: () => {
      throw new Error(`listener saw ${SECRET}`)
    },
    diagnose: event => {
      diagnostics.push(event)
    },
  })
  const h = { rc, ports, diagnostics, changes: [] }
  const a = scope('diag/outlet')
  await open(h, a, tenantA)
  const handle = await producer(h, tenantA, 'test.value')
  await register(h, a, tenantA, 'test.value')
  expect((await handle.publish({ scope: a, tenant: tenantA, value: SECRET })).kind).toBe(
    'published',
  )
  const r = await reader(h, await issue(h, a, tenantA, ['test.value']))
  expect(await firstBlock(r)).toEqual({ kind: 'value', value: SECRET })
  expect(diagnostics.some(d => d.kind === 'change-outlet-failed')).toBe(true)
  expect(JSON.stringify(diagnostics)).not.toContain(String(SECRET))
})

it('the change outlet is called once per view revision with the new revision', async () => {
  const h = harness()
  const a = scope('diag/changes')
  await open(h, a, tenantA)
  const handle = await producer(h, tenantA, 'test.value')
  await register(h, a, tenantA, 'test.value')
  const before = h.changes.length
  await handle.publish({ scope: a, tenant: tenantA, value: 1 })
  await handle.publish({ scope: a, tenant: tenantA, value: 2 })
  const added = h.changes.slice(before)
  expect(added.map(([target]) => target.ref)).toEqual([a.ref, a.ref])
  expect(added[1]?.[1]).toBe((added[0]?.[1] ?? 0) + 1)
})

it('a diagnostic sink that throws does not change the result', async () => {
  const ports = createTestAuthorityPorts<string>()
  const rc = createRuntimeContext<string>({
    trust: ports,
    diagnose: () => {
      throw new Error('sink down')
    },
  })
  const h = { rc, ports, diagnostics: [], changes: [] }
  const a = scope('diag/sink')
  await open(h, a, tenantA)
  const old = await producer(h, tenantA, 'test.value')
  await register(h, a, tenantA, 'test.value')
  await producer(h, tenantA, 'test.value')
  expect(await old.publish({ scope: a, tenant: tenantA, value: 1 })).toEqual({
    kind: 'rejected',
    reason: 'stale-generation',
  })
})
