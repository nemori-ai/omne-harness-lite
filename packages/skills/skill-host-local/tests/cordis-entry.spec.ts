// The Skill plugin on a real Cordis `Context`. The two demand ports are provided as Services that
// wrap the memory doubles of `@omne-harness/skill-contract/testing`; the package is a legal Skill
// package in a temporary directory.
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { createPackageInspection } from '@omne-harness/skill'
import type { DeclaredProjection, SkillDefinition } from '@omne-harness/skill-contract'
import type {
  PackageLocator,
  SkillReadCheck,
  SkillRef,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import { createMemoryReadCheck, createMemoryResolution } from '@omne-harness/skill-contract/testing'
import {
  PackageInspectionService,
  SkillAccessService,
  SkillCatalogService,
  SkillReadCheckService,
  SkillResolutionService,
} from '@omne-harness/skill-cordis-contract/cordis'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { skillPlugin } from '@omne-harness/skill-host-local/cordis'
import { scratch, writeTree } from './scratch.ts'

const BODY = 'Read the diff.\n'
const MANIFEST = `---\nname: review\ndescription: Reviews a change and writes findings.\n---\n${BODY}`
const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const reader = access('reader', tenant(organization.value, account.value))
const scope = 'example'

const review: CapabilityId = (() => {
  const id = capabilityId('skill', 'review')
  if (!id.ok) throw new Error('not a capability identity')
  return id.id
})()

function declaredOf(definition: SkillDefinition): DeclaredProjection {
  const { manifest, declaration } = definition
  return {
    name: manifest.name,
    description: manifest.description,
    tools: declaration.dependencies,
    scripts: declaration.scripts,
    settings: declaration.settings,
  }
}

/** A Service class that provides `port` as the read check of the loading context. */
function readCheckService(port: SkillReadCheck<unknown, unknown>) {
  return class extends SkillReadCheckService<unknown, unknown> {
    check(...args: Parameters<SkillReadCheck<unknown, unknown>['check']>) {
      return port.check(...args)
    }
  }
}

/** A Service class that provides `port` as the resolution of the loading context. */
function resolutionService(port: SkillResolution<unknown, unknown>) {
  return class extends SkillResolutionService<unknown, unknown> {
    resolve(...args: Parameters<SkillResolution<unknown, unknown>['resolve']>) {
      return port.resolve(...args)
    }
    adopted(...args: Parameters<SkillResolution<unknown, unknown>['adopted']>) {
      return port.adopted(...args)
    }
  }
}

/** The test package, and the memory doubles that adopt and grant it. No Context is made here. */
async function prepared() {
  const root = join(await scratch(), 'review')
  await writeTree(root, {
    files: { 'SKILL.md': MANIFEST, '.omne/skill.json': '{"formatVersion":1}\n' },
  })
  const locator: PackageLocator = { kind: 'directory', root }
  const inspected = await createPackageInspection(createDirectorySource()).inspect(locator)
  if (!('ok' in inspected)) throw new Error('the test package is not legal')
  const ref: SkillRef = {
    capability: review,
    layer: 'workspace',
    locator,
    digest: inspected.ok.snapshot.digest,
  }
  const declared = declaredOf(inspected.ok)
  const readCheck = (visible: boolean) =>
    createMemoryReadCheck<unknown, unknown>([{ capability: review, visible: () => visible }])
  const resolution = createMemoryResolution<unknown, unknown>([
    {
      capability: review,
      visible: () => true,
      state: { kind: 'adopted', current: { ref, declared } },
    },
  ])
  return { readCheck, resolution }
}

/** The plugin is loaded on a fresh context that has no port yet. */
async function loaded() {
  const ctx = new Context()
  const fiber = await ctx.plugin(skillPlugin)
  return { ctx, fiber, ...(await prepared()) }
}

/** The service of `key`, or a failed test when the context has none. */
function service<K extends 'skillPackageInspection' | 'skillCatalog' | 'skillAccess'>(
  ctx: Context,
  key: K,
) {
  const found = ctx.get(key)
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

const bodyOfReview = { capability: review, part: { kind: 'body' } } as const

describe('the Skill plugin on a Cordis context', () => {
  it('provides the three services and walks describe then read on a directory package', async () => {
    const { ctx, readCheck, resolution } = await loaded()
    await ctx.plugin(readCheckService(readCheck(true)))
    await ctx.plugin(resolutionService(resolution))

    expect(service(ctx, SkillCatalogService.provide)).toBeInstanceOf(SkillCatalogService)
    const described = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    if (!('ok' in described) || described.ok.material.kind !== 'pinned')
      throw new Error('describe did not pin the package')
    const { basis } = described.ok.material
    const page = await service(ctx, SkillAccessService.provide).read(reader, scope, bodyOfReview, {
      basis,
    })
    expect(page).toMatchObject({
      ok: { content: { kind: 'text', text: BODY }, complete: true, basis },
    })
    const listed = await service(ctx, SkillCatalogService.provide).summaries(reader, scope)
    expect(listed).toMatchObject({ ok: [{ kind: 'adopted', capability: review }] })
  })

  it('answers unknown, and gives no content, while the read check is absent', async () => {
    const { ctx, resolution } = await loaded()
    await ctx.plugin(resolutionService(resolution))

    expect(await service(ctx, SkillAccessService.provide).describe(reader, scope, review)).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(
      await service(ctx, SkillAccessService.provide).read(reader, scope, bodyOfReview),
    ).toEqual({ failure: { kind: 'unknown' } })
    expect(await service(ctx, SkillCatalogService.provide).summaries(reader, scope)).toEqual({
      failure: 'unknown',
    })
  })

  it('answers unknown, and gives no content, while the resolution is absent', async () => {
    const { ctx, readCheck } = await loaded()
    await ctx.plugin(readCheckService(readCheck(true)))

    expect(await service(ctx, SkillAccessService.provide).describe(reader, scope, review)).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(
      await service(ctx, SkillAccessService.provide).read(reader, scope, bodyOfReview),
    ).toEqual({ failure: { kind: 'unknown' } })
    expect(
      await service(ctx, SkillCatalogService.provide).search(reader, scope, { text: 'x' }),
    ).toEqual({
      failure: 'unknown',
    })
  })

  it('keeps inspecting packages while both ports are absent', async () => {
    const { ctx } = await loaded()
    const root = join(await scratch(), 'other')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST.replace('review', 'other') } })
    const inspected = await service(ctx, PackageInspectionService.provide).inspect({
      kind: 'directory',
      root,
    })
    expect(inspected).toMatchObject({ ok: { manifest: { name: 'other' } } })
  })

  it('uses the replacement when a port is swapped between two operations', async () => {
    const { ctx, readCheck, resolution } = await loaded()
    await ctx.plugin(resolutionService(resolution))
    const granting = await ctx.plugin(readCheckService(readCheck(true)))
    const first = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(first).toHaveProperty('ok')

    await granting.dispose()
    await ctx.plugin(readCheckService(readCheck(false)))
    const second = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(second).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('uses the replacement resolution when it is swapped between two operations', async () => {
    const { ctx, readCheck, resolution } = await loaded()
    await ctx.plugin(readCheckService(readCheck(true)))
    const adopting = await ctx.plugin(resolutionService(resolution))
    const first = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(first).toHaveProperty('ok')

    await adopting.dispose()
    await ctx.plugin(resolutionService(createMemoryResolution<unknown, unknown>([])))
    const second = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(second).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('uses a read check that was provided before the plugin loaded, and its replacement', async () => {
    const { readCheck, resolution } = await prepared()
    const ctx = new Context()
    await ctx.plugin(resolutionService(resolution))
    const granting = await ctx.plugin(readCheckService(readCheck(true)))
    await ctx.plugin(skillPlugin)
    const first = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(first).toHaveProperty('ok')

    await granting.dispose()
    await ctx.plugin(readCheckService(readCheck(false)))
    const second = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(second).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('uses a resolution that was provided before the plugin loaded, and its replacement', async () => {
    const { readCheck, resolution } = await prepared()
    const ctx = new Context()
    await ctx.plugin(readCheckService(readCheck(true)))
    const adopting = await ctx.plugin(resolutionService(resolution))
    await ctx.plugin(skillPlugin)
    const first = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(first).toHaveProperty('ok')

    await adopting.dispose()
    await ctx.plugin(resolutionService(createMemoryResolution<unknown, unknown>([])))
    const second = await service(ctx, SkillAccessService.provide).describe(reader, scope, review)
    expect(second).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('removes the three services when the plugin unloads', async () => {
    const { ctx, fiber } = await loaded()
    expect(ctx.get(PackageInspectionService.provide)).toBeDefined()
    await fiber.dispose()
    expect(ctx.get(PackageInspectionService.provide)).toBeUndefined()
    expect(ctx.get(SkillCatalogService.provide)).toBeUndefined()
    expect(ctx.get(SkillAccessService.provide)).toBeUndefined()
  })

  it('refuses to load with a non-empty configuration', async () => {
    const ctx = new Context()
    // The typed overload forbids the bad configuration; an assembly reading a plugin tree does not.
    const loading: unknown = Reflect.apply(ctx.plugin, ctx, [skillPlugin, { extra: true }])
    await expect(Promise.resolve(loading)).rejects.toBeDefined()
    expect(ctx.get(SkillAccessService.provide)).toBeUndefined()
  })
})
