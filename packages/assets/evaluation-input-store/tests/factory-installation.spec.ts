import { expect, test, vi } from 'vitest'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import {
  installOfficialFactoryDefinition,
  installOfficialFactoryDefinitions,
  publishLocalInputs,
  readPublicationRevision,
} from '../src/publication.ts'
import { createEvaluationInputReader } from '../src/index.ts'
import { asset, AT, boot, holding, ROOT } from './support.ts'
const capability = { category: 'agent_definition' as const, name: 'factory:session' }
const release = {
  id: 'factory-session',
  capability,
  origin: 'official' as const,
  versions: [
    {
      number: 1,
      publishedAt: AT,
      content: {
        category: 'agent_definition' as const,
        body: toOpaqueJson({
          references: [],
          attributes: [],
          contextSessionSeed: { required: [], initial: [], fixed: [] },
        }),
      },
    },
  ],
}
const request = { definition: release, since: AT, holders: [] }

test('installs a complete factory bundle in one revision and recognizes the whole bundle', async () => {
  const other = {
    ...release,
    id: 'second-factory-session',
    capability: { ...capability, name: 'factory:second' },
  }
  const h = await boot(undefined, [
    { capability, meta: false },
    { capability: other.capability, meta: false },
  ])
  try {
    const input = { definitions: [release, other], since: AT, holders: [] }
    expect(await installOfficialFactoryDefinitions(h.deps, input)).toEqual({ revision: '1' })
    const atomic = vi.spyOn(h.storage, 'atomic')
    expect(await installOfficialFactoryDefinitions(h.deps, input)).toEqual({ revision: '1' })
    expect(atomic).not.toHaveBeenCalled()
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
  } finally {
    await h.close()
  }
})

test('a conflicting member rejects a factory bundle without installing its earlier valid member', async () => {
  const h = await boot()
  try {
    const { tenant } = await h.identity('bundle-reader')
    await h.initialize(tenant)
    const deps = {
      ...h.deps,
      deployedOfficial: [...h.deps.deployedOfficial, { capability, meta: false }],
    }
    const changed = {
      ...asset(),
      versions: [{ ...asset().versions[0]!, publishedAt: '2026-10-09T00:00:00Z' }],
    }
    expect(
      await installOfficialFactoryDefinitions(deps, {
        definitions: [release, changed],
        since: AT,
        holders: [],
      }),
    ).toEqual({ failure: 'conflict' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
    const reader = createEvaluationInputReader(h.deps)
    try {
      const read = await reader.read('session_a', tenant)
      expect(read).toHaveProperty('input.definitions.length', 1)
    } finally {
      await reader.close()
    }
  } finally {
    await h.close()
  }
})

test('installs the declared official release once and recognizes it without publishing again', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ revision: '1' })
    const atomic = vi.spyOn(h.storage, 'atomic')
    expect(
      await installOfficialFactoryDefinition(h.deps, { ...request, since: '2026-10-09T00:00:00Z' }),
    ).toEqual({ revision: '1' })
    expect(atomic).not.toHaveBeenCalled()
  } finally {
    await h.close()
  }
})
test('extends existing factory holdings without rewriting organization, tenant, versions or recipes', async () => {
  const h = await boot()
  try {
    const { tenant } = await h.identity('factory-reader')
    await h.initialize(tenant)
    const organizationHolding = holding({
      layer: 'organization',
      organization: tenant.organization,
    })
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: '1',
        definitions: [],
        scopes: [{ holder: organizationHolding.holder, holdings: [organizationHolding] }],
      }),
    ).toEqual({ revision: '2' })
    const before = await h.reader.read('session_a', tenant)
    const deps = {
      ...h.deps,
      deployedOfficial: [...h.deps.deployedOfficial, { capability, meta: false }],
    }
    expect(
      await installOfficialFactoryDefinition(deps, {
        ...request,
        holders: [
          { layer: 'organization', organization: tenant.organization },
          { layer: 'tenant', tenant },
        ],
      }),
    ).toEqual({ revision: '3' })
    const after = await h.storage.read(tx =>
      narrow<{ evaluation_input_scope: { store_key: string; layer: string; holdings: string } }>(tx)
        .selectFrom('evaluation_input_scope')
        .select(['layer', 'holdings'])
        .where('store_key', '=', h.deps.storeKey)
        .execute(),
    )
    expect(JSON.parse(after.find(row => row.layer === 'organization')!.holdings)).toEqual([
      organizationHolding,
    ])
    expect(JSON.parse(after.find(row => row.layer === 'tenant')!.holdings)).toEqual([])
    expect(JSON.parse(after.find(row => row.layer === 'factory')!.holdings)).toEqual([
      holding({ layer: 'factory' }),
      {
        holder: { layer: 'factory' },
        capability,
        asset: release.id,
        basis: { kind: 'official' },
        immutable: false,
        assignments: [],
        versionSelection: { kind: 'current' },
        since: AT,
      },
    ])
    // The original captured recipe and root version are retained; the new manifest is explicit.
    expect(before).toHaveProperty('input.root.source', { asset: 'ast_root', version: 1 })
    const reader = createEvaluationInputReader(deps)
    try {
      expect(await reader.read('session_a', tenant)).toHaveProperty('input.root.source', {
        asset: 'ast_root',
        version: 1,
      })
    } finally {
      await reader.close()
    }
    expect(await readPublicationRevision(deps)).toEqual({ revision: '3' })
  } finally {
    await h.close()
  }
})
test('rejects colliding factory identity and a changed released body without overwriting them', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ revision: '1' })
    expect(
      await installOfficialFactoryDefinition(h.deps, {
        ...request,
        definition: { ...release, id: 'other' },
      }),
    ).toEqual({ failure: 'conflict' })
    expect(
      await installOfficialFactoryDefinition(h.deps, {
        ...request,
        definition: {
          ...release,
          versions: [{ ...release.versions[0]!, publishedAt: '2026-10-09T00:00:00Z' }],
        },
      }),
    ).toEqual({ failure: 'conflict' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
  } finally {
    await h.close()
  }
})
test('requires the real factory manifest and valid installation data before storage work', async () => {
  const h = await boot()
  try {
    const read = vi.spyOn(h.storage, 'read')
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({
      failure: 'invalidInput',
    })
    expect(read).not.toHaveBeenCalled()
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: null,
        definitions: [asset()],
        scopes: [{ holder: { layer: 'factory' }, holdings: [holding({ layer: 'factory' })] }],
      }),
    ).toEqual({ revision: '1' })
    expect(
      await installOfficialFactoryDefinition(
        { ...h.deps, deployedOfficial: [{ capability, meta: false }] },
        request,
      ),
    ).toEqual({ failure: 'conflict' })
    expect(ROOT.name).not.toEqual(capability.name)
  } finally {
    await h.close()
  }
})
test('lost commit is unavailable; explicit recognition reuses the committed release and revision', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    const atomic = h.storage.atomic.bind(h.storage)
    const fault = vi.spyOn(h.storage, 'atomic').mockImplementationOnce(async work => {
      await atomic(work)
      throw new StorageUnavailable('commit response lost')
    })
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({
      failure: 'unavailable',
    })
    fault.mockRestore()
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ revision: '1' })
  } finally {
    await h.close()
  }
})

