// @module-tag slow — every case starts a real MCP server (a Node or Python process, or a local
// HTTP server) and drives it through `createMcp` and the local transport.
// C4 and MC3-12: the journey S1–S7 is a table; each target runs the steps that apply to it, and
// the kinds of outcome of the two modern transports on server-everything are compared whole.
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CallOutcome,
  CorrelationKey,
  DefinitionDigest,
  DeliveredContent,
  EndpointRef,
  InvokeResult,
  TaskRef,
} from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
} from '@omne-harness/mcp-contract/testing'
import { ALICE, assemble, type Assembly } from './assembly.ts'
import { leftover } from '../fixtures/scripted/children.ts'
import { TARGETS, type StartedTarget, type Target, type TargetId } from './targets.ts'

const CASE_TIMEOUT_MS = 100_000
const TASK_POLLS = 40
const TASK_POLL_INTERVAL_MS = 500
/** How long S6 lets the request travel before it cancels. */
const SEND_GRACE_MS = 300

type StepId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7'

/** What a step observed: the kinds of outcome in the order they happened, joined by `>`. */
type Reading = Readonly<{ step: StepId; kind: string }>

type Context = Readonly<{
  assembly: Assembly
  ref: EndpointRef
  started: StartedTarget
  nextKey: () => CorrelationKey
}>

type JourneyStep = Readonly<{
  id: StepId
  does: string
  /** The kinds the step must observe. */
  expected: string
  /** The targets the step applies to. */
  applies: readonly TargetId[]
  run(context: Context): Promise<string>
}>

const ALL: readonly TargetId[] = ['E-stdio', 'E-http', 'E-sse', 'F', 'P']
const MODERN_EVERYTHING: readonly TargetId[] = ['E-stdio', 'E-http']

