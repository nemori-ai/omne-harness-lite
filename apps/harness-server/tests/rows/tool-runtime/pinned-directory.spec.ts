import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterAll, describe, expect, it } from 'vitest'
import { workspaceCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { ToolCallDirectory } from '@omne-harness/tool-contract'
import type { Verification } from '@omne-harness/workspace-contract'
import type { ReleaseToolIdentity } from '../../../src/rows/tool-runtime/access.ts'
import {
  admittedDirectory,
  createReleaseEnvironment,
} from '../../../src/rows/tool-runtime/environment.ts'
import { callKeyOf, toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')
const base = realpathSync(mkdtempSync(join(tmpdir(), 'pinned-directory-')))
afterAll(() => rmSync(base, { recursive: true, force: true }))
const rootOf = (name: string) => {
  const root = join(base, name)
  mkdirSync(root, { recursive: true })
  return root
}
const [BLOG, SHOP] = [rootOf('blog'), rootOf('shop')] as [string, string]

const parsed = workspaceCodec.parse('wsp_00000000000000000000000001')
if (!parsed.ok) throw new Error('fixture workspace')
const INSTANCE = `wsi_${'0'.repeat(26)}`
const attachedTo = (path: string): ToolCallDirectory => ({
  path,
  workspace: { id: parsed.value, instance: INSTANCE },
})
const attachable = (directory: string): Verification =>
  ({ kind: 'attachable', directory }) as Verification

function asking(answer: Verification | 'absent') {
  const asked: unknown[] = []
  const workspaces = () =>
    answer === 'absent'
      ? undefined
      : {
          verify: async (...input: unknown[]) => {
            asked.push(input)
            return answer
          },
        }
  const admitted = (directory?: ToolCallDirectory) =>
    admittedDirectory(workspaces as never, {
      principal: 'work',
      tenant: TENANT,
      request: directory === undefined ? {} : { directory },
    })
  return { admitted, asked, workspaces }
}

const down = (dependency: string, diagnostic: string) => ({
  failure: { kind: 'unavailable', dependency, diagnostic },
})

describe('the directory a call is admitted into before its placement', () => {
  it('is the pinned directory, asked of nobody, when the call belongs to no workspace', async () => {
    const w = asking('absent')
    expect(await w.admitted({ path: BLOG, workspace: null })).toEqual({ ok: BLOG })
    expect(w.asked).toEqual([])
  })

  it('is the pinned directory when the workspace owner says the tenant can still work there', async () => {
    const w = asking(attachable(BLOG))
    expect(await w.admitted(attachedTo(BLOG))).toEqual({ ok: BLOG })
    expect(w.asked).toEqual([
      [
        { principal: 'work', tenant: TENANT },
        { workspace: parsed.value, instance: INSTANCE },
      ],
    ])
  })

  it.each<[string, Verification | 'absent', ToolCallDirectory | undefined, unknown]>([
    [
      'unavailable when the request pins no directory',
      attachable(BLOG),
      undefined,
      down('working-directory', 'the request pins no working directory'),
    ],
    [
      'denied when the tenant is no longer permitted in the workspace',
      { kind: 'not-permitted' } as Verification,
      attachedTo(BLOG),
      { failure: { kind: 'denied', action: 'workspace' } },
    ],
    [
      'denied when the instance now stands in another directory than the pinned one',
      attachable(SHOP),
      attachedTo(BLOG),
      { failure: { kind: 'denied', action: 'workspace-instance' } },
    ],
    [
      'unavailable, with the reason, when the instance is unavailable',
      { kind: 'instance-unavailable', reason: 'not-found' } as Verification,
      attachedTo(BLOG),
      down('workspace', 'the instance of the call is unavailable: not-found'),
    ],
    [
      'unavailable when the workspace owner cannot verify',
      { kind: 'unavailable' } as Verification,
      attachedTo(BLOG),
      down('workspace', 'the workspace owner could not verify the call'),
    ],
    [
      'unavailable when the workspace owner is not installed',
      'absent',
      attachedTo(BLOG),
      down('workspace', 'the workspace of the call cannot be asked about'),
    ],
    [
      'unavailable when the pinned instance is not an instance identity',
      attachable(BLOG),
      { ...attachedTo(BLOG), workspace: { id: parsed.value, instance: 'nope' } },
      down('workspace', 'the workspace of the call cannot be asked about'),
    ],
  ])('is %s', async (_name, answer, directory, expected) => {
    expect(await asking(answer).admitted(directory)).toEqual(expected)
  })
})

describe('the fence of a call is the directory pinned in its own request', () => {
  const decoded = decodeScopeRef({ ref: 'session-scope:pinned-directory' })
  if ('failure' in decoded) throw new Error('fixture scope')
  const scope = decoded.ok

  function world(answer: Verification | 'absent' = 'absent') {
    const holder = toolRuntimeHolder({ root: {} } as unknown as Context)
    const identity = { sessionWork: async () => ({ kind: 'session' }) } as never
    const { workspaces, asked } = asking(answer)
    const { input } = createReleaseEnvironment(holder, identity as ReleaseToolIdentity, {
      workspaces: workspaces as never,
      commitAttempts: 1,
      schemaProvider: () => null,
    })
    const bind = (call: string, directory: ToolCallDirectory | undefined, environment = {}) =>
      input.plan.binding({
        principal: 'work',
        tenant: TENANT,
        call,
        preparation: { tenant: TENANT, call, operation: `prepare-${call}` },
        request: {
          requesterScope: scope,
          availability: { definition: { declarations: { environment } } },
          ...(directory === undefined ? {} : { directory }),
        },
      } as never)
    const read = (origin: unknown, path: string) =>
      input.plan.guard.authorize('files', 'read', {
        requestId: 'r',
        access: { principal: 'work', tenant: TENANT },
        origin,
        path,
      } as never)
    return { bind, read, asked, holder }
  }

  it('keeps two calls apart: each reads under its own directory and not under the other', async () => {
    const w = world()
    const blog = await w.bind('call-blog', { path: BLOG, workspace: null })
    const shop = await w.bind('call-shop', { path: SHOP, workspace: null })
    if ('failure' in blog || 'failure' in shop) throw new Error('binding')
    expect(await w.read(blog.ok.origin, join(BLOG, 'a.txt'))).toBe('authorized')
    expect(await w.read(shop.ok.origin, join(SHOP, 'a.txt'))).toBe('authorized')
    expect(await w.read(blog.ok.origin, join(SHOP, 'a.txt'))).toBe('notAuthorized')
    expect(await w.read(shop.ok.origin, join(BLOG, 'a.txt'))).toBe('notAuthorized')
    // A settled call leaves no fence behind: its origin authorizes nothing, the other call's still does.
    for (const settle of w.holder.settled) settle(callKeyOf(TENANT, 'call-blog'))
    expect(await w.read(blog.ok.origin, join(BLOG, 'a.txt'))).toBe('notAuthorized')
    expect(await w.read(shop.ok.origin, join(SHOP, 'a.txt'))).toBe('authorized')
  })

  it('binds nothing for a call that works in an environment and whose directory is not admitted', async () => {
    const refused = world({ kind: 'not-permitted' } as Verification)
    expect(await refused.bind('call-refused', attachedTo(BLOG))).toEqual({
      failure: { kind: 'denied', action: 'workspace' },
    })
    expect(await world().bind('call-bare', undefined)).toEqual(
      down('working-directory', 'the request pins no working directory'),
    )
  })

  it('asks the workspace owner again at every binding of a call pinned to an instance', async () => {
    const w = world(attachable(BLOG))
    await w.bind('call-1', attachedTo(BLOG))
    await w.bind('call-1', attachedTo(BLOG))
    expect(w.asked).toHaveLength(2)
  })

  it('needs no directory for a tool that works in no environment, and fences it into nothing', async () => {
    const w = world()
    const bound = await w.bind('call-plain', undefined, null as never)
    if ('failure' in bound) throw new Error(JSON.stringify(bound.failure))
    expect(await w.read(bound.ok.origin, join(BLOG, 'a.txt'))).toBe('notAuthorized')
  })
})
