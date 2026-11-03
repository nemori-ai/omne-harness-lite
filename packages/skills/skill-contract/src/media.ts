// Media type inference and the text or binary class of an entry.
import type { Bytes, MediaType, PackagePath } from './values.ts'

const BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  Object.entries({
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    sh: 'application/x-sh',
    py: 'text/x-python',
    js: 'text/javascript',
    mjs: 'text/javascript',
    ts: 'text/x-typescript',
    html: 'text/html',
    css: 'text/css',
    csv: 'text/csv',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  }),
)

type Part = Readonly<{ offset: number; bytes: readonly number[] }>
type Signature = Readonly<{ parts: readonly Part[]; type: string }>

const ascii = (text: string): number[] => [...text].map(character => character.charCodeAt(0))
const at = (offset: number, bytes: readonly number[]): Part => ({ offset, bytes })

const SIGNATURES: readonly Signature[] = [
  { parts: [at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], type: 'image/png' },
  { parts: [at(0, [0xff, 0xd8, 0xff])], type: 'image/jpeg' },
  { parts: [at(0, ascii('GIF8'))], type: 'image/gif' },
  { parts: [at(0, ascii('%PDF-'))], type: 'application/pdf' },
  { parts: [at(0, ascii('RIFF')), at(8, ascii('WEBP'))], type: 'image/webp' },
]

const KNOWN: ReadonlySet<string> = new Set([
  ...BY_EXTENSION.values(),
  ...SIGNATURES.map(signature => signature.type),
])

function isMediaType(text: string): text is MediaType {
  return KNOWN.has(text)
}

function extensionOf(path: PackagePath): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase()
}

function sniff(head: Bytes): string | undefined {
  for (const signature of SIGNATURES) {
    const matches = signature.parts.every(part =>
      part.bytes.every((byte, index) => head[part.offset + index] === byte),
    )
    if (matches) return signature.type
  }
  return undefined
}

/**
 * Infers the media type from the extension of the path, case-insensitive. When the extension is
 * not known, it reads the leading bytes for a PNG, JPEG, GIF, PDF or WebP signature. Otherwise the
 * type is absent: an absent type does not mean text.
 */
export function inferMediaType(path: PackagePath, head: Bytes): MediaType | undefined {
  const extension = extensionOf(path)
  const type = (extension === undefined ? undefined : BY_EXTENSION.get(extension)) ?? sniff(head)
  return type !== undefined && isMediaType(type) ? type : undefined
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Text is strict UTF-8 without a NUL character. Everything else is binary. */
export function encodingOf(bytes: Bytes): 'text' | 'binary' {
  if (bytes.includes(0)) return 'binary'
  try {
    utf8.decode(bytes)
    return 'text'
  } catch (error) {
    if (error instanceof TypeError) return 'binary'
    throw error
  }
}
