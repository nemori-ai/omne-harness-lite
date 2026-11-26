import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-media-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const BYTES = Buffer.from('the bytes of a small picture, twenty-nine')
const DIGEST = `sha256:${createHash('sha256').update(BYTES).digest('hex')}`
const REF = {
  storage: 'local',
  key: '0123456789abcdef0123456789abcdef',
  mediaType: 'image/png',
  bytes: String(BYTES.byteLength),
  digest: DIGEST,
}
const FACTS = { kind: 'image', widthPixels: 4, heightPixels: 3 }
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

/** A media service that takes parts of 16 bytes and answers what a test overrides. */
function media(over: (seen: Seen) => Answer | undefined = () => undefined, next = 0) {
  return (seen: Seen): Answer | undefined => {
    const given = over(seen)
    if (given !== undefined) return given
    const body = seen.body as Record<string, any>
    switch (seen.operation) {
      case 'begin-upload':
        return {
          outcome: 'succeeded',
          body: { status: { kind: 'uploading', nextSequence: next, partBytes: 16 } },
        }
      case 'append-upload-part':
        return { outcome: 'succeeded', body: { nextSequence: Number(body['sequence']) + 1 } }
      case 'commit-upload':
        return { outcome: 'succeeded', body: { ref: REF, facts: FACTS } }
      case 'describe-media':
        return {
          outcome: 'succeeded',
          body: { state: 'staged', facts: FACTS, preprocess: { kind: 'not-needed' } },
        }
      case 'read-media-page': {
        const offset = Number(body['offset'])
        const part = BYTES.subarray(offset, offset + 16)
        const end = offset + part.byteLength
        return {
          outcome: 'succeeded',
          body: {
            part: base64(part),
            next: end < BYTES.byteLength ? end : null,
            mediaType: 'image/png',
            bytes: BYTES.byteLength,
            facts: FACTS,
          },
        }
      }
      default:
        return undefined
    }
  }
}

async function serve(answer = media()) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  const login = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(login.code).toBe(0)
  return service
}
const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') })
const mediaCalls = (service: FakeService) =>
  service.seen.filter(seen => seen.path.startsWith('/api/media/'))
const operations = (service: FakeService) => mediaCalls(service).map(seen => seen.operation)
const printed = (run: { stdout: string }) => JSON.parse(run.stdout) as Record<string, any>
function picture(name = 'picture.png'): string {
  const file = join(root, name)
  writeFileSync(file, BYTES)
  return file
}

