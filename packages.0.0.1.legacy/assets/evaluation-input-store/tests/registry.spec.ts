import { expect, test, vi } from 'vitest'
import {
  createRegistryInputReader,
  type RegistryInputReader,
} from '@omne-harness-lite/evaluation-input-store/registry-inputs'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { publishLocalInputs } from '../src/publication.ts'
import { withHost, body, asset, holding, ROOT, gate } from './support.ts'

// These component tests supply a trusted fixed source; they do not prove MF/registry original-fill recovery (SI-G1).
test('fixed body remains v1 while current body becomes v2; actual C16 and actual selector confirm the dependency mismatch', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const reader = createRegistryInputReader(h.deps)
    try {
      const request = {
        session: 'session_a',
        tenant,
        purpose: 'reload',
        rootSource: { asset: 'ast_root', version: 1 },
      }
      expect(await reader.read(request)).toHaveProperty('input.root.source', request.rootSource)
      expect(
        await publishLocalInputs(h.deps, {
          expectedRevision: '1',
          definitions: [asset([body(), body('example/model-b')])],
          scopes: [],
        }),
      ).toEqual({ revision: '2' })
      const result = await reader.read(request)
      expect(result).toMatchObject({
        failure: 'rootSourceMismatch',
        selected: { asset: 'ast_root', version: 2 },
        sourceRevision: '2',
      })
      if (!('failure' in result) || result.failure !== 'rootSourceMismatch')
        throw new Error('real C16 mismatch not handed over')
      expect(result.input.root.source).toEqual(request.rootSource)
      expect(result.input.root.attributes.find(item => item.item === 'model')).toHaveProperty(
        'default',
        'example/model-a',
      )
      expect(
        result.rejection.invalidInput.diagnostics.some(
          diagnostic => diagnostic.condition === 'C16',
        ),
      ).toBe(true)
      expect(evaluate(result.input)).toEqual(result.rejection)
      expect(await h.reader.read('session_a', tenant)).toHaveProperty(
        'input.root.source.version',
        2,
      )
    } finally {
      await reader.close()
    }
  }))

test.each([
  null,
  {},
  { session: 'session_a' },
  { session: 'session_a', tenant: {}, purpose: 'reload', rootSource: { asset: 'a', version: 1 } },
  { purpose: 'different' },
  { rootSource: { asset: 'ast_root', version: 0 } },
  { rootSource: { asset: 'ast_root', version: true } },
  { rootSource: { asset: 'ast_root', version: 1, additional: true } },
  { additional: true },
])('bad fixed-root request %j is invalidInput without IO', async changes =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const reader = createRegistryInputReader(h.deps)
    const read = vi.spyOn(h.storage, 'read')
    const atomic = vi.spyOn(h.storage, 'atomic')
    try {
      const base = {
        session: 'session_a',
        tenant,
        purpose: 'reload',
        rootSource: { asset: 'ast_root', version: 1 },
      }
      const malformed =
        changes === null || Object.keys(changes).length === 0 || 'session' in changes
          ? changes
          : { ...base, ...changes }
      expect(await reader.read(malformed)).toEqual({ failure: 'invalidInput' })
      expect(read).not.toHaveBeenCalled()
      expect(atomic).not.toHaveBeenCalled()
    } finally {
      await reader.close()
    }
  }),
)

test('exact equivalent version spelling stays equivalent; unavailable original body does not get replaced by current', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const reader = createRegistryInputReader(h.deps)
    try {
      const base = { session: 'session_a', tenant, purpose: 'refresh_availability' }
      const equivalent = await reader.read({
        ...base,
        rootSource: { asset: 'ast_root', version: new LosslessNumber('1e0') },
      })
      expect(equivalent).toHaveProperty('input')
      expect(await reader.read({ ...base, rootSource: { asset: 'ast_root', version: 2 } })).toEqual(
        { failure: 'unavailable', stage: 'fixed_body' },
      )
      expect(
        await reader.read({ ...base, rootSource: { asset: 'ast_absent', version: 1 } }),
      ).toEqual({ failure: 'unavailable', stage: 'source' })
    } finally {
      await reader.close()
    }
  }))

test('reload uses real current role; availability preserves captured role and both reject ineffective membership', async () =>
  withHost(async h => {
    const owner = await h.identity('owner')
    const member = await h.identity('member')
    const team = await h.organizations.createTeam(
      owner.tenant.account,
      'test organization',
      'registry-team',
    )
    if (!('ok' in team)) throw new Error('real team not created')
    const invitation = await h.offers.issueInvitation(
      team.ok.tenant,
      member.tenant.account,
      'member',
    )
    if (!('ok' in invitation)) throw new Error('real invitation not issued')
    const joined = await h.offers.acceptInvitation(member.tenant.account, invitation.ok)
    if (!('ok' in joined)) throw new Error('real membership not established')
    await h.initialize(joined.ok)
    expect(await h.memberships.changeRole(team.ok.tenant, joined.ok, 'superAdministrator')).toBe(
      'ok',
    )
    const reader = createRegistryInputReader(h.deps)
    try {
      const base = {
        session: 'session_a',
        tenant: joined.ok,
        rootSource: { asset: 'ast_root', version: 1 },
      }
      expect(await reader.read({ ...base, purpose: 'reload' })).toHaveProperty(
        'input.standing.role',
        'superAdministrator',
      )
      expect(await reader.read({ ...base, purpose: 'refresh_availability' })).toHaveProperty(
        'input.standing.role',
        'member',
      )
      expect(await h.memberships.remove(team.ok.tenant, joined.ok)).toBe('ok')
      for (const purpose of ['reload', 'refresh_availability'])
        expect(await reader.read({ ...base, purpose })).toEqual({
          failure: 'unavailable',
          stage: 'current_membership',
        })
    } finally {
      await reader.close()
    }
  }))

