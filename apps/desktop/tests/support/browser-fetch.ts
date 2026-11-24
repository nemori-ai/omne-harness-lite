/**
 * What a browser does and Node's `fetch` does not: send `Origin` on a request that is not `GET`,
 * keep the cookies an answer sets, and send them back. Returns the function that undoes it.
 */
export function actAsBrowser(seen?: (path: string) => void): () => void {
  const fetching = globalThis.fetch
  const cookies = new Map<string, string>()
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    seen?.(url.pathname)
    const headers = new Headers(init?.headers)
    if ((init?.method ?? 'GET') !== 'GET') headers.set('origin', url.origin)
    if (cookies.size > 0)
      headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    const response = await fetching(input, { ...init, headers })
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';').map(part => part.trim())
      const at = pair!.indexOf('=')
      const name = pair!.slice(0, at)
      const value = pair!.slice(at + 1)
      if (value === '' || attributes.some(part => /^max-age=0$/i.test(part))) cookies.delete(name)
      else cookies.set(name, value)
    }
    return response
  }
  return () => {
    globalThis.fetch = fetching
  }
}
