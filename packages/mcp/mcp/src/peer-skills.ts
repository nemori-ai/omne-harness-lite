import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  declaresSkills,
  judgeSkills,
  readSkillEntry,
  type CatalogKey,
  type CatalogRevision,
  type EndpointRef,
  type McpClock,
  type McpConfig,
  type McpPorts,
  type McpSkill,
  type ReadFailure,
  type SkillCatalogRecord,
  type SkillCatalogView,
  type SkillFileEntry,
  type SkillFileFailure,
  type SkillFileRequest,
  type SkillFileText,
} from '@omne-harness/mcp-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { McpTransport, TransportFailure } from '@omne-harness/mcp-contract/provider'
import type { ChangeFeed } from './internal/changes.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import { ask, within } from './internal/port.ts'
import { readAccountOf } from './internal/settings.ts'
import {
  checkedFile,
  createSkillFileCache,
  sliceText,
  type Checked,
} from './internal/skill-files.ts'
import { ensureOptionsOf, type ConnectionTable, type Ensured } from './internal/table.ts'

export type PeerSkillsDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  clock: McpClock
  changes: ChangeFeed
}>

export type PeerSkillsCore<P> = Readonly<{
  publish(ensured: Ensured, access: Access<P>): Promise<void>
  view(access: Access<P>, ref: EndpointRef): Promise<Outcome<SkillCatalogView, ReadFailure>>
  read(
    access: Access<P>,
    ref: EndpointRef,
    request: SkillFileRequest,
  ): Promise<Outcome<SkillFileText, SkillFileFailure>>
}>

const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }
const UNKNOWN = { kind: 'unknown' } as const
const NOT_FOUND = { kind: 'skill-not-found' } as const
const CHANGED = { kind: 'changed' } as const

/** One request of the connection within a bound: its answer, or none once the line is gone or the bound has passed. */
async function onWire<P, T>(
  table: ConnectionTable<P>,
  ensured: Ensured,
  bound: AbortSignal,
  call: (transport: McpTransport) => Promise<Outcome<T, TransportFailure>> | undefined,
): Promise<Outcome<T, TransportFailure> | undefined> {
  const wire = ensured.wire()
  const pending = 'failure' in wire ? undefined : call(wire.ok)
  if (pending === undefined) return undefined
  const asked = await within(
    ask(() => pending, fail(ABANDONED)),
    bound,
    table.runtime.scope,
  )
  return asked.kind === 'expired' ? undefined : asked.value
}

async function listedOn<P>(
  table: ConnectionTable<P>,
  ensured: Ensured,
  maxPages: number,
): Promise<readonly JsonValue[] | undefined> {
  const bound = table.runtime.startBound(ensured.bound, 'listing')
  const entries: JsonValue[] = []
  let cursor: string | undefined
  for (let count = 0; count < maxPages; count += 1) {
    const page = await onWire(table, ensured, bound, wire => wire.listSkills?.(cursor))
    if (page === undefined || 'failure' in page) return undefined
    entries.push(...page.ok.skills)
    if (page.ok.nextCursor === undefined) return entries
    cursor = page.ok.nextCursor
  }
  return undefined
}

/** The record once the peer's entry for this skill is asked again: replaced, taken out when the peer answers an error, or none when it does not answer. */
async function relistedOn<P>(
  table: ConnectionTable<P>,
  ensured: Ensured,
  record: SkillCatalogRecord,
  skill: McpSkill,
): Promise<Omit<SkillCatalogRecord, 'revision'> | undefined> {
  const bound = table.runtime.startBound(ensured.bound, 'listing')
  const answer = await onWire(table, ensured, bound, wire => wire.getSkill?.(skill.uri))
  if (answer === undefined || ('failure' in answer && answer.failure.kind !== 'error-answer'))
    return undefined
  const now = 'ok' in answer ? readSkillEntry(answer.ok) : undefined
  const others = record.skills.filter(one => one.name !== skill.name)
  const same = now !== undefined && 'ok' in now && now.ok.name === skill.name
  const refused =
    now !== undefined && 'refused' in now ? [...record.refused, now.refused] : record.refused
  const { revision: _, ...rest } = record
  return { ...rest, skills: same ? [...others, now.ok] : others, refused }
}

/** One listed file fetched from the peer and held to its listing; unknown when the peer gives no content. */
async function fetchedOn<P>(
  table: ConnectionTable<P>,
  ensured: Ensured,
  file: SkillFileEntry,
  skill: McpSkill,
): Promise<Checked | 'unknown'> {
  const bound = table.runtime.startBound(ensured.bound, 'listing')
  const content = await onWire(table, ensured, bound, wire => wire.readResource?.(file.uri))
  if (content === undefined || 'failure' in content) return 'unknown'
  return checkedFile(file, skill, content.ok)
}

