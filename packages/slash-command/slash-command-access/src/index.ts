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
import type {
  Asker,
  Candidate,
  CommandCatalog,
  CommandEntry,
} from '@omne-harness/slash-command-contract'
import type {
  SlashCommandCandidate,
  SlashCommandEntry,
  SlashCommandProtocol,
} from '@omne-harness/slash-command-protocol'

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
type ReadCandidates = SlashCommandProtocol['operations']['read-candidates']
type Observe = SlashCommandProtocol['observations']['observe-catalog']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const MAX_CANDIDATES = 512
const NOT_FOUND = Object.freeze({ outcome: 'not-found' as const, body: {} })
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

function publicCandidate(candidate: Candidate): SlashCommandCandidate {
  return {
    value: candidate.value,
    ...(candidate.title === undefined ? {} : { title: candidate.title }),
    ...(candidate.current === undefined ? {} : { current: candidate.current }),
    ...(candidate.unavailable === undefined ? {} : { unavailable: candidate.unavailable }),
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

/** The candidates of one argument, worked out now for the one who asks; none to be had is not an empty list. */
async function readCandidates(
  ports: SlashCommandAccessPorts,
  login: LoginIdentity,
  body: Readonly<{ tenant: TenantId; session: string; command: string; param: number }>,
): Promise<AnswerOf<ReadCandidates>> {
  const admission = await admitted(ports, login, body.tenant, body.session)
  if ('outcome' in admission) return admission
  const catalog = ports.catalog()
  if (catalog === undefined) return UNAVAILABLE
  try {
    const read = await catalog.candidates(admission.asker, body.command, body.param)
    if ('ok' in read)
      return {
        outcome: 'succeeded',
        body: { candidates: read.ok.slice(0, MAX_CANDIDATES).map(publicCandidate) },
      }
    return read.failure === 'not-listed' ? NOT_FOUND : UNAVAILABLE
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
      'read-candidates': (call, body) => readCandidates(ports, call.principal, body),
    },
    observations: { 'observe-catalog': observeCatalog(ports) },
  }
}
