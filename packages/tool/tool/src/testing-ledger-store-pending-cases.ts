// 待办标记的一致性用例（G1，契约 P01「通知丢失由 scanPending 补偿」）。标记随调用域的提交原子地
// 写下或删掉，扫描按键集分页、跨租户列出带标记的调用。内存记录仓与 SQL 记录仓跑同一套用例。
import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type {
  LedgerCommitInput,
  LedgerDomain,
  LedgerPendingScan,
  PendingCall,
  TenantId,
  ToolLedgerStore,
} from './ledger-store.ts'
import type { LedgerStoreCase, StoreCaseDependencies } from './testing-ledger-store-types.ts'
import { batch, callId, hostRecord, required, snapshot } from './testing-ledger-values.ts'

type Store = ToolLedgerStore<ContentBlock>
type Scan = NonNullable<Store['scanPending']>

const tenantText = (tenant: TenantId) =>
  JSON.stringify([tenant.organization.text, tenant.account.text])
const entryText = (entry: PendingCall) => JSON.stringify([tenantText(entry.tenant), entry.call])

function page(answer: LedgerPendingScan, message: string) {
  assert.equal(answer.kind, 'page', message)
  assert.ok(answer.kind === 'page')
  return answer
}

/** 从头分页读完一次扫描，检查每页不超过 `limit`，返回全部条目的文本。 */
async function walk(scan: Scan, tenant: TenantId | null, limit: number): Promise<string[]> {
  const seen: string[] = []
  let after: PendingCall | null = null
  for (let round = 0; round < 100; round += 1) {
    const got = page(await scan({ tenant, after, limit }), 'every scan page must be readable')
    assert.ok(got.calls.length <= limit, 'a page must not exceed its limit')
    seen.push(...got.calls.map(entryText))
    const last = got.calls.at(-1)
    if (!got.more || last === undefined) return seen
    after = last
  }
  throw new Error('the scan did not end within 100 pages')
}

/** 一笔调用域提交：一条记录，带或不带标记。 */
function callCommit(
  domain: LedgerDomain,
  expected: string,
  next: string,
  pending: boolean | undefined,
): LedgerCommitInput<ContentBlock> {
  const input = batch(domain, [hostRecord(`r${next}`, { revision: next })], expected, next)
  return pending === undefined ? input : { ...input, pending }
}

