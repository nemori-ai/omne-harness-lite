import type {
  ProgramAnswer,
  ProgramCall,
  ProgramLimits,
  ProgramOutcome,
  ProgramRun,
} from '@omne-harness/execution-environment-contract'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  programToolsOf,
  type ProgramCallAnswer,
  type ProgramFunction,
  type ProgramTools,
} from '@omne-harness/tool-contract'
import {
  PROGRAM_FAILURE,
  describedAdoption,
  functionsSignature,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createAuthor, type CommandGates } from './author.ts'
import { codeCommands } from './commands.ts'
import type { CodeAuthorEnvironment } from './environment.ts'
import { limitField } from './pictures.ts'
import { parseConstruction, type Arguments } from './protocol.ts'
import { confirmation } from './text.ts'

type Limits = ProgramLimits & Readonly<{ inFlight: number }>

const CODE_GATES: CommandGates = {
  gates: [{ id: 'run', title: '运行程序', default: 'auto' }],
  of: { execute: 'run', help: 'run' },
}

const RULES = `Program
- code is the body of an async function, written in TypeScript. Top-level await and return work. Type annotations are erased before the run; enum, namespace and decorators are not accepted.
- The value you return is the result you receive, as JSON. console.log lines are returned too. Return only what you need: nothing else from the program reaches you.
- input (optional JSON) is the constant input.

Calling tools
- Each callable tool is a global object named like the tool, and each of its commands is a function: await Files.read({ path: "a.txt" }). A function takes one object and resolves to the declared value, not to text. The same objects are also on tools.
- Each call is a real tool call. It is permission-checked on its own and its effects are real.
- Always await a call, or pass the promises to Promise.all. Independent calls can run together with Promise.all.
- A call that does not complete throws ${PROGRAM_FAILURE} with kind, tool, command, effect and message. Catch it to continue. An uncaught error fails the program.

Not available
- No file system, network, timers, imports, require, process or fetch. Use the tools for files and the network.
- Nothing is kept between programs. Each execute starts empty.
- A failed program is never rerun. Calls that completed before the failure keep their effects, so check before you repeat them.
- Let the program count, sort and compute. Do not do that by reading.`

const GUIDE = `Code runs a short TypeScript program that calls tools as functions and returns only what you choose. The results of the calls stay inside the program and do not enter the conversation. Use it when the work takes several tool calls whose results you only filter, combine or loop over. Use it also when a result will be large and you need a small part of it, for example a web page, a long file or many matches: make that call inside the program and return only the part you need. Call a tool directly when one or two small calls give you the answer.

${RULES}

help gives the limits here and the functions a program can call now, with their parameter and return types.`

const limitsLine = (limits: Limits) =>
  `Limits: ${limits.computeMs / 1000} s of computing (waiting for a call does not count), ${Math.floor(limits.memoryBytes / 1048576)} MiB of memory, ${limits.calls} tool calls with at most ${limits.inFlight} at once, ${limits.outputBytes} bytes of result.`

function byTool(functions: readonly ProgramFunction[]) {
  const tools = new Map<string, ProgramFunction[]>()
  for (const one of functions) tools.set(one.tool, [...(tools.get(one.tool) ?? []), one])
  return tools
}

const DECLARED = `declare class ${PROGRAM_FAILURE} extends Error { kind: string; tool: string; command: string | null; effect: "none" | "occurred" | "unknown" }\ndeclare const input: unknown`

/** The capability of this call and what a program can call through it now, or why there is none. */
async function callable(execution: ToolExecutionContext, command: string) {
  const tools = programToolsOf(execution)
  if (tools === undefined)
    return `rejected reason=unavailable Code ${command}: program calls are not attached to this call`
  const listed = await tools.functions()
  return 'failure' in listed
    ? `rejected reason=unavailable Code ${command}: ${listed.failure.kind}`
    : { tools, functions: listed.ok }
}

