import {
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type CategoryDisplay,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import {
  isDefinitionName,
  isEngineName,
  type EngineEgress,
  type EngineParameters,
} from '@omne-harness/media-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const CONVERTER_CATEGORY = 'converter'

export const converterCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '转换件',
  summary: '一种媒体交给哪个转换引擎、带什么参数、内容送到哪里。',
})

export type ConverterBody = Readonly<{
  /** A modality, or a media type written as an asset name: the same as the asset's name. */
  kind: string
  engine: string
  parameters: EngineParameters
  egress: EngineEgress
}>

export type ConverterBodyRejection =
  | 'not-an-object'
  | 'invalid-kind'
  | 'kind-mismatch'
  | 'invalid-engine'
  | 'invalid-parameters'
  | 'invalid-egress'

const schemaRead = readBodyText(
  '{"kind":"converter-body","properties":{"kind":"string","engine":"string","parameters":"object","egress":{"kind":"in-process|host|remote","destination":"string"}}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 8,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('converter schema text is not a document')
const schema: JsonValue = schemaRead.value

type Fields = ReadonlyMap<string, JsonValue>

/** Reads a body; the engine named need not be there now. */
export function parseConverterBody(
  body: JsonValue | undefined,
  capabilityName?: string,
): Outcome<ConverterBody, ConverterBodyRejection> {
  const fields = fieldsOf(body)
  if (fields === undefined) return fail('not-an-object')
  const kind = nameAt(fields, 'kind', isDefinitionName)
  if (kind === undefined) return fail('invalid-kind')
  if (capabilityName !== undefined && kind !== capabilityName) return fail('kind-mismatch')
  const engine = nameAt(fields, 'engine', isEngineName)
  if (engine === undefined) return fail('invalid-engine')
  const parameters = fields.get('parameters')
  if (parameters?.kind !== 'object') return fail('invalid-parameters')
  const egress = egressOf(fieldsOf(fields.get('egress')))
  if (egress === undefined) return fail('invalid-egress')
  return succeed({ kind, engine, parameters: plain(parameters), egress })
}

export function converterBodyContract(): BodyContract {
  return {
    category: CONVERTER_CATEGORY,
    schema,
    judge,
    deriveDeclarations(body, context) {
      typed(body, context?.capabilityName)
      return { entries: [] }
    },
    references(body, context) {
      typed(body, context?.capabilityName)
      return []
    },
  }
}

/** The assets judge only a body they read themselves: an object literal is refused. */
function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  const parsed = parseConverterBody(readSnapshot(body), context?.capabilityName)
  return 'ok' in parsed ? { ok: true } : refusal(parsed.failure)
}

function typed(body: JsonValue, capabilityName: string | undefined): ConverterBody {
  const parsed = parseConverterBody(body, capabilityName)
  if (!('ok' in parsed)) throw new TypeError(`converter body failed judgment: ${parsed.failure}`)
  return parsed.ok
}

function egressOf(fields: Fields | undefined): EngineEgress | undefined {
  const kind = textOf(fields?.get('kind'))
  if (kind === 'in-process' || kind === 'host') return { kind }
  if (kind !== 'remote') return undefined
  const destination = textOf(fields?.get('destination'))
  return destination === undefined || destination === '' ? undefined : { kind, destination }
}

function nameAt(fields: Fields, key: string, valid: (name: string) => boolean): string | undefined {
  const text = textOf(fields.get(key))
  return text !== undefined && valid(text) ? text : undefined
}

function fieldsOf(value: JsonValue | undefined): Fields | undefined {
  if (value?.kind !== 'object') return undefined
  return new Map(value.entries.map(entry => [entry.key, entry.value]))
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function plain(value: JsonValue): EngineParameters {
  return JSON.parse(writeJsonText(value)) as EngineParameters
}
