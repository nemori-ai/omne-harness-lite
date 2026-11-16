import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type DispatchRecord,
  type FixedModelRequest,
  type ModelBlock,
  type Parameter,
  type ParameterAdoption,
  type ResultPart,
} from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer } from './https-server.ts'
import { assembleLocalHost, decoded, ROUTE_PATH } from './local-host.ts'
import { readRecordFixture, type FamilyName } from './records.ts'

export const RECORDING_FILES = { stream: 'stream.sse', note: 'recording.json' } as const

export const SYNTHETIC_FILE = 'synthetic.jsonl'

export type RecordingNote = Readonly<{
  model: string
  payloadDigest: string
  recordedAt: string
}>

export const RECORD_CASE_NAMES = [
  'openai-reasoning',
  'anthropic-reasoning',
  'openai-reasoning-continued',
  'anthropic-reasoning-continued',
] as const
export const TOOL_CASE_NAMES = ['openai-tool-call', 'openai-tool-call-continued'] as const
export const ALL_RECORD_CASE_NAMES = [...RECORD_CASE_NAMES, ...TOOL_CASE_NAMES] as const
export type RecordCaseName = (typeof ALL_RECORD_CASE_NAMES)[number]

export type RecordCase = Readonly<{
  family: FamilyName
  model: string
  round: Readonly<{ kind: 'first' }> | Readonly<{ kind: 'continued'; first: RecordCaseName }>
  requiresReasoningState: boolean
  parameters: readonly Parameter[]
  tools?: readonly PlainTool[]
  requiresToolCall?: boolean
  next?: 'question' | 'tool-result'
}>

export type PlainTool = Readonly<{ name: string; description: string; argumentsSchema: unknown }>

function tagged(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tagged) }
  if (typeof value === 'object')
    return {
      kind: 'object',
      entries: Object.entries(value).map(([key, member]) => ({ key, value: tagged(member) })),
    }
  throw new Error('a tool schema holds a value that is not JSON')
}

const OPENAI_PARAMETERS: readonly Parameter[] = [
  { kind: 'max-output-tokens', value: '1024' },
  { kind: 'reasoning-effort', value: 'medium' },
]
const ANTHROPIC_PARAMETERS: readonly Parameter[] = [
  { kind: 'max-output-tokens', value: '2048' },
  { kind: 'reasoning-effort', value: 'low' },
]

// Medium effort, never none (the project records with reasoning on) and never xhigh (not in the
// parameter table).
const TOOL_PARAMETERS: readonly Parameter[] = [
  { kind: 'max-output-tokens', value: '2048' },
  { kind: 'reasoning-effort', value: 'medium' },
]
const WEATHER_TOOL: PlainTool = {
  name: 'get_weather',
  description: 'Reads the current temperature of one city, in degrees Celsius.',
  argumentsSchema: {
    type: 'object',
    properties: { city: { type: 'string', description: 'The name of the city.' } },
    required: ['city'],
    additionalProperties: false,
  },
}

export const RECORD_CASES: Readonly<Record<RecordCaseName, RecordCase>> = {
  'openai-reasoning': {
    family: 'pi-ai-openai',
    model: 'openai/gpt-5.6-sol',
    round: { kind: 'first' },
    requiresReasoningState: true,
    parameters: OPENAI_PARAMETERS,
  },
  'anthropic-reasoning': {
    family: 'pi-ai-anthropic',
    model: 'anthropic/claude-sonnet-5',
    round: { kind: 'first' },
    requiresReasoningState: true,
    parameters: ANTHROPIC_PARAMETERS,
  },
  'openai-reasoning-continued': {
    family: 'pi-ai-openai',
    model: 'openai/gpt-5.6-sol',
    round: { kind: 'continued', first: 'openai-reasoning' },
    requiresReasoningState: false,
    parameters: OPENAI_PARAMETERS,
  },
  'anthropic-reasoning-continued': {
    family: 'pi-ai-anthropic',
    model: 'anthropic/claude-sonnet-5',
    round: { kind: 'continued', first: 'anthropic-reasoning' },
    requiresReasoningState: false,
    parameters: ANTHROPIC_PARAMETERS,
  },
  'openai-tool-call': {
    family: 'pi-ai-openai',
    model: 'openai/gpt-5.6-sol',
    round: { kind: 'first' },
    requiresReasoningState: true,
    parameters: TOOL_PARAMETERS,
    tools: [WEATHER_TOOL],
    requiresToolCall: true,
  },
  'openai-tool-call-continued': {
    family: 'pi-ai-openai',
    model: 'openai/gpt-5.6-sol',
    round: { kind: 'continued', first: 'openai-tool-call' },
    requiresReasoningState: false,
    parameters: TOOL_PARAMETERS,
    tools: [WEATHER_TOOL],
    next: 'tool-result',
  },
}

