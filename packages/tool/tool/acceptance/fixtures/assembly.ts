// Independent external providers for PD-tool-execution S1–S3. No product boundary is replaced.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import { resolve } from 'node:path'
import type { ContentBlock } from '@omne-harness/content-block'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createDefaultParameterCodec,
  defaultResultPolicy,
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  readToolInvocationRef,
  renderToolResult,
  type DurableEvidence,
  type ToolDriver,
  type ToolInstanceHost,
  type ToolInvokeRequest,
  type ToolInvocationRef,
  type ToolLiveExecution,
  type ToolResultVersion,
  type ToolState,
  type ToolResult,
  type ResultPage,
} from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  createIndependentToolScope,
  createToolRuntime,
  executeTool,
  type ToolConfiguration,
  type ToolInvokeAuthority,
} from '@omne-harness/tool'
import {
  createTestInvocationSource,
  createTestToolDependencies,
  createTestToolIdentities,
  type TestToolDependencies,
} from '@omne-harness/tool/testing'

export function ok<T>(reply: Outcome<T, unknown>): T {
  assert.ok('ok' in reply, JSON.stringify(reply))
  return reply.ok
}

export function adoption(name: string) {
  return describedAdoption({ owner: 'tool-acceptance', name, revision: '1' })
}

export function evidence(record: string, value: unknown): DurableEvidence {
  return { owner: 'tool-acceptance', record, revision: '1', digest: digest(value) }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export const expectedParagraphs = [
  'First ledger item: the orchard delivered 17 baskets of apples. The consumer must preserve this complete sentence.',
  'Second ledger item: the mill delivered 23 sacks of flour. This sentence follows the orchard item without omission.',
]
const separator = '\n\n'
const jsonLimits = {
  maxBytes: 4096,
  maxDepth: 16,
  maxItems: 128,
  maxMembers: 64,
  maxStringLength: 2048,
  maxNumberLength: 32,
}
const configuration: ToolConfiguration = {
  authorBufferBytes: 4096,
  authorBufferItems: 16,
  authorWaitHistoryBytes: 8192,
  authorWaitHistoryItems: 8,
  processBatchBytes: 4096,
  processBatchDelayMs: 0,
  observerBufferBytes: 8192,
  resultPageBytes: 256,
  reconciliationDelayMs: 0,
  ledgerCommitAttempts: 8,
  queueCapacity: 4,
}

function textResult(value: string): ToolResult<ContentBlock> {
  return {
    content: value.split(separator).map((text, index) => {
      const identity = judgeBlockIdentity({
        id: `qa-text-${index}`,
        visibility: { toHuman: true, toModel: true },
      })
      assert.ok('ok' in identity)
      return { kind: 'text', ...identity.ok, text }
    }),
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }
}

export function assembly(scenario: 'S1' | 'S2' | 'S3') {
  const observations: { event: string; value: unknown }[] = []
  const observe = (event: string, value: unknown) => {
    observations.push({ event, value: structuredClone(value) })
  }
  const tenant = testingTenant(`org_${'4'.repeat(26)}`, `acc_${'6'.repeat(26)}`)
  const principal = 'tool-acceptance-current-coordinator'
  const access = { principal, tenant }
  const qualifies = (input: typeof access) =>
    input.principal === principal && input.tenant === tenant
  const identities = createTestToolIdentities()
  const consumer = {
    owner: 'tool-acceptance-consumer',
    work: scenario,
    position: 'result-0',
    purpose: 'tool-result',
  }
  const invokeAuthority: ToolInvokeAuthority<string> = {
    qualify: async input =>
      qualifies(input) && JSON.stringify(input.consumer) === JSON.stringify(consumer)
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'consumer-or-current-qualification' },
    samePrincipal: async input =>
      input.current === input.original
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'different-coordinator' },
  }
  const source = createTestInvocationSource({
    authority: invokeAuthority,
    snapshotPrincipal: value => value,
  })
  const counts = { executor: 0, bindingStart: 0, environmentPrepare: 0 }
  const parameterCodec = ok(createDefaultParameterCodec(jsonLimits))
  const operation = ok(
    defineToolOperation({
      parameters: {
        kind: 'declared',
        value: {
          schema: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
          },
          vocabulary: adoption('json-object'),
          descriptions: [],
        },
      },
      returns: { kind: 'ordinary', program: { kind: 'none' } },
      author: {
        kind: 'ordinary',
        parameters: parameterCodec,
        waits: [],
        executor: {
          execute: async () => {
            counts.executor += 1
            observe('author-executed', { ordinal: counts.executor })
            return expectedParagraphs.join(separator)
          },
        },
        codec: {
          adoption: adoption('utf8-output'),
          encode: value =>
            typeof value === 'string'
              ? succeed(new TextEncoder().encode(value))
              : fail({ reason: 'expected-string' }),
          decode: bytes => succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        },
        output: {
          adoption: adoption('string-output'),
          check: input =>
            typeof input.value === 'string'
              ? succeed(input.value)
              : fail({ reason: 'expected-string' }),
        },
        renderer: { render: value => succeed(value) },
        program: { kind: 'none' },
      },
    }),
  )
  const registration = ok(
    defineFunctionTool({
      metadata: {
        adoption: adoption('delivery_manifest'),
        name: 'delivery_manifest',
        description: 'Return the two delivery ledger paragraphs.',
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: {
          adoption: adoption('declarations'),
          environment: null,
          attachments: [],
          inputModalities: [],
          outputModalities: [],
          settings: null,
        },
      },
      operation,
    }),
  )
  const availability = {
    kind: 'available',
    definition: registration.definition,
    executor: adoption('manifest-executor'),
  } as const
  const request: ToolInvokeRequest = {
    availability,
    command: null,
    arguments: {
      original: '{"manifest":"daily"}',
      effective: '{"manifest":"daily"}',
      complete: true,
    },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: {
      owner: 'tool-acceptance-scope',
      key: 'manifest-slot',
      grant: evidence('scope-grant', { principal, consumer }),
    },
    consumer,
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
  let driver: ToolDriver<string> | null = null
  const scheduled: Parameters<ToolInstanceHost<string>['schedule']>[0][] = []
  const controller = new AbortController()
  const instance = identities.instanceIdentities.newInstance().then(ok)
  const host: ToolInstanceHost<string> = {
    install: installed => {
      driver = installed
      return { release: async () => controller.abort() }
    },
    schedule: async input => {
      if (!scheduled.some(value => value.call === input.call)) scheduled.push(input)
      observe('host-scheduled', input)
      return succeed({ queued: true })
    },
    publish: async execution => succeed({ execution, registration: 'tool-acceptance-host' }),
    withdraw: async () => succeed({ removed: true }),
    directory: {
      connect: async () =>
        fail({
          kind: 'unavailable',
          dependency: 'qa-host',
          diagnostic: 'No human observation requested',
        }),
    },
  }
  const lives = new Map<string, ToolLiveExecution<ContentBlock>>()
  const executed = new Set<string>()
  let bindingError: unknown = null
  const providers: TestToolDependencies<string> = createTestToolDependencies({
    configuration,
    guards: {
      access: {
        qualify: async input => {
          if (qualifies(input)) return { kind: 'allowed' }
          observe('qualification-denied', {
            action: input.action,
            call: input.call,
            principalMatches: input.principal === principal,
            mintedTenantObjectMatches: input.tenant === tenant,
            tenant: input.tenant,
          })
          return { kind: 'denied', reason: 'current-qualification' }
        },
      },
      sources: source.guard,
      grants: new Map([
        [
          'tool-acceptance-scope',
          {
            verifyGrant: async input =>
              qualifies(input) && JSON.stringify(input.scope) === JSON.stringify(request.scope)
                ? { kind: 'granted' as const }
                : { kind: 'refused' as const, reason: 'scope-not-granted' },
          },
        ],
      ]),
      starts: {
        qualifyStart: async input =>
          qualifies(input)
            ? { kind: 'allowed' }
            : { kind: 'refused', reason: 'current-qualification' },
      },
      results: { text: value => succeed(textResult(value)) },
      policy: defaultResultPolicy,
      budgets: { arguments: jsonLimits },
    },
    instances: host,
    operationIdentities: identities.operationIdentities,
    sourceIssuer: source.issuer,
    catalog: {
      inspect: async () => succeed(availability),
      usage: async () =>
        fail({
          kind: 'unavailable',
          dependency: 'qa-catalog',
          diagnostic: 'Usage is outside S1–S3',
        }),
      search: async () => succeed({ entries: [availability], next: null }),
    },
    children: {
      reserve: async () => {
        throw new Error('S1–S3 must not schedule child tools')
      },
      admitted: async () => {
        throw new Error('unexpected child admission')
      },
      retain: async () => {
        throw new Error('unexpected child retain')
      },
      list: async () => succeed({ children: [], next: null }),
      close: async () => {
        throw new Error('unexpected program close')
      },
      closure: async () => succeed(null),
      confirmBarrier: async () => {
        throw new Error('unexpected program barrier')
      },
      finish: async () => {
        throw new Error('unexpected program finish')
      },
    },
    bindingsFor: memory => {
      const binding = {
        ...memory,
        start: async (
          input: Parameters<typeof memory.start>[0],
          environment: Parameters<typeof memory.start>[1],
        ) => {
          try {
            counts.bindingStart += 1
            observe('binding-start', input)
            const live = ok(await memory.start(input, environment))
            observe('capsule-staged', input.start)
            lives.set(input.start.operation, live)
            const progress = ok(
              await providers.dependencies.authority.consume({
                ...input,
                executorReceipt: evidence('staged-capsule', input.start),
              }),
            )
            observe('authority-consume-reply', progress)
            assert.equal(progress.kind, 'started', 'only a confirmed permit may execute')
            if (!executed.has(input.start.operation)) {
              executed.add(input.start.operation)
              const slot = readToolRegistration(registration)
              assert.ok(slot?.kind === 'function')
              const author = slot.operation.author
              assert.equal(author.kind, 'ordinary')
              if (author.kind !== 'ordinary') throw new Error('ordinary registration required')
              const argumentsValue = ok(author.parameters.parse(input.request.arguments))
              const {
                authorBufferBytes,
                authorBufferItems,
                authorWaitHistoryBytes,
                authorWaitHistoryItems,
              } = configuration
              const scope = ok(
                createIndependentToolScope({
                  limits: {
                    authorBufferBytes,
                    authorBufferItems,
                    authorWaitHistoryBytes,
                    authorWaitHistoryItems,
                  },
                  signal: controller.signal,
                  process: null,
                  waits: null,
                }),
              )
              const returned = ok(
                await executeTool(argumentsValue, author.executor, environment, scope),
              )
              const checked = ok(
                author.output.check({ arguments: argumentsValue, value: returned }),
              )
              const bytes = ok(author.codec.encode(checked))
              const raw = ok(
                await providers.dependencies.custody.preserve({
                  ...input,
                  operation: ok(await identities.operationIdentities.newOperation()),
                  codec: author.codec.adoption,
                  bytes,
                  source: evidence('executed-return', returned),
                }),
              )
              const value = ok(
                renderToolResult(
                  checked,
                  author,
                  { text: text => succeed(textResult(text)) },
                  defaultResultPolicy,
                ),
              )
              await providers.doubles.executor.controls.finish(input.start, {
                kind: 'final',
                raw,
                result: value,
                terminal: { kind: 'completed' },
                effect: {
                  kind: 'occurred',
                  evidence: evidence('author-completed', { start: input.start, returned }),
                },
              })
              observe('source-produced-final', { raw, value })
            }
            return succeed(live)
          } catch (error) {
            bindingError = error
            observe(
              'external-binding-error',
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : String(error),
            )
            throw error
          }
        },
      }
      return {
        inspect: async () => succeed(availability),
        resolve: async () => succeed(binding),
        recover: async input => {
          const live = lives.get(input.start.operation)
          assert.ok(live, 'recovery must address the original execution')
          return succeed({
            acknowledge: live.acknowledge,
            inspectStart: start => memory.inspectStart({ ...input, start }),
            inspectSuspension: async () =>
              fail({
                kind: 'unsupported',
                adoption: adoption('live-only'),
                reason: 'No checkpoints',
              }),
            stop: live.stop,
            inspectControl: live.inspectControl,
          })
        },
      }
    },
  })
  const environment = providers.dependencies.environments
  const runtime = createToolRuntime(
    {
      ...providers.dependencies,
      environments: {
        ...environment,
        prepare: input => {
          counts.environmentPrepare += 1
          observe('environment-prepare', input)
          return environment.prepare(input)
        },
      },
    },
    configuration,
  ).runtime

  async function state(reference: ToolInvocationRef): Promise<ToolState> {
    const found = ok(await runtime.queries.lookup({ ...access, reference }))
    assert.equal(found.kind, 'found')
    if (found.kind !== 'found') throw new Error('accepted invocation disappeared')
    return found.state
  }
  async function advanceUntil(
    reference: ToolInvocationRef,
    predicate: (value: ToolState) => boolean,
  ) {
    for (let step = 0; step < 100; step += 1) {
      const value = await state(reference)
      if (predicate(value)) {
        observe('driver-condition-met', { step, state: value })
        return value
      }
      const next = scheduled.shift()
      if (next !== undefined) {
        assert.ok(driver)
        await driver.run({
          ...next,
          principal,
          instance: await instance,
          signal: controller.signal,
        })
        if (bindingError !== null) throw bindingError
      }
      await setImmediate()
    }
    observe('driver-condition-unmet', await state(reference))
    await snapshot(reference)
    throw new Error('driver condition unmet after 100 host turns')
  }
  async function readAll(reference: ToolInvocationRef, result: ToolResultVersion) {
    const pages = []
    let after: string | null = null
    for (let turn = 0; turn < 32; turn += 1) {
      const page: ResultPage<ContentBlock> = ok(
        await runtime.queries.readResult({ ...access, reference, result, after }),
      )
      observe('read-result-page', page)
      assert.equal(page.result, result)
      pages.push(page)
      if (page.next === null) return pages
      assert.notEqual(page.next, after, 'pagination must progress')
      after = page.next
    }
    throw new Error('readResult did not end within 32 pages')
  }
  const completions = new Map<string, object>()
  async function processAndRelease(
    reference: ToolInvocationRef,
    settled: Extract<ToolState, { phase: 'settled' }>,
    pages: Awaited<ReturnType<typeof readAll>>,
  ) {
    assert.ok(settled.delivery?.kind === 'pending')
    assert.ok(pages.length > 0)
    const delivery = settled.delivery
    assert.deepEqual(delivery.consumer, consumer)
    const paragraphs = pages
      .flatMap(page => page.value.content)
      .map(block => {
        assert.equal(block.kind, 'text')
        if (block.kind !== 'text') throw new Error('consumer expects text')
        return block.text
      })
    assert.ok(paragraphs.every(text => text.length > 0))
    for (const page of pages) assert.equal(page.delivery, delivery.delivery)
    // The consumer performs a concrete transform, then saves the completion before handoff.
    const record = {
      reference,
      result: settled.result,
      delivery: delivery.delivery,
      consumer,
      paragraphs,
      characters: paragraphs.reduce((total, paragraph) => total + [...paragraph].length, 0),
      bodyDigest: digest(paragraphs),
      terminal: settled.terminal,
    }
    completions.set(delivery.delivery, record)
    observe('consumer-completion-saved', record)
    const completion = {
      ...evidence(`consumer/${delivery.delivery}`, record),
      owner: consumer.owner,
    }
    saveEvidence('completion', record)
    assert.deepEqual(completions.get(delivery.delivery), record)
    const released = await runtime.commands.releaseDelivery({
      ...access,
      reference,
      result: settled.result,
      delivery: delivery.delivery,
      consumer,
      evidence: { kind: 'processed', completion },
    })
    observe('release-delivery-reply', released)
    assert.equal(released.kind, 'released')
    const current = await state(reference)
    assert.equal(current.delivery?.kind, 'released')
    assert.deepEqual(
      await readAll(reference, settled.result),
      pages,
      'release must preserve complete content and fixed result',
    )
    return record
  }
  function saveEvidence(name: string, value: unknown) {
    const directory = process.env.OMNE_QA_EVIDENCE_DIR
    if (directory === undefined) return
    const path = resolve(directory)
    mkdirSync(path, { recursive: true })
    writeFileSync(resolve(path, `${scenario}-${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
  }
  async function snapshot(reference: ToolInvocationRef) {
    const { call } = readToolInvocationRef(reference)
    const records = await providers.store.read({ kind: 'call', tenant, call })
    assert.equal(records.kind, 'complete')
    observe('real-ledger-records', records)
    return records
  }
  return {
    access,
    request,
    counts,
    providers,
    identities,
    runtime,
    scheduled,
    observe,
    state,
    advanceUntil,
    readAll,
    processAndRelease,
    snapshot,
    finish: async (passed: boolean) => {
      controller.abort()
      await setImmediate()
      saveEvidence('observations', observations)
      console.info(
        JSON.stringify({ scenario, result: passed ? 'PASS' : 'FAIL', counts, observations }),
      )
    },
  }
}
