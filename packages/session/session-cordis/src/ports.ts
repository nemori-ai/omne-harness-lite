import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type { Current, SessionDependencies } from '@omne-harness/session'
import type { Reply } from '@omne-harness/session-contract'
import { describe, type Diagnose } from './diagnostics.ts'

type CheckedKey =
  | 'sessionIdentity'
  | 'sessionEvidence'
  | 'sessionIdleInput'
  | 'sessionContextInput'
  | 'sessionClock'

export type CurrentPorts = Pick<
  SessionDependencies<unknown>,
  | 'identity'
  | 'evidence'
  | 'clock'
  | 'idle'
  | 'context'
  | 'directory'
  | 'agentDrive'
  | 'scopeRelease'
  | 'callControl'
>

// Use the Context captured at load: in a service method this.ctx is the caller's Context and sees the caller's isolate.
export function createPorts(ctx: Context, diagnose: Diagnose): CurrentPorts {
  const through = async <K extends CheckedKey, T>(
    key: K,
    call: (service: NonNullable<Context[K]>) => Reply<T>,
  ): Reply<T> => {
    const service = ctx.get(key)
    if (service === undefined)
      return fail({ kind: 'unavailable', owner: key, diagnostic: `${key} is absent` })
    try {
      return await call(service)
    } catch (error) {
      const diagnostic = `${key} threw: ${describe(error)}`
      diagnose(diagnostic)
      return fail({ kind: 'unavailable', owner: key, diagnostic })
    }
  }

  const current = <
    K extends
      | 'sessionTransactions'
      | 'sessionAgentDrive'
      | 'sessionScopeRelease'
      | 'sessionCallControl',
  >(
    key: K,
  ): Current<NonNullable<Context[K]>> => ({ current: () => ctx.get(key) ?? null })

  return {
    identity: {
      prepare: (access, command) => through('sessionIdentity', s => s.prepare(access, command)),
    },
    evidence: {
      prepare: (command, access) => through('sessionEvidence', s => s.prepare(command, access)),
    },
    idle: {
      inspect: input => through('sessionIdleInput', s => s.inspect(input)),
      prepare: (access, command) => through('sessionIdleInput', s => s.prepare(access, command)),
    },
    context: {
      prepare: (access, command) => through('sessionContextInput', s => s.prepare(access, command)),
    },
    clock: {
      sample: () => through('sessionClock', s => s.sample()),
      waitUntil: async (instant, signal) => {
        const clock = ctx.get('sessionClock')
        if (clock === undefined) throw new Error('sessionClock is absent')
        return clock.waitUntil(instant, signal)
      },
    },
    directory: current('sessionTransactions'),
    agentDrive: current('sessionAgentDrive'),
    scopeRelease: current('sessionScopeRelease'),
    callControl: current('sessionCallControl'),
  }
}
