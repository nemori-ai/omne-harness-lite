import type { ContentBlock } from '@omne-harness/content-block'
import type { ProcessBlock, RawOutput, ToolTerminal, ToolResult } from '@omne-harness/tool-contract'
import type {
  ToolFinalEnvelope,
  ToolOutputCustody,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolClock,
  type MemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'
import {
  createToolLedger,
  type LedgerCommitInput,
  type ToolAccessGuard,
  type ToolLedgerStore,
  type ToolLedger,
} from '@omne-harness/tool'
import { admitCall, startHarness } from './start-values.ts'
import {
  adoption,
  callId,
  configurationOf,
  functionDefinition,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantB,
  request,
  tenantA,
  testSettlementPorts,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

export async function settlementFixture(
  options: Readonly<{
    tenant?: 'a' | 'b'
    call?: string
    mode?: 'foreground' | 'background'
    terminal?: ToolTerminal
    process?: readonly ProcessBlock[] | ((raw: RawOutput) => readonly ProcessBlock[])
    custody?: MemoryToolOutputCustody<Principal>
    attachments?: RawOutput['content'][]
    value?:
      | ToolResult<Block>
      | ((
          raw: RawOutput,
          ledger: ToolLedger<Principal, Block>,
        ) => ToolResult<Block> | Promise<ToolResult<Block>>)
    wrapReleaseInspection?: (
      environment: ToolEnvironment<Principal, unknown>,
    ) => Pick<ToolEnvironment<Principal, unknown>, 'adoption' | 'inspectRelease'>
    wrapCustody?: (custody: ToolOutputCustody<Principal>) => ToolOutputCustody<Principal>
    wrapAccess?: (access: ToolAccessGuard<Principal>) => ToolAccessGuard<Principal>
  }> = {},
) {
  const ports = {
    ...testSettlementPorts(),
    ...(options.custody === undefined ? {} : { custody: options.custody }),
  }
  const harness = startHarness({
    environmentsPort: base => ({ ...base, adoption: ports.releaseInspection.adoption }),
  })
  const name = options.call ?? 'settlement'
  let access = { principal: principalA, tenant: tenantA, call: callId(name) }
  if (options.tenant === 'b') {
    const invoked = await harness.runtime.invoke({
      principal: principalB,
      tenant: tenantB,
      request: request(),
    })
    if (invoked.kind !== 'accepted') throw new Error('fixture admission')
    const { call } = readToolInvocationRef(invoked.reference)
    access = { principal: principalB, tenant: tenantB, call }
    await harness.host.driver().run({
      ...access,
      instance: await harness.host.instanceOf(call),
      signal: new AbortController().signal,
    })
  } else {
    await admitCall(
      harness,
      name,
      options.mode === 'background'
        ? {
            mode: 'background',
            availability: {
              kind: 'available',
              definition: functionDefinition({ backgroundAllowed: true }),
              executor: adoption('exec'),
              layer: { kind: 'official' },
            },
          }
        : {},
    )
    await harness.drive(name)
  }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null || recovery.execution === null)
    throw new Error('fixture did not start')
  const custody = options.wrapCustody?.(ports.custody) ?? ports.custody
  const raw = ok(
    await ports.custody.preserve({
      ...access,
      operation: operationId('raw-output'),
      codec: adoption('codec'),
      bytes: new TextEncoder().encode('original bytes'),
      source: evidence('original-source'),
    }),
  )
  const final: ToolFinalEnvelope<Block> = {
    kind: 'final',
    raw,
    result: (typeof options.value === 'function'
      ? await options.value(raw, harness.ledger)
      : options.value) ?? {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: options.attachments ?? [],
    },
    terminal: options.terminal ?? { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence('actual-effect') },
  }
  const process = typeof options.process === 'function' ? options.process(raw) : options.process
  const pointer = ok(
    await harness.ledger.finalCustody.preserveFinal({
      ...access,
      start: recovery.start,
      source: evidence('final-source'),
      operation: operationId('fixture-final'),
      final,
    }),
  )
  const batch = {
    start: recovery.start,
    source: evidence('final-source'),
    batch: 'final-batch',
    after: null,
    cursor: 'final-cursor',
    events: [
      ...(process === undefined
        ? []
        : [{ event: 'process-event', fact: { kind: 'process' as const, blocks: process } }]),
      { event: 'final-event', fact: pointer },
    ],
  }
  ok(await harness.commands.receiveFacts({ ...access, start: batch.start, batch }))
  const commits: LedgerCommitInput[] = []
  let intercept: ToolLedgerStore['commit'] | null = null
  const store: ToolLedgerStore = {
    durability: 'none',
    read: domain => harness.memory.read(domain),
    commit: input => {
      commits.push(structuredClone(input))
      return intercept === null ? harness.memory.commit(input) : intercept(input)
    },
  }
  const memoryClock = createMemoryToolClock()
  const lateClockSamples: Parameters<typeof memoryClock.elapsed>[0][] = []
  const clock = {
    ...memoryClock,
    elapsed: (input: Parameters<typeof memoryClock.elapsed>[0]) => {
      lateClockSamples.push(input)
      return memoryClock.elapsed(input)
    },
  }
  const guard = guards()
  const ledger = createToolLedger(
    store,
    {
      ...guard,
      access: options.wrapAccess?.(guard.access) ?? guard.access,
    },
    clock,
    configurationOf({}),
    {
      content: null,
      materials: testSettlementPorts(harness.memory).materials,
      custody,
      releaseInspection:
        options.wrapReleaseInspection?.(ports.releaseInspection) ?? ports.releaseInspection,
    },
  )
  const before = ok(await ledger.commands.loadRecovery(access))
  const task = before.tasks.find(task => task.kind === 'settle')
  if (task?.kind !== 'settle') throw new Error('fixture final has no settlement task')
  const input = {
    ...access,
    ...recovery.execution,
    principal: access.principal,
    operation: operationId('preserve-result'),
    expected: before.state.revision,
    basis: task.basis,
  }
  return {
    harness,
    lateClockSamples,
    access,
    final,
    pointer,
    batch,
    ledger,
    input,
    before,
    commits,
    custody: ports.custody,
    environment: ports.releaseInspection,
    interceptCommit: (handler: ToolLedgerStore['commit'] | null) => {
      intercept = handler
    },
    load: () => ledger.commands.loadRecovery(access).then(ok),
    records: async () => {
      const read = await harness.memory.read({
        kind: 'call',
        tenant: access.tenant,
        call: access.call,
      })
      if (read.kind !== 'complete') throw new Error('fixture store unreadable')
      return read.records
    },
    preserve: () => ledger.commands.preserveResult(input),
    resultPage: async () => {
      const recovery = ok(await ledger.commands.loadRecovery(access))
      if (recovery.result === null) throw new Error('fixture has no result')
      return ok(
        await ledger.reads.result({ ...access, result: recovery.result.version, after: null }),
      )
    },
  }
}

export function refProcess(key: string, sequence = '0'): ProcessBlock {
  const content: ContentBlock = {
    kind: 'file',
    id: text('process', '').id,
    visibility: { toHuman: true, toModel: false },
    ref: { storage: 'files', key, bytes: '12', digest: `sha256:${key}`, mediaType: 'text/plain' },
    transcript: null,
  }
  return { index: 'output', mode: 'replace', state: 'open', sequence, trim: null, content }
}
