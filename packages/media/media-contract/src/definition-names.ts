import { modalityOf } from './sniff.ts'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MODALITIES: ReadonlySet<string> = new Set(['image', 'voice', 'file'])

/** A converter definition is named by a modality, or by a media type written as an asset name. */
export function isDefinitionName(name: string): boolean {
  if (MODALITIES.has(name)) return true
  return name.length <= 64 && name.includes('-') && NAME.test(name)
}

/** The names to evaluate for a medium, the type's own before its modality's. */
export function definitionNamesOf(mediaType: string): readonly string[] {
  const type = mediaType.toLowerCase()
  const named = type.replace(/[/+.]/gu, '-')
  const modality = modalityOf(type)
  return isDefinitionName(named) && !MODALITIES.has(named) ? [named, modality] : [modality]
}
