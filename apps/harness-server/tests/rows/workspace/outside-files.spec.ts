import { expect, it } from 'vitest'
import { workspaceOutsideFilesSettings } from '@omne-harness/workspace-local'
import type { TenantIndependentSettingsService } from '../../../src/rows/governance/independent-settings-service.ts'
import { outsideFilesReader } from '../../../src/rows/workspace/outside-files.ts'
import { TENANT_A } from '../storage/fixtures/tree.ts'

const viewOf = (value: unknown) => ({
  views: [
    {
      definition: workspaceOutsideFilesSettings,
      state: {
        sources: [
          {
            id: 'tenant',
            values: [{ itemId: 'access', value: { kind: 'value', value }, locked: false }],
          },
        ],
      },
    },
  ],
})

const service = (read: () => Promise<unknown>) => {
  const asked: unknown[] = []
  const settings = {
    bindingOf: (tenant: string, definition: unknown) => {
      asked.push([tenant, definition])
      return { request: { tenant } }
    },
    read: async () => read(),
  } as unknown as TenantIndependentSettingsService
  return { settings, asked }
}

it('reads the tenant setting for files outside the workspace through its own declaration', async () => {
  const { settings, asked } = service(async () => viewOf('read'))
  expect(await outsideFilesReader(() => settings)(TENANT_A)).toBe('read')
  expect(asked).toEqual([[expect.any(String), workspaceOutsideFilesSettings]])
})

it('cannot read it without the settings service, from a read that fails, or from one it cannot use', async () => {
  expect(await outsideFilesReader(() => undefined)(TENANT_A)).toBeNull()
  const failing = service(async () => {
    throw new Error('storage down')
  })
  expect(await outsideFilesReader(() => failing.settings)(TENANT_A)).toBeNull()
  const unusable = service(async () => ({ views: [] }))
  expect(await outsideFilesReader(() => unusable.settings)(TENANT_A)).toBeNull()
})
