import {
  judgeContentBlock,
  validate as contentValidate,
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'
import { patternFlags } from './pattern.ts'
import {
  commandRelativeReference,
  descriptionMissing,
  draftPositions,
  unsupportedKeyword,
} from './schema-positions.ts'
import { positiveInteger, validate } from './schema.ts'
import type { MalformedCode, ParameterJudge, ToolDefinition, ToolJudgment } from './types.ts'
import { createParameterJudge } from './parameters.ts'

const duration = /^PT(?=[0-9])(?:[0-9]+H)?(?:[0-9]+M)?(?:[0-9]+(?:[.][0-9]+)?S)?(?![\s\S])/u
const layers = ['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox']
const categories = ['preference', 'binding', 'placement_identity', 'governance']
const permissions = ['forbid', 'auto', 'ask']
const modalities = ['text', 'image', 'audio', 'video']
function rejected(rejection: 'malformed', code: MalformedCode): ToolJudgment {
  return Object.freeze({ rejected: rejection, malformed: code })
}
function inputs(value: JsonObject): readonly JsonValue[] {
  if (value.paradigm === 'single')
    return Object.hasOwn(value, 'input') && value.input !== undefined ? [value.input] : []
  return object(value.commands)
    ? Object.values(value.commands).flatMap(command =>
        object(command) && Object.hasOwn(command, 'input') && command.input !== undefined
          ? [command.input]
          : [],
      )
    : []
}
function legalSchema(schema: JsonValue, judge: ParameterJudge): boolean {
  if (!object(schema)) return false
  for (const position of draftPositions(schema)) {
    if (typeof position.pattern === 'string' && patternFlags(position.pattern) === undefined)
      return false
    for (const key of [
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
      'minContains',
      'maxContains',
      'minProperties',
      'maxProperties',
    ]) {
      if (Object.hasOwn(position, key) && !isNonNegativeJsonInteger(position[key])) return false
    }
    if (Object.hasOwn(position, 'multipleOf')) {
      if (!isJsonNumber(position.multipleOf)) return false
      const source = jsonNumberSource(position.multipleOf)
      if (source.startsWith('-') || /^0(?:[.]0+)?(?:[eE][+-]?[0-9]+)?$/u.test(source)) return false
    }
  }
  // Always validate against adopted Draft 2020-12; a forbidden $schema annotation
  // belongs to M27 after metavalidation, rather than selecting another dialect.
  return judge.metaValidate({ ...schema, $schema: 'https://json-schema.org/draft/2020-12/schema' })
}
interface MalformedChecks {
  readonly add: (code: MalformedCode, condition: boolean) => void
  readonly fields: (
    document: JsonObject,
    required: readonly string[],
    known: readonly string[],
  ) => void
  readonly string: (value: JsonValue | undefined) => void
  readonly strings: (value: JsonValue | undefined, modality?: boolean) => void
}
function malformedHeader(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields, string } = checks
  fields(
    value,
    [
      'name',
      'description',
      'permissions',
      'origin',
      value.paradigm === 'single' ? 'input' : 'commands',
    ],
    [
      'name',
      'description',
      'paradigm',
      'input',
      'commands',
      'help',
      'needs',
      'settings',
      'allowBackground',
      'permissions',
      'composes',
      'origin',
    ],
  )
  string(value.name)
  string(value.description)
  string(value.help)
  add('M5', value.allowBackground !== undefined && typeof value.allowBackground !== 'boolean')
  add(
    'M25',
    typeof value.name === 'string' &&
      value.name !== '' &&
      (!/^[A-Za-z0-9_:-]+$/u.test(value.name) || value.name.replaceAll(':', '__').length > 128),
  )
}
function malformedCommands(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields, string } = checks
  if (value.paradigm === 'multi') {
    add('M13', Object.hasOwn(value, 'input'))
    add('M5', value.commands !== undefined && !object(value.commands))
    if (object(value.commands))
      for (const [name, command] of Object.entries(value.commands)) {
        string(name)
        if (!object(command)) {
          add('M5', true)
          continue
        }
        fields(command, ['description', 'input'], ['description', 'input', 'help'])
        string(command.description)
        string(command.help)
        if (command.input !== undefined) add('M24', commandRelativeReference(command.input))
      }
  }
}
function malformedNeeds(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields, string, strings } = checks
  if (value.needs !== undefined) {
    if (!object(value.needs)) add('M5', true)
    else {
      fields(
        value.needs,
        [],
        ['externalServices', 'attachmentStorage', 'inputModalities', 'outputModalities'],
      )
      strings(value.needs.externalServices)
      string(value.needs.attachmentStorage)
      strings(value.needs.inputModalities, true)
      strings(value.needs.outputModalities, true)
    }
  }
}
function malformedSetting(name: string, setting: JsonValue, checks: MalformedChecks): void {
  const { add, fields } = checks
  if (!object(setting)) {
    add('M5', true)
    return
  }
  fields(setting, ['category', 'default'], ['category', 'default'])
  add(
    'M10',
    typeof setting.category === 'string' &&
      categories.includes(setting.category) &&
      setting.category !== (name === 'targetEnvironment' ? 'placement_identity' : 'preference'),
  )
  if (!Object.hasOwn(setting, 'default')) return
  malformedSettingDefault(name, setting.default, checks)
}
function malformedSettingDefault(
  name: string,
  value: JsonValue | undefined,
  checks: MalformedChecks,
): void {
  const { add, fields, strings } = checks
  if (name === 'timeout' || name === 'backgroundThreshold')
    add('M11', typeof value !== 'string' || !duration.test(value))
  if (name === 'concurrency') add('M12', !positiveInteger(value))
  if (name === 'targetEnvironment') {
    if (!object(value)) add('M5', true)
    else {
      fields(value, ['bindingLayer', 'facilities'], ['bindingLayer', 'facilities'])
      strings(value.facilities)
    }
  }
}
function malformedSettings(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields } = checks
  if (value.settings !== undefined) {
    if (!object(value.settings)) add('M5', true)
    else {
      fields(
        value.settings,
        [],
        ['targetEnvironment', 'backgroundThreshold', 'timeout', 'concurrency'],
      )
      for (const [name, setting] of Object.entries(value.settings)) {
        malformedSetting(name, setting, checks)
      }
      add(
        'M15',
        Object.hasOwn(value.settings, 'backgroundThreshold') && value.allowBackground !== true,
      )
    }
  }
}
function malformedPermissions(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields } = checks
  if (value.permissions !== undefined) {
    if (!object(value.permissions)) add('M5', true)
    else {
      fields(value.permissions, ['execute'], ['execute'])
      if (value.permissions.execute !== undefined) {
        if (!object(value.permissions.execute)) add('M5', true)
        else fields(value.permissions.execute, ['default'], ['default'])
      }
    }
  }
}
function malformedOrigin(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields, string } = checks
  if (value.origin !== undefined) {
    if (!object(value.origin)) add('M5', true)
    else {
      const mcp = value.origin.kind === 'mcp'
      const names = mcp ? ['kind', 'endpoint', 'remoteName'] : ['kind']
      fields(value.origin, names, names)
      if (mcp) {
        string(value.origin.remoteName)
        if (value.origin.endpoint !== undefined)
          add(
            'M9',
            !contentValidate('CapabilityId', value.origin.endpoint).valid ||
              !object(value.origin.endpoint) ||
              value.origin.endpoint.category !== 'mcp',
          )
        add('M14', value.paradigm === 'multi' || Object.hasOwn(value, 'composes'))
      }
    }
  }
}
function malformedComposition(value: JsonObject, checks: MalformedChecks): void {
  const { add, fields, strings } = checks
  if (value.composes !== undefined) {
    if (!object(value.composes)) add('M5', true)
    else {
      fields(value.composes, [], ['skills'])
      strings(value.composes.skills)
    }
  }
}
function malformedInputs(value: JsonObject, checks: MalformedChecks): void {
  const { add } = checks
  for (const input of inputs(value)) {
    add('M26', object(input) && (input.type !== 'object' || !object(input.properties)))
    add('M27', unsupportedKeyword(input))
  }
}
function malformedDefinition(value: JsonObject): MalformedCode | undefined {
  const codes = new Set<MalformedCode>()
  const add = (code: MalformedCode, condition: boolean) => {
    if (condition) codes.add(code)
  }
  const fields = (document: JsonObject, required: readonly string[], known: readonly string[]) => {
    add(
      'M3',
      required.some(key => !Object.hasOwn(document, key)),
    )
    add(
      'M4',
      Object.keys(document).some(key => !known.includes(key)),
    )
  }
  const string = (v: JsonValue | undefined) => {
    if (v === undefined) return
    add('M5', typeof v !== 'string')
    add('M6', v === '')
  }
  const strings = (v: JsonValue | undefined, modality = false) => {
    if (v === undefined) return
    if (!Array.isArray(v)) {
      codes.add('M5')
      return
    }
    for (const item of v) string(item)
    add('M7', new Set(v).size !== v.length)
    add('M8', modality && v.some(item => typeof item !== 'string' || !modalities.includes(item)))
  }
  const checks: MalformedChecks = { add, fields, string, strings }
  malformedHeader(value, checks)
  malformedCommands(value, checks)
  malformedNeeds(value, checks)
  malformedSettings(value, checks)
  malformedPermissions(value, checks)
  malformedOrigin(value, checks)
  malformedComposition(value, checks)
  malformedInputs(value, checks)
  return [...codes].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0]
}
function definitionShapeRejection(value: JsonObject): ToolJudgment | undefined {
  if (!Object.hasOwn(value, 'paradigm')) return rejected('malformed', 'M2')
  if (value.paradigm !== 'single' && value.paradigm !== 'multi')
    return Object.freeze({ rejected: 'paradigm_unknown' })
  if (value.paradigm === 'single' && Object.hasOwn(value, 'commands'))
    return Object.freeze({ rejected: 'commands_forbidden' })
  if (
    value.paradigm === 'multi' &&
    (!Object.hasOwn(value, 'commands') ||
      (object(value.commands) && Object.keys(value.commands).length === 0))
  )
    return Object.freeze({ rejected: 'commands_missing' })
  return undefined
}
function unknownBindingLayer(value: JsonObject): boolean {
  const target =
    object(value.settings) &&
    object(value.settings.targetEnvironment) &&
    object(value.settings.targetEnvironment.default)
      ? value.settings.targetEnvironment.default
      : undefined
  if (
    target !== undefined &&
    Object.hasOwn(target, 'bindingLayer') &&
    (typeof target.bindingLayer !== 'string' || !layers.includes(target.bindingLayer))
  )
    return true
  return false
}
function unknownSettingCategory(value: JsonObject): boolean {
  if (
    object(value.settings) &&
    Object.values(value.settings).some(
      setting =>
        object(setting) &&
        Object.hasOwn(setting, 'category') &&
        (typeof setting.category !== 'string' || !categories.includes(setting.category)),
    )
  )
    return true
  return false
}
function unknownPermission(value: JsonObject): boolean {
  if (
    object(value.permissions) &&
    object(value.permissions.execute) &&
    Object.hasOwn(value.permissions.execute, 'default') &&
    (typeof value.permissions.execute.default !== 'string' ||
      !permissions.includes(value.permissions.execute.default))
  )
    return true
  return false
}
function unknownOrigin(value: JsonObject): boolean {
  if (
    object(value.origin) &&
    Object.hasOwn(value.origin, 'kind') &&
    value.origin.kind !== 'authored' &&
    value.origin.kind !== 'mcp'
  )
    return true
  return false
}
function declarationRejection(value: JsonObject): ToolJudgment | undefined {
  if (unknownBindingLayer(value)) return Object.freeze({ rejected: 'binding_layer_unknown' })
  if (unknownSettingCategory(value)) return Object.freeze({ rejected: 'setting_category_unknown' })
  if (unknownPermission(value)) return Object.freeze({ rejected: 'permission_unknown' })
  if (unknownOrigin(value)) return Object.freeze({ rejected: 'tool_origin_unknown' })
  if (typeof value.name === 'string' && /__|_:|:_/u.test(value.name))
    return Object.freeze({ rejected: 'name_reserved_sequence' })
  return undefined
}
function compiledInputRejection(
  schemas: readonly JsonValue[],
  owned: ParameterJudge,
): ToolJudgment | undefined {
  for (const schema of schemas)
    if (object(schema)) {
      const compiled = owned.compile(schema)
      if ('unsupported' in compiled)
        return Object.freeze({ rejected: 'schema_unsupported', unsupported: compiled.unsupported })
    }
  return undefined
}
export function judgeToolDefinition(value: unknown, judge?: ParameterJudge): ToolJudgment {
  const copied = copyJson(value)
  if (!object(copied)) return rejected('malformed', 'M1')
  const shape = definitionShapeRejection(copied)
  if (shape !== undefined) return shape
  const schemas = inputs(copied)
  const owned = judge ?? createParameterJudge()
  if (schemas.some(input => !legalSchema(input, owned)))
    return Object.freeze({ rejected: 'input_not_schema' })
  if (schemas.some(descriptionMissing))
    return Object.freeze({ rejected: 'parameter_description_missing' })
  const declaration = declarationRejection(copied)
  if (declaration !== undefined) return declaration
  const malformed = malformedDefinition(copied)
  if (malformed !== undefined) return rejected('malformed', malformed)
  if (!validate('ToolDefinition', copied).valid)
    throw new Error('Schema rejection absent from S26 malformed inventory')
  const unsupported = compiledInputRejection(schemas, owned)
  if (unsupported !== undefined) return unsupported
  return Object.freeze({ ok: true })
}
export function isToolDefinition(
  value: unknown,
  parameters?: ParameterJudge,
): value is ToolDefinition {
  return 'ok' in judgeToolDefinition(value, parameters)
}

