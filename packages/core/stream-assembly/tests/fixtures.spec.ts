import { assertContentSchemaTransition } from '../../content-blocks/tests/schema-transition.ts'
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
// Fixed adopted expectations are independent of tested resources.
const schemaDigests: Readonly<Record<string, string>> = {
  'packages/core/arrival-events/schema/arrival-events.schema.json':
    'bcaac3fc5c9d7a0a223f68722164956507bf978e62bc1423d56cc9c4810b74c5',
  'packages/core/call-accounts/schema/v2/call-accounts.schema.json':
    'c79cbf51ada9314d83f8bd5fcb5a10b2ebbf855a59bddbe68bb3fdfeffc19511',
  'packages/core/content-blocks/schema/content-blocks.schema.json':
    '809d2a5db29db6a91096535017cc9bf4e7f75a3b93469520173e82916fff1bb5',
  'packages/core/content-blocks/schema/content-blocks.v2.schema.json':
    'ed9c7d15f35edfd1b24cef510367449a3a8ed5eefd5305464709220304ee6b21',
  'packages/core/loop-extension/schema/loop-extension.v2.schema.json':
    '41ebe3501a30fe124b7226c055b5ff294cca399ad5f0179c6754b10160c8a0fe',
  'packages/core/identity-values/schema/identity-values.schema.json':
    '1d1f5743c28de3400ecd332072549b6540ca602e553708491caa468267c6a855',
  'packages/core/offer-expiry/schema/offer-expiry.v1.schema.json':
    '63a8ccb42ea5f84a8062c9e8a472679c0d7ff11401c43939641587b48e2b0684',
  'packages/core/asset-model/schema/asset-model.v2.schema.json':
    '3b4a9302a51f902f89f6bb567f2b91b0533f323d8f315853e35ac15a679f5890',
  'packages/core/tool-definition/schema/tool-definition.v2.schema.json':
    '21f6ff19640da3905b4697404b8d7c527a4f0a6ec4c870b3f0affdc558c469ae',
  'packages/core/messages/schema/messages.v2.schema.json':
    '5069484d45c7a2d9165c1201307e9b4241acf8eceae20e749b5c24f377b0d65f',
  'packages/core/model-profile/schema/v2/model-profile.schema.json':
    '3a2088c59777b9520af8355bb3b4e794637f4642fdbf8a93b268366717de8b3b',
  'packages/core/skill-package/schema/skill-package.v2.schema.json':
    'eb2b30c03023e02584d0bfec54f1905751c4049b41e16ae3744c8b9606cbd4e5',
  'packages/core/mcp-endpoint/schema/mcp-endpoint.schema.json':
    '4fcddf8b9e2a870be8d47ac0abf3fc835ad330f4bd0afd2d6cfe866796df2c13',
  'packages/core/slash-command/schema/slash-command.schema.json':
    '595e5662cf7ebd5d84c5ba3edee7b4dd8a6e817a4738343bfa86c318cc1ac40e',
  'packages/core/asset-model/schema/resources/connector.schema.json':
    'd02af56071f37786229142a73e93194529b7e3dad3b5a70c1a69e0fe44196d5d',
}
const modelDigests: Readonly<Record<string, string>> = {
  'packages/core/stream-assembly/verification/models/Assembly_OneShotCloseFirst.cfg':
    '2680ba91e3be8ae86e88549711c61db6a869e832df17719f4c2230096cd25986',
  'packages/core/stream-assembly/verification/models/Assembly_ReplaceAsAppend.cfg':
    '7e5e1c6d71c1a82c1d8eeb04835120bb4a507cc2534224edfaee3ff066b5d231',
  'packages/core/stream-assembly/verification/models/Assembly.cfg':
    '5b7f84cb8333ba5da5a00b4e672964c3a2029de8b2358017fb65c3acffb797db',
  'packages/core/stream-assembly/verification/models/Assembly_OrderByClose.cfg':
    '7a437b7519163339880eae4473e8afd56272f58bbea4c9ca6ad3320b1acbbbe3',
  'packages/core/stream-assembly/verification/models/Assembly.tla':
    '5caf855ec1b73f7c49b3afa38b784f0aee4cbe128314cb28afc19436a1b000c6',
}
const priorContentDigest = '809d2a5db29db6a91096535017cc9bf4e7f75a3b93469520173e82916fff1bb5'
function object(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

describe('INPUT adopted resources and language-neutral source artifacts', () => {
  it('INPUT-01 preserves the adopted model and independent normative inputs', () => {
    expect(Object.keys(modelDigests)).toHaveLength(5)
    for (const [path, digest] of Object.entries(modelDigests)) {
      expect(
        createHash('sha256')
          .update(readFileSync(resolve(root, path)))
          .digest('hex'),
        path,
      ).toBe(digest)
    }
    const prior = readFileSync(
      resolve(
        root,
        'packages/core/content-blocks/tests/fixtures/content-before-admission.schema.json',
      ),
    )
    expect(createHash('sha256').update(prior).digest('hex')).toBe(priorContentDigest)
    expect(new Set(artifactFile.artifacts.map(item => item.path)).size).toBe(2)
  })
  it('INPUT-02 consumes unchanged dependency schemas and the adopted CB delta and creates no assembly Schema', () => {
    // call-accounts 包根已是 CA4；本节点仍采用 CA2，比对其公开 `./schema/v2` 原字节。
    for (const [name, file, version] of [
      ['arrival-events', 'arrival-events.schema.json', 2],
      ['content-blocks', 'content-blocks.schema.json', 3],
      ['call-accounts', 'v2/call-accounts.schema.json', 2],
    ] as const) {
      const current = readFileSync(resolve(root, `packages/core/${name}/schema/${file}`))
      const path = `packages/core/${name}/schema/${file}`
      if (name === 'content-blocks') {
        const previous = readFileSync(
          resolve(
            root,
            'packages/core/content-blocks/tests/fixtures/content-before-admission.schema.json',
          ),
        )
        expect(createHash('sha256').update(previous).digest('hex')).toBe(priorContentDigest)
        assertContentSchemaTransition(current, previous)
      } else
        expect(createHash('sha256').update(current).digest('hex'), path).toBe(schemaDigests[path])
    }
    const manifest: { exports: Record<string, unknown> } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    expect(Object.keys(manifest.exports)).toEqual(['.'])
  })
  // 归慢层：重 CPU：真实编译固定 Schema 依赖图里的每一个定义。
  it(
    'INPUT-04 retains exact adopted resources and compiles every definition in the fixed dependency graph',
    { tags: ['slow'] },
    () => {
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
        const path =
          name === 'connector'
            ? `packages/core/asset-model/schema/resources/${filename}`
            : `packages/core/${name}/schema/${filename}`
        if (name === 'content-blocks' && version === 3) {
          const previous = readFileSync(
            resolve(
              root,
              'packages/core/content-blocks/tests/fixtures/content-before-admission.schema.json',
            ),
          )
          expect(createHash('sha256').update(previous).digest('hex')).toBe(priorContentDigest)
          assertContentSchemaTransition(bytes, previous)
        } else
          expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(schemaDigests[path])
        const parsed = readJsonStrict(bytes.toString('utf8'))
        if ('failed' in parsed || !object(parsed.ok))
          throw new Error(`invalid adopted resource: ${path}`)
        return parsed.ok
      })
      const runtime = createSchemaRuntime(resources)
      for (const resource of resources) {
        if (
          typeof resource.$id !== 'string' ||
          resource.$defs === undefined ||
          !object(resource.$defs)
        )
          throw new Error('adopted resource missing identity/definitions')
        for (const name of Object.keys(resource.$defs))
          expect(() => runtime.compile({ $ref: `${resource.$id}#/$defs/${name}` })).not.toThrow()
      }
    },
  )
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
