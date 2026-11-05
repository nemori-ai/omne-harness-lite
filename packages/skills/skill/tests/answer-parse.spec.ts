// The parsers of the port answers, field by field, by the contract SPEC "端口答复的统一处置".
// Each table row breaks one checked field of a well-formed answer: the field is missing, of the
// wrong type, or outside its range. A broken field makes the whole answer no answer
// (`undefined`); the parser never throws. Well-formed answers come back equal, built anew and
// frozen; a field that the SPEC does not list does not come back. The parsers are called
// directly, without `answered`, so that a parser that throws shows as a throw here.
import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import { isAssetVersion, isPackageDigest } from '@omne-harness/skill-contract'
import { parseLawfulSet, parseResolution, parseVerdict } from '../src/port-answer.ts'

const DIGEST = `sha256:${'a'.repeat(64)}`

/** A JSON tree with every kind of node. */
const PARAMETERS = {
  kind: 'object',
  entries: [
    { key: 'none', value: { kind: 'null' } },
    { key: 'flag', value: { kind: 'boolean', value: true } },
    { key: 'text', value: { kind: 'string', value: 'x' } },
    { key: 'count', value: { kind: 'number', lexeme: '-1.5e3' } },
    { key: 'list', value: { kind: 'array', items: [{ kind: 'null' }] } },
  ],
}

const SCRIPT = {
  entry: 'scripts/run.sh',
  runKind: 'shell',
  facilities: ['network'],
  parameters: PARAMETERS,
}

const ADOPTED = {
  kind: 'adopted',
  ref: {
    capability: { category: 'skill', name: 'review' },
    layer: 'tenant',
    assetVersion: 'v2',
    locator: { kind: 'directory', root: '/skills/review' },
    digest: DIGEST,
  },
  declared: {
    name: 'review',
    description: 'Reviews a change.',
    tools: [{ category: 'tool', name: 'read-file' }],
    scripts: [SCRIPT],
    settings: [{ name: 'tone', category: 'preference' }],
  },
}

const STAND_IN = {
  kind: 'known-unavailable',
  capability: { category: 'skill', name: 'retired' },
  name: 'retired',
  description: 'Was disabled.',
  reason: 'Disabled by the organization.',
}

function identity(category: string, name: string): CapabilityId {
  const id = capabilityId(category, name)
  if (!id.ok) throw new Error(`${category}:${name}`)
  return id.id
}

function granted<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error(`${guard.name} refuses ${String(value)}`)
  return value
}

/** The parse of a `resolve` answer to a request about `review`, the identity of `ADOPTED`. */
const aboutReview = parseResolution({ capability: identity('skill', 'review') })
/** The parse of a `resolve` answer to a request about `retired`, the identity of `STAND_IN`. */
const aboutRetired = parseResolution({ capability: identity('skill', 'retired') })

/** A marker for "this field is absent". */
const MISSING = Symbol('missing')

/** A deep copy of `value` with the field at `path` set to `field`, or removed for `MISSING`. */
function withField(value: unknown, path: readonly (string | number)[], field: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let parent: unknown = copy
  for (const key of path.slice(0, -1)) parent = Reflect.get(Object(parent), key)
  const last = path.at(-1)
  if (last === undefined || typeof parent !== 'object' || parent === null)
    throw new Error(`no field at ${path.join('.')}`)
  if (field === MISSING) Reflect.deleteProperty(parent, last)
  else Reflect.set(parent, last, field)
  return copy
}

/** Whether `value` and every object below it is frozen. */
function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen)
}

/** A function that carries a `kind`: an object, but not one that a port type allows. */
function withKind(kind: string): unknown {
  return Object.assign(() => undefined, { kind })
}

/** A JSON tree of `depth` nested arrays around a null node. */
function nested(depth: number): unknown {
  let node: unknown = { kind: 'null' }
  for (let level = 0; level < depth; level += 1) node = { kind: 'array', items: [node] }
  return node
}

/** A JSON tree of `depth` nested objects, each with one entry, around a null node. */
function nestedObjects(depth: number): unknown {
  let node: unknown = { kind: 'null' }
  for (let level = 0; level < depth; level += 1)
    node = { kind: 'object', entries: [{ key: 'inner', value: node }] }
  return node
}

type Row = readonly [label: string, path: readonly (string | number)[], field: unknown]
type Case = readonly [label: string, answer: unknown]

const SHARED_NOT_AN_OBJECT: readonly unknown[] = [
  undefined,
  null,
  'granted',
  7,
  withKind('granted'),
]

