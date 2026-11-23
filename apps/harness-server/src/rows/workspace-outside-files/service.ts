import { Service, type Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { OutsideFiles } from '@omne-harness/workspace-local'

export const workspaceOutsideFilesKey = 'workspaceOutsideFiles'

/** How far outside its workspace a session of this tenant may go, as Runtime Context supplies it now. */
export class WorkspaceOutsideFilesService extends Service {
  readonly read: (tenant: TenantId) => Promise<Outcome<OutsideFiles, string>>
  constructor(ctx: Context, read: WorkspaceOutsideFilesService['read']) {
    super(ctx, workspaceOutsideFilesKey)
    this.read = read
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceOutsideFiles: WorkspaceOutsideFilesService
  }
}
