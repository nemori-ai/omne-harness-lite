/** Thrown by every port call once the process counts as dead. */
export class ProcessCrashed extends Error {
  constructor() {
    super('the process crashed')
    this.name = 'ProcessCrashed'
  }
}

export type CrashPoint = Readonly<{ method: string; when: 'before' | 'after'; nth?: number }>

/** The death of the process: from the point named on, wrapped ports throw; what they wrote stays. */
export function createCrashSwitch() {
  let point: CrashPoint | null = null
  let seen = 0
  let dead = false
  const hit = (method: string): boolean => {
    if (point === null || point.method !== method) return false
    seen += 1
    return seen === (point.nth ?? 1)
  }
  return {
    at(next: CrashPoint): void {
      point = next
      seen = 0
    },
    restart(): void {
      point = null
      dead = false
    },
    wrap<T extends object>(port: T): T {
      return new Proxy(port, {
        get(target, name, receiver) {
          const value: unknown = Reflect.get(target, name, receiver)
          if (typeof value !== 'function' || typeof name !== 'string') return value
          return async (...args: unknown[]): Promise<unknown> => {
            if (dead) throw new ProcessCrashed()
            const here = hit(name)
            if (here && point?.when === 'before') {
              dead = true
              throw new ProcessCrashed()
            }
            const answer: unknown = await Reflect.apply(value, target, args)
            if (here) {
              dead = true
              throw new ProcessCrashed()
            }
            return answer
          }
        },
      })
    },
  }
}