async function helpText(execution: ToolExecutionContext, limits: Limits, name: string | undefined) {
  const known = await callable(execution, 'help')
  if (typeof known === 'string') return known
  const all = byTool(known.functions)
  if (name === undefined) {
    const signatures = [...all.values()].map(functionsSignature).join('\n')
    return `done Code help\n${RULES}\n\n${limitsLine(limits)}\n\nCallable now\n${signatures}\n${DECLARED}`
  }
  const one = all.get(name)
  return one === undefined
    ? `rejected reason=notFound Code help: ${name} has no function a program can call now. Callable: ${[...all.keys()].join(', ') || 'none'}`
    : `done Code help ${name}\n${functionsSignature(one)}`
}

function failureOf(one: ProgramFunction | undefined, entry: string, answer: ProgramCallAnswer) {
  if (answer.kind === 'value') return null
  const { kind, effect, message } = answer.failure
  const text = (value: string | null): JsonValue =>
    value === null ? { kind: 'null' } : { kind: 'string', value }
  const [tool = entry, command = null] =
    one === undefined ? entry.split('.') : [one.tool, one.command]
  return {
    kind: 'failure',
    name: PROGRAM_FAILURE,
    message: `${entry}: ${message}`,
    properties: [
      { key: 'kind', value: text(kind) },
      { key: 'tool', value: text(tool) },
      { key: 'command', value: text(command) },
      { key: 'effect', value: text(effect) },
    ],
  } satisfies ProgramAnswer
}

const NOTE = 'Calls that completed keep their effects. The program is not rerun.'
const consoleOf = (text: string) => (text.length === 0 ? '' : `\nconsole:\n${text}`)
const at = (line: number | null) => (line === null ? '' : ` line=${line}`)

/** What usually went wrong when a program is not accepted, said once. */
function hint(message: string, code: string): string {
  if (/\b(import|export|require)\b/u.test(message))
    return '\nThere is nothing to import: each tool is a global object, for example await Files.read({ path }).'
  return !code.includes('\n') && code.includes('\\n')
    ? '\nThe code arrived as one line with the two characters \\n in it. Send real line breaks inside the JSON string.'
    : ''
}

/** Why the program did not return, as the text the model reads; null when it returned. */
function failed(outcome: ProgramOutcome, code: string): string | null {
  switch (outcome.kind) {
    case 'returned':
      return null
    case 'syntax':
      return `Code execute failed kind=syntax${at(outcome.line)}\n${outcome.message}${hint(outcome.message, code)}\nNothing ran.`
    case 'threw':
      return `Code execute failed kind=threw${at(outcome.line)}\n${outcome.name}: ${outcome.message}\n${NOTE}${consoleOf(outcome.console)}`
    case 'exceeded':
      return `Code execute failed kind=exceeded limit=${outcome.limit}\n${NOTE}${consoleOf(outcome.console)}`
    case 'aborted':
      return `Code execute failed kind=aborted\n${NOTE}${consoleOf(outcome.console)}`
    case 'invalid-output':
      return `Code execute failed kind=invalid-output at=${outcome.path}\nThe returned value must be JSON: no undefined in arrays, functions, Map, Set, NaN, BigInt or cycles.\n${NOTE}${consoleOf(outcome.console)}`
  }
}

type Functions = ReadonlyMap<string, ProgramFunction>

/** Hands each call of the program to the capability, no more than the limit at once, and answers it. */
function caller(
  tools: ProgramTools,
  functions: Functions,
  limit: number,
  run: Promise<ProgramRun>,
) {
  let inFlight = 0
  return (call: ProgramCall): void => {
    const { ordinal, entry } = call
    const answer = (given: ProgramCallAnswer) =>
      void run.then(started =>
        started.answer(
          ordinal,
          failureOf(functions.get(entry), entry, given) ??
            (given.kind === 'value'
              ? { kind: 'value', value: given.value ?? { kind: 'null' } }
              : never()),
        ),
      )
    if (inFlight >= limit) {
      const message = `more than ${limit} calls at once; this one was not made. Await some before making more.`
      return answer({ kind: 'failure', failure: { kind: 'limit', effect: 'none', message } })
    }
    inFlight += 1
    void tools.call({ ordinal, entry, arguments: call.argument }).then(given => {
      inFlight -= 1
      answer(given)
    })
  }
}

