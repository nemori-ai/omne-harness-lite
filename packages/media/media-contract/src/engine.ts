import type { TenantId } from '@omne-harness/legal-identity'

/** Where the bytes of a medium go when an engine converts it. */
export type EngineEgress =
  | Readonly<{ kind: 'in-process' }>
  | Readonly<{ kind: 'host' }>
  | Readonly<{ kind: 'remote'; destination: string }>

export type EngineParameters = Readonly<Record<string, unknown>>

export type EngineDeclaration = Readonly<{
  name: string
  revision: string
  /** Media types it takes; `audio/*` takes every type of that family. */
  accepts: readonly string[]
  maxBytes: number
  egress: EngineEgress
  concurrency: number
  /** A JSON Schema of the parameters a converter definition may give it. */
  parameters: EngineParameters
}>

export type EngineAccess<P = unknown> = Readonly<{ tenant: TenantId; principal: P }>

export type EngineInput<P = unknown> = Readonly<{
  access: EngineAccess<P>
  media: Readonly<{ mediaType: string; bytes: number; open(): AsyncIterable<Uint8Array> }>
  parameters: EngineParameters
  signal: AbortSignal
}>

export type DerivedMedium = Readonly<{ mediaType: string; bytes: Uint8Array }>
export type EngineOutput =
  | Readonly<{ kind: 'converted'; text: string; derived: readonly DerivedMedium[] }>
  | Readonly<{ kind: 'inconvertible' }>
  | Readonly<{ kind: 'failed'; reason: 'unavailable' | 'error' | 'outcome-unknown' }>

export interface ConverterEngine<P = unknown> {
  readonly declaration: EngineDeclaration
  convert(input: EngineInput<P>): Promise<EngineOutput>
}

const NAME = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u
const MEDIA_TYPE = /^[a-z0-9][a-z0-9.+-]*\/(?:\*|[a-z0-9][a-z0-9.+-]*)$/u

export const isEngineName = (name: string): boolean => name.length <= 64 && NAME.test(name)

const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0
const described = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What does not hold in a declaration, or null: the registry takes only a declaration that holds. */
export function declarationProblem(declaration: EngineDeclaration): string | null {
  const { name, revision, accepts, maxBytes, egress, concurrency, parameters } = declaration
  if (!isEngineName(name)) return `the name ${JSON.stringify(name)} is not an engine name`
  if (revision === '') return 'the revision is empty'
  if (accepts.length === 0) return 'it accepts no media type'
  const stranger = accepts.find(type => !MEDIA_TYPE.test(type))
  if (stranger !== undefined) return `${JSON.stringify(stranger)} is not a media type`
  if (!positive(maxBytes)) return 'the size limit is not a positive whole number'
  if (!positive(concurrency)) return 'the concurrency is not a positive whole number'
  if (egress.kind === 'remote' && egress.destination === '')
    return 'a remote engine names no destination'
  return described(parameters) ? null : 'the parameters are not described by an object'
}

export function engineAccepts(declaration: EngineDeclaration, mediaType: string): boolean {
  const family = `${mediaType.split('/')[0] ?? ''}/*`
  return declaration.accepts.some(type => type === mediaType || type === family)
}
