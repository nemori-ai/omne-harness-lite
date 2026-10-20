import { describe, expect, it, vi } from 'vitest'
import { createToolRuntime } from '@omne-harness/tool'
import type { ToolDefiniteFailure } from '@omne-harness/tool-contract'
import { testAssembly } from './testing-values.ts'
import {
  evidence,
  operationRefFor,
  principalA,
  referenceFor,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'

type Runtime = ReturnType<typeof createRuntime>

function createRuntime(base: ReturnType<typeof testAssembly>) {
  return createToolRuntime(base.dependencies, base.configuration).runtime
}

function untrusted<I, O>(entry: (input: I) => O, input: unknown): O {
  // @ts-expect-error Deliberately exercise the public boundary from an untyped caller.
  return entry(input)
}

type Entry = Readonly<{
  name: string
  action: string
  field: 'reference' | 'operation'
  command: boolean
  run(runtime: Runtime, input: unknown): Promise<unknown>
}>

const entries: readonly Entry[] = [
  {
    name: 'lookup',
    action: 'lookup',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.lookup, input),
  },
  {
    name: 'queryOperation',
    action: 'query-operation',
    field: 'operation',
    command: false,
    run: (r, input) => untrusted(r.queries.queryOperation, input),
  },
  {
    name: 'readProcess',
    action: 'read-process',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.readProcess, input),
  },
  {
    name: 'readWait',
    action: 'read-wait',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.readWait, input),
  },
  {
    name: 'readDiagnostics',
    action: 'read-diagnostics',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.readDiagnostics, input),
  },
  {
    name: 'readResult',
    action: 'read-result',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.readResult, input),
  },
  {
    name: 'account',
    action: 'account',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.queries.account, input),
  },
  {
    name: 'releaseDelivery',
    action: 'release-delivery',
    field: 'reference',
    command: true,
    run: (r, input) => untrusted(r.commands.releaseDelivery, input),
  },
  {
    name: 'control',
    action: 'control',
    field: 'reference',
    command: true,
    run: (r, input) => untrusted(r.commands.control, input),
  },
  {
    name: 'connect',
    action: 'connect',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.instances.connect, input),
  },
  {
    name: 'content.read',
    action: 'read-content',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.content.read, input),
  },
  {
    name: 'content.raw',
    action: 'read-content',
    field: 'reference',
    command: false,
    run: (r, input) => untrusted(r.content.raw, input),
  },
]

const access = {
  principal: principalA,
  tenant: tenantA,
  reference: referenceFor('call', 'admission'),
  operation: operationRefFor('call', 'admission', 'operation'),
  at: null,
  wait: 'wait',
  after: null,
  result: 'v1',
  delivery: 'd1',
  consumer: request().consumer,
  evidence: { kind: 'retained', custody: evidence('kept', 'consumer') },
  intent: { kind: 'stop' },
  attachment: {
    storage: 'memory',
    key: 'attachment',
    mediaType: 'text/plain',
    bytes: '1',
    digest: 'sha256:a',
  },
  maxBytes: 1024,
}

const { principal: _principal, ...withoutPrincipal } = access
const boundaryCases = [
  {
    name: 'malformed reference',
    input: { ...access, reference: '[]', operation: '[]' },
    invalid: true,
  },
  {
    name: 'foreign tenant',
    input: {
      ...access,
      reference: referenceFor('call', 'admission', tenantB),
      operation: operationRefFor('call', 'admission', 'operation', tenantB),
    },
    invalid: false,
  },
  { name: 'null input', input: null, invalid: false },
  { name: 'primitive input', input: 1, invalid: false },
  { name: 'missing principal', input: withoutPrincipal, invalid: false },
]

describe.each(entries)('$name reference boundary', entry => {
  it.each(boundaryCases)('rejects $name before calling any downstream port', async testCase => {
    const assembly = testAssembly()
    const base = {
      ...assembly,
      dependencies: {
        ...assembly.dependencies,
        reads: {
          ...assembly.dependencies.reads,
          content: { ...assembly.dependencies.reads.content },
        },
        commands: { ...assembly.dependencies.commands },
      },
    }
    const { reads, commands, instances, invocationIdentities, operationIdentities, sourceIssuer } =
      base.dependencies
    const downstream = [
      vi.spyOn(reads, 'lookup'),
      vi.spyOn(reads, 'operation'),
      vi.spyOn(reads, 'process'),
      vi.spyOn(reads, 'wait'),
      vi.spyOn(reads, 'diagnostics'),
      vi.spyOn(reads, 'result'),
      vi.spyOn(reads, 'account'),
      vi.spyOn(reads.content, 'read'),
      vi.spyOn(reads.content, 'raw'),
      vi.spyOn(commands, 'releaseDelivery'),
      vi.spyOn(instances.directory, 'connect'),
      vi.spyOn(invocationIdentities, 'newInvocation'),
      vi.spyOn(operationIdentities, 'newOperation'),
      vi.spyOn(sourceIssuer, 'bind'),
    ]
    const runtime = createRuntime(base)
    const failure: ToolDefiniteFailure = testCase.invalid
      ? { kind: 'invalid', field: entry.field, reason: 'type' }
      : { kind: 'denied', action: entry.action }
    expect(await entry.run(runtime, testCase.input)).toEqual(
      entry.command ? { kind: 'rejected', failure } : { failure },
    )
    for (const port of downstream) expect(port).not.toHaveBeenCalled()
    expect(base.store.reads + base.store.commits).toBe(0)
  })
})

it.each(entries.filter(entry => entry.name === 'control' || entry.name === 'content.raw'))(
  '$name retains its unsupported outcome for a valid reference',
  async entry => {
    const base = testAssembly()
    const mint = vi.spyOn(base.dependencies.operationIdentities, 'newOperation')
    const result = await entry.run(createRuntime(base), access)
    expect(result).toMatchObject(
      entry.command
        ? { kind: 'rejected', failure: { kind: 'unsupported' } }
        : { failure: { kind: 'unsupported' } },
    )
    expect(mint).not.toHaveBeenCalled()
    expect(base.store.commits).toBe(0)
  },
)
