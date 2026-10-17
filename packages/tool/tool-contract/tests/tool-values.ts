// Builders of legal Tool values for the contract-function tests. Each builder returns a fresh
// plain value, so a test can change one field and keep the rest legal.
import type { BlockId, ContentReference, TextContentBlock } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SchemaRef } from '@omne-harness/schema-provider'
import type {
  Adoption,
  DurableEvidence,
  ParameterContract,
  TextResultFactory,
  ToolAuthor,
  ToolDeclarations,
  ToolDefinition,
  ToolDefinitionMetadata,
  ToolMessageContentBlock,
  ToolResult,
  ToolReturnDeclaration,
  ToolValueSchema,
} from '@omne-harness/tool-contract'

export const limits = {
  maxBytes: 4_096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

export function json(text: string): JsonValue {
  const read = readJsonText(text, limits)
  if (read.kind !== 'ok') throw new Error(`fixture is not JSON: ${read.kind}`)
  return read.value
}

export function adoption(name: string): Adoption {
  return { owner: 'test-owner', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string): DurableEvidence {
  return { owner: 'test-owner', record, revision: '1', digest: `sha256:${record}` }
}

export function parameters(paths: readonly string[] = ['path']): ParameterContract {
  const properties = paths.map(path => `"${path}":{"type":"string"}`).join(',')
  return {
    schema: json(`{"type":"object","properties":{${properties}}}`),
    vocabulary: adoption('json-schema'),
    descriptions: paths.map(path => ({ path, text: `The ${path} value.` })),
  }
}

export function declarations(): ToolDeclarations {
  return {
    adoption: adoption('declarations'),
    environment: null,
    attachments: [],
    inputModalities: [],
    outputModalities: [],
    settings: null,
  }
}

export function metadata(): ToolDefinitionMetadata {
  return {
    adoption: adoption('read_file'),
    name: 'read_file',
    description: 'Reads one file.',
    requiredCapabilities: ['file-system'],
    backgroundAllowed: false,
    declarations: declarations(),
  }
}

export const ordinaryReturns = {
  kind: 'ordinary',
  program: { kind: 'none' },
} as const satisfies ToolReturnDeclaration
export const structuredReturns = {
  kind: 'structured',
  program: { kind: 'none' },
} as const satisfies ToolReturnDeclaration

export function functionDefinition(): ToolDefinition {
  return { ...metadata(), kind: 'function', parameters: parameters(), returns: ordinaryReturns }
}

export function commandsDefinition(): ToolDefinition {
  return {
    ...metadata(),
    name: 'files',
    kind: 'commands',
    commands: [
      {
        name: 'read',
        summary: 'Read a file.',
        parameters: { kind: 'declared', value: parameters() },
        returns: ordinaryReturns,
      },
      {
        name: 'shell',
        summary: 'Run a command.',
        parameters: { kind: 'executor-owned' },
        returns: structuredReturns,
      },
    ],
  }
}

export function valueSchema(id: string, maxBytes = 1_024): ToolValueSchema<unknown> {
  const ref: SchemaRef<unknown> = {
    id: id as SchemaRef<unknown>['id'],
    load: () => Promise.reject(new Error('a contract function must not load a schema')),
  }
  return { identity: { id, revision: '1', digest: `sha256:${id}` }, ref, maxBytes }
}

export function text(id: string, value: string, toModel = true): TextContentBlock {
  return { kind: 'text', id: id as BlockId, visibility: { toHuman: true, toModel }, text: value }
}

export function reference(storage: string, key: string): ContentReference {
  return { storage, key, mediaType: 'image/png', bytes: '42', digest: 'sha256:abc' }
}

export function result(
  content: readonly ToolMessageContentBlock[],
  attachments: readonly ContentReference[] = [],
): ToolResult<ToolMessageContentBlock> {
  return { content, data: { kind: 'none' }, original: { kind: 'none' }, attachments }
}

/** A text factory that gives every rendered text the same fixed block identity. */
export const textFactory: TextResultFactory<ToolMessageContentBlock> = {
  text: value => succeed(result([text('rendered', value)])),
}

type Author<K extends 'ordinary' | 'structured'> = Extract<
  ToolAuthor<JsonValue, unknown, null, ToolMessageContentBlock>,
  { kind: K }
>

const capabilities = {
  parameters: { adoption: adoption('codec'), parse: () => succeed(json('{}')) },
  waits: [],
  codec: {
    adoption: adoption('output-codec'),
    encode: () => succeed(new Uint8Array()),
    decode: () => fail({ reason: 'not used' }),
  },
  output: { adoption: adoption('return-check'), check: () => fail({ reason: 'not used' }) },
}

/** An ordinary author whose renderer writes the JSON text of the value. */
export function ordinaryAuthor(): Author<'ordinary'> {
  return {
    ...capabilities,
    kind: 'ordinary',
    executor: { execute: () => Promise.resolve({ count: 1 }) },
    renderer: { render: value => succeed(JSON.stringify(value)) },
    program: { kind: 'none' },
  }
}

export function structuredAuthor(): Author<'structured'> {
  return {
    ...capabilities,
    kind: 'structured',
    executor: { execute: () => Promise.resolve(result([text('t', 'done')])) },
    program: { kind: 'none' },
  }
}
