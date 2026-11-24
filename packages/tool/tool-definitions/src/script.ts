import { join } from 'node:path'
import {
  bindingKinds,
  environmentNeedAdoption,
  type CommandOutcome,
  type ProcessHandle,
} from '@omne-harness/execution-environment-contract'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  checkScriptArguments,
  createDefaultParameterCodec,
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  readScriptConstruction,
  scriptParametersSchema,
  type ParameterCodec,
  type ScriptConstruction,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import type { ParameterContract } from '@omne-harness/tool-contract'
import type { ShellAuthorEnvironment } from './environment.ts'
import { adoption as vocabulary, tree } from './protocol.ts'
import { textReturns } from './returns.ts'
import { scriptHostOf, type ScriptPlace } from './script-port.ts'
import { confirmation } from './text.ts'

const OWNER = '@omne-harness/tool-definitions'
const adoption = describedAdoption({
  owner: OWNER,
  name: 'script-tool-protocol',
  revision: '1',
  changes:
    'The arguments go to the script as one JSON object on standard input; its standard output is the result.',
})

/** The most a result may be, whatever the assembly allows: the bound the output check holds every result to. */
const RESULT_CEILING_BYTES = 1024 * 1024
const STDERR_TAIL_BYTES = 4096
const ARGUMENT_LIMITS = {
  maxBytes: 1048576,
  maxDepth: 8,
  maxItems: 4096,
  maxMembers: 64,
  maxStringLength: 1048576,
  maxNumberLength: 32,
}

type Plain = Readonly<Record<string, unknown>>
type Env = ShellAuthorEnvironment
const utf8 = new TextEncoder()

function contractOf({ parameters }: ScriptConstruction): ParameterContract {
  return {
    vocabulary,
    schema: tree(scriptParametersSchema(parameters)),
    descriptions: Object.entries(parameters.properties).flatMap(([path, property]) =>
      property.description === undefined ? [] : [{ path, text: property.description }],
    ),
  }
}

function codecOf(construction: ScriptConstruction): ParameterCodec<Plain> {
  const base = createDefaultParameterCodec(ARGUMENT_LIMITS)
  if ('failure' in base) throw new TypeError(base.failure.reason)
  return {
    adoption,
    parse: input => {
      const parsed = base.ok.parse(input)
      if ('failure' in parsed) return parsed
      const checked = checkScriptArguments(
        construction.parameters,
        JSON.parse(writeJsonText(parsed.ok)),
      )
      return 'ok' in checked ? checked : fail({ kind: 'invalid', reason: checked.failure.reason })
    },
  }
}

/** What one stream gave: its first bytes up to the bound, and how many it gave in all. */
class Kept {
  private readonly chunks: Uint8Array[] = []
  private held = 0
  private readonly most: number
  seen = 0
  constructor(most: number) {
    this.most = most
  }
  add(data: Uint8Array): void {
    this.seen += data.byteLength
    const room = this.most - this.held
    if (room <= 0) return
    const part = data.byteLength > room ? data.subarray(0, room) : data
    this.chunks.push(part)
    this.held += part.byteLength
  }
  text(): string {
    const all = new Uint8Array(this.held)
    let at = 0
    for (const chunk of this.chunks) {
      all.set(chunk, at)
      at += chunk.byteLength
    }
    return new TextDecoder('utf-8').decode(all)
  }
  get cut(): boolean {
    return this.seen > this.held
  }
}

type Ended = Readonly<{
  outcome: CommandOutcome | undefined
  stopped: 'time-limit' | 'cancelled' | null
  stdout: Kept
  stderr: Kept
}>

