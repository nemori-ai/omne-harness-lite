// Self-proof of the ToolStartAuthority suite: it passes on the conforming double, and each
// case fails under a violating variant that breaks the rule of that case. The variants are wrappers
// around the double; they live here and are not exported.
import type { TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  memoryToolStartAuthorityFixture,
  startAuthorityAnswers,
  toolStartAuthorityConformance,
} from '@omne-harness/tool-contract/testing'
import type { StartPermit, StartProgress, ToolStartAuthority } from '@omne-harness/tool-contract'
import {
  expectEveryCaseIsCaught,
  expectVariantVerdict,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { answersAnotherFinalDuringProgress, regressesAfterFinal } from './resend-violators.ts'
import {
  generated,
  guardless,
  guardlessAuthority,
  guardlessOneTenant,
  oneTenant,
  refusesAsNotStarted,
  refusesOutright,
  startKey,
  variant,
  type Fixture,
} from './start-authority-legal.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  SA1: 'prepare names the guards it saw and starts nothing',
  SA2: 'consume accepts a permit once and recalls the acceptance',
  SA3: 'a second permit of an accepted start does not accept it again',
  SA4: 'an invalidation confirmed before the consume forbids the start',
  SA5: 'a start accepted before the invalidation stays in flight',
  SA6: 'inspect recalls an acceptance',
  SA7: 'inspect recalls a rejection',
  SA8: 'not-started withdraws the outstanding permit',
  SA9: 'a start answered not-started can start with a new permit',
  SA10: 'an exclusion forbids the start for good',
  SA11: 'an exclusion cannot overrule an accepted start',
  SA12: 'a resent invalidation is recognised and moves the guard once',
  SA13: 'an invalidation operation reused for another guard is a conflict that changes nothing',
  SA14: 'an exclusion operation reused for another reason is a conflict that changes nothing',
  SA15: 'another tenant learns nothing of a start by inspect',
  SA16: 'another tenant cannot accept the permit of a tenant',
  SA17: 'another tenant cannot invalidate the guard of a tenant',
  SA18: 'another tenant cannot exclude the call of a tenant',
  SA19: 'another tenant cannot prepare the start of a tenant',
} as const

/** The cases that need a guard to invalidate, and the handle they name when there is none. */
const NEEDS_GUARD = {
  [NAMES.SA4]: 'guard',
  [NAMES.SA5]: 'guard',
  [NAMES.SA7]: 'guard',
  [NAMES.SA12]: 'guard',
  [NAMES.SA13]: 'guard',
  [NAMES.SA17]: 'guard',
}

// Read when a case runs, not when the file is collected: the fixture mints its tenant then.
const own = {
  get tenant(): TenantId {
    return memoryToolStartAuthorityFixture().access.tenant
  },
}

/** The tenant of an input is not the tenant of the fixture. */
const isForeign = (tenant: typeof own.tenant): boolean =>
  JSON.stringify(tenant) !== JSON.stringify(own.tenant)

