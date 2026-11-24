import { describe, expect, it } from 'vitest'
import { evaluateSettings } from '@omne-harness/settings'
import {
  outsideFilesOf,
  workspaceOutsideFilesItems,
  workspaceOutsideFilesSettings,
} from '../src/index.ts'

const read = (values: readonly { itemId: string; value: unknown }[]) => ({
  views: [
    {
      definition: workspaceOutsideFilesSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values: values.map(({ itemId, value }) => ({
              itemId,
              value: { kind: 'value', value },
              locked: false,
            })),
          },
        ],
      },
    },
  ],
})

describe('the setting for files outside the workspace', () => {
  it('declares one item with three values, none by default, of the placement and identity kind', () => {
    expect(workspaceOutsideFilesSettings).toMatchObject({
      providerId: 'workspace',
      definitionId: 'outside-files',
      version: '1',
    })
    const [item, ...rest] = workspaceOutsideFilesSettings.items
    expect(rest).toEqual([])
    expect(item).toMatchObject({
      id: workspaceOutsideFilesItems.access,
      category: 'placement-identity',
      valueSchema: { type: 'string', enum: ['none', 'read', 'read-write'] },
      default: { kind: 'value', value: 'none' },
      merge: 'override',
      sensitivity: 'ordinary',
      presentation: { adoption: 'next-read' },
    })
    expect(item?.presentation.enumLabels?.map(label => label.value)).toEqual([
      'none',
      'read',
      'read-write',
    ])
    expect(
      evaluateSettings({ definition: workspaceOutsideFilesSettings, sources: [] }),
    ).toMatchObject({ kind: 'complete' })
  })

  it('does not claim to isolate or guarantee anything in what a person reads', () => {
    const words = JSON.stringify(workspaceOutsideFilesSettings)
    for (const claim of ['隔离', '保证', 'isolat', 'guarantee']) expect(words).not.toContain(claim)
  })

  it('reads the value a tenant set, the default when none is set, and nothing from a read it cannot use', () => {
    for (const value of ['none', 'read', 'read-write'] as const)
      expect(outsideFilesOf(read([{ itemId: workspaceOutsideFilesItems.access, value }]))).toBe(
        value,
      )
    expect(outsideFilesOf(read([]))).toBe('none')
    expect(outsideFilesOf(null)).toBeNull()
    expect(outsideFilesOf({ views: [] })).toBeNull()
    expect(outsideFilesOf({ views: [{ definition: workspaceOutsideFilesSettings }] })).toBeNull()
    expect(
      outsideFilesOf(read([{ itemId: workspaceOutsideFilesItems.access, value: 'all' }])),
    ).toBeNull()
  })
})
