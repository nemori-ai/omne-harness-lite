import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  completedFinal,
  executorBindingAnswers,
  memoryToolExecutorBindingFixture,
  toolExecutorBindingConformance,
} from '@omne-harness/tool-contract/testing'
import { decodeToolOperationId, type ControlProgress } from '@omne-harness/tool-contract'
import { type ToolStartLookup } from '@omne-harness/tool-contract/provider'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itNeedsTheHandle,
  itPassesLegal,
  judge,
  keep,
  resolvesEarly,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import {
  coalescingFacts,
  endedStopPendingFirst,
  generated,
  oneTenant,
  overExecution,
  pendingFirstStop,
  permitFirst,
  variant,
  type Binding,
  type Environment,
  type Execution,
  type Fixture,
} from './executor-binding-legal.ts'
import { maskKinds, maskedMethods } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

const NAMES = {
  B1: 'a start resent with the same record launches once',
  B2: 'starts of the same record that meet in flight launch once',
  B3: 'a start resent with the same record joins the same fact stream',
  B4: 'a start with the permit of another call is refused',
  B5: 'a start with the permit of another start is refused',
  B6: 'a start with the permit of another tenant is refused',
  B7: 'inspectStart reports a running start as live on the same stream',
  B8: 'inspectStart claims no execution for a start never made',
  B9: 'inspectStart reports a settled start with the original final',
  B10: 'inspectStart reports a lost start with continuity evidence',
  B11: 'an unreadable inspection is unknown and never starts again',
  B12: 'facts keep the start, the source and a continuous cursor',
  B13: 'facts reconnect from a saved cursor without a skip or a repeat',
  B14: 'an acknowledgement resent for a batch returns the original evidence',
  B15: 'an acknowledgement releases the source from its duty once',
  B16: 'a closed channel is not a final',
  B17: 'a stop resent by its operation returns the original receipt',
  B18: 'an accepted stop is not a stopped execution',
  B19: 'stopping an execution that ended reports already-ended',
  B20: 'a stop operation reused with another input is a conflict that changes nothing',
  B21: 'a start operation reused with another input is a conflict that changes nothing',
  B22: 'another tenant learns nothing of a start by inspectStart',
  B23: 'the same start of another tenant is an execution of its own',
} as const

type StartInput = Parameters<Binding['start']>[0]

function operation(text: string) {
  const decoded = decodeToolOperationId(text)
  if ('failure' in decoded) throw new Error('the variant minted an illegal identity')
  return decoded.ok
}

function elsewhere(input: StartInput): StartInput {
  const again = operation(`${input.start.operation}-again`)
  return {
    ...input,
    start: { ...input.start, operation: again },
    permit: {
      ...input.permit,
      operation: again,
      start: { ...input.permit.start, operation: again },
    },
  }
}

function startOfAnotherRecord(input: StartInput): StartInput {
  const other = elsewhere(input)
  const { execution } = other.permit.start
  return {
    ...other,
    permit: {
      ...other.permit,
      call: input.call,
      tenant: input.tenant,
      start: {
        ...other.permit.start,
        execution: { ...execution, call: input.call, tenant: input.tenant },
      },
    },
  }
}

const keyOf = (input: StartInput): string =>
  JSON.stringify([input.tenant, input.call, input.start.operation])

const own = {
  get tenant(): TenantId {
    return memoryToolExecutorBindingFixture().access.tenant
  },
}

