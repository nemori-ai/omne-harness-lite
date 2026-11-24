import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type {
  FacilityResult,
  ScreenFrame,
  ScreenInfo,
} from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolResult } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  type ToolMediaProduct,
  type ToolMediaSink,
  type ToolMessageContentBlock,
  type ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import {
  createScreenAuthor,
  screenToolModule,
  type ScreenAuthorEnvironment,
} from '@omne-harness/tool-definitions'
import { run, runRaw, value } from './run-author.ts'

type Result = ToolResult<ToolMessageContentBlock>
type Put = Parameters<ToolMediaSink['put']>[0]

const LEFT: ScreenInfo = {
  id: 'left',
  name: 'Built-in',
  primary: true,
  pixels: { width: 64, height: 48 },
  scale: 2,
  origin: { x: 0, y: 0 },
}
const RIGHT: ScreenInfo = {
  ...LEFT,
  id: 'right',
  name: 'External',
  primary: false,
  scale: 1,
  origin: { x: 32, y: 0 },
}
const TAKEN = '2026-11-20T12:00:00.000Z'

const png = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer()

async function frameOf(
  screen: ScreenInfo,
  width = screen.pixels.width,
  height = screen.pixels.height,
  region = { x: 0, y: 0, ...screen.pixels },
) {
  const frame: ScreenFrame = {
    screen,
    region,
    image: { mediaType: 'image/png', bytes: await png(width, height), width, height },
    takenAt: TAKEN,
  }
  return frame
}

function construction(overrides: Readonly<Record<string, number>> = {}): JsonValue {
  const values = {
    resultMaxBytes: 32_768,
    captureMaxLongSide: 2048,
    imageMaxWidth: 256,
    imageMaxHeight: 256,
    imageMaxDecodedBytes: 256 * 256 * 4,
    imageConcurrency: 1,
    ...overrides,
  }
  return {
    kind: 'object',
    entries: Object.entries(values).map(([key, each]) => ({
      key,
      value: { kind: 'number', lexeme: String(each) },
    })),
  }
}

function world(limits?: Readonly<Record<string, number>>) {
  const asked: unknown[] = []
  const puts: Put[] = []
  const script = {
    list: (id: string): FacilityResult<readonly ScreenInfo[]> => ({
      kind: 'done',
      requestId: id,
      value: [LEFT, RIGHT],
    }),
    capture: async (
      id: string,
      screen: string | null,
      region: Readonly<{ x: number; y: number; width: number; height: number }> | null = null,
    ): Promise<FacilityResult<ScreenFrame>> => {
      const info = screen === 'right' ? RIGHT : LEFT
      return {
        kind: 'done',
        requestId: id,
        value:
          region === null
            ? await frameOf(info)
            : await frameOf(info, region.width, region.height, region),
      }
    },
    put: (put: Put): Outcome<ToolMediaProduct, ToolPrimitiveFailure> =>
      succeed({
        ref: {
          storage: 'media',
          key: `stored-${String(put.bytes.byteLength)}`,
          mediaType: put.mediaType,
          bytes: String(put.bytes.byteLength),
          digest: `sha256:${'d'.repeat(64)}`,
        },
        facts: { kind: 'image', widthPixels: 0, heightPixels: 0 },
      }),
  }
  const environment: ScreenAuthorEnvironment = {
    screen: {
      list: async () => script.list('fixture'),
      capture: async request => {
        asked.push(request)
        return script.capture('fixture', request.screen, request.region)
      },
    },
    media: {
      put: async put => {
        puts.push(put)
        return script.put(put)
      },
    },
  }
  const author = value(createScreenAuthor(construction(limits)))
  const capture = async (args: object = {}) =>
    (await runRaw(author, 'capture', args, environment)) as Result
  const screens = () => run(author, 'screens', {}, environment)
  return { author, script, asked, puts, capture, screens }
}

