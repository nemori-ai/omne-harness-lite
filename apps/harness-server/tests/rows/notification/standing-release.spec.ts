// @module-tag slow
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { tenantIdSchema } from '@omne-harness/notification-contract'
import { runtimeContextTenantScopeKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { tenantScopeIssuerOf } from '../../../src/entry/principals.ts'
import {
  DELIVERY_BLOCKED_KEY,
  createStandingItemsReader,
} from '../../../src/rows/notification/standing.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

const BUDGET = 'session.intake-budget'
const NEED = 'notification.standing-items'

function readers(tree: ReleaseTree) {
  const { tenant } = tree.registrar()
  const principal = tenantScopeIssuerOf(tree.env)(tenant)
  if (principal === undefined) throw new Error('no principal for the tenant-level scope')
  const scope = () => tree.scope.get(runtimeContextTenantScopeKey)
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture: tenant text')
  const standing = createStandingItemsReader<unknown>({ scope, principal: async () => principal })
  const all = { consumer: 'coordinator', blocks: [DELIVERY_BLOCKED_KEY, BUDGET], needs: [NEED] }
  return {
    standing: () => standing.read(tenantIdSchema.parse(text.value)),
    everything: () => scope()?.read(principal, tenant, all as never),
  }
}

describe('the tenant-level scope on the release tree (J10)', () => {
  it(
    'Notification reads the block it published itself, and the budget of the tenant is there beside it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const r = readers(tree)
        // The calendar is a source as well; Notification's own block holds nothing here.
        const read = await r.standing()
        expect(read.kind).toBe('ok')
        const own =
          read.kind === 'ok' ? read.items.filter(item => item.source !== 'calendar.supply') : null
        expect(own).toEqual([])
        expect(await r.everything()).toMatchObject({
          ok: {
            entries: expect.arrayContaining([
              expect.objectContaining({ key: DELIVERY_BLOCKED_KEY, kind: 'value', value: [] }),
              expect.objectContaining({
                key: BUDGET,
                kind: 'value',
                value: { maxPendingInputs: 64 },
              }),
            ]),
            missing: { blocks: [], needs: [] },
          },
        })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'without the notification rows its block and its need are missing, never empty; the budget stays',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = {
        script: toolCallsThenText(() => []),
        withoutRows: ['notification', 'notification-access'],
      }
      const exitCode = await onReleaseTree(options, async tree => {
        const r = readers(tree)
        expect(await r.standing()).toEqual({ kind: 'missing' })
        expect(await r.everything()).toMatchObject({
          ok: {
            entries: [expect.objectContaining({ key: BUDGET, kind: 'value' })],
            missing: { blocks: [DELIVERY_BLOCKED_KEY], needs: [NEED] },
          },
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
