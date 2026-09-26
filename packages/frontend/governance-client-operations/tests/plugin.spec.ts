import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { describe, expect, it } from 'vitest'
import {
  governanceClientOperationsPlugin,
  GOVERNANCE_CLIENT_OPERATIONS_SERVICE,
  type GovernanceClientOperations,
} from '../src/index.ts'
import { fixtures } from './support.ts'

describe('Cordis composition provider', () => {
  const f = fixtures()
  it('uses the injected state and closes itself without closing the borrowed resource', async () => {
    const { state } = await f()
    const assembly = await bootAssembly({
      services: [{ name: 'clientLocalState', value: state }],
      plugins: [{ plugin: governanceClientOperationsPlugin, config: {} }],
    })
    const client = assembly.ctx.get(
      GOVERNANCE_CLIENT_OPERATIONS_SERVICE,
    ) as GovernanceClientOperations
    try {
      expect((await client.openUse()).kind).toBe('use')
      await client.close()
    } finally {
      await assembly.dispose()
    }
    await expect(client.openUse()).rejects.toMatchObject({ reason: 'closed' })
    expect((await state.read()).kind).toBe('read')
  })
})
