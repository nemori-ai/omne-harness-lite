import type {
  AccessContribution,
  AnswerOf,
  BodyOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createAssetOperations } from './asset-operations.ts'
import { createAssetsObservation } from './observe-assets.ts'
import type {
  CategoriesPort,
  ChangesPort,
  ManagementPort,
  ReadRefusal,
  SettingInput,
  SettingJson,
  SettingView,
  TargetTenantPrincipals,
  TenantSettingsPort,
  WriteOutcome,
} from './ports.ts'

export type AssetsContributionInput = Readonly<{
  settings: () => TenantSettingsPort | undefined
  categories: () => CategoriesPort | undefined
  management: () => ManagementPort | undefined
  changes: () => ChangesPort | undefined
  principals: TargetTenantPrincipals
}>

type Operations = AssetsProtocol['operations']
type Name = keyof Operations & string
type Answer<K extends Name> = AnswerOf<Operations[K]>
type Body<K extends Name> = BodyOf<Operations[K]>
type WireView = Extract<Answer<'describe-setting'>, { outcome: 'succeeded' }>['body']['item']
type WireInput = Body<'set-setting'>['value']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

type Admitted = Readonly<{ principal: Principal; tenant: TenantId; face: TenantSettingsPort }>

/** A value tree of the wire as a plain value. Keys are defined, never assigned, so `__proto__` stays a key. */
function plainOf(value: JsonValue): SettingJson {
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plainOf)
    case 'object': {
      const result: { [key: string]: SettingJson } = {}
      for (const entry of value.entries)
        Object.defineProperty(result, entry.key, {
          value: plainOf(entry.value),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      return result
    }
  }
}

function treeOf(value: SettingJson): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: JSON.stringify(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, item]) => ({ key, value: treeOf(item) })),
  }
}

function presenceOf(presence: Extract<SettingView, { kind: 'ordinary' }>['own']) {
  return presence.kind === 'unset'
    ? ({ kind: 'unset' } as const)
    : ({ kind: 'set', value: treeOf(presence.value) } as const)
}

function ownerOf(owner: SettingView['owner']): WireView['owner'] {
  switch (owner.kind) {
    case 'asset':
      return { kind: 'asset', category: owner.category, name: owner.name }
    case 'independent':
      return {
        kind: 'independent',
        providerId: owner.providerId,
        definitionId: owner.definitionId,
      }
  }
}

function viewOf(view: SettingView): WireView {
  const { group } = view.declaration
  const head = {
    owner: ownerOf(view.owner),
    item: view.item,
    revision: view.revision,
    declaration: {
      title: view.declaration.title,
      purpose: view.declaration.purpose,
      appliesAt: view.declaration.appliesAt,
      clearEffect: view.declaration.clearEffect,
      group: { id: group.id, title: group.title, description: group.description },
    },
  }
  switch (view.kind) {
    case 'ordinary':
      return {
        ...head,
        kind: 'ordinary',
        valueSchema: treeOf(view.valueSchema),
        default: presenceOf(view.default),
        own: presenceOf(view.own),
        effective: { value: presenceOf(view.effective.value), source: view.effective.source },
        lockedBy: view.lockedBy,
        editable: view.editable,
      }
    case 'permission':
      return {
        ...head,
        kind: 'permission',
        choices: view.choices.map(choice => ({
          value: choice.value,
          label: choice.label,
          description: choice.description,
          permitsOperation: choice.permitsOperation,
        })),
        default: view.default,
        own: view.own,
        effective: view.effective,
        bound: view.bound,
        editable: view.editable,
      }
    case 'secret':
      return {
        ...head,
        kind: 'secret',
        own: view.own,
        official: view.official,
        editable: view.editable,
      }
  }
}

function inputOf(value: WireInput): SettingInput {
  switch (value.kind) {
    case 'ordinary':
      return { kind: 'ordinary', value: plainOf(value.value) }
    case 'permission':
      return { kind: 'permission', pick: value.pick }
    case 'secret':
      return { kind: 'secret', secret: value.secret }
  }
}

