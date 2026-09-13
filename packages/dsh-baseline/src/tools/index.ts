/**
 * Source-only native tool registry and schema boundary, selectively derived
 * from DeepSeek Harness. PTC, approval, host tools, and product authorization
 * are intentionally outside this module.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { AnonymousEntries, NamedEntries, ScopedLayers, scopeOf } from '@omne-harness-lite/agent/scope-baseline'
import type { ScopeKey, ScopeLayer } from '@omne-harness-lite/agent/scope-baseline'
import { HarnessError, errorChain } from '../llm/index.ts'
import type { ContentBlock, ToolCallId, ToolSchema } from '../llm/index.ts'
import { deepFreeze, snapshotJsonValue } from '../support/values.ts'
import type { JsonValue } from '../support/values.ts'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from './json-schema.ts'
import type { JsonSchemaNode } from './json-schema.ts'
import { ToolArgsError } from './schema.ts'
import type { ToolCallView, ToolResultView } from './presentation.ts'

export {
  defineTool,
  valueSchemaSpecToJsonSchema,
  parameterSchemaSpecToJsonSchema,
  validateArgs,
  ToolArgsError,
} from './schema.ts'
export type {
  ValueSchemaAnnotations,
  StringValueSchemaSpec,
  NumberValueSchemaSpec,
  IntegerValueSchemaSpec,
  BooleanValueSchemaSpec,
  NullValueSchemaSpec,
  ArrayValueSchemaSpec,
  ObjectValueSchemaSpec,
  JsonValueSchemaSpec,
  OneOfValueSchemaSpec,
  ValueSchemaSpec,
  ParameterPropertySpec,
  ParameterSchemaSpec,
  ParameterJsonSchema,
  InferValue,
  InferArgs,
  DefineToolOptions,
} from './schema.ts'
export {
  assertSupportedJsonSchema,
  assertObjectJsonSchema,
  validateJsonSchemaValue,
  JsonSchemaError,
} from './json-schema.ts'
export type {
  JsonSchemaNode,
  ObjectJsonSchema,
  JsonSchemaType,
  JsonSchemaScalar,
} from './json-schema.ts'
export type {
  ToolCallKind,
  FileLocation,
  FileDiff,
  ReadFileLine,
  ToolCallView,
  GenericCallView,
  TerminalCallView,
  DiffCallView,
  ToolResultView,
  GenericResultView,
  TerminalResultView,
  DiffResultView,
  SearchResultView,
  SearchMatchesResultView,
  SearchPathsResultView,
  SearchFileMatches,
  SearchLineMatch,
  ReadResultView,
  WebResultView,
  WebSearchResultView,
  WebFetchResultView,
  WebSource,
} from './presentation.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: ToolRuntime
  }

  interface Events {
    /** Unfiltered notification that a source registry view may have changed. */
    'tools/change'(): void
  }
}

/** Canonical output declaration owned by one tool definition. */
export interface ToolOutputDefinition {
  readonly schema: JsonSchemaNode
  render(args: unknown, value: JsonValue): ContentBlock[]
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}

/** A native-callable source definition. */
export interface ToolDefinition extends ToolSchema {
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  presentCall?(args: unknown): ToolCallView | undefined
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}

/** Completed projection passed to a replay-safe presenter. */
export interface ToolResult {
  readonly content: ContentBlock[]
  readonly isError: boolean
  readonly meta?: JsonValue
}

/** Caller-owned source invocation input. `scope` is visibility, not authorization. */
export interface ToolExecutionInput {
  readonly callId: ToolCallId
  readonly name: string
  readonly arguments: unknown
  readonly scope?: ScopeKey
  readonly signal: AbortSignal
}

declare const executionTokenBrand: unique symbol
export type ToolExecutionToken = symbol & { readonly [executionTokenBrand]: true }

/** Registry-minted immutable identity for one invocation. */
export interface ToolExecution extends ToolExecutionInput {
  readonly token: ToolExecutionToken
}

export type ToolRunContext = ToolExecution

export interface ToolErrorInfo {
  readonly name: string
  readonly code: string
}

export interface ToolFailure {
  readonly message: string
  readonly info: ToolErrorInfo
}

export interface ToolExecutionSuccess {
  readonly isError: false
  readonly value: JsonValue
  readonly content: ContentBlock[]
  readonly meta?: JsonValue
  readonly error?: never
}

export interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure
  readonly content: ContentBlock[]
  readonly value?: never
  readonly meta?: never
}

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure

export const TOOL_ABORTED = 'ABORTED'
export const TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'

export class ToolNotFoundError extends HarnessError {
  constructor(toolName: string) {
    super(`unknown tool "${toolName}"`, 'UNKNOWN_TOOL')
    this.name = 'ToolNotFoundError'
  }
}

export class ToolOutputError extends HarnessError {
  readonly violations: string[]

  constructor(toolName: string, violations: string[]) {
    super(`tool "${toolName}" returned invalid output: ${violations.join('; ')}`, 'INVALID_TOOL_OUTPUT')
    this.name = 'ToolOutputError'
    this.violations = violations
  }
}

