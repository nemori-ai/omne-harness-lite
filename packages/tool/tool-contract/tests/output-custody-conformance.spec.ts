// Self-proof of the ToolOutputCustody suite: it passes on the conforming double, each case
// fails under a violating variant that breaks the rule of that case, and a fixture without control
// handles reports the cases that need them as not applicable.
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  memoryToolOutputCustodyFixture,
  outputCustodyAnswers,
  toolOutputCustodyConformance,
  type ToolOutputCustodyFixture,
} from '@omne-harness/tool-contract/testing'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type RawOutput,
  type ToolOutputCustody,
} from '@omne-harness/tool-contract'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import { generated, oneTenant, outputKey, resultKey } from './output-custody-legal.ts'
import { answersAnotherFinalDuringProgress, regressesAfterFinal } from './resend-violators.ts'
import { adoption, evidence } from './tool-values.ts'

const NAMES = {
  C1: 'preserve returns a raw output of the given codec and size',
  C2: 'preserve holds the exact bytes before it answers',
  C3: 'a preserve resent by its operation returns the original raw output',
  C4: 'inspect recalls a retained output',
  C5: 'inspect retains nothing for an operation never preserved',
  C6: 'a failed preserve never answers durable',
  C7: 'a preserve whose answer was lost is recalled by its operation',
  C8: 'a retainResult resent by its operation returns the original evidence',
  C9: 'retainResult leaves the preserved original',
  C10: 'a preserve operation reused with other bytes is a conflict that changes nothing',
  C11: 'a retainResult operation reused for another result is a conflict that changes nothing',
  C12: 'another tenant learns nothing of an output by inspect',
  C13: 'another tenant does not receive the output of a tenant',
  C14: 'another tenant cannot retain a result over the output of a tenant',
} as const

type Fixture = ToolOutputCustodyFixture<string>
type Custody = ToolOutputCustody<string>
type Handles = Partial<Omit<Fixture, 'custody' | 'access' | 'codec'>>

/** A fixture whose custody is the double with `port` laid over it and `handles` replaced. */
function variant(
  build: (real: Custody, base: Fixture) => Readonly<{ port?: Partial<Custody>; handles?: Handles }>,
): () => Fixture {
  return () => {
    const base = memoryToolOutputCustodyFixture()
    const laid = build(base.custody, base)
    return { ...base, ...laid.handles, custody: { ...base.custody, ...laid.port } }
  }
}

const otherCodec = (raw: RawOutput): RawOutput => ({ ...raw, codec: adoption('another-codec') })

// Read when a case runs, not when the file is collected: the fixture mints its tenant then.
const own = {
  get tenant(): TenantId {
    return memoryToolOutputCustodyFixture().access.tenant
  },
}

/** The tenant of an input is not the tenant of the fixture. */
const isForeign = (tenant: typeof own.tenant): boolean =>
  JSON.stringify(tenant) !== JSON.stringify(own.tenant)

