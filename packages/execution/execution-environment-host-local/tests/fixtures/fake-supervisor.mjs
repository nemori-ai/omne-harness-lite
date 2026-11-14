#!/usr/bin/env node
import { appendFileSync, closeSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Socket } from 'node:net'

const directory = process.env['FAKE_DIR'] ?? ''
const [tool = '', ...args] = process.argv.slice(2)

function unitArgument() {
  return args.find(arg => arg.startsWith('--unit='))?.slice('--unit='.length) ?? 'unknown.scope'
}

function script() {
  const path = `${directory}/gate.json`
  return {
    onRequest: 'ready',
    onGo: 'started',
    afterStarted: 'exit',
    exit: { code: 0, signal: null, members: 1 },
    exitAfterMs: 20,
    onTerm: 'ignore',
    beforeExit: [],
    afterExit: [],
    onRetain: [],
    afterRetain: 'stay',
    ...(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}),
  }
}

function gate() {
  const unit = unitArgument()
  const plan = script()
  writeFileSync(`${directory}/${unit}.pid`, String(process.pid))
  const control = new Socket({ fd: 3, readable: true, writable: false })
  control.on('error', () => undefined)
  const lines = frames => frames.map(frame => `${JSON.stringify(frame)}\n`).join('')
  const send = frame => process.stdout.write(lines([frame]))
  const started = () => {
    send({ t: 'started' })
    for (const frame of plan.beforeExit) send(frame)
    if (plan.afterStarted === 'exit')
      setTimeout(
        () => process.stdout.write(lines([{ t: 'exit', ...plan.exit }, ...plan.afterExit])),
        plan.exitAfterMs,
      )
    else if (plan.afterStarted === 'vanish') setTimeout(() => process.exit(0), 20)
    else if (plan.afterStarted === 'garbage')
      setTimeout(() => process.stdout.write('garbage\n'), 20)
  }
  const go = () => {
    if (plan.onGo === 'started') started()
    else if (plan.onGo === 'spawnFailed') send({ t: 'spawnFailed', code: 'ENOENT' })
    else if (plan.onGo === 'startedThenGarbage') process.stdout.write('{"t":"started"}\ngarbage\n')
  }
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
        if (plan.onRequest === 'ready') send({ t: 'ready' })
        else if (plan.onRequest === 'vanish') process.exit(0)
        continue
      }
      const message = JSON.parse(line)
      appendFileSync(`${directory}/control.log`, `${unit} ${message.c}\n`)
      if (message.c === 'go') go()
      else if (message.c === 'term' && plan.onTerm === 'exit')
        send({ t: 'exit', code: null, signal: 'SIGTERM', members: 1 })
      else if (message.c === 'retain') {
        appendFileSync(`${directory}/retain.log`, `${unit}\n`)
        for (const frame of plan.onRetain) send(frame)
        if (plan.afterRetain === 'closeStdout') closeSync(1)
        else if (plan.afterRetain === 'garbage') process.stdout.write('garbage\n')
      }
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
    } catch {}
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
