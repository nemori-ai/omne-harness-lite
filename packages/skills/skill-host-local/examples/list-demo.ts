import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { runListJourney, type ListedResolution } from './list-journey.ts'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the demo tenant texts are not legal')
const reader = tenant(organization.value, account.value)

function described(one: ListedResolution): string {
  if (one.kind === 'adopted') return `${one.kind}, layer ${one.layer}`
  if (one.kind === 'known-unavailable') return `${one.kind}: ${one.reason}`
  return one.kind
}

const stateDir = await mkdtemp(join(tmpdir(), 'skill-list-demo-'))
try {
  const journey = await runListJourney({
    packageDir: fileURLToPath(new URL('sample-skill', import.meta.url)),
    stateDir,
    reader: { access: access('demo-reader', reader), tenant: reader },
  })
  console.log('== published two Skills, disabled second-skill')
  console.log(`listed without a name: ${journey.listedBefore.join(', ')}`)
  console.log('== each listed Skill, evaluated')
  for (const one of journey.resolutions) console.log(`${one.name}: ${described(one)}`)
  console.log('== removed second-skill, listed again')
  console.log(`listed without a name: ${journey.listedAfter.join(', ')}`)
} finally {
  await rm(stateDir, { recursive: true, force: true })
}