const variants: readonly Variant<Fixture>[] = [
  {
    // Preserve and inspect agree with each other, and both name a codec that was not asked for.
    name: 'the raw output names another codec',
    fails: [NAMES.C1],
    fixture: variant(real => ({
      port: {
        preserve: async input => {
          const answer = await real.preserve(input)
          return 'failure' in answer ? answer : succeed(otherCodec(answer.ok))
        },
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer || answer.ok.kind !== 'retained'
            ? answer
            : succeed({ kind: 'retained' as const, raw: otherCodec(answer.ok.raw) })
        },
      },
    })),
  },
  {
    name: 'the kept bytes are shorter than the preserved bytes',
    fails: [NAMES.C2],
    fixture: variant(() => ({
      handles: {
        readBytes: async () => new Uint8Array([1, 2, 3]),
      },
    })),
  },
  {
    name: 'a resent preserve answers fresh custody',
    fails: [NAMES.C3, NAMES.C13],
    fixture: variant(real => {
      let answers = 0
      return {
        port: {
          preserve: async input => {
            const answer = await real.preserve(input)
            if ('failure' in answer) return answer
            answers += 1
            return answers === 1
              ? answer
              : succeed({
                  ...answer.ok,
                  custody: { ...answer.ok.custody, digest: `sha256:fresh-${answers}` },
                })
          },
        },
      }
    }),
  },
  {
    name: 'inspect never recalls a retained output',
    fails: [NAMES.C4, NAMES.C7, NAMES.C9, NAMES.C12, NAMES.C10],
    fixture: variant(() => ({
      port: { inspect: () => Promise.resolve(succeed({ kind: 'unknown' as const })) },
    })),
  },
  {
    name: 'inspect fabricates a retained output for an unknown operation',
    fails: [NAMES.C5, NAMES.C6],
    fixture: variant(real => ({
      port: {
        inspect: async input => {
          const answer = await real.inspect(input)
          if ('failure' in answer || answer.ok.kind !== 'unknown') return answer
          const raw: RawOutput = {
            codec: adoption('output-codec'),
            content: {
              storage: 'fabricated',
              key: 'fabricated',
              mediaType: 'application/octet-stream',
              bytes: '0',
              digest: 'sha256:fabricated',
            },
            custody: evidence('fabricated'),
          }
          return succeed({ kind: 'retained' as const, raw })
        },
      },
    })),
  },
  {
    // A preserve that could not keep the bytes answers a raw output all the same.
    name: 'a failed preserve answers a raw output',
    fails: [NAMES.C6, NAMES.C7, NAMES.C10],
    fixture: variant(real => ({
      port: {
        preserve: async input => {
          const answer = await real.preserve(input)
          if ('ok' in answer) return answer
          return succeed<RawOutput>({
            codec: input.codec,
            content: {
              storage: 'claimed',
              key: 'claimed',
              mediaType: 'application/octet-stream',
              bytes: String(input.bytes.length),
              digest: 'sha256:claimed',
            },
            custody: evidence('claimed'),
          })
        },
      },
    })),
  },
  {
    // The bytes were kept, but the provider forgets them once the answer was lost.
    name: 'a lost answer is forgotten',
    fails: [NAMES.C7],
    fixture: variant(real => {
      let lost = false
      return {
        port: {
          preserve: async input => {
            const answer = await real.preserve(input)
            if ('failure' in answer && answer.failure.kind === 'commit-unknown') lost = true
            return answer
          },
          inspect: async input =>
            lost ? succeed({ kind: 'unknown' as const }) : real.inspect(input),
        },
      }
    }),
  },
  {
    name: 'a resent retainResult answers fresh evidence',
    fails: [NAMES.C8, NAMES.C14, NAMES.C11],
    fixture: variant(real => {
      let answers = 0
      return {
        port: {
          retainResult: async input => {
            const answer = await real.retainResult(input)
            if ('failure' in answer) return answer
            answers += 1
            return answers === 1
              ? answer
              : succeed({ ...answer.ok, digest: `sha256:fresh-${answers}` })
          },
        },
      }
    }),
  },
  {
    // Keeping the result lets the provider drop the original.
    name: 'retainResult drops the preserved original',
    fails: [NAMES.C9],
    fixture: variant(real => {
      let retained = false
      return {
        port: {
          retainResult: input => {
            retained = true
            return real.retainResult(input)
          },
          inspect: async input =>
            retained
              ? succeed({ kind: 'excluded' as const, evidence: evidence('dropped') })
              : real.inspect(input),
        },
      }
    }),
  },
  {
    name: 'inspect ignores the tenant',
    fails: [NAMES.C12],
    fixture: variant(real => ({
      port: { inspect: input => real.inspect({ ...input, tenant: own.tenant }) },
    })),
  },
  {
    // The answer for an output of another tenant is `denied`: it tells that the output exists.
    name: 'a foreign inspect is denied when the output exists',
    fails: [NAMES.C12],
    fixture: variant(real => ({
      port: {
        inspect: async input => {
          if (!isForeign(input.tenant) || input.operation === 'preserve-ghost')
            return real.inspect(input)
          const known = await real.inspect({ ...input, tenant: own.tenant })
          return 'ok' in known && known.ok.kind === 'retained'
            ? fail({ kind: 'denied', action: 'read' })
            : real.inspect(input)
        },
      },
    })),
  },
  {
    // The foreign read answers `unknown`, as for an output never preserved, and names the custody
    // of the output of the tenant in a field of its own.
    name: 'a foreign inspect answers unknown and names the custody of the tenant',
    fails: [NAMES.C12],
    fixture: variant(real => ({
      port: {
        inspect: async input => {
          if (!isForeign(input.tenant)) return real.inspect(input)
          const known = await real.inspect({ ...input, tenant: own.tenant })
          if (!('ok' in known) || known.ok.kind !== 'retained') return real.inspect(input)
          const told = { kind: 'unknown' as const, note: `kept as ${known.ok.raw.custody.record}` }
          return succeed(told)
        },
      },
    })),
  },
  {
    name: 'a foreign inspect makes the output of the tenant forgotten',
    fails: [NAMES.C12],
    fixture: variant(real => {
      let forgotten = false
      return {
        port: {
          inspect: input => {
            if (isForeign(input.tenant)) forgotten = true
            return forgotten && !isForeign(input.tenant)
              ? Promise.resolve(succeed({ kind: 'unknown' as const }))
              : real.inspect(input)
          },
        },
      }
    }),
  },
  {
    // The preserve of another tenant is the output of the first one.
    name: 'preserve ignores the tenant',
    fails: [NAMES.C13],
    fixture: variant(real => ({
      port: { preserve: input => real.preserve({ ...input, tenant: own.tenant }) },
    })),
  },
  {
    // The foreign preserve takes the place of the output of the tenant.
    name: 'a foreign preserve replaces the output of the tenant',
    fails: [NAMES.C13],
    fixture: variant(real => {
      let replaced = false
      return {
        port: {
          preserve: async input => {
            if (isForeign(input.tenant)) replaced = true
            const answer = await real.preserve(input)
            return replaced && !isForeign(input.tenant) && 'ok' in answer
              ? succeed({ ...answer.ok, custody: evidence('replaced') })
              : answer
          },
        },
      }
    }),
  },
  {
    name: 'a foreign retainResult is denied when the output exists',
    fails: [NAMES.C14],
    fixture: variant(real => ({
      port: {
        retainResult: async input => {
          if (!isForeign(input.tenant) || input.raw.custody.record === 'ghost-custody')
            return real.retainResult(input)
          return fail({ kind: 'denied', action: 'retain' })
        },
      },
    })),
  },
  {
    // The foreign retention uses up the retention of the tenant: its own comes out different.
    name: 'a foreign retainResult changes the retention of the tenant',
    fails: [NAMES.C14],
    fixture: variant(real => {
      let spent = false
      return {
        port: {
          retainResult: async input => {
            if (isForeign(input.tenant)) spent = true
            const answer = await real.retainResult(input)
            return spent && !isForeign(input.tenant) && 'ok' in answer
              ? succeed({ ...answer.ok, digest: 'sha256:spent' })
              : answer
          },
        },
      }
    }),
  },
  {
    // The key is blank for the caller; the bytes are still kept under the real key.
    name: 'the key of the content is blank',
    fails: [NAMES.C1],
    fixture: variant((real, base) => {
      const kept = new Map<string, RawOutput>()
      const blank = (raw: RawOutput): RawOutput => {
        const edited = { ...raw, content: { ...raw.content, key: '' } }
        kept.set(raw.custody.digest, raw)
        return edited
      }
      return {
        port: {
          preserve: async input => {
            const answer = await real.preserve(input)
            return 'failure' in answer ? answer : succeed(blank(answer.ok))
          },
          inspect: async input => {
            const answer = await real.inspect(input)
            return 'failure' in answer || answer.ok.kind !== 'retained'
              ? answer
              : succeed({ kind: 'retained' as const, raw: blank(answer.ok.raw) })
          },
        },
        handles: {
          readBytes: raw => base.readBytes!(kept.get(raw.custody.digest) ?? raw),
        },
      }
    }),
  },
  ...(
    [
      [
        'the bytes of the content are counted wrong',
        raw => ({ ...raw, content: { ...raw.content, bytes: '0' } }),
      ],
      [
        'the storage of the content is blank',
        raw => ({ ...raw, content: { ...raw.content, storage: '' } }),
      ],
      [
        'the digest of the content is blank',
        raw => ({ ...raw, content: { ...raw.content, digest: '' } }),
      ],
      [
        'the owner of the custody is blank',
        raw => ({ ...raw, custody: { ...raw.custody, owner: '' } }),
      ],
      [
        'the digest of the custody is blank',
        raw => ({ ...raw, custody: { ...raw.custody, digest: '' } }),
      ],
    ] as readonly (readonly [string, (raw: RawOutput) => RawOutput])[]
  ).map(([name, edit]): Variant<Fixture> => ({
    // Preserve and inspect agree with each other; only the content or custody is flawed.
    name,
    // A blank custody digest is also refused by the retain cases, which hand the raw output back.
    fails:
      name === 'the digest of the custody is blank'
        ? [NAMES.C1, NAMES.C8, NAMES.C9, NAMES.C11, NAMES.C14]
        : [NAMES.C1],
    fixture: variant(real => ({
      port: {
        preserve: async input => {
          const answer = await real.preserve(input)
          return 'failure' in answer ? answer : succeed(edit(answer.ok))
        },
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer || answer.ok.kind !== 'retained'
            ? answer
            : succeed({ kind: 'retained' as const, raw: edit(answer.ok.raw) })
        },
      },
    })),
  })),
  {
    // A preserve that comes alone is answered fresh custody; preserves that meet recall it.
    name: 'a preserve resent alone answers fresh custody',
    fails: [NAMES.C3, NAMES.C7, NAMES.C13],
    fixture: variant(real => {
      let inflight = 0
      let calls = 0
      return {
        port: {
          preserve: async input => {
            calls += 1
            const turn = calls
            inflight += 1
            let met = inflight > 1
            await Promise.resolve()
            met ||= inflight > 1
            const answer = await real.preserve(input)
            inflight -= 1
            return turn === 1 || met || 'failure' in answer
              ? answer
              : succeed({
                  ...answer.ok,
                  custody: { ...answer.ok.custody, digest: `sha256:alone-${turn}` },
                })
          },
        },
      }
    }),
  },
  {
    // Preserves that meet in flight are answered fresh custody; a preserve resent alone recalls it.
    name: 'preserves that meet in flight answer fresh custody',
    fails: [NAMES.C3],
    fixture: variant(real => {
      let inflight = 0
      let turn = 0
      return {
        port: {
          preserve: async input => {
            inflight += 1
            let met = inflight > 1
            await Promise.resolve()
            met ||= inflight > 1
            const answer = await real.preserve(input)
            inflight -= 1
            turn += 1
            return !met || 'failure' in answer
              ? answer
              : succeed({
                  ...answer.ok,
                  custody: { ...answer.ok.custody, digest: `sha256:crowd-${turn}` },
                })
          },
        },
      }
    }),
  },
  {
    name: 'inspect answers another raw output',
    fails: [NAMES.C4, NAMES.C7, NAMES.C9, NAMES.C12, NAMES.C10],
    fixture: variant(real => ({
      port: {
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer || answer.ok.kind !== 'retained'
            ? answer
            : succeed({
                kind: 'retained' as const,
                raw: {
                  ...answer.ok.raw,
                  custody: { ...answer.ok.raw.custody, digest: 'sha256:other' },
                },
              })
        },
      },
    })),
  },
  {
    // The answer of a preserve that was lost is recalled as fresh custody on the resend.
    name: 'a preserve resent after a lost answer answers fresh custody',
    fails: [NAMES.C7],
    fixture: variant(real => {
      let lost = false
      return {
        port: {
          preserve: async input => {
            const answer = await real.preserve(input)
            if ('failure' in answer) {
              if (answer.failure.kind === 'commit-unknown') lost = true
              return answer
            }
            return lost
              ? succeed({
                  ...answer.ok,
                  custody: { ...answer.ok.custody, digest: 'sha256:after-lost' },
                })
              : answer
          },
        },
      }
    }),
  },
  {
    // A retained result takes the place of the preserved original.
    name: 'retainResult replaces the preserved original',
    fails: [NAMES.C9],
    fixture: variant(real => {
      let retained = false
      return {
        port: {
          retainResult: input => {
            retained = true
            return real.retainResult(input)
          },
          inspect: async input => {
            const answer = await real.inspect(input)
            return !retained || 'failure' in answer || answer.ok.kind !== 'retained'
              ? answer
              : succeed({
                  kind: 'retained' as const,
                  raw: {
                    ...answer.ok.raw,
                    custody: { ...answer.ok.raw.custody, digest: 'sha256:projection' },
                  },
                })
          },
        },
      }
    }),
  },
  {
    // A foreign inspect overwrites the record of the tenant with another raw output.
    name: 'a foreign inspect changes the raw output of the tenant',
    fails: [NAMES.C12],
    fixture: variant(real => {
      let touched = false
      return {
        port: {
          inspect: async input => {
            if (isForeign(input.tenant)) touched = true
            const answer = await real.inspect(input)
            return !touched ||
              isForeign(input.tenant) ||
              'failure' in answer ||
              answer.ok.kind !== 'retained'
              ? answer
              : succeed({
                  kind: 'retained' as const,
                  raw: {
                    ...answer.ok.raw,
                    custody: { ...answer.ok.raw.custody, digest: 'sha256:touched' },
                  },
                })
          },
        },
      }
    }),
  },
  {
    // The handle keeps the bytes, but the provider answers the raw output: the answer is not lost.
    name: 'a preserve whose answer was to be lost answers the raw output',
    fails: [NAMES.C7],
    fixture: variant(real => ({
      port: {
        preserve: async input => {
          const answer = await real.preserve(input)
          return 'failure' in answer && answer.failure.kind === 'commit-unknown'
            ? real.preserve(input)
            : answer
        },
      },
    })),
  },
  {
    // The conflict is named invalid: the reuse of the identity is refused, but not as a conflict.
    name: 'a retainResult operation reused for another result is refused as invalid',
    fails: [NAMES.C11],
    fixture: variant(real => ({
      port: {
        retainResult: async input => {
          const answer = await real.retainResult(input)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
            : answer
        },
      },
    })),
  },
]

