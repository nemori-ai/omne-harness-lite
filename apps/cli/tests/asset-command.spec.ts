import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assetPartBytes,
  assetRow,
  defaultAnswer,
  startFakeService,
  streamAnswer,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess, type InProcessOptions } from './support/in-process.ts'

let root: string
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-asset-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

async function serve(answer: (seen: Seen) => Answer | undefined = () => undefined) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  return service
}

function cli(argv: readonly string[], options: InProcessOptions = {}) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home'), ...options })
}

async function login(service: FakeService) {
  const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(result.code).toBe(0)
}

async function loggedIn(answer?: (seen: Seen) => Answer | undefined) {
  const service = await serve(answer)
  await login(service)
  return service
}

const assetCalls = (service: FakeService) =>
  service.seen.filter(seen => seen.path.startsWith('/api/assets/'))
const operations = (service: FakeService) => assetCalls(service).map(seen => seen.operation)
const one = (service: FakeService, operation: string) =>
  assetCalls(service).filter(seen => seen.operation === operation)

function skillDirectory(files: Readonly<Record<string, string>>): string {
  const dir = join(root, 'skill')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

describe('asset categories and list', () => {
  it('prints a table for a person and one JSON line with --json', async () => {
    await loggedIn()
    const table = await cli(['asset', 'categories'])
    expect(table.code).toBe(0)
    expect(table.stdout).toBe(
      'CATEGORY  CREATION   TITLE\nskill     directory  技能\ntool      none       工具\n',
    )
    const json = await cli(['asset', 'categories', '--json'])
    expect(json.stdout.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(json.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { items: [{ category: 'skill', creation: 'directory' }, { category: 'tool' }] },
    })
  })

  it('reads every page of a category, asking for the next page with the cursor of the last', async () => {
    let page = 0
    const service = await loggedIn(seen => {
      if (seen.operation !== 'list-assets') return undefined
      page += 1
      return {
        outcome: 'succeeded',
        body: {
          items: [{ ...assetRow, name: `skill-${page}` }],
          next: page === 1 ? 'skill-1' : null,
          completeness: 'complete',
        },
      }
    })
    const result = await cli(['asset', 'list', 'skill', '--json'])
    expect(result.code).toBe(0)
    expect(one(service, 'list-assets').map(seen => seen.body)).toEqual([
      { tenant: tenantText, category: 'skill', after: null, limit: 100 },
      { tenant: tenantText, category: 'skill', after: 'skill-1', limit: 100 },
    ])
    expect(JSON.parse(result.stdout).body.items.map((item: { name: string }) => item.name)).toEqual(
      ['skill-1', 'skill-2'],
    )
    const table = await cli(['asset', 'list', 'skill'])
    expect(table.stdout.split('\n')[0]).toBe(
      'NAME     ENABLED  ORIGIN      VERSION              TITLE',
    )
  })

  it('a page that does not move the cursor is a local failure', async () => {
    await loggedIn(seen =>
      seen.operation === 'list-assets'
        ? {
            outcome: 'succeeded',
            body: { items: [], next: 'same', completeness: 'complete' },
          }
        : undefined,
    )
    const result = await cli(['asset', 'list', 'skill'])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('a page did not advance the cursor')
  })
})

describe('asset show', () => {
  it('shows one asset to a person, and the answer as one JSON line with --json', async () => {
    const service = await loggedIn()
    const shown = await cli(['asset', 'show', 'skill:review'])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toContain('Name: review\n')
    expect(shown.stdout).toContain('In use: yes\n')
    expect(shown.stdout).toContain('Files:\n  SKILL.md  9\n')
    expect(one(service, 'describe-asset')[0]?.body).toEqual({
      tenant: tenantText,
      category: 'skill',
      name: 'review',
    })
    const json = await cli(['asset', 'show', 'skill:review', '--json'])
    expect(JSON.parse(json.stdout)).toMatchObject({ outcome: 'succeeded', body: { revision: 2 } })
  })

  it('shows a data asset with its summary, why it is not in use, and that it has settings', async () => {
    await loggedIn(seen =>
      seen.operation === 'describe-asset'
        ? {
            outcome: 'succeeded',
            body: {
              item: {
                ...assetRow,
                enabled: false,
                summary: { title: 'Review', description: 'Reads a diff.', facts: [] },
              },
              revision: 3,
              content: { kind: 'data', body: { depth: 2 } },
              standing: { kind: 'filtered', reason: 'disabled', by: null },
              settings: true,
            },
          }
        : undefined,
    )
    const shown = await cli(['asset', 'show', 'skill:review'])
    expect(shown.code).toBe(0)
    expect(shown.stdout).toContain('Enabled: no\nIn use: no (disabled)\n')
    expect(shown.stdout).toContain('Settings: yes, see omne setting list\n')
    expect(shown.stdout).toContain('Title: Review\nAbout: Reads a diff.\n')
    expect(shown.stdout.endsWith('Content: data, add --json\n')).toBe(true)
  })

  it('a word that is not <category>:<name> is a usage error', async () => {
    await loggedIn()
    expect((await cli(['asset', 'show', 'review'])).code).toBe(2)
    expect((await cli(['asset', 'show'])).code).toBe(2)
  })
})

describe('asset create --dir', () => {
  it('begins, sends every file in parts of the answered size, then commits, all under one operation', async () => {
    const service = await loggedIn()
    const dir = skillDirectory({ 'SKILL.md': '# Review\n', 'lib/a.txt': 'abc' })
    const result = await cli(['asset', 'create', 'skill:review', '--dir', dir])
    expect(result.code).toBe(0)
    const begun = one(service, 'begin-asset-upload')[0]?.body
    expect(begun).toMatchObject({
      tenant: tenantText,
      category: 'skill',
      name: 'review',
      manifest: [
        { path: 'SKILL.md', bytes: 9 },
        { path: 'lib/a.txt', bytes: 3 },
      ],
    })
    const operation = begun?.['operation']
    const appended = one(service, 'append-asset-upload').map(seen => seen.body)
    expect(appended.every(body => body['upload'] === operation)).toBe(true)
    expect(
      appended.every(body => Buffer.from(String(body['bytes']), 'base64').length <= assetPartBytes),
    ).toBe(true)
    const sent = (path: string) =>
      Buffer.concat(
        appended
          .filter(body => body['path'] === path)
          .map(body => Buffer.from(String(body['bytes']), 'base64')),
      ).toString()
    expect(sent('SKILL.md')).toBe('# Review\n')
    expect(sent('lib/a.txt')).toBe('abc')
    expect(one(service, 'commit-asset-upload')[0]?.body).toEqual({
      tenant: tenantText,
      upload: operation,
    })
  })

  it('a symbolic link in the directory stops it before anything is sent', async () => {
    const service = await loggedIn()
    const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
    symlinkSync(join(dir, 'SKILL.md'), join(dir, 'link.md'))
    const result = await cli(['asset', 'create', 'skill:review', '--dir', dir])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('link.md is a symbolic link; nothing was sent')
    expect(assetCalls(service)).toEqual([])
  })

  it('an uncertain commit exits 5 and names the operation; --resume recalls it before sending again', async () => {
    let uncertain = true
    const service = await loggedIn(seen =>
      seen.operation === 'commit-asset-upload' && uncertain
        ? { outcome: 'unknown', body: {} }
        : undefined,
    )
    const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
    const first = await cli(['asset', 'create', 'skill:review', '--dir', dir])
    expect(first.code).toBe(5)
    const operation = String(one(service, 'begin-asset-upload')[0]?.body['operation'])
    expect(first.stderr).toContain(`--resume ${operation}`)
    uncertain = false
    const again = await cli([
      'asset',
      'create',
      'skill:review',
      '--dir',
      dir,
      '--resume',
      operation,
    ])
    expect(again.code).toBe(0)
    expect(one(service, 'query-asset-operation').at(-1)?.body).toEqual({
      tenant: tenantText,
      operation,
      request: { kind: 'commit-asset-upload' },
    })
    expect(one(service, 'begin-asset-upload').at(-1)?.body['operation']).toBe(operation)
  })

  it('--resume of a commit already made answers its outcome and sends nothing more', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'query-asset-operation'
        ? { outcome: 'succeeded', body: { version: 'v', holding: 'held-1', changed: true } }
        : undefined,
    )
    const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
    const result = await cli(['asset', 'create', 'skill:review', '--dir', dir, '--resume', 'op-9'])
    expect(result.code).toBe(0)
    expect(operations(service)).toEqual(['query-asset-operation'])
  })

  it('a resumed upload sends only what the server has not received', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'begin-asset-upload'
        ? {
            outcome: 'succeeded',
            body: { partBytes: assetPartBytes, received: [{ path: 'SKILL.md', bytes: 8 }] },
          }
        : undefined,
    )
    const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
    expect(
      (await cli(['asset', 'create', 'skill:review', '--dir', dir, '--resume', 'op-9'])).code,
    ).toBe(0)
    expect(one(service, 'append-asset-upload').map(seen => seen.body['offset'])).toEqual([8])
  })

  it('a refused begin sends no part and commits nothing', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'begin-asset-upload' ? { outcome: 'denied', body: {} } : undefined,
    )
    const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
    expect((await cli(['asset', 'create', 'skill:review', '--dir', dir])).code).toBe(3)
    expect(operations(service)).toEqual(['begin-asset-upload'])
  })

  it.each([
    ['no longer open', { outcome: 'not-found', body: {} }, 3],
    ['does not advance', { outcome: 'succeeded', body: { received: 0 } }, 1],
  ] as const)(
    'a part that is %s stops the upload before the commit',
    async (_label, reply, code) => {
      const service = await loggedIn(seen =>
        seen.operation === 'append-asset-upload' ? reply : undefined,
      )
      const dir = skillDirectory({ 'SKILL.md': '# Review\n' })
      expect((await cli(['asset', 'create', 'skill:review', '--dir', dir])).code).toBe(code)
      expect(operations(service)).toEqual(['begin-asset-upload', 'append-asset-upload'])
    },
  )
})