const textOf = (result: Result) =>
  result.content.map(block => (block.kind === 'text' ? block.text : `<${block.kind}>`)).join('|')

describe('Screen lists the screens of the machine', () => {
  it('one line for each screen: identifier, name, primary, pixels, scale, place on the desktop', async () => {
    expect(await world().screens()).toBe(
      [
        'done Screen screens',
        'screen="left" name="Built-in" primary=true pixels=64x48 scale=2 origin=0,0',
        'screen="right" name="External" primary=false pixels=64x48 scale=1 origin=32,0',
      ].join('\n'),
    )
  })

  it('says why when the system has not permitted reading the screen, and answers the facility otherwise', async () => {
    const { script, screens } = world()
    script.list = id => ({ kind: 'rejected', requestId: id, reason: 'notAuthorized' })
    expect(await screens()).toMatch(
      /^rejected reason=notAuthorized the system has not permitted reading the screen\. On macOS the permission is Screen Recording \(System Settings > Privacy & Security > Screen Recording\), held by the application that started this server/u,
    )
    script.list = id => ({ kind: 'unknown', requestId: id })
    expect(await screens()).toBe('unknown request="fixture"')
  })
})

describe('Screen capture hands one frame to the store of products', () => {
  it('the primary screen when none is named: an image block that refers to what was stored, then one line that carries the coordinate system', async () => {
    const { capture, asked, puts } = world()
    const result = await capture()
    expect(asked).toEqual([{ screen: null, region: null }])
    expect(puts).toHaveLength(1)
    expect(puts[0]?.mediaType).toBe('image/png')
    expect(Buffer.from(puts[0]!.bytes).equals(await png(64, 48))).toBe(true)
    expect(result).toEqual({
      content: [
        {
          kind: 'image',
          id: 'Screen.capture.image',
          visibility: { toHuman: true, toModel: true },
          ref: expect.objectContaining({ mediaType: 'image/png' }) as unknown,
          transcript: null,
          facts: { kind: 'image', widthPixels: 0, heightPixels: 0 },
        },
        {
          kind: 'text',
          id: 'Screen.capture.text',
          visibility: { toHuman: true, toModel: true },
          text: `done Screen capture screen="left" name="Built-in" screen_pixels=64x48 scale=2 region=0,0,64x48 image_pixels=64x48 taken_at=${TAKEN}`,
        },
      ],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    })
  })

  it('a region of the screen: the facility is asked for that rectangle, and the line says which rectangle the picture covers', async () => {
    const { capture, asked } = world()
    const region = { x: 8, y: 4, width: 16, height: 12 }
    const text = textOf(await capture({ screen: 'right', region }))
    expect(asked).toEqual([{ screen: 'right', region }])
    expect(text).toContain('screen_pixels=64x48 scale=1 region=8,4,16x12 image_pixels=16x12')
  })

  it.each([
    ['a negative corner', { x: -1, y: 0, width: 4, height: 4 }],
    ['an empty width', { x: 0, y: 0, width: 0, height: 4 }],
    ['a missing side', { x: 0, y: 0, width: 4 }],
    ['a key of its own', { x: 0, y: 0, width: 4, height: 4, depth: 1 }],
    ['a fraction', { x: 0.5, y: 0, width: 4, height: 4 }],
    ['not an object', '0,0,4,4'],
  ])('a region with %s is refused before the facility is asked', async (_case, region) => {
    const { capture, asked } = world()
    await expect(capture({ region })).rejects.toThrow()
    expect(asked).toEqual([])
  })

  it('a region the screen does not hold: says so and how to find the pixels of a screen', async () => {
    const { capture, script } = world()
    script.capture = async id => ({ kind: 'rejected', requestId: id, reason: 'invalidInput' })
    expect(textOf(await capture({ region: { x: 60, y: 0, width: 16, height: 12 } }))).toBe(
      'rejected reason=invalidInput region=60,0,16x12 is not inside the screen; screens gives the pixels of each screen',
    )
  })

  it('the named screen', async () => {
    const { capture, asked } = world()
    expect(textOf(await capture({ screen: 'right' }))).toContain('screen="right" name="External"')
    expect(asked).toEqual([{ screen: 'right', region: null }])
  })

  it('a frame whose longer side is over the limit is made smaller, in proportion, and the line says both sizes', async () => {
    const { capture, puts } = world({ captureMaxLongSide: 32 })
    const result = await capture()
    const meta = await sharp(Buffer.from(puts[0]!.bytes)).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 32, 24])
    expect(textOf(result)).toBe(
      `<image>|done Screen capture screen="left" name="Built-in" screen_pixels=64x48 scale=2 region=0,0,64x48 image_pixels=32x24 taken_at=${TAKEN}`,
    )
    const exact = world({ captureMaxLongSide: 64 })
    await exact.capture()
    expect(Buffer.from(exact.puts[0]!.bytes).equals(await png(64, 48))).toBe(true)
  })

  it('a tall frame is limited by its height', async () => {
    const { script, capture, puts } = world({ captureMaxLongSide: 32 })
    script.capture = async id => ({
      kind: 'done',
      requestId: id,
      value: await frameOf(LEFT, 16, 64),
    })
    expect(textOf(await capture())).toContain('image_pixels=8x32')
    const meta = await sharp(Buffer.from(puts[0]!.bytes)).metadata()
    expect([meta.width, meta.height]).toEqual([8, 32])
  })
})

