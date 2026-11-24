import { describe, expect, it } from 'vitest'
import {
  createCategoryPoint,
  digestBytes,
  type BodyContract,
  type CategoryPoint,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  PLUGIN_CATEGORY,
  pluginBodyContract,
  pluginCategoryDisplay,
  pluginPluginsPoint,
} from '@omne-harness/plugin-host-local'

const encoder = new TextEncoder()
const LIMITS = { files: 16, fileBytes: 4096, totalBytes: 16_384 }

function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  return {
    manifest: async () =>
      succeed({
        entries: Object.entries(files).map(([path, text]) => ({
          path,
          bytes: encoder.encode(text).length,
          digest: digestBytes(encoder.encode(text)),
        })),
      }),
    open: async path =>
      files[path] === undefined ? fail('entry-not-found') : succeed(encoder.encode(files[path])),
  }
}

const field = (body: unknown, key: string): JsonValue | undefined => {
  const tree = body as JsonValue
  return tree.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined
}

const base = (category: string): Omit<BodyContract, 'judge'> => ({
  category,
  schema: { kind: 'null' },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
})

function world() {
  const seen: string[][] = []
  const judged: unknown[] = []
  const categories = createCategoryPoint()
  const display = { title: 't', summary: 's' }
  categories.contribute({
    point: 'skill.skills',
    display,
    contract: {
      ...base('skill'),
      judge: (_, context) => (judged.push(context), { ok: true }),
      layout: {
        namespace: 'skills',
        limits: LIMITS,
        async inspect(pkg) {
          const listed = await pkg.manifest()
          if (!('ok' in listed)) return fail({ kind: 'source-failed', failure: listed.failure })
          const paths = listed.ok.entries.map(entry => entry.path)
          seen.push(paths)
          return paths.includes('SKILL.md')
            ? succeed({ kind: 'object', entries: [] })
            : fail({ kind: 'invalid-package', reason: 'no-skill-md' })
        },
      },
    },
  })
  categories.contribute({
    point: 'media.converters',
    display,
    contract: {
      ...base('converter'),
      judge: (body, context) => {
        judged.push(context)
        return field(body, 'kind')?.kind === 'string'
          ? { ok: true }
          : { ok: false, rejected: 'no-kind' }
      },
    },
  })
  categories.contribute({
    point: 'tool.tools',
    display,
    generalCreation: 'closed',
    contract: { ...base('tool'), judge: () => ({ ok: true }) },
  })
  const contract = pluginBodyContract(categories)
  categories.contribute({
    point: pluginPluginsPoint.name,
    display: pluginCategoryDisplay,
    contract,
  })
  return { categories, contract, seen, judged }
}

type Sides = Readonly<{ client?: readonly unknown[]; server?: readonly unknown[] }>

const manifest = (sides: Sides, name = 'tidy'): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'Keeps things tidy.',
    ...(sides.client !== undefined && { client: { members: sides.client } }),
    ...(sides.server !== undefined && { server: { members: sides.server } }),
  })

const SKILL = { point: 'skill.skills', key: 'tidy-up', directory: 'skills/tidy-up' }
const CONVERTER = { point: 'media.converters', key: 'pdf', data: { kind: 'pdf' } }
const TOKENS = { point: 'shell.tokens', key: 'accent', data: { '--omne-accent': '#0a7a4a' } }

const GOOD = {
  'plugin.json': manifest({ client: [TOKENS], server: [SKILL, CONVERTER] }),
  'skills/tidy-up/SKILL.md': 'tidy',
  'skills/tidy-up/scripts/run.sh': 'run',
}

async function inspect(
  files: Readonly<Record<string, string>>,
  over: (categories: CategoryPoint) => void = () => undefined,
) {
  const made = world()
  over(made.categories)
  return { ...made, answer: await made.contract.layout!.inspect(packageOf(files)) }
}

const rejected = (reason: string) => fail({ kind: 'invalid-package', reason })

