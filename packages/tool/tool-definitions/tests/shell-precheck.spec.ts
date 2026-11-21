import { describe, expect, it } from 'vitest'
import { withinScope, type FilesScope } from '@omne-harness/execution-environment-contract'
import { isPosixShell, precheck, shellWords } from '../src/shell-precheck.ts'

const literal = (text: string, position: 'command' | 'argument' = 'argument') => ({
  kind: 'literal',
  text,
  position,
})

describe('the words of a POSIX script', () => {
  it('splits plain words and tells the command of each simple command from its arguments', () => {
    expect(shellWords('cd /a && cat /b | grep x; ls -l\necho done & wait')).toEqual([
      literal('cd', 'command'),
      literal('/a'),
      literal('cat', 'command'),
      literal('/b'),
      literal('grep', 'command'),
      literal('x'),
      literal('ls', 'command'),
      literal('-l'),
      literal('echo', 'command'),
      literal('done'),
      literal('wait', 'command'),
    ])
  })

  it('reads quotes and escapes the way the shell does', () => {
    expect(shellWords(`cat '/etc/a b' "/srv/x y" /srv/c\\ d it\\'s ""`)).toEqual([
      literal('cat', 'command'),
      literal('/etc/a b'),
      literal('/srv/x y'),
      literal('/srv/c d'),
      literal("it's"),
      literal(''),
    ])
    expect(shellWords('echo a\\\n/b')).toEqual([literal('echo', 'command'), literal('a/b')])
    expect(shellWords('cat "a\\"b" "c\\\\d" "e\\x" "f\\\ng" "$H/x" "~/y" \\~/z ~/w')).toEqual([
      literal('cat', 'command'),
      literal('a"b'),
      literal('c\\d'),
      literal('e\\x'),
      literal('fg'),
      { kind: 'opaque' },
      { kind: 'opaque' },
      { kind: 'opaque' },
      literal('~/w'),
    ])
  })

  it('names the target of each redirection with what it does to the file, and leaves out duplications', () => {
    expect(
      shellWords('cmd > /o >> /a 2>/e &> /all < /in <> /rw >| /clobber 2>&1 >&2 1>&-'),
    ).toEqual([
      literal('cmd', 'command'),
      { kind: 'redirect', effect: 'write', text: '/o' },
      { kind: 'redirect', effect: 'write', text: '/a' },
      { kind: 'redirect', effect: 'write', text: '/e' },
      { kind: 'redirect', effect: 'write', text: '/all' },
      { kind: 'redirect', effect: 'read', text: '/in' },
      { kind: 'redirect', effect: 'write', text: '/rw' },
      { kind: 'redirect', effect: 'write', text: '/clobber' },
    ])
    expect(shellWords('>/first cmd')).toEqual([
      { kind: 'redirect', effect: 'write', text: '/first' },
      literal('cmd', 'command'),
    ])
  })

  it('marks a word with an expansion as opaque, and ends the line at a comment', () => {
    expect(shellWords('cat $HOME/x "${A}" /etc/* /a/{b,c} ~/notes # cat /etc/shadow')).toEqual([
      literal('cat', 'command'),
      { kind: 'opaque' },
      { kind: 'opaque' },
      { kind: 'opaque' },
      { kind: 'opaque' },
      literal('~/notes'),
    ])
    expect(shellWords('echo a \\\n  b # c\nls')).toEqual([
      literal('echo', 'command'),
      literal('a'),
      literal('b'),
      literal('ls', 'command'),
    ])
    expect(shellWords('echo > ; ls')).toBeUndefined()
    expect(shellWords('echo > > x')).toBeUndefined()
    expect(shellWords('cat <<< /etc/x')).toEqual([literal('cat', 'command')])
    expect(shellWords("cat 'a$b' a#b")).toEqual([
      literal('cat', 'command'),
      literal('a$b'),
      literal('a#b'),
    ])
  })

  it('breaks words at tabs and operators written without spaces, and reads each redirection operator', () => {
    expect(shellWords('cat\ta|grep b&&ls>o 1&>x')).toEqual([
      literal('cat', 'command'),
      literal('a'),
      literal('grep', 'command'),
      literal('b'),
      literal('ls', 'command'),
      { kind: 'redirect', effect: 'write', text: 'o' },
      literal('1'),
      { kind: 'redirect', effect: 'write', text: 'x' },
    ])
    expect(shellWords('cmd >&out2 2>&10 <&in >2x')).toEqual([
      literal('cmd', 'command'),
      { kind: 'redirect', effect: 'write', text: 'out2' },
      { kind: 'redirect', effect: 'read', text: 'in' },
      { kind: 'redirect', effect: 'write', text: '2x' },
    ])
  })

  it('reads a redirection written into a word, a newline after one letter and an operator before an argument', () => {
    expect(shellWords('cat a<b')).toEqual([
      literal('cat', 'command'),
      literal('a'),
      { kind: 'redirect', effect: 'read', text: 'b' },
    ])
    expect(shellWords('cd a\nls')).toEqual([
      literal('cd', 'command'),
      literal('a'),
      literal('ls', 'command'),
    ])
    expect(shellWords('cmd &>/all arg')).toEqual([
      literal('cmd', 'command'),
      { kind: 'redirect', effect: 'write', text: '/all' },
      literal('arg'),
    ])
    expect(shellWords('ls x{a "a(b"')).toEqual([
      literal('ls', 'command'),
      { kind: 'opaque' },
      literal('a(b'),
    ])
  })

  it('marks globs and unquoted expansions opaque, but not a quoted brace or a later quoted tilde', () => {
    expect(shellWords('ls a? b[c] {d,e} x} "{" a"~b" "\\$x" "\\`y"')).toEqual([
      literal('ls', 'command'),
      { kind: 'opaque' },
      { kind: 'opaque' },
      { kind: 'opaque' },
      { kind: 'opaque' },
      literal('{'),
      literal('a~b'),
      literal('$x'),
      literal('`y'),
    ])
  })

  it('does not split what it does not read: substitutions, here-documents, groups, open quotes', () => {
    for (const script of [
      'cat "$(pwd)"',
      'cat "`pwd`"',
      'echo a(b',
      'echo a)',
      'echo )',
      '{ ls',
      'ls {',
      'ls; }',
      'ls }',
      'cat $(pwd)/x',
      'cat `pwd`/x',
      'cat <<EOF\n/etc/x\nEOF',
      '(cd /; ls)',
      '{ ls; }',
      "cat 'open",
      'cat "open',
      'cat trailing\\',
      'cat <(ls)',
    ])
      expect(shellWords(script), script).toBeUndefined()
  })
})

