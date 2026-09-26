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
