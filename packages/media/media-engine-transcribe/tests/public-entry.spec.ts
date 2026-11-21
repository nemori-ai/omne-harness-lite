import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { declarationProblem, engineAccepts, type EngineInput } from '@omne-harness/media-contract'
import { engineConformanceCases } from '@omne-harness/media-contract/testing'
import { createTranscribeEngine, type TranscribeKey } from '@omne-harness/media-engine-transcribe'

type Seen = Readonly<{ path: string; authorization: string | undefined; body: unknown }>
type Answer = (seen: Seen, response: ServerResponse) => void

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>(done => {
      server.closeAllConnections()
      server.close(() => done())
    })
})

/** A transcription service on a free local port that answers as the test says, and what it was sent. */
async function service(answer: Answer) {
  const seen: Seen[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const parts: Buffer[] = []
    request.on('data', part => parts.push(part as Buffer))
    request.on('end', () => {
      const text = Buffer.concat(parts).toString('utf8')
      const one = {
        path: request.url ?? '',
        authorization: request.headers.authorization,
        body: text === '' ? null : (JSON.parse(text) as unknown),
      }
      seen.push(one)
      answer(one, response)
    })
  })
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return { seen, endpoint: `http://127.0.0.1:${String(port)}/api/v1/audio/transcriptions` }
}
const json = (status: number, body: unknown) => (_: Seen, response: ServerResponse) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const KEY: TranscribeKey = { kind: 'key', value: 'sk-test-0123' }
const keyed = async () => KEY

function wav(seed = 1): Uint8Array {
  const bytes = new Uint8Array(44 + 8)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVE'), 8)
  bytes[44] = seed
  return bytes
}
function inputOf(
  bytes = wav(),
  parameters: Readonly<Record<string, unknown>> = {},
  signal = new AbortController().signal,
): EngineInput {
  return {
    access: { tenant: 'tenant-1' as never, principal: null },
    media: {
      mediaType: 'audio/wav',
      bytes: bytes.byteLength,
      async *open() {
        yield bytes
      },
    },
    parameters,
    signal,
  }
}