describe('the precheck of a start (table three)', () => {
  const ws = '/srv/blog'
  const both: FilesScope = { read: ws, write: ws }
  const writeOnly: FilesScope = { write: ws }
  const check = (
    scope: FilesScope,
    script: string,
    extra: Partial<Parameters<typeof precheck>[0]> = {},
  ) => precheck({ scope, cwd: ws, home: '/home/a', script, posix: true, ...extra })
  const start = { kind: 'start' }
  const outside = (path: string, effect: 'read' | 'write') => ({ kind: 'outside', path, effect })

  it('row 1: a start directory outside the write scope does not start', () => {
    expect(check(both, 'ls', { cwd: '/tmp' })).toEqual(outside('/tmp', 'write'))
    expect(check(writeOnly, 'ls', { cwd: '/tmp' })).toEqual(outside('/tmp', 'write'))
    expect(check({ read: ws }, 'ls', { cwd: '/tmp' })).toEqual(start)
    expect(check(both, 'ls', { cwd: `${ws}/src` })).toEqual(start)
  })

  it('row 2: a script it cannot split starts as it is', () => {
    expect(check(both, 'cat $(pwd)/x /etc/hosts')).toEqual(start)
  })

  it('row 3: a word with an expansion is not judged', () => {
    expect(check(both, 'cat $HOME/../../etc/hosts')).toEqual(start)
  })

  it('row 4: a literal write target outside the write scope does not start, a device does', () => {
    expect(check(both, 'echo x > /etc/motd')).toEqual(outside('/etc/motd', 'write'))
    expect(check(writeOnly, 'echo x >> ../shop/log')).toEqual(outside('/srv/shop/log', 'write'))
    for (const device of [
      '/dev/null',
      '/dev/zero',
      '/dev/stdin',
      '/dev/stdout',
      '/dev/stderr',
      '/dev/tty',
      '/dev/fd/3',
    ])
      expect(check(both, `echo x > ${device}`), device).toEqual(start)
    expect(check(both, 'echo x > out.txt')).toEqual(start)
    expect(check({ read: ws }, 'echo x > /etc/motd')).toEqual(start)
  })

  it('row 5: a literal read source outside the read scope does not start', () => {
    expect(check(both, 'wc -l < /etc/hosts')).toEqual(outside('/etc/hosts', 'read'))
    expect(check(writeOnly, 'wc -l < /etc/hosts')).toEqual(start)
    expect(check(both, 'wc -l < /dev/null')).toEqual(start)
  })

  it('row 6: a literal argument that is a path outside the read scope does not start', () => {
    expect(check(both, 'cat /etc/hosts')).toEqual(outside('/etc/hosts', 'read'))
    expect(check(both, 'cat ~/notes')).toEqual(outside('/home/a/notes', 'read'))
    expect(check(both, 'cat ~')).toEqual(outside('/home/a', 'read'))
    expect(check(both, 'cat ~/notes', { home: undefined })).toEqual(start)
    expect(check(both, 'cat ~other/notes')).toEqual(start)
    expect(check(both, 'cat ../shop/README.md')).toEqual(outside('/srv/shop/README.md', 'read'))
    expect(check(both, 'cat sub/../README.md')).toEqual(start)
    expect(check(both, `cat ${ws}/README.md`)).toEqual(start)
    expect(check(writeOnly, 'cat /etc/hosts')).toEqual(start)
  })

  it('row 7: the command word of each simple command is not judged', () => {
    expect(check(both, '/usr/bin/env ls && /bin/echo ok')).toEqual(start)
  })

  it('row 8: other words are not judged', () => {
    expect(check(both, 'grep -r todo src notes.txt')).toEqual(start)
  })

  it('judges only the start directory when the program is not of the POSIX family', () => {
    expect(check(both, 'Get-Content C:\\Windows\\win.ini', { posix: false })).toEqual(start)
    expect(check(both, 'cat /etc/hosts', { posix: false })).toEqual(start)
    expect(check(both, 'ls', { posix: false, cwd: '/tmp' })).toEqual(outside('/tmp', 'write'))
  })

  it('does nothing when neither reads nor writes are limited', () => {
    expect(check({}, 'cat /etc/hosts > /etc/x', { cwd: '/tmp' })).toEqual(start)
  })

  it('names the first path that is outside, in the order of the script', () => {
    expect(check(both, 'cat /etc/a > /etc/b')).toEqual(outside('/etc/a', 'read'))
  })
})

