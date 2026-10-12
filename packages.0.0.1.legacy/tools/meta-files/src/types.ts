import type { LoadedImageCodec } from '@omne-harness-lite/image-codec'
import type { MultiCommandTool, ParameterJudge } from '@omne-harness-lite/tool-definition'
import type { ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'

export const FILES_CONTEXT_KEY = 'files.initial'
export interface FilesInitialContext {
  readonly cwd: string
}
/** Trusted construction policies. None comes from untrusted call arguments. */
export interface FilesOptions {
  readonly attachmentStorage: string
  readonly maxReadBytes: number
  readonly maxWriteBytes: number
  readonly maxImageBytes: number
  readonly maxPageEntries: number
  readonly maxPatchFiles: number
  readonly maxEditsPerFile: number
  readonly maxImagePixels: number
  readonly maxImageDimension: number
  readonly maxDiffChars: number
  readonly diffTimeoutMs: number
  readonly diffMaxEditLength: number
  readonly contextKey?: string
  readonly executePermission?: 'forbid' | 'auto' | 'ask'
  readonly parameters?: ParameterJudge
}
export interface FilesSupport {
  readonly imageCodec: LoadedImageCodec
}
export interface FilesTool {
  readonly definition: MultiCommandTool
  readonly executor: ToolExecutor
}
