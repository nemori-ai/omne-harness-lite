// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
import { describe, expect, it } from 'vitest'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { narrow } from '@omne-harness-lite/storage'
import { selectionHost, profile } from './session-selection-fixture.ts'
import { deferred } from './settlement-fixture.ts'

describe('RT5 S12/S25 real session display list', () => {
  it('requires durable explicit selection and returns current winners, covered rows and presence per source', async () => {
    const host = await selectionHost(true, true)
    try {
      const { component, owner } = host.create()
      expect(await component.displayList()).toEqual({ unavailable: true })
      expect(await host.log.readSince(host.session, 0)).toMatchObject({ entries: [] })
      const { registration: _registration, updatedAt: _updatedAt, ...content } = profile()
      const organization = await host.catalog.registerProfile(
        host.tenant,
        { layer: 'organization', organization: host.tenant.organization },
        { ...content, origin: 'custom' },
      )
      const tenant = await host.catalog.registerProfile(
        host.tenant,
        { layer: 'tenant', tenant: host.tenant },
        { ...content, origin: 'custom' },
      )
      if ('failure' in organization || 'failure' in tenant)
        throw new Error('Genuine row registration failed')
      await component.selectModel('example/model-a')
      const expected = {
        ok: [
          {
            routeName: 'example/model-a',
            ref: tenant.ref,
            annotations: ['legal', 'credential_missing'],
            selected: true,
            covered: [organization.ref, { origin: 'official', routeName: 'example/model-a' }].map(
              ref => ({
                ref,
                annotations: [
                  { overridden_by: { scope: { layer: 'tenant', tenant: host.tenant } } },
                ],
              }),
            ),
          },
          {
            routeName: 'example/model-b',
            ref: { origin: 'official', routeName: 'example/model-b' },
            annotations: ['legal'],
            covered: [],
            selected: false,
          },
        ],
      }
      expect(await component.displayList()).toEqual(expected)
      // The real directory presence port observes metadata only; no credential body is installed.
      expect(
        await host.catalog.bindCredential(host.tenant, host.tenant, 'test-only-bound-reference'),
      ).toMatchObject({ tenant: host.tenant })
      const bound = await component.displayList()
      expect(bound).toMatchObject({
        ok: [
          { annotations: ['legal'], selected: true },
          { annotations: ['legal'], selected: false },
        ],
      })
      expect(JSON.stringify(bound)).not.toContain('test-only-bound-reference')
      await host.catalog.unbindCredential(host.tenant, host.tenant)
      expect(await component.displayList()).toEqual(expected)
      await host.catalog.withdrawProfile(host.tenant, tenant.ref)
      expect(await component.displayList()).toMatchObject({
        ok: [
          {
            ref: organization.ref,
            annotations: ['legal', 'credential_missing'],
            selected: true,
            covered: [
              {
                ref: tenant.ref,
                annotations: [
                  {
                    overridden_by: {
                      scope:
                        organization.ref.origin === 'custom'
                          ? organization.ref.scope
                          : { layer: 'factory' },
                    },
                  },
                  'withdrawn',
                ],
              },
              { ref: { origin: 'official' } },
            ],
          },
          { selected: false },
        ],
      })
      await host.reopen()
      expect(await host.create().component.displayList()).toMatchObject({
        ok: [{ ref: organization.ref, selected: true }, { selected: false }],
      })
      expect(owner.active).toBe(0)
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
  })
  it('retains a selected withdrawn route without asking its credentials, then observes genuine relisting', async () => {
    const host = await selectionHost()
    try {
      const {
        registration: _registration,
        updatedAt: _updatedAt,
        ...content
      } = profile('example/private')
      const row = await host.catalog.registerProfile(
        host.tenant,
        { layer: 'tenant', tenant: host.tenant },
        { ...content, origin: 'custom' },
      )
      if ('failure' in row) throw new Error('Genuine row registration failed')
      const asked: string[] = []
      const component = host.create({
        catalog: {
          listProfiles: host.catalog.listProfiles.bind(host.catalog),
          async credentialPresent(tenant, origin) {
            asked.push(String(origin))
            return await host.catalog.credentialPresent(tenant, origin)
          },
        },
      }).component
      await component.selectModel('example/private')
      await host.catalog.withdrawProfile(host.tenant, row.ref)
      expect(await component.displayList()).toMatchObject({
        ok: [
          { routeName: 'example/model-a', selected: false },
          { routeName: 'example/model-b', selected: false },
          {
            routeName: 'example/private',
            ref: row.ref,
            annotations: ['withdrawn'],
            covered: [],
            selected: true,
          },
        ],
      })
      expect(asked).toEqual(['official', 'official'])
      await host.catalog.relistProfile(host.tenant, row.ref)
      expect(await component.displayList()).toMatchObject({
        ok: [
          expect.anything(),
          expect.anything(),
          {
            routeName: 'example/private',
            annotations: ['legal', 'credential_missing'],
            selected: true,
          },
        ],
      })
      expect(asked).toEqual(['official', 'official', 'official', 'official', 'custom'])
      expect(await host.log.readSince(host.session, 0)).toMatchObject({
        entries: [expect.anything()],
      })
    } finally {
      await host.close()
    }
  })
  it('includes the selected modality mismatch and omits other incompatible names', async () => {
    const host = await selectionHost()
    try {
      await host.create().component.selectModel('example/model-a')
      // Controlled complete-projection result only; the real image-prefix case lives in session-selection.spec.ts.
      const component = host.create({
        async projection() {
          return { known: ['image'] }
        },
      }).component
      expect(await component.legalTargets()).toEqual({ ok: [] })
      expect(await component.displayList()).toEqual({
        ok: [
          {
            routeName: 'example/model-a',
            ref: { origin: 'official', routeName: 'example/model-a' },
            annotations: ['modality_mismatch', 'credential_missing'],
            covered: [],
            selected: true,
          },
        ],
      })
      expect(await component.selectModel('example/model-a')).toEqual({
        notLegalTarget: { because: ['modality_mismatch'] },
      })
    } finally {
      await host.close()
    }
  })
  it('selected missing row is profileNotFound; unreadable catalog, log, projection or presence is unavailable', async () => {
    const host = await selectionHost()
    try {
      await host.create().component.selectModel('example/model-a')
      const component = host.create().component
      // Controlled persistent corruption, not a directory deletion API: model-a is an official row.
      await host.storage.write(
        async tx =>
          await narrow<{ model_profile: { route_name: string } }>(tx)
            .deleteFrom('model_profile')
            .where('route_name', '=', 'example/model-a')
            .execute(),
      )
      expect(await component.displayList()).toEqual({ profileNotFound: true })
    } finally {
      await host.close()
    }
    const intact = await selectionHost()
    try {
      await intact.create().component.selectModel('example/model-a')
      // Controlled failing ports preserve the real providers for all other reads.
      const failedCatalog = intact.create({
        catalog: {
          async listProfiles() {
            return { failure: 'unavailable' }
          },
          credentialPresent: intact.catalog.credentialPresent.bind(intact.catalog),
        },
      }).component
      const failedPresence = intact.create({
        catalog: {
          listProfiles: intact.catalog.listProfiles.bind(intact.catalog),
          async credentialPresent() {
            return { failure: 'unavailable' }
          },
        },
      }).component
      const failedProjection = intact.create({
        async projection() {
          return { unknown: true }
        },
      }).component
      const { input } = intact.create()
      const failedLog = intact.create({
        binding: {
          ...input.binding,
          log: {
            ...intact.log,
            async readSince() {
              return { failure: 'unavailable' }
            },
          },
        },
      }).component
      for (const value of [failedCatalog, failedPresence, failedProjection, failedLog])
        expect(await value.displayList()).toEqual({ unavailable: true })
      await intact.reader.close()
      expect(await intact.create().component.displayList()).toEqual({ unavailable: true })
    } finally {
      await intact.close()
    }
  })
  it('rejects controlled foreign directory rows and credential scopes using the fixed session tenant', async () => {
    const host = await selectionHost()
    try {
      await host.create().component.selectModel('example/model-a')
      const foreign = parseTenantId({ ...host.tenant, account: 'foreign-account' })
      if (!('ok' in foreign)) throw new Error('Foreign tenant syntax')
      const rows = host.create({
        catalog: {
          async listProfiles(tenant) {
            expect(tenant).toEqual(host.tenant)
            return [
              {
                ref: {
                  origin: 'custom',
                  routeName: 'example/model-a',
                  scope: { layer: 'tenant', tenant: foreign.ok },
                },
                profile: { ...profile(), origin: 'custom' },
              },
            ]
          },
          credentialPresent: host.catalog.credentialPresent.bind(host.catalog),
        },
      }).component
      expect(await rows.displayList()).toEqual({ unavailable: true })
      expect(await rows.legalTargets()).toEqual({ unavailable: true })
      const bound = await host.catalog.bindCredential(
        host.tenant,
        host.tenant,
        'test-only-reference',
      )
      if ('failure' in bound) throw new Error('Genuine binding failed')
      const presence = host.create({
        catalog: {
          listProfiles: host.catalog.listProfiles.bind(host.catalog),
          async credentialPresent(tenant) {
            expect(tenant).toEqual(host.tenant)
            return {
              present: true,
              scope: { layer: 'tenant', tenant: foreign.ok },
              boundAt: bound.boundAt,
            }
          },
        },
      }).component
      expect(await presence.displayList()).toEqual({ unavailable: true })
    } finally {
      await host.close()
    }
  })
  it('generation replacement during presence read denies the result and keeps actual stop ownership', async () => {
    const host = await selectionHost()
    try {
      await host.create().component.selectModel('example/model-a')
      const entered = deferred<void>(),
        release = deferred<void>()
      const { component, owner } = host.create({
        catalog: {
          listProfiles: host.catalog.listProfiles.bind(host.catalog),
          async credentialPresent(...args) {
            entered.resolve()
            await release.promise
            return await host.catalog.credentialPresent(...args)
          },
        },
      })
      const reading = component.displayList()
      await entered.promise
      await host.replaceGeneration()
      let closed = false
      const closing = component.close().then(value => {
        closed = true
        return value
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closed).toBe(false)
      expect(owner.active).toBe(1)
      release.resolve()
      expect(await reading).toEqual({ unavailable: true })
      expect(await closing).toEqual({ released: true })
      expect(owner.active).toBe(0)
    } finally {
      await host.close()
    }
  })
})
