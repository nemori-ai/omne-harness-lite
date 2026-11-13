// The contribution of `assets/v1`: one handler for each of the four setting operations. Each
// handler turns the login and the target tenant of the body into a principal, takes the settings
// face of the moment, hands over the body and maps the face's result to the outcome of the same
// name (SPEC AA-4). Business rules stay in the face.
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
import type {
  ReadRefusal,
  SettingInput,
  SettingJson,
  SettingView,
  TargetTenantPrincipals,
  TenantSettingsPort,
  WriteOutcome,
} from './ports.ts'

/** What the contribution reads. `settings` is called at the moment of a call. */
export type AssetsContributionInput = Readonly<{
  settings: () => TenantSettingsPort | undefined
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

/** A value tree of the wire as a plain value. Keys are defined, never assigned. */
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

/** A plain value as a value tree of the wire. */
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

/** One view of the face as a view of the contract, field by field. */
function viewOf(view: SettingView): WireView {
  const head = {
    asset: { category: view.asset.category, name: view.asset.name },
    item: view.item,
    revision: view.revision,
    declaration: {
      title: view.declaration.title,
      purpose: view.declaration.purpose,
      appliesAt: view.declaration.appliesAt,
      clearEffect: view.declaration.clearEffect,
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

/** A refusal of a read, as the outcome of the same name (SPEC AA-4). */
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

/** The outcome of a write, the same for `set-setting` and `clear-setting` (SPEC AA-4). */
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

  /** The principal for the target tenant, then the settings face as it is on the tree now (AA-1, AA-2). */
  async function admit(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<Admitted | typeof DENIED | typeof UNAVAILABLE> {
    const tenantText = tenantCodec.encode(tenant)
    if (!tenantText.ok) return DENIED
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

  /** A read: a throw is `basis-unavailable`, nothing was committed (AA-5). */
  async function read<T>(call: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
    try {
      return await call()
    } catch {
      return UNAVAILABLE
    }
  }

  /** A write: a throw after the call began is `unknown` (AA-5). */
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
            ...(body.asset === undefined ? {} : { asset: body.asset }),
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
          face.describe({ principal, tenant, asset: body.asset, item: body.item }),
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
              asset: body.asset,
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
              asset: body.asset,
              item: body.item,
              operation: body.operation,
              expectedRevision: body.expectedRevision,
            }),
          ),
        )
      },
    },
    observations: {},
  }
}
