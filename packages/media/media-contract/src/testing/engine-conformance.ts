import assert from 'node:assert/strict'
import {
  declarationProblem,
  type ConverterEngine,
  type EngineInput,
  type EngineOutput,
  type EngineParameters,
} from '../engine.ts'

export type EngineSample = Readonly<{
  mediaType: string
  bytes: Uint8Array
  parameters: EngineParameters
  expect: 'converted' | 'inconvertible'
}>
export type EngineWorld = Readonly<{
  engine: ConverterEngine
  /** Media the engine is to convert in the suite, with what each must come to. */
  samples: readonly EngineSample[]
  dispose?(): Promise<void>
}>
export type EngineConformanceCase = Readonly<{
  name: string
  run(create: () => Promise<EngineWorld>): Promise<void>
}>

const ACCESS = { tenant: 'conformance-tenant' as never, principal: null }
const WAIT_MS = 2_000

function inputOf(sample: EngineSample, signal: AbortSignal) {
  const handed = Uint8Array.from(sample.bytes)
  const input: EngineInput = {
    access: ACCESS,
    media: {
      mediaType: sample.mediaType,
      bytes: handed.byteLength,
      async *open() {
        yield handed
      },
    },
    parameters: sample.parameters,
    signal,
  }
  return { input, handed }
}

function bounded<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: what })), WAIT_MS)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

function known(output: EngineOutput): void {
  const value = output as { kind?: unknown; text?: unknown; derived?: unknown; reason?: unknown }
  if (value.kind === 'inconvertible') return
  if (value.kind === 'failed') {
    assert.ok(['unavailable', 'error', 'outcome-unknown'].includes(value.reason as string))
    return
  }
  assert.equal(value.kind, 'converted')
  assert.equal(typeof value.text, 'string')
  assert.ok(Array.isArray(value.derived))
  for (const item of value.derived as { mediaType?: unknown; bytes?: unknown }[]) {
    assert.ok(typeof item.mediaType === 'string' && item.mediaType !== '')
    assert.ok(item.bytes instanceof Uint8Array)
  }
}

async function within(
  create: () => Promise<EngineWorld>,
  check: (world: EngineWorld) => Promise<void>,
): Promise<void> {
  const world = await create()
  try {
    await check(world)
  } finally {
    await world.dispose?.()
  }
}
const live = (): AbortSignal => new AbortController().signal

export const engineConformanceCases: readonly EngineConformanceCase[] = [
  {
    name: 'the declaration holds together',
    run: create =>
      within(create, async ({ engine, samples }) => {
        assert.equal(declarationProblem(engine.declaration), null)
        assert.ok(samples.length > 0, 'the world gives no sample')
      }),
  },
  {
    name: 'every answer is one of the three kinds',
    run: create =>
      within(create, async ({ engine, samples }) => {
        for (const sample of samples) {
          const output = await bounded(engine.convert(inputOf(sample, live()).input), 'no answer')
          known(output)
          assert.equal(output.kind, sample.expect)
        }
      }),
  },
  {
    name: 'it reads the medium and leaves its bytes alone',
    run: create =>
      within(create, async ({ engine, samples }) => {
        for (const sample of samples) {
          const { input, handed } = inputOf(sample, live())
          await bounded(engine.convert(input), 'no answer')
          assert.deepEqual(handed, sample.bytes)
        }
      }),
  },
  {
    name: 'the same medium gets the same answer',
    run: create =>
      within(create, async ({ engine, samples }) => {
        for (const sample of samples) {
          const first = await bounded(engine.convert(inputOf(sample, live()).input), 'no answer')
          const again = await bounded(engine.convert(inputOf(sample, live()).input), 'no answer')
          assert.deepEqual(again, first)
        }
      }),
  },
  {
    name: 'a cancelled conversion ends',
    run: create =>
      within(create, async ({ engine, samples }) => {
        const [sample] = samples
        assert.ok(sample !== undefined, 'the world gives no sample')
        const cancelled = AbortSignal.abort()
        const work = engine.convert(inputOf(sample, cancelled).input).catch(() => undefined)
        const output = await bounded(work, 'the engine went on after it was cancelled')
        if (output !== undefined && sample.expect === 'converted')
          assert.notEqual(output.kind, 'inconvertible')
      }),
  },
]