describe('Screen capture refuses, stores nothing, and answers one line', () => {
  const refused = async (change: (w: ReturnType<typeof world>) => void, args: object = {}) => {
    const w = world()
    change(w)
    const result = await w.capture(args)
    expect(w.puts).toEqual([])
    expect(result.content).toHaveLength(1)
    return textOf(result)
  }

  it('no permission of the system', async () => {
    expect(
      await refused(w => {
        w.script.capture = async id => ({
          kind: 'rejected',
          requestId: id,
          reason: 'notAuthorized',
        })
      }),
    ).toMatch(/^rejected reason=notAuthorized the system has not permitted reading the screen/u)
  })

  it('a screen the machine does not have: it does not fall back to the primary one', async () => {
    expect(
      await refused(
        w => {
          w.script.capture = async id => ({ kind: 'rejected', requestId: id, reason: 'notFound' })
        },
        { screen: 'gone' },
      ),
    ).toBe(
      'rejected reason=notFound screen="gone" is not a screen of this machine; list them with screens',
    )
  })

  it('not found says which screen only when one was named, and only for that reason', async () => {
    expect(
      await refused(w => {
        w.script.capture = async id => ({ kind: 'rejected', requestId: id, reason: 'notFound' })
      }),
    ).toBe('rejected request="fixture" reason=notFound')
    expect(
      await refused(
        w => {
          w.script.capture = async id => ({
            kind: 'rejected',
            requestId: id,
            reason: 'invalidInput',
          })
        },
        { screen: 'right' },
      ),
    ).toBe('rejected request="fixture" reason=invalidInput')
  })

  it('any other answer of the facility, as it is', async () => {
    expect(
      await refused(w => {
        w.script.capture = async id => ({ kind: 'rejected', requestId: id, reason: 'unavailable' })
      }),
    ).toBe('rejected request="fixture" reason=unavailable')
    expect(
      await refused(w => {
        w.script.capture = async id => ({ kind: 'unknown', requestId: id })
      }),
    ).toBe('unknown request="fixture"')
  })

  it('a frame over the image budget, and bytes that are no picture', async () => {
    expect(
      await refused(w => {
        w.script.capture = async id => ({
          kind: 'done',
          requestId: id,
          value: await frameOf(LEFT, 257, 8),
        })
      }),
    ).toBe('rejected reason=over-budget screen="left"')
    expect(
      await refused(w => {
        w.script.capture = async id => {
          const frame = await frameOf(LEFT)
          return {
            kind: 'done',
            requestId: id,
            value: { ...frame, image: { ...frame.image, bytes: new Uint8Array([1, 2, 3]) } },
          }
        }
      }),
    ).toBe('rejected reason=not-image screen="left"')
  })
})

