import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSessionOwners } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-attach-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const BYTES = Buffer.from('the bytes of a small picture, twenty-nine')
const FACTS = { kind: 'image', widthPixels: 4, heightPixels: 3 }
const refOf = (upload: unknown, mediaType: unknown) => ({
  storage: 'local',
  key: `key-of-${String(upload)}`,
  mediaType: String(mediaType),
  bytes: String(BYTES.byteLength),
  digest: 'sha256:d',
})

/** A media service that remembers the type each upload began with and commits to a reference of it. */
function media(over: (seen: Seen) => Answer | undefined = () => undefined) {
  const types = new Map<string, unknown>()
  return (seen: Seen): Answer | undefined => {
    const given = over(seen)
    if (given !== undefined) return given
    const body = seen.body as Record<string, unknown>
    switch (seen.operation) {
      case 'begin-upload':
        types.set(String(body['upload']), body['mediaType'])
        return {
          outcome: 'succeeded',
          body: { status: { kind: 'uploading', nextSequence: 0, partBytes: 16 } },
        }
      case 'append-upload-part':
        return { outcome: 'succeeded', body: { nextSequence: Number(body['sequence']) + 1 } }
      case 'commit-upload':
        return {
          outcome: 'succeeded',
          body: { ref: refOf(body['upload'], types.get(String(body['upload']))), facts: FACTS },
        }
      default:
        return undefined
    }
  }
}

async function serve(answer = media()) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(writeSessionOwners(state, new Map([[sessionId, tenantText]])).kind).toBe('written')
  return service
}
const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })
function file(name: string): string {
  const path = join(root, name)
  writeFileSync(path, BYTES)
  return path
}
const operations = (service: FakeService) =>
  service.seen.map(seen => seen.operation).filter(name => name !== 'issue-login')
type Block = Record<string, unknown>
function blocksOf(service: FakeService, operation = 'send-input'): Block[] {
  const sent = service.seen.findLast(seen => seen.operation === operation)
  if (sent === undefined) throw new Error(`no ${operation} was sent`)
  return (sent.body as { message: { blocks: Block[] } }).message.blocks
}

describe('send-input --attach', () => {
  it('uploads each file, then sends one message: the words first, then a block that refers to each', async () => {
    const service = await serve()
    const run = await cli([
      'send-input',
      '--session',
      sessionId,
      '--attach',
      file('a.png'),
      '--text',
      'look at these',
      '--attach',
      file('b.jpg'),
    ])
    expect(run.code, run.stderr).toBe(0)
    expect(operations(service)).toEqual([
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'append-upload-part',
      'commit-upload',
      'begin-upload',
      'append-upload-part',
      'append-upload-part',
      'append-upload-part',
      'commit-upload',
      'send-input',
    ])
    const uploads = service.seen
      .filter(seen => seen.operation === 'begin-upload')
      .map(seen => seen.body as Record<string, unknown>)
    expect(uploads.map(body => [body['mediaType'], body['bytes'], body['tenant']])).toEqual([
      ['image/png', BYTES.byteLength, tenantText],
      ['image/jpeg', BYTES.byteLength, tenantText],
    ])
    const blocks = blocksOf(service)
    expect(blocks.map(block => block['kind'])).toEqual(['text', 'image', 'image'])
    expect(blocks[0]).toMatchObject({ text: 'look at these' })
    expect(blocks.slice(1).map(block => [block['ref'], block['transcript']])).toEqual([
      [refOf(uploads[0]?.['upload'], 'image/png'), null],
      [refOf(uploads[1]?.['upload'], 'image/jpeg'), null],
    ])
    expect(new Set(blocks.map(block => block['id'])).size).toBe(3)
  })

  it('attachments alone are a message; a voice and a file are blocks of their own kind', async () => {
    const service = await serve()
    const run = await cli([
      'interrupt-input',
      '--session',
      sessionId,
      '--attach',
      file('note.wav'),
      '--attach',
      file('paper.pdf'),
    ])
    expect(run.code, run.stderr).toBe(0)
    expect(blocksOf(service, 'interrupt-input').map(block => block['kind'])).toEqual([
      'voice',
      'file',
    ])
  })

  it('neither words nor an attachment is a usage error; so is an attachment whose name says no type', async () => {
    const service = await serve()
    const none = await cli(['send-input', '--session', sessionId])
    expect(none.code).toBe(2)
    const unknown = await cli(['send-input', '--session', sessionId, '--attach', file('data.bin')])
    expect(unknown.code).toBe(2)
    expect(unknown.stderr).toContain('data.bin')
    expect(operations(service)).toEqual([])
  })

  it('a file that cannot be read stops the command before anything is sent', async () => {
    const service = await serve()
    const run = await cli([
      'send-input',
      '--session',
      sessionId,
      '--text',
      'x',
      '--attach',
      join(root, 'missing.png'),
    ])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('missing.png')
    expect(operations(service)).toEqual([])
  })

  it('an upload the server refuses stops the command: its answer is reported and the message is not sent', async () => {
    const service = await serve(
      media(seen =>
        seen.operation === 'commit-upload'
          ? { outcome: 'invalid', body: { reason: 'type-mismatch' } }
          : undefined,
      ),
    )
    const run = await cli([
      'send-input',
      '--session',
      sessionId,
      '--text',
      'x',
      '--attach',
      file('a.png'),
    ])
    expect(run.code).not.toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({ outcome: 'invalid' })
    expect(run.stderr).toContain('a.png')
    expect(operations(service)).not.toContain('send-input')
  })

  it('only --attach may be given twice: another option twice is still unrecognized', async () => {
    const service = await serve()
    const twice = ['send-input', '--session', sessionId, '--text', 'a', '--text', 'b']
    expect((await cli(twice)).code).toBe(2)
    const elsewhere = ['read-history', '--session', sessionId, '--attach', file('a.png')]
    expect((await cli(elsewhere)).code).toBe(2)
    expect(operations(service)).toEqual([])
  })
})
