import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDomain, scanDomains } from '../src/package-template/domain.ts'
import { createPackage } from '../src/package-template/create.ts'
import { discoverProducts } from '../src/package-template/discovery.ts'
import { DOMAIN_TEMPLATE_DIRECTORY } from '../src/package-template/domain-template.ts'

const fault = vi.hoisted(() => ({ write: false, descriptor: -1, path: '' }))
vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    openSync: (...args: Parameters<typeof real.openSync>) => {
      const descriptor = real.openSync(...args)
      if (String(args[0]).endsWith('documentation.json')) {
        fault.descriptor = descriptor
        fault.path = String(args[0])
      }
      return descriptor
    },
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      if (fault.write && args[0] === fault.descriptor) {
        real.writeFileSync(args[0], 'partial write')
        real.writeFileSync(join(fault.path, '..', 'neighbor.txt'), 'owned by another writer')
        throw new Error('injected write failure')
      }
      return real.writeFileSync(...args)
    },
  }
})
const roots: string[] = []
afterEach(() => {
  fault.write = false
  fault.descriptor = -1
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})
function repository() {
  const root = fs.mkdtempSync(join(tmpdir(), 'omne-domain-template-'))
  roots.push(root)
  fs.mkdirSync(join(root, 'packages'))
  fs.writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24 <25' } }))
  return root
}
function completed(root: string) {
  createDomain({ root, group: 'sample', write: true })
  fs.writeFileSync(
    join(root, 'packages/sample/README.md'),
    '# Sample\n\nCompleted fixture documentation.\n',
  )
}
describe('domain creation', () => {
  it('previews without writes and generates only two draft documents with root-relative bindings', () => {
    const root = repository()
    expect(createDomain({ root, group: 'sample' })).toMatchObject({
      written: false,
      draft: true,
      files: ['README.md', 'documentation.json'],
      template: { id: 'package-domain', version: '1.0.0' },
    })
    expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
    createDomain({ root, group: 'sample', write: true })
    expect(fs.readdirSync(join(root, 'packages/sample')).sort()).toEqual([
      'README.md',
      'documentation.json',
    ])
    const binding = JSON.parse(
      fs.readFileSync(join(root, 'packages/sample/documentation.json'), 'utf8'),
    )
    expect(binding.owner.id).toBe('package-domain:sample')
    expect(binding.owner.source).toEqual({
      path: 'docs/member-documentation.md',
      anchor: '能力组文档要求',
    })
    expect(binding.documents[0].path).toBe('packages/sample/README.md')
    expect(binding.documents[0].requiredSections).toHaveLength(5)
    expect(scanDomains(root)[0]).toMatchObject({
      structure: 'fail',
      coverage: 'current-template-only',
    })
    expect(scanDomains(root)[0]?.findings.some(item => item.code === 'draft')).toBe(true)
  })
  it.each(['../escape', '/escape', 'two/groups', 'Upper', 'bad\u0000'])(
    'rejects unsafe group %j without writing',
    group => {
      const root = repository()
      expect(() => createDomain({ root, group, write: true })).toThrow()
      expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
    },
  )
  it('rejects existing targets, dangling targets and linked parents without altering their bytes', () => {
    const root = repository()
    completed(root)
    const before = fs.readFileSync(join(root, 'packages/sample/README.md'))
    expect(() => createDomain({ root, group: 'sample', write: true })).toThrow('already exists')
    expect(fs.readFileSync(join(root, 'packages/sample/README.md'))).toEqual(before)
    fs.symlinkSync(join(root, 'absent'), join(root, 'packages/dangling'))
    expect(() => createDomain({ root, group: 'dangling', write: true })).toThrow('already exists')
    fs.renameSync(join(root, 'packages'), join(root, 'outside'))
    fs.symlinkSync(join(root, 'outside'), join(root, 'packages'))
    expect(() => createDomain({ root, group: 'new', write: true })).toThrow(
      'real package directory',
    )
    expect(fs.existsSync(join(root, 'outside/new'))).toBe(false)
  })
  it('validates template escape before writing', () => {
    const root = repository(),
      directory = join(root, 'template')
    fs.cpSync(DOMAIN_TEMPLATE_DIRECTORY, directory, { recursive: true })
    const manifest = JSON.parse(fs.readFileSync(join(directory, 'manifest.json'), 'utf8'))
    manifest.common[0].target = '../escape'
    fs.writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
    expect(() =>
      createDomain({ root, group: 'sample', write: true, templateDirectory: directory }),
    ).toThrow('Invalid')
    expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
  })
  it('cleans only its new files after failure and preserves another writer’s file', () => {
    const root = repository()
    fault.write = true
    expect(() => createDomain({ root, group: 'sample', write: true })).toThrow(
      'injected write failure',
    )
    expect(fs.readdirSync(join(root, 'packages/sample'))).toEqual(['neighbor.txt'])
    expect(fs.readFileSync(join(root, 'packages/sample/neighbor.txt'), 'utf8')).toBe(
      'owned by another writer',
    )
  })
})
describe('domain discovery and layout', () => {
  it('delegates real members and recognizes documented flows with supported images', () => {
    const root = repository()
    completed(root)
    createPackage({ root, group: 'sample', name: 'member', variant: 'module', write: true })
    fs.mkdirSync(join(root, 'packages/sample/docs/flows'), { recursive: true })
    fs.writeFileSync(
      join(root, 'packages/sample/docs/flows/use.md'),
      '# Flow\n\nActual public handoff.\n',
    )
    fs.writeFileSync(join(root, 'packages/sample/docs/flows/use.svg'), '<svg/>')
    expect(discoverProducts(root)).toEqual(['packages/sample/member'])
    expect(scanDomains(root)).toMatchObject([
      { structure: 'pass', members: ['packages/sample/member'] },
    ])
    expect(scanDomains(root)[0]?.tree.some(node => node.path.startsWith('member'))).toBe(false)
    expect(() =>
      createPackage({ root, group: 'sample', name: 'docs', variant: 'module' }),
    ).toThrow()
  })
  it.each(['unknown.json', 'unknown', 'docs/bad.exe', 'docs/empty', 'linked', 'docs/linked.md'])(
    'rejects undeclared or unsafe group node %s',
    path => {
      const root = repository()
      completed(root)
      fs.mkdirSync(join(root, 'packages/sample/docs'))
      fs.writeFileSync(join(root, 'packages/sample/docs/valid.md'), '# Valid\n\nContent.\n')
      const target = join(root, 'packages/sample', path)
      if (path === 'unknown' || path === 'docs/empty') fs.mkdirSync(target)
      else if (path.includes('linked'))
        fs.symlinkSync(join(root, 'packages/sample/README.md'), target)
      else fs.writeFileSync(target, '{}')
      expect(scanDomains(root)[0]?.structure).toBe('fail')
      expect(() => discoverProducts(root)).toThrow('product discovery')
    },
  )
  it('reports missing registration and unknown member manifests instead of skipping them', () => {
    const root = repository()
    completed(root)
    fs.rmSync(join(root, 'packages/sample/documentation.json'))
    expect(scanDomains(root)[0]?.findings).toContainEqual(
      expect.objectContaining({ code: 'required', path: 'packages/sample/documentation.json' }),
    )
    fs.mkdirSync(join(root, 'packages/sample/missing/src'), { recursive: true })
    expect(scanDomains(root)[0]?.structure).toBe('fail')
    expect(() => discoverProducts(root)).toThrow('real manifest')
  })

  it('rejects planning documents in a member slot and accepts them under group docs', () => {
    const root = repository()
    completed(root)
    fs.mkdirSync(join(root, 'packages/sample/storage'))
    fs.writeFileSync(join(root, 'packages/sample/storage/README.md'), '# storage\n')
    expect(() => discoverProducts(root)).toThrow('real manifest')
    expect(scanDomains(root)[0]?.structure).toBe('fail')
    fs.mkdirSync(join(root, 'packages/sample/docs'))
    fs.renameSync(
      join(root, 'packages/sample/storage'),
      join(root, 'packages/sample/docs/storage-contract'),
    )
    expect(discoverProducts(root)).toEqual([])
    expect(scanDomains(root)[0]).toMatchObject({ structure: 'pass', members: [] })
    expect(scanDomains(root)[0]).not.toHaveProperty('planned')
  })
})
