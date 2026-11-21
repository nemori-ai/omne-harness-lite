import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { capabilityId } from '@omne-harness/assets'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { access as accessOf, type Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  isSkillName,
  type CatalogEntry,
  type ReadFailure,
  type ReadResult,
  type SkillAccess,
  type SkillCatalog,
} from '@omne-harness/skill-contract'
import { skillAccessKey, skillCatalogKey } from '@omne-harness/skill-cordis-contract/cordis'
import { decodeCursor, encodeCursor } from '@omne-harness/text-search'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import {
  attachSkillsAccess,
  type SkillsAccess,
  type SkillsEntry,
  type SkillsFailure,
  type SkillsPage,
  type SkillsText,
} from '@omne-harness/tool-definitions'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

/** One Skill page holds at most this many bytes; the Skill reader answers at most 64 KiB. */
const PAGE_BYTES = 65_536

export type SkillsBindingPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
  catalog(): SkillCatalog<unknown, unknown> | undefined
  access(): SkillAccess<unknown, unknown> | undefined
}>

const unavailable = (reason: string) => fail({ kind: 'unavailable', reason } as const)
const NOT_FOUND = Object.freeze(fail({ kind: 'not-found' } as const))
const INVALID_CURSOR = Object.freeze(fail({ kind: 'invalid-cursor' } as const))

function readFailure(failure: ReadFailure): SkillsFailure {
  switch (failure.kind) {
    case 'not-available-to-you':
      return { kind: 'not-found' }
    case 'unavailable-stand-in':
      return { kind: 'disabled', reason: failure.standIn.reason }
    case 'bad-path':
      return { kind: 'invalid', field: 'path', reason: 'not a path inside the Skill' }
    case 'outside-package':
      return { kind: 'invalid', field: 'path', reason: 'resolves outside the Skill' }
    case 'resource-missing':
      return { kind: 'file-not-found' }
    case 'adopted-material-changed':
    case 'version-changed':
      return { kind: 'changed' }
    case 'source-unavailable':
    case 'unknown':
    case 'basis-unavailable':
    case 'unsupported':
      return { kind: 'unavailable', reason: 'the Skill store cannot be read now' }
    case 'aborted':
      throw new DOMException('The Skills call was cancelled', 'AbortError')
  }
}

function entryOf(entry: CatalogEntry): SkillsEntry {
  const description = entry.description === undefined ? {} : { description: entry.description }
  return entry.kind === 'adopted'
    ? { kind: 'available', name: entry.name, ...description }
    : { kind: 'disabled', name: entry.name, ...description, reason: entry.reason }
}

function bindingOf(query: string, entries: readonly CatalogEntry[]): string {
  const text = JSON.stringify([
    query.normalize('NFKC').trim(),
    entries.map(entry => [entry.kind, entry.capability.category, entry.capability.name]),
  ])
  return createHash('sha256').update(text).digest('hex')
}

type Cursor = NonNullable<ReturnType<typeof decodeCursor>>

function pageOf(
  query: string,
  cursor: Cursor | null,
  limit: number,
  found: readonly CatalogEntry[],
): Outcome<SkillsPage, SkillsFailure> {
  const binding = bindingOf(query, found)
  if (cursor !== null && (cursor.binding !== binding || cursor.offset >= found.length))
    return INVALID_CURSOR
  const offset = cursor?.offset ?? 0
  const end = offset + limit
  return succeed({
    entries: found.slice(offset, end).map(entryOf),
    next: end < found.length ? encodeCursor({ binding, offset: end }) : null,
  })
}

function textOf(read: ReadResult): Outcome<SkillsText, SkillsFailure> {
  if (read.content.kind !== 'text') return fail({ kind: 'not-text' })
  return succeed({
    text: read.content.text,
    start: read.range.start,
    end: read.range.start + read.range.length,
    total: read.total,
    ...(read.directory === undefined ? {} : { directory: read.directory }),
  })
}

/** A call's scope: the key of the turn it is made in, once its session has stood at a workspace. */
export function turnScopeOf(snapshot: WorkSnapshot): Readonly<{ key: string }> | null {
  const stood =
    snapshot.creation.workspace !== null ||
    (snapshot.changes ?? []).some(change => change.kind === 'workspace' && change.value !== null)
  return stood && snapshot.run.kind === 'active' ? { key: snapshot.run.run } : null
}

