// Another app's window for the desk-figure e2e: one plain window of the normal level at the given bounds, in front.
// Run with the Electron executable: other-window.mjs <x> <y> <width> <height> <title> <colour> <userDataDir>
import { app, BrowserWindow } from 'electron'

const [x, y, width, height] = process.argv.slice(2, 6).map(Number)
const [title, colour, userData] = process.argv.slice(6, 9)
app.setPath('userData', userData)

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    title,
    show: false,
    resizable: false,
    backgroundColor: colour,
  })
  window.on('page-title-updated', event => event.preventDefault())
  window.on('closed', () => app.quit())
  const body = `<body style="margin:0;background:${colour}"></body>`
  await window.loadURL(`data:text/html,${encodeURIComponent(body)}`)
  window.show()
  app.focus({ steal: true })
  // A background process may not take the front; a moment on the floating level lifts it, then it goes back to normal.
  window.setAlwaysOnTop(true, 'floating')
  await new Promise(done => setTimeout(done, 200))
  window.setAlwaysOnTop(false)
  window.moveTop()
  process.stdout.write(`${JSON.stringify({ ready: window.getBounds(), pid: process.pid })}\n`)
})