describe('parseVerdict', () => {
  it.each(['granted', 'refused', 'unknown'])('takes the verdict %s', kind => {
    expect(parseVerdict({ kind })).toStrictEqual({ kind })
  })

  it.each<Case>([
    ['a kind outside the set', { kind: 'denied' }],
    ['a kind that is no text', { kind: 1 }],
    ['no kind', {}],
    ['a kind on the prototype only', Object.create({ kind: 'granted' })],
    ...SHARED_NOT_AN_OBJECT.map(value => ['a value that is no plain object', value] as const),
  ])('gives no answer for %s', (_case, answer) => {
    expect(parseVerdict(answer)).toBeUndefined()
  })
})

describe('parseResolution: the answers without a payload', () => {
  it.each(['basis-not-lawful', 'none', 'unknown'])('takes %s', kind => {
    expect(aboutReview({ kind, extra: 1 })).toStrictEqual({ kind })
  })

  it.each<Case>([
    ['a kind outside the set', { kind: 'granted' }],
    ['a kind on the prototype only', Object.create({ kind: 'none' })],
    ...SHARED_NOT_AN_OBJECT.map(value => ['a value that is no plain object', value] as const),
  ])('gives no answer for %s', (_case, answer) => {
    expect(aboutReview(answer)).toBeUndefined()
  })
})

