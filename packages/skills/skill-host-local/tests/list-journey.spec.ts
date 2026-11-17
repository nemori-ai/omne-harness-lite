import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { runListJourney } from '../examples/list-journey.ts'
import { scratch } from './scratch.ts'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const owner = tenant(organization.value, account.value)

const packageDir = fileURLToPath(new URL('../examples/sample-skill', import.meta.url))

describe('finding the Skills of a tenant without knowing their names', () => {
  it('lists two, evaluates one usable and one known but unavailable, and one after a removal', async () => {
    const run = await runListJourney({
      packageDir,
      stateDir: await scratch(),
      reader: { access: access('reader', owner), tenant: owner },
    })
    expect(run.listedBefore).toEqual(['sample-skill', 'second-skill'])
    expect(run.resolutions).toEqual([
      { name: 'sample-skill', kind: 'adopted', layer: 'tenant' },
      { name: 'second-skill', kind: 'known-unavailable', reason: 'This Skill is disabled.' },
    ])
    expect(run.listedAfter).toEqual(['sample-skill'])
  })
})
