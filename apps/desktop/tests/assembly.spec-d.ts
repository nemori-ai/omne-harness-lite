import { expectTypeOf, it } from 'vitest'
import { assetGovernanceKey, assetsCategoryPage } from '@omne-harness/assets-ui/cordis'
import { canvasElement, canvasIntake, canvasPicker } from '@omne-harness/canvas-ui/cordis'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import { modelChoicesKey } from '@omne-harness/model-ui/cordis'
import { createMediaUiModule, mediaPictureIntakeKey } from '@omne-harness/media-ui/cordis'
import {
  createSessionUiModule,
  sessionComposerIntakeKey,
  sessionReadsSourceKey,
} from '@omne-harness/session-ui/cordis'
import { serviceKey } from '@omne-harness/shell-contract'
import { workspaceChoicesKey } from '@omne-harness/workspace-ui/cordis'

it('the asset governance key fits the port MCP declares', () => {
  expectTypeOf(createMcpUiModule).toBeCallableWith({
    page: assetsCategoryPage,
    governance: assetGovernanceKey,
  })
})

it('a key for a port of another shape does not compile at the assembly', () => {
  const counted = serviceKey<{
    open: (tenantText: string, category: string) => { getSnapshot: () => number }
  }>('counted')
  // @ts-expect-error the snapshot is not what MCP reads
  createMcpUiModule({ page: assetsCategoryPage, governance: counted })
  const byTenantId = serviceKey<{
    open: (tenant: { organization: string }, category: string) => unknown
  }>('by-tenant-id')
  // @ts-expect-error the port is opened by tenant text, not by a tenant object
  createMcpUiModule({ page: assetsCategoryPage, governance: byTenantId })
})

it('the list Model gives fits what the session interface takes for one', () => {
  expectTypeOf(createSessionUiModule).toBeCallableWith({ modelChoices: modelChoicesKey })
})

it('a list of another shape does not compile at the assembly', () => {
  const byNumber = serviceKey<{ list: (tenant: number) => Promise<never> }>('by.number')
  // @ts-expect-error the session interface asks for the list by tenant text
  createSessionUiModule({ modelChoices: byNumber })
  const names = serviceKey<{ list: (tenant: string) => Promise<readonly string[]> }>('by.names')
  // @ts-expect-error a list of names is not a listing that says whether each can be picked
  createSessionUiModule({ modelChoices: names })
})

it('the list Workspace gives fits what the session interface takes for one', () => {
  expectTypeOf(createSessionUiModule).toBeCallableWith({ workspaceChoices: workspaceChoicesKey })
  // @ts-expect-error a list of models is not a list of workspaces
  createSessionUiModule({ workspaceChoices: modelChoicesKey })
})

it('the reads the diagnostics give fit what the session interface takes, and what the session gives fits the drafts media takes', () => {
  expectTypeOf(createSessionUiModule).toBeCallableWith({ blockReads: sessionReadsSourceKey })
  expectTypeOf(createMediaUiModule).toBeCallableWith({ drafts: sessionComposerIntakeKey })
  // @ts-expect-error a list of models is not what takes the attachments of a draft
  createMediaUiModule({ drafts: modelChoicesKey })
})

it('the points the canvas declares fit the drawings media puts on them', () => {
  expectTypeOf(createMediaUiModule).toBeCallableWith({ canvasElement, canvasIntake })
  // @ts-expect-error the drawing of a thing on the canvas is not how files are taken in
  createMediaUiModule({ canvasIntake: canvasElement })
})

it('the canvas points fit what the session interface draws and picks by, and not the other way round', () => {
  expectTypeOf(createSessionUiModule).toBeCallableWith({ canvasElement, canvasPicker })
  // @ts-expect-error the picker is not given the frame and the reference a drawing on the paper reads
  createSessionUiModule({ canvasElement: canvasPicker })
  // @ts-expect-error what is handed in for files is not what the search gives a picker
  createSessionUiModule({ canvasPicker: canvasIntake })
})

it('the picture intake media provides fits what the session interface takes for one', () => {
  expectTypeOf(createSessionUiModule).toBeCallableWith({ pictureIntake: mediaPictureIntakeKey })
  // @ts-expect-error the drafts the session takes in are not what turns bytes into attachments
  createSessionUiModule({ pictureIntake: sessionComposerIntakeKey })
  const byBlob = serviceKey<{
    take: (tenant: string, pictures: readonly { name: string; bytes: Blob }[]) => Promise<never>
  }>('by.blob')
  // @ts-expect-error the session hands pictures as bytes, not as blobs
  createSessionUiModule({ pictureIntake: byBlob })
})
