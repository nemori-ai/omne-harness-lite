import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import {
  open,
  boot,
  catalog,
  reading,
  setup,
  alice,
  scope,
  content,
  official,
  expectRow,
} from './support.ts'

it('V3-5 second manifest entry conflict rolls back first profile, history and state', async () => {
  const h = await setup('manifest-rollback', {
    ordinal: 1,
    entries: [official('a', 'c1', { v: 1 }), official('b', 'c1', { v: 1 })],
  })
  try {
    const before = await h.read.listProfiles(alice)
    await h.assembly.dispose()
    await expect(
      boot(h.storage, {
        ordinal: 2,
        entries: [official('a', 'c2', { v: 2 }), official('b', 'c1', { v: 9 })],
      }),
    ).rejects.toThrow()
    const reopen = await boot(h.storage, {
      ordinal: 1,
      entries: [official('a', 'c1', { v: 1 }), official('b', 'c1', { v: 1 })],
    })
    try {
      expect(await reading(reopen).listProfiles(alice)).toEqual(before)
      const facts = await h.storage.read(async tx =>
        tx.db
          .selectFrom('model_profile_configuration')
          .selectAll()
          .where('revision', '=', 'c2')
          .execute(),
      )
      expect(facts).toEqual([])
      const state = await h.storage.read(async tx =>
        tx.db.selectFrom('model_manifest_state').selectAll().executeTakeFirst(),
      )
      expect(state?.ordinal_json).toBe('1')
    } finally {
      await reopen.dispose()
    }
  } finally {
    await h.storage.close()
  }
})
it('S27/V3-6 five dispositions, unchanged custom row and exact replay after storage reopen', async () => {
  const h = await setup('manifest-replay', {
    ordinal: 1,
    entries: [official('update'), official('same'), official('remove'), official('return')],
  })
  let assembly = h.assembly
  try {
    const custom = expectRow(await h.catalog.registerProfile(alice, scope, content('update')))
    await assembly.dispose()
    assembly = await boot(h.storage, {
      ordinal: 2,
      entries: [official('update'), official('same'), official('remove')],
    })
    await assembly.dispose()
    const manifest = {
      ordinal: 3,
      entries: [
        { ...official('update'), providers: ['new'] },
        official('same'),
        official('return'),
        official('add'),
      ],
    }
    assembly = await boot(h.storage, manifest)
    const state = await h.storage.read(async tx =>
      tx.db.selectFrom('model_manifest_state').selectAll().executeTakeFirst(),
    )
    const dispositions = JSON.parse(String(state?.dispositions_json)) as unknown[]
    expect(dispositions).toHaveLength(5)
    for (const disposition of ['updated', 'unchanged', 'relisted', 'added', 'withdrawn'])
      expect(JSON.stringify(dispositions)).toContain(`"disposition":"${disposition}"`)
    expect(await reading(assembly).readProfile(alice, custom.ref)).toEqual(custom)
    await assembly.dispose()
    await h.storage.close()
    const reopened = await open(h.path)
    const notifications: unknown[] = []
    // Observe dispatch at the real plugin invocation; replay must not emit.
    const replay = await boot(reopened, manifest, undefined, undefined, ref =>
      notifications.push(ref),
    )
    try {
      const after = await reopened.read(async tx =>
        tx.db.selectFrom('model_manifest_state').selectAll().executeTakeFirst(),
      )
      expect(after).toEqual(state)
      expect(notifications).toEqual([])
    } finally {
      await replay.dispose()
      await reopened.close()
    }
  } finally {
    await assembly.dispose()
    await h.storage.close()
  }
})
it('V3-6 rejected old/same ordinal has precedence over configuration conflict', async () => {
  const h = await setup('ordinal', { ordinal: 2, entries: [official('m', 'c1', { v: 1 })] })
  try {
    await h.assembly.dispose()
    const log: unknown[] = []
    const assembly = await boot(
      h.storage,
      { ordinal: 1, entries: [official('m', 'c1', { v: 9 })] },
      { record: event => log.push(event) },
    )
    try {
      expect(log).toContainEqual({
        operation: 'loadManifest',
        phase: 'error',
        outcome: 'manifestNotNewer',
      })
      expect(
        expectRow(
          await reading(assembly).readProfile(alice, { origin: 'official', routeName: 'm' }),
        ).profile.adaptation.configuration.values,
      ).toEqual({ v: 1 })
    } finally {
      await assembly.dispose()
    }
  } finally {
    await h.storage.close()
  }
})
it('V3-5 real transaction commit-adjacent fault leaves prior whole manifest', async () => {
  const h = await setup('statement-fault', { ordinal: 1, entries: [official('a'), official('b')] })
  try {
    await h.assembly.dispose()
    const original = h.storage.write.bind(h.storage)
    const write = vi.spyOn(h.storage, 'write')
    write.mockImplementation(async fn =>
      original(async tx => {
        // SQL driver still owns the real transaction. Throwing after the first insert must roll it back.
        const result = await fn(tx)
        const histories = await tx.db
          .selectFrom('model_profile_configuration')
          .selectAll()
          .where('revision', '=', 'c2')
          .execute()
        if (histories.length > 0) throw new StorageUnavailable('commit-adjacent injected fault')
        return result
      }),
    )
    await expect(
      boot(h.storage, { ordinal: 2, entries: [official('a', 'c2'), official('b', 'c2')] }),
    ).rejects.toThrow()
    write.mockRestore()
    const reopened = await boot(h.storage, { ordinal: 1, entries: [official('a'), official('b')] })
    try {
      expect(
        await h.storage.read(async tx =>
          tx.db
            .selectFrom('model_profile_configuration')
            .selectAll()
            .where('revision', '=', 'c2')
            .execute(),
        ),
      ).toEqual([])
    } finally {
      await reopened.dispose()
    }
  } finally {
    await h.storage.close()
  }
})
it('V3-5 SIGKILL before commit rolls back the first inserted history and profile update', async () => {
  const original = { ordinal: 1, entries: [official('a'), official('b')] }
  const h = await setup('kill-before-commit', original)
  const before = await h.read.listProfiles(alice)
  await h.close()
  const fixture = resolve(import.meta.dirname, 'fixtures/kill-before-commit.mjs')
  const manifest = { ordinal: 2, entries: [official('a', 'c2'), official('b', 'c2')] }
  const child = spawnSync(process.execPath, [fixture, h.path, JSON.stringify(manifest)], {
    encoding: 'utf8',
    timeout: 10_000,
  })
  expect(child.error).toBeUndefined()
  expect(child.signal).toBe('SIGKILL')
  expect(child.stdout).toContain('second-history-insert-before-commit')
  console.log(`manifest crash probe: signal=${child.signal}, stage=${child.stdout.trim()}`)
  const reopened = await open(h.path)
  try {
    const assembly = await boot(reopened, original)
    try {
      expect(await reading(assembly).listProfiles(alice)).toEqual(before)
      const [history, state] = await reopened.read(async tx =>
        Promise.all([
          tx.db
            .selectFrom('model_profile_configuration')
            .selectAll()
            .where('revision', '=', 'c2')
            .execute(),
          tx.db.selectFrom('model_manifest_state').selectAll().executeTakeFirst(),
        ]),
      )
      expect(history).toEqual([])
      expect(state?.ordinal_json).toBe('1')
    } finally {
      await assembly.dispose()
    }
  } finally {
    await reopened.close()
  }
})
