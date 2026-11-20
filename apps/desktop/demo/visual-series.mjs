const WIDE = { name: '1440', width: 1440, height: 900 }
const NARROW = { name: '1100', width: 1100, height: 760 }
const QUIET = 100

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

async function measure(browser, run) {
  const { rows, zero } = await run(
    browser,
    'return { rows: window.__inkTimeline, zero: window.__inkZero }',
  )
  const after = rows.filter(row => row[0] >= zero)
  const track = column => {
    const segments = moved(after, column, zero)
    return { segments, stills: segments.slice(1).map((next, i) => next[0] - segments[i][1]) }
  }
  return { quiet: QUIET, figure: track(1), way: track(2), note: track(3) }
}

function series(title, { page, width = WIDE, steps, lasting, clip }) {
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
}