const isForeign = (tenant: typeof own.tenant): boolean =>
  JSON.stringify(tenant) !== JSON.stringify(own.tenant)

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'a resent start launches again',
    fails: [NAMES.B1, NAMES.B21],
    fixture: variant(real => {
      const first = new Map<string, Awaited<ReturnType<Binding['start']>>>()
      return {
        binding: {
          start: async (input, environment) => {
            const known = first.get(keyOf(input))
            if (known === undefined) {
              const answer = await real.start(input, environment)
              first.set(keyOf(input), answer)
              return answer
            }
            await real.start(elsewhere(input), environment)
            return known
          },
        },
      }
    }),
  },
  {
    name: 'a resent start gets an independent execution',
    fails: [NAMES.B1, NAMES.B2, NAMES.B3, NAMES.B21],
    fixture: variant(real => {
      const calls = new Map<string, number>()
      return {
        binding: {
          start: (input, environment) => {
            const turn = (calls.get(keyOf(input)) ?? 0) + 1
            calls.set(keyOf(input), turn)
            return real.start(turn === 1 ? input : elsewhere(input), environment)
          },
        },
      }
    }),
  },
  {
    name: 'inspectStart hides a running start',
    fails: [NAMES.B7, NAMES.B16, NAMES.B18, NAMES.B22],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if ('failure' in answer || answer.ok.kind !== 'live') return answer
          return succeed<ToolStartLookup>({
            kind: 'not-started',
            exclusion: evidence('hidden'),
          })
        },
      },
    })),
  },
  {
    name: 'inspectStart reports a start never made as lost',
    fails: [NAMES.B4, NAMES.B5, NAMES.B6, NAMES.B8],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if ('failure' in answer || answer.ok.kind !== 'not-started') return answer
          return succeed<ToolStartLookup>({
            kind: 'lost',
            continuity: evidence('fabricated'),
          })
        },
      },
    })),
  },
  {
    name: 'inspectStart alters the final of a settled start',
    fails: [NAMES.B9],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if ('failure' in answer || answer.ok.kind !== 'settled') return answer
          return succeed<ToolStartLookup>({
            ...answer.ok,
            fact: {
              ...answer.ok.fact,
              terminal: { kind: 'failed', cause: 'executor', diagnostic: 'x' },
            },
          })
        },
      },
    })),
  },
  {
    name: 'inspectStart reports a lost start as unknown',
    fails: [NAMES.B10],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if ('failure' in answer || answer.ok.kind !== 'lost') return answer
          return succeed<ToolStartLookup>({ kind: 'unknown', diagnostic: 'unclear' })
        },
      },
    })),
  },
  {
    name: 'inspectStart starts again when it cannot tell',
    fails: [NAMES.B11],
    fixture: variant(real => {
      let last: { input: StartInput; environment: Environment } | null = null
      return {
        binding: {
          start: (input, environment) => {
            last = { input, environment }
            return real.start(input, environment)
          },
          inspectStart: async input => {
            const answer = await real.inspectStart(input)
            if (last !== null && 'ok' in answer && answer.ok.kind === 'unknown')
              await real.start(elsewhere(last.input), last.environment)
            return answer
          },
        },
      }
    }),
  },
  {
    name: 'facts break the chain of after cursors',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input)) yield { ...batch, after: null }
          })(),
      })),
    })),
  },
  {
    name: 'facts ignore the cursor of a reconnect',
    fails: [NAMES.B13],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input => execution.facts({ ...input, after: null }),
      })),
    })),
  },
  {
    name: 'a resent acknowledgement answers fresh evidence',
    fails: [NAMES.B14],
    fixture: variant(real => {
      let calls = 0
      return {
        binding: overExecution(real, execution => ({
          acknowledge: async receipt => {
            calls += 1
            const answer = await execution.acknowledge(receipt)
            return calls === 1 || 'failure' in answer
              ? answer
              : succeed({ ...answer.ok, digest: `sha256:fresh-${calls}` })
          },
        })),
      }
    }),
  },
  {
    name: 'an acknowledgement does not release the source',
    fails: [NAMES.B15],
    fixture: variant(real => ({
      binding: overExecution(real, () => ({
        acknowledge: () => Promise.resolve(succeed(evidence('fake'))),
      })),
    })),
  },
  {
    name: 'a closed channel settles the start',
    fails: [NAMES.B16],
    fixture: variant(real => {
      let closed = false
      return {
        binding: overExecution(
          real,
          execution => ({
            facts: input =>
              (async function* () {
                try {
                  yield* execution.facts(input)
                } finally {
                  closed = true
                }
              })(),
          }),
          {
            inspectStart: async input => {
              const answer = await real.inspectStart(input)
              if (!closed || 'failure' in answer || answer.ok.kind !== 'live') return answer
              return succeed<ToolStartLookup>({
                kind: 'settled',
                source: evidence('source'),
                event: 'event-x',
                fact: completedFinal(),
              })
            },
          },
        ),
      }
    }),
  },
  {
    name: 'a resent stop answers other evidence',
    fails: [NAMES.B17],
    fixture: variant(real => {
      let calls = 0
      return {
        binding: overExecution(real, execution => ({
          stop: async control => {
            calls += 1
            const answer = await execution.stop(control)
            if (calls === 1 || 'failure' in answer || answer.ok.kind !== 'stopped') return answer
            return succeed<ControlProgress>({
              kind: 'stopped',
              evidence: evidence(`other-${calls}`),
            })
          },
        })),
      }
    }),
  },
  {
    name: 'a held stop is reported as stopped',
    fails: [NAMES.B18],
    fixture: variant((real, base) => {
      let held = false
      return {
        handles: {
          holdStop: start => {
            held = true
            base.holdStop?.(start)
          },
        },
        binding: overExecution(real, execution => ({
          stop: async control => {
            const answer = await execution.stop(control)
            if (!held || 'failure' in answer) return answer
            return succeed<ControlProgress>({ kind: 'stopped', evidence: evidence('claimed') })
          },
        })),
      }
    }),
  },
  {
    name: 'a stop after the final is reported as stopped',
    fails: [NAMES.B19],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        stop: async control => {
          const answer = await execution.stop(control)
          if ('failure' in answer || answer.ok.kind !== 'already-ended') return answer
          return succeed<ControlProgress>({ kind: 'stopped', evidence: answer.ok.evidence })
        },
      })),
    })),
  },
  {
    name: 'starts that meet in flight launch twice',
    fails: [NAMES.B2],
    fixture: variant(real => {
      let inflight = 0
      return {
        binding: {
          start: async (input, environment) => {
            inflight += 1
            await Promise.resolve()
            const crowded = inflight > 1
            inflight -= 1
            return real.start(crowded ? elsewhere(input) : input, environment)
          },
        },
      }
    }),
  },
  {
    name: 'start ignores the call of the permit',
    fails: [NAMES.B4],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            {
              ...input,
              permit: {
                ...input.permit,
                call: input.call,
                start: {
                  ...input.permit.start,
                  execution: { ...input.permit.start.execution, call: input.call },
                },
              },
            },
            environment,
          ),
      },
    })),
  },
  {
    name: 'start ignores the start that the permit names',
    fails: [NAMES.B5],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            {
              ...input,
              permit: {
                ...input.permit,
                operation: input.start.operation,
                start: { ...input.permit.start, operation: input.start.operation },
              },
            },
            environment,
          ),
      },
    })),
  },
  {
    name: 'start ignores the tenant of the permit',
    fails: [NAMES.B6],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            {
              ...input,
              permit: {
                ...input.permit,
                tenant: input.tenant,
                start: {
                  ...input.permit.start,
                  execution: { ...input.permit.start.execution, tenant: input.tenant },
                },
              },
            },
            environment,
          ),
      },
    })),
  },
  {
    name: 'a start with the permit of another call is answered with another start',
    fails: [NAMES.B4],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            input.permit.call === input.call ? input : startOfAnotherRecord(input),
            environment,
          ),
      },
    })),
  },
  {
    name: 'a start with the permit of another start is answered with another start',
    fails: [NAMES.B5],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            input.permit.start.operation === input.start.operation
              ? input
              : startOfAnotherRecord(input),
            environment,
          ),
      },
    })),
  },
  {
    name: 'a start with the permit of another tenant is answered with another start',
    fails: [NAMES.B6],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) =>
          real.start(
            JSON.stringify(input.permit.tenant) === JSON.stringify(input.tenant)
              ? input
              : startOfAnotherRecord(input),
            environment,
          ),
      },
    })),
  },
  {
    name: 'the facts of a start end at once',
    fails: [NAMES.B3, NAMES.B12, NAMES.B13, NAMES.B14, NAMES.B15],
    fixture: variant(real => ({
      binding: overExecution(real, () => ({
        facts: () => (async function* () {})(),
      })),
    })),
  },
  {
    name: 'every event has the same event identity',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input))
              yield { ...batch, events: batch.events.map(item => ({ ...item, event: 'event-x' })) }
          })(),
      })),
    })),
  },
  {
    name: 'every batch has the same batch identity',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input)) yield { ...batch, batch: 'batch-x' }
          })(),
        acknowledge: receipt =>
          execution.acknowledge({
            ...receipt,
            batch:
              receipt.batch === 'batch-x'
                ? receipt.cursor.replace('cursor-', 'batch-')
                : receipt.batch,
          }),
      })),
    })),
  },
  {
    name: 'a resent acknowledgement releases the source twice',
    fails: [NAMES.B15],
    fixture: variant((real, base) => {
      let extra = 0
      let acks = 0
      return {
        handles: {
          pendingAcknowledgements: start =>
            Math.max(0, (base.pendingAcknowledgements?.(start) ?? 0) - extra),
        },
        binding: overExecution(real, execution => ({
          acknowledge: receipt => {
            acks += 1
            if (acks > 1) extra += 1
            return execution.acknowledge(receipt)
          },
        })),
      }
    }),
  },
  {
    name: 'inspectControl claims stopped while the stop is only accepted',
    fails: [NAMES.B18],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'ok' in answer && answer.ok.kind === 'accepted'
            ? succeed<ControlProgress>({ kind: 'stopped', evidence: evidence('claimed') })
            : answer
        },
      })),
    })),
  },
  {
    name: 'inspectControl answers pending after the stop was accepted',
    fails: [NAMES.B17, NAMES.B18, NAMES.B19, NAMES.B20],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        stop: async control => {
          const answer = await execution.stop(control)
          return 'failure' in answer
            ? answer
            : succeed<ControlProgress>({ kind: 'accepted', evidence: evidence('accepted') })
        },
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'failure' in answer
            ? answer
            : succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
        },
      })),
    })),
  },
  {
    name: 'an accepted stop is read with another evidence',
    fails: [NAMES.B18],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'ok' in answer && answer.ok.kind === 'accepted'
            ? succeed<ControlProgress>({ kind: 'accepted', evidence: evidence('other') })
            : answer
        },
      })),
    })),
  },
  {
    name: 'a stop operation reused with another input is refused as invalid',
    fails: [NAMES.B20],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        stop: async control => {
          const answer = await execution.stop(control)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'invalid', field: 'operation', reason: 'the operation is taken' })
            : answer
        },
      })),
    })),
  },
  {
    name: 'a start with another input is refused as denied',
    fails: [NAMES.B21],
    fixture: variant(real => ({
      binding: {
        start: async (input, environment) => {
          const answer = await real.start(input, environment)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'denied', action: 'start' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a binding that offers no permit answers a start with another input as invalid',
    fails: [NAMES.B21],
    fixture: variant(real => ({
      binding: {
        start: async (input, environment) => {
          const answer = await real.start(input, environment)
          return 'failure' in answer && answer.failure.kind === 'conflict'
            ? fail({ kind: 'invalid', field: 'permit', reason: 'the permit names another input' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a binding that offers its own permits answers a start with another input as denied',
    fails: [NAMES.B21],
    fixture: () => {
      const base = permitFirst()
      return {
        ...base,
        binding: {
          ...base.binding,
          start: async (input, environment) => {
            const answer = await base.binding.start(input, environment)
            return 'failure' in answer && answer.failure.kind === 'invalid'
              ? fail({ kind: 'denied', action: 'start' })
              : answer
          },
        },
      }
    },
  },
  {
    name: 'a conflicting start still launches',
    fails: [NAMES.B21],
    fixture: variant(real => ({
      binding: {
        start: async (input, environment) => {
          const answer = await real.start(input, environment)
          if ('ok' in answer || answer.failure.kind !== 'conflict') return answer
          await real.start(elsewhere(input), environment)
          return answer
        },
      },
    })),
  },
  {
    name: 'a stop of an ended execution stays pending',
    fails: [NAMES.B19],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        stop: async control => {
          const answer = await execution.stop(control)
          return 'failure' in answer || answer.ok.kind !== 'already-ended'
            ? answer
            : succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
        },
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'failure' in answer || answer.ok.kind !== 'already-ended'
            ? answer
            : succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
        },
      })),
    })),
  },
  {
    name: 'inspectStart ignores the tenant',
    fails: [NAMES.B22],
    fixture: variant(real => ({
      binding: { inspectStart: input => real.inspectStart({ ...input, tenant: own.tenant }) },
    })),
  },
  {
    name: 'a foreign inspectStart is denied when the start exists',
    fails: [NAMES.B22],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          if (!isForeign(input.tenant) || input.call !== 'call-1') return real.inspectStart(input)
          const known = await real.inspectStart({ ...input, tenant: own.tenant })
          return 'ok' in known && known.ok.kind === 'live'
            ? fail({ kind: 'denied', action: 'read' })
            : real.inspectStart(input)
        },
      },
    })),
  },
  {
    name: 'a foreign inspectStart answers unknown when the start exists',
    fails: [NAMES.B22],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if (!isForeign(input.tenant) || 'failure' in answer) return answer
          const known = await real.inspectStart({ ...input, tenant: own.tenant })
          return 'ok' in known && known.ok.kind === 'live'
            ? succeed<ToolStartLookup>({ kind: 'unknown', diagnostic: 'not yours' })
            : answer
        },
      },
    })),
  },
  {
    name: 'a foreign inspectStart makes the start of the tenant forgotten',
    fails: [NAMES.B22],
    fixture: variant(real => {
      let forgotten = false
      return {
        binding: {
          inspectStart: input => {
            if (isForeign(input.tenant)) forgotten = true
            return forgotten && !isForeign(input.tenant)
              ? Promise.resolve(
                  succeed<ToolStartLookup>({
                    kind: 'unknown',
                    diagnostic: 'forgotten',
                  }),
                )
              : real.inspectStart(input)
          },
        },
      }
    }),
  },
  {
    name: 'start ignores the tenant',
    fails: [NAMES.B6, NAMES.B23],
    fixture: variant(real => ({
      binding: {
        start: (input, environment) => {
          const moved = <T extends { execution: { tenant: typeof own.tenant } }>(record: T): T => ({
            ...record,
            execution: { ...record.execution, tenant: own.tenant },
          })
          return real.start(
            {
              ...input,
              tenant: own.tenant,
              start: moved(input.start),
              permit: {
                ...input.permit,
                tenant: own.tenant,
                start: moved(input.permit.start),
              },
            },
            environment,
          )
        },
      },
    })),
  },
  {
    name: 'a second reader of a start is handed other batches',
    fails: [NAMES.B3, NAMES.B7],
    fixture: variant(real => {
      let readers = 0
      return {
        binding: overExecution(real, execution => ({
          facts: input => {
            readers += 1
            const reader = readers
            return (async function* () {
              for await (const batch of execution.facts(input))
                yield reader === 1 ? batch : { ...batch, batch: `${batch.batch}-reader-${reader}` }
            })()
          },
        })),
      }
    }),
  },
  {
    name: 'the live execution of inspectStart reads other batches',
    fails: [NAMES.B7],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          if ('failure' in answer || answer.ok.kind !== 'live') return answer
          const live = answer.ok.execution
          return succeed<ToolStartLookup>({
            kind: 'live',
            execution: {
              ...live,
              facts: factsInput =>
                (async function* () {
                  for await (const batch of live.facts(factsInput))
                    yield { ...batch, batch: `${batch.batch}-inspected` }
                })(),
            },
          })
        },
      },
    })),
  },
  {
    name: 'the event of a settled start is blank',
    fails: [NAMES.B9],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          return 'failure' in answer || answer.ok.kind !== 'settled'
            ? answer
            : succeed<ToolStartLookup>({ ...answer.ok, event: '' })
        },
      },
    })),
  },
  {
    name: 'the source of a settled start is blank',
    fails: [NAMES.B9],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          return 'failure' in answer || answer.ok.kind !== 'settled'
            ? answer
            : succeed<ToolStartLookup>({
                ...answer.ok,
                source: { ...answer.ok.source, owner: '' },
              })
        },
      },
    })),
  },
  ...(['owner', 'digest'] as const).map((field): Variant<Fixture> => ({
    name: `the ${field} of the continuity of a lost start is blank`,
    fails: [NAMES.B10],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          return 'failure' in answer || answer.ok.kind !== 'lost'
            ? answer
            : succeed<ToolStartLookup>({
                ...answer.ok,
                continuity: { ...answer.ok.continuity, [field]: '' },
              })
        },
      },
    })),
  })),
  {
    name: 'an unreadable inspection is unknown without a diagnostic',
    fails: [NAMES.B11],
    fixture: variant(real => ({
      binding: {
        inspectStart: async input => {
          const answer = await real.inspectStart(input)
          return 'failure' in answer || answer.ok.kind !== 'unknown'
            ? answer
            : succeed<ToolStartLookup>({ kind: 'unknown', diagnostic: '' })
        },
      },
    })),
  },
  {
    name: 'the stream carries a fact that was never emitted',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input)) {
              const [event] = batch.events
              yield event === undefined
                ? batch
                : {
                    ...batch,
                    events: [...batch.events, { ...event, event: `${event.event}-extra` }],
                  }
            }
          })(),
      })),
    })),
  },
  {
    name: 'a fact is delivered twice',
    fails: [NAMES.B12, NAMES.B13],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            let seen = 0
            for await (const batch of execution.facts(input)) {
              const before = seen
              seen += batch.events.length
              const last = batch.events.at(-1)
              yield before < 3 && seen >= 3 && last !== undefined
                ? { ...batch, events: [...batch.events, last] }
                : batch
            }
          })(),
      })),
    })),
  },
  {
    name: 'every batch has the same cursor',
    fails: [NAMES.B12],
    fixture: variant(real => {
      let first: string | null = null
      return {
        binding: overExecution(real, execution => ({
          facts: input =>
            (async function* () {
              const after = input.after === 'cursor-x' ? first : input.after
              for await (const batch of execution.facts({ ...input, after })) {
                first ??= batch.cursor
                yield {
                  ...batch,
                  cursor: 'cursor-x',
                  after: batch.after === null ? null : 'cursor-x',
                }
              }
            })(),
        })),
      }
    }),
  },
  {
    name: 'the first batch has an after cursor',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input))
              yield batch.after === null && input.after === null
                ? { ...batch, after: 'cursor-before' }
                : batch
          })(),
      })),
    })),
  },
  {
    name: 'a batch names another start',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            for await (const batch of execution.facts(input))
              yield { ...batch, start: { ...batch.start, operation: operation('start-other') } }
          })(),
      })),
    })),
  },
  {
    name: 'every batch has another source',
    fails: [NAMES.B12],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        facts: input =>
          (async function* () {
            let turn = 0
            for await (const batch of execution.facts(input)) {
              turn += 1
              yield { ...batch, source: { ...batch.source, record: `source-${turn}` } }
            }
          })(),
      })),
    })),
  },
  {
    name: 'the source owes no duty before the receipt',
    fails: [NAMES.B15],
    fixture: variant((_real, base) => {
      let first: number | null = null
      return {
        handles: {
          pendingAcknowledgements: start => {
            const count = base.pendingAcknowledgements?.(start) ?? 0
            first ??= count
            return count - first
          },
        },
      }
    }),
  },
  {
    name: 'an acknowledgement releases the source only when resent',
    fails: [NAMES.B15],
    fixture: variant((real, base) => {
      let acks = 0
      return {
        handles: {
          pendingAcknowledgements: start =>
            (base.pendingAcknowledgements?.(start) ?? 0) + (acks === 1 ? 1 : 0),
        },
        binding: overExecution(real, execution => ({
          acknowledge: receipt => {
            acks += 1
            return execution.acknowledge(receipt)
          },
        })),
      }
    }),
  },
  {
    name: 'inspectControl keeps saying accepted after the executor ended',
    fails: [NAMES.B17, NAMES.B18, NAMES.B20],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'ok' in answer && answer.ok.kind === 'stopped'
            ? succeed<ControlProgress>({ kind: 'accepted', evidence: answer.ok.evidence })
            : answer
        },
      })),
    })),
  },
  {
    name: 'the stopped execution has no evidence',
    fails: [NAMES.B17, NAMES.B18, NAMES.B20],
    fixture: variant(real => ({
      binding: overExecution(real, execution => ({
        inspectControl: async control => {
          const answer = await execution.inspectControl(control)
          return 'ok' in answer && answer.ok.kind === 'stopped'
            ? succeed<ControlProgress>({
                kind: 'stopped',
                evidence: { ...answer.ok.evidence, digest: '' },
              })
            : answer
        },
      })),
    })),
  },
  {
    name: 'a resent stop goes back from accepted to pending',
    fails: [NAMES.B17],
    fixture: variant((real, base) => {
      let released = false
      return {
        handles: {
          completeStop: async start => {
            await base.completeStop?.(start)
            released = true
          },
        },
        binding: overExecution(real, execution => {
          let asked = 0
          return {
            stop: async control => {
              const answer = await execution.stop(control)
              asked += 1
              if ('failure' in answer || released) return answer
              if (asked === 1)
                return answer.ok.kind === 'accepted'
                  ? answer
                  : succeed<ControlProgress>({ kind: 'accepted', evidence: evidence('accepted') })
              return succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
            },
          }
        }),
      }
    }),
  },
  {
    name: 'a resend during progress answers another final than the one that lands',
    fails: [NAMES.B17],
    fixture: variant(real => ({
      binding: overExecution(real, execution => {
        let asked = 0
        return {
          stop: async control => {
            const answer = await execution.stop(control)
            asked += 1
            if ('failure' in answer) return answer
            if (asked === 1)
              return succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
            return succeed<ControlProgress>({ kind: 'stopped', evidence: evidence('early') })
          },
        }
      }),
    })),
  },
  {
    name: 'inspectStart keeps reporting a stopped start as live',
    fails: [NAMES.B18],
    fixture: variant((real, base) => {
      let ended = false
      let last: Execution | null = null
      return {
        handles: {
          completeStop: async start => {
            await base.completeStop?.(start)
            ended = true
          },
        },
        binding: {
          start: async (input, environment) => {
            const answer = await real.start(input, environment)
            if ('ok' in answer) last = answer.ok
            return answer
          },
          inspectStart: async input => {
            const answer = await real.inspectStart(input)
            return ended && last !== null && 'ok' in answer && answer.ok.kind !== 'live'
              ? succeed<ToolStartLookup>({ kind: 'live', execution: last })
              : answer
          },
        },
      }
    }),
  },
]

