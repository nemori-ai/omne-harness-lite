import { vi } from 'vitest'
import sharp from 'sharp'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'
import type {
  FileFacility,
  EnvironmentDescription,
} from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import { createFilesTool, type FilesOptions } from '../src/index.ts'
export const options: FilesOptions = {
  attachmentStorage: 'tool-results',
  maxReadBytes: 65536,
  maxWriteBytes: 65536,
  maxImageBytes: 65536,
  maxPageEntries: 100,
  maxPatchFiles: 8,
  maxEditsPerFile: 8,
  maxImagePixels: 1000000,
  maxImageDimension: 4096,
  maxDiffChars: 8192,
  diffTimeoutMs: 500,
  diffMaxEditLength: 10000,
}
export function fixture(overrides: Partial<FilesOptions> = {}) {
  const data = new Map<string, { bytes: Uint8Array; version: string }>()
  const controller = new AbortController()
  const files: FileFacility = {
    read: vi.fn(async (request: Parameters<FileFacility['read']>[0]) => {
      const found = data.get(request.path)
      if (!found) return { kind: 'rejected' as const, reason: 'notFound' as const }
      const offset = request.offsetBytes ?? 0
      const bytes = found.bytes.slice(offset, offset + (request.limitBytes ?? found.bytes.length))
      return {
        kind: 'read' as const,
        path: request.path,
        data: bytes,
        offsetBytes: offset,
        nextOffsetBytes: offset + bytes.length,
        eof: offset + bytes.length >= found.bytes.length,
        version: found.version,
      }
    }),
    write: vi.fn(async (request: Parameters<FileFacility['write']>[0]) => {
      const found = data.get(request.path)
      if (request.expectedVersion !== undefined && request.expectedVersion !== found?.version)
        return { kind: 'rejected' as const, reason: 'conflict' as const }
      const version = 'v2'
      data.set(request.path, { bytes: request.data.slice(), version })
      return { kind: 'written' as const, path: request.path, version }
    }),
    stat: vi.fn(async () => ({ kind: 'rejected' as const, reason: 'notFound' as const })),
    list: vi.fn(async () => ({ kind: 'listed' as const, values: [], nextOffset: 2 })),
    search: vi.fn(async () => ({
      kind: 'found' as const,
      values: [{ path: '/work/first', offsetBytes: 7 }],
      truncated: true,
      nextOffset: 3,
    })),
    move: vi.fn(async (request: Parameters<FileFacility['move']>[0]) => ({
      kind: 'moved' as const,
      source: request.source,
      target: request.target,
    })),
    copy: vi.fn(async (request: Parameters<FileFacility['copy']>[0]) => ({
      kind: 'copied' as const,
      source: request.source,
      target: request.target,
    })),
    remove: vi.fn(async (request: Parameters<FileFacility['remove']>[0]) => ({
      kind: 'removed' as const,
      path: request.path,
    })),
    mkdir: vi.fn(async (request: Parameters<FileFacility['mkdir']>[0]) => ({
      kind: 'created' as const,
      path: request.path,
    })),
    commitBatch: vi.fn(async (request: Parameters<FileFacility['commitBatch']>[0]) => {
      for (const entry of request.entries)
        data.set(entry.path, { bytes: entry.data.slice(), version: 'v2' })
      return {
        kind: 'committed' as const,
        batch: { id: 'batch1', generation: 'g1' },
        published: request.entries.map(entry => entry.path),
      }
    }),
    recoverBatch: vi.fn(async batch => ({
      kind: 'recognized' as const,
      batch,
      state: 'partial' as const,
      published: ['/work/a'],
      matchingPrepared: ['/work/a'],
      conflicting: ['/work/b'],
    })),
  }
  const description: EnvironmentDescription = {
    reference: { provider: 'test', reference: 'one' },
    facilities: ['files'],
    instance: { id: 'env1', generation: 'g1' },
    bindingLayer: 'host_machine',
    binding: { kind: 'host_machine' },
    continuity: { kind: 'notGuaranteed' },
  }
  const deps: InvocationDependencies = {
    context: {
      read: vi.fn(async (keys: readonly string[]) => ({
        kind: 'values' as const,
        values: keys.map(key => ({
          key,
          revision: 'r1',
          value: { cwd: '/work' },
          observedAt: '2026-10-08T00:00:00Z',
        })),
      })),
    },
    environment: { description, files },
    signal: controller.signal,
    frames: {
      emit: vi.fn(() => {
        throw new Error('Files must not emit')
      }),
    },
    wait: vi.fn(async () => ({ kind: 'rejected' as const, reason: 'notAllowed' as const })),
    costs: { report: async () => 'recorded' },
  }
  const tool = createFilesTool(
    { ...options, ...overrides },
    { imageCodec: createSharpImageCodec(sharp) },
  )
  const run = (command: string, args: import('@omne-harness-lite/content-blocks').JsonObject) =>
    tool.executor({ command, args }, deps)
  const seed = (path: string, content: string | Uint8Array, version = 'v1') =>
    data.set(`/work/${path}`, {
      bytes: typeof content === 'string' ? Buffer.from(content) : content,
      version,
    })
  return { tool, files, deps, controller, data, run, seed }
}
export function text(result: Awaited<ReturnType<ReturnType<typeof fixture>['run']>>): string {
  if (typeof result === 'string') return result
  if (result === undefined) return ''
  return result.content.flatMap(block => (block.kind === 'text' ? [block.text] : [])).join('\n')
}
