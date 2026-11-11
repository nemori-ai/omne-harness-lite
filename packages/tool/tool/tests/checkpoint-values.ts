// The doubles of a checkpointed call on the real runtime, ledger and driver: a minimal checkpointed
// author, a checkpointed binding that runs its initial and resume segments, and a scripted decision
// owner. The binding keeps its executions in memory and proves nothing about a durable host; the
// host-local binding is tested in its own package. The state of a checkpoint and the request
// original of a wait go to the ledger, and a resume gets its state and its response from the
// driver. A decision owner reads the request original from the recovery of the call.
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ControlProgress,
  DecisionValue,
  DurableEvidence,
  ResponseRecord,
  ToolDecision,
  ToolFailure,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import { completedFinal } from '@omne-harness/tool-contract/testing'
import type {
  AuthorSegment,
  CheckpointedToolExecutor,
  ControlDispatch,
  ExternalOperationResolution,
  FactBatch,
  SuspensionProgress,
  SuspensionRecord,
  ToolBindings,
  ToolDecisionBridge,
  ToolExecutionFact,
  ToolExecutorBinding,
  ToolLiveExecution,
  ToolPrimitiveFailure,
  ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import { canonicalDigest } from '@omne-harness/tool'
import { adoption, evidence, type Principal } from './runtime-values.ts'
import { askContract, question } from './scope-values.ts'
import type { TestEnvironment } from './start-values.ts'

type Checkpointed = Extract<
  ToolExecutorBinding<Principal, TestEnvironment>,
  { kind: 'checkpointed' }
>
export type Segment = Outcome<AuthorSegment<Uint8Array, unknown>, ToolPrimitiveFailure>

export const STATE_CODEC = adoption('ask-state-codec')

/** The result the double's author wrote for a wait that a control closes. */
export const CLOSED_RESULT = 'No file was chosen: the question was closed.'

/** A segment that suspends on one question, with `state` as its encoded state. */
export function asking(state: string, text = 'which file?'): Segment {
  return succeed({
    kind: 'suspended',
    state: new TextEncoder().encode(state),
    closedResult: CLOSED_RESULT,
    wait: { kind: 'ask', key: 'which-file', contract: askContract(), request: question(text) },
  })
}

/** What a resume segment of the double was given: its decoded state and the decision. */
export type ResumeInput = Readonly<{ state: string; response: ToolDecision<unknown> }>

/**
 * A checkpointed author whose initial segment asks one question and suspends on it. Its resume
 * segment answers `resume(input)`, by default a completed segment; `resumed` lists every input it
 * was given, in order.
 */
export function askingAuthor(
  initial: () => Promise<Segment> = () => Promise.resolve(asking('{"asked":"which file?"}')),
  resume: (input: ResumeInput, count: number) => Promise<Segment> = () =>
    Promise.resolve(succeed({ kind: 'completed', value: 'done' })),
): CheckpointedToolExecutor<unknown, unknown, TestEnvironment> & {
  readonly resumed: ResumeInput[]
} {
  const resumed: ResumeInput[] = []
  return {
    resumed,
    checkpoint: {
      schema: { id: 'ask-state', revision: '1', digest: 'sha256:ask-state' },
      codec: STATE_CODEC,
      maxBytes: 1_024,
    },
    initial,
    resume: input => {
      const given = { state: new TextDecoder().decode(input.checkpoint), response: input.response }
      resumed.push(given)
      return resume(given, resumed.length)
    },
  }
}

type Execution = {
  readonly start: ToolStartRecord
  readonly source: DurableEvidence
  readonly batches: FactBatch[]
  readonly waiters: Set<() => void>
  /** The responses this execution's segment consumed: its resume's response. */
  consumed: string[]
  ended: boolean
  outcome:
    | null
    | Readonly<{ kind: 'completed' }>
    | Readonly<{ kind: 'suspended'; payload: DurableEvidence; state: string }>
}

export type CheckpointBinding = Readonly<{
  bindings: ToolBindings<Principal, TestEnvironment>
  /** The starts and resumes whose segment ran, in order. */
  readonly segments: string[]
  /** 各段执行收到的 stop，按到达顺序。 */
  readonly stops: ControlDispatch[]
  /** The suspensions the binding was asked to prove. */
  readonly suspensions: SuspensionRecord[]
}>

/**
 * A checkpointed binding. Its start consumes the permit, then runs the author's initial segment
 * once with a context of `emit` and `signal` only. A suspended segment publishes its Ask wait as
 * the last fact and ends the stream; `suspend` then proves the checkpoint of that segment.
 */
export function checkpointBinding(
  authority: ToolStartAuthority<Principal>,
  author: CheckpointedToolExecutor<unknown, unknown, TestEnvironment>,
): CheckpointBinding {
  const executions = new Map<string, Execution>()
  const segments: string[] = []
  const stops: ControlDispatch[] = []
  const suspensions: SuspensionRecord[] = []
  const publish = (execution: Execution, fact: ToolExecutionFact) => {
    const index = execution.batches.length + 1
    execution.batches.push({
      start: execution.start,
      source: execution.source,
      batch: `batch-${index}`,
      after: execution.batches.at(-1)?.cursor ?? null,
      cursor: `cursor-${index}`,
      events: [{ event: `event-${index}`, fact }],
    })
    for (const waiter of execution.waiters) waiter()
  }
  const end = (execution: Execution) => {
    execution.ended = true
    for (const waiter of execution.waiters) waiter()
  }
  /**
   * How a segment ended: a final, or the Ask wait it suspends on. The payload evidence binds the
   * digest of the state text and the request evidence the digest of the request text, as the
   * ledger checks them.
   */
  const finish = (execution: Execution, segment: Segment, resumed: boolean) => {
    const { start } = execution
    if ('ok' in segment && segment.ok.kind === 'suspended') {
      const state = Buffer.from(segment.ok.state).toString('base64')
      const payload = {
        ...evidence(`checkpoint/${start.operation}`, 'test-host'),
        digest: canonicalDigest(state),
      }
      const request = writeJsonText(segment.ok.wait.request)
      const { contract } = segment.ok.wait
      execution.outcome = { kind: 'suspended', payload, state }
      publish(execution, {
        kind: 'wait',
        request,
        value: {
          kind: 'ask',
          wait: `${start.operation}/wait` as never,
          resume: payload,
          request: {
            ...evidence(`request/${start.operation}`, 'test-host'),
            digest: canonicalDigest(request),
          },
          schemas: {
            contract: contract.adoption,
            request: contract.request.identity,
            response: contract.response.identity,
            requestMaxBytes: contract.request.maxBytes,
            responseMaxBytes: contract.response.maxBytes,
            expiry: 'forbidden',
            source: evidence(`schemas/${start.operation}`, 'test-host'),
          },
        },
      })
    } else {
      execution.outcome = { kind: 'completed' }
      // A resume segment that completes ends its call with a final.
      if (resumed) publish(execution, completedFinal())
    }
    end(execution)
  }
  const context = () => ({
    emit: () => Promise.resolve(succeed({ kind: 'local' as const, sequence: '1' })),
    signal: new AbortController().signal,
  })
  const run = async (execution: Execution, environment: TestEnvironment) => {
    segments.push(execution.start.operation)
    finish(execution, await author.initial(null, environment, context()), false)
  }
  /**
   * Runs the resume segment with what the driver gave: the state of the checkpoint and the
   * committed ResponseRecord of the wait that resumes there. The `continued` fact goes first, at
   * the point where the author gets the decision.
   */
  const runResume = async (
    execution: Execution,
    environment: TestEnvironment,
    kept: string,
    response: ResponseRecord,
  ) => {
    const { start } = execution
    const state = new Uint8Array(Buffer.from(kept, 'base64'))
    if (response.response.kind !== 'decision') throw new Error('not a decision')
    segments.push(start.operation)
    execution.consumed = [response.operation]
    publish(execution, {
      kind: 'continued',
      wait: response.wait,
      response: response.operation,
      timing: evidence(`continued/${start.operation}`, 'test-host'),
    })
    const decision: DecisionValue = response.response.value
    finish(
      execution,
      await author.resume({ checkpoint: state, response: decision }, environment, context()),
      true,
    )
  }
  const live = (execution: Execution): ToolLiveExecution => ({
    async *facts({ after, signal }) {
      let next =
        after === null ? 0 : execution.batches.findIndex(batch => batch.cursor === after) + 1
      while (!signal.aborted) {
        const batch = execution.batches[next]
        if (batch !== undefined) {
          next += 1
          yield batch
          continue
        }
        if (execution.ended) return
        await new Promise<void>(resolve => {
          const done = () => {
            execution.waiters.delete(done)
            resolve()
          }
          execution.waiters.add(done)
          signal.addEventListener('abort', done, { once: true })
        })
      }
    },
    acknowledge: receipt =>
      Promise.resolve(succeed(evidence(`ack/${receipt.start}/${receipt.batch}`, 'test-host'))),
    stop: control => {
      stops.push(control)
      return Promise.resolve(
        succeed({ kind: 'already-ended', evidence: evidence('ended') } satisfies ControlProgress),
      )
    },
    inspectControl: () =>
      Promise.resolve(succeed({ kind: 'pending', diagnostic: 'no control' } as ControlProgress)),
    answer: () => Promise.resolve(fail(refused('answer'))),
    inspectAnswer: () => Promise.resolve(fail(refused('inspectAnswer'))),
  })
  const proof = (suspension: SuspensionRecord): SuspensionProgress => {
    const execution = executions.get(suspension.start.operation)
    if (execution?.outcome === null || execution === undefined)
      return { kind: 'unknown', diagnostic: 'the segment has not returned' }
    if (execution.outcome.kind !== 'suspended')
      return { kind: 'not-suspended', evidence: evidence('completed') }
    return {
      kind: 'suspended',
      state: execution.outcome.state,
      checkpoint: {
        schema: suspension.schema,
        payload: execution.outcome.payload,
        closedResult: CLOSED_RESULT,
        start: suspension.start,
        consumedResponses: execution.consumed as never,
        effectBoundary: evidence(`boundary/${suspension.start.operation}`, 'test-host'),
        exclusion: evidence(`returned/${suspension.start.operation}`, 'test-host'),
      },
    }
  }
  /**
   * Consumes the permit, then runs the segment of `start` once: a repeated start or resume of the
   * same record answers the same execution and runs nothing again.
   */
  const launch = async (
    input: Readonly<{
      principal: Principal
      tenant: never
      call: never
      start: ToolStartRecord
      permit: Parameters<Checkpointed['start']>[0]['permit']
      request: Parameters<Checkpointed['start']>[0]['request']
    }>,
    segment: (execution: Execution) => Promise<void>,
  ): Promise<Outcome<ToolLiveExecution, ToolFailure>> => {
    const consumed = await authority.consume({
      request: input.request,
      principal: input.principal,
      tenant: input.tenant,
      call: input.call,
      permit: input.permit,
      executorReceipt: evidence(`capsule-${input.call}/${input.start.operation}`),
    })
    if ('failure' in consumed) return consumed
    if (consumed.ok.kind !== 'started')
      return fail({
        kind: 'unavailable',
        dependency: 'test-executor',
        diagnostic: consumed.ok.kind,
      })
    let execution = executions.get(input.start.operation)
    if (execution === undefined) {
      execution = {
        start: input.start,
        source: evidence(`source/${input.start.operation}`, 'test-host'),
        batches: [],
        waiters: new Set(),
        consumed: [],
        ended: false,
        outcome: null,
      }
      executions.set(input.start.operation, execution)
      void segment(execution)
    }
    return succeed(live(execution))
  }
  const binding: Checkpointed = {
    kind: 'checkpointed',
    checkpointSchema: STATE_CODEC,
    start: (input, environment) => launch(input as never, execution => run(execution, environment)),
    inspectStart: input => {
      const execution = executions.get(input.start.operation)
      return Promise.resolve(
        succeed(
          execution === undefined
            ? { kind: 'not-started', exclusion: evidence('never-started') }
            : { kind: 'live', execution: live(execution) },
        ),
      )
    },
    suspend: suspension => {
      suspensions.push(suspension)
      return Promise.resolve(succeed(proof(suspension)))
    },
    inspectSuspension: suspension => Promise.resolve(succeed(proof(suspension))),
    resume: (input, environment) =>
      launch(input as never, execution =>
        runResume(execution, environment, input.state, input.response).catch(() => {
          execution.outcome = { kind: 'completed' }
          end(execution)
        }),
      ),
  }
  const recovered = (start: ToolStartRecord) => {
    const execution = executions.get(start.operation)
    return execution === undefined ? null : live(execution)
  }
  return {
    segments,
    stops,
    suspensions,
    bindings: {
      inspect: () => Promise.reject(new Error("inspect is the Catalog's")),
      resolve: () => Promise.resolve(succeed(binding)),
      recover: input => {
        const execution = recovered(input.start)
        if (execution === null) return Promise.resolve(fail(refused('recover')))
        return Promise.resolve(
          succeed({
            acknowledge: execution.acknowledge,
            inspectStart: start => binding.inspectStart({ ...input, start }),
            inspectSuspension: binding.inspectSuspension,
            stop: execution.stop,
            inspectControl: execution.inspectControl,
          }),
        )
      },
    },
  }
}

function refused(name: string): ToolFailure {
  return {
    kind: 'unavailable',
    dependency: 'test-checkpoint-binding',
    diagnostic: `${name} is not in this double`,
  }
}

/** How the scripted decision owner answers a new registration. */
export type BridgeScript = 'registers' | 'answer-lost' | 'refuses'

/** 脚本化决策方怎样答复新的失效。两种都保存这次失效。 */
export type InvalidationScript = 'answers' | 'answer-lost'

export type ScriptedBridge = ToolDecisionBridge<Principal> &
  Readonly<{
    script(next: BridgeScript): void
    /** 之后的失效怎样答复。 */
    invalidation(next: InvalidationScript): void
    /** The person decides the registered wait `wait`: inspect reports it, resolve answers `value`. */
    decide(wait: string, value: DecisionValue): void
    /** Every ensure, with its operation, wait and request. */
    readonly ensured: Readonly<{ operation: string; wait: string; request: DurableEvidence }>[]
    /** Every inspectOperation, with its operation. */
    readonly inspected: string[]
    /** Every resolve, with its wait. */
    readonly resolved: string[]
    /** 每次 invalidate 的操作、等待与终局证据。 */
    readonly invalidated: Readonly<{ operation: string; wait: string; terminal: DurableEvidence }>[]
  }>

/**
 * A decision owner that keeps its registrations in memory by call and operation. `registers`
 * answers the registration; `answer-lost` keeps it and loses the answer (commit-unknown); `refuses`
 * answers a definite refusal and keeps nothing. The same operation with the same input recalls the
 * registration; with another input it is a conflict. `inspect` reports a registered wait with no
 * decision until `decide` is called; `resolve` then answers the decided value for that very
 * decision evidence and refuses any other.
 */
export function scriptedBridge(initial: BridgeScript = 'registers'): ScriptedBridge {
  let mode = initial
  let invalidation: InvalidationScript = 'answers'
  const invalidations = new Map<string, DurableEvidence>()
  const invalidated: { operation: string; wait: string; terminal: DurableEvidence }[] = []
  const registrations = new Map<
    string,
    Readonly<{ digest: string; registration: DurableEvidence }>
  >()
  const ensured: { operation: string; wait: string; request: DurableEvidence }[] = []
  const inspected: string[] = []
  const resolved: string[] = []
  const decisions = new Map<string, Readonly<{ decision: DurableEvidence; value: DecisionValue }>>()
  const registered = new Map<string, DurableEvidence>()
  const keyOf = (call: string, operation: string) => JSON.stringify([call, operation])
  return {
    script: next => {
      mode = next
    },
    invalidation: next => {
      invalidation = next
    },
    invalidated,
    ensured,
    inspected,
    resolved,
    decide: (wait, value) => {
      decisions.set(wait, { decision: evidence(`decision/${wait}`, 'test-decisions'), value })
    },
    ensure: input => {
      ensured.push({ operation: input.operation, wait: input.wait, request: input.request })
      const key = keyOf(input.call, input.operation)
      const digest = canonicalDigest([input.wait, input.request])
      const known = registrations.get(key)
      if (known !== undefined)
        return Promise.resolve(
          known.digest === digest
            ? succeed(known.registration)
            : fail({ kind: 'conflict', operation: input.operation }),
        )
      if (mode === 'refuses')
        return Promise.resolve(fail({ kind: 'denied', action: 'register-wait' }))
      const registration = evidence(`registration/${input.wait}`, 'test-decisions')
      registrations.set(key, { digest, registration })
      registered.set(input.wait, registration)
      return Promise.resolve(
        mode === 'answer-lost'
          ? fail({ kind: 'commit-unknown', operation: input.operation })
          : succeed(registration),
      )
    },
    inspectOperation: input => {
      inspected.push(input.operation)
      const kept = invalidations.get(keyOf(input.call, input.operation))
      if (kept !== undefined)
        return Promise.resolve(
          succeed({ kind: 'committed', operation: input.operation, receipt: kept } as const),
        )
      const known = registrations.get(keyOf(input.call, input.operation))
      const resolution: ExternalOperationResolution =
        known === undefined
          ? { kind: 'excluded', operation: input.operation, exclusion: evidence('no-registration') }
          : { kind: 'committed', operation: input.operation, receipt: known.registration }
      return Promise.resolve(succeed(resolution))
    },
    inspect: input => {
      const registration = registered.get(input.wait)
      if (registration === undefined)
        return Promise.resolve(fail({ kind: 'invalid', field: 'wait', reason: 'not-registered' }))
      const decided = decisions.get(input.wait)
      return Promise.resolve(succeed({ registration, decision: decided?.decision ?? null }))
    },
    resolve: input => {
      resolved.push(input.wait)
      const decided = decisions.get(input.wait)
      return Promise.resolve(
        decided !== undefined &&
          canonicalDigest(decided.decision) === canonicalDigest(input.decision)
          ? succeed(decided.value)
          : fail({ kind: 'invalid', field: 'decision', reason: 'not-the-decision' }),
      )
    },
    // 失效按操作保存：同一操作重送认回原失效。`answer-lost` 保存失效后丢失回包。
    invalidate: input => {
      invalidated.push({ operation: input.operation, wait: input.wait, terminal: input.terminal })
      const key = keyOf(input.call, input.operation)
      const receipt =
        invalidations.get(key) ?? evidence(`invalidated/${input.wait}`, 'test-decisions')
      invalidations.set(key, receipt)
      return Promise.resolve(
        invalidation === 'answer-lost'
          ? fail({ kind: 'commit-unknown', operation: input.operation })
          : succeed(receipt),
      )
    },
  }
}
