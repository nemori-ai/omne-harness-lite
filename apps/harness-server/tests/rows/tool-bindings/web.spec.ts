// The Web attachment of the `tool-bindings` row (web-meta-tool slices 02 and 04): a release Web call
// gets a `WebAccess`, calls of the other release tools do not, the chain order (Tools, TodoItems,
// Web) is kept, and `finish` removes the access. The search key comes from the secret custody
// through the local credential provider: the tenant layer first, then the official layer; the
// organization layer is never configured; a reference selected at the start of a call is not
// replaced by another layer when it is gone at the moment of use.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIndependentToolScope } from '@omne-harness/tool'
import { decodeToolOperationId, type FixedToolRequest } from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { todoItemsOf, webAccessOf } from '@omne-harness/tool-definitions'
import type { SecretText } from '@omne-harness/settings'
import { createSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { afterEach, describe, expect, it } from 'vitest'
import { toolSettingHolding, toolSettingSecretKey } from '../../../src/rows/settings/holding.ts'
import { releaseCapability } from '../../../src/rows/tool-bindings/index.ts'
import {
  EXA_KEY_ITEM,
  bindReleaseWeb,
  releaseExaKey,
  type SecretCustodyReader,
  type WebBindingConfig,
} from '../../../src/rows/tool-bindings/web.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import { exaResult, exaResults, startExaStub, type ExaStub } from '../../fixtures/exa-stub.ts'

const TENANT_KEY = 'exa-sentinel-tenant-a1b2'
const OFFICIAL_KEY = 'exa-sentinel-official-c3d4'
const text = (value: string) => value as SecretText

function configOf(endpoint: string): WebBindingConfig {
  return {
    search: { endpoint, type: 'lite', highlightChars: 100, timeoutMs: 2000 },
    fetch: { maxRedirects: 5, timeoutMs: 1000, maxBodyBytes: 65536 },
  }
}
const UNUSED = configOf('https://127.0.0.1:9/search')

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

const directories: string[] = []
const stubs: ExaStub[] = []
afterEach(async () => {
  for (const stub of stubs.splice(0)) await stub.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function openVault(): SecretVault {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'web-binding-vault-')))
  directories.push(directory)
  const created = createSecretVault({ path: join(directory, 'vault.json') })
  if (created.kind !== 'open') throw new Error(`fixture vault ${created.kind}`)
  return created.vault
}

async function exa(): Promise<ExaStub> {
  const stub = await startExaStub(() => exaResults([exaResult('T', 'https://e.test/p', 'H')]))
  stubs.push(stub)
  return stub
}

/** The custody, the keys of the Web item for the fixture tenant and the official layer, and a world. */
async function world() {
  const w = await forwardWorld()
  const request = w.request('Web')
  if (request.availability.kind !== 'available') throw new Error('fixture availability')
  const holding = toolSettingHolding(request.availability.definition)
  if (holding === null) throw new Error('fixture: Web declares no settings')
  const vault = openVault()
  const custody: SecretCustodyReader = () => vault
  const tenantKey = toolSettingSecretKey(
    { layer: 'tenant', tenant: w.tenant },
    holding,
    EXA_KEY_ITEM,
  )
  const officialKey = toolSettingSecretKey({ layer: 'official' }, holding, EXA_KEY_ITEM)
  const parent = { principal: w.principal, tenant: w.tenant, call: w.call, request }
  return { w, vault, custody, tenantKey, officialKey, parent, request }
}

