import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type {
  ContextBlockKey,
  NeedBinding,
  StaticBlock,
  StaticContribution,
} from '@omne-harness/runtime-context-contract'
import {
  runtimeContextTenantBlocksKey,
  runtimeContextTenantBlocksPlugin,
} from '@omne-harness/runtime-context-cordis-contract/cordis'

function block(key: string, required = true): StaticBlock {
  return {
    declaration: {
      key: key as ContextBlockKey,
      kind: 'supplied',
      schema: { '~standard': { version: 1, vendor: 'tests', validate: value => ({ value }) } },
      consumers: ['coordinator'],
      required,
      disclosure: 'plain',
      carriesPrevious: false,
      volatility: 'per-request',
      recovery: 'reread',
    },
    supply: async () => ({ kind: 'none' }),
  }
}

function contributing(name: string, contribution: StaticContribution) {
  return {
    name,
    inject: [runtimeContextTenantBlocksKey],
    apply(ctx: Context) {
      ctx.runtimeContextTenantBlocks.register(contribution)
    },
  }
}

const contributor = (name: string, declared: StaticBlock) =>
  contributing(name, { blocks: [declared] })

function need(name: string, key: string): NeedBinding {
  const shape = block(key).declaration.schema
  return {
    need: { name, shape, consumer: 'coordinator', purpose: 'a test', necessity: 'optional' },
    key: key as ContextBlockKey,
  }
}

async function tree() {
  const root = new Context()
  await root.plugin(runtimeContextTenantBlocksPlugin)
  return root
}

const keys = (root: Context) =>
  root.runtimeContextTenantBlocks.current().blocks.map(item => item.declaration.key)

describe('the registration point runtime-context.tenant-blocks (IC-13)', () => {
  it('a contribution is there while its plugin is loaded and gone when it unloads', async () => {
    const root = await tree()
    expect(keys(root)).toEqual([])
    const fiber = await root.plugin(contributor('owner', block('test.budget')))
    expect(keys(root)).toEqual(['test.budget'])
    await fiber.dispose()
    expect(keys(root)).toEqual([])
  })

  it('the withdrawal of one contributor leaves the contribution of another', async () => {
    const root = await tree()
    const first = await root.plugin(contributor('first', block('test.budget')))
    await root.plugin(contributor('second', block('test.other')))
    await first.dispose()
    expect(keys(root)).toEqual(['test.other'])
  })

  it('a second declaration of a block key that differs fails its own contributor and keeps the first', async () => {
    const root = await tree()
    await root.plugin(contributor('first', block('test.budget')))
    await expect(root.plugin(contributor('second', block('test.budget', false)))).rejects.toThrow(
      /already contributed/u,
    )
    expect(root.runtimeContextTenantBlocks.current().blocks).toMatchObject([
      { declaration: { required: true } },
    ])
  })

  it('the same declaration of a block key again is accepted and stays while one contributor stays', async () => {
    const root = await tree()
    const first = await root.plugin(contributor('first', block('test.budget')))
    await root.plugin(contributor('second', block('test.budget')))
    await first.dispose()
    expect(keys(root)).toEqual(['test.budget'])
  })

  it('a reader contributes its need bindings; they leave with the reader and the block stays', async () => {
    const root = await tree()
    await root.plugin(contributor('owner', block('test.budget')))
    const wanted = need('budget-of-intake', 'test.budget')
    const reader = await root.plugin(contributing('reader', { needs: [wanted] }))
    expect(root.runtimeContextTenantBlocks.current()).toMatchObject({ needs: [wanted] })
    await reader.dispose()
    expect(root.runtimeContextTenantBlocks.current().needs).toEqual([])
    expect(keys(root)).toEqual(['test.budget'])
  })

  it('does not follow a contribution that its owner changes afterwards', async () => {
    const root = await tree()
    const contribution = { blocks: [block('test.budget')] }
    await root.plugin(contributing('owner', contribution))
    contribution.blocks = []
    expect(keys(root)).toEqual(['test.budget'])
  })

  it('the service going away takes every contribution with it', async () => {
    const root = new Context()
    const service = await root.plugin(runtimeContextTenantBlocksPlugin)
    await root.plugin(contributor('owner', block('test.budget')))
    await service.dispose()
    expect(root.get(runtimeContextTenantBlocksKey)).toBeUndefined()
  })
})
