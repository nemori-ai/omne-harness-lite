import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionAccess } from './identity.ts'
import type { ClockSample } from './values.ts'
import type {
  GuardCommand,
  SessionClock,
  SessionContextInput,
  SessionEvidenceBridge,
  SessionIdentityBridge,
  SessionCommand,
} from './ports.ts'
import { adoption, guard, mintEvidence } from './testing-values.ts'
import type { MemoryInitializationSource } from './testing-initialization-source.ts'

export type IdentityScript = 'allow' | 'deny' | 'unavailable'

export interface ScriptedSessionIdentityBridge<P> extends SessionIdentityBridge<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    script(next: IdentityScript): void
    asked(): readonly SessionCommand[]
  }>
}

export function createScriptedSessionIdentityBridge<P>(
  initial: IdentityScript = 'allow',
): ScriptedSessionIdentityBridge<P> {
  let script = initial
  const asked: SessionCommand[] = []
  return Object.freeze({
    durability: 'none' as const,
    prepare: (input: SessionAccess<P>, command: SessionCommand) => {
      asked.push(command)
      switch (script) {
        case 'deny':
          return Promise.resolve(fail({ kind: 'denied' as const, action: command.kind }))
        case 'unavailable':
          return Promise.resolve(
            fail({
              kind: 'unavailable' as const,
              owner: 'identity',
              diagnostic: 'the identity source is scripted down',
            }),
          )
        case 'allow':
          return Promise.resolve(
            succeed(
              guard('identity-bridge', 'identity', {
                tenant: input.tenant,
                session: input.session,
                command,
              }),
            ),
          )
      }
    },
    controls: Object.freeze({
      script: (next: IdentityScript) => {
        script = next
      },
      asked: () => [...asked],
    }),
  })
}

export interface MemorySessionEvidenceBridge extends SessionEvidenceBridge {
  readonly durability: 'none'
  readonly controls: Readonly<{
    unavailable(down: boolean): void
  }>
}

export function createMemorySessionEvidenceBridge(
  options: Readonly<{ initialization?: MemoryInitializationSource }> = {},
): MemorySessionEvidenceBridge {
  let down = false
  return Object.freeze({
    durability: 'none' as const,
    prepare: (command: SessionCommand) => {
      if (down)
        return Promise.resolve(
          fail({
            kind: 'unavailable' as const,
            owner: 'evidence',
            diagnostic: 'the evidence source is scripted down',
          }),
        )
      if (command.kind === 'create' || command.kind === 'completeInitialization')
        return (
          options.initialization?.prepare(command) ??
          Promise.resolve(
            fail({
              kind: 'invalid' as const,
              field: 'initialization',
              reason: 'no trusted initialization source was configured',
            }),
          )
        )
      const materials: GuardCommand[] = [
        guard('evidence-bridge', 'evidence', {
          kind: command.kind,
          operation: command.input.operation,
        }),
      ]
      return Promise.resolve(succeed<readonly GuardCommand[]>(materials))
    },
    controls: Object.freeze({
      unavailable: (next: boolean) => {
        down = next
      },
    }),
  })
}

export interface MemorySessionContextInput<P> extends SessionContextInput<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{ unavailable(down: boolean): void }>
}

export function createMemorySessionContextInput<P>(): MemorySessionContextInput<P> {
  let down = false
  return Object.freeze({
    durability: 'none' as const,
    prepare: (
      input: SessionAccess<P>,
      command: Extract<SessionCommand, { kind: 'create' | 'change' | 'startRun' | 'reload' }>,
    ) =>
      Promise.resolve(
        down
          ? fail({
              kind: 'unavailable' as const,
              owner: 'runtime-context',
              diagnostic: 'the Context input is scripted down',
            })
          : succeed<readonly GuardCommand[]>([
              guard('context-input', 'runtime-context', {
                session: input.session,
                kind: command.kind,
                operation: command.input.operation,
              }),
            ]),
      ),
    controls: Object.freeze({
      unavailable: (next: boolean) => {
        down = next
      },
    }),
  })
}

export interface MemorySessionClock extends SessionClock {
  readonly durability: 'none'
  readonly controls: Readonly<{
    advance(milliseconds: number): void
    instantAfter(milliseconds: number): string
    unavailable(down: boolean): void
  }>
}

const ORIGIN = Date.parse('2026-01-01T00:00:00.000Z')

type Waiter = { readonly at: number; resolve(answer: 'elapsed'): void }

export function createMemorySessionClock(): MemorySessionClock {
  let now = 0
  let minted = 0
  let down = false
  const waiters = new Set<Waiter>()
  const instant = (offset: number): string => new Date(ORIGIN + offset).toISOString()
  return Object.freeze({
    durability: 'none' as const,
    sample: () => {
      if (down)
        return Promise.resolve(
          fail({
            kind: 'unavailable' as const,
            owner: 'clock',
            diagnostic: 'the clock is scripted down',
          }),
        )
      minted += 1
      const sample: ClockSample = {
        at: instant(now),
        protocol: adoption('memory-clock'),
        source: mintEvidence(`clock/sample/${minted}`, { at: now, minted }),
      }
      return Promise.resolve(succeed(sample))
    },
    waitUntil: (at: string, signal: AbortSignal) => {
      const target = Date.parse(at) - ORIGIN
      if (signal.aborted) return Promise.resolve('cancelled' as const)
      if (now >= target) return Promise.resolve('elapsed' as const)
      return new Promise<'elapsed' | 'cancelled'>(resolve => {
        const waiter: Waiter = {
          at: target,
          resolve: answer => {
            signal.removeEventListener('abort', onAbort)
            resolve(answer)
          },
        }
        const onAbort = (): void => {
          waiters.delete(waiter)
          resolve('cancelled')
        }
        waiters.add(waiter)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },
    controls: Object.freeze({
      advance: (milliseconds: number) => {
        now += milliseconds
        for (const waiter of waiters)
          if (now >= waiter.at) {
            waiters.delete(waiter)
            waiter.resolve('elapsed')
          }
      },
      instantAfter: (milliseconds: number) => instant(now + milliseconds),
      unavailable: (next: boolean) => {
        down = next
      },
    }),
  })
}
