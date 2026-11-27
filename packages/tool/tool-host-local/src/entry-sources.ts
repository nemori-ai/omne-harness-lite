import type { ContentBlock } from '@omne-harness/content-block'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  Access,
  Adoption,
  ParameterContract,
  ToolCallId,
  ToolCommandDeclaration,
  ToolDefinition,
  ToolRenderedResult,
  ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  isProgramCall,
  judgeToolSourceListing,
  shapeOf,
  type OutputCodec,
  type ToolBindingKey,
  type ToolEntrySource,
  type ToolExecutionContext,
  type ToolLoadedRegistration,
  type ToolOperation,
  type ToolProgramContract,
  type ToolSourceEntry,
  type ToolSourceListing,
  type ToolSegmentContext,
  type ToolSourceAnswer,
  type ToolSourceCall,
  type ToolSourceWithheld,
  isToolSourceSuspension,
  type AuthorSegment,
  type CheckpointedToolExecutor,
  type ToolAuthorExecutor,
  type ToolPrimitiveFailure,
  type ToolWaitContract,
} from '@omne-harness/tool-contract/provider'
import type { LocalToolBindingRegistry, ToolBindingPin, ToolListing } from './bindings.ts'

export type SourcedCatalogEntries = Readonly<{
  live: readonly ToolListing[]
  known: readonly Readonly<{ key: ToolBindingKey; definition: ToolDefinition; reason: string }>[]
  withheld: readonly ToolSourceWithheld[]
  unavailable: readonly string[]
}>

export interface LocalToolSourcedEntries<P> {
  /** Never fails as a whole; given `names`, asks only the sources they are under, so no release tool waits on one. */
  read(access: Access<P>, names?: readonly string[]): Promise<SourcedCatalogEntries>
}

export type LocalEntrySourcePolicy = Readonly<{
  listTimeoutMs: number
  arguments: Parameters<typeof createDefaultParameterCodec>[0]
}>

export const DEFAULT_ENTRY_SOURCE_POLICY: LocalEntrySourcePolicy = Object.freeze({
  listTimeoutMs: 5000,
  arguments: Object.freeze({
    maxBytes: 262144,
    maxDepth: 64,
    maxItems: 16384,
    maxMembers: 4096,
    maxStringLength: 262144,
    maxNumberLength: 64,
  }),
})

export type LocalEntrySourcesInput<P, B extends ContentBlock> = Readonly<{
  sources(access: Access<P>): readonly ToolEntrySource<P, B>[]
  /** Marks one call of an entry under this prefix as in flight; the returned function ends the mark. */
  hold(prefix: string): () => void
  codec: OutputCodec<ToolRenderedResult<B>>
  policy?: LocalEntrySourcePolicy
}>

type CallFacts<P> = Access<P> & Readonly<{ call: ToolCallId; program?: boolean }>
const callFacts = new WeakMap<object, CallFacts<unknown>>()

export function noteCallFacts<P>(
  context: ToolExecutionContext | ToolSegmentContext,
  facts: CallFacts<P>,
): void {
  callFacts.set(context, facts)
}

/** A segment of a call runs under its own context; the source behind it still learns whose call it runs. */
export function carryCallFacts(from: ToolExecutionContext, to: ToolSegmentContext): void {
  const facts = callFacts.get(from)
  if (facts !== undefined) callFacts.set(to, { ...facts, program: isProgramCall(from) })
}

const SOURCE_ORDINAL = String(Number.MAX_SAFE_INTEGER)
/** The settings adoption every call of a source entry is fixed with: a source entry has no tool settings. */
export const SOURCE_ENTRY_SETTINGS = describedAdoption({
  owner: '@omne-harness/tool-host-local',
  name: 'source-entry-settings',
  revision: '1',
})

const unavailable = (diagnostic: string) => fail({ kind: 'unavailable' as const, diagnostic })

function sourceOf<P, B extends ContentBlock>(
  sources: readonly ToolEntrySource<P, B>[],
  name: string,
): ToolEntrySource<P, B> | undefined {
  const matching = sources.filter(source => name.startsWith(source.prefix))
  return matching.length === 1 ? matching[0] : undefined
}

function keyOf<P>(access: Access<P>, definition: ToolDefinition): ToolBindingKey {
  return {
    layer: { kind: 'tenant', tenant: access.tenant },
    asset: { name: definition.name, adoption: definition.adoption },
  }
}

function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

type ParameterCodec = Extract<ReturnType<typeof createDefaultParameterCodec>, { ok: unknown }>['ok']
type Authoring<B extends ContentBlock> = Readonly<{
  parameters: ParameterCodec
  codec: OutputCodec<ToolRenderedResult<B>>
}>
type Declared = { kind: 'declared'; value: ParameterContract }

