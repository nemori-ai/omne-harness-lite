// @module-tag slow
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTreeRuns, toolCallsThenText } from '../../support/release-tree.ts'
import { faceOf, settledSession } from '../../governance/tenant-settings-support.ts'

const SCHEDULE = { category: 'preference', name: 'schedule' }

it('a login principal lists the declared preferences with their defaults, sets one, reads it after a restart and clears it', async () => {
  const seen: unknown[] = []
  const exits = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'hello')
      const { principal, tenant } = await loginAccess(tree)
      const listed = await face.list({ principal, tenant, after: null, limit: 100 })
      if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
      const preferences = listed.items.filter(value => value.asset.category === 'preference')
      expect(
        preferences
          .map(value => [`${value.asset.name}/${value.item}`, Reflect.get(value, 'effective')])
          .sort(),
      ).toEqual([
        [
          'calendar/calendar',
          { value: { kind: 'set', value: 'cn-legal-holidays' }, source: 'default' },
        ],
        [
          'calendar/timezone',
          { value: { kind: 'set', value: 'Asia/Shanghai' }, source: 'default' },
        ],
        [
          'schedule/agentScheduleConsent',
          { value: { kind: 'set', value: 'auto' }, source: 'default' },
        ],
      ])
      for (const value of preferences)
        expect(value).toMatchObject({
          kind: 'ordinary',
          own: { kind: 'unset' },
          editable: { kind: 'yes' },
        })
      const item = { principal, tenant, asset: SCHEDULE, item: 'agentScheduleConsent' }
      const before = await face.describe(item)
      if (before.kind !== 'described') throw new Error(JSON.stringify(before))
      expect(
        await face.set({
          ...item,
          operation: 'set-draft',
          expectedRevision: before.item.revision,
          value: { kind: 'ordinary', value: 'draft' },
        }),
      ).toEqual({ kind: 'written', revision: String(Number(before.item.revision) + 1) })
      expect(
        await face.set({
          ...item,
          operation: 'set-unknown',
          expectedRevision: String(Number(before.item.revision) + 1),
          value: { kind: 'ordinary', value: 'sometimes' },
        }),
      ).toMatchObject({ kind: 'invalid' })
      const after = await face.describe(item)
      expect(after).toMatchObject({
        kind: 'described',
        item: {
          kind: 'ordinary',
          own: { kind: 'set', value: 'draft' },
          effective: { value: { kind: 'set', value: 'draft' }, source: 'tenant' },
        },
      })
      seen.push(after)
    },
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'again')
      const { principal, tenant } = await loginAccess(tree)
      const item = { principal, tenant, asset: SCHEDULE, item: 'agentScheduleConsent' }
      const reread = await face.describe(item)
      expect(reread).toEqual(seen[0])
      if (reread.kind !== 'described') throw new Error(JSON.stringify(reread))
      expect(
        await face.clear({ ...item, operation: 'clear', expectedRevision: reread.item.revision }),
      ).toMatchObject({ kind: 'written' })
      expect(await face.describe(item)).toMatchObject({
        item: {
          own: { kind: 'unset' },
          effective: { value: { kind: 'set', value: 'auto' }, source: 'default' },
        },
      })
    },
  ])
  expect(exits).toEqual([0, 0])
})
