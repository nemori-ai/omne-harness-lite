// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createCertificate, startHttpsServer } from './support/https-server.ts'
import { assembleLocalHost, decoded, isGatewayPath } from './support/local-host.ts'
import {
  continuedRequest,
  firstRoundRequest,
  RECORD_CASES,
  RECORDING_FILES,
  replayRound,
} from './support/recording-cases.ts'
import { recordingDirectory, replayLabel } from './support/replay.ts'

// The shape of the refusal the Messages engine classifies: a carried signature that does not hold.
const SIGNATURE_REFUSAL = JSON.stringify({
  type: 'error',
  error: {
    type: 'invalid_request_error',
    message: 'messages.1.content.0: Invalid `signature` in `thinking` block',
  },
})

it('C16: a refusal of the carried reasoning state is answered by one resend without it, and the call completes', async () => {
  const first = firstRoundRequest(RECORD_CASES['anthropic-reasoning'])
  const vault = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-resend-')))
  const certificate = createCertificate()
  try {
    const replayed = await replayRound({
      request: first,
      recording: recordingDirectory('anthropic-reasoning'),
      label: replayLabel('resend-first', 'anthropic-reasoning'),
      vault,
    })
    const request = continuedRequest({ first, replayed })
    const stream = readFileSync(
      join(recordingDirectory('anthropic-reasoning-continued'), RECORDING_FILES.stream),
    )
    let answered = 0
    const server = await startHttpsServer(certificate, (res, received) => {
      if (!isGatewayPath(received.path)) {
        res.writeHead(404).end()
        return
      }
      answered += 1
      if (answered === 1) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(SIGNATURE_REFUSAL)
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' }).end(stream)
    })
    const local = assembleLocalHost({
      request,
      label: replayLabel('resend', 'anthropic-reasoning-continued'),
      directory: vault,
      gateway: { url: server.url, ca: certificate.cert },
      retry: { maxAttempts: 2, maxElapsedMs: 1000, delaysMs: [0], jitter: 0 },
    })
    try {
      const { driven } = await local.drive()
      expect(driven).toEqual({ ok: undefined })
      const bodies = server.requests.filter(item => isGatewayPath(item.path)).map(item => item.body)
      expect(bodies).toHaveLength(2)
      // The first dispatch carried the signed thinking of the first round; the resend carries none.
      expect(bodies[0]).toContain('"signature"')
      expect(bodies[1]).not.toContain('"signature"')
      const records = decoded(
        await local.commands.dispatches({ ...local.access, call: local.call }),
      )
      expect(records.map(record => record.withoutReplay)).toEqual([undefined, 'resend'])
      expect(records[0]?.terminal).toMatchObject({
        kind: 'failed',
        fault: { cause: 'replay-rejected', upstreamStatus: '400' },
      })
      expect(records[1]?.terminal).toMatchObject({ kind: 'completed' })
      expect(records[1]?.supplier).toEqual(records[0]?.supplier)
    } finally {
      await local.close()
      await server.close()
    }
  } finally {
    certificate.dispose()
    rmSync(vault, { recursive: true, force: true })
  }
})
