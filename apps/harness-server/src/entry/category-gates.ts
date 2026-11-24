import type { BodyContract } from '@omne-harness/assets'
import type { AssetPublicationRef } from '@omne-harness/assets-local'
import { canonicalText } from '@omne-harness/authorization'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'
import { SettingsIdSchema, defineSettings, type SettingDefinitions } from '@omne-harness/settings'
import { canonicalDigest } from '@omne-harness/tool'
import { z } from 'zod'
import { PERMISSION_INTERPRETATION } from '../rows/governance/permission-interpretation.ts'
import {
  gateRules,
  toolPermissionReleaseSchema,
  type ToolPermissionRelease,
} from './tool-permission-release.ts'

export const categoryGateTemplateSchema = z.strictObject({
  category: SettingsIdSchema,
  ownerId: GovernanceIdSchema,
  gates: z
    .array(
      z.strictObject({
        id: SettingsIdSchema,
        title: z.string().min(1),
        default: z.enum(['deny', 'ask', 'auto']),
      }),
    )
    .min(1)
    .max(16),
})
export const categoryGateTemplatesSchema = z
  .array(categoryGateTemplateSchema)
  .max(16)
  .refine(
    templates =>
      new Set(templates.map(template => template.category)).size === templates.length &&
      new Set(templates.map(template => template.ownerId)).size === templates.length,
    'one template for each category and owner',
  )
export type CategoryGateTemplate = z.infer<typeof categoryGateTemplateSchema>
type CategoryGate = CategoryGateTemplate['gates'][number]

const UNPUBLISHED = { kind: 'asset' as const, assetId: 'unpublished', releaseRef: 'unpublished' }
const equal = (left: unknown, right: unknown) => canonicalText(left) === canonicalText(right)

export function categoryCapabilityId(category: string, name: string): string {
  return `${category}.${name}`
}

export function categoryEnforcementKey(category: string, gate: Pick<CategoryGate, 'id'>): string {
  return `${category}.${gate.id}`
}

function gatePermission(
  template: CategoryGateTemplate,
  name: string,
  gate: CategoryGate,
  version: string,
  reference: PermissionDefinition['reference'],
): PermissionDefinition & { effects: { value: string; effect: string }[] } {
  const {
    effects,
    interpretationRef: _interpretation,
    ...rules
  } = gateRules({
    title: gate.title,
    description: `控制 ${template.category} 类别里 ${name} 的「${gate.title}」。允许调用不代表对端可用或操作一定成功。`,
    default: gate.default,
  })
  const group = `${categoryCapabilityId(template.category, name)}.permissions`
  return {
    ...rules,
    effects,
    reference,
    capabilityId: categoryCapabilityId(template.category, name),
    enforcementKey: categoryEnforcementKey(template.category, gate),
    settings: {
      providerId: template.ownerId,
      definitionId: categoryCapabilityId(template.category, name),
      version,
      itemId: gate.id,
      groupId: group,
      groupTitle: '权限',
      groupDescription: `${name} 的调用权限。`,
    },
  }
}

function projected(permission: PermissionDefinition): SettingDefinitions {
  const projection = projectPermissionSettings(permission)
  if (projection.kind !== 'projected') throw new Error('Category gate permission is invalid')
  return projection.definition
}

export function gatedSettings(
  template: CategoryGateTemplate,
  name: string,
  own: SettingDefinitions | null,
): SettingDefinitions {
  const gates = template.gates.map(gate => {
    const { effects: _effects, ...permission } = gatePermission(
      template,
      name,
      gate,
      'unversioned',
      { origin: UNPUBLISHED, itemId: gate.id, revision: 'unversioned' },
    )
    return projected(permission)
  })
  const [first] = gates
  if (first === undefined) throw new Error('Category gate template has no gate')
  const body = {
    providerId: template.ownerId,
    definitionId: categoryCapabilityId(template.category, name),
    groups: [...(own?.groups ?? []), ...first.groups],
    items: [...(own?.items ?? []), ...gates.flatMap(gate => gate.items)],
  }
  const definition = defineSettings({
    ...body,
    version: canonicalDigest({ own: own?.version ?? null, body }).slice(7),
  })
  if (definition.kind !== 'defined') throw new Error('Category gate settings are invalid')
  return definition.definition
}