const na = (handle: string, ...names: string[]): Record<string, string> =>
  Object.fromEntries(names.map(name => [name, handle]))
const NEEDS_SETTLE = [NAMES.B7, NAMES.B9, NAMES.B10, NAMES.B16, NAMES.B22]
const NEEDS_STOP = [NAMES.B17, NAMES.B18, NAMES.B19, NAMES.B20]

const legal: readonly LegalProvider<Fixture>[] = [
  ...maskKinds(executorBindingAnswers).map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer is ${kind} until its handle resolves`,
    fixture: generated(kind),
  })),
  {
    name: 'an executor that coalesces the facts that are ready into one batch',
    fixture: coalescingFacts,
  },
  {
    name: 'a stop of an ended execution is answered pending first and read as already-ended',
    fixture: endedStopPendingFirst,
  },
  {
    name: 'a stop answers pending first and a resend reads its current progress',
    fixture: pendingFirstStop,
  },
  {
    name: 'a binding that judges its own permit first calls a start with another input invalid',
    fixture: permitFirst,
  },
  {
    name: 'one tenant: only the cross-tenant cases are not applicable',
    fixture: oneTenant,
    notApplicable: {
      [NAMES.B6]: 'otherAccess',
      [NAMES.B22]: 'otherAccess',
      [NAMES.B23]: 'otherAccess',
    },
  },
]

const lateHandles: readonly Variant<Fixture>[] = [
  {
    name: 'completeStop resolves 3 turns before the stop lands (generated)',
    fails: NEEDS_STOP,
    fixture: generated('unknown', { stopLanding: { lagTurns: 3 } }),
  },
  {
    name: 'settle resolves 3 turns before inspectStart tells (generated)',
    fails: [...NEEDS_SETTLE, NAMES.B18],
    fixture: generated('unknown', { settleLanding: { lagTurns: 3 } }),
  },
  {
    name: 'completeStop returns before the stop is carried out',
    fails: [NAMES.B18],
    fixture: resolvesEarly(memoryToolExecutorBindingFixture, 'completeStop'),
  },
  {
    name: 'finish resolves 3 turns before the execution ends',
    fails: [NAMES.B9, NAMES.B19],
    fixture: resolvesEarly(memoryToolExecutorBindingFixture, 'finish'),
  },
  {
    name: 'loseContinuity resolves 3 turns before the execution is lost',
    fails: [NAMES.B10],
    fixture: resolvesEarly(memoryToolExecutorBindingFixture, 'loseContinuity'),
  },
]

const legalWithoutHandles: readonly LegalProvider<Fixture>[] = [
  {
    name: 'generated: every first answer is unknown and the fixture offers no handle',
    fixture: generated('unknown', { settle: false, completeStop: false }),
    notApplicable: { ...na('settle', ...NEEDS_SETTLE), ...na('completeStop', ...NEEDS_STOP) },
  },
  {
    name: 'generated: every first answer is unknown and the fixture offers no settle',
    fixture: generated('unknown', { settle: false }),
    notApplicable: na('settle', ...NEEDS_SETTLE, NAMES.B18),
  },
  {
    name: 'generated: every first answer is unknown and the fixture offers no completeStop',
    fixture: generated('unknown', { completeStop: false }),
    notApplicable: na('completeStop', ...NEEDS_STOP),
  },
  ...['pending', 'accepted'].map((kind): LegalProvider<Fixture> => ({
    name: `generated: every first answer of a stop is ${kind} and the fixture offers no completeStop`,
    fixture: generated(kind, { completeStop: false }),
    notApplicable: na('completeStop', ...NEEDS_STOP),
  })),
]

const CROSS_TENANT: Readonly<Record<'start' | 'inspectStart', string>> = {
  start: NAMES.B23,
  inspectStart: NAMES.B22,
}

describe('live-only ToolExecutorBinding conformance suite', () => {
  const cases = toolExecutorBindingConformance<string, Environment>()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming double with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolExecutorBindingFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { binding, access, environment } = memoryToolExecutorBindingFixture()
      return { binding, access, environment }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toEqual([NAMES.B4, NAMES.B5, NAMES.B8, NAMES.B17, NAMES.B20])
    expect(verdict.notApplicable).toEqual({
      [NAMES.B1]: 'launches',
      [NAMES.B2]: 'launches',
      [NAMES.B21]: 'launches',
      [NAMES.B3]: 'emit',
      [NAMES.B6]: 'otherAccess',
      [NAMES.B7]: 'emit',
      [NAMES.B9]: 'finish',
      [NAMES.B10]: 'loseContinuity',
      [NAMES.B11]: 'blindInspection',
      [NAMES.B12]: 'emit',
      [NAMES.B13]: 'emit',
      [NAMES.B14]: 'emit',
      [NAMES.B15]: 'pendingAcknowledgements',
      [NAMES.B16]: 'emit',
      [NAMES.B18]: 'holdStop',
      [NAMES.B19]: 'finish',
      [NAMES.B22]: 'otherAccess',
      [NAMES.B23]: 'emit',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, [...variants, ...lateHandles])
  })

  itFailsExactly(cases, variants)

  itFailsExactly(cases, lateHandles)

  itPassesLegal(cases, legal)

  itPassesLegal(cases, legalWithoutHandles)

  for (const kind of executorBindingAnswers.inspectStart.progress)
    itNeedsTheHandle(cases, {
      name: `generated: every first answer of inspectStart is ${kind}`,
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
  for (const kind of executorBindingAnswers.stop.progress) {
    itNeedsTheHandle(cases, {
      name: `generated: every first answer is ${kind}`,
      handleName: 'completeStop',
      withHandle: generated(kind),
      without: generated(kind, { completeStop: false }),
      spy: (fixture, used) => ({
        ...fixture,
        completeStop: async start => {
          used()
          await fixture.completeStop?.(start)
        },
      }),
    })
  }

  it('has a cross-tenant case for every method that takes an access, and it needs the second tenant', async () => {
    for (const [method, name] of Object.entries(CROSS_TENANT))
      expect(
        cases.find(item => item.name === name),
        `${method} has no cross-tenant case`,
      ).toBeDefined()
    const verdict = await judge(cases, oneTenant)
    for (const name of Object.values(CROSS_TENANT))
      expect(verdict.notApplicable[name]).toBe('otherAccess')
  })

  it('masks every method of the table that has progress', () => {
    expect(maskedMethods(executorBindingAnswers).sort()).toEqual(
      ['inspectControl', 'inspectStart', 'stop'].sort(),
    )
  })

  it('names the tenant of the second access: the cross-tenant cases fail on one tenant twice', async () => {
    const same = (): Fixture => {
      const base = memoryToolExecutorBindingFixture()
      return { ...base, otherAccess: base.access }
    }
    const cross = [NAMES.B6, NAMES.B22, NAMES.B23]
    const verdict = await judge(cases, same)
    expect([...verdict.failed].sort()).toEqual([...cross].sort())
    for (const name of cross)
      await expect(cases.find(item => item.name === name)!.run(same())).rejects.toThrow(
        /names one tenant twice/u,
      )
  })

  describe('the quiet period', () => {
    const leaksLate = (quietMs?: number) => (): Fixture => {
      const fixture = variant(real => ({
        binding: {
          start: async (input, environment) => {
            const answer = await real.start(input, environment)
            if ('failure' in answer || !isForeign(input.tenant)) return answer
            return succeed<Execution>({
              ...answer.ok,
              facts: () =>
                (async function* () {
                  await new Promise<void>(resolve => setTimeout(resolve, 40))
                  yield {
                    start: input.start,
                    source: evidence('late-source'),
                    batch: 'batch-late',
                    after: null,
                    cursor: 'cursor-late',
                    events: [
                      { event: 'event-late', fact: { kind: 'process' as const, blocks: [] } },
                    ],
                  }
                })(),
            })
          },
        },
      }))()
      return { ...fixture, ...(quietMs === undefined ? {} : { quietMs }) }
    }
    const foreign = cases.filter(item => item.name === NAMES.B23)

    it('is 25 ms by default, so a fact that shows later is not seen', async () => {
      expect((await judge(foreign, leaksLate())).passed).toEqual([NAMES.B23])
    })

    it('is taken from the fixture: a fact later than it fails the case that waits', async () => {
      expect((await judge(foreign, leaksLate(250))).failed).toEqual([NAMES.B23])
    })
  })

  describe('the read deadline', () => {
    const slow = (lateMs: number, readDeadlineMs?: number) => (): Fixture => {
      const base = memoryToolExecutorBindingFixture()
      return {
        ...base,
        ...(readDeadlineMs === undefined ? {} : { readDeadlineMs }),
        emit: (start, fact) => {
          keep(
            new Promise<void>(resolve => setTimeout(resolve, lateMs)).then(() =>
              base.emit?.(start, fact),
            ),
          )
          return Promise.resolve()
        },
      }
    }
    const joined = cases.filter(item => item.name === NAMES.B3)

    it('is one second by default, so a fact that shows within it is read', async () => {
      const verdict = await judge(joined, slow(30))
      expect(verdict.passed).toEqual([NAMES.B3])
    })

    it('is taken from the fixture: a fact later than it fails the case that reads it', async () => {
      const verdict = await judge(joined, slow(150, 20))
      expect(verdict.failed).toEqual([NAMES.B3])
    })

    it('can be raised for a slower provider', async () => {
      const verdict = await judge(joined, slow(150, 2_000))
      expect(verdict.passed).toEqual([NAMES.B3])
    })
  })
})
