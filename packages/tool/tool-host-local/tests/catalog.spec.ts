// The Catalog over the local binding registry. The contract has no Catalog suite, so each rule of
// this table has its own case that breaks only that rule. The origin check and the availability
// facts are scripted; the registry is the real one.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Access, ToolConsumerProfile } from '@omne-harness/tool-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import { testingWorkspace } from '@omne-harness/tool-contract/testing'
import {
  createLocalToolCatalog,
  type LocalToolAvailabilitySource,
  type ToolAvailabilityVerdict,
} from '@omne-harness/tool-host-local'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  officialLayer,
  organizationLayer,
  register,
  scriptedVerifier,
  tenantA,
  tenantA2,
  tenantB,
  tenantLayer,
} from './binding-values.ts'

const evidence = (record: string) => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const consumer: ToolConsumerProfile = {
  capabilities: evidence('capabilities'),
  conversion: null,
  attachmentAccess: evidence('attachments'),
}
const ALLOWED: ToolAvailabilityVerdict = {
  qualification: 'allowed',
  dependencies: [],
  inputCompatible: true,
  outputCompatible: true,
  attachmentsReadable: true,
}
const allowing = (): LocalToolAvailabilitySource<string> => ({
  judge: () => Promise.resolve(succeed(ALLOWED)),
})

const asA = accessOf(tenantA)
const asA2 = accessOf(tenantA2)
const asB = accessOf(tenantB)

type Registrant = Access<string>

/** A registry with the given tools, each registered by its registrant, and a Catalog over it. */
function world(
  tools: readonly Readonly<{
    authority: ToolAuthority
    by: Registrant
    programmable?: boolean
  }>[],
  availability: LocalToolAvailabilitySource<string> = allowing(),
) {
  const { registry } = fiberedRegistry(scriptedVerifier(tools.map(tool => tool.authority)))
  for (const tool of tools) {
    const outcome = register(
      registry,
      tool.by,
      tool.authority,
      'digest-1',
      tool.programmable === undefined ? {} : { programmable: tool.programmable },
    )
    if (!('ok' in outcome)) throw new Error(`setup: ${tool.authority.asset.name}`)
  }
  return { registry, catalog: createLocalToolCatalog({ registry, availability }) }
}

const official = (name: string, revision = '1') =>
  authorityFor(officialLayer, name, `holding-${name}-${revision}`, revision)

const inspectOf = (name: string, access: Access<string>, command: string | null = null) => ({
  ...access,
  name,
  command,
  consumer,
})
const searchOf = (
  access: Access<string>,
  options: Partial<{
    query: string
    invocation: 'direct' | 'programmatic'
    after: string | null
    limit: number
  }> = {},
) => ({
  ...access,
  query: '',
  consumer,
  invocation: 'direct' as const,
  after: null,
  limit: 50,
  ...options,
})

async function names(
  catalog: ReturnType<typeof world>['catalog'],
  access: Access<string>,
  options: Parameters<typeof searchOf>[1] = {},
): Promise<string[]> {
  const found = await catalog.search(searchOf(access, options))
  if (!('ok' in found)) throw new Error('search failed')
  return found.ok.entries.map(entry => entry.definition.name)
}

