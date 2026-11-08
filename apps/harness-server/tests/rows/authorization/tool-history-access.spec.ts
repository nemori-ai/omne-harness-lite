import { expect, it } from 'vitest'
import { referenceSystemActionAuthorization } from '@omne-harness/authorization'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { principalIssuer, verifierOf } from '../../../src/entry/principals.ts'
import { issueToolHistoryUpgrader } from '../../../src/entry/tool-history-upgrader.ts'
import { issueToolMaterialMaintainer } from '../../../src/entry/tool-material-maintainer.ts'
import { releaseMaintenanceGrants } from '../../../src/rows/authorization/grants.ts'
import { createToolHistoryAuthority } from '../../../src/rows/authorization/tool-history-access.ts'
import { fixtureEnv, fixtureTenant, okOf } from '../../entry/support.ts'

it('requires the distinct issued history principal and rechecks the current grant', async () => {
  const entry = fixtureEnv([principalIssuerKey])
  await entry.install(principalIssuer)
  const principal = issueToolHistoryUpgrader(entry.env)
  const maintainer = issueToolMaterialMaintainer(entry.env)
  let revoked = false
  const grants = releaseMaintenanceGrants()
  const authorization = referenceSystemActionAuthorization({
    verifier: verifierOf(entry.env),
    clock: null,
    grants: {
      read: async input => {
        const answer = await grants.read(input)
        return answer.kind === 'found' && revoked
          ? { ...answer, grant: { ...answer.grant, revoked: true } }
          : answer
      },
    },
  })
  const authority = createToolHistoryAuthority(() => authorization)
  const input = {
    principal,
    tenant: fixtureTenant('a'),
    call: okOf(decodeToolCallId('call_1'), 'call'),
  }
  expect(await authority.qualify(input)).toEqual({ ok: undefined })
  expect(await authority.qualify({ ...input, principal: maintainer })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(await authority.qualify({ ...input, principal: { ...principal } })).toMatchObject({
    failure: { kind: 'denied' },
  })
  revoked = true
  expect(await authority.qualify(input)).toMatchObject({ failure: { kind: 'denied' } })
})
