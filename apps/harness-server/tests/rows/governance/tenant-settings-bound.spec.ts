// @module-tag slow
// 慢：组织层来源跑在真实 SQLite 的 Worker 上。
// 租户层设置的权限上界（#1265 C4、C10）：读写面经本行的权限端口问权限，材料是发行清单里 Shell 的权限声明、
// 当时读到的组织层与目录里的租户层。组织层现在没有公开入口能写，这里用设置本机的来源世界写进它自己的存储
// （`settings-local` 的 `openSourceServiceWorld`），本行的端口按组织来源的地址读它。目录与写入用替身：写入要守的
// 条件在提交事务里核，那一段由发行树上的用例证。
import { rmSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { organizationCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createTenantSettings,
  type SettingDefinitions,
  type SettingsTargetView,
  type TenantSettingsWriteResult,
} from '@omne-harness/settings'
import { canonicalDigest } from '@omne-harness/tool'
import { openSourceServiceWorld } from '../../../../../packages/assets/settings-local/tests/source-service-world.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { organizationSettingsSource } from '../../../src/rows/governance/organization-settings.ts'
import { mappedDefinition } from '../../../src/rows/governance/session-permission-settings.ts'
import { createTenantSettingsPermissions } from '../../../src/rows/governance/tenant-settings-permissions.ts'
import { toolAssetTarget } from '../../../src/rows/governance/tool-installation-assets.ts'

const closed: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of closed.splice(0).reverse()) await close()
})

function tenantOf(): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'1'.repeat(26)}`, account: `acc_${'2'.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('tenant fixture')
  return parsed.value
}

type Rule = Readonly<{ pick: string | null; allowedSet: readonly string[] | null }>

/** The face over the real permission port; the organization layer is `organization` when given. */
async function world(organization: Rule | null, own: Rule | null = null) {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const entry = release.manifest.entries.find(value => value.asset.name === 'Shell')
  const permission = entry?.governance.declaration.permissions.find(
    value => value.settings !== null,
  )
  if (entry === undefined || permission === undefined) throw new Error('Shell permission absent')
  const settings: SettingDefinitions | undefined = mappedDefinition({
    declaration: entry.governance.declaration,
    permission,
  })
  if (settings === undefined) throw new Error('Shell Settings definition absent')
  const tenant = tenantOf()
  const tenantRef = tenantCodec.encode(tenant)
  const organizationId = organizationCodec.encode(tenant.organization)
  if (!tenantRef.ok || !organizationId.ok) throw new Error('tenant encoding')
  const route = organizationSettingsSource({
    organizationId: organizationId.value,
    definition: settings,
  })
  const source = await openSourceServiceWorld(
    { seal: async () => ({ kind: 'unavailable' }) },
    undefined,
    route,
    settings,
  )
  closed.push(async () => {
    await source.close()
    rmSync(source.root, { recursive: true, force: true })
  })
  if (organization !== null)
    expect(
      await source.set({
        ...organization,
        allowedSet: organization.allowedSet === null ? null : [...organization.allowedSet],
      }),
    ).toMatchObject({
      kind: 'committed',
    })
  const itemId = permission.settings!.itemId
  let state: SettingsTargetView['state'] = {
    revision: own === null ? 0 : 1,
    sources: [
      {
        id: 'tenant',
        values:
          own === null
            ? []
            : [
                {
                  itemId,
                  value: {
                    kind: 'value',
                    value: {
                      pick: own.pick,
                      allowedSet: own.allowedSet === null ? null : [...own.allowedSet],
                    },
                  },
                  locked: false,
                },
              ],
      },
    ],
  }
  const view = (): SettingsTargetView => ({
    target: toolAssetTarget(entry, tenantRef.value),
    enabled: true,
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: 'harness.tool-governance',
        scope: { kind: 'tenant', subjectRef: tenantRef.value },
        authorityRevision: '1',
      },
    ],
    definitionRef: {
      providerId: settings.providerId,
      definitionId: settings.definitionId,
      version: settings.version,
      digest: canonicalDigest(settings).replace(/^sha256:/, ''),
    },
    definition: settings,
    state,
    grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
  })
  const writes: string[] = []
  const face = createTenantSettings<string>({
    deploymentRef: 'deployment',
    principals: { admit: async () => 'allowed' },
    catalog: {
      read: async () => ({
        scopeKey: tenantRef.value,
        revision: String(state.revision),
        views: [view()],
        completeness: 'complete',
        unavailableProviders: [],
      }),
      assetOf: () => ({ category: 'tool', name: 'Shell' }),
    },
    permissions: createTenantSettingsPermissions({
      scope: { deploymentId: 'deployment', logicalServiceId: 'service' },
      storage: source.storage,
      release: () => release,
    }),
    writer: {
      async write({ command, beforeWrite }): Promise<TenantSettingsWriteResult> {
        const refused = await beforeWrite()
        if (refused !== null) return { kind: 'refused', outcome: refused }
        writes.push(JSON.stringify(command.action))
        state = { ...state, revision: state.revision + 1 }
        return {
          kind: 'committed',
          operation: { target: command.target, operationId: command.operationId },
          revision: state.revision,
          changed: true,
        }
      },
    },
  })
  const item = { principal: 'login', tenant, asset: { name: 'Shell' }, item: itemId }
  return { face, item, writes }
}

