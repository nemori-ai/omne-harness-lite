import { createHash } from 'node:crypto'
import type { TextContentBlock } from '@omne-harness/content-block'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import type { MaterialBytes } from './material-codec.ts'

export function encodeTextBody(frames: readonly TextContentBlock[]): MaterialBytes {
  const bytes = new TextEncoder().encode(frames.map(frame => frame.text).join(''))
  return {
    bytes,
    codec: describedAdoption({
      owner: '@omne-harness/tool',
      name: 'tool-model-text-utf8-v1',
      revision: '1',
    }),
    fingerprint: {
      algorithm: 'sha256',
      digest: createHash('sha256').update(bytes).digest('hex'),
      bytes: String(bytes.byteLength),
    },
  }
}