const variants: readonly Variant<Fixture>[] = [
  {
    // A permit alone is reported as a start.
    name: 'a permit that is only issued counts as started',
    fails: [NAMES.SA1, NAMES.SA8, NAMES.SA9],
    fixture: variant(real => {
      const outstanding = new Set<string>()
      return {
        prepare: input => {
          outstanding.add(input.start.operation)
          return real.prepare(input)
        },
        consume: input => {
          outstanding.delete(input.permit.start.operation)
          return real.consume(input)
        },
        inspect: async input => {
          if (!outstanding.has(input.start.operation)) return real.inspect(input)
          return succeed<StartProgress>({ kind: 'started', acceptance: evidence('assumed') })
        },
      }
    }),
  },
  {
    // Every consume after the first mints a new acceptance.
    name: 'consume mints a fresh acceptance each time',
    fails: [NAMES.SA2, NAMES.SA3, NAMES.SA5],
    fixture: variant(real => {
      let calls = 0
      return {
        consume: async input => {
          calls += 1
          const answer = await real.consume(input)
          if (calls === 1 || 'failure' in answer || answer.ok.kind !== 'started') return answer
          return succeed<StartProgress>({
            kind: 'started',
            acceptance: { ...answer.ok.acceptance, digest: `sha256:fresh-${calls}` },
          })
        },
      }
    }),
  },
  {
    // The invalidation answers evidence but changes nothing.
    name: 'invalidate confirms without invalidating',
    fails: [NAMES.SA4, NAMES.SA7, NAMES.SA13],
    fixture: variant(() => ({ invalidate: () => Promise.resolve(succeed(evidence('fake'))) })),
  },
  {
    // An invalidation reaches back to a start that was already accepted.
    name: 'an invalidation revokes an accepted start',
    fails: [NAMES.SA5],
    fixture: variant(real => {
      let invalidated = false
      return {
        invalidate: input => {
          invalidated = true
          return real.invalidate(input)
        },
        inspect: async input => {
          const answer = await real.inspect(input)
          if (!invalidated || 'failure' in answer || answer.ok.kind !== 'started') return answer
          return succeed<StartProgress>({
            kind: 'rejected',
            reason: 'revoked',
            exclusion: evidence('revoked'),
          })
        },
      }
    }),
  },
  {
    name: 'inspect forgets an acceptance',
    fails: [NAMES.SA3, NAMES.SA5, NAMES.SA6, NAMES.SA11, NAMES.SA15, NAMES.SA19],
    fixture: variant(real => ({
      inspect: async input => {
        const answer = await real.inspect(input)
        if ('failure' in answer || answer.ok.kind !== 'started') return answer
        return succeed<StartProgress>({ kind: 'unknown', diagnostic: 'forgotten' })
      },
    })),
  },
  {
    name: 'inspect turns a rejection into not-started',
    fails: [NAMES.SA7],
    fixture: variant(real => ({
      inspect: async input => {
        const answer = await real.inspect(input)
        if ('failure' in answer || answer.ok.kind !== 'rejected') return answer
        return succeed<StartProgress>({ kind: 'not-started', exclusion: answer.ok.exclusion })
      },
    })),
  },
  {
    // An excluded start gets a fresh permit and starts after all.
    name: 'consume resurrects a start that was excluded',
    fails: [NAMES.SA8],
    fixture: variant(real => {
      let last: Parameters<ToolStartAuthority<string>['prepare']>[0] | null = null
      return {
        prepare: input => {
          last = input
          return real.prepare(input)
        },
        consume: async input => {
          const answer = await real.consume(input)
          if (last === null || 'failure' in answer || answer.ok.kind !== 'not-started')
            return answer
          const fresh = await real.prepare(last)
          if ('failure' in fresh) return answer
          return real.consume({ ...input, permit: fresh.ok })
        },
      }
    }),
  },
  {
    name: 'consume answers started after an exclusion',
    fails: [NAMES.SA10, NAMES.SA14],
    fixture: variant(real => {
      let excluded = false
      return {
        exclude: input => {
          excluded = true
          return real.exclude(input)
        },
        consume: async input =>
          excluded
            ? succeed<StartProgress>({ kind: 'started', acceptance: evidence('after-exclusion') })
            : real.consume(input),
      }
    }),
  },
  {
    name: 'exclude confirms without excluding',
    fails: [NAMES.SA10, NAMES.SA11, NAMES.SA14],
    fixture: variant(() => ({ exclude: () => Promise.resolve(succeed(evidence('fake'))) })),
  },
  {
    // Every send of an invalidation is a new operation.
    name: 'a resent invalidation is a new invalidation',
    fails: [NAMES.SA12, NAMES.SA13],
    fixture: variant(real => {
      let sends = 0
      return {
        invalidate: input => {
          sends += 1
          const operation = decodeToolOperationId(`${input.operation}-${sends}`)
          if ('failure' in operation) throw new Error('the variant minted an illegal identity')
          return real.invalidate({ ...input, operation: operation.ok })
        },
      }
    }),
  },
  {
    // The second permit of a start that was accepted gets an acceptance of its own.
    name: 'a second permit of an accepted start is accepted again',
    fails: [NAMES.SA3],
    fixture: variant(real => {
      const permits = new Map<string, string>()
      return {
        consume: async input => {
          const answer = await real.consume(input)
          if ('failure' in answer || answer.ok.kind !== 'started') return answer
          const first = permits.get(input.permit.start.operation) ?? input.permit.request.record
          permits.set(input.permit.start.operation, first)
          return first === input.permit.request.record
            ? answer
            : succeed<StartProgress>({
                kind: 'started',
                acceptance: evidence(`second-${input.permit.request.record}`),
              })
        },
      }
    }),
  },
  {
    // After an invalidation, a consume that is sent again for an accepted start answers rejected.
    name: 'a resent consume after an invalidation answers rejected',
    fails: [NAMES.SA5],
    fixture: variant(real => {
      let invalidated = false
      const acceptedBefore = new Set<string>()
      return {
        invalidate: input => {
          invalidated = true
          return real.invalidate(input)
        },
        consume: async input => {
          const answer = await real.consume(input)
          if ('failure' in answer || answer.ok.kind !== 'started') return answer
          const key = input.permit.request.record
          if (!invalidated) {
            acceptedBefore.add(key)
            return answer
          }
          return acceptedBefore.has(key)
            ? succeed<StartProgress>({
                kind: 'rejected',
                reason: 'revoked',
                exclusion: evidence('revoked'),
              })
            : answer
        },
      }
    }),
  },
  {
    // A consume that is refused once starts when it is sent again.
    name: 'a retry of a refused consume starts',
    fails: [NAMES.SA4],
    fixture: variant(real => {
      const refusedOnce = new Set<string>()
      return {
        consume: async input => {
          const answer = await real.consume(input)
          if ('failure' in answer || answer.ok.kind === 'started') return answer
          const key = input.permit.request.record
          if (!refusedOnce.has(key)) {
            refusedOnce.add(key)
            return answer
          }
          return succeed<StartProgress>({ kind: 'started', acceptance: evidence('retry') })
        },
      }
    }),
  },
  {
    // Not-started is taken as a permanent refusal of the start identity.
    name: 'not-started forbids any later first start',
    fails: [NAMES.SA9],
    fixture: variant(real => {
      const dead = new Set<string>()
      return {
        inspect: async input => {
          const answer = await real.inspect(input)
          if ('ok' in answer && answer.ok.kind === 'not-started') dead.add(input.start.operation)
          return answer
        },
        consume: async input => {
          const answer = await real.consume(input)
          if (
            !dead.has(input.permit.start.operation) ||
            'failure' in answer ||
            answer.ok.kind !== 'started'
          )
            return answer
          return succeed<StartProgress>({
            kind: 'rejected',
            reason: 'not-started is final',
            exclusion: evidence('final'),
          })
        },
      }
    }),
  },
  {
    // The key of the start leaves out the tenant: another tenant reads the acceptance.
    name: 'inspect ignores the tenant',
    fails: [NAMES.SA15],
    fixture: variant(real => ({
      inspect: input => real.inspect({ ...input, tenant: own.tenant }),
    })),
  },
  {
    // The answer for a start of another tenant is `denied`: it tells that the start exists.
    name: 'a foreign inspect is denied when the start exists',
    fails: [NAMES.SA15],
    fixture: variant(real => ({
      inspect: async input => {
        if (!isForeign(input.tenant)) return real.inspect(input)
        const known = await real.inspect({ ...input, tenant: own.tenant })
        return 'ok' in known && known.ok.kind === 'started'
          ? fail({ kind: 'denied', action: 'read' })
          : real.inspect(input)
      },
    })),
  },
  {
    // A foreign question is answered with the kind of the answer for another call.
    name: 'a foreign inspect answers unknown when the start exists',
    fails: [NAMES.SA15],
    fixture: variant(real => ({
      inspect: async input => {
        const answer = await real.inspect(input)
        if (!isForeign(input.tenant) || 'failure' in answer) return answer
        const known = await real.inspect({ ...input, tenant: own.tenant })
        return 'ok' in known && known.ok.kind === 'started'
          ? succeed<StartProgress>({ kind: 'unknown', diagnostic: 'the start is not yours' })
          : answer
      },
    })),
  },
  {
    name: 'a foreign inspect makes the acceptance forgotten',
    fails: [NAMES.SA15],
    fixture: variant(real => {
      let forgotten = false
      return {
        inspect: async input => {
          if (isForeign(input.tenant)) forgotten = true
          return forgotten && !isForeign(input.tenant)
            ? succeed<StartProgress>({ kind: 'unknown', diagnostic: 'forgotten' })
            : real.inspect(input)
        },
      }
    }),
  },
  {
    // An undecided start is reported as rejected for good, not as not-started.
    name: 'inspect answers rejected for a start that nobody decided',
    fails: [NAMES.SA1, NAMES.SA8, NAMES.SA9],
    fixture: variant(real => ({
      inspect: async input => {
        const answer = await real.inspect(input)
        return 'ok' in answer && answer.ok.kind === 'not-started'
          ? succeed<StartProgress>({
              kind: 'rejected',
              reason: 'nobody decided',
              exclusion: answer.ok.exclusion,
            })
          : answer
      },
    })),
  },
  {
    // The permit of another tenant is accepted as if it were that of the caller.
    name: 'consume ignores the tenant',
    fails: [NAMES.SA16, NAMES.SA19],
    fixture: variant(real => ({
      consume: input => real.consume({ ...input, tenant: own.tenant }),
    })),
  },
  {
    // The foreign attempt does not spend the permit, but the authority refuses it for good after.
    name: 'a foreign consume gets the permit of the tenant refused',
    fails: [NAMES.SA16],
    fixture: variant(real => {
      let attempted = false
      return {
        consume: async input => {
          if (isForeign(input.tenant)) attempted = true
          const answer = await real.consume(input)
          return attempted &&
            !isForeign(input.tenant) &&
            'ok' in answer &&
            answer.ok.kind === 'started'
            ? succeed<StartProgress>({
                kind: 'rejected',
                reason: 'a foreign consume came first',
                exclusion: evidence('foreign'),
              })
            : answer
        },
      }
    }),
  },
  {
    // The permit of the tenant is spent by the foreign attempt.
    name: 'a foreign consume spends the permit of the tenant',
    fails: [NAMES.SA16],
    fixture: variant(real => {
      let spent = false
      return {
        consume: input => {
          if (isForeign(input.tenant)) {
            spent = true
            return real.consume(input)
          }
          return spent
            ? Promise.resolve(fail({ kind: 'invalid', field: 'permit', reason: 'not-issued' }))
            : real.consume(input)
        },
      }
    }),
  },
  {
    name: 'a foreign consume is denied when the permit exists',
    fails: [NAMES.SA16],
    fixture: variant(real => ({
      consume: async input => {
        if (isForeign(input.tenant) && input.permit.request.record !== 'never-issued')
          return fail({ kind: 'denied', action: 'start' })
        return real.consume(input)
      },
    })),
  },
  {
    // A consume of a permit that names another tenant answers unknown (a
    // progress kind of the table) until settle; after it, the permit that was issued is rejected
    // and the permit that never was is invalid. The first answers agree, the later ones do not.
    name: 'a foreign consume is unknown until settle, then tells that the permit exists',
    fails: [NAMES.SA16],
    fixture: () => {
      const base = memoryToolStartAuthorityFixture()
      const real = base.authority
      const issued = new Set<string>()
      const key = (permit: StartPermit): string => JSON.stringify([permit.tenant, permit.request])
      let decided = false
      return {
        ...base,
        settle: async () => {
          decided = true
          await base.settle?.()
        },
        authority: {
          ...real,
          prepare: async input => {
            const answer = await real.prepare(input)
            if ('ok' in answer) issued.add(key(answer.ok))
            return answer
          },
          consume: async input => {
            if (JSON.stringify(input.tenant) === JSON.stringify(input.permit.tenant))
              return real.consume(input)
            if (!decided)
              return succeed<StartProgress>({ kind: 'unknown', diagnostic: 'cannot tell yet' })
            return issued.has(key(input.permit))
              ? succeed<StartProgress>({
                  kind: 'rejected',
                  reason: 'the permit was issued to another tenant',
                  exclusion: evidence('foreign-permit'),
                })
              : real.consume(input)
          },
        },
      }
    },
  },
  {
    // The invalidation of another tenant moves the guard of the first one.
    name: 'invalidate ignores the tenant',
    fails: [NAMES.SA17],
    fixture: variant(real => ({
      invalidate: input => real.invalidate({ ...input, tenant: own.tenant }),
    })),
  },
  {
    name: 'a foreign invalidate is denied when the guard exists',
    fails: [NAMES.SA17],
    fixture: variant(real => ({
      invalidate: input =>
        isForeign(input.tenant) && input.guard.resource !== 'ghost-resource'
          ? Promise.resolve(fail({ kind: 'denied', action: 'invalidate' }))
          : real.invalidate(input),
    })),
  },
  {
    // The exclusion of another tenant rejects the call of the first one.
    name: 'exclude ignores the tenant',
    fails: [NAMES.SA18],
    fixture: variant(real => ({
      exclude: input => real.exclude({ ...input, tenant: own.tenant }),
    })),
  },
  {
    name: 'a foreign exclude is denied when the call exists',
    fails: [NAMES.SA18],
    fixture: variant(real => ({
      exclude: input =>
        isForeign(input.tenant) && input.call === 'call-1'
          ? Promise.resolve(fail({ kind: 'denied', action: 'exclude' }))
          : real.exclude(input),
    })),
  },
  ...(['owner', 'resource', 'revision'] as const).map(field => ({
    // The permit names a guard of which one part is empty; the guard is then read by the provider.
    name: `the guard of a permit has no ${field}`,
    // The guard is read back by every case that consumes, so only the two that never do pass.
    fails: Object.values(NAMES).filter(
      name => name !== NAMES.SA8 && name !== NAMES.SA10 && name !== NAMES.SA14,
    ),
    fixture: variant(real => ({
      prepare: async input => {
        const answer = await real.prepare(input)
        if ('failure' in answer) return answer
        return succeed({
          ...answer.ok,
          guards: answer.ok.guards.map(guard => ({ ...guard, [field]: '' })),
        })
      },
    })),
  })),
  {
    // A resend that comes alone is answered a fresh acceptance; resends that meet recall it.
    name: 'a consume that comes alone is answered a fresh acceptance',
    fails: [NAMES.SA2, NAMES.SA3, NAMES.SA5],
    fixture: variant(real => {
      let calls = 0
      let inflight = 0
      return {
        consume: async input => {
          calls += 1
          const turn = calls
          inflight += 1
          let met = inflight > 1
          await Promise.resolve()
          met ||= inflight > 1
          const answer = await real.consume(input)
          inflight -= 1
          if (turn === 1 || met || 'failure' in answer || answer.ok.kind !== 'started')
            return answer
          return succeed<StartProgress>({
            kind: 'started',
            acceptance: { ...answer.ok.acceptance, digest: `sha256:alone-${turn}` },
          })
        },
      }
    }),
  },
  {
    // Consumes that meet in flight are answered fresh acceptances; a lone resend recalls it.
    name: 'consumes that meet in flight are answered fresh acceptances',
    fails: [NAMES.SA2],
    fixture: variant(real => {
      let inflight = 0
      let turn = 0
      return {
        consume: async input => {
          inflight += 1
          let met = inflight > 1
          await Promise.resolve()
          met ||= inflight > 1
          const answer = await real.consume(input)
          inflight -= 1
          turn += 1
          if (!met || 'failure' in answer || answer.ok.kind !== 'started') return answer
          return succeed<StartProgress>({
            kind: 'started',
            acceptance: { ...answer.ok.acceptance, digest: `sha256:crowd-${turn}` },
          })
        },
      }
    }),
  },
  {
    // After an invalidation that refused a consume, the provider reports the start as unknown.
    name: 'inspect answers unknown after an invalidation refused a consume',
    fails: [NAMES.SA4, NAMES.SA7],
    fixture: variant(real => {
      let invalidated = false
      return {
        invalidate: input => {
          invalidated = true
          return real.invalidate(input)
        },
        inspect: async input => {
          const answer = await real.inspect(input)
          return invalidated && 'ok' in answer && answer.ok.kind !== 'started'
            ? succeed<StartProgress>({ kind: 'unknown', diagnostic: 'not sure' })
            : answer
        },
      }
    }),
  },
  {
    // The permit that not-started withdrew starts all the same.
    name: 'a permit that was withdrawn by not-started starts',
    fails: [NAMES.SA8],
    fixture: variant(real => {
      let withdrawn = false
      return {
        inspect: async input => {
          const answer = await real.inspect(input)
          if ('ok' in answer && answer.ok.kind === 'not-started') withdrawn = true
          return answer
        },
        consume: async input => {
          const answer = await real.consume(input)
          return withdrawn && 'ok' in answer && answer.ok.kind === 'not-started'
            ? succeed<StartProgress>({ kind: 'started', acceptance: evidence('withdrawn') })
            : answer
        },
      }
    }),
  },
  {
    // After an exclusion, a new permit of the start is issued and starts.
    name: 'a new permit after an exclusion starts',
    fails: [NAMES.SA10],
    fixture: variant(real => {
      let excluded = false
      const issued = new Set<string>()
      return {
        exclude: input => {
          excluded = true
          return real.exclude(input)
        },
        prepare: async input => {
          const answer = await real.prepare(input)
          if ('ok' in answer && excluded) issued.add(answer.ok.request.record)
          return answer
        },
        consume: async input =>
          issued.has(input.permit.request.record)
            ? succeed<StartProgress>({ kind: 'started', acceptance: evidence('after-exclusion') })
            : real.consume(input),
      }
    }),
  },
  {
    // The resent invalidation answers the original evidence while the first resend is fresh.
    name: 'a resent invalidation answers fresh evidence before another permit is issued',
    fails: [NAMES.SA12],
    fixture: variant(real => {
      let issuedAfter = false
      let first: Awaited<ReturnType<ToolStartAuthority<string>['invalidate']>> | null = null
      return {
        prepare: input => {
          if (first !== null) issuedAfter = true
          return real.prepare(input)
        },
        invalidate: async input => {
          const answer = await real.invalidate(input)
          if (first === null) {
            first = answer
            return answer
          }
          return issuedAfter || 'failure' in answer
            ? answer
            : succeed({ ...answer.ok, digest: 'sha256:fresh-before' })
        },
      }
    }),
  },
  {
    // The resent invalidation answers fresh evidence once another permit was issued.
    name: 'a resent invalidation answers fresh evidence after another permit is issued',
    fails: [NAMES.SA12, NAMES.SA13],
    fixture: variant(real => {
      let issuedAfter = false
      let first: Awaited<ReturnType<ToolStartAuthority<string>['invalidate']>> | null = null
      return {
        prepare: input => {
          if (first !== null) issuedAfter = true
          return real.prepare(input)
        },
        invalidate: async input => {
          const answer = await real.invalidate(input)
          if (first === null) {
            first = answer
            return answer
          }
          return !issuedAfter || 'failure' in answer
            ? answer
            : succeed({ ...answer.ok, digest: 'sha256:fresh-after' })
        },
      }
    }),
  },
  {
    // The answer is the original evidence, and the guard moves again each time.
    name: 'a resent invalidation moves the guard again',
    fails: [NAMES.SA12, NAMES.SA13],
    fixture: variant(real => {
      const sent = new Set<string>()
      let turn = 0
      return {
        invalidate: async input => {
          if (!sent.has(input.operation)) {
            sent.add(input.operation)
            return real.invalidate(input)
          }
          turn += 1
          const original = await real.invalidate(input)
          const operation = decodeToolOperationId(`${input.operation}-again-${turn}`)
          if ('failure' in operation) throw new Error('the variant minted an illegal identity')
          await real.invalidate({ ...input, operation: operation.ok })
          return original
        },
      }
    }),
  },
  {
    // The revision that a permit names grows with every prepare, whether or not a guard moved.
    name: 'the revision of the guard grows with every prepare',
    fails: [NAMES.SA12],
    fixture: variant(real => {
      let prepares = 0
      const suffix = (revision: string, turn: number): string => `${revision}.${turn}`
      const strip = (revision: string): string => revision.slice(0, revision.lastIndexOf('.'))
      return {
        prepare: async input => {
          const answer = await real.prepare(input)
          if ('failure' in answer) return answer
          prepares += 1
          const turn = prepares
          return succeed({
            ...answer.ok,
            guards: answer.ok.guards.map(guard => ({
              ...guard,
              revision: suffix(guard.revision, turn),
            })),
          })
        },
        consume: input =>
          real.consume({
            ...input,
            permit: {
              ...input.permit,
              guards: input.permit.guards.map(guard => ({
                ...guard,
                revision: strip(guard.revision),
              })),
            },
          }),
      }
    }),
  },
  {
    // the provider keys an invalidation by its operation alone and ignores the guard it names.
    name: 'an invalidation operation reused for another guard is answered as the original',
    fails: [NAMES.SA13],
    fixture: variant(real => {
      const first = new Map<string, Parameters<ToolStartAuthority<string>['invalidate']>[0]>()
      return {
        invalidate: input => {
          const original = first.get(input.operation) ?? input
          first.set(input.operation, original)
          return real.invalidate(original)
        },
      }
    }),
  },
  {
    // the provider keys an exclusion by its operation alone and ignores the reason it gives.
    name: 'an exclusion operation reused for another reason is answered as the original',
    fails: [NAMES.SA14],
    fixture: variant(real => {
      const first = new Map<string, Parameters<ToolStartAuthority<string>['exclude']>[0]>()
      return {
        exclude: input => {
          const original = first.get(input.operation) ?? input
          first.set(input.operation, original)
          return real.exclude(original)
        },
      }
    }),
  },
  {
    // The old permit of an exclusion still starts; a permit issued after it does not.
    name: 'the permit issued before an exclusion starts after it',
    fails: [NAMES.SA10, NAMES.SA14],
    fixture: variant(real => {
      let excluded = false
      const before = new Set<string>()
      return {
        exclude: input => {
          excluded = true
          return real.exclude(input)
        },
        prepare: async input => {
          const answer = await real.prepare(input)
          if ('ok' in answer && !excluded) before.add(answer.ok.request.record)
          return answer
        },
        consume: async input =>
          excluded && before.has(input.permit.request.record)
            ? succeed<StartProgress>({ kind: 'started', acceptance: evidence('before-exclusion') })
            : real.consume(input),
      }
    }),
  },
  {
    // A consume after a resent invalidation is refused, as if the resend had moved the guard.
    name: 'a consume after a resent invalidation is rejected',
    fails: [NAMES.SA12, NAMES.SA13],
    fixture: variant(real => {
      const sent = new Set<string>()
      let resent = false
      return {
        invalidate: input => {
          if (sent.has(input.operation)) resent = true
          sent.add(input.operation)
          return real.invalidate(input)
        },
        consume: async input => {
          const answer = await real.consume(input)
          return resent && 'ok' in answer && answer.ok.kind === 'started'
            ? succeed<StartProgress>({
                kind: 'rejected',
                reason: 'the guard moved',
                exclusion: evidence('moved'),
              })
            : answer
        },
      }
    }),
  },
  {
    // The first refusal after an invalidation slips through as a start; later answers refuse.
    name: 'the first consume after an invalidation starts',
    fails: [NAMES.SA4, NAMES.SA7],
    fixture: variant(real => {
      let invalidated = false
      let slipped = false
      return {
        invalidate: async input => {
          invalidated = true
          return real.invalidate(input)
        },
        consume: async input => {
          const answer = await real.consume(input)
          if (
            !invalidated ||
            slipped ||
            'failure' in answer ||
            (answer.ok.kind !== 'rejected' && answer.ok.kind !== 'not-started')
          )
            return answer
          slipped = true
          return succeed<StartProgress>({ kind: 'started', acceptance: evidence('slipped') })
        },
      }
    }),
  },
  {
    // The reuse of an invalidation identity is refused, but not as a conflict.
    name: 'an invalidation operation reused for another guard is refused as invalid',
    fails: [NAMES.SA13],
    fixture: variant(real => ({
      invalidate: async input => {
        const answer = await real.invalidate(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
          : answer
      },
    })),
  },
  {
    name: 'an exclusion operation reused for another reason is refused as invalid',
    fails: [NAMES.SA14],
    fixture: variant(real => ({
      exclude: async input => {
        const answer = await real.exclude(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
          : answer
      },
    })),
  },
  {
    // The refused exclusion overwrites what the original operation answers afterwards.
    name: 'a conflicting reuse of an exclusion identity changes the evidence of the original',
    fails: [NAMES.SA14],
    fixture: variant(real => {
      const conflicted = new Set<string>()
      return {
        exclude: async input => {
          const answer = await real.exclude(input)
          if ('failure' in answer) {
            if (answer.failure.kind === 'conflict') conflicted.add(input.operation)
            return answer
          }
          return conflicted.has(input.operation)
            ? succeed({ ...answer.ok, digest: 'sha256:overwritten' })
            : answer
        },
      }
    }),
  },
  {
    // A foreign prepare is answered a permit that names the tenant that owns the start.
    name: 'a foreign prepare issues a permit that names the first tenant',
    fails: [NAMES.SA19],
    fixture: variant(real => ({
      prepare: async input => {
        const answer = await real.prepare(input)
        return isForeign(input.tenant) && 'ok' in answer
          ? succeed({ ...answer.ok, tenant: own.tenant })
          : answer
      },
    })),
  },
]

// ---------------------------------------------------------------------------------------------
// Providers that the contract allows are built in start-authority-legal.ts, at the port boundary.
// ---------------------------------------------------------------------------------------------

/**
 * The resend rule for `consume`, the method of the port with a first answer that can be
 * progress: a consume that goes back to `unknown` after it answered started, and one that answers
 * a started during `unknown` which is not the one that lands (the generated provider with the
 * resend during progress replaced). The consume that mints a fresh acceptance each time is above.
 */
const resendRule: readonly Variant<Fixture>[] = [
  {
    name: 'a resent consume goes back from started to unknown',
    fails: [NAMES.SA2, NAMES.SA3, NAMES.SA4, NAMES.SA5, NAMES.SA10],
    fixture: variant(real => ({
      consume: regressesAfterFinal(
        {
          row: startAuthorityAnswers.consume,
          key: startKey,
          progress: () =>
            succeed<StartProgress>({
              kind: 'unknown',
              diagnostic: 'the authority was asked again',
            }),
        },
        input => real.consume(input),
      ),
    })),
  },
  {
    name: 'a resend of a consume during unknown answers another acceptance than the one that lands',
    fails: [
      NAMES.SA2,
      NAMES.SA3,
      NAMES.SA4,
      NAMES.SA5,
      NAMES.SA6,
      NAMES.SA7,
      NAMES.SA10,
      NAMES.SA11,
      NAMES.SA12,
      NAMES.SA13,
      NAMES.SA14,
      NAMES.SA15,
      NAMES.SA16,
      NAMES.SA17,
      NAMES.SA18,
      NAMES.SA19,
    ],
    fixture: () => {
      const unknown = generated('unknown')()
      return {
        ...unknown,
        authority: {
          ...unknown.authority,
          consume: answersAnotherFinalDuringProgress(
            {
              row: startAuthorityAnswers.consume,
              key: startKey,
              other: () =>
                succeed<StartProgress>({ kind: 'started', acceptance: evidence('early') }),
            },
            input => unknown.authority.consume(input),
          ),
        },
      }
    },
  },
]

/** The cases that wait for a decision of `consume` or `inspect`, and name `settle` without it. */
const NEEDS_SETTLE = Object.fromEntries(
  [
    NAMES.SA2,
    NAMES.SA3,
    NAMES.SA4,
    NAMES.SA5,
    NAMES.SA6,
    NAMES.SA7,
    NAMES.SA8,
    NAMES.SA9,
    NAMES.SA10,
    NAMES.SA11,
    NAMES.SA12,
    NAMES.SA13,
    NAMES.SA14,
    NAMES.SA15,
    NAMES.SA16,
    NAMES.SA17,
    NAMES.SA18,
    NAMES.SA19,
  ].map(name => [name, 'settle']),
)

const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(startAuthorityAnswers).map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer of consume and inspect is ${kind} until settle`,
    fixture: generated(kind),
  })),
  {
    name: 'permits with no guard, two tenants',
    fixture: guardlessAuthority,
    notApplicable: NEEDS_GUARD,
  },
  {
    name: 'permits with no guard, one tenant',
    fixture: guardlessOneTenant,
    notApplicable: {
      ...NEEDS_GUARD,
      [NAMES.SA15]: 'otherAccess',
      [NAMES.SA16]: 'otherAccess',
      [NAMES.SA17]: 'otherAccess',
      [NAMES.SA18]: 'otherAccess',
      [NAMES.SA19]: 'otherAccess',
    },
  },
  {
    name: 'a stale consume is refused as not-started and inspect says the same',
    fixture: refusesAsNotStarted('not-started'),
  },
  {
    name: 'a stale consume is refused as not-started and inspect rejects with its own evidence',
    fixture: refusesAsNotStarted('rejected'),
  },
  {
    name: 'withdrawn and excluded permits, second permits and foreign prepares are refused outright',
    fixture: refusesOutright('not-issued'),
  },
  {
    name: 'a second permit of an accepted start is issued and its consume refused outright',
    fixture: refusesOutright('not-consumed'),
  },
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.SA15]: 'otherAccess',
      [NAMES.SA16]: 'otherAccess',
      [NAMES.SA17]: 'otherAccess',
      [NAMES.SA18]: 'otherAccess',
      [NAMES.SA19]: 'otherAccess',
    },
  },
]

/** Legal, but with no `settle` for the `unknown` that it answers: not applicable, never passed. */
const legalWithoutSettle: readonly LegalProvider<Fixture>[] = [
  {
    name: 'generated: every first answer of consume and inspect is unknown and the fixture offers no settle',
    fixture: generated('unknown', { settle: false }),
    notApplicable: NEEDS_SETTLE,
  },
]

/** A fixture whose `settle` resolves before the authority decides. */
const lateSettle: readonly Variant<Fixture>[] = [
  {
    name: 'a stale consume is refused as not-started and inspect then says started',
    fails: [NAMES.SA4, NAMES.SA7],
    fixture: refusesAsNotStarted('started'),
  },
  {
    name: 'settle resolves 3 turns before the authority decides (generated)',
    fails: Object.keys(NEEDS_SETTLE),
    fixture: generated('unknown', { lagTurns: 3 }),
  },
  {
    // The authority stays undecided for ever, although the handle says that it decided.
    name: 'inspect answers unknown for ever although settle resolved',
    fails: [
      NAMES.SA3,
      NAMES.SA4,
      NAMES.SA5,
      NAMES.SA6,
      NAMES.SA7,
      NAMES.SA8,
      NAMES.SA9,
      NAMES.SA11,
      NAMES.SA15,
      NAMES.SA19,
    ],
    fixture: variant(() => ({
      inspect: () =>
        Promise.resolve(
          succeed<StartProgress>({ kind: 'unknown', diagnostic: 'the authority cannot tell' }),
        ),
    })),
  },
]

/** The methods of the port that take an access, and the case that checks another tenant on each. */
const CROSS_TENANT_BY_METHOD: Readonly<Record<keyof ToolStartAuthority<string>, string>> = {
  prepare: NAMES.SA19,
  consume: NAMES.SA16,
  inspect: NAMES.SA15,
  invalidate: NAMES.SA17,
  exclude: NAMES.SA18,
}

describe('ToolStartAuthority conformance suite', () => {
  const cases = toolStartAuthorityConformance<string>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolStartAuthorityFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, [...variants, ...resendRule, ...lateSettle])
  })

  itFailsExactly(cases, variants)

  itFailsExactly(cases, resendRule)

  itFailsExactly(cases, lateSettle)

  itPassesLegal(cases, legal)

  itPassesLegal(cases, legalWithoutSettle)

  itNeedsTheHandle(cases, {
    name: 'generated: every first answer of consume and inspect is unknown',
    handleName: 'settle',
    withHandle: generated('unknown'),
    without: generated('unknown', { settle: false }),
    spy: (fixture, used) => ({
      ...fixture,
      settle: async () => {
        used()
        await fixture.settle?.()
      },
    }),
  })

  it('has a cross-tenant case for every method that takes an access', async () => {
    for (const [method, name] of Object.entries(CROSS_TENANT_BY_METHOD))
      expect(
        cases.find(item => item.name === name),
        `${method} has no cross-tenant case`,
      ).toBeDefined()
    expect(new Set(Object.values(CROSS_TENANT_BY_METHOD)).size).toBe(
      Object.keys(CROSS_TENANT_BY_METHOD).length,
    )
  })

  it('masks every method of the table that has progress', () => {
    expect(maskedMethods(startAuthorityAnswers).sort()).toEqual(['consume', 'inspect'])
  })

  describe('a provider whose permit names no guard', () => {
    it('is still checked by the cases that need no guard, and the others are not applicable', async () => {
      const verdict = await judge(cases, guardless())
      expect(verdict.failed).toEqual([])
      expect(verdict.notApplicable).toEqual(NEEDS_GUARD)
      expect(verdict.passed).toEqual(Object.values(NAMES).filter(name => !(name in NEEDS_GUARD)))
    })

    it('has its cases that need no guard fail under a violation', async () => {
      await expectVariantVerdict(cases, {
        name: 'guardless, consume mints a fresh acceptance each time',
        fails: [NAMES.SA2, NAMES.SA3],
        notApplicable: NEEDS_GUARD,
        fixture: guardless(real => {
          let calls = 0
          return {
            consume: async input => {
              calls += 1
              const answer = await real.consume(input)
              if (calls === 1 || 'failure' in answer || answer.ok.kind !== 'started') return answer
              return succeed<StartProgress>({
                kind: 'started',
                acceptance: { ...answer.ok.acceptance, digest: `sha256:fresh-${calls}` },
              })
            },
          }
        }),
      })
    })

    it('does not make the permit of SA1 an error', async () => {
      const verdict = await judge([cases[0]!], guardless())
      expect(verdict.passed).toEqual([NAMES.SA1])
    })
  })

  describe('the access of a second tenant', () => {
    const CROSS_TENANT = [NAMES.SA15, NAMES.SA16, NAMES.SA17, NAMES.SA18, NAMES.SA19]

    it('is not applicable to the cross-tenant cases when the fixture has none', async () => {
      const bare = (): Fixture => {
        const { authority, access } = memoryToolStartAuthorityFixture()
        return { authority, access }
      }
      const verdict = await judge(cases, bare)
      expect(verdict.failed).toEqual([])
      expect(verdict.notApplicable).toEqual(
        Object.fromEntries(CROSS_TENANT.map(name => [name, 'otherAccess'])),
      )
    })

    it('must name another tenant, or the cross-tenant cases fail and say why', async () => {
      const same = (): Fixture => {
        const base = memoryToolStartAuthorityFixture()
        return { ...base, otherAccess: base.access }
      }
      const verdict = await judge(cases, same)
      expect([...verdict.failed].sort()).toEqual([...CROSS_TENANT].sort())
      for (const name of CROSS_TENANT)
        await expect(cases.find(item => item.name === name)!.run(same())).rejects.toThrow(
          /names one tenant twice/u,
        )
    })
  })
})
