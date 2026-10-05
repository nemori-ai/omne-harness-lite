import {
  readPublicHealth,
  exchangeGovernance,
} from '@omne-harness-lite/governance-center-client-https'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { describe, expect, it } from 'vitest'
import { governanceClientOperationsPlugin } from '../src/cordis.ts'
import { GOVERNANCE_CLIENT_OPERATIONS_SERVICE } from '@omne-harness-lite/governance-client-operations/cordis'
import { type GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import { fixtures } from './support.ts'

describe('Cordis composition provider', () => {
  const f = fixtures()
  it('uses the injected state and closes itself without closing the borrowed resource', async () => {
    const { state } = await f()
    const assembly = await bootAssembly({
      services: [
        { name: 'clientLocalState', value: state },
        { name: 'governanceTransport', value: { readPublicHealth, exchangeGovernance } },
      ],
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
