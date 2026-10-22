import { createHash } from 'node:crypto'
import type {
  Adoption,
  ModelCountingBasis,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  composeFamilies,
  defineFamily,
  recordAdoption,
  replayFormatsOf,
  type PiFamilyBinding,
  type PiModelRecordHead,
} from '../src/index.ts'
import { createTestDecoder } from './support/test-family.ts'

const OWNER = '@omne-harness/pi-ai-test'

type TestRecord = PiModelRecordHead &
  Readonly<{
    wire: Readonly<{ limit: number; tags: readonly string[]; image: null; flag: boolean }>
    replay?: Readonly<{ formats: Readonly<{ produces: string; accepts: readonly string[] }> }>
  }>

function record(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    name: 'model-a',
    revision: '1',
    route: { recipient: 'gateway', model: 'vendor/model-a' },
    status: 'current',
    wire: { limit: 0.5, tags: ['x'], image: null, flag: true },
    replay: { formats: { produces: 'fmt-a', accepts: ['fmt-a', 'fmt-old'] } },
    ...overrides,
  }
}

function supplierOf(
  adoption: Adoption,
  route = { recipient: 'gateway', model: 'vendor/model-a' },
): Supplier {
  return { adoption, ...route, credential: { kind: 'factory' } }
}

/** What a test family saw and how it answers. */
type Probe = {
  calls: { record: TestRecord; supplier: Supplier; signal: AbortSignal }[]
  released: number
  answer: (supplier: Supplier) => Supplier
  adoption: ((requested: Adoption) => Adoption) | undefined
  failure: TransportFailure | undefined
  gate: Promise<void> | undefined
}

function probe(): Probe {
  return {
    calls: [],
    released: 0,
    answer: supplier => supplier,
    adoption: undefined,
    failure: undefined,
    gate: undefined,
  }
}

function bindingFor(supplier: Supplier, adoption: Adoption, seen: Probe): PiFamilyBinding {
  const refused: TransportFailure = { kind: 'unsupported', field: 'test', adapter: adoption }
  const counting: ModelCountingBasis = {
    supplier: { adoption, recipient: supplier.recipient, model: supplier.model },
    meter: adoption,
    tokenization: { kind: 'not-used', method: adoption },
    prompt: { kind: 'provider-private', estimation: adoption },
    projection: adoption,
    mediaTransform: adoption,
    replay: adoption,
    evidence: adoption,
  }
  return {
    supplier,
    adoption,
    counting,
    rules: { plan: () => ({ failure: refused }) },
    meter: { basis: counting, measure: () => ({ failure: refused }) },
    tools: { convertToModelPayload: () => ({ failure: refused }) },
    encode: () => ({ failure: refused }),
    createDecoder: createTestDecoder,
    async release() {
      seen.released += 1
    },
  }
}

function family(records: readonly TestRecord[], seen: Probe, owner = OWNER) {
  return defineFamily({
    owner,
    records,
    async acquire(
      record: TestRecord,
      supplier: Supplier,
      signal: AbortSignal,
    ): Promise<Outcome<PiFamilyBinding, TransportFailure>> {
      seen.calls.push({ record, supplier, signal })
      if (seen.gate !== undefined) await seen.gate
      if (seen.failure !== undefined) return { failure: seen.failure }
      const adoption = seen.adoption?.(supplier.adoption) ?? supplier.adoption
      return { ok: bindingFor(seen.answer(supplier), adoption, seen) }
    },
  })
}

function canonicalSha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('recordAdoption', () => {
  it('derives the digest from the sorted-key canonical JSON of the whole record', () => {
    const adoption = recordAdoption(OWNER, record())
    const text =
      '{"name":"model-a","replay":{"formats":{"accepts":["fmt-a","fmt-old"],"produces":"fmt-a"}},' +
      '"revision":"1","route":{"model":"vendor/model-a","recipient":"gateway"},"status":"current",' +
      '"wire":{"flag":true,"image":null,"limit":0.5,"tags":["x"]}}'
    expect(adoption).toEqual({
      owner: OWNER,
      name: 'model-a',
      revision: '1',
      digest: canonicalSha(text),
    })
  })

  it('does not depend on the key order of the record object', () => {
    const reordered: TestRecord = {
      wire: { tags: ['x'], flag: true, image: null, limit: 0.5 },
      status: 'current',
      route: { model: 'vendor/model-a', recipient: 'gateway' },
      revision: '1',
      name: 'model-a',
      replay: { formats: { accepts: ['fmt-a', 'fmt-old'], produces: 'fmt-a' } },
    }
    expect(recordAdoption(OWNER, reordered)).toEqual(recordAdoption(OWNER, record()))
  })

  it('changes the digest when any wire value changes', () => {
    const drifted = record({ wire: { limit: 0.6, tags: ['x'], image: null, flag: true } })
    expect(recordAdoption(OWNER, drifted).digest).not.toBe(recordAdoption(OWNER, record()).digest)
  })

  it.each([
    ['a function', { fn: () => 1 }],
    ['undefined', { value: undefined }],
    ['a number that is not finite', { value: Number.NaN }],
    ['an infinite number', { value: Number.POSITIVE_INFINITY }],
    ['a bigint', { value: 1n }],
    ['a class instance', { value: new Date(0) }],
    ['an array hole', { value: [1, , 3] }],
  ])('refuses a record that holds %s with RangeError', (_name, extra) => {
    expect(() => recordAdoption(OWNER, { ...record(), ...extra })).toThrow(RangeError)
  })

  it('refuses a cycle with RangeError', () => {
    const cyclic: Record<string, unknown> = { ...record() }
    cyclic.self = cyclic
    expect(() =>
      defineFamily({
        owner: OWNER,
        records: [cyclicRecord(cyclic)],
        acquire: async () => ({ failure: { kind: 'denied', action: 'x' } }),
      }),
    ).toThrow(RangeError)
  })

  it('refuses an accessor without calling it', () => {
    let called = false
    const withGetter = { ...record() }
    Object.defineProperty(withGetter, 'wire', {
      enumerable: true,
      get() {
        called = true
        return {}
      },
    })
    expect(() => recordAdoption(OWNER, withGetter)).toThrow(RangeError)
    expect(called).toBe(false)
  })
})

