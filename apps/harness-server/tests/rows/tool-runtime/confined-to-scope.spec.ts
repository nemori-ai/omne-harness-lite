import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { withinScope, type FileEffect } from '@omne-harness/execution-environment-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ReleaseToolIdentity } from '../../../src/rows/tool-runtime/access.ts'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import {
  confinedToScope,
  createReleaseEnvironment,
  nameUnder,
} from '../../../src/rows/tool-runtime/environment.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { TENANT_A } from '../storage/fixtures/tree.ts'

const ROOT = resolve('/tool-b-files')
const both = { read: ROOT, write: ROOT }
const writeOnly = { write: ROOT }
const inside = join(ROOT, 'in.txt')
const outside = resolve('/elsewhere/out.txt')

describe('the files scope of the release execution environment', () => {
  it('accepts the root itself, a path inside it, and a relative path resolved against it', async () => {
    for (const path of [ROOT, join(ROOT, 'a', 'b.txt'), 'a/b.txt'])
      expect(await confinedToScope(both, 'files', 'read', { path }), path).toBe(true)
  })

  it('refuses a parent escape, an absolute path outside, and a sibling that shares the prefix', async () => {
    for (const path of [
      '..',
      join(ROOT, '..', 'outside.txt'),
      'a/../../outside.txt',
      resolve('/elsewhere/x.txt'),
      `${ROOT}2${'/x.txt'}`,
    ])
      expect(await confinedToScope(both, 'files', 'read', { path }), path).toBe(false)
  })

  it('judges each path as the contract does, side by side, where no link is on the way', async () => {
    const scopes = [both, writeOnly, { read: ROOT }, {}]
    const paths = [ROOT, inside, join(ROOT, 'a', 'b'), outside, `${ROOT}2/x`, `${ROOT}/../x`]
    const operations: Readonly<Record<FileEffect, string>> = { read: 'stat', write: 'write' }
    for (const scope of scopes)
      for (const path of paths)
        for (const effect of ['read', 'write'] as const)
          expect(
            await confinedToScope(scope, 'files', operations[effect], { path }),
            `${JSON.stringify(scope)} ${effect} ${path}`,
          ).toBe(withinScope(scope, effect, path))
  })
})

describe('the guard checks every path of a facility request by its effect', () => {
  it('reads below the read root and writes below the write root; a side with no root is not limited', async () => {
    expect(await confinedToScope(writeOnly, 'files', 'read', { path: outside })).toBe(true)
    expect(await confinedToScope(writeOnly, 'files', 'search', { path: outside })).toBe(true)
    for (const operation of ['write', 'mkdir', 'remove'])
      expect(await confinedToScope(writeOnly, 'files', operation, { path: outside })).toBe(false)
    expect(await confinedToScope({}, 'files', 'write', { path: outside })).toBe(true)
    // With no root there is nothing to resolve a relative path against.
    expect(await confinedToScope({}, 'files', 'write', { path: 'a/b.txt' })).toBe(false)
  })

  it('move and copy: the source is read and the target is written', async () => {
    for (const operation of ['move', 'copy']) {
      const request = (from: unknown, to: unknown) => ({ path: from, target: { path: to } })
      expect(await confinedToScope(both, 'files', operation, request(inside, inside))).toBe(true)
      expect(await confinedToScope(both, 'files', operation, request(inside, outside))).toBe(false)
      expect(await confinedToScope(both, 'files', operation, request(outside, inside))).toBe(false)
      expect(await confinedToScope(writeOnly, 'files', operation, request(outside, inside))).toBe(
        true,
      )
      expect(await confinedToScope(writeOnly, 'files', operation, request(inside, outside))).toBe(
        false,
      )
      expect(
        await confinedToScope(both, 'files', operation, { path: inside, target: { named: null } }),
      ).toBe(false)
      expect(await confinedToScope(both, 'files', operation, { path: inside, target: 'x' })).toBe(
        false,
      )
    }
  })

  it('commitBatch: every entry path is written below the write root', async () => {
    const entry = (path: unknown) => ({ path, named: null })
    const batch = (entries: unknown) => confinedToScope(both, 'files', 'commitBatch', { entries })
    expect(await batch([entry(inside), entry(inside)])).toBe(true)
    expect(await batch([entry(inside), entry(outside)])).toBe(false)
    expect(await batch([entry(inside), 'x'])).toBe(false)
    expect(await batch({ path: inside })).toBe(false)
    expect(
      await confinedToScope({ read: ROOT }, 'files', 'commitBatch', { entries: [entry(outside)] }),
    ).toBe(true)
  })

  it('a command or terminal starts below the write root', async () => {
    expect(await confinedToScope(both, 'command', 'start', { cwd: ROOT })).toBe(true)
    expect(await confinedToScope(both, 'command', 'start', { cwd: outside })).toBe(false)
    expect(await confinedToScope({ read: ROOT }, 'terminal', 'create', { cwd: outside })).toBe(true)
    expect(await confinedToScope(writeOnly, 'terminal', 'create', { cwd: outside })).toBe(false)
    expect(await confinedToScope(both, 'files', 'read', { path: 7 })).toBe(false)
  })

  it('closes a handle below either root, and refuses an operation it does not know', async () => {
    expect(await confinedToScope(writeOnly, 'files', 'close', { path: outside })).toBe(true)
    expect(await confinedToScope({ read: ROOT }, 'files', 'close', { path: outside })).toBe(true)
    expect(await confinedToScope(both, 'files', 'close', { path: outside })).toBe(false)
    expect(await confinedToScope(both, 'files', 'close', { path: inside })).toBe(true)
    expect(await confinedToScope({}, 'files', 'rename', { path: inside })).toBe(false)
  })
})

