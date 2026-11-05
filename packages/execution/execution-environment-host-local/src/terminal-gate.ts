import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, constants, mkdirSync, openSync, readSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import { join } from 'node:path'
import { ownUnitPlacement } from './scope-cgroup.ts'
import {
  idleSentinels,
  releaseSentinels,
  scanSentinels,
  watchSentinels,
  type SentinelPiece,
} from './terminal-sentinels.ts'

type Initial = {
  generation: string
  cwd: string
  env: Record<string, string>
  columns: number
  rows: number
  maxChunkBytes: number
  maxControlBytes: number
  betweenSegmentBytes: number
}
type Leg = { id: string; script: string; cwd?: string; env?: Record<string, string>; stdin: Buffer }
type ActiveLeg = Leg & { nonce: string; begun: boolean; sawEnd: boolean }
type Pty = { fd: number; pid: number }

const unit = process.argv[2] ?? ''
const directory = `/tmp/${unit}.terminal`
const commandsPath = join(directory, 'commands')
const observationsPath = join(directory, 'observations')
const require = createRequire(import.meta.url)
const control = new Socket({ fd: 3, readable: true, writable: false })
let initial: Initial | undefined
let pty: Pty | undefined
let commands: number | undefined
let observations: number | undefined
let pending = Buffer.alloc(0)
let observed = Buffer.alloc(0)
let queued: Buffer = Buffer.alloc(0)
let stdin: Buffer = Buffer.alloc(0)
let active: ActiveLeg | undefined
let completion: { code: number; cwd: string } | undefined
let sentinels = idleSentinels
// Bytes read outside any segment, kept for the next segment's result up to the configured bound.
let between: Buffer[] = []
let betweenKept = 0
let betweenDiscarded = 0
let opened = false
let blocked = false
let detached = false
let ended = false
let timer: ReturnType<typeof setInterval> | undefined

const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is Record<string, string> =>
  record(value) && Object.values(value).every(v => typeof v === 'string')

function send(frame: Record<string, unknown>): void {
  if (detached) return
  if (!process.stdout.write(`${JSON.stringify({ ...frame, generation: initial?.generation })}\n`))
    blocked = true
}

function fail(): void {
  if (ended) return
  ended = true
  send({ t: 'fault' })
  if (timer !== undefined) clearInterval(timer)
  control.destroy()
  // The manager or a cold recovery stops the original scope. This gate cannot certify its own stop.
}

function errno(error: unknown): unknown {
  return error instanceof Error ? Reflect.get(error, 'code') : undefined
}

function readAvailable(fd: number, bound: number, consume: (bytes: Buffer) => void): boolean {
  const buffer = Buffer.allocUnsafe(bound)
  while (!blocked && !ended) {
    let length: number
    try {
      length = readSync(fd, buffer, 0, buffer.length, null)
    } catch (error) {
      if (errno(error) === 'EAGAIN') return true
      fail()
      return false
    }
    if (length === 0) return true
    consume(buffer.subarray(0, length))
  }
  return false
}

function writeAvailable(fd: number, bytes: Buffer): Buffer {
  if (bytes.length === 0) return bytes
  try {
    return bytes.subarray(writeSync(fd, bytes))
  } catch (error) {
    if (errno(error) !== 'EAGAIN') fail()
    return bytes
  }
}

function inOwnScope(): boolean {
  return ownUnitPlacement(unit).kind === 'inUnit'
}

function sendBytes(t: 'data' | 'between', leg: string, bytes: Uint8Array, bound: number): void {
  for (let at = 0; at < bytes.length; at += bound)
    send({ t, leg, b: Buffer.from(bytes.subarray(at, at + bound)).toString('base64') })
}

function keepBetween(bytes: Uint8Array, bound: number): void {
  const kept = Math.min(bytes.length, bound - betweenKept)
  if (kept > 0) between.push(Buffer.from(bytes.subarray(0, kept)))
  betweenKept += kept
  betweenDiscarded += bytes.length - kept
}

/** Applies one attributed piece of PTY output; false when the sentinel order is impossible. */
function attribute(piece: SentinelPiece, config: Initial): boolean {
  switch (piece.kind) {
    case 'between':
      keepBetween(piece.bytes, config.betweenSegmentBytes)
      return true
    case 'segment':
      if (active?.begun !== true || active.sawEnd) return false
      sendBytes('data', active.id, piece.bytes, config.maxChunkBytes)
      return true
    case 'begin':
      if (active === undefined || active.begun) return false
      sendBytes('between', active.id, Buffer.concat(between), config.maxChunkBytes)
      send({ t: 'begun', leg: active.id, discarded: betweenDiscarded })
      between = []
      betweenKept = 0
      betweenDiscarded = 0
      active.begun = true
      return true
    case 'end':
      if (active?.begun !== true || active.sawEnd) return false
      active.sawEnd = true
      return true
    default: {
      const exhaustive: never = piece
      return exhaustive
    }
  }
}