export function storePendingCases(deps: StoreCaseDependencies): readonly LedgerStoreCase[] {
  const tenantA = deps.tenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
  const tenantB = deps.tenant(`org_${'2'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
  const callDomain = (tenant: TenantId, call: ToolCallId): LedgerDomain => ({
    kind: 'call',
    tenant,
    call,
  })
  const c1 = callDomain(tenantA, callId('pending-c1'))
  const marker = entryText({ tenant: tenantA, call: callId('pending-c1') })
  const scanOf = (store: Store): Scan => {
    const scan = required(store.scanPending, 'scanPending', deps)
    return input => scan.call(store, input)
  }
  return [
    {
      name: 'store.pending-marker',
      clause: 'G1',
      run: async ({ store }) => {
        const scan = scanOf(store)
        assert.deepEqual(await walk(scan, null, 10), [], 'a new store must hold no marker')
        await store.commit(callCommit(c1, '0', '1', undefined))
        assert.deepEqual(await walk(scan, null, 10), [], 'a commit without `pending` writes none')
        await store.commit(callCommit(c1, '1', '2', true))
        assert.deepEqual(await walk(scan, null, 10), [marker], 'pending: true must write it')
        assert.deepEqual(await walk(scan, tenantA, 10), [marker], 'the tenant scan must list it')
        assert.deepEqual(await walk(scan, tenantB, 10), [], 'another tenant must not list it')
        await store.commit(callCommit(c1, '2', '3', undefined))
        assert.deepEqual(await walk(scan, null, 10), [marker], 'an absent flag must keep it')
        await store.commit(callCommit(c1, '3', '4', true))
        assert.deepEqual(await walk(scan, null, 10), [marker], 'a second true must keep one')
        await store.commit(callCommit(c1, '4', '5', false))
        assert.deepEqual(await walk(scan, null, 10), [], 'pending: false must delete it')
        snapshot(
          await store.read(c1),
          '5',
          ['1', '2', '3', '4', '5'].map(next => hostRecord(`r${next}`, { revision: next })),
          'the marker must not appear among the domain records',
        )
      },
    },
    {
      name: 'store.pending-conflict',
      clause: 'G1',
      run: async ({ store }) => {
        const scan = scanOf(store)
        await store.commit(callCommit(c1, '0', '1', true))
        assert.equal(
          (await store.commit(callCommit(c1, '0', '2', false))).kind,
          'conflict',
          'a stale expected revision must conflict',
        )
        assert.deepEqual(await walk(scan, null, 10), [marker], 'a conflict must keep the marker')
        const other = callDomain(tenantA, callId('pending-c2'))
        assert.equal((await store.commit(callCommit(other, '5', '6', true))).kind, 'conflict')
        assert.deepEqual(await walk(scan, null, 10), [marker], 'a conflict must write no marker')
        snapshot(await store.read(other), '0', [], 'a conflict must write no record')
      },
    },
    ...(['commitUnavailable', 'unknownDropped', 'unknownApplied'] as const).map(
      handle =>
        ({
          name: `store.pending-${handle}`,
          clause: 'G1',
          run: async ({ store, controls }) => {
            const scan = scanOf(store)
            const arm = required(controls[handle], handle, deps)
            await arm()
            await store.commit(callCommit(c1, '0', '1', true))
            const applied = handle === 'unknownApplied'
            snapshot(
              await store.read(c1),
              applied ? '1' : '0',
              applied ? [hostRecord('r1', { revision: '1' })] : [],
              'the fault must keep its declared applied or dropped outcome',
            )
            assert.deepEqual(
              await walk(scan, null, 10),
              applied ? [marker] : [],
              'the marker must land exactly when the records land',
            )
          },
        }) satisfies LedgerStoreCase,
    ),
    {
      name: 'store.pending-delayed',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const scan = scanOf(store)
        const delayed = required(controls.delayed, 'delayed', deps)
        await store.commit(callCommit(c1, '0', '1', true))
        await delayed.arm()
        await store.commit(callCommit(c1, '1', '2', false))
        assert.deepEqual(await walk(scan, null, 10), [marker], 'a held delete must stay invisible')
        await delayed.land()
        assert.deepEqual(await walk(scan, null, 10), [], 'the landed delete must remove it')
      },
    },
    {
      name: 'store.pending-pages',
      clause: 'G1',
      run: async ({ store }) => {
        const scan = scanOf(store)
        const owned: PendingCall[] = [
          { tenant: tenantA, call: callId('a') },
          { tenant: tenantA, call: callId('b') },
          { tenant: tenantA, call: callId('c') },
          { tenant: tenantB, call: callId('a') },
          { tenant: tenantB, call: callId('d') },
        ]
        for (const entry of owned)
          await store.commit(callCommit(callDomain(entry.tenant, entry.call), '0', '1', true))
        // 已收场的调用：写过标记又删掉，任何一页都不能列出它。
        const done = callDomain(tenantB, callId('b'))
        await store.commit(callCommit(done, '0', '1', true))
        await store.commit(callCommit(done, '1', '2', false))
        const expected = owned.map(entryText).sort()
        for (const limit of [1, 2, 3, 4, 5, 6]) {
          const seen = await walk(scan, null, limit)
          assert.equal(new Set(seen).size, seen.length, `limit ${limit}: no call twice`)
          assert.deepEqual([...seen].sort(), expected, `limit ${limit}: every marked call once`)
          assert.deepEqual(await walk(scan, null, limit), seen, `limit ${limit}: a stable order`)
        }
        const onlyB = await walk(scan, tenantB, 1)
        assert.deepEqual(
          [...onlyB].sort(),
          owned.slice(3).map(entryText).sort(),
          'a tenant scan must list that tenant only',
        )
        const first = page(await scan({ tenant: null, after: null, limit: 2 }), 'first page')
        assert.equal(first.calls.length, 2, 'a page must fill up to its limit')
        assert.equal(first.more, true, 'a page with calls after it must say more')
      },
    },
  ]
}
