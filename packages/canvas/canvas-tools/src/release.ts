import type { ToolReleaseDescriber } from '@omne-harness/tool-contract'
import type { CanvasArguments } from './protocol.ts'

/** What one lock or unlock would do, for the person who releases it when the gate asks. */
export const describeLocking: ToolReleaseDescriber<CanvasArguments> = async ({
  arguments: args,
}) => {
  if (args.command !== 'lock' && args.command !== 'unlock')
    throw new TypeError('only lock and unlock are described')
  return {
    rows: [
      { label: '要做的', value: args.command === 'lock' ? '锁上' : '解开' },
      { label: '画布项', value: args.params.items },
    ],
  }
}
