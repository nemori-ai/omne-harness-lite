import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExtensionInput } from '@omne-harness/agent-contract'
import {
  ExecutionEnvironmentAuthorityService,
  ExecutionScopeBindingService,
  executionEnvironmentKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  commandFacilityPlugin,
  createHostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import {
  createBuiltinExtensions,
  createCommandHost,
  createExtensionImplementations,
} from '@omne-harness/loop-extension-host-local'
import {
  openTenant,
  passageOf,
  probe,
  reader,
  sourcesOf,
  tenantA,
  type TenantWorld,
} from './world.ts'

// The same gate as the macOS commands of the execution environment: they compile a helper with the Command Line Tools.
const enabled = process.platform === 'darwin' && process.env['OMNE_HOST_MACOS'] === '1'

const worlds: TenantWorld[] = []
const closing: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of closing.splice(0)) await close()
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

const REPORT = `
let text = ''
for await (const chunk of process.stdin) text += chunk
const request = JSON.parse(text)
const seen = { env: Object.keys(process.env).sort(), mode: request.mode, passage: request.input.passage, cwd: process.cwd() }
process.stdout.write(JSON.stringify({ kind: 'veto', reason: JSON.stringify(seen) }))
`
const SCRIPTS = {
  'report.mjs': REPORT,
  'fail.mjs': 'process.stderr.write("it broke"); process.exit(3)\n',
  'hang.mjs': 'setInterval(() => {}, 1000)\n',
}

async function realEnvironment() {
  const ctx = new Context()
  class Authority extends ExecutionEnvironmentAuthorityService {
    async authorize(access: { principal: unknown }) {
      return { kind: 'authorized', principal: access.principal, current: () => true } as const
    }
  }
  class Bindings extends ExecutionScopeBindingService {
    async lookup() {
      return { kind: 'bound', tenant: tenantA } as const
    }
  }
  await ctx.plugin(Authority)
  await ctx.plugin(Bindings)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(commandFacilityPlugin)
  const provider = await ctx.plugin(createHostFilesPlugin(createHostFilesDomain()))
  closing.push(() => provider.dispose())
  return () => ctx.get(executionEnvironmentKey)
}

async function arranged(entry: keyof typeof SCRIPTS, timeout = 'PT20S') {
  const world = await openTenant(tenantA)
  worlds.push(world)
  const implementation = { kind: 'command', interpreter: 'node', entry, timeout } as const
  const version = await world.publish(probe('script', { implementation }), SCRIPTS)
  const sources = sourcesOf(world)
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-run-')))
  const host = createCommandHost<string>({
    sources,
    locations: { of: async () => ({ kind: 'location', scope: { ref: 'scope-1' } as never, cwd }) },
    environment: (await realEnvironment()) as never,
    interpreters: { node: process.execPath },
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    directory: realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-ledger-'))),
  })
  closing.push(() => host.close())
  const implementations = createExtensionImplementations({
    sources,
    builtins: createBuiltinExtensions(),
    commands: host.implementations,
  })
  const member = { capability: 'script', assetRef: world.assetRef('script'), version }
  const resolved = await implementations.resolve({ ...reader(tenantA), passage: passageOf(member) })
  if (!('ok' in resolved)) throw new Error(JSON.stringify(resolved))
  const input = { passage: 'pass-1/call/1', execution: 'execution-1' } as unknown as ExtensionInput
  const run = () => resolved.ok.invoke(input, new AbortController().signal, { kind: 'fresh' })
  return { run, cwd }
}

describe('a node script of the package, run by the real execution environment', () => {
  it('reads the request, answers an output, and sees only the listed environment variables', async ctx => {
    if (!enabled) return ctx.skip()
    const { run, cwd } = await arranged('report.mjs')
    const result = await run()
    if (result.kind !== 'output') throw new Error(JSON.stringify(result))
    const { reason } = result.value as { reason: string }
    const seen = JSON.parse(reason) as {
      env: string[]
      mode: string
      passage: string
      cwd: string
    }
    expect(seen.mode).toBe('fresh')
    expect(seen.passage).toBe('pass-1/call/1')
    expect(seen.cwd).toBe(cwd)
    expect(seen.env.filter(name => name !== '__CF_USER_TEXT_ENCODING')).toEqual(['LANG', 'PATH'])
  }, 60_000)

  it('a script that exits with a code is a nonzero exit, and what it wrote to the standard error stays out of the result', async ctx => {
    if (!enabled) return ctx.skip()
    const { run } = await arranged('fail.mjs')
    const result = await run()
    expect(result).toMatchObject({ kind: 'errored', classification: 'nonzero_exit' })
    expect(JSON.stringify(result)).not.toContain('it broke')
  }, 60_000)

  it('a script that does not end is stopped at its time limit', async ctx => {
    if (!enabled) return ctx.skip()
    const { run } = await arranged('hang.mjs', 'PT1S')
    expect(await run()).toMatchObject({ kind: 'errored', classification: 'timeout' })
  }, 60_000)
})