test('does not recognize a corrupt persisted factory manifest or repair a missing head', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ revision: '1' })
    await h.storage.write(tx =>
      narrow<{ evaluation_input_head: { store_key: string; factory_manifest: string } }>(tx)
        .updateTable('evaluation_input_head')
        .set({ factory_manifest: '[]' })
        .where('store_key', '=', h.deps.storeKey)
        .execute(),
    )
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({
      failure: 'unavailable',
    })
    await h.storage.write(tx =>
      narrow<{ evaluation_input_head: { store_key: string } }>(tx)
        .deleteFrom('evaluation_input_head')
        .where('store_key', '=', h.deps.storeKey)
        .execute(),
    )
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({
      failure: 'unavailable',
    })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: null })
  } finally {
    await h.close()
  }
})

test('CAS rejects the losing deployment after both installers observed the same original revision', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    const read = h.storage.read.bind(h.storage)
    let arrivals = 0,
      release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const observation = vi.spyOn(h.storage, 'read').mockImplementation(async work => {
      const snapshot = await read(work)
      if (++arrivals === 2) release()
      await gate
      return snapshot
    })
    const results = await Promise.all([
      installOfficialFactoryDefinition(h.deps, request),
      installOfficialFactoryDefinition(h.deps, request),
    ])
    observation.mockRestore()
    expect(results).toContainEqual({ revision: '1' })
    expect(results).toContainEqual({ failure: 'conflict' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
  } finally {
    await h.close()
  }
})

test('appends an official release while preserving its immutable prefix and installation time', async () => {
  const h = await boot(undefined, [{ capability, meta: false }])
  try {
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ revision: '1' })
    const next = {
      ...release,
      versions: [
        ...release.versions,
        {
          number: 2,
          publishedAt: '2026-10-09T05:06:56Z',
          content: {
            category: 'agent_definition' as const,
            body: toOpaqueJson({ references: [], attributes: [], revisionSpecific: 'two' }),
          },
        },
      ],
    }
    expect(
      await installOfficialFactoryDefinition(h.deps, {
        ...request,
        definition: next,
        since: '2026-10-09T05:06:56Z',
      }),
    ).toEqual({ revision: '2' })
    expect(
      await installOfficialFactoryDefinition(h.deps, { ...request, definition: next }),
    ).toEqual({ revision: '2' })
    expect(await installOfficialFactoryDefinition(h.deps, request)).toEqual({ failure: 'conflict' })
    const persisted = await h.storage.read(tx =>
      narrow<{
        evaluation_input_version: { store_key: string; version_position: string; version: string }
      }>(tx)
        .selectFrom('evaluation_input_version')
        .select(['version_position', 'version'])
        .where('store_key', '=', h.deps.storeKey)
        .orderBy('version_position')
        .execute(),
    )
    expect(persisted.map(row => JSON.parse(row.version).number)).toEqual([1, 2])
    expect(JSON.parse(persisted[0]!.version).publishedAt).toEqual(AT)
    const factory = await h.storage.read(tx =>
      narrow<{ evaluation_input_scope: { store_key: string; layer: string; holdings: string } }>(tx)
        .selectFrom('evaluation_input_scope')
        .select('holdings')
        .where('store_key', '=', h.deps.storeKey)
        .where('layer', '=', 'factory')
        .executeTakeFirstOrThrow(),
    )
    expect(JSON.parse(factory.holdings)[0].since).toEqual(AT)
  } finally {
    await h.close()
  }
})
