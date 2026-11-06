#!/usr/bin/env node
// A stand-in for `systemd-run`, for the fast-tier tests of the terminal's control frames. It acts
// as the terminal gate of unit `--unit=<unit>`, without a PTY and without a shell: it reads the
// control channel (descriptor 3) the way the real gate does and answers with the frames the test
// wrote into `<FAKE_DIR>/gate-script.json`. The test, not this file, decides what the gate says;
// this file only keeps the wire shape of the real gate (`src/terminal-gate.ts`): one JSON object
// per line on stdout, every frame carrying the generation of the request line, byte fields in
// base64 under `b`.
//
// The script, read again at every trigger so a test may change it between legs:
//   ready:    frames sent when the request line (the first line) arrives; default `[{ t: 'ready' }]`
//   go:       frames sent for `{ c: 'go' }`; default `[{ t: 'opened', cwd: '/tmp' }]`
//   executes: one frame list per `{ c: 'execute' }` message, in order; a leg without a list gets no answer
// A frame is an object with `t` and its fields. `leg` defaults to the id of the execute message,
// `text` stands for `b` (the text in base64), `delayMs` waits that long after the previous frame,
// and `raw` writes that text as the whole line (for lines that are not frames).
//
// It also writes its pid to `<FAKE_DIR>/<unit>.pid` (the stand-in `systemctl` of
// `fake-supervisor.mjs` kills it by that file) and appends every control line it reads to
// `<FAKE_DIR>/received.log`.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Socket } from 'node:net'

const directory = process.env['FAKE_DIR'] ?? ''
const unit =
  process.argv
    .slice(2)
    .find(arg => arg.startsWith('--unit='))
    ?.slice('--unit='.length) ?? 'unknown.scope'

function script() {
  const path = `${directory}/gate-script.json`
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

let generation
let executes = 0
const send = line => process.stdout.write(`${line}\n`)

function play(frames, leg) {
  let at = 0
  for (const { delayMs = 0, raw, text, ...frame } of frames) {
    at += delayMs
    const line =
      raw !== undefined
        ? raw
        : JSON.stringify({
            ...(leg === undefined ? {} : { leg }),
            ...(text === undefined ? {} : { b: Buffer.from(text).toString('base64') }),
            generation,
            ...frame,
          })
    if (at === 0) send(line)
    else setTimeout(send, at, line)
  }
}

function onLine(line, first) {
  appendFileSync(`${directory}/received.log`, `${line}\n`)
  const message = JSON.parse(line)
  if (first) {
    generation = message.generation
    play(script().ready ?? [{ t: 'ready' }])
  } else if (message.c === 'go') play(script().go ?? [{ t: 'opened', cwd: '/tmp' }])
  else if (message.c === 'execute') play(script().executes?.[executes++] ?? [], message.id)
}

writeFileSync(`${directory}/${unit}.pid`, String(process.pid))
const control = new Socket({ fd: 3, readable: true, writable: false })
control.on('error', () => undefined)
control.setEncoding('utf8')
let first = true
let pending = ''
control.on('data', text => {
  pending += text
  for (let at = pending.indexOf('\n'); at !== -1; at = pending.indexOf('\n')) {
    const line = pending.slice(0, at)
    pending = pending.slice(at + 1)
    onLine(line, first)
    first = false
  }
})
process.stdout.on('error', () => undefined)
setInterval(() => undefined, 2_147_483_647)
