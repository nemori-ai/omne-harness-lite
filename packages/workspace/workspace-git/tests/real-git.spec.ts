// @module-tag slow
// Runs the real git program to make repositories. Only this test runs it: the member never does.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { operationId, type OperationId } from '@omne-harness/workspace-contract'
import {
  createCatalog,
  createGovernance,
  createInstances,
  createManagementTypes,
} from '@omne-harness/workspace'
import {
  createMemoryStore,
  fakeAccess,
  fakeAuthority,
  fakeMinting,
} from '@omne-harness/workspace/testing'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { GitType, readWorkingCopy } from '@omne-harness/workspace-git'
import { digestOf, sandbox } from './repositories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
let count = 0
const next = () => join(box.root, `repo-${++count}`)
beforeAll(async () => {
  box = await sandbox()
})
afterAll(async () => {
  await box.dispose()
})

const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid']
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' }).trim()

function made(...init: string[]): string {
  const root = next()
  mkdirSync(root)
  git(root, 'init', '-q', '-b', 'main', ...init)
  writeFileSync(join(root, 'README.md'), '# project\n')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'first')
  return root
}

const ALICE = fakeAccess(1)
const op = (text: string) => operationId(text) as OperationId

/** The domain over a memory store, with the two types as an assembly contributes them. */
function domain() {
  const types = createManagementTypes()
  types.contribute(new DirectoryType())
  types.contribute(new GitType())
  const store = createMemoryStore()
  const deps = { authority: fakeAuthority(), store, types, minting: fakeMinting(), node: 'node-1' }
  return {
    governance: createGovernance(deps),
    instances: createInstances(deps),
    catalog: createCatalog(deps),
  }
}

describe('what git itself wrote is read as git itself reads it', () => {
  it('the commit of a branch, of a detached HEAD, of packed refs and of a linked working copy', async () => {
    const root = made()
    const headOf = async (at: string) => {
      const read = await readWorkingCopy(at)
      return 'ok' in read ? read.ok.head : read
    }
    expect(await headOf(root)).toBe(git(root, 'rev-parse', 'HEAD'))
    const other = next()
    git(root, 'worktree', 'add', '-q', '-b', 'feature', other)
    writeFileSync(join(other, 'more.txt'), 'more\n')
    git(other, 'add', '.')
    git(other, 'commit', '-q', '-m', 'second')
    expect(await headOf(other)).toBe(git(other, 'rev-parse', 'HEAD'))
    expect(await headOf(other)).not.toBe(await headOf(root))
    git(root, 'pack-refs', '--all')
    expect(await headOf(root)).toBe(git(root, 'rev-parse', 'HEAD'))
    expect(await headOf(other)).toBe(git(other, 'rev-parse', 'HEAD'))
    git(other, 'checkout', '-q', '--detach')
    expect(await headOf(other)).toBe(git(other, 'rev-parse', 'HEAD'))
    const [main, copy] = [await readWorkingCopy(root), await readWorkingCopy(other)]
    expect('ok' in main && 'ok' in copy && copy.ok.repository).toEqual(
      'ok' in main && main.ok.repository,
    )
  })

  it('a repository that keeps its refs in the reftable format is refused by name, and is not taken as a plain directory', async () => {
    const root = made('--ref-format=reftable')
    const { governance, catalog } = domain()
    expect(await governance.register(ALICE, { operation: op('r1'), address: root })).toEqual({
      kind: 'not-performed',
      reason: 'unsupported-ref-format',
    })
    expect(await catalog.list(ALICE)).toEqual({ kind: 'read', value: [] })
  })
})

describe('registering and verifying a working copy runs nothing the repository names', () => {
  it('leaves no trace of its hooks, its file monitor or its other configured programs, and changes no byte', async () => {
    const root = made()
    const trace = join(box.root, `trace-${count}`)
    const script = join(box.root, `leave-trace-${count}.sh`)
    writeFileSync(script, `#!/bin/sh\necho ran >> ${trace}\n`)
    chmodSync(script, 0o755)
    const hooks = join(root, '.git', 'traps')
    mkdirSync(hooks)
    for (const hook of [
      'post-index-change',
      'pre-commit',
      'post-checkout',
      'reference-transaction',
    ])
      execFileSync('cp', [script, join(hooks, hook)])
    for (const [key, value] of [
      ['core.hooksPath', hooks],
      ['core.fsmonitor', script],
      ['core.pager', script],
      ['core.editor', script],
      ['core.sshCommand', script],
      ['credential.helper', script],
      ['diff.external', script],
    ] as const)
      git(root, 'config', key, value)
    // The trap is live: a command git calls read-only sets it off.
    git(root, 'status', '--porcelain')
    expect(existsSync(trace)).toBe(true)
    execFileSync('rm', [trace])
    const before = await digestOf(root)

    const { governance, instances, catalog } = domain()
    const registered = await governance.register(ALICE, { operation: op('r1'), address: root })
    if (registered.kind !== 'done') throw new Error(JSON.stringify(registered))
    expect(registered.value.type).toBe('git')
    const verified = await instances.verify(ALICE, registered.value)
    expect(verified).toMatchObject({
      kind: 'attachable',
      directory: root,
      attachment: { basis: git(root, 'rev-parse', 'HEAD') },
    })
    await catalog.describe(ALICE, registered.value.workspace)
    expect(existsSync(trace)).toBe(false)
    expect(await digestOf(root)).toBe(before)
  })
})

describe('a second working copy of the repository', () => {
  it('is no instance until someone associates it; one of another repository, and a plain directory, are refused', async () => {
    const root = made()
    const { governance, instances, catalog } = domain()
    const registered = await governance.register(ALICE, { operation: op('r1'), address: root })
    if (registered.kind !== 'done') throw new Error(JSON.stringify(registered))
    const { workspace } = registered.value
    const count = async () => {
      const view = await catalog.describe(ALICE, workspace)
      return view.kind === 'read' ? view.value.instances.length : view.kind
    }
    const other = next()
    git(root, 'worktree', 'add', '-q', '-b', 'feature', other)
    expect(await count()).toBe(1)

    const foreign = made()
    const plain = next()
    mkdirSync(plain)
    for (const [name, address, reason] of [
      ['a2', foreign, 'not-the-same-resource'],
      ['a3', plain, 'not-a-working-copy'],
    ] as const)
      expect(await instances.associate(ALICE, { operation: op(name), workspace, address })).toEqual(
        {
          kind: 'not-performed',
          reason,
        },
      )
    expect(await count()).toBe(1)

    const associated = await instances.associate(ALICE, {
      operation: op('a1'),
      workspace,
      address: other,
    })
    expect(associated).toMatchObject({ kind: 'done', changed: true })
    expect(await count()).toBe(2)
    if (associated.kind !== 'done') return
    const verified = await instances.verify(ALICE, {
      workspace,
      instance: associated.value.instance,
    })
    expect(verified).toMatchObject({
      kind: 'attachable',
      directory: other,
      attachment: { basis: git(other, 'rev-parse', 'HEAD') },
    })
  })
})
