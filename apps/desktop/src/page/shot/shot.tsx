import 'react-screenshots/lib/style.css'
import './shot.css'
import { createRoot } from 'react-dom/client'
import screenshots from 'react-screenshots'
import { overlayChannel } from './channel.ts'

// The package has no "type": "module", so NodeNext types its default import as the module object; the build bundles
// its ES module, whose default export is the component itself.
const Screenshots = screenshots as unknown as typeof screenshots.default
const search = window.location.search
const channel = overlayChannel(search, (input, init) => fetch(input, init))
document.addEventListener('pointerdown', () => channel.active(), { capture: true })

const root = document.getElementById('root')
if (root !== null)
  createRoot(root).render(
    <Screenshots
      url={`/device/screen/frame${search}`}
      width={window.innerWidth}
      height={window.innerHeight}
      onOk={(png: Blob) => void channel.picture(png)}
      onCancel={() => void channel.cancel()}
    />,
  )
