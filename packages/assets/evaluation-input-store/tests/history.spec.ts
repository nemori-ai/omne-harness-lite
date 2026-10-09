import { expect, test, vi } from 'vitest'
import { createRegistryHistoryReader } from '@omne-harness-lite/evaluation-input-store/registry-history'
import { type RegistryHistoryRequest } from '@omne-harness-lite/asset-evaluation'
import { createAssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { sql } from 'kysely'
import type { AssetDefinition } from '@omne-harness-lite/asset-model'
import { publishLocalInputs } from '../src/publication.ts'
import { withHost, boot, type Host, AT, gate } from './support.ts'

const capability = { category: 'plugin', name: 'example:collection' } as const
function plugin(tenant: TenantId, count = 1): AssetDefinition {
  return {
    id: 'ast_plugin',
    capability,
    origin: 'customized',
    owner: { kind: 'tenant', tenant },
    author: tenant,
    byAgent: false,
    versions: Array.from({ length: count }, (_, offset) => ({
      number: offset + 1,
      publishedAt: AT,
      publishedBy: tenant,
      content: {
        category: 'plugin',
        members: offset === 0 ? [] : [{ category: 'tool', name: 'example:new' }],
      },
    })),
  }
}
async function setup(h: Host, tenant: TenantId) {
  await h.initialize(tenant)
  const holder = { layer: 'tenant', tenant } as const
  const published = await publishLocalInputs(h.deps, {
    expectedRevision: '1',
    definitions: [plugin(tenant)],
    scopes: [
      {
        holder,
        holdings: [
          {
            holder,
            capability,
            asset: 'ast_plugin',
            basis: { kind: 'owned' },
            versionSelection: { kind: 'current' },
            immutable: false,
            assignments: [],
            since: AT,
          },
        ],
      },
    ],
  })
  expect(published).toEqual({ revision: '2' })
  const manifest = createAssemblyManifestStore(h.storage)
  // Real MF record/tuple fixture only. Full AR fill/report production is tested by
  // the future registry composition; this fixture cannot substitute that evidence.
  expect(
    await manifest.append('session_a', 0, {
      evaluation: { kind: 'given', ref: 'original_given' },
      tables: {
        plugin: {
          filledAt: 1,
          composition: [{ capability, asset: 'ast_plugin', version: 1, from: 'tenant' }],
        },
      },
      content: { producer: 'component_fixture' },
    }),
  ).toHaveProperty('seq', 1)
  const reader = createRegistryHistoryReader({ ...h.deps, manifestHistory: manifest })
  const instant = instantFromEpochMs(1)
  if (!('ok' in instant)) throw new Error('test instant invalid')
  const request: RegistryHistoryRequest = {
    session: 'session_a',
    tenant,
    category: 'plugin',
    filledAt: instant.ok,
    capability,
    asset: 'ast_plugin',
    version: 1,
  }
  return { manifest, reader, request }
}

test('real published immutable old version remains readable after unholding, new version, new table and file reopen', async () => {
  const h = await boot()
  let reopened: Host | undefined
  let source: Awaited<ReturnType<typeof setup>> | undefined
  try {
    const { tenant } = await h.identity('alice')
    source = await setup(h, tenant)
    const first = await source.reader.read(source.request)
    expect(first).toEqual({ version: plugin(tenant).versions[0] })
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '2',
        definitions: [plugin(tenant, 2)],
        scopes: [{ holder: { layer: 'tenant', tenant }, holdings: [] }],
      }),
    ).toEqual({ revision: '3' })
    const current = await h.reader.read('session_a', tenant)
    expect(current).toHaveProperty('input')
    if (!('input' in current)) throw new Error('actual ordinary source failed')
    expect(current.input.definitions.some(entry => entry.id === 'ast_plugin')).toBe(false)
    expect(current.input.holdings.some(entry => entry.asset === 'ast_plugin')).toBe(false)
    expect(
      await source.manifest.append('session_a', 1, {
        evaluation: { kind: 'mint' },
        tables: { plugin: { filledAt: 2, composition: [] } },
        content: null,
      }),
    ).toHaveProperty('seq', 2)
    expect(await source.reader.read(source.request)).toEqual(first)
    await source.reader.close()
    await source.manifest.close()
    await h.close(false)
    reopened = await boot(h.file)
    const manifest = createAssemblyManifestStore(reopened.storage)
    const reader = createRegistryHistoryReader({ ...reopened.deps, manifestHistory: manifest })
    try {
      expect(await reader.read(source.request)).toEqual(first)
      expect(await reader.read({ ...source.request, filledAt: 2 })).toEqual({
        failure: 'unavailable',
        stage: 'history_binding',
      })
      expect(await reader.read({ ...source.request, version: new LosslessNumber('1.00') })).toEqual(
        first,
      )
      expect(reopened.diagnostics.at(-1)).toMatchObject({
        kind: 'registry_history_read',
        versions: 2,
        evaluationCount: 0,
        selectorCount: 0,
        resourceEnded: true,
      })
    } finally {
      await reader.close()
      await manifest.close()
    }
  } finally {
    await source?.reader.close()
    await source?.manifest.close()
    await reopened?.close(false)
    await h.close()
  }
})

