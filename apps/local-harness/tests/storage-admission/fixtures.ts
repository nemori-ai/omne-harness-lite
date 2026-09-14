import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createAdmissionCoordinator } from '@omne-harness-lite/admission'
import type {
  AdmissionHost,
  ExactUse,
  OwnerPublication,
  PreparedAdmission,
} from '@omne-harness-lite/admission'
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
  StreamAppend,
  UseBinding,
} from '@omne-harness-lite/records'
import type { OperationRef } from '@omne-harness-lite/work-data'
import { expect } from 'vitest'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-composition/storage-admission')

export type Stack = Readonly<{
  directory: string
  recordDirectory: string
  diagnosticDirectory: string
  diagnosticOwner: LocalDiagnosticsDirectory
  diagnosticRuntime: DiagnosticsRuntime
  writer: RecordWriter
  admission: AdmissionHost
}>

export async function createScratch(prefix: string): Promise<string> {
  await mkdir(scratchRoot, { recursive: true })
  return mkdtemp(join(scratchRoot, prefix))
}

export function providerOptions(
  directory: string,
  owners: readonly string[],
): JsonlProviderOptions {
  return {
    coordinationDomain: 'local-harness-test-domain',
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

export async function createDiagnostics(
  directory: string,
  sourceId: string,
): Promise<Readonly<{ owner: LocalDiagnosticsDirectory; runtime: DiagnosticsRuntime }>> {
  const result = await createLocalDiagnosticsDirectory({
    directory,
    maxDirectoryBytes: 512 * 1_024,
    maxFiles: 4,
  })
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`diagnostics directory failed: ${result.code}`)
  const source = await result.owner.create({
    instanceId: 'local-harness-integration',
    sourceId,
    level: 'debug',
    maxRecordBytes: 8 * 1_024,
    maxActiveSpans: 16,
    maxBufferBytes: 64 * 1_024,
    maxFileBytes: 256 * 1_024,
  })
  expect(source.status).toBe('created')
  if (source.status !== 'created') {
    await result.owner.close({ deadlineMs: 1_000 })
    throw new Error(`diagnostics source failed: ${source.code}`)
  }
  return { owner: result.owner, runtime: source.runtime }
}

export async function createStack(prefix: string, owners: readonly string[]): Promise<Stack> {
  const directory = await createScratch(prefix)
  const recordDirectory = join(directory, 'records')
  const diagnosticDirectory = join(directory, 'diagnostics')
  const diagnostics = await createDiagnostics(diagnosticDirectory, `${prefix}source`)
  const provider = createJsonlProvider(
    providerOptions(recordDirectory, owners),
    diagnostics.runtime.diagnostics,
  )
  const acquired = await provider.acquireWriter()
  expect(acquired.status).toBe('acquired')
  if (acquired.status !== 'acquired') {
    await diagnostics.runtime.close({ deadlineMs: 1_000 })
    await diagnostics.owner.close({ deadlineMs: 1_000 })
    throw new Error(`writer acquisition failed: ${acquired.status}`)
  }
  return {
    directory,
    recordDirectory,
    diagnosticDirectory,
    diagnosticOwner: diagnostics.owner,
    diagnosticRuntime: diagnostics.runtime,
    writer: acquired.writer,
    admission: createAdmissionCoordinator(acquired.writer, diagnostics.runtime.diagnostics),
  }
}

export async function closeStack(stack: Stack): Promise<void> {
  await stack.admission.coordinator.close()
  await stack.diagnosticRuntime.close({ deadlineMs: 1_000 })
  await stack.diagnosticOwner.close({ deadlineMs: 1_000 })
}

export async function removeStack(stack: Stack): Promise<void> {
  await rm(stack.directory, { recursive: true, force: true })
}

export function operation(id: string): OperationRef {
  return {
    namespace: 'core',
    principalId: '{"kind":"user","user":{"userId":"user-1"}}',
    operationId: id,
  }
}

export function operationInput(id: string): OperationInput {
  return {
    format: 'core-operation/1',
    operationKind: 'integration.change',
    tenantId: 'tenant-1',
    principal: { kind: 'user', user: { userId: 'user-1' } },
    target: { resourceId: 'resource-1' },
    arguments: { id },
    preconditions: {},
    causality: {},
  }
}

export function streamAppend(owner: string, id: string, expectedRevision = '0'): StreamAppend {
  return {
    stream: {
      namespace: 'core',
      owner,
      scope: { kind: 'tenant', tenantId: 'tenant-1' },
      streamId: `${owner}-stream`,
    },
    expectedRevision,
    records: [{ kind: 'integration.changed', version: '1', data: { id, owner } }],
  }
}

export function prepareAdmission(
  host: AdmissionHost,
  operationId: string,
  publications: readonly OwnerPublication[],
  options: Readonly<{
    inputId?: string
    expectedRevision?: string
    uses?: readonly ExactUse[]
  }> = {},
): PreparedAdmission {
  const operationRef = operation(operationId)
  const preparedOperation = host.coordinator.prepareOperation(
    operationRef,
    operationInput(options.inputId ?? operationId),
  )
  expect(preparedOperation.ok).toBe(true)
  if (!preparedOperation.ok) throw new Error('operation preparation failed')
  const uses = options.uses ?? []
  const request: CommitRequest = {
    operation: preparedOperation.value,
    appends: publications.map(publication =>
      streamAppend(publication.owner, operationId, options.expectedRevision),
    ),
    result: { operationId },
    requiredUses: uses.map(use => ({
      recordOwner: publications[0]?.owner ?? '',
      binding: use.binding,
    })),
  }
  const prepared = host.coordinator.prepare(request)
  expect(prepared.ok).toBe(true)
  if (!prepared.ok) throw new Error('commit preparation failed')
  return {
    composition: 'action_execution',
    commit: prepared.value,
    publications,
    uses,
  }
}

export function useBinding(owner = 'execution-owner'): UseBinding {
  return { owner, resourceId: 'resource-1', generation: 'generation-1', epoch: 'epoch-1' }
}

export async function diagnosticLines(
  directory: string,
): Promise<readonly Record<string, unknown>[]> {
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

export async function turn(): Promise<void> {
  await new Promise<void>(resolveTurn => setImmediate(resolveTurn))
}