describe('Catalog: inspect and usage', () => {
  it('T-CAT inspect answers an available tool with its layer and executor adoption', async () => {
    const alpha = official('alpha')
    const { catalog } = world([{ authority: alpha, by: asA }])
    const answer = await catalog.inspect(inspectOf('alpha', asB))
    expect(answer).toMatchObject({
      ok: { kind: 'available', layer: { kind: 'official' }, definition: { name: 'alpha' } },
    })
  })

  it('T-CAT a tenant-layer registration of another tenant is absent on inspect, usage and search', async () => {
    const theirs = authorityFor(tenantLayer(tenantB), 'theirs')
    const { catalog } = world([{ authority: theirs, by: asB }])
    const absent = await catalog.inspect(inspectOf('nothing', asA))
    expect(await catalog.inspect(inspectOf('theirs', asA))).toEqual(absent)
    expect(
      await catalog.usage({ ...inspectOf('theirs', asA), adoption: theirs.asset.adoption }),
    ).toEqual(absent)
    expect(await names(catalog, asA)).toEqual([])
    // The owner still sees it, so the answers above are about visibility and not about absence.
    expect(await names(catalog, asB)).toEqual(['theirs'])
  })

  it('T-CAT an organization-layer registration is seen inside the organization and nowhere else', async () => {
    const shared = authorityFor(organizationLayer(tenantA), 'shared')
    const { catalog } = world([{ authority: shared, by: asA }])
    expect(await names(catalog, asA2)).toEqual(['shared'])
    expect(await names(catalog, asB)).toEqual([])
    expect(await catalog.inspect(inspectOf('shared', asB))).toMatchObject({
      failure: { kind: 'invalid', reason: 'unknown-tool' },
    })
  })

  it('T-CAT a workspace-layer registration is seen by no tenant scope', async () => {
    const workspace = authorityFor(
      { kind: 'workspace', workspace: testingWorkspace('wsp_c0nf0rmance000000000000000') },
      'scoped',
    )
    const { registry } = fiberedRegistry({
      verify: () => succeed(workspace),
      admits: () => succeed(undefined),
    })
    expect(register(registry, asA, workspace)).toHaveProperty('ok')
    const catalog = createLocalToolCatalog({ registry, availability: allowing() })
    expect(await names(catalog, asA)).toEqual([])
  })

  it('T-CAT a draining contribution is not listed until it is reopened', async () => {
    const alpha = official('alpha')
    const { registry, catalog } = world([{ authority: alpha, by: asA }])
    const key = { layer: alpha.layer, asset: alpha.asset }
    registry.close(key)
    expect(await names(catalog, asA)).toEqual([])
    expect(await catalog.inspect(inspectOf('alpha', asA))).toHaveProperty('failure')
    registry.reopen(key)
    expect(await names(catalog, asA)).toEqual(['alpha'])
  })

  it('T-CAT a tenant that cannot be proven legal gets unavailable, never an empty listing', async () => {
    const { catalog } = world([{ authority: official('alpha'), by: asA }])
    const forged = {
      principal: 'user',
      tenant: { organization: { text: 'x' }, account: { text: 'y' } },
    }
    const answer = await catalog.search(searchOf(forged as never))
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', dependency: 'toolBindings' } })
  })

  it('T-CAT availability follows the verified facts: unqualified is known-unavailable, usage is denied', async () => {
    const alpha = official('alpha')
    const denying: LocalToolAvailabilitySource<string> = {
      judge: () => Promise.resolve(succeed({ ...ALLOWED, qualification: 'denied' })),
    }
    const { catalog } = world([{ authority: alpha, by: asA }], denying)
    expect(await catalog.inspect(inspectOf('alpha', asA))).toMatchObject({
      ok: { kind: 'known-unavailable', reason: expect.stringContaining('qualification-denied') },
    })
    expect(
      await catalog.usage({ ...inspectOf('alpha', asA), adoption: alpha.asset.adoption }),
    ).toEqual({ failure: { kind: 'denied', action: 'usage' } })
  })

  it('T-CAT a facts source that cannot answer is unavailable on inspect and on search, not allowed', async () => {
    const broken: LocalToolAvailabilitySource<string> = {
      judge: () =>
        Promise.resolve(fail({ kind: 'unavailable', dependency: 'facts', diagnostic: 'down' })),
    }
    const { catalog } = world([{ authority: official('alpha'), by: asA }], broken)
    expect(await catalog.inspect(inspectOf('alpha', asA))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'facts' },
    })
    expect(await catalog.search(searchOf(asA))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'facts' },
    })
  })

  it('T-CAT one name with two live contributions resolves to the lowest registration ordinal', async () => {
    const second = official('alpha', '2')
    const first = official('alpha', '1')
    const { catalog } = world([
      { authority: second, by: asA },
      { authority: first, by: asA },
    ])
    expect(await catalog.inspect(inspectOf('alpha', asA))).toMatchObject({
      ok: { definition: { adoption: second.asset.adoption } },
    })
    expect(await names(catalog, asA)).toEqual(['alpha'])
  })

  it('T-CAT usage names the declared parameters and returns of the chosen definition', async () => {
    const alpha = official('alpha')
    const { catalog } = world([{ authority: alpha, by: asA }])
    const usage = await catalog.usage({
      ...inspectOf('alpha', asA),
      adoption: alpha.asset.adoption,
    })
    expect(usage).toMatchObject({
      ok: { definition: alpha.asset.adoption, command: null, description: 'The alpha tool.' },
    })
  })

  it('T-CAT usage for an adoption that is not the chosen definition is unknown', async () => {
    const { catalog } = world([{ authority: official('alpha'), by: asA }])
    const stale = official('alpha', '9').asset.adoption
    expect(await catalog.usage({ ...inspectOf('alpha', asA), adoption: stale })).toMatchObject({
      failure: { kind: 'invalid', reason: 'unknown-tool' },
    })
  })

  it('T-CAT a command asked of a function tool is invalid', async () => {
    const alpha = official('alpha')
    const { catalog } = world([{ authority: alpha, by: asA }])
    expect(await catalog.inspect(inspectOf('alpha', asA, 'run'))).toMatchObject({
      failure: { kind: 'invalid', field: 'command' },
    })
    expect(
      await catalog.usage({ ...inspectOf('alpha', asA, 'run'), adoption: alpha.asset.adoption }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'command' } })
  })

  it('T-CAT an absent registry answers a named unavailable on all three calls', async () => {
    const catalog = createLocalToolCatalog<string>({ registry: null, availability: allowing() })
    const unavailable = { failure: { kind: 'unavailable', dependency: 'toolBindings' } }
    expect(await catalog.inspect(inspectOf('alpha', asA))).toMatchObject(unavailable)
    expect(
      await catalog.usage({
        ...inspectOf('alpha', asA),
        adoption: official('alpha').asset.adoption,
      }),
    ).toMatchObject(unavailable)
    expect(await catalog.search(searchOf(asA))).toMatchObject(unavailable)
  })
})