test.each([
  null,
  {},
  { version: true },
  { version: 0 },
  { version: 0.1 },
  { category: 'agent_definition' },
  { capability: { ...capability, category: 'tool' } },
  { filledAt: '1' },
  { filledAt: 1.5 },
  { additional: true },
])('malformed history request %j causes no STT/MF/source IO', async changes =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    const s = await setup(h, tenant)
    const stt = vi.fn((session: string) => h.sessionTenancy.holdingTenant(session)),
      read = vi.spyOn(h.storage, 'read'),
      atomic = vi.spyOn(h.storage, 'atomic')
    const reader = createRegistryHistoryReader({
      ...h.deps,
      sessionTenancy: { holdingTenant: stt },
      manifestHistory: s.manifest,
    })
    try {
      expect(
        await reader.read(
          changes === null || Object.keys(changes).length === 0
            ? changes
            : { ...s.request, ...changes },
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(stt).not.toHaveBeenCalled()
      expect(read).not.toHaveBeenCalled()
      expect(atomic).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
      atomic.mockRestore()
      await reader.close()
      await s.reader.close()
      await s.manifest.close()
    }
  }),
)

test('wrong tenant and unknown session stop at real STT before any MF or EIS reading', async () =>
  withHost(async h => {
    const a = await h.identity('alice'),
      b = await h.identity('bob')
    const s = await setup(h, a.tenant)
    const manifestSpy = vi.fn((...args: Parameters<typeof s.manifest.readHistory>) =>
        s.manifest.readHistory(...args),
      ),
      atomic = vi.spyOn(h.storage, 'atomic')
    const reader = createRegistryHistoryReader({
      ...h.deps,
      manifestHistory: { readHistory: manifestSpy },
    })
    try {
      for (const request of [
        { ...s.request, tenant: b.tenant },
        { ...s.request, session: 'missing_session' },
      ])
        expect(await reader.read(request)).toEqual({
          failure: 'unavailable',
          stage: 'session_tenancy',
        })
      expect(manifestSpy).not.toHaveBeenCalled()
      expect(atomic).not.toHaveBeenCalled()
    } finally {
      atomic.mockRestore()
      await reader.close()
      await s.reader.close()
      await s.manifest.close()
    }
  }))

test('actual table tuple is necessary: not in table, duplicate, huge exact mismatch and reuse removal never read source', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice'),
      s = await setup(h, tenant)
    const atomic = vi.spyOn(h.storage, 'atomic')
    try {
      for (const request of [
        { ...s.request, asset: 'ast_not_in_table' },
        { ...s.request, version: new LosslessNumber('9007199254740993') },
        { ...s.request, filledAt: 99 },
      ])
        expect(await s.reader.read(request)).toHaveProperty('failure', 'unavailable')
      expect(atomic).not.toHaveBeenCalled()
      atomic.mockRestore()
      expect(
        await s.manifest.append('session_a', 1, {
          evaluation: { kind: 'reuse', ref: 'original_given' },
          tables: { plugin: { filledAt: 2, composition: [] } },
          content: { producer: 'component_fixture' },
        }),
      ).toHaveProperty('seq', 2)
      expect(await s.reader.read({ ...s.request, filledAt: 2 })).toEqual({
        failure: 'unavailable',
        stage: 'history_binding',
      })
      expect(
        await s.manifest.append('session_a', 2, {
          evaluation: { kind: 'mint' },
          tables: {
            plugin: {
              filledAt: 3,
              composition: Array(2).fill({
                capability,
                asset: 'ast_plugin',
                version: 1,
                from: 'tenant',
              }),
            },
          },
          content: null,
        }),
      ).toHaveProperty('seq', 3)
      expect(await s.reader.read({ ...s.request, filledAt: 3 })).toEqual({
        failure: 'unavailable',
        stage: 'history_binding',
      })
      expect(await s.reader.read(s.request)).toHaveProperty('version.number', 1)
    } finally {
      atomic.mockRestore()
      await s.reader.close()
      await s.manifest.close()
    }
  }))

