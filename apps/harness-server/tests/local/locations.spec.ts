// The places of the local single-user server. The rule is a pure function of platform, environment
// and user directory, so the Linux (XDG) rule and the Windows rule both run on any test host.
import { describe, expect, it } from 'vitest'
import { resolveLocations, type LocationInput } from '../../src/local/locations.ts'

function located(input: LocationInput) {
  const result = resolveLocations(input)
  if (result.kind !== 'located') throw new Error(`refused: ${result.message}`)
  return result.locations
}

describe('Windows', () => {
  it('uses %LOCALAPPDATA%\\omne\\config and \\state', () => {
    const places = located({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' },
      home: 'C:\\Users\\a',
    })
    expect(places).toEqual({
      source: 'platform',
      configDir: 'C:\\Users\\a\\AppData\\Local\\omne\\config',
      stateDir: 'C:\\Users\\a\\AppData\\Local\\omne\\state',
      settingsFile: 'C:\\Users\\a\\AppData\\Local\\omne\\config\\server.json',
      vaultFile: 'C:\\Users\\a\\AppData\\Local\\omne\\state\\model-vault.json',
      storageRoot: 'C:\\Users\\a\\AppData\\Local\\omne\\state\\storage',
      hostFilesDir: 'C:\\Users\\a\\AppData\\Local\\omne\\state\\host-files',
      defaultWorkspace: 'C:\\Users\\a\\AppData\\Local\\omne\\state\\workspace',
    })
  })

  it('falls back to <home>\\AppData\\Local when LOCALAPPDATA is absent or relative', () => {
    for (const env of [{}, { LOCALAPPDATA: 'relative\\dir' }]) {
      expect(located({ platform: 'win32', env, home: 'C:\\Users\\a' }).stateDir).toBe(
        'C:\\Users\\a\\AppData\\Local\\omne\\state',
      )
    }
  })
})

describe('Linux (XDG)', () => {
  it('defaults to ~/.config/omne and ~/.local/state/omne', () => {
    const places = located({ platform: 'linux', env: {}, home: '/home/a' })
    expect(places.configDir).toBe('/home/a/.config/omne')
    expect(places.stateDir).toBe('/home/a/.local/state/omne')
    expect(places.settingsFile).toBe('/home/a/.config/omne/server.json')
    expect(places.vaultFile).toBe('/home/a/.local/state/omne/model-vault.json')
  })

  it('uses absolute XDG_CONFIG_HOME and XDG_STATE_HOME', () => {
    const places = located({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/x/config', XDG_STATE_HOME: '/x/state' },
      home: '/home/a',
    })
    expect([places.configDir, places.stateDir]).toEqual(['/x/config/omne', '/x/state/omne'])
  })

  it('ignores a relative XDG value, as the XDG rule says', () => {
    const places = located({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: ' ' },
      home: '/home/a',
    })
    expect([places.configDir, places.stateDir]).toEqual([
      '/home/a/.config/omne',
      '/home/a/.local/state/omne',
    ])
  })
})

describe('OMNE_SERVER_HOME', () => {
  it('moves config and state on every platform, over LOCALAPPDATA and XDG', () => {
    expect(
      located({
        platform: 'linux',
        env: { OMNE_SERVER_HOME: '/srv/omne', XDG_STATE_HOME: '/x/state' },
        home: '/home/a',
      }),
    ).toMatchObject({
      source: 'override',
      configDir: '/srv/omne/config',
      stateDir: '/srv/omne/state',
    })
    expect(
      located({
        platform: 'win32',
        env: { OMNE_SERVER_HOME: 'D:\\omne', LOCALAPPDATA: 'C:\\L' },
        home: 'C:\\Users\\a',
      }),
    ).toMatchObject({ configDir: 'D:\\omne\\config', stateDir: 'D:\\omne\\state' })
  })

  it.each([
    ['empty', '  ', 'OMNE_SERVER_HOME is empty'],
    ['relative', 'omne', 'OMNE_SERVER_HOME must be an absolute path'],
  ])('refuses an %s value', (_name, value, message) => {
    expect(
      resolveLocations({ platform: 'linux', env: { OMNE_SERVER_HOME: value }, home: '/home/a' }),
    ).toEqual({ kind: 'refused', message })
  })
})