describe('omne media put', () => {
  it('begins an upload under a name of its own, sends the file in the parts the server asks for, commits with the digest and prints the reference', async () => {
    const service = await serve()
    const run = await cli(['media', 'put', '--file', picture()])
    expect(run.code).toBe(0)
    expect(operations(service)).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'append-upload-part',
      'commit-upload',
    ])
    const [begin, ...rest] = mediaCalls(service).map(seen => seen.body as Record<string, any>)
    const upload = begin?.['upload'] as string
    expect(begin).toEqual({
      tenant: tenantText,
      upload,
      mediaType: 'image/png',
      bytes: BYTES.byteLength,
      name: 'picture.png',
    })
    expect(upload).toMatch(/^.+$/)
    expect(rest.slice(0, 3)).toEqual(
      [0, 1, 2].map(sequence => ({
        tenant: tenantText,
        upload,
        sequence,
        part: base64(BYTES.subarray(sequence * 16, sequence * 16 + 16)),
      })),
    )
    expect(rest[3]).toEqual({ tenant: tenantText, upload, digest: DIGEST })
    expect(printed(run)).toMatchObject({
      result: 'response',
      outcome: 'succeeded',
      body: { ref: REF, facts: FACTS },
      request: { tenant: tenantText, upload, file: join(root, 'picture.png') },
    })
    expect(run.stderr).toBe('')
  })

  it('begins again without the name when the server cannot take one, and the upload goes through', async () => {
    let refused = false
    const service = await serve(
      media(seen => {
        if (seen.operation !== 'begin-upload' || !('name' in seen.body) || refused) return undefined
        refused = true
        return { outcome: 'protocol-rejected', body: {} }
      }),
    )
    const run = await cli(['media', 'put', '--file', picture()])
    expect(run.code).toBe(0)
    const begins = mediaCalls(service).filter(seen => seen.operation === 'begin-upload')
    expect(begins.map(seen => 'name' in seen.body)).toEqual([true, false])
    expect(printed(run).body).toEqual({ ref: REF, facts: FACTS })
  })

  it('goes on from the part the server says is next when the upload was begun before', async () => {
    const service = await serve(media(undefined, 2))
    const run = await cli(['media', 'put', '--file', picture(), '--upload', 'up-1'])
    expect(run.code).toBe(0)
    const parts = mediaCalls(service).filter(seen => seen.operation === 'append-upload-part')
    expect(parts.map(seen => seen.body['sequence'])).toEqual([2])
    expect(mediaCalls(service).every(seen => seen.body['upload'] === 'up-1')).toBe(true)
  })

  it('commits again, and sends no part, when the upload is already committed', async () => {
    const service = await serve(
      media(seen =>
        seen.operation === 'begin-upload'
          ? {
              outcome: 'succeeded',
              body: { status: { kind: 'committed', ref: REF, facts: FACTS } },
            }
          : undefined,
      ),
    )
    const run = await cli(['media', 'put', '--file', picture(), '--upload', 'up-1'])
    expect(run.code).toBe(0)
    expect(operations(service)).toEqual(['begin-upload', 'commit-upload'])
    expect(printed(run).body).toEqual({ ref: REF, facts: FACTS })
  })

  it.each([
    ['picture.jpg', 'image/jpeg'],
    ['picture.JPEG', 'image/jpeg'],
    ['picture.webp', 'image/webp'],
    ['voice.wav', 'audio/wav'],
    ['paper.pdf', 'application/pdf'],
  ])('takes the type of %s from its name', async (name, mediaType) => {
    const service = await serve()
    expect((await cli(['media', 'put', '--file', picture(name)])).code).toBe(0)
    expect(mediaCalls(service)[0]?.body['mediaType']).toBe(mediaType)
  })

  it('takes the type that is given over the one of the name, and asks for one when the name says none', async () => {
    const service = await serve()
    const named = await cli([
      'media',
      'put',
      '--file',
      picture('a.bin'),
      '--media-type',
      'image/webp',
    ])
    expect(named.code).toBe(0)
    expect(mediaCalls(service)[0]?.body['mediaType']).toBe('image/webp')
    const unnamed = await cli(['media', 'put', '--file', picture('b.bin')])
    expect(unnamed.code).toBe(2)
    expect(unnamed.stderr).toContain('--media-type')
    expect(operations(service)).toHaveLength(5)
  })

  it('stops at the first refusal, prints it, exits 3 and does not commit', async () => {
    const service = await serve(
      media(seen =>
        seen.operation === 'append-upload-part' && seen.body['sequence'] === 1
          ? { outcome: 'conflict', body: { reason: 'other-bytes' } }
          : undefined,
      ),
    )
    const run = await cli(['media', 'put', '--file', picture()])
    expect(run.code).toBe(3)
    expect(operations(service)).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
    ])
    expect(printed(run)).toMatchObject({ outcome: 'conflict', body: { reason: 'other-bytes' } })
  })

  it('after an outcome nobody knows, exits 5 and says how to go on with the same upload', async () => {
    const service = await serve(
      media(seen =>
        seen.operation === 'commit-upload' ? { outcome: 'unknown', body: {} } : undefined,
      ),
    )
    const run = await cli(['media', 'put', '--file', picture()])
    expect(run.code).toBe(5)
    const upload = mediaCalls(service)[0]?.body['upload'] as string
    expect(run.stderr).toContain(`--upload ${upload}`)
  })

  it('sends no part and does not commit when the upload cannot begin', async () => {
    const service = await serve(
      media(seen =>
        seen.operation === 'begin-upload' ? { outcome: 'limited', body: { limit: 8 } } : undefined,
      ),
    )
    const run = await cli(['media', 'put', '--file', picture()])
    expect(run.code).toBe(3)
    expect(operations(service)).toEqual(['begin-upload'])
    expect(printed(run)).toMatchObject({ outcome: 'limited', body: { limit: 8 } })
  })

  it('sends no empty part after a file that ends on a part boundary', async () => {
    const service = await serve()
    const file = join(root, 'even.png')
    writeFileSync(file, BYTES.subarray(0, 32))
    expect((await cli(['media', 'put', '--file', file])).code).toBe(0)
    const parts = mediaCalls(service).filter(seen => seen.operation === 'append-upload-part')
    expect(parts.map(seen => seen.body['sequence'])).toEqual([0, 1])
  })

  it('sends nothing for a file it cannot read, and exits 1', async () => {
    const service = await serve()
    const run = await cli(['media', 'put', '--file', join(root, 'missing.png')])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('cannot read')
    expect(mediaCalls(service)).toEqual([])
  })
})