test('current membership is real and revocation rejects despite a durable same-session table', async () =>
  withHost(async h => {
    const owner = await h.identity('owner'),
      member = await h.identity('member')
    const team = await h.organizations.createTeam(owner.tenant.account, 'history-team')
    if (!('ok' in team)) throw new Error('team failed')
    const invitation = await h.offers.issueInvitation(
      team.ok.tenant,
      member.tenant.account,
      'member',
    )
    if (!('ok' in invitation)) throw new Error('invitation failed')
    const joined = await h.offers.acceptInvitation(member.tenant.account, invitation.ok)
    if (!('ok' in joined)) throw new Error('join failed')
    const s = await setup(h, joined.ok)
    try {
      expect(await s.reader.read(s.request)).toHaveProperty('version.number', 1)
      expect(await h.memberships.remove(team.ok.tenant, joined.ok)).toBe('ok')
      expect(await s.reader.read(s.request)).toEqual({
        failure: 'unavailable',
        stage: 'current_membership',
      })
    } finally {
      await s.reader.close()
      await s.manifest.close()
    }
  }))

test.each(['position', 'json', 'metadata', 'version_missing'])(
  'persistent source damage %s cannot fall back to a new/current version',
  async damage =>
    withHost(async h => {
      const { tenant } = await h.identity('alice'),
        s = await setup(h, tenant)
      try {
        await h.storage.write(async tx => {
          if (damage === 'position')
            await sql`UPDATE evaluation_input_version SET version_position='2' WHERE asset_id='ast_plugin'`.execute(
              tx.db,
            )
          if (damage === 'json')
            await sql`UPDATE evaluation_input_version SET version='{"number":1,"number":2}' WHERE asset_id='ast_plugin'`.execute(
              tx.db,
            )
          if (damage === 'metadata')
            await sql`UPDATE evaluation_input_asset SET metadata='{}' WHERE asset_id='ast_plugin'`.execute(
              tx.db,
            )
          if (damage === 'version_missing')
            await sql`DELETE FROM evaluation_input_version WHERE asset_id='ast_plugin'`.execute(
              tx.db,
            )
        })
        expect(await s.reader.read(s.request)).toEqual({ failure: 'unavailable', stage: 'source' })
      } finally {
        await s.reader.close()
        await s.manifest.close()
      }
    }),
)

test('schema and unrelated defects propagate; actual unavailable exits atomic and mapped results do not poison storage', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice'),
      s = await setup(h, tenant)
    const atomic = vi.spyOn(h.storage, 'atomic')
    try {
      atomic.mockRejectedValueOnce(new StorageUnavailable('injected storage failure'))
      expect(await s.reader.read(s.request)).toEqual({ failure: 'unavailable', stage: 'storage' })
      const defect = new StorageDefect('unrelated storage defect')
      atomic.mockRejectedValueOnce(defect)
      await expect(s.reader.read(s.request)).rejects.toBe(defect)
      atomic.mockRestore()
      expect(await s.reader.read(s.request)).toHaveProperty('version.number', 1)
      await h.storage.write(tx =>
        sql`ALTER TABLE evaluation_input_version RENAME COLUMN version TO wrong_version`.execute(
          tx.db,
        ),
      )
      await expect(s.reader.read(s.request)).rejects.toBeInstanceOf(StorageDefect)
    } finally {
      atomic.mockRestore()
      await s.reader.close()
      await s.manifest.close()
    }
  }))

test('close after prior idle waits for the actual MF IO, keeps borrowers open, and new reader binds the new MF instance', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice'),
      s = await setup(h, tenant)
    await s.reader.read(s.request)
    const pause = gate(),
      actual = h.storage.read.bind(h.storage)
    // Leave STT's first read alone, then block the actual manifest ReadTx.
    let reads = 0
    const spy = vi.spyOn(h.storage, 'read').mockImplementation(fn =>
      actual(async tx => {
        if (++reads === 2) await pause.pause()
        return fn(tx)
      }),
    )
    const active = s.reader.read(s.request)
    await pause.reached
    let drained = false
    const closing = s.reader.close().then(() => {
      drained = true
    })
    try {
      await Promise.resolve()
      expect(drained).toBe(false)
      expect(await s.reader.read(s.request)).toEqual({ failure: 'unavailable', stage: 'stopped' })
      pause.release()
      expect(await active).toHaveProperty('version.number', 1)
      await closing
      spy.mockRestore()
      expect(await s.manifest.readHead('session_a')).toHaveProperty('head', 1)
      await s.manifest.close()
      const newer = createAssemblyManifestStore(h.storage)
      const reader = createRegistryHistoryReader({ ...h.deps, manifestHistory: newer })
      try {
        expect(await reader.read(s.request)).toHaveProperty('version.number', 1)
      } finally {
        await reader.close()
        await newer.close()
      }
    } finally {
      pause.release()
      spy.mockRestore()
      await closing
      await s.manifest.close()
    }
  }))

