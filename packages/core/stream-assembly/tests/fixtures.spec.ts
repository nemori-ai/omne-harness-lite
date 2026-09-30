import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  isJsonNumber,
  readJsonStrict,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

interface SourceArtifact {
  readonly path: string
  readonly sha256: string
  readonly line: number
  readonly section: string
  readonly kind: string
  readonly source: string
  readonly json: string
}
const root = resolve(import.meta.dirname, '../../../..')
const artifactFile: { artifacts: readonly SourceArtifact[] } = JSON.parse(
  readFileSync(new URL('./fixtures/source-examples.json', import.meta.url), 'utf8'),
)
const frozen: { files: Readonly<Record<string, string>> } = JSON.parse(
  readFileSync(resolve(root, '.meta_harness/design/registry/frozen.json'), 'utf8'),
)
const catalog: {
  contracts: readonly {
    coordinate: { contract_id: string; version: number }
    status: string
    resources: readonly string[]
  }[]
} = JSON.parse(readFileSync(resolve(root, '.meta_harness/design/registry/catalog.json'), 'utf8'))
const adoptedVersions: Readonly<Record<string, number>> = {
  'capability.stream-assembly': 3,
  'data.arrival-events': 2,
  'data.content-blocks': 3,
  'data.call-accounts': 2,
}
const adopted = catalog.contracts.filter(
  entry => adoptedVersions[entry.coordinate.contract_id] === entry.coordinate.version,
)
function object(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

describe('INPUT frozen adoption and language-neutral source artifacts', () => {
  it('INPUT-01 adopts accepted SA3/CB3/AR2/CA2 and all seventeen frozen resources', () => {
    expect(adopted).toHaveLength(4)
    expect(adopted.every(entry => entry.status === 'accepted')).toBe(true)
    expect(adopted.flatMap(entry => entry.resources)).toHaveLength(17)
    for (const entry of adopted) {
      for (const path of entry.resources) {
        const bytes = readFileSync(resolve(root, '.meta_harness/design', path))
        expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(frozen.files[path])
      }
    }
  })
  it('INPUT-02 consumes exact dependency Schema copies and creates no assembly Schema', () => {
    // call-accounts 包根已是 CA4；本节点仍采用 CA2，比对其公开 `./schema/v2` 原字节。
    for (const [name, file, version] of [
      ['arrival-events', 'arrival-events.schema.json', 2],
      ['content-blocks', 'content-blocks.schema.json', 3],
      ['call-accounts', 'v2/call-accounts.schema.json', 2],
    ] as const) {
      expect(
        readFileSync(resolve(root, `packages/core/${name}/schema/${file}`)).equals(
          readFileSync(
            resolve(root, `.meta_harness/design/spec/data/${name}/v${version}/${name}.schema.json`),
          ),
        ),
        name,
      ).toBe(true)
    }
    const manifest: { exports: Record<string, unknown> } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    expect(Object.keys(manifest.exports)).toEqual(['.'])
  })
  it('INPUT-04 retains exact old resources and compiles every definition in the fixed dependency graph', () => {
    const paths = [
      ['arrival-events', 'arrival-events.schema.json', 2],
      ['call-accounts', 'v2/call-accounts.schema.json', 2],
      ['content-blocks', 'content-blocks.schema.json', 3],
      ['content-blocks', 'content-blocks.v2.schema.json', 2],
      ['loop-extension', 'loop-extension.v2.schema.json', 2],
      ['identity-values', 'identity-values.schema.json', 1],
      ['offer-expiry', 'offer-expiry.v1.schema.json', 1],
      ['asset-model', 'asset-model.v2.schema.json', 2],
      ['tool-definition', 'tool-definition.v2.schema.json', 2],
      ['messages', 'messages.v2.schema.json', 2],
      ['model-profile', 'v2/model-profile.schema.json', 2],
      ['skill-package', 'skill-package.v2.schema.json', 2],
      ['mcp-endpoint', 'mcp-endpoint.schema.json', 2],
      ['slash-command', 'slash-command.schema.json', 2],
      ['connector', 'connector.schema.json', 2],
    ] as const
    const resources = paths.map(([name, filename, version]) => {
      const bytes = readFileSync(
        resolve(
          root,
          name === 'connector'
            ? `packages/core/asset-model/schema/resources/${filename}`
            : `packages/core/${name}/schema/${filename}`,
        ),
      )
      const path = `spec/data/${name}/v${version}/${name}.schema.json`
      expect(bytes.equals(readFileSync(resolve(root, `.meta_harness/design/${path}`))), path).toBe(
        true,
      )
      expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(frozen.files[path])
      const parsed = readJsonStrict(bytes.toString('utf8'))
      if ('failed' in parsed || !object(parsed.ok))
        throw new Error(`invalid frozen resource: ${path}`)
      return parsed.ok
    })
    const runtime = createSchemaRuntime(resources)
    for (const resource of resources) {
      if (
        typeof resource.$id !== 'string' ||
        resource.$defs === undefined ||
        !object(resource.$defs)
      )
        throw new Error('frozen resource missing identity/definitions')
      for (const name of Object.keys(resource.$defs))
        expect(() => runtime.compile({ $ref: `${resource.$id}#/$defs/${name}` })).not.toThrow()
    }
  })
  it.each(artifactFile.artifacts)(
    'INPUT-03 exact source location $path:$line ($kind)',
    artifact => {
      const bytes = readFileSync(resolve(root, artifact.path))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256)
      const lines = bytes.toString('utf8').split('\n')
      const sourceStart = artifact.kind === 'json-block' ? artifact.line : artifact.line - 1
      expect(lines.slice(sourceStart).join('\n')).toContain(artifact.source)
      expect(() => JSON.parse(artifact.json)).not.toThrow()
    },
  )
})
