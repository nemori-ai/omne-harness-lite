import { referenceText } from '@omne-harness/media-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import { AttachmentTray, type Attachment, type PickedFile } from './attachment-tray.ts'
import type { MediaClient } from './upload.ts'

/** What a thing on a canvas refers to, as the canvas takes it: a kind, and an identifier in it. */
export type PlacedReference = Readonly<{ kind: string; ref: string }>

export const MEDIA_OBJECT = 'media.object'

/** What the intake says with a reference: the size an image takes when it is put on the sheet. */
export type Placing = Readonly<{ size: Readonly<{ width: number; height: number }> }>

const IMAGE_WIDTH = 176
const IMAGE_HEIGHTS = { least: 88, most: 232 } as const

/** An image is put 176 wide and as high as its own proportions say, between 88 and 232; nothing else is sized. */
export function placingOf(facts: Attachment['facts']): Placing | undefined {
  if (facts?.kind !== 'image' || facts.widthPixels <= 0 || facts.heightPixels <= 0) return undefined
  const high = Math.round((IMAGE_WIDTH * facts.heightPixels) / facts.widthPixels)
  const height = Math.min(Math.max(high, IMAGE_HEIGHTS.least), IMAGE_HEIGHTS.most)
  return { size: { width: IMAGE_WIDTH, height } }
}

export type IntakeDeps = Readonly<{
  client: MediaClient
  tenant: TenantId
  newId: () => string
  /** Takes one medium that is ready, as the reference the canvas puts. */
  place: (reference: PlacedReference, placing?: Placing) => void
  /** Called once, when every file has an outcome. */
  done: () => void
}>

/** One handing in of files: each is let in, uploaded and prepared as an attachment is, and placed once ready. */
export class FilesIntake {
  readonly tray: AttachmentTray
  readonly #deps: IntakeDeps
  readonly #placed = new Set<string>()
  #over = false

  constructor(deps: IntakeDeps) {
    this.#deps = deps
    this.tray = new AttachmentTray({
      client: deps.client,
      tenant: deps.tenant,
      newId: deps.newId,
      preview: () => null,
      release: () => undefined,
    })
    this.tray.subscribe(() => this.#look())
  }

  take(files: readonly PickedFile[]): void {
    this.tray.add(files)
    this.#look()
  }

  /** The handing in is taken away: uploads in flight stop, and nothing more is placed. */
  dispose(): void {
    this.#over = true
    this.tray.dispose()
  }

  #look(): void {
    if (this.#over) return
    const items = this.tray.read()
    for (const { id, state, facts } of items) {
      if (state.kind !== 'ready' || this.#placed.has(id)) continue
      this.#placed.add(id)
      const reference = { kind: MEDIA_OBJECT, ref: referenceText(state.ref) }
      this.#deps.place(reference, placingOf(facts))
    }
    if (items.some(({ state }) => state.kind !== 'ready' && state.kind !== 'failed')) return
    this.#over = true
    this.#deps.done()
  }
}