function programOf(declared: ToolReturnDeclaration['program']): ToolProgramContract {
  if (declared.kind === 'none') return declared
  const { schema: identity, definition, maxBytes } = declared
  const load = async () =>
    jsonSchemaDefinition<unknown>({
      document: JSON.parse(writeJsonText(definition.schema)) as Readonly<Record<string, unknown>>,
      numbers: 'exact-or-reject',
    })
  const ref = defineSchema<unknown>({ id: identity.id, load })
  return { kind: 'json', adoption: declared.contract, schema: { identity, maxBytes, ref } }
}

const NO_DATA = Object.freeze({ kind: 'none' as const })
const unreadable = fail({ reason: 'invalid-source-entry-result' })
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function carrying<B extends ContentBlock>(
  message: OutputCodec<ToolRenderedResult<B>>,
): OutputCodec<ToolRenderedResult<B>> {
  const adoption = describedAdoption({
    owner: '@omne-harness/tool-host-local',
    name: 'source-entry-result-with-program-data',
    revision: '1',
    message: message.adoption.digest,
  })
  return {
    adoption,
    encode(value) {
      if (!isRecord(value) || !isRecord(value['data'])) return unreadable
      const encoded = message.encode({ ...value, data: NO_DATA })
      if ('failure' in encoded) return encoded
      const saved = { message: new TextDecoder().decode(encoded.ok), data: value['data'] }
      return succeed(new TextEncoder().encode(JSON.stringify(saved)))
    },
    decode(bytes) {
      let saved: unknown
      try {
        saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        return unreadable
      }
      if (!isRecord(saved) || typeof saved['message'] !== 'string' || !isRecord(saved['data']))
        return unreadable
      const decoded = message.decode(new TextEncoder().encode(saved['message']))
      if ('failure' in decoded) return decoded
      const data = saved['data'] as ToolRenderedResult<B>['data']
      return succeed({ ...decoded.ok, data })
    },
  }
}

type SourceCall<P> = Omit<ToolSourceCall<P>, 'arguments'>

function callOf<P>(
  context: ToolExecutionContext | ToolSegmentContext,
  name: string,
  declared: ToolCommandDeclaration | null,
): SourceCall<P> {
  const facts = callFacts.get(context) as CallFacts<P> | undefined
  if (facts === undefined) throw new Error('the call of the source entry is not known')
  return {
    principal: facts.principal,
    tenant: facts.tenant,
    name,
    command: declared?.name ?? null,
    declared,
    invocation: facts.call,
    program: facts.program ?? isProgramCall(context as ToolExecutionContext),
    signal: context.signal,
  }
}

type Segment<B extends ContentBlock> = Outcome<
  AuthorSegment<Uint8Array, ToolRenderedResult<B>>,
  ToolPrimitiveFailure
>

const segmentOf = <B extends ContentBlock>(answer: ToolSourceAnswer<B>): Segment<B> =>
  succeed(isToolSourceSuspension(answer) ? answer : { kind: 'completed', value: answer })

const BREACH = 'the entry source suspended the call without declaring a checkpoint'

type SourceAuthor<E, B extends ContentBlock> = Readonly<{
  waits: readonly ToolWaitContract<unknown, 'ask'>[]
  executor: ToolAuthorExecutor<JsonValue, ToolRenderedResult<B>, E>
}>

function executorOf<P, E, B extends ContentBlock>(
  source: ToolEntrySource<P, B>,
  name: string,
  declared: ToolCommandDeclaration | null,
): SourceAuthor<E, B> {
  const { checkpoint, resume } = source
  if (checkpoint !== undefined && resume !== undefined) {
    const segments: CheckpointedToolExecutor<JsonValue, ToolRenderedResult<B>, E> = {
      checkpoint: checkpoint.declaration,
      initial: async (args, _environment, context) =>
        segmentOf(await source.execute({ ...callOf<P>(context, name, declared), arguments: args })),
      resume: async (input, _environment, context) =>
        segmentOf(await resume.call(source, { ...callOf<P>(context, name, declared), ...input })),
    }
    return { waits: checkpoint.waits, executor: segments }
  }
  const executor = {
    execute: (args: JsonValue, _environment: E, context: ToolExecutionContext) => {
      const call = { ...callOf<P>(context, name, declared), arguments: args }
      return source.execute(call).then(answer => {
        if (isToolSourceSuspension(answer)) throw new Error(BREACH)
        return answer
      })
    },
  }
  return { waits: [], executor }
}