describe('parseResolution: adopted', () => {
  it('takes a well-formed answer, built anew and frozen', () => {
    const parsed = aboutReview(ADOPTED)
    expect(parsed).toStrictEqual(ADOPTED)
    expect(parsed).not.toBe(ADOPTED)
    expect(deeplyFrozen(parsed)).toBe(true)
  })

  it.each<Row>([
    ['each source layer: official', ['ref', 'layer'], 'official'],
    ['each source layer: organization', ['ref', 'layer'], 'organization'],
    ['each source layer: workspace', ['ref', 'layer'], 'workspace'],
    ['a content-store locator', ['ref', 'locator'], { kind: 'content-store', digest: DIGEST }],
    ['each setting category: binding', ['declared', 'settings', 0, 'category'], 'binding'],
    [
      'each setting category: placement-identity',
      ['declared', 'settings', 0, 'category'],
      'placement-identity',
    ],
    ['each setting category: governance', ['declared', 'settings', 0, 'category'], 'governance'],
  ])('takes %s', (_case, path, field) => {
    const answer = withField(ADOPTED, path, field)
    expect(aboutReview(answer)).toStrictEqual(answer)
  })

  it.each<Row>([
    ['no asset version', ['ref', 'assetVersion'], MISSING],
    ['no digest', ['ref', 'digest'], MISSING],
    ['no description', ['declared', 'description'], MISSING],
    ['no script parameters', ['declared', 'scripts', 0, 'parameters'], MISSING],
  ])('takes an answer with %s and gives no such field back', (_case, path) => {
    const answer = withField(ADOPTED, path, MISSING)
    expect(aboutReview(answer)).toStrictEqual(answer)
  })

  it('takes an optional field with the value undefined like an absent one', () => {
    const answer = withField(ADOPTED, ['declared', 'description'], undefined)
    expect(aboutReview(answer)).toStrictEqual(
      withField(ADOPTED, ['declared', 'description'], MISSING),
    )
  })

  it('gives back no field that the SPEC does not list', () => {
    const answer = {
      ...ADOPTED,
      extra: 1,
      ref: { ...ADOPTED.ref, extra: 1, capability: { ...ADOPTED.ref.capability, extra: 1 } },
      declared: { ...ADOPTED.declared, extra: 1, scripts: [{ ...SCRIPT, extra: 1 }] },
    }
    expect(aboutReview(answer)).toStrictEqual(ADOPTED)
  })

  it.each<Row>([
    ['no ref', ['ref'], MISSING],
    ['a ref that is no object', ['ref'], 'ref'],
    ['no capability', ['ref', 'capability'], MISSING],
    ['a capability that is a text', ['ref', 'capability'], 'skill:review'],
    ['a capability category that is no text', ['ref', 'capability', 'category'], 5],
    ['a capability name that is no text', ['ref', 'capability', 'name'], 5],
    ['an empty capability category', ['ref', 'capability', 'category'], ''],
    ['an empty capability name', ['ref', 'capability', 'name'], ''],
    ['no layer', ['ref', 'layer'], MISSING],
    ['a layer that is no text', ['ref', 'layer'], 5],
    ['a layer outside the set', ['ref', 'layer'], 'cloud'],
    ['an asset version that is no text', ['ref', 'assetVersion'], 5],
    ['an asset version with a control character', ['ref', 'assetVersion'], 'v\u0007'],
    ['no locator', ['ref', 'locator'], MISSING],
    ['a locator that is no object', ['ref', 'locator'], '/skills/review'],
    ['a locator of a kind outside the set', ['ref', 'locator', 'kind'], 'ftp'],
    ['a directory locator without a root', ['ref', 'locator', 'root'], MISSING],
    ['a directory locator whose root is no text', ['ref', 'locator', 'root'], 5],
    ['a content-store locator without a digest', ['ref', 'locator'], { kind: 'content-store' }],
    [
      'a content-store locator with another digest form',
      ['ref', 'locator'],
      { kind: 'content-store', digest: 'sha1:00' },
    ],
    ['a digest that is no text', ['ref', 'digest'], 5],
    ['a digest of another form', ['ref', 'digest'], 'sha1:00'],
    ['no declared projection', ['declared'], MISSING],
    ['a declared projection that is no object', ['declared'], 5],
    ['no name', ['declared', 'name'], MISSING],
    ['a name that is no text', ['declared', 'name'], 5],
    ['a name that is no skill name', ['declared', 'name'], 'Not A Name'],
    ['a description that is no text', ['declared', 'description'], 5],
    ['an empty description', ['declared', 'description'], ''],
    ['a description of 16385 characters', ['declared', 'description'], 'x'.repeat(16385)],
    ['no tools', ['declared', 'tools'], MISSING],
    ['tools that are an empty text', ['declared', 'tools'], ''],
    ['tools that are an object', ['declared', 'tools'], {}],
    ['a tool that is no object', ['declared', 'tools', 0], 'read-file'],
    ['a tool without a name', ['declared', 'tools', 0, 'name'], MISSING],
    ['a tool with an empty name', ['declared', 'tools', 0, 'name'], ''],
    ['no scripts', ['declared', 'scripts'], MISSING],
    ['scripts that are an empty text', ['declared', 'scripts'], ''],
    ['a script that is no object', ['declared', 'scripts', 0], 'run.sh'],
    ['a script without an entry', ['declared', 'scripts', 0, 'entry'], MISSING],
    ['a script entry that is no text', ['declared', 'scripts', 0, 'entry'], 5],
    ['a script entry that is no package path', ['declared', 'scripts', 0, 'entry'], '../run.sh'],
    ['a script without a run kind', ['declared', 'scripts', 0, 'runKind'], MISSING],
    ['a run kind that is no text', ['declared', 'scripts', 0, 'runKind'], 5],
    ['a script without facilities', ['declared', 'scripts', 0, 'facilities'], MISSING],
    ['facilities that are an empty text', ['declared', 'scripts', 0, 'facilities'], ''],
    ['a facility that is no text', ['declared', 'scripts', 0, 'facilities', 0], 5],
    ['parameters that are no JSON tree', ['declared', 'scripts', 0, 'parameters'], 5],
    ['no settings', ['declared', 'settings'], MISSING],
    ['settings that are an empty text', ['declared', 'settings'], ''],
    ['a setting that is no object', ['declared', 'settings', 0], 'tone'],
    ['a setting without a name', ['declared', 'settings', 0, 'name'], MISSING],
    ['a setting name that is no text', ['declared', 'settings', 0, 'name'], 5],
    ['a setting without a category', ['declared', 'settings', 0, 'category'], MISSING],
    ['a setting category that is no text', ['declared', 'settings', 0, 'category'], 5],
    ['a setting category outside the set', ['declared', 'settings', 0, 'category'], 'mood'],
  ])('gives no answer for %s', (_case, path, field) => {
    expect(aboutReview(withField(ADOPTED, path, field))).toBeUndefined()
  })

  it('does not take a ref or a declared projection from the prototype', () => {
    const { ref, declared } = ADOPTED
    expect(
      aboutReview(Object.assign(Object.create({ ref }), { kind: 'adopted', declared })),
    ).toBeUndefined()
    expect(
      aboutReview(Object.assign(Object.create({ declared }), { kind: 'adopted', ref })),
    ).toBeUndefined()
  })
})

