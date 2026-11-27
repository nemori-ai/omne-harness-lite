import { describe, expect, it } from 'vitest'
import { toContentBlocks, type InvokeResult } from '@omne-harness/mcp-contract'
import {
  createMemoryContinuationRecords,
  generationOf,
  jsonOf,
  taskIdOf,
} from '@omne-harness/mcp-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import type { ToolCommandDeclaration, ToolDecision } from '@omne-harness/tool-contract'
import {
  defineToolWaitContract,
  describedAdoption,
  isToolSourceSuspension,
  type ToolSourceCall,
  type ToolSourceSuspension,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import { decodeKept } from '../src/continuation.ts'
import { mcpTaskWait, type McpPersonAsk } from '../src/index.ts'
import { action } from './support.ts'
import { alice, home, world, type Principal } from './world.ts'

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 4096,
  }
}

const defined = defineToolWaitContract({
  kind: 'ask',
  adoption: describedAdoption({ owner: 'test', name: 'person', revision: '1' }),
  request: schema('person-request'),
  response: schema('person-response'),
  expiry: 'forbidden',
})
if ('failure' in defined) throw new Error('the wait contract of the test is not lawful')

const person: McpPersonAsk = {
  contract: defined.ok,
  request: questions => jsonOf({ questions: questions.map(question => question.id) }),
  reply(decision) {
    if (decision.kind !== 'answer')
      return { kind: decision.kind === 'declined' ? 'declined' : 'no-answer' }
    const value = decision.value as Record<string, string>
    return {
      kind: 'answered',
      answers: new Map(Object.entries(value).map(([id, text]) => [id, { kind: 'text', text }])),
    }
  },
}

const task = (id = 't1'): InvokeResult => ({
  kind: 'sent',
  outcome: { kind: 'task', taskId: taskIdOf(id), issuedAt: generationOf(4) },
})

const ASK_DAY = {
  when: {
    method: 'elicitation/create',
    params: {
      message: 'Which day?',
      requestedSchema: {
        type: 'object',
        properties: { date: { type: 'string' } },
        required: ['date'],
      },
    },
  },
}

function arranged(followTasks = true, maxInputRounds = 3) {
  const records = createMemoryContinuationRecords()
  const w = world(50, { person, continuations: () => records, maxInputRounds, followTasks })
  w.adopt(home, 'desk')
  w.offers('desk', [action('report', { inputSchema: { type: 'object' } })])
  return { w, records }
}

async function declaredOf(w: ReturnType<typeof world>): Promise<ToolCommandDeclaration> {
  await w.source.list(alice)
  const definition = w.source.select(alice, 'mcp__desk')?.definition
  const found = definition?.kind === 'commands' ? definition.commands[0] : undefined
  if (found === undefined) throw new Error('report is not selected')
  return found
}

const callOf = (declared: ToolCommandDeclaration): ToolSourceCall<Principal> => ({
  ...alice,
  name: 'mcp__desk',
  command: declared.name,
  declared,
  arguments: jsonOf({ topic: 'latency' }),
  invocation: 'call-1',
  program: false,
  signal: new AbortController().signal,
})

async function parked(w: ReturnType<typeof world>) {
  w.answers(() => task())
  const call = callOf(await declaredOf(w))
  const answer = await w.source.execute(call)
  if (!isToolSourceSuspension(answer)) throw new Error('the call did not wait for its task')
  return { call, suspension: answer }
}

const resumeOf = (
  call: ToolSourceCall<Principal>,
  suspension: ToolSourceSuspension,
  response: ToolDecision<unknown>,
) => {
  const { arguments: _arguments, ...facts } = call
  return { ...facts, checkpoint: suspension.state, response }
}

const arrival = (value: unknown): ToolDecision<unknown> => ({ kind: 'answer', value })

const REPORT = {
  kind: 'complete',
  content: toContentBlocks([jsonOf({ type: 'text', text: 'Report: 3 findings.' })]),
  output: { kind: 'no-schema' },
} as const

