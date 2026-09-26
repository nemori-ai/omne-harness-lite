import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
const adoptedIds = [
  'capability.stream-assembly',
  'data.arrival-events',
  'data.content-blocks',
  'data.call-accounts',
]
const adopted = catalog.contracts.filter(entry => adoptedIds.includes(entry.coordinate.contract_id))

describe('INPUT frozen adoption and language-neutral source artifacts', () => {
  it('INPUT-01 adopts exactly the four accepted v2 coordinates and seventeen frozen resources', () => {
    expect(adopted).toHaveLength(4)
    expect(
      adopted.every(entry => entry.status === 'accepted' && entry.coordinate.version === 2),
    ).toBe(true)
    expect(adopted.flatMap(entry => entry.resources)).toHaveLength(17)
    for (const entry of adopted) {
      for (const path of entry.resources) {
        const bytes = readFileSync(resolve(root, '.meta_harness/design', path))
        expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(frozen.files[path])
      }
    }
  })
  it('INPUT-02 consumes exact dependency Schema copies and creates no assembly Schema', () => {
    for (const name of ['arrival-events', 'content-blocks', 'call-accounts']) {
      expect(
        readFileSync(resolve(root, `packages/core/${name}/schema/${name}.schema.json`)).equals(
          readFileSync(
            resolve(root, `.meta_harness/design/spec/data/${name}/v2/${name}.schema.json`),
          ),
        ),
      ).toBe(true)
    }
    const manifest: { exports: Record<string, unknown> } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    expect(Object.keys(manifest.exports)).toEqual(['.'])
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
