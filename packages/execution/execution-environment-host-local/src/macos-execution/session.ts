import { execFile } from 'node:child_process'

/** One POSIX session of a domain: its id (the leader's pid) and the leader's start time. */
export type RecordedSession = Readonly<{ sid: number; start: string }>

/**
 * Where a macOS domain lives: the sessions the provider created for it, in one boot. A command has
 * the gate's session; a terminal has the gate's session and the shell's.
 */
export type SessionCoordinate = Readonly<{
  bootId: string
  sessions: readonly RecordedSession[]
}>

export type SessionMember = Readonly<{ pid: number; pgid: number; sid: number }>
export type StopStatus = 'confirmed' | 'unconfirmed'
export type Identity =
  | Readonly<{ kind: 'gone' }>
  | Readonly<{ kind: 'alive'; sid: number; start: string }>

export const positive = (text: string | undefined): number | undefined => {
  if (text === undefined || !/^[0-9]+$/u.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** The reader's `members` answer; undefined when a line does not parse. */
export function parseMembers(text: string): readonly SessionMember[] | undefined {
  const members: SessionMember[] = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    const parts = line.split(' ')
    if (parts.length !== 3) return undefined
    const [pid, pgid, sid] = parts.map(positive)
    if (pid === undefined || pgid === undefined || sid === undefined) return undefined
    members.push({ pid, pgid, sid })
  }
  return members
}

/** The reader's `identity` answer; undefined when it does not parse. */
export function parseIdentity(text: string): Identity | undefined {
  const line = text.trim()
  if (line === 'gone') return { kind: 'gone' }
  const parts = line.split(' ')
  if (parts.length !== 3) return undefined
  const sid = positive(parts[0])
  const seconds = parts[1]
  const micros = parts[2]
  if (sid === undefined || seconds === undefined || micros === undefined) return undefined
  if (!/^[0-9]+$/u.test(seconds) || !/^[0-9]+$/u.test(micros)) return undefined
  return { kind: 'alive', sid, start: `${seconds}.${micros.padStart(6, '0')}` }
}

/** The reader's `stop` answer; undefined when it does not parse. */
export function parseStop(text: string): StopStatus | undefined {
  const line = text.trim()
  if (line === 'confirmed') return 'confirmed'
  return /^unconfirmed [0-9]+$/u.test(line) ? 'unconfirmed' : undefined
}

/** Runs the reader within `boundMs`; undefined when it failed, timed out or exited non-zero. */
function ask(
  reader: string,
  args: readonly string[],
  boundMs: number,
): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(
      reader,
      [...args],
      { timeout: Math.max(1, Math.ceil(boundMs)), maxBuffer: 16 * 1024 * 1024, env: {} },
      (error, stdout) => resolve(error === null ? stdout : undefined),
    )
  })
}

/** The live members of the sessions, `except` left out; undefined when they cannot be read. */
export async function readMembers(input: {
  reader: string
  sessions: readonly number[]
  except?: number | undefined
  boundMs: number
}): Promise<readonly SessionMember[] | undefined> {
  if (input.sessions.length === 0) return []
  const out = await ask(
    input.reader,
    ['members', String(input.except ?? 0), ...input.sessions.map(String)],
    input.boundMs,
  )
  return out === undefined ? undefined : parseMembers(out)
}

export async function readIdentity(input: {
  reader: string
  pid: number
  boundMs: number
}): Promise<Identity | undefined> {
  const out = await ask(input.reader, ['identity', String(input.pid)], input.boundMs)
  return out === undefined ? undefined : parseIdentity(out)
}

/**
 * Kills every live member of the sessions and their process groups until two readings in a row
 * are empty. A failed or late reader answers `unconfirmed`, never `confirmed`.
 */
export async function stopSessions(input: {
  reader: string
  sessions: readonly number[]
  except?: number | undefined
  boundMs: number
}): Promise<StopStatus> {
  if (input.sessions.length === 0) return 'confirmed'
  const bound = Math.max(1, Math.floor(input.boundMs))
  const out = await ask(
    input.reader,
    ['stop', String(bound), String(input.except ?? 0), ...input.sessions.map(String)],
    bound + 2_000,
  )
  return (out === undefined ? undefined : parseStop(out)) ?? 'unconfirmed'
}

/** This boot's identity; `kern.boottime` is not used because a clock step changes it. */
export function readBootId(): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(
      '/usr/sbin/sysctl',
      ['-n', 'kern.bootsessionuuid'],
      { timeout: 5_000, env: {} },
      (error, stdout) => {
        const value = stdout.trim()
        resolve(error === null && /^[0-9A-F-]{36}$/iu.test(value) ? value : undefined)
      },
    )
  })
}

/**
 * The sessions of a recorded domain that are still this domain's. A leader pid that names a live
 * process with another start time was reused: that session is gone. A leader that is gone leaves
 * its session id to the members still in it, since a pid that is a session id is not reused.
 * Undefined when an identity cannot be read.
 */
export async function ownSessions(input: {
  reader: string
  sessions: readonly RecordedSession[]
  boundMs: number
}): Promise<readonly number[] | undefined> {
  const own: number[] = []
  for (const session of input.sessions) {
    const identity = await readIdentity({
      reader: input.reader,
      pid: session.sid,
      boundMs: input.boundMs,
    })
    if (identity === undefined) return undefined
    if (identity.kind === 'gone' || identity.start === session.start) own.push(session.sid)
  }
  return own
}

/**
 * Stops a recorded domain and confirms it empty. A domain of another boot is stopped: nothing of
 * that boot lives. An unreadable identity answers `unconfirmed`.
 */
export async function stopRecordedDomain(input: {
  reader: string
  coordinate: SessionCoordinate
  bootId: string | undefined
  boundMs: number
}): Promise<StopStatus> {
  if (input.bootId !== undefined && input.bootId !== input.coordinate.bootId) return 'confirmed'
  if (input.bootId === undefined) return 'unconfirmed'
  const sessions = await ownSessions({
    reader: input.reader,
    sessions: input.coordinate.sessions,
    boundMs: input.boundMs,
  })
  if (sessions === undefined) return 'unconfirmed'
  return stopSessions({ reader: input.reader, sessions, boundMs: input.boundMs })
}
