import type { UserAttachment } from '@omne-harness/session-protocol'

export type DraftOffer = Readonly<{
  session: string
  draft: string
  /** Who offers: each source gives all of its attachments at once, and whether they are ready. */
  source: string
  attachments: readonly UserAttachment[]
  ready: boolean
}>

/** Where a contribution to the composer gives back what the message being written will carry. */
export type ComposerDrafts = Readonly<{ offer(offer: DraftOffer): void }>

export type Draft = Readonly<{
  draft: string
  attachments: readonly UserAttachment[]
  ready: boolean
}>

type Offered = Pick<DraftOffer, 'attachments' | 'ready'>
type Held = { view: Draft; sources: Map<string, Offered> }

export class ComposerDraftStore implements ComposerDrafts {
  readonly #held = new Map<string, Held>()
  readonly #listeners = new Set<() => void>()
  #issued = 0

  #fresh(): Held {
    this.#issued += 1
    return {
      view: { draft: `draft-${String(this.#issued)}`, attachments: [], ready: true },
      sources: new Map(),
    }
  }

  #of(session: string): Held {
    const held = this.#held.get(session) ?? this.#fresh()
    this.#held.set(session, held)
    return held
  }

  #renew(session: string): void {
    this.#held.set(session, this.#fresh())
    for (const listener of this.#listeners) listener()
  }

  readonly read = (session: string): Draft => this.#of(session).view

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  readonly offer = (offer: DraftOffer): void => {
    const held = this.#held.get(offer.session)
    if (held === undefined || held.view.draft !== offer.draft) return
    held.sources.set(offer.source, { attachments: offer.attachments, ready: offer.ready })
    const offered = [...held.sources.values()]
    held.view = {
      draft: offer.draft,
      attachments: offered.flatMap(each => each.attachments),
      ready: offered.every(each => each.ready),
    }
    for (const listener of this.#listeners) listener()
  }

  /** The attachments of the message being sent; what is written next is another draft. */
  readonly take = (session: string): readonly UserAttachment[] => {
    const { attachments } = this.#of(session).view
    this.#renew(session)
    return attachments
  }

  /** The composer of this session is gone: what was attached to its draft goes with it. */
  readonly drop = (session: string): void => {
    if (this.#held.has(session)) this.#renew(session)
  }
}
