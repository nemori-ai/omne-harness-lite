import type {
  AccessContribution,
  AnswerOf,
  BodyOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import {
  capabilityId,
  type AssetRow,
  type BodyContract,
  type CapabilityId,
  type CreationMode,
  type HoldingOutcome,
  type ManagedAsset,
  type ManagedList,
  type ManagedRequest,
  type RecallOutcome,
  type TenantPublishOutcome,
  type UploadAppend,
  type UploadBegin,
  type UploadCommit,
} from '@omne-harness/assets'
import type { AssetsProtocol, CreationDetail } from '@omne-harness/assets-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { CategoriesPort, ManagementPort, TargetTenantPrincipals } from './ports.ts'

type Operations = AssetsProtocol['operations']
type Handlers = AccessContribution<AssetsProtocol>['operations']
type Answer<K extends keyof Operations> = AnswerOf<Operations[K]>
type AssetHandlers = Pick<
  Handlers,
  | 'describe-category'
  | 'list-assets'
  | 'describe-asset'
  | 'create-asset'
  | 'begin-asset-upload'
  | 'append-asset-upload'
  | 'commit-asset-upload'
  | 'set-asset-enabled'
  | 'remove-asset'
  | 'query-asset-operation'
>

export type AssetOperationsInput = Readonly<{
  management: () => ManagementPort | undefined
  categories: () => CategoriesPort | undefined
  principals: TargetTenantPrincipals
}>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NOT_FOUND = Object.freeze({ outcome: 'not-found' as const, body: {} })
const CONFLICT = Object.freeze({ outcome: 'conflict' as const, body: {} })
const NAME_REFUSED = Object.freeze({
  outcome: 'invalid' as const,
  body: { reason: 'capability-name' },
})

type Acting = Readonly<{ tenant: string; principal: Principal; face: ManagementPort }>

function rowView(row: AssetRow) {
  const { summary } = row
  return {
    category: row.capability.category,
    name: row.capability.name,
    version: row.version,
    selection: row.selection,
    enabled: row.enabled,
    holding: row.holding,
    origin: row.origin,
    summary:
      summary === null
        ? null
        : {
            title: summary.title,
            description: summary.description,
            facts: summary.facts.map(({ name, text }) => ({ name, text })),
          },
  }
}

function listed(page: ManagedList): Answer<'list-assets'> {
  switch (page.kind) {
    case 'page':
      return {
        outcome: 'succeeded',
        body: { items: page.items.map(rowView), next: page.next, completeness: page.completeness },
      }
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
    case 'invalid':
      return { outcome: 'invalid', body: {} }
    case 'unknown-category':
      return NOT_FOUND
  }
}

function described(asset: ManagedAsset): Answer<'describe-asset'> {
  switch (asset.kind) {
    case 'asset': {
      const { standing, content } = asset
      return {
        outcome: 'succeeded',
        body: {
          item: rowView(asset.row),
          revision: asset.revision,
          content:
            content.kind === 'data'
              ? { kind: 'data', body: content.body }
              : {
                  kind: 'directory',
                  entries: content.entries.map(({ path, bytes }) => ({ path, bytes })),
                },
          standing:
            standing.kind === 'filtered'
              ? { kind: 'filtered', reason: standing.reason, by: standing.by ?? null }
              : standing,
          settings: asset.settings,
        },
      }
    }
    case 'absent':
      return NOT_FOUND
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
  }
}

function publishedBody(outcome: Extract<TenantPublishOutcome, Readonly<{ kind: 'published' }>>) {
  return { version: outcome.version, holding: outcome.holdingRef, changed: outcome.changed }
}

function uploadBody(outcome: Extract<UploadBegin, Readonly<{ kind: 'accepted' }>>) {
  return {
    partBytes: outcome.partBytes,
    received: outcome.received.map(({ path, bytes }) => ({ path, bytes })),
  }
}

function published(outcome: TenantPublishOutcome): Answer<'create-asset'> {
  switch (outcome.kind) {
    case 'published':
      return { outcome: 'succeeded', body: publishedBody(outcome) }
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
    case 'unknown-category':
      return NOT_FOUND
    case 'conflict':
    case 'operation-conflict':
      return CONFLICT
    case 'invalid':
      return { outcome: 'invalid', body: { reason: outcome.reason } }
    case 'unknown':
      return UNKNOWN
  }
}

function committed(outcome: UploadCommit): Answer<'commit-asset-upload'> {
  if (outcome.kind === 'absent') return NOT_FOUND
  if (outcome.kind === 'incomplete')
    return { outcome: 'invalid', body: { reason: 'incomplete', missing: [...outcome.missing] } }
  return published(outcome)
}

function begun(outcome: UploadBegin): Answer<'begin-asset-upload'> {
  switch (outcome.kind) {
    case 'accepted':
      return { outcome: 'succeeded', body: uploadBody(outcome) }
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
    case 'unknown-category':
      return NOT_FOUND
    case 'operation-conflict':
      return CONFLICT
    case 'busy':
      return { outcome: 'limited', body: {} }
    case 'invalid':
      return { outcome: 'invalid', body: { reason: outcome.reason } }
  }
}

function appended(outcome: UploadAppend): Answer<'append-asset-upload'> {
  switch (outcome.kind) {
    case 'received':
      return { outcome: 'succeeded', body: { received: outcome.bytes } }
    case 'absent':
      return NOT_FOUND
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
    case 'invalid':
      return { outcome: 'invalid', body: { reason: outcome.reason } }
  }
}

function changed(outcome: HoldingOutcome): Answer<'set-asset-enabled'> {
  switch (outcome.kind) {
    case 'changed':
      return { outcome: 'succeeded', body: {} }
    case 'no-change':
      return { outcome: 'no-change', body: {} }
    case 'absent':
      return NOT_FOUND
    case 'denied':
      return DENIED
    case 'unavailable':
      return UNAVAILABLE
    case 'conflict':
    case 'operation-conflict':
      return CONFLICT
    case 'not-writable':
      return { outcome: 'not-writable', body: { reason: outcome.reason } }
    case 'unknown':
      return UNKNOWN
  }
}

/** A recall is a read: what it cannot know now is unavailable, never unknown. */
function recalled(outcome: RecallOutcome): Answer<'query-asset-operation'> {
  switch (outcome.kind) {
    case 'not-committed':
      return { outcome: 'not-committed', body: {} }
    case 'accepted':
      return { outcome: 'succeeded', body: uploadBody(outcome) }
    case 'published':
      return { outcome: 'succeeded', body: publishedBody(outcome) }
    case 'changed':
      return { outcome: 'succeeded', body: {} }
    case 'no-change':
      return { outcome: 'no-change', body: {} }
    case 'absent':
    case 'unknown-category':
      return NOT_FOUND
    case 'incomplete':
      return { outcome: 'invalid', body: { reason: 'incomplete', missing: [...outcome.missing] } }
    case 'invalid':
      return { outcome: 'invalid', body: { reason: outcome.reason } }
    case 'not-writable':
      return { outcome: 'not-writable', body: { reason: outcome.reason } }
    case 'conflict':
    case 'operation-conflict':
      return CONFLICT
    case 'busy':
      return { outcome: 'limited', body: {} }
    case 'denied':
      return DENIED
    case 'unavailable':
    case 'unknown':
      return UNAVAILABLE
  }
}

function detailOf(mode: CreationMode, contract: BodyContract): CreationDetail {
  if (mode === 'data') return { kind: 'data', schema: contract.schema }
  if (mode === 'directory' && contract.layout !== undefined) {
    const { files, fileBytes, totalBytes } = contract.layout.limits
    return { kind: 'directory', limits: { files, fileBytes, totalBytes } }
  }
  return { kind: 'none' }
}

function requestOf(
  request: BodyOf<Operations['query-asset-operation']>['request'],
): ManagedRequest | undefined {
  switch (request.kind) {
    case 'create-asset':
    case 'begin-asset-upload': {
      const made = capabilityId(request.category, request.name)
      if (!made.ok) return undefined
      return request.kind === 'create-asset'
        ? { kind: 'create', capability: made.id }
        : { kind: 'begin', capability: made.id, entries: request.manifest }
    }
    case 'commit-asset-upload':
      return { kind: 'commit' }
    case 'set-asset-enabled':
      return { kind: 'setEnabled', holding: request.holding, enabled: request.enabled }
    case 'remove-asset':
      return { kind: 'remove', holding: request.holding }
  }
}

async function read<T>(call: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
  try {
    return await call()
  } catch {
    return UNAVAILABLE
  }
}

async function write<T>(call: () => Promise<T>): Promise<T | typeof UNKNOWN> {
  try {
    return await call()
  } catch {
    return UNKNOWN
  }
}

export function createAssetOperations(input: AssetOperationsInput): AssetHandlers {
  async function acting(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<Acting | typeof DENIED | typeof UNAVAILABLE> {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) throw new TypeError('assets-access: tenant is not a minted TenantId')
    let issued: Awaited<ReturnType<TargetTenantPrincipals['actingFor']>>
    try {
      issued = await input.principals.actingFor(login, text.value)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
    const face = input.management()
    return face === undefined ? UNAVAILABLE : { tenant: text.value, principal: issued.ok, face }
  }
  const withCapability = <T>(
    category: string,
    name: string,
    refused: T,
    use: (capability: CapabilityId) => Promise<T>,
  ): Promise<T> => {
    const made = capabilityId(category, name)
    return made.ok ? use(made.id) : Promise.resolve(refused)
  }

  return {
    async 'describe-category'(_call, body) {
      const categories = input.categories()
      if (categories === undefined) return UNAVAILABLE
      const listing = categories.describe(body.category)
      const contract = categories.lookup(body.category)
      if (listing === undefined || contract === undefined) return NOT_FOUND
      return {
        outcome: 'succeeded',
        body: {
          category: listing.category,
          title: listing.display.title,
          summary: listing.display.summary,
          hint: listing.display.creation ?? null,
          creation: detailOf(listing.creation, contract),
        },
      }
    },
    async 'list-assets'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const { category, after, limit } = body
      const page = await read(() => a.face.list({ ...a, category, after, limit }))
      return 'outcome' in page ? page : listed(page)
    },
    async 'describe-asset'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      return withCapability(body.category, body.name, NOT_FOUND, async capability => {
        const asset = await read(() => a.face.describe({ ...a, capability }))
        return 'outcome' in asset ? asset : described(asset)
      })
    },
    async 'create-asset'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      return withCapability(body.category, body.name, NAME_REFUSED, async capability => {
        const outcome = await write(() =>
          a.face.createFromData({ ...a, operationId: body.operation, capability, body: body.body }),
        )
        return 'outcome' in outcome ? outcome : published(outcome)
      })
    },
    async 'begin-asset-upload'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      return withCapability(body.category, body.name, NAME_REFUSED, async capability => {
        const outcome = await write(() =>
          a.face.beginUpload({
            ...a,
            operationId: body.operation,
            capability,
            entries: body.manifest,
          }),
        )
        return 'outcome' in outcome ? outcome : begun(outcome)
      })
    },
    async 'append-asset-upload'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const { upload, path, offset, bytes } = body
      const outcome = await write(() =>
        a.face.appendUpload({ ...a, operationId: upload, path, offset, bytes }),
      )
      return 'outcome' in outcome ? outcome : appended(outcome)
    },
    async 'commit-asset-upload'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const outcome = await write(() => a.face.createFromUpload({ ...a, operationId: body.upload }))
      return 'outcome' in outcome ? outcome : committed(outcome)
    },
    async 'set-asset-enabled'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const { operation, holding, enabled } = body
      const outcome = await write(() =>
        a.face.setEnabled({ ...a, operationId: operation, holding, enabled }),
      )
      return 'outcome' in outcome ? outcome : changed(outcome)
    },
    async 'remove-asset'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const { operation, holding } = body
      const outcome = await write(() => a.face.remove({ ...a, operationId: operation, holding }))
      return 'outcome' in outcome ? outcome : changed(outcome)
    },
    async 'query-asset-operation'(call, body) {
      const a = await acting(call.principal, body.tenant)
      if ('outcome' in a) return a
      const request = requestOf(body.request)
      if (request === undefined) return NAME_REFUSED
      const outcome = await read(() =>
        a.face.recall({ ...a, operationId: body.operation, request }),
      )
      return 'outcome' in outcome ? outcome : recalled(outcome)
    },
  }
}