it('judges a path as the files fence does: the same answers on the same paths (C14)', () => {
  const scopes: readonly FilesScope[] = [
    { read: '/srv/blog', write: '/srv/blog' },
    { write: '/srv/blog' },
    { read: '/srv' },
    {},
  ]
  const paths = [
    '/srv/blog',
    '/srv/blog/a',
    '/srv/blogger/a',
    '/srv/blog/../x',
    '/etc/hosts',
    '/srv',
  ]
  for (const scope of scopes)
    for (const path of paths) {
      const verdict = precheck({
        scope,
        cwd: '/srv/blog',
        home: undefined,
        script: `cat ${path}`,
        posix: true,
      })
      const fenced = !withinScope(scope, 'read', path.replace('/blog/../', '/'))
      expect(verdict.kind === 'outside', `${JSON.stringify(scope)} ${path}`).toBe(fenced)
    }
})

it('tells the POSIX family of shells by the name of the program', () => {
  for (const name of [
    'sh',
    'bash',
    '/bin/zsh',
    '/usr/local/bin/dash',
    'ksh',
    'ash',
    'mksh',
    'yash',
    'C:\\Git\\bin\\bash.exe',
  ])
    expect(isPosixShell(name), name).toBe(true)
  for (const name of ['pwsh', 'powershell.exe', 'C:\\Windows\\System32\\cmd.exe', 'fish', 'python'])
    expect(isPosixShell(name), name).toBe(false)
})
