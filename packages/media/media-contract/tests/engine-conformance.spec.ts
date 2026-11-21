import { describe, expect, it } from 'vitest'
import {
  declarationProblem,
  engineAccepts,
  isEngineName,
  type ConverterEngine,
  type EngineDeclaration,
} from '@omne-harness/media-contract'
import {
  createScriptedEngine,
  engineConformanceCases,
  type EngineWorld,
} from '@omne-harness/media-contract/testing'

const SAMPLES: EngineWorld['samples'] = [
  { mediaType: 'audio/wav', bytes: new Uint8Array([1, 2, 3]), parameters: {}, expect: 'converted' },
  { mediaType: 'audio/wav', bytes: new Uint8Array([]), parameters: {}, expect: 'inconvertible' },
]

/** An engine that says how many bytes it was handed; no bytes at all cannot be converted. */
const counting = () =>
  createScriptedEngine(async input => {
    if (typeof input.access.tenant !== 'string' || input.signal.aborted)
      return { kind: 'failed', reason: 'error' }
    let bytes = 0
    for await (const part of input.media.open()) bytes += part.byteLength
    return bytes === 0
      ? { kind: 'inconvertible' }
      : { kind: 'converted', text: `${String(bytes)} bytes`, derived: [] }
  })
const CONVERTIBLE = SAMPLES.slice(0, 1)

/** The names of the cases an engine fails, over the samples given. */
async function verdicts(engine: () => ConverterEngine, samples = SAMPLES, disposed = () => {}) {
  const world = async (): Promise<EngineWorld> => ({
    engine: engine(),
    samples,
    dispose: async () => disposed(),
  })
  const outcomes = await Promise.allSettled(engineConformanceCases.map(item => item.run(world)))
  return engineConformanceCases
    .filter((_, at) => outcomes[at]?.status === 'rejected')
    .map(item => item.name)
}
const answering = (output: unknown) => () =>
  createScriptedEngine(async () => output as never).engine
const worldOf =
  (engine: () => ConverterEngine): (() => Promise<EngineWorld>) =>
  async () => ({ engine: engine(), samples: SAMPLES })

describe('the conformance suite of converter engines', () => {
  it.each(engineConformanceCases)('the scripted engine: $name', async item => {
    await expect(item.run(worldOf(() => counting().engine))).resolves.toBeUndefined()
  })

  it('fails an engine whose declaration does not hold', async () => {
    const { engine } = counting()
    const nameless = { ...engine, declaration: { ...engine.declaration, name: 'Not A Name' } }
    expect(await verdicts(() => nameless)).toEqual(['the declaration holds together'])
  })

  it('fails an engine that changes the bytes it was handed', async () => {
    const scribbling = () =>
      createScriptedEngine(async input => {
        for await (const part of input.media.open()) part.fill(0)
        return { kind: 'converted', text: 'done', derived: [] }
      }).engine
    expect(await verdicts(scribbling)).toContain('it reads the medium and leaves its bytes alone')
  })

  it('fails an engine that answers the same medium differently', async () => {
    let calls = 0
    const restless = () =>
      createScriptedEngine(async () => ({
        kind: 'converted',
        text: `answer ${String(++calls)}`,
        derived: [],
      })).engine
    expect(await verdicts(restless)).toContain('the same medium gets the same answer')
  })

  it('fails an engine that goes on after it was cancelled, one that throws, and one that answers no known kind', async () => {
    const deaf = () => createScriptedEngine(() => new Promise<never>(() => {})).engine
    expect(await verdicts(deaf)).toContain('a cancelled conversion ends')
    const throwing = () => createScriptedEngine(() => Promise.reject(new Error('boom'))).engine
    expect(await verdicts(throwing)).toContain('every answer is one of the three kinds')
    const vague = () => createScriptedEngine(async () => ({ kind: 'maybe' }) as never).engine
    expect(await verdicts(vague)).toContain('every answer is one of the three kinds')
  })

  it.each([
    ['words that are no text', { kind: 'converted', text: 7, derived: [] }],
    ['no list of other media', { kind: 'converted', text: '', derived: null }],
    [
      'a medium of no type',
      { kind: 'converted', text: '', derived: [{ mediaType: '', bytes: new Uint8Array(1) }] },
    ],
    [
      'a medium whose bytes are no bytes',
      { kind: 'converted', text: '', derived: [{ mediaType: 'image/png', bytes: [1] }] },
    ],
    ['a failure where a conversion was due', { kind: 'failed', reason: 'error' }],
  ])('fails an engine that answers %s', async (_, output) => {
    expect(await verdicts(answering(output), CONVERTIBLE)).toEqual([
      'every answer is one of the three kinds',
    ])
  })

  it('fails an engine that tells a medium that can be converted it cannot, cancelled or not', async () => {
    expect(await verdicts(answering({ kind: 'inconvertible' }), CONVERTIBLE)).toEqual([
      'every answer is one of the three kinds',
      'a cancelled conversion ends',
    ])
  })

  it('fails a world that gives no sample: an engine that converted nothing passed nothing', async () => {
    expect(await verdicts(() => counting().engine, [])).toEqual([
      'the declaration holds together',
      'a cancelled conversion ends',
    ])
  })

  it('fails an engine that, cancelled, says the medium cannot be converted: that would be kept as a fact', async () => {
    const hasty = () =>
      createScriptedEngine(async input =>
        input.signal.aborted
          ? { kind: 'inconvertible' }
          : { kind: 'converted', text: 'words', derived: [] },
      ).engine
    expect(await verdicts(hasty, CONVERTIBLE)).toEqual(['a cancelled conversion ends'])
  })

  it('gives every case a world of its own and disposes of it', async () => {
    let disposed = 0
    expect(
      await verdicts(
        () => counting().engine,
        SAMPLES,
        () => (disposed += 1),
      ),
    ).toEqual([])
    expect(disposed).toBe(engineConformanceCases.length)
  })
})

