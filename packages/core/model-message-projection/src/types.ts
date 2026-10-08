import type { ContentBlock, JsonValue } from '@omne-harness-lite/content-blocks'
import type { Message, SilencedBlockRef, SystemMessage } from '@omne-harness-lite/messages'
import type { LogEntry, SourceToken } from '@omne-harness-lite/session-log'

/** Values identify the actual adopted inputs, not a configuration label alone. */
export interface ExternalInputKeys {
  readonly agentDefinition: string
  readonly assembly: string
  readonly systemPrompt: string
  readonly contextGeneration: string
  readonly modelProfile: string
  readonly modalities: string
  readonly tools: string
  readonly parameters: string
}
export interface ProjectionRules {
  readonly version: string
  /** null denotes an uncached projection that does not compose request-side inputs. */
  readonly external: ExternalInputKeys | null
  readonly system: readonly SystemMessage[]
  readonly pendingCardBlocks: readonly SilencedBlockRef[] | null
  readonly lastModelRequestPrefixLength: number | null
}
export interface ProjectionInput {
  readonly source: SourceToken
  readonly entries: readonly LogEntry[]
  readonly rules: ProjectionRules
}
export interface ExtensionInput {
  readonly source: SourceToken
  readonly entries: readonly LogEntry[]
  readonly rules: ProjectionRules
}
export interface SourceMapping {
  readonly messageId: string
  readonly position: LogEntry['position'] | null
  readonly blockIds: readonly string[]
}
export interface WorkCounters {
  readonly entries: number
  readonly blocks: number
  readonly references: number
  readonly messages: number
}
export interface ProjectionSegment {
  readonly previous: ProjectionSegment | null
  readonly message: Message
  readonly source: SourceMapping
}
export interface Projection {
  readonly source: SourceToken
  readonly inputKey: string
  readonly segments: ProjectionSegment | null
  readonly workCounters: WorkCounters
}
declare const cacheOwner: unique symbol
export interface CacheOwner {
  readonly [cacheOwner]: true
}
export type InvalidProjection = {
  readonly invalidInput: true
  readonly reason: 'shape' | 'source' | 'pairing' | 'claimedPayload' | 'compaction'
}
export type MissingSource = {
  readonly unavailable: true
  readonly reason: 'requiredSource' | 'capacity'
}
export type ProjectionFailure = InvalidProjection | MissingSource
export type RebuildRequired = {
  readonly rebuildRequired: true
  readonly reason:
    'generation' | 'gap' | 'rule' | 'external' | 'corrupt' | 'impactUnknown' | 'capacity'
}
export type FactReader = (value: JsonValue, entry: LogEntry) => 'valid' | 'invalid' | 'unavailable'
/** Trusted owner codecs. A reader validates its own fact without external IO. */
export interface ProjectionOptions {
  readonly factReaders?: ReadonlyMap<string, FactReader>
  readonly entryReaders?: readonly ((
    entry: LogEntry,
  ) => 'valid' | 'invalid' | 'unavailable' | 'unrelated')[]
}
export interface BlockNode {
  readonly block: ContentBlock
  readonly children: readonly BlockNode[]
  readonly parent: BlockNode | null
  readonly readable: boolean
  readonly pendingAncestor: boolean
  readonly hasPending: boolean
}

export interface CacheOptions extends ProjectionOptions {
  readonly limits: { readonly entries: number; readonly blocks: number; readonly bytes: number }
}
