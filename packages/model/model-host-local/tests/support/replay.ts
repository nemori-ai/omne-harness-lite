// Test support: a recorded round replayed through the assembled local path, with the host kept
// open so a spec can read the facts, the dispatch and the preparation of the same host. The local
// HTTPS server answers every request on the route with the recorded body; nothing leaves the
// machine. `replayRound` of `recording-cases.ts` is the short form that closes the host at once.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { createCertificate, startHttpsServer, type ReceivedRequest } from './https-server.ts'
import { assembleLocalHost, decoded, ROUTE_PATH } from './local-host.ts'
import {
  readRecordingNote,
  readReply,
  RECORDING_FILES,
  type LocalHost,
  type RecordCaseName,
  type RecordingNote,
} from './recording-cases.ts'

/** The recordings of the transport package, one directory per case. */
const RECORDINGS = fileURLToPath(
  new URL('../../../pi-ai-transport/tests/fixtures/recordings/', import.meta.url),
)

export const recordingDirectory = (name: RecordCaseName): string => join(RECORDINGS, name)

export type OpenReplay = Readonly<{
  local: LocalHost
  note: RecordingNote
  /** The result of driving the call to its end. */
  driven: Awaited<ReturnType<LocalHost['drive']>>['driven']
  reference: Awaited<ReturnType<LocalHost['drive']>>['reference']
  /** The requests that reached the server, with their headers. */
  requests: readonly ReceivedRequest[]
  /** The reply blocks of the settled call. Reads the reply once. */
  readBlocks: () => ReturnType<typeof readReply>
  /** Closes the host, the server and the certificate, in this order. Safe to call once. */
  close: () => Promise<void>
}>

/**
 * Drives `request` through a new local host against a local server that answers with the body of
 * the recording `name`. The caller closes the result.
 */
export async function openReplay(
  input: Readonly<{ request: FixedModelRequest; name: RecordCaseName; label: string }>,
): Promise<OpenReplay> {
  const recording = recordingDirectory(input.name)
  const note = readRecordingNote(recording)
  const stream = readFileSync(join(recording, RECORDING_FILES.stream))
  const vault = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-replay-')))
  const certificate = createCertificate()
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
    directory: vault,
    gateway: { url: server.url, ca: certificate.cert },
  })
  const close = async () => {
    try {
      await local.close()
    } finally {
      try {
        await server.close()
      } finally {
        certificate.dispose()
        rmSync(vault, { recursive: true, force: true })
      }
    }
  }
  try {
    const { driven, reference } = await local.drive()
    return {
      local,
      note,
      driven,
      reference,
      requests: server.requests,
      readBlocks: () => readReply(local, reference),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}

/** The one dispatch of the call of a local host. Throws when there is not exactly one. */
export async function onlyDispatch(local: LocalHost) {
  const records = decoded(await local.commands.dispatches({ ...local.access, call: local.call }))
  const [record, ...others] = records
  if (record === undefined || others.length > 0)
    throw new Error(`expected one dispatch, found ${records.length}`)
  return record
}

/**
 * Acknowledges the settled result as processed and releases the request material of the call,
 * as the consumer does after it has read the reply. The call keeps its dispatch with the receipt
 * and the account; the recovery material is gone.
 */
export async function acknowledgeAndClean(open: Pick<OpenReplay, 'local' | 'reference'>) {
  const { local } = open
  const callAccess = { ...local.access, call: local.call }
  const recovery = decoded(await local.commands.loadRecovery(callAccess))
  if (recovery.state.phase !== 'settled' || recovery.execution === null)
    throw new Error('the call did not settle')
  const version = recovery.state.settlement.version
  decoded(
    await local.provider.runtime.consumption.acknowledge({
      ...callAccess,
      operation: local.operation('ack'),
      result: version,
      evidence: { kind: 'processed', completion: local.completion(version) },
    }),
  )
  expect(
    decoded(
      await local.commands.advanceCleanup({
        ...recovery.execution,
        operation: local.operation('cleanup'),
      }),
    ),
  ).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(await local.commands.loadRecovery(callAccess)).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
  })
}
