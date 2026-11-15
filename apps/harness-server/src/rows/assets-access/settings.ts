import type { TenantSettingsPort } from '@omne-harness/assets-access'
import type { SecretSettings, SecretView } from '../settings/ports.ts'

export type SettingsSources = Readonly<{
  secrets(): SecretSettings | undefined
  catalog(): TenantSettingsPort | undefined
}>

type Port = TenantSettingsPort
type ListInput = Parameters<Port['list']>[0]
type Listed = Extract<Awaited<ReturnType<Port['list']>>, { kind: 'listed' }>
type ListAnswer = Awaited<ReturnType<Port['list']>>
type WriteOutcome = Awaited<ReturnType<Port['set']>>
type ItemInput = Parameters<Port['describe']>[0]

const SECRET_REVISION = '0'
const LIST_LIMIT = 100
const POSITION = /^(0|[1-9][0-9]{0,8})$/
const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)
const CONFLICT = Object.freeze({ kind: 'conflict' } as const)
const INVALID = Object.freeze({ kind: 'invalid' } as const)

type Cursor =
  | Readonly<{ segment: 'secret'; at: number }>
  | Readonly<{ segment: 'catalog'; after: string | null }>

function cursorOf(after: string | null, secrets: number): Cursor | undefined {
  if (after === null) return { segment: 'secret', at: 0 }
  if (after.startsWith('c:')) {
    const rest = after.slice(2)
    return { segment: 'catalog', after: rest === '' ? null : rest }
  }
  if (!after.startsWith('s:')) return undefined
  const text = after.slice(2)
  const at = POSITION.test(text) ? Number(text) : -1
  return at >= 0 && at < secrets ? { segment: 'secret', at } : undefined
}

function limitOf(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit) || 1, 1), LIST_LIMIT)
}

function itemOf(input: ItemInput): ItemInput {
  return { principal: input.principal, tenant: input.tenant, asset: input.asset, item: input.item }
}

function recognised(answer: Awaited<ReturnType<Port['describe']>>): WriteOutcome {
  if (answer.kind === 'described') return INVALID
  return answer
}

export function unifySettings(sources: SettingsSources): TenantSettingsPort {
  async function catalogPage(
    input: ListInput,
    page: readonly SecretView[],
    secrets: number,
    after: string | null,
    room: number,
  ): Promise<ListAnswer> {
    const catalog = sources.catalog()
    const { asset } = input
    const listed =
      catalog === undefined
        ? UNAVAILABLE
        : await catalog.list({
            principal: input.principal,
            tenant: input.tenant,
            ...(asset === undefined ? {} : { asset }),
            after,
            limit: room,
          })
    if (listed.kind === 'listed')
      return {
        kind: 'listed',
        items: [...page, ...listed.items],
        next: listed.next === null ? null : `c:${listed.next}`,
        completeness: listed.completeness,
      }
    if (listed.kind === 'unavailable' && page.length > 0)
      return { kind: 'listed', items: page, next: null, completeness: 'partial' }
    if (listed.kind !== 'not-visible' || asset === undefined) return listed
    if (secrets === 0) return listed
    return { kind: 'listed', items: page, next: null, completeness: 'complete' }
  }

  async function list(input: ListInput): Promise<ListAnswer> {
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const { principal, tenant, asset } = input
    const secrets = await secretFace.list({
      principal,
      tenant,
      ...(asset === undefined ? {} : { asset }),
    })
    if (secrets.kind !== 'listed') return secrets
    const cursor = cursorOf(input.after, secrets.items.length)
    if (cursor === undefined) return UNAVAILABLE
    const limit = limitOf(input.limit)
    const count = secrets.items.length
    if (cursor.segment === 'catalog') return catalogPage(input, [], count, cursor.after, limit)
    const page = secrets.items.slice(cursor.at, cursor.at + limit)
    const end = cursor.at + page.length
    if (end < count) return secretPage(page, `s:${String(end)}`)
    if (page.length === limit) return secretPage(page, 'c:')
    return catalogPage(input, page, count, null, limit - page.length)
  }

  async function describe(input: ItemInput) {
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const described = await secretFace.describe(itemOf(input))
    if (described.kind !== 'not-visible') return described
    const catalog = sources.catalog()
    return catalog === undefined ? UNAVAILABLE : catalog.describe(input)
  }

  async function setSecret(
    input: Parameters<Port['set']>[0],
    secret: string,
  ): Promise<WriteOutcome> {
    if (input.expectedRevision !== SECRET_REVISION) return CONFLICT
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const written = await secretFace.set({ ...itemOf(input), secret })
    if (written.kind !== 'not-visible') return written
    const catalog = sources.catalog()
    return catalog === undefined ? UNAVAILABLE : recognised(await catalog.describe(itemOf(input)))
  }

  async function setValue(input: Parameters<Port['set']>[0]): Promise<WriteOutcome> {
    const catalog = sources.catalog()
    if (catalog === undefined) return UNAVAILABLE
    const written = await catalog.set(input)
    if (written.kind !== 'not-visible') return written
    const secretFace = sources.secrets()
    return secretFace === undefined
      ? UNAVAILABLE
      : recognised(await secretFace.describe(itemOf(input)))
  }

  async function clearSecret(input: Parameters<Port['clear']>[0]): Promise<WriteOutcome> {
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    if (input.expectedRevision === SECRET_REVISION) return secretFace.clear(itemOf(input))
    const described = await secretFace.describe(itemOf(input))
    if (described.kind === 'described') return CONFLICT
    return described
  }

  async function clear(input: Parameters<Port['clear']>[0]): Promise<WriteOutcome> {
    const cleared = await clearSecret(input)
    if (cleared.kind !== 'not-visible') return cleared
    const catalog = sources.catalog()
    return catalog === undefined ? UNAVAILABLE : catalog.clear(input)
  }

  return Object.freeze({
    list,
    describe,
    set: input =>
      input.value.kind === 'secret' ? setSecret(input, input.value.secret) : setValue(input),
    clear,
  } satisfies TenantSettingsPort)
}

function secretPage(items: readonly SecretView[], next: string): Listed {
  return { kind: 'listed', items, next, completeness: 'complete' }
}