/** A record head view of a cyclic object, made without a type assertion. */
function cyclicRecord(value: Record<string, unknown>): PiModelRecordHead {
  const head = record()
  return Object.assign(value, {
    name: head.name,
    revision: head.revision,
    route: head.route,
    status: head.status,
  })
}

describe('defineFamily', () => {
  const acquire = async (): Promise<Outcome<PiFamilyBinding, TransportFailure>> => ({
    failure: { kind: 'denied', action: 'test' },
  })

  it('refuses two records with the same name and revision', () => {
    const second = record({ route: { recipient: 'gateway', model: 'vendor/other' } })
    expect(() => defineFamily({ owner: OWNER, records: [record(), second], acquire })).toThrow(
      /repeats name and revision/,
    )
  })

  it('refuses two current records on the same route', () => {
    const second = record({ revision: '2' })
    expect(() => defineFamily({ owner: OWNER, records: [record(), second], acquire })).toThrow(
      /second current record/,
    )
  })

  it('accepts a frozen record on the route of a current record', () => {
    const frozen = record({ revision: '2', status: 'frozen' })
    expect(() => defineFamily({ owner: OWNER, records: [record(), frozen], acquire })).not.toThrow()
  })

  it.each([
    ['an empty owner', { owner: '', records: [record()], acquire }],
    ['an acquire that is not a function', { owner: OWNER, records: [record()], acquire: 1 }],
    ['an empty name', { owner: OWNER, records: [record({ name: '' })], acquire }],
    ['an unknown status', { owner: OWNER, records: [{ ...record(), status: 'retired' }], acquire }],
  ])('refuses %s with RangeError', (_name, spec) => {
    expect(() => Reflect.apply(defineFamily, undefined, [spec])).toThrow(RangeError)
  })

  it('keeps a frozen copy, so a later change of the caller object changes nothing', async () => {
    const seen = probe()
    const original = { ...record(), wire: { limit: 0.5, tags: ['x'], image: null, flag: true } }
    const adoption = recordAdoption(OWNER, original)
    const families = composeFamilies([family([original], seen)])
    original.wire.limit = 9
    const acquired = await families.acquire(supplierOf(adoption), new AbortController().signal)
    expect('ok' in acquired).toBe(true)
    expect(seen.calls[0]?.record.wire.limit).toBe(0.5)
    expect(Object.isFrozen(seen.calls[0]?.record.wire)).toBe(true)
  })
})

describe('composeFamilies', () => {
  it('refuses two families with the same owner', () => {
    const one = family([record()], probe())
    const two = family(
      [record({ name: 'model-b', route: { recipient: 'gateway', model: 'vendor/b' } })],
      probe(),
    )
    expect(() => composeFamilies([one, two])).toThrow(/owner .* repeats/)
  })

  it('refuses the same family twice, because its adoptions would repeat', () => {
    const one = family([record()], probe())
    expect(() => composeFamilies([one, one])).toThrow(RangeError)
  })

  it('refuses a value that defineFamily did not make', () => {
    const fake = Object.freeze({ owner: OWNER })
    expect(() => Reflect.apply(composeFamilies, undefined, [[fake]])).toThrow(/defineFamily/)
  })

  it('shows no runtime member besides acquire', () => {
    expect(Object.keys(composeFamilies([]))).toEqual(['acquire'])
  })
})

