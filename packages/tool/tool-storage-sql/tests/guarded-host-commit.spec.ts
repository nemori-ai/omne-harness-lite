import { afterEach, expect, it } from 'vitest'

import { recordKey, type LedgerCommitInput, type LedgerDomain } from '@omne-harness/tool'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolGuardedHostCommit } from '../src/index.ts'
import {
  domainNameOf,
  openApp,
  TENANT_A,
  TENANT_B,
  textOf,
  UNREGISTERED,
  type App,
} from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0).reverse()) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

const revision = (value: string) => ok(decodeToolRevision(value))
const host: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'resource-permits' }
const grant = { kind: 'host', host: { key: 'permit-1', value: { mutation: 'grant-1' } } } as const
const hostCommit = (expected = '0'): LedgerCommitInput => ({
  domain: host,
  expected: revision(expected),
  revision: revision(String(BigInt(expected) + 1n)),
  writes: [{ kind: 'put', record: grant }],
})

async function pair() {
  const first = await openApp()
  opened.push(first)
  const second = await openApp({ directory: first.directory, keep: true })
  opened.push(second)
  const world = await ledgerWorld(TENANT_A)
  const ledger = world.ledgerOver(second.store)
  const admitted = ok(await ledger.admissions.admit(world.input))
  const call = { kind: 'call', tenant: TENANT_A, call: world.access.call } as const
  const read = await first.store.read(call)
  if (read.kind !== 'complete') throw new Error(read.diagnostic)
  const settle = async () => {
    const state = ok(
      await ledger.commands.rejectPending({
        ...world.access,
        instance: ok(decodeToolInstanceId('guarded-test')),
        generation: '1',
        operation: ok(decodeToolOperationId('settle')),
        expected: admitted.state.revision,
        reason: 'the host excluded the invocation',
        exclusion: { owner: 'test', record: 'exclusion', revision: '1', digest: 'sha256:excluded' },
      }),
    )
    expect(state.phase).toBe('settled')
  }
  return { first, second, call, callExpected: read.revision, settle }
}