export function isRecordCaseName(name: string): name is RecordCaseName {
  return ALL_RECORD_CASE_NAMES.some(item => item === name)
}

const FIRST_QUESTION = {
  id: 'msg_q100000000000000000000',
  role: 'user',
  blocks: [
    {
      kind: 'text',
      id: 'q1',
      visibility: { toHuman: true, toModel: true },
      text: 'How many positive integers below 200 are divisible by 3 or 7 but not by 21? Reply with only the number.',
    },
  ],
}
const TOOL_QUESTION = {
  id: 'msg_q300000000000000000000',
  role: 'user',
  blocks: [
    {
      kind: 'text',
      id: 'q3',
      visibility: { toHuman: true, toModel: true },
      text: 'What is the temperature in Paris right now? Use the tool.',
    },
  ],
}
const TOOL_RESULT_TEXT = '{"city":"Paris","temperatureCelsius":18}'
const NEXT_QUESTION = {
  id: 'msg_q200000000000000000000',
  role: 'user',
  blocks: [
    {
      kind: 'text',
      id: 'q2',
      visibility: { toHuman: true, toModel: true },
      text: 'How many of them are odd? Reply with only the number.',
    },
  ],
}
export const REPLY_ID = 'msg_r100000000000000000000'

function familyRecord(item: RecordCase) {
  const records = item.family === 'pi-ai-openai' ? OPENAI_RECORDS : ANTHROPIC_RECORDS
  const record = records.find(entry => entry.name === item.model)
  if (record === undefined) throw new Error(`no record ${item.model}`)
  return record
}

export function firstRoundRequest(item: RecordCase): FixedModelRequest {
  const { request } = readRecordFixture(item.family, familyRecord(item))
  const [supplier] = request.suppliers
  const adoptions: readonly ParameterAdoption[] = item.parameters.map(parameter => ({
    supplier: supplier.adoption,
    applied: parameter,
    origin: { kind: 'explicit', requested: parameter, source: request.source },
  }))
  return decoded(
    judgeFixedModelRequest({
      ...request,
      parameters: item.parameters,
      parameterAdoptions: adoptions,
      messages: [item.tools === undefined ? FIRST_QUESTION : TOOL_QUESTION],
      ...(item.tools !== undefined && {
        tools: item.tools.map(tool => ({ ...tool, argumentsSchema: tagged(tool.argumentsSchema) })),
        toolChoice: 'auto',
      }),
    }),
  )
}

export function readRecordingNote(directory: string): RecordingNote {
  const parsed: unknown = JSON.parse(readFileSync(join(directory, RECORDING_FILES.note), 'utf8'))
  const field = (name: string): string => {
    const value: unknown = Reflect.get(Object(parsed), name)
    if (typeof value !== 'string') throw new Error(`recording note without ${name}`)
    return value
  }
  return {
    model: field('model'),
    payloadDigest: field('payloadDigest'),
    recordedAt: field('recordedAt'),
  }
}

export type Recording = Readonly<{ stream: Buffer; note: RecordingNote }>

function stringField(record: unknown, name: string, file: string): string {
  const value: unknown = Reflect.get(Object(record), name)
  if (typeof value !== 'string') throw new Error(`${file}: a line without ${name}`)
  return value
}

export function readSyntheticRecording(file: string): Recording {
  const [head, ...frames] = readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => line !== '')
    .map((line): unknown => JSON.parse(line))
  const note: RecordingNote = {
    model: stringField(head, 'model', file),
    payloadDigest: stringField(head, 'payloadDigest', file),
    recordedAt: stringField(head, 'recordedAt', file),
  }
  const parts = frames.map(frame => {
    if (Reflect.has(Object(frame), 'comment')) return `: ${stringField(frame, 'comment', file)}\n\n`
    return `data: ${stringField(frame, 'data', file)}\n\n`
  })
  return { stream: Buffer.from([...parts, 'data: [DONE]\n\n'].join(''), 'utf8'), note }
}

