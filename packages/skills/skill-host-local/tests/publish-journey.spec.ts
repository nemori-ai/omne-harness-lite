import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { runPublishJourney, writeOfficialSample } from '../examples/publish-journey.ts'
import { scratch } from './scratch.ts'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const owner = tenant(organization.value, account.value)

const packageDir = fileURLToPath(new URL('../examples/sample-skill', import.meta.url))
async function journey(officialImmutable: boolean, officialDir: string) {
  return runPublishJourney({
    packageDir,
    officialDir,
    officialImmutable,
    stateDir: await scratch(),
    reader: { access: access('reader', owner), tenant: owner },
  })
}

describe('publishing a directory as a Skill of the tenant, then reading it', () => {
  it('the tenant copy wins over an official copy that can be replaced, and is read', async () => {
    const run = await journey(false, await writeOfficialSample(await scratch()))
    expect(run.resolution).toMatchObject({
      kind: 'adopted',
      ref: {
        layer: 'tenant',
        locator: { kind: 'content-store', digest: run.version, ref: 'tenant/skill/sample-skill' },
      },
    })
    expect(run.body.content).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('Run scripts/report.sh when the user asks for a report.'),
    })
    expect(run.body.basis).toMatchObject({ layer: 'tenant', digest: run.version })
    expect(run.listing.resources.map(entry => entry.path)).toEqual([
      'references/guide.md',
      'scripts/report.sh',
    ])
    expect(run.location).toEqual({
      kind: 'local-directory',
      path: expect.stringMatching(/\/packages\/skills\/sample-skill\/sha256-[0-9a-f]{64}$/),
    })
    if (run.location.kind !== 'local-directory') throw new Error('no directory')
    expect(readFileSync(join(run.location.path, 'scripts/report.sh'), 'utf8')).toBe(
      readFileSync(join(packageDir, 'scripts/report.sh'), 'utf8'),
    )
  })

  it('an official copy that cannot be replaced keeps the tenant copy out', async () => {
    const officialDir = await writeOfficialSample(await scratch())
    const run = await journey(true, officialDir)
    expect(run.resolution).toMatchObject({
      kind: 'adopted',
      ref: { layer: 'official', locator: { kind: 'directory', root: officialDir } },
    })
    expect(run.body.content).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('This is the official copy.'),
    })
  })
})
