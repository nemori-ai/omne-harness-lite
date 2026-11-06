// Fast: the session reader's answers as the macOS backend reads them, with a stand-in reader
// script. A reader that fails, times out or prints something else is never read as an empty
// session or as a confirmed stop. Runs on every platform; the real reader is in primitives.spec.ts.
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ownSessions,
  parseIdentity,
  parseMembers,
  parseStop,
  readMembers,
  stopRecordedDomain,
  stopSessions,
} from '../../src/macos-execution/session.ts'

let directory = ''
const reader = async (name: string, body: string) => {
  const path = join(directory, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return path
}

beforeAll(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-session-')))
})
afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('reader answers', () => {
  it('reads members line by line and an empty answer as no member', () => {
    expect(parseMembers('12 12 12\n13 12 12\n20 20 12\n')).toEqual([
      { pid: 12, pgid: 12, sid: 12 },
      { pid: 13, pgid: 12, sid: 12 },
      { pid: 20, pgid: 20, sid: 12 },
    ])
    expect(parseMembers('')).toEqual([])
  })

  it.each(['12 12', '12 12 12 12', 'a 12 12', '12 -1 12', '12 0 12', '12  12 12'])(
    'refuses the members line %j',
    line => {
      expect(parseMembers(`${line}\n`)).toBeUndefined()
    },
  )

  it('reads an identity, pads the microseconds, and reads gone', () => {
    expect(parseIdentity('400 1793777328 75378\n')).toEqual({
      kind: 'alive',
      sid: 400,
      start: '1793777328.075378',
    })
    expect(parseIdentity('gone\n')).toEqual({ kind: 'gone' })
  })

  it.each(['', '400 1', '400 1 2 3', 'x 1 2', '400 -1 2', '400 1 x'])(
    'refuses the identity %j',
    text => {
      expect(parseIdentity(text)).toBeUndefined()
    },
  )

  it('reads a stop answer and nothing else', () => {
    expect(parseStop('confirmed\n')).toBe('confirmed')
    expect(parseStop('unconfirmed 3\n')).toBe('unconfirmed')
    expect(parseStop('unconfirmed\n')).toBeUndefined()
    expect(parseStop('confirmed 0\n')).toBeUndefined()
    expect(parseStop('')).toBeUndefined()
  })
})

describe('a reader that does not answer', () => {
  it('passes the excepted pid and the sessions in order', async () => {
    const echo = await reader('echo-args', 'echo "$@" >&2; [ "$*" = "members 7 40 41" ] || exit 1')
    expect(
      await readMembers({ reader: echo, sessions: [40, 41], except: 7, boundMs: 5_000 }),
    ).toEqual([])
    expect(await readMembers({ reader: echo, sessions: [40, 41], boundMs: 5_000 })).toBeUndefined()
  })

  it('reads no session as no member without asking', async () => {
    const failing = await reader('never', 'exit 1')
    expect(await readMembers({ reader: failing, sessions: [], boundMs: 5_000 })).toEqual([])
    expect(await stopSessions({ reader: failing, sessions: [], boundMs: 5_000 })).toBe('confirmed')
  })

  it('reads a failed, late or garbled members answer as unknown, not as empty', async () => {
    const failed = await reader('failed', 'exit 1')
    const late = await reader('late', 'sleep 5; echo')
    const garbled = await reader('garbled', 'echo "12 12"')
    for (const path of [failed, late, garbled])
      expect(await readMembers({ reader: path, sessions: [40], boundMs: 300 })).toBeUndefined()
  })

  it('answers unconfirmed for a failed, late, garbled or unconfirmed stop', async () => {
    const failed = await reader('stop-failed', 'echo confirmed; exit 1')
    const garbled = await reader('stop-garbled', 'echo confirm')
    const unconfirmed = await reader('stop-unconfirmed', 'echo "unconfirmed 2"')
    const late = await reader('stop-late', 'sleep 5; echo confirmed')
    for (const path of [failed, garbled, unconfirmed])
      expect(await stopSessions({ reader: path, sessions: [40], boundMs: 1_000 })).toBe(
        'unconfirmed',
      )
    // The reader gets the bound and two more seconds; a reader past that is unconfirmed.
    expect(await stopSessions({ reader: late, sessions: [40], boundMs: 1 })).toBe('unconfirmed')
  })

  it('passes the bound, the excepted pid and the sessions to the stop', async () => {
    const strict = await reader(
      'stop-strict',
      '[ "$*" = "stop 250 9 40 41" ] && echo confirmed || exit 1',
    )
    expect(
      await stopSessions({ reader: strict, sessions: [40, 41], except: 9, boundMs: 250.7 }),
    ).toBe('confirmed')
  })
})

describe('recorded domains', () => {
  const coordinate = {
    bootId: 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D',
    sessions: [
      { sid: 400, start: '1793777328.075378' },
      { sid: 401, start: '1793777329.000001' },
    ],
  }

  it('keeps a session whose leader is gone or the same, and drops a reused leader pid', async () => {
    const identity = await reader(
      'identity',
      'case "$2" in 400) echo gone;; 401) echo "401 1793777329 1";; 402) echo "402 9 9";; esac',
    )
    expect(
      await ownSessions({
        reader: identity,
        sessions: [...coordinate.sessions, { sid: 402, start: '1.000001' }],
        boundMs: 5_000,
      }),
    ).toEqual([400, 401])
  })

  it('reads an unreadable identity as unknown', async () => {
    const failing = await reader('identity-failed', 'exit 1')
    expect(
      await ownSessions({ reader: failing, sessions: coordinate.sessions, boundMs: 5_000 }),
    ).toBeUndefined()
    expect(
      await stopRecordedDomain({
        reader: failing,
        coordinate,
        bootId: coordinate.bootId,
        boundMs: 5_000,
      }),
    ).toBe('unconfirmed')
  })

  it('stops a domain of another boot without asking, and an unknown boot is unconfirmed', async () => {
    const failing = await reader('boot-never', 'exit 1')
    expect(
      await stopRecordedDomain({ reader: failing, coordinate, bootId: 'OTHER', boundMs: 5_000 }),
    ).toBe('confirmed')
    expect(
      await stopRecordedDomain({ reader: failing, coordinate, bootId: undefined, boundMs: 5_000 }),
    ).toBe('unconfirmed')
  })

  it('stops only the sessions that are still the domain own', async () => {
    const both = await reader(
      'identity-and-stop',
      'case "$1" in identity) [ "$2" = 400 ] && echo gone || echo "$2 9 9";; stop) [ "$*" = "stop 5000 0 400" ] && echo confirmed || exit 1;; esac',
    )
    expect(
      await stopRecordedDomain({
        reader: both,
        coordinate,
        bootId: coordinate.bootId,
        boundMs: 5_000,
      }),
    ).toBe('confirmed')
  })
})