describe('asset create --data', () => {
  it('sends the JSON as the body, from the command line or from a file', async () => {
    const service = await loggedIn()
    expect((await cli(['asset', 'create', 'note:a', '--data', '{"a":[1,"x"]}'])).code).toBe(0)
    writeFileSync(join(root, 'body.json'), '{"b":true}')
    expect(
      (await cli(['asset', 'create', 'note:b', '--data', `@${join(root, 'body.json')}`])).code,
    ).toBe(0)
    expect(one(service, 'create-asset').map(seen => seen.body['body'])).toEqual([
      { a: [1, 'x'] },
      { b: true },
    ])
  })

  it('takes exactly one of --data and --dir, and --data must be JSON', async () => {
    const service = await loggedIn()
    expect((await cli(['asset', 'create', 'note:a'])).code).toBe(2)
    expect((await cli(['asset', 'create', 'note:a', '--data', '1', '--dir', root])).code).toBe(2)
    expect((await cli(['asset', 'create', 'note:a', '--data', '{nope'])).code).toBe(2)
    expect(assetCalls(service)).toEqual([])
  })
})

describe('asset enable, disable and remove', () => {
  it('reads the holding first, then changes it under an operation that carries the holding', async () => {
    const service = await loggedIn()
    expect((await cli(['asset', 'disable', 'skill:review'])).code).toBe(0)
    expect(operations(service)).toEqual(['describe-asset', 'set-asset-enabled'])
    const body = one(service, 'set-asset-enabled')[0]?.body
    expect(body).toMatchObject({ tenant: tenantText, holding: 'held-1', enabled: false })
    expect(String(body?.['operation']).endsWith('/held-1')).toBe(true)
  })

  it('remove without --yes says why and exits 2 without asking the server; with --yes it removes', async () => {
    const service = await loggedIn()
    const refused = await cli(['asset', 'remove', 'skill:review'])
    expect(refused.code).toBe(2)
    expect(refused.stderr).toContain('cannot be undone')
    expect(assetCalls(service)).toEqual([])
    expect((await cli(['asset', 'remove', 'skill:review', '--yes'])).code).toBe(0)
    expect(one(service, 'remove-asset')[0]?.body).toMatchObject({ holding: 'held-1' })
  })

  it('an asset the server cannot show is not changed, and the read outcome is reported', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'describe-asset' ? { outcome: 'not-found', body: {} } : undefined,
    )
    const result = await cli(['asset', 'enable', 'skill:review'])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'not-found' })
    expect(operations(service)).toEqual(['describe-asset'])
  })

  it('--resume of a removal recalls it by the holding in its operation, even once the asset is gone', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'query-asset-operation'
        ? { outcome: 'succeeded', body: {} }
        : seen.operation === 'describe-asset'
          ? { outcome: 'not-found', body: {} }
          : undefined,
    )
    const result = await cli([
      'asset',
      'remove',
      'skill:review',
      '--yes',
      '--resume',
      'op-1/held-1',
    ])
    expect(result.code).toBe(0)
    expect(operations(service)).toEqual(['query-asset-operation'])
    expect(one(service, 'query-asset-operation')[0]?.body).toEqual({
      tenant: tenantText,
      operation: 'op-1/held-1',
      request: { kind: 'remove-asset', holding: 'held-1' },
    })
  })
})

describe('asset watch', () => {
  it('prints a line for every frame until the observation ends', async () => {
    const service = await loggedIn(seen =>
      seen.operation === 'observe-assets'
        ? streamAnswer([{ kind: 'changed' }, { kind: 'changed' }], 'unavailable')
        : undefined,
    )
    const result = await cli(['asset', 'watch'])
    expect(result.stdout).toBe('changed\nchanged\n')
    expect(result.stderr).toContain('ended (unavailable)')
    expect(result.code).toBe(4)
    expect(one(service, 'observe-assets')[0]?.body).toEqual({ tenant: tenantText })
  })

  it.each([
    ['ended because the login was denied', streamAnswer([], 'denied'), 3, 'ended (denied)'],
    ['refused as denied', { outcome: 'denied', body: {} } as Answer, 3, 'ended (denied)'],
    [
      'refused for want of a basis',
      { outcome: 'basis-unavailable', body: {} } as Answer,
      4,
      'ended (basis-unavailable)',
    ],
  ] as const)('an observation %s exits with its code', async (_label, reply, code, said) => {
    await loggedIn(seen => (seen.operation === 'observe-assets' ? reply : undefined))
    const result = await cli(['asset', 'watch'])
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(said)
    expect(result.code).toBe(code)
  })
})
