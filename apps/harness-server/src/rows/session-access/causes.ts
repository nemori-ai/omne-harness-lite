import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  RunFailureCause,
  RunFailureCauses,
  RunFailureFault,
  RunFailureReading,
} from '@omne-harness/session-access'
import type { SessionHistory } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'

export type TerminalReader = Pick<SessionHistory<unknown>, 'begin' | 'next'>

const PAGE_BYTES = 65536

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function textAt(value: JsonValue | undefined, ...path: readonly string[]): string | undefined {
  const found = path.reduce<JsonValue | undefined>(member, value)
  return found?.kind === 'string' ? found.value : undefined
}

const DIAGNOSED: ReadonlySet<string> = new Set(['no-reply', 'node-failed'])

function faultOf(kind: string, failure: JsonValue): RunFailureFault | null {
  const cause = textAt(failure, 'cause')
  if (kind !== 'no-reply' || cause === undefined || cause === '') return null
  const throttled = member(failure, 'throttled')
  return {
    cause,
    upstreamStatus: textAt(failure, 'upstreamStatus') ?? null,
    throttled: throttled?.kind === 'boolean' && throttled.value,
  }
}

export function failureCauseOf(failure: JsonValue): RunFailureCause | null {
  const kind = textAt(failure, 'kind')
  if (kind === undefined || kind === '') return null
  const detail = DIAGNOSED.has(kind) ? (textAt(failure, 'diagnostic') ?? '') : ''
  return { kind, detail: detail === '' ? null : detail, fault: faultOf(kind, failure) }
}

function readingOf(payload: JsonValue): RunFailureReading {
  const failure = member(member(payload, 'end'), 'failure')
  if (failure === undefined || failure.kind === 'null') return { kind: 'none' }
  const cause = failureCauseOf(failure)
  return cause === null ? { kind: 'none' } : { kind: 'cause', cause }
}

export function runFailureCausesOf(
  history: TerminalReader | undefined,
): RunFailureCauses | undefined {
  if (history === undefined) return undefined
  return {
    async read({ principal, tenant, session, run }): Promise<RunFailureReading> {
      const access = { principal, tenant, session }
      let page = await history.begin({
        ...access,
        kinds: ['run.terminal'],
        from: null,
        direction: 'backward',
        pageBytes: PAGE_BYTES,
      })
      for (;;) {
        if ('failure' in page) return { kind: 'unavailable' }
        const found = page.ok.entries.find(
          entry =>
            entry.kind === 'run.terminal' && textAt(entry.payload, 'terminal', 'run') === run,
        )
        if (found !== undefined) return readingOf(found.payload)
        if (page.ok.next === null) return { kind: 'none' }
        page = await history.next({ ...access, cursor: page.ok.next })
      }
    },
  }
}

export function runFailureCauses(ctx: Context): RunFailureCauses | undefined {
  const reader = ctx.intercept(sessionKey, { caller: 'reader' }).get(sessionKey)
  return runFailureCausesOf(reader?.history)
}
