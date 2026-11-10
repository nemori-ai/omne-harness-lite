import { afterEach, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeToolOperationId, type DurableEvidence } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, defaultResultPolicy } from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
} from '@omne-harness/tool-contract/testing'
import {
  canonicalDigest,
  createToolLedger,
  type ToolControlSubjects,
  type ToolLedgerStore,
} from '@omne-harness/tool'

import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'

const opened: App[] = []
afterEach(() => {
  const apps = opened.splice(0)
  for (const app of apps) app.close()
  for (const directory of new Set(apps.map(app => app.directory)))
    rmSync(directory, { recursive: true, force: true })
})

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

function ledger(store: ToolLedgerStore, controlSubjects: ToolControlSubjects<string>) {
  return createToolLedger(
    store,
    {
      access: {
        qualify: async input =>
          input.tenant.organization.text === TENANT_A.organization.text &&
          input.tenant.account.text === TENANT_A.account.text
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'foreign tenant' },
      },
      sources: { verify: async () => ({ kind: 'unavailable', diagnostic: 'no new admissions' }) },
      factAcknowledgements: {
        verify: async () => ({ kind: 'unavailable', diagnostic: 'no facts' }),
      },
      starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
      grants: new Map(),
      results: {
        text: () => fail({ reason: 'unused' }),
      },
      policy: defaultResultPolicy,
      budgets: {
        arguments: {
          maxBytes: 4096,
          maxDepth: 16,
          maxItems: 256,
          maxMembers: 64,
          maxStringLength: 1024,
          maxNumberLength: 32,
        },
      },
    },
    createMemoryToolClock(),
    {
      resultPageBytes: 4096,
      ledgerCommitAttempts: 4,
      authorBufferBytes: 65_536,
      authorBufferItems: 128,
      queueCapacity: 16,
      readResultArguments: {
        maxBytes: 65_536,
        maxDepth: 32,
        maxItems: 4096,
        maxMembers: 256,
        maxStringLength: 32_768,
        maxNumberLength: 64,
      },
      offloading: {
        maxInlineUtf8Bytes: 65_536,
        maxRetentionMs: 86_400_000,
        maxBodyBytes: 16_777_216,
        previewUtf8Bytes: 1_024,
        maxPageBytes: 65_536,
        permitMs: 30_000,
        clockSkewMs: 1_000,
        orphanGraceMs: 60_000,
        maxWriterMetadataBytes: 1_048_576,
        jsonDocument: {
          maxBytes: 1_048_576,
          maxDepth: 64,
          maxItems: 65_536,
          maxMembers: 65_536,
          maxStringLength: 1_048_576,
          maxNumberLength: 64,
        },
        jsonRecord: {
          maxBytes: 65_536,
          maxDepth: 32,
          maxItems: 4096,
          maxMembers: 4096,
          maxStringLength: 65_536,
          maxNumberLength: 64,
        },
      },
    },
    {
      controlSubjects,
      content: null,
      releaseInspection: createMemoryToolEnvironment<string>(),
    },
  )
}

it('preserves an opaque controller reference and its original source through a real SQLite reopen', async () => {
  const first = await openApp({ keep: true })
  opened.push(first)
  const world = await ledgerWorld(TENANT_A)
  ok(await world.ledgerOver(first.store).admissions.admit(world.input))
  const operation = ok(decodeToolOperationId('controller-b-stop'))
  // This reference is a fixture-issued locator, never a serialized production principal.
  const subject = {
    owner: 'test-identity-directory',
    record: 'controller-b',
    revision: '1',
    digest: 'sha256:controller-b',
  }
  let revoked = false
  const checkedSubjects: DurableEvidence[] = []
  const subjects = (): ToolControlSubjects<string> => ({
    capture: async input =>
      input.principal === 'B' ? succeed(subject) : fail({ kind: 'denied', action: 'control' }),
    matches: async input =>
      input.principal === 'B' && canonicalDigest(input.subject) === canonicalDigest(subject)
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'different subject' },
    qualify: async input => {
      checkedSubjects.push(input.subject)
      if (canonicalDigest(input.subject) !== canonicalDigest(subject))
        return { kind: 'unavailable', diagnostic: 'unknown reference' }
      return revoked ? { kind: 'denied', reason: 'B revoked' } : { kind: 'allowed' }
    },
  })
  const original = ledger(first.store, subjects())
  const access = { ...world.access, principal: 'A' }
  const context = async (name: string) => ({
    ...access,
    operation: ok(decodeToolOperationId(name)),
    instance: ok(decodeToolInstanceId('sql-controller-test')),
    generation: '1',
    expected: ok(await original.commands.loadRecovery(access)).state.revision,
  })
  const preparation = ok(
    await original.commands.planPreparation({
      ...(await context('prepare')),
      request: world.input.request,
      purpose: 'initial',
      environmentAdoption: {
        owner: 'fixture',
        name: 'environment',
        revision: '1',
        digest: 'sha256:env',
      },
    }),
  )
  ok(
    await original.commands.prepared({
      ...(await context('prepared')),
      preparation,
      resources: subject,
    }),
  )
  ok(await original.commands.enqueue(await context('enqueue')))
  const start = ok(await original.commands.prepareStart(await context('start'))).start
  ok(
    await original.commands.recordStart({
      ...(await context('started')),
      invocation: start,
      outcome: { kind: 'started', acceptance: subject },
    }),
  )
  const input = { ...access, principal: 'B', operation, intent: { kind: 'stop' } as const }
  const receipt = ok(await original.commands.control(input))
  const domain = { kind: 'call', tenant: TENANT_A, call: world.access.call } as const
  const before = await first.store.read(domain)
  if (before.kind !== 'complete') throw new Error('unreadable fixture')
  const record = before.records.find(
    item => item.kind === 'operation' && item.operation.operation === operation,
  )
  expect(record).toMatchObject({
    kind: 'operation',
    operation: { receipt: { kind: 'control', subject } },
  })
  first.close()
  const second = await openApp({ directory: first.directory })
  opened.push(second)
  const reopened = await second.store.read(domain)
  if (reopened.kind !== 'complete') throw new Error('reopen failed')
  expect(
    reopened.records.find(
      item => item.kind === 'operation' && item.operation.operation === operation,
    ),
  ).toEqual(record)
  expect(reopened.revision).toBe(before.revision)
  const rebuilt = ledger(second.store, subjects())
  expect(ok(await rebuilt.commands.control(input))).toEqual(receipt)
  revoked = true
  const control = ok(await rebuilt.commands.loadRecovery(access)).controls[0]
  if (control === undefined) throw new Error('missing control')
  expect(
    ok(
      await rebuilt.controls.prepareDispatch({
        ...access,
        control: operation,
        source: control.source,
      }),
    ).progress.kind,
  ).toBe('rejected')
  expect(checkedSubjects).toEqual([subject])
  expect(
    ok(await rebuilt.commands.loadRecovery(access)).tasks.some(task => task.kind === 'stop'),
  ).toBe(false)
})
