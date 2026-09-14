import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  AdmissionHost,
  ExactUse,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
} from '../dist/index.js'
import { createAdmissionCoordinator } from '../dist/index.js'
import {
  createLocalDiagnosticsDirectory,
  type DiagnosticsRuntime,
  type LocalDiagnosticsDirectory,
} from '@omne-harness-lite/diagnostics'
import { createJsonlProvider } from '@omne-harness-lite/jsonl'
import type {
  CommitRequest,
  JsonlProviderOptions,
  OperationInput,
  RecordWriter,
  UseBinding,
} from '@omne-harness-lite/records'
import type { OperationRef } from '@omne-harness-lite/work-data'
import { afterEach, describe, expect, it, vi } from 'vitest'

const journalControl = vi.hoisted(() => ({
  path: '',
  armed: false,
  blocked: false,
  syncCalls: 0,
  blockAt: 1,
  release: null as null | (() => void),
}))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const openedPath = String(args[0])
      if (!openedPath.endsWith('/journal.jsonl')) return handle
      const originalSync = handle.sync.bind(handle)
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        if (openedPath !== journalControl.path || !journalControl.armed) {
          return originalSync()
        }
        journalControl.syncCalls += 1
        if (journalControl.syncCalls !== journalControl.blockAt || journalControl.blocked) {
          return originalSync()
        }
        journalControl.blocked = true
        await new Promise<void>(release => {
          journalControl.release = release
        })
        return originalSync()
      })
      return handle
    },
  }
})

const scratchRoot = resolve(
  import.meta.dirname,
  '../../../../tmp/admission-current-frame/real-composition',
)

type Stack = Readonly<{
  directory: string
  recordDirectory: string
  diagnosticDirectory: string
  diagnosticOwner: LocalDiagnosticsDirectory
  diagnosticRuntime: DiagnosticsRuntime
  writer: RecordWriter
  admission: AdmissionHost
}>

const stacks = new Set<Stack>()

afterEach(async () => {
  journalControl.release?.()
  journalControl.path = ''
  journalControl.armed = false
  journalControl.blocked = false
  journalControl.syncCalls = 0
  journalControl.blockAt = 1
  journalControl.release = null
  await Promise.allSettled([...stacks].map(closeStack))
  await Promise.all([...stacks].map(stack => rm(stack.directory, { recursive: true, force: true })))
  stacks.clear()
  vi.restoreAllMocks()
})

function providerOptions(directory: string, owners: readonly string[]): JsonlProviderOptions {
  return {
    coordinationDomain: 'admission-current-frame-test',
    directory,
    bindings: [{ namespace: 'core', owners, allowSystemScope: false }],
    limits: {
      maxBytes: 16_384,
      maxDepth: 32,
      maxNodes: 1_024,
      maxLineBytes: 32_768,
      maxPayloadBytes: 16_384,
      maxPendingCommits: 16,
      maxPendingBytes: 256_000,
    },
  }
}

async function createStack(prefix: string, owners: readonly string[]): Promise<Stack> {
  await mkdir(scratchRoot, { recursive: true })
  const directory = await mkdtemp(join(scratchRoot, prefix))
  const recordDirectory = join(directory, 'records')
  const diagnosticDirectory = join(directory, 'diagnostics')
  await mkdir(recordDirectory, { recursive: true })
  const directoryResult = await createLocalDiagnosticsDirectory({
    directory: diagnosticDirectory,
    maxDirectoryBytes: 512 * 1_024,
    maxFiles: 4,
  })
  expect(directoryResult.status).toBe('created')
  if (directoryResult.status !== 'created') {
    throw new Error(`diagnostics directory failed: ${directoryResult.code}`)
  }
  const sourceResult = await directoryResult.owner.create({
    instanceId: 'admission-current-frame-tests',
    sourceId: `${prefix}source`,
    level: 'debug',
    maxRecordBytes: 8 * 1_024,
    maxActiveSpans: 16,
    maxBufferBytes: 64 * 1_024,
    maxFileBytes: 256 * 1_024,
  })
  expect(sourceResult.status).toBe('created')
  if (sourceResult.status !== 'created') {
    await directoryResult.owner.close({ deadlineMs: 1_000 })
    throw new Error(`diagnostics source failed: ${sourceResult.code}`)
  }
  const provider = createJsonlProvider(
    providerOptions(recordDirectory, owners),
    sourceResult.runtime.diagnostics,
  )
  const acquired = await provider.acquireWriter()
  expect(acquired.status).toBe('acquired')
  if (acquired.status !== 'acquired') {
    await sourceResult.runtime.close({ deadlineMs: 1_000 })
    await directoryResult.owner.close({ deadlineMs: 1_000 })
    throw new Error(`writer acquisition failed: ${acquired.status}`)
  }
  const stack: Stack = {
    directory,
    recordDirectory,
    diagnosticDirectory,
    diagnosticOwner: directoryResult.owner,
    diagnosticRuntime: sourceResult.runtime,
    writer: acquired.writer,
    admission: createAdmissionCoordinator(acquired.writer, sourceResult.runtime.diagnostics),
  }
  stacks.add(stack)
  return stack
}

