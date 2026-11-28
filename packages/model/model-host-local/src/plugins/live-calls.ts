import type { Context } from '@deepseek-ai/cordis'
import type { ModelLiveCalls } from '@omne-harness/model-contract'
import { ModelLiveCallsService } from '@omne-harness/model-cordis-contract/cordis'

/** Serves the three entries of the live calls this process holds; they leave with the runtime. */
export function serveModelLiveCalls<P>(
  ctx: Context,
  port: ModelLiveCalls<P>,
): ModelLiveCallsService<P> {
  class PortLiveCalls extends ModelLiveCallsService<P> {
    readonly command: ModelLiveCalls<P>['command']
    readonly end: ModelLiveCalls<P>['end']
    readonly media: ModelLiveCalls<P>['media']

    constructor() {
      super(ctx)
      this.command = input => port.command(input)
      this.end = input => port.end(input)
      this.media = input => port.media(input)
    }
  }
  return new PortLiveCalls()
}
