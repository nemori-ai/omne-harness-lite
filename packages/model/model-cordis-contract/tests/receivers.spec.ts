import { Context } from '@deepseek-ai/cordis'
import type { ModelResultReceiver } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import {
  ModelResultReceiverConflictError,
  ModelRuntimeService,
  createModelResultReceiverTable,
} from '../src/cordis.ts'

async function unused(): Promise<never> {
  throw new Error('not called')
}

// A provider that fills only the three abstract members and passes no table.
class BareRuntime extends ModelRuntimeService<unknown> {
  readonly calls = { admit: unused, inspect: unused, dispatches: unused, cancel: unused }
  readonly consumption = {
    beginRead: unused,
    readNext: unused,
    closeRead: unused,
    acknowledge: unused,
  }
  readonly instances = { connect: unused }
}

const receiver: ModelResultReceiver<unknown> = { push: unused }

describe('ModelRuntimeService.registerResultReceiver', () => {
  it('is concrete: a provider without a table registers and removes', async () => {
    const root = new Context()
    await root.plugin({
      name: 'runtime',
      apply(ctx: Context) {
        new BareRuntime(ctx)
      },
    })
    let removed = false
    await root.plugin({
      name: 'consumer',
      inject: ['modelRuntime'],
      apply(ctx: Context) {
        const remove = ctx.modelRuntime.registerResultReceiver('owner', receiver)
        remove()
        remove()
        removed = true
      },
    })
    expect(removed).toBe(true)
  })

  it('keeps the table off the instance: the only own property it adds is the method', async () => {
    const root = new Context()
    const keys: string[] = []
    await root.plugin({
      name: 'runtime',
      apply(ctx: Context) {
        const service = new BareRuntime(ctx)
        keys.push(...Object.keys(service))
      },
    })
    // `ctx` and `name` come from the Service base class.
    expect(keys.sort()).toEqual(
      ['calls', 'consumption', 'ctx', 'instances', 'name', 'registerResultReceiver'].sort(),
    )
  })

  it('throws ModelResultReceiverConflictError that names the owner', async () => {
    const root = new Context()
    const table = createModelResultReceiverTable<unknown>()
    await root.plugin({
      name: 'runtime',
      apply(ctx: Context) {
        new BareRuntime(ctx, table)
      },
    })
    const errors: unknown[] = []
    const register = (name: string) =>
      root.plugin({
        name,
        inject: ['modelRuntime'],
        apply(ctx: Context) {
          try {
            ctx.modelRuntime.registerResultReceiver('owner-1', receiver)
          } catch (error) {
            errors.push(error)
          }
        },
      })
    await register('first')
    await register('second')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(ModelResultReceiverConflictError)
    expect((errors[0] as ModelResultReceiverConflictError).owner).toBe('owner-1')
    expect(table.resolve('owner-1')).toBe(receiver)
  })

  it('registers the same fiber twice under one owner as a conflict', async () => {
    const root = new Context()
    await root.plugin({
      name: 'runtime',
      apply(ctx: Context) {
        new BareRuntime(ctx)
      },
    })
    let thrown: unknown
    await root.plugin({
      name: 'twice',
      inject: ['modelRuntime'],
      apply(ctx: Context) {
        ctx.modelRuntime.registerResultReceiver('owner', receiver)
        try {
          ctx.modelRuntime.registerResultReceiver('owner', receiver)
        } catch (error) {
          thrown = error
        }
      },
    })
    expect(thrown).toBeInstanceOf(ModelResultReceiverConflictError)
  })
})
