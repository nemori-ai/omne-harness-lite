import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals, type Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  LocalToolCatalogView,
  LocalToolCatalogViewSource,
} from '@omne-harness/tool-host-local'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import { releaseDefinitionOf, releaseOf, type ToolRelease } from '../../entry/tool-release.ts'
import { heldDefinitionOf } from '../tool-host/held-definitions.ts'
import { currentHeldTool, heldToolNames, type CurrentHeldTool } from '../tool-host/held-current.ts'
import { turnOfAccess, type Turn } from '../tenant-assets/turn.ts'
import {
  recordedHeldTool,
  type RecordedHeldTool,
  type RecordedResident,
} from '../tool-host/held-recorded.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

type CatalogWork = Pick<
  WorkSnapshot,
  'session' | 'tenant' | 'lifecycle' | 'definition' | 'residents' | 'frozen'
>

export type ReleaseCatalogViewPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<CatalogWork, SessionFailure>> | undefined
  release(): ToolRelease
  knownDefinition?(name: string): ToolDefinition | undefined
  /** The tools a tenant holds: their names, each one loaded, and the definition it was loaded with. */
  held?: Readonly<{
    /** The turn the asker works in: with it the tools of its workspace are read too. Absent: no turn is looked for. */
    turn?(access: Access<unknown>): Promise<Turn | null | undefined>
    names(access: Access<unknown>, turn: Turn | null): Promise<readonly string[] | undefined>
    current(access: Access<unknown>, name: string, turn: Turn | null): Promise<CurrentHeldTool>
    definition(key: ToolBindingKey): ToolDefinition | undefined
    recorded?(
      access: Access<unknown>,
      resident: RecordedResident,
    ): Promise<RecordedHeldTool | undefined>
  }>
}>

const unavailable = (diagnostic: string) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'catalog-view',
    diagnostic,
  })
const denied = () => fail({ kind: 'denied' as const, action: 'catalog-view' })

type Entry = LocalToolCatalogView['entries'][number]

/** The tools the tenant holds in force, each loaded; undefined when what it holds cannot be read. */
async function heldEntries(
  held: ReleaseCatalogViewPorts['held'],
  access: Access<unknown>,
  official: ReadonlySet<string>,
  work: CatalogWork,
): Promise<readonly Entry[] | undefined> {
  if (held === undefined) return []
  const turn = held.turn === undefined ? null : await held.turn(access)
  if (turn === undefined) return undefined
  const names = await held.names(access, turn)
  if (names === undefined) return undefined
  const residents = new Set(work.residents.map(item => item.capability))
  const entries = new Map<string, Entry>()
  for (const name of names) {
    if (official.has(name)) continue
    const current = await held.current(access, name, turn)
    if (current.kind === 'unavailable') return undefined
    if (current.kind !== 'held') continue
    const key = { layer: current.authority.layer, asset: current.authority.asset }
    const knownDefinition = held.definition(key)
    entries.set(name, {
      key,
      resident: residents.has(name),
      ...(knownDefinition === undefined ? {} : { knownDefinition }),
    })
  }
  // A resident whose tool is not in force now keeps the version the session took: the catalog answers for it in its shape.
  for (const resident of work.residents) {
    if (resident.definition !== undefined) continue
    if (official.has(resident.capability) || entries.has(resident.capability)) continue
    const recorded = await held.recorded?.(access, resident)
    if (recorded !== undefined) entries.set(resident.capability, { ...recorded, resident: true })
  }
  return [...entries.values()]
}

function sourcedEntries(access: Access<unknown>, work: CatalogWork): readonly Entry[] {
  return work.residents.flatMap(resident => {
    if (resident.definition?.kind !== 'string') return []
    const definition = JSON.parse(resident.definition.value) as ToolDefinition
    const asset = { name: definition.name, adoption: definition.adoption }
    return [
      {
        key: { layer: { kind: 'tenant' as const, tenant: access.tenant }, asset },
        resident: true,
        knownDefinition: definition,
        sourced: true as const,
      },
    ]
  })
}

export function createReleaseCatalogView(
  ports: ReleaseCatalogViewPorts,
): LocalToolCatalogViewSource<unknown> {
  return {
    async read(access) {
      try {
        const verified = await verifySessionWork(ports.verifier(), access.principal, access.tenant)
        if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
        if (verified.kind === 'denied') return denied()
        const session = verified.session as SessionId
        const work = await ports.readWork({ ...access, session })
        if (work === undefined) return unavailable('Session absent')
        if ('failure' in work)
          return work.failure.kind === 'denied' ? denied() : unavailable('Session read failed')
        if (work.ok.session !== session || !tenantEquals(work.ok.tenant, access.tenant))
          return denied()
        if (
          work.ok.frozen !== null ||
          (work.ok.lifecycle !== 'active' && work.ok.lifecycle !== 'dormant')
        )
          return unavailable('Session cannot disclose its current tool view')
        const release = ports.release()
        if (release.kind !== 'trusted') return unavailable('release unavailable')
        const residents = new Set(work.ok.residents.map(item => item.capability))
        // Every tool of the release, and every tool this tenant holds in force: what is lawful now, not what the definition names.
        const entries: Entry[] = release.manifest.entries.map(entry => {
          const knownDefinition = ports.knownDefinition?.(entry.asset.name)
          return {
            key: { layer: { kind: 'official' as const }, asset: entry.asset },
            resident: residents.has(entry.asset.name),
            ...(knownDefinition === undefined ? {} : { knownDefinition }),
          }
        })
        const official = new Set(release.manifest.entries.map(entry => entry.asset.name))
        const held = await heldEntries(ports.held, access, official, work.ok)
        // Unread, a session whose residents are all of the release goes on with those; one that keeps another tool waits.
        if (
          held === undefined &&
          work.ok.residents.some(
            item => item.definition === undefined && !official.has(item.capability),
          )
        )
          return unavailable('what the tenant holds cannot be read')
        entries.push(...(held ?? []), ...sourcedEntries(access, work.ok))
        const identity = {
          tenant: access.tenant,
          session,
          actor: verified.principal.actor,
          work: verified.principal.work,
        }
        return succeed({
          scope: {
            owner: '@omne-harness/harness-server',
            record: `tool-catalog:${session}`,
            revision: '1',
            digest: canonicalDigest(identity),
          },
          revision: canonicalDigest({
            adopted: work.ok.definition.adopted,
            lifecycle: work.ok.lifecycle,
            entries: entries.map(entry => ({
              key: entry.key,
              resident: entry.resident,
              knownDefinition: entry.knownDefinition?.adoption ?? null,
            })),
          }),
          entries,
        })
      } catch {
        return unavailable('a catalog view source threw')
      }
    },
  }
}

export function releaseCatalogViewOf(ctx: Context): LocalToolCatalogViewSource<unknown> {
  return createReleaseCatalogView({
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    readWork: sessionWorkReaderOf(ctx),
    release: () => releaseOf(ctx),
    knownDefinition: name => releaseDefinitionOf(ctx, name),
    held: {
      turn: access => turnOfAccess(ctx, access),
      names: (access, turn) => heldToolNames(ctx, access.tenant, turn),
      current: (access, name, turn) => currentHeldTool(ctx, access, name, turn),
      definition: key => heldDefinitionOf(ctx, key),
      recorded: (access, resident) => recordedHeldTool(ctx, access, resident),
    },
  })
}
