import { bodyRepresentation } from '../src/body-representation.ts'
import type { ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { JsonLimits } from '@omne-harness/json-text'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Attachment,
  ProcessBlock,
  ToolDefinition,
  ToolTerminal,
  ToolRenderedResult,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolFinalEnvelope,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
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
  const binding = {
    ...access,
    start: recovery.start,
    source: evidence('author-body'),
    key: 'fixture-author-body',
  }
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  ok(
    await ledger.bodyWrites.begin({
      ...binding,
      operation: operationId('fixture-author-body-begin'),
      representation: bodyRepresentation(definition.returns.body) ?? {
        kind: 'text',
        codec: adoption('text'),
      },
    }),
  )
  ok(
    await ledger.bodyWrites.append({
      ...binding,
      operation: operationId('fixture-author-body-append'),
      sequence: '1',
      frame: { kind: 'text', block: 'author-body', text: value, end: true },
    }),
  )
  return ok(
    await ledger.bodyWrites.seal({
      ...binding,
      operation: operationId('fixture-author-body-seal'),
      afterSequence: '1',
    }),
  )
}

export async function settlementFixture(
  options: Readonly<{
    tenant?: 'a' | 'b'
    call?: string
    mode?: 'foreground' | 'background'
    terminal?: ToolTerminal
    effect?: ToolFinalEnvelope<Block>['effect']
    definition?: ToolDefinition
    bodySchemas?: ToolLedgerPorts<Principal>['bodySchemas']
    command?: string
    offloading?: ToolConfiguration['offloading']
    resultPageBytes?: number
    readResultArguments?: JsonLimits
    /** The participant clock of issuer, settler and reader; the memory body store reads it too. */
    bodyClock?: ToolInstantClock
    process?: readonly ProcessBlock[]
    attachments?: Attachment[]
    value?: SettlementValue
    wrapReleaseInspection?: (
      environment: ToolEnvironment<Principal, unknown>,
    ) => Pick<ToolEnvironment<Principal, unknown>, 'adoption' | 'inspectRelease'>
    wrapAccess?: (access: ToolAccessGuard<Principal>) => ToolAccessGuard<Principal>
  }> = {},
) {
  const ports = testSettlementPorts()
  const harness = startHarness({
    ...(options.bodySchemas === undefined ? {} : { bodySchemas: options.bodySchemas }),
    ...(options.offloading === undefined ? {} : { offloading: options.offloading }),
    ...(options.resultPageBytes === undefined ? {} : { resultPageBytes: options.resultPageBytes }),
    ...(options.readResultArguments === undefined
      ? {}
      : { readResultArguments: options.readResultArguments }),
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
  const final: ToolFinalEnvelope<Block> = {
    kind: 'final',
    result: (typeof options.value === 'function'
      ? await options.value(harness.ledger, access)
      : options.value) ?? {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: options.attachments ?? [],
    },
    terminal: options.terminal ?? { kind: 'completed' },
    effect: options.effect ?? { kind: 'occurred', evidence: evidence('actual-effect') },
  }
  const process = options.process
  const planned = await harness.ledger.finalPlanner.planFinal({
    ...access,
    start: recovery.start,
    source: evidence('final-source'),
    operation: operationId('fixture-final'),
    final,
  })
  const pointer = 'ok' in planned ? planned.ok : final
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
  if ('ok' in planned)
    ok(await harness.commands.receiveFacts({ ...access, start: batch.start, batch }))
  const commits: LedgerCommitInput[] = []
  let intercept: ToolLedgerStore['commit'] | null = null
  const store: ToolLedgerStore = {
    durability: 'none',
    readRecord: harness.memory.readRecord,
    due: harness.memory.due,
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
  const settlementPorts = testSettlementPorts(harness.memory)
  const bodies = settlementPorts.bodies
  const makeLedger = (
    offloading: ToolConfiguration['offloading'] | undefined,
    readResultArguments = options.readResultArguments,
    resultPageBytes = options.resultPageBytes,
  ) =>
    createToolLedger(
      store,
      {
        ...guard,
        access: options.wrapAccess?.(guard.access) ?? guard.access,
      },
      clock,
      {
        ...configurationOf({
          ...(offloading === undefined ? {} : { offloading }),
          ...(resultPageBytes === undefined ? {} : { resultPageBytes }),
        }),
        ...(readResultArguments === undefined ? {} : { readResultArguments }),
      },
      {
        content: null,
        bodies: { ...bodies, clock: options.bodyClock ?? bodies.clock },
        releaseInspection:
          options.wrapReleaseInspection?.(ports.releaseInspection) ?? ports.releaseInspection,
      },
    )
  let ledger = makeLedger(options.offloading)
  const before = ok(await ledger.commands.loadRecovery(access))
  const task = before.tasks.find(task => task.kind === 'settle')
  if (task?.kind !== 'settle' && 'ok' in planned)
    throw new Error('fixture final has no settlement task')
  const input = {
    ...recovery.execution,
    ...access,
    principal: access.principal,
    operation: operationId('preserve-result'),
    expected: before.state.revision,
    basis: task?.kind === 'settle' ? task.basis : evidence('unplanned-final'),
  }
  return {
    harness,
    /** The plan of the final: the refusal a test asserts when planning itself is refused. */
    planned,
    bodies,
    lateClockSamples,
    access,
    final,
    pointer,
    batch,
    get ledger() {
      return ledger
    },
    /** A ledger over the same records under another configuration, as after a restart. */
    rebuild: (
      offloading: ToolConfiguration['offloading'],
      readResultArguments?: JsonLimits,
      resultPageBytes?: number,
    ) => {
      ledger = makeLedger(offloading, readResultArguments, resultPageBytes)
    },
    input,
    before,
    commits,
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
