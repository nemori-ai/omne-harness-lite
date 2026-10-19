// The violating variants of the cases that the decision bridge suite and the resource response
// suite share (P06), and the legal providers that those cases must let pass. A variant is the
// conforming double with one rule broken, laid over the calls that both ports have; each spec
// supplies how a laid variant becomes a fixture of its own port.
import { fail, succeed } from '@omne-harness/operation-result'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  decodeToolWaitId,
  type DurableEvidence,
  type ExternalOperationResolution,
  type Mutation,
  type ToolFailure,
  type ToolOperationId,
  type ToolWaitId,
} from '@omne-harness/tool-contract'
import type { Access } from '@omne-harness/tool-contract'
import { decisionBridgeAnswers } from '@omne-harness/tool-contract/testing'
import type { Variant } from './conformance-harness.ts'
import { externalGenerated, operationKey } from './external-association-legal.ts'
import { answersAnotherFinalDuringProgress, regressesAfterFinal } from './resend-violators.ts'
import { evidence } from './tool-values.ts'

/** The names of the shared cases, in the order of the suites. */
export const SHARED = {
  S1: 'a resent ensure returns the original registration',
  S2: 'inspect recalls the registration that ensure answered',
  S3: 'inspect claims no registration for a wait never ensured',
  S4: 'two waits of one call have two registrations',
  S5: 'a registration of one tenant is not recalled for another',
  S6: 'another tenant learns nothing of a registration by inspect',
  S7: 'another tenant learns nothing of an operation by inspectOperation',
  S8: 'another tenant cannot invalidate the registration of a tenant',
  S9: 'inspectOperation reports an applied ensure as committed',
  S10: 'inspectOperation claims nothing for an operation never sent',
  S11: 'a deferred operation stays pending until it lands',
  S12: 'an excluded operation is never applied after all',
  S13: 'a resent invalidation returns the original evidence',
  S14: 'a resent invalidation invalidates the registration once',
  S15: 'an invalidation invalidates the registration of its wait only',
  S16: 'an invalidation that arrives before the registration lands acts on the original registration',
  S17: 'inspect only reads and does not take a deferred invalidation as done',
  S18: 'an operation identity reused for another action is a conflict',
  S19: 'a refused reuse of an operation identity has no effect',
  S20: 'an operation identity reused for another wait is a conflict',
  S21: 'an invalidation identity reused for another wait is a conflict that changes nothing',
} as const

type Answer<T> = Promise<Outcome<T, ToolFailure>>
type Reply<T> = Answer<T>

/** The calls that both external-association ports have; the input of each is the common part. */
export interface ExternalPort {
  inspectOperation(input: Mutation<string>): Reply<ExternalOperationResolution>
  ensure(input: Mutation<string> & Readonly<{ wait: unknown }>): Reply<DurableEvidence>
  inspect(
    input: Access<string> & Readonly<{ call: Mutation<string>['call']; wait: ToolWaitId }>,
  ): Reply<Readonly<{ registration: DurableEvidence }>>
  invalidate(
    input: Mutation<string> & Readonly<{ wait: ToolWaitId; terminal: DurableEvidence }>,
  ): Reply<DurableEvidence>
}

export interface ExternalHandleOverrides {
  hold?(): void
  settle?(): Promise<void>
  excludeDeferred?(operation: ToolOperationId): Promise<void>
  invalidations?(): readonly DurableEvidence[]
}

export type Laid = Readonly<{ port?: Partial<ExternalPort>; handles?: ExternalHandleOverrides }>

/** The part of a fixture that the shared variants read. */
export interface ExternalBase {
  readonly access: Access<string>
  readonly otherAccess?: Access<string>
  hold?(): void
  settle?(): Promise<void>
  invalidations?(): readonly DurableEvidence[]
}

export type MakeVariant<F> = (build: (real: ExternalPort, base: F) => Laid) => () => F

function operation(text: string): ToolOperationId {
  const decoded = decodeToolOperationId(text)
  if ('failure' in decoded) throw new Error('the variant minted an illegal identity')
  return decoded.ok
}

function wait(text: string): ToolWaitId {
  const decoded = decodeToolWaitId(text)
  if ('failure' in decoded) throw new Error('the variant minted an illegal identity')
  return decoded.ok
}

const fresh = (value: DurableEvidence, turn: number): DurableEvidence => ({
  ...value,
  digest: `sha256:fresh-${turn}`,
})

const unknownOperation = (input: Mutation<string>): ExternalOperationResolution => ({
  kind: 'unknown',
  operation: input.operation,
  diagnostic: 'forgotten',
})

/** The tenant of `input` is not the tenant of the fixture. */
const isForeign = (input: { tenant: Access<string>['tenant'] }, base: ExternalBase): boolean =>
  JSON.stringify(input.tenant) !== JSON.stringify(base.access.tenant)

/** The same input as that of the own tenant: the provider keys without the tenant. */
const blind = <T extends { tenant: Access<string>['tenant'] }>(
  input: T,
  base: ExternalBase,
): T => ({
  ...input,
  tenant: base.access.tenant,
})

