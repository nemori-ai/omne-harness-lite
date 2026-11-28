import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as ui from '@omne-harness/ui-kit'
import { createLookHost } from '../surface/look-host.ts'
import { DeskPage, type DeskDeps } from './desk.tsx'
import { wearOn } from './look.tsx'
import { FIGURE_CHANNEL, readIn } from './scene.ts'
import './desk.css'

const channel = new BroadcastChannel(FIGURE_CHANNEL)
const look = createLookHost({
  load: module => import(/* @vite-ignore */ module),
  given: { React, ui },
  later: (ms, run) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
  wear: wearOn(document),
  up: asked => channel.postMessage(asked),
})
const deps: DeskDeps = {
  look,
  post: message => channel.postMessage(message),
  listen(listener) {
    const heard = (event: MessageEvent) => {
      const message = readIn(event.data, look.take)
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
