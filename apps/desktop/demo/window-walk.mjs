import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startModelGateway } from '../../harness-server/tests/fixtures/model-gateway.ts'
import {
  freePort,
  newScratch,
  operatorLayer,
  startServer,
  writeOperator,
} from '../../harness-server/tests/r9/support.ts'

const REPLY = 'hello from the window walk'
const electron = createRequire(import.meta.url)('electron')
const probeMain = fileURLToPath(new URL('../tests/support/probe-main.mjs', import.meta.url))
const print = line => process.stdout.write(`${line}\n`)

const sse = events =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`
const answer = ({ body }) => ({
  status: 200,
  contentType: 'text/event-stream',
  body: sse([
    {
      model: JSON.parse(body).model ?? 'm',
      provider: 'OpenAI',
      choices: [{ delta: { content: REPLY } }],
    },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]),
})

const WALK = `(async () => {
  const log = text => console.log('STEP ' + text)
  const wait = async (what, find) => {
    for (let i = 0; i < 300; i += 1) {
      const found = find()
      if (found) return found
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('timed out waiting for ' + what)
  }
  const byText = (selector, text) =>
    [...document.querySelectorAll(selector)].find(element => element.textContent.trim() === text)
  const fill = (element, text) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await wait('the login gate', () => document.querySelector('input[name=loginIdentifier]'))
  log('the login gate is shown; sandbox page has require=' + typeof require + ' process=' + typeof process)
  byText('button[role=tab]', '第一次使用').click()
  await wait('the register form', () => byText('button[type=submit]', '注册并登录'))
  fill(document.querySelector('input[name=loginIdentifier]'), 'alice')
  fill(document.querySelector('input[name=credential]'), 'alice-pw-MARKER-7f3a')
  await wait('an enabled submit', () => !byText('button[type=submit]', '注册并登录').disabled)
  byText('button[type=submit]', '注册并登录').click()
  log('registered and signed in')
  await wait('the workspace', () => byText('button', '新建会话'))
  log('the workspace is shown')
  await wait('an enabled new-session button', () => !byText('button', '新建会话').disabled)
  byText('button', '新建会话').click()
  const composer = await wait('the composer', () => document.querySelector('textarea[aria-label="输入消息"]'))
  log('a session is created')
  fill(composer, 'say hello')
  await wait('an enabled send button', () => !byText('button[type=submit]', '发送').disabled)
  byText('button[type=submit]', '发送').click()
  log('a message is sent')
  const reply = await wait('the reply', () =>
    [...document.querySelectorAll('.omne-message[data-role=assistant]')].find(element => element.textContent.includes(${JSON.stringify(REPLY)})))
  log('the reply is shown: ' + reply.textContent.trim().slice(0, 80))
  return 'done'
})()`

const scratch = newScratch('window-walk-')
const userData = mkdtempSync(join(tmpdir(), 'omne-walk-ud-'))
let gateway
let server
let child
let code = 1
try {
  gateway = await startModelGateway(answer)
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  writeOperator(
    operatorPath,
    operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
  )
  server = await startServer({
    stateRoot: scratch.stateRoot,
    operatorPath,
    port,
    extraCaPath: gateway.certPath,
  })
  print(`server: accepting on 127.0.0.1:${port} with state ${scratch.stateRoot}`)
  child = spawn(electron, [probeMain, `--user-data-dir=${userData}`], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, OMNE_SERVER: `http://127.0.0.1:${port}`, OMNE_PROBE_SCRIPT: WALK },
  })
  let output = ''
  const onData = chunk => {
    output += String(chunk)
    for (const line of String(chunk).split('\n'))
      if (line.startsWith('PAGE ')) print(line.slice('PAGE '.length))
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const killer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 120_000)
  await new Promise(resolve => child.once('close', resolve))
  clearTimeout(killer)
  const line = output.split('\n').find(item => item.startsWith('PROBE '))
  const probe = line === undefined ? undefined : JSON.parse(line.slice('PROBE '.length))
  print(
    `window: ${probe?.windows} window(s), sandbox=${probe?.sandbox}, contextIsolation=${probe?.contextIsolation}, nodeIntegration=${probe?.nodeIntegration}`,
  )
  print(`walk result: ${JSON.stringify(probe?.result)}`)
  if (probe?.result?.ok === true && probe.windows === 1 && probe.sandbox === true) code = 0
  else print(`electron output:\n${output}`)
} catch (failure) {
  print(`failed: ${failure instanceof Error ? failure.message : String(failure)}`)
} finally {
  if (child?.pid !== undefined && child.exitCode === null) process.kill(-child.pid, 'SIGKILL')
  await server?.stop().catch(() => {})
  await gateway?.close().catch(() => {})
  scratch.remove()
  rmSync(userData, { recursive: true, force: true })
}
process.exit(code)