describe('the category', () => {
  it('is a directory category named plugin, with its own point', () => {
    const { categories } = world()
    expect(PLUGIN_CATEGORY).toBe('plugin')
    expect(categories.describe('plugin')).toMatchObject({
      creation: 'directory',
      point: 'plugin.plugins',
    })
  })
})

describe('inspecting a package', () => {
  it('accepts a package whose members each fit their category, and gives the manifest as its body', async () => {
    const { answer } = await inspect(GOOD)
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    expect(field(answer.ok, 'name')).toEqual({ kind: 'string', value: 'tidy' })
    expect(field(answer.ok, 'server')?.kind).toBe('object')
  })

  it('shows the category of a directory member that directory and no other file', async () => {
    const { seen } = await inspect(GOOD)
    expect(seen).toEqual([['SKILL.md', 'scripts/run.sh']])
  })

  it('tells each category the key of the member as the name of what it judges', async () => {
    const { judged } = await inspect(GOOD)
    expect(judged).toEqual([
      expect.objectContaining({ capabilityName: 'tidy-up' }),
      { capabilityName: 'pdf' },
    ])
  })

  it('accepts an image that begins as its name says, and rejects one that only bears the name, naming the file', async () => {
    const drawn = { ...GOOD, 'art/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' }
    expect('ok' in (await inspect(drawn)).answer).toBe(true)
    const { answer } = await inspect({ ...GOOD, 'art/sea.png': '<html><script>1</script></html>' })
    expect(answer).toEqual(rejected('the file art/sea.png is not the image its name says'))
  })

  it('an image that cannot be read now is the source failing, not a package refused', async () => {
    const made = world()
    const pkg = packageOf({ ...GOOD, 'art/mark.svg': '<svg/>' })
    const answer = await made.contract.layout!.inspect({
      manifest: pkg.manifest,
      open: async (path, digest) =>
        path === 'art/mark.svg' ? fail('unavailable') : pkg.open(path, digest),
    })
    expect(answer).toEqual(fail({ kind: 'source-failed', failure: 'unavailable' }))
  })

  it('rejects a package without a manifest', async () => {
    const { answer } = await inspect({ 'main.js': '' })
    expect(answer).toEqual(rejected('the package has no plugin.json'))
  })

  it('rejects a manifest that cannot be read, with what is wrong with it', async () => {
    const { answer } = await inspect({ 'plugin.json': '{"schema":1,"name":"Tidy"}' })
    expect(answer).toEqual(
      rejected('the name "Tidy" is not lower-case letters, digits and hyphens'),
    )
  })

  it('rejects a member whose file is not in the package, naming the member', async () => {
    const member = { point: 'notes.card', key: 'todo', module: 'card.js', export: 'card' }
    const { answer } = await inspect({ 'plugin.json': manifest({ client: [member] }) })
    expect(answer).toEqual(rejected('client.members[0]: the file card.js is not in the package'))
  })

  it('rejects a directory member its category rejects, with the member and what the category said', async () => {
    const { answer } = await inspect({
      'plugin.json': manifest({ server: [CONVERTER, SKILL] }),
      'skills/tidy-up/notes.md': 'no entry file',
    })
    expect(answer).toEqual(
      rejected('server.members[1] (skill.skills, tidy-up): the category skill says no-skill-md'),
    )
  })

  it('rejects a data member its category rejects, with the member and what the category said', async () => {
    const unfit = { ...CONVERTER, data: { sort: 'pdf' } }
    const { answer } = await inspect({ 'plugin.json': manifest({ server: [unfit] }) })
    expect(answer).toEqual(
      rejected('server.members[0] (media.converters, pdf): the category converter says no-kind'),
    )
  })

  it('rejects a member of a category the general entry does not create', async () => {
    const tool = { point: 'tool.tools', key: 'Web', data: {} }
    const { answer } = await inspect({ 'plugin.json': manifest({ server: [tool] }) })
    expect(answer).toEqual(
      rejected(
        'server.members[0] (tool.tools, Web): the category tool is not created through the general entry',
      ),
    )
  })

  it('rejects a data member of a category that takes a directory', async () => {
    const member = { point: 'skill.skills', key: 'tidy-up', data: {} }
    const { answer } = await inspect({ 'plugin.json': manifest({ server: [member] }) })
    expect(answer).toEqual(
      rejected('server.members[0] (skill.skills, tidy-up): the category skill takes a directory'),
    )
  })

  it('rejects a directory member of a category that takes data', async () => {
    const member = { point: 'media.converters', key: 'pdf', directory: 'skills/tidy-up' }
    const { answer } = await inspect({ ...GOOD, 'plugin.json': manifest({ server: [member] }) })
    expect(answer).toEqual(
      rejected('server.members[0] (media.converters, pdf): the category converter takes data'),
    )
  })

  it('rejects a member of a category written on the client side: the points of categories are on the server', async () => {
    const { answer } = await inspect({ ...GOOD, 'plugin.json': manifest({ client: [SKILL] }) })
    expect(answer).toEqual(
      rejected(
        'client.members[0] (skill.skills, tidy-up): the point of the category skill is on the server; write the member on the server side',
      ),
    )
  })

  it('rejects a plugin inside a plugin', async () => {
    const inner = { point: 'plugin.plugins', key: 'inner', directory: 'skills/tidy-up' }
    const { answer } = await inspect({ ...GOOD, 'plugin.json': manifest({ server: [inner] }) })
    expect(answer).toEqual(
      rejected('server.members[0] (plugin.plugins, inner): a plugin does not hold a plugin'),
    )
  })

  it('does not judge a member of a point that is the point of no category', async () => {
    const odd = { point: 'notes.card', key: 'todo', data: { anything: [1, null] } }
    const { answer, judged } = await inspect({ 'plugin.json': manifest({ client: [odd] }) })
    expect('ok' in answer).toBe(true)
    expect(judged).toEqual([])
  })

  it('says the basis is not available when the category of a member is in conflict', async () => {
    const { answer } = await inspect(GOOD, categories =>
      categories.contribute({
        point: 'skill.skills',
        display: { title: 't', summary: 's' },
        contract: { ...base('other'), judge: () => ({ ok: true }) },
      }),
    )
    expect(answer).toEqual(fail({ kind: 'source-failed', failure: 'unavailable' }))
  })

  it('says the source failed when the package cannot be listed', async () => {
    const { contract } = world()
    const answer = await contract.layout!.inspect({
      manifest: async () => fail('unavailable'),
      open: async () => fail('unavailable'),
    })
    expect(answer).toEqual(fail({ kind: 'source-failed', failure: 'unavailable' }))
  })
})

