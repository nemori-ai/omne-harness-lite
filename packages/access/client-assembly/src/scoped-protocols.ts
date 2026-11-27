import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  accessProtocol,
  guestContractOfTree,
  type ProtocolContract,
} from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { keyText, type Backoff } from './availability.ts'
import type { LoginState } from './cordis.ts'
import { guarded } from './guarded.ts'
import { servedEntry } from './protocols-point.ts'
import {
  placedDiff,
  SCOPED_OFF,
  stepScoped,
  type ScopedEffect,
  type ScopedEvent,
  type ScopedProtocol,
} from './scoped.ts'

type Sleep = (ms: number, signal: AbortSignal) => Promise<void>
type Made = Readonly<{ contract: ProtocolContract; data: string }>
type Put = Readonly<{ data: string; revoke: AbortController; take: () => unknown }>

const ACCESS = { name: 'access', major: 1 } as const

/** What a read told, by key: a contract the client cannot make is not put. */
function madeOf(protocols: readonly ScopedProtocol[]): ReadonlyMap<string, Made> {
  const made = new Map<string, Made>()
  for (const each of protocols) {
    const read = guestContractOfTree(each.contract)
    if ('ok' in read)
      made.set(keyText(read.ok.contract), {
        contract: read.ok.contract,
        data: JSON.stringify(read.ok.data),
      })
  }
  return made
}

/** Puts the protocols of the tenant the login acts for on `connection.protocols`, at the layer of the whole deployment: this tree serves one login at a time. */
export function scopedProtocolsPlugin(backoff: Backoff, sleep: Sleep): Plugin.Object {
  return {
    name: 'connection-scoped',
    inject: ['dynamis', 'connection'],
    apply(ctx: Context) {
      const { connection } = ctx
      const tree = ctx.get('dynamis') as DynamisService
      const access = createClient(accessProtocol, connection.transport, {
        peerRevision: () => connection.availability.peerRevision(ACCESS),
      })
      const placed = new Map<string, Put>()
      let state = SCOPED_OFF
      let reading: AbortController | undefined
      let ended = false

      function put({ contract, data }: Made): Put {
        const revoke = new AbortController()
        const { readRetry } = connection
        const made = createClient(contract, connection.transport, readRetry && { readRetry })
        const client = guarded(contract, made, revoke.signal)
        return { data, revoke, take: tree.put([servedEntry(contract, client, undefined)]) }
      }

      async function take(key: string): Promise<void> {
        const one = placed.get(key)
        if (one === undefined) return
        placed.delete(key)
        one.revoke.abort()
        await one.take()
      }

      function place(protocols: readonly ScopedProtocol[]): void {
        const made = madeOf(protocols)
        const dataOf = (each: Readonly<{ data: string }>) => each.data
        const diff = placedDiff(mapValues(placed, dataOf), mapValues(made, dataOf))
        for (const key of diff.take) void take(key)
        for (const key of diff.put) placed.set(key, put(made.get(key)!))
      }

      async function read(failures: number): Promise<void> {
        reading?.abort()
        const mine = new AbortController()
        reading = mine
        if (failures > 0) await sleep(backoff.delayMs(failures - 1), mine.signal)
        if (mine.signal.aborted) return
        const event = await access.scoped({}, { signal: mine.signal }).then(
          (answer): ScopedEvent =>
            answer.outcome === 'succeeded'
              ? { kind: 'read', protocols: answer.body.protocols }
              : { kind: 'unreadable' },
          (): ScopedEvent => ({ kind: 'unreadable' }),
        )
        if (reading !== mine || mine.signal.aborted) return
        reading = undefined
        dispatch(event)
      }

      function run(effect: ScopedEffect): void {
        if (effect.kind === 'place') return place(effect.protocols)
        if (effect.kind === 'read') return void read(effect.failures)
        reading?.abort()
        reading = undefined
        for (const key of placed.keys()) void take(key)
      }

      function dispatch(event: ScopedEvent): void {
        if (ended) return
        const step = stepScoped(state, event)
        state = step.state
        for (const effect of step.effects) run(effect)
      }

      const told = (now: LoginState): ScopedEvent =>
        now !== 'signed-in'
          ? { kind: 'signed-out' }
          : { kind: state.kind === 'off' ? 'signed-in' : 'switched' }

      ctx.effect(() => {
        let seen = connection.availability.scopedChanges()
        const unfollow = connection.availability.subscribe(() => {
          const now = connection.availability.scopedChanges()
          if (now === seen) return
          seen = now
          dispatch({ kind: 'scoped-changed' })
        })
        const unlogin = connection.login.subscribe(now => dispatch(told(now)))
        if (connection.login.state() === 'signed-in') dispatch({ kind: 'signed-in' })
        return async () => {
          ended = true
          unfollow()
          unlogin()
          reading?.abort()
          await Promise.all([...placed.keys()].map(take))
        }
      }, 'connection-scoped')
    },
  }
}

const mapValues = <V, W>(map: ReadonlyMap<string, V>, of: (value: V) => W): Map<string, W> =>
  new Map([...map].map(([key, value]) => [key, of(value)]))
