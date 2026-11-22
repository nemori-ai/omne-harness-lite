import { type Context, Service } from '@deepseek-ai/cordis'
import { FIBER_STATE } from './basis-support.ts'

const NAMES = Object.fromEntries(Object.entries(FIBER_STATE).map(([name, value]) => [value, name]))

const nameOf = (state: number): string => NAMES[state] ?? String(state)

/** A service that logs every fiber state change and every effect placed through it, in order. */
export class StatusProbe extends Service {
  readonly log: string[] = []
  constructor(ctx: Context) {
    super(ctx, 'statusProbe')
    ctx.on('internal/status', (fiber, old) => {
      this.log.push(`status ${fiber.name} ${nameOf(old)}->${nameOf(fiber.state as number)}`)
    })
  }
  place(tag: string) {
    const fiber = this.ctx.fiber
    return fiber.effect(() => {
      this.log.push(`place ${tag}`)
      return () => void this.log.push(`take ${tag}`)
    }, 'statusProbe.place')
  }
}

export const probeOf = (ctx: Context): StatusProbe => ctx.get('statusProbe') as StatusProbe

export const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
