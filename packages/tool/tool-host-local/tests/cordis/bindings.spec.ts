import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import { createMemoryToolStartAuthority } from '@omne-harness/tool-contract/testing'
import type { ToolAuthority, ToolContribution } from '@omne-harness/tool-contract/provider'
import { ToolContributionAuthorityService } from '@omne-harness/tool-cordis-contract/cordis'
import { createMemoryToolBindingRegistry } from '@omne-harness/tool-cordis-contract/testing'
import { createLocalToolBindingsPlugin } from '@omne-harness/tool-host-local/cordis'
import { describe, expect, it } from 'vitest'
import { authorAccess, authorAuthority, unbox } from '../author-values.ts'
import { authorityFor, loadedFor, scriptedVerifier } from '../binding-values.ts'

async function assembly(grants: readonly ToolAuthority[]) {
  const root = new Context()
  const verifier = createMemoryToolBindingRegistry(
    grants.map(authority => ({ authority, registrants: null })),
  )
  class Authority extends ToolContributionAuthorityService<string> {
    readonly verify = verifier.controls.verify
    readonly admits = scriptedVerifier(grants).admits
  }
  await root.plugin(Authority)
  const provider = root.plugin(
    createLocalToolBindingsPlugin<string, unknown, ContentBlock>({
      availability: {
        judge: async () =>
          fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' }),
      },
      authority: createMemoryToolStartAuthority<string>(),
      scope: () => {
        throw new Error('not executing')
      },
      settle: async () =>
        fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' }),
    }),
  )
  await provider
  return { root, provider }
}

describe('production Cordis bindings', () => {
  it('registers a new activation with the same fiber uid after restart', async () => {
    const { root } = await assembly([authorAuthority])
    const receipts: ToolContribution[] = []
    try {
      const author = root.plugin({
        inject: ['toolBindings'],
        apply(ctx: Context) {
          receipts.push(
            unbox(
              ctx.toolBindings.register({
                ...authorAccess,
                authority: authorAuthority,
                loaded: loadedFor(authorAuthority),
              }),
            ),
          )
        },
      })
      await author
      const uid = author.uid
      await author.restart()
      expect(author.uid).toBe(uid)
      expect(author.state).toBe(2)
      expect(receipts).toHaveLength(2)
      expect(receipts[0]?.token).not.toBe(receipts[1]?.token)
      expect(receipts[0]?.release()).toEqual({ removed: false })
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))[0]?.fiber).toBe(String(uid))
    } finally {
      await root.fiber.dispose()
    }
  })

  it('keeps interleaved caller identities and releases only the old token', async () => {
    const second = authorityFor({ kind: 'official' }, 'other')
    const { root, provider } = await assembly([authorAuthority, second])
    const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const receipts: ToolContribution[] = []
    const callers: Context[] = []
    const author = (authority: ToolAuthority, index: number) => ({
      inject: ['toolBindings'],
      async apply(ctx: Context) {
        callers[index] = ctx
        const bindings = ctx.toolBindings
        await gates[index]?.promise
        receipts[index] = unbox(
          bindings.register({ ...authorAccess, authority, loaded: loadedFor(authority) }),
        )
      },
    })
    try {
      const first = root.plugin(author(authorAuthority, 0))
      const other = root.plugin(author(second, 1))
      gates[1]?.resolve()
      await other
      gates[0]?.resolve()
      await first
      const rows = unbox(root.toolBindings.snapshot({ scope: 'system' }))
      expect(rows.find(row => row.key.asset.name === authorAuthority.asset.name)?.fiber).toBe(
        String(first.uid),
      )
      expect(rows.find(row => row.key.asset.name === second.asset.name)?.fiber).toBe(
        String(other.uid),
      )
      expect(rows.every(row => row.fiber !== String(provider.uid))).toBe(true)
      const held = callers[0]?.toolBindings
      await first.dispose()
      expect(
        held?.register({
          ...authorAccess,
          authority: authorAuthority,
          loaded: loadedFor(authorAuthority),
        }),
      ).toHaveProperty('failure.kind', 'unavailable')
      await root.plugin({
        inject: ['toolBindings'],
        apply(ctx: Context) {
          unbox(
            ctx.toolBindings.register({
              ...authorAccess,
              authority: authorAuthority,
              loaded: loadedFor(authorAuthority, 'successor'),
            }),
          )
        },
      })
      expect(receipts[0]?.release()).toEqual({ removed: false })
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(2)
    } finally {
      gates.forEach(gate => gate.resolve())
      await root.fiber.dispose()
    }
  })

  it('rejects retained binding references after provider withdrawal', async () => {
    const { root, provider } = await assembly([authorAuthority])
    try {
      const old = root.toolBindings
      await provider.dispose()
      expect(
        old.register({
          ...authorAccess,
          authority: authorAuthority,
          loaded: loadedFor(authorAuthority),
        }),
      ).toHaveProperty('failure.kind', 'unavailable')
      expect(old.snapshot({ scope: 'system' })).toHaveProperty('failure.kind', 'unavailable')
      expect(root.get('toolCatalog')).toBeUndefined()
    } finally {
      await root.fiber.dispose()
    }
  })
})
