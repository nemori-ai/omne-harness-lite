import { Service, type Context } from '@deepseek-ai/cordis'
import type { CapabilityId } from '@omne-harness/assets'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CatalogEntry } from '@omne-harness/skill-contract'

/** The Skills of a tenant as the work of a session of that tenant sees them: asked at an adoption point, where that work may not exist yet. */
export abstract class SessionSkillsService extends Service {
  static readonly provide = 'sessionSkills'
  constructor(ctx: Context) {
    super(ctx, SessionSkillsService.provide)
  }
  abstract readonly summaries: (
    tenant: TenantId,
    capabilities: readonly CapabilityId[],
  ) => Promise<Outcome<readonly CatalogEntry[], 'unknown'>>
}
export const sessionSkillsKey = SessionSkillsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionSkills: SessionSkillsService
  }
}

class SessionSkillsImpl extends SessionSkillsService {
  readonly summaries: SessionSkillsService['summaries']
  constructor(ctx: Context, summaries: SessionSkillsService['summaries']) {
    super(ctx)
    this.summaries = summaries
  }
}

export function provideSessionSkills(ctx: Context, summaries: SessionSkillsService['summaries']) {
  return new SessionSkillsImpl(ctx, summaries)
}
