import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { ToolResult } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { createFilesAuthor } from '@omne-harness/tool-definitions'
import { filesConstruction, filesFixture, productOf } from './fixtures/files.ts'
import { runRaw, value } from './run-author.ts'

type Result = ToolResult<ToolMessageContentBlock>
type Format = 'png' | 'jpeg' | 'webp'

function picture(format: Format, width = 12, height = 8): Promise<Buffer> {
  const flat = { width, height, channels: 3 as const, background: { r: 200, g: 30, b: 30 } }
  return sharp({ create: flat }).toFormat(format).toBuffer()
}
type Made = Promise<string | Uint8Array>

/** A PNG whose container reads well and whose pixel data does not decode: the sum still matches. */
async function undecodable(): Promise<Buffer> {
  const copy = Buffer.from(await picture('png'))
  for (let offset = 8; offset + 12 <= copy.length;) {
    const size = copy.readUInt32BE(offset)
    if (copy.toString('ascii', offset + 4, offset + 8) === 'IDAT' && size > 0) {
      copy[offset + 8] = copy[offset + 8]! ^ 0xff
      copy.writeUInt32BE(
        crc32(copy.subarray(offset + 4, offset + 8 + size)) >>> 0,
        offset + 8 + size,
      )
      return copy
    }
    offset += 12 + size
  }
  throw new Error('fixture has no IDAT')
}

/** A PNG that declares two frames: the animation chunk goes in right after the header chunk. */
async function animatedPng(): Promise<Buffer> {
  const png = await picture('png')
  const header = 8 + 12 + png.readUInt32BE(8)
  const body = Buffer.concat([Buffer.from('acTL'), Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])])
  const sized = Buffer.alloc(4)
  sized.writeUInt32BE(8)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([png.subarray(0, header), sized, body, sum, png.subarray(header)])
}

async function opened(
  files: Record<string, string | Uint8Array>,
  path: string,
  options: Readonly<{ limits?: Record<string, number>; directory?: string }> = {},
) {
  const fixture = filesFixture(files)
  const author = value(createFilesAuthor(filesConstruction(options.limits)))
  const environment =
    options.directory === undefined
      ? fixture.environment
      : { ...fixture.environment, directory: options.directory }
  const open = async (at = path) =>
    (await runRaw(author, 'open', { path: at }, environment)) as Result
  return { fixture, open, result: await open() }
}

const textOf = (result: Result) =>
  result.content.map(block => (block.kind === 'text' ? block.text : `<${block.kind}>`)).join('|')

describe('Files open hands a static picture to the store of products', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'opens a %s: one line of text and one image block that refers to what was stored',
    async format => {
      const bytes = await picture(format)
      const { fixture, result } = await opened({ '/shot': bytes }, '/shot')
      expect(fixture.puts).toHaveLength(1)
      const [put] = fixture.puts
      expect(put?.mediaType).toBe(`image/${format}`)
      expect(Buffer.from(put?.bytes ?? []).equals(bytes)).toBe(true)
      const product = productOf(put!)
      expect(result).toEqual({
        content: [
          {
            kind: 'text',
            id: 'Files.open.text',
            visibility: { toHuman: true, toModel: true },
            text: `done Files open path="/shot" media_type=image/${format} width=12 height=8 bytes=${bytes.byteLength}`,
          },
          {
            kind: 'image',
            id: 'Files.open.image',
            visibility: { toHuman: true, toModel: true },
            ref: product.ref,
            transcript: null,
            facts: product.facts,
          },
        ],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      })
    },
  )

  it('resolves a relative path against the working directory of the call and says where it read', async () => {
    const { result } = await opened({ '/work/a.png': await picture('png') }, 'a.png', {
      directory: '/work',
    })
    expect(textOf(result)).toMatch(
      /^done Files open path="a\.png" resolved_path="\/work\/a\.png" media_type=image\/png .*\|<image>$/u,
    )
  })

  it('releases its place in the image budget after each open, stored or refused', async () => {
    const good = await picture('png')
    const { fixture, open } = await opened({ '/a': good, '/b': good, '/bad': 'text' }, '/bad')
    expect(textOf(await open('/a'))).toContain('|<image>')
    expect(textOf(await open('/b'))).toContain('|<image>')
    expect(fixture.puts).toHaveLength(2)
  })
})

