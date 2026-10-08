import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import type { ClientLocalState, LocalRecord } from '@omne-harness-lite/client-local-state'
import {
  parseRunLoginBinding,
  type SessionIdentityObservation,
} from '../src/session-preparation.ts'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { prepareTenantAuth } from '../src/tenant-auth.ts'
import { tenantPaths } from '../src/state-layout.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const login = parseRunLoginBinding({
  centerId: 'a'.repeat(32),
  accountId: 'owner',
  loginStateHandle: 'original-login',
})
if (login === undefined) throw new Error('invalid fixture')
const identity: SessionIdentityObservation = {
  ...login,
  tenant: unwrap(parseTenantId({ organization: 'team', account: 'owner' })),
  role: 'member',
}
const record: LocalRecord = {
  center: {
    centerId: identity.centerId,
    endpoint: 'https://center.invalid/',
    trust: { mode: 'ca' },
  },
  login: {
    accountId: identity.accountId,
    handle: identity.loginStateHandle,
    presentation: 'private-original-presentation',
  },
  cache: [],
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-tenant-auth-'))
  cleanup.push(() => rm(root, { force: true, recursive: true }))
  const source = await openClientLocalState(
    { directory: join(root, 'source') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  cleanup.push(() => source.close())
  const before = await source.read()
  if (before.kind !== 'read') throw new Error('fixture unavailable')
  expect(
    (await source.compareAndReplace(before.snapshot.token, record, 'source-initial')).kind,
  ).toBe('installed')
  return { home: join(root, '.omne'), source }
}
it('creates the correct tenant auth namespace and preserves the same login without another remote login', async () => {
  const f = await fixture()
  const result = await prepareTenantAuth(
    f.home,
    f.source,
    identity,
    'handoff-original',
    'empty-only',
  )
  expect(result.login).toEqual({ kind: 'installed' })
  expect(JSON.parse(await readFile(result.paths.binding, 'utf8'))).toEqual({
    formatVersion: 1,
    centerId: identity.centerId,
    tenant: identity.tenant,
  })
  expect(await readdir(result.paths.directory)).toEqual(['auth', 'tenant.json'])
  expect((await f.source.read()).kind).toBe('read')
  const target = await openClientLocalState(
    { directory: result.paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    const reading = await target.read()
    if (reading.kind !== 'read') throw new Error('target unavailable')
    expect(reading.snapshot.value).toEqual(record)
    expect(reading.snapshot.operationId).toBe('handoff-original')
  } finally {
    await target.close()
  }
})
it('recognizes an existing original handoff instead of replacing its operation identity', async () => {
  const f = await fixture()
  const first = await prepareTenantAuth(
    f.home,
    f.source,
    identity,
    'original-handoff',
    'empty-only',
  )
  expect(first.login.kind).toBe('installed')
  expect(
    (await prepareTenantAuth(f.home, f.source, identity, 'later-handoff', 'empty-only')).login.kind,
  ).toBe('already-installed')
  const state = await openClientLocalState(
    { directory: first.paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    expect(await state.read()).toMatchObject({
      kind: 'read',
      snapshot: { operationId: 'original-handoff' },
    })
  } finally {
    await state.close()
  }
})
it('does not put one center login into another center tenant namespace', async () => {
  const f = await fixture()
  const other = parseRunLoginBinding({ ...identity, centerId: 'b'.repeat(32) })
  if (other === undefined) throw new Error('invalid fixture')
  const result = await prepareTenantAuth(
    f.home,
    f.source,
    { ...identity, ...other },
    'wrong-center',
    'empty-only',
  )
  expect(result.login).toEqual({ kind: 'blocked', reason: 'identity-mismatch' })
  const target = await openClientLocalState(
    { directory: result.paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    expect(await target.read()).toMatchObject({ kind: 'read', snapshot: { value: null } })
  } finally {
    await target.close()
  }
})
it('rejects an account mismatch before creating a tenant namespace or reading secrets', async () => {
  const f = await fixture()
  let reads = 0
  const source: ClientLocalState = {
    read: () => {
      reads++
      return f.source.read()
    },
    compareAndReplace: (...args) => f.source.compareAndReplace(...args),
  }
  const wrong = {
    ...identity,
    tenant: unwrap(parseTenantId({ organization: 'team', account: 'other' })),
  }
  await expect(prepareTenantAuth(f.home, source, wrong, 'bad', 'empty-only')).rejects.toMatchObject(
    { reason: 'invalid-binding' },
  )
  expect(reads).toBe(0)
  const path = tenantPaths(f.home, {
    formatVersion: 1,
    centerId: identity.centerId,
    tenant: wrong.tenant,
  })
  await expect(readdir(path.directory)).rejects.toMatchObject({ code: 'ENOENT' })
})
