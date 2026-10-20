import { createHash } from 'node:crypto'
import { judgeContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import {
  createToolLedger,
  createToolRuntime,
  createTools,
  executeTool,
  type ToolLedgerAction,
} from '@omne-harness/tool'
import { createMemoryToolContent } from '@omne-harness/tool/testing'
import {
  defaultResultPolicy,
  projectToolResult,
  readToolInvocationRef,
  type Access,
  type Attachment,
  type RawOutput,
  type ToolInvocationRef,
  type ToolMessageContentBlock,
  type ToolResult,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { authorRun, options, result, visible } from './tools-values.ts'
import { scope } from './scope-values.ts'
import { startHarness } from './start-values.ts'
import { testAssembly } from './testing-values.ts'
import {
  adoption,
  configurationOf,
  evidence,
  functionDefinition,
  guards,
  ok,
  operationId,
  principalA,
  request,
  tenantA,
  type Principal,
} from './runtime-values.ts'

type View = readonly ToolMessageContentBlock[]
export type ModelRead = Readonly<{
  kind: 'result' | 'attachment'
  reference: string
  after: string | null
}>

export function modelText(view: View): string {
  return view.flatMap(block => (block.kind === 'text' ? [block.text] : [])).join('\n')
}
export function modelField(view: View, name: string): string {
  const row = modelText(view)
    .split('\n')
    .find(line => line.slice(0, line.indexOf(':')).trim() === name)
  if (row === undefined)
    throw new Error(`Missing visible ${name}: ${modelText(view).slice(0, 500)}`)
  return row.slice(row.indexOf(':') + 1).trim()
}

// This object receives only P14 blocks. It has no host, ledger, ResultPage or protocol codec.
export class PagingModel {
  constructor(help: View) {
    const text = modelText(help)
    for (const expected of ['read_result', '"oneOf"', 'after=null', 'next=null', 'base64'])
      if (!text.includes(expected)) throw new Error(`Help omits ${expected}`)
  }
  continue(view: View): ModelRead | null {
    if (modelText(view).includes('ERROR:')) return null
    const next = modelField(view, 'next')
    return next === 'null'
      ? null
      : {
          kind: modelField(view, 'content') === 'attachment bytes' ? 'attachment' : 'result',
          reference: modelField(view, 'reference'),
          after: next,
        }
  }
  start(view: View, kind: ModelRead['kind'] = 'result'): ModelRead {
    return { kind, reference: modelField(view, 'reference'), after: null }
  }
  attachment(view: View, index: number): ModelRead {
    const lines = modelText(view).split('\n')
    const at = lines.findIndex(
      row =>
        row.slice(0, row.indexOf(':')).trim() === 'attachment' &&
        row.slice(row.indexOf(':') + 1).trim() === String(index),
    )
    const reference = lines[at + 1]
    if (
      at < 0 ||
      reference === undefined ||
      reference.slice(0, reference.indexOf(':')).trim() !== 'reference'
    )
      throw new Error('Missing visible attachment reference')
    return {
      kind: 'attachment',
      reference: reference.slice(reference.indexOf(':') + 1).trim(),
      after: null,
    }
  }
  original(view: View): ModelRead {
    return { kind: 'attachment', reference: modelField(view, 'originalReference'), after: null }
  }
}

export function projectForModel(value: ToolResult<ToolMessageContentBlock>, message: string): View {
  const ids = value.attachments.map((_, index) => visible(`${message}-attachment-${index}`, '').id)
  return structuredClone(ok(projectToolResult(value, ids)))
}

export function byteAttachment(bytes: Uint8Array, key = 'ordinary'): Attachment {
  return {
    storage: 'logical',
    key,
    mediaType: 'application/octet-stream',
    bytes: String(bytes.length),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
}

export function sourceBlocks(): readonly ToolMessageContentBlock[] {
  const ref = judgeContentBlock({
    kind: 'image',
    id: 'visible-image',
    visibility: { toHuman: true, toModel: true },
    ref: {
      storage: 'logical',
      key: 'visible-image',
      mediaType: 'image/png',
      bytes: '4',
      digest: 'sha256:image',
    },
    transcript: null,
  })
  if ('rejected' in ref) throw new Error('Invalid source ref')
  return [
    visible('first', 'first visible text'),
    ok(defaultResultPolicy.judge(ref.ok)),
    { ...visible('hidden', 'HIDDEN-SOURCE-TEXT'), visibility: { toHuman: true, toModel: false } },
    ...Array.from({ length: 6 }, (_, index) =>
      visible(`large-${index}`, `${index}:` + 'x'.repeat(1840)),
    ),
  ]
}

export async function modelHost(
  input: Readonly<{
    terminal?: ToolTerminal
    value?: (raw: RawOutput) => ToolResult<ToolMessageContentBlock>
  }> = {},
) {
  const content = createMemoryToolContent<Principal>()
  const denied: ToolLedgerAction[] = []
  const actions: ToolLedgerAction[] = []
  const bytes = new TextEncoder().encode('中🙂\u0000')
  const attachment = byteAttachment(bytes)
  const sourceValue =
    input.value ??
    (() => ({
      ...result(sourceBlocks(), [attachment]),
      data: {
        kind: 'json',
        contract: adoption('source-program'),
        schema: { id: 'source-program', revision: '1', digest: 'sha256:program' },
        value: { kind: 'string', value: 'HIDDEN-SOURCE-DATA' },
      },
    }))
  let sourceExecutions = 0
  const positions: string[] = []
  const h = startHarness({
    custodyPort: () => content.custody,
    resultPageBytes: options.resultPageBytes,
    bindingPort: base => ({
      ...base,
      start: async (start, environment) => {
        const live = await base.start(start, environment)
        if ('failure' in live) return live
        const source = start.request.command === null
        const preserve = (bytes: Uint8Array, codec: RawOutput['codec']) =>
          content.custody.preserve({
            principal: start.principal,
            tenant: start.tenant,
            call: start.call,
            operation: operationId(`raw-${start.call}`),
            codec,
            bytes,
            source: evidence('source-output'),
          })
        const output = async () => {
          if (source) {
            const raw = ok(
              await preserve(new TextEncoder().encode('original bytes'), adoption('source-codec')),
            )
            const value = ok(
              await executeTool(
                {},
                {
                  execute: async () => {
                    sourceExecutions += 1
                    return sourceValue(raw)
                  },
                },
                environment,
                scope().scope,
              ),
            )
            return { raw, value }
          }
          const value = ok(
            await authorRun(tools, start.request.command ?? '', start.request.arguments, start),
          )
          const registration = readToolRegistration(tools.author)
          if (registration?.kind !== 'commands') throw new Error('Not registered')
          const operation = registration.operations.find(([name]) => name === start.request.command)
          if (operation === undefined) throw new Error('Not a registered command')
          const raw = ok(
            await preserve(
              ok(operation[1].author.codec.encode(value)),
              operation[1].author.codec.adoption,
            ),
          )
          return { raw, value }
        }
        const { raw, value } = await output()
        await h.binding.controls.finish(start.start, {
          kind: 'final',
          raw,
          result: value,
          terminal: source ? (input.terminal ?? { kind: 'completed' }) : { kind: 'completed' },
          effect: { kind: 'not-occurred', evidence: evidence('read-only') },
        })
        return live
      },
    }),
  })
  const allowed = guards()
  const restricted = guards({ deniedActions: denied })
  let sourceReference: ToolInvocationRef | null = null
  const ledger = createToolLedger(
    h.memory,
    {
      ...allowed,
      sources: h.source.guard,
      budgets: { arguments: options.arguments },
      access: {
        qualify: access => {
          if (
            sourceReference !== null &&
            access.call === readToolInvocationRef(sourceReference).call
          ) {
            actions.push(access.action)
            return restricted.access.qualify(access)
          }
          return allowed.access.qualify(access)
        },
      },
    },
    createMemoryToolClock(),
    configurationOf({ resultPageBytes: options.resultPageBytes }),
    {
      custody: content.custody,
      releaseInspection: h.environments,
      content: content.reader,
    },
  )
  const assembly = testAssembly()
  const reader = createToolRuntime(
    {
      ...assembly.dependencies,
      commands: ledger.commands,
      reads: ledger.reads,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
      sourceIssuer: h.source.issuer,
      operationIdentities: h.identities.operationIdentities,
    },
    configurationOf({ resultPageBytes: options.resultPageBytes }),
  ).runtime
  let failNextSourceRead = false
  const reads = {
    queries: {
      readResult: async (access: Parameters<typeof reader.queries.readResult>[0]) => {
        if (failNextSourceRead && access.reference === sourceReference) {
          failNextSourceRead = false
          h.memory.injectRead('unavailable')
        }
        const response = await reader.queries.readResult(access)
        if ('failure' in response) return response
        return succeed({
          ...response.ok,
          value: ok(defaultResultPolicy.judgeResult(response.ok.value)),
        })
      },
    },
    content: { read: reader.content.read },
  }
  let tools = createTools(reads, options)
  async function invoke(command: string | null, args: unknown, access: Access<Principal>) {
    const position = `model-message-${positions.length}`
    positions.push(position)
    const invoked = await reader.invoke({
      ...access,
      request: request({
        availability: {
          kind: 'available',
          definition: command === null ? functionDefinition() : tools.author.definition,
          executor: adoption(command === null ? 'source-executor' : 'Tools-executor'),
        },
        command,
        consumer: { ...request().consumer, position },
        arguments: {
          original: JSON.stringify(args),
          effective: JSON.stringify(args),
          complete: true,
        },
      }),
    })
    if (invoked.kind !== 'accepted') throw new Error(JSON.stringify(invoked))
    if (command === null) sourceReference = invoked.reference
    const { call } = readToolInvocationRef(invoked.reference)
    for (let i = 0; i < 100; i += 1) {
      await h.host.driver().run({
        ...access,
        call,
        instance: await h.host.instanceOf(call, access.tenant),
        signal: new AbortController().signal,
      })
      await h.host.runScheduled()
      const found = ok(await h.runtime.queries.lookup({ ...access, reference: invoked.reference }))
      if (found.kind === 'found' && found.state.phase === 'settled') {
        return {
          ...access,
          reference: invoked.reference,
          result: found.state.result,
          state: found.state,
          position,
        }
      }
    }
    throw new Error('Invocation did not settle')
  }
  const source = await invoke(null, {}, { principal: principalA, tenant: tenantA })
  ok(
    content.controls.seed({
      ...source,
      call: readToolInvocationRef(source.reference).call,
      attachment,
      bytes,
    }),
  )
  const metaCalls: Awaited<ReturnType<typeof invoke>>[] = []
  return {
    h,
    reader,
    content,
    reads,
    denied,
    actions,
    source,
    bytes,
    attachment,
    positions,
    metaCalls,
    sourceExecutions: () => sourceExecutions,
    failSourceRead: () => {
      failNextSourceRead = true
    },
    definition: tools.author.definition,
    registration: readToolRegistration(tools.author),
    present: async (access: Access<Principal> = source) =>
      projectForModel(await tools.present({ ...source, ...access }), 'initial'),
    rebuild: () => {
      tools = createTools(reads, options)
    },
    async call(command: string, args: unknown, access: Access<Principal> = source) {
      const call = await invoke(command, args, access)
      metaCalls.push(call)
      const first = ok(await reads.queries.readResult({ ...call, after: null }))
      const full = ok(await tools.readReply(call))
      return { call, first, full, view: projectForModel(full, call.position) }
    },
    async release() {
      const first = ok(await reads.queries.readResult({ ...source, after: null }))
      return h.runtime.commands.releaseDelivery({
        ...source,
        delivery: first.delivery,
        consumer: { ...request().consumer, position: source.position },
        evidence: { kind: 'retained', custody: evidence('source-retained', 'consumer') },
      })
    },
  }
}
