import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { CommandOutput, ProcessHandle } from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import type { TextBlock } from '@omne-harness-lite/content-blocks'
import type { ShellOutput } from './types.ts'

/** One bounded human block for the complete call. The original process remains its own owner. */
function userOutput(dependencies: InvocationDependencies) {
  const id = unwrap(parseOpaqueIdentifier('shell-output', 'BlockId'))
  const visibility = { toHuman: true, toModel: false } as const
  let opened = false,
    disabled = false,
    dropped = 0
  const fragments: string[] = []
  return {
    append(text: string) {
      if (!text) return
      fragments.push(text)
      if (disabled) return
      if (!opened) {
        const result = dependencies.frames.emit({
          t: 'open',
          index: 0,
          id,
          kind: 'text',
          fill: 'append',
          visibility,
        })
        if (result.kind !== 'accepted') {
          dropped++
          disabled = true
          return
        }
        opened = true
      }
      if (dependencies.frames.emit({ t: 'fill', index: 0, payload: text }).kind !== 'accepted')
        dropped++
    },
    close() {
      if (!opened) return dropped
      const block: TextBlock & { readonly visibility: typeof visibility } = {
        id,
        visibility,
        kind: 'text',
        text: fragments.join(''),
      }
      if (dependencies.frames.emit({ t: 'close', index: 0, block }).kind !== 'accepted') dropped++
      return dropped
    },
  }
}
export async function collectOutput(
  process: ProcessHandle,
  dependencies: InvocationDependencies,
  maxBytes: number,
): Promise<ShellOutput> {
  const user = userOutput(dependencies)
  const streams = new Map<
    CommandOutput['stream'],
    { decoder: InstanceType<typeof TextDecoder>; fragments: string[] }
  >()
  let retainedBytes = 0,
    toolDiscardedBytes = 0
  for await (const part of process.output) {
    const keep = Math.min(part.data.byteLength, maxBytes - retainedBytes)
    toolDiscardedBytes += part.data.byteLength - keep
    retainedBytes += keep
    if (keep === 0) continue
    let stream = streams.get(part.stream)
    if (!stream) {
      stream = { decoder: new TextDecoder(), fragments: [] }
      streams.set(part.stream, stream)
    }
    const text = stream.decoder.decode(part.data.subarray(0, keep), { stream: true })
    stream.fragments.push(text)
    user.append(text)
  }
  for (const stream of streams.values()) {
    const text = stream.decoder.decode()
    stream.fragments.push(text)
    user.append(text)
  }
  return {
    streams: [...streams].map(([stream, value]) => ({ stream, text: value.fragments.join('') })),
    retainedBytes,
    toolDiscardedBytes,
    droppedFrames: user.close(),
  }
}