/**
 * A read for another tenant that answers `unknown`, as for an operation never seen, and names in
 * its diagnostic the receipt of the operation of the own tenant when there is one.
 */
async function leakingRead(
  real: ExternalPort,
  input: Mutation<string>,
  base: ExternalBase,
): Reply<ExternalOperationResolution> {
  const owned = await real.inspectOperation(blind(input, base))
  const told =
    'ok' in owned && owned.ok.kind === 'committed' ? JSON.stringify(owned.ok.receipt) : '-'
  return succeed({
    kind: 'unknown',
    operation: input.operation,
    diagnostic: `no such operation was seen; receipt of the tenant: ${told}`,
  })
}

/** How a foreign read hides what it tells of the record of the own tenant in its answer. */
type Telling = (receipt: DurableEvidence, base: ExternalBase) => object

/**
 * A read for another tenant that answers `unknown`, as for an operation never seen, and adds to
 * that answer the fields of `tell` when the operation of the own tenant is committed.
 */
async function tellingRead(
  real: ExternalPort,
  input: Mutation<string>,
  base: ExternalBase,
  tell: Telling,
): Reply<ExternalOperationResolution> {
  const owned = await real.inspectOperation(blind(input, base))
  const told = 'ok' in owned && owned.ok.kind === 'committed' ? tell(owned.ok.receipt, base) : {}
  const answer: ExternalOperationResolution = Object.assign(
    { kind: 'unknown' as const, operation: input.operation, diagnostic: 'no such operation' },
    told,
  )
  return succeed(answer)
}

/** The ways of hiding the record or the tenant in a foreign answer that the S7 case must find. */
const TELLINGS: readonly Readonly<{ name: string; tell: Telling }>[] = [
  {
    name: 'a foreign inspectOperation answers unknown and names the tenant as a TenantId',
    tell: (_receipt, base) => ({ owner: base.access.tenant }),
  },
  {
    name: 'a foreign inspectOperation answers unknown and names the account of the tenant in its diagnostic',
    tell: (_receipt, base) => ({ diagnostic: `held by ${base.access.tenant.account.text}` }),
  },
  {
    name: 'a foreign inspectOperation answers unknown and names the receipt as an object key',
    tell: receipt => ({ seen: { [receipt.record]: true } }),
  },
  {
    name: 'a foreign inspectOperation answers unknown and names the receipt as a Map key',
    tell: receipt => ({ seen: new Map([[receipt.record, true]]) }),
  },
  {
    name: 'a foreign inspectOperation answers unknown and names the receipt in an Error message',
    tell: receipt => ({ cause: new Error(`held as ${receipt.record}`) }),
  },
  {
    name: 'a foreign inspectOperation answers unknown and names the receipt under a symbol key',
    tell: receipt => ({ [Symbol('held')]: receipt.record }),
  },
]

const refusal = <T>(): Outcome<T, ToolFailure> =>
  fail({ kind: 'invalid', field: 'wait', reason: 'no registration of this wait' })

type Blanked = 'owner' | 'record' | 'digest'
const FIELDS: readonly Blanked[] = ['owner', 'record', 'digest']
const blanked = (value: DurableEvidence, field: Blanked): DurableEvidence => ({
  ...value,
  [field]: '',
})