test('both diagnostic outputs may fail without changing source result or original defect; no payload is emitted', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice'),
      s = await setup(h, tenant)
    const events: unknown[] = []
    const reader = createRegistryHistoryReader({
      ...h.deps,
      manifestHistory: s.manifest,
      diagnostics(event) {
        events.push(event)
        throw new Error('first output failed')
      },
      onDiagnosticFailure() {
        throw new Error('second output failed')
      },
    })
    try {
      const result = await reader.read(s.request)
      expect(result).toEqual({ version: plugin(tenant).versions[0] })
      expect(Object.isFrozen('version' in result ? result.version : {})).toBe(true)
      expect(JSON.stringify(events)).not.toContain('members')
      expect(JSON.stringify(events)).not.toContain('publishedBy')
      const defect = new StorageDefect('original defect')
      const atomic = vi.spyOn(h.storage, 'atomic').mockRejectedValueOnce(defect)
      await expect(reader.read(s.request)).rejects.toBe(defect)
      atomic.mockRestore()
    } finally {
      await reader.close()
      await s.reader.close()
      await s.manifest.close()
    }
  }))

test('ordinary current inputs also keep their result when both borrowed diagnostic outputs throw', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const { createEvaluationInputReader } = await import('../src/index.ts')
    const reader = createEvaluationInputReader({
      ...h.deps,
      diagnostics() {
        throw new Error('first output failure')
      },
      onDiagnosticFailure() {
        throw new Error('second output failure')
      },
    })
    try {
      expect(await reader.read('session_a', tenant)).toHaveProperty('input')
    } finally {
      await reader.close()
    }
  }))

test('actual qualification and immutable body share the SQLite atomic boundary against a second real OG writer', async () =>
  withHost(async h => {
    const owner = await h.identity('owner'),
      member = await h.identity('member')
    const team = await h.organizations.createTeam(owner.tenant.account, 'history-race')
    if (!('ok' in team)) throw new Error('team failed')
    const invitation = await h.offers.issueInvitation(
      team.ok.tenant,
      member.tenant.account,
      'member',
    )
    if (!('ok' in invitation)) throw new Error('invitation failed')
    const joined = await h.offers.acceptInvitation(member.tenant.account, invitation.ok)
    if (!('ok' in joined)) throw new Error('join failed')
    const s = await setup(h, joined.ok)
    const other = await boot(h.file, undefined, h.clock)
    const held = gate(),
      waiting = gate()
    let first = true
    const reader = createRegistryHistoryReader({
      ...h.deps,
      manifestHistory: s.manifest,
      memberships: {
        participate(unit) {
          const actual = h.memberships.participate(unit)
          return {
            ...actual,
            async standing(tenant) {
              const result = await actual.standing(tenant)
              if (first) {
                first = false
                await held.pause()
              }
              return result
            },
          }
        },
      },
    })
    const actualAtomic = other.storage.atomic.bind(other.storage)
    // Observe both actual ownership phases. This wrapper changes no SQL or result.
    let otherAcquired = false
    const spy = vi.spyOn(other.storage, 'atomic').mockImplementation(async fn => {
      waiting.release()
      return actualAtomic(async unit => {
        otherAcquired = true
        return fn(unit)
      })
    })
    const active = reader.read(s.request)
    await held.reached
    const removed = other.memberships.remove(team.ok.tenant, joined.ok)
    // 'release' resolves wait; it does not imply the second writer acquired its lock.
    await waiting.pause()
    try {
      expect(otherAcquired).toBe(false)
      held.release()
      expect(await active).toHaveProperty('version.number', 1)
      expect(await removed).toBe('ok')
      expect(otherAcquired).toBe(true)
      expect(await reader.read(s.request)).toEqual({
        failure: 'unavailable',
        stage: 'current_membership',
      })
    } finally {
      held.release()
      await active
      await removed
      spy.mockRestore()
      await reader.close()
      await s.reader.close()
      await s.manifest.close()
      await other.close(false)
    }
  }))
