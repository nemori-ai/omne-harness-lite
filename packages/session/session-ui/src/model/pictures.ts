import type { UserAttachment } from '@omne-harness/session-protocol'
import type { Reader, SayPicture } from '@omne-harness/shell-contract'

/** How a group of pictures was taken in: every one as an attachment, in the order given, or not at all. */
export type PicturesTaken =
  | Readonly<{ kind: 'taken'; attachments: readonly UserAttachment[] }>
  | Readonly<{ kind: 'failed'; reason: string }>

/** What turns the bytes of pictures into attachments for a tenant; the assembly names who provides it. */
export type PictureIntake = Readonly<{
  take: (tenant: string, pictures: readonly SayPicture[]) => Promise<PicturesTaken>
}>

export const NO_PICTURES = '现在发不了图，这句话没有交出去。'
export const PICTURES_GONE = '现在收不了图，这句话没有交出去。'
export const PICTURES_NOT_TAKEN = '图没有收下，这句话没有交出去。'

const failed = (reason: string): PicturesTaken => ({ kind: 'failed', reason })

/** Takes the pictures in through what is on the point now; failed when it is not there, leaves first, or throws. */
export function takePictures(
  point: Reader<PictureIntake>,
  tenant: string,
  pictures: readonly SayPicture[],
): Promise<PicturesTaken> {
  const intake = point.get()
  if (intake === undefined) return Promise.resolve(failed(NO_PICTURES))
  return new Promise(resolve => {
    let stop = (): void => undefined
    const end = (answer: PicturesTaken): void => {
      stop()
      resolve(answer)
    }
    stop = point.subscribe(() => {
      if (point.get() !== intake) end(failed(PICTURES_GONE))
    })
    Promise.resolve()
      .then(() => intake.take(tenant, pictures))
      .then(
        answer =>
          end(
            answer.kind === 'failed' ? failed(answer.reason.trim() || PICTURES_NOT_TAKEN) : answer,
          ),
        () => end(failed(PICTURES_NOT_TAKEN)),
      )
  })
}