describe('a host object is named below the root of a side that admits its path', () => {
  const bases: string[] = []
  afterEach(async () => {
    await Promise.all(bases.splice(0).map(base => rm(base, { recursive: true, force: true })))
  })
  const tree = async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-naming-')))
    bases.push(base)
    const workspace = join(base, 'workspace')
    const outside = join(base, 'outside')
    await mkdir(workspace)
    await mkdir(join(outside, 'sub'), { recursive: true })
    await writeFile(join(outside, 'file.txt'), 'x')
    return { base, workspace, outside }
  }
  const denied = { failure: { kind: 'denied', action: 'name-host-object' } }

  it('names an object outside the workspace when reads are not limited, and not when they are', async () => {
    const t = await tree()
    const file = join(t.outside, 'file.txt')
    const token = await hostObjectToken(file)
    expect(await nameUnder({ write: t.workspace }, { path: file, role: 'object' })).toEqual({
      ok: token,
    })
    expect(
      await nameUnder({ read: t.workspace, write: t.workspace }, { path: file, role: 'object' }),
    ).toEqual(denied)
    expect(await nameUnder(undefined, { path: file, role: 'object' })).toEqual(denied)
  })

  it('judges a link itself, not where it points, for a files request, a close and a name', async () => {
    const t = await tree()
    const link = join(t.workspace, 'link')
    await symlink(t.outside, link)
    const both = { read: t.workspace, write: t.workspace }
    expect(await confinedToScope(both, 'files', 'remove', { path: link })).toBe(true)
    expect(await confinedToScope(both, 'files', 'close', { path: link })).toBe(true)
    const elsewhere = join(t.base, 'elsewhere')
    for (const scope of [
      { read: t.workspace, write: elsewhere },
      { read: elsewhere, write: t.workspace },
    ])
      expect(await confinedToScope(scope, 'files', 'close', { path: link })).toBe(true)
    expect(await confinedToScope(both, 'command', 'start', { cwd: link })).toBe(false)
    expect(await nameUnder(both, { path: link, role: 'object' })).toEqual({
      ok: await hostObjectToken(link),
    })
  })

  it('answers unavailable when the object, or every ancestor up to the root, cannot be named', async () => {
    const t = await tree()
    const both = { read: t.workspace, write: t.workspace }
    const missing = (await nameUnder(both, {
      path: join(t.workspace, 'none.txt'),
      role: 'object',
    })) as {
      failure?: { kind: string }
    }
    expect(missing.failure?.kind).toBe('unavailable')
    const gone = join(t.base, 'gone')
    const under = (await nameUnder(
      { read: gone, write: gone },
      { path: join(gone, 'a', 'b.txt'), role: 'ancestor' },
    )) as { failure?: { kind: string } }
    expect(under.failure?.kind).toBe('unavailable')
    // A relative path is resolved against the root of the side that admits it.
    expect(await nameUnder(both, { path: '.', role: 'object' })).toEqual({
      ok: await hostObjectToken(t.workspace),
    })
  })

  it('climbs to the nearest ancestor that exists, below the root or up to the top when there is none', async () => {
    const t = await tree()
    const deep = join(t.outside, 'sub', 'a', 'b', 'new.txt')
    expect(await nameUnder({}, { path: deep, role: 'ancestor' })).toEqual({
      ok: await hostObjectToken(join(t.outside, 'sub')),
    })
    const inside = join(t.workspace, 'a', 'new.txt')
    expect(
      await nameUnder(
        { read: t.workspace, write: t.workspace },
        { path: inside, role: 'ancestor' },
      ),
    ).toEqual({ ok: await hostObjectToken(t.workspace) })
    expect(await nameUnder({}, { path: 'relative/new.txt', role: 'parent' })).toEqual(denied)
  })
})

describe('the binding hands the retained view as both retention ledgers (#1137)', () => {
  it('the processes view of the retention is the same object as its terminal ledger', async () => {
    const scope = decodeScopeRef({ ref: 'session-scope:within-root-binding' })
    if ('failure' in scope) throw new Error('fixture scope')
    const holder = toolRuntimeHolder({ root: {} } as unknown as Context)
    const { input } = createReleaseEnvironment(holder, {} as unknown as ReleaseToolIdentity, {
      workspaces: () => undefined,
      commitAttempts: 1,
      schemaProvider: () => null,
    })
    const preparation = {
      tenant: TENANT_A,
      call: 'call-binding',
      operation: 'prepare-binding',
    }
    const request = {
      tenant: TENANT_A,
      call: 'call-binding',
      preparation,
      request: {
        requesterScope: scope.ok,
        availability: { definition: { declarations: { environment: null } } },
      },
    } as unknown as Parameters<typeof input.plan.binding>[0]
    const bound = await input.plan.binding(request)
    if ('failure' in bound) throw new Error(`binding: ${JSON.stringify(bound.failure)}`)
    const retention = bound.ok.retention
    expect(retention?.scope).toEqual(scope.ok)
    expect(retention?.processes).toBeDefined()
    expect(retention?.processes).toBe(retention?.ledger)
    const again = await input.plan.binding(request)
    if ('failure' in again) throw new Error('second binding failed')
    expect(again.ok.retention?.processes).toBe(retention?.processes)
  })
})
