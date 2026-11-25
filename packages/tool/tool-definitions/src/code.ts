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
import { callsSummary, type AnsweredFailure } from './code-summary.ts'
import { givenProgram, loadProgram, pickedSource } from './code-source.ts'
import { codeCommands } from './commands.ts'
import type { CodeAuthorEnvironment } from './environment.ts'
import { limitField } from './pictures.ts'
import { parseConstruction, type Arguments } from './protocol.ts'
import { confirmation, EXTERNAL_DATA } from './text.ts'

type Limits = ProgramLimits & Readonly<{ inFlight: number; sourceBytes: number }>

const CODE_GATES: CommandGates = {
  gates: [{ id: 'run', title: '运行程序', default: 'auto' }],
  of: { execute: 'run', help: 'run' },
}

const RULES = `Program
- code is the body of an async function, written in TypeScript. Top-level await and return work. Type annotations are erased before the run; enum, namespace and decorators are not accepted.
- The value you return is the result you receive, as JSON. console.log lines are returned too. Return only what you need: nothing else from the program reaches you.
- input (optional) is any JSON value, given as the value itself: an object as an object, not as a string that holds JSON. The program reads it as the constant input.

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

const PURPOSE = `Run a TypeScript program that calls tools as functions. Results of the calls stay in the program; only what it returns enters the conversation.
Use it when the work is many calls whose intermediate results you do not need to read: the same step on many items (files, pages), calls that feed each other, a large result you need a small part of (a web page), or branches and retries. Save a program you will run again to a file and run it by path with input.
Call tools directly when one or two small calls answer, when you must read a result to decide the next step, or when you need the full text in the conversation.
- code is the body of an async function. Each tool it names is a global: const page = await Web.fetch({ url }). A call takes one object and resolves to a value, not to text.
- Await every call; run independent calls with Promise.all.
- No file system, network, timer or import: use the tools. Nothing is kept between programs.
- Find a tool that is not among your tools with Tools search and programmable set to true, then call it by name.`

const FINDING = `Finding functions
- The description of this tool shows the functions of your resident tools. help with name set to one tool shows the functions of that tool.
- Other tools can be callable too. Find them with Tools search with programmable set to true: the result shows their functions. A program calls them by name; they need no loading.
- Write the name of each tool you call in the program: a program is given the tools its text names.`

const GUIDE = `${RULES}

