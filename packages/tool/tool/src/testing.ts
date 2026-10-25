import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Attachment,
  ContentPage,
  RawOutput,
  ToolFailure,
  ToolCatalog,
} from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type {
  ToolContentReader,
  ToolBindings,
  ToolChildren,
  ToolExecutorBinding,
  ToolInstanceHost,
  ToolInvocationSourceIssuer,
  ToolOperationIdentities,
} from '@omne-harness/tool-contract/provider'
import {
  NotApplicable,
  testingTenant,
  type ConformanceCase,
  createMemoryToolClock,
  createMemoryToolDecisionBridge,
  createMemoryToolEnvironment,
  createMemoryToolExecutorBinding,
  createMemoryToolOutputCustody,
  createMemoryToolResourceResponses,
  createMemoryToolStartAuthority,
  type MemoryEnvironment,
  type MemoryToolClock,
  type MemoryToolDecisionBridge,
  type MemoryToolEnvironment,
  type MemoryToolExecutorBinding,
  type MemoryToolOutputCustody,
  type MemoryToolResourceResponses,
  type MemoryToolStartAuthority,
} from '@omne-harness/tool-contract/testing'
import { tenantKey } from './boundary.ts'
import type { ToolDependencies, ToolLedgerConfiguration } from './construction.ts'
import { fixAttachment } from './ledger-content.ts'
import { createToolFactAcknowledgementGuard } from './fact-acknowledgements.ts'
import type { ToolLedgerGuards } from './ledger-guards.ts'
import { createToolLedger, type ToolLedger } from './ledger.ts'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from './testing-store.ts'

import type { ToolLedgerStoreFixture } from './testing-ledger-store-types.ts'
import { storeCases } from './testing-ledger-store-cases.ts'
import { storeFaultCases } from './testing-ledger-store-fault-cases.ts'
import { compositionCases } from './testing-ledger-composition-cases.ts'
import { createTestInvocationSource } from './testing-source.ts'

/** The caller supplies authorization, the trusted construction ports and the remaining ports. */
export type TestToolDependenciesInput<P> = Readonly<{
  configuration: ToolLedgerConfiguration
  guards: Omit<ToolLedgerGuards<P, ContentBlock>, 'factAcknowledgements'>
  instances: ToolInstanceHost<P>
  catalog: ToolCatalog<P>
  children: ToolChildren<P>
  operationIdentities: ToolOperationIdentities
  sourceIssuer: ToolInvocationSourceIssuer<P>
  bindingsFor(
    executor: ToolExecutorBinding<P, ContentBlock, MemoryEnvironment>,
  ): ToolBindings<P, ContentBlock, MemoryEnvironment>
}>

export type TestToolDoubles<P> = Readonly<{
  executor: MemoryToolExecutorBinding<P, MemoryEnvironment>
  environment: MemoryToolEnvironment<P>
  authority: MemoryToolStartAuthority<P>
  clock: MemoryToolClock
  decisions: MemoryToolDecisionBridge<P>
  resources: MemoryToolResourceResponses<P>
  custody: MemoryToolOutputCustody<P>
  content: MemoryToolContent<P>
}>

export type TestToolDependencies<P> = Readonly<{
  durability: 'none'
  dependencies: ToolDependencies<P, ContentBlock, MemoryEnvironment>
  store: MemoryToolLedgerStore<ContentBlock>
  ledger: ToolLedger<P, ContentBlock>
  doubles: TestToolDoubles<P>
}>

/** Builds a fresh non-durable assembly. The caller constructs and owns the runtime separately. */
export function createTestToolDependencies<P>(
  input: TestToolDependenciesInput<P>,
): TestToolDependencies<P> {
  const content = createMemoryToolContent<P>()
  const doubles: TestToolDoubles<P> = {
    executor: createMemoryToolExecutorBinding<P, MemoryEnvironment>(),
    environment: createMemoryToolEnvironment<P>(),
    authority: createMemoryToolStartAuthority<P>(),
    clock: createMemoryToolClock(),
    decisions: createMemoryToolDecisionBridge<P>(),
    resources: createMemoryToolResourceResponses<P>(),
    custody: content.custody,
    content,
  }
  const store = createMemoryToolLedgerStore<ContentBlock>()
  const bindings = input.bindingsFor(doubles.executor.binding)
  const ledger = createToolLedger(
    store,
    {
      ...input.guards,
      factAcknowledgements: createToolFactAcknowledgementGuard(bindings),
    },
    doubles.clock,
    input.configuration,
    { custody: doubles.custody, releaseInspection: doubles.environment, content: content.reader },
  )
  return {
    durability: 'none',
    store,
    ledger,
    doubles,
    dependencies: {
      commands: ledger.commands,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
      reads: ledger.reads,
      bindings,
      environments: doubles.environment,
      decisions: doubles.decisions,
      instances: input.instances,
      clock: doubles.clock,
      resultPolicy: input.guards.policy,
      authority: doubles.authority,
      resources: doubles.resources,
      custody: doubles.custody,
      catalog: input.catalog,
      children: input.children,
      operationIdentities: input.operationIdentities,
      sourceIssuer: input.sourceIssuer,
    },
  }
}

