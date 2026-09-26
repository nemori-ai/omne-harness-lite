import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import type { CapabilityId, JsonNumber, MediaType } from '@omne-harness-lite/content-blocks'
import type { DependencyName, TargetEnvironment } from '@omne-harness-lite/tool-definition'

export type SkillName = string
export interface SkillManifest {
  readonly name: SkillName
  readonly description: string
  readonly license?: string
  readonly compatibility?: string
  readonly metadata?: Readonly<Record<string, string>>
  readonly 'allowed-tools'?: string
}
export interface ResourceEntry {
  readonly path: string
  readonly mediaType?: MediaType
}
export type SkillSetting =
  | Extract<
      AttributeDeclaration,
      { readonly kind: 'setting'; readonly category: 'preference' | 'binding' }
    >
  | (Extract<AttributeDeclaration, { readonly category: 'placement_identity' | 'governance' }> & {
      readonly category: 'placement_identity'
    })
export type ToolReference = CapabilityId & { readonly category: 'tool' }
export interface SkillDefinitionRecord {
  /** Numeric one; lossless spellings such as 1.0 remain valid JSON numbers. */
  readonly format: JsonNumber
  readonly tools?: readonly ToolReference[]
  readonly dependencies?: readonly DependencyName[]
  readonly settings?: readonly SkillSetting[]
  readonly environmentRequirement?: TargetEnvironment
}
export interface SkillPackage {
  readonly manifest: SkillManifest
  readonly body: string
  readonly definition?: SkillDefinitionRecord
  readonly resources: readonly ResourceEntry[]
}
export type SkillRejection =
  | 'manifest_missing'
  | 'name_mismatch'
  | 'definition_format_unsupported'
  | 'resource_escapes'
  | 'tool_ref_invalid'
  | 'binding_layer_unknown'
  | 'setting_category_unknown'
  | 'malformed'
export type MalformedCode =
  `M${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17}`
export type SkillJudgment =
  { readonly ok: true } | { readonly rejected: SkillRejection; readonly malformed?: MalformedCode }
export interface SkillJudgeContext {
  readonly capabilityName?: string
}
export type SkillDependency =
  | { readonly kind: 'tool'; readonly capability: ToolReference }
  | { readonly kind: 'external_service'; readonly name: DependencyName }
  | { readonly kind: 'execution_environment'; readonly value: TargetEnvironment }

/** Supplied entries describe caller-owned filesystem observations; the reader performs no I/O. */
export type SkillPackageEntry =
  | {
      readonly kind: 'file'
      readonly path: string
      /** Text is needed only for SKILL.md and .omne/skill.json, already decoded as UTF-8. */
      readonly text?: string
      readonly mediaType?: MediaType
      readonly linkResolution?: 'inside'
      readonly executable?: boolean
    }
  | { readonly kind: 'directory'; readonly path: string; readonly linkResolution?: 'inside' }
  | {
      readonly kind: 'link'
      readonly path: string
      readonly resolution: 'outside' | 'unresolved' | 'cycle'
    }
  | { readonly kind: 'special'; readonly path: string }
export interface UnknownSkillKey {
  /** YAML source spelling also preserves complex/non-string keys without coercing them into manifest. */
  readonly keySource: string
  readonly key?: string
  readonly category: 'external_attribute' | 'unknown'
}
export type SkillMdReadResult =
  | {
      readonly ok: {
        readonly manifest: SkillManifest
        readonly body: string
        readonly unknownKeys: readonly UnknownSkillKey[]
      }
    }
  | { readonly rejected: SkillRejection; readonly malformed?: MalformedCode }
export type SkillPackageReadResult =
  | {
      readonly ok: {
        readonly package: SkillPackage
        readonly unknownKeys: readonly UnknownSkillKey[]
      }
    }
  | { readonly rejected: SkillRejection; readonly malformed?: MalformedCode }