describe('parseResolution: known-unavailable', () => {
  it('takes a well-formed answer, built anew and frozen', () => {
    const parsed = aboutRetired(STAND_IN)
    expect(parsed).toStrictEqual(STAND_IN)
    expect(deeplyFrozen(parsed)).toBe(true)
  })

  it('takes an answer without a description and gives no description back', () => {
    const answer = withField(STAND_IN, ['description'], MISSING)
    expect(aboutRetired(answer)).toStrictEqual(answer)
  })

  it.each<Row>([
    ['no capability', ['capability'], MISSING],
    ['a capability with an empty name', ['capability', 'name'], ''],
    ['no name', ['name'], MISSING],
    ['a name that is no text', ['name'], 5],
    ['a name that is no skill name', ['name'], 'Retired'],
    ['a description that is no text', ['description'], 5],
    ['an empty description', ['description'], ''],
    ['a description of 16385 characters', ['description'], 'x'.repeat(16385)],
    ['no reason', ['reason'], MISSING],
    ['a reason that is no text', ['reason'], 5],
    ['an empty reason', ['reason'], ''],
    ['a reason with a control character', ['reason'], 'Gone.\u0007'],
  ])('gives no answer for %s', (_case, path, field) => {
    expect(aboutRetired(withField(STAND_IN, path, field))).toBeUndefined()
  })
})

describe('parseResolution: the answer names the requested material (S7)', () => {
  const BASIS = {
    capability: identity('skill', 'review'),
    layer: 'tenant',
    assetVersion: granted(isAssetVersion, 'v2'),
    digest: granted(isPackageDigest, DIGEST),
  } as const
  const withBasis = parseResolution({ capability: identity('skill', 'review'), basis: BASIS })

  it.each<Row>([
    ['a ref of another name', ['ref', 'capability', 'name'], 'large'],
    ['a ref of another category', ['ref', 'capability', 'category'], 'tool'],
  ])('gives no answer for %s, with or without a basis', (_case, path, field) => {
    expect(aboutReview(withField(ADOPTED, path, field))).toBeUndefined()
    expect(withBasis(withField(ADOPTED, path, field))).toBeUndefined()
  })

  it('gives no answer for a stand-in of another identity', () => {
    expect(aboutReview(STAND_IN)).toBeUndefined()
  })

  it.each<Row>([
    ['another source layer', ['ref', 'layer'], 'workspace'],
    ['another asset version', ['ref', 'assetVersion'], 'v1'],
    ['no asset version', ['ref', 'assetVersion'], MISSING],
    ['another digest', ['ref', 'digest'], `sha256:${'b'.repeat(64)}`],
    ['no digest: a basis names material with one', ['ref', 'digest'], MISSING],
  ])('with a basis, gives no answer for %s', (_case, path, field) => {
    const answer = withField(ADOPTED, path, field)
    expect(aboutReview(answer)).toStrictEqual(answer)
    expect(withBasis(answer)).toBeUndefined()
  })

  it('with a basis, takes the ref of its material', () => {
    expect(withBasis(ADOPTED)).toStrictEqual(ADOPTED)
  })

  it('with a basis without an asset version, takes a ref with one', () => {
    const { assetVersion: _dropped, ...unversioned } = BASIS
    const about = parseResolution({ capability: identity('skill', 'review'), basis: unversioned })
    expect(about(ADOPTED)).toStrictEqual(ADOPTED)
  })
})