describe('Files open refuses, stores nothing, and answers one line of text', () => {
  const refused = async (
    files: Record<string, string | Uint8Array>,
    path: string,
    limits?: Record<string, number>,
  ) => {
    const { fixture, result } = await opened(files, path, limits === undefined ? {} : { limits })
    expect(fixture.puts).toEqual([])
    expect(result.content).toHaveLength(1)
    expect(result).toMatchObject({ data: { kind: 'none' }, attachments: [] })
    return textOf(result)
  }

  it('a file that cannot be read: the refusal of the read, as read answers it', async () => {
    expect(await refused({}, '/missing.png')).toBe('rejected request="fixture" reason=notFound')
  })

  it('a file over the byte limit of open, without looking inside it', async () => {
    const bytes = await picture('png')
    expect(
      await refused({ '/a.png': bytes }, '/a.png', { openMaxBytes: bytes.byteLength - 1 }),
    ).toBe(
      `rejected reason=over-budget path="/a.png" the file is larger than ${bytes.byteLength - 1} bytes`,
    )
    const exact = await opened({ '/a.png': bytes }, '/a.png', {
      limits: { openMaxBytes: bytes.byteLength },
    })
    expect(exact.fixture.puts).toHaveLength(1)
  })

  it.each([
    ['text that is no picture', async (): Made => 'just words', 'not-image'],
    ['an empty file', async (): Made => new Uint8Array(), 'not-image'],
    ['a picture cut short', async (): Made => (await picture('png')).subarray(0, 40), 'damaged'],
    ['a picture whose pixels do not decode', (): Made => undecodable(), 'damaged'],
    ['an animated PNG, whose first frame is not taken', (): Made => animatedPng(), 'animated'],
    ['a picture wider than the budget', (): Made => picture('png', 65, 8), 'over-budget'],
    ['a picture taller than the budget', (): Made => picture('jpeg', 8, 65), 'over-budget'],
  ] as const)('%s', async (_, make, reason) => {
    expect(await refused({ '/x': await make() }, '/x')).toBe(`rejected reason=${reason} path="/x"`)
  })

  it('a picture whose decoded size is over the budget', async () => {
    const bytes = await picture('webp', 60, 60)
    expect(await refused({ '/x': bytes }, '/x', { imageMaxDecodedBytes: 60 * 60 * 4 - 1 })).toBe(
      'rejected reason=over-budget path="/x"',
    )
  })
})

describe('Files open decodes no more pictures at once than its construction says', () => {
  const together = async (imageConcurrency: number) => {
    const good = await picture('png')
    const fixture = filesFixture({ '/a': good, '/b': good })
    const author = value(createFilesAuthor(filesConstruction({ imageConcurrency })))
    const open = (path: string) => runRaw(author, 'open', { path }, fixture.environment)
    const results = (await Promise.all([open('/a'), open('/b')])) as Result[]
    return { texts: results.map(textOf), puts: fixture.puts.length }
  }

  it('one at a time: the second of two opens together is refused as busy, and may be asked again', async () => {
    const { texts, puts } = await together(1)
    expect(texts.filter(text => text === 'rejected reason=busy path="/b"')).toHaveLength(1)
    expect(texts.filter(text => text.endsWith('|<image>'))).toHaveLength(1)
    expect(puts).toBe(1)
  })

  it('two at a time: both are stored, and each may be as large as the budget of one picture', async () => {
    expect(await together(2)).toMatchObject({ puts: 2 })
    const { fixture, result } = await opened({ '/large': await picture('png', 60, 60) }, '/large', {
      limits: { imageConcurrency: 2 },
    })
    expect(textOf(result)).toContain('|<image>')
    expect(fixture.puts).toHaveLength(1)
  })
})

describe('Files open says what the store answered', () => {
  const answered = async (failure: Parameters<typeof fail>[0]) => {
    const fixture = filesFixture({ '/a.png': await picture('png') })
    fixture.stored.answer = () => fail(failure as never)
    const author = value(createFilesAuthor(fixture.config))
    const result = (await runRaw(author, 'open', { path: '/a.png' }, fixture.environment)) as Result
    expect(result.content).toHaveLength(1)
    expect(fixture.puts).toHaveLength(1)
    return textOf(result)
  }

  it('no store: unavailable, and nothing was stored', async () => {
    expect(
      await answered({ kind: 'unavailable', operation: 'media.put', reason: 'no provider' }),
    ).toBe('unavailable path="/a.png" the picture was not stored: no provider')
  })

  it('no answer: unknown, and it does not put the picture again', async () => {
    expect(await answered({ kind: 'unknown', operation: 'media.put', reason: 'no answer' })).toBe(
      'unknown path="/a.png" whether the picture was stored is not known: no answer',
    )
  })

  it('a reference from the store that is no content reference fails the call: no block is made of it', async () => {
    const fixture = filesFixture({ '/a.png': await picture('png') })
    fixture.stored.answer = put => {
      const product = productOf(put)
      return { ok: { ...product, ref: { ...product.ref, bytes: 'many' } } }
    }
    const author = value(createFilesAuthor(fixture.config))
    await expect(runRaw(author, 'open', { path: '/a.png' }, fixture.environment)).rejects.toThrow(
      /Invalid Files open block/u,
    )
  })

  it('a refusal of the store, with its reason', async () => {
    expect(await answered({ kind: 'too-large', reason: 'over the budget of the store' })).toBe(
      'rejected reason=too-large path="/a.png" over the budget of the store',
    )
  })
})

describe('the construction of Files names the limits of open', () => {
  it.each([
    'openMaxBytes',
    'imageMaxWidth',
    'imageMaxHeight',
    'imageMaxDecodedBytes',
    'imageConcurrency',
  ])('refuses a construction without %s, or with zero for it', name => {
    const complete = filesConstruction()
    if (complete.kind !== 'object') throw new Error('object')
    const without = { ...complete, entries: complete.entries.filter(entry => entry.key !== name) }
    expect(createFilesAuthor(without)).toMatchObject({
      failure: { field: 'construction', reason: `missing-field:${name}` },
    })
    expect(createFilesAuthor(filesConstruction({ [name]: 0 }))).toHaveProperty('failure')
  })
})
