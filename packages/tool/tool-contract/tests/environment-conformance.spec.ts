// Self-proof of the ToolEnvironment suite: it passes on the conforming double, each case fails
// under a violating variant that breaks the rule of that case, and a fixture without control
// handles reports the cases that need them as not applicable.
import type { TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createMemoryToolEnvironment,
  environmentAnswers,
  memoryToolEnvironmentFixture,
  toolEnvironmentConformance,
  type MemoryEnvironment,
  type ToolEnvironmentFixture,
} from '@omne-harness/tool-contract/testing'
import {
  decodeToolOperationId,
  type DurableEvidence,
  type ToolCallId,
} from '@omne-harness/tool-contract'
import {
  type PreparationProgress,
  type PreparationRecord,
  type ReleaseProgress,
  type ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  resolvesEarly,
  turns,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import {
  asynchronousRelease,
  deferredPreparation,
  freshReconnect,
  generated,
  oneTenant,
  pendingFirstIncludingRejection,
  pendingFirstWithFreshReconnect,
  refusesUnseenReads,
  releaseKey,
  without,
} from './environment-legal.ts'
import { answersAnotherFinalDuringProgress, regressesAfterFinal } from './resend-violators.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  E1: 'a preparation resent by its operation returns the original resource',
  E2: 'a resent preparation allocates nothing new',
  E3: 'a preparation resent while it is pending allocates nothing new',
  E4: 'inspectPreparation recalls the original allocation',
  E5: 'inspectPreparation claims nothing for an operation never prepared',
  E6: 'the resource of one call is not answered to another call',
  E7: 'a pending preparation keeps its allocation until it lands',
  E8: 'an excluded preparation excludes the deferred allocation',
  E9: 'an excluded preparation allocates nothing when the deferred work lands',
  E10: 'a rejected preparation keeps its failure and does not degrade',
  E11: 'a release resent by its operation returns the original evidence',
  E12: 'inspectRelease recalls the release',
  E13: 'inspectRelease of a release never submitted is not released',
  E14: 'a preparation operation reused with another input is a conflict that changes nothing',
  E15: 'a release operation reused with another input is a conflict that changes nothing',
  E16: 'another tenant learns nothing of a preparation by inspectPreparation',
  E17: 'another tenant does not receive the resource of a tenant',
  E18: 'another tenant cannot release the resource of a tenant',
  E19: 'another tenant learns nothing of a release by inspectRelease',
} as const

type Fixture = ToolEnvironmentFixture<string, MemoryEnvironment>
type Environment = ToolEnvironment<string, MemoryEnvironment>
type Prepared = Extract<PreparationProgress<MemoryEnvironment>, { kind: 'prepared' }>

type Handles = Partial<Omit<Fixture, 'environment' | 'access' | 'request'>>

/** A fixture whose port is the double with `port` laid over it and whose handles are `handles`. */
function variant(
  build: (
    real: Environment,
    base: Fixture,
  ) => Readonly<{ port?: Partial<Environment>; handles?: Handles }>,
): () => Fixture {
  return () => {
    const base = memoryToolEnvironmentFixture()
    const laid = build(base.environment, base)
    return { ...base, ...laid.handles, environment: { ...base.environment, ...laid.port } }
  }
}

const altered = (progress: Prepared): Prepared => ({
  kind: 'prepared',
  environment: {
    ...progress.environment,
    evidence: { ...progress.environment.evidence, digest: 'sha256:altered' },
  },
})

const withOperation = <T extends { preparation: PreparationRecord }>(
  input: T,
  operation: string,
): T => ({
  ...input,
  preparation: { ...input.preparation, operation: decoded(decodeToolOperationId(operation)) },
})

function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('failure' in outcome) throw new Error('the variant minted an illegal identity')
  return outcome.ok
}

// Read when a case runs, not when the file is collected: the fixture mints its tenant then.
const own = {
  get tenant(): TenantId {
    return memoryToolEnvironmentFixture().access.tenant
  },
}

/** The tenant of an input is not the tenant of the fixture. */
const isForeign = (tenant: typeof own.tenant): boolean =>
  JSON.stringify(tenant) !== JSON.stringify(own.tenant)

