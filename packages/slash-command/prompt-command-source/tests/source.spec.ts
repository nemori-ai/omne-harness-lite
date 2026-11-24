import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createPromptEntrySource, type PromptHolding } from '@omne-harness/prompt-command-source'
import { describe, expect, it } from 'vitest'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const signal = new AbortController().signal
const commit: PromptHolding = {
  kind: 'in-force',
  body: {
    name: 'commit',
    description: '写提交说明。',
    argumentHint: '<scope>',
    prompt: '为 $1 写。',
  },
  from: { layer: 'workspace', version: 'v2', digest: 'd2' },
}
const old: PromptHolding = { kind: 'disabled', name: 'old' }

describe('the prompt commands of the asker as entries', () => {
  const source = createPromptEntrySource<string>({
    held: async () => succeed([commit, old]),
    one: async (_asker, name) => succeed(name === 'commit' ? commit : name === 'old' ? old : null),
  })

  it('lists each as a prompt in the prompt space, the disabled greyed with why', async () => {
    expect(await source.list(asker, signal)).toEqual({
      ok: [
        { space: 'prompt', name: 'commit', kind: 'prompt', title: '写提交说明。', hint: '<scope>' },
        {
          space: 'prompt',
          name: 'old',
          kind: 'prompt',
          title: 'old',
          unavailable: 'This prompt command is disabled.',
        },
      ],
    })
  })

  it('hands over the prompt with the version in force, and nothing of one disabled or gone', async () => {
    expect(await source.take(asker, 'commit', signal)).toEqual({
      ok: {
        kind: 'text',
        text: '为 $1 写。',
        origin: { name: 'prompt:commit', layer: 'workspace', version: 'v2', digest: 'd2' },
      },
    })
    expect(await source.take(asker, 'old', signal)).toEqual({ failure: 'not-listed' })
    expect(await source.take(asker, 'gone', signal)).toEqual({ failure: 'not-listed' })
  })

  it('cannot tell when the layers cannot be read', async () => {
    const down = createPromptEntrySource<string>({
      held: async () => fail('unavailable'),
      one: async () => fail('unavailable'),
    })
    expect(await down.list(asker, signal)).toEqual({ failure: 'unavailable' })
    expect(await down.take(asker, 'commit', signal)).toEqual({ failure: 'unavailable' })
  })
})