function readPty(bytes: Buffer, config: Initial): void {
  const step = scanSentinels(sentinels, bytes)
  sentinels = step.scan
  for (const piece of step.pieces) if (!attribute(piece, config)) return fail()
}

function observe(bytes: Buffer): void {
  const config = initial
  if (config === undefined || observed.length + bytes.length > config.maxControlBytes) return fail()
  observed = Buffer.concat([observed, bytes])
  for (;;) {
    const fields: string[] = []
    let at = 0
    for (let i = 0; i < 5; i++) {
      const end = observed.indexOf(0, at)
      if (end < 0) return
      fields.push(observed.subarray(at, end).toString('utf8'))
      at = end + 1
    }
    observed = observed.subarray(at)
    const [generation, id, kind, code, cwd] = fields
    if (generation !== config.generation || cwd === undefined || !cwd.startsWith('/')) return fail()
    if (kind === 'opened' && !opened && active === undefined && id === '') {
      opened = true
      send({ t: 'opened', cwd })
    } else if (kind === 'started' && active !== undefined && id === active.id) {
      send({ t: 'started', leg: id })
      stdin = active.stdin
    } else if (
      kind === 'finished' &&
      id === active?.id &&
      code !== undefined &&
      /^\d{1,3}$/u.test(code) &&
      Number(code) <= 255
    ) {
      // Other processes left in the scope do not veto completion; only the control channel decides.
      completion = { code: Number(code), cwd }
    } else return fail()
  }
}

function poll(): void {
  if (ended || blocked || initial === undefined) return
  try {
    if (commands !== undefined) queued = writeAvailable(commands, queued)
    if (pty !== undefined) stdin = writeAvailable(pty.fd, stdin)
    if (observations !== undefined) readAvailable(observations, initial.maxControlBytes, observe)
    if (pty === undefined) return
    const config = initial
    readAvailable(pty.fd, config.maxChunkBytes, bytes => readPty(bytes, config))
    // The finished observation and the end sentinel arrive on two unordered channels; both are needed.
    if (completion !== undefined && active?.sawEnd === true && !ended) {
      const released = releaseSentinels(sentinels)
      sentinels = released.scan
      for (const piece of released.pieces) if (!attribute(piece, config)) return fail()
      send({ t: 'finished', leg: active.id, ...completion })
      completion = undefined
      active = undefined
      stdin = Buffer.alloc(0)
    }
  } catch {
    fail()
  }
}

function shellDriver(config: Initial): string {
  return `exec 7<${quote(commandsPath)} 8>${quote(observationsPath)}
__omne_report() {
  local __omne_cwd
  __omne_cwd=$(builtin pwd -P; builtin printf .) || return 1
  __omne_cwd=\${__omne_cwd%?}
  __omne_cwd=\${__omne_cwd%?}
  builtin printf '%s\\0' ${quote(config.generation)} "$1" "$2" "$3" "$__omne_cwd" >&8
}
readonly -f __omne_report
__omne_report '' opened 0 || exit 1
while IFS= builtin read -r -d '' __omne_source <&7; do
  builtin eval "$__omne_source"
done
`
}

function start(config: Initial): void {
  const module: unknown = require('node-pty')
  const native: unknown = record(module) ? module['native'] : undefined
  const fork: unknown = record(native) ? native['fork'] : undefined
  if (typeof fork !== 'function') return fail()
  const result: unknown = Reflect.apply(fork, native, [
    '/bin/bash',
    ['--noprofile', '--norc', '-c', shellDriver(config)],
    Object.entries(config.env).map(([key, value]) => `${key}=${value}`),
    config.cwd,
    config.columns,
    config.rows,
    -1,
    -1,
    false,
    '',
    () => fail(),
  ])
  if (
    !record(result) ||
    !positive(result['pid']) ||
    typeof result['fd'] !== 'number' ||
    !Number.isInteger(result['fd']) ||
    result['fd'] < 0
  )
    return fail()
  pty = { fd: result['fd'], pid: result['pid'] }
  timer = setInterval(poll, 5)
}

function parseInitial(value: Record<string, unknown>): Initial | undefined {
  const {
    generation,
    cwd,
    env,
    columns,
    rows,
    maxChunkBytes,
    maxControlBytes,
    betweenSegmentBytes,
  } = value
  if (
    typeof generation !== 'string' ||
    typeof cwd !== 'string' ||
    !strings(env) ||
    !positive(columns) ||
    !positive(rows) ||
    !positive(maxChunkBytes) ||
    !positive(maxControlBytes) ||
    !positive(betweenSegmentBytes)
  )
    return undefined
  return {
    generation,
    cwd,
    env,
    columns,
    rows,
    maxChunkBytes,
    maxControlBytes,
    betweenSegmentBytes,
  }
}

