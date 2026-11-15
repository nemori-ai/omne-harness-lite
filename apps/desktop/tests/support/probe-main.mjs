import { app, BrowserWindow } from 'electron'

const script = process.env['OMNE_PROBE_SCRIPT'] ?? 'null'

app.on('browser-window-created', (_event, window) => {
  window.webContents.on('console-message', event => {
    if (event.message.startsWith('STEP ')) process.stdout.write(`PAGE ${event.message}\n`)
  })
  window.webContents.once('did-finish-load', async () => {
    let result
    try {
      result = { ok: true, value: await window.webContents.executeJavaScript(script) }
    } catch (failure) {
      result = { ok: false, error: String(failure) }
    }
    const preferences = window.webContents.getLastWebPreferences()
    process.stdout.write(
      `PROBE ${JSON.stringify({
        windows: BrowserWindow.getAllWindows().length,
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
        result,
      })}\n`,
    )
    app.quit()
  })
})

await import('../../dist/electron-host/main.js')
