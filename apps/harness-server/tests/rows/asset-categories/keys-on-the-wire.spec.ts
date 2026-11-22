import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { CategoryContribution } from '@omne-harness/assets'
import { ASSET_CATEGORIES_POINT, assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { assetCategoriesRow } from '../../../src/rows/asset-categories/index.ts'
import { freePort } from '../../r9/support.ts'
import { startTree, waitListening } from '../server-entry/support.ts'

const gadget: CategoryContribution = {
  contract: {
    category: 'gadget',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  },
  display: { title: 'Gadget', summary: 'Gadget.' },
  point: 'gadget.items',
}

/** A row the case reaches into: it contributes a category when told and takes it back when told. */
function hostRow() {
  let held: Context | undefined
  const row = defineRow({
    row: 'gadget-host',
    implementation: 'contract-double',
    manifest: { provides: [], injects: [assetCategoriesKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'gadget-host',
      inject: [assetCategoriesKey],
      apply(ctx: Context) {
        held = ctx
      },
    },
  })
  return {
    row,
    contribute(): Fiber {
      if (held === undefined) throw new Error('the host row did not start')
      return held.plugin(categoryContributionPlugin('gadget-category', gadget))
    },
  }
}

type Frame = Readonly<{
  kind: string
  revision: number
  points?: readonly Readonly<{ name: string; keys?: readonly string[] }>[]
}>

const categoriesOf = (frame: Frame): readonly string[] | undefined =>
  frame.points?.find(point => point.name === ASSET_CATEGORIES_POINT)?.keys

it('a category contributed and taken back on a running tree reaches a client as the keys of assets.categories', async () => {
  const port = await freePort()
  const host = hostRow()
  const tree = startTree({
    config: { listenPort: port },
    extraRows: [
      { id: 'asset-categories', plugin: 'assetCategoriesRow' },
      { id: 'gadget-host', plugin: 'gadgetHost' },
    ],
    extraPlugins: { assetCategoriesRow, gadgetHost: host.row },
  })
  await waitListening(tree, port)
  const access = createClient(
    accessProtocol,
    createHttpProtocolTransport({ origin: `http://127.0.0.1:${port}` }),
  )
  const controller = new AbortController()
  const frames = access.observe.availability({}, { signal: controller.signal })
  const next = async (): Promise<Frame> => {
    const step = await frames.next()
    if (step.done === true) throw new Error('the availability ended')
    return step.value as Frame
  }
  try {
    const first = await next()
    expect(first.kind).toBe('snapshot')
    expect(categoriesOf(first)).toEqual([])

    const fiber = host.contribute()
    const added = await next()
    expect(added.kind).toBe('snapshot')
    expect(added.revision).toBe(first.revision)
    expect(categoriesOf(added)).toEqual(['gadget'])

    await fiber.dispose()
    const removed = await next()
    expect(removed.revision).toBe(first.revision)
    expect(categoriesOf(removed)).toEqual([])
  } finally {
    controller.abort()
    await frames.return({ kind: 'aborted' }).catch(() => undefined)
  }
  const run = await tree.stop()
  expect(run.result.exitCode).toBe(0)
})
