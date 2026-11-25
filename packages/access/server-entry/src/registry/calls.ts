import type { Context } from '@deepseek-ai/cordis'
import type { InProcessAnswer, InProcessCall } from '@omne-harness/access-cordis-contract'
import { AccessCallsService } from '@omne-harness/access-cordis-contract/cordis'

/** @owner packages/access/server-entry */
export class AccessCallsProvider extends AccessCallsService {
  private readonly calls: (input: InProcessCall) => Promise<InProcessAnswer>

  constructor(ctx: Context, calls: (input: InProcessCall) => Promise<InProcessAnswer>) {
    super(ctx)
    this.calls = calls
  }

  override call(input: InProcessCall): Promise<InProcessAnswer> {
    return this.calls(input)
  }
}
