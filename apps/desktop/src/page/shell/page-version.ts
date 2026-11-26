import type { Toast } from '@omne-harness/shell-contract'
import {
  DEVICE_PAGE_VERSION,
  DEVICE_PAGE_VERSION_TOLD,
  pageNoticeText,
  type PageVersionAnswer,
} from '../../shared/page-version.ts'

const NOTE = 'page-version'
const OWNER = {}
const TRIES = 60
const TRY_MS = 500

type Deps = Readonly<{
  signedIn(): boolean
  /** The line of the login gate. */
  gate(text: string): void
  told: Readonly<{ show(owner: object, toast: Toast): void; said(): { toast: Toast } | undefined }>
  fetcher?: typeof fetch
  wait?: (ms: number) => Promise<void>
}>

async function asked(fetcher: typeof fetch): Promise<PageVersionAnswer | undefined> {
  try {
    const answer = await fetcher(DEVICE_PAGE_VERSION)
    if (!answer.ok || !(answer.headers.get('content-type') ?? '').includes('json')) return undefined
    return (await answer.json()) as PageVersionAnswer
  } catch {
    return undefined
  }
}

/** Tells the person what the main process says of the page's version; it is answered once the person can read it. */
export async function tellPageVersion(deps: Deps): Promise<'told' | 'nothing' | 'no-room'> {
  const fetcher = deps.fetcher ?? fetch
  const wait = deps.wait ?? (ms => new Promise<void>(done => setTimeout(done, ms)))
  const notice = (await asked(fetcher))?.notice
  if (notice === undefined || notice === null) return 'nothing'
  const { title, body, tone } = pageNoticeText(notice)
  for (let tried = 0; tried < TRIES; tried += 1) {
    if (!deps.signedIn()) deps.gate(body === undefined ? title : `${title}：${body}`)
    else deps.told.show(OWNER, { id: NOTE, tone, title, ...(body === undefined ? {} : { body }) })
    if (!deps.signedIn() || deps.told.said()?.toast.id === NOTE) {
      await fetcher(DEVICE_PAGE_VERSION_TOLD, { method: 'POST' }).catch(() => undefined)
      return 'told'
    }
    await wait(TRY_MS)
  }
  return 'no-room'
}
