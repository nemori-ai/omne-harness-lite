import { describe, expect, it } from 'vitest'
import { createLocalToolLoader } from '@omne-harness/tool-host-local'
import { fail, succeed } from '@omne-harness/operation-result'
import { judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import {
  authorAccess,
  authorAuthority,
  authorModule,
  construction,
  loadAuthor,
  settings,
  unbox,
} from './author-values.ts'
import { scriptedVerifier } from './binding-values.ts'

describe('author loading', () => {
  it('derives two authors without executing either one', async () => {
    let executions = 0
    for (const module of [
      authorModule(async () => {
        executions += 1
      }),
      authorModule(async () => {
        executions += 1
      }),
    ]) {
      const loaded = unbox(await loadAuthor(module))
      expect(judgeToolDefinition(loaded.definition)).toHaveProperty('ok')
      expect(loaded.key.asset).toEqual(authorAuthority.asset)
    }
    expect(executions).toBe(0)
  })
  it.each(['origin', 'settings', 'schema'] as const)(
    'rejects invalid %s without execution',
    async stage => {
      let constructions = 0
      let executions = 0
      const module = authorModule(async () => {
        executions += 1
      })
      const loader = createLocalToolLoader({
        authority: authorAuthority,
        verifier: scriptedVerifier(stage === 'origin' ? [] : [authorAuthority]),
        settings: async () =>
          stage === 'settings'
            ? fail({ kind: 'invalid', field: 'construction', reason: 'illegal value' })
            : succeed(construction),
        schemas: async () =>
          stage === 'schema'
            ? fail({ kind: 'invalid', field: 'schema', reason: 'mismatch' })
            : succeed(undefined),
      })
      const answer = await loader.load({
        ...authorAccess,
        asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
        settings,
        services: {},
        module: {
          ...module,
          createAuthor: input => {
            constructions += 1
            return module.createAuthor(input)
          },
        },
      })
      expect(answer).toHaveProperty('failure')
      expect(executions).toBe(0)
      if (stage !== 'schema') expect(constructions).toBe(0)
    },
  )
})
