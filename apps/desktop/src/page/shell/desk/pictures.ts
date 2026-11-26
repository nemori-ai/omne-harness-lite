import type { FigureLink } from './link.ts'
import type { TalkPicture } from './talk.ts'

/** The note's pictures go to the desk page once each, ahead of the scene that names them; all again once forgotten. */
export class DeskPictures {
  private readonly sent = new Set<string>()

  public constructor(private readonly link: FigureLink) {}

  public send(pictures: readonly TalkPicture[]): void {
    for (const { id, bytes } of pictures) {
      if (this.sent.has(id)) continue
      this.sent.add(id)
      this.link.send({ kind: 'picture', id, bytes })
    }
  }

  public forget(): void {
    this.sent.clear()
  }
}
