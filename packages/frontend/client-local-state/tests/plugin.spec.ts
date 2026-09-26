import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { describe, expect, it } from 'vitest'
import {
  CLIENT_LOCAL_STATE_SERVICE,
  clientLocalStatePlugin,
  type ClientLocalState,
} from '../src/index.ts'
import { fixtures, logged } from './support.ts'

describe('Cordis state provider', () => {
  const f = fixtures()
  it('provides the state face and closes the old instance on removal', async () => {
    const directory = await f.directory()
    const assembly = await bootAssembly({
      plugins: [{ plugin: clientLocalStatePlugin, config: { directory } }],
    })
    const state = assembly.ctx.get(CLIENT_LOCAL_STATE_SERVICE) as ClientLocalState
    try {
      const result = await state.read()
      expect(result.kind).toBe('read')
      if (result.kind !== 'read') throw new Error('missing initialized state')
      expect(
        (await state.compareAndReplace(result.snapshot.token, logged, 'plugin-save')).kind,
      ).toBe('installed')
    } finally {
      await assembly.dispose()
    }
    expect(assembly.ctx.get(CLIENT_LOCAL_STATE_SERVICE)).toBeUndefined()
    await expect(state.read()).rejects.toMatchObject({ reason: 'closed' })
    expect((await (await f.open(directory)).read()).kind).toBe('read')
  })
})
