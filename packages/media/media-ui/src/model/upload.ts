import type { MediaProtocol } from '@omne-harness/media-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export type MediaClient = ClientOf<MediaProtocol>
type Answer<K extends keyof MediaClient> = MediaClient[K] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never
type Body<K extends keyof MediaClient> =
  Extract<Answer<K>, { outcome: 'succeeded' }> extends { body: infer B } ? B : never

export type Committed = Body<'commit-upload'>
export type Reference = Committed['ref']
export type DisplayTarget = NonNullable<Parameters<MediaClient['read-media-page']>[0]['target']>
type Status = Body<'query-upload'>['status']

export type UploadOutcome =
  | (Committed & Readonly<{ kind: 'committed' }>)
  | Readonly<{ kind: 'failed'; reason: string }>
  | Readonly<{ kind: 'cancelled' }>

export type UploadInput = Readonly<{
  client: MediaClient
  tenant: TenantId
  /** The name of this upload: the client gives it, and asks by it when an answer is lost. */
  upload: string
  mediaType: string
  bytes: Uint8Array
  /** The file name, shown with it later; an end that cannot take one gets the upload without it. */
  name?: string
  progress: (sentBytes: number) => void
  cancelled: () => boolean
}>

const RECOVERIES = 2
const NOT_SENT = { outcome: 'not-sent' } as const
const WORDS: Readonly<Record<string, string>> = {
  limited: '超过大小上限',
  unsupported: '这种类型的文件不收',
  'type-mismatch': '内容不是它声明的类型',
  'digest-mismatch': '传到的内容与原件对不上',
  'over-budget': '图片太大，解码不了',
}
const failed = (reason: string): UploadOutcome => ({ kind: 'failed', reason })

function refusal(answer: { outcome: string; body?: unknown }): UploadOutcome {
  const reason = (answer.body as { reason?: unknown } | undefined)?.reason
  const words = WORDS[typeof reason === 'string' ? reason : answer.outcome]
  return failed(words ?? `上传没有成功（${answer.outcome}）`)
}

// The client throws only before anything is sent: such a call did not leave.
async function sent<T>(call: () => Promise<T>): Promise<T | typeof NOT_SENT> {
  try {
    return await call()
  } catch {
    return NOT_SENT
  }
}

async function digestOf(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
  return `sha256:${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

type Uploading = Extract<Status, { kind: 'uploading' }>
type Turn = Status | UploadOutcome
type Left = Readonly<{ outcome: string; body?: unknown }>
const LOST = failed('连不上服务，没有传完')

/** What a call that did not succeed leaves: ask where the upload is, go on from the server's count, or stop. */
function unsettled(answer: Left, status: Uploading, resume: string): Turn | 'ask' {
  if (answer.outcome === 'unknown') return 'ask'
  if (answer.outcome === 'not-sent') return LOST
  const body = (answer.body ?? {}) as { reason?: unknown; nextSequence?: unknown }
  const counted = answer.outcome === 'invalid' && body.reason === resume
  return counted && typeof body.nextSequence === 'number'
    ? { ...status, nextSequence: body.nextSequence }
    : refusal(answer)
}

/** Begins, appends part after part and commits; a lost answer is asked for by the upload's name. */
export async function uploadMedium(input: UploadInput): Promise<UploadOutcome> {
  const { client, tenant, upload, bytes } = input
  const digest = await digestOf(bytes)
  let asked = 0
  const where = async (): Promise<Turn> => {
    asked += 1
    if (asked > RECOVERIES) return failed('上传的结果不知道，请去掉后重新附加')
    const found = await sent(() => client['query-upload']({ tenant, upload }))
    if (found.outcome === 'succeeded') return found.body.status
    return found.outcome === 'not-sent' ? LOST : refusal(found)
  }
  const otherwise = (answer: Left, status: Uploading, resume: string): Turn | Promise<Turn> => {
    const left = unsettled(answer, status, resume)
    return left === 'ask' ? where() : left
  }
  const append = async (status: Uploading, offset: number): Promise<Turn> => {
    const { nextSequence: sequence, partBytes } = status
    const part = bytes.subarray(offset, offset + partBytes)
    const answer = await sent(() =>
      client['append-upload-part']({ tenant, upload, sequence, part }),
    )
    if (answer.outcome !== 'succeeded') return otherwise(answer, status, 'gap')
    input.progress(Math.min(offset + part.byteLength, bytes.byteLength))
    return { ...status, nextSequence: answer.body.nextSequence }
  }
  const commit = async (status: Uploading): Promise<Turn> => {
    const answer = await sent(() => client['commit-upload']({ tenant, upload, digest }))
    if (answer.outcome !== 'succeeded') return otherwise(answer, status, 'incomplete')
    return { kind: 'committed', ...answer.body }
  }

  const plain = { tenant, upload, mediaType: input.mediaType, bytes: bytes.byteLength }
  const named = input.name === undefined ? plain : { ...plain, name: input.name }
  let begun = await sent(() => client['begin-upload'](named))
  const nameless = begun.outcome === 'unavailable' || begun.outcome === 'protocol-rejected'
  if (nameless && named !== plain) begun = await sent(() => client['begin-upload'](plain))
  let turn: Turn
  if (begun.outcome === 'succeeded') turn = begun.body.status
  else if (begun.outcome === 'unknown') turn = await where()
  else return begun.outcome === 'not-sent' ? LOST : refusal(begun)
  while (turn.kind === 'uploading') {
    if (input.cancelled()) return { kind: 'cancelled' }
    const offset = turn.nextSequence * turn.partBytes
    turn = await (offset < bytes.byteLength ? append(turn, offset) : commit(turn))
  }
  return turn.kind === 'committed' ? { kind: 'committed', ref: turn.ref, facts: turn.facts } : turn
}

export type ReadOutcome =
  | Readonly<{ kind: 'read'; mediaType: string; bytes: Uint8Array }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

const PAGE_BYTES = 262_144

/** Reads page after page until there is no next one: the original, or the version within `target`. */
export async function readWhole(
  input: Readonly<{
    client: MediaClient
    tenant: TenantId
    ref: Reference
    target: DisplayTarget | null
  }>,
): Promise<ReadOutcome> {
  const { client, tenant, ref, target } = input
  const pages: Uint8Array[] = []
  let mediaType = ref.mediaType
  for (let offset: number | null = 0; offset !== null;) {
    const at: number = offset
    const page: Answer<'read-media-page'> | typeof NOT_SENT = await sent(() =>
      client['read-media-page']({
        tenant,
        ref,
        offset: at,
        limit: PAGE_BYTES,
        ...(target === null ? {} : { target }),
      }),
    )
    if (page.outcome === 'not-sent') return { kind: 'unreadable', reason: '连不上服务' }
    if (page.outcome === 'not-found') return { kind: 'unreadable', reason: '这份内容不在了' }
    if (page.outcome !== 'succeeded')
      return { kind: 'unreadable', reason: `读不出来（${page.outcome}）` }
    pages.push(page.body.part)
    mediaType = page.body.mediaType
    offset = page.body.next
  }
  const bytes = new Uint8Array(pages.reduce((sum, page) => sum + page.byteLength, 0))
  let filled = 0
  for (const page of pages) {
    bytes.set(page, filled)
    filled += page.byteLength
  }
  return { kind: 'read', mediaType, bytes }
}