test('fixed original asset no longer held is read separately and is never inserted as a forged old holding', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const holder = { layer: 'tenant' as const, tenant }
    const customized = (id: string, model: string) => ({
      ...asset([body(model)]),
      id,
      origin: 'customized',
      owner: { kind: 'tenant', tenant },
      author: tenant,
      byAgent: false,
      versions: asset([body(model)]).versions.map(version => ({ ...version, publishedBy: tenant })),
    })
    const owned = (id: string) => ({ ...holding(holder), asset: id, basis: { kind: 'owned' } })
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '1',
        definitions: [customized('ast_custom_a', 'example/a')],
        scopes: [{ holder, holdings: [owned('ast_custom_a')] }],
      }),
    ).toEqual({ revision: '2' })
    const reader = createRegistryInputReader(h.deps)
    try {
      const request = {
        session: 'session_a',
        tenant,
        purpose: 'reload',
        rootSource: { asset: 'ast_custom_a', version: 1 },
      }
      expect(await reader.read(request)).toHaveProperty('input.root.source', request.rootSource)
      expect(
        await publishLocalInputs(h.deps, {
          expectedRevision: '2',
          definitions: [customized('ast_custom_b', 'example/b')],
          scopes: [{ holder, holdings: [owned('ast_custom_b')] }],
        }),
      ).toEqual({ revision: '3' })
      const result = await reader.read(request)
      expect(result).toHaveProperty('failure', 'rootSourceMismatch')
      if (!('input' in result)) throw new Error('source mismatch input absent')
      expect(result.input.holdings.some(item => item.asset === 'ast_custom_a')).toBe(false)
      expect(result.input.definitions.some(item => item.id === 'ast_custom_a')).toBe(false)
      expect(result.input.root.source).toEqual(request.rootSource)
    } finally {
      await reader.close()
    }
  }))

test('current root missing keeps unresolved handling and a real self-cycle keeps its domain failure', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const reader = createRegistryInputReader(h.deps)
    try {
      const request = {
        session: 'session_a',
        tenant,
        purpose: 'reload',
        rootSource: { asset: 'ast_root', version: 1 },
      }
      const emptyDeployments = { ...h.deps, deployedOfficial: [] }
      expect(
        await publishLocalInputs(emptyDeployments, {
          expectedRevision: '1',
          definitions: [],
          scopes: [{ holder: { layer: 'factory' }, holdings: [] }],
        }),
      ).toEqual({ revision: '2' })
      const absent = createRegistryInputReader(emptyDeployments)
      try {
        const result = await absent.read(request)
        expect(result).toHaveProperty('input')
        if (!('input' in result)) throw new Error('missing current root was confused with mismatch')
        expect(evaluate(result.input)).toHaveProperty('ok.unresolved')
      } finally {
        await absent.close()
      }
      const cyclic = {
        ...body(),
        references: [{ capability: { category: ROOT.category, name: ROOT.name } }],
      }
      expect(
        await publishLocalInputs(h.deps, {
          expectedRevision: '2',
          definitions: [asset([body(), cyclic])],
          scopes: [{ holder: { layer: 'factory' }, holdings: [holding({ layer: 'factory' })] }],
        }),
      ).toEqual({ revision: '3' })
      const result = await reader.read({
        ...request,
        rootSource: { asset: 'ast_root', version: 2 },
      })
      expect(result).toHaveProperty('input')
      if (!('input' in result)) throw new Error('compositionCycle swallowed as unavailable')
      expect(evaluate(result.input)).toHaveProperty('compositionCycle')
    } finally {
      await reader.close()
    }
  }))

test('fixed-root participation failure terminates atomic before mapping; defects remain exceptions and close drains actual work', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const request = {
      session: 'session_a',
      tenant,
      purpose: 'reload',
      rootSource: { asset: 'ast_root', version: 1 },
    }
    const real = h.memberships.participate.bind(h.memberships)
    const participation = vi.spyOn(h.memberships, 'participate').mockImplementation(unit => ({
      ...real(unit),
      standing: () =>
        unit.run(async () => {
          throw new StorageUnavailable('actual participation injected failure')
        }),
    }))
    const reader: RegistryInputReader = createRegistryInputReader(h.deps)
    try {
      expect(await reader.read(request)).toEqual({ failure: 'unavailable', stage: 'storage' })
      participation.mockImplementation(unit => ({
        ...real(unit),
        standing: async () => {
          throw new StorageDefect('injected defect')
        },
      }))
      await expect(reader.read(request)).rejects.toBeInstanceOf(StorageDefect)
      participation.mockRestore()
      const block = gate()
      const actual = h.storage.atomic.bind(h.storage)
      const atomic = vi.spyOn(h.storage, 'atomic').mockImplementation(fn =>
        actual(async unit => {
          await block.pause()
          return fn(unit)
        }),
      )
      const pending = reader.read(request)
      await block.reached
      let ended = false
      const close = reader.close().then(() => {
        ended = true
      })
      await Promise.resolve()
      expect(ended).toBe(false)
      expect(await reader.read(request)).toEqual({ failure: 'unavailable', stage: 'stopped' })
      block.release()
      expect(await pending).toHaveProperty('input')
      await close
      expect(ended).toBe(true)
      atomic.mockRestore()
      expect(writeJsonLossless(h.diagnostics.at(-1)!)).not.toContain('example/model-a')
    } finally {
      await reader.close()
    }
  }))
