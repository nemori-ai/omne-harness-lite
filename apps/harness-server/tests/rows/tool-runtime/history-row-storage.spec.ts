// @module-tag slow: starts real SQLite workers over actual historical producer bytes.
import { expect, it } from 'vitest'
import { toolRecordsRow } from '../../../src/rows/tool-runtime/index.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { historyStorage } from './history-storage.ts'

it('refuses a real pre-W3 database before creating or publishing the runtime and makes no commit', async () => {
  const app = await historyStorage(true)
  try {
    await expect(app.context.plugin(toolRecordsRow, app.config)).rejects.toThrow(
      'historical startup refused',
    )
    expect(toolRuntimeHolder(app.context).bundle).toBeNull()
    expect(app.context.get('toolCommands', false)).toBeUndefined()
    expect(app.commits()).toBe(0)
  } finally {
    await app.close()
  }
})

it('publishes the records service for an empty current database without a history write', async () => {
  const app = await historyStorage(false)
  try {
    await app.context.plugin(toolRecordsRow, app.config)
    expect(app.context.get('toolCommands', false), app.logs.join('\n')).toBeDefined()
    expect(toolRuntimeHolder(app.context).bundle).not.toBeNull()
    expect(app.commits()).toBe(0)
  } finally {
    await app.close()
  }
})

it('converts the real drained ordinary history only under explicit upgrade, then publishes the runtime', async () => {
  const app = await historyStorage(true)
  try {
    await app.context.plugin(toolRecordsRow, {
      ...app.config,
      history: { mode: 'upgrade', interpretations: [] },
    })
    expect(app.context.get('toolCommands', false), app.logs.join('\n')).toBeDefined()
    expect(toolRuntimeHolder(app.context).bundle).not.toBeNull()
    expect(app.commits()).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

it('reopens SQLite after a lost plan answer and resumes the same migration before allowing verify', async () => {
  const app = await historyStorage(true, true)
  const upgrade = { ...app.config, history: { mode: 'upgrade', interpretations: [] } }
  try {
    await expect(app.context.plugin(toolRecordsRow, upgrade)).rejects.toThrow(
      'historical startup refused',
    )
    expect(toolRuntimeHolder(app.context).bundle).toBeNull()
    const original = app.plans()
    expect(original).toHaveLength(1)
    await app.restart()
    await app.context.plugin(toolRecordsRow, upgrade)
    expect(app.context.get('toolCommands', false), app.logs.join('\n')).toBeDefined()
    expect(app.plans()).toEqual(original)
    await app.restart()
    const writes = app.commits()
    await app.context.plugin(toolRecordsRow, app.config)
    expect(app.context.get('toolCommands', false)).toBeDefined()
    expect(app.commits()).toBe(writes)
  } finally {
    await app.close()
  }
})

it('refuses an unexplained old body, then upgrades only with its explicitly matched interpretation', async () => {
  const app = await historyStorage('offloaded')
  const codec = {
    owner: 'history-test',
    name: 'migration',
    revision: '1',
    digest: 'sha256:migration',
  }
  const values = [
    {
      tool: { owner: 'test-owner', name: 'read_file', revision: '1', digest: 'sha256:read_file' },
      rawCodec: {
        owner: 'test-owner',
        name: 'w3-migration-fixture-utf8-text-v1',
        revision: '1',
        digest: 'sha256:w3-migration-fixture-utf8-text-v1',
      },
      source: {
        storage: '@omne-harness/tool-storage-sql',
        key: '["legacy-offloaded","legacy-offloaded-raw"]',
        mediaType: 'application/octet-stream',
        bytes: '32799',
        digest: 'sha256:0e181505330f729abc31822c4f6cfb2f0192739af5e2b8c6a670464444c2cb2c',
      },
      interpretation: codec,
      representation: { kind: 'text', codec },
      basis: {
        owner: 'history-test',
        record: 'utf8-source-proof',
        revision: '1',
        digest: 'sha256:fixture-utf8',
      },
    },
  ]
  try {
    await expect(
      app.context.plugin(toolRecordsRow, {
        ...app.config,
        history: { mode: 'upgrade', interpretations: [] },
      }),
    ).rejects.toThrow('historical startup refused')
    expect(toolRuntimeHolder(app.context).bundle).toBeNull()
    expect(app.commits()).toBe(0)
    expect(app.plans()).toEqual([])
    await app.restart()
    await app.context.plugin(toolRecordsRow, {
      ...app.config,
      history: {
        mode: 'upgrade',
        interpretations: [{ tenant: app.tenantText, call: 'legacy-offloaded', values }],
      },
    })
    expect(app.context.get('toolCommands', false), app.logs.join('\n')).toBeDefined()
    expect(app.plans('legacy-offloaded')).toHaveLength(1)
    expect(app.plans('legacy-ordinary')).toHaveLength(1)
    await app.restart()
    const writes = app.commits()
    await app.context.plugin(toolRecordsRow, app.config)
    expect(app.context.get('toolCommands', false)).toBeDefined()
    expect(app.commits()).toBe(writes)
  } finally {
    await app.close()
  }
})
