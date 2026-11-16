import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { judgeContentBlock } from '@omne-harness/content-block'
import {
  decodeProviderName,
  type Adoption,
  type FixedModelRequest,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import {
  createNetworkResources,
  createPiTransport,
  type PiFamilyBinding,
  type PiFamilyContributions,
  type PiResponseDecoder,
} from '@omne-harness/pi-ai-transport'

const decodedLocal = decodeProviderName('local')
if (!('ok' in decodedLocal)) throw new Error('invalid provider name')
const LOCAL = decodedLocal.ok

function adoption(name: string): Adoption {
  return { owner: 'pi-ai-transport-example', name, revision: '1', digest: '0'.repeat(64) }
}

const supplier: Supplier = {
  adoption: adoption('supplier'),
  provider: LOCAL,
  model: 'example-model',
  credential: { layer: 'official' },
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
  const refused: TransportFailure = {
    kind: 'unsupported',
    field: 'example',
    adapter: adoption('family'),
  }
  const counting: PiFamilyBinding['counting'] = {
    supplier: { adoption: bound.adoption, provider: bound.provider, model: bound.model },
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
    meter: {
      basis: counting,
      measure: async () => ({ failure: refused }),
      measureCalibrated: async () => ({ failure: refused }),
    },
    replayFormat: null,
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

const network = createNetworkResources({
  maxConnections: 1,
  idleConnectionTimeoutMs: 1_000,
  tls: { ca: tls.cert },
})
let secret: string | undefined
const pi = createPiTransport({
  network,
  families,
  routes: {
    local: {
      url: `https://127.0.0.1:${port}/v1/chat`,
      endMarker: '[DONE]',
      accounting: { place: 'local', costUnit: 'local-credit' },
      auth: { kind: 'bearer', item: 'apiKey' },
    },
  },
  credential: { read: () => (secret === undefined ? undefined : new Map([['apiKey', secret]])) },
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
