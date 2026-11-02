// AD-12, the Context input: the `sessionContextInput` provider and the translation protocol that it
// owns (SPEC AD-12; session-contract「初始化来源与提交」).
//
// - Encoding. The assembly builds the three `ContextMaterial`s of a registration (need, binding,
//   parameters) and the block list of a step commit with the encoders here. A material holds only
//   JSON: the scope, tenant, block key, creating, required, the revision it is based on and the
//   binding references. The functions that JSON cannot hold (the translation of a binding, the
//   need's shape, the stateful block declaration) are references into one exact adopted definition,
//   and `SessionContextDefinitions` gives them back.
// - Preparing. The plugin checks a `create` or `change` against its access, decodes the materials
//   and, for a registration change, asks Runtime Context's `prepareRegistration`. It hands Session a
//   guard material; it never calls `applyCommit` (AD-03 does, after Session committed the entry).
// - Decoding. `createSessionContextTranslation` turns a committed Session entry back into the
//   Runtime Context commit input it records: an initial or later registration (SE07), a step commit
//   (`change(context-step-commit)`), or the end of a scope (SE27). AD-03's replay takes it as its
//   `translation`.
//
// The plugin keeps no business fact. The translation keeps one derivative: the tenant of each scope
// it has decoded a record of, because the end of a scope (SE27) does not name its tenant.
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeContextBlockKey,
  decodeScopeRef,
  type CommitInput,
  type CommitRef,
  type ConsumerClass,
  type ContextBlockKey,
  type ContextUpdate,
  type JudgedRegistration,
  type NeedBinding,
  type RegistrationChange,
  type RegistrationRevision,
  type RuntimeContextOperations,
  type ScopeRef,
  type StatefulBlockDescriptor,
  type StepBlockMaterial,
  type StepCommit,
} from '@omne-harness/runtime-context-contract'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import type {
  Adoption,
  ContextMaterial,
  DeclarationChange,
  GuardCommand,
  HistoryEntry,
  SessionAccess,
  SessionContextInput,
  SessionFailure,
  SessionId,
  SessionOperationId,
} from '@omne-harness/session-contract'
import { SessionContextInputService } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'

const OWNER = '@omne-harness/session-adapters'
/** The owner named in the guard material and in `unavailable` when Runtime Context is the cause. */
const CONTEXT_OWNER = 'runtime-context'
/** The `participant` of the guard material: the Context input owns it (SPEC「构造依赖端口的实现」). */
const PARTICIPANT = 'context-input'
/** The owner named in `unavailable` when the adopted definitions cannot answer. */
const DEFINITIONS_OWNER = 'context-definitions'

function protocol(name: string): Adoption {
  return Object.freeze({
    owner: OWNER,
    name,
    revision: '1',
    digest: `sha256:${createHash('sha256').update(`${OWNER}/${name}/1`).digest('hex')}`,
  })
}

/** The schema of every `ContextMaterial` this protocol writes. */
export const SESSION_CONTEXT_MATERIAL: Adoption = protocol('session-context-material')
/** The protocol of the guard material that the plugin hands to Session. */
export const SESSION_CONTEXT_INPUT: Adoption = protocol('session-context-input')

/** The Session entry kinds that can record a Runtime Context commit. */
const REGISTRATION_KIND = 'session.context-registration-changed'
const STEP_KIND = 'session.recovery-input-adopted'
const ARCHIVED_KIND = 'session.archived'
/** The block name of the head element of a step commit. It has no dot, so no block key equals it. */
const STEP_HEAD = '@step'
/** The initial bound of the scope-to-tenant derivative; the assembly may set another (IC-14). */
const SCOPE_TENANTS = 4096

// --- The definitions --------------------------------------------------------------------------

/**
 * What JSON cannot hold, given back from one exact adopted definition: a need binding (its shape
 * and translation are functions) and a stateful block declaration (its schema and reducer are
 * functions). The assembly provides it from the definitions it adopted. An answer of `undefined`
 * means the definition has no such entry; the material is then not restorable.
 */
export interface SessionContextDefinitions {
  binding(
    ref: Readonly<{ definition: Adoption; need: string; key: ContextBlockKey }>,
  ): NeedBinding | undefined
  declaration(
    ref: Readonly<{ definition: Adoption; key: ContextBlockKey }>,
  ): StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined
}

// --- Commit identities ------------------------------------------------------------------------

/**
 * The commit identity of one registration that a `change` commits. It is the well-formed
 * `JSON.stringify` of a string array, like the initial registration's (session-contract「初始注册的
 * 身份与修订」), under its own domain. The scope names the tenant, the session and the generation.
 */
export function contextChangeCommit(
  input: Readonly<{ scope: ScopeRef; operation: SessionOperationId; key: ContextBlockKey }>,
): CommitRef {
  return {
    commit: JSON.stringify([
      'session-context-change',
      '1',
      input.scope.ref,
      input.operation,
      input.key,
    ]),
  }
}

/** The commit identity of the step commit that one `change(context-step-commit)` records. */
export function contextStepCommit(
  input: Readonly<{ scope: ScopeRef; operation: SessionOperationId }>,
): CommitRef {
  return { commit: JSON.stringify(['session-context-step', '1', input.scope.ref, input.operation]) }
}

