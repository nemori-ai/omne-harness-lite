import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

const url = process.env['OMNE_CHARTS_URL']
const out = process.env['OMNE_CHARTS_OUT']
const say = line => process.stdout.write(`${line}\n`)

const READ = theme => `(async () => {
  document.documentElement.dataset.theme = ${JSON.stringify(theme)}
  await document.fonts.ready
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const probe = document.querySelector('[data-probe="chart-1"]')
  const bars = [...document.querySelectorAll('.recharts-bar.omne-chart-color-1 .recharts-rectangle')]
  const line = document.querySelector('.recharts-line.omne-chart-color-1 .recharts-line-curve')
  const colors = [...document.querySelectorAll('svg, svg *')].flatMap(node =>
    ['fill', 'stroke', 'stop-color'].map(name => node.getAttribute(name)).filter(value => value !== null))
  return {
    theme: ${JSON.stringify(theme)},
    surfaces: document.querySelectorAll('svg.recharts-surface').length,
    figures: document.querySelectorAll('figure.omne-chart').length,
    token: getComputedStyle(probe).color,
    bar: bars.map(bar => getComputedStyle(bar).fill),
    line: line === null ? null : getComputedStyle(line).stroke,
    literal: colors.filter(value => /#[0-9a-f]{3,8}|rgb\\(|hsl\\(/i.test(value)),
    styles: document.querySelectorAll('style').length,
    violations: window.chartWalk.violations,
  }
})()`

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1500,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  const messages = []
  window.webContents.on('console-message', event => {
    messages.push({ level: event.level, message: event.message })
  })
  try {
    await window.loadURL(url)
    for (let tries = 0; tries < 100; tries += 1) {
      const drawn = await window.webContents.executeJavaScript(
        'document.querySelectorAll("svg.recharts-surface").length',
      )
      if (drawn >= 3) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const readings = []
    for (const theme of ['light', 'dark']) {
      const reading = await window.webContents.executeJavaScript(READ(theme))
      const image = await window.webContents.capturePage()
      writeFileSync(join(out, `charts-${theme}.png`), image.toPNG())
      readings.push(reading)
    }
    say(`CHARTWALK ${JSON.stringify({ ok: true, readings, messages })}`)
  } catch (failure) {
    say(`CHARTWALK ${JSON.stringify({ ok: false, error: String(failure), messages })}`)
  }
  app.quit()
})
