import type { TenantSettingsPort } from '@omne-harness/assets-access'
import type { SecretItemInput, SecretSettings, SecretView } from '../settings/ports.ts'

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

type AssetQuery = Readonly<{ category?: string; name: string }>

function secretItemOf(input: ItemInput, asset: AssetQuery): SecretItemInput {
  return { principal: input.principal, tenant: input.tenant, asset, item: input.item }
}

function assetOf(owner: ItemInput['owner']): AssetQuery | undefined {
  if (owner.kind !== 'asset') return undefined
  return owner.category === undefined
    ? { name: owner.name }
    : { category: owner.category, name: owner.name }
}

type Row = Listed['items'][number]

function keyOf({ owner, item }: Pick<Row, 'owner' | 'item'>): string {
  return owner.kind === 'asset' ? JSON.stringify([owner.category, owner.name, item]) : ''
}

function recognised(answer: Awaited<ReturnType<Port['describe']>>): WriteOutcome {
  if (answer.kind === 'described') return INVALID
  return answer
}

export function unifySettings(sources: SettingsSources): TenantSettingsPort {
  // The catalog declares a secret item without its facts: they come from the secret face, once per item.
  async function withSecretFacts(
    input: ListInput,
    rows: readonly Row[],
    held: ReadonlySet<string>,
  ): Promise<Row[]> {
    const face = sources.secrets()
    const out: Row[] = []
    for (const row of rows) {
      const asset = row.kind === 'secret' ? assetOf(row.owner) : undefined
      if (asset === undefined || face === undefined) out.push(row)
      else if (!held.has(keyOf(row))) {
        const { principal, tenant } = input
        const described = await face.describe({ principal, tenant, asset, item: row.item })
        out.push(described.kind === 'described' ? described.item : row)
      }
    }
    return out
  }

  async function catalogPage(
    input: ListInput,
    page: readonly SecretView[],
    held: ReadonlySet<string>,
    after: string | null,
    room: number,
  ): Promise<ListAnswer> {
    const secrets = held.size
    const catalog = sources.catalog()
    const asset = input.scope.kind === 'asset' ? input.scope.asset : undefined
    const listed =
      catalog === undefined
        ? UNAVAILABLE
        : await catalog.list({
            principal: input.principal,
            tenant: input.tenant,
            scope: input.scope,
            after,
            limit: room,
          })
    if (listed.kind === 'listed')
      return {
        kind: 'listed',
        items: [...page, ...(await withSecretFacts(input, listed.items, held))],
        next: listed.next === null ? null : `c:${listed.next}`,
        completeness: listed.completeness,
      }
    if (listed.kind !== 'not-visible' || asset === undefined) return listed
    if (secrets === 0) return listed
    return { kind: 'listed', items: page, next: null, completeness: 'complete' }
  }

  async function secretsIn(input: ListInput) {
    const { principal, tenant, scope } = input
    if (scope.kind === 'independent') return { kind: 'listed' as const, items: [] }
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const { asset } = scope
    return secretFace.list({ principal, tenant, ...(asset === undefined ? {} : { asset }) })
  }

  async function list(input: ListInput): Promise<ListAnswer> {
    const secrets = await secretsIn(input)
    if (secrets.kind !== 'listed') return secrets
    const cursor = cursorOf(input.after, secrets.items.length)
    if (cursor === undefined) return UNAVAILABLE
    const limit = limitOf(input.limit)
    const count = secrets.items.length
    const held = new Set(secrets.items.map(keyOf))
    if (cursor.segment === 'catalog') return catalogPage(input, [], held, cursor.after, limit)
    const page = secrets.items.slice(cursor.at, cursor.at + limit)
    const end = cursor.at + page.length
    if (end < count) return secretPage(page, `s:${String(end)}`)
    if (page.length === limit) return secretPage(page, 'c:')
    return catalogPage(input, page, held, null, limit - page.length)
  }

  async function describe(input: ItemInput) {
    const catalog = sources.catalog()
    const asset = assetOf(input.owner)
    if (asset === undefined) return catalog === undefined ? UNAVAILABLE : catalog.describe(input)
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const described = await secretFace.describe(secretItemOf(input, asset))
    if (described.kind !== 'not-visible') return described
    return catalog === undefined ? UNAVAILABLE : catalog.describe(input)
  }

  async function setSecret(
    input: Parameters<Port['set']>[0],
    asset: AssetQuery,
    secret: string,
  ): Promise<WriteOutcome> {
    if (input.expectedRevision !== SECRET_REVISION) return CONFLICT
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const written = await secretFace.set({ ...secretItemOf(input, asset), secret })
    if (written.kind !== 'not-visible') return written
    const catalog = sources.catalog()
    return catalog === undefined ? UNAVAILABLE : recognised(await catalog.describe(input))
  }

  async function setValue(input: Parameters<Port['set']>[0]): Promise<WriteOutcome> {
    const catalog = sources.catalog()
    if (catalog === undefined) return UNAVAILABLE
    const written = await catalog.set(input)
    const asset = assetOf(input.owner)
    if (written.kind !== 'not-visible' || asset === undefined) return written
    const secretFace = sources.secrets()
    return secretFace === undefined
      ? UNAVAILABLE
      : recognised(await secretFace.describe(secretItemOf(input, asset)))
  }

  async function clearSecret(
    input: Parameters<Port['clear']>[0],
    asset: AssetQuery,
  ): Promise<WriteOutcome> {
    const secretFace = sources.secrets()
    if (secretFace === undefined) return UNAVAILABLE
    const item = secretItemOf(input, asset)
    if (input.expectedRevision === SECRET_REVISION) return secretFace.clear(item)
    const described = await secretFace.describe(item)
    if (described.kind === 'described') return CONFLICT
    return described
  }

  async function clear(input: Parameters<Port['clear']>[0]): Promise<WriteOutcome> {
    const asset = assetOf(input.owner)
    const cleared = asset === undefined ? undefined : await clearSecret(input, asset)
    if (cleared !== undefined && cleared.kind !== 'not-visible') return cleared
    const catalog = sources.catalog()
    return catalog === undefined ? UNAVAILABLE : catalog.clear(input)
  }

  async function set(input: Parameters<Port['set']>[0]): Promise<WriteOutcome> {
    const asset = assetOf(input.owner)
    return input.value.kind === 'secret' && asset !== undefined
      ? setSecret(input, asset, input.value.secret)
      : setValue(input)
  }

  return Object.freeze({ list, describe, set, clear } satisfies TenantSettingsPort)
}

function secretPage(items: readonly SecretView[], next: string): Listed {
  return { kind: 'listed', items, next, completeness: 'complete' }
}
