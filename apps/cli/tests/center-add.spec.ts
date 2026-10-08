import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { openCliCatalog, type OwnedCliCatalog } from '../src/catalog-open.ts'
import { addCenter } from '../src/center-add.ts'
import type { PublicHealthOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import type { CenterProfile } from '../src/center-preparation.ts'

const roots: string[] = [],
  owners: OwnedCliCatalog[] = []
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('invalid fixture')
const input = {
  name: 'center',
  endpoint: 'https://center.invalid/',
  trust: { mode: 'ca' as const },
}
const health = vi.fn(async (): Promise<PublicHealthOutcome> => ({
  kind: 'health',
  reply: { reachable: true, centerId, version: '3' },
}))
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  health.mockClear()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-center-add-'))
  roots.push(root)
  const owner = await openCliCatalog(join(root, '.omne'), {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  owners.push(owner)
  return owner.catalog
}
it('confirms the observed exact center before persisting and leaves startup selection empty', async () => {
  const catalog = await fixture()
  const confirm = vi.fn(async (profile: CenterProfile) => {
    expect(await catalog.listCenters()).toEqual([])
    expect(profile.center.centerId).toBe(centerId)
    return true
  })
  expect((await addCenter(catalog, input, { timeoutMs: 1000 }, confirm, health)).kind).toBe('saved')
  expect(confirm).toHaveBeenCalledOnce()
  expect(await catalog.listCenters()).toEqual([
    { name: input.name, center: { centerId, endpoint: input.endpoint, trust: input.trust } },
  ])
  expect((await catalog.readSelection()).selected).toBeNull()
})
it('does not save a cancelled observation', async () => {
  const catalog = await fixture()
  expect(
    (await addCenter(catalog, input, { timeoutMs: 1000 }, async () => false, health)).kind,
  ).toBe('cancelled')
  expect(await catalog.listCenters()).toEqual([])
})
it('does not save a template changed by the confirmation callback', async () => {
  const catalog = await fixture()
  expect(
    (
      await addCenter(
        catalog,
        input,
        { timeoutMs: 1000 },
        async profile => {
          Object.assign(profile.center, { endpoint: 'https://attacker.invalid/' })
          return true
        },
        health,
      )
    ).kind,
  ).toBe('saved')
  expect((await catalog.listCenters())[0]?.center.endpoint).toBe(input.endpoint)
})
it('does not save after cancellation arrives while confirmation is open', async () => {
  const catalog = await fixture()
  const signal = new AbortController()
  expect(
    (
      await addCenter(
        catalog,
        input,
        { timeoutMs: 1000, signal: signal.signal },
        async () => {
          signal.abort()
          return true
        },
        health,
      )
    ).kind,
  ).toBe('cancelled')
  expect(await catalog.listCenters()).toEqual([])
})
it('retains an unavailable observation and never asks for confirmation or writes', async () => {
  const catalog = await fixture()
  const confirm = vi.fn(async () => true)
  const unavailable = { kind: 'unavailable', reason: 'trust' } as const
  expect(
    await addCenter(catalog, input, { timeoutMs: 1000 }, confirm, async () => unavailable),
  ).toEqual(unavailable)
  expect(confirm).not.toHaveBeenCalled()
  expect(await catalog.listCenters()).toEqual([])
})