it('a terminal committed after the live read prevents every host write', async () => {
  const p = await pair()
  await p.settle()
  const answer = await createSqlToolGuardedHostCommit(p.first.options).commit({
    call: p.call,
    callExpected: p.callExpected,
    hostCommit: hostCommit(),
  })
  expect(answer).toEqual({ kind: 'call-changed' })
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('a permit that wins survives the terminal and a SQL reopen until explicit cleanup', async () => {
  const p = await pair()
  expect(
    await createSqlToolGuardedHostCommit(p.first.options).commit({
      call: p.call,
      callExpected: p.callExpected,
      hostCommit: hostCommit(),
    }),
  ).toEqual({ kind: 'committed' })
  await p.settle()
  const expected = { kind: 'complete', revision: '1', records: [grant] }
  expect(await p.second.store.read(host)).toEqual(expected)
  p.second.close()
  p.first.sqlite.close()
  const reopened = await openApp({ directory: p.first.directory, keep: true })
  opened.push(reopened)
  expect(await reopened.store.read(host)).toEqual(expected)
  expect(
    await reopened.store.commit({
      ...hostCommit('1'),
      writes: [{ kind: 'delete', key: recordKey(grant) }],
    }),
  ).toEqual({ kind: 'committed' })
  expect(await reopened.store.read(host)).toEqual({ kind: 'complete', revision: '2', records: [] })
})

it('independent factories race for the host CAS and stale eligibility cannot retry after terminal', async () => {
  const p = await pair()
  const first = createSqlToolGuardedHostCommit(p.first.options)
  const second = createSqlToolGuardedHostCommit(p.second.options)
  const input = { call: p.call, callExpected: p.callExpected, hostCommit: hostCommit() }
  const answers = await Promise.all([first.commit(input), second.commit(input)])
  expect(answers).toContainEqual({ kind: 'committed' })
  expect(answers).toContainEqual({ kind: 'conflict', current: '1' })
  await p.settle()
  expect(await second.commit({ ...input, hostCommit: hostCommit('1') })).toEqual({
    kind: 'call-changed',
  })
  expect(await p.first.store.read(host)).toEqual({
    kind: 'complete',
    revision: '1',
    records: [grant],
  })
})

it('a queued permit evaluates the call condition when the SQL operation executes', async () => {
  const p = await pair()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const guard = createSqlToolGuardedHostCommit({
    ...p.first.options,
    storage: {
      ...p.first.options.storage,
      commit: async request => {
        entered.resolve()
        await release.promise
        return p.first.options.storage.commit(request)
      },
    },
  })
  const permit = guard.commit({
    call: p.call,
    callExpected: p.callExpected,
    hostCommit: hostCommit(),
  })
  await entered.promise
  try {
    await p.settle()
  } finally {
    release.resolve()
  }
  expect(await permit).toEqual({ kind: 'call-changed' })
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('a missing call including revision zero and a wrong revision cannot write a host', async () => {
  const p = await pair()
  const guard = createSqlToolGuardedHostCommit(p.first.options)
  const absent = { ...p.call, call: ok(decodeToolCallId('absent')) }
  for (const [call, callExpected] of [
    [absent, revision('0')],
    [p.call, revision('999')],
  ] as const)
    expect(await guard.commit({ call, callExpected, hostCommit: hostCommit() })).toEqual({
      kind: 'call-changed',
    })
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('another tenant row in the same database cannot satisfy the call condition', async () => {
  const p = await pair()
  const call = { ...p.call, call: ok(decodeToolCallId('other-tenant-call')) }
  p.second.sqlite.inspect(
    domainNameOf(TENANT_A),
    'INSERT INTO tl_domain (tenant, kind, name, revision) VALUES (?, ?, ?, ?)',
    [textOf(TENANT_B), 'call', call.call, '1'],
  )
  expect(
    await createSqlToolGuardedHostCommit(p.first.options).commit({
      call,
      callExpected: revision('1'),
      hostCommit: hostCommit(),
    }),
  ).toEqual({ kind: 'call-changed' })
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('cross-tenant inputs and non-host targets are refused before SQL submission', async () => {
  const p = await pair()
  const guard = createSqlToolGuardedHostCommit(p.first.options)
  const before = p.first.faults.commits()
  expect(
    (
      await guard.commit({
        call: { ...p.call, tenant: TENANT_B },
        callExpected: p.callExpected,
        hostCommit: hostCommit(),
      })
    ).kind,
  ).toBe('unavailable')
  expect(
    (
      await guard.commit({
        call: p.call,
        callExpected: p.callExpected,
        hostCommit: { ...hostCommit(), domain: p.call },
      })
    ).kind,
  ).toBe('unavailable')
  expect(p.first.faults.commits()).toBe(before)
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('the participant refuses forged tenant and domain kinds even behind the adapter', async () => {
  const p = await pair()
  for (const patch of [
    { tenant: textOf(TENANT_B), kind: 'call', name: p.call.call },
    { tenant: textOf(TENANT_A), kind: 'host', name: p.call.call },
  ]) {
    const guard = createSqlToolGuardedHostCommit({
      ...p.first.options,
      storage: {
        ...p.first.options.storage,
        commit: request =>
          p.first.options.storage.commit({
            ...request,
            commands: request.commands.map(command => ({
              ...command,
              facts: { ...command.facts, call: patch },
            })),
          }),
      },
    })
    expect(
      (await guard.commit({ call: p.call, callExpected: p.callExpected, hostCommit: hostCommit() }))
        .kind,
    ).toBe('unavailable')
  }
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it.each(['unknown-applied', 'unknown-dropped'] as const)(
  '%s stays unknown without automatic retry and is observed by the original host mutation',
  async fault => {
    const p = await pair()
    const before = p.first.faults.commits()
    p.first.faults.armCommit(fault)
    expect(
      (
        await createSqlToolGuardedHostCommit(p.first.options).commit({
          call: p.call,
          callExpected: p.callExpected,
          hostCommit: hostCommit(),
        })
      ).kind,
    ).toBe('unknown')
    const read = await p.second.store.read(host)
    expect(read).toEqual(
      fault === 'unknown-applied'
        ? { kind: 'complete', revision: '1', records: [grant] }
        : { kind: 'complete', revision: '0', records: [] },
    )
    expect(p.first.faults.commits() - before).toBe(1)
  },
)

it('a failure after the first host write rolls back every write and the host revision', async () => {
  const p = await pair()
  p.first.sqlite.failStatement(4)
  const input = hostCommit()
  expect(
    (
      await createSqlToolGuardedHostCommit(p.first.options).commit({
        call: p.call,
        callExpected: p.callExpected,
        hostCommit: {
          ...input,
          writes: [
            ...input.writes,
            {
              kind: 'put',
              record: { kind: 'host', host: { key: 'permit-2', value: 'second' } },
            },
          ],
        },
      })
    ).kind,
  ).toBe('unavailable')
  expect(await p.second.store.read(host)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('unregistered tenants and non-JSON records do not submit SQL', async () => {
  const p = await pair()
  const guard = createSqlToolGuardedHostCommit(p.first.options)
  const before = p.first.faults.commits()
  expect(
    (
      await guard.commit({
        call: { ...p.call, tenant: UNREGISTERED },
        callExpected: p.callExpected,
        hostCommit: { ...hostCommit(), domain: { ...host, tenant: UNREGISTERED } },
      })
    ).kind,
  ).toBe('unavailable')
  expect(
    (
      await guard.commit({
        call: p.call,
        callExpected: p.callExpected,
        hostCommit: {
          ...hostCommit(),
          writes: [
            {
              kind: 'put',
              record: { kind: 'host', host: { key: 'invalid', value: 1n } },
            },
          ],
        },
      })
    ).kind,
  ).toBe('unavailable')
  expect(p.first.faults.commits()).toBe(before)
})