function operationOf<P, E, B extends ContentBlock>(
  authoring: Authoring<B>,
  source: ToolEntrySource<P, B>,
  name: string,
  declared: ToolCommandDeclaration | null,
  contract: ParameterContract,
  returns: ToolReturnDeclaration,
): Outcome<ToolOperation<E, B, Declared>, string> {
  if (returns.kind !== 'structured') return fail('returns-not-structured')
  const { parameters } = authoring
  const codec = returns.program.kind === 'json' ? carrying(authoring.codec) : authoring.codec
  const { waits, executor } = executorOf<P, E, B>(source, name, declared)
  const made = defineToolOperation<JsonValue, ToolRenderedResult<B>, E, B, Declared>({
    parameters: { kind: 'declared', value: contract },
    returns: returns as ToolReturnDeclaration & { kind: 'structured' },
    author: {
      kind: 'structured',
      parameters,
      waits,
      codec,
      output: {
        adoption: codec.adoption,
        check: ({ value }) => {
          const encoded = codec.encode(value)
          return 'failure' in encoded ? encoded : codec.decode(encoded.ok)
        },
      },
      program: programOf(returns.program),
      executor,
    },
  })
  return 'failure' in made ? fail(`operation ${made.failure.field}`) : succeed(made.ok)
}

function implementationOf<P, E, B extends ContentBlock>(
  authoring: Authoring<B>,
  source: ToolEntrySource<P, B>,
  definition: ToolDefinition,
) {
  const implementation = {
    description: definition.description,
    backgroundAllowed: definition.backgroundAllowed,
    declarations: definition.declarations,
  }
  const operation = (
    declared: ToolCommandDeclaration | null,
    contract: ParameterContract,
    returns: ToolReturnDeclaration,
  ) => operationOf<P, E, B>(authoring, source, definition.name, declared, contract, returns)
  if (definition.kind === 'function') {
    const made = operation(null, definition.parameters, definition.returns)
    if ('failure' in made) return made
    const tool = defineFunctionTool<E, B>({
      implementation,
      operation: made.ok,
      ...(definition.conditions === undefined ? {} : { conditions: definition.conditions }),
    })
    return 'failure' in tool ? fail(`function ${tool.failure.field}`) : succeed(tool.ok)
  }
  type Commands = Parameters<typeof defineCommandTool<E, B>>[0]['commands']
  const commands: Record<string, Commands[string]> = {}
  for (const command of definition.commands) {
    if (command.parameters.kind !== 'declared') return fail('executor-owned-parameters')
    const made = operation(command, command.parameters.value, command.returns)
    if ('failure' in made) return made
    const { name: _name, parameters: _parameters, returns: _returns, ...rest } = command
    commands[command.name] = { ...rest, operation: made.ok }
  }
  const tool = defineCommandTool<E, B>({
    implementation,
    encoding: definition.encoding,
    ...(definition.guide === undefined ? {} : { guide: definition.guide }),
    ...(definition.gates === undefined ? {} : { gates: definition.gates }),
    commands,
  })
  return 'failure' in tool ? fail(`commands ${tool.failure.field}`) : succeed(tool.ok)
}

async function listedBy<P, B extends ContentBlock>(
  source: ToolEntrySource<P, B>,
  access: Access<P>,
  timeoutMs: number,
): Promise<Outcome<ToolSourceListing, string>> {
  try {
    const answer = await bounded(source.list(access), timeoutMs)
    if (answer === 'timeout') return fail('timeout')
    if ('failure' in answer) return fail(answer.failure.kind)
    const judged = judgeToolSourceListing(source.prefix, answer.ok)
    return 'failure' in judged ? fail(`breach ${judged.failure.reason}`) : succeed(judged.ok)
  } catch {
    return fail('threw')
  }
}

async function readEntries<P, B extends ContentBlock>(
  offered: readonly ToolEntrySource<P, B>[],
  access: Access<P>,
  timeoutMs: number,
  names: readonly string[] | undefined,
): Promise<SourcedCatalogEntries> {
  const live: ToolListing[] = []
  const known: SourcedCatalogEntries['known'][number][] = []
  const withheld: ToolSourceWithheld[] = []
  const failed: string[] = []
  const sources = offered.toSorted((left, right) => (left.prefix < right.prefix ? -1 : 1))
  for (const source of sources) {
    if (sourceOf(sources, source.prefix) !== source) continue
    if (names !== undefined && !names.some(name => name.startsWith(source.prefix))) continue
    const listed = await listedBy(source, access, timeoutMs)
    if ('failure' in listed) {
      failed.push(source.prefix)
      withheld.push({
        name: `${source.prefix}*`,
        reason: `the source of these entries is unavailable (${listed.failure})`,
      })
      continue
    }
    for (const entry of listed.ok.entries) {
      const key = keyOf(access, entry.definition)
      if (entry.availability.kind === 'available')
        live.push({
          entry: {
            key,
            ordinal: SOURCE_ORDINAL,
            digest: entry.executor.digest,
            shape: shapeOf(entry.definition),
            state: 'live',
            fiber: `entry-source:${source.prefix}`,
          },
          definition: entry.definition,
          executor: entry.executor,
        })
      else known.push({ key, definition: entry.definition, reason: entry.availability.reason })
    }
    withheld.push(...listed.ok.withheld)
  }
  return { live, known, withheld, unavailable: failed }
}

