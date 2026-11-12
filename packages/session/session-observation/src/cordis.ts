// The Cordis binding of session observation: the Service `sessionObservation` and the plugin that
// answers its ports from the tree. The plugin injects `session` as the `reader` caller class and
// the two public Model stream faces. It holds one listener of `session-cordis-contract/committed`
// for the whole tree and hands each batch to the observations of that tenant and session.
import { Service, type Context } from '@deepseek-ai/cordis'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  modelStreamObservationKey,
  modelStreamReferencesKey,
} from '@omne-harness/model-cordis-contract/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionObservation, type SessionObservation } from './observation.ts'
import {
  DEFAULT_LOCATE_PAGES,
  DEFAULT_OBSERVATION_REFRESH_POLICY,
  type ObservationRefreshPolicy,
  type SessionObservationPorts,
} from './ports.ts'

/** @owner packages/session/session-observation */
export abstract class SessionObservationService<P>
  extends Service
  implements SessionObservation<P>
{
  static readonly provide = 'sessionObservation'

  constructor(ctx: Context) {
    super(ctx, SessionObservationService.provide)
  }

  abstract readonly open: SessionObservation<P>['open']
}
export const sessionObservationKey = SessionObservationService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionObservation?: SessionObservationService<unknown>
  }
}

export type SessionObservationPluginInput = Readonly<{
  /** The entry kinds that reading history gives in this assembly. */
  historyKinds: readonly string[]
  policy?: ObservationRefreshPolicy
  locatePages?: number
}>

type Listener = Readonly<{
  tenant: TenantId
  session: SessionId
  onCommit: (kinds: readonly string[]) => void
}>

function wait(milliseconds: number, signal: AbortSignal): Promise<'elapsed' | 'cancelled'> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve('cancelled')
    const cancel = (): void => {
      clearTimeout(timer)
      resolve('cancelled')
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve('elapsed')
    }, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

class SessionObservationProvider<P> extends SessionObservationService<P> {
  readonly open: SessionObservation<P>['open']

  constructor(ctx: Context, input: SessionObservationPluginInput) {
    super(ctx)
    const listeners = new Set<Listener>()
    ctx.on('session-cordis-contract/committed', (tenant, session, _revision, _source, kinds) => {
      for (const listener of listeners)
        if (listener.session === session && tenantEquals(listener.tenant, tenant))
          listener.onCommit(kinds)
    })
    const logger = ctx.logger('session-observation')
    const ports: SessionObservationPorts<P> = {
      history: ctx[sessionKey].history as SessionObservationPorts<P>['history'],
      streams: ctx[modelStreamReferencesKey] as unknown as SessionObservationPorts<P>['streams'],
      observer: ctx[modelStreamObservationKey] as unknown as SessionObservationPorts<P>['observer'],
      notices: (target, onCommit) => {
        const listener = { ...target, onCommit }
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      wait,
      policy: input.policy ?? DEFAULT_OBSERVATION_REFRESH_POLICY,
      locatePages: input.locatePages ?? DEFAULT_LOCATE_PAGES,
      historyKinds: input.historyKinds,
      diagnose: diagnostic => {
        logger.warn(`${diagnostic.code}: ${diagnostic.detail}`)
      },
    }
    this.open = createSessionObservation(ports).open
  }
}

/** The plugin of the row that publishes `sessionObservation`. */
export function createSessionObservationPlugin<P>(input: SessionObservationPluginInput) {
  return {
    name: 'session-observation',
    inject: {
      [sessionKey]: { caller: 'reader' as const },
      [modelStreamReferencesKey]: null,
      [modelStreamObservationKey]: null,
    },
    apply(ctx: Context) {
      new SessionObservationProvider<P>(ctx, input)
    },
  }
}