describe('a peer that makes the call a task (C111, MC-28, MC-29)', () => {
  it('the call waits for its task: the checkpoint names it in round one, the wait asks the watcher, and nothing is cancelled', async () => {
    const { w } = arranged()
    const { suspension } = await parked(w)
    expect(suspension.wait).toMatchObject({
      kind: 'ask',
      key: 'task',
      contract: mcpTaskWait,
      request: jsonOf({
        endpoint: 'desk',
        holding: 'tenant/desk',
        task: 't1',
        issuedAt: 4,
        round: 1,
      }),
    })
    expect(decodeKept(suspension.state)).toMatchObject({
      on: 'task',
      task: { taskId: 't1', issuedAt: 4, round: 1 },
      action: 'report',
    })
    expect(suspension.closedResult).toContain('desk')
    expect(w.cancelledTasks).toEqual([])
    expect(w.source.checkpoint?.waits).toEqual([person.contract, mcpTaskWait])
  })

  it('without a watcher here, a task is asked to cancel and the effect is not known, as before', async () => {
    const { w } = arranged(false)
    w.answers(() => task())
    await expect(w.source.execute(callOf(await declaredOf(w)))).rejects.toThrow('long-running task')
    expect(w.cancelledTasks).toHaveLength(1)
    expect(w.source.checkpoint?.waits).toEqual([person.contract])
  })

  it('a task that finished is read once, and the call ends with what the peer gave', async () => {
    const { w } = arranged()
    const { call, suspension } = await parked(w)
    w.resultsIn(() => succeed(REPORT))
    const answer = await w.source.resume?.(
      resumeOf(call, suspension, arrival({ kind: 'terminal', status: 'completed' })),
    )
    expect(answer).toMatchObject({ content: [{ kind: 'text' }] })
    expect(w.results).toEqual([
      {
        ref: { name: 'desk', holding: 'tenant/desk' },
        taskId: 't1',
        issuedAt: 4,
        connectBound: 7000,
      },
    ])
  })

  it.each([
    ['expired', { kind: 'expired' }, 'expired at the endpoint before it finished'],
    ['not known', { kind: 'unknown' }, 'no longer knows its task'],
  ])(
    'a task that %s ends the call as not known, and reads nothing',
    async (_label, value, words) => {
      const { w } = arranged()
      const { call, suspension } = await parked(w)
      await expect(w.source.resume?.(resumeOf(call, suspension, arrival(value)))).rejects.toThrow(
        words,
      )
      expect(w.results).toEqual([])
    },
  )

  it.each([
    ['not-finished', 'said its task ended, then that it had not'],
    ['expired', 'expired at the endpoint before the result was read'],
    ['cancelled', 'cancelled its task'],
  ] as const)('a result read as %s is not a completion', async (read, words) => {
    const { w } = arranged()
    const { call, suspension } = await parked(w)
    w.resultsIn(() => succeed(read))
    await expect(
      w.source.resume?.(
        resumeOf(call, suspension, arrival({ kind: 'terminal', status: 'completed' })),
      ),
    ).rejects.toThrow(words)
  })

  it('a result that cannot be read leaves the call not known', async () => {
    const { w } = arranged()
    const { call, suspension } = await parked(w)
    w.resultsIn(() => ({ failure: { kind: 'effect-unknown', cause: 'no-connection' } }))
    await expect(
      w.source.resume?.(
        resumeOf(call, suspension, arrival({ kind: 'terminal', status: 'failed' })),
      ),
    ).rejects.toThrow('the result of its task could not be read')
  })

  it('an answer of the task wait this bridge did not give out is refused', async () => {
    const { w } = arranged()
    const { call, suspension } = await parked(w)
    await expect(
      w.source.resume?.(resumeOf(call, suspension, arrival({ kind: 'arrived' }))),
    ).rejects.toThrow('not one this bridge gave out')
  })

  it('a continuation the peer makes a task waits for that task', async () => {
    const { w } = arranged()
    w.answers(() => ({
      kind: 'sent',
      outcome: {
        kind: 'inputRequired',
        inputRequests: { untrusted: jsonOf(ASK_DAY) },
        issuedAt: generationOf(1),
      },
    }))
    const call = callOf(await declaredOf(w))
    const asked = await w.source.execute(call)
    if (!isToolSourceSuspension(asked)) throw new Error('did not ask')
    w.continuesWith(() => task('t9'))
    const next = await w.source.resume?.(resumeOf(call, asked, arrival({ q1: 'Tuesday' })))
    if (next === undefined || !isToolSourceSuspension(next)) throw new Error('did not wait')
    expect(decodeKept(next.state)).toMatchObject({ on: 'task', task: { taskId: 't9', round: 1 } })
  })
})

