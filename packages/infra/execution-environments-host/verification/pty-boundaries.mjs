// Finite real-PTY boundary probes. Faults affect only disposable compiled copies.
import { spawn } from 'node:child_process'
import { cp, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import {
  createHostProcessCoordinate,
  nativeManagerEnvironment,
  stopHostResource,
} from '../dist/native-control.js'
import { clearHostGateEntry } from '../dist/native-evidence.js'
import { clearHostResourceDirectory } from '../dist/resource-directory.js'
import { defaultHostNativePolicy as policy } from '../dist/native-policy.js'
const member = fileURLToPath(new URL('../', import.meta.url))
if (!process.argv[2]) throw new Error('Supply an ignored task output directory')
const out = resolve(process.argv[2])
await import('node:fs/promises').then(({ mkdir }) => mkdir(out, { recursive: true }))
async function until(get, label) {
  const deadline = Date.now() + 10000
  for (;;) {
    const value = await get()
    if (value) return value
    if (Date.now() > deadline) throw Error('Timeout: ' + label)
    await delay(5)
  }
}
async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}
function replace(source, before, after) {
  assert.equal(source.split(before).length, 2, 'unique cutpoint ' + before)
  return source.replace(before, after)
}
async function fixture(kind, transform) {
  const dir = await mkdtemp(out + '/copy-'),
    coord = await createHostProcessCoordinate()
  await cp(member + '/dist', dir + '/dist', { recursive: true })
  await writeFile(dir + '/package.json', '{"type":"module"}')
  await symlink(member + '/node_modules', dir + '/node_modules', 'dir')
  await transform(dir)
  const args =
    kind === 'terminal'
      ? [coord.unit, coord.boot, '16384', '80', '24']
      : [coord.unit, '16384', '80', '24']
  const child = spawn(
    '/usr/bin/systemd-run',
    [
      '--user',
      '--scope',
      '--quiet',
      `--unit=${coord.unit}`,
      '--property=KillMode=control-group',
      process.execPath,
      dir + `/dist/${kind}-gate.js`,
      ...args,
    ],
    { env: nativeManagerEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const frames = []
  let stderr = '',
    entered = false,
    drained = false
  child.stderr.on('data', d => {
    stderr += d
  })
  const input = createInterface({ input: child.stdout })
  input.on('line', line => {
    const frame = JSON.parse(line)
    frames.push(frame)
    if (frame.kind === 'ready') entered = true
  })
  child.once('close', () => {
    drained = true
  })
  child.stdin.on('error', () => {})
  return {
    dir,
    coord,
    child,
    frames,
    send: frame => child.stdin.write(JSON.stringify(frame) + '\n'),
    frame: kind => until(() => frames.find(f => f.kind === kind), 'frame ' + kind),
    async close() {
      child.stdin.destroy()
      if (!entered && !drained) await until(() => entered || drained, 'original launcher observed')
      assert.equal(
        await stopHostResource(coord, policy, async () => entered || drained, 'forced'),
        'confirmed',
        'own scope stopped',
      )
      await until(() => drained, 'original launcher drained')
      assert.equal(await clearHostResourceDirectory(coord), true, 'own directory removed')
      assert.equal(await clearHostGateEntry(coord), true, 'own entry removed')
      await writeFile(
        out + `/${coord.unit}.json`,
        JSON.stringify({ coord, frames, stderr }, null, 2),
      )
      await rm(dir, { recursive: true })
    },
  }
}
async function publication(mutant) {
  const f = await fixture('terminal', async dir => {
    const path = dir + '/dist/terminal-gate.js'
    let s = await readFile(path, 'utf8')
    const barrier = `await writeFile(${JSON.stringify(dir + '/barrier')},'entered');\nwhile (!(await readFile(${JSON.stringify(dir + '/release')},'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;}))) await new Promise(r=>setTimeout(r,5));\n`
    s = replace(
      s,
      '    // The receipt parser remains active during asynchronous observation and disposal.',
      barrier +
        '    // The receipt parser remains active during asynchronous observation and disposal.',
    )
    s = replace(
      s,
      'void finish(state, code).catch(broken);',
      "void finish(state, code).finally(()=>send({kind:'testFinishReturned'})).catch(broken);",
    )
    if (mutant)
      s = replace(
        s,
        '    if (!valid || current !== state)\n        return;',
        '    // Negative control: omit publication guard.',
      )
    await writeFile(path, s)
  })
  try {
    await f.frame('ready')
    f.send({ kind: 'go', cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } })
    await f.frame('created')
    const marker = f.dir + '/barrier'
    // The actual Bash emits the original receipt, then waits until async disposal
    // reaches the controlled cutpoint. No residual child process creates this gap.
    const script = `function builtin(){ if [[ "$1" == printf && "$2" == *"777;omne;"* ]]; then command builtin "$@"; while [[ ! -e '${marker}' ]]; do :; done; command builtin printf extra >/dev/tty; else command builtin "$@"; fi; }; printf original`
    f.send({ kind: 'command', id: randomUUID(), script })
    await f.frame('broken')
    await writeFile(f.dir + '/release', 'yes')
    await f.frame('testFinishReturned')
    const completed = f.frames.some(x => x.kind === 'completed')
    const oracle = () => assert.equal(completed, false, 'No completed frame after broken')
    if (mutant) assert.throws(oracle, assert.AssertionError)
    else oracle()
    return {
      case: 'publication',
      mutant,
      broken: true,
      completed,
      oracle: mutant ? 'negative-control-killed' : 'pass',
    }
  } finally {
    await f.close()
  }
}
async function backpressure(mutant) {
  const f = await fixture('process', async dir => {
    const transport = dir + '/dist/pty-output.js'
    let t = await readFile(transport, 'utf8')
    t = "import { writeFileSync } from 'node:fs';\n" + t
    t = replace(
      t,
      '            if (paused)\n                terminal.pause();',
      `            if (paused) { writeFileSync(${JSON.stringify(dir + '/paused')},'yes'); terminal.pause(); }`,
    )
    await writeFile(transport, t)
    const path = dir + '/dist/process-gate.js'
    let s = await readFile(path, 'utf8')
    s = "import { writeFileSync } from 'node:fs';\n" + s
    s = replace(
      s,
      '    terminal.onExit(() => {',
      `    terminal.onExit(() => { writeFileSync(${JSON.stringify(dir + '/exit')},String(transport.paused()));`,
    )
    if (mutant) s = replace(s, 'if (invalid || transport.paused())', 'if (invalid)')
    await writeFile(path, s)
  })
  try {
    await f.frame('ready')
    f.child.stdout.pause()
    const python = `import os,signal,threading,time\nthreading.Thread(target=lambda:os.write(1,b'x'*2097152),daemon=True).start()\nwhile not os.path.exists(${JSON.stringify(f.dir + '/release')}): time.sleep(0.005)\nos.kill(os.getpid(),signal.SIGTERM)`
    f.send({
      kind: 'go',
      executable: '/usr/bin/python3',
      args: ['-c', python],
      cwd: '/tmp',
      env: {},
    })
    await until(() => exists(f.dir + '/paused'), 'actual private stdout backpressure')
    await writeFile(f.dir + '/release', 'terminate own target')
    await until(() => exists(f.dir + '/exit'), 'actual node-pty exit')
    assert.equal(await readFile(f.dir + '/exit', 'utf8'), 'true', 'transport still paused at exit')
    f.child.stdout.resume()
    const result = await f.frame(mutant ? 'completed' : 'failed')
    const oracle = () => assert.equal(result.kind, 'failed', 'Paused exit is not completion')
    if (mutant) assert.throws(oracle, assert.AssertionError)
    else oracle()
    return {
      case: 'exit-paused',
      mutant,
      pausedAtExit: true,
      kind: result.kind,
      oracle: mutant ? 'negative-control-killed' : 'pass',
    }
  } finally {
    f.child.stdout.resume()
    await f.close()
  }
}
const records = []
for (const run of [publication, backpressure])
  for (const mutant of [false, true]) {
    const start = performance.now()
    const record = await run(mutant)
    record.seconds = (performance.now() - start) / 1000
    records.push(record)
    console.log(JSON.stringify(record))
  }
await writeFile(
  out + '/results.json',
  JSON.stringify(
    {
      scope:
        'real PTY/scope; deterministic cutpoints only in disposable compiled copies; separate from standard Stryker/V8 coverage',
      records,
    },
    null,
    2,
  ) + '\n',
)