/** The variants of the shared cases, each with the cases that it must make fail. */
export function externalVariants<F extends ExternalBase>(
  make: MakeVariant<F>,
  also: Readonly<Record<string, readonly string[]>> = {},
): readonly Variant<F>[] {
  const lost = (input: Mutation<string>): Outcome<DurableEvidence, ToolFailure> =>
    fail({ kind: 'commit-unknown', operation: input.operation })
  const variants: readonly Variant<F>[] = [
    {
      // once an ensure was answered, a resend goes back to the lost reply.
      name: 'a resent ensure goes back from the registration to a lost reply',
      fails: [SHARED.S1],
      fixture: make(real => ({
        port: {
          ensure: regressesAfterFinal(
            { row: decisionBridgeAnswers.ensure, key: operationKey, progress: lost },
            input => real.ensure(input),
          ),
        },
      })),
    },
    {
      name: 'a resent invalidation goes back from the evidence to a lost reply',
      fails: [SHARED.S13, SHARED.S14, SHARED.S16],
      fixture: make(real => ({
        port: {
          invalidate: regressesAfterFinal(
            { row: decisionBridgeAnswers.invalidate, key: operationKey, progress: lost },
            input => real.invalidate(input),
          ),
        },
      })),
    },
    {
      // the generated provider with the resend of an ensure during its lost reply replaced.
      name: 'a resend of an ensure during its lost reply answers another registration than the one that lands',
      fails: [
        SHARED.S1,
        SHARED.S2,
        SHARED.S4,
        SHARED.S5,
        SHARED.S6,
        SHARED.S7,
        SHARED.S8,
        SHARED.S9,
        SHARED.S13,
        SHARED.S14,
        SHARED.S15,
        SHARED.S17,
        SHARED.S18,
        SHARED.S19,
        SHARED.S20,
        SHARED.S21,
      ],
      fixture: externalGenerated(make, decisionBridgeAnswers, 'commit-unknown', {
        wrap: port => ({
          ...port,
          ensure: answersAnotherFinalDuringProgress(
            {
              row: decisionBridgeAnswers.ensure,
              key: operationKey,
              other: () => succeed(evidence('registration/early')),
            },
            input => port.ensure!(input),
          ),
        }),
      }),
    },
    {
      name: 'a resend of an invalidation during its lost reply answers another evidence than the one that lands',
      fails: [SHARED.S13, SHARED.S14, SHARED.S15, SHARED.S21],
      fixture: externalGenerated(make, decisionBridgeAnswers, 'commit-unknown', {
        wrap: port => ({
          ...port,
          invalidate: answersAnotherFinalDuringProgress(
            {
              row: decisionBridgeAnswers.invalidate,
              key: operationKey,
              other: () => succeed(evidence('invalidation/early')),
            },
            input => port.invalidate!(input),
          ),
        }),
      }),
    },
    {
      // The invalidation that was sent before the registration landed is not what the operation
      // finally was: its original operation is reported as excluded, though it was carried out.
      name: 'inspectOperation answers excluded for an invalidation that arrived before the registration landed',
      fails: [SHARED.S16],
      fixture: make((real, base) => {
        let ensureLost = false
        const early = new Set<string>()
        return {
          handles: { hold: () => base.hold?.() },
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if ('failure' in answer && answer.failure.kind === 'commit-unknown') ensureLost = true
              return answer
            },
            invalidate: input => {
              if (ensureLost) early.add(input.operation)
              return real.invalidate(input)
            },
            inspectOperation: async input => {
              const answer = await real.inspectOperation(input)
              return 'ok' in answer && answer.ok.kind === 'committed' && early.has(input.operation)
                ? succeed<ExternalOperationResolution>({
                    kind: 'excluded',
                    operation: input.operation,
                    exclusion: answer.ok.receipt,
                  })
                : answer
            },
          },
        }
      }),
    },
    {
      name: 'a resent ensure answers a fresh registration',
      fails: [SHARED.S1],
      fixture: make(real => {
        const answers = new Map<string, number>()
        return {
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if ('failure' in answer) return answer
              const turn = (answers.get(input.operation) ?? 0) + 1
              answers.set(input.operation, turn)
              return turn === 1 ? answer : succeed(fresh(answer.ok, turn))
            },
          },
        }
      }),
    },
    {
      // Ensures of one operation that meet in flight apply twice and answer distinct registrations.
      name: 'concurrent ensures of one operation answer distinct registrations',
      fails: [SHARED.S1],
      fixture: make(real => {
        let inflight = 0
        let turn = 0
        return {
          port: {
            ensure: async input => {
              inflight += 1
              const crowded = inflight > 1
              await Promise.resolve()
              const answer = await real.ensure(input)
              inflight -= 1
              turn += 1
              return crowded && 'ok' in answer ? succeed(fresh(answer.ok, turn)) : answer
            },
          },
        }
      }),
    },
    ...FIELDS.map((field): Variant<F> => ({
      name: `the registration has no ${field} of its evidence`,
      fails: [
        SHARED.S1,
        SHARED.S7,
        SHARED.S14,
        SHARED.S15,
        SHARED.S16,
        SHARED.S17,
        SHARED.S18,
        SHARED.S21,
      ],
      fixture: make(real => ({
        port: {
          ensure: async input => {
            const answer = await real.ensure(input)
            return 'failure' in answer ? answer : succeed(blanked(answer.ok, field))
          },
          inspect: async input => {
            const answer = await real.inspect(input)
            return 'failure' in answer
              ? answer
              : succeed({ ...answer.ok, registration: blanked(answer.ok.registration, field) })
          },
        },
      })),
    })),
    {
      name: 'inspect answers another registration',
      fails: [
        SHARED.S2,
        SHARED.S4,
        SHARED.S5,
        SHARED.S6,
        SHARED.S8,
        SHARED.S11,
        SHARED.S16,
        SHARED.S17,
        SHARED.S20,
      ],
      fixture: make(real => ({
        port: {
          inspect: async input => {
            const answer = await real.inspect(input)
            return 'failure' in answer
              ? answer
              : succeed({ ...answer.ok, registration: fresh(answer.ok.registration, 1) })
          },
        },
      })),
    },
    {
      // Every wait of the call is inspected as the first wait that was registered.
      name: 'inspect ignores which wait of the call is asked',
      fails: [SHARED.S4, SHARED.S20],
      fixture: make(real => ({
        port: {
          inspect: input => real.inspect({ ...input, wait: wait('wait-1') }),
        },
      })),
    },
    {
      name: 'inspect fabricates a registration for a wait never ensured',
      fails: [SHARED.S3, SHARED.S6, SHARED.S12, SHARED.S20],
      fixture: make(real => ({
        port: {
          inspect: async input => {
            const answer = await real.inspect(input)
            return 'ok' in answer ? answer : succeed({ registration: evidence('fabricated') })
          },
        },
      })),
    },
    {
      // Every wait of the call recalls the registration of the first one.
      name: 'the waits of one call share one registration',
      fails: [SHARED.S4, SHARED.S5],
      fixture: make(real => {
        let first: DurableEvidence | null = null
        return {
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if ('failure' in answer) return answer
              first ??= answer.ok
              return succeed(first)
            },
          },
        }
      }),
    },
    {
      // The ensure of another tenant recalls the registration of the first one.
      name: 'ensure ignores the tenant',
      fails: [SHARED.S5],
      fixture: make((real, base) => ({
        port: { ensure: input => real.ensure(blind(input, base)) },
      })),
    },
    {
      name: 'a foreign ensure makes the registration of the tenant forgotten',
      fails: [SHARED.S5],
      fixture: make((real, base) => {
        let forgotten = false
        return {
          port: {
            ensure: input => {
              if (isForeign(input, base)) forgotten = true
              return real.ensure(input)
            },
            inspect: input =>
              forgotten && !isForeign(input, base)
                ? Promise.resolve(refusal())
                : real.inspect(input),
          },
        }
      }),
    },
    {
      name: 'inspect ignores the tenant',
      fails: [SHARED.S6],
      fixture: make((real, base) => ({
        port: { inspect: input => real.inspect(blind(input, base)) },
      })),
    },
    {
      // The failure for a registration of another tenant is `denied`: it tells that it exists.
      name: 'a foreign inspect is denied when the registration exists',
      fails: [SHARED.S6],
      fixture: make((real, base) => ({
        port: {
          inspect: async input => {
            const answer = await real.inspect(input)
            if (!isForeign(input, base) || 'ok' in answer) return answer
            const own = await real.inspect(blind(input, base))
            return 'ok' in own ? fail({ kind: 'denied', action: 'read' }) : answer
          },
        },
      })),
    },
    {
      name: 'a foreign inspect makes the registration of the tenant forgotten',
      fails: [SHARED.S6],
      fixture: make((real, base) => {
        let forgotten = false
        return {
          port: {
            inspect: input => {
              if (isForeign(input, base)) forgotten = true
              return forgotten && !isForeign(input, base)
                ? Promise.resolve(refusal())
                : real.inspect(input)
            },
          },
        }
      }),
    },
    {
      name: 'inspectOperation ignores the tenant',
      fails: [SHARED.S7],
      fixture: make((real, base) => ({
        port: { inspectOperation: input => real.inspectOperation(blind(input, base)) },
      })),
    },
    {
      // A foreign question about an operation that exists is answered pending, not unknown.
      name: 'a foreign inspectOperation answers pending when the operation exists',
      fails: [SHARED.S7],
      fixture: make((real, base) => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            if (!isForeign(input, base) || 'failure' in answer) return answer
            const own = await real.inspectOperation(blind(input, base))
            return 'ok' in own && own.ok.kind === 'committed'
              ? succeed<ExternalOperationResolution>({
                  kind: 'pending',
                  operation: input.operation,
                  diagnostic: 'the operation is deferred',
                })
              : answer
          },
        },
      })),
    },
    {
      name: 'a foreign inspectOperation is denied when the operation exists',
      fails: [SHARED.S7],
      fixture: make((real, base) => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            if (!isForeign(input, base) || 'failure' in answer) return answer
            const own = await real.inspectOperation(blind(input, base))
            return 'ok' in own && own.ok.kind === 'committed'
              ? fail({ kind: 'denied', action: 'read' })
              : answer
          },
        },
      })),
    },
    {
      name: 'a foreign inspectOperation makes the operation of the tenant forgotten',
      fails: [SHARED.S7],
      fixture: make((real, base) => {
        let forgotten = false
        return {
          port: {
            inspectOperation: input => {
              if (isForeign(input, base)) forgotten = true
              return forgotten && !isForeign(input, base)
                ? Promise.resolve(succeed(unknownOperation(input)))
                : real.inspectOperation(input)
            },
          },
        }
      }),
    },
    {
      // The foreign read answers the kind that a ghost operation gets, and tells the receipt of
      // the tenant in its diagnostic: only the identifying values of the record catch it.
      name: 'a foreign inspectOperation answers unknown and names the receipt of the tenant',
      fails: [SHARED.S7],
      fixture: make((real, base) => ({
        port: {
          inspectOperation: input =>
            isForeign(input, base) ? leakingRead(real, input, base) : real.inspectOperation(input),
        },
      })),
    },
    {
      // The same leak, after a first answer that is pending until settle.
      name: 'a foreign inspectOperation is pending until settle, then names the receipt of the tenant',
      fails: [SHARED.S7],
      fixture: make((real, base) => {
        let settled = false
        return {
          handles: {
            settle: async () => {
              await base.settle?.()
              settled = true
            },
          },
          port: {
            inspectOperation: input => {
              if (!isForeign(input, base)) return real.inspectOperation(input)
              if (settled) return leakingRead(real, input, base)
              return Promise.resolve(
                succeed<ExternalOperationResolution>({
                  kind: 'pending',
                  operation: input.operation,
                  diagnostic: 'the read model lags',
                }),
              )
            },
          },
        }
      }),
    },
    // The same leak, told as the tenant itself or hidden where only a key, a member of a Map or of
    // an Error, or a symbol key holds it.
    ...TELLINGS.map(({ name, tell }): Variant<F> => ({
      name,
      fails: [SHARED.S7],
      fixture: make((real, base) => ({
        port: {
          inspectOperation: input =>
            isForeign(input, base)
              ? tellingRead(real, input, base, tell)
              : real.inspectOperation(input),
        },
      })),
    })),
    {
      // The read model lags, so every inspectOperation answers pending (a progress kind of the
      // table) until settle; after it, the read ignores the tenant. The first answers of the real
      // and of the ghost operation agree, the later ones do not.
      name: 'inspectOperation answers pending until settle, then ignores the tenant',
      fails: [SHARED.S7],
      fixture: make((real, base) => {
        let settled = false
        return {
          handles: {
            settle: async () => {
              await base.settle?.()
              settled = true
            },
          },
          port: {
            inspectOperation: input =>
              settled
                ? real.inspectOperation(blind(input, base))
                : Promise.resolve(
                    succeed<ExternalOperationResolution>({
                      kind: 'pending',
                      operation: input.operation,
                      diagnostic: 'the read model lags',
                    }),
                  ),
          },
        }
      }),
    },
    {
      // The invalidation of another tenant reaches the registration of the first one.
      name: 'invalidate ignores the tenant',
      fails: [SHARED.S8],
      fixture: make((real, base) => ({
        port: { invalidate: input => real.invalidate(blind(input, base)) },
      })),
    },
    {
      name: 'a foreign invalidate is denied when the registration exists',
      fails: [SHARED.S8],
      fixture: make((real, base) => ({
        port: {
          invalidate: async input => {
            if (!isForeign(input, base)) return real.invalidate(input)
            const own = await real.inspect({ ...blind(input, base), call: input.call })
            return 'ok' in own ? fail({ kind: 'denied', action: 'read' }) : real.invalidate(input)
          },
        },
      })),
    },
    {
      name: 'a foreign invalidate makes the registration of the tenant forgotten',
      fails: [SHARED.S8],
      fixture: make((real, base) => {
        let forgotten = false
        return {
          port: {
            invalidate: input => {
              if (isForeign(input, base)) forgotten = true
              return real.invalidate(input)
            },
            inspect: input =>
              forgotten && !isForeign(input, base)
                ? Promise.resolve(refusal())
                : real.inspect(input),
          },
        }
      }),
    },
    {
      name: 'inspectOperation does not know an applied ensure',
      fails: [
        SHARED.S7,
        SHARED.S9,
        SHARED.S11,
        SHARED.S12,
        SHARED.S13,
        SHARED.S16,
        SHARED.S18,
        SHARED.S21,
      ],
      fixture: make(() => ({
        port: { inspectOperation: input => Promise.resolve(succeed(unknownOperation(input))) },
      })),
    },
    {
      // A commit that names another operation than the one that was asked about.
      name: 'inspectOperation names another operation in a commit',
      fails: [SHARED.S9],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer && answer.ok.kind === 'committed'
              ? succeed<ExternalOperationResolution>({
                  ...answer.ok,
                  operation: operation('some-other-operation'),
                })
              : answer
          },
        },
      })),
    },
    ...FIELDS.map((field): Variant<F> => ({
      name: `the receipt of a commit has no ${field} of its evidence`,
      fails: [SHARED.S7, SHARED.S9, SHARED.S18],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer &&
              answer.ok.kind === 'committed' &&
              input.operation === 'ensure-1'
              ? succeed<ExternalOperationResolution>({
                  ...answer.ok,
                  receipt: blanked(answer.ok.receipt, field),
                })
              : answer
          },
        },
      })),
    })),
    {
      name: 'inspectOperation fabricates a commit for an operation never sent',
      fails: [SHARED.S10],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            if ('ok' in answer && answer.ok.kind !== 'unknown') return answer
            return succeed<ExternalOperationResolution>({
              kind: 'committed',
              operation: input.operation,
              receipt: evidence('fabricated'),
            })
          },
        },
      })),
    },
    {
      // An operation that was never seen is excluded as a fence, and then it is applied after all.
      name: 'an operation that was excluded as a fence is applied after all',
      fails: [SHARED.S10],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer && answer.ok.kind === 'unknown'
              ? succeed<ExternalOperationResolution>({
                  kind: 'excluded',
                  operation: input.operation,
                  exclusion: evidence('fence'),
                })
              : answer
          },
        },
      })),
    },
    {
      // The fence refuses the operation, but the registration of its wait is written all the same.
      name: 'an operation that was excluded as a fence still registers its wait',
      fails: [SHARED.S10],
      fixture: make(real => {
        const fenced = new Set<string>()
        return {
          port: {
            inspectOperation: async input => {
              const answer = await real.inspectOperation(input)
              if ('ok' in answer && answer.ok.kind === 'unknown') {
                fenced.add(input.operation)
                return succeed<ExternalOperationResolution>({
                  kind: 'excluded',
                  operation: input.operation,
                  exclusion: evidence('fence'),
                })
              }
              return answer
            },
            ensure: async input => {
              if (!fenced.has(input.operation)) return real.ensure(input)
              await real.ensure(input)
              return fail({ kind: 'conflict', operation: input.operation })
            },
          },
        }
      }),
    },
    {
      name: 'inspectOperation reports a deferred operation as committed',
      fails: [SHARED.S11, SHARED.S17],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            if ('failure' in answer || answer.ok.kind !== 'pending') return answer
            return succeed<ExternalOperationResolution>({
              kind: 'committed',
              operation: input.operation,
              receipt: evidence('assumed'),
            })
          },
        },
      })),
    },
    {
      name: 'an excluded operation lands after all',
      fails: [SHARED.S12],
      fixture: make(() => ({ handles: { excludeDeferred: () => Promise.resolve() } })),
    },
    {
      name: 'the exclusion of a deferred operation has no digest',
      fails: [SHARED.S12],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer && answer.ok.kind === 'excluded'
              ? succeed<ExternalOperationResolution>({
                  ...answer.ok,
                  exclusion: blanked(answer.ok.exclusion, 'digest'),
                })
              : answer
          },
        },
      })),
    },
    {
      name: 'a resent invalidation answers fresh evidence',
      fails: [SHARED.S13, SHARED.S14],
      fixture: make(real => {
        let answers = 0
        return {
          port: {
            invalidate: async input => {
              const answer = await real.invalidate(input)
              if ('failure' in answer) return answer
              answers += 1
              return answers === 1 ? answer : succeed(fresh(answer.ok, answers))
            },
          },
        }
      }),
    },
    {
      // The receipt that inspectOperation gives for an invalidation is not the evidence it answered.
      name: 'inspectOperation answers another receipt for an invalidation',
      fails: [SHARED.S13, SHARED.S21],
      fixture: make(real => ({
        port: {
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer &&
              answer.ok.kind === 'committed' &&
              input.operation.startsWith('invalidate')
              ? succeed<ExternalOperationResolution>({
                  ...answer.ok,
                  receipt: fresh(answer.ok.receipt, 1),
                })
              : answer
          },
        },
      })),
    },
    {
      name: 'the evidence of an invalidation has no digest',
      fails: [SHARED.S13],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            const answer = await real.invalidate(input)
            return 'failure' in answer ? answer : succeed(blanked(answer.ok, 'digest'))
          },
          inspectOperation: async input => {
            const answer = await real.inspectOperation(input)
            return 'ok' in answer &&
              answer.ok.kind === 'committed' &&
              input.operation.startsWith('invalidate')
              ? succeed<ExternalOperationResolution>({
                  ...answer.ok,
                  receipt: blanked(answer.ok.receipt, 'digest'),
                })
              : answer
          },
        },
      })),
    },
    {
      name: 'every registration is invalidated twice',
      fails: [SHARED.S14, SHARED.S15, SHARED.S16, SHARED.S17, SHARED.S21],
      fixture: make((_real, base) => ({
        handles: {
          invalidations: () => {
            const once = base.invalidations?.() ?? []
            return [...once, ...once]
          },
        },
      })),
    },
    {
      // The invalidation reaches every wait of the call, not only the wait that it names.
      // The extra invalidation is a new operation, so it takes the deferral meant for the first.
      name: 'an invalidation also invalidates another wait of the call',
      fails: [SHARED.S15, SHARED.S17, SHARED.S21],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            await real.invalidate({
              ...input,
              operation: operation(`${input.operation}-other`),
              wait: wait('wait-2'),
            })
            return real.invalidate(input)
          },
        },
      })),
    },
    {
      // The provider records an early invalidation as done, and never carries it out.
      name: 'an invalidation that arrives early is forgotten',
      fails: [SHARED.S16],
      fixture: make(real => {
        const forgotten = new Map<string, DurableEvidence>()
        return {
          port: {
            invalidate: async input => {
              const remembered = forgotten.get(input.operation)
              if (remembered !== undefined) return succeed(remembered)
              const known = await real.inspect({ ...input })
              if ('ok' in known) return real.invalidate(input)
              const lost = evidence(`forgotten/${input.operation}`)
              forgotten.set(input.operation, lost)
              return succeed(lost)
            },
          },
        }
      }),
    },
    {
      // The provider carries out a deferred invalidation when it reads the registration, and
      // goes on reporting the operation as pending.
      name: 'inspect invalidates the registration it reads',
      fails: [SHARED.S17],
      fixture: make((real, base) => {
        let read: DurableEvidence | null = null
        return {
          port: {
            inspect: async input => {
              const answer = await real.inspect(input)
              if ('ok' in answer) read = answer.ok.registration
              return answer
            },
          },
          handles: {
            invalidations: () => {
              const once = base.invalidations?.() ?? []
              return read === null || once.some(item => item.digest === read?.digest)
                ? once
                : [...once, read]
            },
          },
        }
      }),
    },
    {
      name: 'inspect lands the deferred operations',
      fails: [SHARED.S17],
      fixture: make((real, base) => ({
        port: {
          inspect: async input => {
            await base.settle?.()
            return real.inspect(input)
          },
        },
      })),
    },
    {
      // The ledger knows an operation by its identity alone: another action under the same
      // identity answers the receipt of the first one and does nothing.
      name: 'a reused operation identity answers the receipt of the first action',
      fails: [SHARED.S18, SHARED.S19, SHARED.S20, SHARED.S21],
      fixture: make(real => {
        const answered = new Map<string, Outcome<DurableEvidence, ToolFailure>>()
        const keyOf = (input: Mutation<string>): string =>
          JSON.stringify([input.tenant, input.call, input.operation])
        const keep =
          <I extends Mutation<string>>(method: (input: I) => Answer<DurableEvidence>) =>
          async (input: I): Answer<DurableEvidence> => {
            const known = answered.get(keyOf(input))
            if (known !== undefined) return known
            const answer = await method(input)
            if ('ok' in answer) answered.set(keyOf(input), answer)
            return answer
          }
        return {
          port: {
            ensure: keep(input => real.ensure(input)),
            invalidate: keep(input => real.invalidate(input)),
          },
        }
      }),
    },
    {
      // The conflict is answered, and the refused invalidation is carried out all the same.
      name: 'a conflicting reuse of an operation identity is still carried out',
      fails: [SHARED.S19, SHARED.S21],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            const answer = await real.invalidate(input)
            if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
            await real.invalidate({ ...input, operation: operation(`${input.operation}-forced`) })
            return answer
          },
        },
      })),
    },
    {
      // The refused action overwrites the receipt that the operation answers afterwards.
      name: 'a conflicting reuse of an operation identity overwrites its receipt',
      fails: [SHARED.S18, SHARED.S21],
      fixture: make(real => {
        const overwritten = new Set<string>()
        return {
          port: {
            invalidate: async input => {
              const answer = await real.invalidate(input)
              if ('failure' in answer && answer.failure.kind === 'conflict')
                overwritten.add(input.operation)
              return answer
            },
            inspectOperation: async input => {
              const answer = await real.inspectOperation(input)
              return overwritten.has(input.operation) &&
                'ok' in answer &&
                answer.ok.kind === 'committed'
                ? succeed<ExternalOperationResolution>({
                    ...answer.ok,
                    receipt: evidence('overwritten'),
                  })
                : answer
            },
          },
        }
      }),
    },
    {
      // Another wait under the same identity is answered with the first registration, which is
      // then also the answer of an inspect of the second wait.
      name: 'a reused operation identity answers the registration of the first wait',
      fails: [SHARED.S20],
      fixture: make(real => {
        const first = new Map<string, DurableEvidence>()
        const keyOf = (input: Mutation<string>): string =>
          JSON.stringify([input.tenant, input.call, input.operation])
        return {
          port: {
            ensure: async input => {
              const known = first.get(keyOf(input))
              if (known !== undefined) return succeed(known)
              const answer = await real.ensure(input)
              if ('ok' in answer) first.set(keyOf(input), answer.ok)
              return answer
            },
          },
        }
      }),
    },
    {
      // The conflict is answered, and the refused ensure registers its wait all the same.
      name: 'a conflicting reuse of an operation identity still registers the other wait',
      fails: [SHARED.S20],
      fixture: make(real => ({
        port: {
          ensure: async input => {
            const answer = await real.ensure(input)
            if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
            await real.ensure({ ...input, operation: operation(`${input.operation}-forced`) })
            return answer
          },
        },
      })),
    },
    {
      // The input of an invalidation is not compared: another wait under the same identity is
      // answered the evidence of the first, and nothing is refused.
      name: 'a reused invalidation identity for another wait answers the first evidence',
      fails: [SHARED.S21],
      fixture: make(real => {
        const first = new Map<string, DurableEvidence>()
        const keyOf = (input: Mutation<string>): string =>
          JSON.stringify([input.tenant, input.call, input.operation])
        return {
          port: {
            invalidate: async input => {
              const known = first.get(keyOf(input))
              if (known !== undefined) return succeed(known)
              const answer = await real.invalidate(input)
              if ('ok' in answer) first.set(keyOf(input), answer.ok)
              return answer
            },
          },
        }
      }),
    },
    {
      // The conflict is answered, and the refused invalidation is carried out on the other wait.
      name: 'a conflicting reuse of an invalidation identity still invalidates the other wait',
      fails: [SHARED.S19, SHARED.S21],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            const answer = await real.invalidate(input)
            if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
            await real.invalidate({ ...input, operation: operation(`${input.operation}-forced`) })
            return answer
          },
        },
      })),
    },
    {
      name: 'a reused invalidation identity for another wait is refused as invalid',
      fails: [SHARED.S18, SHARED.S21],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            const answer = await real.invalidate(input)
            return 'failure' in answer && answer.failure.kind === 'conflict'
              ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
              : answer
          },
        },
      })),
    },
    {
      // Under a hold the ensure is not applied, yet its reply is a registration: it claims a commit.
      name: 'a deferred ensure answers a registration',
      fails: [SHARED.S11],
      fixture: make((real, base) => {
        let held = false
        return {
          handles: {
            hold: () => {
              held = true
              base.hold?.()
            },
          },
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if (!held || 'ok' in answer) return answer
              held = false
              return succeed(evidence('claimed'))
            },
          },
        }
      }),
    },
    {
      // A resend that comes alone is answered another registration; resends that meet recall it.
      name: 'a resend that comes alone answers another registration',
      fails: [SHARED.S1, SHARED.S11, SHARED.S16],
      fixture: make(real => {
        const calls = new Map<string, number>()
        let inflight = 0
        return {
          port: {
            ensure: async input => {
              const turn = (calls.get(input.operation) ?? 0) + 1
              calls.set(input.operation, turn)
              inflight += 1
              let met = inflight > 1
              await Promise.resolve()
              met ||= inflight > 1
              const answer = await real.ensure(input)
              inflight -= 1
              return turn >= 2 && !met && 'ok' in answer ? succeed(fresh(answer.ok, turn)) : answer
            },
          },
        }
      }),
    },
    {
      // The waits of one call share one registration, as ensure and as inspect alike.
      name: 'the waits of one call share one registration for ensure and inspect alike',
      fails: [SHARED.S4],
      fixture: make(real => {
        const first = new Map<string, DurableEvidence>()
        const key = (input: { tenant: Access<string>['tenant'] }): string =>
          JSON.stringify(input.tenant)
        return {
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if ('failure' in answer) return answer
              if (!first.has(key(input))) first.set(key(input), answer.ok)
              return succeed(first.get(key(input))!)
            },
            inspect: async input => {
              const answer = await real.inspect(input)
              const shared = first.get(key(input))
              return 'failure' in answer || shared === undefined
                ? answer
                : succeed({ ...answer.ok, registration: shared })
            },
          },
        }
      }),
    },
    {
      // Once the call has two registrations, the first wait is inspected as another registration.
      name: 'inspect answers another registration for the first wait of two',
      fails: [SHARED.S4],
      fixture: make(real => {
        const ensured = new Set<string>()
        return {
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if ('ok' in answer) ensured.add(JSON.stringify(input.wait))
              return answer
            },
            inspect: async input => {
              const answer = await real.inspect(input)
              return 'failure' in answer || ensured.size < 2 || input.wait !== 'wait-1'
                ? answer
                : succeed({ ...answer.ok, registration: fresh(answer.ok.registration, 1) })
            },
          },
        }
      }),
    },
    {
      name: 'a reused operation identity for another action is refused as invalid',
      fails: [SHARED.S18, SHARED.S21],
      fixture: make(real => ({
        port: {
          invalidate: async input => {
            const answer = await real.invalidate(input)
            return 'failure' in answer && answer.failure.kind === 'conflict'
              ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
              : answer
          },
        },
      })),
    },
    {
      name: 'a reused operation identity for another wait is refused as invalid',
      fails: [SHARED.S20],
      fixture: make(real => ({
        port: {
          ensure: async input => {
            const answer = await real.ensure(input)
            return 'failure' in answer && answer.failure.kind === 'conflict'
              ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
              : answer
          },
        },
      })),
    },
    ...[1, 2].map((turn): Variant<F> => ({
      name: `inspect answers another registration while an invalidation is deferred, ask ${turn}`,
      fails: [SHARED.S17],
      fixture: make((real, base) => {
        let held = false
        let ensuredBefore = false
        let invalidatedWhileHeld = false
        let asks = 0
        return {
          handles: {
            hold: () => {
              held = true
              base.hold?.()
            },
          },
          port: {
            ensure: async input => {
              const answer = await real.ensure(input)
              if (!held && 'ok' in answer) ensuredBefore = true
              return answer
            },
            invalidate: input => {
              if (held) invalidatedWhileHeld = true
              return real.invalidate(input)
            },
            inspect: async input => {
              const answer = await real.inspect(input)
              if (!held || !ensuredBefore || !invalidatedWhileHeld || 'failure' in answer)
                return answer
              asks += 1
              return asks === turn
                ? succeed({ ...answer.ok, registration: fresh(answer.ok.registration, turn) })
                : answer
            },
          },
        }
      }),
    })),
  ]
  return variants.map(variant => ({
    ...variant,
    fails: [...variant.fails, ...(also[variant.name] ?? [])],
  }))
}
