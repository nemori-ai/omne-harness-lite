import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { runPublishJourney, type PublishJourney } from './publish-journey.ts'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the demo tenant texts are not legal')
const reader = tenant(organization.value, account.value)

const packageDir = fileURLToPath(new URL('sample-skill', import.meta.url))
const officialDir = fileURLToPath(new URL('official-sample-skill', import.meta.url))

function winnerOf(journey: PublishJourney): string {
  const answer = journey.resolution
  return answer.kind === 'adopted'
    ? `${answer.kind}: layer ${answer.ref.layer}, ${answer.ref.locator.kind}`
    : answer.kind
}

function print(title: string, journey: PublishJourney): void {
  const body = journey.body.content
  const text = body.kind === 'text' ? body.text : '<bytes>'
  console.log(`== ${title}`)
  console.log(`published version: ${journey.version}`)
  console.log(`evaluation winner: ${winnerOf(journey)}`)
  console.log('entry body, first lines:')
  for (const line of text.split('\n').slice(0, 4)) console.log(`  | ${line}`)
  console.log(`files: ${journey.listing.resources.map(entry => entry.path).join(', ')}`)
  console.log(
    `local directory: ${journey.location.kind === 'local-directory' ? journey.location.path : 'absent'}`,
  )
}

for (const [title, officialImmutable] of [
  ['the official copy can be replaced: the tenant copy wins', false],
  ['the official copy declares it cannot be replaced: the tenant copy is out', true],
] as const) {
  const stateDir = await mkdtemp(join(tmpdir(), 'skill-publish-demo-'))
  try {
    const journey = await runPublishJourney({
      packageDir,
      officialDir,
      officialImmutable,
      stateDir,
      reader: { access: access('demo-reader', reader), tenant: reader },
    })
    print(title, journey)
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
}
