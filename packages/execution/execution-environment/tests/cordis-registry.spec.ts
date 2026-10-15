import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import {
  EXECUTION_ENVIRONMENT,
  ExecutionEnvironmentRegistry,
  hostFilesPlugin,
} from '@omne-harness/execution-environment/cordis'
import type { FileFacility } from '@omne-harness/execution-environment'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it('does not import Cordis from the package root', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../dist/index.js', import.meta.url), 'utf8'),
  )
  expect(source.includes('@deepseek-ai/cordis')).toBe(false)
  expect(source.includes('./cordis')).toBe(false)
})

it('registers host files, drops them on unload, and refuses a sandbox with no provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omne-exec-env-'))
  roots.push(root)
  const path = join(root, 'notes.txt')
  await writeFile(path, 'leased-bytes')
  const ctx = new Context()
  await ctx.plugin(ExecutionEnvironmentRegistry, {})
  const host = await ctx.plugin(hostFilesPlugin, {})
  const service = ctx.get(EXECUTION_ENVIRONMENT)
  const acquired = await service.acquire({
    tenantId: 'tenant-a',
    callId: 'call-1',
    binding: { kind: 'host_machine' },
    facilities: ['files'],
  })
  expect(acquired.kind).toBe('acquired')
  if (acquired.kind !== 'acquired') return
  expect(acquired.lease.binding).toEqual({ kind: 'host_machine' })
  const files = acquired.lease.facility('files') as FileFacility
  const { hostObjectToken } = await import('@omne-harness/execution-environment')
  const named = await hostObjectToken(path)
  const read = await files.read({
    requestId: 'leased',
    originalCallId: 'call-1',
    subjectId: 'subject-a',
    binding: acquired.lease.binding,
    path,
    named,
  })
  expect(read).toMatchObject({
    kind: 'done',
    requestId: 'leased',
    value: { bytes: new TextEncoder().encode('leased-bytes') },
  })

  const sandbox = await service.acquire({
    tenantId: 'tenant-a',
    callId: 'call-1',
    binding: { kind: 'stateless_sandbox', callId: 'call-1' },
    facilities: ['files'],
  })
  expect(sandbox).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })

  await host.dispose()
  const after = await service.acquire({
    tenantId: 'tenant-a',
    callId: 'call-1',
    binding: { kind: 'host_machine' },
    facilities: ['files'],
  })
  expect(after).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
})

it('rejects a command request and keeps the host binding for files', async () => {
  const ctx = new Context()
  await ctx.plugin(ExecutionEnvironmentRegistry, {})
  await ctx.plugin(hostFilesPlugin, {})
  const service = ctx.get(EXECUTION_ENVIRONMENT)
  const missing = await service.acquire({
    tenantId: 'tenant-a',
    callId: 'call-1',
    binding: { kind: 'host_machine' },
    facilities: ['command'],
  })
  expect(missing).toEqual({ kind: 'rejected', reason: 'missingFacility' })
  const files = await service.acquire({
    tenantId: 'tenant-a',
    callId: 'call-1',
    binding: { kind: 'host_machine' },
    facilities: ['files'],
  })
  expect(files.kind).toBe('acquired')
  if (files.kind !== 'acquired') return
  expect(files.lease.binding).toEqual({ kind: 'host_machine' })
  expect(files.lease.facility('command')).toBeUndefined()
  expect(files.lease.facility('files')).toBeDefined()
})
