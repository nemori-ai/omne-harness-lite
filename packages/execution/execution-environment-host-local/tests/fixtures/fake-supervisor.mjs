#!/usr/bin/env node
// A stand-in for the two supervisor tools, for the fast-tier custody tests. The first argument
// names the tool; the rest are the arguments the provider passes. Everything it does is in
// `FAKE_DIR` (the environment of the test): the pid of each fake gate, a line per `systemctl`
// call, a line per `retain` the gate received, and a hold file that keeps a unit "deactivating".
//
// `systemd-run`: ignores its options and acts as the gate of unit `--unit=<unit>`. It writes its
// pid to `<unit>.pid`, answers the request line with `ready`, GO with `started` and then one exit
// frame with one other member, appends the unit to `retain.log` on `retain`, and stays alive until
// it is killed.
//
// `systemctl`: appends its arguments to `systemctl.log`. `kill <unit>` sends SIGKILL to the pid in
// `<unit>.pid`; `stop` exits 0; `show` reports the unit `deactivating` while `<unit>.hold` exists,
// otherwise `inactive` and `not-found`.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Socket } from 'node:net'

const directory = process.env['FAKE_DIR'] ?? ''
const [tool = '', ...args] = process.argv.slice(2)

function unitArgument() {
  return args.find(arg => arg.startsWith('--unit='))?.slice('--unit='.length) ?? 'unknown.scope'
}

function gate() {
  const unit = unitArgument()
  writeFileSync(`${directory}/${unit}.pid`, String(process.pid))
  const control = new Socket({ fd: 3, readable: true, writable: false })
  control.on('error', () => undefined)
  const send = frame => process.stdout.write(`${JSON.stringify(frame)}\n`)
  let first = true
  let pending = ''
  control.setEncoding('utf8')
  control.on('data', text => {
    pending += text
    for (let at = pending.indexOf('\n'); at !== -1; at = pending.indexOf('\n')) {
      const line = pending.slice(0, at)
      pending = pending.slice(at + 1)
      if (first) {
        first = false
        send({ t: 'ready' })
        continue
      }
      const message = JSON.parse(line)
      if (message.c === 'go') {
        send({ t: 'started' })
        setTimeout(() => send({ t: 'exit', code: 0, signal: null, members: 1 }), 20)
      } else if (message.c === 'retain') appendFileSync(`${directory}/retain.log`, `${unit}\n`)
    }
  })
  process.stdout.on('error', () => undefined)
  setInterval(() => undefined, 2_147_483_647)
}

function systemctl() {
  appendFileSync(`${directory}/systemctl.log`, `${args.join(' ')}\n`)
  const unit = args.at(-1) ?? ''
  if (args.includes('kill')) {
    try {
      process.kill(Number(readFileSync(`${directory}/${unit}.pid`, 'utf8')), 'SIGKILL')
    } catch {
      /* The gate is gone already. */
    }
  } else if (args.includes('show')) {
    process.stdout.write(
      existsSync(`${directory}/${unit}.hold`)
        ? 'LoadState=loaded\nActiveState=deactivating\n'
        : 'LoadState=not-found\nActiveState=inactive\n',
    )
  }
  process.exit(0)
}

if (tool === 'systemd-run') gate()
else if (tool === 'systemctl') systemctl()
else {
  process.stderr.write(`fake-supervisor: unknown tool ${tool}\n`)
  process.exit(2)
}
