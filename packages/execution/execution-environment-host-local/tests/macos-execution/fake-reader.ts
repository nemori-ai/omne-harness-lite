// A stand-in session reader for fast tests on any POSIX host. It answers like the real reader and
// takes its answers from files in its directory, so a test can make a reading fail or report
// leftovers. `identity` answers a live pid as the leader of its own session started at 1.000001,
// and `stop` kills the process group of each session it is asked to stop (unless a pid is
// excepted), so nothing a test starts outlives it. Every call is appended to `calls`.
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type FakeAnswer = 'members' | 'members.fail' | 'identity' | 'children' | 'stop' | 'stop.fail'

export type FakeReader = Readonly<{
  path: string
  directory: string
  /** Sets one answer: the file's text is printed for that subcommand; a `.fail` file makes it fail. */
  set(answer: FakeAnswer, text: string): Promise<void>
  clear(answer: FakeAnswer): Promise<void>
  /** Every call so far, one argument list each. */
  calls(): Promise<string[][]>
  remove(): Promise<void>
}>

const script = (directory: string) => `#!/bin/sh
D='${directory}'
echo "$*" >> "$D/calls"
case "$1" in
  identity)
    if [ -f "$D/identity" ]; then cat "$D/identity"; exit 0; fi
    if kill -0 "$2" 2>/dev/null; then echo "$2 1 1"; else echo gone; fi
    ;;
  members)
    [ -f "$D/members.fail" ] && exit 1
    [ -f "$D/members" ] && cat "$D/members"
    exit 0
    ;;
  children)
    [ -f "$D/children" ] && cat "$D/children"
    exit 0
    ;;
  stop)
    except="$3"
    shift 3
    if [ "$except" = 0 ]; then for sid in "$@"; do kill -KILL -- "-$sid" 2>/dev/null; done; fi
    [ -f "$D/stop.fail" ] && exit 1
    if [ -f "$D/stop" ]; then cat "$D/stop"; else echo confirmed; fi
    ;;
  *) exit 2 ;;
esac
`

export async function fakeReader(): Promise<FakeReader> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-fake-reader-')))
  const path = join(directory, 'omne-session')
  await writeFile(path, script(directory))
  await chmod(path, 0o755)
  return {
    path,
    directory,
    set: (answer, text) => writeFile(join(directory, answer), text),
    clear: answer => rm(join(directory, answer), { force: true }),
    async calls() {
      const text = await readFile(join(directory, 'calls'), 'utf8').catch(() => '')
      return text
        .split('\n')
        .filter(line => line !== '')
        .map(line => line.split(' '))
    },
    remove: () => rm(directory, { recursive: true, force: true }),
  }
}