export {
  createTestInvocationSource,
  createTestToolIdentities,
  TEST_SOURCE_OWNER,
  type TestInvocationSource,
  type TestSourceBinding,
  type TestToolIdentities,
} from './testing-source.ts'
export {
  createMemoryToolLedgerStore,
  type MemoryToolLedgerStore,
  type MemoryReadFault,
  type MemoryCommitFault,
  type MemoryLanding,
} from './testing-store.ts'

type ReadInput<P> = Parameters<ToolContentReader<P>['read']>[0]
type Seed<P> = CallAccess<P> & Readonly<{ attachment: Attachment; bytes: Uint8Array }>
export type MemoryContentFault =
  | Readonly<{ kind: 'failure' }>
  | Readonly<{ kind: 'throw' }>
  | Readonly<{ kind: 'reply'; replace(page: ContentPage): ContentPage }>

export type MemoryToolContent<P> = Readonly<{
  durability: 'none'
  reader: Pick<ToolContentReader<P>, 'read'>
  custody: MemoryToolOutputCustody<P>
  controls: Readonly<{
    seed(input: Seed<P>): Outcome<void, ToolFailure>
    remove(input: Omit<Seed<P>, 'bytes'>): void
    pauseNextRead(): Readonly<{ entered: Promise<void>; resume(): void }>
    failNext(fault: MemoryContentFault): void
  }>
}>

function missing(reason: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'memory-content', diagnostic: reason })
}

function keyOf<P>(input: CallAccess<P> & Readonly<{ attachment: Attachment }>): string {
  const a = input.attachment
  return JSON.stringify([
    tenantKey(input.tenant),
    input.call,
    a.storage,
    a.key,
    a.mediaType,
    a.bytes,
    a.digest,
  ])
}

