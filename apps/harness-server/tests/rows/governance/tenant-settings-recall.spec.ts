// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Identity、真实治理与设置），每条命令起一个 `omne` 子进程。
// 认回（#1265 C8，S-6）：同一个 `operation` 加同样的输入再送，答原来的 `written` 与同一个修订号，存储里只有一次写入；
// 换一次登录之后用同一个 `operation` 再送，仍然认回；加不同的输入答 `conflict`。写入的根只由租户决定，不随登录变。
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'
import { SHELL, faceOf, settledSession } from '../../governance/tenant-settings-support.ts'

it('recalls a tenant-layer write by its operation, also after another login, and refuses another input under it', async () => {
  const exit = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
    const face = faceOf(tree)
    await settledSession(tree, 'hello')
    const first = await loginAccess(tree)
    const item = { tenant: first.tenant, asset: SHELL, item: 'invoke' }
    const read = await face.describe({ ...item, principal: first.principal })
    if (read.kind !== 'described') throw new Error(JSON.stringify(read))
    const send = (principal: unknown, pick: string) =>
      face.set({
        ...item,
        principal,
        operation: 'recall-shell',
        expectedRevision: read.item.revision,
        value: { kind: 'permission', pick },
      })
    const revision = String(Number(read.item.revision) + 1)
    expect(await send(first.principal, 'deny')).toEqual({ kind: 'written', revision })
    expect(await send(first.principal, 'deny')).toEqual({ kind: 'written', revision })

    await tree.relogin()
    const second = await loginAccess(tree)
    expect(second.principal).not.toEqual(first.principal)
    expect(await send(second.principal, 'deny')).toEqual({ kind: 'written', revision })
    expect(await send(second.principal, 'ask')).toEqual({ kind: 'conflict' })

    const after = await face.describe({ ...item, principal: second.principal })
    expect(after).toMatchObject({ kind: 'described', item: { own: 'deny', revision } })
  })
  expect(exit).toBe(0)
})