describe('tool-bindings: the Web attachment', () => {
  it('attaches WebAccess to a release Web call and removes it on finish; without a custody search is unavailable', async () => {
    const { w, parent } = await world()
    try {
      const attached = bindReleaseWeb(parent, scope(), UNUSED, () => undefined)
      const access = webAccessOf(attached.context)
      expect(access).toBeDefined()
      expect(await access?.search({ query: 'q', limit: 1 }, attached.context.signal)).toMatchObject(
        {
          failure: { kind: 'unavailable' },
        },
      )
      expect(await access?.fetch({ url: 'ftp://x/' }, attached.context.signal)).toEqual({
        failure: { kind: 'invalid-url' },
      })
      await expect(attached.finish('returned')).resolves.toHaveProperty('ok')
      expect(webAccessOf(attached.context)).toBeUndefined()
    } finally {
      await w.close()
    }
  })

  it('search uses the tenant key when the tenant layer has one; without any key it is unconfigured', async () => {
    const { w, vault, custody, tenantKey, parent } = await world()
    try {
      const stub = await exa()
      const config = configOf(stub.url)
      const without = webAccessOf(bindReleaseWeb(parent, scope(), config, custody).context)
      expect(await without?.search({ query: 'q', limit: 1 }, new AbortController().signal)).toEqual(
        {
          failure: { kind: 'unconfigured' },
        },
      )
      expect(stub.requests()).toEqual([])
      expect(vault.bind(tenantKey, text(TENANT_KEY), null)).toBe('written')
      const access = webAccessOf(bindReleaseWeb(parent, scope(), config, custody).context)
      const found = await access?.search({ query: 'q', limit: 1 }, new AbortController().signal)
      expect(found).toEqual({
        ok: [{ title: 'T', url: 'https://e.test/p', publishedAt: '2026-11-01', excerpt: 'H' }],
      })
      expect(stub.requests().map(r => r.apiKey)).toEqual([TENANT_KEY])
    } finally {
      await w.close()
    }
  })

  it('search uses the official key when the tenant layer has none (F7), and the tenant key over it when both exist', async () => {
    const { w, vault, custody, tenantKey, officialKey, parent } = await world()
    try {
      const stub = await exa()
      const config = configOf(stub.url)
      expect(vault.bind(officialKey, text(OFFICIAL_KEY), null)).toBe('written')
      const official = webAccessOf(bindReleaseWeb(parent, scope(), config, custody).context)
      expect(
        await official?.search({ query: 'q', limit: 1 }, new AbortController().signal),
      ).toHaveProperty('ok')
      expect(vault.bind(tenantKey, text(TENANT_KEY), null)).toBe('written')
      const own = webAccessOf(bindReleaseWeb(parent, scope(), config, custody).context)
      expect(
        await own?.search({ query: 'q', limit: 1 }, new AbortController().signal),
      ).toHaveProperty('ok')
      // The organization layer is read between the two and is never configured.
      expect(stub.requests().map(r => r.apiKey)).toEqual([OFFICIAL_KEY, TENANT_KEY])
    } finally {
      await w.close()
    }
  })

  it('a reference selected at the start of a call is not replaced: the tenant key cleared before use fails the call even with an official key', async () => {
    const { w, vault, custody, tenantKey, officialKey, parent } = await world()
    try {
      expect(vault.bind(tenantKey, text(TENANT_KEY), null)).toBe('written')
      const source = releaseExaKey(parent, custody)
      const selected = await source()
      expect(selected).toHaveProperty('ok')
      if ('failure' in selected) throw new Error('unreachable')
      // Between the selection and the use: the tenant key goes, an official key comes.
      expect(vault.unbind(tenantKey)).toBe('removed')
      expect(vault.bind(officialKey, text(OFFICIAL_KEY), null)).toBe('written')
      const seen: string[] = []
      const used = await selected.ok.use(async key => {
        seen.push(key)
        return 'sent'
      })
      expect(used).toEqual({ failure: { kind: 'missing' } })
      expect(seen).toEqual([])
      // A replaced key is read at the moment of use.
      expect(vault.bind(tenantKey, text('exa-sentinel-replaced-e5f6'), null)).toBe('written')
      expect(await selected.ok.use(async key => key)).toEqual({ ok: 'exa-sentinel-replaced-e5f6' })
    } finally {
      await w.close()
    }
  })

  it('a principal of another tenant, or a system principal, is denied before the custody is read', async () => {
    const { w, vault, tenantKey, officialKey, parent } = await world()
    try {
      expect(vault.bind(tenantKey, text(TENANT_KEY), null)).toBe('written')
      expect(vault.bind(officialKey, text(OFFICIAL_KEY), null)).toBe('written')
      const reads: string[] = []
      const spying: SecretCustodyReader = () => ({
        bind: vault.bind,
        unbind: vault.unbind,
        list: vault.list,
        describe: key => {
          reads.push('describe')
          return vault.describe(key)
        },
        use: key => {
          reads.push('use')
          return vault.use(key)
        },
      })
      const other = { ...parent, tenant: fixtureTenant('b') }
      expect(await releaseExaKey(other, spying)()).toEqual({
        failure: { kind: 'denied', action: 'credentials' },
      })
      const system = { ...parent, principal: w.principal.actor }
      expect(await releaseExaKey(system, spying)()).toEqual({
        failure: { kind: 'denied', action: 'credentials' },
      })
      expect(reads).toEqual([])
    } finally {
      await w.close()
    }
  })

  it('the release chain attaches Web only to Web calls, keeps the other attachments, and skips Web without its config', async () => {
    const w = await forwardWorld()
    try {
      const capability = releaseCapability(w.fixture.root, { tools: null, web: UNUSED })
      const input = (name: 'Web' | 'Shell' | 'Files' | 'TodoItems') => {
        const request: FixedToolRequest = w.request(name)
        if (request.availability.kind !== 'available') throw new Error('fixture availability')
        return {
          principal: w.principal,
          tenant: w.tenant,
          call: w.call,
          request,
          start: {
            kind: 'start' as const,
            operation: okOf(decodeToolOperationId(`web-chain-${name}`), 'operation'),
            executor: request.availability.executor,
            execution: {
              tenant: w.tenant,
              call: w.call,
              instance: okOf(decodeToolInstanceId('web-chain-instance'), 'instance'),
              generation: 'g1',
            },
          },
        }
      }
      const web = capability(input('Web'), scope())
      expect(webAccessOf(web.context)).toBeDefined()
      expect(todoItemsOf(web.context)).toBeUndefined()
      for (const name of ['Shell', 'Files'] as const) {
        const other = capability(input(name), scope())
        expect(webAccessOf(other.context)).toBeUndefined()
        expect(todoItemsOf(other.context)).toBeUndefined()
      }
      const todos = capability(input('TodoItems'), scope())
      expect(todoItemsOf(todos.context)).toBeDefined()
      expect(webAccessOf(todos.context)).toBeUndefined()
      const without = releaseCapability(w.fixture.root, { tools: null, web: null })
      expect(webAccessOf(without(input('Web'), scope()).context)).toBeUndefined()
    } finally {
      await w.close()
    }
  })
})
