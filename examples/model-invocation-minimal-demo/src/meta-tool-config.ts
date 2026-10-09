import sharp from 'sharp'
import { createShellTool } from '@omne-harness-lite/meta-shell'
import { createFilesTool } from '@omne-harness-lite/meta-files'
import { createSharpImageCodec } from '@omne-harness-lite/pi-ai-transport'

export const DEMO_HOST_PROVIDER = 'demo-host'
export const DEMO_RESULT_STORAGE = 'demo-results'
export const shellConfig = Object.freeze({
  asset: 'demo-shell-asset',
  version: '1',
  shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
  maxOutputBytes: 64 * 1024,
  executePermission: 'auto' as const,
})
export const filesConfig = Object.freeze({
  asset: 'demo-files-asset',
  version: '1',
  attachmentStorage: DEMO_RESULT_STORAGE,
  maxReadBytes: 1024 * 1024,
  maxWriteBytes: 4 * 1024 * 1024,
  maxImageBytes: 4 * 1024 * 1024,
  maxPageEntries: 1000,
  maxPatchFiles: 32,
  maxEditsPerFile: 128,
  maxImagePixels: 16 * 1024 * 1024,
  maxImageDimension: 8192,
  maxDiffChars: 64 * 1024,
  diffTimeoutMs: 1000,
  diffMaxEditLength: 100000,
  executePermission: 'auto' as const,
})
// The same public factories own the published definitions and the Cordis executors.
export const META_TOOL_DEFINITIONS = [
  { asset: shellConfig.asset, definition: createShellTool(shellConfig).definition },
  {
    asset: filesConfig.asset,
    definition: createFilesTool(filesConfig, {
      imageCodec: createSharpImageCodec(sharp),
    }).definition,
  },
] as const