it('C4 an organization allowed set without auto: a tenant pick of auto is out of bound and not written, a pick of deny is written', async () => {
  const w = await world({ pick: null, allowedSet: ['deny', 'ask'] })
  const auto = await w.face.set({
    ...w.item,
    operation: 'pick-auto',
    expectedRevision: '0',
    value: { kind: 'permission', pick: 'auto' },
  })
  expect(auto).toEqual({ kind: 'not-writable', reason: 'out-of-bound' })
  expect(w.writes).toEqual([])
  const deny = await w.face.set({
    ...w.item,
    operation: 'pick-deny',
    expectedRevision: '0',
    value: { kind: 'permission', pick: 'deny' },
  })
  expect(deny).toEqual({ kind: 'written', revision: '1' })
  expect(w.writes).toEqual([
    JSON.stringify({ kind: 'set', value: { pick: 'deny', allowedSet: null } }),
  ])
})

it('C4 an organization deny is an active prohibition: a tenant pick that permits the operation is out of bound', async () => {
  const w = await world({ pick: 'deny', allowedSet: null })
  expect(
    await w.face.set({
      ...w.item,
      operation: 'pick-ask',
      expectedRevision: '0',
      value: { kind: 'permission', pick: 'ask' },
    }),
  ).toEqual({ kind: 'not-writable', reason: 'out-of-bound' })
  expect(w.writes).toEqual([])
})

it('C10 an organization locked to deny and ask with a tenant pick of auto shows the effective value ask and that bound', async () => {
  const w = await world(
    { pick: null, allowedSet: ['deny', 'ask'] },
    { pick: 'auto', allowedSet: null },
  )
  const described = await w.face.describe(w.item)
  expect(described).toMatchObject({
    kind: 'described',
    item: {
      kind: 'permission',
      own: 'auto',
      // The first pick outwards inside the bound is the default pick `ask`.
      effective: { kind: 'value', value: 'ask', source: 'default' },
      bound: ['deny', 'ask'],
      editable: { kind: 'yes' },
      default: 'ask',
    },
  })
})

it('C10 an organization deny shows the item prohibited by the organization and not editable', async () => {
  const w = await world({ pick: 'deny', allowedSet: null }, { pick: 'auto', allowedSet: null })
  expect(await w.face.describe(w.item)).toMatchObject({
    kind: 'described',
    item: {
      kind: 'permission',
      own: 'auto',
      effective: { kind: 'prohibited', by: 'organization' },
      bound: null,
      editable: { kind: 'no', reason: 'prohibited-above' },
    },
  })
})

it('C10 without any organization value the effective value is the tenant pick from the tenant layer', async () => {
  const w = await world(null, { pick: 'auto', allowedSet: null })
  expect(await w.face.describe(w.item)).toMatchObject({
    kind: 'described',
    item: { effective: { kind: 'value', value: 'auto', source: 'tenant' }, bound: null },
  })
})
