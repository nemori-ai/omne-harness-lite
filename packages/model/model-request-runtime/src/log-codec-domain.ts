import { modelLogFormat } from './log-codec-key.ts'

/** The only writable and readable model-log generation in this runtime. */
export const currentCodecDomain = Object.freeze({
  writeFormat: modelLogFormat,
  readFormats: Object.freeze([modelLogFormat]),
})
export type ModelLogCodecDomain = typeof currentCodecDomain