describe('parseResolution: the JSON tree of script parameters', () => {
  /** The parameters that come back for a script with `parameters`, or `undefined` when none. */
  function parametersOf(parameters: unknown): unknown {
    const parsed = aboutReview(
      withField(ADOPTED, ['declared', 'scripts', 0, 'parameters'], parameters),
    )
    return parsed?.kind === 'adopted' ? parsed.declared.scripts[0]?.parameters : undefined
  }

  it('builds every node anew and freezes it', () => {
    const parameters = parametersOf(PARAMETERS)
    expect(parameters).toStrictEqual(PARAMETERS)
    expect(deeplyFrozen(parameters)).toBe(true)
  })

  it('keeps what it gave when the port changes its object afterwards', () => {
    const parameters = structuredClone(PARAMETERS)
    const given = parametersOf(parameters)
    parameters.entries.push({ key: 'late', value: { kind: 'null' } })
    parameters.entries[0] = { key: 'none', value: { kind: 'string', value: 'changed' } }
    expect(given).toStrictEqual(PARAMETERS)
  })

  it('leaves out the fields that a node or an entry does not list, at every depth', () => {
    const leaky = {
      kind: 'object',
      extra: 1,
      entries: [
        { key: 'a', extra: 1, value: { kind: 'null', leak: 'secret-token' } },
        {
          key: 'b',
          value: { kind: 'array', extra: 1, items: [{ kind: 'string', value: 'x', extra: 1 }] },
        },
      ],
    }
    expect(parametersOf(leaky)).toStrictEqual({
      kind: 'object',
      entries: [
        { key: 'a', value: { kind: 'null' } },
        { key: 'b', value: { kind: 'array', items: [{ kind: 'string', value: 'x' }] } },
      ],
    })
  })

  it.each([
    ['an integer', '0'],
    ['a fraction with several digits', '3.14159'],
    ['a negative fraction with an exponent', '-0.5e-10'],
    ['an exponent with a capital E and a plus sign', '12E+3'],
  ])('takes a number lexeme that is %s', (_case, lexeme) => {
    expect(parametersOf({ kind: 'number', lexeme })).toStrictEqual({ kind: 'number', lexeme })
  })

  it.each([
    ['a lexeme that is no number', { kind: 'number', lexeme: 'not a number' }],
    ['a lexeme with a leading zero', { kind: 'number', lexeme: '01' }],
    ['a lexeme with a trailing point', { kind: 'number', lexeme: '1.' }],
    ['a lexeme with a plus sign', { kind: 'number', lexeme: '+1' }],
    ['a lexeme with white space', { kind: 'number', lexeme: ' 1' }],
    ['a lexeme that is no text', { kind: 'number', lexeme: 1 }],
    ['a number without a lexeme', { kind: 'number' }],
    ['a boolean value that is no boolean', { kind: 'boolean', value: 'true' }],
    ['a string value that is no text', { kind: 'string', value: 1 }],
    ['array items that are no list', { kind: 'array', items: 'x' }],
    ['an array item that is no node', { kind: 'array', items: [5] }],
    ['object entries that are no list', { kind: 'object', entries: {} }],
    [
      'an entry key that is no text',
      { kind: 'object', entries: [{ key: 1, value: { kind: 'null' } }] },
    ],
    ['an entry without a value', { kind: 'object', entries: [{ key: 'a' }] }],
    ['an entry value that is no node', { kind: 'object', entries: [{ key: 'a', value: 5 }] }],
    ['a node of a kind outside the set', { kind: 'set', items: [] }],
    ['a node without a kind', {}],
    ['a node whose kind is on the prototype only', Object.create({ kind: 'null' })],
  ])('gives no answer for %s', (_case, parameters) => {
    expect(parametersOf(parameters)).toBeUndefined()
    expect(
      aboutReview(withField(ADOPTED, ['declared', 'scripts', 0, 'parameters'], parameters)),
    ).toBeUndefined()
  })

  it.each([
    ['arrays', nested],
    ['objects', nestedObjects],
  ])('takes a tree of 16 nested %s and refuses one of 17', (_case, tree) => {
    expect(parametersOf(tree(16))).toStrictEqual(tree(16))
    expect(parametersOf(tree(17))).toBeUndefined()
  })

  it('gives no answer for a tree of 5000 nested containers, without a stack overflow', () => {
    expect(() => parametersOf(nested(5000))).not.toThrow()
    expect(parametersOf(nested(5000))).toBeUndefined()
  })

  it('gives no answer for a tree that contains itself', () => {
    const cyclic: { kind: string; items: unknown[] } = { kind: 'array', items: [] }
    cyclic.items.push(cyclic)
    expect(parametersOf(cyclic)).toBeUndefined()
    const entries: unknown[] = []
    const cyclicObject = { kind: 'object', entries }
    entries.push({ key: 'self', value: cyclicObject })
    expect(parametersOf(cyclicObject)).toBeUndefined()
  })
})

describe('parseLawfulSet', () => {
  it('takes a list of the two answers of the set, built anew', () => {
    expect(parseLawfulSet({ ok: [ADOPTED, STAND_IN] })).toStrictEqual({ ok: [ADOPTED, STAND_IN] })
  })

  it('takes an empty list', () => {
    expect(parseLawfulSet({ ok: [] })).toStrictEqual({ ok: [] })
  })

  it('takes the failure unknown', () => {
    expect(parseLawfulSet({ failure: 'unknown' })).toStrictEqual({ failure: 'unknown' })
  })

  it.each<Case>([
    ['a failure outside the set', { failure: 'exploded' }],
    ['a failure that is no text', { failure: 1 }],
    ['neither ok nor failure', {}],
    ['an ok that is no list', { ok: 'everything' }],
    ['an ok that is an empty text', { ok: '' }],
    ['an ok that is undefined beside the failure unknown', { ok: undefined, failure: 'unknown' }],
    ['an item outside the two answers', { ok: [{ kind: 'none' }] }],
    ['an item that does not parse', { ok: [ADOPTED, withField(STAND_IN, ['reason'], '')] }],
    ['an ok on the prototype only', Object.create({ ok: [] })],
    ['a failure on the prototype only', Object.create({ failure: 'unknown' })],
    ...SHARED_NOT_AN_OBJECT.map(value => ['a value that is no plain object', value] as const),
  ])('gives no answer for %s', (_case, answer) => {
    expect(parseLawfulSet(answer)).toBeUndefined()
  })
})