/** The commit identity of the end of a scope that the archive operation committed (SE27). */
export function contextScopeEndCommit(
  input: Readonly<{ scope: string; operation: string }>,
): CommitRef {
  return {
    commit: JSON.stringify(['session-context-scope-end', '1', input.scope, input.operation]),
  }
}

// --- JSON trees ---------------------------------------------------------------------------------

/** A value that the protocol cannot encode or a record it cannot decode. */
class Malformed extends Error {}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** The JSON tree of a plain JSON value. Anything else (undefined, a function, a cycle) is refused. */
function toTree(value: unknown, path: string, seen: Set<object> = new Set()): JsonValue {
  if (value === null) return { kind: 'null' }
  switch (typeof value) {
    case 'string':
      return { kind: 'string', value }
    case 'boolean':
      return { kind: 'boolean', value }
    case 'number':
      if (!Number.isFinite(value)) throw new Malformed(`${path}: a non-finite number`)
      return { kind: 'number', lexeme: String(value) }
    case 'object':
      break
    default:
      throw new Malformed(`${path}: a ${typeof value} is not JSON data`)
  }
  if (seen.has(value)) throw new Malformed(`${path}: a cycle`)
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const items: JsonValue[] = []
      for (let index = 0; index < value.length; index++)
        items.push(toTree(value[index], `${path}[${index}]`, seen))
      return { kind: 'array', items }
    }
    if (!isPlainObject(value)) throw new Malformed(`${path}: not a plain object`)
    const entries: JsonEntry[] = []
    for (const key of Object.keys(value)) {
      if (key === '__proto__') throw new Malformed(`${path}: the key __proto__`)
      entries.push({
        key,
        value: toTree((value as Record<string, unknown>)[key], `${path}.${key}`, seen),
      })
    }
    return { kind: 'object', entries }
  } finally {
    seen.delete(value)
  }
}

/** The plain value of a JSON tree that came from storage; the tree is checked node by node. */
function fromTree(tree: unknown, path: string): unknown {
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree))
    throw new Malformed(`${path}: not a JSON tree`)
  const node = tree as Record<string, unknown>
  switch (node['kind']) {
    case 'null':
      return null
    case 'boolean':
      if (typeof node['value'] !== 'boolean') throw new Malformed(`${path}: a malformed boolean`)
      return node['value']
    case 'string':
      if (typeof node['value'] !== 'string') throw new Malformed(`${path}: a malformed string`)
      return node['value']
    case 'number': {
      const lexeme = node['lexeme']
      const number = typeof lexeme === 'string' ? Number(lexeme) : Number.NaN
      if (!Number.isFinite(number)) throw new Malformed(`${path}: a malformed number`)
      return number
    }
    case 'array': {
      const items = node['items']
      if (!Array.isArray(items)) throw new Malformed(`${path}: a malformed array`)
      return items.map((item, index) => fromTree(item, `${path}[${index}]`))
    }
    case 'object': {
      const entries = node['entries']
      if (!Array.isArray(entries)) throw new Malformed(`${path}: a malformed object`)
      const out: Record<string, unknown> = {}
      for (const entry of entries) {
        const key: unknown = typeof entry === 'object' && entry !== null ? entry.key : undefined
        if (typeof key !== 'string' || key === '__proto__' || Object.hasOwn(out, key))
          throw new Malformed(`${path}: a malformed or repeated key`)
        out[key] = fromTree(entry.value, `${path}.${key}`)
      }
      return out
    }
    default:
      throw new Malformed(`${path}: not a JSON tree`)
  }
}

/** The members of a closed object: exactly these keys, no other. */
function closed(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Malformed(`${path}: not an object`)
  const record = value as Record<string, unknown>
  const present = Object.keys(record)
  if (present.length !== keys.length || keys.some(key => !Object.hasOwn(record, key)))
    throw new Malformed(`${path}: the members are not ${keys.join(', ')}`)
  return record
}