describe('acquire through the family table', () => {
  const signal = new AbortController().signal

  it('calls the family with the record whose four adoption fields match', async () => {
    const seen = probe()
    const first = record()
    const second = record({
      name: 'model-b',
      route: { recipient: 'gateway', model: 'vendor/model-b' },
    })
    const families = composeFamilies([family([first, second], seen)])
    const adoption = recordAdoption(OWNER, second)
    const acquired = await families.acquire(supplierOf(adoption, second.route), signal)
    expect('ok' in acquired && acquired.ok.adoption).toEqual(adoption)
    expect(seen.calls).toHaveLength(1)
    expect(seen.calls[0]?.record).toEqual(second)
    expect(seen.calls[0]?.signal).toBe(signal)
    expect(seen.released).toBe(0)
  })

  it('answers unavailable adoption-not-installed for an owner that no family declares', async () => {
    const seen = probe()
    const families = composeFamilies([family([record()], seen)])
    const adoption = { ...recordAdoption(OWNER, record()), owner: '@omne-harness/pi-ai-absent' }
    expect(await families.acquire(supplierOf(adoption), signal)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-absent',
        diagnostic: 'adoption-not-installed',
      },
    })
    expect(seen.calls).toHaveLength(0)
  })

  it('answers adoption-not-installed for a drifted digest and never takes another revision', async () => {
    const seen = probe()
    const families = composeFamilies([family([record()], seen)])
    const drifted = recordAdoption(
      OWNER,
      record({ wire: { limit: 1, tags: [], image: null, flag: false } }),
    )
    const otherRevision = { ...recordAdoption(OWNER, record()), revision: '2' }
    for (const adoption of [drifted, otherRevision])
      expect(await families.acquire(supplierOf(adoption), signal)).toEqual({
        failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'adoption-not-installed' },
      })
    expect(seen.calls).toHaveLength(0)
  })

  it.each([
    ['supplier.recipient', { recipient: 'elsewhere', model: 'vendor/model-a' }],
    ['supplier.model', { recipient: 'gateway', model: 'vendor/model-z' }],
  ])('answers invalid %s for a route that differs from the record', async (field, route) => {
    const seen = probe()
    const families = composeFamilies([family([record()], seen)])
    const acquired = await families.acquire(
      supplierOf(recordAdoption(OWNER, record()), route),
      signal,
    )
    expect(acquired).toEqual({ failure: { kind: 'invalid', field, reason: 'route-mismatch' } })
    expect(seen.calls).toHaveLength(0)
  })

  it('passes a failure of the family through unchanged', async () => {
    const seen = probe()
    seen.failure = { kind: 'unavailable', dependency: OWNER, diagnostic: 'tokenizer' }
    const families = composeFamilies([family([record()], seen)])
    expect(await families.acquire(supplierOf(recordAdoption(OWNER, record())), signal)).toEqual({
      failure: seen.failure,
    })
  })

  it('releases a binding for another supplier and answers binding-mismatch', async () => {
    const seen = probe()
    seen.answer = supplier => ({ ...supplier, model: 'vendor/other' })
    const families = composeFamilies([family([record()], seen)])
    expect(await families.acquire(supplierOf(recordAdoption(OWNER, record())), signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'binding-mismatch' },
    })
    expect(seen.released).toBe(1)
  })

  it('releases a binding for another adoption and answers binding-mismatch', async () => {
    const seen = probe()
    seen.adoption = requested => ({ ...requested, digest: 'f'.repeat(64) })
    const families = composeFamilies([family([record()], seen)])
    expect(await families.acquire(supplierOf(recordAdoption(OWNER, record())), signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'binding-mismatch' },
    })
    expect(seen.released).toBe(1)
  })

  it('does not call the family after a cancel', async () => {
    const seen = probe()
    const families = composeFamilies([family([record()], seen)])
    const controller = new AbortController()
    controller.abort()
    expect(
      await families.acquire(supplierOf(recordAdoption(OWNER, record())), controller.signal),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'cancelled' },
    })
    expect(seen.calls).toHaveLength(0)
  })

  it('releases a binding that arrives after a cancel', async () => {
    const seen = probe()
    let open: () => void = () => undefined
    seen.gate = new Promise(resolve => {
      open = resolve
    })
    const families = composeFamilies([family([record()], seen)])
    const controller = new AbortController()
    const acquiring = families.acquire(
      supplierOf(recordAdoption(OWNER, record())),
      controller.signal,
    )
    controller.abort()
    open()
    expect(await acquiring).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'cancelled' },
    })
    expect(seen.released).toBe(1)
  })
})

describe('replayFormatsOf', () => {
  it('reads the formats of the record that the adoption names', () => {
    const families = [family([record()], probe())]
    expect(replayFormatsOf(families, recordAdoption(OWNER, record()))).toEqual({
      produces: 'fmt-a',
      accepts: ['fmt-a', 'fmt-old'],
    })
  })

  it('answers null for an adoption that no family declares, or a record without formats', () => {
    const bare: TestRecord = {
      name: 'bare',
      revision: '1',
      route: { recipient: 'gateway', model: 'vendor/bare' },
      status: 'current',
      wire: { limit: 1, tags: [], image: null, flag: false },
    }
    const families = [family([record(), bare], probe())]
    expect(
      replayFormatsOf(families, { ...recordAdoption(OWNER, record()), revision: '9' }),
    ).toBeNull()
    expect(replayFormatsOf(families, recordAdoption(OWNER, bare))).toBeNull()
  })
})
