// @module-tag slow
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTree } from '../../support/release-tree.ts'
import { SHELL, faceOf, shellRound, shellScript } from '../../governance/tenant-settings-support.ts'

it('a deny pick of the tenant layer stops the next Shell call at its start, and a clear lets the call after it start', async () => {
  const exit = await onReleaseTree({ script: shellScript }, async tree => {
    const face = faceOf(tree)
    await shellRound(tree, 'warmup')
    const baseline = await shellRound(tree, 'baseline')
    expect(baseline.started).toBe(true)

    const { principal, tenant } = await loginAccess(tree)
    const item = { principal, tenant, asset: SHELL, item: 'invoke' }
    const read = await face.describe(item)
    if (read.kind !== 'described') throw new Error(JSON.stringify(read))
    expect(read.item).toMatchObject({ effective: { kind: 'value', value: 'ask' } })
    const denied = await face.set({
      ...item,
      operation: 'deny-shell',
      expectedRevision: read.item.revision,
      value: { kind: 'permission', pick: 'deny' },
    })
    expect(denied).toMatchObject({ kind: 'written' })
    if (denied.kind !== 'written') throw new Error(JSON.stringify(denied))
    expect(await face.describe(item)).toMatchObject({
      item: { effective: { kind: 'prohibited', by: 'tenant' } },
    })

    const stopped = await shellRound(tree, 'stopped')
    expect(stopped).toMatchObject({
      started: false,
      result: 'The tool call was denied and did not run.',
      calls: [],
    })

    const cleared = await face.clear({
      ...item,
      operation: 'clear-shell',
      expectedRevision: denied.revision,
    })
    expect(cleared).toEqual({ kind: 'written', revision: String(Number(denied.revision) + 1) })

    expect(await face.describe(item)).toMatchObject({
      item: { own: null, effective: { kind: 'value', value: 'ask', source: 'default' } },
    })
    const resumed = await shellRound(tree, 'resumed')
    expect(resumed.started).toBe(true)
  })
  expect(exit).toBe(0)
})
