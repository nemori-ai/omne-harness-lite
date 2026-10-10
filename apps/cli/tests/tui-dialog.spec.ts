import { expect, it } from 'vitest'
import { Dialog } from '../src/tui/dialog.ts'
import { FakeTerminal, tick } from './support/tui.ts'
it('keeps an entire typing burst but Enter cannot confirm before the new value is shown', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  const read = dialog.text('Name')
  await tick()
  for (const text of 'abc中文🙂') terminal.key(text)
  terminal.key('\r')
  let done = false
  void read.then(() => {
    done = true
  })
  await tick()
  expect(done).toBe(false)
  terminal.key('\r')
  expect(await read).toBe('abc中文🙂')
  await dialog.stop()
})
it('old or hidden frames cannot authorize confirmation after resize', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  const read = dialog.text('Confirm')
  await tick()
  terminal.size = { columns: 20, rows: 10 }
  terminal.resized()
  await tick()
  terminal.paste('2')
  terminal.key('\r')
  terminal.size = { columns: 100, rows: 50 }
  terminal.resized()
  await tick()
  terminal.key('\r')
  expect(await read).toBe('')
  await dialog.stop()
})
it('a paste cannot submit the next dialog or bypass unread pages', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  terminal.size = { columns: 60, rows: 16 }
  const read = dialog.text(
    'Review',
    Array.from({ length: 20 }, (_, i) => `line ${i}`),
  )
  await tick()
  terminal.paste('2')
  await tick()
  terminal.key('\r')
  await tick()
  let done = false
  void read.then(() => {
    done = true
  })
  expect(done).toBe(false)
  for (let i = 0; i < 10; i++) {
    terminal.key('\x1b[6~')
    await tick()
  }
  terminal.key('\r')
  expect(await read).toBe('2')
  const next = dialog.text('Next')
  terminal.key('\r') // stale immediate key, before first actual frame
  await tick()
  terminal.key('\r')
  expect(await next).toBe('')
  await dialog.stop()
})
it('stop waits outstanding output before ending the prompt', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  const gate = Promise.withResolvers<void>()
  terminal.gate = gate.promise
  const read = dialog.text('Pending')
  await tick()
  let done = false
  void read.then(() => {
    done = true
  })
  const stop = dialog.stop()
  await tick()
  expect(done).toBe(false)
  gate.resolve()
  await stop
  expect(await read).toBeUndefined()
})

it('paints progress without requiring Enter and never queues typing into the next prompt', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  dialog.progress('Assistant', ['partial'])
  await tick()
  terminal.key('x')
  terminal.key('\r')
  dialog.progress('Assistant', ['partial response'])
  await tick()
  expect(terminal.frames.join('')).toContain('partial response')
  const read = dialog.text('Message')
  await tick()
  terminal.key('\r')
  expect(await read).toBe('')
  await dialog.stop()
})

it('preserves a page being read during progress and resumes following on the last page', async () => {
  const terminal = new FakeTerminal(),
    dialog = new Dialog(terminal, () => {})
  terminal.size = { columns: 80, rows: 16 }
  const lines = Array.from({ length: 18 }, (_, i) => `line ${i}`)
  dialog.progress('Assistant', lines)
  await tick()
  expect(terminal.frames.at(-1)).toContain('Page 3/3')
  terminal.key('\x1b[5~')
  await tick()
  expect(terminal.frames.at(-1)).toContain('Page 2/3')
  dialog.progress('Assistant', [...lines, 'line 18', 'line 19', 'line 20', 'line 21'])
  await tick()
  expect(terminal.frames.at(-1)).toContain('Page 2/4')
  terminal.key('\x1b[6~')
  await tick()
  terminal.key('\x1b[6~')
  await tick()
  dialog.progress('Assistant', [...lines, ...Array.from({ length: 12 }, (_, i) => `new ${i}`)])
  await tick()
  expect(terminal.frames.at(-1)).toContain('Page 5/5')
  await dialog.stop()
})
