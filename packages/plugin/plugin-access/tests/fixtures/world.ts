import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { readManifest } from '@omne-harness/plugin-protocol'
import { createPluginContribution } from '../../src/contribution.ts'
import { createPluginReports } from '../../src/reports.ts'
import type {
  FileAt,
  PluginSource,
  SourcePlugin,
  SourceRead,
  TargetTenantPrincipals,
} from '../../src/ports.ts'

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

export type FixtureLogin = Readonly<{ account: string; tenant: TenantId; tenantText: string }>

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = accountCodec.parse(`acc_${suffix}`)
  const organization = organizationCodec.parse(`org_${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity did not parse')
  const minted = tenant(organization.value, account.value)
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return { account: account.value.text, tenant: minted, tenantText: text.value }
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

/** A plugin as a source gives it: its manifest written as text, and files of the given sizes. */
export function offered(
  name: string,
  version: string,
  sides: Readonly<{ client?: true; server?: true }>,
  files: Readonly<Record<string, number>> = { 'main.js': 10 },
): SourcePlugin {
  const side = { members: [] }
  const manifestText = JSON.stringify({
    schema: 1,
    name,
    summary: `The ${name} plugin`,
    ...(sides.client && { client: side }),
    ...(sides.server && { server: side }),
  })
  const read = readManifest(manifestText)
  if (read.kind !== 'read') throw new Error(read.reason)
  return {
    version,
    manifest: read.manifest,
    manifestText,
    files: Object.entries(files).map(([path, bytes]) => ({ path, digest: `d-${path}`, bytes })),
  }
}

type Listed = Awaited<ReturnType<PluginSource['list']>>

/** A stand-in source and identity: each answers what the test set, and every call is recorded. */
export function createWorld(kept: Readonly<{ perTenant: number }> = { perTenant: 8 }) {
  let refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  let listed: Listed | (() => never) = { kind: 'read', offered: [] }
  let reading: SourceRead | (() => never) = { kind: 'unavailable' }
  const listeners = new Set<() => void>()
  const asked: { account: string; tenant: string }[] = []
  const lists: unknown[] = []
  const reads: { asker: unknown; at: FileAt }[] = []
  const subscribed: string[] = []
  const source: PluginSource = {
    async list(asker) {
      lists.push(asker)
      return typeof listed === 'function' ? listed() : listed
    },
    async read(asker, at) {
      reads.push({ asker, at })
      return typeof reading === 'function' ? reading() : reading
    },
    subscribe(tenant, listener) {
      subscribed.push(tenant)
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const principals: TargetTenantPrincipals = {
    async actingFor(login, target) {
      const account = (login as unknown as FixtureLogin).account
      asked.push({ account, tenant: target })
      if (refusal === 'throw') throw new Error('the identity face broke')
      if (refusal !== undefined) return { refused: refusal }
      return { ok: { account, tenant: target } as unknown as Principal }
    },
  }
  const reports = createPluginReports(kept)
  return {
    refuseTargets(next: typeof refusal): void {
      refusal = next
    },
    offer(next: Listed | (() => never)): void {
      listed = next
    },
    answerRead(next: SourceRead | (() => never)): void {
      reading = next
    },
    change(): void {
      for (const listener of listeners) listener()
    },
    listeners,
    asked,
    lists,
    reads,
    subscribed,
    reports,
    contribution: createPluginContribution({ principals, source, reports }),
  }
}
export type World = ReturnType<typeof createWorld>
