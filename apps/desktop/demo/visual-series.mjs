const WIDE = { name: '1440', width: 1440, height: 900 }
const NARROW = { name: '1100', width: 1100, height: 760 }
const QUIET = 100
/** How long the app series waits once the figure is home: the ink it left at the last seat has faded by then. */
const STILL_BEFORE = 1500

const SHORT_TOLD = [
  [2967, 'told', 'short'],
  [7567, 'click', '[data-control=told-note]'],
]
const LONG_TOLD = [
  [2967, 'told', 'long'],
  [7567, 'click', '[data-control=told-note]'],
]

function moved(rows, column, zero) {
  const out = []
  for (const row of rows) {
    if (row[column] !== 1) continue
    const at = row[0] - zero
    const open = out.at(-1)
    if (open !== undefined && at - open[1] <= QUIET) open[1] = at
    else out.push([at, at])
  }
  return out.map(([from, to]) => [Math.round(from), Math.round(to)])
}

/** When the flag in `column` was up, joined across gaps of at most QUIET, and the stills between. */
function track(rows, column, zero) {
  const segments = moved(rows, column, zero)
  return { segments, stills: segments.slice(1).map((next, i) => next[0] - segments[i][1]) }
}

async function measure(browser, run) {
  const { rows, zero } = await run(
    browser,
    'return { rows: window.__inkTimeline, zero: window.__inkZero }',
  )
  const after = rows.filter(row => row[0] >= zero)
  return {
    quiet: QUIET,
    figure: track(after, 1, zero),
    way: track(after, 2, zero),
    note: track(after, 3, zero),
  }
}

/** In the app: where the figure is at every frame, and whether it is flying (`.omne-figure-carried`, ui-kit). */
const FOLLOW_FIGURE = `
  window.__figureRows = []
  window.__figureFollowed = true
  const follow = () => {
    if (!window.__figureFollowed) return
    const body = document.querySelector('.omne-figure-carried')
    if (body !== null) {
      const box = body.getBoundingClientRect()
      window.__figureRows.push([
        performance.timeOrigin + performance.now(),
        body.dataset.phase === 'flying' ? 1 : 0,
        Math.round(box.left + box.width / 2),
        Math.round(box.top + box.height / 2),
      ])
    }
    requestAnimationFrame(follow)
  }
  requestAnimationFrame(follow)`

/** The app's steps, each at its time after the start: `open` a session by its title, or go to a `page`. */
const playInApp = (started, steps) => `
  window.__figureZero = ${started}
  const due = at => Math.max(0, ${started} + at - (performance.timeOrigin + performance.now()))
  for (const [at, what, name] of ${JSON.stringify(steps)})
    setTimeout(() => {
      const step = what === 'open' ? openSession(name) : goTo(name)
      step.catch(failure => { window.__figureFailed = String(failure) })
    }, due(at))
  return true`

async function measureInApp(browser, run) {
  const { rows, zero, failed } = await run(
    browser,
    `window.__figureFollowed = false
    return { rows: window.__figureRows, zero: window.__figureZero, failed: window.__figureFailed ?? null }`,
  )
  const after = rows.filter(row => row[0] >= zero)
  const at = row => (row === undefined ? null : [row[2], row[3]])
  return {
    quiet: QUIET,
    figure: track(after, 1, zero),
    first: at(after[0]),
    last: at(after.at(-1)),
    failed,
  }
}

/**
 * A frame series: on a specimen `page` driven by its ink steps, or with `app` in the app itself, signed in: `app`
 * is the page script that brings it to the start (with the walk's helpers), and the steps press the app's own
 * controls.
 */
function series(title, { page, app, width = WIDE, steps, lasting, clip }) {
  if (app !== undefined)
    return {
      title,
      app: true,
      width,
      lasting,
      clip,
      prepare: (browser, run) => run(browser, `${app}\n${FOLLOW_FIGURE}\n return true`),
      act: (browser, run, started) => run(browser, playInApp(started, steps)),
      measure: measureInApp,
    }
  return {
    title,
    page,
    width,
    lasting,
    clip,
    prepare: (browser, run) => run(browser, 'return window.__ink.settled()'),
    act: (browser, run, started) =>
      run(browser, `window.__ink.play(${started}, ${JSON.stringify(steps)}); return true`),
    measure,
  }
}

export const SERIES = {
  'ink-turn': series('一个回合：在想、received、在查、在写、landed（M05）', {
    page: 'ink.html?seat=header&seed=1',
    steps: [
      [944, 'doing', 'thinking'],
      [944, 'moment', 'received'],
      [3932, 'doing', 'looking'],
      [9746, 'doing', 'writing'],
      [10768, 'doing', null],
      [10768, 'moment', 'landed'],
    ],
    lasting: 13_000,
    clip: { x: 760, y: 0, width: 160, height: 136 },
  }),
  'ink-stream': series('在写持续 8 s（M04）', {
    page: 'ink.html?seat=header&seed=1',
    steps: [
      [1218, 'doing', 'writing'],
      [9218, 'doing', null],
    ],
    lasting: 10_500,
    clip: { x: 760, y: 0, width: 160, height: 136 },
  }),
  'ink-journey': series('家 → 对话头 → 家（M06）', {
    page: 'ink.html?seat=home&seed=1',
    steps: [
      [833, 'go', 'header'],
      [4833, 'go', 'home'],
    ],
    lasting: 9000,
    clip: { x: 0, y: 0, width: 900, height: 160 },
  }),
  'ink-bubble': series('1100 宽，对话头开淡墨框，2.7 s 后按 Escape（M07）', {
    page: 'ink.html?seat=header&seed=1',
    width: NARROW,
    steps: [
      [848, 'bubble', 'light'],
      [3557, 'key', 'Escape'],
    ],
    lasting: 5000,
    clip: { x: 340, y: 0, width: 660, height: 760 },
  }),
  'ink-told': series('待答数 1，在家写短的告知笺，4.6 s 后点掉（M08 浅色）', {
    page: 'ink.html?seat=home&seed=1&waiting=1',
    steps: SHORT_TOLD,
    lasting: 9500,
    clip: { x: 0, y: 20, width: 280, height: 160 },
  }),
  'ink-told-long': series('同上，长的告知笺截成三行（M08 深色）', {
    page: 'ink.html?seat=home&seed=1&waiting=1',
    steps: LONG_TOLD,
    lasting: 9500,
    clip: { x: 0, y: 20, width: 280, height: 160 },
  }),
  'ink-waiting': series('待答数 0 → 3 → 0（M10）', {
    page: 'ink.html?seat=header&seed=1',
    steps: [
      [1000, 'waiting', 3],
      [3000, 'waiting', 0],
    ],
    lasting: 4500,
    clip: { x: 760, y: 0, width: 160, height: 136 },
  }),
  'shell-journey': series('已登录：从资产打开对话页，形从家飞到对话头；回到资产，飞回家', {
    app: `await goTo('资产'); await seated('home'); await sleep(${STILL_BEFORE})`,
    steps: [
      [800, 'open', '请总结'],
      [4800, 'page', '资产'],
    ],
    lasting: 8500,
    clip: { x: 0, y: 0, width: 1100, height: 180 },
  }),
}
