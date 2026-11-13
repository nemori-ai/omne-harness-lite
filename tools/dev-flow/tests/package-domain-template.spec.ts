import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDomain, scanDomains } from '../src/package-template/domain.ts'
import { createPackage } from '../src/package-template/create.ts'
import { discoverProducts } from '../src/package-template/discovery.ts'
import { DOMAIN_TEMPLATE_DIRECTORY, readDomainTemplate } from '../src/package-template/domain-template.ts'

const fault = vi.hoisted(() => ({ write: false, descriptor: -1, path: '' }))
vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    openSync: (...args: Parameters<typeof real.openSync>) => {
      const descriptor = real.openSync(...args)
      if (String(args[0]).endsWith('SPEC.md')) {
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
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'omne-domain-template-')))
  roots.push(root)
  fs.mkdirSync(join(root, 'packages'))
  fs.writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24 <25' } }))
  return root
}
const SECTIONS = ['总体架构', '领域边界', '心智模型', '应然设计', '原则与约束', '不变式']
function completed(root: string) {
  createDomain({ root, group: 'sample', write: true })
  fs.writeFileSync(
    join(root, 'packages/sample/SPEC.md'),
    `# sample\n\n${SECTIONS.map(title => `## ${title}\n\nCompleted fixture content.\n`).join('\n')}`,
  )
}
function legacy(root: string) {
  fs.mkdirSync(join(root, 'packages/sample'))
  fs.writeFileSync(
    join(root, 'packages/sample/README.md'),
    '# Sample\n\nCompleted fixture documentation.\n',
  )
  fs.writeFileSync(join(root, 'packages/sample/documentation.json'), '{}')
}
describe('domain creation', () => {
  it('previews without writes and generates only SPEC.md with the six sections in order', () => {
    const root = repository()
    expect(createDomain({ root, group: 'sample' })).toMatchObject({
      written: false,
      draft: true,
      files: ['SPEC.md'],
      template: { id: 'package-domain', version: '2.0.0' },
    })
    expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
    createDomain({ root, group: 'sample', write: true })
    expect(fs.readdirSync(join(root, 'packages/sample'))).toEqual(['SPEC.md'])
    const text = fs.readFileSync(join(root, 'packages/sample/SPEC.md'), 'utf8')
    expect(text.startsWith('# sample\n')).toBe(true)
    expect(text).toContain('DOMAIN_TEMPLATE_DRAFT')
    expect(text).not.toContain('documentation:placeholder')
    expect(text).not.toMatch(/\{\{/u)
    expect([...text.matchAll(/^## (.+)$/gmu)].map(match => match[1])).toEqual(SECTIONS)
    expect(scanDomains(root)[0]).toMatchObject({
      structure: 'fail',
      coverage: 'current-template-only',
      template: { id: 'package-domain', version: '2.0.0' },
    })
    expect(scanDomains(root)[0]?.findings.map(item => item.code)).toEqual(['draft'])
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
    const before = fs.readFileSync(join(root, 'packages/sample/SPEC.md'))
    expect(() => createDomain({ root, group: 'sample', write: true })).toThrow('already exists')
    expect(fs.readFileSync(join(root, 'packages/sample/SPEC.md'))).toEqual(before)
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
    legacy(root)
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
      legacy(root)
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
    legacy(root)
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
    legacy(root)
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

describe('domain template versions', () => {
  it('passes a completed 2.0.0 group and reports a missing SPEC.md', () => {
    const root = repository()
    completed(root)
    expect(scanDomains(root)[0]).toMatchObject({
      structure: 'pass',
      template: { id: 'package-domain', version: '2.0.0' },
    })
    fs.rmSync(join(root, 'packages/sample/SPEC.md'))
    expect(scanDomains(root)[0]?.findings).toContainEqual(
      expect.objectContaining({ code: 'required', path: 'packages/sample/SPEC.md' }),
    )
  })
  it.each(['AGENTS.md', 'CLAUDE.md'])('allows %s beside SPEC.md in a 2.0.0 group', file => {
    const root = repository()
    completed(root)
    fs.writeFileSync(join(root, 'packages/sample', file), '# Agents\n')
    expect(scanDomains(root)[0]?.structure).toBe('pass')
  })
  it.each(['docs/x.md', 'README_ZH.md', 'notes.md'])(
    'rejects %s in a 2.0.0 group',
    file => {
      const root = repository()
      completed(root)
      fs.mkdirSync(join(root, 'packages/sample', file, '..'), { recursive: true })
      fs.writeFileSync(join(root, 'packages/sample', file), '# Note\n\nContent.\n')
      expect(scanDomains(root)[0]?.structure).toBe('fail')
    },
  )
  it('keeps a 1.0.0 group passing and lets it hold a SPEC.md beside its documents', () => {
    const root = repository()
    legacy(root)
    expect(scanDomains(root)[0]).toMatchObject({
      structure: 'pass',
      template: { id: 'package-domain', version: '1.0.0' },
    })
    fs.writeFileSync(join(root, 'packages/sample/SPEC.md'), '# sample\n\nCompleted.\n')
    expect(scanDomains(root)[0]?.structure).toBe('pass')
    fs.writeFileSync(join(root, 'packages/sample/SPEC.md'), '# sample\n\nDOMAIN_TEMPLATE_DRAFT\n')
    expect(scanDomains(root)[0]?.findings.map(item => item.code)).toEqual(['draft'])
  })
  it('stores the 1.0.0 rules as an exact historical entry', () => {
    const template = readDomainTemplate()
    expect(template.version).toBe('2.0.0')
    expect(template.requiredFiles).toEqual(['SPEC.md'])
    expect(template.layout.files).toEqual(['SPEC.md', 'AGENTS.md', 'CLAUDE.md'])
    expect(template.previousVersions['1.0.0']?.requiredFiles).toEqual([
      'README.md',
      'documentation.json',
    ])
    expect(template.previousVersions['1.0.0']?.layout.files).toContain('SPEC.md')
    expect(template.previousVersions['1.0.0']?.layout.files).toContain('docs/**/*.md')
  })
})
