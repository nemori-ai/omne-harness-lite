// @module-tag slow
// An actual creator is killed; the native Tool pool must recover its original Host resources.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { composeMigrations, type StorageUnit } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createHostEnvironment,
  createEnvironmentRegistry,
} from '@omne-harness-lite/execution-environments-host'
import { hostEnvironmentMigrations } from '@omne-harness-lite/execution-environments-host/migrations'
import type {
  EnvironmentDescription,
  EnvironmentPlacement,
  ManagedResource,
} from '@omne-harness-lite/execution-environments'
import {
  environmentToolOf,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import { nativeRuntimeFixture } from './native-runtime-fixture.ts'
import { environmentDefinition } from './execution-environment-fixture.ts'
import { ref, scope } from './execution-owner-fixture.ts'

type Message =
  | { kind: 'ready' }
  | {
      kind: 'acquired'
      id: number
      placement: EnvironmentPlacement
      description: EnvironmentDescription
    }
  | { kind: 'plan'; id: number; resource: ManagedResource }
  | { kind: 'permit' | 'adopt'; id: number; key: string }
  | { kind: 'stopped'; id: number; key: string; status: 'confirmed' | 'unconfirmed' }

function resourceRecord(message: Exclude<Message, { kind: 'ready' }>): Extract<
  ToolJournalPayload,
  {
    kind:
      | 'execution_environment_adopted'
      | 'resource_planned'
      | 'resource_permitted'
      | 'resource_adopted'
      | 'physical_stop_observed'
  }
> {
  const common = { revision: 1 as const, ref }
  switch (message.kind) {
    case 'acquired':
      return {
        ...common,
        kind: 'execution_environment_adopted',
        adoption: {
          placement: message.placement,
          description: message.description,
          source: { name: 'controlled-test', generation: 'source-generation' },
          providerEvidence: null,
        },
      }
    case 'plan':
      return { ...common, kind: 'resource_planned', resource: message.resource }
    case 'permit':
      return { ...common, kind: 'resource_permitted', key: message.key }
    case 'adopt':
      return { ...common, kind: 'resource_adopted', key: message.key }
    case 'stopped':
      return {
        ...common,
        kind: 'physical_stop_observed',
        key: message.key,
        status: message.status,
        at: new Date().toISOString(),
      }
  }
}

test.each(['command', 'terminal'] as const)(
  'native Tool recovery stops the original Host %s after creator death without replay',
  { tags: ['slow'], timeout: 30000 },
  async mode => {
    const cleanup: (() => Promise<void>)[] = []
    const f = await nativeRuntimeFixture(cleanup)
    const original = await f.seed({ definition: environmentDefinition })
    const consumed = await f.support.storage.atomic(unit =>
      original.participant.consumeOriginalIn(unit, original.claim),
    )
    expect(consumed.kind).toBe('staged')
    const database = join(f.dir, 'host.sqlite')
    const storage = await openStorage({
      dialect: 'sqlite',
      file: database,
      migrations: composeMigrations(hostEnvironmentMigrations),
      upgrade: false,
    })
    const marker = join(f.dir, 'original-effect')
    const config = join(f.dir, 'host-input.json')
    await writeFile(
      config,
      JSON.stringify({
        database,
        directory: f.dir,
        marker,
        mode,
        scope,
        callId: ref.callId,
        tool: environmentToolOf({
          capability: 'tool:echo',
          asset: 'echo-asset',
          version: '1',
          definition: environmentDefinition,
          adoption: 'adopted',
        }),
      }),
    )
    const provider = createHostEnvironment({
      name: 'native-host',
      storage,
      access: f.dependencies.authorization,
    })
    const child = fork(
      fileURLToPath(new URL('./native-host-crash-child.mjs', import.meta.url)),
      [config],
      {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    )
    const ready = Promise.withResolvers<void>()
    let diagnostics = ''
    child.stderr?.on('data', value => {
      diagnostics += String(value)
    })
    child.once('error', ready.reject)
    child.once('exit', () =>
      ready.reject(new Error(`Host creator exited before ready: ${diagnostics}`)),
    )
    const records: Promise<void>[] = []
    child.on('message', raw => {
      const message = raw as Message
      if (message.kind === 'ready') {
        ready.resolve()
        return
      }
      const task = (async () => {
        const staged = await f.support.storage.atomic((unit: StorageUnit) =>
          original.records.stageTransitionIn(unit, original.job, [resourceRecord(message)]),
        )
        if (staged.kind !== 'staged') throw new Error(`Actual Tool record refused: ${staged.kind}`)
        child.send({
          id: message.id,
          result: message.kind === 'permit' || message.kind === 'adopt' ? 'confirmed' : 'recorded',
        })
      })()
      records.push(task)
      void task.catch(error => ready.reject(error))
    })
    let registry: ReturnType<typeof createEnvironmentRegistry> | undefined
    let pool: ReturnType<typeof f.start> | undefined
    try {
      await ready.promise
      await Promise.all(records)
      const before = await f.history()
      if (before.kind !== 'found') throw new Error('Original Tool task missing')
      expect(before.history.resources.size).toBe(mode === 'terminal' ? 2 : 1)
      expect(
        [...before.history.resources.values()].filter(resource => resource.adopted).length,
      ).toBe(mode === 'terminal' ? 1 : 0)
      expect(await readFile(marker, 'utf8')).toBe('x')
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
      await f.reopen()
      const authorization = f.dependencies.recovery
      registry = createEnvironmentRegistry({
        access: f.dependencies.authorization,
        recovery: {
          authorizeRecovery: async (candidate, requested) =>
            candidate === authorization && JSON.stringify(requested) === JSON.stringify(scope)
              ? 'authorized'
              : 'notAuthorized',
        },
      })
      registry.registrations.registerProvider(provider)
      const indexed = await provider.listRecoveryResources(scope)
      if (indexed.kind !== 'resources') throw new Error('Native Host index unavailable')
      expect(indexed.values.map(value => value.key).sort()).toEqual(
        [...before.history.resources.keys()].sort(),
      )
      pool = f.start(undefined, { ...registry.operations, ...registry.registrations })
      await pool.ready
      const result = await f.history()
      if (result.kind !== 'found') throw new Error('Recovered Tool task missing')
      expect(result.history.terminal?.value.terminal).toMatchObject({
        outcome: 'failed',
        code: 'abnormal_interruption',
      })
      expect(result.history.terminal?.value.account.cost.total_usd).toBe('unknown')
      for (const resource of result.history.resources.values())
        expect(resource.observations.at(-1)?.value.status).toBe('confirmed')
      expect(await provider.listRecoveryResources(scope)).toEqual({ kind: 'resources', values: [] })
      for (const resource of indexed.values)
        expect(await provider.recover(resource)).toEqual({ status: 'confirmedStopped' })
      expect(await readFile(marker, 'utf8')).toBe('x')
      expect(f.unused).not.toHaveBeenCalled()
      expect(f.enumerate).not.toHaveBeenCalled()
      expect(f.borrow).not.toHaveBeenCalled()
      await pool.close()
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
      await pool?.close()
      await provider.retire()
      await registry?.close()
      await storage.close()
      for (const close of cleanup.splice(0)) await close()
    }
  },
)
