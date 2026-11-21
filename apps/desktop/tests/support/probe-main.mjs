import { execFileSync } from 'node:child_process'
import { app, BrowserWindow, shell } from 'electron'

const script = process.env['OMNE_PROBE_SCRIPT'] ?? 'null'
// Optional: one more script, run again after a reload, after a crash, and before the window is
// destroyed; `OMNE_PROBE_COUNT` answers how many observations the server has seen cancelled.
const leaveOpen = process.env['OMNE_PROBE_LEAVE_OPEN']
const countUrl = process.env['OMNE_PROBE_COUNT']
const afterReload = process.env['OMNE_PROBE_AFTER_RELOAD']
const standing = process.env['OMNE_PROBE_STANDING']

/** How many TCP ports the app's processes listen on; `unchecked` where `lsof` cannot tell. */
function listening() {
  if (process.platform === 'win32') return 'unchecked'
  const pids = app.getAppMetrics().map(metric => metric.pid)
  try {
    const out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pids.join(',')], {
      encoding: 'utf8',
    })
    return String(out.split('\n').filter(line => /LISTEN/.test(line)).length)
  } catch (failure) {
    // lsof exits 1 when nothing matched.
    return failure.status === 1 ? '0' : 'unchecked'
  }
}

const say = line => process.stdout.write(`${line}\n`)
const opened = []
// A test must never start the system browser.
shell.openExternal = url => {
  opened.push(url)
  return Promise.resolve()
}

async function cancelled(atLeast) {
  for (let i = 0; i < 100; i += 1) {
    const count = Number(await (await fetch(countUrl)).text())
    if (count >= atLeast) return count
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return Number(await (await fetch(countUrl)).text())
}

const loaded = contents => new Promise(resolve => contents.once('did-finish-load', resolve))

async function phases(window) {
  const contents = window.webContents
  // The probe script aborted one observation itself; wait until the server has seen that one.
  const before = await cancelled(1)
  await contents.executeJavaScript(leaveOpen)
  const reloaded = loaded(contents)
  contents.reload()
  await reloaded
  say(`PHASE reload ${(await cancelled(before + 1)) - before}`)
  say(`AFTER ${JSON.stringify(await contents.executeJavaScript(afterReload))}`)
  say(`LISTEN ${listening()}`)

  // The utility process belongs to the app: killing it loses no login, the cookie is in the jar.
  const utility = app.getAppMetrics().find(metric => metric.type === 'Utility')
  process.kill(utility.pid, 'SIGKILL')
  say(`PHASE utility-restart ${await contents.executeJavaScript(standing)}`)

  await contents.executeJavaScript(leaveOpen)
  // The app's own recovery reloads the page after the crash.
  const recovered = loaded(contents)
  contents.forcefullyCrashRenderer()
  say(`PHASE crash ${(await cancelled(before + 2)) - before}`)
  await recovered
  say('PHASE recovered')

  await contents.executeJavaScript(leaveOpen)
  // The app quits when its last window closes; this probe still has a line to print.
  app.removeAllListeners('window-all-closed')
  window.destroy()
  say(`PHASE destroy ${(await cancelled(before + 3)) - before}`)
}

app.on('browser-window-created', (_event, window) => {
  window.webContents.on('console-message', event => {
    if (event.message.startsWith('STEP ')) say(`PAGE ${event.message}`)
  })
  window.webContents.once('did-finish-load', async () => {
    let result
    try {
      result = { ok: true, value: await window.webContents.executeJavaScript(script) }
    } catch (failure) {
      result = { ok: false, error: String(failure) }
    }
    const preferences = window.webContents.getLastWebPreferences()
    say(
      `PROBE ${JSON.stringify({
        windows: BrowserWindow.getAllWindows().length,
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
        preload: preferences.preload ?? null,
        opened,
        result,
      })}`,
    )
    if (leaveOpen !== undefined) {
      try {
        await phases(window)
      } catch (failure) {
        say(`PHASE failed ${String(failure)}`)
      }
    }
    app.quit()
  })
})

await import('../../dist/release/main/main.js')
