import { isObject } from './json.ts'
export { isObject } from './json.ts'
import { deriveAttributeDeclarations } from './declaration-rules.ts'
import schema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import retainedSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import retainedToolSchema from '../schema/resources/tool-definition.v2.schema.json' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import offerSchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import connectorSchema from '../schema/resources/connector.schema.json' with { type: 'json' }
import {
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type {
  AssetJudgeContext,
  AssetCategory,
  AssetContent,
  DeclarationResult,
  AssetJudgment,
  AssetOrigin,
  AttributeDeclaration,
  BodyContract,
  BodyCategory,
  BodyContracts,
  BodyContractSupply,
  NonConnectorBodyContracts,
  BodyJudgeContext,
  JsonSchema,
} from './types.ts'
import { BodyProviderUnavailableError } from './availability.ts'
import { isAssetCategory, isCapabilityName, normalizeWorkspaceDirectory } from './values.ts'
import {
  createSchemaRuntime,
  type SchemaValidator,
} from '@omne-harness-lite/content-blocks/schema-runtime'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'AssetCategory',
  'CapabilityName',
  'CapabilityId',
  'AssetRecordId',
  'AssetOrigin',
  'AssetOwner',
  'AssetContent',
  'AssetVersion',
  'LineageId',
  'CopyLineage',
  'AssetDefinition',
  'AttributeKind',
  'SettingCategory',
  'AttributeDomain',
  'AttributeDeclaration',
  'PermissionValue',
  'AttributeAssignment',
  'WorkspaceKey',
  'HoldingScope',
  'SharingId',
  'HoldingBasis',
  'VersionSelection',
  'AssetHolding',
  'CredentialRef',
  'WorkspaceCarrierManifest',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
const bodyCategories = [
  'tool',
  'loop_extension',
  'skill',
  'mcp',
  'slash_command',
  'connector',
] as const
function object(value: JsonValue | undefined): JsonObject | undefined {
  return isObject(value) ? value : undefined
}
function array(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : []
}
function positiveInteger(value: unknown): boolean {
  return (
    isNonNegativeJsonInteger(value) &&
    !/^-?0+(?:\.0+)?(?:[eE][+-]?[0-9]+)?(?![\s\S])/u.test(jsonNumberSource(value))
  )
}
function numericOne(value: unknown): boolean {
  return isJsonNumber(value) && positiveInteger(value) && Number(jsonNumberSource(value)) === 1
}
function jsonCopy(value: unknown): JsonValue | undefined {
  try {
    const parsed = readJsonStrict(writeJsonLossless(value))
    if ('failed' in parsed) throw new Error('lossless writer produced invalid JSON')
    return parsed.ok
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
function bodySchema(bodies: BodyContractSupply, category: BodyCategory): JsonSchema {
  return category === 'connector'
    ? (bodies.connector?.schema ?? connectorSchema)
    : bodies[category].schema
}
function resources(bodies: BodyContractSupply): readonly JsonSchema[] {
  return [
    identitySchema,
    offerSchema,
    contentSchema,
    retainedContentSchema,
    retainedToolSchema,
    retainedSchema,
    schema,
    ...bodyCategories.map(category => bodySchema(bodies, category)),
  ]
}
/** Validate configuration and capture the three responsibility closures at construction. */
export function bindBodyContracts(bodies: BodyContracts): BodyContracts
export function bindBodyContracts(bodies: NonConnectorBodyContracts): NonConnectorBodyContracts
export function bindBodyContracts(bodies: BodyContractSupply): BodyContractSupply
export function bindBodyContracts(bodies: BodyContractSupply): BodyContractSupply {
  for (const category of bodyCategories) {
    const port = bodies[category]
    if (category === 'connector' && !Object.hasOwn(bodies, category) && port === undefined) continue
    if (
      !Object.hasOwn(bodies, category) ||
      port === undefined ||
      port.category !== category ||
      typeof port.judge !== 'function' ||
      typeof port.deriveDeclarations !== 'function' ||
      typeof port.references !== 'function'
    )
      throw new TypeError(`missing or mismatched body contract: ${category}`)
  }
  function pin<C extends BodyCategory>(port: BodyContract<C>): BodyContract<C> {
    const resource = jsonCopy(port.schema)
    if (!isObject(resource) || typeof resource.$id !== 'string')
      throw new TypeError(`body Schema needs an id: ${port.category}`)
    return Object.freeze({ ...port, schema: resource })
  }
  const captured = {
    tool: pin(bodies.tool),
    loop_extension: pin(bodies.loop_extension),
    skill: pin(bodies.skill),
    mcp: pin(bodies.mcp),
    slash_command: pin(bodies.slash_command),
  }
  return bodies.connector === undefined
    ? Object.freeze(captured)
    : Object.freeze({ ...captured, connector: pin(bodies.connector) })
}
/** Ask one category's captured body contract; an absent connector port is an availability boundary. */
function judgeBody(
  bodies: BodyContractSupply,
  category: BodyCategory,
  body: unknown,
  context: BodyJudgeContext,
): string | undefined {
  const port = bodies[category]
  if (port === undefined) throw new BodyProviderUnavailableError()
  const result = port.judge(body, context)
  return 'rejected' in result ? result.rejected : undefined
}
interface Positions {
  readonly capabilities: readonly JsonObject[]
  readonly contents: readonly JsonObject[]
  readonly versions: readonly JsonValue[]
  readonly root?: JsonObject
}
/** Collects positions in traversal order; a plugin content contributes its members' identities. */
class PositionCollector {
  readonly capabilities: JsonObject[] = []
  readonly contents: JsonObject[] = []
  readonly versions: JsonValue[] = []
  capability(input: JsonValue | undefined): void {
    const entry = object(input)
    if (entry !== undefined) this.capabilities.push(entry)
  }
  content(input: JsonValue | undefined): void {
    const entry = object(input)
    if (entry === undefined) return
    this.contents.push(entry)
    if (entry.category === 'plugin')
      for (const member of array(entry.members)) this.capability(member)
  }
  version(input: JsonValue): void {
    this.versions.push(input)
    this.content(object(input)?.content)
  }
}
/** The positions each definition owns; definitions without an entry own none. */
const OWNED_POSITIONS: {
  readonly [N in SchemaDefName]?: (found: PositionCollector, value: JsonValue) => void
} = {
  CapabilityId: (found, value) => found.capability(value),
  AssetDefinition: (found, value) => {
    const root = object(value)
    if (root === undefined) return
    found.capability(root.capability)
    found.content(root.draft)
    for (const version of array(root.versions)) found.version(version)
  },
  AssetContent: (found, value) => found.content(value),
  AssetVersion: (found, value) => found.version(value),
  AssetHolding: (found, value) => found.capability(object(value)?.capability),
  WorkspaceCarrierManifest: (found, value) => {
    const root = object(value)
    if (root === undefined) return
    for (const entry of [...array(root.assets), ...array(root.assignments)])
      found.capability(object(entry)?.capability)
    for (const entry of array(root.disabled)) found.capability(entry)
  },
}
/** Traverse only the contract-owned positions. Opaque bodies and arbitrary values stay opaque. */
function positions(defName: SchemaDefName, value: JsonValue): Positions {
  const root = object(value)
  const found = new PositionCollector()
  // Own entries only: a name outside the table, inherited ones included, owns no positions.
  const walk = Object.hasOwn(OWNED_POSITIONS, defName) ? OWNED_POSITIONS[defName] : undefined
  walk?.(found, value)
  const { capabilities, contents, versions } = found
  return root === undefined
    ? { capabilities, contents, versions }
    : { capabilities, contents, versions, root }
}
function sameTenant(owner: JsonObject, tenant: JsonValue | undefined): boolean {
  const candidate = object(tenant)
  if (candidate === undefined) return false
  if (owner.kind === 'organization') return owner.organization === candidate.organization
  const owned = object(owner.tenant)
  return (
    owned !== undefined &&
    owned.organization === candidate.organization &&
    owned.account === candidate.account
  )
}
function duplicate(
  values: readonly JsonValue[],
  key: (value: JsonObject) => string | undefined,
): boolean {
  const seen = new Set<string>()
  for (const value of values) {
    const entry = object(value)
    if (entry === undefined) continue
    const token = key(entry)
    if (token !== undefined) {
      if (seen.has(token)) return true
      seen.add(token)
    }
  }
  return false
}
function capabilityKey(value: JsonValue | undefined): string | undefined {
  const entry = object(value)
  return entry !== undefined && typeof entry.category === 'string' && typeof entry.name === 'string'
    ? writeJsonLossless([entry.category, entry.name])
    : undefined
}
function exactIntegers(defName: SchemaDefName, p: Positions): boolean {
  if (p.versions.some(version => !positiveInteger(object(version)?.number))) return false
  const lineage =
    defName === 'CopyLineage'
      ? p.root
      : defName === 'AssetDefinition'
        ? object(p.root?.lineage)
        : undefined
  if (
    lineage !== undefined &&
    (!positiveInteger(lineage.sourceVersion) || !positiveInteger(lineage.imports))
  )
    return false
  const selection =
    defName === 'VersionSelection'
      ? p.root
      : defName === 'AssetHolding'
        ? object(p.root?.versionSelection)
        : undefined
  return selection?.kind !== 'pinned' || positiveInteger(selection.number)
}
function canonicalWorkspaceKey(defName: SchemaDefName, root: JsonObject | undefined): boolean {
  const scope =
    defName === 'HoldingScope'
      ? root
      : defName === 'AssetHolding'
        ? object(root?.holder)
        : undefined
  const key =
    defName === 'WorkspaceKey'
      ? root
      : scope?.layer === 'workspace'
        ? object(scope.workspace)
        : undefined
  if (key === undefined || typeof key.directory !== 'string') return true
  try {
    return normalizeWorkspaceDirectory(key.directory) === key.directory
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}
function isAssetOrigin(value: JsonValue | undefined): value is AssetOrigin {
  return value === 'official' || value === 'customized'
}
function ownerOf(defName: SchemaDefName, root: JsonObject | undefined): JsonObject | undefined {
  return defName === 'AssetOwner'
    ? root
    : defName === 'AssetDefinition'
      ? object(root?.owner)
      : undefined
}
/** The value under judgment: its contract-owned positions and what embedded body contracts said. */
interface Candidate extends Positions {
  readonly defName: SchemaDefName
  readonly value: JsonValue
  readonly nested: readonly string[]
}
function manifestFormatUnsupported(defName: SchemaDefName, root: JsonObject | undefined): boolean {
  return (
    defName === 'WorkspaceCarrierManifest' &&
    root !== undefined &&
    Object.hasOwn(root, 'format') &&
    !numericOne(root.format)
  )
}
/** Visible record facts a body contract may read: the record's name and a known origin. */
function bodyJudgeContext(defName: SchemaDefName, root: JsonObject | undefined): BodyJudgeContext {
  if (defName !== 'AssetDefinition') return {}
  const name = object(root?.capability)?.name
  const origin = root?.origin
  return {
    ...(typeof name === 'string' ? { capabilityName: name } : {}),
    ...(isAssetOrigin(origin) ? { origin } : {}),
  }
}
/** Each draft and version body goes to its own category's contract, in position order. */
function contentBodyRejections(
  bodies: BodyContractSupply,
  contents: readonly JsonObject[],
  context: BodyJudgeContext,
): string[] {
  const rejections: string[] = []
  for (const entry of contents) {
    const category = entry.category
    if (!isAssetCategory(category) || category === 'plugin' || category === 'agent_definition')
      continue
    const body =
      category === 'tool'
        ? entry.definition
        : category === 'loop_extension'
          ? entry.extension
          : entry.body
    const rejection = body === undefined ? 'malformed' : judgeBody(bodies, category, body, context)
    if (rejection !== undefined) rejections.push(rejection)
  }
  return rejections
}
/** The `$ref` of a setting declaration whose domain points at a named Schema definition. */
function settingSchemaRef(
  declarations: readonly AttributeDeclaration[],
  item: JsonValue | undefined,
): string | undefined {
  const declaration = declarations.find(candidate => candidate.item === item)
  if (declaration?.kind !== 'setting') return undefined
  const schema = declaration.domain.schema
  return isObject(schema) && typeof schema.$ref === 'string' ? schema.$ref : undefined
}
/** A value whose domain is a body contract's definition is judged by that contract. */
function bodyDefinitionRejections(
  bodies: BodyContractSupply,
  ref: string,
  value: JsonValue | undefined,
): string[] {
  const rejections: string[] = []
  for (const category of bodyCategories) {
    const resource = object(bodySchema(bodies, category))
    if (typeof resource?.$id !== 'string' || !ref.startsWith(`${resource.$id}#/$defs/`)) continue
    const definition = ref.slice(`${resource.$id}#/$defs/`.length)
    if (!isObject(resource.$defs) || !Object.hasOwn(resource.$defs, definition))
      throw new TypeError('declaration references an unknown body definition')
    const rejection = judgeBody(bodies, category, value, { definition })
    if (rejection !== undefined) rejections.push(rejection)
  }
  return rejections
}
function settingValueRejections(
  bodies: BodyContractSupply,
  defName: SchemaDefName,
  value: JsonValue,
  root: JsonObject | undefined,
  declarations: readonly AttributeDeclaration[] | undefined,
): string[] {
  if (
    declarations === undefined ||
    (defName !== 'AttributeAssignment' && defName !== 'AssetHolding')
  )
    return []
  const assignments = defName === 'AttributeAssignment' ? [value] : array(root?.assignments)
  const rejections: string[] = []
  for (const assignment of assignments) {
    const entry = object(assignment)
    const ref = settingSchemaRef(declarations, entry?.item)
    if (entry === undefined || ref === undefined) continue
    rejections.push(...bodyDefinitionRejections(bodies, ref, entry.value))
  }
  return rejections
}
function categoryUnknown(c: Candidate): boolean {
  return (
    (c.defName === 'AssetCategory' && !isAssetCategory(c.value)) ||
    [...c.capabilities, ...c.contents].some(
      entry => Object.hasOwn(entry, 'category') && !isAssetCategory(entry.category),
    ) ||
    c.nested.includes('category_unknown')
  )
}
function originUnknown(c: Candidate): boolean {
  return (
    (c.defName === 'AssetOrigin' && !isAssetOrigin(c.value)) ||
    (c.defName === 'AssetDefinition' &&
      c.root !== undefined &&
      Object.hasOwn(c.root, 'origin') &&
      !isAssetOrigin(c.root.origin)) ||
    c.nested.includes('origin_unknown')
  )
}
function ownerKindUnknown(c: Candidate): boolean {
  const owner = ownerOf(c.defName, c.root)
  return (
    owner !== undefined &&
    Object.hasOwn(owner, 'kind') &&
    owner.kind !== 'organization' &&
    owner.kind !== 'tenant'
  )
}
function nameInvalid(c: Candidate): boolean {
  return (
    (c.defName === 'CapabilityName' && typeof c.value === 'string' && !isCapabilityName(c.value)) ||
    c.capabilities.some(entry => typeof entry.name === 'string' && !isCapabilityName(entry.name)) ||
    c.nested.includes('name_invalid')
  )
}
/** A body contract's own rejection, carried under its name; the shared names rank above it. */
function bodyContractRejection(nested: readonly string[]): string | undefined {
  return nested.find(
    rejection =>
      rejection !== 'malformed' &&
      !['category_unknown', 'origin_unknown', 'name_invalid'].includes(rejection),
  )
}
function pluginMemberIsPlugin(c: Candidate): boolean {
  return c.contents.some(
    entry =>
      entry.category === 'plugin' &&
      array(entry.members).some(member => object(member)?.category === 'plugin'),
  )
}
function versionSequenceBroken(c: Candidate): boolean {
  return (
    c.defName === 'AssetDefinition' &&
    c.versions.length > 0 &&
    c.versions.every(version => positiveInteger(object(version)?.number)) &&
    c.versions.some((version, index) => {
      const number = object(version)?.number
      return !isJsonNumber(number) || Number(jsonNumberSource(number)) !== index + 1
    })
  )
}
function assignmentItemDuplicate(c: Candidate): boolean {
  if (c.defName === 'AssetHolding')
    return duplicate(array(c.root?.assignments), entry =>
      typeof entry.item === 'string' ? entry.item : undefined,
    )
  if (c.defName === 'WorkspaceCarrierManifest')
    return duplicate(array(c.root?.assignments), entry => {
      const key = capabilityKey(entry.capability)
      return key !== undefined && typeof entry.item === 'string'
        ? writeJsonLossless([key, entry.item])
        : undefined
    })
  return false
}
function manifestSourceEscapes(c: Candidate): boolean {
  return (
    c.defName === 'WorkspaceCarrierManifest' &&
    array(c.root?.assets).some(entry => {
      const source = object(entry)?.source
      return (
        typeof source === 'string' &&
        (source.startsWith('/') ||
          /^[A-Za-z]:/u.test(source) ||
          source.includes('\\') ||
          source.split('/').includes('..'))
      )
    })
  )
}
/** S-27: the named rejection of highest precedence, ahead of the `malformed` remainder. */
function namedRejection(c: Candidate): string | undefined {
  if (categoryUnknown(c)) return 'category_unknown'
  if (originUnknown(c)) return 'origin_unknown'
  if (ownerKindUnknown(c)) return 'owner_kind_unknown'
  if (nameInvalid(c)) return 'name_invalid'
  const bodyRejection = bodyContractRejection(c.nested)
  if (bodyRejection !== undefined) return bodyRejection
  if (pluginMemberIsPlugin(c)) return 'plugin_member_is_plugin'
  if (versionSequenceBroken(c)) return 'version_sequence_broken'
  if (assignmentItemDuplicate(c)) return 'assignment_item_duplicate'
  if (manifestSourceEscapes(c)) return 'manifest_source_escapes'
  return undefined
}
/** An owned record's author and importer stay inside the owner's tenant. */
function authorshipLeavesOwner(c: Candidate): boolean {
  const owner = c.defName === 'AssetDefinition' ? object(c.root?.owner) : undefined
  if (c.root === undefined || owner === undefined) return false
  if (!sameTenant(owner, c.root.author)) return true
  const lineage = object(c.root.lineage)
  return lineage !== undefined && !sameTenant(owner, lineage.importedBy)
}
/** Section-three constraints Schema cannot express; each one is a `malformed` value. */
function violatesCrossMemberRules(c: Candidate, bodies: BodyContractSupply): boolean {
  return (
    !canonicalWorkspaceKey(c.defName, c.root) ||
    authorshipLeavesOwner(c) ||
    (c.defName === 'WorkspaceCarrierManifest' &&
      duplicate(array(c.root?.assets), entry => capabilityKey(entry.capability))) ||
    ((c.defName === 'AttributeDeclaration' || c.defName === 'AttributeDomain') &&
      c.root !== undefined &&
      !validDomain(c.root, bodies))
  )
}
export interface AssetModelJudge {
  readonly attributeDeclarationsOf: <C extends AssetCategory>(
    content: AssetContent & { readonly category: C },
    actionSnapshot?: JsonValue,
  ) => DeclarationResult<C>

  readonly judgeAssetValue: (
    defName: SchemaDefName,
    value: unknown,
    context?: AssetJudgeContext,
  ) => AssetJudgment
  readonly validate: (defName: SchemaDefName, value: unknown) => { readonly valid: boolean }
}
export function createAssetModelJudge(bodyContracts: BodyContractSupply): AssetModelJudge {
  const bodies = bindBodyContracts(bodyContracts)
  const runtime = createSchemaRuntime(resources(bodies))
  const validators = new Map<SchemaDefName, SchemaValidator>()
  for (const name of SCHEMA_DEF_NAMES) {
    const validator = runtime.compile({ $ref: `${schemaId}#/$defs/${name}` })
    validators.set(name, validator)
  }
  function validate(defName: SchemaDefName, input: unknown): { readonly valid: boolean } {
    const value = jsonCopy(input)
    const validator = validators.get(defName)
    if (validator === undefined) throw new TypeError(`unknown Schema definition: ${defName}`)
    return Object.freeze({
      valid:
        value !== undefined &&
        exactIntegers(defName, positions(defName, value)) &&
        validator.validate(value),
    })
  }
  function judgeAssetValue(
    defName: SchemaDefName,
    input: unknown,
    context?: AssetJudgeContext,
  ): AssetJudgment {
    const value = jsonCopy(input)
    if (value === undefined) return Object.freeze({ rejected: 'malformed' })
    const p = positions(defName, value)
    // The format outranks everything, so no body contract is consulted for an unknown format.
    if (manifestFormatUnsupported(defName, p.root))
      return Object.freeze({ rejected: 'manifest_format_unsupported' })
    const nested = [
      ...contentBodyRejections(bodies, p.contents, bodyJudgeContext(defName, p.root)),
      ...settingValueRejections(bodies, defName, value, p.root, context?.declarations),
    ]
    const candidate: Candidate = { ...p, defName, value, nested }
    const rejection = namedRejection(candidate)
    if (rejection !== undefined) return Object.freeze({ rejected: rejection })
    if (
      nested.includes('malformed') ||
      !validate(defName, value).valid ||
      violatesCrossMemberRules(candidate, bodies)
    )
      return Object.freeze({ rejected: 'malformed' })
    return Object.freeze({ ok: true })
  }
  const attributeDeclarationsOf: AssetModelJudge['attributeDeclarationsOf'] = (
    content,
    actionSnapshot,
  ) =>
    deriveAttributeDeclarations<typeof content.category>(
      content,
      bodies,
      judgeAssetValue,
      actionSnapshot,
    )
  return Object.freeze({ judgeAssetValue, validate, attributeDeclarationsOf })
}
function validDomain(root: JsonObject, bodies: BodyContractSupply): boolean {
  const domain = object(root.domain) ?? root
  if (domain.kind === 'enum')
    return !Object.hasOwn(root, 'default') || array(domain.values).includes(root.default ?? null)
  if (domain.kind !== 'open') return true
  const raw = domain.schema
  if (typeof raw !== 'boolean' && !isObject(raw)) return false
  // Caller schemas have no module-level cache. The local compiler dies with this invocation.
  const runtime = createSchemaRuntime(resources(bodies))
  if (!runtime.metaValidate(raw)) return false
  if (!Object.hasOwn(root, 'default')) return true
  let validator: SchemaValidator
  try {
    validator = runtime.compile(raw)
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
  return !Object.hasOwn(root, 'default') || validator.validate(root.default ?? null)
}