// ---------------------------------------------------------------------------------------------
// Providers that the contract allows are built in output-custody-legal.ts, at the port boundary.
// ---------------------------------------------------------------------------------------------

/** The cases that read an operation after a lost reply of a preserve or a retainResult. */
const AFTER_LOST_REPLY = [
  NAMES.C1,
  NAMES.C2,
  NAMES.C3,
  NAMES.C4,
  NAMES.C8,
  NAMES.C9,
  NAMES.C10,
  NAMES.C11,
  NAMES.C12,
  NAMES.C13,
  NAMES.C14,
]
/** The cases that read an inspect that is first `unknown`. */
const AFTER_UNKNOWN_INSPECT = [NAMES.C4, NAMES.C7, NAMES.C9, NAMES.C10, NAMES.C12]
const needs = (handle: string, names: readonly string[]): Record<string, string> =>
  Object.fromEntries(names.map(name => [name, handle]))

/**
 * The resend rule: a method that goes back to a lost reply after it answered for good, and one
 * that answers a final during the lost reply which is not the one that lands. The second kind is
 * the generated provider with the resend during progress replaced.
 */
const resendRule: readonly Variant<Fixture>[] = [
  {
    name: 'a resent preserve goes back from the raw output to a lost reply',
    fails: [NAMES.C3, NAMES.C13],
    fixture: variant(real => ({
      port: {
        preserve: regressesAfterFinal(
          {
            row: outputCustodyAnswers.preserve,
            key: outputKey,
            progress: input => fail({ kind: 'commit-unknown', operation: input.operation }),
          },
          input => real.preserve(input),
        ),
      },
    })),
  },
  {
    name: 'a resent retainResult goes back from the evidence to a lost reply',
    fails: [NAMES.C8, NAMES.C11, NAMES.C14],
    fixture: variant(real => ({
      port: {
        retainResult: regressesAfterFinal(
          {
            row: outputCustodyAnswers.retainResult,
            key: resultKey,
            progress: input => fail({ kind: 'commit-unknown', operation: input.operation }),
          },
          input => real.retainResult(input),
        ),
      },
    })),
  },
  {
    name: 'a resend of a preserve during its lost reply answers another raw output than the one that lands',
    fails: AFTER_LOST_REPLY,
    fixture: () => {
      const lost = generated('commit-unknown')()
      return {
        ...lost,
        custody: {
          ...lost.custody,
          preserve: answersAnotherFinalDuringProgress(
            {
              row: outputCustodyAnswers.preserve,
              key: outputKey,
              other: input =>
                succeed({
                  codec: input.codec,
                  content: {
                    storage: 'memory-custody',
                    key: 'early',
                    mediaType: 'application/octet-stream',
                    bytes: String(input.bytes.length),
                    digest: 'sha256:early',
                  },
                  custody: evidence('custody/early'),
                }),
            },
            input => lost.custody.preserve(input),
          ),
        },
      }
    },
  },
  {
    name: 'a resend of a retainResult during its lost reply answers another evidence than the one that lands',
    fails: [NAMES.C8, NAMES.C9, NAMES.C11, NAMES.C14],
    fixture: () => {
      const lost = generated('commit-unknown')()
      return {
        ...lost,
        custody: {
          ...lost.custody,
          retainResult: answersAnotherFinalDuringProgress(
            {
              row: outputCustodyAnswers.retainResult,
              key: resultKey,
              other: () => succeed(evidence('result/early')),
            },
            input => lost.custody.retainResult(input),
          ),
        },
      }
    },
  },
]

