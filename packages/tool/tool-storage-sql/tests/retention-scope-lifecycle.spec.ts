// The lifecycle of a retention scope on the real SQLite store (tool-host-local SPEC, section
// 环境准备的租户调度): open, closed, released, never open again. A released scope keeps its closed marker
// `{closed:true}` across a restart of the storage, so a view made after it starts closed and its
// plan records nothing. The scope's close removes every reservation nobody took over in its own
// commit, so a lost reservation drop of the creator's close does not keep the scope from its
// release, which deletes the end facts.
import { afterEach, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest, hostKey, type ToolLedgerStore } from '@omne-harness/tool'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  retentionHostDomain,
} from '@omne-harness/tool-host-local'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import {
  acquisitionOf,
  callIdOf,
  ok,
  preparationOf,
  processOf,
  runningCall,
  terminalOf,
} from './fixtures/host-paths.ts'
import { fixedRequest } from './fixtures/ledger.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

const REQUEST = fixedRequest()
const SCOPE = REQUEST.requesterScope
const SCOPE_DOMAIN = retentionHostDomain(TENANT_A, canonicalDigest(SCOPE))
const authorize = async () => 'authorized' as const

/** A running call of the scope with its acquisition record, on `store`. */
async function seededCall(store: ToolLedgerStore, name: string) {
  const call = callIdOf(name)
  const preparation = preparationOf(TENANT_A, call, REQUEST)
  const committed = await store.commit({
    domain: { kind: 'call', tenant: TENANT_A, call },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'call',
          call: runningCall({
            tenant: TENANT_A,
            call,
            admission: ok(decodeToolOperationId(`${name}/admission`)),
            request: REQUEST,
            preparation,
          }),
        },
      },
    ],
  })
  if (committed.kind !== 'committed') throw new Error(`call seed: ${committed.kind}`)
  const state = createEnvironmentStateStore({ store })
  ok(await state.update(preparation, () => succeed(acquisitionOf(preparation, SCOPE))))
  return { preparation, state }
}

/** The scope's view of a call seeded on `store`. */
async function scopeView(store: ToolLedgerStore, name: string) {
  const { preparation, state } = await seededCall(store, name)
  return createRetainedTerminalLedger({ state, address: preparation, scope: SCOPE, authorize })
}

/** The stored state of the scope's record and the host keys of the scope's domain. */
async function scopeDomain(store: ToolLedgerStore) {
  const record = await store.readRecord(SCOPE_DOMAIN, hostKey('scope'))
  if (record.kind !== 'complete') throw new Error(`scope record: ${record.diagnostic}`)
  const whole = await store.read(SCOPE_DOMAIN)
  if (whole.kind !== 'complete') throw new Error(`scope domain: ${whole.diagnostic}`)
  return {
    state:
      record.record?.kind === 'host'
        ? (record.record.host.value as { state: unknown }).state
        : undefined,
    keys: whole.records.flatMap(item => (item.kind === 'host' ? [item.host.key] : [])),
  }
}

it('a released scope keeps its closed marker after a restart: a later view starts closed and its plan records nothing', async () => {
  const first = await openApp({ keep: true })
  const view = await scopeView(first.store, 'first')
  const terminal = terminalOf(0)
  expect(await view.plan(terminal)).toBe('recorded')
  expect(await view.permit(terminal.key)).toBe('confirmed')
  expect(await view.close()).toBe('confirmed')
  expect(await view.stopped(terminal.key, 'confirmed')).toBe('recorded')
  expect(await scopeDomain(first.store)).toEqual({ state: { closed: true }, keys: ['scope'] })
  first.close()

  const second = await openApp({ directory: first.directory })
  opened.push(second)
  const later = await scopeView(second.store, 'later')
  expect(later.closed.aborted).toBe(true)
  expect(await later.plan(terminalOf(1))).toBe('closed')
  expect(await scopeDomain(second.store)).toEqual({ state: { closed: true }, keys: ['scope'] })
})

it('the scope close removes a reservation the creator close failed to drop, and releases the scope with its end facts', async () => {
  const app = await openApp()
  opened.push(app)
  // The first commit of the scope's domain after `armed` does not land.
  let armed = false
  let refused = 0
  const store: ToolLedgerStore = {
    durability: app.store.durability,
    read: domain => app.store.read(domain),
    readRecord: (domain, key) => app.store.readRecord(domain, key),
    commit: async input => {
      if (armed && input.domain.kind === 'host' && input.domain.key.startsWith('retention@')) {
        armed = false
        refused += 1
        return { kind: 'unavailable', diagnostic: 'fixture' }
      }
      return app.store.commit(input)
    },
  }
  const { preparation, state } = await seededCall(store, 'creator')
  const retained = await createRetainedTerminalLedger({
    state,
    address: preparation,
    scope: SCOPE,
    authorize,
  })
  const acquisition = await createEnvironmentResourceLedger({
    state,
    address: preparation,
    authorize,
  })
  const process = processOf(0)
  expect(await acquisition.plan(process)).toBe('recorded')
  expect(await retained.plan(process)).toBe('recorded')
  expect(await retained.adopt(process.key)).toBe('confirmed')
  expect(await retained.stopped(process.key, 'confirmed')).toBe('recorded')
  const untaken = terminalOf(0)
  expect(await retained.plan(untaken)).toBe('recorded')
  armed = true
  expect(await acquisition.close()).toBe('confirmed')
  expect(refused).toBe(1)
  expect(await retained.inspect()).toMatchObject([{ resource: { key: untaken.key } }])
  expect(await retained.ended(process.key)).toBe('confirmed')

  expect(await retained.close()).toBe('confirmed')
  expect(await scopeDomain(app.store)).toEqual({ state: { closed: true }, keys: ['scope'] })
  expect(await retained.ended(process.key)).toBe('none')
})
