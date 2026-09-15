import { fork } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createJsonlProvider } from '@omne-harness-lite/jsonl'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDiagnostics,
  createScratch,
  operation,
  operationInput,
  providerOptions,
  streamAppend,
} from './fixtures.js'

const lockChild = new URL('./fixtures/writer-lock-child.mjs', import.meta.url)
const scratch = new Set<string>()

afterEach(async () => {
  await Promise.all([...scratch].map(path => rm(path, { recursive: true, force: true })))
  scratch.clear()
})

function childMessage(child: ReturnType<typeof fork>): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, rejectMessage) => {
    const onMessage = (message: unknown) => {
      cleanup()
      resolveMessage(message as Record<string, unknown>)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      rejectMessage(new Error(`child exited before message: code=${code} signal=${signal}`))
    }
    const cleanup = () => {
      child.off('message', onMessage)
      child.off('exit', onExit)
    }
    child.once('message', onMessage)
    child.once('exit', onExit)
  })
}

describe('A06 real process writer exclusion', () => {
  it('keeps one stable lock inode through SIGSTOP and advances epoch after SIGKILL takeover', async () => {
    const directory = await createScratch('writer-process-')
    scratch.add(directory)
    const records = join(directory, 'records')
    await mkdir(records)
    const child = fork(lockChild, [records, join(directory, 'child-diagnostics')], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    let parentDiagnostics: Awaited<ReturnType<typeof createDiagnostics>> | undefined
    let parentWriter: Awaited<ReturnType<ReturnType<typeof createJsonlProvider>['acquireWriter']>>
    try {
      const acquiredByChild = await childMessage(child)
      expect(acquiredByChild).toMatchObject({ status: 'acquired', epoch: '1' })
      const before = await lstat(join(records, '.writer.lock'), { bigint: true })

      process.kill(child.pid!, 'SIGSTOP')
      parentDiagnostics = await createDiagnostics(
        join(directory, 'parent-diagnostics'),
        'writer-lock-parent',
      )
      const provider = createJsonlProvider(
        providerOptions(records, ['session']),
        parentDiagnostics.runtime.diagnostics,
      )
      await expect(provider.acquireWriter()).resolves.toEqual({ status: 'busy' })
      const during = await lstat(join(records, '.writer.lock'), { bigint: true })
      expect({ dev: during.dev, ino: during.ino }).toEqual({ dev: before.dev, ino: before.ino })

      process.kill(child.pid!, 'SIGKILL')
      await once(child, 'exit')
      parentWriter = await provider.acquireWriter()
      expect(parentWriter.status).toBe('acquired')
      if (parentWriter.status !== 'acquired') return
      expect(BigInt(parentWriter.writer.writerEpoch)).toBeGreaterThan(
        BigInt(String(acquiredByChild.epoch)),
      )
      const after = await lstat(join(records, '.writer.lock'), { bigint: true })
      expect({ dev: after.dev, ino: after.ino }).toEqual({ dev: before.dev, ino: before.ino })
      await expect(parentWriter.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      if (parentDiagnostics !== undefined) {
        await parentDiagnostics.runtime.close({ deadlineMs: 1_000 })
        await parentDiagnostics.owner.close({ deadlineMs: 1_000 })
      }
    }
  })
})

describe('A07 real journal recovery boundaries', () => {
  it('preserves and repairs only an incomplete LF tail before accepting new work', async () => {
    const directory = await createScratch('tail-recovery-')
    scratch.add(directory)
    const records = join(directory, 'records')
    await mkdir(records)
    const diagnostics = await createDiagnostics(join(directory, 'diagnostics'), 'tail-recovery')
    try {
      const provider = createJsonlProvider(
        providerOptions(records, ['session']),
        diagnostics.runtime.diagnostics,
      )
      const first = await provider.acquireWriter()
      expect(first.status).toBe('acquired')
      if (first.status !== 'acquired') return
      await expect(first.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
      const journal = join(records, 'journal.jsonl')
      await appendFile(journal, '{"incomplete":true')
      const damaged = await readFile(journal)

      const reopened = await provider.acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      const evidence = (await readdir(records)).filter(name => name.startsWith('journal.recovery-'))
      expect(evidence).toHaveLength(1)
      expect(await readFile(join(records, evidence[0]!))).toEqual(damaged)
      expect((await readFile(journal)).at(-1)).toBe(0x0a)
      await expect(reopened.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
    } finally {
      await diagnostics.runtime.close({ deadlineMs: 1_000 })
      await diagnostics.owner.close({ deadlineMs: 1_000 })
    }
  })

  it('refuses a complete corrupt line without replacing the existing history', async () => {
    const directory = await createScratch('complete-corruption-')
    scratch.add(directory)
    const records = join(directory, 'records')
    await mkdir(records)
    const diagnostics = await createDiagnostics(
      join(directory, 'diagnostics'),
      'complete-corruption',
    )
    try {
      const provider = createJsonlProvider(
        providerOptions(records, ['session']),
        diagnostics.runtime.diagnostics,
      )
      const first = await provider.acquireWriter()
      expect(first.status).toBe('acquired')
      if (first.status !== 'acquired') return
      await expect(first.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
      const journal = join(records, 'journal.jsonl')
      await appendFile(journal, '{"complete":"but-invalid"}\n')
      const damaged = await readFile(journal)

      const refused = await provider.acquireWriter()
      expect(refused).toMatchObject({
        status: 'unavailable',
        cleanup: { status: 'released' },
      })
      expect(await readFile(journal)).toEqual(damaged)
      expect((await readdir(records)).filter(name => name.startsWith('journal.recovery-'))).toEqual(
        [],
      )
    } finally {
      await diagnostics.runtime.close({ deadlineMs: 1_000 })
      await diagnostics.owner.close({ deadlineMs: 1_000 })
    }
  })

  it('recovers a complete committed operation under a new epoch and rejects the old writer', async () => {
    const directory = await createScratch('operation-recovery-')
    scratch.add(directory)
    const records = join(directory, 'records')
    await mkdir(records)
    const diagnostics = await createDiagnostics(
      join(directory, 'diagnostics'),
      'operation-recovery',
    )
    try {
      const provider = createJsonlProvider(
        providerOptions(records, ['session']),
        diagnostics.runtime.diagnostics,
      )
      const first = await provider.acquireWriter()
      expect(first.status).toBe('acquired')
      if (first.status !== 'acquired') return
      const preparedOperation = first.writer.prepareOperation(
        operation('recover-me'),
        operationInput('recover-me'),
      )
      expect(preparedOperation.ok).toBe(true)
      if (!preparedOperation.ok) return
      const prepared = first.writer.prepare({
        operation: preparedOperation.value,
        appends: [streamAppend('session', 'recover-me')],
        result: { value: 'original' },
        requiredUses: [],
      })
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const submission = first.writer.commit(prepared.value)
      expect(submission.status).toBe('pending_durability')
      if (submission.status !== 'pending_durability') return
      const committed = await submission.completion
      expect(committed).toMatchObject({ status: 'committed' })
      const lateOperation = first.writer.prepareOperation(
        operation('late-old-writer'),
        operationInput('late-old-writer'),
      )
      expect(lateOperation.ok).toBe(true)
      if (!lateOperation.ok) return
      const latePrepared = first.writer.prepare({
        operation: lateOperation.value,
        appends: [streamAppend('session', 'late-old-writer', '1')],
        result: { value: 'must-not-append' },
        requiredUses: [],
      })
      expect(latePrepared.ok).toBe(true)
      if (!latePrepared.ok) return
      const firstEpoch = first.writer.writerEpoch
      await expect(first.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
      const closedJournal = await readFile(join(records, 'journal.jsonl'))
      expect(first.writer.commit(prepared.value)).toMatchObject({ status: 'unavailable' })
      expect(first.writer.commit(latePrepared.value)).toMatchObject({ status: 'unavailable' })
      expect(await readFile(join(records, 'journal.jsonl'))).toEqual(closedJournal)

      const reopened = await provider.acquireWriter()
      expect(reopened.status).toBe('acquired')
      if (reopened.status !== 'acquired') return
      expect(BigInt(reopened.writer.writerEpoch)).toBeGreaterThan(BigInt(firstEpoch))
      await expect(reopened.writer.lookupOperation(operation('recover-me'))).resolves.toEqual(
        expect.objectContaining({
          status: 'committed',
          receipt: expect.objectContaining({
            outcome: { status: 'committed', result: { value: 'original' } },
          }),
        }),
      )
      await expect(reopened.writer.closeWriter()).resolves.toMatchObject({ status: 'closed' })
    } finally {
      await diagnostics.runtime.close({ deadlineMs: 1_000 })
      await diagnostics.owner.close({ deadlineMs: 1_000 })
    }
  })
})