describe('a task that asks a person for input (C111)', () => {
  async function asking(w: ReturnType<typeof world>) {
    const { call, suspension } = await parked(w)
    const inputRequests = jsonOf(ASK_DAY)
    const asked = await w.source.resume?.(
      resumeOf(call, suspension, arrival({ kind: 'input', inputRequests: ASK_DAY })),
    )
    if (asked === undefined || !isToolSourceSuspension(asked)) throw new Error('did not ask')
    return { call, asked, inputRequests }
  }

  it('the questions of the task go to a person, and the checkpoint still names the task', async () => {
    const { w } = arranged()
    const { asked } = await asking(w)
    expect(asked.wait).toMatchObject({ key: 'input', contract: person.contract })
    expect(decodeKept(asked.state)).toMatchObject({
      on: 'person',
      task: { taskId: 't1', round: 1 },
    })
    expect(w.inputs).toEqual([])
  })

  it('the answer goes to the task once by tasks/update, and the call waits for the task again in the next round', async () => {
    const { w, records } = arranged()
    const { call, asked } = await asking(w)
    const resume = resumeOf(call, asked, arrival({ q1: 'Tuesday' }))
    const again = await w.source.resume?.(resume)
    if (again === undefined || !isToolSourceSuspension(again)) throw new Error('did not wait again')
    expect(w.inputs).toHaveLength(1)
    expect(w.inputs[0]?.responses).toEqual(
      jsonOf({ when: { action: 'accept', content: { date: 'Tuesday' } } }),
    )
    expect(again.wait).toMatchObject({
      key: 'task',
      request: jsonOf({
        endpoint: 'desk',
        holding: 'tenant/desk',
        task: 't1',
        issuedAt: 4,
        round: 2,
      }),
    })
    expect(decodeKept(again.state)).toMatchObject({ on: 'task', round: 2, task: { round: 2 } })
    expect(records.marks()).toHaveLength(1)
    await expect(w.source.resume?.(resume)).rejects.toThrow('was already sent once')
    expect(w.inputs).toHaveLength(1)
  })

  it('what cannot be put to a person goes to the task as cancel, marked first', async () => {
    const { w, records } = arranged()
    const { call, suspension } = await parked(w)
    const unaskable = {
      when: {
        method: 'elicitation/create',
        params: { requestedSchema: { type: 'object', properties: { a: { type: 'array' } } } },
      },
    }
    const again = await w.source.resume?.(
      resumeOf(call, suspension, arrival({ kind: 'input', inputRequests: unaskable })),
    )
    expect(again !== undefined && isToolSourceSuspension(again)).toBe(true)
    expect(w.inputs[0]?.responses).toEqual(jsonOf({ when: { action: 'cancel' } }))
    expect(records.marks()).toHaveLength(1)
  })

  it('a task that asks for input without saying what gets an empty answer at once, marked first', async () => {
    const { w, records } = arranged()
    const { call, suspension } = await parked(w)
    const again = await w.source.resume?.(resumeOf(call, suspension, arrival({ kind: 'input' })))
    expect(again !== undefined && isToolSourceSuspension(again)).toBe(true)
    expect(w.inputs[0]?.responses).toEqual(jsonOf({}))
    expect(records.marks()).toHaveLength(1)
  })

  it('questions of the task that do not fit one request go to the task as cancel', async () => {
    const records = createMemoryContinuationRecords()
    const tooBig: McpPersonAsk = { ...person, request: () => undefined }
    const w = world(50, {
      person: tooBig,
      continuations: () => records,
      maxInputRounds: 3,
      followTasks: true,
    })
    w.adopt(home, 'desk')
    w.offers('desk', [action('report', { inputSchema: { type: 'object' } })])
    const { call, suspension } = await parked(w)
    await w.source.resume?.(
      resumeOf(call, suspension, arrival({ kind: 'input', inputRequests: ASK_DAY })),
    )
    expect(w.inputs[0]?.responses).toEqual(jsonOf({ when: { action: 'cancel' } }))
  })

  it('input the task may not have taken leaves the call not known', async () => {
    const { w } = arranged()
    const { call, asked } = await asking(w)
    w.inputsAnswer(() => ({ failure: { kind: 'effect-unknown', cause: 'abandoned' } }))
    await expect(
      w.source.resume?.(resumeOf(call, asked, arrival({ q1: 'Tuesday' }))),
    ).rejects.toThrow('the input for its task may not have arrived')
  })

  it('a task that keeps asking past the bound ends the call as not known; a request that is not a form breaks the contract', async () => {
    const { w } = arranged(true, 0)
    const { call, suspension } = await parked(w)
    await expect(
      w.source.resume?.(
        resumeOf(call, suspension, arrival({ kind: 'input', inputRequests: ASK_DAY })),
      ),
    ).rejects.toThrow('asked for input more than 0 times')
    const other = arranged()
    const second = await parked(other.w)
    await expect(
      other.w.source.resume?.(
        resumeOf(
          second.call,
          second.suspension,
          arrival({ kind: 'input', inputRequests: { x: { method: 'sampling/createMessage' } } }),
        ),
      ),
    ).rejects.toThrow('a kind of input this version did not offer')
    expect(other.w.inputs).toEqual([])
  })
})