const variants: readonly Variant<Fixture>[] = [
  {
    // The second prepared answer of one operation is another resource.
    name: 'a resent preparation answers another resource',
    fails: [NAMES.E1, NAMES.E17],
    fixture: variant(real => {
      let answers = 0
      return {
        port: {
          prepare: async input => {
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'prepared') return answer
            answers += 1
            return answers === 1 ? answer : succeed(altered(answer.ok))
          },
        },
      }
    }),
  },
  {
    // The resend allocates a second resource and hides it behind the first answer.
    name: 'a resent preparation allocates again',
    fails: [NAMES.E2, NAMES.E3, NAMES.E14],
    fixture: variant(real => {
      let calls = 0
      return {
        port: {
          prepare: async input => {
            calls += 1
            const answer = await real.prepare(input)
            if (calls > 1) await real.prepare(withOperation(input, 'prepare-again'))
            return answer
          },
        },
      }
    }),
  },
  {
    name: 'inspectPreparation answers other evidence',
    fails: [NAMES.E4, NAMES.E7, NAMES.E14, NAMES.E16],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          return 'failure' in answer || answer.ok.kind !== 'prepared'
            ? answer
            : succeed(altered(answer.ok))
        },
      },
    })),
  },
  {
    name: 'inspectPreparation fabricates prepared for what is not prepared',
    fails: [NAMES.E5, NAMES.E7, NAMES.E8, NAMES.E9, NAMES.E10],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          if ('failure' in answer || answer.ok.kind === 'prepared') return answer
          return succeed<PreparationProgress<MemoryEnvironment>>({
            kind: 'prepared',
            environment: {
              value: { resource: 'fabricated' },
              evidence: evidence('fabricated'),
              preparation: input.preparation,
            },
          })
        },
      },
    })),
  },
  {
    // The provider keys its allocations by operation alone, so a second call joins the first.
    name: 'the allocation is keyed by the operation alone',
    fails: [NAMES.E6],
    fixture: variant(real => {
      const firstCall = new Map<string, ToolCallId>()
      const joined = <T extends { call: ToolCallId; preparation: PreparationRecord }>(
        input: T,
      ): T => {
        const call = firstCall.get(input.preparation.operation) ?? input.call
        firstCall.set(input.preparation.operation, call)
        return { ...input, call, preparation: { ...input.preparation, call } }
      }
      return {
        port: {
          prepare: input => real.prepare(joined(input)),
          inspectPreparation: input => real.inspectPreparation(joined(input)),
        },
      }
    }),
  },
  {
    // After the deferred allocation landed, the provider still says pending.
    name: 'a landed allocation is still reported pending',
    fails: [NAMES.E7],
    fixture: variant((real, base) => {
      let held = false
      return {
        handles: {
          hold: () => {
            held = true
            base.hold?.()
          },
        },
        port: {
          inspectPreparation: async input => {
            const answer = await real.inspectPreparation(input)
            if (!held || 'failure' in answer || answer.ok.kind !== 'prepared') return answer
            return succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'pending',
              diagnostic: 'still deferred',
            })
          },
        },
      }
    }),
  },
  {
    // The exclusion handle does nothing, so the deferred allocation lands anyway.
    name: 'the exclusion does not hold back the deferred allocation',
    fails: [NAMES.E8, NAMES.E9],
    fixture: variant(() => ({ handles: { excludeDeferred: () => Promise.resolve() } })),
  },
  {
    // The allocation is marked excluded, but it lands anyway when the allocation window closes.
    name: 'an excluded allocation lands after all',
    fails: [NAMES.E8, NAMES.E9],
    fixture: variant((real, base) => {
      let settled = false
      return {
        handles: {
          settle: async () => {
            await base.settle?.()
            settled = true
          },
        },
        port: {
          inspectPreparation: async input => {
            const answer = await real.inspectPreparation(input)
            if (!settled || 'failure' in answer || answer.ok.kind !== 'excluded') return answer
            return succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'prepared',
              environment: {
                value: { resource: 'late' },
                evidence: evidence('late'),
                preparation: input.preparation,
              },
            })
          },
        },
      }
    }),
  },
  {
    // A rejected operation that is asked again is prepared on another host.
    name: 'a rejected preparation degrades on the second ask',
    fails: [NAMES.E10],
    fixture: variant(real => {
      const rejected = new Set<string>()
      return {
        port: {
          prepare: async input => {
            const operation = input.preparation.operation
            if (rejected.has(operation))
              return real.prepare(withOperation(input, `${operation}-fallback`))
            const answer = await real.prepare(input)
            if ('ok' in answer && answer.ok.kind === 'rejected') rejected.add(operation)
            return answer
          },
        },
      }
    }),
  },
  {
    name: 'a resent release answers other evidence',
    fails: [NAMES.E11],
    fixture: variant(real => {
      let calls = 0
      return {
        port: {
          release: async input => {
            calls += 1
            const answer = await real.release(input)
            if (calls === 1 || 'failure' in answer || answer.ok.kind !== 'released') return answer
            return succeed<ReleaseProgress>({
              kind: 'released',
              evidence: evidence(`other-${calls}`),
            })
          },
        },
      }
    }),
  },
  {
    name: 'inspectRelease answers other evidence',
    fails: [NAMES.E12, NAMES.E15, NAMES.E19],
    fixture: variant(real => ({
      port: {
        inspectRelease: async input => {
          const answer = await real.inspectRelease(input)
          if ('failure' in answer || answer.ok.kind !== 'released') return answer
          return succeed<ReleaseProgress>({ kind: 'released', evidence: evidence('other') })
        },
      },
    })),
  },
  {
    name: 'inspectRelease fabricates a release',
    fails: [NAMES.E13, NAMES.E18],
    fixture: variant(real => ({
      port: {
        inspectRelease: async input => {
          const answer = await real.inspectRelease(input)
          if ('failure' in answer || answer.ok.kind === 'released') return answer
          return succeed<ReleaseProgress>({ kind: 'released', evidence: evidence('fabricated') })
        },
      },
    })),
  },
  {
    // A resend while the preparation is pending allocates a second resource, and answers it.
    name: 'a resend of a pending preparation allocates again and answers the new resource',
    fails: [NAMES.E3],
    fixture: variant(real => {
      const pending = new Set<string>()
      let turn = 0
      return {
        port: {
          prepare: async input => {
            const key = `${input.call}/${input.preparation.operation}`
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'pending') return answer
            if (!pending.has(key)) {
              pending.add(key)
              return answer
            }
            turn += 1
            return real.prepare(withOperation(input, `${input.preparation.operation}-dup${turn}`))
          },
        },
      }
    }),
  },
  {
    // A resend while the preparation is pending is answered pending, and allocates a second resource.
    name: 'a resend of a pending preparation allocates again',
    fails: [NAMES.E3],
    fixture: variant(real => {
      const pending = new Set<string>()
      let turn = 0
      return {
        port: {
          prepare: async input => {
            const key = `${input.call}/${input.preparation.operation}`
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'pending') return answer
            if (!pending.has(key)) {
              pending.add(key)
              return answer
            }
            turn += 1
            await real.prepare(withOperation(input, `${input.preparation.operation}-dup${turn}`))
            return answer
          },
        },
      }
    }),
  },
  {
    // A resend while the preparation is pending lands it, and answers prepared.
    name: 'a resend of a pending preparation is answered prepared',
    fails: [NAMES.E3],
    fixture: variant((real, base) => {
      const pending = new Set<string>()
      return {
        port: {
          prepare: async input => {
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'pending') return answer
            const key = `${input.call}/${input.preparation.operation}`
            if (!pending.has(key)) {
              pending.add(key)
              return answer
            }
            await base.settle?.()
            return real.prepare(input)
          },
        },
      }
    }),
  },
  {
    // The excluded preparation allocates its resource when the deferred allocations land.
    name: 'an excluded preparation allocates anyway',
    fails: [NAMES.E9],
    fixture: variant((real, base) => {
      const leaked: PreparationRecord[] = []
      return {
        handles: {
          excludeDeferred: async preparation => {
            leaked.push(preparation)
            await base.excludeDeferred?.(preparation)
          },
          settle: async () => {
            await base.settle?.()
            for (const preparation of leaked.splice(0))
              await real.prepare({
                ...base.access,
                call: preparation.call,
                preparation: {
                  ...preparation,
                  operation: decoded(decodeToolOperationId(`${preparation.operation}-leak`)),
                },
              })
          },
        },
      }
    }),
  },
  {
    // Only prepare keys the allocation by the operation alone; inspect is right.
    name: 'prepare hands the resource of one call to another call',
    fails: [NAMES.E6],
    fixture: variant(real => {
      const byOperation = new Map<string, Prepared>()
      return {
        port: {
          prepare: async input => {
            const key = input.preparation.operation
            const known = byOperation.get(key)
            if (known !== undefined && known.environment.preparation.call !== input.call)
              return succeed(known)
            const answer = await real.prepare(input)
            if ('ok' in answer && answer.ok.kind === 'prepared' && !byOperation.has(key))
              byOperation.set(key, answer.ok)
            return answer
          },
        },
      }
    }),
  },
  {
    // The exclusion is answered once; the next ask finds the preparation after all.
    name: 'an excluded preparation is prepared on the next ask',
    fails: [NAMES.E8],
    fixture: variant(real => {
      const excluded = new Map<string, number>()
      return {
        port: {
          inspectPreparation: async input => {
            const answer = await real.inspectPreparation(input)
            if ('failure' in answer || answer.ok.kind !== 'excluded') return answer
            const key = `${input.call}/${input.preparation.operation}`
            const turn = (excluded.get(key) ?? 0) + 1
            excluded.set(key, turn)
            return turn === 1
              ? answer
              : succeed<PreparationProgress<MemoryEnvironment>>({
                  kind: 'prepared',
                  environment: {
                    value: { resource: 'late' },
                    evidence: evidence('late'),
                    preparation: input.preparation,
                  },
                })
          },
        },
      }
    }),
  },
  {
    name: 'inspectPreparation ignores the tenant',
    fails: [NAMES.E16],
    fixture: variant(real => ({
      port: {
        inspectPreparation: input =>
          real.inspectPreparation({
            ...input,
            tenant: own.tenant,
            preparation: { ...input.preparation, tenant: own.tenant },
          }),
      },
    })),
  },
  {
    name: 'a foreign inspectPreparation is denied when the preparation exists',
    fails: [NAMES.E16],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          if (!isForeign(input.tenant) || input.preparation.operation === 'prepare-ghost')
            return real.inspectPreparation(input)
          const known = await real.inspectPreparation({
            ...input,
            tenant: own.tenant,
            preparation: { ...input.preparation, tenant: own.tenant },
          })
          return 'ok' in known && known.ok.kind === 'prepared'
            ? fail({ kind: 'denied', action: 'read' })
            : real.inspectPreparation(input)
        },
      },
    })),
  },
  {
    name: 'a foreign inspectPreparation answers pending when the preparation exists',
    fails: [NAMES.E16],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          if (!isForeign(input.tenant) || 'failure' in answer) return answer
          const known = await real.inspectPreparation({
            ...input,
            tenant: own.tenant,
            preparation: { ...input.preparation, tenant: own.tenant },
          })
          return 'ok' in known && known.ok.kind === 'prepared'
            ? succeed<PreparationProgress<MemoryEnvironment>>({
                kind: 'pending',
                diagnostic: 'the allocation is deferred',
              })
            : answer
        },
      },
    })),
  },
  {
    name: 'a foreign inspectPreparation makes the preparation of the tenant forgotten',
    fails: [NAMES.E16],
    fixture: variant(real => {
      let forgotten = false
      return {
        port: {
          inspectPreparation: input => {
            if (isForeign(input.tenant)) forgotten = true
            return forgotten && !isForeign(input.tenant)
              ? Promise.resolve(
                  succeed<PreparationProgress<MemoryEnvironment>>({
                    kind: 'unknown',
                    diagnostic: 'forgotten',
                  }),
                )
              : real.inspectPreparation(input)
          },
        },
      }
    }),
  },
  {
    // Resends that come one after the other recall the resource; a resend alone is not recalled.
    name: 'a resend that comes alone answers another resource',
    fails: [NAMES.E1, NAMES.E7, NAMES.E17],
    fixture: variant(real => {
      let inflight = 0
      let calls = 0
      return {
        port: {
          prepare: async input => {
            calls += 1
            const turn = calls
            inflight += 1
            let met = inflight > 1
            await Promise.resolve()
            met ||= inflight > 1
            const answer = await real.prepare(input)
            inflight -= 1
            if (turn === 1 || met || 'failure' in answer || answer.ok.kind !== 'prepared')
              return answer
            return succeed(altered(answer.ok))
          },
        },
      }
    }),
  },
  {
    // Resends that meet in flight are answered other resources; resends one after the other recall it.
    name: 'resends that meet in flight answer other resources',
    fails: [NAMES.E1],
    fixture: variant(real => {
      let inflight = 0
      return {
        port: {
          prepare: async input => {
            inflight += 1
            let met = inflight > 1
            await Promise.resolve()
            met ||= inflight > 1
            const answer = await real.prepare(input)
            inflight -= 1
            if (!met || 'failure' in answer || answer.ok.kind !== 'prepared') return answer
            return succeed(altered(answer.ok))
          },
        },
      }
    }),
  },
  {
    name: 'inspectPreparation answers the record of another operation',
    fails: [NAMES.E4],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          if ('failure' in answer || answer.ok.kind !== 'prepared') return answer
          return succeed<PreparationProgress<MemoryEnvironment>>({
            kind: 'prepared',
            environment: {
              ...answer.ok.environment,
              preparation: withOperation(input, 'prepare-other').preparation,
            },
          })
        },
      },
    })),
  },
  {
    // Only inspectPreparation keys the allocation by the operation alone; prepare is right.
    name: 'inspectPreparation hands the resource of one call to another call',
    fails: [NAMES.E6],
    fixture: variant(real => {
      const firstCall = new Map<string, ToolCallId>()
      return {
        port: {
          prepare: async input => {
            if (!firstCall.has(input.preparation.operation))
              firstCall.set(input.preparation.operation, input.call)
            return real.prepare(input)
          },
          inspectPreparation: input => {
            const call = firstCall.get(input.preparation.operation) ?? input.call
            return real.inspectPreparation({
              ...input,
              call,
              preparation: { ...input.preparation, call },
            })
          },
        },
      }
    }),
  },
  {
    name: 'the exclusion is answered without evidence',
    fails: [NAMES.E8],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          if ('failure' in answer || answer.ok.kind !== 'excluded') return answer
          return succeed<PreparationProgress<MemoryEnvironment>>({
            ...answer.ok,
            exclusion: { ...answer.ok.exclusion, digest: '' },
          })
        },
      },
    })),
  },
  {
    name: 'a rejection does not name the failure',
    fails: [NAMES.E10],
    fixture: variant(real => ({
      port: {
        prepare: async input => {
          const answer = await real.prepare(input)
          return 'failure' in answer || answer.ok.kind !== 'rejected'
            ? answer
            : succeed<PreparationProgress<MemoryEnvironment>>({ ...answer.ok, reason: 'failed' })
        },
        inspectPreparation: async input => {
          const answer = await real.inspectPreparation(input)
          return 'failure' in answer || answer.ok.kind !== 'rejected'
            ? answer
            : succeed<PreparationProgress<MemoryEnvironment>>({ ...answer.ok, reason: 'failed' })
        },
      },
    })),
  },
  {
    // The tenant is told of the resource of another tenant by the evidence, and of nothing else.
    name: 'a foreign inspectPreparation answers the evidence of the tenant for the real preparation',
    fails: [NAMES.E16],
    fixture: variant(real => ({
      port: {
        inspectPreparation: async input => {
          if (!isForeign(input.tenant)) return real.inspectPreparation(input)
          const known = await real.inspectPreparation({
            ...input,
            tenant: own.tenant,
            preparation: { ...input.preparation, tenant: own.tenant },
          })
          const ghost = input.preparation.operation === 'prepare-ghost'
          if ('ok' in known && known.ok.kind === 'prepared')
            return succeed<PreparationProgress<MemoryEnvironment>>(known.ok)
          return ghost
            ? succeed<PreparationProgress<MemoryEnvironment>>({
                kind: 'prepared',
                environment: {
                  value: { resource: 'ghost' },
                  evidence: evidence('ghost'),
                  preparation: input.preparation,
                },
              })
            : real.inspectPreparation(input)
        },
      },
    })),
  },
  {
    // Under a hold the first answer claims a resource that the provider has not allocated yet.
    name: 'the first answer under a hold claims a resource',
    fails: [NAMES.E3, NAMES.E7, NAMES.E8, NAMES.E9],
    fixture: variant((real, base) => {
      let held = false
      let claimed = false
      return {
        handles: {
          hold: () => {
            held = true
            base.hold?.()
          },
        },
        port: {
          prepare: async input => {
            const answer = await real.prepare(input)
            if (!held || claimed) return answer
            claimed = true
            return succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'prepared',
              environment: {
                value: { resource: 'claimed' },
                evidence: evidence('claimed'),
                preparation: input.preparation,
              },
            })
          },
        },
      }
    }),
  },
  {
    // The preparation of another tenant joins the allocation of the first one.
    name: 'prepare ignores the tenant',
    fails: [NAMES.E17],
    fixture: variant(real => ({
      port: {
        prepare: input =>
          real.prepare({
            ...input,
            tenant: own.tenant,
            preparation: { ...input.preparation, tenant: own.tenant },
          }),
      },
    })),
  },
  {
    // The foreign preparation takes the place of the allocation of the tenant.
    name: 'a foreign prepare replaces the allocation of the tenant',
    fails: [NAMES.E17],
    fixture: variant(real => {
      let replaced = false
      return {
        port: {
          prepare: async input => {
            if (isForeign(input.tenant)) replaced = true
            const answer = await real.prepare(input)
            return replaced &&
              !isForeign(input.tenant) &&
              'ok' in answer &&
              answer.ok.kind === 'prepared'
              ? succeed(altered(answer.ok))
              : answer
          },
        },
      }
    }),
  },
  {
    // The release of another tenant is done on the release of the first one.
    name: 'release ignores the tenant',
    fails: [NAMES.E18],
    fixture: variant(real => ({
      port: {
        release: input =>
          real.release({
            ...input,
            tenant: own.tenant,
            release: { ...input.release, tenant: own.tenant },
          }),
      },
    })),
  },
  {
    name: 'a foreign release is denied when the resource exists',
    fails: [NAMES.E18],
    fixture: variant(real => ({
      port: {
        release: input =>
          isForeign(input.tenant) && input.release.operation === 'release-1'
            ? Promise.resolve(fail({ kind: 'denied', action: 'release' }))
            : real.release(input),
      },
    })),
  },
  {
    // The foreign release uses up the release of the tenant: its own release fails afterwards.
    name: 'a foreign release spends the release of the tenant',
    fails: [NAMES.E18],
    fixture: variant(real => {
      let spent = false
      return {
        port: {
          release: input => {
            if (isForeign(input.tenant)) spent = true
            return spent && !isForeign(input.tenant)
              ? Promise.resolve(
                  succeed<ReleaseProgress>({
                    kind: 'failed',
                    reason: 'the release was spent',
                  } as never),
                )
              : real.release(input)
          },
        },
      }
    }),
  },
  {
    // The provider keys the answer by identity and ignores the input: other input, same answer.
    name: 'a preparation operation reused with another input is answered as the original',
    fails: [NAMES.E14],
    fixture: variant(real => {
      const first = new Map<string, string>()
      return {
        port: {
          prepare: input => {
            const key = `${input.call}/${input.preparation.operation}`
            const digest = first.get(key) ?? input.preparation.inputDigest
            first.set(key, digest)
            return real.prepare({
              ...input,
              preparation: { ...input.preparation, inputDigest: digest },
            })
          },
        },
      }
    }),
  },
  {
    name: 'a release operation reused with another input is answered as the original',
    fails: [NAMES.E15],
    fixture: variant(real => {
      const first = new Map<string, string>()
      return {
        port: {
          release: input => {
            const key = `${input.call}/${input.release.operation}`
            const digest = first.get(key) ?? input.release.inputDigest
            first.set(key, digest)
            return real.release({ ...input, release: { ...input.release, inputDigest: digest } })
          },
        },
      }
    }),
  },
  {
    // The reuse of the identity is refused, but not as a conflict.
    name: 'a preparation operation reused with another input is refused as invalid',
    fails: [NAMES.E14],
    fixture: variant(real => ({
      port: {
        prepare: async input => {
          const answer = await real.prepare(input)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a release operation reused with another input is refused as invalid',
    fails: [NAMES.E15],
    fixture: variant(real => ({
      port: {
        release: async input => {
          const answer = await real.release(input)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a conflicting preparation operation still allocates',
    fails: [NAMES.E14],
    fixture: variant(real => ({
      port: {
        prepare: async input => {
          const answer = await real.prepare(input)
          if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
          await real.prepare(withOperation(input, `${input.preparation.operation}-late`))
          return answer
        },
      },
    })),
  },
  {
    // once a preparation was answered prepared, a resend goes back to pending.
    name: 'a prepared preparation is answered pending on the next ask',
    fails: [NAMES.E1, NAMES.E2, NAMES.E17],
    fixture: variant(real => {
      const prepared = new Set<string>()
      return {
        port: {
          prepare: async input => {
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'prepared') return answer
            const key = `${input.call}/${input.preparation.operation}`
            if (!prepared.has(key)) {
              prepared.add(key)
              return answer
            }
            return succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'pending',
              diagnostic: 'asked again',
            })
          },
        },
      }
    }),
  },
  {
    // a resend during pending answers a prepared that is not the one that lands.
    name: 'a resend during pending answers another prepared than the one that lands',
    fails: [NAMES.E3],
    fixture: variant(real => {
      const pending = new Set<string>()
      return {
        port: {
          prepare: async input => {
            const answer = await real.prepare(input)
            if ('failure' in answer || answer.ok.kind !== 'pending') return answer
            const key = `${input.call}/${input.preparation.operation}`
            if (!pending.has(key)) {
              pending.add(key)
              return answer
            }
            return succeed<PreparationProgress<MemoryEnvironment>>({
              kind: 'prepared',
              environment: {
                value: { resource: 'early' },
                evidence: evidence('early'),
                preparation: input.preparation,
              },
            })
          },
        },
      }
    }),
  },
  {
    name: 'inspectRelease ignores the tenant',
    fails: [NAMES.E19],
    fixture: variant(real => ({
      port: {
        inspectRelease: input =>
          real.inspectRelease({
            ...input,
            tenant: own.tenant,
            release: { ...input.release, tenant: own.tenant },
          }),
      },
    })),
  },
  {
    name: 'a foreign inspectRelease answers released when the release exists',
    fails: [NAMES.E19],
    fixture: variant(real => ({
      port: {
        inspectRelease: async input => {
          const answer = await real.inspectRelease(input)
          if (!isForeign(input.tenant) || input.release.operation !== 'release-1') return answer
          const known = await real.inspectRelease({
            ...input,
            tenant: own.tenant,
            release: { ...input.release, tenant: own.tenant },
          })
          return 'ok' in known && known.ok.kind === 'released'
            ? succeed<ReleaseProgress>({ kind: 'pending', diagnostic: 'the release is queued' })
            : answer
        },
      },
    })),
  },
  {
    // A rejection is final and recalled, but every preparation is rejected, the first one included.
    name: 'every preparation is rejected',
    fails: [
      NAMES.E1,
      NAMES.E2,
      NAMES.E3,
      NAMES.E4,
      NAMES.E6,
      NAMES.E7,
      NAMES.E8,
      NAMES.E9,
      NAMES.E10,
      NAMES.E11,
      NAMES.E12,
      NAMES.E14,
      NAMES.E15,
      NAMES.E16,
      NAMES.E17,
      NAMES.E18,
      NAMES.E19,
    ],
    fixture: variant(real => ({
      port: {
        prepare: async input => {
          const answer = await real.prepare(input)
          return 'failure' in answer
            ? answer
            : succeed<PreparationProgress<MemoryEnvironment>>({
                kind: 'rejected',
                reason: 'no capacity',
                evidence: evidence('rejection'),
              })
        },
      },
    })),
  },
  {
    // The failure for a release of another tenant is `denied`: it tells that the release exists.
    name: 'a foreign inspectRelease is denied when the release exists',
    fails: [NAMES.E19],
    fixture: variant(real => ({
      port: {
        inspectRelease: async input => {
          const answer = await real.inspectRelease(input)
          if (!isForeign(input.tenant) || input.release.operation !== 'release-1') return answer
          const known = await real.inspectRelease({
            ...input,
            tenant: own.tenant,
            release: { ...input.release, tenant: own.tenant },
          })
          return 'ok' in known && known.ok.kind === 'released'
            ? fail({ kind: 'denied', action: 'read' })
            : answer
        },
      },
    })),
  },
  {
    // Every release that another tenant asks about is answered with the evidence of the tenant.
    name: 'a foreign inspectRelease answers the evidence of the tenant for every release',
    fails: [NAMES.E19],
    fixture: variant(real => {
      let ownEvidence: DurableEvidence | null = null
      return {
        port: {
          release: async input => {
            const answer = await real.release(input)
            if ('ok' in answer && answer.ok.kind === 'released' && !isForeign(input.tenant))
              ownEvidence = answer.ok.evidence
            return answer
          },
          inspectRelease: async input => {
            const answer = await real.inspectRelease(input)
            return isForeign(input.tenant) && ownEvidence !== null
              ? succeed<ReleaseProgress>({ kind: 'released', evidence: ownEvidence })
              : answer
          },
        },
      }
    }),
  },
]

// Providers that the contract allows are built in environment-legal.ts, at the port boundary.

/**
 * The resend rule for a release, the second method of the port with a first answer that can be
 * progress: a release that goes back to pending after it answered released, and one that answers
 * a released during pending which is not the one that lands (the generated provider with the
 * resend during progress replaced). The preparation has its own variants above.
 */
const resendRule: readonly Variant<Fixture>[] = [
  {
    name: 'a resent release goes back from released to pending',
    fails: [NAMES.E11],
    fixture: variant(real => ({
      port: {
        release: regressesAfterFinal(
          {
            row: environmentAnswers.release,
            key: releaseKey,
            progress: () =>
              succeed<ReleaseProgress>({ kind: 'pending', diagnostic: 'asked again' }),
          },
          input => real.release(input),
        ),
      },
    })),
  },
  {
    name: 'a resend of a release during pending answers another released than the one that lands',
    fails: [NAMES.E11, NAMES.E12, NAMES.E15, NAMES.E18, NAMES.E19],
    fixture: () => {
      const pending = generated('pending')()
      return {
        ...pending,
        environment: {
          ...pending.environment,
          release: answersAnotherFinalDuringProgress(
            {
              row: environmentAnswers.release,
              key: releaseKey,
              other: () =>
                succeed<ReleaseProgress>({ kind: 'released', evidence: evidence('early') }),
            },
            input => pending.environment.release(input),
          ),
        },
      }
    },
  },
]

const NEEDS_SETTLE: Readonly<Record<string, string>> = Object.fromEntries(
  [
    NAMES.E1,
    NAMES.E2,
    NAMES.E3,
    NAMES.E4,
    NAMES.E6,
    NAMES.E7,
    NAMES.E8,
    NAMES.E9,
    NAMES.E10,
    NAMES.E11,
    NAMES.E12,
    NAMES.E14,
    NAMES.E15,
    NAMES.E16,
    NAMES.E17,
    NAMES.E18,
    NAMES.E19,
  ].map(name => [name, 'settle']),
)

// allocated requires an independently recorded pre-adoption allocation, exercised by
// environment-allocation.spec.ts. It cannot mask arbitrary rejections or released records.
const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(environmentAnswers)
    .filter(kind => kind !== 'allocated')
    .map((kind): LegalProvider<Fixture> => ({
      name: `generated: every first answer is ${kind} until settle`,
      fixture: generated(kind),
    })),
  {
    name: 'deferred allocation: every preparation is unknown first and settle lands the work',
    fixture: deferredPreparation({ first: 'unknown', landsAt: 'settle' }),
  },
  {
    name: 'a rejection is pending first, and settle lifts it',
    fixture: pendingFirstIncludingRejection('settle'),
  },
  {
    name: 'deferred allocation: every preparation answers pending first and lands on the next tick',
    fixture: deferredPreparation({ first: 'pending', landsAt: 'tick' }),
  },
  {
    name: 'every release answers pending first and is carried out on the next tick',
    fixture: asynchronousRelease,
  },
  {
    name: 'every answer of a preparation hands out a fresh reconnect capability',
    fixture: freshReconnect,
  },
  {
    name: 'a preparation is pending first, lands on the resend, and every prepared answer hands out a fresh reconnect capability',
    fixture: pendingFirstWithFreshReconnect,
  },
  {
    name: 'reads of what was never asked are refused, and another tenant is rejected',
    fixture: refusesUnseenReads,
  },
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.E16]: 'otherAccess',
      [NAMES.E17]: 'otherAccess',
      [NAMES.E18]: 'otherAccess',
      [NAMES.E19]: 'otherAccess',
    },
  },
]

/** The providers that are legal but offer no completion handle: the cases that need it are not applicable. */
const legalWithoutHandle: readonly LegalProvider<Fixture>[] = maskKinds(environmentAnswers)
  .filter(kind => kind !== 'allocated')
  .map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} and the fixture offers no settle`,
    fixture: generated(kind, { settle: false }),
    notApplicable: NEEDS_SETTLE,
  }))

/**
 * Fixtures that break the completion contract of a handle (it resolves before the work landed),
 * and the cases that read the landed state once after it. They are violators of the fixture, not
 * of the port: the suite must say so.
 */
const LATE_FAILS = [
  NAMES.E1,
  NAMES.E2,
  NAMES.E3,
  NAMES.E4,
  NAMES.E6,
  NAMES.E7,
  NAMES.E10,
  NAMES.E11,
  NAMES.E12,
  NAMES.E14,
  NAMES.E15,
  NAMES.E16,
  NAMES.E17,
  NAMES.E18,
  NAMES.E19,
]
const LATE_FAILS_REJECTION = [
  NAMES.E1,
  NAMES.E2,
  NAMES.E4,
  NAMES.E6,
  NAMES.E10,
  NAMES.E11,
  NAMES.E12,
  NAMES.E14,
  NAMES.E15,
  NAMES.E16,
  NAMES.E17,
  NAMES.E18,
  NAMES.E19,
]
const lateHandles: readonly Variant<Fixture>[] = [
  {
    name: 'settle resolves 3 turns before the work lands',
    fails: LATE_FAILS,
    fixture: deferredPreparation({
      first: 'unknown',
      landsAt: 'settle',
      lateSettle: then => turns(3, then),
    }),
  },
  {
    name: 'settle resolves 50 ms before the work lands',
    fails: LATE_FAILS,
    fixture: deferredPreparation({
      first: 'unknown',
      landsAt: 'settle',
      lateSettle: then => setTimeout(then, 50),
    }),
  },
  {
    name: 'a rejection is lifted on the next tick and settle is not involved',
    fails: LATE_FAILS_REJECTION,
    fixture: pendingFirstIncludingRejection('tick'),
  },
  {
    name: 'excludeDeferred resolves 3 turns before the exclusion holds',
    fails: [NAMES.E8, NAMES.E9],
    fixture: resolvesEarly(memoryToolEnvironmentFixture, 'excludeDeferred'),
  },
]

/** The methods of the port that take an access, and the case that checks another tenant on each. */
const CROSS_TENANT: Readonly<
  Record<Exclude<keyof ToolEnvironment<string, MemoryEnvironment>, 'adoption'>, string>
> = {
  prepare: NAMES.E17,
  inspectPreparation: NAMES.E16,
  release: NAMES.E18,
  inspectRelease: NAMES.E19,
}

describe('ToolEnvironment conformance suite', () => {
  const cases = toolEnvironmentConformance<string, MemoryEnvironment>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolEnvironmentFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { environment, access } = memoryToolEnvironmentFixture()
      return { environment, access }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({
      [NAMES.E2]: 'allocations',
      [NAMES.E3]: 'allocations',
      [NAMES.E7]: 'hold',
      [NAMES.E8]: 'hold',
      [NAMES.E9]: 'allocations',
      [NAMES.E10]: 'rejectNext',
      [NAMES.E16]: 'otherAccess',
      [NAMES.E17]: 'otherAccess',
      [NAMES.E18]: 'otherAccess',
      [NAMES.E19]: 'otherAccess',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, [...variants, ...resendRule, ...lateHandles])
  })

  itFailsExactly(cases, variants)

  itFailsExactly(cases, resendRule)

  itFailsExactly(cases, lateHandles)

  itPassesLegal(cases, legal)

  itPassesLegal(cases, legalWithoutHandle)

  for (const kind of maskKinds(environmentAnswers).filter(kind => kind !== 'allocated'))
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

  it('names the one handle that the double lacks in every case that it leaves not applicable', async () => {
    const handles = ['allocations', 'hold', 'settle', 'excludeDeferred', 'rejectNext'] as const
    for (const name of handles) {
      const verdict = await judge(cases, () => without(memoryToolEnvironmentFixture(), name))
      expect(verdict.failed, name).toEqual([])
      const named = Object.values(verdict.notApplicable)
      expect(named.length, name).toBeGreaterThan(0)
      expect(new Set(named), name).toEqual(new Set([name]))
    }
  })

  it('answers progress at once and never polls: no case is passed that needs a handle that is missing', async () => {
    const [first] = legalWithoutHandle
    const verdict = await judge(cases, first!.fixture)
    for (const name of Object.keys(NEEDS_SETTLE)) expect(verdict.passed).not.toContain(name)
  })

  it('has a cross-tenant case for every method that takes an access, and it needs the second tenant', async () => {
    for (const [method, name] of Object.entries(CROSS_TENANT)) {
      const found = cases.find(item => item.name === name)
      expect(found, `${method} has no cross-tenant case`).toBeDefined()
    }
    expect(new Set(Object.values(CROSS_TENANT)).size).toBe(Object.keys(CROSS_TENANT).length)
    const bare = (): Fixture => without(memoryToolEnvironmentFixture(), 'otherAccess')
    const verdict = await judge(cases, bare)
    for (const name of Object.values(CROSS_TENANT))
      expect(verdict.notApplicable[name]).toBe('otherAccess')
  })

  it('masks every method of the table that has progress, and each rule names a row', () => {
    expect(maskedMethods(environmentAnswers).sort()).toEqual(
      ['inspectPreparation', 'inspectRelease', 'prepare', 'release'].sort(),
    )
  })

  it('names the tenant of the second access: the cross-tenant cases fail on one tenant twice', async () => {
    const same = (): Fixture => {
      const base = memoryToolEnvironmentFixture()
      return { ...base, otherAccess: base.access }
    }
    const crossTenant = [NAMES.E16, NAMES.E17, NAMES.E18, NAMES.E19]
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual([...crossTenant].sort())
    for (const name of crossTenant)
      await expect(cases.find(item => item.name === name)!.run(same())).rejects.toThrow(
        /names one tenant twice/u,
      )
  })

  it('does not share state between two doubles', async () => {
    const [one, two] = [
      createMemoryToolEnvironment<string>(),
      createMemoryToolEnvironment<string>(),
    ]
    one.controls.hold()
    expect(two.controls.allocations()).toBe(0)
  })
})