async function closeStack(stack: Stack): Promise<void> {
  await stack.admission.coordinator.close()
  await stack.diagnosticRuntime.close({ deadlineMs: 1_000 })
  await stack.diagnosticOwner.close({ deadlineMs: 1_000 })
}

function operation(operationId: string): OperationRef {
  return {
    namespace: 'core',
    principalId: '{"kind":"user","user":{"userId":"user-1"}}',
    operationId,
  }
}

function operationInput(operationId: string): OperationInput {
  return {
    format: 'core-operation/1',
    operationKind: 'admission.callback_fault',
    tenantId: 'tenant-1',
    principal: { kind: 'user', user: { userId: 'user-1' } },
    target: { operationId },
    arguments: {},
    preconditions: {},
    causality: {},
  }
}

function prepareAdmission(
  host: AdmissionHost,
  operationId: string,
  publications: readonly OwnerPublication[],
  options: Readonly<{
    expectedRevision?: string
    uses?: readonly ExactUse[]
  }> = {},
): PreparedAdmission {
  const preparedOperation = host.coordinator.prepareOperation(
    operation(operationId),
    operationInput(operationId),
  )
  expect(preparedOperation.ok).toBe(true)
  if (!preparedOperation.ok) throw new Error('operation preparation failed')
  const uses = options.uses ?? []
  const request: CommitRequest = {
    operation: preparedOperation.value,
    appends: publications.map(publication => ({
      stream: {
        namespace: 'core',
        owner: publication.owner,
        scope: { kind: 'tenant', tenantId: 'tenant-1' },
        streamId: `${publication.owner}-stream`,
      },
      expectedRevision: options.expectedRevision ?? '0',
      records: [
        {
          kind: 'admission.callback_fault',
          version: '1',
          data: { operationId, owner: publication.owner },
        },
      ],
    })),
    result: { operationId },
    requiredUses: uses.map(use => ({
      recordOwner: publications[0]?.owner ?? '',
      binding: use.binding,
    })),
  }
  const commit = host.coordinator.prepare(request)
  expect(commit.ok).toBe(true)
  if (!commit.ok) throw new Error('commit preparation failed')
  return Object.freeze({
    composition: 'action_execution',
    commit: commit.value,
    publications: Object.freeze([...publications]),
    uses: Object.freeze([...uses]),
  })
}

function pending(result: ReturnType<AdmissionHost['coordinator']['submit']>): PendingAdmission {
  expect(result.status).toBe('pending_durability')
  if (result.status !== 'pending_durability') {
    throw new Error(`expected pending durability, got ${result.status}`)
  }
  return result
}

function submit(host: AdmissionHost, prepared: PreparedAdmission): PendingAdmission {
  return pending(host.coordinator.enter(frame => host.coordinator.submit(frame, prepared)))
}

function useBinding(resourceId: string): Omit<UseBinding, 'owner'> {
  return { resourceId, generation: 'generation-1', epoch: 'epoch-1' }
}

function deferredRejection(): Readonly<{
  promise: Promise<undefined>
  reject: (reason: unknown) => void
}> {
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<undefined>((_resolve, reject) => {
    rejectPromise = reject
  })
  if (rejectPromise === undefined) throw new Error('failed to prepare late rejection')
  return Object.freeze({ promise, reject: rejectPromise })
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 1_000
  do {
    if (predicate()) return
    await new Promise<void>(resolveWait => setTimeout(resolveWait, 5))
  } while (Date.now() < deadline)
  throw new Error(`timed out waiting for ${description}`)
}

async function diagnosticLines(directory: string): Promise<readonly Record<string, unknown>[]> {
  const names = (await readdir(directory)).filter(name => name.startsWith('diagnostic-'))
  const lines: Record<string, unknown>[] = []
  for (const name of names) {
    const text = await readFile(join(directory, name), 'utf8')
    for (const line of text.trim().split('\n').filter(Boolean)) {
      lines.push(JSON.parse(line) as Record<string, unknown>)
    }
  }
  return lines
}

