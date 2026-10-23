// One send through the public entry against a local HTTPS server, and one request that the
// transport refuses. Prerequisites: Node 24 or later, `openssl` in PATH, and a build of this
// package (`pnpm --filter @omne-harness/pi-ai-transport... -r run build`). Run it from the
// package directory: `node --experimental-strip-types examples/local-send.ts`.
//
// The family here is a sketch for this example only: it sends `{"model":...}` and reads SSE
// events of the form `{"text":"..."}`. A real family (the OpenAI family) comes from its own package.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { judgeContentBlock } from '@omne-harness/content-block'
import type {
  Adoption,
  FixedModelRequest,
  Supplier,
  TransportFact,
  TransportFailure,
} from '@omne-harness/model-contract'
import {
  createNetworkResources,
  createPiTransport,
  type PiFamilyBinding,
  type PiFamilyContributions,
  type PiResponseDecoder,
} from '@omne-harness/pi-ai-transport'

function adoption(name: string): Adoption {
  return { owner: 'pi-ai-transport-example', name, revision: '1', digest: '0'.repeat(64) }
}

const supplier: Supplier = {
  adoption: adoption('supplier'),
  recipient: 'local',
  model: 'example-model',
  credential: { kind: 'factory' },
}

const request: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [supplier],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'local/example-model', accepts: ['local/example-model'], foreignThinking: 'omit' },
  ],
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}

/** Gives one text block from `{"text":"..."}` events, and `completed` at the end marker. */
function createDecoder(): PiResponseDecoder {
  let opened = false
  return {
    accept(frame) {
      if (frame.kind === 'end-marker')
        return { ok: [{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }] }
      const text =
        frame.value.kind === 'object'
          ? frame.value.entries.find(entry => entry.key === 'text')?.value
          : undefined
      if (text?.kind !== 'string')
        return {
          failure: { cause: 'upstream-protocol', diagnostic: 'no-text', upstreamStatus: null },
        }
      const delta: TransportFact = { kind: 'block-delta', index: '0', delta: text.value }
      if (opened) return { ok: [delta] }
      opened = true
      return { ok: [{ kind: 'block-open', index: '0', mode: 'append', content: 'text' }, delta] }
    },
    end: () => ({ ok: [] }),
  }
}

function exampleBinding(bound: Supplier): PiFamilyBinding {
  // This family only sends: it plans, meters and converts tools for nothing.
  const refused: TransportFailure = {
    kind: 'unsupported',
    field: 'example',
    adapter: adoption('family'),
  }
  const counting: PiFamilyBinding['counting'] = {
    supplier: { adoption: bound.adoption, recipient: bound.recipient, model: bound.model },
    meter: adoption('meter'),
    tokenization: { kind: 'not-used', method: adoption('method') },
    prompt: { kind: 'provider-private', estimation: adoption('estimation') },
    projection: adoption('projection'),
    mediaTransform: adoption('media-transform'),
    replay: adoption('replay'),
    evidence: adoption('evidence'),
  }
  return {
    supplier: bound,
    adoption: adoption('family'),
    counting,
    rules: { plan: () => ({ failure: refused }) },
    meter: { basis: counting, measure: () => ({ failure: refused }) },
    tools: { convertToModelPayload: () => ({ failure: refused }) },
    encode: () => ({
      ok: {
        body: {
          kind: 'object',
          entries: [{ key: 'model', value: { kind: 'string', value: bound.model } }],
        },
        representation: {
          kind: 'materialized',
          adoption: adoption('meter-representation'),
          tokenInput: { kind: 'null' },
          media: [],
          requestBytes: '0',
        },
        diagnostics: [],
      },
    }),
    createDecoder,
    release: () => Promise.resolve(),
  }
}

const families: PiFamilyContributions = {
  acquire: async bound => ({ ok: exampleBinding(bound) }),
}

/** A self-signed certificate for 127.0.0.1, in a private directory that is deleted at once. */
function localCertificate(): Readonly<{ key: Buffer; cert: Buffer }> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pi-ai-transport-example-')))
  try {
    const { BASELINE: _inherited, ...env } = process.env
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { env, stdio: 'ignore' },
    )
    return {
      key: readFileSync(join(directory, 'key.pem')),
      cert: readFileSync(join(directory, 'cert.pem')),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const tls = localCertificate()
const server = createServer(tls, (req, res) => {
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end('data: {"text":"hello"}\n\ndata: {"text":" world"}\n\ndata: [DONE]\n\n')
  })
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (address === null || typeof address === 'string') throw new Error('the server has no port')
const { port } = address

// The assembly creates the network resources, and closes them after every transport.
const network = createNetworkResources({
  maxConnections: 1,
  idleConnectionTimeoutMs: 1_000,
  tls: { ca: tls.cert },
})
// The caller fills the slot just before `start` and clears it right after.
let secret: string | undefined
const pi = createPiTransport({
  network,
  families,
  routes: { local: { url: `https://127.0.0.1:${port}/v1/chat`, endMarker: '[DONE]' } },
  credential: { read: () => secret },
  limits: {
    connectTimeoutMs: 2_000,
    maxErrorBodyBytes: 4_096,
    maxEventBytes: 4_096,
    json: {
      maxBytes: 4_096,
      maxDepth: 16,
      maxItems: 256,
      maxMembers: 64,
      maxStringLength: 4_096,
      maxNumberLength: 32,
    },
  },
})

try {
  // Example: prepare, materialize, then start one send.
  const prepared = await pi.transport.prepare(request, supplier, { resent: [] })
  if (!('ok' in prepared)) throw new Error(`prepare failed: ${prepared.failure.kind}`)
  const materialized = await prepared.ok.materialize(new AbortController().signal)
  if (!('ok' in materialized)) throw new Error(`materialize failed: ${materialized.failure.kind}`)
  console.log(`payload digest: ${materialized.ok.receipt.payloadDigest}`)
  secret = 'example-secret'
  const facts = materialized.ok.start(new AbortController().signal)
  secret = undefined
  for await (const fact of facts) {
    if (fact.kind === 'block-delta') console.log(`delta: ${fact.delta}`)
    if (fact.kind === 'ended') console.log(`ended: ${fact.termination.kind}`)
  }
  await prepared.ok.close()

  // Counterexample: this transport does not read media yet. A request that shows the model a
  // content reference gets `unsupported` from materialize, and nothing is sent.
  const block = judgeContentBlock({
    kind: 'image',
    id: 'picture',
    visibility: { toHuman: true, toModel: true },
    ref: { storage: 'store', key: 'key', mediaType: 'image/png', bytes: '10', digest: 'd' },
    transcript: null,
  })
  if (!('ok' in block)) throw new Error(`the example built a refused block: ${block.rejected}`)
  const withMedia = await pi.transport.prepare({ ...request, system: [block.ok] }, supplier, {
    resent: [],
  })
  if (!('ok' in withMedia)) throw new Error(`prepare failed: ${withMedia.failure.kind}`)
  const refusedMedia = await withMedia.ok.materialize(new AbortController().signal)
  if ('ok' in refusedMedia) throw new Error('a content reference was materialized')
  const failure = refusedMedia.failure
  console.log(
    `content reference: ${failure.kind}${failure.kind === 'unsupported' ? ` ${failure.field}` : ''}`,
  )
} finally {
  await pi.close()
  await network.close()
  server.closeAllConnections()
  server.close()
}
