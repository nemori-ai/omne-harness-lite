// The round-trip suite of the resident key (XC-RESKEY): what the write path records for a key must
// come back through the holder-reference reader for the same key, with its tenant and a same
// shape, and nothing else. It runs against a composition: the Session evidence writer with a
// Session (or its in-memory transactions) on one side, the application bridge or the reader double
// on the other. The encoding laws themselves are unit tests of tool-contract, not cases here.
import assert from 'node:assert/strict'
import type { TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type { ResidentReferencesPage } from '@omne-harness/tool-contract'
import {
  sameShape,
  type ToolBindingKey,
  type ToolShape,
} from '@omne-harness/tool-contract/provider'
import type { ToolResidencyReader, ToolResidencyReference } from './cordis.ts'

export interface ResidentKeyRoundTripFixture {
  /** Records through the write path that a session of `tenant` adopted `key` with first shape `shape`. */
  write(input: Readonly<{ tenant: TenantId; key: ToolBindingKey; shape: ToolShape }>): Promise<void>
  readonly reader: ToolResidencyReader
  /** Optional: records a raw stored shape, for the negative case. */
  writeRaw?(
    input: Readonly<{
      tenant: TenantId
      key: ToolBindingKey
      shape: ResidentReferencesPage['sessions'][number]['shape']
    }>,
  ): Promise<void>
}

/** What the entry passes in from tool-contract/testing: minted test identities and not-applicable. */
export type ResidentKeyCaseDependencies = Readonly<{
  tenant(organization: string, account: string): TenantId
  workspace(text: string): WorkspaceId
  missing(handle: string): never
}>

/** One case, in the shape of `ConformanceCase` of tool-contract/testing. */
export type ResidentKeyCase = Readonly<{
  name: string
  clause: string
  run(fixture: ResidentKeyRoundTripFixture): Promise<void>
}>

const WORKSPACE = 'wsp_c0nf0rmance000000000000000'

function key(layer: ToolBindingKey['layer'], name: string, revision = '1'): ToolBindingKey {
  return {
    layer,
    asset: {
      name,
      adoption: { owner: 'acme', name, revision, digest: `sha256:${name}-${revision}` },
    },
  }
}

function shape(name: string): ToolShape {
  return { name, kind: 'function', parameters: { kind: 'executor-owned' } }
}

/** Reads every page; fails the case when a page is unavailable. */
async function readAll(
  reader: ToolResidencyReader,
  at: ToolBindingKey,
): Promise<readonly ToolResidencyReference[]> {
  const items: ToolResidencyReference[] = []
  let after: string | null = null
  do {
    const page = await reader.referencing({ scope: 'system', key: at, after })
    if ('failure' in page) assert.fail(`referencing: ${page.failure.diagnostic}`)
    items.push(...page.ok.items)
    after = page.ok.next
  } while (after !== null)
  return items
}

const sameTenant = (left: TenantId, right: TenantId) =>
  left.organization.text === right.organization.text && left.account.text === right.account.text

/** The suite. A fresh fixture per case: each case writes its own keys. */
export function residentKeyCases(deps: ResidentKeyCaseDependencies): readonly ResidentKeyCase[] {
  const tenantA = () =>
    deps.tenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
  const tenantB = () =>
    deps.tenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')
  const testingWorkspace = deps.workspace
  return [
    {
      name: 'each source layer reads back exactly the one written holder with its tenant and shape',
      clause: 'G7',
      async run({ write, reader }) {
        const tenant = tenantA()
        const layers: readonly ToolBindingKey['layer'][] = [
          { kind: 'official' },
          { kind: 'organization', organization: tenant.organization },
          { kind: 'tenant', tenant },
          { kind: 'workspace', workspace: testingWorkspace(WORKSPACE) },
        ]
        for (const [index, layer] of layers.entries()) {
          const at = key(layer, `layer_tool_${index}`)
          await write({ tenant, key: at, shape: shape(`layer_tool_${index}`) })
          const items = await readAll(reader, at)
          assert.equal(items.length, 1, `${layer.kind}: exactly one holder`)
          const [item] = items
          assert.ok(item !== undefined && sameTenant(item.tenant, tenant), `${layer.kind}: tenant`)
          assert.ok(sameShape(item.shape, shape(`layer_tool_${index}`)), `${layer.kind}: shape`)
        }
      },
    },
    {
      name: 'a commands shape written out of order reads back as the same shape',
      clause: 'G7',
      async run({ write, reader }) {
        const at = key({ kind: 'official' }, 'git')
        const written: ToolShape = {
          name: 'git',
          kind: 'commands',
          commands: [
            { name: 'status', parameters: { kind: 'executor-owned' } },
            {
              name: 'commit',
              parameters: {
                kind: 'declared',
                schema: '{"type":"object"}',
                vocabulary: { owner: 'json-schema', name: 'draft-2020-12', digest: 'd' },
              },
            },
          ],
        }
        await write({ tenant: tenantA(), key: at, shape: written })
        const items = await readAll(reader, at)
        assert.equal(items.length, 1)
        assert.ok(items[0] !== undefined && sameShape(items[0].shape, written))
      },
    },
    {
      name: 'two keys that differ only in the adoption revision each read back only their own holder',
      clause: 'G7',
      async run({ write, reader }) {
        const first = key({ kind: 'official' }, 'versioned', '1')
        const second = key({ kind: 'official' }, 'versioned', '2')
        await write({ tenant: tenantA(), key: first, shape: shape('versioned_one') })
        await write({ tenant: tenantA(), key: second, shape: shape('versioned_two') })
        const one = await readAll(reader, first)
        const two = await readAll(reader, second)
        assert.equal(one.length, 1)
        assert.equal(two.length, 1)
        assert.ok(one[0] !== undefined && sameShape(one[0].shape, shape('versioned_one')))
        assert.ok(two[0] !== undefined && sameShape(two[0].shape, shape('versioned_two')))
      },
    },
    {
      name: 'one key held in two tenants reads back two holders, each with its own tenant',
      clause: 'G7',
      async run({ write, reader }) {
        const at = key({ kind: 'official' }, 'shared')
        await write({ tenant: tenantA(), key: at, shape: shape('shared') })
        await write({ tenant: tenantB(), key: at, shape: shape('shared') })
        const items = await readAll(reader, at)
        assert.equal(items.length, 2)
        assert.equal(items.filter(item => sameTenant(item.tenant, tenantA())).length, 1)
        assert.equal(items.filter(item => sameTenant(item.tenant, tenantB())).length, 1)
      },
    },
    {
      name: 'a key whose workspace is not minted is unavailable, not an empty page',
      clause: 'G7',
      async run({ write, reader }) {
        const minted = key({ kind: 'workspace', workspace: testingWorkspace(WORKSPACE) }, 'copied')
        await write({ tenant: tenantA(), key: minted, shape: shape('copied') })
        const copied = key(
          { kind: 'workspace', workspace: structuredClone(testingWorkspace(WORKSPACE)) },
          'copied',
        )
        const page = await reader.referencing({ scope: 'system', key: copied, after: null })
        assert.ok('failure' in page, 'an unencodable key must not read as no holders')
        assert.equal(page.failure.kind, 'unavailable')
      },
    },
    {
      name: 'a stored shape that does not read back makes the read unavailable, not a shorter page',
      clause: 'G7',
      async run({ write, writeRaw, reader }) {
        if (writeRaw === undefined) deps.missing('writeRaw')
        const at = key({ kind: 'official' }, 'damaged')
        await write({ tenant: tenantA(), key: at, shape: shape('damaged') })
        await writeRaw({
          tenant: tenantB(),
          key: at,
          shape: {
            kind: 'object',
            entries: [{ key: 'name', value: { kind: 'string', value: 'x' } }],
          },
        })
        let after: string | null = null
        let failed = false
        do {
          const page = await reader.referencing({ scope: 'system', key: at, after })
          if ('failure' in page) {
            assert.equal(page.failure.kind, 'unavailable')
            failed = true
            break
          }
          after = page.ok.next
        } while (after !== null)
        assert.ok(failed, 'a bad stored shape must not be dropped from the holders')
      },
    },
  ]
}
