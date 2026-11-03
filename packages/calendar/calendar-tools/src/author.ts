import { z } from 'zod'
import type { CalendarQueries } from '@omne-harness/calendar-contract'
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
import type { CalendarToolEnvironment } from './environment.ts'
import {
  calendarToolAdoption,
  calendarToolArgumentsSchema,
  calendarToolParameterCodec,
  calendarToolResultSchema,
  jsonTree,
  nativeJson,
  resultLimits,
  resultSchemas,
  type CalendarToolArguments,
  type CalendarToolResult,
} from './protocol.ts'

const vocabulary = { ...calendarToolAdoption, name: 'json-schema-2020-12' }
const resultDocument = z.toJSONSchema(calendarToolResultSchema)
const resultAdoption = describedAdoption({
  owner: '@omne-harness/calendar-tools',
  name: 'calendar-tool-result',
  revision: '1',
  document: resultDocument,
})
const schema = {
  identity: { id: 'calendar-tool-result', revision: '1', digest: resultAdoption.digest },
  ref: defineSchema({
    id: 'calendar-tool-result',
    load: async () =>
      zodDefinition({
        revision: '1',
        schema: calendarToolResultSchema,
        numbers: 'exact-or-reject',
      }),
  }),
  maxBytes: resultLimits.maxBytes,
}

async function execute(
  queries: CalendarQueries,
  args: CalendarToolArguments,
  environment: CalendarToolEnvironment,
): Promise<CalendarToolResult> {
  const context = environment.calendarContext
  if (context.kind === 'error') return context
  switch (args.action) {
    case 'list':
      return queries.list(context.value, args.input)
    case 'get':
      return queries.get(context.value, args.input)
    case 'effective':
      return queries.effective(context.value)
    case 'resolve':
      return queries.resolve(context.value, args.input)
  }
}

/** A trusted local binding. Construction JSON cannot select a query provider or identity. */
export function createCalendarToolModule(
  queries: CalendarQueries,
): ToolImplementationModule<CalendarToolEnvironment, ToolMessageContentBlock> {
  return {
    executor: calendarToolAdoption,
    createAuthor(construction) {
      if (construction.kind !== 'object' || construction.entries.length !== 0)
        return fail({
          field: 'construction',
          reason: 'Calendar query has no construction settings',
        })
      const operation = defineToolOperation<
        CalendarToolArguments,
        CalendarToolResult,
        CalendarToolEnvironment,
        ToolMessageContentBlock,
        Extract<ToolOperationParameters, { kind: 'declared' }>
      >({
        parameters: {
          kind: 'declared',
          value: {
            schema: jsonTree(z.toJSONSchema(calendarToolArgumentsSchema)),
            vocabulary,
            descriptions: [],
          },
        },
        returns: {
          kind: 'ordinary',
          program: {
            kind: 'json',
            contract: calendarToolAdoption,
            schema: schema.identity,
            definition: { schema: jsonTree(resultDocument), vocabulary, descriptions: [] },
            maxBytes: schema.maxBytes,
          },
        },
        author: {
          kind: 'ordinary',
          parameters: calendarToolParameterCodec,
          waits: [],
          executor: {
            execute: (args: CalendarToolArguments, environment: CalendarToolEnvironment) =>
              execute(queries, args, environment),
          },
          codec: {
            adoption: calendarToolAdoption,
            encode(value: unknown) {
              const result = calendarToolResultSchema.safeParse(value)
              if (!result.success) return fail({ reason: result.error.message })
              const bytes = new TextEncoder().encode(JSON.stringify(result.data))
              const bounded = readJsonBytes(bytes, resultLimits)
              return bounded.kind === 'ok' ? succeed(bytes) : fail({ reason: bounded.kind })
            },
            decode(bytes: Uint8Array) {
              const read = readJsonBytes(bytes, resultLimits)
              if (read.kind !== 'ok') return fail({ reason: read.kind })
              const result = calendarToolResultSchema.safeParse(nativeJson(read.value))
              return result.success ? succeed(result.data) : fail({ reason: result.error.message })
            },
          },
          output: {
            adoption: calendarToolAdoption,
            check({
              arguments: args,
              value,
            }: {
              arguments: CalendarToolArguments
              value: unknown
            }) {
              const result = resultSchemas[args.action].safeParse(value)
              return result.success ? succeed(result.data) : fail({ reason: result.error.message })
            },
          },
          renderer: { render: (value: CalendarToolResult) => succeed(JSON.stringify(value)) },
          program: {
            kind: 'json',
            adoption: calendarToolAdoption,
            schema,
            encode: (value: CalendarToolResult) => succeed(jsonTree(value)),
          },
        },
      })
      if ('failure' in operation) return operation
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description:
            'Read calendars and resolve working days. Explicit selection and version are required. Identity comes from the trusted call environment.',
          backgroundAllowed: false,
          declarations: {
            adoption: calendarToolAdoption,
            environment: {
              adoption: calendarToolAdoption,
              value: jsonTree({ capability: 'calendar.read' }),
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
