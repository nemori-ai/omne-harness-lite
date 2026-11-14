// @module-tag slow
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTreeRuns, toolCallsThenText } from '../../support/release-tree.ts'
import { SHELL, faceOf, settledSession } from '../../governance/tenant-settings-support.ts'

it('a login principal sets the Shell invoke permission to deny on the release tree and reads it back after a restart', async () => {
  const seen: unknown[] = []
  const exits = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'hello')
      const { principal, tenant } = await loginAccess(tree)
      const item = { principal, tenant, asset: SHELL, item: 'invoke' }
      const listed = await face.list({ principal, tenant, after: null, limit: 100 })
      if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
      expect(listed.completeness).toBe('complete')
      expect(listed.items.map(value => `${value.asset.name}/${value.item}`).sort()).toEqual(
        ['Ask', 'Files', 'Shell', 'TodoItems', 'Tools', 'Web'].map(name => `${name}/invoke`),
      )
      for (const value of listed.items)
        expect(value).toMatchObject({
          kind: 'permission',
          revision: '0',
          declaration: { title: expect.any(String), appliesAt: expect.any(String) },
          own: null,
          default: 'ask',
          effective: { kind: 'value', value: 'ask', source: 'default' },
          bound: null,
          editable: { kind: 'yes' },
        })
      const before = await face.describe(item)
      expect(before).toMatchObject({ kind: 'described', item: { kind: 'permission', own: null } })
      if (before.kind !== 'described') throw new Error(JSON.stringify(before))
      const written = await face.set({
        ...item,
        operation: 'set-shell-deny',
        expectedRevision: before.item.revision,
        value: { kind: 'permission', pick: 'deny' },
      })
      expect(written).toEqual({
        kind: 'written',
        revision: String(Number(before.item.revision) + 1),
      })
      const after = await face.describe(item)
      expect(after).toMatchObject({
        kind: 'described',
        item: {
          kind: 'permission',
          own: 'deny',
          revision: String(Number(before.item.revision) + 1),
        },
      })
      seen.push(after)
    },
    async tree => {
      const face = faceOf(tree)
      await settledSession(tree, 'again')
      const { principal, tenant } = await loginAccess(tree)
      const reread = await face.describe({ principal, tenant, asset: SHELL, item: 'invoke' })
      expect(reread).toEqual(seen[0])
    },
  ])
  expect(exits).toEqual([0, 0])
})
