import type { JsonLimits } from '@omne-harness/json-text'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ProcessBlock,
  RawOutput,
  ToolDefinition,
  ToolTerminal,
  ToolRenderedResult,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolFinalEnvelope,
  ToolMaterialStore,
  ToolMaterialClock,
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
  type ToolConfiguration,
  type ToolLedgerPorts,
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

export type SettlementRenderer = (
  raw: RawOutput,
  ledger: ToolLedger<Principal, Block>,
  access: CallAccess<Principal>,
) => ToolRenderedResult<Block> | Promise<ToolRenderedResult<Block>>
export type SettlementValue = ToolRenderedResult<Block> | SettlementRenderer

export async function sealedText(
  ledger: ToolLedger<Principal, Block>,
  access: CallAccess<Principal>,
  value = 'original bytes',
) {
  const recovery = ok(await ledger.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('fixture has no original start')
  return ok(
    await ledger.bodyCustody.preserve({
      ...access,
      start: recovery.start,
      operation: operationId('fixture-author-body'),
      source: evidence('author-body'),
      frames: [text('author-body', value)],
    }),
  )
}

export async function settlementFixture(
  options: Readonly<{
    tenant?: 'a' | 'b'
    call?: string
    mode?: 'foreground' | 'background'
    terminal?: ToolTerminal
    definition?: ToolDefinition
    bodySchemas?: ToolLedgerPorts<Principal>['bodySchemas']
    command?: string
    offloading?: ToolConfiguration['offloading']
    readResultArguments?: JsonLimits
    wrapMaterialClock?: (clock: ToolMaterialClock) => ToolMaterialClock
    process?: readonly ProcessBlock[] | ((raw: RawOutput) => readonly ProcessBlock[])
    custody?: MemoryToolOutputCustody<Principal>
    attachments?: RawOutput['content'][]
    value?: SettlementValue
    wrapReleaseInspection?: (
      environment: ToolEnvironment<Principal, unknown>,
    ) => Pick<ToolEnvironment<Principal, unknown>, 'adoption' | 'inspectRelease'>
    wrapMaterials?: (store: ToolMaterialStore<Principal>) => ToolMaterialStore<Principal>
    wrapAccess?: (access: ToolAccessGuard<Principal>) => ToolAccessGuard<Principal>
  }> = {},
) {
  const ports = {
    ...testSettlementPorts(),
    ...(options.custody === undefined ? {} : { custody: options.custody }),
  }
  const harness = startHarness({
    ...(options.bodySchemas === undefined ? {} : { bodySchemas: options.bodySchemas }),
    environmentsPort: base => ({ ...base, adoption: ports.releaseInspection.adoption }),
  })
  const name = options.call ?? 'settlement'
  const availability = {
    kind: 'available' as const,
    definition:
      options.definition ??
      functionDefinition({ backgroundAllowed: options.mode === 'background' }),
    executor: adoption('exec'),
    layer: { kind: 'official' as const },
  }
  let access = { principal: principalA, tenant: tenantA, call: callId(name) }
  if (options.tenant === 'b') {
    const invoked = await harness.runtime.invoke({
      principal: principalB,
      tenant: tenantB,
      request: request({ availability, command: options.command ?? null }),
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
    await admitCall(harness, name, {
      availability,
      command: options.command ?? null,
      ...(options.mode === 'background' ? { mode: 'background' as const } : {}),
    })
    await harness.drive(name)
  }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null || recovery.execution === null)
    throw new Error('fixture did not start')
  const raw = ok(
    await harness.ledger.rawCustody.preserve({
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
      ? await options.value(raw, harness.ledger, access)
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
  const materialPorts = testSettlementPorts(harness.memory).materials
  const materialStore = options.wrapMaterials?.(materialPorts.store) ?? materialPorts.store
  const makeLedger = (
    offloading: ToolConfiguration['offloading'] | undefined,
    readResultArguments = options.readResultArguments,
  ) =>
    createToolLedger(
      store,
      {
        ...guard,
        access: options.wrapAccess?.(guard.access) ?? guard.access,
      },
      clock,
      {
        ...configurationOf(offloading === undefined ? {} : { offloading }),
        ...(readResultArguments === undefined ? {} : { readResultArguments }),
      },
      {
        content: null,
        materials: {
          ...materialPorts,
          store: materialStore,
          clock: options.wrapMaterialClock?.(materialPorts.clock) ?? materialPorts.clock,
        },
        releaseInspection:
          options.wrapReleaseInspection?.(ports.releaseInspection) ?? ports.releaseInspection,
      },
    )
  let ledger = makeLedger(options.offloading)
  const before = ok(await ledger.commands.loadRecovery(access))
  const task = before.tasks.find(task => task.kind === 'settle')
  if (task?.kind !== 'settle') throw new Error('fixture final has no settlement task')
  const input = {
    ...recovery.execution,
    ...access,
    principal: access.principal,
    operation: operationId('preserve-result'),
    expected: before.state.revision,
    basis: task.basis,
  }
  return {
    harness,
    materialStore,
    lateClockSamples,
    access,
    final,
    pointer,
    batch,
    get ledger() {
      return ledger
    },
    rebuild: (offloading: ToolConfiguration['offloading'], readResultArguments?: JsonLimits) => {
      ledger = makeLedger(offloading, readResultArguments)
    },
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
