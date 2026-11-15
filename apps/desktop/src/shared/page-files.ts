import { CONTENT_SECURITY_POLICY } from './page-policy.ts'

export const PAGE_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

const UNKNOWN_TYPE = 'application/octet-stream'

export type PageBytes = Uint8Array<ArrayBuffer>

export type PageFileReader = (segments: readonly string[]) => Promise<PageBytes | undefined>

export type PageAnswer =
  | {
      readonly status: 200
      readonly headers: Readonly<Record<string, string>>
      readonly body: PageBytes
    }
  | { readonly status: 404 }

const NOT_FOUND: PageAnswer = { status: 404 }

function decoded(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  } catch {
    return undefined
  }
}

export function pageSegments(pathname: string): readonly string[] | undefined {
  const path = decoded(pathname)
  if (path === undefined || /[\\\0]/.test(path)) return undefined
  const segments: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part !== '..') segments.push(part)
    else if (segments.pop() === undefined) return undefined
  }
  return segments.length === 0 ? undefined : segments
}

export function pageType(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? PAGE_TYPES[name.slice(dot)] : undefined) ?? UNKNOWN_TYPE
}

export function pageHeaders(type: string): Readonly<Record<string, string>> {
  return {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'content-security-policy': CONTENT_SECURITY_POLICY } : {}),
  }
}

export async function answerPageFile(pathname: string, read: PageFileReader): Promise<PageAnswer> {
  const segments = pageSegments(pathname)
  if (segments === undefined) return NOT_FOUND
  const body = await read(segments)
  if (body === undefined) return NOT_FOUND
  return { status: 200, headers: pageHeaders(pageType(segments.at(-1)!)), body }
}
