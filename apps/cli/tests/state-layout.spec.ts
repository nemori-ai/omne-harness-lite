import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  prepareTenantDirectory,
  resolveStateHome,
  tenantPaths,
  type TenantBinding,
} from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'

const roots: string[] = []
const binding = (
  centerId = 'a'.repeat(32),
  organization = 'organization-A',
  account = 'account-A',
): TenantBinding =>
  checkedTenantBinding({
    formatVersion: 1,
    centerId,
    tenant: unwrap(parseTenantId({ organization, account })),
  })
async function home(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'omne-state-layout-'))
  roots.push(parent)
  return join(parent, '.omne')
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('one explicit application root', () => {
  it('uses the OS user home without reading the working directory', () => {
    expect(resolveStateHome({ osHome: '/users/test' })).toBe('/users/test/.omne')
  })
  it('takes explicit home before environment home', () => {
    expect(
      resolveStateHome({
        explicitHome: '/explicit',
        environmentHome: '/environment',
        osHome: '/users/test',
      }),
    ).toBe('/explicit')
  })
  it('uses OMNE_HOME before the default', () => {
    expect(resolveStateHome({ environmentHome: '/environment', osHome: '/users/test' })).toBe(
      '/environment',
    )
  })
  it('normalizes an absolute root once', () => {
    expect(resolveStateHome({ explicitHome: '/private/one/../two/', osHome: '/users/test' })).toBe(
      '/private/two',
    )
  })
  it('rejects the filesystem volume root as an application home', () => {
    expect(() => resolveStateHome({ explicitHome: '/', osHome: '/users/test' })).toThrow(
      'invalid-home',
    )
  })
  it.each(['', 'relative', '~/private', '/private/\0broken'])(
    'rejects explicit %j without fallback',
    explicitHome => {
      expect(() =>
        resolveStateHome({ explicitHome, environmentHome: '/valid', osHome: '/users/test' }),
      ).toThrow('invalid-home')
    },
  )
  it.each(['', 'relative', '~/private', '/private/\0broken'])(
    'rejects environment %j without fallback',
    environmentHome => {
      expect(() => resolveStateHome({ environmentHome, osHome: '/users/test' })).toThrow(
        'invalid-home',
      )
    },
  )
  it('does not create a directory during parsing or path discovery', async () => {
    const root = await home()
    tenantPaths(resolveStateHome({ explicitHome: root, osHome: '/users/test' }), binding())
    await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('tenant-owned addresses', () => {
  it('keeps all tenant resources together under tenants', () => {
    const paths = tenantPaths('/private/.omne', binding())
    expect(dirname(paths.directory)).toBe('/private/.omne/tenants')
    for (const path of [
      paths.binding,
      paths.auth,
      paths.data,
      paths.sessions,
      paths.assets,
      paths.logs,
      paths.cache,
      paths.run,
    ])
      expect(dirname(path)).toBe(paths.directory)
    expect(paths.clientState).toBe(join(paths.auth, 'client.sqlite'))
    expect(paths.credentials).toBe(join(paths.auth, 'credentials'))
    expect(paths.runtime).toBe(join(paths.data, 'runtime.sqlite'))
  })
  it('separates identical tenant identifiers at different centers', () => {
    expect(tenantPaths('/private/.omne', binding('a'.repeat(32))).directory).not.toBe(
      tenantPaths('/private/.omne', binding('b'.repeat(32))).directory,
    )
  })
  it('separates accounts and organizations', () => {
    const locations = [
      binding(),
      binding('a'.repeat(32), 'organization-B'),
      binding('a'.repeat(32), 'organization-A', 'account-B'),
    ].map(value => tenantPaths('/private/.omne', value).directory)
    expect(new Set(locations).size).toBe(3)
  })
  it('preserves exact case and composite identifier boundaries', () => {
    const locations = [
      binding(),
      binding('a'.repeat(32), 'Organization-A'),
      binding('a'.repeat(32), 'ab', 'c'),
      binding('a'.repeat(32), 'a', 'bc'),
    ].map(value => tenantPaths('/private/.omne', value).directory)
    expect(new Set(locations).size).toBe(4)
  })
  it('encodes valid opaque identifiers without turning them into paths', () => {
    const path = tenantPaths(
      '/private/.omne',
      binding('a'.repeat(32), '../../organization', 'CON/account'),
    ).directory
    expect(dirname(path)).toBe('/private/.omne/tenants')
    expect(path.split('/').at(-1)).toMatch(/^[a-f0-9]{64}$/)
  })
  it('rejects an empty center identity', () => {
    expect(() => tenantPaths('/private/.omne', binding(''))).toThrow('invalid-binding')
  })
  it.each(['center-A', '../center', 'A'.repeat(32), 'a'.repeat(31), 'g'.repeat(32)])(
    'rejects noncanonical governance center identity %j',
    center => {
      expect(() => checkedTenantBinding({ ...binding(), centerId: center })).toThrow(
        'invalid-binding',
      )
    },
  )
})

describe('private tenant directory and immutable identity binding', () => {
  it('creates only the tenant root and binding, without a database or sessions', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    expect(await readdir(paths.directory)).toEqual(['tenant.json'])
    expect(await readdir(root)).toEqual(['tenants'])
    expect((await lstat(root)).mode & 0o777).toBe(0o700)
    expect((await lstat(dirname(paths.directory))).mode & 0o777).toBe(0o700)
    expect((await lstat(paths.directory)).mode & 0o777).toBe(0o700)
    expect((await lstat(paths.binding)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(paths.binding, 'utf8'))).toEqual(binding())
  })
  it('recognizes the same tenant without rewriting its binding', async () => {
    const root = await home()
    const first = await prepareTenantDirectory(root, binding())
    const bytes = await readFile(first.binding, 'utf8')
    const before = await lstat(first.binding)
    expect(await prepareTenantDirectory(root, binding())).toEqual(first)
    expect((await lstat(first.binding)).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(first.binding, 'utf8')).toBe(bytes)
  })
  it('rejects a copied binding from a different center', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await writeFile(paths.binding, JSON.stringify(binding('b'.repeat(32))) + '\n')
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('binding-mismatch')
    expect(JSON.parse(await readFile(paths.binding, 'utf8'))).toEqual(binding('b'.repeat(32)))
  })
  it('reports corrupted binding instead of rebuilding an empty tenant', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await writeFile(paths.binding, '{broken')
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('invalid-binding')
    expect(await readFile(paths.binding, 'utf8')).toBe('{broken')
  })
  it('rejects undeclared authority and secret fields in a binding', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await writeFile(
      paths.binding,
      JSON.stringify({ ...binding(), permission: 'admin', credential: 'secret-value' }),
    )
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('invalid-binding')
  })
  it('rejects an unsupported layout version', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await writeFile(paths.binding, JSON.stringify({ ...binding(), formatVersion: 2 }))
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('invalid-binding')
  })
  it('rejects a root symlink and leaves its target untouched', async () => {
    const root = await home()
    const target = join(dirname(root), 'target')
    await mkdir(target, { mode: 0o700 })
    await symlink(target, root)
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('unsafe-path')
    expect(await readdir(target)).toEqual([])
  })
  it('rejects an intermediate directory symlink', async () => {
    const root = await home()
    await mkdir(root, { mode: 0o700 })
    const target = join(dirname(root), 'target')
    await mkdir(target, { mode: 0o700 })
    await symlink(target, join(root, 'tenants'))
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('unsafe-path')
    expect(await readdir(target)).toEqual([])
  })
  it('rejects a binding symlink without reading its target', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await rm(paths.binding)
    const target = join(dirname(root), 'target')
    await writeFile(target, 'not-a-binding', { mode: 0o600 })
    await symlink(target, paths.binding)
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('unsafe-path')
    expect(await readFile(target, 'utf8')).toBe('not-a-binding')
  })
  it('rejects a nonprivate root without silently changing permissions', async () => {
    const root = await home()
    await mkdir(root, { mode: 0o755 })
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('unsafe-path')
    expect((await lstat(root)).mode & 0o777).toBe(0o755)
  })
  it('rejects a nonprivate binding without echoing file content', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await chmod(paths.binding, 0o644)
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow(
      /^omne-state: unsafe-path$/,
    )
  })
  it('rejects a binding with another hard link', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await link(paths.binding, join(dirname(root), 'binding-copy'))
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('unsafe-path')
  })
  it('rejects duplicate JSON fields in the machine-owned binding', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    const bytes = (await readFile(paths.binding, 'utf8')).replace(
      '"formatVersion":1',
      '"formatVersion":2,"formatVersion":1',
    )
    await writeFile(paths.binding, bytes)
    await expect(prepareTenantDirectory(root, binding())).rejects.toThrow('invalid-binding')
  })
  it('bounds binding IO using an explicit policy before creating paths', async () => {
    const root = await home()
    await expect(prepareTenantDirectory(root, binding(), { maxBindingBytes: 1 })).rejects.toThrow(
      'invalid-binding',
    )
    await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects an oversized existing binding without rebuilding it', async () => {
    const root = await home()
    const paths = await prepareTenantDirectory(root, binding())
    await writeFile(paths.binding, 'x'.repeat(4097))
    await expect(
      prepareTenantDirectory(root, binding(), { maxBindingBytes: 4096 }),
    ).rejects.toThrow('invalid-binding')
    expect((await lstat(paths.binding)).size).toBe(4097)
  })
})
