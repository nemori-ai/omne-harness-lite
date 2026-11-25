import type { Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { contextPort } from './context-port.ts'

/** The tools a Skill needs that the session does not have now; unknown when they cannot be read. */
export type SkillsMissingTools = readonly string[] | 'unknown'

export type SkillsEntry =
  | Readonly<{
      kind: 'available'
      name: string
      description?: string
      needs?: SkillsMissingTools
    }>
  | Readonly<{ kind: 'disabled'; name: string; description?: string; reason: string }>

export type SkillsPage = Readonly<{ entries: readonly SkillsEntry[]; next: string | null }>

/** The layer a Skill is read from and the version read. */
export type SkillsSource = Readonly<{ layer: string; version: string }>

type Provenance = Readonly<{ source?: SkillsSource; missingTools?: SkillsMissingTools }>

/** Bytes `start` to `end` of `total`; the read is complete when `end` reaches `total`. */
export type SkillsText = Provenance &
  Readonly<{
    text: string
    start: number
    end: number
    total: number
    directory?: string
  }>

export type SkillsFile = Readonly<{ path: string; size: number; mediaType?: string }>

export type SkillsListing = Provenance &
  Readonly<{ files: readonly SkillsFile[]; directory?: string }>

export type SkillsFailure =
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'disabled'; reason: string }>
  | Readonly<{ kind: 'file-not-found' }>
  | Readonly<{ kind: 'not-text' }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'invalid'; field: 'skill' | 'path'; reason: string }>
  | Readonly<{ kind: 'invalid-cursor' }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

export interface SkillsAccess {
  search(
    input: Readonly<{ query: string; after: string | null; limit: number }>,
    signal: AbortSignal,
  ): Promise<Outcome<SkillsPage, SkillsFailure>>
  read(
    input: Readonly<{ skill: string; offset: number; maxBytes: number }>,
    signal: AbortSignal,
  ): Promise<Outcome<SkillsText, SkillsFailure>>
  list(
    input: Readonly<{ skill: string }>,
    signal: AbortSignal,
  ): Promise<Outcome<SkillsListing, SkillsFailure>>
  readFile(
    input: Readonly<{ skill: string; path: string; offset: number; maxBytes: number }>,
    signal: AbortSignal,
  ): Promise<Outcome<SkillsText, SkillsFailure>>
}

const port = contextPort<SkillsAccess>()

export function skillsAccessOf(context: ToolExecutionContext): SkillsAccess | undefined {
  return port.of(context)
}

export function attachSkillsAccess(
  scope: ToolExecutionScope,
  access: SkillsAccess,
): ToolExecutionScope {
  return port.attach(scope, access)
}