describe('omne media get', () => {
  const ref = JSON.stringify(REF)

  it('reads the medium page after page, writes it to the file and prints its size, type and digest', async () => {
    const service = await serve()
    const out = join(root, 'back.png')
    const run = await cli(['media', 'get', '--ref', ref, '--out', out])
    expect(run.code).toBe(0)
    expect(readFileSync(out).equals(BYTES)).toBe(true)
    const pages = mediaCalls(service).map(seen => seen.body)
    expect(pages.map(page => page['offset'])).toEqual([0, 16, 32])
    expect(pages[0]).toMatchObject({ tenant: tenantText, ref: REF })
    expect(printed(run)).toMatchObject({
      outcome: 'succeeded',
      body: { bytes: BYTES.byteLength, mediaType: 'image/png', digest: DIGEST },
      request: { tenant: tenantText, out },
    })
  })

  it('writes no file when a page is refused, prints the refusal and exits 3', async () => {
    await serve(
      media(seen =>
        seen.operation === 'read-media-page' && seen.body['offset'] === 16
          ? { outcome: 'not-found', body: { reason: 'material' } }
          : undefined,
      ),
    )
    const out = join(root, 'back.png')
    const run = await cli(['media', 'get', '--ref', ref, '--out', out])
    expect(run.code).toBe(3)
    expect(existsSync(out)).toBe(false)
    expect(printed(run)).toMatchObject({
      outcome: 'not-found',
      body: { reason: 'material' },
      request: { tenant: tenantText, out },
    })
  })

  it('refuses a reference that is not the JSON of one, and sends nothing', async () => {
    const service = await serve()
    for (const bad of ['not json', '{"storage":"local"}', '[]']) {
      const run = await cli(['media', 'get', '--ref', bad, '--out', join(root, 'x')])
      expect(run.code).toBe(2)
    }
    expect(mediaCalls(service)).toEqual([])
  })

  it('exits 1 when the file cannot be written', async () => {
    await serve()
    const run = await cli([
      'media',
      'get',
      '--ref',
      ref,
      '--out',
      join(root, 'no-such-dir', 'x.png'),
    ])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('cannot write')
  })
})

describe('omne media describe', () => {
  it('prints the state and the facts of a medium', async () => {
    const service = await serve()
    const run = await cli(['media', 'describe', '--ref', JSON.stringify(REF)])
    expect(run.code).toBe(0)
    expect(mediaCalls(service)[0]?.body).toEqual({ tenant: tenantText, ref: REF })
    expect(printed(run)).toMatchObject({
      outcome: 'succeeded',
      body: { state: 'staged', facts: FACTS },
    })
  })

  it('says nothing about an upload after an outcome nobody knows: there is none to go on with', async () => {
    await serve(
      media(seen =>
        seen.operation === 'describe-media' ? { outcome: 'unknown', body: {} } : undefined,
      ),
    )
    const run = await cli(['media', 'describe', '--ref', JSON.stringify(REF)])
    expect(run.code).toBe(5)
    expect(run.stderr).not.toContain('--upload')
  })

  it('refuses an action it does not have and an option it does not take, by the name of the command', async () => {
    const service = await serve()
    expect(await cli(['media'])).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('omne media:'),
    })
    expect(await cli(['media', 'delete'])).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('omne media:'),
    })
    expect(await cli(['media', 'put', '--file', 'a', '--x', 'y'])).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('omne media put: unrecognized'),
    })
    expect(mediaCalls(service)).toEqual([])
  })

  it.each([
    [['media', 'put'], 'omne media put: missing --file'],
    [['media', 'get', '--out', 'x'], 'omne media get: missing --ref'],
    [['media', 'get', '--ref', '{}'], 'omne media get: missing --out'],
    [['media', 'describe'], 'omne media describe: missing --ref'],
  ])('%j says which option is missing and sends nothing', async (argv, message) => {
    const service = await serve()
    const run = await cli(argv)
    expect(run.code).toBe(2)
    expect(run.stderr).toContain(message)
    expect(mediaCalls(service)).toEqual([])
  })

  it('sends nothing without a login, and exits 1', async () => {
    const service = await startFakeService(seen => media()(seen) ?? defaultAnswer(seen))
    services.push(service)
    const run = await cli([
      'media',
      'describe',
      '--ref',
      JSON.stringify(REF),
      '--server',
      service.origin,
    ])
    expect(run.code).toBe(1)
    expect(service.seen).toEqual([])
  })
})
