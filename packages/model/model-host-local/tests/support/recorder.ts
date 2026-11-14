import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FixedModelRequest, ModelFailure } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { tapResponseBodies } from './body-tap.ts'
import { assembleLocalHost, decoded, ROUTE_PATH, type Gateway } from './local-host.ts'
import { RECORDING_FILES, type RecordingNote } from './recording-cases.ts'
import { findSecrets, type SecretPattern } from './secret-scan.ts'

type Termination = Extract<TransportFact, { kind: 'ended' }>['termination']

export type RecordRefusal =
  | Readonly<{ kind: 'recording-exists'; directory: string }>
  | Readonly<{ kind: 'responses'; count: number }>
  | Readonly<{ kind: 'status'; status: number }>
  | Readonly<{ kind: 'body-not-bytes' }>
  | Readonly<{ kind: 'empty-body' }>
  | Readonly<{ kind: 'not-settled'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'dispatches'; count: number }>
  | Readonly<{ kind: 'no-receipt' }>
  | Readonly<{ kind: 'terminations'; count: number }>
  | Readonly<{ kind: 'reasoning-state-missing' }>
  | Readonly<{ kind: 'tool-call-missing' }>
  | Readonly<{ kind: 'secret'; patterns: readonly SecretPattern[] }>

export type RecordOutcome =
  | Readonly<{
      kind: 'written'
      directory: string
      note: RecordingNote
      bytes: number
      termination: Termination
      reasoningState: boolean
    }>
  | Readonly<{ kind: 'refused'; refusal: RecordRefusal }>

export type RecordInput = Readonly<{
  name: string
  request: FixedModelRequest
  requiresReasoningState: boolean
  requiresToolCall?: boolean
  gateway: Gateway
  output: string
  vault: string
  now: () => Date
}>

export async function recordRound(input: RecordInput): Promise<RecordOutcome> {
  const directory = join(input.output, input.name)
  // Checked before the send, so a run that cannot write costs nothing.
  if (existsSync(directory)) return refused({ kind: 'recording-exists', directory })
  const tap = tapResponseBodies(new URL(ROUTE_PATH, input.gateway.url))
  const local = assembleLocalHost({
    request: input.request,
    label: `record-${input.name}`,
    directory: input.vault,
    gateway: input.gateway,
  })
  let driven: Awaited<ReturnType<typeof local.drive>>['driven']
  let recordedAt: string
  let dispatches: Awaited<ReturnType<typeof local.commands.dispatches>>
  try {
    driven = (await local.drive()).driven
    recordedAt = input.now().toISOString()
    dispatches = await local.commands.dispatches({ ...local.access, call: local.call })
  } finally {
    // The close waits for every exchange to stop, so the tapped body is complete after it.
    await local.close()
    tap.close()
  }

  const responses = tap.responses()
  const [response] = responses
  if (response === undefined || responses.length > 1)
    return refused({ kind: 'responses', count: responses.length })
  if (response.status !== 200) return refused({ kind: 'status', status: response.status })
  if (response.foreign()) return refused({ kind: 'body-not-bytes' })
  const body = response.body()
  if (body.byteLength === 0) return refused({ kind: 'empty-body' })
  if (!('ok' in driven)) return refused({ kind: 'not-settled', failure: driven.failure.kind })
  const records = decoded(dispatches)
  const [record] = records
  if (record === undefined || records.length > 1)
    return refused({ kind: 'dispatches', count: records.length })
  const payloadDigest = record.materialization?.receipt.payloadDigest
  if (payloadDigest === undefined) return refused({ kind: 'no-receipt' })
  const ended = local.facts.flatMap(fact => (fact.kind === 'ended' ? [fact.termination] : []))
  const [termination] = ended
  if (termination === undefined || ended.length > 1)
    return refused({ kind: 'terminations', count: ended.length })
  const reasoningState = local.facts.some(
    fact => fact.kind === 'block-seal' && fact.block.kind === 'reasoning_state',
  )
  if (input.requiresReasoningState && !reasoningState)
    return refused({ kind: 'reasoning-state-missing' })
  const toolCall = local.facts.some(
    fact => fact.kind === 'block-seal' && fact.block.kind === 'tool_call',
  )
  if (input.requiresToolCall === true && !toolCall) return refused({ kind: 'tool-call-missing' })

  const note: RecordingNote = {
    model: input.request.suppliers[0].model,
    payloadDigest,
    recordedAt,
  }
  const noteBytes = Buffer.from(`${JSON.stringify(note, null, 2)}\n`, 'utf8')
  const patterns = [...new Set([...findSecrets(body), ...findSecrets(noteBytes)])]
  if (patterns.length > 0) return refused({ kind: 'secret', patterns })

  mkdirSync(input.output, { recursive: true })
  const partial = mkdtempSync(join(input.output, `.${input.name}-`))
  try {
    writeFileSync(join(partial, RECORDING_FILES.stream), body)
    writeFileSync(join(partial, RECORDING_FILES.note), noteBytes)
    renameSync(partial, directory)
  } catch (error) {
    rmSync(partial, { recursive: true, force: true })
    throw error
  }
  return {
    kind: 'written',
    directory,
    note,
    bytes: body.byteLength,
    termination,
    reasoningState,
  }
}

function refused(refusal: RecordRefusal): RecordOutcome {
  return { kind: 'refused', refusal }
}