/** Per-scope intersection over inherited definitions. Own definitions remain visible. */
export interface ToolRestriction {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
}

interface CompiledRestriction {
  readonly allow?: ReadonlySet<string>
  readonly deny?: ReadonlySet<string>
}

class ToolLayer implements ScopeLayer {
  readonly tools: NamedEntries<ToolDefinition>
  readonly restrictions = new AnonymousEntries<CompiledRestriction>()

  constructor(scope: ScopeKey | undefined) {
    this.tools = new NamedEntries(name => new Error(scope === undefined
      ? `tool "${name}" is already registered (register a scoped variant through that scope's Context)`
      : `tool "${name}" is already registered in this scope`))
  }

  isEmpty(): boolean {
    return this.tools.isEmpty() && this.restrictions.isEmpty()
  }

  admits(name: string): boolean {
    for (const restriction of this.restrictions.values()) {
      if (restriction.allow !== undefined && !restriction.allow.has(name)) return false
      if (restriction.deny?.has(name) === true) return false
    }
    return true
  }
}

function snapshotProjection<T>(toolName: string, projector: string, candidate: T): T {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) throw new Error('returned non-lossless JSON')
    return deepFreeze(detached) as T
  } catch (error: unknown) {
    throw new ToolOutputError(toolName, [`output.${projector} failed: ${errorChain(error)}`])
  }
}

function project<T>(toolName: string, projector: string, projection: () => T): T {
  try {
    return snapshotProjection(toolName, projector, projection())
  } catch (error: unknown) {
    if (error instanceof ToolOutputError) throw error
    throw new ToolOutputError(toolName, [`output.${projector} failed: ${errorChain(error)}`])
  }
}

function snapshotValue(toolName: string, candidate: unknown): JsonValue {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) throw new Error('value is not lossless JSON')
    return deepFreeze(detached as JsonValue)
  } catch (error: unknown) {
    if (error instanceof ToolOutputError) throw error
    throw new ToolOutputError(toolName, [`value snapshot failed: ${errorChain(error)}`])
  }
}

function snapshotArguments(candidate: unknown): JsonValue {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) throw new Error('not lossless JSON')
    return deepFreeze(detached as JsonValue)
  } catch (error: unknown) {
    throw new TypeError('tool execution arguments must be losslessly JSON-serializable', { cause: error })
  }
}

function freezeDefinition(definition: ToolDefinition): ToolDefinition {
  if (definition.name.length === 0) throw new TypeError('tool name must be non-empty')
  if (typeof definition.description !== 'string') throw new TypeError(`tool "${definition.name}" description must be a string`)
  if (typeof definition.execute !== 'function') throw new TypeError(`tool "${definition.name}" must declare execute()`)
  if (typeof definition.output !== 'object' || definition.output === null
    || typeof definition.output.render !== 'function'
    || (definition.output.presentationMeta !== undefined && typeof definition.output.presentationMeta !== 'function')) {
    throw new TypeError(`tool "${definition.name}" must declare output { schema, render, presentationMeta? }`)
  }
  assertSupportedJsonSchema(definition.parameters)
  assertSupportedJsonSchema(definition.output.schema)
  const parameters = snapshotProjection(definition.name, 'parameters', definition.parameters)
  const outputSchema = snapshotProjection(definition.name, 'schema', definition.output.schema)
  const output = Object.freeze({
    schema: outputSchema,
    render: definition.output.render,
    ...(definition.output.presentationMeta === undefined ? {} : { presentationMeta: definition.output.presentationMeta }),
  })
  return Object.freeze({
    name: definition.name,
    description: definition.description,
    parameters,
    output,
    execute: definition.execute,
    ...(definition.finalizeContent === undefined ? {} : { finalizeContent: definition.finalizeContent }),
    ...(definition.presentCall === undefined ? {} : { presentCall: definition.presentCall }),
    ...(definition.presentResult === undefined ? {} : { presentResult: definition.presentResult }),
  })
}

function failure(error: unknown): ToolExecutionFailure {
  const message = errorChain(error)
  const info = error instanceof HarnessError
    ? { name: error.name, code: error.code }
    : { name: error instanceof Error ? error.name : 'Error', code: 'UNKNOWN' }
  return deepFreeze({
    isError: true,
    error: { message, info },
    content: [{ type: 'text', text: `Error: ${message}` }],
  })
}

function aborted(code: typeof TOOL_ABORTED | typeof TOOL_ABORTED_BEFORE_DISPATCH): ToolExecutionFailure {
  const before = code === TOOL_ABORTED_BEFORE_DISPATCH
  const message = before ? 'tool call aborted before dispatch' : 'tool call aborted'
  return deepFreeze({
    isError: true,
    error: { message, info: { name: 'AbortError', code } },
    content: [{ type: 'text', text: `Error: ${message}` }],
  })
}

/** Apply one captured total content transform, normalizing its own failure once. */
function finalizeResult(
  toolName: string,
  definition: ToolDefinition,
  exec: ToolExecution,
  result: ToolExecutionResult,
): ToolExecutionResult {
  if (definition.finalizeContent === undefined) return result
  try {
    const replacement = definition.finalizeContent(exec, result)
    if (replacement === undefined) return result
    const content = snapshotProjection(toolName, 'finalizeContent', replacement)
    return deepFreeze({ ...result, content })
  } catch (error: unknown) {
    return failure(error)
  }
}

