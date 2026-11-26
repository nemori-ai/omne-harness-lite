import { request } from 'node:http'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { PORTS_POINT } from '@omne-harness/plugin-host-local'
import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { pluginServerKey } from '../../../src/rows/plugin-server/service.ts'

const PORT = 'late-store'
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'keeper',
  summary: 'Keeps a word in a port another row lends.',
  server: {
    needs: [PORT],
    members: [
      { point: 'access.protocols', key: 'keeper/v1', module: 'protocol.js', export: 'make' },
    ],
  },
})
const PROTOCOL = `const text = { kind: 'text' }
export function make() {
  return {
    contract: {
      name: 'keeper',
      major: 1,
      operations: {
        keep: { effect: 'commit', limit: 'small', body: { kind: 'object', fields: { word: { rule: text } } }, result: text },
      },
    },
    handlers: {
      async keep(input, { ports }) {
        return { outcome: 'succeeded', body: JSON.stringify(await ports['${PORT}'].keep({ word: input.word })) }
      },
    },
  }
}
`

function post(
  tree: ReleaseTree,
  path: string,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const text = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-${Math.random()}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'omne-acting-tenant': savedTenant(tree.home),
        },
      },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (reply += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: reply }))
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

/** A row of the application that lends the port; `mark` tells one generation of it from the next. */
const lender = (mark: string): Plugin => ({
  name: 'late-lender',
  inject: [dynamisKey],
  apply(ctx: Context) {
    const keep = async (input: { word: string }) => ({
      outcome: 'done',
      value: `${mark}:${input.word}`,
    })
    ;(ctx.get(dynamisKey) as DynamisService).put([
      {
        point: PORTS_POINT,
        key: PORT,
        id: '',
        scope: [],
        rank: 0,
        digest: `${PORT}@late-lender`,
        item: { make: () => ({ keep }) },
      },
    ])
  },
})

describe('a plugin that needs a port no row lends yet, on the release tree', () => {
  it(
    'waits, loads by itself when the lender comes, and its port goes on working after the lender is replaced',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const tenantText = savedTenant(tree.home)
        const made = await uploadPlugin(tree.clients.assets, tenantOf(tenantText), 'keeper', {
          'plugin.json': MANIFEST,
          'protocol.js': PROTOCOL,
        })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        const stateOf = () =>
          (
            tree.scope.get(pluginServerKey) as {
              states(tenant: string): ReadonlyMap<string, unknown> | undefined
            }
          )
            .states(tenantText)
            ?.get('keeper')
        await until(
          async () => stateOf() !== undefined && (stateOf() as { kind: string }).kind !== 'loading',
          'the plugin to have an outcome',
          30_000,
        )
        expect(stateOf()).toMatchObject({ kind: 'waiting', lacks: [`port ${PORT}`] })
        expect((await post(tree, '/api/keeper/v1/keep', { word: 'a' })).status).toBe(404)

        // The lender comes: nobody touches the plugin.
        const first = tree.scope.plugin(lender('one'))
        await until(
          async () => (await post(tree, '/api/keeper/v1/keep', { word: 'a' })).status === 200,
          'the waiting plugin to load by itself',
          30_000,
        )
        expect(stateOf()).toMatchObject({ kind: 'loaded' })
        const kept = await post(tree, '/api/keeper/v1/keep', { word: 'a' })
        expect(JSON.parse(JSON.parse(kept.text).body)).toEqual({ outcome: 'done', value: 'one:a' })

        // The lender is replaced by its next generation: the plugin stays loaded and its port reaches the new one.
        await first.dispose()
        expect(
          JSON.parse(
            JSON.parse((await post(tree, '/api/keeper/v1/keep', { word: 'b' })).text).body,
          ),
        ).toMatchObject({ outcome: 'unavailable' })
        tree.scope.plugin(lender('two'))
        await until(
          async () =>
            JSON.parse(
              JSON.parse((await post(tree, '/api/keeper/v1/keep', { word: 'c' })).text).body,
            ).value === 'two:c',
          'the port to reach the new generation of the lender',
          30_000,
        )
        expect(stateOf()).toMatchObject({ kind: 'loaded' })
      })
      expect(exitCode).toBe(0)
    },
  )
})

const SLOW_MANIFEST = JSON.stringify({
  schema: 1,
  name: 'slow',
  summary: 'Answers after a pause.',
  server: {
    members: [{ point: 'access.protocols', key: 'slow/v1', module: 'protocol.js', export: 'make' }],
  },
})
const SLOW_PROTOCOL = `const text = { kind: 'text' }
const op = { effect: 'commit', limit: 'small', body: { kind: 'object', fields: { say: { rule: text } } }, result: text }
export function make() {
  return {
    contract: { name: 'slow', major: 1, operations: { wait: op, quick: op } },
    handlers: {
      async wait(input) { await new Promise(done => setTimeout(done, 3000)); return { outcome: 'succeeded', body: 'waited:' + input.say } },
      async quick(input) { return { outcome: 'succeeded', body: 'quick:' + input.say } },
    },
  }
}
`

describe('a plugin disabled while a call of its protocol is under way, on the release tree', () => {
  it(
    'the call under way ends with its answer; new calls read as a protocol that is not there, before that call has ended',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await uploadPlugin(tree.clients.assets, tenant, 'slow', {
          'plugin.json': SLOW_MANIFEST,
          'protocol.js': SLOW_PROTOCOL,
        })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        const quick = () => post(tree, '/api/slow/v1/quick', { say: 'hi' })
        await until(
          async () => (await quick()).status === 200,
          'the protocol to be mounted',
          30_000,
        )
        const absent = await post(tree, '/api/nothing/v1/quick', { say: 'hi' })

        let ended = false
        const underWay = post(tree, '/api/slow/v1/wait', { say: 'under way' }).finally(() => {
          ended = true
        })
        await new Promise(done => setTimeout(done, 500))
        const off = await tree.clients.assets['set-asset-enabled']({
          tenant,
          operation: 'off-slow',
          holding: made.body.holding,
          enabled: false,
        })
        expect(off.outcome).toBe('succeeded')
        await until(
          async () => (await quick()).status === 404,
          'new calls to stop being taken',
          2_000,
        )
        expect(ended).toBe(false)
        expect(await quick()).toEqual(absent)
        const answer = await underWay
        expect([answer.status, JSON.parse(answer.text)]).toEqual([
          200,
          { outcome: 'succeeded', body: 'waited:under way' },
        ])
        expect(await quick()).toEqual(absent)
      })
      expect(exitCode).toBe(0)
    },
  )
})
