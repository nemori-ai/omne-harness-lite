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
import type {
  MalformedCode,
  ParameterJudge,
  ToolDefinition,
  ToolJudgment,
  ToolReturn,
} from './types.ts'
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
  if (value.paradigm === 'multi') {
    add('M13', Object.hasOwn(value, 'input'))
    add('M5', value.commands !== undefined && !object(value.commands))
    if (object(value.commands))
      for (const [name, command] of Object.entries(value.commands)) {
        string(name)
        if (!object(command)) {
          codes.add('M5')
          continue
        }
        fields(command, ['description', 'input'], ['description', 'input', 'help'])
        string(command.description)
        string(command.help)
        if (command.input !== undefined) add('M24', commandRelativeReference(command.input))
      }
  }
  if (value.needs !== undefined) {
    if (!object(value.needs)) codes.add('M5')
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
  if (value.settings !== undefined) {
    if (!object(value.settings)) codes.add('M5')
    else {
      fields(
        value.settings,
        [],
        ['targetEnvironment', 'backgroundThreshold', 'timeout', 'concurrency'],
      )
      for (const [name, setting] of Object.entries(value.settings)) {
        if (!object(setting)) {
          codes.add('M5')
          continue
        }
        fields(setting, ['category', 'default'], ['category', 'default'])
        add(
          'M10',
          typeof setting.category === 'string' &&
            categories.includes(setting.category) &&
            setting.category !==
              (name === 'targetEnvironment' ? 'placement_identity' : 'preference'),
        )
        if (!Object.hasOwn(setting, 'default')) continue
        if (name === 'timeout' || name === 'backgroundThreshold')
          add('M11', typeof setting.default !== 'string' || !duration.test(setting.default))
        if (name === 'concurrency') add('M12', !positiveInteger(setting.default))
        if (name === 'targetEnvironment') {
          if (!object(setting.default)) codes.add('M5')
          else {
            fields(setting.default, ['bindingLayer', 'facilities'], ['bindingLayer', 'facilities'])
            strings(setting.default.facilities)
          }
        }
      }
      add(
        'M15',
        Object.hasOwn(value.settings, 'backgroundThreshold') && value.allowBackground !== true,
      )
    }
  }
  if (value.permissions !== undefined) {
    if (!object(value.permissions)) codes.add('M5')
    else {
      fields(value.permissions, ['execute'], ['execute'])
      if (value.permissions.execute !== undefined) {
        if (!object(value.permissions.execute)) codes.add('M5')
        else fields(value.permissions.execute, ['default'], ['default'])
      }
    }
  }
  if (value.origin !== undefined) {
    if (!object(value.origin)) codes.add('M5')
    else {
      const mcp = value.origin.kind === 'mcp'
      fields(
        value.origin,
        mcp ? ['kind', 'endpoint', 'remoteName'] : ['kind'],
        mcp ? ['kind', 'endpoint', 'remoteName'] : ['kind'],
      )
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
  if (value.composes !== undefined) {
    if (!object(value.composes)) codes.add('M5')
    else {
      fields(value.composes, [], ['skills'])
      strings(value.composes.skills)
    }
  }
  for (const input of inputs(value)) {
    add('M26', object(input) && (input.type !== 'object' || !object(input.properties)))
    add('M27', unsupportedKeyword(input))
  }
  return [...codes].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0]
}
export function judgeToolDefinition(value: unknown, judge?: ParameterJudge): ToolJudgment {
  const copied = copyJson(value)
  if (!object(copied)) return rejected('malformed', 'M1')
  if (!Object.hasOwn(copied, 'paradigm')) return rejected('malformed', 'M2')
  if (copied.paradigm !== 'single' && copied.paradigm !== 'multi')
    return Object.freeze({ rejected: 'paradigm_unknown' })
  if (copied.paradigm === 'single' && Object.hasOwn(copied, 'commands'))
    return Object.freeze({ rejected: 'commands_forbidden' })
  if (
    copied.paradigm === 'multi' &&
    (!Object.hasOwn(copied, 'commands') ||
      (object(copied.commands) && Object.keys(copied.commands).length === 0))
  )
    return Object.freeze({ rejected: 'commands_missing' })
  const schemas = inputs(copied)
  const owned = judge ?? createParameterJudge()
  if (schemas.some(input => !legalSchema(input, owned)))
    return Object.freeze({ rejected: 'input_not_schema' })
  if (schemas.some(descriptionMissing))
    return Object.freeze({ rejected: 'parameter_description_missing' })
  const target =
    object(copied.settings) &&
    object(copied.settings.targetEnvironment) &&
    object(copied.settings.targetEnvironment.default)
      ? copied.settings.targetEnvironment.default
      : undefined
  if (
    target !== undefined &&
    Object.hasOwn(target, 'bindingLayer') &&
    (typeof target.bindingLayer !== 'string' || !layers.includes(target.bindingLayer))
  )
    return Object.freeze({ rejected: 'binding_layer_unknown' })
  if (
    object(copied.settings) &&
    Object.values(copied.settings).some(
      setting =>
        object(setting) &&
        Object.hasOwn(setting, 'category') &&
        (typeof setting.category !== 'string' || !categories.includes(setting.category)),
    )
  )
    return Object.freeze({ rejected: 'setting_category_unknown' })
  if (
    object(copied.permissions) &&
    object(copied.permissions.execute) &&
    Object.hasOwn(copied.permissions.execute, 'default') &&
    (typeof copied.permissions.execute.default !== 'string' ||
      !permissions.includes(copied.permissions.execute.default))
  )
    return Object.freeze({ rejected: 'permission_unknown' })
  if (
    object(copied.origin) &&
    Object.hasOwn(copied.origin, 'kind') &&
    copied.origin.kind !== 'authored' &&
    copied.origin.kind !== 'mcp'
  )
    return Object.freeze({ rejected: 'tool_origin_unknown' })
  if (typeof copied.name === 'string' && /__|_:|:_/u.test(copied.name))
    return Object.freeze({ rejected: 'name_reserved_sequence' })
  const malformed = malformedDefinition(copied)
  if (malformed !== undefined) return rejected('malformed', malformed)
  if (!validate('ToolDefinition', copied).valid)
    throw new Error('Schema rejection absent from S26 malformed inventory')
  for (const schema of schemas)
    if (object(schema)) {
      const compiled = owned.compile(schema)
      if ('unsupported' in compiled)
        return Object.freeze({ rejected: 'schema_unsupported', unsupported: compiled.unsupported })
    }
  return Object.freeze({ ok: true })
}
export function isToolDefinition(value: unknown): value is ToolDefinition {
  return 'ok' in judgeToolDefinition(value)
}

export function judgeToolReturn(value: unknown): ToolJudgment {
  const copied = copyJson(value)
  if (typeof copied === 'string') return Object.freeze({ ok: true })
  if (!object(copied)) return rejected('malformed', 'M16')
  const blocks = [
    ...(Array.isArray(copied.content) ? copied.content : []),
    ...(object(copied.offload) && Array.isArray(copied.offload.summary)
      ? copied.offload.summary
      : []),
  ]
  for (const block of blocks) {
    const result = judgeContentBlock(block)
    if ('rejected' in result) return Object.freeze({ rejected: result.rejected })
  }
  if (blocks.some(block => object(block) && block.kind === 'tool_call'))
    return Object.freeze({ rejected: 'result_call_in_content' })
  if (
    !Object.hasOwn(copied, 'content') ||
    (object(copied.offload) &&
      (!Object.hasOwn(copied.offload, 'raw') ||
        (object(copied.offload.raw) &&
          Object.hasOwn(copied.offload.raw, 'inline') &&
          !Object.hasOwn(copied.offload.raw, 'mediaType'))))
  )
    return rejected('malformed', 'M17')
  if (
    Object.keys(copied).some(key => !['content', 'offload', 'attachments'].includes(key)) ||
    (object(copied.offload) &&
      Object.keys(copied.offload).some(key => !['raw', 'summary'].includes(key))) ||
    (object(copied.offload) &&
      object(copied.offload.raw) &&
      Object.hasOwn(copied.offload.raw, 'inline') &&
      Object.keys(copied.offload.raw).some(key => !['inline', 'mediaType'].includes(key)))
  )
    return rejected('malformed', 'M18')
  if (
    !Array.isArray(copied.content) ||
    (Object.hasOwn(copied, 'offload') && !object(copied.offload)) ||
    (object(copied.offload) &&
      Object.hasOwn(copied.offload, 'summary') &&
      !Array.isArray(copied.offload.summary)) ||
    (Object.hasOwn(copied, 'attachments') && !Array.isArray(copied.attachments))
  )
    return rejected('malformed', 'M19')
  if (
    object(copied.offload) &&
    Array.isArray(copied.offload.summary) &&
    copied.offload.summary.length === 0
  )
    return rejected('malformed', 'M20')
  if (object(copied.offload)) {
    const raw = copied.offload.raw
    if (!object(raw)) return rejected('malformed', 'M21')
    if (Object.hasOwn(raw, 'inline')) {
      if (
        !contentValidate('InlineBytes', raw.inline).valid ||
        !contentValidate('MediaType', raw.mediaType).valid
      )
        return rejected('malformed', 'M22')
    } else if (!contentValidate('AttachmentRef', raw).valid) return rejected('malformed', 'M21')
  }
  if (
    Array.isArray(copied.attachments) &&
    copied.attachments.some(item => !contentValidate('AttachmentRef', item).valid)
  )
    return rejected('malformed', 'M23')
  if (!validate('ToolReturn', copied).valid)
    throw new Error('Schema rejection absent from S26 return inventory')
  return Object.freeze({ ok: true })
}
export function isToolReturn(value: unknown): value is ToolReturn {
  return 'ok' in judgeToolReturn(value)
}
