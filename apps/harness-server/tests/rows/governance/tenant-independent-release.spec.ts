// @module-tag slow
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTreeRuns, toolCallsThenText } from '../../support/release-tree.ts'
import { faceOf, settledSession } from '../../governance/tenant-settings-support.ts'

const INTAKE = {
  kind: 'independent',
  providerId: 'session',
  definitionId: 'intake',
} as const

it('a login principal lists the independent settings with their defaults apart from the asset ones, sets one, reads it after a restart and clears it', async () => {
  const seen: unknown[] = []
  const exits = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'hello')
      const { principal, tenant } = await loginAccess(tree)
      const page = { principal, tenant, after: null, limit: 100 }
      const listed = await face.list({ ...page, scope: { kind: 'independent' } })
      if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
      const assets = await face.list({ ...page, scope: { kind: 'asset' } })
      if (assets.kind !== 'listed') throw new Error(JSON.stringify(assets))
      expect(listed.items.every(value => value.owner.kind === 'independent')).toBe(true)
      expect(assets.items.every(value => value.owner.kind === 'asset')).toBe(true)
      expect(assets.items.length).toBeGreaterThan(0)
      expect(
        listed.items
          .map(value => [
            value.owner.kind === 'independent'
              ? `${value.owner.providerId}/${value.owner.definitionId}/${value.item}`
              : value.item,
            value.declaration.group.title,
            Reflect.get(value, 'effective'),
          ])
          .sort(),
      ).toEqual([
        [
          'calendar/environment/calendar',
          '日历与时区',
          { value: { kind: 'set', value: 'cn-legal-holidays' }, source: 'default' },
        ],
        [
          'calendar/environment/timezone',
          '日历与时区',
          { value: { kind: 'set', value: 'Asia/Shanghai' }, source: 'default' },
        ],
        [
          'session/intake/pending-limit',
          '输入排队',
          { value: { kind: 'set', value: 64 }, source: 'default' },
        ],
        [
          'workspace/outside-files/access',
          '工作区之外的文件',
          { value: { kind: 'set', value: 'none' }, source: 'default' },
        ],
      ])
      for (const value of listed.items)
        expect(value).toMatchObject({
          kind: 'ordinary',
          own: { kind: 'unset' },
          editable: { kind: 'yes' },
        })
      const item = { principal, tenant, owner: INTAKE, item: 'pending-limit' }
      const before = await face.describe(item)
      if (before.kind !== 'described') throw new Error(JSON.stringify(before))
      expect(
        await face.set({
          ...item,
          operation: 'set-32',
          expectedRevision: before.item.revision,
          value: { kind: 'ordinary', value: 32 },
        }),
      ).toEqual({ kind: 'written', revision: String(Number(before.item.revision) + 1) })
      expect(
        await face.set({
          ...item,
          operation: 'set-zero',
          expectedRevision: String(Number(before.item.revision) + 1),
          value: { kind: 'ordinary', value: 0 },
        }),
      ).toMatchObject({ kind: 'invalid' })
      const after = await face.describe(item)
      expect(after).toMatchObject({
        kind: 'described',
        item: {
          kind: 'ordinary',
          own: { kind: 'set', value: 32 },
          effective: { value: { kind: 'set', value: 32 }, source: 'tenant' },
        },
      })
      seen.push(after)
    },
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'again')
      const { principal, tenant } = await loginAccess(tree)
      const item = { principal, tenant, owner: INTAKE, item: 'pending-limit' }
      const reread = await face.describe(item)
      expect(reread).toEqual(seen[0])
      if (reread.kind !== 'described') throw new Error(JSON.stringify(reread))
      expect(
        await face.clear({ ...item, operation: 'clear', expectedRevision: reread.item.revision }),
      ).toMatchObject({ kind: 'written' })
      expect(await face.describe(item)).toMatchObject({
        item: {
          own: { kind: 'unset' },
          effective: { value: { kind: 'set', value: 64 }, source: 'default' },
        },
      })
    },
  ])
  expect(exits).toEqual([0, 0])
})

const OUTSIDE_FILES = {
  kind: 'independent',
  providerId: 'workspace',
  definitionId: 'outside-files',
} as const

it('the tenant sets each value of the setting for files outside the workspace and reads it back; another value is refused', async () => {
  const exits = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'hello')
      const { principal, tenant } = await loginAccess(tree)
      const item = { principal, tenant, owner: OUTSIDE_FILES, item: 'access' }
      const before = await face.describe(item)
      if (before.kind !== 'described') throw new Error(JSON.stringify(before))
      expect(before.item).toMatchObject({
        own: { kind: 'unset' },
        effective: { value: { kind: 'set', value: 'none' }, source: 'default' },
      })
      let revision = before.item.revision
      for (const value of ['read', 'read-write', 'none']) {
        const written = await face.set({
          ...item,
          operation: `set-${value}`,
          expectedRevision: revision,
          value: { kind: 'ordinary', value },
        })
        if (written.kind !== 'written') throw new Error(JSON.stringify(written))
        revision = written.revision
        expect(await face.describe(item), value).toMatchObject({
          item: { effective: { value: { kind: 'set', value }, source: 'tenant' } },
        })
      }
      expect(
        await face.set({
          ...item,
          operation: 'set-all',
          expectedRevision: revision,
          value: { kind: 'ordinary', value: 'all' },
        }),
      ).toMatchObject({ kind: 'invalid' })
    },
  ])
  expect(exits).toEqual([0])
})