function returnContentRejection(value: JsonObject): ToolJudgment | undefined {
  const blocks = [
    ...(Array.isArray(value.content) ? value.content : []),
    ...(object(value.offload) && Array.isArray(value.offload.summary) ? value.offload.summary : []),
  ]
  for (const block of blocks) {
    const result = judgeContentBlock(block)
    if ('rejected' in result) return Object.freeze({ rejected: result.rejected })
  }
  if (blocks.some(block => object(block) && block.kind === 'tool_call'))
    return Object.freeze({ rejected: 'result_call_in_content' })
  return undefined
}
function returnMembersMissing(value: JsonObject): boolean {
  if (
    !Object.hasOwn(value, 'content') ||
    (object(value.offload) &&
      (!Object.hasOwn(value.offload, 'raw') ||
        (object(value.offload.raw) &&
          Object.hasOwn(value.offload.raw, 'inline') &&
          !Object.hasOwn(value.offload.raw, 'mediaType'))))
  )
    return true
  return false
}
function returnMembersUnknown(value: JsonObject): boolean {
  if (
    Object.keys(value).some(
      key => !['content', 'offload', 'attachments', 'isError'].includes(key),
    ) ||
    (object(value.offload) &&
      Object.keys(value.offload).some(key => !['raw', 'summary'].includes(key))) ||
    (object(value.offload) &&
      object(value.offload.raw) &&
      Object.hasOwn(value.offload.raw, 'inline') &&
      Object.keys(value.offload.raw).some(key => !['inline', 'mediaType'].includes(key)))
  )
    return true
  return false
}
function returnMemberTypesInvalid(value: JsonObject): boolean {
  if (
    !Array.isArray(value.content) ||
    (Object.hasOwn(value, 'isError') && typeof value.isError !== 'boolean') ||
    returnOffloadTypeInvalid(value) ||
    (Object.hasOwn(value, 'attachments') && !Array.isArray(value.attachments))
  )
    return true
  return false
}
function returnSummaryEmpty(value: JsonObject): boolean {
  if (
    object(value.offload) &&
    Array.isArray(value.offload.summary) &&
    value.offload.summary.length === 0
  )
    return true
  return false
}
function returnOffloadTypeInvalid(value: JsonObject): boolean {
  return (
    (Object.hasOwn(value, 'offload') && !object(value.offload)) ||
    (object(value.offload) &&
      Object.hasOwn(value.offload, 'summary') &&
      !Array.isArray(value.offload.summary))
  )
}
function returnRawRejection(value: JsonObject): ToolJudgment | undefined {
  if (object(value.offload)) {
    const raw = value.offload.raw
    if (!object(raw)) return rejected('malformed', 'M21')
    if (Object.hasOwn(raw, 'inline')) {
      if (
        !contentValidate('InlineBytes', raw.inline).valid ||
        !contentValidate('MediaType', raw.mediaType).valid
      )
        return rejected('malformed', 'M22')
    } else if (!contentValidate('AttachmentRef', raw).valid) return rejected('malformed', 'M21')
  }
  return undefined
}
function returnAttachmentsInvalid(value: JsonObject): boolean {
  return (
    Array.isArray(value.attachments) &&
    value.attachments.some(item => !contentValidate('AttachmentRef', item).valid)
  )
}
export function judgeToolReturn(value: unknown): ToolJudgment {
  const copied = copyJson(value)
  if (typeof copied === 'string') return Object.freeze({ ok: true })
  if (!object(copied)) return rejected('malformed', 'M16')
  const content = returnContentRejection(copied)
  if (content !== undefined) return content
  if (returnMembersMissing(copied)) return rejected('malformed', 'M17')
  if (returnMembersUnknown(copied)) return rejected('malformed', 'M18')
  if (returnMemberTypesInvalid(copied)) return rejected('malformed', 'M19')
  if (returnSummaryEmpty(copied)) return rejected('malformed', 'M20')
  const raw = returnRawRejection(copied)
  if (raw !== undefined) return raw
  if (returnAttachmentsInvalid(copied)) return rejected('malformed', 'M23')
  if (!validate('ToolReturn', copied).valid)
    throw new Error('Schema rejection absent from S26 return inventory')
  return Object.freeze({ ok: true })
}
/** Representation validity does not establish the opaque brands on the original value. */
export function isToolReturn(value: unknown): boolean {
  return 'ok' in judgeToolReturn(value)
}