describe('the engine voice.transcribe', () => {
  it('exports the factory only', async () => {
    const root = (await import('@omne-harness/media-engine-transcribe')) as Record<string, unknown>
    expect(Object.keys(root)).toEqual(['createTranscribeEngine'])
  })

  it('declares a sound remote engine of speech that names where the bytes go', () => {
    const { declaration } = createTranscribeEngine({
      endpoint: 'https://openrouter.ai/api/v1/audio/transcriptions',
      key: keyed,
    })
    expect(declarationProblem(declaration)).toBeNull()
    expect(declaration).toMatchObject({
      name: 'voice.transcribe',
      egress: { kind: 'remote', destination: 'openrouter.ai' },
      maxBytes: 25 * 1024 * 1024,
    })
    for (const type of [
      'audio/wav',
      'audio/mpeg',
      'audio/flac',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
    ])
      expect(engineAccepts(declaration, type), type).toBe(true)
    expect(engineAccepts(declaration, 'application/pdf')).toBe(false)
  })

  it('sends the bytes, the format, the model and the language with the key, and answers the words', async () => {
    const { seen, endpoint } = await service(
      json(200, { text: '  今天下午三点开会。 ', usage: { cost: 0.00002 } }),
    )
    const engine = createTranscribeEngine({ endpoint, key: keyed })
    const bytes = wav(7)
    expect(
      await engine.convert(
        inputOf(bytes, { model: 'openai/whisper-large-v3-turbo', language: 'zh' }),
      ),
    ).toEqual({
      kind: 'converted',
      text: '今天下午三点开会。',
      derived: [],
    })
    expect(seen).toEqual([
      {
        path: '/api/v1/audio/transcriptions',
        authorization: 'Bearer sk-test-0123',
        body: {
          model: 'openai/whisper-large-v3-turbo',
          input_audio: { data: Buffer.from(bytes).toString('base64'), format: 'wav' },
          language: 'zh',
        },
      },
    ])
  })

  it('asks the default model and no language when the definition gives none, and names each format', async () => {
    const { seen, endpoint } = await service(json(200, { text: 'x' }))
    const engine = createTranscribeEngine({ endpoint, key: keyed })
    const formats = [
      ['audio/mpeg', 'mp3'],
      ['audio/mp4', 'm4a'],
      ['audio/x-wav', 'wav'],
    ] as const
    for (const [mediaType] of formats)
      await engine.convert({ ...inputOf(), media: { ...inputOf().media, mediaType } })
    expect(seen.map(one => one.body)).toEqual(
      formats.map(([, format]) => ({
        model: 'qwen/qwen3-asr-0.6b',
        input_audio: { data: Buffer.from(wav()).toString('base64'), format },
      })),
    )
  })

  it('says speech with no words in it cannot be converted', async () => {
    const { endpoint } = await service(json(200, { text: ' \n ' }))
    expect(await createTranscribeEngine({ endpoint, key: keyed }).convert(inputOf())).toEqual({
      kind: 'inconvertible',
    })
  })

  it('is unavailable with no key, or a key that cannot be read, and sends nothing', async () => {
    const { seen, endpoint } = await service(json(200, { text: 'x' }))
    for (const answer of [{ kind: 'missing' }, { kind: 'unavailable' }] as const) {
      const engine = createTranscribeEngine({ endpoint, key: async () => answer })
      expect(await engine.convert(inputOf())).toEqual({ kind: 'failed', reason: 'unavailable' })
    }
    expect(seen).toEqual([])
  })

  it('passes who asks to the key, and the signal', async () => {
    const { endpoint } = await service(json(200, { text: 'x' }))
    const asked: unknown[] = []
    const engine = createTranscribeEngine({
      endpoint,
      key: async (access, signal) => {
        asked.push([access.tenant, signal.aborted])
        return KEY
      },
    })
    await engine.convert(inputOf())
    expect(asked).toEqual([['tenant-1', false]])
  })

  it.each([
    [401, 'unavailable'],
    [402, 'unavailable'],
    [403, 'unavailable'],
    [429, 'unavailable'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'error'],
    [404, 'error'],
    [413, 'error'],
  ] as const)('answers status %d as %s', async (status, reason) => {
    const { endpoint } = await service(json(status, { error: { message: 'no' } }))
    expect(await createTranscribeEngine({ endpoint, key: keyed }).convert(inputOf())).toEqual({
      kind: 'failed',
      reason,
    })
  })

  it('answers the outcome not known when a success has no words to read, or the line breaks after sending', async () => {
    const shapeless = await service((_, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"usage":{}}')
    })
    const notJson = await service((_, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('ok')
    })
    const broken = await service((_, response) => response.socket?.destroy())
    for (const { endpoint } of [shapeless, notJson, broken])
      expect(
        await createTranscribeEngine({ endpoint, key: keyed }).convert(inputOf()),
        endpoint,
      ).toEqual({
        kind: 'failed',
        reason: 'outcome-unknown',
      })
  })

  it('is unavailable when nothing listens where it sends', async () => {
    const closed = createServer()
    await new Promise<void>(done => closed.listen(0, '127.0.0.1', done))
    const { port } = closed.address() as AddressInfo
    await new Promise<void>(done => closed.close(() => done()))
    const endpoint = `http://127.0.0.1:${String(port)}/api/v1/audio/transcriptions`
    expect(await createTranscribeEngine({ endpoint, key: keyed }).convert(inputOf())).toEqual({
      kind: 'failed',
      reason: 'unavailable',
    })
  })

  it('stops the request when it is cancelled, and answers an error', async () => {
    let request: IncomingMessage | undefined
    const slow = createServer(incoming => {
      request = incoming
    })
    servers.push(slow)
    await new Promise<void>(done => slow.listen(0, '127.0.0.1', done))
    const { port } = slow.address() as AddressInfo
    const endpoint = `http://127.0.0.1:${String(port)}/x`
    const stop = new AbortController()
    const converting = createTranscribeEngine({ endpoint, key: keyed }).convert(
      inputOf(wav(), {}, stop.signal),
    )
    while (request === undefined) await new Promise(resolve => setImmediate(resolve))
    const closed = new Promise(resolve => request?.on('close', resolve))
    stop.abort()
    expect(await converting).toEqual({ kind: 'failed', reason: 'error' })
    await closed
  })

  it.each(engineConformanceCases)('passes the conformance case: $name', async item => {
    const { endpoint } = await service((seen, response) => {
      const body = seen.body as { input_audio: { data: string } }
      json(200, {
        text: Buffer.from(body.input_audio.data, 'base64').byteLength > 44 ? 'words' : '',
      })(seen, response)
    })
    await item.run(async () => ({
      engine: createTranscribeEngine({ endpoint, key: keyed }),
      samples: [
        { mediaType: 'audio/wav', bytes: wav(3), parameters: {}, expect: 'converted' },
        {
          mediaType: 'audio/wav',
          bytes: wav().subarray(0, 44),
          parameters: {},
          expect: 'inconvertible',
        },
      ],
    }))
  })
})