export function readRecording(directory: string): Recording {
  const synthetic = join(directory, SYNTHETIC_FILE)
  if (existsSync(synthetic)) return readSyntheticRecording(synthetic)
  return {
    stream: readFileSync(join(directory, RECORDING_FILES.stream)),
    note: readRecordingNote(directory),
  }
}

export type ReplayedRound = Readonly<{
  blocks: readonly ModelBlock[]
  record: DispatchRecord
}>

export async function replayRound(
  input: Readonly<{ request: FixedModelRequest; recording: string; label: string; vault: string }>,
): Promise<ReplayedRound> {
  const { note, stream } = readRecording(input.recording)
  const certificate = createCertificate()
  try {
    const server = await startHttpsServer(certificate, (res, request) => {
      if (request.path !== ROUTE_PATH) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(stream)
    })
    const local = assembleLocalHost({
      request: input.request,
      label: input.label,
      directory: input.vault,
      gateway: { url: server.url, ca: certificate.cert },
    })
    try {
      const { driven, reference } = await local.drive()
      if (!('ok' in driven))
        throw new Error(`the replayed round did not settle: ${JSON.stringify(driven)}`)
      const [record, ...others] = decoded(
        await local.commands.dispatches({ ...local.access, call: local.call }),
      )
      if (record === undefined || others.length > 0)
        throw new Error('the replayed round has not exactly one dispatch')
      if (record.materialization?.receipt.payloadDigest !== note.payloadDigest)
        throw new Error('the replayed request body is not the recorded one')
      return { blocks: await readReply(local, reference), record }
    } finally {
      await local.close()
      await server.close()
    }
  } finally {
    certificate.dispose()
  }
}

export type LocalHost = ReturnType<typeof assembleLocalHost>
export type CallReference = Awaited<ReturnType<LocalHost['drive']>>['reference']

export async function readReply(
  local: LocalHost,
  reference: CallReference,
): Promise<readonly ModelBlock[]> {
  const callAccess = { ...local.access, call: local.call }
  const recovery = decoded(await local.commands.loadRecovery(callAccess))
  if (recovery.state.phase !== 'settled') throw new Error('the replayed round did not settle')
  const consumption = local.provider.runtime.consumption
  const started = decoded(
    await consumption.beginRead({
      ...local.access,
      reference,
      operation: local.operation('read'),
      result: recovery.state.settlement.version,
    }),
  )
  if (started.kind !== 'started') throw new Error('the read did not start')
  const parts: ResultPart[] = []
  let state = started.value
  while (state.kind === 'reading') {
    parts.push(...state.page.parts)
    const after = state.page.next
    if (after === null) break
    state = decoded(await consumption.readNext({ ...callAccess, read: started.read, after }))
  }
  decoded(await consumption.closeRead({ ...callAccess, read: started.read }))
  return parts.map(part => {
    if (part.kind !== 'sealed') throw new Error('the replayed round left a partial part')
    return part.block
  })
}

export function continuedRequest(
  input: Readonly<{
    first: FixedModelRequest
    replayed: ReplayedRound
    next?: NonNullable<RecordCase['next']>
  }>,
): FixedModelRequest {
  const { first, replayed } = input
  const format = replayed.record.materialization?.receipt.replayFormat
  if (format === undefined) throw new Error('the first round has no replay format')
  const reply = {
    id: REPLY_ID,
    role: 'assistant',
    blocks: replayed.blocks,
    replay: {
      scope: first.declarations[0].produces,
      format,
      at: replayed.blocks.flatMap((block, at) => (block.kind === 'reasoning_state' ? [at] : [])),
    },
  }
  const follow = input.next === 'tool-result' ? toolResultOf(replayed.blocks) : NEXT_QUESTION
  return decoded(judgeFixedModelRequest({ ...first, messages: [...first.messages, reply, follow] }))
}

function toolResultOf(blocks: readonly ModelBlock[]) {
  const call = blocks.find(block => block.kind === 'tool_call')
  if (call === undefined) throw new Error('the first round has no tool call to answer')
  return {
    id: 'msg_t100000000000000000000',
    role: 'tool',
    blocks: [
      {
        kind: 'tool_result',
        id: 'tr1',
        visibility: { toHuman: false, toModel: true },
        callId: call.callId,
      },
      {
        kind: 'text',
        id: 'tt1',
        visibility: { toHuman: false, toModel: true },
        text: TOOL_RESULT_TEXT,
      },
    ],
  }
}
