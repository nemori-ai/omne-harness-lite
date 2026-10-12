import { sessionImageCodec } from './session-image-codec.ts'
import { createFilesTool } from '@omne-harness-lite/meta-files'
import { createParameterJudge, type ParameterJudge } from '@omne-harness-lite/tool-definition'

export function createSessionFiles(parameters: ParameterJudge) {
  return createFilesTool(
    {
      parameters,
      attachmentStorage: 'cli-tool-results',
      executePermission: 'auto',
      maxReadBytes: 65_536,
      maxWriteBytes: 1_048_576,
      maxImageBytes: 524_288,
      maxPageEntries: 200,
      maxPatchFiles: 32,
      maxEditsPerFile: 128,
      maxImagePixels: 40_000_000,
      maxImageDimension: 16_384,
      maxDiffChars: 65_536,
      diffTimeoutMs: 1_000,
      diffMaxEditLength: 100_000,
    },
    { imageCodec: sessionImageCodec },
  )
}

export const sessionFilesAsset = Object.freeze({
  id: 'omne.cli.files',
  capability: { category: 'tool' as const, name: 'Files' },
  origin: 'official' as const,
  versions: [
    {
      number: 1,
      publishedAt: '2026-10-10T14:00:00Z',
      content: {
        category: 'tool' as const,
        definition: createSessionFiles(createParameterJudge()).definition,
      },
    },
  ],
})
