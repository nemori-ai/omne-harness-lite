import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeModelOperationId,
  type DispatchRecord,
  type ModelCallId,
} from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { createLateAccounts } from '../src/plugins/late-accounts.ts'
import type { ResultPushRecord, RuntimeEvent } from '../src/plugins/runtime.ts'

const TENANT = (() => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
})()
const TENANT_TEXT = (() => {
  const text = tenantCodec.encode(TENANT)
  if (!text.ok) throw new Error('fixture tenant text')
  return text.value
})()
const CALL = 'mcall_one' as ModelCallId
const ACCESS = { principal: 'host', tenant: TENANT }
const TARGET = { tenant: TENANT, call: CALL }
const RECEIPT = { owner: 'consumer', record: 'saved', revision: '1', digest: 'd' }
const operation = () => {
  const decoded = decodeModelOperationId('mop_confirm')
  if ('failure' in decoded) throw new Error('fixture operation')
  return decoded.ok
}

function dispatch(name: string, revision: string, over: Partial<DispatchRecord> = {}) {
  return {
    dispatch: name,
    account: { receipt: 'late', revision, cost: [] },
    ...over,
  } as unknown as DispatchRecord
}

/** The late accounts over scripted dispatch records; `seen` keeps what reached the commands. */
function lateOver(
  records: readonly DispatchRecord[] | 'unavailable',
  given: Readonly<{ refuse?: boolean; maxPending?: number; hold?: boolean }> = {},
) {
  const seen = {
    confirmed: [] as unknown[],
    held: [] as unknown[],
    reports: [] as RuntimeEvent[],
  }
  const reservations = new Map<string, string>()
  const commands = {
    dispatches: () =>
      Promise.resolve(
        records === 'unavailable'
          ? { failure: { kind: 'unavailable', dependency: 'model-records', diagnostic: 'd' } }
          : { ok: records },
      ),
    confirmAccount: (input: unknown) => {
      seen.confirmed.push(input)
      return Promise.resolve(
        given.refuse === true
          ? { failure: { kind: 'unavailable', dependency: 'model-records', diagnostic: 'd' } }
          : { ok: '2' },
      )
    },
  } as unknown as Pick<ModelCommands<unknown>, 'dispatches' | 'confirmAccount'>
  const late = createLateAccounts({
    commands,
    report: event => seen.reports.push(event),
    operation,
    reservations,
    maxPending: given.maxPending ?? 4,
    hold: (target, held, revision, reservation) => {
      seen.held.push({ target, dispatch: held, revision, reservation })
      return Promise.resolve(given.hold ?? true)
    },
  })
  return { late, seen, reservations }
}

/** A push record whose result is saved by its consumer and carries these accounts. */
function saved(accounts: readonly Readonly<{ dispatch: string; revision: string | null }>[]) {
  return {
    acknowledgement: 'acknowledged',
    result: {
      standing: { status: 'saved', receipt: { evidence: RECEIPT } },
      delivery: {
        key: { result: '3' },
        accounts: accounts.map(item => ({
          dispatch: item.dispatch,
          account: item.revision === null ? null : { revision: item.revision },
        })),
      },
    },
  } as unknown as ResultPushRecord
}

describe('the late accounts a consumer has not confirmed', () => {
  it('lists only late accounts newer than the revision the consumer confirmed', async () => {
    const { late } = lateOver([
      dispatch('mdisp_new', '2'),
      dispatch('mdisp_done', '2', { lateDelivered: '2' }),
      dispatch('mdisp_stream', '1', {
        account: { receipt: 'received', revision: '1', cost: [] },
      } as unknown as DispatchRecord),
      dispatch('mdisp_none', '1', { account: null }),
    ])
    expect(await late.undelivered(CALL, ACCESS)).toEqual([{ dispatch: 'mdisp_new', revision: '2' }])
    expect(await lateOver('unavailable').late.undelivered(CALL, ACCESS)).toEqual([])
  })

  it('confirms with the consumer receipt, and reports a confirmation that did not go through', async () => {
    const account = { dispatch: 'mdisp_new', revision: '2' } as const
    const ok = lateOver([])
    await ok.late.confirm(ACCESS, CALL, account as never, RECEIPT)
    expect(ok.seen.confirmed).toEqual([
      { ...ACCESS, call: CALL, operation: operation(), ...account, receipt: RECEIPT },
    ])
    expect(ok.seen.reports).toEqual([])
    const refused = lateOver([], { refuse: true })
    await refused.late.confirm(ACCESS, CALL, account as never, RECEIPT)
    expect(refused.seen.reports).toEqual([
      { kind: 'late-account-unconfirmed', failure: 'unavailable' },
    ])
  })
})

describe('redelivering the late accounts of a call after a restart', () => {
  it('confirms an account the saved result carried at that revision, and holds the others again', async () => {
    const s = lateOver([
      dispatch('mdisp_carried', '2'),
      dispatch('mdisp_newer', '3'),
      dispatch('mdisp_other', '2'),
    ])
    await s.late.redeliver(
      TARGET,
      ACCESS,
      saved([
        { dispatch: 'mdisp_empty', revision: null },
        { dispatch: 'mdisp_carried', revision: '2' },
        { dispatch: 'mdisp_newer', revision: '2' },
      ]),
    )
    expect(s.seen.confirmed).toMatchObject([
      { dispatch: 'mdisp_carried', revision: '2', receipt: RECEIPT },
    ])
    expect(s.seen.held).toEqual([
      {
        target: TARGET,
        dispatch: 'mdisp_newer',
        revision: '3',
        reservation: JSON.stringify([TENANT_TEXT, 'again', 'mdisp_newer']),
      },
      {
        target: TARGET,
        dispatch: 'mdisp_other',
        revision: '2',
        reservation: JSON.stringify([TENANT_TEXT, 'again', 'mdisp_other']),
      },
    ])
    expect([...s.reservations.values()]).toEqual([TENANT_TEXT, TENANT_TEXT])
  })

  it('holds every account again when the result is not saved, or there is no push record', async () => {
    for (const record of [
      undefined,
      { ...saved([{ dispatch: 'mdisp_one', revision: '1' }]), acknowledgement: 'unknown' },
    ] as const) {
      const s = lateOver([dispatch('mdisp_one', '1')])
      await s.late.redeliver(TARGET, ACCESS, record as ResultPushRecord | undefined)
      expect(s.seen.confirmed).toEqual([])
      expect(s.seen.held).toMatchObject([{ dispatch: 'mdisp_one' }])
    }
  })

  it('holds an account once, within the bound, and gives its place back when the hold is refused', async () => {
    const twice = lateOver([dispatch('mdisp_one', '1')])
    await twice.late.redeliver(TARGET, ACCESS, undefined)
    await twice.late.redeliver(TARGET, ACCESS, undefined)
    expect(twice.seen.held).toHaveLength(1)
    const full = lateOver([dispatch('mdisp_a', '1'), dispatch('mdisp_b', '1')], { maxPending: 1 })
    await full.late.redeliver(TARGET, ACCESS, undefined)
    expect(full.seen.held).toMatchObject([{ dispatch: 'mdisp_a' }])
    const refused = lateOver([dispatch('mdisp_one', '1')], { hold: false })
    await refused.late.redeliver(TARGET, ACCESS, undefined)
    expect(refused.seen.held).toHaveLength(1)
    expect(refused.reservations.size).toBe(0)
  })
})
