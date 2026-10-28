// Test support of the recorder: the cases it can record and the request of each. A first round
// asks one question of a family model with reasoning. A continued round is the next request of the
// same family: the first round's request, the reply of the first round as the assistant message,
// and one more question. The reply is not stored with the recording; it comes from a replay of the
// first round's recorded body through the same assembled path on a local HTTPS server, so the
// continued request depends only on files of the recording and on this module.
import { readFileSync } from 'node:fs'
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

/** The files of one recording below its case directory. */
export const RECORDING_FILES = { stream: 'stream.sse', note: 'recording.json' } as const

/** The side note of one recording. It holds no header, no request body and no reply. */
export type RecordingNote = Readonly<{
  /** The supplier model of the request, e.g. `openai/gpt-5.6-sol`. */
  model: string
  /** The SHA-256 of the request body, as the materialization receipt gives it in `payloadDigest`. */
  payloadDigest: string
  /** When the response was received, as an ISO 8601 UTC time. */
  recordedAt: string
}>

export const RECORD_CASE_NAMES = [
  'openai-reasoning',
  'anthropic-reasoning',
  'openai-reasoning-continued',
  'anthropic-reasoning-continued',
] as const
export type RecordCaseName = (typeof RECORD_CASE_NAMES)[number]

export type RecordCase = Readonly<{
  family: FamilyName
  /** The family record whose route, supplier and representation the request uses. */
  model: string
  round:
    | Readonly<{ kind: 'first' }>
    /** The first round that this round continues, by its case name. */
    | Readonly<{ kind: 'continued'; first: RecordCaseName }>
  /** The reply must hold a reasoning state part, or the recorder writes nothing. */
  requiresReasoningState: boolean
  /** The parameters of the request. The adoptions are explicit, from the request's source. */
  parameters: readonly Parameter[]
}>

// At low effort an easy question gets no reasoning at all (reasoning_tokens 0, no reasoning
// state), so the OpenAI case asks at medium effort.
const OPENAI_PARAMETERS: readonly Parameter[] = [
  { kind: 'max-output-tokens', value: '1024' },
  { kind: 'reasoning-effort', value: 'medium' },
]
// Anthropic thinking needs a budget below the output limit, so the limit leaves room for it.
const ANTHROPIC_PARAMETERS: readonly Parameter[] = [
  { kind: 'max-output-tokens', value: '2048' },
  { kind: 'reasoning-effort', value: 'low' },
]

/** The two families' record models with a reasoning state reply, as the slow tests use them. */
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
}

export function isRecordCaseName(name: string): name is RecordCaseName {
  return RECORD_CASE_NAMES.some(item => item === name)
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
/** The identity of the first round's reply in the continued request. */
export const REPLY_ID = 'msg_r100000000000000000000'

function familyRecord(item: RecordCase) {
  const records = item.family === 'pi-ai-openai' ? OPENAI_RECORDS : ANTHROPIC_RECORDS
  const record = records.find(entry => entry.name === item.model)
  if (record === undefined) throw new Error(`no record ${item.model}`)
  return record
}

/**
 * The first round's request of the case's family: the record fixture's profile, supplier,
 * declaration and representation, the case's parameters, and one question.
 */
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
      messages: [FIRST_QUESTION],
    }),
  )
}

/** Reads the side note of a recording. Throws when it is not a note. */
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

export type ReplayedRound = Readonly<{
  /** The reply blocks of the round, as the Model read them. */
  blocks: readonly ModelBlock[]
  /** The one dispatch of the round, with its receipt and its account. */
  record: DispatchRecord
}>

/**
 * Runs `request` through the assembled path against a local HTTPS server that answers with the
 * recorded body in `recording`, settles the call and reads its reply. Refuses when the request
 * body of the replay is not the one that the recording's note names. Nothing leaves the machine.
 */
export async function replayRound(
  input: Readonly<{ request: FixedModelRequest; recording: string; label: string; vault: string }>,
): Promise<ReplayedRound> {
  const note = readRecordingNote(input.recording)
  const stream = readFileSync(join(input.recording, RECORDING_FILES.stream))
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

/**
 * The continued request: the first round's request, its reply as the assistant message with the
 * replay scope of the request's declaration and the replay format of the round's receipt, and the
 * next question.
 */
export function continuedRequest(
  input: Readonly<{ first: FixedModelRequest; replayed: ReplayedRound }>,
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
  return decoded(
    judgeFixedModelRequest({ ...first, messages: [...first.messages, reply, NEXT_QUESTION] }),
  )
}
