// Self-proof of the ToolResourceResponses suite: it passes on the conforming double, each case
// fails under a violating variant that breaks the rule of that case, and a fixture without control
// handles reports the cases that need them as not applicable. The variants of the cases that the
// decision bridge suite shares are in external-association-variants.ts.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  memoryToolResourceResponsesFixture,
  resourceResponsesAnswers,
  toolResourceResponsesConformance,
  type ToolResourceResponsesFixture,
} from '@omne-harness/tool-contract/testing'
import type { ToolResourceResponses } from '@omne-harness/tool-contract/provider'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  later,
  resolvesEarly,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { externalGenerated, operationKey } from './external-association-legal.ts'
import { externalVariants, SHARED, type ExternalPort } from './external-association-variants.ts'
import {
  generated,
  makeShared,
  MUTATORS,
  oneTenant,
  sharedLegal,
} from './resource-responses-legal.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import { answersAnotherFinalDuringProgress, regressesAfterFinal } from './resend-violators.ts'
import { evidence } from './tool-values.ts'
import { decodeToolOperationId, type DurableEvidence } from '@omne-harness/tool-contract'

const FAR = '2099-12-31T23:59:59.000Z'

const operationOf = (text: string) => {
  const decoded = decodeToolOperationId(text)
  if ('failure' in decoded) throw new Error('the variant minted an illegal identity')
  return decoded.ok
}

const NAMES = {
  ...SHARED,
  RX1: 'inspect shows no response before the owner answers',
  RX2: 'inspect shows the response that the owner gave',
  RX3: 'resolve returns the resource value that the owner gave',
  RX4: 'resolve refuses a response that was never given',
  RX5: 'expire is refused while the deadline is not reached',
  RX6: 'expire at the deadline gives an expiry that resolves as expired',
  RX7: 'a resent expire returns the original expiry',
  RX8: 'expire is refused when an earlier response exists',
  RX9: 'expire never expires a wait that has no deadline',
  RX10: 'expire is unsupported when the contract forbids expiry',
  RX11: 'an expire whose reply was lost is recalled by its operation',
  RX12: 'expire judges the deadline that the wait was registered with',
  RX13: 'expire judges the expiry support that the wait was registered with',
  RX14: 'another tenant cannot resolve the response of a tenant',
  RX15: 'another tenant cannot expire the wait of a tenant',
  RX16: 'an expire identity reused for another wait is a conflict that changes nothing',
} as const

type Fixture = ToolResourceResponsesFixture<string>
type Responses = ToolResourceResponses<string>
type Handles = Partial<
  Pick<Fixture, 'excludeDeferred' | 'invalidations' | 'respond' | 'reachDeadline'>
>

/** A fixture whose responses are the double with `responses` laid over it and `handles` replaced. */
function responsesVariant(
  build: (
    real: Responses,
    base: Fixture,
  ) => Readonly<{ responses?: Partial<Responses>; handles?: Handles }>,
): () => Fixture {
  return () => {
    const base = memoryToolResourceResponsesFixture()
    const laid = build(base.responses, base)
    return { ...base, ...laid.handles, responses: { ...base.responses, ...laid.responses } }
  }
}

