import { createRoot } from 'react-dom/client'
import { DeskPage, type DeskDeps } from './desk.tsx'
import { FIGURE_CHANNEL, readDown } from './scene.ts'
import './desk.css'

const channel = new BroadcastChannel(FIGURE_CHANNEL)
const deps: DeskDeps = {
  post: message => channel.postMessage(message),
  listen(listener) {
    const heard = (event: MessageEvent) => {
      const message = readDown(event.data)
      if (message !== undefined) listener(message)
    }
    channel.addEventListener('message', heard)
    return () => channel.removeEventListener('message', heard)
  },
  hot: (lease, rects) =>
    void fetch(`/device/figure/hot?lease=${lease}`, {
      method: 'POST',
      body: JSON.stringify({ rects }),
    }).catch(() => undefined),
  frame: callback => void requestAnimationFrame(callback),
  origin: () => ({ x: window.screenX, y: window.screenY }),
}

const root = document.getElementById('root')
if (root !== null) createRoot(root).render(<DeskPage deps={deps} />)