function ok<T, F>(outcome: Outcome<T, F>, what: string): T {
  if (!('ok' in outcome)) throw new Error(`${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function sentOutcome(result: InvokeResult, what: string): CallOutcome {
  if (result.kind !== 'sent') throw new Error(`${what} was not sent: ${JSON.stringify(result)}`)
  return result.outcome
}

function textOf(content: readonly DeliveredContent[]): string {
  return content
    .flatMap(item => (item.kind === 'block' && item.block.kind === 'text' ? [item.block.text] : []))
    .join('\n')
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function digestOf(context: Context, tool: string): Promise<DefinitionDigest> {
  const view = ok(await context.assembly.services.discovery.current(ALICE, context.ref), 'current')
  if (view.kind !== 'acquired') throw new Error('the catalog is not acquired')
  const known = view.actions.find(action => action.name === tool)
  if (known === undefined) throw new Error(`the catalog has no action ${tool}`)
  return known.definitionDigest
}

async function invoke(
  context: Context,
  call: { tool: string; args: unknown },
  signal = new AbortController().signal,
) {
  return context.assembly.services.invoker.invoke(ALICE, {
    ref: context.ref,
    action: actionNameOf(call.tool),
    args: jsonOf(call.args),
    expectedDefinition: await digestOf(context, call.tool),
    correlationKey: context.nextKey(),
    signal,
  })
}

function callsOf(context: Context) {
  return context.started.calls
}

const JOURNEY: readonly JourneyStep[] = [
  {
    id: 'S1',
    does: 'discovery.refresh publishes a catalog with the known tool',
    expected: 'published',
    applies: ALL,
    async run(context) {
      const refreshed = ok(
        await context.assembly.services.discovery.refresh(ALICE, { ref: context.ref }),
        'refresh',
      )
      if (refreshed.kind !== 'published') return refreshed.kind
      const view = ok(
        await context.assembly.services.discovery.current(ALICE, context.ref),
        'current',
      )
      expect(view.kind, 'S1: the catalog is acquired').toBe('acquired')
      const names = view.kind === 'acquired' ? view.actions.map(action => action.name) : []
      expect(names, 'S1: the listing has the known tool').toContain(callsOf(context).known)
      const { peer } = ok(
        await context.assembly.services.discovery.peer(ALICE, context.ref),
        'peer',
      )
      expect(peer.protocolVersion, 'S1: the negotiated revision').toBe(context.started.revision)
      return refreshed.kind
    },
  },
  {
    id: 'S2',
    does: 'invoker.invoke of a read-only tool completes',
    expected: 'complete',
    applies: ALL,
    async run(context) {
      const { readOnly } = callsOf(context)
      const outcome = sentOutcome(await invoke(context, readOnly), 'S2')
      if (outcome.kind === 'complete')
        expect(textOf(outcome.content), 'S2: the content of the answer').toContain(readOnly.text)
      return outcome.kind
    },
  },
  {
    id: 'S3',
    does: 'invoker.invoke of a call the server answers with isError is a toolError',
    expected: 'toolError',
    applies: ALL,
    async run(context) {
      const outcome = sentOutcome(await invoke(context, callsOf(context).toolError), 'S3')
      if (outcome.kind === 'toolError')
        expect(textOf(outcome.content), 'S3: the server says why').not.toBe('')
      return outcome.kind
    },
  },
  {
    id: 'S4',
    does: 'a tool that asks for input is inputRequired, and continueWithInput completes it',
    expected: 'inputRequired>complete',
    applies: MODERN_EVERYTHING,
    async run(context) {
      const input = callsOf(context).input
      if (input === undefined) throw new Error('the target has no input call')
      const first = sentOutcome(await invoke(context, input.call), 'S4 first')
      if (first.kind !== 'inputRequired') return first.kind
      const second = sentOutcome(
        await context.assembly.services.invoker.continueWithInput(ALICE, {
          ref: context.ref,
          action: actionNameOf(input.call.tool),
          args: jsonOf(input.call.args),
          ...(first.requestState === undefined ? {} : { requestState: first.requestState }),
          inputResponses: jsonOf(input.answer),
          issuedAt: first.issuedAt,
          correlationKey: context.nextKey(),
          signal: new AbortController().signal,
        }),
        'S4 second',
      )
      if (second.kind === 'complete')
        expect(textOf(second.content), 'S4: the server read the answer').toContain(
          input.expectedText,
        )
      return `${first.kind}>${second.kind}`
    },
  },
  {
    id: 'S5',
    does: 'a tool answered with a task: queryTask reaches completed and taskResult completes',
    expected: 'task>completed>complete',
    applies: MODERN_EVERYTHING,
    async run(context) {
      const task = callsOf(context).task
      if (task === undefined) throw new Error('the target has no task call')
      const started = sentOutcome(await invoke(context, task.call), 'S5 invoke')
      if (started.kind !== 'task') return started.kind
      const ref: TaskRef = { ref: context.ref, taskId: started.taskId, issuedAt: started.issuedAt }
      const invoker = context.assembly.services.invoker
      let status = 'unqueried'
      let answered = false
      for (let poll = 0; poll < TASK_POLLS; poll += 1) {
        const report = ok(await invoker.queryTask(ALICE, ref), 'queryTask')
        if (report === 'expired') return 'expired'
        status = report.status
        if (status === 'completed' || status === 'failed' || status === 'cancelled') break
        if (status === 'input_required' && !answered) {
          ok(await invoker.provideTaskInput(ALICE, ref, jsonOf(task.answer)), 'provideTaskInput')
          answered = true
        }
        await sleep(TASK_POLL_INTERVAL_MS)
      }
      expect(answered, 'S5: the task asked for input and got the answer').toBe(true)
      if (status !== 'completed') return `${started.kind}>${status}`
      const result = ok(await invoker.taskResult(ALICE, ref), 'taskResult')
      const resultKind = typeof result === 'string' ? result : result.kind
      if (typeof result !== 'string' && result.kind === 'complete')
        expect(textOf(result.content), 'S5: the report of the task').toContain('Research Report')
      return `${started.kind}>${status}>${resultKind}`
    },
  },
  {
    id: 'S6',
    does: 'cancel after the request left is signalled, and the call ends as unknown (abandoned)',
    expected: 'signalled>unknown:abandoned',
    applies: ['E-stdio', 'E-http', 'E-sse'],
    async run(context) {
      const long = callsOf(context).long
      if (long === undefined) throw new Error('the target has no long call')
      const key = context.nextKey()
      const digest = await digestOf(context, long.tool)
      const invoking = context.assembly.services.invoker.invoke(ALICE, {
        ref: context.ref,
        action: actionNameOf(long.tool),
        args: jsonOf(long.args as JsonValue),
        expectedDefinition: digest,
        correlationKey: key,
        signal: new AbortController().signal,
      })
      await sleep(SEND_GRACE_MS)
      const answer = await context.assembly.services.invoker.cancel(ALICE, key)
      const result = await invoking
      const outcome = sentOutcome(result, 'S6')
      return `${answer}>${outcome.kind}${outcome.kind === 'unknown' ? `:${outcome.cause}` : ''}`
    },
  },
  {
    id: 'S7',
    does: 'connections.release is released with the confirmed stop range and leaves no process',
    expected: 'released',
    applies: ALL,
    async run(context) {
      const report = ok(
        await context.assembly.services.connections.release(ALICE, context.ref),
        'release',
      )
      if (report.kind !== 'released') return report.kind
      expect(report.process, 'S7: the confirmed stop range').toBe(context.started.released)
      if (context.started.released === 'root-only')
        expect(await leftover(), 'S7: processes left alive after release').toEqual([])
      return report.kind
    },
  },
]

const readings = new Map<TargetId, readonly Reading[]>()

async function journey(target: Target): Promise<void> {
  const started = await target.start()
  try {
    const assembly = assemble()
    const ref = endpointRefOf(`e2e-${target.id.toLowerCase()}`)
    assembly.adopt(ref, started.adoption)
    let counter = 0
    const context: Context = {
      assembly,
      ref,
      started,
      nextKey: () => correlationKeyOf(`${target.id}-${(counter += 1)}`),
    }
    const taken: Reading[] = []
    for (const step of JOURNEY.filter(candidate => candidate.applies.includes(target.id))) {
      const kind = await step.run(context)
      taken.push({ step: step.id, kind })
      expect(kind, `${step.id} on ${target.id}: ${step.does}`).toBe(step.expected)
    }
    readings.set(target.id, taken)
    console.info(
      `journey ${target.id}: ${taken.map(reading => `${reading.step}=${reading.kind}`).join(' ')}`,
    )
  } finally {
    await started.close()
  }
}

afterEach(async () => {
  expect(await leftover(), 'child processes left alive').toEqual([])
})

for (const target of TARGETS) {
  describe.skipIf(target.unavailable !== undefined)(
    target.unavailable ?? `${target.id}: ${target.title}`,
    () => {
      it(
        `${target.id}: createMcp on the local transport runs the journey on ${target.title}`,
        () => journey(target),
        CASE_TIMEOUT_MS,
      )
    },
  )
}

describe('the two modern transports (MC3-12)', () => {
  it('E-stdio and E-http answer the same kind of outcome at every step S1 to S7', () => {
    const stdio = readings.get('E-stdio')
    const http = readings.get('E-http')
    expect(stdio, 'E-stdio journey ran').toBeDefined()
    expect(http, 'E-http journey ran').toBeDefined()
    expect(stdio?.map(reading => `${reading.step}:${reading.kind}`)).toEqual(
      http?.map(reading => `${reading.step}:${reading.kind}`),
    )
    expect(stdio?.map(reading => reading.step)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'])
  })
})
