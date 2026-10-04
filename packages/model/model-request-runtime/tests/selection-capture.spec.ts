import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { ModelProfile } from '@omne-harness-lite/model-profile'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'
import {
  legalTargets,
  displayList,
  effectiveModel,
  type SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'

const name = 'capture/model'
const allowed = { known: [name] }
const projection = { known: [] }
const selected = { known: name }
const malformed = { invalidInput: { reason: 'malformed' } }
const ref = { origin: 'official', routeName: name } as const
const credentials = { known: [{ ref, present: { known: true } as const }] }

function profile(): ModelProfile {
  return {
    routeName: name,
    origin: 'official',
    registration: 'listed',
    adaptation: {
      implementation: { name: 'capture', revision: 'one' },
      definition: { modelId: name, revision: 'one' },
      configuration: { revision: 'one', values: {} },
    },
    providers: ['capture'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 100,
    maxOutputTokens: 10,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    updatedAt: '2026-09-27T00:00:00Z',
  }
}

const paths: readonly {
  readonly name: string
  readonly put: (profile: ModelProfile, number: JsonNumber) => ModelProfile
}[] = [
  { name: 'maxInputTokens', put: (p, n) => ({ ...p, maxInputTokens: n }) },
  { name: 'maxOutputTokens', put: (p, n) => ({ ...p, maxOutputTokens: n }) },
  {
    name: 'inputConstraints.maxImageBytes',
    put: (p, n) => ({ ...p, inputConstraints: { maxImageBytes: n } }),
  },
  ...(
    [
      'temperature',
      'topP',
      'seed',
      'maxOutputTokens',
      'frequencyPenalty',
      'presencePenalty',
    ] as const
  ).map(key => ({
    name: `parameters.${key}`,
    put: (p: ModelProfile, n: JsonNumber): ModelProfile => ({ ...p, parameters: { [key]: n } }),
  })),
  {
    name: 'parameters.extra.nested',
    put: (p, n) => ({ ...p, parameters: { extra: { nested: [{ n }] } } }),
  },
  {
    name: 'adaptation.configuration.values.nested',
    put: (p, n) => ({
      ...p,
      adaptation: {
        ...p.adaptation,
        configuration: { revision: 'one', values: { nested: [{ n }] } },
      },
    }),
  },
]

const functions = ['legal', 'display', 'effective'] as const
function invoke(kind: (typeof functions)[number], p: ModelProfile, decide: SelectionCompatibility) {
  const rows: readonly ProfileRow[] = [{ ref, profile: p }]
  if (kind === 'legal') return legalTargets({ known: rows }, allowed, projection, decide)
  if (kind === 'display')
    return displayList({ known: rows }, allowed, projection, decide, selected, credentials)
  return effectiveModel(selected, { known: null }, { known: rows }, allowed)
}

describe('selection: owned exact numeric capture before business decisions', () => {
  for (const kind of functions) {
    for (const path of paths) {
      it(`${kind} refuses foreign source at ${path.name} without executing it`, () => {
        let reads = 0
        let callbacks = 0
        class ForeignNumber extends LosslessNumber {
          override get source() {
            reads++
            return '9007199254740993123'
          }
        }
        const input = new ForeignNumber('1')
        const p = path.put(profile(), input)
        const result = invoke(kind, p, () => {
          callbacks++
          return { ok: true }
        })
        expect(reads).toBe(0)
        expect(callbacks).toBe(0)
        expect(result).toEqual(malformed)
        expect(Object.isFrozen(input)).toBe(true)
      })
    }
    it(`${kind} rejects a throwing foreign accessor without reading or leaking its cause`, () => {
      let reads = 0
      class ForeignNumber extends LosslessNumber {
        override get source(): string {
          reads++
          throw new Error('secret-foreign-number')
        }
      }
      const result = invoke(kind, { ...profile(), maxInputTokens: new ForeignNumber('1') }, () => ({
        ok: true,
      }))
      expect(reads).toBe(0)
      expect(result).toEqual(malformed)
      expect(JSON.stringify(result)).not.toContain('secret-foreign-number')
    })
    it(`${kind} rejects a foreign source data descriptor`, () => {
      class ForeignNumber extends LosslessNumber {}
      Object.defineProperty(ForeignNumber.prototype, 'source', { value: '9007199254740993123' })
      expect(
        invoke(kind, { ...profile(), maxInputTokens: new ForeignNumber('1') }, () => ({
          ok: true,
        })),
      ).toEqual(malformed)
    })
    it(`${kind} ignores prototype Proxy Get traps and reads the true branded source`, () => {
      let gets = 0
      let seen: ModelProfile | undefined
      class TrustedNumber extends LosslessNumber {}
      const descriptor = Object.getOwnPropertyDescriptor(LosslessNumber.prototype, 'source')
      if (descriptor === undefined) throw new Error('Missing standard getter')
      Object.setPrototypeOf(
        TrustedNumber.prototype,
        new Proxy(LosslessNumber.prototype, {
          get() {
            gets++
            return '9007199254740993123'
          },
          getOwnPropertyDescriptor(_target, key) {
            return key === 'source' ? descriptor : undefined
          },
        }),
      )
      const input = new TrustedNumber('9007199254740993')
      const result = invoke(kind, { ...profile(), maxInputTokens: input }, p => {
        seen = p
        return { ok: true }
      })
      expect(gets).toBe(0)
      expect('ok' in result).toBe(true)
      if (kind !== 'effective') {
        if (seen === undefined) throw new Error('Missing callback profile')
        expect(jsonNumberSource(seen.maxInputTokens)).toBe('9007199254740993')
        expect(seen.maxInputTokens).not.toBe(input)
        expect(Object.getPrototypeOf(seen.maxInputTokens)).toBe(LosslessNumber.prototype)
      }
    })
  }

  for (const kind of ['legal', 'display'] as const) {
    it(`${kind} preserves every numeric profile path and deep configuration spelling`, () => {
      class RegularNumber extends LosslessNumber {}
      const configuration = { nested: [{ amount: new RegularNumber('-1.2300e-4000'), plain: -0 }] }
      const p: ModelProfile = {
        ...profile(),
        maxInputTokens: new RegularNumber('1e4000'),
        maxOutputTokens: new LosslessNumber('9007199254740993123'),
        inputModalities: ['text', 'image'],
        inputConstraints: { maxImageBytes: new LosslessNumber('9007199254740993.00') },
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
        parameters: {
          temperature: new LosslessNumber('1.0000'),
          topP: new LosslessNumber('1e-1'),
          seed: new LosslessNumber('-9007199254740993123'),
          maxOutputTokens: new LosslessNumber('2.0'),
          frequencyPenalty: new LosslessNumber('-2e0'),
          presencePenalty: new LosslessNumber('0.00'),
          extra: { nested: [new LosslessNumber('1e-4000')], finite: Number.MAX_VALUE },
        },
        adaptation: {
          ...profile().adaptation,
          configuration: { revision: 'one', values: configuration },
        },
      }
      let seen: ModelProfile | undefined
      const result = invoke(kind, p, value => {
        seen = value
        return { ok: true }
      })
      expect('ok' in result).toBe(true)
      if (seen === undefined) throw new Error('Missing callback profile')
      expect(writeJsonLossless(seen)).toBe(writeJsonLossless(p))
      expect(jsonNumberSource(seen.maxInputTokens)).toBe('1e4000')
      expect(seen.maxInputTokens).not.toBe(p.maxInputTokens)
      expect(seen.maxOutputTokens).not.toBe(p.maxOutputTokens)
      expect(Object.isFrozen(seen)).toBe(true)
      expect(Object.isFrozen(seen.adaptation.configuration.values)).toBe(true)
      const captured = writeJsonLossless(seen)
      configuration.nested.push({ amount: new RegularNumber('5'), plain: 1 })
      Object.defineProperty(RegularNumber.prototype, 'source', { get: () => '9' })
      expect(writeJsonLossless(seen)).toBe(captured)
    })
  }

  it.each(functions)(
    '%s keeps finite plain numbers and regular supported subclasses valid',
    kind => {
      class RegularNumber extends LosslessNumber {}
      const p = { ...profile(), maxInputTokens: new RegularNumber('1'), maxOutputTokens: 10 }
      expect('ok' in invoke(kind, p, () => ({ ok: true }))).toBe(true)
    },
  )

  it.each(functions)('%s never calls a numeric prototype toJSON hook', kind => {
    let calls = 0
    class RegularNumber extends LosslessNumber {
      toJSON() {
        calls++
        throw new Error('private-toJSON-cause')
      }
    }
    expect(
      'ok' in
        invoke(kind, { ...profile(), maxInputTokens: new RegularNumber('1') }, () => ({
          ok: true,
        })),
    ).toBe(true)
    expect(calls).toBe(0)
  })

  it('captures array data descriptors without calling a caller Proxy Get trap', () => {
    let gets = 0
    const rows = new Proxy([{ ref, profile: profile() }], {
      get() {
        gets++
        throw new Error('private-array-get-cause')
      },
    })
    expect(legalTargets({ known: rows }, allowed, projection, () => ({ ok: true }))).toEqual({
      ok: [name],
    })
    expect(gets).toBe(0)
  })

  it('does not convert unexpected reflection faults to successful invalid or unknown results', () => {
    const rows = new Proxy([], {
      ownKeys() {
        throw new Error('private-reflection-cause')
      },
    })
    expect(() => legalTargets({ known: rows }, allowed, projection, () => ({ ok: true }))).toThrow(
      'model selection JSON capture failed',
    )
    try {
      legalTargets({ known: rows }, allowed, projection, () => ({ ok: true }))
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) throw new Error('Missing ordinary error')
      expect(error.message).not.toContain('private-reflection-cause')
      expect(error.cause).toBeUndefined()
    }
  })
})
