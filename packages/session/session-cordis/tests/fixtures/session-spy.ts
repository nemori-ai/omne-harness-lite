import type * as Session from '@omne-harness/session'

export const spies = {
  closed: 0,
  maintainCalls: 0,
  maintained: 0,
  released: 0,
  releaseThrows: false,
  closeThrows: false,
  releaseGate: null as null | Promise<void>,
}

export function resetSpies(): void {
  Object.assign(spies, {
    closed: 0,
    maintainCalls: 0,
    maintained: 0,
    released: 0,
    releaseThrows: false,
    closeThrows: false,
    releaseGate: null,
  })
}

export function spyOnSession(actual: typeof Session): typeof Session {
  return {
    ...actual,
    createSessionInstance: (...args: Parameters<typeof actual.createSessionInstance>) => {
      const instance = actual.createSessionInstance(...args)
      return {
        ...instance,
        close: async () => {
          spies.closed += 1
          await instance.close()
          if (spies.closeThrows) throw new Error('close crashed')
        },
        maintain: async (tenant: Parameters<typeof instance.maintain>[0]) => {
          spies.maintainCalls += 1
          const started = await instance.maintain(tenant)
          if ('failure' in started) return started
          spies.maintained += 1
          return {
            ok: {
              release: async () => {
                spies.released += 1
                await spies.releaseGate
                if (spies.releaseThrows) throw new Error('release crashed')
                await started.ok.release()
              },
              ended: started.ok.ended,
            },
          }
        },
      }
    },
  }
}
