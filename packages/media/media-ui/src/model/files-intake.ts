import { referenceText } from '@omne-harness/media-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import { AttachmentTray, type PickedFile } from './attachment-tray.ts'
import type { MediaClient } from './upload.ts'

/** What a thing on a canvas refers to, as the canvas takes it: a kind, and an identifier in it. */
export type PlacedReference = Readonly<{ kind: string; ref: string }>

export const MEDIA_OBJECT = 'media.object'

export type IntakeDeps = Readonly<{
  client: MediaClient
  tenant: TenantId
  newId: () => string
  /** Takes one medium that is ready, as the reference the canvas puts. */
  place: (reference: PlacedReference) => void
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
    for (const { id, state } of items) {
      if (state.kind !== 'ready' || this.#placed.has(id)) continue
      this.#placed.add(id)
      this.#deps.place({ kind: MEDIA_OBJECT, ref: referenceText(state.ref) })
    }
    if (items.some(({ state }) => state.kind !== 'ready' && state.kind !== 'failed')) return
    this.#over = true
    this.#deps.done()
  }
}
