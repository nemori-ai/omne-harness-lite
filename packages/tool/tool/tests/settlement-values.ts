import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ProcessBlock,
  RawOutput,
  ToolExecutionFact,
  ToolOutputCustody,
  ToolTerminal,
} from '@omne-harness/tool-contract'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { createToolLedger, type LedgerCommitInput, type ToolLedgerStore } from '@omne-harness/tool'
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
  tenantA,
  testSettlementPorts,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

export async function settlementFixture(
  options: Readonly<{
    mode?: 'foreground' | 'background'
    terminal?: ToolTerminal
    process?: readonly ProcessBlock[] | ((raw: RawOutput) => readonly ProcessBlock[])
    attachments?: RawOutput['content'][]
    wrapCustody?: (custody: ToolOutputCustody<Principal>) => ToolOutputCustody<Principal>
  }> = {},
) {
  const harness = startHarness()
  await admitCall(
    harness,
    'settlement',
    options.mode === 'background'
      ? {
          mode: 'background',
          availability: {
            kind: 'available',
            definition: functionDefinition({ backgroundAllowed: true }),
            executor: adoption('exec'),
          },
        }
      : {},
  )
  await harness.drive('settlement')
  const access = { principal: principalA, tenant: tenantA, call: callId('settlement') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null || recovery.execution === null)
    throw new Error('fixture did not start')
  const ports = testSettlementPorts()
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
  const final: Extract<ToolExecutionFact<Block>, { kind: 'final' }> = {
    kind: 'final',
    raw,
    result: {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: options.attachments ?? [],
    },
    terminal: options.terminal ?? { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence('actual-effect') },
  }
  const process = typeof options.process === 'function' ? options.process(raw) : options.process
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
      { event: 'final-event', fact: final },
    ],
  }
  ok(await harness.commands.receiveFacts({ ...access, start: batch.start, batch }))
  const commits: LedgerCommitInput<Block>[] = []
  let intercept: ToolLedgerStore<Block>['commit'] | null = null
  const store: ToolLedgerStore<Block> = {
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
  const ledger = createToolLedger(store, guards(), clock, configurationOf({}), {
    custody,
    releaseInspection: ports.releaseInspection,
  })
  const before = ok(await ledger.commands.loadRecovery(access))
  const input = {
    ...access,
    ...recovery.execution,
    principal: principalA,
    operation: operationId('preserve-result'),
    expected: before.state.revision,
    raw: final.raw,
    value: final.result,
    terminal: final.terminal,
    effect: final.effect,
  }
  return {
    harness,
    lateClockSamples,
    access,
    final,
    batch,
    ledger,
    input,
    before,
    commits,
    custody: ports.custody,
    interceptCommit: (handler: ToolLedgerStore<Block>['commit'] | null) => {
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