describe('Catalog: search', () => {
  const five = ['echo', 'alpha', 'delta', 'bravo', 'charlie']
  const tools = five.map(name => ({ authority: official(name), by: asA }))

  it('T-CAT search pages by name with no gap and no repeat, and ends with next null', async () => {
    const { catalog } = world(tools)
    const seen: string[] = []
    let after: string | null = null
    const sizes: number[] = []
    do {
      const page = await catalog.search(searchOf(asA, { limit: 2, after }))
      if (!('ok' in page)) throw new Error('search failed')
      sizes.push(page.ok.entries.length)
      seen.push(...page.ok.entries.map(entry => entry.definition.name))
      after = page.ok.next
    } while (after !== null)
    expect(seen).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo'])
    expect(sizes).toEqual([2, 2, 1])
  })

  it('T-CAT a page boundary that falls on the last entry answers next null, not an empty page', async () => {
    const { catalog } = world(tools)
    const page = await catalog.search(searchOf(asA, { limit: 5 }))
    expect(page).toMatchObject({ ok: { next: null } })
  })

  it('T-CAT a cursor stays valid when tools are registered between pages', async () => {
    const { registry, catalog } = world(tools)
    const first = await catalog.search(searchOf(asA, { limit: 2 }))
    if (!('ok' in first)) throw new Error('search failed')
    for (const name of ['aardvark', 'zulu']) register(registry, asA, official(name))
    const second = await catalog.search(searchOf(asA, { limit: 2, after: first.ok.next }))
    expect(second).toMatchObject({
      ok: { entries: [{ definition: { name: 'charlie' } }, { definition: { name: 'delta' } }] },
    })
  })

  it('T-CAT a limit that is not a positive integer is invalid', async () => {
    const { catalog } = world(tools)
    for (const limit of [0, -1, 1.5, Number.NaN])
      expect(await catalog.search(searchOf(asA, { limit }))).toMatchObject({
        failure: { kind: 'invalid', field: 'limit' },
      })
  })

  it('T-CAT a cursor that the Catalog did not issue is invalid-cursor', async () => {
    const { catalog } = world(tools)
    expect(await catalog.search(searchOf(asA, { after: 'not-a-cursor' }))).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
  })

  it('T-CAT the query matches name and description without regard to case', async () => {
    const { catalog } = world(tools)
    expect(await names(catalog, asA, { query: 'ALPHA' })).toEqual(['alpha'])
    expect(await names(catalog, asA, { query: 'the delta tool' })).toEqual(['delta'])
    expect(await names(catalog, asA, { query: 'no such text' })).toEqual([])
  })

  it('T-CAT a programmatic search lists only tools that are explicitly programmable', async () => {
    const { catalog } = world([
      { authority: official('alpha'), by: asA, programmable: true },
      { authority: official('bravo'), by: asA, programmable: false },
      { authority: official('charlie'), by: asA },
    ])
    expect(await names(catalog, asA, { invocation: 'programmatic' })).toEqual(['alpha'])
    expect(await names(catalog, asA, { invocation: 'direct' })).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
  })
})
