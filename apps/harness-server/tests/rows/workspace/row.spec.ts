import { describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type TenantStandingReading } from '@omne-harness/identity'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { rowDeclarationOf } from '../../../src/row.ts'
import { productionStorageCatalog } from '../../../src/rows/storage/production-catalog.ts'
import { createWorkspaceAuthority } from '../../../src/rows/workspace/authority.ts'
import {
  workspaceCombination,
  workspaceConfig,
  workspaceRow,
} from '../../../src/rows/workspace/index.ts'

function tenantOf(digit: string): TenantId {
  const organization = organizationCodec.parse(`org_${digit.repeat(26)}`)
  const account = accountCodec.parse(`acc_${digit.repeat(26)}`)
  if (!organization.ok || !account.ok) throw new Error('fixture identity did not parse')
  return tenant(organization.value, account.value)
}

const ALICE = tenantOf('1')
const BOB = tenantOf('2')
const authority = inProcessPrincipalAuthority()
const issued = <T>(outcome: { ok: T } | { failure: unknown }): T => {
  if (!('ok' in outcome)) throw new Error('fixture principal was not issued')
  return outcome.ok
}
const system = issued(authority.issuer.issueSystem({ component: 'server-entry' }))
const acting = (for_: TenantId) =>
  issued(
    authority.issuer.issueActingForTenant({
      actor: system,
      tenant: for_,
      work: { owner: 'login', work: 'login-1' },
    }),
  )

describe('the workspace row', () => {
  it('declares the five services of the provider and needs only the storage before it starts', () => {
    expect(rowDeclarationOf(workspaceRow)).toMatchObject({
      row: 'workspace',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'composition' },
      manifest: {
        provides: [
          'workspaceGovernance',
          'workspaceInstances',
          'workspaceCatalog',
          'workspaceSources',
          'workspaceTypes',
        ],
        injects: ['storage'],
      },
    })
  })

  it('takes the name of the node and nothing else', () => {
    expect(workspaceConfig.parse({ node: 'local' })).toEqual({ node: 'local' })
    for (const config of [{}, { node: '' }, { node: 'local', more: 1 }])
      expect(workspaceConfig.safeParse(config).success).toBe(false)
  })

  it('registers its storage combination from the catalogue of the running code', async () => {
    const catalog = await productionStorageCatalog()
    const manifest = combinationManifest({ catalog, participants: ['workspace.persistence'] })
    if (manifest.kind !== 'manifest') throw new Error('the catalogue lacks the participant')
    const digest = manifestDigest(manifest.manifest)
    expect(await workspaceCombination()).toEqual({
      combinationVersion: `harness-workspace/${digest.slice(0, 16)}`,
      manifestDigest: digest,
    })
  })
})

describe("workspace's questions about a caller are answered by the identity domain", () => {
  const evidence = { record: 'standing/test', revision: '1' }
  const reading = (kind: TenantStandingReading['kind']): TenantStandingReading => {
    if (kind === 'unavailable') return { kind, diagnostic: 'down' }
    if (kind === 'not-member') return { kind, evidence }
    const role = { role: 'member', model: { model: 'm', revision: '1' } }
    return { kind, role, qualifications: [], evidence }
  }

  function ports(standing: TenantStandingReading['kind'] | 'absent', verifier = true) {
    const asked: TenantId[] = []
    return {
      asked,
      authority: createWorkspaceAuthority({
        verifier: () => (verifier ? authority.verifier : undefined),
        standing: () =>
          standing === 'absent'
            ? undefined
            : { read: async input => (asked.push(input.tenant), reading(standing)) },
      }),
    }
  }

  it.each(['member', 'not-member', 'unavailable'] as const)(
    'standing %s is passed on',
    async kind => {
      const p = ports(kind)
      expect(await p.authority.standing(access(acting(ALICE), ALICE))).toBe(kind)
      expect(p.asked).toEqual([ALICE])
    },
  )

  it('an absent standing source or verifier is unavailable, not a refusal', async () => {
    const caller = access(acting(ALICE), ALICE)
    expect(await ports('absent').authority.standing(caller)).toBe('unavailable')
    expect(await ports('absent').authority.admit(caller, 'workspace.register', 'local')).toBe(
      'unavailable',
    )
    expect(
      await ports('member', false).authority.admit(caller, 'workspace.register', 'local'),
    ).toBe('unavailable')
  })

  it('admits a member acting for its own tenant, for the node and for a workspace', async () => {
    const caller = access(acting(ALICE), ALICE)
    const p = ports('member')
    expect(await p.authority.admit(caller, 'workspace.register', 'local')).toBe('allowed')
    expect(await p.authority.admit(caller, 'workspace.attach', 'wsp_x')).toBe('allowed')
  })

  it.each([
    ['a principal nobody issued', () => access({ kind: 'acting-for-tenant' }, ALICE), 'member'],
    ['a principal of another tenant', () => access(acting(BOB), ALICE), 'member'],
    ['a system principal', () => access(system, ALICE), 'member'],
    ['a tenant that is no longer a member', () => access(acting(ALICE), ALICE), 'not-member'],
  ] as const)('denies %s', async (_name, caller, standing) => {
    expect(await ports(standing).authority.admit(caller(), 'workspace.attach', 'wsp_x')).toBe(
      'denied',
    )
  })
})
