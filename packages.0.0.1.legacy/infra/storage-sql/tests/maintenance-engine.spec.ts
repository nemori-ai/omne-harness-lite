import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SnapshotFailure, StorageDefect, type SnapshotInspection } from '@omne-harness-lite/storage'
import { SnapshotEngine } from '../src/maintenance/engine.ts'
import { openSnapshotInspection } from '../src/index.ts'

const roots: string[] = []
const owners: SnapshotInspection[] = []
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-inspect-engine-')))
  roots.push(root)
  const file = join(root, 'fixture.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE kysely_migration(name TEXT PRIMARY KEY NOT NULL,timestamp TEXT NOT NULL);
    INSERT INTO kysely_migration VALUES('001_test','2026-09-26T00:00:00.000Z');
    CREATE TABLE data(id INTEGER PRIMARY KEY); INSERT INTO data VALUES(1);`)
  db.close()
  const bytes = await readFile(file)
  const work = join(root, '.quarantine')
  const owner = await openSnapshotInspection(work)
  owners.push(owner)
  return { bytes, work, owner }
}
async function* chunks(bytes: Uint8Array) {
  yield bytes
}
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 offline inspection ownership', () => {
  it('offers only inspect, checks the copied bytes, and removes plaintext tasks', async () => {
    const { owner, work, bytes } = await fixture()
    await owner.run(async session => {
      expect('snapshot' in session).toBe(false)
      return session.inspect({ byteLength: bytes.length, chunks: chunks(bytes) }, async view => {
        expect(Buffer.from(await view.read(0, bytes.length))).toEqual(bytes)
      })
    })
    expect((await readdir(work)).filter(name => name.startsWith('task-'))).toEqual([])
  })

  it.each(['short', 'long'] as const)(
    'rejects a %s byte stream without retaining plaintext',
    async fault => {
      const { owner, work, bytes } = await fixture()
      await expect(
        owner.run(session =>
          session.inspect(
            {
              byteLength: bytes.length + (fault === 'short' ? 1 : -1),
              chunks: chunks(bytes),
            },
            async () => true,
          ),
        ),
      ).rejects.toMatchObject({ kind: 'invalid-data' })
      expect((await readdir(work)).filter(name => name.startsWith('task-'))).toEqual([])
    },
  )

  it('keeps the workspace and slot until a blocked input actually ends after cancellation', async () => {
    const { owner, work, bytes } = await fixture()
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const entered = new Promise<void>(resolve => {
      started = resolve
    })
    async function* blocked() {
      yield bytes.subarray(0, 16)
      started()
      await gate
      yield bytes.subarray(16)
    }
    const running = owner.run(session =>
      session.inspect({ byteLength: bytes.length, chunks: blocked() }, async () => true),
    )
    const rejected = expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    await entered
    await expect(owner.run(async () => true)).rejects.toMatchObject({ kind: 'busy' })
    const settled = vi.fn()
    const closing = owner.close().then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
    release()
    await rejected
    await closing
    const next = await openSnapshotInspection(work)
    owners.push(next)
    await expect(owner.run(async () => true)).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

it.each(['cancelled', 'defect'] as const)(
  'retains child cleanup failure after parent %s',
  async kind => {
    const { work } = await fixture()
    const parentOwner = owners.pop()!
    await parentOwner.close()
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const ready = new Promise<void>(resolve => {
      entered = resolve
    })
    let allowClose = false
    const cleanup = new SnapshotFailure('unavailable')
    const parent =
      kind === 'cancelled' ? new SnapshotFailure('cancelled') : new StorageDefect('parent defect')
    const engine = await SnapshotEngine.open(work, async (_file, _signal, resources) => {
      resources.own(async () => {
        if (!allowClose) throw cleanup
      })
      entered()
      await gate
      throw new SnapshotFailure('cancelled')
    })
    try {
      const result = engine
        .run(async session => {
          void session.snapshot(async () => true).catch(() => undefined)
          await ready
          throw parent
        })
        .catch((error: unknown) => error)
      await ready
      release()
      const error = await result
      if (kind === 'cancelled') expect(error).toBe(cleanup)
      else expect(error).toMatchObject({ errors: [parent, cleanup] })
      expect(engine.resourcesSettled).toBe(false)
      await expect(engine.run(async () => true)).rejects.toMatchObject({ kind: 'unavailable' })
    } finally {
      allowClose = true
      await engine.close()
    }
  },
)

it('preserves a callback defect if deleting its completed task also fails', async () => {
  const { owner, bytes } = await fixture()
  const defect = new StorageDefect('view callback defect')
  const { SnapshotWorkspace } = await import('../src/maintenance/workspace.ts')
  const cleanup = new SnapshotFailure('unavailable')
  const remove = vi.spyOn(SnapshotWorkspace.prototype, 'removeTask').mockRejectedValue(cleanup)
  try {
    await expect(
      owner.run(session =>
        session.inspect({ byteLength: bytes.length, chunks: chunks(bytes) }, async () => {
          throw defect
        }),
      ),
    ).rejects.toMatchObject({ errors: [defect, cleanup] })
  } finally {
    remove.mockRestore()
  }
})

it('allows the caller to consume a rejected candidate and inspect a valid one', async () => {
  const { owner, bytes } = await fixture()
  const result = await owner.run(async session => {
    try {
      await session.inspect(
        { byteLength: 1, chunks: chunks(new Uint8Array([1])) },
        async () => true,
      )
    } catch (error) {
      expect(error).toMatchObject({ kind: 'invalid-data' })
    }
    return session.inspect({ byteLength: bytes.length, chunks: chunks(bytes) }, async () => 'valid')
  })
  expect(result).toBe('valid')
})

it('does not let a later cancellation conceal an earlier task cleanup failure', async () => {
  const { owner, bytes } = await fixture()
  const { SnapshotWorkspace } = await import('../src/maintenance/workspace.ts')
  const cleanup = new SnapshotFailure('unavailable')
  const remove = vi.spyOn(SnapshotWorkspace.prototype, 'removeTask').mockRejectedValueOnce(cleanup)
  const controller = new AbortController()
  try {
    await expect(
      owner.run(
        async session => {
          try {
            await session.inspect(
              { byteLength: bytes.length, chunks: chunks(bytes) },
              async () => true,
            )
          } catch (error) {
            expect(error).toBe(cleanup)
          }
          controller.abort()
          return session.inspect(
            { byteLength: bytes.length, chunks: chunks(bytes) },
            async () => true,
          )
        },
        { signal: controller.signal },
      ),
    ).rejects.toBe(cleanup)
  } finally {
    remove.mockRestore()
  }
})

it('owns resources returned by a delayed open even after close requests cancellation', async () => {
  const { owner, work } = await fixture()
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const entered = new Promise<void>(resolve => {
    started = resolve
  })
  let closed = false
  const running = owner.run(async session => {
    started()
    await gate
    const close = session.ownResource(
      async () => {
        closed = true
      },
      () => closed,
    )
    expect(session.cancelled).toBe(true)
    await close()
    throw new SnapshotFailure('cancelled')
  })
  const rejected = expect(running).rejects.toMatchObject({ kind: 'cancelled' })
  await entered
  const closing = owner.close()
  await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
  release()
  await rejected
  await closing
  expect(closed).toBe(true)
})

it('retains a consumed run-resource close failure even when final retry really closes it', async () => {
  const { owner } = await fixture()
  let closed = false
  let attempts = 0
  const failure = new SnapshotFailure('unavailable')
  await expect(
    owner.run(async session => {
      const close = session.ownResource(
        async () => {
          if (++attempts === 1) throw failure
          closed = true
        },
        () => closed,
      )
      try {
        await close()
      } catch {
        /* The run must not report clean success. */
      }
      return true
    }),
  ).rejects.toBe(failure)
  expect(closed).toBe(true)
})

it('does not accept a close callback that returns while the resource is still open', async () => {
  const { work } = await fixture()
  const old = owners.pop()!
  await old.close()
  const engine = await SnapshotEngine.open(work)
  let closed = false
  try {
    await expect(
      engine.run(async session => {
        session.ownResource(
          async () => undefined,
          () => closed,
        )
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(engine.resourcesSettled).toBe(false)
    await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
  } finally {
    closed = true
    await engine.close()
  }
})

it('preserves a consumed close defect when final cleanup later fails ordinarily', async () => {
  const { work } = await fixture()
  await owners.pop()!.close()
  const engine = await SnapshotEngine.open(work)
  let attempts = 0
  let closed = false
  const defect = new StorageDefect('initial close defect')
  const unavailable = new SnapshotFailure('unavailable')
  try {
    await expect(
      engine.run(async session => {
        const close = session.ownResource(
          async () => {
            if (closed) return
            if (++attempts === 1) throw defect
            throw unavailable
          },
          () => closed,
        )
        try {
          await close()
        } catch {
          /* Explicitly consumed; run still owes the defect. */
        }
        return true
      }),
    ).rejects.toMatchObject({ errors: [defect, unavailable] })
    expect(engine.resourcesSettled).toBe(false)
  } finally {
    closed = true
    await engine.close()
  }
})
