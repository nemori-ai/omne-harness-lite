import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Toast } from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { startShell, type ReferenceShell } from './reference-shell.ts'

const toast = (id: string, title = id): Toast => ({ id, tone: 'attention', title })
const titles = (shell: ReferenceShell) => shell.toastStore.shown().map(shown => shown.toast.title)

async function caller(root: Context, name: string) {
  let held: ShellService | undefined
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply(ctx: Context) {
      held = ctx.shell
    },
  })
  await fiber
  return { fiber, shell: held! }
}

const toastEffects = (fiber: Fiber) =>
  fiber.getEffects().filter(effect => effect.label === 'shell.toast')

describe('ShellService.toast', () => {
  it('shows what a module hands over and gives nothing back', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    const result: unknown = module.shell.toast({
      id: 'n1',
      tone: 'info',
      title: '新通知',
      body: '一行正文',
      action: { label: '去看看', page: 'notifications', subject: 'n1' },
    })
    expect(result).toBeUndefined()
    expect(shell.toastStore.shown().map(shown => shown.toast)).toEqual([
      {
        id: 'n1',
        tone: 'info',
        title: '新通知',
        body: '一行正文',
        action: { label: '去看看', page: 'notifications', subject: 'n1' },
      },
    ])
  })

  it('replaces a toast with the same id instead of adding a second', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    module.shell.toast(toast('n1', 'first'))
    module.shell.toast(toast('n1', 'second'))
    expect(titles(shell)).toEqual(['second'])
  })

  it('takes down what a module showed and queued when it unloads, and leaves the others', async () => {
    const { root, shell } = await startShell()
    const first = await caller(root, 'first')
    const second = await caller(root, 'second')
    first.shell.toast(toast('a', 'first shown'))
    second.shell.toast(toast('a', 'second shown'))
    first.shell.toast(toast('b', 'first queued'))
    expect(titles(shell)).toEqual(['first shown', 'second shown'])
    await first.fiber.dispose()
    expect(titles(shell)).toEqual(['second shown'])
  })

  it('binds one take-down to a caller however many toasts it shows', async () => {
    const { root } = await startShell()
    const module = await caller(root, 'module')
    for (const id of ['a', 'b', 'c', 'a']) module.shell.toast(toast(id))
    expect(toastEffects(module.fiber)).toHaveLength(1)
  })

  it('shows nothing and does not throw for a caller already unloaded', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    await module.fiber.dispose()
    expect(() => module.shell.toast(toast('late'))).not.toThrow()
    expect(titles(shell)).toEqual([])
  })

  it('shows nothing and does not throw once the shell itself unloaded', async () => {
    const { root, shell, host } = await startShell()
    const module = await caller(root, 'module')
    await host.dispose()
    expect(() => module.shell.toast(toast('late'))).not.toThrow()
    expect(titles(shell)).toEqual([])
  })

  it('drops the toast when the shell gives no place to show it', async () => {
    class Bare extends ShellService {
      readonly login = undefined as never
      readonly scope = undefined as never
      navigate(): void {}
      attached(): null {
        return null
      }
      arranged(): null {
        return null
      }
      protected place(): () => void {
        return () => undefined
      }
    }
    const root = new Context()
    await root.plugin(Bare)
    const module = await caller(root, 'module')
    expect(() => module.shell.toast(toast('a'))).not.toThrow()
    expect(toastEffects(module.fiber)).toHaveLength(0)
  })
})