const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(outputCustodyAnswers).map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} until settle`,
    fixture: generated(kind),
  })),
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.C12]: 'otherAccess',
      [NAMES.C13]: 'otherAccess',
      [NAMES.C14]: 'otherAccess',
    },
  },
]

/** Legal, but with no `settle` for the lost reply or the `unknown` that it answers: not applicable, never passed. */
const legalWithoutSettle: readonly LegalProvider<Fixture>[] = maskKinds(outputCustodyAnswers).map(
  (kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} and the fixture offers no settle`,
    fixture: generated(kind, { settle: false }),
    notApplicable: needs('settle', kind === 'unknown' ? AFTER_UNKNOWN_INSPECT : AFTER_LOST_REPLY),
  }),
)

/** A fixture whose `settle` resolves before the provider has landed the work. */
const lateSettle: readonly Variant<Fixture>[] = [
  {
    name: 'settle resolves 3 turns before the lost reply lands (generated)',
    fails: AFTER_LOST_REPLY,
    fixture: generated('commit-unknown', { lagTurns: 3 }),
  },
  {
    name: 'settle resolves 3 turns before an inspect tells (generated)',
    fails: AFTER_UNKNOWN_INSPECT,
    fixture: generated('unknown', { lagTurns: 3 }),
  },
]