/** The outcome of the program once it has stopped; stopping the call stops the program. */
async function outcomeOf(run: ProgramRun, signal: AbortSignal): Promise<ProgramOutcome> {
  const abort = () => run.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return run.outcome.finally(() => signal.removeEventListener('abort', abort))
}

async function execute(
  args: Arguments,
  environment: CodeAuthorEnvironment,
  execution: ToolExecutionContext,
  { inFlight, ...limits }: Limits,
): Promise<string> {
  const known = await callable(execution, 'execute')
  if (typeof known === 'string') return known
  const { tools } = known
  const functions: Functions = new Map(known.functions.map(one => [one.entry, one]))
  const handle = Promise.withResolvers<ProgramRun>()
  const started = await environment.program.run({
    source: args.text('code'),
    input: args.fields.get('input') ?? { kind: 'null' },
    entries: [...functions.keys()],
    failures: [PROGRAM_FAILURE],
    limits,
    onCall: caller(tools, functions, inFlight, handle.promise),
    onIdle: () => {},
  })
  if (started.kind !== 'done') return `Code execute: ${confirmation(started, () => '')}`
  handle.resolve(started.value)
  const outcome = await outcomeOf(started.value, execution.signal)
  if (outcome.kind !== 'returned')
    throw new Error(failed(outcome, args.text('code')) ?? 'Code execute failed')
  const table = await tools.settle()
  if ('failure' in table)
    throw new Error(
      `Code execute: the calls of the program could not be settled (${table.failure.kind}). ${NOTE}`,
    )
  const value =
    outcome.value === undefined ? '(the program returned nothing)' : writeJsonText(outcome.value)
  return `done Code execute\nresult:\n${value}${consoleOf(outcome.console)}`
}

function never(): never {
  throw new TypeError('A call answered neither a value nor a failure')
}

export function createCodeAuthor(
  construction: JsonValue,
): ReturnType<
  ToolImplementationModule<CodeAuthorEnvironment, ToolMessageContentBlock>['createAuthor']
> {
  const parsed = parseConstruction(construction, [
    limitField('resultMaxBytes', 'Required positive safe integer for the complete returned text.'),
    limitField('computeMs', 'Required positive safe integer: milliseconds a program may compute.'),
    limitField('memoryBytes', 'Required positive safe integer: the memory of one program.'),
    limitField(
      'outputBytes',
      'Required positive safe integer: the return value and console of one program.',
    ),
    limitField('calls', 'Required positive safe integer: the tool calls of one program.'),
    limitField(
      'callsInFlight',
      'Required positive safe integer: the tool calls of one program at once.',
    ),
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const number = (name: string) => parsed.ok.number(name, 1)
  const limits: Limits = {
    computeMs: number('computeMs'),
    memoryBytes: number('memoryBytes'),
    outputBytes: number('outputBytes'),
    calls: number('calls'),
    inFlight: number('callsInFlight'),
  }
  return succeed(
    createAuthor<CodeAuthorEnvironment>(
      'Code',
      'Run a short TypeScript program that calls tools as functions and returns only what you choose.',
      codeCommands,
      ['program'],
      number('resultMaxBytes'),
      GUIDE,
      (_command, args, environment, execution) => execute(args, environment, execution, limits),
      {
        encoding: 'flat',
        isolation: ['restricted-js'],
        gates: CODE_GATES,
        help: (args, _environment, execution) =>
          helpText(execution, limits, args.optionalText('name')),
      },
    ),
  )
}

export const codeToolModule: ToolImplementationModule<
  CodeAuthorEnvironment,
  ToolMessageContentBlock
> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Code',
    revision: '1',
    returns:
      'execute returns the value a program returned and its console lines; help returns text.',
    commands: codeCommands,
  }),
  createAuthor: createCodeAuthor,
}
