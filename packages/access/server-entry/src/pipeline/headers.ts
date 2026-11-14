import type { IncomingMessage } from 'node:http'

export function countHeader(req: IncomingMessage, name: string): number {
  let count = 0
  for (let index = 0; index < req.rawHeaders.length; index += 2)
    if (req.rawHeaders[index]?.toLowerCase() === name) count += 1
  return count
}

export function hostAccepted(req: IncomingMessage, loopback: string): boolean {
  if (countHeader(req, 'host') !== 1) return false
  const value = req.headers.host
  if (value === undefined) return false
  const host = value.replace(/:\d*$/, '').toLowerCase()
  return host === loopback || host === 'localhost'
}

export function contentTypeAccepted(req: IncomingMessage): boolean {
  if (countHeader(req, 'content-type') !== 1) return false
  const value = req.headers['content-type']
  if (value === undefined) return false
  const [media, ...parameters] = value.split(';').map(part => part.trim())
  if (media?.toLowerCase() !== 'application/json') return false
  if (parameters.length === 0) return true
  if (parameters.length !== 1) return false
  return /^charset=(?:utf-8|"utf-8")$/i.test(parameters[0] ?? '')
}