describe('F9-F10 monotonic durable-publication faults with real JSONL and D1', () => {
  it('stops the next durable publication and preserves the committed receipt as blocked', async () => {
    const stack = await createStack('f9-', ['owner-a', 'owner-b'])
    const durableB = vi.fn(() => undefined)
    const prepared = prepareAdmission(stack.admission, 'f9-durable-reentry', [
      {
        owner: 'owner-a',
        publishLogical: () => undefined,
        publishDurable: () => {
          try {
            stack.admission.coordinator.enter(() => undefined)
          } catch {
            // The trusted callback catches its own contract failure.
          }
          return undefined
        },
      },
      {
        owner: 'owner-b',
        publishLogical: () => undefined,
        publishDurable: durableB,
      },
    ])

    const submission = submit(stack.admission, prepared)
    const completion = await submission.completion

    expect(completion).toMatchObject({
      status: 'committed',
      publication: 'blocked',
      receipt: {
        operation: operation('f9-durable-reentry'),
        position: submission.position,
      },
    })
    expect(durableB).not.toHaveBeenCalled()
    expect(stack.admission.coordinator.status()).toMatchObject({
      phase: 'quarantined',
      durable: { seq: '0' },
    })
    const writerResult = await stack.writer.lookupOperation(operation('f9-durable-reentry'))
    expect(writerResult).toMatchObject({ status: 'committed', receipt: completion.receipt })
    expect(await submission.completion).toBe(completion)
  })

  it('does not let close wash the fault or let an in-flight committed successor publish', async () => {
    const stack = await createStack('f10-', ['owner-a'])
    let closing: ReturnType<typeof stack.admission.coordinator.close> | undefined
    const durableSuccessor = vi.fn(() => undefined)
    const first = prepareAdmission(
      stack.admission,
      'f10-first',
      [
        {
          owner: 'owner-a',
          publishLogical: () => undefined,
          publishDurable: () => {
            try {
              stack.admission.coordinator.enter(() => undefined)
            } catch {
              // The monotonic fault must survive both this catch and close().
            }
            closing = stack.admission.coordinator.close()
            return undefined
          },
        },
      ],
      { expectedRevision: '0' },
    )
    const successor = prepareAdmission(
      stack.admission,
      'f10-successor',
      [
        {
          owner: 'owner-a',
          publishLogical: () => undefined,
          publishDurable: durableSuccessor,
        },
      ],
      { expectedRevision: '1' },
    )
    journalControl.path = `${stack.recordDirectory}/journal.jsonl`
    journalControl.blockAt = 2
    journalControl.armed = true

    const firstSubmission = submit(stack.admission, first)
    const successorSubmission = submit(stack.admission, successor)
    await waitFor(() => journalControl.blocked, 'the successor fsync')

    await expect(firstSubmission.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(closing).toBeDefined()
    expect(stack.admission.coordinator.status().phase).toBe('closing')
    journalControl.release?.()

    await expect(successorSubmission.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
      receipt: { operation: operation('f10-successor') },
    })
    expect(durableSuccessor).not.toHaveBeenCalled()
    await expect(closing).resolves.toMatchObject({ status: 'blocked' })
    expect(stack.admission.coordinator.status().durable.seq).toBe('0')
  })
})