/** Reads a script to its end, or stops it at the time limit or when the call is cancelled. */
async function run(
  handle: ProcessHandle,
  signal: AbortSignal,
  timeoutMs: number,
  most: number,
): Promise<Ended> {
  const stdout = new Kept(most)
  const stderr = new Kept(STDERR_TAIL_BYTES * 4)
  let stopped: Ended['stopped'] = null
  const stop = (why: NonNullable<Ended['stopped']>) => {
    if (stopped !== null) return
    stopped = why
    void handle.stop('forced').catch(() => 'unconfirmed')
  }
  const timer = setTimeout(() => stop('time-limit'), timeoutMs)
  const cancel = () => stop('cancelled')
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try {
    const result = handle.result.catch(() => undefined)
    try {
      for await (const chunk of handle.output)
        (chunk.stream === 'stderr' ? stderr : stdout).add(chunk.data)
    } catch {
      return { outcome: undefined, stopped, stdout, stderr }
    }
    return { outcome: await result, stopped, stdout, stderr }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

const tail = (text: string) =>
  utf8.encode(text).byteLength <= STDERR_TAIL_BYTES ? text : `…${text.slice(-STDERR_TAIL_BYTES)}`

function failureText(head: string, { stdout, stderr }: Ended): string {
  const said = [head]
  if (stderr.seen > 0) said.push(`stderr (its end):\n${tail(stderr.text()).trimEnd()}`)
  if (stdout.seen > 0) said.push(`stdout:\n${stdout.text().trimEnd()}`)
  return said.join('\n')
}

/** What the model reads of one run: the output of a script that exited 0, else what is known of how it ended. */
export function scriptResultText(effect: ScriptConstruction['effect'], ended: Ended): string {
  const { outcome, stopped, stdout } = ended
  if (stopped !== null) {
    const why =
      stopped === 'time-limit' ? 'the script ran past its time limit' : 'the call was cancelled'
    return effect === 'read'
      ? failureText(`failed reason=${stopped} ${why} and was stopped. It is not run again.`, ended)
      : failureText(
          `unknown reason=${stopped} ${why} and was stopped. Whether it did its work is not known, and it is not run again: check before you call it once more.`,
          ended,
        )
  }
  if (outcome?.kind !== 'completed' || outcome.exit.kind === 'unknown')
    return failureText(
      effect === 'read'
        ? 'failed reason=unknown-end how the script ended could not be read. It is not run again.'
        : 'unknown reason=unknown-end how the script ended could not be read. Whether it did its work is not known, and it is not run again.',
      ended,
    )
  if (outcome.exit.kind === 'signal')
    return failureText(
      `failed signal=${outcome.exit.signal} the script was ended by a signal.`,
      ended,
    )
  if (outcome.exit.code !== 0) return failureText(`failed exit=${String(outcome.exit.code)}`, ended)
  const text = stdout.text().trimEnd()
  const cut = stdout.cut
    ? `\n[the output was cut: the script wrote ${String(stdout.seen)} bytes and the first part is kept]`
    : ''
  return text === '' && cut === '' ? 'done (the script wrote nothing)' : `${text}${cut}`
}

async function execute(
  construction: ScriptConstruction,
  args: Plain,
  environment: Env,
  execution: ToolExecutionContext,
): Promise<string> {
  if (execution.signal.aborted) return 'rejected reason=cancelled zero starts'
  const placed = await scriptHostOf(execution)?.place()
  if (placed === undefined)
    return 'unavailable reason=the script host is not attached to this call; zero starts'
  if (!('ok' in placed)) return `unavailable reason=${placed.failure.reason}; zero starts`
  const place: ScriptPlace = placed.ok
  if (environment.directory === undefined)
    return 'rejected reason=unavailable this call has no working directory; zero starts'
  const { run: how, timeoutMs, effect } = construction
  const executable = place.program(how.program)
  if (executable === undefined)
    return `unavailable reason=the program ${how.program} is not found where the scripts of this deployment start; zero starts`
  const started = await environment.command.start({
    executable,
    args: [join(place.directory, how.script), ...how.args],
    cwd: environment.directory,
    env: place.env,
    outputMode: 'separate',
    stdin: utf8.encode(JSON.stringify(args)),
  })
  if (started.kind !== 'done') return confirmation(started, () => '')
  const most = Math.min(place.resultMaxBytes, RESULT_CEILING_BYTES)
  const text = scriptResultText(effect, await run(started.value, execution.signal, timeoutMs, most))
  return utf8.encode(text).byteLength <= RESULT_CEILING_BYTES
    ? text
    : `${text.slice(0, RESULT_CEILING_BYTES / 4)}\n[the result was cut]`
}

export function createScriptAuthor(
  given: JsonValue,
): ReturnType<ToolImplementationModule<Env, ToolMessageContentBlock>['createAuthor']> {
  const read = readScriptConstruction(JSON.parse(writeJsonText(given)))
  if (!('ok' in read)) return fail({ field: 'construction', reason: read.failure.reason })
  const construction = read.ok
  const operation = defineToolOperation<
    Plain,
    string,
    Env,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: contractOf(construction) },
    returns: textReturns(adoption),
    author: {
      kind: 'ordinary',
      parameters: codecOf(construction),
      waits: [],
      executor: {
        execute: (args, environment, execution) =>
          execute(construction, args, environment, execution),
      },
      codec: {
        adoption,
        encode: (value: unknown) =>
          typeof value === 'string'
            ? succeed(utf8.encode(value))
            : fail({ reason: 'text-required' }),
        decode(bytes) {
          try {
            return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          } catch {
            return fail({ reason: 'invalid-utf8' })
          }
        },
      },
      output: {
        adoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8.encode(value).byteLength <= RESULT_CEILING_BYTES
            ? succeed(value)
            : fail({ reason: 'bounded-text-required' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
  if ('failure' in operation)
    return fail({ field: 'operation', reason: JSON.stringify(operation.failure) })
  const author = defineFunctionTool<Env, ToolMessageContentBlock>({
    implementation: {
      description: construction.summary,
      backgroundAllowed: false,
      declarations: {
        adoption,
        environment: {
          adoption: environmentNeedAdoption,
          value: tree({ facilities: ['command'], isolation: [], layers: bindingKinds }),
        },
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    operation: operation.ok,
  })
  return 'failure' in author
    ? fail({ field: 'operation', reason: JSON.stringify(author.failure) })
    : author
}

/** The implementation of every tool a tenant or a workspace brings: it runs their script, and holds none of their code. */
export const scriptToolModule: ToolImplementationModule<Env, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: OWNER,
    name: 'Script',
    revision: '1',
    returns: 'The standard output of the script, or what is known of how it ended.',
    changes: 'First revision.',
  }),
  createAuthor: createScriptAuthor,
}
