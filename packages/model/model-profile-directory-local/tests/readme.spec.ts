import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { BoundCredentialReplicaReaderService } from '@omne-harness-lite/model-profile-directory/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { setup, alice, actualClock, memberships } from './support.ts'

function callable(
  value: unknown,
  name: string,
): (...args: unknown[]) => Promise<unknown> | unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`literal export missing: ${name}`)
  if (!Object.hasOwn(value, name)) throw new Error(`literal export missing: ${name}`)
  const method: unknown = Reflect.get(value, name)
  if (typeof method !== 'function') throw new Error(`literal not callable: ${name}`)
  return (...args: unknown[]) => Reflect.apply(method, undefined, args)
}
function readLiterals(file: string): readonly string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/```typescript\n([\s\S]*?)```/gu)].map(match => match[1] ?? '')
}
for (const language of ['README.md', 'README_ZH.md'])
  it(`${language} five literal public examples run against real Cordis and file SQLite`, async () => {
    const base = resolve(import.meta.dirname, '..')
    const snippets = readLiterals(join(base, language))
    expect(snippets).toHaveLength(5)
    const scratch = mkdtempSync(join(base, '.readme-run-'))
    const modules: unknown[] = []
    const h = await setup(`readme-${language}`)
    try {
      for (const [index, snippet] of snippets.entries()) {
        const file = join(scratch, `${index}.ts`)
        writeFileSync(file, snippet)
        const loaded: unknown = await import(pathToFileURL(file).href)
        modules.push(loaded)
      }
      const rows = await callable(modules[2], 'manageModels')(h.catalog, alice)
      if (!Array.isArray(rows)) throw new Error('management example did not return rows')
      expect(await callable(modules[0], 'choose')(rows, alice)).toHaveProperty(
        'profile.routeName',
        'demo/model',
      )
      const technical = await callable(modules[3], 'trustedAssemblyInputs')(h.storage, [])
      if (
        technical === null ||
        typeof technical !== 'object' ||
        !('readCredentialBindingIn' in technical)
      )
        throw new Error('technical example missing reader')
      expect(typeof technical.readCredentialBindingIn).toBe('function')
      const assembly = await bootAssembly({
        services: [
          { name: 'storage', value: h.storage },
          { name: 'clock', value: actualClock(h.assembly) },
          { name: 'memberships', value: memberships(h.assembly) },
        ],
      })
      try {
        const fiber = await callable(modules[1], 'mountDirectory')(assembly.ctx, {
          ordinal: 1,
          entries: [],
        })
        expect(fiber).toBeDefined()
        class Reader extends BoundCredentialReplicaReaderService {
          async readIn() { return { absent: true } as const }
        }
        new Reader(assembly.ctx)
        const local = await callable(modules[4], 'mountLocalLookup')(assembly.ctx)
        expect(local).toBeDefined()
        const lookup: unknown = assembly.ctx.get('credentialLookup')
        expect(lookup).toHaveProperty('value')
        if (
          lookup === null ||
          typeof lookup !== 'object' ||
          !('value' in lookup) ||
          typeof lookup.value !== 'function'
        )
          throw new Error('local lookup absent')
        expect(await lookup.value(alice, 'custom')).toEqual({ failure: 'credentialUnavailable' })
        if (
          local !== null &&
          typeof local === 'object' &&
          'dispose' in local &&
          typeof local.dispose === 'function'
        )
          await local.dispose()
        if (
          fiber !== null &&
          typeof fiber === 'object' &&
          'dispose' in fiber &&
          typeof fiber.dispose === 'function'
        )
          await fiber.dispose()
      } finally {
        await assembly.dispose()
      }
    } finally {
      await h.close()
      rmSync(scratch, { recursive: true, force: true })
    }
  })
