import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readJsonStrict,
  LosslessNumber,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { modelProfileDirectoryPlugin } from '../src/cordis.ts'
import {
  scopeChain,
  winningRow,
  configEligibility,
  credentialSlot,
} from '@omne-harness-lite/model-profile-directory'
import {
  alice,
  bob,
  outsider,
  scope,
  content,
  official,
  setup,
  expectRow,
  open,
  boot,
  catalog,
  reading,
  setEffective,
  actualClock,
  memberships,
} from './support.ts'

afterEach(() => vi.restoreAllMocks())
describe('v3 durable catalog', () => {
  it('V3-1 exact JSON binding, representation rejection and semantic equality', async () => {
    const h = await setup('lossless')
    try {
      const values = {
        big: new LosslessNumber('9007199254740993'),
        decimal: new LosslessNumber('0.1000000000000000000001'),
        nested: { a: 1, b: 2 },
        array: [1, 2],
        boolean: true,
      }
      const first = expectRow(
        await h.catalog.registerProfile(alice, scope, content('m', 'c1', values)),
      )
      expect(writeJsonLossless(first.profile.adaptation.configuration.values)).toContain(
        '9007199254740993',
      )
      expectRow(await h.catalog.readProfile(alice, first.ref))
      expect(
        await h.catalog.registerProfile(
          alice,
          scope,
          content('m', 'c1', {
            boolean: true,
            array: [1, 2],
            nested: { b: 2, a: 1 },
            decimal: new LosslessNumber('1.000000000000000000001e-1'),
            big: new LosslessNumber('9007199254740993.0'),
          }),
        ),
      ).toEqual(first)
      expect(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: { adaptation: content('m', 'c1', { ...values, array: [2, 1] }).adaptation },
        }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: { adaptation: content('m', 'c1', { ...values, boolean: 1 }).adaptation },
        }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(
        await h.catalog.registerProfile(alice, scope, { ...content('bad'), adaptation: undefined }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(
        await h.catalog.registerProfile(alice, scope, {
          ...content('bad'),
          adaptation: content('other').adaptation,
        }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(readJsonStrict('{"outer":{"v":1,"v":2}}')).toEqual({ failed: 'duplicate_member' })
    } finally {
      await h.close()
    }
  })
  it('V3-3/4 c1→c2→c1 survives withdrawal, restart and relist; binding-only keeps timestamp', async () => {
    const h = await setup('history')
    let assembly = h.assembly
    try {
      const first = expectRow(
        await h.catalog.registerProfile(alice, scope, content('m', 'c1', { v: 1 })),
      )
      const second = expectRow(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: { adaptation: content('m', 'c2', { v: 2 }).adaptation },
        }),
      )
      expect(second.profile.updatedAt).toBe(first.profile.updatedAt)
      await h.catalog.withdrawProfile(alice, first.ref)
      await assembly.dispose()
      assembly = await boot(h.storage)
      const c = catalog(assembly)
      await c.relistProfile(alice, first.ref)
      expect(
        await c.updateProfile(alice, first.ref, {
          replace: { adaptation: content('m', 'c1', { v: 9 }).adaptation },
        }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      const back = expectRow(
        await c.updateProfile(alice, first.ref, {
          replace: { adaptation: content('m', 'c1', { v: 1 }).adaptation },
        }),
      )
      expect(back.profile.adaptation.configuration.values).toEqual({ v: 1 })
      expect(
        await c.updateProfile(alice, first.ref, {
          replace: { adaptation: { configuration: { revision: 'new' } } },
        }),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(await c.updateProfile(alice, first.ref, { remove: ['adaptation'] })).toEqual({
        failure: 'invalidInput',
        reason: 'malformed',
      })
    } finally {
      await assembly.dispose()
      await h.storage.close()
    }
  })
  it('S25/V3-11 withdrawal sends once after commit, listener fault cannot undo; relist preserves row', async () => {
    const h = await setup('withdraw')
    try {
      const row = expectRow(await h.catalog.registerProfile(alice, scope, content()))
      const events: unknown[] = []
      h.assembly.ctx.on('profile.withdrawn', ref => {
        events.push(ref)
        throw new Error('secret-listener-payload')
      })
      await h.catalog.withdrawProfile(alice, row.ref)
      await h.catalog.withdrawProfile(alice, row.ref)
      expect(events).toEqual([row.ref])
      expect(expectRow(await h.read.readProfile(alice, row.ref)).profile).toEqual({
        ...row.profile,
        registration: 'withdrawn',
      })
      expect(await h.catalog.registerProfile(alice, scope, content())).toEqual({
        failure: 'routeNameTaken',
      })
      await h.catalog.relistProfile(alice, row.ref)
      await h.catalog.relistProfile(alice, row.ref)
      expect(await h.read.readProfile(alice, row.ref)).toEqual(row)
      expect(events).toHaveLength(1)
    } finally {
      await h.close()
    }
  })
  it('S26/V3-2 true concurrent two connections: one name and one revision meaning', async () => {
    const h = await setup('race')
    const other = await open(h.path)
    const second = await boot(other, undefined, undefined, actualClock(h.assembly))
    try {
      const c = catalog(second)
      const results = await Promise.all([
        h.catalog.registerProfile(alice, scope, content('race', 'c1', { v: 1 })),
        c.registerProfile(alice, scope, {
          ...content('race', 'c1', { v: 1 }),
          providers: ['other'],
        }),
      ])
      expect(results.filter(r => 'failure' in r && r.failure === 'routeNameTaken')).toHaveLength(1)
      const row = results.find(r => !('failure' in r))
      if (row === undefined || 'failure' in row) throw new Error('race had no winner')
      const update = await Promise.all([
        h.catalog.updateProfile(alice, row.ref, {
          replace: { adaptation: content('race', 'c2', { v: 2 }).adaptation },
        }),
        c.updateProfile(alice, row.ref, {
          replace: { adaptation: content('race', 'c2', { v: 3 }).adaptation },
        }),
      ])
      expect(update.filter(r => 'failure' in r && r.failure === 'invalidInput')).toHaveLength(1)
      expect(update.filter(r => !('failure' in r))).toHaveLength(1)
      const committed = expectRow(await h.read.readProfile(alice, row.ref))
      expect(committed).toEqual(update.find(r => !('failure' in r)))
    } finally {
      await second.dispose()
      await other.close()
      await h.close()
    }
  })
  it('V3-7 read chain isolation and tenant>organization>factory covering retain all rows', async () => {
    const h = await setup('layers', { ordinal: 1, entries: [official('same')] })
    try {
      const org = { layer: 'organization', organization: alice.organization } as const
      const orgRow = expectRow(await h.catalog.registerProfile(alice, org, content('same')))
      const tenantRow = expectRow(await h.catalog.registerProfile(alice, scope, content('same')))
      const rows = await h.read.listProfiles(alice)
      if (!Array.isArray(rows)) throw new Error('list failed')
      expect(rows).toHaveLength(3)
      expect(winningRow(rows, 'same', ['same'])).toEqual(tenantRow)
      await h.catalog.withdrawProfile(alice, tenantRow.ref)
      const withdrawn = await h.read.listProfiles(alice)
      if (!Array.isArray(withdrawn)) throw new Error('list failed')
      expect(winningRow(withdrawn, 'same', ['same'])).toEqual(orgRow)
      expect(await h.read.readProfile(bob, tenantRow.ref)).toEqual({ failure: 'notAuthorized' })
      expect(await h.read.readProfile(outsider, orgRow.ref)).toEqual({ failure: 'notAuthorized' })
      expect(await h.read.readProfile(alice, { origin: 'official', routeName: 'absent' })).toEqual({
        failure: 'profileNotFound',
      })
    } finally {
      await h.close()
    }
  })
  it('S30/V3-8 authorizes before protected storage/history, real standing revocation, unavailable priority', async () => {
    const h = await setup('auth')
    try {
      await h.catalog.registerProfile(alice, scope, content())
      const writes = vi.spyOn(h.storage, 'write')
      for (const name of ['route', 'new'])
        expect(await h.catalog.registerProfile(outsider, scope, content(name))).toEqual({
          failure: 'notAuthorized',
        })
      expect(writes).not.toHaveBeenCalled()
      await setEffective(h.storage, alice, false)
      expect(await h.catalog.registerProfile(alice, scope, content('new'))).toEqual({
        failure: 'notAuthorized',
      })
      await setEffective(h.storage, alice, true)
      const read = vi
        .spyOn(memberships(h.assembly), 'standing')
        .mockResolvedValueOnce({ failure: 'unavailable' })
      expect(await h.catalog.registerProfile(alice, scope, content('route'))).toEqual({
        failure: 'unavailable',
      })
      expect(read).toHaveBeenCalledTimes(1)
      expect(
        await h.catalog.updateProfile(
          outsider,
          { origin: 'official', routeName: 'absent' },
          { replace: { allowFallback: true } },
        ),
      ).toEqual({ failure: 'officialProfileReadOnly' })
      expect(
        await h.catalog.updateProfile(
          outsider,
          { origin: 'custom', scope, routeName: 'absent' },
          { replace: { routeName: 'new' } },
        ),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
    } finally {
      await h.close()
    }
  })
  it('V3-9 bind idempotency, rotate, unbind and no reference on present surface', async () => {
    const h = await setup('bindings')
    try {
      expect(await h.read.credentialPresent(alice, 'official')).toEqual({
        present: true,
        scope: { layer: 'factory' },
      })
      expect(await h.read.credentialPresent(alice, 'custom')).toEqual({ present: false })
      const first = await h.catalog.bindCredential(alice, alice, 'secret-ref-a')
      expect(await h.catalog.bindCredential(alice, alice, 'secret-ref-a')).toEqual(first)
      expect(await h.read.credentialPresent(alice, 'custom')).toMatchObject({
        present: true,
        scope: { layer: 'tenant', tenant: alice },
      })
      expect(JSON.stringify(await h.read.credentialPresent(alice, 'official'))).not.toContain(
        'secret-ref',
      )
      await h.catalog.bindCredential(alice, alice, 'secret-ref-b')
      expect(await h.catalog.bindCredential(alice, bob, 'key')).toEqual({
        failure: 'notAuthorized',
      })
      expect(
        await h.catalog.bindCredential(alice, { layer: 'organization', organization: 'O' }, 'key'),
      ).toEqual({ failure: 'invalidInput', reason: 'malformed' })
      expect(await h.catalog.unbindCredential(alice, alice)).toEqual({
        tenant: alice,
        present: false,
      })
      expect(await h.catalog.unbindCredential(alice, alice)).toEqual({
        tenant: alice,
        present: false,
      })
      expect(await h.read.credentialPresent(alice, 'custom')).toEqual({ present: false })
    } finally {
      await h.close()
    }
  })
  it('pure exported judgments have no Cordis/runtime dependency', () => {
    expect(scopeChain(alice).map(s => s.layer)).toEqual(['tenant', 'organization', 'factory'])
    expect(configEligibility(outsider, scope, { failure: 'unavailable' })).toBe('notAuthorized')
    expect(configEligibility(alice, scope, { failure: 'unavailable' })).toBe('unavailable')
    expect(credentialSlot(undefined, 'custom', true)).toEqual({ present: false })
  })
  it('V3-12 invalid/missing modes and migration defects fail before provide', async () => {
    await expect(
      bootAssembly({
        plugins: [
          {
            plugin: modelProfileDirectoryPlugin,
            config: { officialManifest: { ordinal: 1, entries: [] } },
          },
        ],
      }),
    ).rejects.toThrow()
    const h = await setup('defect')
    try {
      await h.assembly.dispose()
      await h.storage.write(async tx => {
        await tx.db.schema.dropTable('model_profile_configuration').execute()
      })
      await expect(boot(h.storage)).rejects.toBeInstanceOf(StorageDefect)
    } finally {
      await h.storage.close()
    }
  })
})