/** The named members of an object that another owner may extend (the Session entry envelope). */
function open(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Malformed(`${path}: not an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Malformed(`${path}: not a text`)
  return value
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Malformed(`${path}: not a boolean`)
  return value
}

function revision(value: unknown, path: string): RegistrationRevision {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Malformed(`${path}: not a registration revision`)
  return value
}

function blockKey(value: unknown, path: string): ContextBlockKey {
  const decoded = decodeContextBlockKey(value)
  if ('failure' in decoded)
    throw new Malformed(`${path}: not a block key (${decoded.failure.reason})`)
  return decoded.ok
}

function scopeOf(value: unknown, path: string): ScopeRef {
  const decoded = decodeScopeRef({ ref: text(value, path) })
  if ('failure' in decoded) throw new Malformed(`${path}: not a scope (${decoded.failure.reason})`)
  return decoded.ok
}

function tenantOf(value: unknown, path: string): TenantId {
  const parsed = tenantCodec.parse(text(value, path))
  if (!parsed.ok) throw new Malformed(`${path}: not a tenant`)
  return parsed.value
}

function tenantText(tenant: TenantId, path: string): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Malformed(`${path}: the tenant was not minted by legal-identity`)
  return encoded.value
}

function adoptionOf(value: unknown, path: string): Adoption {
  const fields = closed(value, ['owner', 'name', 'revision', 'digest'], path)
  return {
    owner: text(fields['owner'], `${path}.owner`),
    name: text(fields['name'], `${path}.name`),
    revision: text(fields['revision'], `${path}.revision`),
    digest: text(fields['digest'], `${path}.digest`),
  }
}

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function material(value: unknown): ContextMaterial {
  return { schema: SESSION_CONTEXT_MATERIAL, value: toTree(value, 'material') }
}

/** The plain value of one material of this protocol. */
function materialValue(value: unknown, path: string): unknown {
  const fields = closed(value, ['schema', 'value'], path)
  if (!sameAdoption(adoptionOf(fields['schema'], `${path}.schema`), SESSION_CONTEXT_MATERIAL))
    throw new Malformed(`${path}: the schema is not ${SESSION_CONTEXT_MATERIAL.name}/1`)
  return fromTree(fields['value'], `${path}.value`)
}

/**
 * The failure of a preparation that threw: a material that does not decode is `invalid`; any other
 * throw (the definitions source failed) is a dependency failure, `unavailable` (AD-00 第 6 条).
 */
function preparationFailure(cause: unknown, field: string) {
  return cause instanceof Malformed
    ? fail({ kind: 'invalid' as const, field, reason: cause.message })
    : fail({
        kind: 'unavailable' as const,
        owner: DEFINITIONS_OWNER,
        diagnostic: `the materials could not be restored: ${describe(cause)}`,
      })
}

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

// --- Registrations ------------------------------------------------------------------------------

/** The registration materials as they appear in a creation source or a `change`. */
export type ContextRegistrationMaterials = Readonly<{
  need: ContextMaterial
  binding: ContextMaterial
  parameters: ContextMaterial
}>

/** The part of a change that Session fixes for an initial registration (its SE07 decision). */
type RegistrationHead = Readonly<{
  tenant: TenantId
  scope: ScopeRef
  basedOn: RegistrationRevision
  creating: boolean
  commit: CommitRef
  scopeEnded: boolean
}>

type RegistrationBody = Readonly<{
  definition: Adoption
  kind: RegistrationChange['kind']
  key: ContextBlockKey
  required: boolean | null
  bindings: readonly NeedBinding[]
  parameters: unknown
  declaration: StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined
}>

function bindingRefs(
  definition: Adoption,
  bindings: readonly NeedBinding[],
  definitions: SessionContextDefinitions,
) {
  return bindings.map((binding, index) => {
    const ref = { definition, need: binding.need.name, key: binding.key }
    // Only a binding that the adopted definition gives back can be restored from its reference.
    if (definitions.binding(ref) !== binding)
      throw new Malformed(`bindings[${index}]: not a binding of the adopted definition`)
    return { need: ref.need, key: ref.key }
  })
}

function encodeRegistration(
  body: RegistrationBody,
  head: RegistrationHead | null,
  definitions: SessionContextDefinitions,
): ContextRegistrationMaterials {
  if (body.declaration !== undefined) {
    if (
      definitions.declaration({ definition: body.definition, key: body.key }) !== body.declaration
    )
      throw new Malformed('declaration: not the declaration of the adopted definition')
  }
  const refs = bindingRefs(body.definition, body.bindings, definitions)
  return {
    need: material({
      version: 1,
      definition: { ...body.definition },
      kind: body.kind,
      key: body.key,
      required: body.required,
      declared: body.declaration !== undefined,
      head:
        head === null
          ? null
          : {
              tenant: tenantText(head.tenant, 'tenant'),
              scope: head.scope.ref,
              basedOn: head.basedOn,
              creating: head.creating,
              commit: head.commit.commit,
              scopeEnded: head.scopeEnded,
            },
    }),
    binding: material({ version: 1, bindings: refs }),
    parameters: material(
      body.parameters === undefined
        ? { version: 1, defined: false, value: null }
        : { version: 1, defined: true, value: body.parameters },
    ),
  }
}

type DecodedRegistration = Readonly<{ body: RegistrationBody; head: RegistrationHead | null }>

function decodeRegistration(
  materials: Readonly<{ need: unknown; binding: unknown; parameters: unknown }>,
  definitions: SessionContextDefinitions,
): DecodedRegistration {
  const need = closed(
    materialValue(materials.need, 'need'),
    ['version', 'definition', 'kind', 'key', 'required', 'declared', 'head'],
    'need',
  )
  if (need['version'] !== 1) throw new Malformed('need: an unknown version')
  const definition = adoptionOf(need['definition'], 'need.definition')
  const kind = need['kind']
  if (kind !== 'add' && kind !== 'update' && kind !== 'remove')
    throw new Malformed('need.kind: not add, update or remove')
  const key = blockKey(need['key'], 'need.key')
  const required = need['required'] === null ? null : flag(need['required'], 'need.required')
  if ((kind === 'add') !== (required !== null))
    throw new Malformed('need.required: only an add carries the necessity')
  const declared = flag(need['declared'], 'need.declared')
  if (declared && kind !== 'add')
    throw new Malformed('need.declared: only an add brings a declaration')
  let head: RegistrationHead | null = null
  if (need['head'] !== null) {
    const fields = closed(
      need['head'],
      ['tenant', 'scope', 'basedOn', 'creating', 'commit', 'scopeEnded'],
      'need.head',
    )
    head = {
      tenant: tenantOf(fields['tenant'], 'need.head.tenant'),
      scope: scopeOf(fields['scope'], 'need.head.scope'),
      basedOn: revision(fields['basedOn'], 'need.head.basedOn'),
      creating: flag(fields['creating'], 'need.head.creating'),
      commit: { commit: text(fields['commit'], 'need.head.commit') },
      scopeEnded: flag(fields['scopeEnded'], 'need.head.scopeEnded'),
    }
  }

  const binding = closed(
    materialValue(materials.binding, 'binding'),
    ['version', 'bindings'],
    'binding',
  )
  if (binding['version'] !== 1) throw new Malformed('binding: an unknown version')
  const refs = binding['bindings']
  if (!Array.isArray(refs)) throw new Malformed('binding.bindings: not a list')
  if (kind === 'remove' && refs.length > 0) throw new Malformed('binding: a remove binds nothing')
  const bindings = refs.map((value: unknown, index) => {
    const path = `binding.bindings[${index}]`
    const ref = closed(value, ['need', 'key'], path)
    const restored = definitions.binding({
      definition,
      need: text(ref['need'], `${path}.need`),
      key: blockKey(ref['key'], `${path}.key`),
    })
    if (restored === undefined || restored.need.name !== ref['need'] || restored.key !== ref['key'])
      throw new Malformed(`${path}: the adopted definition has no such binding`)
    return restored
  })

  const parameters = closed(
    materialValue(materials.parameters, 'parameters'),
    ['version', 'defined', 'value'],
    'parameters',
  )
  if (parameters['version'] !== 1) throw new Malformed('parameters: an unknown version')
  const defined = flag(parameters['defined'], 'parameters.defined')
  if (!defined && parameters['value'] !== null)
    throw new Malformed('parameters.value: an undefined value is null')

  let declaration: RegistrationBody['declaration']
  if (declared) {
    declaration = definitions.declaration({ definition, key })
    if (declaration === undefined || declaration.key !== key)
      throw new Malformed('need.declared: the adopted definition has no declaration of this block')
  }
  return {
    body: {
      definition,
      kind,
      key,
      required,
      bindings,
      parameters: defined ? parameters['value'] : undefined,
      declaration,
    },
    head,
  }
}

function changeOf(
  body: RegistrationBody,
  head: Pick<RegistrationHead, 'tenant' | 'scope' | 'basedOn' | 'creating'>,
): RegistrationChange {
  const base = {
    scope: head.scope,
    tenant: head.tenant,
    key: body.key,
    basedOn: head.basedOn,
    creating: head.creating,
  }
  switch (body.kind) {
    case 'remove':
      return { ...base, kind: 'remove' }
    case 'update':
      return { ...base, kind: 'update', bindings: body.bindings, parameters: body.parameters }
    case 'add':
      return {
        ...base,
        kind: 'add',
        bindings: body.bindings,
        parameters: body.parameters,
        required: body.required === true,
        ...(body.declaration === undefined ? {} : { declaration: body.declaration }),
      }
    default: {
      const exhaustive: never = body.kind
      return exhaustive
    }
  }
}

function bodyOf(change: RegistrationChange, definition: Adoption): RegistrationBody {
  switch (change.kind) {
    case 'remove':
      return {
        definition,
        kind: 'remove',
        key: change.key,
        required: null,
        bindings: [],
        parameters: undefined,
        declaration: undefined,
      }
    case 'update':
      return {
        definition,
        kind: 'update',
        key: change.key,
        required: null,
        bindings: change.bindings,
        parameters: change.parameters,
        declaration: undefined,
      }
    case 'add':
      return {
        definition,
        kind: 'add',
        key: change.key,
        required: change.required,
        bindings: change.bindings,
        parameters: change.parameters,
        declaration: change.declaration,
      }
    default: {
      const exhaustive: never = change
      return exhaustive
    }
  }
}

/**
 * The materials of one initial registration in a creation source (`context-registration`). Session
 * fixes the scope, the tenant, the revision and the commit of an initial registration in its SE07
 * decision, so the materials carry none of them; the registration is an add, creating and required.
 */
export function encodeInitialContextRegistration(
  input: Readonly<{
    definition: Adoption
    key: ContextBlockKey
    bindings: readonly NeedBinding[]
    parameters: unknown
    declaration?: StatefulBlockDescriptor<ContextBlockKey, unknown, unknown>
  }>,
  definitions: SessionContextDefinitions,
): Outcome<ContextRegistrationMaterials, string> {
  try {
    return succeed(
      encodeRegistration(
        {
          definition: input.definition,
          kind: 'add',
          key: input.key,
          required: true,
          bindings: input.bindings,
          parameters: input.parameters,
          declaration: input.declaration,
        },
        null,
        definitions,
      ),
    )
  } catch (cause) {
    return fail(describe(cause))
  }
}

/**
 * The materials of one registration change that a `change` commits. The commit identity derives
 * from the scope, the `change` operation and the block key (`contextChangeCommit`).
 */
export function encodeContextRegistrationChange(
  input: Readonly<{
    change: RegistrationChange
    definition: Adoption
    operation: SessionOperationId
    scopeEnded?: boolean
  }>,
  definitions: SessionContextDefinitions,
): Outcome<ContextRegistrationMaterials, string> {
  const { change } = input
  try {
    return succeed(
      encodeRegistration(
        bodyOf(change, input.definition),
        {
          tenant: change.tenant,
          scope: change.scope,
          basedOn: change.basedOn,
          creating: change.creating,
          commit: contextChangeCommit({
            scope: change.scope,
            operation: input.operation,
            key: change.key,
          }),
          scopeEnded: input.scopeEnded === true,
        },
        definitions,
      ),
    )
  } catch (cause) {
    return fail(describe(cause))
  }
}

// --- Step commits -------------------------------------------------------------------------------

type StepDeclaration = Extract<DeclarationChange, { kind: 'context-step-commit' }>

function updateTree(update: ContextUpdate) {
  return {
    origin: update.origin.origin,
    key: update.key,
    update: update.update,
    writer: update.writer,
  }
}

const WRITERS: ReadonlySet<string> = new Set<ConsumerClass>([
  'model',
  'tool',
  'extension',
  'coordinator',
])

function updateOf(value: unknown, path: string): ContextUpdate {
  const fields = closed(value, ['origin', 'key', 'update', 'writer'], path)
  const writer = fields['writer']
  if (typeof writer !== 'string' || !WRITERS.has(writer))
    throw new Malformed(`${path}.writer: not a consumer class`)
  return {
    origin: { origin: text(fields['origin'], `${path}.origin`) },
    key: blockKey(fields['key'], `${path}.key`),
    update: fields['update'],
    writer: writer as ConsumerClass,
  }
}

/**
 * The block list of one `change(context-step-commit)`: a head element (`@step`) with the tenant,
 * the scope, the step, the commit identity, the ends and the pending updates, then one element per
 * committed block with its full value and the updates folded into it. Block values and updates must
 * be JSON data. The caller adds the `basis` of the declaration.
 */
export function encodeContextStepCommit(
  input: Readonly<{
    tenant: TenantId
    stepCommit: StepCommit
    executionEnded: boolean
    scopeEnded?: boolean
    operation: SessionOperationId
  }>,
): Outcome<Pick<StepDeclaration, 'updates'>, string> {
  const { stepCommit } = input
  try {
    const keys = new Set<string>()
    const blocks = stepCommit.committed.map((block, index) => {
      if (keys.has(block.key)) throw new Malformed(`committed[${index}]: the block appears twice`)
      keys.add(block.key)
      return {
        block: block.key,
        value: material({
          version: 1,
          value: block.value,
          updates: block.updates.map(updateTree),
        }),
      }
    })
    const head = {
      block: STEP_HEAD,
      value: material({
        version: 1,
        tenant: tenantText(input.tenant, 'tenant'),
        scope: stepCommit.scope.ref,
        step: stepCommit.step.step,
        commit: contextStepCommit({ scope: stepCommit.scope, operation: input.operation }).commit,
        executionEnded: input.executionEnded,
        scopeEnded: input.scopeEnded === true,
        pending: stepCommit.pending.map(updateTree),
      }),
    }
    return succeed({ updates: [head, ...blocks] })
  } catch (cause) {
    return fail(describe(cause))
  }
}

type StepInput = Extract<CommitInput, { kind: 'step' }>

function decodeStep(updates: unknown): StepInput {
  if (!Array.isArray(updates) || updates.length === 0)
    throw new Malformed('updates: a step commit starts with its head')
  const [first, ...rest] = updates
  const headElement = closed(first, ['block', 'value'], 'updates[0]')
  if (headElement['block'] !== STEP_HEAD) throw new Malformed('updates[0]: not the step head')
  const head = closed(
    materialValue(headElement['value'], 'updates[0].value'),
    ['version', 'tenant', 'scope', 'step', 'commit', 'executionEnded', 'scopeEnded', 'pending'],
    'updates[0].value',
  )
  if (head['version'] !== 1) throw new Malformed('updates[0]: an unknown version')
  const pending = head['pending']
  if (!Array.isArray(pending)) throw new Malformed('updates[0].pending: not a list')
  const keys = new Set<string>()
  const committed: StepBlockMaterial[] = rest.map((element: unknown, index) => {
    const path = `updates[${index + 1}]`
    const fields = closed(element, ['block', 'value'], path)
    const key = blockKey(fields['block'], `${path}.block`)
    if (keys.has(key)) throw new Malformed(`${path}: the block appears twice`)
    keys.add(key)
    const value = closed(
      materialValue(fields['value'], `${path}.value`),
      ['version', 'value', 'updates'],
      `${path}.value`,
    )
    if (value['version'] !== 1) throw new Malformed(`${path}: an unknown version`)
    const folded = value['updates']
    if (!Array.isArray(folded)) throw new Malformed(`${path}.updates: not a list`)
    return {
      key,
      value: value['value'],
      updates: folded.map((update: unknown, at) => updateOf(update, `${path}.updates[${at}]`)),
    }
  })
  return {
    kind: 'step',
    commit: { commit: text(head['commit'], 'updates[0].commit') },
    tenant: tenantOf(head['tenant'], 'updates[0].tenant'),
    stepCommit: {
      scope: scopeOf(head['scope'], 'updates[0].scope'),
      step: { step: text(head['step'], 'updates[0].step') },
      committed,
      pending: pending.map((update: unknown, at) => updateOf(update, `updates[0].pending[${at}]`)),
    },
    executionEnded: flag(head['executionEnded'], 'updates[0].executionEnded'),
    ...(flag(head['scopeEnded'], 'updates[0].scopeEnded') ? { scopeEnded: true as const } : {}),
  }
}

// --- The translation (decoding) -----------------------------------------------------------------

/**
 * AD-12's translation protocol in the reading direction, in the shape AD-03's replay takes
 * (`SessionContextTranslation` of `context-holder.ts`): the Runtime Context commit input that one
 * committed Session entry records, `null` for an entry that records none, a failure for a record
 * that the protocol cannot read.
 */
export type SessionContextCommitTranslation = Readonly<{
  kinds: readonly string[]
  commitOf(entry: HistoryEntry): Outcome<CommitInput | null, string>
}>

/** A plain object of the entry payload, through the Session entry tree. */
function payloadOf(entry: HistoryEntry): Record<string, unknown> {
  return open(fromTree(entry.payload, 'payload'), 'payload')
}

function decodeRegistrationEntry(
  payload: Record<string, unknown>,
  definitions: SessionContextDefinitions,
): CommitInput | null {
  const declaration = open(payload['declaration'], 'declaration')
  if (declaration['kind'] !== 'context-registration') return null
  const recorded = text(payload['scope'], 'scope')
  const initialization = payload['initialization']
  if (initialization !== undefined && initialization !== null) {
    // An initial registration: Session's SE07 decision fixes the scope, tenant, revisions and commit.
    const decision = open(open(initialization, 'initialization')['decision'], 'decision')
    const { body, head } = decodeRegistration(
      { need: decision['need'], binding: decision['binding'], parameters: decision['parameters'] },
      definitions,
    )
    if (head !== null) throw new Malformed('need.head: an initial registration has no head')
    const key = blockKey(decision['key'], 'decision.key')
    if (body.kind !== 'add' || body.required !== true || body.key !== key)
      throw new Malformed('decision: the materials are not the initial add of this block')
    if (decision['creating'] !== true || decision['required'] !== true)
      throw new Malformed('decision: an initial registration is creating and required')
    const scope = scopeOf(decision['scope'], 'decision.scope')
    if (scope.ref !== recorded) throw new Malformed('decision.scope: not the scope of the entry')
    return {
      kind: 'registration',
      commit: { commit: text(decision['commit'], 'decision.commit') },
      change: changeOf(body, {
        tenant: tenantOf(decision['tenant'], 'decision.tenant'),
        scope,
        basedOn: revision(decision['basedOn'], 'decision.basedOn'),
        creating: true,
      }),
    }
  }
  const { body, head } = decodeRegistration(
    {
      need: declaration['need'],
      binding: declaration['binding'],
      parameters: declaration['parameters'],
    },
    definitions,
  )
  if (head === null)
    throw new Malformed('need.head: a later registration names its scope and commit')
  if (head.scope.ref !== recorded)
    throw new Malformed('need.head.scope: not the scope of the entry')
  return {
    kind: 'registration',
    commit: head.commit,
    change: changeOf(body, head),
    ...(head.scopeEnded ? { scopeEnded: true as const } : {}),
  }
}

function decodeStepEntry(payload: Record<string, unknown>): CommitInput | null {
  const declaration = open(payload['declaration'], 'declaration')
  if (declaration['kind'] !== 'context-step-commit') return null
  const step = decodeStep(declaration['updates'])
  if (step.stepCommit.scope.ref !== text(payload['scope'], 'scope'))
    throw new Malformed('updates[0].scope: not the scope of the entry')
  return step
}

/**
 * AD-12's translation protocol for AD-03's replay: hand the result to `createSessionContextHolder`
 * as its `translation`. `definitions` gives back the bindings and declarations that the materials
 * reference. The end of a scope (SE27) does not name its tenant: the translation takes it from the
 * scope's earlier registrations and step commits, which every replay reads first because it reads
 * the session log from its start. The end of a scope that has neither is `null` (a named limitation:
 * such a scope has no registration to end). The end of a scope whose tenant the bounded table
 * evicted fails, so the holder reads the session again instead of leaving the scope open.
 */
export function createSessionContextTranslation(
  definitions: SessionContextDefinitions,
  options: Readonly<{ scopeTenants?: number }> = {},
): SessionContextCommitTranslation {
  const bound = options.scopeTenants ?? SCOPE_TENANTS
  /** scope text → its tenant; a derivative of decoded records, the oldest goes first. */
  const tenants = new Map<string, TenantId>()
  /**
   * The scopes whose tenant was evicted. The end of such a scope fails, so the holder reads the
   * session as unreadable instead of never ending the scope. When this set would outgrow its own
   * bound, `forgotten` is set: from then on no unknown scope can be told from an evicted one.
   */
  const evicted = new Set<string>()
  let forgotten = false
  function learn(input: CommitInput): void {
    const scope =
      input.kind === 'registration'
        ? input.change.scope
        : input.kind === 'step'
          ? input.stepCommit.scope
          : input.scope
    const tenant = input.kind === 'registration' ? input.change.tenant : input.tenant
    const known = tenants.get(scope.ref)
    if (known !== undefined && !tenantEquals(known, tenant))
      throw new Malformed(`scope ${scope.ref} is named with two tenants`)
    tenants.delete(scope.ref)
    tenants.set(scope.ref, tenant)
    evicted.delete(scope.ref)
    if (tenants.size > bound) {
      const oldest = tenants.keys().next()
      if (!oldest.done) {
        tenants.delete(oldest.value)
        if (evicted.size >= bound) forgotten = true
        else evicted.add(oldest.value)
      }
    }
  }
  function translate(entry: HistoryEntry): CommitInput | null {
    switch (entry.kind) {
      case REGISTRATION_KIND: {
        const input = decodeRegistrationEntry(payloadOf(entry), definitions)
        if (input !== null) learn(input)
        return input
      }
      case STEP_KIND: {
        const input = decodeStepEntry(payloadOf(entry))
        if (input !== null) learn(input)
        return input
      }
      case ARCHIVED_KIND: {
        const payload = payloadOf(entry)
        const binding = open(payload['scope'], 'scope')
        if (binding['ended'] === null || binding['ended'] === undefined) return null
        const scope = scopeOf(binding['scope'], 'scope.scope')
        const tenant = tenants.get(scope.ref)
        if (tenant === undefined) {
          // Only a scope with no registration and no step commit ends as null. A scope whose
          // tenant this translation forgot fails: answering null would leave it open for ever.
          if (evicted.has(scope.ref) || forgotten)
            throw new Error(`the tenant of scope ${scope.ref} was evicted; read the session again`)
          return null
        }
        return {
          kind: 'scope',
          commit: contextScopeEndCommit({
            scope: scope.ref,
            operation: text(payload['operation'], 'operation'),
          }),
          scope,
          tenant,
          scopeEnded: true,
        }
      }
      default:
        return null
    }
  }
  return Object.freeze({
    kinds: Object.freeze([REGISTRATION_KIND, STEP_KIND, ARCHIVED_KIND]),
    commitOf(entry: HistoryEntry): Outcome<CommitInput | null, string> {
      try {
        return succeed(translate(entry))
      } catch (cause) {
        return fail(`${entry.kind} ${entry.id}: ${describe(cause)}`)
      }
    },
  })
}

// --- Preparing ----------------------------------------------------------------------------------

function unavailable(diagnostic: string, owner = CONTEXT_OWNER) {
  return fail({ kind: 'unavailable' as const, owner, diagnostic })
}

function sameChange(left: RegistrationChange, right: RegistrationChange): boolean {
  return (
    left.kind === right.kind &&
    left.key === right.key &&
    left.basedOn === right.basedOn &&
    left.creating === right.creating &&
    left.scope.ref === right.scope.ref &&
    tenantEquals(left.tenant, right.tenant)
  )
}

/**
 * The adapter function that prepares one registration change with Runtime Context's
 * `prepareRegistration`: the plugin uses it for a `change`, and the adoption source reuses it for
 * the registrations of `completeInitialization` (AD-10). `prepared` gives the guard material;
 * `rejected` is `invalid` with each reason; every other answer, including a refusal, is
 * `unavailable` with the answer in the diagnostic (AD-00 第 6 条). It never calls `applyCommit`.
 */
export async function prepareContextRegistration<P>(
  holder: Pick<RuntimeContextOperations<P>, 'prepareRegistration'>,
  principal: P,
  change: RegistrationChange,
  commit: CommitRef,
): Promise<
  Outcome<
    Readonly<{
      judged: JudgedRegistration
      currentRevision: RegistrationRevision
      material: GuardCommand
    }>,
    SessionFailure
  >
> {
  let answer: Awaited<ReturnType<RuntimeContextOperations<P>['prepareRegistration']>>
  try {
    answer = await holder.prepareRegistration(principal, change)
  } catch (cause) {
    return unavailable(`prepareRegistration threw: ${describe(cause)}`)
  }
  switch (answer.kind) {
    case 'prepared': {
      // The judged change must be the change that Session will commit (session-contract「初始注册的
      // 身份与修订」): a provider that judged another change gives no material.
      if (!sameChange(answer.judged.change, change))
        return unavailable('prepareRegistration judged another change than the one it was given')
      let facts: JsonValue
      try {
        facts = toTree(
          {
            version: 1,
            kind: 'registration',
            commit: commit.commit,
            scope: change.scope.ref,
            key: change.key,
            change: change.kind,
            basedOn: change.basedOn,
            currentRevision: answer.currentRevision,
            coverage: answer.judged.coverage,
          },
          'facts',
        )
      } catch (cause) {
        return unavailable(`the prepared registration has no material: ${describe(cause)}`)
      }
      return succeed({
        judged: answer.judged,
        currentRevision: answer.currentRevision,
        material: {
          owner: CONTEXT_OWNER,
          participant: PARTICIPANT,
          protocol: SESSION_CONTEXT_INPUT,
          facts,
        },
      })
    }
    case 'rejected':
      return fail({
        kind: 'invalid' as const,
        field: 'declaration',
        reason: `the registration is rejected: ${answer.rejections
          .map(
            rejection =>
              `${rejection.reason}${rejection.path.length > 0 ? ` at ${rejection.path.join('.')}` : ''}`,
          )
          .join('; ')}`,
      })
    case 'refused':
      return unavailable(`prepareRegistration refused: ${answer.reason}`)
    case 'unavailable':
    case 'unknown':
      return unavailable(`prepareRegistration answered ${answer.kind} (${answer.cause})`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

/** What the assembly hands to AD-12. */
export type SessionContextInputPluginInput<P> = Readonly<{
  /**
   * The principal that the assembly issues to the coordinator of one session: the holder principal
   * of its scope (the same port as AD-03's and AD-14's). `prepareRegistration` runs under it.
   */
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
  definitions: SessionContextDefinitions
}>

type ContextCommand = Parameters<SessionContextInput<unknown>['prepare']>[1]
type Prepared = Awaited<ReturnType<SessionContextInput<unknown>['prepare']>>

class SessionContextInputProvider<P> extends SessionContextInputService<P> {
  private readonly holder: RuntimeContextOperations<P>
  private readonly given: SessionContextInputPluginInput<P>
  private closed = false

  constructor(ctx: Context, given: SessionContextInputPluginInput<P>) {
    super(ctx)
    this.given = given
    this.holder = ctx[runtimeContextKey] as RuntimeContextOperations<P>
    ctx.effect(() => () => {
      this.closed = true
    })
  }

  readonly prepare: SessionContextInput<P>['prepare'] = async (access, command) => {
    if (this.closed) return unavailable('the Context input has stopped')
    // A command of another tenant or session than the access gets nothing, before any decoding.
    if (
      !tenantEquals(command.input.tenant, access.tenant) ||
      command.input.session !== access.session
    )
      return fail({ kind: 'denied' as const, action: command.kind })
    switch (command.kind) {
      case 'create':
        return this.creation(command)
      case 'change':
        return this.change(access, command)
      case 'startRun':
      case 'reload':
        // These commands carry no registration material: no Context material.
        return succeed([])
      default: {
        const exhaustive: never = command
        return exhaustive
      }
    }
  }

  /** Every registration source of a creation must be restorable; Session fixes the rest later. */
  private creation(command: Extract<ContextCommand, { kind: 'create' }>): Prepared {
    const sources = command.input.creation.initialization?.sources ?? []
    for (const [index, source] of sources.entries()) {
      if (source.kind !== 'context-registration') continue
      try {
        const { body, head } = decodeRegistration(source.input, this.given.definitions)
        if (head !== null || body.kind !== 'add' || body.required !== true)
          throw new Malformed('an initial registration is a required add without a head')
      } catch (cause) {
        return preparationFailure(cause, `creation.initialization.sources[${index}]`)
      }
    }
    return succeed([])
  }

  private async change(
    access: SessionAccess<P>,
    command: Extract<ContextCommand, { kind: 'change' }>,
  ): Promise<Prepared> {
    const { declaration, operation } = command.input
    const invalid = (reason: string) =>
      fail({ kind: 'invalid' as const, field: 'declaration', reason })
    if (declaration.kind === 'context-step-commit') {
      let step: StepInput
      try {
        step = decodeStep(declaration.updates)
      } catch (cause) {
        return preparationFailure(cause, 'declaration')
      }
      if (!tenantEquals(step.tenant, access.tenant))
        return fail({ kind: 'denied' as const, action: command.kind })
      if (
        step.commit.commit !== contextStepCommit({ scope: step.stepCommit.scope, operation }).commit
      )
        return invalid('the step commit identity does not derive from this change')
      const facts = toTree(
        {
          version: 1,
          kind: 'step',
          commit: step.commit.commit,
          scope: step.stepCommit.scope.ref,
          step: step.stepCommit.step.step,
          blocks: step.stepCommit.committed.map(block => block.key),
        },
        'facts',
      )
      return succeed([
        { owner: CONTEXT_OWNER, participant: PARTICIPANT, protocol: SESSION_CONTEXT_INPUT, facts },
      ])
    }
    if (declaration.kind !== 'context-registration') return succeed([])

    let decoded: DecodedRegistration
    try {
      decoded = decodeRegistration(declaration, this.given.definitions)
    } catch (cause) {
      return preparationFailure(cause, 'declaration')
    }
    const { body, head } = decoded
    if (head === null) return invalid('a later registration names its scope and commit')
    if (!tenantEquals(head.tenant, access.tenant))
      return fail({ kind: 'denied' as const, action: command.kind })
    if (
      head.commit.commit !==
      contextChangeCommit({ scope: head.scope, operation, key: body.key }).commit
    )
      return invalid('the registration commit identity does not derive from this change')

    let principal: Outcome<P, SessionCoordinatorPrincipalFailure>
    try {
      principal = await this.given.coordinator({ tenant: access.tenant, session: access.session })
    } catch (cause) {
      return unavailable(`the coordinator principal source threw: ${describe(cause)}`)
    }
    if ('failure' in principal)
      return principal.failure.kind === 'denied'
        ? fail({ kind: 'denied' as const, action: command.kind })
        : unavailable(`the coordinator principal is not available: ${principal.failure.kind}`)
    if (this.closed) return unavailable('the Context input has stopped')
    const prepared = await prepareContextRegistration(
      this.holder,
      principal.ok,
      changeOf(body, head),
      head.commit,
    )
    if ('failure' in prepared) return prepared
    return succeed([prepared.ok.material])
  }
}

/**
 * The AD-12 plugin `session-ad12`. It provides `sessionContextInput` and stays `PENDING` while
 * `runtimeContext` is absent. It calls no `session` operation.
 */
export function createSessionContextInputPlugin<P>(input: SessionContextInputPluginInput<P>) {
  return {
    name: 'session-ad12',
    inject: { [runtimeContextKey]: null },
    apply(ctx: Context) {
      new SessionContextInputProvider<P>(ctx, input)
    },
  }
}