function integrity(attachment: Attachment, bytes: Uint8Array): boolean {
  return (
    attachment.bytes === String(bytes.length) &&
    attachment.digest === `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  )
}

/** Bytes only. Association and current authorization are always checked by the real ledger. */
export function createMemoryToolContent<P>(): MemoryToolContent<P> {
  const source = createMemoryToolOutputCustody<P>()
  const bytesByAddress = new Map<string, Uint8Array>()
  let fault: MemoryContentFault | null = null
  let pause: Readonly<{ entered(): void; resumed: Promise<void> }> | null = null
  const seed = (input: Seed<P>): Outcome<void, ToolFailure> => {
    const attachment = fixAttachment(input.attachment)
    if ('failure' in attachment) return attachment
    const bytes = Uint8Array.from(input.bytes)
    if (!integrity(attachment.ok, bytes))
      return missing('source length or sha256 digest does not match')
    bytesByAddress.set(keyOf({ ...input, attachment: attachment.ok }), bytes)
    return succeed(undefined)
  }
  const register = async (input: CallAccess<P>, raw: RawOutput): Promise<void> => {
    const kept = seed({
      ...input,
      attachment: raw.content,
      bytes: await source.controls.readBytes(raw),
    })
    if ('failure' in kept) throw new Error('memory custody returned inconsistent bytes')
  }
  const custody: MemoryToolOutputCustody<P> = {
    ...source,
    preserve: async input => {
      const fixed = { ...input, bytes: Uint8Array.from(input.bytes) }
      const answer = await source.preserve(fixed)
      if ('ok' in answer) await register(fixed, answer.ok)
      return structuredClone(answer)
    },
    inspect: async input => {
      const fixed = { ...input }
      const answer = await source.inspect(fixed)
      if ('ok' in answer && answer.ok.kind === 'retained') await register(fixed, answer.ok.raw)
      return structuredClone(answer)
    },
  }
  const page = (input: ReadInput<P>): Outcome<ContentPage, ToolFailure> => {
    const bytes = bytesByAddress.get(keyOf(input))
    if (bytes === undefined) return missing('content bytes are unavailable')
    if (!integrity(input.attachment, bytes))
      return missing('source length or sha256 digest does not match')
    let offset = 0
    if (input.after !== null) {
      let decoded: unknown
      try {
        decoded = JSON.parse(input.after)
      } catch {
        return fail({ kind: 'invalid-cursor', reason: 'not-a-byte-cursor' })
      }
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        Object.keys(decoded).length !== 4 ||
        Reflect.get(decoded, 'projection') !== 'bytes' ||
        Reflect.get(decoded, 'address') !== keyOf(input) ||
        Reflect.get(decoded, 'result') !== input.result
      )
        return fail({ kind: 'invalid-cursor', reason: 'another-content' })
      const position: unknown = Reflect.get(decoded, 'offset')
      if (
        typeof position !== 'number' ||
        !Number.isSafeInteger(position) ||
        position <= 0 ||
        position >= bytes.length
      )
        return fail({ kind: 'invalid-cursor', reason: 'past-the-end' })
      offset = position
    }
    const length = Math.min(input.maxBytes, bytes.length - offset)
    const end = offset + length
    return succeed({
      result: input.result,
      attachment: { ...input.attachment },
      offset: String(offset),
      bytes: bytes.slice(offset, end),
      next:
        end < bytes.length
          ? JSON.stringify({
              projection: 'bytes',
              address: keyOf(input),
              result: input.result,
              offset: end,
            })
          : null,
    })
  }
  return {
    durability: 'none',
    custody,
    reader: {
      read: async input => {
        const attachment = fixAttachment(input.attachment)
        if ('failure' in attachment) return attachment
        const fixed = { ...input, attachment: attachment.ok }
        if (!Number.isSafeInteger(fixed.maxBytes) || fixed.maxBytes <= 0)
          return fail({ kind: 'invalid', field: 'maxBytes', reason: 'range' })
        if (fixed.after !== null && typeof fixed.after !== 'string')
          return fail({ kind: 'invalid', field: 'after', reason: 'type' })
        const waiting = pause
        pause = null
        const currentFault = fault
        fault = null
        if (waiting !== null) {
          waiting.entered()
          await waiting.resumed
        }
        if (currentFault?.kind === 'failure') return missing('injected read failure')
        if (currentFault?.kind === 'throw') throw new Error('injected provider secret')
        const answer = page(fixed)
        return 'ok' in answer && currentFault?.kind === 'reply'
          ? succeed(currentFault.replace(answer.ok))
          : answer
      },
    },
    controls: {
      seed,
      remove: input => {
        bytesByAddress.delete(keyOf(input))
      },
      pauseNextRead: () => {
        if (pause !== null) throw new Error('a read pause is already installed')
        const entered = Promise.withResolvers<void>()
        const resumed = Promise.withResolvers<void>()
        pause = { entered: () => entered.resolve(), resumed: resumed.promise }
        return { entered: entered.promise, resume: () => resumed.resolve() }
      },
      failNext: next => {
        fault = next
      },
    },
  }
}

export type {
  ToolLedgerStoreFixture,
  ToolLedgerStoreControls,
} from './testing-ledger-store-types.ts'
export { createMemoryToolLedgerStoreFixture } from './testing-ledger-store-fixture.ts'

const ledgerStoreCaseDependencies = {
  tenant: testingTenant,
  missing: (handle: string): never => {
    throw new NotApplicable(handle)
  },
}

/** Provider-level snapshot, conditional commit, isolation and fault checks (G1/G6). */
export function toolLedgerStoreConformance(): readonly ConformanceCase<ToolLedgerStoreFixture>[] {
  return [
    ...storeCases(ledgerStoreCaseDependencies),
    ...storeFaultCases(ledgerStoreCaseDependencies),
  ]
}

/** P01 checks through the real ledger. The provider supplies only the record store. */
export function toolLedgerStoreCompositionConformance(): readonly ConformanceCase<ToolLedgerStoreFixture>[] {
  return compositionCases({
    ...ledgerStoreCaseDependencies,
    createLedger: createToolLedger,
    source: createTestInvocationSource,
    clock: createMemoryToolClock,
    custody: createMemoryToolOutputCustody,
    environment: createMemoryToolEnvironment,
  })
}
