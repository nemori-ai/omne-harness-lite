import { describe, expect, it } from 'vitest'
import { parseEntryCommand } from '../src/entry-command.ts'

describe('one product entry', () => {
  it('enters session preparation on a terminal instead of showing governance help', () => {
    expect(parseEntryCommand([], true)).toEqual({ kind: 'session', home: null, session: null })
  })
  it('requires explicit input without a terminal', () => {
    expect(() => parseEntryCommand([], false)).toThrow('tty-required')
  })
  it.each(['--help', '--version'])('allows %s without a terminal or identity', arg => {
    expect(parseEntryCommand([arg], false)).toEqual({ kind: arg.slice(2) })
  })
  it('enters an explicitly identified session on a terminal', () => {
    expect(parseEntryCommand(['--session', 'session-A', '--home', '/private'], true)).toEqual({
      kind: 'session',
      home: '/private',
      session: 'session-A',
    })
  })
  it('does not confuse entering an existing session with machine input', () => {
    expect(() => parseEntryCommand(['--session', 'session-A'], false)).toThrow('tty-required')
  })
  it.each([[], ['--session', 'session-A']].map(args => [args]))(
    'selects the same message submission route with %j',
    sessionArgs => {
      expect(
        parseEntryCommand(['--message-file', '/message', '--json', ...sessionArgs], false),
      ).toEqual({
        kind: 'message',
        home: null,
        session: sessionArgs[1] ?? null,
        messageFile: '/message',
        json: true,
      })
    },
  )
  it.each(
    [
      ['--json'],
      ['--message-file', '/message'],
      ['--message-file', '/message', '--json', '--center', 'name'],
    ].map(args => [args]),
  )('rejects an incomplete or ambiguous machine entry %j', args => {
    expect(() => parseEntryCommand(args, false)).toThrow('invalid-options')
  })
  it.each(
    [
      ['session', 'new'],
      ['session', 'open'],
      ['tui'],
      ['machine', 'login'],
      ['center', 'configure'],
      ['organization', 'create'],
      ['invoke'],
    ].map(args => [args]),
  )('rejects replaced or undeclared command %j', args => {
    expect(() => parseEntryCommand(args, true)).toThrow('invalid-command')
  })
  it.each(
    [
      ['--session', 'one', '--session', 'two'],
      ['--home', '/one', '--home', '/two'],
      ['--json', '--json'],
      ['--help', '--version'],
      ['--session'],
      ['--unknown', 'value'],
    ].map(args => [args]),
  )('rejects conflicting or malformed options %j', args => {
    expect(() => parseEntryCommand(args, true)).toThrow('invalid-options')
  })
})

describe('minimal governance preparation and account safety', () => {
  it.each([
    [['center', 'add'], 'center.add'],
    [['tenant', 'create'], 'tenant.create'],
    [['tenant', 'add'], 'tenant.add'],
    [['tenant', 'switch'], 'tenant.switch'],
    [['login'], 'login'],
    [['register'], 'register'],
    [['logout'], 'logout'],
    [['logins', 'list'], 'logins.list'],
    [['logins', 'revoke'], 'logins.revoke'],
    [['credential', 'change'], 'credential.change'],
  ] as const)('exposes %j as one user action', (args, action) => {
    expect(parseEntryCommand(args, true)).toMatchObject({
      kind: 'governance',
      action,
      interactive: true,
      json: false,
    })
  })
  it('keeps center registration distinct from login and tenant creation', () => {
    expect(
      parseEntryCommand(
        ['center', 'add', 'https://center.example', '--name', 'work', '--system-ca', '--json'],
        false,
      ),
    ).toEqual({
      kind: 'governance',
      action: 'center.add',
      home: null,
      json: true,
      interactive: false,
      values: { endpoint: 'https://center.example', name: 'work', 'system-ca': true },
    })
  })
  it('creates a tenant through an organization name', () => {
    expect(
      parseEntryCommand(['tenant', 'create', '--name', 'team', '--json'], false),
    ).toMatchObject({ action: 'tenant.create', values: { name: 'team' } })
  })
  it('adds a tenant only through an invitation', () => {
    expect(
      parseEntryCommand(['tenant', 'add', '--invitation', 'invitation-A', '--json'], false),
    ).toMatchObject({ action: 'tenant.add', values: { invitation: 'invitation-A' } })
    expect(() => parseEntryCommand(['tenant', 'add', 'tenant-A', '--json'], false)).toThrow(
      'invalid-options',
    )
  })
  it('selects an exact tenant identity', () => {
    expect(parseEntryCommand(['tenant', 'switch', 'tenant-A', '--json'], false)).toMatchObject({
      action: 'tenant.switch',
      values: { tenant: 'tenant-A' },
    })
  })
  it('keeps login credentials in protected file arguments', () => {
    expect(
      parseEntryCommand(
        [
          'login',
          '--center',
          'work',
          '--login-identifier',
          'user',
          '--credential-file',
          '/private/credential',
          '--json',
        ],
        false,
      ),
    ).toMatchObject({
      action: 'login',
      values: {
        center: 'work',
        'login-identifier': 'user',
        'credential-file': '/private/credential',
      },
    })
    expect(() => parseEntryCommand(['login', '--credential', 'do-not-echo-this'], false)).toThrow(
      /^omne: invalid-options$/,
    )
  })
  it.each(
    [
      ['center', 'add'],
      ['tenant', 'create'],
      ['tenant', 'add'],
      ['tenant', 'switch'],
      ['login'],
      ['logins', 'revoke'],
      ['credential', 'change'],
    ].map(args => [args]),
  )('does not prompt for missing machine input %j', args => {
    expect(() => parseEntryCommand([...args, '--json'], false)).toThrow('missing-input')
  })
  it('requires machine presentation for governance without a terminal', () => {
    expect(() => parseEntryCommand(['logout'], false)).toThrow('tty-required')
  })
  it('does not prompt in JSON mode even when attached to a terminal', () => {
    expect(() => parseEntryCommand(['login', '--json'], true)).toThrow('missing-input')
  })
  it.each(
    [
      ['tenant', 'create', '--invitation', 'id'],
      ['tenant', 'switch', 'tenant-A', '--name', 'name'],
      ['login', '--message-file', '/message'],
      ['center', 'add', '--system-ca', '--spki', 'hash'],
      ['center', 'add', '--system-ca', '--ca-file', '/ca'],
    ].map(args => [args]),
  )('rejects options belonging to another action or conflicting trust %j', args => {
    expect(() => parseEntryCommand(args, true)).toThrow('invalid-options')
  })
})
