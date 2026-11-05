// The default server of `register` and `login`: the address `harness-server setup` configured on this
// host, when neither `--server` nor `OMNE_SERVER` names one. The place rule runs for Windows and Linux
// on any host, with an injected file reader.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readLocalServer, type LocalServerInput } from '../src/local-server.ts'
import { startFakeService, type FakeService } from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

function reader(files: Record<string, string>): (path: string) => string {
  return path => {
    const text = files[path]
    if (text === undefined) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
    return text
  }
}

const read = (input: Partial<LocalServerInput> & Pick<LocalServerInput, 'platform'>) =>
  readLocalServer({ env: {}, home: undefined, ...input })

describe('readLocalServer', () => {
  it('Windows: %LOCALAPPDATA%\\omne\\config\\server.json', () => {
    expect(
      read({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\L' },
        readFile: reader({ 'C:\\L\\omne\\config\\server.json': '{"version":1,"port":8965}' }),
      }),
    ).toEqual({ kind: 'address', origin: 'http://127.0.0.1:8965' })
  })

  it('Linux: ~/.config/omne/server.json, or $XDG_CONFIG_HOME/omne/server.json', () => {
    const files = reader({
      '/home/a/.config/omne/server.json': '{"port":9001}',
      '/x/omne/server.json': '{"port":9002}',
    })
    expect(read({ platform: 'linux', home: '/home/a', readFile: files })).toEqual({
      kind: 'address',
      origin: 'http://127.0.0.1:9001',
    })
    expect(
      read({ platform: 'linux', home: '/home/a', env: { XDG_CONFIG_HOME: '/x' }, readFile: files }),
    ).toEqual({ kind: 'address', origin: 'http://127.0.0.1:9002' })
  })

  it('OMNE_SERVER_HOME moves the file to <dir>/config/server.json', () => {
    expect(
      read({
        platform: 'linux',
        env: { OMNE_SERVER_HOME: '/srv/o', XDG_CONFIG_HOME: '/x' },
        readFile: reader({ '/srv/o/config/server.json': '{"port":7000}' }),
      }),
    ).toEqual({ kind: 'address', origin: 'http://127.0.0.1:7000' })
  })

  it('no file is no local setup', () => {
    expect(read({ platform: 'linux', home: '/home/a', readFile: reader({}) })).toEqual({
      kind: 'none',
    })
  })

  it.each([
    ['not JSON', 'nope'],
    ['no port', '{"version":1}'],
    ['a port out of range', '{"port":70000}'],
  ])('a file with %s is reported, not ignored', (_name, text) => {
    const result = read({
      platform: 'linux',
      home: '/home/a',
      readFile: reader({ '/home/a/.config/omne/server.json': text }),
    })
    expect(result).toEqual({
      kind: 'invalid',
      message: 'omne: the local server settings /home/a/.config/omne/server.json give no port\n',
    })
  })
})

describe('register without --server and OMNE_SERVER', () => {
  const services: FakeService[] = []
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(services.splice(0).map(service => service.close()))
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })
  const home = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-local-')))
    roots.push(root)
    return root
  }

  it('goes to the address of the local setup', async () => {
    const service = await startFakeService()
    services.push(service)
    const result = await runInProcess(['register', '--login-identifier', 'alice'], {
      homeDirectory: home(),
      localServer: () => ({ kind: 'address', origin: service.origin }),
    })
    expect(result.code).toBe(0)
    expect(service.seen).toHaveLength(1)
  })

  it('negative control: --server wins over the local setup', async () => {
    const named = await startFakeService()
    const local = await startFakeService()
    services.push(named, local)
    const result = await runInProcess(
      ['register', '--login-identifier', 'alice', '--server', named.origin],
      {
        homeDirectory: home(),
        localServer: () => ({ kind: 'address', origin: local.origin }),
      },
    )
    expect(result.code).toBe(0)
    expect([named.seen.length, local.seen.length]).toEqual([1, 0])
  })

  it('a local setup that cannot be read stops the command before the credential is read', async () => {
    const result = await runInProcess(['login', '--login-identifier', 'alice'], {
      omneHome: join(home(), 'state'),
      localServer: () => ({
        kind: 'invalid',
        message: 'omne: the local server settings x give no port\n',
      }),
    })
    expect(result).toMatchObject({
      code: 1,
      stdout: '',
      stderr: 'omne: the local server settings x give no port\n',
      credentialReads: 0,
    })
  })
})
