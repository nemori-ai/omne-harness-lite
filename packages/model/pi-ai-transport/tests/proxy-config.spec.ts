import { describe, expect, it } from 'vitest'
import { createNetworkResources, type NetworkConfig, type ProxyConfig } from '../src/network.ts'
import { supportsProxyEnv } from '../src/pool-agent.ts'

const SECRET = 'proxy-password-value'

function withProxy(proxy: ProxyConfig): NetworkConfig {
  return { maxConnections: 1, idleConnectionTimeoutMs: 1_000, proxy }
}

/** The thrown error, so a test can check both its type and that its message keeps the URL out. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

describe('network resources: proxy configuration', () => {
  it.each([
    ['a URL that does not parse', { url: `user:${SECRET}@proxy`, bypass: [] }],
    [
      'a protocol other than http: or https:',
      { url: `socks5://user:${SECRET}@127.0.0.1:1080`, bypass: [] },
    ],
    [
      'an empty bypass entry',
      { url: `http://user:${SECRET}@127.0.0.1:3128`, bypass: ['localhost', ''] },
    ],
    [
      'a bypass entry with a comma',
      { url: `http://user:${SECRET}@127.0.0.1:3128`, bypass: ['a.example,b.example'] },
    ],
    [
      'a bypass entry with whitespace',
      { url: `http://user:${SECRET}@127.0.0.1:3128`, bypass: ['a.example b.example'] },
    ],
  ])('%s is a RangeError whose message holds no part of the URL', (_case, proxy) => {
    const error = thrownBy(() => createNetworkResources(withProxy(proxy)))
    expect(error).toBeInstanceOf(RangeError)
    const { message } = error instanceof Error ? error : new Error('not an error')
    expect(message).not.toContain(SECRET)
    expect(message).not.toContain('127.0.0.1')
    expect(message).not.toContain('user')
  })

  it.each([
    [
      'http:',
      'http://user:password@127.0.0.1:3128',
      ['localhost', '.internal.example', '*.svc', '192.168.1.1-192.168.1.100', 'host:8443'],
    ],
    ['https:', 'https://proxy.example', []],
  ])(
    'an %s proxy with valid bypass entries builds the resources',
    async (_protocol, url, bypass) => {
      const resources = createNetworkResources(withProxy({ url, bypass }))
      expect(resources.closed).toBe(false)
      await resources.close()
    },
  )

  // `URL` accepts these; Node's own reading of the raw text throws with the whole URL, password
  // included, in its message. This is the guarantee that construction never reports the URL.
  it.each([
    ['a trailing newline', `http://user:${SECRET}@proxy.example:8080\n`],
    ['an embedded carriage return', `http://user:${SECRET}@proxy.exa\rmple:8080`],
    ['an embedded tab', `http://user:${SECRET}@proxy.example:80\t80`],
  ])('a URL with %s builds the resources without any error', async (_case, url) => {
    const resources = createNetworkResources(withProxy({ url, bypass: [] }))
    expect(resources.closed).toBe(false)
    await resources.close()
  })
})

describe('network resources: the Node version that a proxy requires', () => {
  it.each(['24.4.0', '24.4.9', '22.21.0', '23.11.1', '24', 'not-a-version', ''])(
    'Node %j cannot take a proxy',
    version => {
      expect(supportsProxyEnv(version)).toBe(false)
    },
  )

  it.each(['24.5.0', '24.10.0', '25.0.0', '26.12.0', 'v24.5.1', '100.0.0'])(
    'Node %j can take a proxy',
    version => {
      expect(supportsProxyEnv(version)).toBe(true)
    },
  )
})
