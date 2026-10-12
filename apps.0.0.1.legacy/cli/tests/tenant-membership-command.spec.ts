import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { openCliCatalog } from '../src/catalog-open.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { tenantPaths } from '../src/state-layout.ts'
import type { SelectedTenantPorts } from '../src/selected-tenant-work.ts'
import {
  runTenantMembershipCommand,
  type TenantMembershipInput,
} from '../src/tenant-membership-command.ts'
import { tenantReference, parseTenantReference } from '../src/tenant-reference.ts'

const clean: (() => Promise<void>)[] = []
const centerId = 'a'.repeat(32),
  account = 'owner',
  handle = 'original'
const selected = checkedTenantBinding({
  formatVersion: 1,
  centerId,
  tenant: { organization: 'personal', account },
})
const target = checkedTenantBinding({ ...selected, tenant: { organization: 'team', account } })
const originalSecret = 'original-private-bearer'
const og = (n: number) => `capability.organization-governance/v2#S-${n}`
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of clean.splice(0).reverse()) await close()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-tenant-membership-'))
  clean.push(() => rm(root, { recursive: true, force: true }))
  const home = join(root, '.omne')
  const source = await openClientLocalState(
    { directory: join(root, 'source') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  clean.push(() => source.close())
  const initial = await source.read()
  if (initial.kind !== 'read') throw new Error('fixture read failed')
  await source.compareAndReplace(
    initial.snapshot.token,
    {
      center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
      login: { handle, accountId: account, presentation: originalSecret },
      cache: [],
    },
    'initial',
  )
  const owned = await openCliCatalog(home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  clean.push(() => owned.close())
  await owned.catalog.selectTenant(
    await owned.catalog.readSelection(),
    selected,
    'initial-selection',
  )
  let ineffective = false,
    unknown = false,
    current = selected.tenant,
    invited = target.tenant
  const exchange = vi.fn(async (_options: unknown, body: unknown): Promise<GovernanceOutcome> => {
    const request = body as { operation: string; payload: Record<string, unknown> }
    if (request.operation === og(37) && unknown)
      return { kind: 'unavailable', reason: 'connection', sendAttempted: true }
    const result =
      request.operation === og(36)
        ? current
        : request.operation === og(25)
          ? invited
          : request.operation === og(26)
            ? ineffective &&
              JSON.stringify(request.payload.tenant) === JSON.stringify(target.tenant)
              ? { standing: 'ineffective' }
              : { standing: 'effective', role: 'member' }
            : 'ok'
    return { kind: 'reply', reply: { result }, sendAttempted: true }
  })
  const client = createGovernanceClient({
    state: source,
    transport: {
      readPublicHealth: async () => ({
        kind: 'health',
        reply: { reachable: true, centerId, version: '3' },
      }),
      exchangeGovernance: exchange,
    },
  })
  clean.push(() => client.close())
  const opened = await client.openUse()
  if (opened.kind !== 'use') throw new Error('fixture open failed')
  clean.push(() => opened.use.close())
  const selection = await owned.catalog.readSelection()
  const ports: SelectedTenantPorts = {
    home,
    catalog: owned.catalog,
    selection: { ...selection, selected },
    client,
    source,
  }
  return {
    ports,
    use: opened.use,
    exchange,
    input: { action: 'switch', target, operationId: 'original-switch' } as TenantMembershipInput,
    ineffective: () => {
      ineffective = true
    },
    unknown: () => {
      unknown = true
    },
    changeRemote: () => {
      current = target.tenant
    },
    wrongInvite: () => {
      invited = checkedTenantBinding({
        ...target,
        tenant: { ...target.tenant, account: 'other' },
      }).tenant
    },
  }
}
it('adds only the invited tenant, keeps the original login and does not switch', async () => {
  const f = await fixture(),
    before = await f.ports.catalog.readSelection()
  const result = await runTenantMembershipCommand(
    { action: 'add', invitation: 'actual-invitation', operationId: 'original-add' },
    f.ports,
    f.use,
  )
  expect(result).toMatchObject({
    kind: 'tenant-prepared',
    action: 'add',
    binding: target,
    auth: { login: { kind: 'installed' } },
    selection: 'unchanged',
  })
  expect(await f.ports.catalog.readSelection()).toEqual(before)
  expect(
    f.exchange.mock.calls.filter(
      ([, body]) => (body as { operation: string }).operation === og(25),
    ),
  ).toHaveLength(1)
  expect(JSON.stringify(result)).not.toContain(originalSecret)
  const state = await openClientLocalState(
    { directory: tenantPaths(f.ports.home, target).auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    expect(await state.read()).toMatchObject({
      snapshot: { value: { login: { handle, presentation: originalSecret, accountId: account } } },
    })
  } finally {
    await state.close()
  }
})
it('checks fresh membership then switches remotely and CAS-selects the full target', async () => {
  const f = await fixture()
  expect(await runTenantMembershipCommand(f.input, f.ports, f.use)).toMatchObject({
    kind: 'tenant-prepared',
    action: 'switch',
    selection: 'selected',
    reference: tenantReference(target),
  })
  expect((await f.ports.catalog.readSelection()).selected).toEqual(target)
  const writes = f.exchange.mock.calls.filter(
    ([, body]) => (body as { operation: string }).operation === og(37),
  )
  expect(writes).toHaveLength(1)
  expect(writes[0]?.[1]).toMatchObject({
    payload: { targetTenant: target.tenant, expectedTenant: selected.tenant },
  })
})
it.each(['account', 'center'] as const)(
  'rejects a cross-%s switch before governance IO',
  async scope => {
    const f = await fixture()
    const wrong = checkedTenantBinding(
      scope === 'center'
        ? { ...target, centerId: 'b'.repeat(32) }
        : { ...target, tenant: { ...target.tenant, account: 'other' } },
    )
    expect(
      await runTenantMembershipCommand(
        { action: 'switch', target: wrong, operationId: 'wrong' },
        f.ports,
        f.use,
      ),
    ).toMatchObject({ kind: 'blocked', reason: 'identity-mismatch' })
    expect(f.exchange).not.toHaveBeenCalled()
  },
)
it('does not switch a tenant whose fresh membership is ineffective', async () => {
  const f = await fixture()
  f.ineffective()
  expect(await runTenantMembershipCommand(f.input, f.ports, f.use)).toMatchObject({
    kind: 'blocked',
    reason: 'membership-ineffective',
  })
  expect(
    f.exchange.mock.calls.some(([, body]) => (body as { operation: string }).operation === og(37)),
  ).toBe(false)
  expect((await f.ports.catalog.readSelection()).selected).toEqual(selected)
})
it('keeps an unknown switch as the original result and does not select or retry', async () => {
  const f = await fixture()
  f.unknown()
  expect(await runTenantMembershipCommand(f.input, f.ports, f.use)).toMatchObject({
    kind: 'tenant-prepared',
    report: { remote: { status: 'unknown' } },
    selection: 'not-requested',
  })
  expect(
    f.exchange.mock.calls.filter(
      ([, body]) => (body as { operation: string }).operation === og(37),
    ),
  ).toHaveLength(1)
  expect((await f.ports.catalog.readSelection()).selected).toEqual(selected)
})
it('refuses changed remote selection and a different invited account', async () => {
  const f = await fixture()
  f.changeRemote()
  expect(await runTenantMembershipCommand(f.input, f.ports, f.use)).toMatchObject({
    kind: 'blocked',
    reason: 'identity-mismatch',
  })
  const g = await fixture()
  g.wrongInvite()
  expect(
    await runTenantMembershipCommand(
      { action: 'add', invitation: 'wrong-invite', operationId: 'add' },
      g.ports,
      g.use,
    ),
  ).toMatchObject({ kind: 'blocked', reason: 'identity-mismatch' })
})
it('retains remote success when a competing root selection wins', async () => {
  const f = await fixture()
  vi.spyOn(f.ports.catalog, 'selectTenant').mockResolvedValue('conflict')
  expect(await runTenantMembershipCommand(f.input, f.ports, f.use)).toMatchObject({
    kind: 'tenant-prepared',
    report: { remote: { status: 'success' } },
    selection: 'conflict',
  })
})
it('round-trips scoped references and rejects duplicate keys, paths and extra fields', () => {
  expect(parseTenantReference(tenantReference(target))).toEqual(target)
  for (const text of [
    '/tmp/tenant',
    '{"formatVersion":1,"formatVersion":1}',
    JSON.stringify({ ...target, path: '/tmp' }),
  ])
    expect(() => parseTenantReference(text)).toThrow()
})
