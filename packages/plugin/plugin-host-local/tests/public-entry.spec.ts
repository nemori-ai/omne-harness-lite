import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('the root entry exports the two categories, each with its contract and its point, the loading on the server and its two points, the judgment of a category, and the skills it brings with the release', async () => {
  const root = (await import('@omne-harness/plugin-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GUEST_FORMS_POINT',
    'OFFICIAL_SKILLS',
    'PLUGIN_CATEGORY',
    'PLUGIN_PACKAGE_LIMITS',
    'PORTS_POINT',
    'SKIN_CATEGORY',
    'createKeptContents',
    'createServerSide',
    'guestFormsContract',
    'heldPlugins',
    'listedPlugins',
    'noMemberOf',
    'pluginBodyContract',
    'pluginCategoryDisplay',
    'pluginEffect',
    'pluginImpact',
    'pluginPlacement',
    'pluginPluginsPoint',
    'portsContract',
    'readHeldPart',
    'serverInstall',
    'skinBodyContract',
    'skinCategoryDisplay',
    'skinSkinsPoint',
    'targetOf',
  ])
})

it('each skill it brings with the release is a package of its own: a SKILL.md that names it, in a directory the package publishes', async () => {
  const { OFFICIAL_SKILLS } = await import('@omne-harness/plugin-host-local')
  expect(OFFICIAL_SKILLS.map(skill => skill.name)).toEqual(['skin-authoring', 'extending-the-app'])
  for (const skill of OFFICIAL_SKILLS) {
    const text = await readFile(join(skill.directory, 'SKILL.md'), 'utf8')
    expect(text).toMatch(new RegExp(`^---\\nname: ${skill.name}\\ndescription: .+\\n---\\n`, 'u'))
  }
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { files: string[] }
  expect(manifest.files).toContain('skills')
})

it('the handbook says a page is drawn before its protocol may be there, to ask again on unavailable, and to see it work before saying done', async () => {
  const { OFFICIAL_SKILLS } = await import('@omne-harness/plugin-host-local')
  const handbook = OFFICIAL_SKILLS.find(skill => skill.name === 'extending-the-app')
  const text = await readFile(join(handbook?.directory ?? '', 'SKILL.md'), 'utf8')
  expect(text).toContain(
    "Until then a call answers `{ outcome: 'unavailable' }`. Read that as not yet: ask again",
  )
  expect(text).toContain('See it work before you say it is done.')
  expect(text).toContain('make that thing happen first')
})
