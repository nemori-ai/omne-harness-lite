import type {
  AccessContribution,
  AnswerOf,
  EndOf,
  FrameOf,
  FrameSource,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Asker, CommandCatalog, CommandEntry } from '@omne-harness/slash-command-contract'
import type { SlashCommandEntry, SlashCommandProtocol } from '@omne-harness/slash-command-protocol'

export type Admission =
  | Readonly<{ asker: Asker<Principal> }>
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

/** What the row hands over: who may read this session's list, the list itself, and a hint that it may have changed. */
export type SlashCommandAccessPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admission>
  catalog(): CommandCatalog<Principal> | undefined
  watch(asker: Asker<Principal>, changed: () => void): (() => void) | undefined
}>

type Read = SlashCommandProtocol['operations']['read-catalog']
type Observe = SlashCommandProtocol['observations']['observe-catalog']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const CHANGED: FrameOf<Observe> = Object.freeze({ kind: 'changed' })

/** Only the public half leaves the server: where an entry is handed over from stays here. */
export function publicHalf(entry: CommandEntry): SlashCommandEntry {
  return {
    full: `${entry.space}:${entry.name}`,
    space: entry.space,
    name: entry.name,
    kind: entry.kind,
    title: entry.title,
    ...(entry.hint === undefined ? {} : { hint: entry.hint }),
    ...(entry.params === undefined ? {} : { params: entry.params }),
    ...(entry.unavailable === undefined ? {} : { unavailable: entry.unavailable }),
    ...(entry.whileRunning === undefined ? {} : { whileRunning: entry.whileRunning }),
    ...(entry.takesEffect === undefined ? {} : { takesEffect: entry.takesEffect }),
  }
}

async function admitted(
  ports: SlashCommandAccessPorts,
  login: LoginIdentity,
  tenant: TenantId,
  session: string,
): Promise<Admission> {
  try {
    return await ports.admit(login, tenant, session)
  } catch {
    return UNAVAILABLE
  }
}

async function readCatalog(
  ports: SlashCommandAccessPorts,
  login: LoginIdentity,
  tenant: TenantId,
  session: string,
): Promise<AnswerOf<Read>> {
  const admission = await admitted(ports, login, tenant, session)
  if ('outcome' in admission) return admission
  const catalog = ports.catalog()
  if (catalog === undefined) return UNAVAILABLE
  try {
    const read = await catalog.read(admission.asker)
    return {
      outcome: 'succeeded',
      body: { entries: read.catalog.entries.map(publicHalf), missing: [...read.catalog.missing] },
    }
  } catch {
    return UNAVAILABLE
  }
}

function observeCatalog(ports: SlashCommandAccessPorts): FrameSource<Observe> {
  return async (context, open) => {
    const admission = await admitted(ports, context.principal, open.tenant, open.session)
    if ('outcome' in admission) return admission
    const state = { pending: true }
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let stop: (() => void) | undefined
    try {
      stop = ports.watch(admission.asker, () => {
        state.pending = true
        rouse()
      })
    } catch {
      stop = undefined
    }
    if (stop === undefined) return UNAVAILABLE
    const { signal } = context
    const release = (): void => {
      signal.removeEventListener('abort', rouse)
      stop?.()
    }
    signal.addEventListener('abort', rouse, { once: true })
    async function* frames(): AsyncGenerator<FrameOf<Observe>, EndOf<Observe>> {
      try {
        for (;;) {
          if (signal.aborted) return 'unavailable'
          if (!state.pending) {
            await new Promise<void>(resolve => {
              wake = resolve
            })
            continue
          }
          state.pending = false
          const again = await admitted(ports, context.principal, open.tenant, open.session)
          if ('outcome' in again) return again.outcome === 'denied' ? 'denied' : 'unavailable'
          yield CHANGED
        }
      } finally {
        release()
      }
    }
    return { outcome: 'succeeded', frames: frames() }
  }
}

export function createSlashCommandContribution(
  ports: SlashCommandAccessPorts,
): Omit<AccessContribution<SlashCommandProtocol>, 'protocol'> {
  return {
    operations: {
      'read-catalog': (call, body) => readCatalog(ports, call.principal, body.tenant, body.session),
    },
    observations: { 'observe-catalog': observeCatalog(ports) },
  }
}
