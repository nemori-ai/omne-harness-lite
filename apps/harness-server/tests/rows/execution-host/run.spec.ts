import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as host from '@omne-harness/execution-environment-host-local'
import { ExecutionEnvironmentRegistry } from '@omne-harness/execution-environment-host-local/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { defineRow } from '../../../src/row.ts'
import { runServe, type RunServeOptions, type S0Record } from '../../../src/run.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('creates a separate entry-owned domain before loading each run and clears its maintenance timer', async () => {
  vi.useFakeTimers()
  const made = vi.spyOn(host, 'createHostFilesDomain')
  const timer = vi.spyOn(globalThis, 'setTimeout')
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'app-host-run-')))
  const records: S0Record[] = []
  let bodies = 0
  const registry = defineRow({
    row: 'execution-environment',
    implementation: 'real',
    lifecycle: { kind: 'none' },
    manifest: { provides: [executionEnvironmentKey], injects: [], sameProviderGroup: null },
    plugin: {
      apply(ctx: ConstructorParameters<typeof ExecutionEnvironmentRegistry>[0]) {
        expect(made).toHaveBeenCalledTimes(++bodies)
        new ExecutionEnvironmentRegistry(ctx)
      },
    },
  })
  try {
    const options: RunServeOptions = {
      distribution: {
        rows: [
          { id: 'execution-environment', plugin: 'registry', config: {} },
          {
            id: 'execution-host',
            plugin: 'executionHost',
            config: { filesRoot: directory, stateDirectory: directory, maintainIntervalMs: 60123 },
          },
        ],
      },
      plugins: { registry },
      entryObjects: [],
      readinessTimeoutMs: 30,
      shutdownDeadlineMs: 100,
      stateRoot: directory,
      stop: AbortSignal.abort(),
      write: record => records.push(record),
      stderr: vi.fn(),
    }
    expect((await runServe(options)).exitCode).toBe(0)
    expect((await runServe(options)).exitCode).toBe(0)
    expect(made).toHaveBeenCalledTimes(2)
    expect(made.mock.results[0]?.value).not.toBe(made.mock.results[1]?.value)
    expect(timer.mock.calls.filter(call => call[1] === 60123)).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
    expect(records.filter(record => record.kind === 'shutdown-result')).toEqual([
      expect.objectContaining({ overall: 'settled', hostFiles: { kind: 'settled', count: 0 } }),
      expect.objectContaining({ overall: 'settled', hostFiles: { kind: 'settled', count: 0 } }),
    ])
    const output = JSON.stringify(records)
    expect(output).not.toContain('quotaDomain')
    expect(output).not.toContain('maintain')
    expect(output).not.toContain(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('does not start maintenance when entry-object installation fails', async () => {
  vi.useFakeTimers()
  const timer = vi.spyOn(globalThis, 'setTimeout')
  const directory = process.platform === 'win32' ? 'C:/files' : '/files'
  const result = await runServe({
    distribution: {
      rows: [
        {
          id: 'execution-host',
          plugin: 'executionHost',
          config: { filesRoot: directory, stateDirectory: directory, maintainIntervalMs: 12345 },
        },
      ],
    },
    plugins: {},
    entryObjects: [
      {
        name: 'failing-entry',
        implementation: 'real',
        install: () => {
          throw new Error('private-input')
        },
      },
    ],
    readinessTimeoutMs: 30,
    shutdownDeadlineMs: 100,
    stateRoot: directory,
    stop: AbortSignal.abort(),
    write: vi.fn(),
    stderr: vi.fn(),
  })
  expect(result.exitCode).toBe(3)
  expect(result.appliedRows).toEqual([])
  expect(timer.mock.calls.filter(call => call[1] === 12345)).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('clears the periodic timer when a business start fails after the host row loaded', async () => {
  vi.useFakeTimers()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'app-host-failure-')))
  const registry = defineRow({
    row: 'execution-environment',
    implementation: 'real',
    lifecycle: { kind: 'none' },
    manifest: { provides: [executionEnvironmentKey], injects: [], sameProviderGroup: null },
    plugin: ExecutionEnvironmentRegistry,
  })
  const failing = defineRow({
    row: 'failing',
    implementation: 'real',
    lifecycle: { kind: 'body', phase: 'business' },
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    body: async () => ({
      start: async () => {
        throw new Error('start failed')
      },
      stop: async () => ({ kind: 'settled' }),
    }),
  })
  try {
    const result = await runServe({
      distribution: {
        rows: [
          { id: 'execution-environment', plugin: 'registry', config: {} },
          {
            id: 'execution-host',
            plugin: 'executionHost',
            config: { filesRoot: directory, stateDirectory: directory, maintainIntervalMs: 29 },
          },
          { id: 'failing', plugin: 'failing', config: {} },
        ],
      },
      plugins: { registry, failing },
      entryObjects: [],
      readinessTimeoutMs: 30,
      shutdownDeadlineMs: 100,
      stateRoot: directory,
      stop: AbortSignal.abort(),
      write: vi.fn(),
      stderr: vi.fn(),
    })
    expect(result.exitCode).toBe(3)
    expect(result.appliedRows).toContain('execution-host')
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
