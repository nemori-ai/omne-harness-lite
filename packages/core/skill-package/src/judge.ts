import { isCapabilityName } from '@omne-harness-lite/asset-model'
import { isCanonicalMediaType } from '@omne-harness-lite/content-blocks'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { SchemaValidator } from '@omne-harness-lite/content-blocks/schema-runtime'
import { copyJson, object } from './json.ts'
import { createSkillSchemaRuntime, numericOne, schemaDocument, validate } from './schema.ts'
import type { MalformedCode, SkillJudgeContext, SkillJudgment, SkillPackage } from './types.ts'

const categories = ['preference', 'binding', 'placement_identity', 'governance'] as const
const layers = ['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox'] as const
const manifestKeys = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]
function malformed(code: MalformedCode): SkillJudgment {
  return Object.freeze({ rejected: 'malformed', malformed: code })
}
function array(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : []
}
function extra(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).some(key => !allowed.includes(key))
}
export function pathEscapes(path: string): boolean {
  return (
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes('\\') ||
    path.split('/').includes('..')
  )
}
function pathMalformed(path: string): boolean {
  return (
    path.split('/').some(segment => segment === '' || segment === '.') ||
    path === 'SKILL.md' ||
    path === '.omne/skill.json'
  )
}
function toolShape(value: JsonValue): value is JsonObject & { category: string; name: string } {
  return (
    object(value) &&
    Object.keys(value).length === 2 &&
    typeof value.category === 'string' &&
    typeof value.name === 'string'
  )
}
function defaultFits(setting: JsonObject): boolean {
  if (
    !object(setting.domain) ||
    setting.domain.kind !== 'open' ||
    !schemaDocument(setting.domain.schema)
  )
    return false
  // An author schema compiler belongs to this invocation, never a growing module cache.
  const runtime = createSkillSchemaRuntime()
  if (!runtime.metaValidate(setting.domain.schema)) return false
  let validator: SchemaValidator
  try {
    validator = runtime.compile(setting.domain.schema)
  } catch (error) {
    // Invalid/unresolvable author schemas cannot define a valid setting domain.
    if (error instanceof Error) return false
    throw error
  }
  return !Object.hasOwn(setting, 'default') || validator.validate(setting.default ?? null)
}
/** S-24 ordered predicates precede the frozen Schema shape check. No repairs are made. */
export function judgeSkillPackage(input: unknown, context?: SkillJudgeContext): SkillJudgment {
  const value = copyJson(input)
  if (!object(value)) return malformed('M1')
  if (!Object.hasOwn(value, 'manifest')) return Object.freeze({ rejected: 'manifest_missing' })
  const manifest = object(value.manifest) ? value.manifest : undefined
  if (
    manifest !== undefined &&
    typeof manifest.name === 'string' &&
    context?.capabilityName !== undefined &&
    manifest.name !== context.capabilityName
  )
    return Object.freeze({ rejected: 'name_mismatch' })
  const definition = object(value.definition) ? value.definition : undefined
  if (
    definition !== undefined &&
    Object.hasOwn(definition, 'format') &&
    !numericOne(definition.format ?? null)
  )
    return Object.freeze({ rejected: 'definition_format_unsupported' })
  const resources = array(value.resources)
  if (
    resources.some(
      resource =>
        object(resource) && typeof resource.path === 'string' && pathEscapes(resource.path),
    )
  )
    return Object.freeze({ rejected: 'resource_escapes' })
  if (
    array(definition?.tools).some(
      tool => toolShape(tool) && (tool.category !== 'tool' || !isCapabilityName(tool.name)),
    )
  )
    return Object.freeze({ rejected: 'tool_ref_invalid' })
  const environment = object(definition?.environmentRequirement)
    ? definition.environmentRequirement
    : undefined
  if (
    environment !== undefined &&
    Object.hasOwn(environment, 'bindingLayer') &&
    !layers.some(layer => layer === environment.bindingLayer)
  )
    return Object.freeze({ rejected: 'binding_layer_unknown' })
  const settings = array(definition?.settings)
  if (
    settings.some(
      setting =>
        object(setting) &&
        Object.hasOwn(setting, 'category') &&
        !categories.some(category => category === setting.category),
    )
  )
    return Object.freeze({ rejected: 'setting_category_unknown' })

  if (
    manifest === undefined ||
    (Object.hasOwn(value, 'definition') && definition === undefined) ||
    resources.some(resource => !object(resource))
  )
    return malformed('M1')
  if (
    !Object.hasOwn(value, 'body') ||
    !Object.hasOwn(value, 'resources') ||
    !Object.hasOwn(manifest, 'name') ||
    !Object.hasOwn(manifest, 'description') ||
    resources.some(resource => object(resource) && !Object.hasOwn(resource, 'path')) ||
    settings.some(
      setting =>
        object(setting) &&
        (!Object.hasOwn(setting, 'item') ||
          !Object.hasOwn(setting, 'kind') ||
          !Object.hasOwn(setting, 'domain') ||
          (setting.kind === 'setting' && !Object.hasOwn(setting, 'category')) ||
          ((setting.category === 'preference' || setting.category === 'binding') &&
            !Object.hasOwn(setting, 'default'))),
    )
  )
    return malformed('M2')
  if (definition !== undefined && !Object.hasOwn(definition, 'format')) return malformed('M15')
  if (
    extra(value, ['manifest', 'body', 'definition', 'resources']) ||
    extra(manifest, manifestKeys) ||
    (definition !== undefined &&
      extra(definition, [
        'format',
        'tools',
        'dependencies',
        'settings',
        'environmentRequirement',
      ])) ||
    resources.some(resource => object(resource) && extra(resource, ['path', 'mediaType']))
  )
    return malformed('M3')
  if (
    typeof value.body !== 'string' ||
    !Array.isArray(value.resources) ||
    typeof manifest.name !== 'string' ||
    typeof manifest.description !== 'string' ||
    ['license', 'compatibility', 'allowed-tools'].some(
      key => Object.hasOwn(manifest, key) && typeof manifest[key] !== 'string',
    ) ||
    (Object.hasOwn(manifest, 'metadata') &&
      (!object(manifest.metadata) ||
        Object.values(manifest.metadata).some(item => typeof item !== 'string'))) ||
    ['tools', 'dependencies', 'settings'].some(
      key =>
        definition !== undefined &&
        Object.hasOwn(definition, key) &&
        !Array.isArray(definition[key]),
    ) ||
    array(definition?.dependencies).some(name => typeof name !== 'string') ||
    resources.some(resource => object(resource) && typeof resource.path !== 'string')
  )
    return malformed('M4')
  if (
    [...manifest.description].length === 0 ||
    [...manifest.description].length > 1024 ||
    (typeof manifest.compatibility === 'string' &&
      ([...manifest.compatibility].length === 0 || [...manifest.compatibility].length > 500))
  )
    return malformed('M5')
  if (!isCapabilityName(manifest.name)) return malformed('M6')
  const paths: string[] = []
  for (const resource of resources) {
    if (!object(resource) || typeof resource.path !== 'string')
      throw new Error('inconsistent resource shape')
    if (pathMalformed(resource.path)) return malformed('M7')
    const resourcePath = resource.path
    if (
      paths.some(
        path =>
          path === resourcePath ||
          path.startsWith(`${resourcePath}/`) ||
          resourcePath.startsWith(`${path}/`),
      )
    )
      return malformed('M8')
    paths.push(resourcePath)
    if (Object.hasOwn(resource, 'mediaType') && !isCanonicalMediaType(resource.mediaType))
      return malformed('M9')
  }
  const tools = array(definition?.tools)
  if (
    tools.some(tool => !toolShape(tool)) ||
    tools.some(
      (tool, index) =>
        toolShape(tool) &&
        tools
          .slice(0, index)
          .some(
            previous =>
              toolShape(previous) &&
              previous.category === tool.category &&
              previous.name === tool.name,
          ),
    )
  )
    return malformed('M10')
  const services = array(definition?.dependencies)
  if (
    services.some(
      (name, index) =>
        typeof name !== 'string' || name.length === 0 || services.slice(0, index).includes(name),
    )
  )
    return malformed('M11')
  const items: JsonValue[] = []
  for (const setting of settings) {
    if (
      !object(setting) ||
      setting.kind !== 'setting' ||
      setting.category === 'governance' ||
      setting.item === 'disabled' ||
      setting.item === 'usableBy' ||
      items.includes(setting.item ?? null) ||
      !defaultFits(setting)
    )
      return malformed('M12')
    if (!validate('SkillDefinitionRecord', { format: 1, settings: [setting] }).valid)
      return malformed('M12')
    items.push(setting.item ?? null)
  }
  if (
    definition !== undefined &&
    Object.hasOwn(definition, 'environmentRequirement') &&
    !validate('SkillDefinitionRecord', {
      format: 1,
      environmentRequirement: definition.environmentRequirement ?? null,
    }).valid
  )
    return malformed('M13')
  if (environment !== undefined && !paths.some(path => path.startsWith('scripts/')))
    return malformed('M14')
  if (!validate('SkillPackage', value).valid)
    throw new Error('unclassified SkillPackage Schema violation')
  return Object.freeze({ ok: true })
}
export function isSkillPackage(value: unknown): value is SkillPackage {
  return 'ok' in judgeSkillPackage(value)
}