export function createLocalEntrySources<P, E, B extends ContentBlock>(
  input: LocalEntrySourcesInput<P, B>,
) {
  type Loaded = ToolLoadedRegistration<E, B>
  type Source = ToolEntrySource<P, B>
  const policy = input.policy ?? DEFAULT_ENTRY_SOURCE_POLICY
  const codec = createDefaultParameterCodec(policy.arguments)
  if ('failure' in codec) throw new TypeError('the source argument limits are not lawful')
  const authoring: Authoring<B> = { parameters: codec.ok, codec: input.codec }
  const loadedByDefinition = new WeakMap<ToolDefinition, Outcome<Loaded, string>>()

  function loadedOf(
    access: Access<P>,
    source: Source,
    entry: ToolSourceEntry,
  ): Outcome<Loaded, string> {
    const known = loadedByDefinition.get(entry.definition)
    if (known !== undefined) return known
    const implementation = implementationOf<P, E, B>(authoring, source, entry.definition)
    const answer: Outcome<Loaded, string> =
      'failure' in implementation
        ? implementation
        : succeed(
            Object.freeze({
              implementation: implementation.ok,
              key: keyOf(access, entry.definition),
              definition: entry.definition,
              shape: shapeOf(entry.definition),
              executor: entry.executor,
              settings: SOURCE_ENTRY_SETTINGS,
            }) as Loaded,
          )
    loadedByDefinition.set(entry.definition, answer)
    return answer
  }

  function pinOf(prefix: string): ToolBindingPin {
    let release: (() => void) | null = input.hold(prefix)
    return Object.freeze({
      release: () => {
        release?.()
        release = null
      },
    })
  }

  // The call runs as it was fixed: its own definition, the executor of the source. Whether the command
  // it names can still be sent is for the source to judge before it sends.
  function selected(
    access: Access<P>,
    definition: ToolDefinition,
    executor: Adoption,
  ): Outcome<Readonly<{ source: Source; loaded: Loaded }>, string> {
    const source = sourceOf(input.sources(access), definition.name)
    if (source === undefined) return fail('the entry source is not in service')
    let entry: ToolSourceEntry | undefined
    try {
      entry = source.select(access, definition.name)
    } catch {
      return fail('the entry source could not select the entry')
    }
    if (entry === undefined)
      void Promise.resolve(access)
        .then(asker => source.list(asker))
        .catch(() => undefined)
    if (entry === undefined || entry.availability.kind !== 'available')
      return fail('the source entry is not available now')
    if (canonicalDigest(entry.executor) !== canonicalDigest(executor))
      return fail('the source entry has another executor than the one the call was fixed with')
    const loaded = loadedOf(access, source, { ...entry, definition })
    return 'failure' in loaded ? loaded : succeed({ source, loaded: loaded.ok })
  }

  const entries: LocalToolSourcedEntries<P> = {
    read: (access, names) =>
      readEntries(input.sources(access), access, policy.listTimeoutMs, names),
  }

  return {
    entries,

    registry(base: LocalToolBindingRegistry<P, E, B>): LocalToolBindingRegistry<P, E, B> {
      return Object.freeze({
        ...base,
        peek: (access, availability) => {
          const { definition } = availability
          if (sourceOf(input.sources(access), definition.name) === undefined)
            return base.peek(access, availability)
          const found = selected(access, definition, availability.executor)
          return 'failure' in found ? unavailable(found.failure) : succeed(found.ok.loaded)
        },
        selectAndPin: (access, request, call) => {
          const { availability } = request
          const { definition } = availability
          if (sourceOf(input.sources(access), definition.name) === undefined)
            return base.selectAndPin(access, request, call)
          if (availability.kind !== 'available') return unavailable('the fixed tool is unavailable')
          const { executor } = availability
          const found = selected(access, definition, executor)
          if ('failure' in found) return unavailable(found.failure)
          const { source, loaded } = found.ok
          return succeed({
            loaded,
            pin: pinOf(source.prefix),
            repin: again => {
              const current = selected(again, definition, executor)
              return 'failure' in current || current.ok.source !== source
                ? unavailable('original source entry is absent')
                : succeed(pinOf(source.prefix))
            },
          })
        },
      } satisfies LocalToolBindingRegistry<P, E, B>)
    },
  }
}