export function gatedCategoryContract(
  contract: BodyContract,
  template: CategoryGateTemplate,
): BodyContract {
  if (contract.category !== template.category)
    throw new Error('Category gate template names another category')
  return {
    ...contract,
    settings(body, context) {
      const name = context?.capabilityName
      if (name === undefined) throw new Error('Category gate settings need the capability name')
      return gatedSettings(template, name, contract.settings?.(body, context) ?? null)
    },
  }
}

export function categoryGateRelease(input: {
  template: CategoryGateTemplate
  publication: AssetPublicationRef
  settings: SettingDefinitions
}): ToolPermissionRelease | undefined {
  const { template, publication, settings } = input
  const { category, name } = publication
  if (
    category !== template.category ||
    settings.providerId !== template.ownerId ||
    settings.definitionId !== categoryCapabilityId(category, name)
  )
    return undefined
  const version = canonicalDigest({ template, publication, settings }).slice(7)
  const origin = {
    kind: 'asset' as const,
    assetId: publication.assetRef,
    releaseRef: `${publication.assetRef}/${publication.version}`,
  }
  const implementationRef = `${category}/${canonicalDigest(publication).slice(7)}`
  const gates = template.gates.map(gate => {
    const { effects, ...permission } = gatePermission(template, name, gate, settings.version, {
      origin,
      itemId: gate.id,
      revision: version,
    })
    const binding = {
      capabilityId: permission.capabilityId,
      enforcementKey: permission.enforcementKey,
      implementationRef,
      action: 'invoke',
      interpretationRef: PERMISSION_INTERPRETATION,
    }
    return { permission, binding, effects }
  })
  try {
    for (const gate of gates) {
      const expected = projected(gate.permission)
      if (
        !expected.items.every(item => settings.items.some(found => equal(found, item))) ||
        !expected.groups.every(group => settings.groups.some(found => equal(found, group)))
      )
        return undefined
    }
  } catch {
    return undefined
  }
  const reference = {
    ownerId: template.ownerId,
    definitionId: categoryCapabilityId(category, name),
    version,
  }
  const body = {
    reference,
    origin,
    settings: [settings],
    permissions: gates.map(gate => gate.permission),
    enforcementBindings: gates.map(gate => gate.binding),
  }
  const release = toolPermissionReleaseSchema.safeParse({
    declaration: { ...body, reference: { ...reference, digest: canonicalDigest(body).slice(7) } },
    interpretations: gates.map(({ binding, permission, effects }) => ({
      binding,
      definition: permission,
      effects,
    })),
  })
  return release.success ? release.data : undefined
}

const pickOf = (value: unknown): CategoryGate['default'] | undefined => {
  const pick: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'pick') : undefined
  return pick === 'deny' || pick === 'ask' || pick === 'auto' ? pick : undefined
}

export function storedCategoryGateTemplate(
  publication: AssetPublicationRef,
  settings: SettingDefinitions,
): CategoryGateTemplate | undefined {
  const gates: CategoryGate[] = []
  for (const item of settings.items) {
    if (item.category !== 'governance') continue
    const pick = item.default.kind === 'value' ? pickOf(item.default.value) : undefined
    if (pick === undefined) return undefined
    gates.push({ id: item.id, title: item.presentation.title, default: pick })
  }
  const template = categoryGateTemplateSchema.safeParse({
    category: publication.category,
    ownerId: settings.providerId,
    gates,
  })
  return template.success ? template.data : undefined
}

export function storedCategoryGateRelease(
  publication: AssetPublicationRef,
  settings: SettingDefinitions,
): Readonly<{ template: CategoryGateTemplate; release: ToolPermissionRelease }> | undefined {
  const template = storedCategoryGateTemplate(publication, settings)
  if (template === undefined) return undefined
  const release = categoryGateRelease({ template, publication, settings })
  return release === undefined ? undefined : { template, release }
}
