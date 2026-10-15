import { readJsonText, type JsonLimits, type JsonRead } from '@omne-harness/json-text'

export function readBodyText(text: string, limits: JsonLimits): JsonRead {
  return readJsonText(text, limits)
}
