import { createParameterJudge } from '@omne-harness-lite/tool-definition'
import { validateCodec } from '@omne-harness-lite/image-codec'
import { filesDefinition } from './definition.ts'
import { filesExecutor } from './executor.ts'
import type { FilesOptions, FilesSupport, FilesTool } from './types.ts'
export { FILES_CONTEXT_KEY } from './types.ts'
export type { FilesInitialContext, FilesOptions, FilesSupport, FilesTool } from './types.ts'
export function createFilesTool(options: FilesOptions, support: FilesSupport): FilesTool {
  const limits = [
    options.maxReadBytes,
    options.maxWriteBytes,
    options.maxImageBytes,
    options.maxPageEntries,
    options.maxPatchFiles,
    options.maxEditsPerFile,
    options.maxImagePixels,
    options.maxImageDimension,
    options.maxDiffChars,
    options.diffTimeoutMs,
    options.diffMaxEditLength,
  ]
  if (
    !limits.every(
      value => Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER / 2,
    )
  )
    throw new TypeError('Explicit positive safe Files limits are required')
  if (!options.attachmentStorage || options.contextKey === '')
    throw new TypeError('Nonempty Files storage and context identifiers are required')
  validateCodec(support.imageCodec)
  const captured = Object.freeze({ ...options })
  const capturedSupport = Object.freeze({ imageCodec: support.imageCodec })
  const parameters = options.parameters ?? createParameterJudge()
  const definition = filesDefinition(captured, parameters)
  return Object.freeze({
    definition,
    executor: filesExecutor(definition, parameters, captured, capturedSupport),
  })
}