help gives the limits here. help with name set to a tool gives the functions of that tool. Tools search with programmable set to true finds the other tools a program can call.`

const limitsLine = (limits: Limits) =>
  `Limits: ${limits.computeMs / 1000} s of computing (waiting for a call does not count), ${Math.floor(limits.memoryBytes / 1048576)} MiB of memory, ${limits.calls} tool calls with at most ${limits.inFlight} at once, ${limits.outputBytes} bytes of result, ${limits.sourceBytes} bytes of program.`

const DECLARED = `declare class ${PROGRAM_FAILURE} extends Error { kind: string; tool: string; command: string | null; effect: "none" | "occurred" | "unknown" }\ndeclare const input: unknown`

const NOT_ATTACHED = 'program calls are not attached to this call'
const FIND = 'Find the tools a program can call with Tools search and programmable set to true.'

const namesIn = (source: string): readonly string[] => [
  ...new Set(source.match(/[A-Za-z_$][A-Za-z0-9_$]*/gu) ?? []),
]

async function helpText(execution: ToolExecutionContext, limits: Limits, name: string | undefined) {
  const tools = programToolsOf(execution)
  if (tools === undefined) return `rejected reason=unavailable Code help: ${NOT_ATTACHED}`
  if (name === undefined)
    return `done Code help\n${RULES}\n\n${limitsLine(limits)}\n\n${FINDING}\n${DECLARED}`
  const listed = await tools.functions([name])
  if ('failure' in listed) return `rejected reason=unavailable Code help: ${listed.failure.kind}`
  const one = listed.ok.filter(each => each.tool === name)
  return one.length === 0
    ? `rejected reason=notFound Code help: ${name} has no function a program can call now. ${FIND}`
    : `done Code help ${name}\n${functionsSignature(one)}`
}

/** What the program receives for one call: the value, or an error it can catch by its kind. */
function answerOf(entry: string, answer: ProgramCallAnswer): ProgramAnswer {
  if (answer.kind === 'value') return { kind: 'value', value: answer.value ?? { kind: 'null' } }
  const { kind, effect, message } = answer.failure
  const text = (value: string | null): JsonValue =>
    value === null ? { kind: 'null' } : { kind: 'string', value }
  const [tool = entry, command = null] = entry.split('.')
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
  }
}

const NOTE = 'Calls that completed keep their effects. The program is not rerun.'

function unnamed(outcome: Extract<ProgramOutcome, { kind: 'threw' }>, code: string): string {
  if (outcome.name === 'ReferenceError') return `\nIf that is a tool: ${FIND}`
  return outcome.name === 'TypeError' && /\btools\s*\[/u.test(code)
    ? '\nWrite the name of each tool you call in the program: tools[name] with a computed name finds only the tools the text names.'
    : ''
}
const consoleOf = (text: string) => (text.length === 0 ? '' : `\nconsole:\n${text}`)
const at = (line: number | null) => (line === null ? '' : ` line=${line}`)

function hint(message: string, code: string): string {
  if (/\b(import|export|require)\b/u.test(message))
    return '\nThere is nothing to import: each tool is a global object, for example await Files.read({ path }).'
  return !code.includes('\n') && code.includes('\\n')
    ? '\nThe code arrived as one line with the two characters \\n in it. Send real line breaks inside the JSON string.'
    : ''
}

function failed(outcome: Exclude<ProgramOutcome, { kind: 'returned' }>, code: string): string {
  switch (outcome.kind) {
    case 'syntax':
      return `Code execute failed kind=syntax${at(outcome.line)}\n${outcome.message}${hint(outcome.message, code)}\nNothing ran.`
    case 'threw':
      return `Code execute failed kind=threw${at(outcome.line)}\n${outcome.name}: ${outcome.message}${unnamed(outcome, code)}\n${NOTE}${consoleOf(outcome.console)}`
    case 'exceeded':
      return `Code execute failed kind=exceeded limit=${outcome.limit}\n${NOTE}${consoleOf(outcome.console)}`
    case 'aborted':
      return `Code execute failed kind=aborted\n${NOTE}${consoleOf(outcome.console)}`
    case 'invalid-output':
      return `Code execute failed kind=invalid-output at=${outcome.path}\nThe returned value must be JSON: no undefined in arrays, functions, Map, Set, NaN, BigInt or cycles.\n${NOTE}${consoleOf(outcome.console)}`
  }
}

type Answered = { readonly failures: Map<number, AnsweredFailure>; external: boolean }

/** Hands each call of the program to the capability, no more than the limit at once, and answers it. */
function caller(tools: ProgramTools, limit: number, run: Promise<ProgramRun>, seen: Answered) {
  let inFlight = 0
  return (call: ProgramCall): void => {
    const { ordinal, entry } = call
    const answer = (given: ProgramCallAnswer) => {
      if (given.kind === 'failure') seen.failures.set(ordinal, { entry, failure: given.failure })
      else if (given.external) seen.external = true
      void run.then(started => started.answer(ordinal, answerOf(entry, given)))
    }
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

type Ending = 'returned' | 'stopped' | 'failed'

/** TL-67, TL-69, TL-73: returned waits for its calls, stopped reads the table, failed closes it. */
async function closed(tools: ProgramTools, seen: Answered, ending: Ending = 'returned') {
  const table =
    ending === 'returned'
      ? await tools.settle()
      : await (ending === 'stopped' ? tools.table() : tools.abandon())
  return 'failure' in table ? table : { ok: callsSummary(table.ok, seen.failures) }
}

/** The output of the program as the model reads it; marked whole when any call gave outside data. */
function shown(outcome: Extract<ProgramOutcome, { kind: 'returned' }>, external: boolean): string {
  const value =
    outcome.value === undefined ? '(the program returned nothing)' : writeJsonText(outcome.value)
  const body = `result:\n${value}${consoleOf(outcome.console)}`
  return external ? `${EXTERNAL_DATA.begin}\n${body}\n${EXTERNAL_DATA.end}` : body
}

const fileOf = (from: string) => (from === '' ? '' : `\n${from.trimEnd()}`)

const INPUT_NOTE =
  'note: input was a string that holds JSON, so the program read a string. To give an object or a list, give the value itself.\n'

function inputNote(input: JsonValue | undefined): string {
  if (input?.kind !== 'string' || !/^\s*[[{]/u.test(input.value)) return ''
  try {
    JSON.parse(input.value)
    return INPUT_NOTE
  } catch {
    return ''
  }
}

async function execute(
  args: Arguments,
  environment: CodeAuthorEnvironment,
  execution: ToolExecutionContext,
  { inFlight, sourceBytes, ...limits }: Limits,
): Promise<string> {
  const picked = pickedSource(args)
  if (typeof picked === 'string') return picked
  const tools = programToolsOf(execution)
  if (tools === undefined) return `rejected reason=unavailable Code execute: ${NOT_ATTACHED}`
  const seen: Answered = { failures: new Map(), external: false }
  const reader = 'code' in picked ? succeed([]) : await tools.functions(['Files'])
  if ('failure' in reader) return `rejected reason=unavailable Code execute: ${reader.failure.kind}`
  const program =
    'code' in picked
      ? givenProgram(picked.code, sourceBytes)
      : await loadProgram(picked.path, tools, reader.ok, sourceBytes, seen.failures)
  if ('refusal' in program) throw new Error(program.refusal)
  const { source, from } = program
  const named = await tools.functions(namesIn(source))
  if ('failure' in named) {
    const text = `rejected reason=unavailable Code execute: ${named.failure.kind}`
    if (from === '') return text
    throw new Error(`${text}${fileOf(from)}`)
  }
  const handle = Promise.withResolvers<ProgramRun>()
  const input = args.fields.get('input')
  const started = await environment.program.run({
    source,
    input: input ?? { kind: 'null' },
    entries: named.ok.map(one => one.entry),
    failures: [PROGRAM_FAILURE],
    limits,
    onCall: caller(tools, inFlight, handle.promise, seen),
    onIdle: () => {},
  })
  if (started.kind !== 'done') return `Code execute: ${confirmation(started, () => '')}`
  handle.resolve(started.value)
  const outcome = await outcomeOf(started.value, execution.signal)
  if (outcome.kind === 'syntax') throw new Error(`${failed(outcome, source)}${fileOf(from)}`)
  const ending = outcome.kind === 'aborted' ? 'stopped' : 'failed'
  const calls = await closed(tools, seen, outcome.kind === 'returned' ? 'returned' : ending)
  if (outcome.kind !== 'returned') {
    const tail = 'ok' in calls ? calls.ok : `calls: unknown (${calls.failure.kind})`
    throw new Error(`${failed(outcome, source)}\n${from}${tail}`)
  }
  if ('failure' in calls)
    throw new Error(
      `Code execute: the calls of the program could not be settled (${calls.failure.kind}). ${NOTE}`,
    )
  return `done Code execute\n${inputNote(input)}${from}${shown(outcome, seen.external)}\n${calls.ok}`
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
    limitField('sourceBytes', 'Required positive safe integer: the text of one program.'),
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const number = (name: string) => parsed.ok.number(name, 1)
  const limits: Limits = {
    computeMs: number('computeMs'),
    memoryBytes: number('memoryBytes'),
    outputBytes: number('outputBytes'),
    calls: number('calls'),
    inFlight: number('callsInFlight'),
    sourceBytes: number('sourceBytes'),
  }
  return succeed(
    createAuthor<CodeAuthorEnvironment>(
      'Code',
      PURPOSE,
      codeCommands,
      ['program'],
      number('resultMaxBytes'),
      GUIDE,
      (_command, args, environment, execution) => execute(args, environment, execution, limits),
      {
        encoding: 'flat',
        isolation: ['restricted-js'],
        layers: ['stateless_sandbox'],
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