describe('F11-F12 pre-durability callback faults with real JSONL and D1', () => {
  it.each([false, true])(
    'stops after the first retain fault and preserves every claimed pin (close=%s)',
    async closeInside => {
      const stack = await createStack(`f11-${String(closeInside)}-`, ['record-owner'])
      const issuer = stack.admission.createUseIssuer('execution-owner')
      let closing: ReturnType<typeof stack.admission.coordinator.close> | undefined
      const firstRelease = vi.fn(async () => ({ status: 'released' as const }))
      const secondRelease = vi.fn(async () => ({ status: 'released' as const }))
      const secondRetain = vi.fn(() => undefined)
      const first = issuer.capture(useBinding('resource-a'), {
        retainAt: () => {
          try {
            stack.admission.coordinator.enter(() => undefined)
          } catch {
            // The callback deliberately catches the reentry error.
          }
          if (closeInside) closing = stack.admission.coordinator.close()
          return undefined
        },
        release: firstRelease,
      })
      const second = issuer.capture(useBinding('resource-b'), {
        retainAt: secondRetain,
        release: secondRelease,
      })
      const logical = vi.fn(() => undefined)
      const durable = vi.fn(() => undefined)
      const prepared = prepareAdmission(
        stack.admission,
        `f11-${String(closeInside)}`,
        [{ owner: 'record-owner', publishLogical: logical, publishDurable: durable }],
        { uses: [first, second] },
      )

      const submission = submit(stack.admission, prepared)

      await expect(submission.completion).resolves.toMatchObject({
        status: 'unknown',
        operation: operation(`f11-${String(closeInside)}`),
      })
      expect(secondRetain).not.toHaveBeenCalled()
      expect(logical).not.toHaveBeenCalled()
      expect(durable).not.toHaveBeenCalled()
      await expect(first.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
      await expect(second.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
      expect(firstRelease).not.toHaveBeenCalled()
      expect(secondRelease).not.toHaveBeenCalled()
      if (closeInside) await expect(closing).resolves.toMatchObject({ status: 'blocked' })
    },
  )

  it.each([false, true])(
    'stops after the first logical fault without rolling back its prior local effect (close=%s)',
    async closeInside => {
      const stack = await createStack(`f12-${String(closeInside)}-`, ['owner-a', 'owner-b'])
      let closing: ReturnType<typeof stack.admission.coordinator.close> | undefined
      let ownerALogicalRoot: string | null = null
      const ownerBLogical = vi.fn(() => undefined)
      const ownerADurable = vi.fn(() => undefined)
      const ownerBDurable = vi.fn(() => undefined)
      const prepared = prepareAdmission(stack.admission, `f12-${String(closeInside)}`, [
        {
          owner: 'owner-a',
          publishLogical: position => {
            ownerALogicalRoot = position.seq
            try {
              stack.admission.coordinator.enter(() => undefined)
            } catch {
              // The local assignment remains real; later publications must stop.
            }
            if (closeInside) closing = stack.admission.coordinator.close()
            return undefined
          },
          publishDurable: ownerADurable,
        },
        {
          owner: 'owner-b',
          publishLogical: ownerBLogical,
          publishDurable: ownerBDurable,
        },
      ])

      const submission = submit(stack.admission, prepared)

      expect(ownerALogicalRoot).toBe(submission.position.seq)
      expect(ownerBLogical).not.toHaveBeenCalled()
      expect(stack.admission.coordinator.status().logical.seq).toBe('0')
      await expect(submission.completion).resolves.toMatchObject({
        status: 'unknown',
        operation: operation(`f12-${String(closeInside)}`),
      })
      expect(ownerADurable).not.toHaveBeenCalled()
      expect(ownerBDurable).not.toHaveBeenCalled()
      if (closeInside) await expect(closing).resolves.toMatchObject({ status: 'blocked' })
    },
  )
})

describe('F13 late rejection ownership after a monotonic callback fault', () => {
  it.each(['retain', 'logical', 'durable'] as const)(
    'keeps %s rejection observed with the original operation, position, and phase',
    async stage => {
      const stack = await createStack(`f13-${stage}-`, ['record-owner'])
      const late = deferredRejection()
      const laterCallback = vi.fn(() => undefined)
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      try {
        const fault = (): Promise<undefined> => {
          try {
            stack.admission.coordinator.enter(() => undefined)
          } catch {
            // A thenable still needs an observer after the monotonic fault is known.
          }
          return late.promise
        }
        let uses: readonly ExactUse[] = []
        let publications: readonly OwnerPublication[]
        if (stage === 'retain') {
          const use = stack.admission
            .createUseIssuer('execution-owner')
            .capture(useBinding('late-rejection'), {
              retainAt: fault as unknown as ExactUse['retainAt'],
              release: async () => ({ status: 'released' }),
            })
          uses = [use]
          publications = [
            {
              owner: 'record-owner',
              publishLogical: laterCallback,
              publishDurable: laterCallback,
            },
          ]
        } else if (stage === 'logical') {
          publications = [
            {
              owner: 'record-owner',
              publishLogical: fault as unknown as OwnerPublication['publishLogical'],
              publishDurable: laterCallback,
            },
          ]
        } else {
          publications = [
            {
              owner: 'record-owner',
              publishLogical: () => undefined,
              publishDurable: fault as unknown as OwnerPublication['publishDurable'],
            },
          ]
        }
        const prepared = prepareAdmission(stack.admission, `f13-${stage}`, publications, { uses })
        const submission = submit(stack.admission, prepared)
        const completion = await submission.completion

        expect(completion).toMatchObject(
          stage === 'durable'
            ? { status: 'committed', publication: 'blocked' }
            : { status: 'unknown', operation: operation(`f13-${stage}`) },
        )
        expect(laterCallback).not.toHaveBeenCalled()
        late.reject(new Error(`late ${stage} rejection`))
        await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
        expect(unhandled).not.toHaveBeenCalled()

        await closeStack(stack)
        const lines = await diagnosticLines(stack.diagnosticDirectory)
        const code =
          stage === 'retain'
            ? 'retain_at_rejected'
            : stage === 'logical'
              ? 'publish_logical_rejected'
              : 'publish_durable_rejected'
        expect(lines).toContainEqual(
          expect.objectContaining({
            kind: 'log',
            tenantId: 'tenant-1',
            operation: operation(`f13-${stage}`),
            phase: 'late_rejection',
            code,
            position: submission.position,
          }),
        )
      } finally {
        process.off('unhandledRejection', unhandled)
      }
    },
  )
})
