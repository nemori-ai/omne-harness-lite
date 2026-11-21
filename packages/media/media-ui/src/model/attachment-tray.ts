import type { TenantId } from '@omne-harness/public-contract'
import { prepareMedium, type Failed, type Ready } from './prepare.ts'
import { uploadMedium, type MediaClient, type Reference } from './upload.ts'

export type PickedFile = Readonly<{
  name: string
  type: string
  size: number
  read: () => Promise<Uint8Array>
  /** The file as the browser holds it, when there is one: what a local preview is made of. */
  blob?: Blob
}>

/** What the composer of a session takes back from this module; the shape is this module's own. */
export type DraftOffer = Readonly<{
  session: string
  draft: string
  source: string
  attachments: readonly Readonly<{ kind: AttachmentKind; ref: Reference }>[]
  ready: boolean
}>
export type Drafts = Readonly<{ offer(offer: DraftOffer): void }>

export type AttachmentKind = 'image' | 'voice' | 'file'

export type AttachmentState =
  | Readonly<{ kind: 'uploading'; sent: number }>
  | Readonly<{ kind: 'preparing'; ref: Reference }>
  | Ready
  | Failed

export type Attachment = Readonly<{
  id: string
  name: string
  bytes: number
  preview: string | null
  state: AttachmentState
}>

export type TrayDeps = Readonly<{
  client: MediaClient
  tenant: TenantId
  session: string
  draft: string
  /** The holder of drafts there now; null while nothing takes attachments. */
  drafts: () => Drafts | null
  newId: () => string
  preview: (file: PickedFile) => string | null
  release: (preview: string) => void
}>

export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const ACCEPTED_TYPES: readonly string[] = [
  ...IMAGE_TYPES,
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/aac',
  'application/pdf',
]
const SOURCE = 'media'
const NOT_ACCEPTED = '只能附加图片、语音或 PDF'
const kindOf = (mediaType: string): AttachmentKind =>
  mediaType.startsWith('image/') ? 'image' : mediaType.startsWith('audio/') ? 'voice' : 'file'

/** The attachments of one draft: each uploads as it is picked, and the draft is told what is ready. */
export class AttachmentTray {
  readonly #deps: TrayDeps
  readonly #listeners = new Set<() => void>()
  #items: readonly Attachment[] = []
  #disposed = false

  constructor(deps: TrayDeps) {
    this.#deps = deps
  }

  readonly read = (): readonly Attachment[] => this.#items

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  add(files: readonly PickedFile[]): void {
    if (this.#disposed) return
    const added = files.map((file): Attachment => {
      const accepted = ACCEPTED_TYPES.includes(file.type)
      return {
        id: this.#deps.newId(),
        name: file.name,
        bytes: file.size,
        preview: IMAGE_TYPES.includes(file.type) ? this.#deps.preview(file) : null,
        state: accepted ? { kind: 'uploading', sent: 0 } : { kind: 'failed', reason: NOT_ACCEPTED },
      }
    })
    this.#changed([...this.#items, ...added])
    added.forEach((item, at) => {
      const file = files[at]
      if (file !== undefined && item.state.kind === 'uploading') void this.#upload(item.id, file)
    })
  }

  remove(id: string): void {
    const gone = this.#items.find(item => item.id === id)
    if (gone === undefined) return
    if (gone.preview !== null) this.#deps.release(gone.preview)
    this.#changed(this.#items.filter(item => item.id !== id))
  }

  /** Asks the server again to make the representation of one that failed to be prepared. */
  retry(id: string): void {
    const item = this.#items.find(each => each.id === id)
    if (item?.state.kind !== 'failed' || item.state.ref === undefined) return
    void this.#prepare(id, item.state.ref)
  }

  /** The draft is gone: uploads in flight stop, and nothing more is offered. */
  dispose(): void {
    this.#disposed = true
    for (const { preview } of this.#items) if (preview !== null) this.#deps.release(preview)
    this.#items = []
  }

  #held(id: string): boolean {
    return !this.#disposed && this.#items.some(item => item.id === id)
  }

  #set(id: string, state: AttachmentState): void {
    if (!this.#held(id)) return
    this.#changed(this.#items.map(item => (item.id === id ? { ...item, state } : item)))
  }

  async #upload(id: string, file: PickedFile): Promise<void> {
    const { client, tenant } = this.#deps
    let bytes: Uint8Array
    try {
      bytes = await file.read()
    } catch {
      this.#set(id, { kind: 'failed', reason: '这个文件读不出来' })
      return
    }
    const outcome = await uploadMedium({
      client,
      tenant,
      upload: id,
      mediaType: file.type,
      bytes,
      progress: sent => this.#set(id, { kind: 'uploading', sent }),
      cancelled: () => !this.#held(id),
    })
    if (outcome.kind === 'committed') await this.#prepare(id, outcome.ref)
    if (outcome.kind === 'failed') this.#set(id, { kind: 'failed', reason: outcome.reason })
  }

  async #prepare(id: string, ref: Reference): Promise<void> {
    this.#set(id, { kind: 'preparing', ref })
    const { client, tenant } = this.#deps
    this.#set(id, await prepareMedium(client, tenant, ref))
  }

  #changed(items: readonly Attachment[]): void {
    this.#items = items
    const { session, draft } = this.#deps
    this.#deps.drafts()?.offer({
      session,
      draft,
      source: SOURCE,
      attachments: items.flatMap(({ state }) =>
        state.kind === 'ready' ? [{ kind: kindOf(state.ref.mediaType), ref: state.ref }] : [],
      ),
      ready: items.every(item => item.state.kind === 'ready'),
    })
    for (const listener of this.#listeners) listener()
  }
}
