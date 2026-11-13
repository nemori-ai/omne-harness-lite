// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Identity、真实治理与设置），每条命令起一个 `omne` 子进程。
// 租户层设置的读写面在正式装配上（#1265 C1）：登录的人经树上的 `tenantSettings` 把 Shell 的调用权限挑成「拒绝」，
// 答 `written` 带新的修订号；随后「查看」读到本层的挑选是「拒绝」。停服再起，同一份存储上仍读到它（S-7）。
// 租户的事务域在它的第一个会话时登记，治理的租户运行时只在登记之后打开，所以先建一个会话。
import { expect, it } from 'vitest'
import type { TenantSettings } from '@omne-harness/settings'
import { loginAccess } from '../../model/public-stream-support.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const SHELL = { category: 'tool', name: 'Shell' } as const

function faceOf(tree: ReleaseTree): TenantSettings<unknown> {
  const face = tree.scope.get('tenantSettings') as TenantSettings<unknown> | undefined
  if (face === undefined) throw new Error('no tenantSettings on the release tree')
  return face
}

it('a login principal sets the Shell invoke permission to deny on the release tree and reads it back after a restart', async () => {
  const seen: unknown[] = []
  const exits = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
    async tree => {
      const face = faceOf(tree)
      await tree.startSession('hello')
      const { principal, tenant } = await loginAccess(tree)
      const item = { principal, tenant, asset: SHELL, item: 'invoke' }
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
      await tree.startSession('again')
      const { principal, tenant } = await loginAccess(tree)
      const reread = await face.describe({ principal, tenant, asset: SHELL, item: 'invoke' })
      expect(reread).toEqual(seen[0])
    },
  ])
  expect(exits).toEqual([0, 0])
})
