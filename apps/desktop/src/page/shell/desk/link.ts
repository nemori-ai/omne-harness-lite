import { FIGURE_CHANNEL, readUp, type Down, type LookDown, type Up } from '../../desk/scene.ts'

type Channel = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

export type FigureLink = Readonly<{
  send(message: Down | LookDown): void
  listen(listener: (message: Up) => void): () => void
  close(): void
}>

/** The shell's end of the channel to the desk page: two pages of one origin and partition. */
export function figureLink(channel: Channel = new BroadcastChannel(FIGURE_CHANNEL)): FigureLink {
  return {
    send: message => channel.postMessage(message),
    listen(listener) {
      const heard = (event: MessageEvent) => {
        const message = readUp(event.data)
        if (message !== undefined) listener(message)
      }
      channel.addEventListener('message', heard)
      return () => channel.removeEventListener('message', heard)
    },
    close: () => channel.close(),
  }
}
