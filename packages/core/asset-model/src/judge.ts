import schema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import offerSchema from '@omne-harness-lite/offer-expiry/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import {
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type {
  AssetJudgeContext,
  AssetJudgment,
  BodyContract,
  BodyCategory,
  BodyContracts,
  BodyJudgeContext,
  JsonSchema,
} from './types.ts'
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
export function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
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
function resources(bodies: BodyContracts): readonly JsonSchema[] {
  return [
    identitySchema,
    offerSchema,
    contentSchema,
    schema,
    ...bodyCategories.map(category => bodies[category].schema),
  ]
}
/** Validate configuration and capture the three responsibility closures at construction. */
export function bindBodyContracts(bodies: BodyContracts): BodyContracts {
  for (const category of bodyCategories) {
    const port = bodies[category]
    if (
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
  return Object.freeze({
    tool: pin(bodies.tool),
    loop_extension: pin(bodies.loop_extension),
    skill: pin(bodies.skill),
    mcp: pin(bodies.mcp),
    slash_command: pin(bodies.slash_command),
    connector: pin(bodies.connector),
  })
}
interface Positions {
  readonly capabilities: readonly JsonObject[]
  readonly contents: readonly JsonObject[]
  readonly versions: readonly JsonValue[]
  readonly root?: JsonObject
}
/** Traverse only the contract-owned positions. Opaque bodies and arbitrary values stay opaque. */
function positions(defName: SchemaDefName, value: JsonValue): Positions {
  const root = object(value)
  const capabilities: JsonObject[] = []
  const contents: JsonObject[] = []
  const versions: JsonValue[] = []
  function capability(input: JsonValue | undefined): void {
    const entry = object(input)
    if (entry !== undefined) capabilities.push(entry)
  }
  function content(input: JsonValue | undefined): void {
    const entry = object(input)
    if (entry === undefined) return
    contents.push(entry)
    if (entry.category === 'plugin') for (const member of array(entry.members)) capability(member)
  }
  if (defName === 'CapabilityId') capability(value)
  if (defName === 'AssetDefinition' && root !== undefined) {
    capability(root.capability)
    content(root.draft)
    for (const version of array(root.versions)) {
      versions.push(version)
      content(object(version)?.content)
    }
  }
  if (defName === 'AssetContent') content(value)
  if (defName === 'AssetVersion') {
    versions.push(value)
    content(root?.content)
  }
  if (defName === 'AssetHolding') capability(root?.capability)
  if (defName === 'WorkspaceCarrierManifest' && root !== undefined) {
    for (const entry of [...array(root.assets), ...array(root.assignments)])
      capability(object(entry)?.capability)
    for (const entry of array(root.disabled)) capability(entry)
  }
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
export interface AssetModelJudge {
  readonly judgeAssetValue: (
    defName: SchemaDefName,
    value: unknown,
    context?: AssetJudgeContext,
  ) => AssetJudgment
  readonly validate: (defName: SchemaDefName, value: unknown) => { readonly valid: boolean }
}
export function createAssetModelJudge(bodyContracts: BodyContracts): AssetModelJudge {
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
    const root = p.root
    if (
      defName === 'WorkspaceCarrierManifest' &&
      root !== undefined &&
      Object.hasOwn(root, 'format') &&
      !numericOne(root.format)
    )
      return Object.freeze({ rejected: 'manifest_format_unsupported' })
    const nested: string[] = []
    const name = defName === 'AssetDefinition' ? object(root?.capability)?.name : undefined
    const origin = defName === 'AssetDefinition' ? root?.origin : undefined
    const bodyContext: BodyJudgeContext = {
      ...(typeof name === 'string' ? { capabilityName: name } : {}),
      ...(origin === 'official' || origin === 'customized' ? { origin } : {}),
    }
    for (const entry of p.contents) {
      const category = entry.category
      if (!isAssetCategory(category) || category === 'plugin' || category === 'agent_definition')
        continue
      const body =
        category === 'tool'
          ? entry.definition
          : category === 'loop_extension'
            ? entry.extension
            : entry.body
      if (body === undefined) {
        nested.push('malformed')
        continue
      }
      const result = bodies[category].judge(body, bodyContext)
      if ('rejected' in result) nested.push(result.rejected)
    }
    if (
      context?.declarations !== undefined &&
      (defName === 'AttributeAssignment' || defName === 'AssetHolding')
    ) {
      const assignments = defName === 'AttributeAssignment' ? [value] : array(root?.assignments)
      for (const assignment of assignments) {
        const entry = object(assignment)
        const declaration = context.declarations.find(item => item.item === entry?.item)
        if (
          entry === undefined ||
          declaration?.kind !== 'setting' ||
          !isObject(declaration.domain.schema) ||
          typeof declaration.domain.schema.$ref !== 'string'
        )
          continue
        const ref = declaration.domain.schema.$ref
        for (const category of bodyCategories) {
          const resource = object(bodies[category].schema)
          if (typeof resource?.$id !== 'string' || !ref.startsWith(`${resource.$id}#/$defs/`))
            continue
          const definition = ref.slice(`${resource.$id}#/$defs/`.length)
          if (!isObject(resource.$defs) || !Object.hasOwn(resource.$defs, definition))
            throw new TypeError('declaration references an unknown body definition')
          const result = bodies[category].judge(entry.value, { definition })
          if ('rejected' in result) nested.push(result.rejected)
        }
      }
    }
    if (
      (defName === 'AssetCategory' && !isAssetCategory(value)) ||
      [...p.capabilities, ...p.contents].some(
        entry => Object.hasOwn(entry, 'category') && !isAssetCategory(entry.category),
      ) ||
      nested.includes('category_unknown')
    )
      return Object.freeze({ rejected: 'category_unknown' })
    if (
      (defName === 'AssetOrigin' && value !== 'official' && value !== 'customized') ||
      (defName === 'AssetDefinition' &&
        root !== undefined &&
        Object.hasOwn(root, 'origin') &&
        origin !== 'official' &&
        origin !== 'customized') ||
      nested.includes('origin_unknown')
    )
      return Object.freeze({ rejected: 'origin_unknown' })
    const owner =
      defName === 'AssetOwner'
        ? root
        : defName === 'AssetDefinition'
          ? object(root?.owner)
          : undefined
    if (
      owner !== undefined &&
      Object.hasOwn(owner, 'kind') &&
      owner.kind !== 'organization' &&
      owner.kind !== 'tenant'
    )
      return Object.freeze({ rejected: 'owner_kind_unknown' })
    if (
      (defName === 'CapabilityName' && typeof value === 'string' && !isCapabilityName(value)) ||
      p.capabilities.some(
        entry => typeof entry.name === 'string' && !isCapabilityName(entry.name),
      ) ||
      nested.includes('name_invalid')
    )
      return Object.freeze({ rejected: 'name_invalid' })
    const bodyRejection = nested.find(
      rejection =>
        rejection !== 'malformed' &&
        !['category_unknown', 'origin_unknown', 'name_invalid'].includes(rejection),
    )
    if (bodyRejection !== undefined) return Object.freeze({ rejected: bodyRejection })
    if (
      p.contents.some(
        entry =>
          entry.category === 'plugin' &&
          array(entry.members).some(member => object(member)?.category === 'plugin'),
      )
    )
      return Object.freeze({ rejected: 'plugin_member_is_plugin' })
    if (
      defName === 'AssetDefinition' &&
      p.versions.length > 0 &&
      p.versions.every(version => positiveInteger(object(version)?.number)) &&
      p.versions.some((version, index) => {
        const number = object(version)?.number
        return !isJsonNumber(number) || Number(jsonNumberSource(number)) !== index + 1
      })
    )
      return Object.freeze({ rejected: 'version_sequence_broken' })
    if (
      defName === 'AssetHolding' &&
      duplicate(array(root?.assignments), entry =>
        typeof entry.item === 'string' ? entry.item : undefined,
      )
    )
      return Object.freeze({ rejected: 'assignment_item_duplicate' })
    if (defName === 'WorkspaceCarrierManifest') {
      if (
        duplicate(array(root?.assignments), entry => {
          const key = capabilityKey(entry.capability)
          return key !== undefined && typeof entry.item === 'string'
            ? writeJsonLossless([key, entry.item])
            : undefined
        })
      )
        return Object.freeze({ rejected: 'assignment_item_duplicate' })
      if (
        array(root?.assets).some(entry => {
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
        return Object.freeze({ rejected: 'manifest_source_escapes' })
    }
    if (nested.includes('malformed') || !validate(defName, value).valid)
      return Object.freeze({ rejected: 'malformed' })
    if (!canonicalWorkspaceKey(defName, root)) return Object.freeze({ rejected: 'malformed' })
    if (defName === 'AssetDefinition' && root !== undefined && owner !== undefined) {
      if (!sameTenant(owner, root.author)) return Object.freeze({ rejected: 'malformed' })
      const lineage = object(root.lineage)
      if (lineage !== undefined && !sameTenant(owner, lineage.importedBy))
        return Object.freeze({ rejected: 'malformed' })
    }
    if (
      defName === 'WorkspaceCarrierManifest' &&
      duplicate(array(root?.assets), entry => capabilityKey(entry.capability))
    )
      return Object.freeze({ rejected: 'malformed' })
    if (
      (defName === 'AttributeDeclaration' || defName === 'AttributeDomain') &&
      root !== undefined &&
      !validDomain(root, bodies)
    )
      return Object.freeze({ rejected: 'malformed' })
    return Object.freeze({ ok: true })
  }
  return Object.freeze({ judgeAssetValue, validate })
}
function validDomain(root: JsonObject, bodies: BodyContracts): boolean {
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
