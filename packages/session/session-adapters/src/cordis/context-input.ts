import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { writeJsonText, type JsonEntry, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeContextBlockKey,
  decodeScopeRef,
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
import type { RecordedCommit } from './context-holder.ts'

const OWNER = '@omne-harness/session-adapters'
const CONTEXT_OWNER = 'runtime-context'
const PARTICIPANT = 'context-input'
const DEFINITIONS_OWNER = 'context-definitions'

function protocol(name: string, revision = '1'): Adoption {
  return Object.freeze({
    owner: OWNER,
    name,
    revision,
    digest: `sha256:${createHash('sha256').update(`${OWNER}/${name}/${revision}`).digest('hex')}`,
  })
}

export const SESSION_CONTEXT_MATERIAL: Adoption = protocol('session-context-material', '2')
export const SESSION_CONTEXT_INPUT: Adoption = protocol('session-context-input')

const REGISTRATION_KIND = 'session.context-registration-changed'
const STEP_KIND = 'session.recovery-input-adopted'
const ARCHIVED_KIND = 'session.archived'
const STEP_HEAD = '@step'

export interface SessionContextDefinitions {
  binding(
    ref: Readonly<{ definition: Adoption; need: string; key: ContextBlockKey }>,
  ): NeedBinding | undefined
  declaration(
    ref: Readonly<{ definition: Adoption; key: ContextBlockKey }>,
  ): StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined
}

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

export function contextStepCommit(
  input: Readonly<{ scope: ScopeRef; operation: SessionOperationId }>,
): CommitRef {
  return { commit: JSON.stringify(['session-context-step', '1', input.scope.ref, input.operation]) }
}

export function contextScopeEndCommit(
  input: Readonly<{ scope: string; operation: string }>,
): CommitRef {
  return {
    commit: JSON.stringify(['session-context-scope-end', '1', input.scope, input.operation]),
  }
}

class Malformed extends Error {}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

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

function closed(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Malformed(`${path}: not an object`)
  const record = value as Record<string, unknown>
  const present = Object.keys(record)
  if (present.length !== keys.length || keys.some(key => !Object.hasOwn(record, key)))
    throw new Malformed(`${path}: the members are not ${keys.join(', ')}`)
  return record
}

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
  return {
    schema: SESSION_CONTEXT_MATERIAL,
    value: { kind: 'string', value: writeJsonText(toTree(value, 'material')) },
  }
}

function materialValue(value: unknown, path: string): unknown {
  const fields = closed(value, ['schema', 'value'], path)
  if (!sameAdoption(adoptionOf(fields['schema'], `${path}.schema`), SESSION_CONTEXT_MATERIAL))
    throw new Malformed(`${path}: the schema is not ${SESSION_CONTEXT_MATERIAL.name}/2`)
  const encoded = fromTree(fields['value'], `${path}.value`)
  if (typeof encoded !== 'string') throw new Malformed(`${path}: the material is not JSON text`)
  let decoded: unknown
  try {
    decoded = JSON.parse(encoded)
  } catch {
    throw new Malformed(`${path}: invalid JSON text`)
  }
  if (writeJsonText(toTree(decoded, path)) !== encoded)
    throw new Malformed(`${path}: noncanonical JSON text`)
  return decoded
}

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

export type ContextRegistrationMaterials = Readonly<{
  need: ContextMaterial
  binding: ContextMaterial
  parameters: ContextMaterial
}>

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

type StepInput = Extract<RecordedCommit, { kind: 'step' }>

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

export type SessionContextCommitTranslation = Readonly<{
  kinds: readonly string[]
  commitOf(
    entry: HistoryEntry,
    session: Readonly<{ tenant: TenantId }>,
  ): Outcome<RecordedCommit | null, string>
}>

function payloadOf(entry: HistoryEntry): Record<string, unknown> {
  return open(fromTree(entry.payload, 'payload'), 'payload')
}

function decodeRegistrationEntry(
  payload: Record<string, unknown>,
  definitions: SessionContextDefinitions,
): RecordedCommit | null {
  const declaration = open(payload['declaration'], 'declaration')
  if (declaration['kind'] !== 'context-registration') return null
  const recorded = text(payload['scope'], 'scope')
  const initialization = payload['initialization']
  if (initialization !== undefined && initialization !== null) {
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

function decodeStepEntry(payload: Record<string, unknown>): RecordedCommit | null {
  const declaration = open(payload['declaration'], 'declaration')
  if (declaration['kind'] !== 'context-step-commit') return null
  const step = decodeStep(declaration['updates'])
  if (step.stepCommit.scope.ref !== text(payload['scope'], 'scope'))
    throw new Malformed('updates[0].scope: not the scope of the entry')
  return step
}

export function createSessionContextTranslation(
  definitions: SessionContextDefinitions,
): SessionContextCommitTranslation {
  type SessionOfEntry = Readonly<{ tenant: TenantId }>
  function owned(input: RecordedCommit | null, session: SessionOfEntry): RecordedCommit | null {
    if (input === null) return null
    const tenant = input.kind === 'registration' ? input.change.tenant : input.tenant
    if (!tenantEquals(tenant, session.tenant))
      throw new Malformed('the record names another tenant than its session')
    return input
  }
  function translate(entry: HistoryEntry, session: SessionOfEntry): RecordedCommit | null {
    switch (entry.kind) {
      case REGISTRATION_KIND:
        return owned(decodeRegistrationEntry(payloadOf(entry), definitions), session)
      case STEP_KIND:
        return owned(decodeStepEntry(payloadOf(entry)), session)
      case ARCHIVED_KIND: {
        const payload = payloadOf(entry)
        const binding = open(payload['scope'], 'scope')
        if (binding['ended'] === null || binding['ended'] === undefined) return null
        const scope = scopeOf(binding['scope'], 'scope.scope')
        return {
          kind: 'scope',
          commit: contextScopeEndCommit({
            scope: scope.ref,
            operation: text(payload['operation'], 'operation'),
          }),
          scope,
          tenant: session.tenant,
          scopeEnded: true,
        }
      }
      default:
        return null
    }
  }
  return Object.freeze({
    kinds: Object.freeze([REGISTRATION_KIND, STEP_KIND, ARCHIVED_KIND]),
    commitOf(entry: HistoryEntry, session: SessionOfEntry): Outcome<RecordedCommit | null, string> {
      try {
        return succeed(translate(entry, session))
      } catch (cause) {
        return fail(`${entry.kind} ${entry.id}: ${describe(cause)}`)
      }
    },
  })
}

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
    tenantEquals(left.tenant, right.tenant) &&
    sameChangeBody(left, right)
  )
}

function sameChangeBody(left: RegistrationChange, right: RegistrationChange): boolean {
  if (left.kind === 'remove' || right.kind === 'remove') return left.kind === right.kind
  if (!isDeepStrictEqual(left.parameters, right.parameters)) return false
  if (!isDeepStrictEqual(left.bindings, right.bindings)) return false
  return (
    left.kind !== 'add' ||
    (right.kind === 'add' &&
      left.required === right.required &&
      left.declaration === right.declaration)
  )
}

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

export type SessionContextInputPluginInput<P> = Readonly<{
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
        return succeed([])
      default: {
        const exhaustive: never = command
        return exhaustive
      }
    }
  }

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

export function createSessionContextInputPlugin<P>(input: SessionContextInputPluginInput<P>) {
  return {
    name: 'session-ad12',
    inject: { [runtimeContextKey]: null },
    apply(ctx: Context) {
      new SessionContextInputProvider<P>(ctx, input)
    },
  }
}
