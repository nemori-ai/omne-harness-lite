import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createTools,
  createToolLedger,
  createToolRuntime,
  executeTool,
  type Tools,
  type ToolsOptions,
  type ToolLedgerAction,
} from '@omne-harness/tool'
import { createMemoryToolContent } from '@omne-harness/tool/testing'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  defaultResultPolicy,
  decodeToolDeliveryId,
  decodeToolResultVersion,
  readToolInvocationRef,
  type Access,
  type Attachment,
  type ResultPage,
  type ToolArguments,
  type ToolMessageContentBlock,
  type ToolResult,
  type RawOutput,
} from '@omne-harness/tool-contract'
import { checkMessage } from '../src/tools-results.ts'
import { settlementFixture } from './settlement-values.ts'
import { startHarness } from './start-values.ts'
import { scope } from './scope-values.ts'
import { testAssembly } from './testing-values.ts'
import {
  adoption,
  configuration,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  referenceFor,
  request,
  tenantA,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

export const options: ToolsOptions = {
  arguments: {
    maxBytes: 65536,
    maxDepth: 32,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 32768,
    maxNumberLength: 32,
  },
  resultPageBytes: 4096,
  replyMaxBytes: 65536,
  contentPageBytes: 2,
}
export const version = (value = 'result-one') => ok(decodeToolResultVersion(value))
export function result(
  content: readonly Block[] = [],
  attachments: readonly Attachment[] = [],
): ToolResult<Block> {
  return { content, data: { kind: 'none' }, original: { kind: 'none' }, attachments }
}
export const visible = (id: string, body: string) => ({
  ...text(id, body),
  visibility: { toHuman: true, toModel: true },
})
export function body(value: ToolResult<ToolMessageContentBlock>): string {
  return value.content
    .flatMap(block => (block.kind === 'text' && block.visibility.toModel ? [block.text] : []))
    .join('\n')
}
export function token(value: ToolResult<ToolMessageContentBlock>, field: string): string {
  const line = body(value)
    .split('\n')
    .find(
      row =>
        row.trimStart().startsWith(field) &&
        row
          .slice(row.indexOf(field) + field.length)
          .trimStart()
          .startsWith(':'),
    )
  if (line === undefined) throw new Error(`No ${field} in ${body(value)}`)
  return line.slice(line.indexOf(':') + 1).trim()
}
export async function authorRun(
  tools: Tools<Principal>,
  command: string,
  args: string | ToolArguments,
  access: Access<Principal> = { principal: principalA, tenant: tenantA },
) {
  const registered = readToolRegistration(tools.implementation)
  if (registered?.kind !== 'commands') throw new Error('not a real command registration')
  const entry = registered.operations.find(([name]) => name === command)
  if (entry === undefined) return fail({ kind: 'invalid', reason: 'unknown-command' } as const)
  const author = entry[1].author
  const parsed = author.parameters.parse(
    typeof args === 'string' ? { original: args, effective: args, complete: true } : args,
  )
  if ('failure' in parsed) return parsed
  const execution = scope()
  const returned = ok(await executeTool(parsed.ok, author.executor, access, execution.scope))
  const validated = ok(author.output.check({ arguments: parsed.ok, value: returned }))
  const encoded = ok(author.codec.encode(validated))
  return checkMessage(ok(author.codec.decode(encoded)))
}
export async function sourceFixture(
  value: ToolResult<Block> | ((raw: RawOutput) => ToolResult<Block>) = result([
    visible('one', 'source'),
  ]),
  overrides: Partial<ToolsOptions> = {},
  deniedActions: ToolLedgerAction[] = [],
) {
  const bytes = new TextEncoder().encode('中🙂\u0000')
  const attachment: Attachment = {
    storage: 'bytes',
    key: 'sample',
    mediaType: 'application/octet-stream',
    bytes: String(bytes.length),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
  const content = createMemoryToolContent<Principal>()
  const f = await settlementFixture({ custody: content.custody, value })
  const settled = ok(await f.preserve())
  if (settled.phase !== 'settled') throw new Error('not settled')
  ok(content.controls.seed({ ...f.access, attachment, bytes }))
  const config = {
    ...configuration(),
    resultPageBytes: overrides.resultPageBytes ?? options.resultPageBytes,
  }
  const ledger = createToolLedger(
    f.harness.memory,
    guards({ deniedActions }),
    createMemoryToolClock(),
    config,
    {
      custody: content.custody,
      releaseInspection: f.environment,
      content: content.reader,
    },
  )
  const assembly = testAssembly()
  const runtime = createToolRuntime(
    {
      ...assembly.dependencies,
      commands: ledger.commands,
      reads: ledger.reads,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
    },
    config,
  ).runtime
  const access = {
    principal: principalA,
    tenant: tenantA,
    reference: referenceFor('settlement', 'op-settlement'),
    result: settled.result,
  }
  const reads = {
    content: runtime.content,
    queries: {
      readResult: async (input: Parameters<typeof runtime.queries.readResult>[0]) => {
        const response = await runtime.queries.readResult(input)
        if ('failure' in response) return response
        const checked = defaultResultPolicy.judgeResult(response.ok.value)
        if ('failure' in checked) throw new Error(checked.failure.reason)
        return succeed({ ...response.ok, value: checked.ok })
      },
    },
  }
  return {
    f,
    runtime,
    access,
    content,
    bytes,
    attachment,
    tools: createTools(reads, { ...options, ...overrides }),
  }
}
export function page(value: ToolResult<Block>, next: string | null = null): ResultPage<Block> {
  return {
    result: version(),
    terminal: { kind: 'completed' },
    actualTerminal: null,
    relation: 'original',
    effect: { kind: 'not-started' },
    delivery: okDelivery(),
    source: evidence('result'),
    value,
    next,
  }
}
function okDelivery() {
  return ok(decodeToolDeliveryId('delivery'))
}
export const access = {
  principal: principalA,
  tenant: tenantA,
  reference: referenceFor('original', 'op-original'),
  result: version(),
}

export function registeredFixture(tools: Tools<Principal>, replyOptions: ToolsOptions = options) {
  let count = 0
  const h = startHarness({
    resultPageBytes: replyOptions.resultPageBytes,
    bindingPort: base => ({
      ...base,
      start: async (input, environment) => {
        const live = await base.start(input, environment)
        if ('failure' in live) return live
        count += 1
        const value = ok(
          await authorRun(tools, input.request.command ?? '', input.request.arguments),
        )
        const registered = readToolRegistration(tools.implementation)
        if (registered?.kind !== 'commands') throw new Error('not commands')
        const operation = registered.operations.find(([name]) => name === input.request.command)
        if (operation === undefined) throw new Error('not a command')
        const bytes = ok(operation[1].author.codec.encode(value))
        const raw = ok(
          await h.custody.preserve({
            principal: input.principal,
            tenant: input.tenant,
            call: input.call,
            operation: operationId(`raw-${input.call}`),
            codec: operation[1].author.codec.adoption,
            bytes,
            source: evidence('author-output'),
          }),
        )
        await h.binding.controls.finish(input.start, {
          kind: 'final',
          raw,
          result: value,
          terminal: { kind: 'completed' },
          effect: { kind: 'not-occurred', evidence: evidence('read-only') },
        })
        return live
      },
    }),
  })
  const receiver = createTools(h.runtime, replyOptions)
  return {
    h,
    calls: () => count,
    async invoke(command: string, argumentsValue: unknown) {
      const payload = request({
        availability: {
          kind: 'available',
          definition: tools.definition,
          executor: adoption('Tools-executor'),
          layer: { kind: 'official' },
        },
        command,
        arguments: {
          original: JSON.stringify(argumentsValue),
          effective: JSON.stringify(argumentsValue),
          complete: true,
        },
        consumer: { ...request().consumer, position: `reply-${count}` },
      })
      const invoked = await h.runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: payload,
      })
      if (invoked.kind !== 'accepted') throw new Error(JSON.stringify(invoked))
      const { call } = readToolInvocationRef(invoked.reference)
      await h.drive(call)
      for (let i = 0; i < 100; i += 1) {
        const found = ok(
          await h.runtime.queries.lookup({
            principal: principalA,
            tenant: tenantA,
            reference: invoked.reference,
          }),
        )
        if (found.kind === 'found' && found.state.phase === 'settled') {
          const full = await receiver.readReply({
            principal: principalA,
            tenant: tenantA,
            reference: invoked.reference,
            result: found.state.result,
          })
          return {
            full,
            state: found.state,
            reference: invoked.reference,
            result: found.state.result,
          }
        }
        await Promise.resolve()
        await h.drive(call)
      }
      throw new Error('meta call did not settle')
    },
  }
}
