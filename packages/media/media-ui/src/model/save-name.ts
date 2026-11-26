const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
}

/** The name a retrieved file is kept under: the one it was uploaded with, or 「附件」 and what its type implies. */
export function saveName(name: string | undefined, mediaType: string): string {
  if (name !== undefined) return name
  const subtype = mediaType.slice(mediaType.indexOf('/') + 1)
  return `附件.${EXTENSIONS[mediaType] ?? subtype}`
}
