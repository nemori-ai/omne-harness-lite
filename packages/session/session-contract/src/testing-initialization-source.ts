import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionFailure, Reply } from './faces.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import { canonicalText } from './operations.ts'
import { canonicalInitializationValue, creationInput, tenantText } from './initialization-plan.ts'

export type InitializationCommand = Extract<
  SessionCommand,
  { kind: 'create' | 'completeInitialization' }
>

export interface MemoryInitializationSource {
  readonly durability: 'none'
  prepare(command: InitializationCommand): Reply<readonly GuardCommand[]>
  verify(command: InitializationCommand, guards: readonly GuardCommand[]): SessionFailure | null
  readonly controls: Readonly<{
    /** Explicit fixture source facts; prepare never derives an adoption from a candidate. */
    register(command: InitializationCommand, guard: GuardCommand): void
    eligible(value: boolean): void
    available(value: boolean): void
  }>
}

function binding(command: InitializationCommand): string {
  return canonicalText(
    canonicalInitializationValue({
      kind: command.kind,
      input: {
        ...command.input,
        tenant: tenantText(command.input.tenant),
        ...(command.kind === 'create' ? { creation: creationInput(command.input.creation) } : {}),
      },
    }),
  )
}

/** An isolated test source. Its issued object identity is the in-process credential. */
export function createMemoryInitializationSource(): MemoryInitializationSource {
  const records = new Map<string, GuardCommand>()
  const issued = new WeakMap<GuardCommand, Readonly<{ binding: string; content: string }>>()
  let eligible = true
  let available = true
  const failure = (command: InitializationCommand): SessionFailure | null =>
    !eligible
      ? { kind: 'denied', action: command.kind }
      : !available
        ? {
            kind: 'unavailable',
            owner: 'session-initialization',
            diagnostic: 'the registered test source is unavailable',
          }
        : null
  return {
    durability: 'none',
    async prepare(command) {
      const refused = failure(command)
      if (refused !== null) return fail(refused)
      const key = binding(command)
      const original = records.get(key)
      if (original === undefined)
        return fail({
          kind: 'invalid',
          field: 'initialization',
          reason: 'no registered initialization source facts',
        })
      const guard = structuredClone(original)
      issued.set(guard, { binding: key, content: canonicalText(guard) })
      return succeed([guard])
    },
    verify(command, guards) {
      const refused = failure(command)
      if (refused !== null) return refused
      const materials = guards.filter(guard => guard.owner === 'session-initialization')
      if (materials.length !== 1)
        return {
          kind: 'invalid',
          field: 'guards',
          reason: 'one initialization source guard is required',
        }
      const guard = materials[0]
      if (guard === undefined)
        return { kind: 'invalid', field: 'guards', reason: 'initialization guard is missing' }
      const credential = issued.get(guard)
      const key = binding(command)
      if (
        credential === undefined ||
        credential.binding !== key ||
        credential.content !== canonicalText(guard) ||
        credential.content !== canonicalText(records.get(key))
      )
        return {
          kind: 'invalid',
          field: 'guards',
          reason: 'initialization guard is not currently issued by this source',
        }
      return null
    },
    controls: {
      register(command, guard) {
        records.set(binding(command), structuredClone(guard))
      },
      eligible(value) {
        eligible = value
      },
      available(value) {
        available = value
      },
    },
  }
}
