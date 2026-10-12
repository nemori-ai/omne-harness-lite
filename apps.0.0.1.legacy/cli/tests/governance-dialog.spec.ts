import { expect, it, vi } from 'vitest'
import { usingGovernanceDialog } from '../src/governance-dialog.ts'
import { FakeTerminal, tick } from './support/tui.ts'

it('owns input and restores the actual terminal after the business work completes', async () => {
  const terminal = new FakeTerminal()
  const outcome = { kind: 'blocked', reason: 'example' } as const
  expect(
    await usingGovernanceDialog(
      new AbortController().signal,
      async () => terminal,
      async () => ({ outcome, diagnostics: [] }),
    ),
  ).toEqual({ outcome, diagnostics: [] })
  expect(terminal.stopped).toBe(true)
  expect(terminal.restored).toBe(true)
})
it('keeps the original business result when restoration fails', async () => {
  const terminal = new FakeTerminal(),
    failure = new Error('original restore failure')
  vi.spyOn(terminal, 'restore').mockRejectedValue(failure)
  const result = await usingGovernanceDialog(
    new AbortController().signal,
    async () => terminal,
    async () => ({
      outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
      diagnostics: [],
    }),
  )
  expect(result).toEqual({
    outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
    diagnostics: ['input-restore-failed'],
  })
})
it('preserves original work and restoration errors without replacing either', async () => {
  const terminal = new FakeTerminal(),
    work = new Error('work secret'),
    restore = new Error('restore secret')
  vi.spyOn(terminal, 'restore').mockRejectedValue(restore)
  await expect(
    usingGovernanceDialog(
      new AbortController().signal,
      async () => terminal,
      async () => {
        throw work
      },
    ),
  ).rejects.toMatchObject({ errors: [work, restore] })
})
it('cancels a live dialog and propagates stopping to actual command work before restoration', async () => {
  const terminal = new FakeTerminal()
  let stopped = false
  const running = usingGovernanceDialog(
    new AbortController().signal,
    async () => terminal,
    async (dialog, signal) => {
      const answer = await dialog.text('Organization')
      stopped = signal.aborted
      expect(answer).toBeUndefined()
      return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
    },
  )
  void running.catch(() => undefined)
  await tick()
  terminal.key('\x03')
  expect(await running).toMatchObject({ outcome: { kind: 'blocked', reason: 'input-cancelled' } })
  expect(stopped).toBe(true)
  expect(terminal.restored).toBe(true)
})
it('does not acquire a terminal when the original signal has already stopped', async () => {
  const controller = new AbortController()
  controller.abort()
  const factory = vi.fn(async () => new FakeTerminal()),
    work = vi.fn()
  expect(await usingGovernanceDialog(controller.signal, factory, work)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
  })
  expect(factory).not.toHaveBeenCalled()
  expect(work).not.toHaveBeenCalled()
})
it('ends a pending prompt on failed input drain without restoring while input ownership is uncertain', async () => {
  const terminal = new FakeTerminal(),
    drain = new Error('original drain failure')
  vi.spyOn(terminal, 'stopInput').mockRejectedValue(drain)
  const running = usingGovernanceDialog(
    new AbortController().signal,
    async () => terminal,
    async dialog => {
      expect(await dialog.text('Pending')).toBeUndefined()
      return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
    },
  )
  void running.catch(() => undefined)
  await tick()
  terminal.key('\x03')
  expect(await running).toMatchObject({ diagnostics: ['input-restore-failed'] })
  expect(terminal.restored).toBe(false)
}, 1000)