const variants: readonly Variant<Fixture>[] = [
  ...externalVariants(makeShared, {
    'inspect answers another registration': [
      NAMES.RX1,
      NAMES.RX2,
      NAMES.RX5,
      NAMES.RX6,
      NAMES.RX8,
      NAMES.RX9,
      NAMES.RX11,
      NAMES.RX12,
      NAMES.RX13,
      NAMES.RX15,
      NAMES.RX16,
    ],
    ...Object.fromEntries(
      ['owner', 'record', 'digest'].map(field => [
        `the registration has no ${field} of its evidence`,
        [NAMES.RX6, NAMES.RX7, NAMES.RX10, NAMES.RX11, NAMES.RX13, NAMES.RX15, NAMES.RX16],
      ]),
    ),
    'inspectOperation does not know an applied ensure': [NAMES.RX7, NAMES.RX11, NAMES.RX16],
    'inspect ignores which wait of the call is asked': [NAMES.RX16],
    'the waits of one call share one registration': [NAMES.RX16],
    'the waits of one call share one registration for ensure and inspect alike': [NAMES.RX16],
    'inspectOperation fabricates a commit for an operation never sent': [NAMES.RX5],
    'inspectOperation reports a deferred operation as committed': [NAMES.RX11],
    // Every case that registers a wait first reads the ensure that answered a lost reply.
    'a resend of an ensure during its lost reply answers another registration than the one that lands':
      [
        NAMES.RX1,
        NAMES.RX2,
        NAMES.RX3,
        NAMES.RX4,
        NAMES.RX5,
        NAMES.RX6,
        NAMES.RX7,
        NAMES.RX8,
        NAMES.RX9,
        NAMES.RX10,
        NAMES.RX11,
        NAMES.RX12,
        NAMES.RX13,
        NAMES.RX14,
        NAMES.RX15,
        NAMES.RX16,
      ],
  }),
  {
    // once an expire was answered, a resend goes back to the lost reply.
    name: 'a resent expire goes back from the expiry to a lost reply',
    fails: [NAMES.RX7],
    fixture: responsesVariant(real => ({
      responses: {
        expire: regressesAfterFinal(
          {
            row: resourceResponsesAnswers.expire,
            key: operationKey,
            progress: input => fail({ kind: 'commit-unknown', operation: input.operation }),
          },
          input => real.expire(input),
        ),
      },
    })),
  },
  {
    // the generated provider with the resend of an expire during its lost reply replaced.
    name: 'a resend of an expire during its lost reply answers another expiry than the one that lands',
    fails: [NAMES.RX6, NAMES.RX7, NAMES.RX15, NAMES.RX16],
    fixture: externalGenerated(makeShared, resourceResponsesAnswers, 'commit-unknown', {
      mutators: MUTATORS,
      wrap: port => {
        const masked = (port as Partial<Responses>).expire
        if (masked === undefined) throw new Error('the masked port has no expire')
        return {
          ...port,
          expire: answersAnotherFinalDuringProgress(
            {
              row: resourceResponsesAnswers.expire,
              key: operationKey,
              other: () => succeed(evidence('expiry/early')),
            },
            masked,
          ),
        } as Partial<ExternalPort>
      },
    }),
  },
  {
    // The input of an expire is not compared: another wait under the same identity is answered
    // the expiry of the first, and nothing is refused.
    name: 'a reused expire identity for another wait answers the first expiry',
    fails: [NAMES.RX16],
    fixture: responsesVariant(real => {
      const first = new Map<string, DurableEvidence>()
      return {
        responses: {
          expire: async input => {
            const key = `${input.operation}`
            const known = first.get(key)
            if (known !== undefined) return succeed(known)
            const answer = await real.expire(input)
            if ('ok' in answer) first.set(key, answer.ok)
            return answer
          },
        },
      }
    }),
  },
  {
    // The conflict is answered, and the refused expire is carried out on the other wait all the same.
    name: 'a conflicting reuse of an expire identity still expires the other wait',
    fails: [NAMES.RX16],
    fixture: responsesVariant(real => ({
      responses: {
        expire: async input => {
          const answer = await real.expire(input)
          if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
          await real.expire({ ...input, operation: operationOf(`${input.operation}-forced`) })
          return answer
        },
      },
    })),
  },
  {
    name: 'inspect shows a response before the owner answered',
    fails: [NAMES.RX1, NAMES.RX5, NAMES.RX9, NAMES.RX12, NAMES.RX13, NAMES.RX15, NAMES.RX16],
    fixture: responsesVariant(real => ({
      responses: {
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer || answer.ok.response !== null
            ? answer
            : succeed({ ...answer.ok, response: evidence('premature') })
        },
      },
    })),
  },
  {
    name: 'inspect forgets the response',
    fails: [NAMES.RX2, NAMES.RX6, NAMES.RX8, NAMES.RX11],
    fixture: responsesVariant(real => ({
      responses: {
        inspect: async input => {
          const answer = await real.inspect(input)
          return 'failure' in answer ? answer : succeed({ ...answer.ok, response: null })
        },
      },
    })),
  },
  {
    name: 'resolve answers another value than the response',
    fails: [NAMES.RX3],
    fixture: responsesVariant(real => ({
      responses: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'failure' in answer || answer.ok.kind !== 'resource'
            ? answer
            : succeed({ ...answer.ok, value: { kind: 'string' as const, value: 'other' } })
        },
      },
    })),
  },
  {
    // Evidence that is no response is answered with a value, so Tool would act on an invented one.
    name: 'resolve answers a value for evidence that is no response',
    fails: [NAMES.RX4, NAMES.RX14],
    fixture: responsesVariant(real => ({
      responses: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'ok' in answer
            ? answer
            : succeed({
                kind: 'resource' as const,
                value: { kind: 'null' as const },
                source: input.response,
              })
        },
      },
    })),
  },
  {
    name: 'resolve reads an expiry as a resource response',
    fails: [NAMES.RX6],
    fixture: responsesVariant(real => ({
      responses: {
        resolve: async input => {
          const answer = await real.resolve(input)
          return 'failure' in answer || answer.ok.kind !== 'expired'
            ? answer
            : succeed({
                kind: 'resource' as const,
                value: { kind: 'null' as const },
                source: answer.ok.source,
              })
        },
      },
    })),
  },
  {
    // The owner is asked to consider the deadline reached whenever an expire comes in.
    name: 'expire ignores the deadline',
    fails: [NAMES.RX5],
    fixture: responsesVariant((real, base) => ({
      responses: {
        expire: async input => {
          await base.reachDeadline?.({ call: input.call, wait: input.wait })
          return real.expire(input)
        },
      },
    })),
  },
  {
    // An expire that the owner refuses before the deadline answers a lost
    // reply instead, and at settle the expiry lands all the same. Only a case that reads the
    // expire to its final answer sees the expiry that should have been refused.
    name: 'an expire before the deadline answers a lost reply and lands an expiry at settle',
    fails: [NAMES.RX5],
    fixture: () => {
      const base = memoryToolResourceResponsesFixture()
      const real = base.responses
      const deferred = new Map<string, () => Promise<void>>()
      const landed = new Set<string>()
      const keyOf = (input: { tenant: unknown; call: string; operation: string }): string =>
        JSON.stringify([input.tenant, input.call, input.operation])
      return {
        ...base,
        settle: async () => {
          for (const [at, land] of deferred)
            if (!landed.has(at)) {
              await land()
              landed.add(at)
            }
          await base.settle?.()
        },
        responses: {
          ...real,
          expire: async input => {
            const at = keyOf(input)
            if (landed.has(at)) return real.expire(input)
            if (deferred.has(at))
              return fail({ kind: 'commit-unknown', operation: input.operation })
            const answer = await real.expire(input)
            if (!('failure' in answer) || answer.failure.kind !== 'invalid') return answer
            if (answer.failure.field !== 'deadline') return answer
            deferred.set(at, async () => {
              await base.reachDeadline?.({ call: input.call, wait: input.wait })
              await real.expire(input)
            })
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
          inspectOperation: async input =>
            deferred.has(keyOf(input)) && !landed.has(keyOf(input))
              ? succeed({
                  kind: 'pending' as const,
                  operation: input.operation,
                  diagnostic: 'the expire is deferred',
                })
              : real.inspectOperation(input),
        },
      }
    },
  },
  {
    // Before the deadline the expire is not refused: it answers evidence and changes nothing.
    name: 'expire before the deadline answers evidence and changes nothing',
    fails: [NAMES.RX5, NAMES.RX9, NAMES.RX10],
    fixture: responsesVariant((real, base) => {
      let reached = false
      return {
        handles: {
          reachDeadline: async reach => {
            reached = true
            await base.reachDeadline?.(reach)
          },
        },
        responses: {
          expire: input =>
            reached ? real.expire(input) : Promise.resolve(succeed(evidence('expiry/none'))),
        },
      }
    }),
  },
  {
    // A registration that has no deadline is not refused: the expire answers evidence and changes
    // nothing.
    name: 'expire of a registration that has no deadline answers evidence and changes nothing',
    fails: [NAMES.RX9, NAMES.RX10, NAMES.RX12],
    fixture: responsesVariant(real => {
      const deadlines = new Map<string, string | null>()
      return {
        responses: {
          ensure: async input => {
            const answer = await real.ensure(input)
            if ('ok' in answer) deadlines.set(answer.ok.digest, input.wait.deadline)
            return answer
          },
          expire: input =>
            deadlines.get(input.registration.digest) === null
              ? Promise.resolve(succeed(evidence('expiry/none')))
              : real.expire(input),
        },
      }
    }),
  },
  {
    name: 'expire overrules an earlier response',
    fails: [NAMES.RX8, NAMES.RX16],
    fixture: responsesVariant(real => ({
      responses: {
        expire: async input => {
          const answer = await real.expire(input)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? succeed(evidence('expiry'))
            : answer
        },
      },
    })),
  },
  {
    name: 'expire expires a wait that has no deadline',
    fails: [NAMES.RX9],
    fixture: responsesVariant(real => ({
      responses: {
        expire: async input =>
          input.wait.deadline === null && input.wait.schemas.expiry === 'supported'
            ? succeed(evidence('expiry'))
            : real.expire(input),
      },
    })),
  },
  {
    name: 'expire under a contract without expiry fails as invalid',
    fails: [NAMES.RX10, NAMES.RX13],
    fixture: responsesVariant(real => ({
      responses: {
        expire: async input => {
          const answer = await real.expire(input)
          return 'failure' in answer && answer.failure.kind === 'unsupported'
            ? fail({ kind: 'invalid', field: 'wait', reason: 'no expiry' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a resent expire answers a fresh expiry',
    fails: [NAMES.RX7],
    fixture: responsesVariant(real => {
      const answers = new Map<string, number>()
      return {
        responses: {
          expire: async input => {
            const answer = await real.expire(input)
            if ('failure' in answer) return answer
            const turn = (answers.get(input.operation) ?? 0) + 1
            answers.set(input.operation, turn)
            return turn === 1 ? answer : succeed({ ...answer.ok, digest: `sha256:fresh-${turn}` })
          },
        },
      }
    }),
  },
  {
    // The provider keeps the deadline of the wait for its ensure only, and expires by the deadline
    // that the expire call carries.
    name: 'expire judges the deadline of the call',
    fails: [NAMES.RX12],
    fixture: responsesVariant(real => ({
      responses: {
        ensure: input => real.ensure({ ...input, wait: { ...input.wait, deadline: FAR } }),
        expire: input =>
          input.wait.schemas.expiry === 'forbidden' || input.wait.deadline !== null
            ? real.expire(input)
            : Promise.resolve(
                fail({ kind: 'invalid', field: 'deadline', reason: 'the deadline is not reached' }),
              ),
      },
    })),
  },
  {
    // The same for the expiry support: the call decides, not the registered wait.
    name: 'expire judges the expiry support of the call',
    fails: [NAMES.RX13],
    fixture: responsesVariant(real => ({
      responses: {
        ensure: input =>
          real.ensure({
            ...input,
            wait: { ...input.wait, schemas: { ...input.wait.schemas, expiry: 'supported' } },
          }),
        expire: input =>
          input.wait.schemas.expiry === 'forbidden'
            ? Promise.resolve(
                fail({
                  kind: 'unsupported',
                  adoption: input.wait.contract,
                  reason: 'the resource contract does not support expiry',
                }),
              )
            : real.expire(input),
      },
    })),
  },
  {
    // The call decides as well, and only a call that declares expiry supported may expire.
    name: 'expire takes only a call that declares expiry supported',
    fails: [NAMES.RX13],
    fixture: responsesVariant(real => ({
      responses: {
        ensure: input =>
          real.ensure({
            ...input,
            wait: { ...input.wait, schemas: { ...input.wait.schemas, expiry: 'supported' } },
          }),
        expire: input =>
          input.wait.schemas.expiry === 'supported'
            ? real.expire(input)
            : Promise.resolve(
                fail({
                  kind: 'unsupported',
                  adoption: input.wait.contract,
                  reason: 'the call declares no expiry',
                }),
              ),
      },
    })),
  },
  {
    // An expire that names a registration the owner never made is answered with an expiry all
    // the same, for every tenant: the answers of another tenant still read alike.
    name: 'expire answers an expiry for a registration that is none',
    fails: [NAMES.RX15],
    fixture: responsesVariant(real => ({
      responses: {
        expire: async input => {
          const answer = await real.expire(input)
          const none =
            'failure' in answer &&
            answer.failure.kind === 'invalid' &&
            answer.failure.field === 'registration'
          return none ? succeed(evidence(`expiry-of/${input.operation}`)) : answer
        },
      },
    })),
  },
  {
    // The resolve of another tenant finds the response of the first one.
    name: 'resolve ignores the tenant',
    fails: [NAMES.RX14],
    fixture: responsesVariant((real, base) => ({
      responses: { resolve: input => real.resolve({ ...input, tenant: base.access.tenant }) },
    })),
  },
  {
    name: 'a foreign resolve is denied when the response exists',
    fails: [NAMES.RX14],
    fixture: responsesVariant((real, base) => ({
      responses: {
        resolve: async input => {
          const answer = await real.resolve(input)
          if (JSON.stringify(input.tenant) === JSON.stringify(base.access.tenant) || 'ok' in answer)
            return answer
          const own = await real.resolve({ ...input, tenant: base.access.tenant })
          return 'ok' in own ? fail({ kind: 'denied', action: 'read' }) : answer
        },
      },
    })),
  },
  {
    // The foreign resolve is refused as one of a response that is none, and the reason tells the
    // resource value of the tenant.
    name: 'a foreign resolve is refused with a reason that names the value of the tenant',
    fails: [NAMES.RX14],
    fixture: responsesVariant((real, base) => ({
      responses: {
        resolve: async input => {
          const answer = await real.resolve(input)
          if (JSON.stringify(input.tenant) === JSON.stringify(base.access.tenant) || 'ok' in answer)
            return answer
          const own = await real.resolve({ ...input, tenant: base.access.tenant })
          if (!('ok' in own) || own.ok.kind !== 'resource') return answer
          return fail({
            kind: 'invalid',
            field: 'response',
            reason: `not a response of this wait; the wait holds ${JSON.stringify(own.ok.value)}`,
          })
        },
      },
    })),
  },
  {
    name: 'a foreign resolve makes the response of the tenant forgotten',
    fails: [NAMES.RX14],
    fixture: responsesVariant((real, base) => {
      let forgotten = false
      return {
        responses: {
          resolve: input => {
            const foreign = JSON.stringify(input.tenant) !== JSON.stringify(base.access.tenant)
            if (foreign) forgotten = true
            return forgotten && !foreign
              ? Promise.resolve(fail({ kind: 'invalid', field: 'response', reason: 'forgotten' }))
              : real.resolve(input)
          },
        },
      }
    }),
  },
  {
    // The foreign attempt turns the response of the tenant into an expiry, which still resolves.
    name: 'a foreign resolve turns the response of the tenant into an expiry',
    fails: [NAMES.RX14],
    fixture: responsesVariant((real, base) => {
      let attempted = false
      return {
        responses: {
          resolve: async input => {
            const foreign = JSON.stringify(input.tenant) !== JSON.stringify(base.access.tenant)
            if (foreign) attempted = true
            const answer = await real.resolve(input)
            return attempted && !foreign && 'ok' in answer && answer.ok.kind === 'resource'
              ? succeed({ kind: 'expired' as const, source: answer.ok.source })
              : answer
          },
        },
      }
    }),
  },
  {
    // The expire of another tenant reaches the wait of the first one.
    name: 'expire ignores the tenant',
    fails: [NAMES.RX15],
    fixture: responsesVariant((real, base) => ({
      responses: { expire: input => real.expire({ ...input, tenant: base.access.tenant }) },
    })),
  },
  {
    name: 'a foreign expire is denied when the wait exists',
    fails: [NAMES.RX15],
    fixture: responsesVariant((real, base) => ({
      responses: {
        expire: async input => {
          const answer = await real.expire(input)
          if (JSON.stringify(input.tenant) === JSON.stringify(base.access.tenant) || 'ok' in answer)
            return answer
          const own = await real.inspect({
            ...input,
            tenant: base.access.tenant,
            wait: input.wait.wait,
          })
          return 'ok' in own && own.ok.registration.digest === input.registration.digest
            ? fail({ kind: 'denied', action: 'read' })
            : answer
        },
      },
    })),
  },
  {
    // The foreign attempt uses up the deadline of the tenant: its own expire is refused after it.
    name: 'a foreign expire uses up the deadline of the tenant',
    fails: [NAMES.RX15],
    fixture: responsesVariant((real, base) => {
      let spent = false
      return {
        responses: {
          expire: input => {
            const foreign = JSON.stringify(input.tenant) !== JSON.stringify(base.access.tenant)
            if (foreign) spent = true
            return spent && !foreign
              ? Promise.resolve(
                  fail({
                    kind: 'invalid',
                    field: 'deadline',
                    reason: 'the deadline is not reached',
                  }),
                )
              : real.expire(input)
          },
        },
      }
    }),
  },
  ...(['owner', 'digest'] as const).flatMap(field => [
    {
      name: `a resolved response names no ${field} of its source`,
      fails: [NAMES.RX3],
      fixture: responsesVariant(real => ({
        responses: {
          resolve: async input => {
            const answer = await real.resolve(input)
            return 'failure' in answer || answer.ok.kind !== 'resource'
              ? answer
              : succeed({ ...answer.ok, source: { ...answer.ok.source, [field]: '' } })
          },
        },
      })),
    },
    {
      name: `a resolved expiry names no ${field} of its source`,
      fails: [NAMES.RX6],
      fixture: responsesVariant(real => ({
        responses: {
          resolve: async input => {
            const answer = await real.resolve(input)
            return 'failure' in answer || answer.ok.kind !== 'expired'
              ? answer
              : succeed({ ...answer.ok, source: { ...answer.ok.source, [field]: '' } })
          },
        },
      })),
    },
  ]),
  {
    // The receipt that inspectOperation gives for an expire is not the expiry that it answered.
    name: 'inspectOperation answers another receipt for an expire',
    fails: [NAMES.RX7, NAMES.RX11, NAMES.RX16],
    fixture: responsesVariant(real => ({
      responses: {
        inspectOperation: async input => {
          const answer = await real.inspectOperation(input)
          return 'ok' in answer &&
            answer.ok.kind === 'committed' &&
            input.operation.startsWith('expire')
            ? succeed({
                ...answer.ok,
                receipt: { ...answer.ok.receipt, digest: 'sha256:other-receipt' },
              })
            : answer
        },
      },
    })),
  },
  {
    // An expire whose reply was lost lands, and the resend after it is answered fresh evidence.
    name: 'a resent expire after a lost reply answers fresh evidence',
    fails: [NAMES.RX11],
    fixture: responsesVariant(real => {
      const lost = new Set<string>()
      return {
        responses: {
          expire: async input => {
            const answer = await real.expire(input)
            if ('failure' in answer) {
              if (answer.failure.kind === 'commit-unknown') lost.add(input.operation)
              return answer
            }
            return lost.has(input.operation)
              ? succeed({ ...answer.ok, digest: 'sha256:fresh-after-loss' })
              : answer
          },
        },
      }
    }),
  },
  {
    // An expire that is only deferred is answered with evidence, as if it had been applied.
    name: 'a deferred expire is answered with evidence',
    fails: [NAMES.RX11],
    fixture: () => {
      const base = memoryToolResourceResponsesFixture()
      let held = false
      return {
        ...base,
        hold: () => {
          held = true
          base.hold?.()
        },
        responses: {
          ...base.responses,
          expire: async input => {
            const answer = await base.responses.expire(input)
            return held && 'failure' in answer ? succeed(evidence('claimed-expiry')) : answer
          },
        },
      }
    },
  },
  {
    // The expire is refused, and a later resolve reads the response as an expiry all the same.
    name: 'a refused expire turns the response into an expiry',
    fails: [NAMES.RX8],
    fixture: responsesVariant(real => {
      let refused = false
      return {
        responses: {
          expire: async input => {
            const answer = await real.expire(input)
            if ('failure' in answer) refused = true
            return answer
          },
          resolve: async input => {
            const answer = await real.resolve(input)
            return refused && 'ok' in answer && answer.ok.kind === 'resource'
              ? succeed({ kind: 'expired' as const, source: answer.ok.source })
              : answer
          },
        },
      }
    }),
  },
  {
    name: 'inspectOperation forgets an expire',
    fails: [NAMES.RX7, NAMES.RX11, NAMES.RX16],
    fixture: responsesVariant(real => ({
      responses: {
        inspectOperation: async input => {
          const answer = await real.inspectOperation(input)
          return 'ok' in answer &&
            answer.ok.kind === 'committed' &&
            input.operation.startsWith('expire')
            ? succeed({
                kind: 'unknown' as const,
                operation: input.operation,
                diagnostic: 'forgotten',
              })
            : answer
        },
      },
    })),
  },
]

const spySettle = (fixture: Fixture, used: () => void): Fixture => ({
  ...fixture,
  settle: async () => {
    used()
    await fixture.settle?.()
  },
})

const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(resourceResponsesAnswers).map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} until settle`,
    fixture: generated(kind),
  })),
  ...sharedLegal().map((provider): LegalProvider<Fixture> => ({
    name: provider.name,
    fixture: provider.fixture,
  })),
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.S5]: 'otherAccess',
      [NAMES.S6]: 'otherAccess',
      [NAMES.S7]: 'otherAccess',
      [NAMES.S8]: 'otherAccess',
      [NAMES.RX14]: 'otherAccess',
      [NAMES.RX15]: 'otherAccess',
    },
  },
]

/** Fixtures that break the completion contract of a handle: it resolves before the work landed. */
const lateHandles: readonly Variant<Fixture>[] = [
  {
    name: 'reachDeadline resolves 3 turns before the deadline is reached',
    fails: [NAMES.RX6, NAMES.RX7, NAMES.RX11, NAMES.RX15, NAMES.RX16],
    fixture: resolvesEarly(memoryToolResourceResponsesFixture, 'reachDeadline'),
  },
  {
    name: 'excludeDeferred resolves 3 turns before the exclusion holds',
    fails: [NAMES.S12],
    fixture: resolvesEarly(memoryToolResourceResponsesFixture, 'excludeDeferred'),
  },
  {
    name: 'settle resolves 3 turns before the deferred operations land',
    fails: [NAMES.S11, NAMES.S16, NAMES.S17, NAMES.RX11],
    fixture: () => {
      const base = memoryToolResourceResponsesFixture()
      return {
        ...base,
        settle: () => {
          later(3, () => base.settle?.())
          return Promise.resolve()
        },
      }
    },
  },
]

/** The methods of the port that take an access, and the case that checks another tenant on each. */
const CROSS_TENANT: Readonly<Record<keyof ToolResourceResponses<string>, string>> = {
  ensure: NAMES.S5,
  inspect: NAMES.S6,
  inspectOperation: NAMES.S7,
  invalidate: NAMES.S8,
  resolve: NAMES.RX14,
  expire: NAMES.RX15,
}

describe('ToolResourceResponses conformance suite', () => {
  const cases = toolResourceResponsesConformance<string>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolResourceResponsesFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { responses, access } = memoryToolResourceResponsesFixture()
      return { responses, access }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({
      [NAMES.S5]: 'otherAccess',
      [NAMES.S6]: 'otherAccess',
      [NAMES.S7]: 'otherAccess',
      [NAMES.S8]: 'otherAccess',
      [NAMES.S11]: 'hold',
      [NAMES.S12]: 'hold',
      [NAMES.S14]: 'invalidations',
      [NAMES.S15]: 'invalidations',
      [NAMES.S16]: 'hold',
      [NAMES.S17]: 'hold',
      [NAMES.S19]: 'invalidations',
      [NAMES.S21]: 'invalidations',
      [NAMES.RX2]: 'respond',
      [NAMES.RX3]: 'respond',
      [NAMES.RX6]: 'reachDeadline',
      [NAMES.RX7]: 'reachDeadline',
      [NAMES.RX8]: 'respond',
      [NAMES.RX11]: 'hold',
      [NAMES.RX12]: 'reachDeadline',
      [NAMES.RX13]: 'reachDeadline',
      [NAMES.RX14]: 'respond',
      [NAMES.RX15]: 'reachDeadline',
      [NAMES.RX16]: 'reachDeadline',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  it('reads a deadline of the format of the provider', async () => {
    const own = (): Fixture => ({
      ...memoryToolResourceResponsesFixture(),
      deadline: '2031-03-04T05:06:07.000Z',
    })
    const verdict = await judge(cases, own)
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  itPassesLegal(cases, legal)

  for (const kind of maskKinds(resourceResponsesAnswers))
    itNeedsTheHandle(cases, {
      name: `generated: every first answer is ${kind}`,
      handleName: 'settle',
      withHandle: generated(kind),
      without: generated(kind, false),
      spy: spySettle,
    })

  itFailsExactly(cases, lateHandles)

  it('masks every method of the table that has progress or a lost reply, and each rule names a row', () => {
    expect(maskedMethods(resourceResponsesAnswers).sort()).toEqual(
      ['ensure', 'expire', 'inspectOperation', 'invalidate'].sort(),
    )
  })

  it('has a cross-tenant case for every method that takes an access, and it needs the second tenant', async () => {
    for (const name of Object.values(CROSS_TENANT))
      expect(
        cases.find(item => item.name === name),
        name,
      ).toBeDefined()
    expect(new Set(Object.values(CROSS_TENANT)).size).toBe(Object.keys(CROSS_TENANT).length)
    const bare = (): Fixture => {
      const { otherAccess: _other, ...rest } = memoryToolResourceResponsesFixture()
      return rest
    }
    const verdict = await judge(cases, bare)
    for (const name of Object.values(CROSS_TENANT))
      expect(verdict.notApplicable[name]).toBe('otherAccess')
  })

  it('fails the cross-tenant cases of a fixture that names one tenant twice', async () => {
    const same = (): Fixture => {
      const base = memoryToolResourceResponsesFixture()
      return { ...base, otherAccess: base.access }
    }
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual(
      [NAMES.S5, NAMES.S6, NAMES.S7, NAMES.S8, NAMES.RX14, NAMES.RX15].sort(),
    )
  })
})
