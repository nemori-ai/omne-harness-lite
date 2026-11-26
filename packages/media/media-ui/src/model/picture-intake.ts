import { readTenantText } from '@omne-harness/public-contract'
import { AttachmentTray, IMAGE_TYPES, type PickedFile } from './attachment-tray.ts'
import type { MediaClient, Reference } from './upload.ts'

/** One picture as another module holds it: a name to tell it by, and its bytes. */
export type Picture = Readonly<{ name: string; bytes: Uint8Array }>
/** What a picture becomes: the same shape the attachment tray hands back for a draft. */
export type PictureAttachment = Readonly<{ kind: 'image'; ref: Reference }>
export type PicturesTaken =
  | Readonly<{ kind: 'taken'; attachments: readonly PictureAttachment[] }>
  | Readonly<{ kind: 'failed'; reason: string }>

/** Takes pictures by bytes, for a tenant given as its text; it answers, and does not throw. */
export interface PictureIntake {
  take(tenant: string, pictures: readonly Picture[]): Promise<PicturesTaken>
}

export type PictureIntakeDeps = Readonly<{ client: MediaClient; newId: () => string }>

const UNAVAILABLE = '媒体现在用不了'
const failed = (reason: string): PicturesTaken => ({ kind: 'failed', reason })

type Mark = readonly [at: number, bytes: readonly number[]]
const SIGNATURES: readonly Readonly<{ type: string; marks: readonly Mark[] }>[] = [
  { type: 'image/png', marks: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  { type: 'image/jpeg', marks: [[0, [0xff, 0xd8, 0xff]]] },
  { type: 'image/gif', marks: [[0, [0x47, 0x49, 0x46, 0x38]]] },
  {
    type: 'image/webp',
    marks: [
      [0, [0x52, 0x49, 0x46, 0x46]],
      [8, [0x57, 0x45, 0x42, 0x50]],
    ],
  },
]

/** The type of a picture, from its bytes: there is no file to say it; the tray's list says which it takes. */
function pictureType(bytes: Uint8Array): string | undefined {
  const found = SIGNATURES.find(({ marks }) =>
    marks.every(([at, head]) => head.every((byte, offset) => bytes[at + offset] === byte)),
  )
  return found !== undefined && IMAGE_TYPES.includes(found.type) ? found.type : undefined
}

/** Puts the files on a tray of their own and answers once: the first that fails, or all of them ready. */
function takeAll(
  tray: AttachmentTray,
  files: readonly PickedFile[],
  answer: (taken: PicturesTaken) => void,
): void {
  tray.subscribe(() => {
    const items = tray.read()
    const lost = items.find(item => item.state.kind === 'failed')
    if (lost?.state.kind === 'failed') answer(failed(`「${lost.name}」：${lost.state.reason}`))
    else if (items.every(item => item.state.kind === 'ready'))
      answer({
        kind: 'taken',
        attachments: items.flatMap(({ state }) =>
          state.kind === 'ready' ? [{ kind: 'image' as const, ref: state.ref }] : [],
        ),
      })
  })
  tray.add(files)
}

/** The intake of pictures for as long as its scope lasts: closing it answers the calls in flight. */
export function createPictureIntake(deps: PictureIntakeDeps): Readonly<{
  intake: PictureIntake
  close: () => void
}> {
  const inFlight = new Set<(taken: PicturesTaken) => void>()
  let closed = false
  const take = async (scope: string, pictures: readonly Picture[]): Promise<PicturesTaken> => {
    if (closed) return failed(UNAVAILABLE)
    if (pictures.length === 0) return { kind: 'taken', attachments: [] }
    const tenant = readTenantText(scope)
    if (tenant === undefined) return failed('读不懂这是哪个租户')
    const files: PickedFile[] = []
    const refused: string[] = []
    for (const { name, bytes } of pictures) {
      const type = pictureType(bytes)
      if (type === undefined) refused.push(`「${name}」不是图片`)
      else files.push({ name, type, size: bytes.byteLength, read: async () => bytes })
    }
    if (refused.length > 0) return failed(refused.join('；'))
    const tray = new AttachmentTray({
      client: deps.client,
      tenant,
      newId: deps.newId,
      preview: () => null,
      release: () => undefined,
    })
    return new Promise(resolve => {
      const answer = (taken: PicturesTaken): void => {
        if (!inFlight.delete(answer)) return
        tray.dispose()
        resolve(taken)
      }
      inFlight.add(answer)
      takeAll(tray, files, answer)
    })
  }
  return {
    intake: {
      take: (scope, pictures) => take(scope, pictures).catch(() => failed('这几张图没有收下')),
    },
    close() {
      closed = true
      for (const answer of inFlight) answer(failed(UNAVAILABLE))
    },
  }
}
