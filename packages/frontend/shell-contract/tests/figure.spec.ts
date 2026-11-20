import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { FigureReport } from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { startShell, type ReferenceShell } from './reference-shell.ts'

/** `owner` is the caller's own fiber, the key the shell holds its report under. */
async function caller(root: Context, name: string) {
  let held: ShellService | undefined
  let owner: object | undefined
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply(ctx: Context) {
      held = ctx.shell
      owner = ctx.fiber
    },
  })
  await fiber
  return { fiber, owner: owner!, shell: held! }
}

const seen = (shell: ReferenceShell, foreground?: object) =>
  shell.figureStore.merged({ foreground, pages: ['decisions'] })

const figureEffects = (fiber: Fiber) =>
  fiber.getEffects().filter(effect => effect.label === 'shell.figure')

describe('ShellService.figure', () => {
  it('holds what a module reports and gives nothing back', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    const report: FigureReport = {
      doing: 'thinking',
      moment: { kind: 'received', serial: 1 },
      subject: '会话「周报」',
      waiting: 2,
      waitingPage: 'decisions',
    }
    const result: unknown = module.shell.figure(report)
    expect(result).toBeUndefined()
    expect(seen(shell, module.owner)).toEqual(report)
  })

  it('replaces the report a module gave before', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    module.shell.figure({ doing: 'thinking', waiting: 3 })
    module.shell.figure({ doing: 'writing' })
    expect(seen(shell, module.owner)).toEqual({ doing: 'writing', waiting: 0 })
  })

  it('takes back what a module reported when it unloads, and leaves the others', async () => {
    const { root, shell } = await startShell()
    const first = await caller(root, 'first')
    const second = await caller(root, 'second')
    first.shell.figure({ doing: 'writing', waiting: 2 })
    second.shell.figure({ doing: 'idle', waiting: 1 })
    expect(seen(shell)).toEqual({ doing: 'background', waiting: 3 })
    await first.fiber.dispose()
    expect(seen(shell)).toEqual({ doing: 'idle', waiting: 1 })
  })

  it('binds one take-down to a caller however many reports it gives', async () => {
    const { root } = await startShell()
    const module = await caller(root, 'module')
    for (const doing of ['thinking', 'looking', 'writing', 'idle'] as const)
      module.shell.figure({ doing })
    expect(figureEffects(module.fiber)).toHaveLength(1)
  })

  it('drops the report of a caller already unloaded, without throwing', async () => {
    const { root, shell } = await startShell()
    const module = await caller(root, 'module')
    await module.fiber.dispose()
    expect(() => module.shell.figure({ doing: 'thinking', waiting: 1 })).not.toThrow()
    expect(seen(shell)).toEqual({ doing: 'idle', waiting: 0 })
  })

  it('drops the report once the shell itself unloaded, without throwing', async () => {
    const { root, shell, host } = await startShell()
    const module = await caller(root, 'module')
    await host.dispose()
    expect(() => module.shell.figure({ doing: 'thinking', waiting: 1 })).not.toThrow()
    expect(seen(shell)).toEqual({ doing: 'idle', waiting: 0 })
  })

  it('drops the report when the shell holds no figure', async () => {
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
    expect(() => module.shell.figure({ doing: 'thinking' })).not.toThrow()
    expect(figureEffects(module.fiber)).toHaveLength(0)
  })
})
