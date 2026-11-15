#!/usr/bin/env node
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
const send = text => process.stdout.write(text)

function play(frames, leg) {
  let at = 0
  const writes = []
  for (const { delayMs = 0, raw, text, joined = false, ...frame } of frames) {
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
    const previous = writes.at(-1)
    if (joined && previous !== undefined) previous.text += `${line}\n`
    else writes.push({ at, text: `${line}\n` })
  }
  for (const { at, text } of writes) {
    if (at === 0) send(text)
    else setTimeout(send, at, text)
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