/** The skills of a peer: listed whole with each published catalog of actions, each file read only where the listing names it and checked before it is given. */
export function createPeerSkills<P, S>(deps: PeerSkillsDependencies<P, S>): PeerSkillsCore<P> {
  const { ports, config, table, clock, changes } = deps
  const gate: UseGate<P, S> = { ports, table }
  const cache = createSkillFileCache()

  async function write(
    key: CatalogKey,
    basedOn: CatalogRevision | 'absent',
    record: Omit<SkillCatalogRecord, 'revision'>,
    access: Access<P>,
  ): Promise<void> {
    const store = ports.skillStore
    if (store === undefined) return
    const revision = ((basedOn === 'absent' ? 0 : basedOn) + 1) as CatalogRevision
    const written = await ask(
      () => store.write(key, { ...record, revision }, basedOn),
      fail('unavailable'),
    )
    if ('ok' in written) changes.changed(access.tenant)
  }

  async function publish(ensured: Ensured, access: Access<P>): Promise<void> {
    const store = ports.skillStore
    if (store === undefined) return
    const stored = await ask(() => store.read(ensured.catalogKey), fail('unavailable'))
    if ('failure' in stored) return
    const declared = declaresSkills(ensured.peer)
    if (!declared && stored.ok !== 'absent' && !stored.ok.declared) return
    const entries = declared ? await listedOn(table, ensured, config.maxListingPages) : []
    if (entries === undefined) return
    const { protocolVersion, capabilities } = ensured.peer
    await write(
      ensured.catalogKey,
      stored.ok === 'absent' ? 'absent' : stored.ok.revision,
      {
        basis: { generation: ensured.generation, protocolVersion, capabilities },
        freshness: { acquiredAt: clock.now().toISOString(), changedNotified: false },
        declared,
        ...judgeSkills(entries),
      },
      access,
    )
  }

  async function storedFor(access: Access<P>, ref: EndpointRef) {
    const admitted = await admitForUse(gate, access, ref)
    if ('failure' in admitted) return admitted
    const account = readAccountOf(admitted.ok)
    if ('failure' in account) return account
    const store = ports.skillStore
    const key = catalogKeyOf(access.tenant, admitted.ok, account.ok)
    if (store === undefined)
      return succeed({ admitted: admitted.ok, key, record: 'absent' as const })
    const read = await ask(() => store.read(key), fail('unavailable'))
    if ('failure' in read) return fail(UNKNOWN)
    return succeed({ admitted: admitted.ok, key, record: read.ok })
  }

  async function view(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<SkillCatalogView, ReadFailure>> {
    const found = await storedFor(access, ref)
    if ('failure' in found) return found
    const { record } = found.ok
    if (record === 'absent') return succeed({ kind: 'not-acquired' })
    const { revision, freshness, declared, skills, refused } = record
    return succeed(
      declared
        ? { kind: 'acquired', revision, freshness, skills, refused }
        : { kind: 'not-declared', freshness },
    )
  }

  async function read(
    access: Access<P>,
    ref: EndpointRef,
    request: SkillFileRequest,
  ): Promise<Outcome<SkillFileText, SkillFileFailure>> {
    const found = await storedFor(access, ref)
    if ('failure' in found) return found
    const { admitted, key, record } = found.ok
    if (record === 'absent' || !record.declared) return fail(NOT_FOUND)
    const skill = record.skills.find(one => one.name === request.skill)
    if (skill === undefined) return fail(NOT_FOUND)
    const file = skill.files.find(one => one.path === request.path || one.uri === request.path)
    const kept = file === undefined ? undefined : cache.get(file)
    if (kept !== undefined) return sliceText(kept, request.range)
    const ensured = await table.ensure(admitted, access, ensureOptionsOf(request.connectBound))
    if ('failure' in ensured) {
      const { reason } = ensured.failure
      return fail(reason.kind === 'effect-unknown' ? UNKNOWN : reason)
    }
    const changed = async () => {
      const relisted = await relistedOn(table, ensured.ok, record, skill)
      if (relisted !== undefined) await write(key, record.revision, relisted, access)
      return fail(CHANGED)
    }
    // A file the listing does not name is one the peer gives besides it: not fetched, and the entry is asked again.
    if (file === undefined) return changed()
    const checked = await fetchedOn(table, ensured.ok, file, skill)
    if (checked === 'unknown') return fail(UNKNOWN)
    if (checked.kind === 'changed') return changed()
    if (checked.kind === 'not-text') return fail({ kind: 'not-text' })
    cache.put(file, checked.bytes)
    return sliceText(checked.bytes, request.range)
  }

  return { publish, view, read }
}
