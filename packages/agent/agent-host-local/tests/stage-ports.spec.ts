// The ports of the locally required dependencies: each call reads the provider from the host's
// Context. An absent provider answers `unavailable` named after its key and never waits; a present
// one gets the call with its own `this`; a provider that comes or goes changes the next call only.
import { Context } from '@deepseek-ai/cordis'
import type { AgentMaterials } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { describe, expect, it } from 'vitest'
import { stagePort } from '../src/stage-ports.ts'

type Materials = AgentMaterials<string, ContentBlock>

describe('a stage port', () => {
  it('answers unavailable at once while the provider is absent', async () => {
    const root = new Context()
    const materials = stagePort<Materials>(root, 'agentMaterials')
    expect(await materials.read({} as never)).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'agentMaterials',
        diagnostic: 'no provider of agentMaterials is present',
      },
    })
  })

  it('forwards each call to the provider that is present at that call', async () => {
    const root = new Context()
    const materials = stagePort<Materials>(root, 'agentMaterials')
    const seen: unknown[] = []
    const provider = {
      label: 'first',
      read(this: { label: string }, input: unknown) {
        seen.push([this.label, input])
        return Promise.resolve({ ok: this.label })
      },
    }
    const dispose = root.provide('agentMaterials', provider)
    expect(await materials.read('one' as never)).toEqual({ ok: 'first' })
    dispose()
    expect(await materials.read('two' as never)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(seen).toEqual([['first', 'one']])
  })

  it('is not taken for a promise', async () => {
    const root = new Context()
    const materials = stagePort<Materials>(root, 'agentMaterials')
    expect(await Promise.resolve(materials)).toBe(materials)
  })
})
