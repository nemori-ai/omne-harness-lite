import { PortBusyError, PortClosedError, RemoteFetchError } from '../port-fetch/index.ts'
import { INTERNAL_ORIGIN } from './app-url.ts'

export const REQUEST_STAMP = 'x-omne-request'

// The page's own `Cookie`, `Origin` and stamp are not believed. A request that reached the
// protocol handler came from this app's page, so a non-GET request gets the internal `Origin`.
export function shapeRequestHeaders(headers: Headers, method: string): Headers {
  const out = new Headers()
  for (const [name, value] of headers)
    if (name !== 'cookie' && name !== 'origin' && name !== 'host' && name !== REQUEST_STAMP)
      out.append(name, value)
  if (method !== 'GET' && method !== 'HEAD') out.set('origin', INTERNAL_ORIGIN)
  return out
}

export function shapeResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('set-cookie')
  return out
}

export function failureStatus(err: unknown): { status: 500 | 503; message: string } {
  if (err instanceof PortClosedError) return { status: 503, message: 'Server Restarting' }
  if (err instanceof PortBusyError || (err instanceof RemoteFetchError && err.code === 'busy'))
    return { status: 503, message: 'Server Busy' }
  return { status: 500, message: 'Internal Server Error' }
}