function readRefused(refusal: ReadRefusal) {
  switch (refusal.kind) {
    case 'denied':
      return DENIED
    case 'not-visible':
      return { outcome: 'not-visible', body: {} } as const
    case 'conflict':
      return { outcome: 'conflict', body: {} } as const
    case 'unavailable':
      return UNAVAILABLE
  }
}

function written(outcome: WriteOutcome): Answer<'set-setting'> {
  switch (outcome.kind) {
    case 'written':
      return { outcome: 'succeeded', body: { revision: outcome.revision } }
    case 'no-change':
      return { outcome: 'no-change', body: {} }
    case 'denied':
      return DENIED
    case 'not-visible':
      return { outcome: 'not-visible', body: {} }
    case 'invalid':
      return { outcome: 'invalid', body: {} }
    case 'conflict':
      return { outcome: 'conflict', body: {} }
    case 'not-writable':
      return { outcome: 'not-writable', body: { reason: outcome.reason } }
    case 'unavailable':
      return UNAVAILABLE
    case 'unknown':
      return { outcome: 'unknown' }
  }
}

export function createAssetsContribution(
  input: AssetsContributionInput,
): Omit<AccessContribution<AssetsProtocol>, 'protocol'> {
  const { principals } = input

  async function admit(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<Admitted | typeof DENIED | typeof UNAVAILABLE> {
    const tenantText = tenantCodec.encode(tenant)
    if (!tenantText.ok) throw new TypeError('assets-access: tenant is not a minted TenantId')
    let issued: Awaited<ReturnType<TargetTenantPrincipals['actingFor']>>
    try {
      issued = await principals.actingFor(login, tenantText.value)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
    const face = input.settings()
    return face === undefined ? UNAVAILABLE : { principal: issued.ok, tenant, face }
  }

  async function read<T>(call: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
    try {
      return await call()
    } catch {
      return UNAVAILABLE
    }
  }

  async function write(call: () => Promise<WriteOutcome>): Promise<WriteOutcome> {
    try {
      return await call()
    } catch {
      return { kind: 'unknown' }
    }
  }

  return {
    operations: {
      async 'list-settings'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, tenant, face } = admitted
        const listed = await read(() =>
          face.list({
            principal,
            tenant,
            scope: body.scope,
            after: body.after,
            limit: body.limit,
          }),
        )
        if ('outcome' in listed) return listed
        if (listed.kind !== 'listed') return readRefused(listed)
        return {
          outcome: 'succeeded',
          body: {
            items: listed.items.map(viewOf),
            next: listed.next,
            completeness: listed.completeness,
          },
        }
      },
      async 'describe-setting'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, tenant, face } = admitted
        const described = await read(() =>
          face.describe({ principal, tenant, owner: body.owner, item: body.item }),
        )
        if ('outcome' in described) return described
        if (described.kind !== 'described') return readRefused(described)
        return { outcome: 'succeeded', body: { item: viewOf(described.item) } }
      },
      async 'set-setting'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, tenant, face } = admitted
        return written(
          await write(() =>
            face.set({
              principal,
              tenant,
              owner: body.owner,
              item: body.item,
              operation: body.operation,
              expectedRevision: body.expectedRevision,
              value: inputOf(body.value),
            }),
          ),
        )
      },
      async 'clear-setting'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, tenant, face } = admitted
        return written(
          await write(() =>
            face.clear({
              principal,
              tenant,
              owner: body.owner,
              item: body.item,
              operation: body.operation,
              expectedRevision: body.expectedRevision,
            }),
          ),
        )
      },
      async 'list-categories'(_call, body) {
        const categories = input.categories()
        if (categories === undefined) return UNAVAILABLE
        const listed = await read(async () => categories.list())
        if ('outcome' in listed) return listed
        const after = body.after
        const rest = after === null ? listed : listed.filter(entry => entry.category > after)
        const page = rest.slice(0, body.limit)
        return {
          outcome: 'succeeded',
          body: {
            items: page.map(({ category, display, creation }) => ({
              category,
              title: display.title,
              summary: display.summary,
              creation,
            })),
            next: rest.length > page.length ? (page.at(-1)?.category ?? null) : null,
          },
        }
      },
      ...createAssetOperations(input),
    },
    observations: {
      'observe-assets': createAssetsObservation(input),
    },
  }
}
