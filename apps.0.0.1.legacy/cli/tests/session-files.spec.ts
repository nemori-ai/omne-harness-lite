import { expect, test } from 'vitest'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import { createSessionFiles, sessionFilesAsset } from '../src/session-files.ts'
import { officialSessionAsset, officialSessionManifest } from '../src/session-factory-assets.ts'
import { readOpaqueJson } from '@omne-harness-lite/content-blocks'

test('official Files uses the shared parameter owner and names the existing result storage', () => {
  const evaluator = createAssetEvaluator()
  const files = createSessionFiles(evaluator.parameters)
  expect(files.definition.name).toBe('Files')
  expect(files.definition.needs?.attachmentStorage).toBe('cli-tool-results')
  expect(files.definition.permissions.execute.default).toBe('auto')
  expect(Object.keys(files.definition.commands)).toEqual([
    'help',
    'read',
    'open',
    'write',
    'edit',
    'patch',
    'list',
    'find',
    'info',
    'move',
    'copy',
    'delete',
    'mkdir',
  ])
  expect(files.definition).toEqual(sessionFilesAsset.versions[0]!.content.definition)
})

test('new official release adds Files without changing the persistent Context seed', () => {
  const prior = officialSessionAsset.versions.find(version => version.number === 3)!
  const latest = officialSessionAsset.versions.at(-1)!
  expect(latest.number).toBe(4)
  const oldBody = readOpaqueJson(prior.content.body)
  const body = readOpaqueJson(latest.content.body)
  expect(body).toMatchObject({
    references: expect.arrayContaining([{ capability: sessionFilesAsset.capability }]),
  })
  expect(body).toHaveProperty(
    'contextSessionSeed',
    Reflect.get(Object(oldBody), 'contextSessionSeed'),
  )
  expect(officialSessionManifest([])).toContainEqual({
    capability: sessionFilesAsset.capability,
    meta: false,
  })
})
