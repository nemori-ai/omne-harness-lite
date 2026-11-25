import { Context } from '@deepseek-ai/cordis'
import type { EnabledExtension, ExtensionInput } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_EXTENSIONS_KEY,
  systemExtensionsOf,
  systemExtensionsRow,
  type SystemExtensionProvider,
  type SystemExtensionsRegistry,
} from '../../../src/rows/system-extensions/index.ts'

const member = (name: string) =>
  ({
    declaration: { name, position: 'before_terminal' },
    implementation: { owner: 'o', name, revision: '1', digest: 'd' },
  }) as unknown as EnabledExtension
const TENANT = 'tenant' as unknown as TenantId
const INPUT = { execution: 'e' } as unknown as ExtensionInput

function provider(name: string, ...members: readonly EnabledExtension[]) {
  const calls: unknown[] = []
  const contributed: SystemExtensionProvider = {
    name,
    members,
    async invoke(access, own, input) {
      calls.push({ access, own, input })
      return { kind: 'observed' } as never
    },
  }
  return { contributed, calls }
}

async function registryOf(declared: readonly string[]) {
  const root = new Context()
  await root.plugin(systemExtensionsRow, { declared })
  const registry = root.get(SYSTEM_EXTENSIONS_KEY) as SystemExtensionsRegistry
  return { root, registry }
}

describe('the registry of the trusted system extensions', () => {
  it('gives the members in the order the release declares them, whatever order they were contributed in', async () => {
    const { root, registry } = await registryOf(['first', 'second'])
    const [a, b, c] = [member('a'), member('b'), member('c')]
    registry.contribute(root, provider('second', c).contributed)
    registry.contribute(root, provider('first', a, b).contributed)
    expect(registry.members()).toEqual({ ok: [a, b, c] })
  })

  it('answers that a declared contribution is away, never that it has no member', async () => {
    const { root, registry } = await registryOf(['first', 'second'])
    expect(registry.members()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'the system extensions of first are away' },
    })
    registry.contribute(root, provider('first', member('a')).contributed)
    expect(registry.members()).toMatchObject({
      failure: { diagnostic: 'the system extensions of second are away' },
    })
  })

  it('leaves a contribution nobody declared out of what it gives', async () => {
    const { root, registry } = await registryOf([])
    registry.contribute(root, provider('stray', member('a')).contributed)
    expect(registry.members()).toEqual({ ok: [] })
  })

  it('takes one contribution under a name, and lets it go with the scope that made it', async () => {
    const { root, registry } = await registryOf(['first'])
    const a = member('a')
    const fiber = await root.plugin({
      name: 'contributor',
      apply: ctx => registry.contribute(ctx, provider('first', a).contributed),
    })
    expect(registry.members()).toEqual({ ok: [a] })
    expect(() => registry.contribute(root, provider('first', a).contributed)).toThrow(
      'contributed already',
    )
    await fiber.dispose()
    expect(registry.members()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(registry.find(a)).toBeUndefined()
  })
})

describe('the system source the Agent host reads', () => {
  it('has no member where the release mounts no registry, and resolves none', async () => {
    const source = systemExtensionsOf(new Context())
    expect(await source.read({} as never)).toEqual({ ok: [] })
    const passage = member('a')
    const resolved = await source.resolve({ passage, principal: 'p', tenant: TENANT } as never)
    expect(resolved).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('reads the registry at each read, and runs a member through the contribution that holds exactly it', async () => {
    const { root, registry } = await registryOf(['first'])
    const source = systemExtensionsOf(root)
    expect(await source.read({} as never)).toMatchObject({ failure: { kind: 'unavailable' } })
    const a = member('a')
    const first = provider('first', a)
    registry.contribute(root, first.contributed)
    expect(await source.read({} as never)).toEqual({ ok: [a] })
    const resolved = await source.resolve({ passage: a, principal: 'p', tenant: TENANT } as never)
    if (!('ok' in resolved)) throw new Error('not resolved')
    expect(resolved.ok.implementation).toEqual(a.implementation)
    const ran = await resolved.ok.invoke(INPUT, new AbortController().signal, 'first' as never)
    expect(ran).toEqual({ kind: 'observed' })
    expect(first.calls).toEqual([
      { access: { principal: 'p', tenant: TENANT }, own: a, input: INPUT },
    ])
    const other = { ...a, implementation: { ...a.implementation, digest: 'another' } }
    const stranger = await source.resolve({
      passage: other,
      principal: 'p',
      tenant: TENANT,
    } as never)
    expect(stranger).toMatchObject({ failure: { diagnostic: 'no system extension is a' } })
  })
})
