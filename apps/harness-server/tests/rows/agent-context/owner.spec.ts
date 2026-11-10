// The owner of the `agent-context` row is fixed by the release code (R2-D202): the source
// registration grant of `requestContextTrust` names it, so a configuration cannot move it.
import { describe, expect, it } from 'vitest'
import { AGENT_CONTEXT_OWNER } from '../../../src/assembly/agent-context-owner.ts'
import { agentContextRowConfig } from '../../../src/rows/agent-context/index.ts'

const config = agentContextRowConfig['~standard']

describe('the agent-context row configuration', () => {
  it('hands the member the release owner', async () => {
    expect(await config.validate({})).toEqual({ value: { owner: AGENT_CONTEXT_OWNER } })
  })

  it('refuses a configuration that gives an owner, also the release one', async () => {
    for (const owner of [AGENT_CONTEXT_OWNER, { ...AGENT_CONTEXT_OWNER, owner: 'joint-b' }])
      expect(await config.validate({ owner })).toMatchObject({
        issues: [expect.anything()],
      })
  })

  it('still checks the rest of the configuration with the member schema', async () => {
    expect(await config.validate({ materials: 0 })).toMatchObject({
      issues: [expect.anything()],
    })
  })
})
