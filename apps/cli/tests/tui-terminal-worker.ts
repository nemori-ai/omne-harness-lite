import { openTerminal } from '../dist/tui/terminal.js'

process.stdout.write('SHELL_BEFORE\r\n')
try {
  const terminal = await openTerminal('xterm-379')
  try {
    await terminal.write('\x1b[H\x1b[2JPRIVATE_UI_FRAME')
    if (process.argv[2] === 'work-failure') throw new Error('controlled work failure')
  } finally {
    await terminal.stopInput()
    await terminal.restore()
  }
  process.stdout.write('SHELL_AFTER\r\n')
} catch {
  process.stdout.write('WORK_FAILED\r\n')
  process.exitCode = 70
}