describe('Screen capture says what the store answered', () => {
  const answered = async (failure: ToolPrimitiveFailure) => {
    const w = world()
    w.script.put = () => fail(failure)
    const result = await w.capture()
    expect(result.content).toHaveLength(1)
    return textOf(result)
  }

  it('no store, no answer, and a refusal', async () => {
    expect(
      await answered({ kind: 'unavailable', operation: 'media.put', reason: 'no provider' }),
    ).toBe('unavailable screen="left" the picture was not stored: no provider')
    expect(await answered({ kind: 'unknown', operation: 'media.put', reason: 'no answer' })).toBe(
      'unknown screen="left" whether the picture was stored is not known: no answer',
    )
    expect(await answered({ kind: 'too-large', reason: 'over the budget of the store' })).toBe(
      'rejected reason=too-large screen="left" over the budget of the store',
    )
  })
})

describe('Screen gives back what it opened', () => {
  it('takes frame after frame where only one picture may be open at a time', async () => {
    const { capture, puts } = world({ imageConcurrency: 1 })
    for (const _ of [1, 2, 3])
      expect(textOf(await capture())).toMatch(/^<image>\|done Screen capture /u)
    expect(puts).toHaveLength(3)
  })
})

describe('the declaration of Screen', () => {
  it('is the tool Screen of this package, and its help is under that name', async () => {
    expect(screenToolModule.executor).toMatchObject({
      owner: '@omne-harness/tool-definitions',
      name: 'Screen',
      revision: '1',
    })
    const { author } = world()
    expect(value(screenToolModule.createAuthor(construction())).facts).toEqual(author.facts)
    const environment = { screen: {}, media: {} } as unknown as ScreenAuthorEnvironment
    expect(await run(author, 'help', {}, environment)).toMatch(/^done Screen help\n/u)
  })

  it('needs a placement with the screen facility; capture adds a picture to its result; both commands are behind one gate that asks', () => {
    const { author } = world()
    const definition = deriveDefinition(
      {
        asset: {
          name: 'Screen',
          adoption: { owner: 'test', name: 'Screen', revision: '1', digest: 'sha256:screen' },
        },
        requiredCapabilities: [],
      },
      author.facts,
    )
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(JSON.stringify(definition.declarations.environment?.value)).toContain('"screen"')
    expect(definition.declarations.outputModalities).toEqual(['text'])
    const byName = Object.fromEntries(definition.commands.map(command => [command.name, command]))
    expect(Object.keys(byName).sort()).toEqual(['capture', 'help', 'screens'])
    expect(byName['capture']?.modalities).toEqual(['image'])
    expect(byName['screens']).not.toHaveProperty('modalities')
    expect(definition.gates).toEqual([
      { id: 'read', title: '查看用法', default: 'auto' },
      { id: 'observe', title: '看屏幕', default: 'ask' },
    ])
    expect([
      byName['screens']?.release,
      byName['capture']?.release,
      byName['help']?.release,
    ]).toEqual([{ gate: 'observe' }, { gate: 'observe' }, { gate: 'read' }])
  })

  it.each([
    'resultMaxBytes',
    'captureMaxLongSide',
    'imageMaxWidth',
    'imageMaxHeight',
    'imageMaxDecodedBytes',
    'imageConcurrency',
  ])('refuses a construction without %s', name => {
    const complete = construction()
    if (complete.kind !== 'object') throw new Error('object')
    const without = { ...complete, entries: complete.entries.filter(entry => entry.key !== name) }
    expect(createScreenAuthor(without)).toMatchObject({
      failure: { field: 'construction', reason: `missing-field:${name}` },
    })
  })
})