type Caller = Readonly<{ access: Access<unknown>; scope: Readonly<{ key: string }> | null }>

export function createBoundSkills(parent: Parent, ports: SkillsBindingPorts): SkillsAccess {
  async function who(): Promise<Outcome<Caller, SkillsFailure>> {
    const verified = await verifySessionWork(ports.verifier(), parent.principal, parent.tenant)
    if (verified.kind === 'denied') return NOT_FOUND
    if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
    const session = verified.session as SessionId
    const { principal, tenant } = parent
    let read: Awaited<ReturnType<SkillsBindingPorts['readWork']>>
    try {
      read = await ports.readWork({ principal, tenant, session })
    } catch {
      read = undefined
    }
    if (read === undefined || 'failure' in read)
      return unavailable('the session cannot be read now')
    const access = accessOf(verified.principal, parent.tenant)
    return succeed({ access, scope: turnScopeOf(read.ok) })
  }
  async function skillAccess(skill: string) {
    if (!isSkillName(skill))
      return fail({ kind: 'invalid', field: 'skill', reason: 'not a Skill name' } as const)
    const id = capabilityId('skill', skill)
    if (!id.ok)
      return fail({ kind: 'invalid', field: 'skill', reason: 'not a Skill name' } as const)
    const caller = await who()
    if (!('ok' in caller)) return caller
    const service = ports.access()
    if (service === undefined) return unavailable('the Skill reader is not available')
    return succeed({ ...caller.ok, capability: id.id, service })
  }
  const range = (offset: number, maxBytes: number) => ({
    start: offset,
    length: Math.max(1, Math.min(maxBytes, PAGE_BYTES)),
  })
  return {
    async search(input) {
      const cursor = input.after === null ? null : decodeCursor(input.after)
      if (input.after !== null && cursor === null) return INVALID_CURSOR
      const caller = await who()
      if (!('ok' in caller)) return caller
      const catalog = ports.catalog()
      if (catalog === undefined) return unavailable('the Skill catalog is not available')
      const { access, scope } = caller.ok
      const found = await catalog.search(access, scope, { text: input.query })
      if (!('ok' in found)) return unavailable('the Skill store cannot be read now')
      return pageOf(input.query, cursor, input.limit, found.ok)
    },
    async read(input, signal) {
      const target = await skillAccess(input.skill)
      if (!('ok' in target)) return target
      const { access, scope, capability, service } = target.ok
      const read = await service.read(
        access,
        scope,
        { capability, part: { kind: 'body' } },
        { range: range(input.offset, input.maxBytes), signal },
      )
      return 'ok' in read ? textOf(read.ok) : fail(readFailure(read.failure))
    },
    async list(input, signal) {
      const target = await skillAccess(input.skill)
      if (!('ok' in target)) return target
      const { access, scope, capability, service } = target.ok
      const listed = await service.list(access, scope, capability, { signal })
      if (!('ok' in listed)) return fail(readFailure(listed.failure))
      return succeed({
        files: listed.ok.resources.map(entry => ({
          path: entry.path,
          size: entry.size,
          ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
        })),
        ...(listed.ok.directory === undefined ? {} : { directory: listed.ok.directory }),
      })
    },
    async readFile(input, signal) {
      const target = await skillAccess(input.skill)
      if (!('ok' in target)) return target
      const { access, scope, capability, service } = target.ok
      const read = await service.read(
        access,
        scope,
        { capability, part: { kind: 'resource', path: input.path } },
        { range: range(input.offset, input.maxBytes), signal },
      )
      return 'ok' in read ? textOf(read.ok) : fail(readFailure(read.failure))
    },
  }
}

export function bindReleaseSkills(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  return attachSkillsAccess(
    scope,
    createBoundSkills(parent, {
      verifier: () => toolRuntimeHolder(ctx).verifier(),
      readWork: sessionWorkReaderOf(ctx),
      catalog: () => ctx.get(skillCatalogKey),
      access: () => ctx.get(skillAccessKey),
    }),
  )
}
