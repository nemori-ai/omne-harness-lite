import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { creation, sessionId } from '@omne-harness/session-contract/testing'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { fixtureTenant } from '../../entry/support.ts'
import { readWorkspaceGuidance } from '../../../src/rows/session-ad03/workspace-guidance.ts'

it('distinguishes a missing rule in a verified directory from an unverified parent', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'guidance-path-')))
  onTestFinished(() => rm(base, { recursive: true, force: true }))
  const root = join(base, 'workspace')
  const peer = join(base, 'peer')
  const child = join(root, 'visited')
  await mkdir(root)
  await mkdir(child)
  await mkdir(peer)
  const scope = decodeScopeRef({ ref: 'session-scope:guidance' })
  if ('failure' in scope) throw new Error('fixture scope')
  const binding = {
    state: 'attached' as const,
    workspace: 'workspace',
    instance: 'instance',
    directory: root,
  }
  const input = {
    tenant: fixtureTenant('a'),
    principal: 'reader',
    session: sessionId('scope'),
    scope: scope.ok,
    snapshot: {
      creation: creation(),
      changes: [],
      contextRecords: [],
      workspaceVisit: {
        workspace: 'workspace',
        instance: 'instance',
        generation: '0',
        directories: [child],
      },
    },
  }
  await expect(readWorkspaceGuidance(input, binding)).resolves.toMatchObject({ sources: [] })
  await rm(child, { recursive: true })
  await symlink(peer, child, 'dir')
  await expect(readWorkspaceGuidance(input, binding)).rejects.toThrow()
  await writeFile(join(peer, 'AGENTS.md'), 'other workspace')
  await expect(readWorkspaceGuidance(input, binding)).rejects.toThrow()
})
