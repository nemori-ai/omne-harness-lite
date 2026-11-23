import { defaultBackoff, type Backoff } from '@omne-harness/client-assembly'
import {
  readManifest,
  wantedOf,
  type Offered,
  type PluginProtocol,
} from '@omne-harness/plugin-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { Listed } from './loader.ts'

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>

export type FollowDeps = Readonly<{
  client: ClientOf<PluginProtocol>
  tenant: TenantId
  /** Called with each list that was read. A list that could not be read is not an empty one: nothing is called. */
  onList: (list: readonly Listed[]) => void
  backoff?: Backoff
  sleep?: Sleep
}>

type Given = Readonly<{
  name: string
  version: string
  manifest: string
  files: Offered['files']
}>

const SIDE = 'client'

const timerSleep: Sleep = (ms, signal) =>
  new Promise(resolve => {
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })

/** What this side is to load of what the source gave; what cannot be read is listed with why. */
export function listedOf(plugins: readonly Given[]): readonly Listed[] {
  const offered: Offered[] = []
  const faulty = new Map<string, Listed>()
  for (const { name, version, manifest, files } of plugins) {
    const read = readManifest(manifest)
    const fault =
      read.kind === 'refused'
        ? `its manifest cannot be read: ${read.reason}`
        : `its manifest names ${read.manifest.name}, the list names ${name}`
    if (read.kind === 'read' && read.manifest.name === name)
      offered.push({ version, manifest: read.manifest, files })
    else faulty.set(name, { name, version, members: [], fault })
  }
  const sound = wantedOf(offered, SIDE)
    .filter(({ name }) => !faulty.has(name))
    .map(({ name, version, members }) => ({ name, version, members }))
  return [...faulty.values(), ...sound]
}

/** Reads what the tenant is to load each time the source says it may have changed; answers how to stop. */
export function followWanted(deps: FollowDeps): () => Promise<void> {
  const { client, tenant, onList } = deps
  const backoff = deps.backoff ?? defaultBackoff
  const sleep = deps.sleep ?? timerSleep
  const stopped = new AbortController()

  async function read(): Promise<boolean> {
    const answer = await client['list-wanted']({ tenant, side: SIDE }, { signal: stopped.signal })
    if (answer.outcome !== 'succeeded' || stopped.signal.aborted) return false
    onList(listedOf(answer.body.plugins))
    return true
  }

  /** One observation: the source sends a frame on opening and one per change, and each is read. Answers whether a read came through. */
  async function round(): Promise<boolean> {
    const open = new AbortController()
    const signal = AbortSignal.any([stopped.signal, open.signal])
    const frames = client.observe['observe-wanted']({ tenant, side: SIDE }, { signal })
    let alive = false
    try {
      for (;;) {
        const next = await frames.next()
        if (next.done === true || !(await read())) break
        alive = true
      }
    } finally {
      open.abort()
      await frames.return({ kind: 'aborted' })
    }
    return alive
  }

  async function run(): Promise<void> {
    let attempt = 0
    while (!stopped.signal.aborted) {
      const alive = await round().catch(() => false)
      if (stopped.signal.aborted) return
      attempt = alive ? 0 : attempt + 1
      await sleep(backoff.delayMs(Math.max(attempt - 1, 0)), stopped.signal)
    }
  }

  const running = run()
  return async () => {
    stopped.abort()
    await running
  }
}
