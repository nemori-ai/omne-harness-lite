type Fetcher = (input: string, init: RequestInit) => Promise<unknown>

export type OverlayChannel = Readonly<{
  active(): void
  picture(png: Blob): Promise<void>
  cancel(): Promise<void>
}>

/** What an overlay page tells the main process (src/main/device-screen.ts): that it is in use, then its one answer. */
export function overlayChannel(search: string, fetcher: Fetcher): OverlayChannel {
  let reported = false
  let answered = false
  const post = (path: string, body?: BodyInit) =>
    fetcher(`/device/screen/${path}${search}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body }),
    })
  async function answer(body: BodyInit): Promise<void> {
    if (answered) return
    answered = true
    await post('choice', body).catch(() => {
      answered = false
    })
  }
  return {
    active() {
      if (reported) return
      reported = true
      void post('active').catch(() => undefined)
    },
    picture: png => answer(png),
    cancel: () => answer(new Uint8Array()),
  }
}