function parseLeg(value: Record<string, unknown>): Leg | undefined {
  const { id, script, cwd, env, stdin } = value
  if (
    typeof id !== 'string' ||
    typeof script !== 'string' ||
    (cwd !== undefined && typeof cwd !== 'string') ||
    (env !== undefined && !strings(env)) ||
    typeof stdin !== 'string'
  )
    return undefined
  return {
    id,
    script,
    ...(cwd === undefined ? {} : { cwd }),
    ...(env === undefined ? {} : { env }),
    stdin: Buffer.from(stdin, 'base64'),
  }
}

/**
 * The driver writes the sentinels with the shell's builtin printf to the controlling terminal,
 * so they share the PTY's one ordered buffer with the script's bytes even after the script
 * redirected the shell's own output. The nonce reaches the shell through the command FIFO only.
 */
function sentinelWrite(mark: 'b' | 'e', nonce: string): string {
  return `builtin printf '\\033]7770;omne-${mark};%s\\a' ${quote(nonce)} >/dev/tty || return 125`
}

function legSource(leg: ActiveLeg): string {
  const environment = Object.entries(leg.env ?? {})
    .map(([key, value]) => `local -x ${key}=${quote(value)} || return 125`)
    .join('\n')
  const cwd =
    leg.cwd === undefined
      ? ''
      : `local __omne_oldcwd
__omne_oldcwd=$(builtin pwd -P; builtin printf .) || return 125
__omne_oldcwd=\${__omne_oldcwd%?}
__omne_oldcwd=\${__omne_oldcwd%?}
builtin cd -- ${quote(leg.cwd)} || return 125`
  const restore = leg.cwd === undefined ? '' : 'builtin cd -- "$__omne_oldcwd" || return 125'
  return `__omne_script() {
builtin eval ${quote(leg.script)}
}
__omne_leg() {
${sentinelWrite('b', leg.nonce)}
${environment}
${cwd}
__omne_report ${quote(leg.id)} started 0 || return 125
__omne_script
local __omne_code=$?
${restore}
${sentinelWrite('e', leg.nonce)}
__omne_report ${quote(leg.id)} finished "$__omne_code" || return 125
}
__omne_leg
if [ $? -ne 0 ]; then exit 125; fi
`
}

function message(value: unknown): void {
  if (!record(value)) return fail()
  if (initial === undefined) {
    initial = parseInitial(value)
    if (initial === undefined || !inOwnScope()) return fail()
    mkdirSync(directory, { mode: 0o700 })
    execFileSync('/usr/bin/mkfifo', ['--mode=600', commandsPath, observationsPath], {
      stdio: 'ignore',
    })
    commands = openSync(commandsPath, constants.O_RDWR | constants.O_NONBLOCK)
    observations = openSync(observationsPath, constants.O_RDWR | constants.O_NONBLOCK)
    send({ t: 'ready' })
    return
  }
  if (value['c'] === 'go' && pty === undefined) return start(initial)
  if (value['c'] === 'term' && pty !== undefined) {
    process.kill(pty.pid, 'SIGTERM')
    return
  }
  if (value['c'] !== 'execute' || !opened || active !== undefined) return fail()
  const leg = parseLeg(value)
  if (leg === undefined) return fail()
  active = { ...leg, nonce: randomBytes(16).toString('hex'), begun: false, sawEnd: false }
  sentinels = watchSentinels(sentinels, active.nonce)
  queued = Buffer.from(`${legSource(active)}\0`)
  poll()
}

control.on('data', (bytes: Buffer) => {
  try {
    const bound = initial?.maxControlBytes ?? 1024 * 1024
    if (pending.length + bytes.length > bound) return fail()
    pending = Buffer.concat([pending, bytes])
    for (let at = pending.indexOf(10); at !== -1; at = pending.indexOf(10)) {
      const line = pending.subarray(0, at).toString('utf8')
      pending = pending.subarray(at + 1)
      message(JSON.parse(line))
      if (ended) return
    }
  } catch {
    fail()
  }
})
control.on('error', fail)
control.on('end', () => {
  if (pty === undefined) process.exit(0)
})
process.stdout.on('drain', () => {
  blocked = false
  poll()
})
process.stdout.on('error', () => {
  detached = true
  blocked = false
})
process.on('exit', () => {
  for (const fd of [commands, observations, pty?.fd]) {
    if (fd === undefined) continue
    try {
      closeSync(fd)
    } catch {
      /* The descriptor may already be closed after a failed launch. */
    }
  }
})