describe('the scripted engine', () => {
  it('records what it was asked and takes its declaration from the caller', async () => {
    const { engine, calls } = createScriptedEngine(async () => ({ kind: 'inconvertible' }), {
      name: 'fixture.other',
      concurrency: 3,
    })
    expect(engine.declaration).toMatchObject({ name: 'fixture.other', concurrency: 3 })
    const signal = new AbortController().signal
    const media = { mediaType: 'audio/wav', bytes: 0, open: async function* () {} }
    const access = { tenant: 'tenant' as never, principal: null }
    expect(await engine.convert({ access, media, parameters: { a: 1 }, signal })).toEqual({
      kind: 'inconvertible',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ parameters: { a: 1 } })
  })
})

describe('what a declaration may say', () => {
  const sound: EngineDeclaration = {
    name: 'voice.transcribe',
    revision: '1',
    accepts: ['audio/wav', 'audio/*'],
    maxBytes: 1024,
    egress: { kind: 'remote', destination: 'https://example.test' },
    concurrency: 2,
    parameters: { type: 'object' },
  }

  it('holds for a sound one', () => {
    expect(declarationProblem(sound)).toBeNull()
  })

  it.each([
    ['a name that is no engine name', { name: 'Voice' }, 'the name "Voice" is not an engine name'],
    ['no revision', { revision: '' }, 'the revision is empty'],
    ['no media type', { accepts: [] }, 'it accepts no media type'],
    ['a media type that is none', { accepts: ['audio'] }, '"audio" is not a media type'],
    ['a whole of everything', { accepts: ['*/*'] }, '"*/*" is not a media type'],
    ['a size of zero', { maxBytes: 0 }, 'the size limit is not a positive whole number'],
    [
      'half a conversion at a time',
      { concurrency: 0.5 },
      'the concurrency is not a positive whole number',
    ],
    [
      'a remote one that names no destination',
      { egress: { kind: 'remote', destination: '' } },
      'a remote engine names no destination',
    ],
    [
      'parameters that are no object',
      { parameters: [] as never },
      'the parameters are not described by an object',
    ],
  ])('%s', (_, change, problem) => {
    expect(declarationProblem({ ...sound, ...change } as EngineDeclaration)).toBe(problem)
  })

  it('an engine name is lower-case words joined by dots and hyphens, at most 64 characters', () => {
    for (const name of ['voice', 'voice.transcribe', 'pdf-text.v2', `a${'b'.repeat(63)}`])
      expect(isEngineName(name)).toBe(true)
    for (const name of [
      '',
      'Voice',
      '1voice',
      'voice..x',
      'voice.',
      '-voice',
      'a b',
      `a${'b'.repeat(64)}`,
    ])
      expect(isEngineName(name)).toBe(false)
  })

  it('accepts a media type it names, and every type of a family it names whole', () => {
    expect(engineAccepts(sound, 'audio/wav')).toBe(true)
    expect(engineAccepts(sound, 'audio/mpeg')).toBe(true)
    expect(engineAccepts({ ...sound, accepts: ['audio/wav'] }, 'audio/mpeg')).toBe(false)
    expect(engineAccepts(sound, 'application/pdf')).toBe(false)
  })
})
