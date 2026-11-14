// @module-tag slow
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
