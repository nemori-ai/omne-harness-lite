import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'

/** Which representation of a block the model read in its latest request. */
export type BlockRead = 'original' | 'fitted' | 'derived' | 'transcript'
export type ReadsOfBlocks = ReadonlyMap<string, BlockRead>
export type SessionReads = Readonly<{ blocks: ReadsOfBlocks; replies: ReadonlyMap<string, string> }>

/** What the session interface needs from whoever knows the reads. It does not know who that is. */
export interface BlockReadsSource {
  readsOf(tenant: string, session: string): Promise<SessionReads | null>
}
/** Where the application assembly hands such a source to the session interface. */
export interface BlockReadsHolder {
  attach(source: BlockReadsSource): () => void
}

export const blockKey = (message: string, block: string): string => `${message}\n${block}`

type Known = Readonly<{ revision: string | null; reads: SessionReads }>

/** The reads of the blocks of each open session, read again when its log moves. */
export class BlockReads implements BlockReadsHolder {
  #source: BlockReadsSource | null = null
  #version = 0
  readonly #known = new Map<string, Known>()
  readonly #asking = new Set<string>()
  readonly #listeners = new Set<() => void>()

  attach(source: BlockReadsSource): () => void {
    this.#source = source
    this.#forget()
    return () => {
      if (this.#source !== source) return
      this.#source = null
      this.#forget()
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  version = (): number => this.#version

  readOf(tenant: string, session: string, message: string, block: string): BlockRead | undefined {
    return this.#known.get(blockKey(tenant, session))?.reads.blocks.get(blockKey(message, block))
  }

  replyOf(tenant: string, session: string, run: string): string | undefined {
    return this.#known.get(blockKey(tenant, session))?.reads.replies.get(run)
  }

  want(tenant: string, session: string, revision: string | null): void {
    const source = this.#source
    const at = blockKey(tenant, session)
    if (source === null || this.#known.get(at)?.revision === revision) return
    const asked = `${at}\n${String(revision)}`
    if (this.#asking.has(asked)) return
    this.#asking.add(asked)
    void source
      .readsOf(tenant, session)
      .then(reads => {
        if (this.#source !== source || reads === null) return
        this.#known.set(at, { revision, reads })
        this.#bump()
      })
      .finally(() => this.#asking.delete(asked))
  }

  #forget(): void {
    this.#known.clear()
    this.#bump()
  }

  #bump(): void {
    this.#version += 1
    for (const listener of this.#listeners) listener()
  }
}

type Client = Pick<ClientOf<SessionDiagnosticsProtocol>, 'read-session-diagnostics'>
type Body = Parameters<Client['read-session-diagnostics']>[0]
type Answer = Awaited<ReturnType<Client['read-session-diagnostics']>>
type Page = Extract<Answer, { outcome: 'succeeded' }>
const PAGE_BYTES = '65536'
const PAGES = 16

type Dispatch = Page['body']['runs'][number]['modelCalls'][number]['dispatches'][number]

const BASIS: Readonly<Record<string, string>> = {
  selection: '会话选择',
  preference: '缺省推理强度',
}

function replyText({ profile, effort }: Dispatch): string | null {
  if (profile === undefined || 'kind' in profile) return null
  if (effort === undefined || 'kind' in effort) return profile.name
  const said =
    effort.basis === 'provider' ? '供应商默认' : `${String(effort.value)}（${BASIS[effort.basis]}）`
  return `${profile.name} · ${said}`
}

function apply(
  reads: Map<string, BlockRead>,
  replies: Map<string, string>,
  page: Page['body'],
): void {
  const runs = [...page.runs].sort((left, right) =>
    Number(BigInt(left.started.position) - BigInt(right.started.position)),
  )
  for (const run of runs) {
    for (const call of run.modelCalls)
      for (const each of call.reads) reads.set(blockKey(each.message, each.block), each.read)
    const last = run.modelCalls.flatMap(call => call.dispatches).at(-1)
    const said = last === undefined ? null : replyText(last)
    if (said !== null) replies.set(run.run, said)
  }
}

/** The reads as the session diagnostics give them: every page, a later run standing for a block. */
export function diagnosticsReads(client: Client): BlockReadsSource {
  return {
    async readsOf(tenant, session) {
      const owner = readTenantText(tenant)
      if (owner === undefined) return null
      const reads = new Map<string, BlockRead>()
      const replies = new Map<string, string>()
      let cursor: string | null = null
      for (let page = 0; page < PAGES; page += 1) {
        const body: Body =
          cursor === null
            ? { tenant: owner, session, cursor: null, run: null, pageBytes: PAGE_BYTES }
            : { tenant: owner, session, cursor }
        const answer: Answer | null = await client['read-session-diagnostics'](body).catch(
          () => null,
        )
        if (answer?.outcome !== 'succeeded') return null
        apply(reads, replies, answer.body)
        if (answer.body.next === null) return { blocks: reads, replies }
        cursor = answer.body.next
      }
      return { blocks: reads, replies }
    },
  }
}