/** Source registry for scope-aware definition contributions and native invocation. */
export class ToolRuntime extends Service {
  private readonly layers = new ScopedLayers(
    scope => new ToolLayer(scope),
    () => { this.ctx.emit('tools/change') },
  )

  constructor(ctx: Context) {
    super(ctx, 'tools')
  }

  register(definition: ToolDefinition): () => void {
    const frozen = freezeDefinition(definition)
    return this.layers.effect(
      this.ctx,
      layer => layer.tools.insert(frozen.name, frozen),
      { label: 'tools.register()' },
    )
  }

  restrict(filter: ToolRestriction): () => void {
    const scope = scopeOf(this.ctx)
    if (scope === undefined) throw new Error('tools.restrict() requires a scoped context')
    if (filter.allow === undefined && filter.deny === undefined) {
      throw new Error('tools.restrict({}) is a no-op: pass allow and/or deny')
    }
    const known = this.restrictableNames(scope)
    const names = [...filter.allow ?? [], ...filter.deny ?? []]
    const unknown = names.filter(name => !known.has(name))
    if (unknown.length > 0) {
      throw new Error(`tools.restrict() names unknown inherited tool${unknown.length > 1 ? 's' : ''} ${unknown.map(name => `"${name}"`).join(', ')}`)
    }
    const restriction: CompiledRestriction = {
      ...(filter.allow === undefined ? {} : { allow: new Set(filter.allow) }),
      ...(filter.deny === undefined ? {} : { deny: new Set(filter.deny) }),
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.restrictions.append(restriction),
      { label: 'tools.restrict()' },
    )
  }

  private inherited(scope: ScopeKey | undefined): Map<string, ToolDefinition> {
    const layers = this.layers.chainLayers(scope)
    const own = this.layers.peek(scope)
    const inherited = new Map(this.layers.global.tools.entries())
    for (const layer of layers) {
      if (layer === own) continue
      for (const [name, definition] of layer.tools.entries()) inherited.set(name, definition)
    }
    return inherited
  }

  private restrictableNames(scope: ScopeKey | undefined): Set<string> {
    return new Set(this.inherited(scope).keys())
  }

  private view(scope: ScopeKey | undefined): Map<string, ToolDefinition> {
    const layers = this.layers.chainLayers(scope)
    const own = this.layers.peek(scope)
    const visible = new Map<string, ToolDefinition>()
    for (const [name, definition] of this.inherited(scope)) {
      if (layers.every(layer => layer.admits(name))) visible.set(name, definition)
    }
    if (own !== undefined) {
      for (const [name, definition] of own.tools.entries()) visible.set(name, definition)
    }
    return visible
  }

  get(name: string, scope?: ScopeKey): ToolDefinition | undefined {
    return this.view(scope).get(name)
  }

  schemas(scope?: ScopeKey): ToolSchema[] {
    return [...this.view(scope).values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters: snapshotProjection(name, 'parameters', parameters),
    }))
  }

  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    // Capture caller-owned aliases once; settlement must use the same call and signal as the body.
    const { callId, name, scope, signal, arguments: suppliedArguments } = input
    const definition = this.get(name, scope)
    if (definition === undefined) {
      return signal.aborted
        ? aborted(TOOL_ABORTED_BEFORE_DISPATCH)
        : failure(new ToolNotFoundError(name))
    }
    let exec: ToolExecution | undefined
    try {
      const args = snapshotArguments(suppliedArguments)
      exec = Object.freeze({
        callId, name, scope, signal,
        arguments: args,
        token: Symbol('dsh.tool.execution') as ToolExecutionToken,
      })
      if (signal.aborted) {
        return finalizeResult(name, definition, exec, aborted(TOOL_ABORTED_BEFORE_DISPATCH))
      }
      const argumentViolations = validateJsonSchemaValue(definition.parameters, args, '')
      if (argumentViolations.length > 0) {
        throw new ToolArgsError(argumentViolations)
      }
      const candidate = await definition.execute(args, exec)
      const value = snapshotValue(name, candidate)
      const outputViolations = validateJsonSchemaValue(definition.output.schema, value, 'value')
      if (outputViolations.length > 0) throw new ToolOutputError(name, outputViolations)
      if (signal.aborted) return finalizeResult(name, definition, exec, aborted(TOOL_ABORTED))
      const content = project(name, 'render', () => definition.output.render(args, value))
      const meta = definition.output.presentationMeta === undefined
        ? undefined
        : project(name, 'presentationMeta', () => definition.output.presentationMeta?.(args, value))
      const result: ToolExecutionResult = deepFreeze({
        isError: false,
        value,
        content,
        ...(meta === undefined ? {} : { meta }),
      })
      return finalizeResult(name, definition, exec, result)
    } catch (error: unknown) {
      const result = failure(error)
      return exec === undefined ? result : finalizeResult(name, definition, exec, result)
    }
  }
}

export default ToolRuntime
