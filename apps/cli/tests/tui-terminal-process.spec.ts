// @module-tag slow
// Actual Node terminal state uses a PTY; the peer only answers terminal mode queries.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const peer = String.raw`
import os, pty, subprocess, select, time, termios, fcntl, struct, re, json, sys
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))
before = termios.tcgetattr(slave)
modes = {2004: int(sys.argv[5]), 1049: int(sys.argv[4])}
initial = dict(modes)
command = [sys.argv[1], '--experimental-strip-types', sys.argv[2], sys.argv[3]]
if sys.argv[6] != 'default':
    command.append(sys.argv[6])
environment = dict(os.environ)
environment.pop('DISPLAY', None)
environment.pop('OMNE_TERMINAL_PROFILE', None)
child = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, env=environment)
data = b''
scanned = 0
interleaved = False
end = time.monotonic() + 15
while time.monotonic() < end:
    ready, _, _ = select.select([master], [], [], 0.05)
    if ready:
        try:
            data += os.read(master, 65536)
        except OSError:
            if child.poll() is not None:
                break
            raise
        start = scanned
        for match in re.finditer(rb'\x1b\[\?(2004|1049)(h|l|\$p)', data[scanned:]):
            mode, action = int(match[1]), match[2]
            if action == b'$p':
                reply = ('\x1b[?%d;%d$y' % (mode, modes[mode])).encode()
                if sys.argv[3] in ('interleaved', 'late-interleaved') and mode == 2004 and modes[mode] == 1 and not interleaved:
                    interleaved = True
                    os.write(master, b'\x1b[200~' + b'a' * 758 + b'\x1b[20')
                    time.sleep(2.2 if sys.argv[3] == 'late-interleaved' else 0.02)
                    os.write(master, reply)
                    time.sleep(0.02)
                    os.write(master, b'1~')
                else:
                    os.write(master, reply)
            else:
                modes[mode] = 1 if action == b'h' else 2
            scanned = start + match.end()
    if child.poll() is not None and not select.select([master], [], [], 0)[0]:
        break
else:
    child.kill()
    raise RuntimeError('terminal worker timed out')
print(json.dumps({'exit': child.wait(), 'raw': data.decode('utf8'), 'before': initial, 'after': modes, 'termiosRestored': before == termios.tcgetattr(slave)}))
os.close(master)
os.close(slave)
`
function run(mode: string, alternate = '2', paste = '2', profile = 'xterm-379') {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        peer,
        process.execPath,
        fileURLToPath(new URL('./tui-terminal-worker.ts', import.meta.url)),
        mode,
        alternate,
        paste,
        profile,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    ),
  )
}
it.each(['normal', 'work-failure'])(
  'pairs the alternate screen around the actual terminal work: %s',
  mode => {
    const result = run(mode)
    expect(result.raw).toContain('\x1b[?1049h')
    expect(result.raw).toContain('\x1b[?1049l')
    expect(result.raw.indexOf('\x1b[?1049h')).toBeLessThan(result.raw.indexOf('PRIVATE_UI_FRAME'))
    expect(result.raw.indexOf('PRIVATE_UI_FRAME')).toBeLessThan(result.raw.indexOf('\x1b[?1049l'))
    expect(result.after).toEqual(result.before)
    expect(result.termiosRestored).toBe(true)
    expect(result.exit).toBe(mode === 'normal' ? 0 : 70)
  },
)
it('rejects an already active alternate screen without leaving it or drawing a frame', () => {
  const result = run('normal', '1')
  expect(result.exit).toBe(70)
  expect(result.raw).not.toContain('PRIVATE_UI_FRAME')
  expect(result.raw).not.toContain('\x1b[?1049l')
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it.each(['default', '', 'auto'])(
  'opens an ordinary PTY without DISPLAY using the %j profile',
  profile => {
    const result = run('normal', '2', '2', profile)
    expect(result.raw).toContain('PRIVATE_UI_FRAME')
    expect(result.raw).toContain('SHELL_AFTER')
    expect(result.exit).toBe(0)
    expect(result.after).toEqual(result.before)
    expect(result.termiosRestored).toBe(true)
  },
)
it('restores modes and termios after work fails with the default profile', () => {
  const result = run('work-failure', '2', '2', 'default')
  expect(result.raw).toContain('PRIVATE_UI_FRAME')
  expect(result.raw).toContain('\x1b[?1049l')
  expect(result.exit).toBe(70)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it('does not take an occupied alternate screen with the default profile', () => {
  const result = run('normal', '1', '2', 'default')
  expect(result.raw).not.toContain('PRIVATE_UI_FRAME')
  expect(result.raw).not.toContain('\x1b[?1049l')
  expect(result.exit).toBe(70)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it('preserves an already enabled paste mode with the default profile', () => {
  const result = run('normal', '2', '1', 'default')
  expect(result.raw).toContain('PRIVATE_UI_FRAME')
  expect(result.raw).not.toContain('\x1b[?2004h')
  expect(result.raw).not.toContain('\x1b[?2004l')
  expect(result.exit).toBe(0)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it('still rejects an explicitly unknown profile before taking terminal ownership', () => {
  const result = run('normal', '2', '2', 'not-supported')
  expect(result.raw).not.toContain('PRIVATE_UI_FRAME')
  expect(result.raw).not.toContain('\x1b[?2004$p')
  expect(result.raw).not.toContain('\x1b[?1049h')
  expect(result.exit).toBe(70)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it('accepts a 768 + 11 + 2 byte interleaved paste report with the default profile', () => {
  const result = run('interleaved', '2', '1', 'default')
  expect(result.raw).toContain('PRIVATE_UI_FRAME')
  expect(result.raw).toContain('SHELL_AFTER')
  expect(result.exit).toBe(0)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
it('drains a paste with a complete reply arriving after the query timeout', () => {
  const result = run('late-interleaved', '2', '1', 'default')
  expect(result.raw).not.toContain('PRIVATE_UI_FRAME')
  expect(result.raw).toContain('WORK_FAILED')
  expect(result.exit).toBe(70)
  expect(result.after).toEqual(result.before)
  expect(result.termiosRestored).toBe(true)
})
