import { readFileSync } from 'node:fs'
import type {
  ActionName,
  DefinitionDigest,
  EndpointName,
  EndpointRef,
  KnownAction,
} from '@omne-harness/mcp-contract'
import { endpointRefOf, jsonOf } from '@omne-harness/mcp-contract/testing'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import type { BridgeShape } from '../src/index.ts'

export const shape: BridgeShape = {
  resultContract: describedAdoption({ owner: 'bridge-tests', name: 'tool-result', revision: '1' }),
}

export const ref: (name: string, holding?: string) => EndpointRef = endpointRefOf

export function action(
  name: string,
  facts: Readonly<{
    description?: string
    title?: string
    inputSchema?: unknown
    revision?: string
    unavailable?: 'connection-unavailable' | 'authorization-required' | 'credential-unavailable'
  }> = {},
): KnownAction {
  const inputSchema =
    'inputSchema' in facts
      ? facts.inputSchema
      : { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  return {
    name: name as ActionName,
    lastLawful: {
      name: name as ActionName,
      definition: jsonOf({
        name,
        ...(facts.title === undefined ? {} : { title: facts.title }),
        ...(facts.description === undefined ? {} : { description: facts.description }),
        inputSchema,
      }),
    },
    definitionDigest: `sha256:${name}:${facts.revision ?? '1'}` as DefinitionDigest,
    availability:
      facts.unavailable === undefined
        ? { kind: 'available' }
        : { kind: 'unavailable', reason: facts.unavailable },
  }
}

export type RealCatalog = Readonly<{ name: EndpointName; actions: readonly KnownAction[] }>

export function realCatalog(name: 'context7' | 'deepwiki' | 'mslearn'): RealCatalog {
  const text = readFileSync(new URL(`./fixtures/catalog-${name}.json`, import.meta.url), 'utf8')
  return JSON.parse(text) as RealCatalog
}
