import { z } from 'zod'
import {
  scheduleJsonSchema,
  ScheduleJsonValueSchema,
  type ScheduleCommands,
  type ScheduleQueries,
} from '@omne-harness/schedule-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { defineSchema, zodDefinition } from '@omne-harness/schema-provider'
import { readJsonBytes } from '@omne-harness/json-text'
import {
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import type { ScheduleToolEnvironment } from './environment.ts'
import {
  scheduleToolAdoption,
  scheduleToolArgumentsSchema,
  scheduleToolParameterCodec,
  scheduleToolResultSchema,
  jsonTree,
  nativeJson,
  resultLimits,
  summaryMaxBytes,
  same,
  invalid,
  type ScheduleToolArguments,
  type ScheduleToolResult,
} from './protocol.ts'

const schemaLimits = { ...resultLimits, maxDepth: 128 }
const vocabulary = { ...scheduleToolAdoption, name: 'json-schema-2020-12' }
const resultDocument = z.toJSONSchema(scheduleToolResultSchema, {
  io: 'input',
  unrepresentable: ({ zodSchema }) =>
    zodSchema === ScheduleJsonValueSchema ? scheduleJsonSchema(ScheduleJsonValueSchema) : 'throw',
})
const resultAdoption = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'schedule-result',
  revision: '1',
  document: resultDocument,
})
export const scheduleToolResultIdentity = Object.freeze({
  id: 'schedule-tool-result',
  revision: '1',
  digest: resultAdoption.digest,
})
const schema = {
  identity: scheduleToolResultIdentity,
  ref: defineSchema({
    id: 'schedule-tool-result',
    load: async () =>
      zodDefinition({
        revision: '1',
        schema: scheduleToolResultSchema,
        numbers: 'exact-or-reject',
      }),
  }),
  maxBytes: resultLimits.maxBytes,
}
export type ScheduleToolServices = Readonly<{
  commands: ScheduleCommands
  queries: ScheduleQueries
}>
async function execute(
  services: ScheduleToolServices,
  args: ScheduleToolArguments,
  environment: ScheduleToolEnvironment,
): Promise<ScheduleToolResult> {
  const fixed = environment.schedule
  if ('failure' in fixed)
    return { kind: 'adapterFailure', action: args.action, failure: fixed.failure, operation: null }
  if (!same(args, fixed.ok.arguments))
    return {
      kind: 'adapterFailure',
      action: args.action,
      failure: invalid('arguments', 'fixed-intent-mismatch'),
      operation: null,
    }
  const { context, write } = fixed.ok
  if (args.action === 'create' || args.action === 'execute') {
    if (write === null || write.intent.kind !== args.action)
      return {
        kind: 'adapterFailure',
        action: args.action,
        failure: invalid('environment', 'missing-fixed-write'),
        operation: null,
      }
    const value =
      write.intent.kind === 'create'
        ? await services.commands.create(context, write.intent.input)
        : await services.commands.execute(context, write.intent.input)
    return scheduleToolResultSchema.parse({
      kind: 'result',
      action: args.action,
      result: value,
      operation: write.locator,
    })
  }
  const result = await read(services, args, context)
  return scheduleToolResultSchema.parse({
    kind: 'result',
    action: args.action,
    result,
    operation: null,
  })
}
function read(
  services: ScheduleToolServices,
  args: Exclude<ScheduleToolArguments, { action: 'create' | 'execute' }>,
  context: Parameters<ScheduleQueries['get']>[0],
) {
  switch (args.action) {
    case 'queryOperation':
      return services.commands.queryOperation(context, args.input)
    case 'list':
      return services.queries.list(context, args.input)
    case 'get':
      return services.queries.get(context, args.input)
    case 'revisions':
      return services.queries.revisions(context, args.input)
    case 'executions':
      return services.queries.executions(context, args.input)
    case 'agenda':
      return services.queries.agenda(context, args.input)
    case 'preview':
      return services.queries.preview(context, args.input)
  }
}
const metadataKey =
  /^(kind|action|operation|error|failure|basis|control|standing|total|nextCursor|cursor|complete|incompleteReason|reason|remainingEligible|remainingJobs|observationRevision|replayed|retryAfterMs|id)$|(?:Id|Ref|Key|Revision|Count)$/u
function metadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(metadata)
  if (value === null || typeof value !== 'object') return undefined
  const entries: [string, unknown][] = []
  for (const [key, child] of Object.entries(value)) {
    if (metadataKey.test(key)) entries.push([key, child])
    else if (child !== null && typeof child === 'object') entries.push([key, metadata(child)])
  }
  return Object.fromEntries(entries)
}
export function renderScheduleToolSummary(value: ScheduleToolResult) {
  const checked = scheduleToolResultSchema.safeParse(value)
  if (!checked.success) return fail({ reason: checked.error.message })
  const full = JSON.stringify({ ...checked.data, truncated: false })
  if (Buffer.byteLength(full) <= summaryMaxBytes) return succeed(full)
  const abbreviated = JSON.stringify({ summary: metadata(checked.data), truncated: true })
  return Buffer.byteLength(abbreviated) <= summaryMaxBytes
    ? succeed(abbreviated)
    : fail({ reason: 'output_limit' })
}
export function createScheduleToolModule(
  services: ScheduleToolServices,
): ToolImplementationModule<ScheduleToolEnvironment, ToolMessageContentBlock> {
  return {
    executor: scheduleToolAdoption,
    createAuthor(construction) {
      if (construction.kind !== 'object' || construction.entries.length !== 0)
        return fail({
          field: 'construction',
          reason: 'Schedule tools have no construction settings',
        })
      const operation = defineToolOperation<
        ScheduleToolArguments,
        ScheduleToolResult,
        ScheduleToolEnvironment,
        ToolMessageContentBlock,
        Extract<ToolOperationParameters, { kind: 'declared' }>
      >({
        parameters: {
          kind: 'declared',
          value: {
            schema: jsonTree(scheduleJsonSchema(scheduleToolArgumentsSchema), schemaLimits),
            vocabulary,
            descriptions: [],
          },
        },
        returns: {
          kind: 'ordinary',
          program: {
            kind: 'json',
            contract: scheduleToolAdoption,
            schema: schema.identity,
            definition: {
              schema: jsonTree(resultDocument, schemaLimits),
              vocabulary,
              descriptions: [],
            },
            maxBytes: schema.maxBytes,
          },
        },
        author: {
          kind: 'ordinary',
          parameters: scheduleToolParameterCodec,
          waits: [],
          executor: { execute: (args, environment) => execute(services, args, environment) },
          codec: {
            adoption: scheduleToolAdoption,
            encode(value) {
              const checked = scheduleToolResultSchema.safeParse(value)
              if (!checked.success) return fail({ reason: checked.error.message })
              const bytes = new TextEncoder().encode(JSON.stringify(checked.data))
              return readJsonBytes(bytes, resultLimits).kind === 'ok'
                ? succeed(bytes)
                : fail({ reason: 'output_limit' })
            },
            decode(bytes) {
              const parsed = readJsonBytes(bytes, resultLimits)
              if (parsed.kind !== 'ok') return fail({ reason: 'output_limit' })
              const checked = scheduleToolResultSchema.safeParse(nativeJson(parsed.value))
              return checked.success
                ? succeed(checked.data)
                : fail({ reason: checked.error.message })
            },
          },
          output: {
            adoption: scheduleToolAdoption,
            check({ arguments: args, value }) {
              const checked = scheduleToolResultSchema.safeParse(value)
              return checked.success && checked.data.action === args.action
                ? succeed(checked.data)
                : fail({ reason: 'action-result-mismatch' })
            },
          },
          renderer: { render: renderScheduleToolSummary },
          program: {
            kind: 'json',
            adoption: scheduleToolAdoption,
            schema,
            encode(value) {
              const checked = scheduleToolResultSchema.safeParse(value)
              if (!checked.success) return fail({ reason: checked.error.message })
              try {
                return succeed(jsonTree(checked.data))
              } catch {
                return fail({ reason: 'output_limit' })
              }
            },
          },
        },
      })
      if ('failure' in operation) return operation
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description:
            'Manage schedules and read fixed operations, history, agendas and previews. Identity and original operation keys come from the trusted host.',
          backgroundAllowed: false,
          declarations: {
            adoption: scheduleToolAdoption,
            environment: {
              adoption: scheduleToolAdoption,
              value: jsonTree({ capabilities: ['schedule.read', 'schedule.write'] }),
            },
            attachments: [],
            inputModalities: ['text'],
            outputModalities: ['text'],
            settings: null,
          },
        },
      })
    },
  }
}
