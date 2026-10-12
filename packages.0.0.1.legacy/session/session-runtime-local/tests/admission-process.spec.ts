// @module-tag slow
import { fork } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createLocalAdmission,
  admissionMigrations,
  type AdmissionTicket,
  type AdmissionProbe,
} from '../src/index.ts'

it('preserves the pre-query barrier after SIGKILL between received rejection and settlement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omne-admission-crash-'))
  const file = join(root, 'admission.sqlite')
  const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
  for (const fragment of admissionMigrations)
    await storage.write(tx => fragment.migration.up(tx.db))
  const child = fork(
    fileURLToPath(new URL('./admission-process-worker.ts', import.meta.url)),
    [file],
    {
      execArgv: ['--experimental-transform-types'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  )
  let ticket: AdmissionTicket | undefined
  let error = ''
  child.stderr!.on('data', chunk => {
    error += String(chunk)
  })
  let rejected!: () => void
  let failed!: (error: Error) => void
  const received = new Promise<void>((resolve, reject) => {
    rejected = resolve
    failed = reject
  })
  child.on('message', (message: { kind: string; ticket?: AdmissionTicket }) => {
    if (message.kind === 'reserved') ticket = message.ticket
    if (message.kind === 'received-rejection') rejected()
  })
  const exited = new Promise(resolve =>
    child.once('exit', (code, signal) => {
      if (code !== null) failed(new Error(`worker exited ${code}: ${error}`))
      resolve({ code, signal })
    }),
  )
  let owner: Awaited<ReturnType<typeof createLocalAdmission>> | undefined
  try {
    await received
    expect(ticket).toBeDefined()
    child.kill('SIGKILL')
    expect(await exited).toEqual({ code: null, signal: 'SIGKILL' })
    const verify = vi.fn<AdmissionProbe['verify']>().mockResolvedValue({ kind: 'valid' })
    owner = await createLocalAdmission(
      storage,
      { verify },
      { maxLogins: 8, maxTickets: 16, maxRecordBytes: 4096 },
    )
    expect((await owner.read(ticket!)).state).toBe('querying')
    const next = await owner.reserve(ticket!.source, {
      ...ticket!.target,
      operationKey: 'next',
      tenant: unwrap(parseTenantId({ ...ticket!.target.tenant, organization: 'team-b' })),
    })
    expect((await owner.query(next.ticket)).state).toBe('waiting')
    expect(verify).not.toHaveBeenCalled()
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
    await owner?.close()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