/** The methods of the port that take an access, and the case that checks another tenant on each. */
const CROSS_TENANT: Readonly<Record<keyof ToolOutputCustody<string>, string>> = {
  preserve: NAMES.C13,
  inspect: NAMES.C12,
  retainResult: NAMES.C14,
}

describe('ToolOutputCustody conformance suite', () => {
  const cases = toolOutputCustodyConformance<string>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolOutputCustodyFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { custody, access } = memoryToolOutputCustodyFixture()
      return { custody, access }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({
      [NAMES.C2]: 'readBytes',
      [NAMES.C6]: 'failNext',
      [NAMES.C7]: 'dropNextAnswer',
      [NAMES.C12]: 'otherAccess',
      [NAMES.C13]: 'otherAccess',
      [NAMES.C14]: 'otherAccess',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, [...variants, ...resendRule, ...lateSettle])
  })

  itFailsExactly(cases, variants)

  itFailsExactly(cases, resendRule)

  itFailsExactly(cases, lateSettle)

  itPassesLegal(cases, legal)

  itPassesLegal(cases, legalWithoutSettle)

  for (const kind of maskKinds(outputCustodyAnswers))
    itNeedsTheHandle(cases, {
      name: `generated: every first answer is ${kind}`,
      handleName: 'settle',
      withHandle: generated(kind),
      without: generated(kind, { settle: false }),
      spy: (fixture, used) => ({
        ...fixture,
        settle: async () => {
          used()
          await fixture.settle?.()
        },
      }),
    })

  it('has a cross-tenant case for every method that takes an access', () => {
    for (const [method, name] of Object.entries(CROSS_TENANT))
      expect(
        cases.find(item => item.name === name),
        `${method} has no cross-tenant case`,
      ).toBeDefined()
    expect(new Set(Object.values(CROSS_TENANT)).size).toBe(Object.keys(CROSS_TENANT).length)
  })

  it('masks every method of the table that has progress or a lost reply', () => {
    expect(maskedMethods(outputCustodyAnswers).sort()).toEqual([
      'inspect',
      'preserve',
      'retainResult',
    ])
  })

  it('names the tenant of the second access: the cross-tenant cases fail on one tenant twice', async () => {
    const same = (): Fixture => {
      const base = memoryToolOutputCustodyFixture()
      return { ...base, otherAccess: base.access }
    }
    const cross = [NAMES.C12, NAMES.C13, NAMES.C14]
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual([...cross].sort())
    for (const name of cross)
      await expect(cases.find(item => item.name === name)!.run(same())).rejects.toThrow(
        /names one tenant twice/u,
      )
  })

  it('keeps no alias of the preserved bytes', async () => {
    // The double copies the bytes in and out, so a caller cannot change what the custody holds.
    const { custody, access, readBytes } = memoryToolOutputCustodyFixture()
    const call = decodeToolCallId('call-1')
    const operation = decodeToolOperationId('op-1')
    if ('failure' in call || 'failure' in operation) throw new Error('illegal identity')
    const bytes = new Uint8Array([1, 2, 3])
    const raw = await custody.preserve({
      ...access,
      call: call.ok,
      operation: operation.ok,
      codec: adoption('c'),
      bytes,
      source: evidence('s'),
    })
    if ('failure' in raw) throw new Error(JSON.stringify(raw.failure))
    bytes[0] = 9
    expect(Array.from((await readBytes?.(raw.ok)) ?? [])).toEqual([1, 2, 3])
  })
})
