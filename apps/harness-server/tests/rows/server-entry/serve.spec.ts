// The `server-entry` row in a `serve` tree: it listens on the loopback port only after every row is
// ACTIVE, never while a row is PENDING, and a malformed configuration fails the row.
import { networkInterfaces } from 'node:os'
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { syntheticRow } from '../../fixtures/serve/index.ts'
import {
  GOVERNANCE_PATH,
  connectable,
  freePort,
  governance,
  post,
  startTree,
  waitListening,
} from './support.ts'

function stderrOf(run: { stderr: readonly string[] }): string {
  return run.stderr.filter(line => !line.startsWith('serve: stop requested: test')).join('\n')
}

/**
 * A row that loads right after `server-entry` and reports whether the port already answers. The
 * loader creates rows in order and waits for each one, so the probe sees the state the assembly
 * is in at that moment: the body of `server-entry` has run, the barrier has not been called.
 */
function portProbe(port: number, seen: boolean[]) {
  return defineRow({
    row: 'port-probe',
    implementation: 'real',
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'port-probe',
      async apply() {
        seen.push(await connectable('127.0.0.1', port))
      },
    },
  })
}

describe('server-entry row: listening', () => {
  it('listens on the configured loopback port once every row is ACTIVE, and answers', async () => {
    const port = await freePort()
    const seen: boolean[] = []
    const tree = startTree({
      config: { listenPort: port },
      extraRows: [{ id: 'port-probe', plugin: 'probe' }],
      extraPlugins: { probe: portProbe(port, seen) },
    })
    await waitListening(tree, port)
    const reply = await post(
      port,
      GOVERNANCE_PATH,
      governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    )
    expect(reply.status).toBe(200)
    const run = await tree.stop()
    expect(run.result.exitCode).toBe(0)
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
    expect(run.startup).toMatchObject({ accepting: true })
    expect(run.startup['startedRows']).toContain('server-entry')
    // While the later row was loading, the body of `server-entry` had run and nothing listened.
    expect(seen).toEqual([false])
    expect(stderrOf(run)).toBe('')
  })

  it('does not listen while another row is PENDING, although its own body has run', async () => {
    const port = await freePort()
    const seen: boolean[] = []
    // A row that injects a name nothing provides stays PENDING, so the barrier is never called.
    const blocked = syntheticRow({ id: 'blocked', injects: ['nothing-provides-this'] })
    const tree = startTree({
      config: { listenPort: port },
      extraRows: [
        { id: 'port-probe', plugin: 'probe' },
        { id: 'blocked', plugin: 'blocked' },
      ],
      extraPlugins: { probe: portProbe(port, seen), blocked },
      readinessTimeoutMs: 1200,
    })
    const run = await tree.finished
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
    expect(run.state('blocked')).toMatchObject({ state: 'PENDING' })
    expect(run.state('port-probe')).toMatchObject({ state: 'ACTIVE' })
    expect(seen).toEqual([false])
    expect(run.startup['startedRows']).not.toContain('server-entry')
    expect(run.startup['barrierCalls']).toBe(0)
    expect(run.startup).toMatchObject({ accepting: false })
    expect(await connectable('127.0.0.1', port)).toBe(false)
  })

  it('stays PENDING and silent when the Session row is not in the tree', async () => {
    const port = await freePort()
    const tree = startTree({
      config: { listenPort: port },
      withoutSession: true,
      readinessTimeoutMs: 600,
    })
    const run = await tree.finished
    expect(run.state('server-entry')).toMatchObject({ state: 'PENDING' })
    expect(run.state('server-entry')?.['missing']).toEqual(['session'])
    expect(await connectable('127.0.0.1', port)).toBe(false)
    expect(run.startup['startedRows']).not.toContain('server-entry')
  })

  it('binds the loopback address only', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port } })
    await waitListening(tree, port)
    const others = Object.values(networkInterfaces())
      .flatMap(list => list ?? [])
      .filter(entry => entry.family === 'IPv4' && !entry.internal)
      .map(entry => entry.address)
    const reachable = await Promise.all(others.map(address => connectable(address, port)))
    const ipv6 = await connectable('::1', port)
    await tree.stop()
    // The positive control above is `waitListening`: 127.0.0.1 accepted. Every other address refuses.
    expect(reachable.every(accepted => !accepted)).toBe(true)
    expect(ipv6).toBe(false)
  })
})

describe('server-entry row: configuration', () => {
  const cases: readonly (readonly [string, unknown, string])[] = [
    ['a listen address (the row never takes one)', { listenAddress: '0.0.0.0' }, 'listenAddress'],
    ['a negative body limit', { maxBodyBytes: { small: -1 } }, 'maxBodyBytes.small'],
    ['a zero input limit', { maxBodyBytes: { input: 0 } }, 'maxBodyBytes.input'],
    ['a fractional heartbeat', { heartbeatIntervalMs: 1.5 }, 'heartbeatIntervalMs'],
    ['port 0 (the operator could not find it)', { listenPort: 0 }, 'listenPort'],
    ['a port above 65535', { listenPort: 70000 }, 'listenPort'],
    ['an unknown key', { listenPorts: 1 }, 'listenPorts'],
    ['a history kind list with a non-string', { historyKinds: [1] }, 'historyKinds'],
    ['a negative observation bound', { observation: { perLogin: -2 } }, 'observation.perLogin'],
  ]

  it.each(cases)(
    'fails the row for %s, names the key, and never listens',
    async (_, config, key) => {
      const port = await freePort()
      const run = await startTree({
        config: { listenPort: port, ...(config as Record<string, unknown>) },
      }).finished
      expect(run.state('server-entry')).toMatchObject({ state: 'FAILED' })
      expect(run.result.exitCode).toBe(3)
      expect(run.startup).toMatchObject({ accepting: false })
      expect(run.startup['startedRows']).not.toContain('server-entry')
      const printed = JSON.stringify(run.records) + stderrOf(run)
      expect(printed).toContain(key)
      expect(await connectable('127.0.0.1', port)).toBe(false)
    },
  )

  it('does not repeat a rejected value in the failure text', async () => {
    const port = await freePort()
    const run = await startTree({
      config: { listenPort: port, listenAddress: 'MARKER-ADDRESS.example' },
    }).finished
    expect(run.state('server-entry')).toMatchObject({ state: 'FAILED' })
    expect(JSON.stringify(run.records) + stderrOf(run)).not.toContain('MARKER-ADDRESS')
  })

  it('takes initial values for every key it is not given', async () => {
    // An empty configuration is valid; it asks for port 8787. Only the shape is checked here, so
    // the port is not bound: the test reads the parsed result of the schema directly.
    const { serverEntryConfig } = await import('../../../src/rows/server-entry/config.ts')
    expect(serverEntryConfig.parse({})).toEqual({
      listenPort: 8787,
      maxBodyBytes: { small: 16384, input: 1048576 },
      heartbeatIntervalMs: 15000,
      jsonBudgets: {
        maxDepth: 32,
        maxItems: 65536,
        maxMembers: 1024,
        maxStringLength: 1048576,
        maxNumberLength: 64,
      },
      maxPageBytes: 1048576,
      historyKinds: ['message.user', 'message.assistant'],
      observation: { perLogin: 4, perInstance: 1000, cancelRetentionMs: 60000 },
    })
  })
})
