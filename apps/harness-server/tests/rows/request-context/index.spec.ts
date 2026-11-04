// @module-tag slow
// The `request-context` row on a real Cordis with the release entry objects (SC2): the accounting
// inbox it provides answers through the ports of `accounting.ts`. The read eligibility reads the
// registered holder sources per call, so a holder that starts after the row is used, and no holder
// is `unavailable`; an unverified principal is `denied` even with the configured sender, and the
// denial reaches the row logger. The holder is a test stand-in of `contextHolderSources` (the real one is row
// `session-ad04`).
import { afterEach, describe, expect, it } from 'vitest'
import type { Context, Message } from '@deepseek-ai/cordis'
import type { Access, ContextAccountingInbox } from '@omne-harness/request-context-contract'
import {
  ContextHolderSourcesService,
  contextAccountingInboxKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { principalIssuer, principalVerifier } from '../../../src/entry/principals.ts'
import { requestContextTrust } from '../../../src/entry/request-context-trust.ts'
import {
  ACCOUNT_OUTLET_SENDER,
  ACCOUNTING_DENIALS,
} from '../../../src/rows/request-context/accounting.ts'
import { requestContextRow } from '../../../src/rows/request-context/index.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

const tenant = fixtureTenant('a')
const scopeRef = decodeScopeRef({ ref: `session-scope:${'a'.repeat(64)}` })
if ('failure' in scopeRef) throw new Error('fixture: scope')
const target = { tenant, scope: scopeRef.ok }
const access: Access<unknown> = { principal: 'not a principal', tenant }
const limits = { maxTargets: 4, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 }

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [declared(requestContextRow, { limits })],
    entryObjects: [principalVerifier, principalIssuer, requestContextTrust],
  })
  release.push(() => tree.dispose())
  return tree
}

/** A holder stand-in whose eligibility denies every access. */
function denyingHolder(leases: { count: number }) {
  return {
    name: 'holder-double',
    apply(ctx: Context) {
      new (class extends ContextHolderSourcesService<unknown> {
        lease() {
          leases.count += 1
          return {
            kind: 'leased' as const,
            lease: {
              parts: { eligibility: { check: async () => ({ kind: 'denied' as const }) } } as never,
              release: () => {},
            },
          }
        }
      })(ctx)
    },
  }
}

describe('the request-context row: the accounting inbox through the release ports', () => {
  it(
    'usage: no holder is unavailable; a holder started later is read and its denial stays denied',
    { timeout: 60_000 },
    async () => {
      const tree = await start()
      expect(tree.state('request-context')).toMatchObject({ state: 'ACTIVE' })
      const inbox = tree.service<ContextAccountingInbox<unknown>>(contextAccountingInboxKey)!
      await expect(inbox.usage({ access, target })).resolves.toEqual({
        kind: 'unavailable',
        diagnostic: 'accounting read eligibility: no contextHolderSources holder is running',
      })
      const leases = { count: 0 }
      await tree.root.plugin(denyingHolder(leases))
      await expect(inbox.usage({ access, target })).resolves.toEqual({ kind: 'denied' })
      expect(leases.count).toBe(1)
    },
  )

  it(
    'receive: an unverified principal is denied and the denial reaches the row logger',
    { timeout: 60_000 },
    async () => {
      const tree = await start()
      const inbox = tree.service<ContextAccountingInbox<unknown>>(contextAccountingInboxKey)!
      const logged: Message[] = []
      tree.root.logger.exporter({ levels: { default: 3 }, export: message => logged.push(message) })
      {
        const receipt = await inbox.receive({
          access,
          input: {
            kind: 'account',
            origin: {
              producer: 'model',
              sender: ACCOUNT_OUTLET_SENDER,
              resultVersion: null,
            },
            target,
            call: { tenant, call: 'mcall_one' as never },
            dispatch: 'mdisp_one' as never,
            account: {
              subject: { kind: 'model_call', id: 'mcall_one' },
              usage: [{ name: 'input', state: 'known', lexeme: '700', unit: 'token' }],
              cost: [],
              trimmed: { state: 'unknown', unit: 'token' },
              place: 'provider-a',
              duration: { state: 'unknown' },
              receipt: 'received',
              revision: '0',
            },
            committed: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
          },
        })
        expect(receipt).toEqual({ kind: 'denied' })
      }
      expect(
        logged.some(message => JSON.stringify(message).includes(ACCOUNTING_DENIALS.principal)),
      ).toBe(true)
    },
  )
})
