// The ports that the plugin reads at each call through its own Context (SPEC「端口接线」). A port
// that is absent or that throws makes the operation that needs it answer `unavailable` with the
// service key of the port as `owner`. Nothing here fills in a default: no system time for the
// clock, no empty material for the evidence.
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
>

/**
 * Builds the ports of the factory from `ctx`. `ctx` is the Context that the plugin captured at
 * load: in a service method `this.ctx` is the caller's Context and sees the caller's isolate, so
 * it is not used here. Nothing is kept between calls; each call reads the service table again.
 */
export function createPorts(ctx: Context, diagnose: Diagnose): CurrentPorts {
  /** One call through a port that must answer. Absence and a throw become `unavailable`. */
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

  /** A port that is read when it is needed and may be absent now. */
  const current = <K extends 'sessionTransactions' | 'sessionAgentDrive' | 'sessionScopeRelease'>(
    key: K,
  ): Current<NonNullable<Context[K]>> => ({ current: () => ctx.get(key) ?? null })

  return {
    identity: {
      prepare: (access, command) => through('sessionIdentity', s => s.prepare(access, command)),
    },
    evidence: { prepare: command => through('sessionEvidence', s => s.prepare(command)) },
    idle: {
      inspect: input => through('sessionIdleInput', s => s.inspect(input)),
      prepare: (access, command) => through('sessionIdleInput', s => s.prepare(access, command)),
    },
    context: {
      prepare: (access, command) => through('sessionContextInput', s => s.prepare(access, command)),
    },
    clock: {
      sample: () => through('sessionClock', s => s.sample()),
      // The result type has no unavailable branch: an absent clock rejects the promise, and the
      // scheduler of session treats a rejection as a refused clock (SPEC「明确缺项」).
      waitUntil: async (instant, signal) => {
        const clock = ctx.get('sessionClock')
        if (clock === undefined) throw new Error('sessionClock is absent')
        return clock.waitUntil(instant, signal)
      },
    },
    directory: current('sessionTransactions'),
    agentDrive: current('sessionAgentDrive'),
    scopeRelease: current('sessionScopeRelease'),
  }
}