describe('judging a body', () => {
  async function bodyOf(name = 'tidy'): Promise<JsonValue> {
    const { answer } = await inspect({ 'plugin.json': manifest({ client: [TOKENS] }, name) })
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    return answer.ok
  }

  it('accepts the body its layout gave, under the name the manifest writes', async () => {
    const { contract } = world()
    expect(contract.judge(await bodyOf(), { capabilityName: 'tidy' })).toEqual({ ok: true })
    expect(contract.judge(await bodyOf())).toEqual({ ok: true })
  })

  it('rejects a body published under another name than its manifest writes', async () => {
    const { contract } = world()
    expect(contract.judge(await bodyOf(), { capabilityName: 'other' })).toEqual({
      ok: false,
      rejected: 'the manifest names tidy; it is published as other',
    })
  })

  it.each([[null], ['text'], [{ kind: 'object', entries: [] }]])(
    'rejects %j: it is not a manifest',
    body => {
      const { contract } = world()
      expect(contract.judge(body)).toMatchObject({ ok: false })
    },
  )

  it('declares nothing and refers to nothing', async () => {
    const { contract } = world()
    const body = await bodyOf()
    expect(contract.deriveDeclarations(body)).toEqual({ entries: [] })
    expect(contract.references(body)).toEqual([])
  })
})
