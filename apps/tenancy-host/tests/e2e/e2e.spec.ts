// 治理中心的黑盒端到端验收：照部署方式起进程（openssl 自签证书、`dist/cli.js keygen`、环境变量、`dist/cli.js serve`），
// 从本进程（测试进程，不是中心进程）只凭传输绑定与入口契约走产品正文的核心旅程。每条用例名带出处锚点：
//   PF-001 = design/product/PF-001-identity-scope-and-agent-constraints/flows.md（§1.1～1.8、§二）
//   PF-017 = design/product/PF-017-governance-center-as-deployable-application/acceptance.md（§一、§二、§三）
//   HB = spec/compositions/governance-center-entry-https-json/v1；EC = spec/compositions/governance-center-entry/v1；
//   D-029 = realization/apps/cli/design.md「客户端信任中心的规则」。
// 判据一律是来者可观察的结果：答复的值与字节、之后能不能做某事、进程的退出码与它写出的工程记录；不读进程内部。
// 唯一碰库文件的两处都是运维者在产品之外做的事：搬家（挪文件）与备份（复制文件）；「备份外泄」一条读的是那份拷贝。
// 本目录不 import 任何 `@omne-harness-lite/*` 包与 `src/`；被测的是构建产物（先 `pnpm run build`）。
// 证据：设 `OMNE_E2E_EVIDENCE_DIR` 就写到那里（出示物、口令、私钥遮蔽成 ***），否则写到临时目录、跑完删掉。
import { spawn } from 'node:child_process'
import { X509Certificate, randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createServer as createTlsServer } from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type CenterAddress,
  type Client,
  type EntryAnswer,
  type Exchange,
  type RouteName,
  PUBLIC_HEALTH_BODY,
  call,
  callRaw,
  client,
  describe as describeExchange,
  envelopeBody,
  fullHealth,
  httpRequest,
  isCompactCanonical,
  parseHttpAnswer,
  publicHealth,
  readReply,
  resultOf,
  sendTls,
  ROUTE,
  PROTOCOL_VERSION,
} from './client.ts'
import {
  type CertificateAuthority,
  type Deployment,
  type RunResult,
  type ServerCertificate,
  CenterProcess,
  ENV,
  PARAMETER_VARIABLES,
  SETTINGS,
  assertBuilt,
  envOf,
  freePort,
  keygen,
  makeCa,
  makeServerCertificate,
  opsDirectory,
  opsSocketOf,
  parseJsonLines,
  runCli,
  tempRoot,
  CLI_JS,
} from './deploy.ts'
import { Evidence, secretForms, sha256 } from './evidence.ts'
import {
  type Account,
  type Login,
  type TenantId,
  asArray,
  asRecord,
  asString,
  asTenantId,
  login as logIn,
  register,
} from './journey.ts'

// ---- 固定字节：HB examples.md §1、§3（每份的 SHA-256 取自那一页，先核对夹具本身） ----

function answerBytes(body: string): Buffer {
  return Buffer.from(
    `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n` +
      `Content-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close\r\n\r\n${body}`,
    'utf8',
  )
}

const FIXED: Readonly<Record<EntryAnswer, Buffer>> = {
  'version-mismatch': answerBytes('"version-mismatch"'),
  'login-state-rejected': answerBytes('"login-state-rejected"'),
  unavailable: answerBytes('"unavailable"'),
  'invalid-input': answerBytes('"invalid-input"'),
}

const FIXED_SHA256: Readonly<Record<EntryAnswer, string>> = {
  'version-mismatch': 'cb89af19eb9dee5daac89acb4e2093c752948006e1a83b2eef76dc9ee66fcd27',
  'login-state-rejected': 'a2957026d3c970025bd8e868e12b6d0e97465136b43762c546e44c735a524793',
  unavailable: '64a5b5280d3576c03a796d9cf5092dba09780572db9ba13b09be23b2d26c80c1',
  'invalid-input': '58e9d580311df16917e862f74dd97301ea41f06caec6315400a0e74fc46165d1',
}

const FULL_HEALTH_KEYS = [
  'reachable',
  'centerId',
  'version',
  'startedAt',
  'storageReachable',
  'deploymentKeyPresent',
  'deploymentKeyComplete',
  'clockSane',
  'defectCount',
  'deploymentParameters',
]
const PARAMETER_KEYS = [
  'unactivatedRetention',
  'invitationTtlDefault',
  'affiliationRequestTtlDefault',
  'copyNoticeTtlDefault',
  'sharingInvitationTtlDefault',
]
const DAY = 86_400_000
/** HB S-12：时间点写成 UTC、`Z` 结尾、秒的小数只在非零时写。 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d*[1-9])?Z$/
const CENTER_ID = /^[0-9a-f]{32}$/

// ---- 共享状态：一次旅程，按用例次序推进 ----

let root: string
let evidence: Evidence
let ca: CertificateAuthority
let rogueCa: CertificateAuthority
let goodCert: ServerCertificate
let rogueCert: ServerCertificate
let wrongHostCert: ServerCertificate
let dA: Deployment
let A: CenterProcess | undefined
let cA: Client
let centerIdA = ''
const processes: CenterProcess[] = []
const cliRuns: { readonly label: string; readonly run: RunResult }[] = []
const anomalies: string[] = []

/** 契约没写定、或与产品正文字面有出入的观察：原样记下，不判通过或失败（交主线裁）。 */
function noteAnomaly(key: string, clause: string, exchange: Exchange, situation: string): void {
  anomalies.push(
    `${key} [${clause}] ${situation}: 线上读成 ${describeExchange(exchange)}（transcript 里 label「${exchange.label}」）`,
  )
}
const exchanges: Exchange[] = []
const keyFileContents: string[] = []

const logins = new Map<string, Login>()
const tenants = new Map<string, TenantId>()
const ids = new Map<string, string>()

function login(name: string): Login {
  const found = logins.get(name)
  if (found === undefined) throw new Error(`no login ${name} (an earlier step failed)`)
  return found
}
function personal(name: string): TenantId {
  const found = tenants.get(name)
  if (found === undefined) throw new Error(`no personal tenant for ${name}`)
  return found
}
function id(name: string): string {
  const found = ids.get(name)
  if (found === undefined) throw new Error(`no id ${name}`)
  return found
}

function password(): string {
  const value = randomBytes(18).toString('base64url')
  evidence.secrets.add(value, 'credential')
  return value
}

const accounts = new Map<string, Account>()
function account(name: string): Account {
  let found = accounts.get(name)
  if (found === undefined) {
    found = { loginIdentifier: `${name}@example.invalid`, credential: password() }
    accounts.set(name, found)
  }
  return found
}

const observe = (exchange: Exchange): void => {
  evidence.observe(exchange)
  exchanges.push(exchange)
}
const command = (line: string): void => evidence.command(line)

function address(d: Deployment, extra: Partial<CenterAddress> = {}): CenterAddress {
  return { host: '127.0.0.1', port: d.port, servername: 'localhost', ca: ca.certPem, ...extra }
}

function scenario(name: string): void {
  evidence.scenario(name)
}

async function start(label: string, d: Deployment): Promise<Record<string, unknown>> {
  const center = CenterProcess.serve(label, envOf(d), command)
  processes.push(center)
  const health = await center.ready(opsSocketOf(d))
  evidence.output(`health/${label}-ready.json`, `${JSON.stringify(health, null, 2)}\n`)
  A = center
  return health
}

async function stopA(): Promise<void> {
  const center = A
  if (center === undefined) throw new Error('A is not running')
  expect(await center.terminate()).toEqual({ code: 0, signal: null })
  A = undefined
}

async function serveFails(label: string, env: Record<string, string>): Promise<RunResult> {
  const run = await runCli(['serve'], env, command)
  cliRuns.push({ label, run })
  evidence.output(`startup-failures/${label}.stderr.jsonl`, run.stderr)
  return run
}

function startupFailures(run: RunResult): Record<string, unknown>[] {
  return parseJsonLines(run.stderr).filter(record => record['event'] === 'startup-failed')
}

function without(env: Record<string, string>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)))
}

function sleep(ms: number): Promise<void> {
  return new Promise(done => setTimeout(done, ms))
}

// ---- 判读 ----

function text(e: Exchange): string {
  return e.wire.received.toString('utf8')
}

/** 入口答复：读成那一种，且整份答复就是 HB examples 的那份固定字节。 */
function expectEntry(e: Exchange, answer: EntryAnswer): void {
  expect(describeExchange(e), e.label).toBe(answer)
  expect(text(e), e.label).toBe(FIXED[answer].toString('utf8'))
}

function expectResult(e: Exchange): unknown {
  expect(e.reply.kind, `${e.label}: ${describeExchange(e)}`).toBe('result')
  return resultOf(e)
}

function expectFailure(e: Exchange, name: string): void {
  expect(describeExchange(e), e.label).toBe(`failure ${name}`)
  expect(text(e).endsWith(`\r\n\r\n{"failure":"${name}"}`), e.label).toBe(true)
}

function expectKeys(
  value: unknown,
  keys: readonly string[],
  what: string,
): Record<string, unknown> {
  const record = asRecord(value, what)
  expect(Object.keys(record), what).toEqual(keys)
  return record
}

function millisBetween(timing: unknown): number {
  const t = expectKeys(timing, ['issuedAt', 'expiresAt'], 'offerTiming')
  const issuedAt = asString(t['issuedAt'], 'issuedAt')
  const expiresAt = asString(t['expiresAt'], 'expiresAt')
  expect(issuedAt).toMatch(INSTANT)
  expect(expiresAt).toMatch(INSTANT)
  return Date.parse(expiresAt) - Date.parse(issuedAt)
}

function invitationView(value: unknown): Record<string, unknown> {
  return expectKeys(
    value,
    ['invitation', 'issuerOrganization', 'invitedAccount', 'role', 'offerTiming', 'offerState'],
    'InvitationView',
  )
}

// ---- 路由的简写 ----

function as(
  name: string,
  route: RouteName,
  payload: Record<string, unknown> = {},
): Promise<Exchange> {
  return call(cA, route, payload, login(name).presentation, `${name}:${route}`)
}

async function myTenants(name: string): Promise<TenantId[]> {
  return asArray(expectResult(await as(name, 'myTenants')), 'my tenants').map(t => asTenantId(t))
}

async function switchTo(name: string, tenant: TenantId): Promise<void> {
  expect(expectResult(await as(name, 'switchTenant', { targetTenant: tenant }))).toBe('ok')
}

async function invite(
  name: string,
  invitee: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return asString(
    expectResult(await as(name, 'invite', { invitedAccount: personal(invitee).account, ...extra })),
    'invitation',
  )
}

async function readInvitation(name: string, invitation: string, kind: 'account' | 'tenant') {
  return invitationView(
    expectResult(await as(name, 'readInvitation', { invitation, callerIdentityKind: kind })),
  )
}

// ---- 夹具 ----

beforeAll(async () => {
  assertBuilt()
  root = tempRoot('suite')
  const evidenceRoot = process.env['OMNE_E2E_EVIDENCE_DIR'] ?? join(root, 'evidence')
  evidence = new Evidence(evidenceRoot)
  const tls = join(root, 'tls')
  ca = makeCa(tls, 'e2e-ca', command)
  rogueCa = makeCa(tls, 'rogue-ca', command)
  goodCert = makeServerCertificate(tls, 'center', ca, ['DNS:localhost', 'IP:127.0.0.1'], command)
  rogueCert = makeServerCertificate(
    tls,
    'rogue',
    rogueCa,
    ['DNS:localhost', 'IP:127.0.0.1'],
    command,
  )
  wrongHostCert = makeServerCertificate(tls, 'wrong-host', ca, ['DNS:wrong-host.invalid'], command)
  for (const key of [
    ca.keyFile,
    rogueCa.keyFile,
    goodCert.keyFile,
    rogueCert.keyFile,
    wrongHostCert.keyFile,
  ])
    evidence.secrets.add(readFileSync(key, 'utf8'), 'private-key')
  const keys = await keygen(join(root, 'keys-a'), command)
  for (const path of Object.values(keys)) {
    const pem = readFileSync(path, 'utf8')
    keyFileContents.push(pem)
    if (pem.includes('PRIVATE KEY')) evidence.secrets.add(pem, 'private-key')
  }
  mkdirSync(join(root, 'a'))
  dA = {
    dbFile: join(root, 'a', 'center.sqlite'),
    keys,
    tls: { chainFile: goodCert.chainFile, keyFile: goodCert.keyFile },
    host: '127.0.0.1',
    port: await freePort(),
    opsDir: opsDirectory(root),
    settings: SETTINGS,
  }
  evidence.output(
    'environment.txt',
    [
      `node ${process.version} (${process.platform} ${process.arch})`,
      `openssl ${String(process.versions.openssl)} (Node 内置)；证书由系统 openssl 生成，见 commands/commands.txt`,
      `cli ${CLI_JS}`,
      `protocolVersion ${PROTOCOL_VERSION}`,
      '',
    ].join('\n'),
  )
}, 120_000)

afterAll(async () => {
  for (const center of processes) {
    if (center.running) await center.kill()
    evidence.output(`center/${center.label}.stderr.jsonl`, center.stderr())
    if (center.stdout() !== '')
      evidence.output(`center/${center.label}.stdout.txt`, center.stdout())
  }
  evidence.output('anomalies.txt', `${anomalies.join('\n')}\n`)
  evidence.flush()
  const scan = evidence.scan()
  evidence.output(
    'secret-scan.txt',
    [
      `scanned ${String(scan.files)} files under the evidence root after writing`,
      `secrets: ${String(evidence.secrets.all.length)} (${['presentation', 'credential', 'private-key'].map(kind => `${kind} ${String(evidence.secrets.all.filter(s => s.kind === kind).length)}`).join(', ')})`,
      `forms: ${secretForms('x')
        .map(f => f.form)
        .join(', ')}`,
      `hits: ${String(scan.hits.length)}`,
      ...scan.hits.map(hit => `  ${hit.file} ${hit.kind} ${hit.form}`),
      '',
    ].join('\n'),
  )
  const secretsOut = process.env['OMNE_E2E_SECRETS_OUT']
  if (secretsOut !== undefined)
    writeFileSync(
      secretsOut,
      `${evidence.secrets.all.flatMap(s => secretForms(s.value).map(f => f.text)).join('\n')}\n`,
      { mode: 0o600 },
    )
  if (
    process.env['OMNE_E2E_EVIDENCE_DIR'] === undefined &&
    process.env['OMNE_E2E_KEEP'] === undefined
  )
    rmSync(root, { recursive: true, force: true })
  expect(scan.hits, 'evidence must not contain any secret').toEqual([])
}, 120_000)

describe('e2e：治理中心作为可部署应用的黑盒旅程（部署方式起进程，另一进程只凭线上契约驱动）', () => {
  it('测量自检：本套件比对用的四份固定字节与 HB examples §1、§3 标注的 SHA-256 一致', () => {
    const answers: readonly EntryAnswer[] = [
      'version-mismatch',
      'login-state-rejected',
      'unavailable',
      'invalid-input',
    ]
    for (const answer of answers) expect(sha256(FIXED[answer]), answer).toBe(FIXED_SHA256[answer])
    expect(FIXED['version-mismatch'].length).toBe(133)
    expect(FIXED['login-state-rejected'].length).toBe(137)
  })

  it('测量自检：客户端按 HB S-17 读答复——读得出的四类都认得，读不成的一律问不到，不猜', () => {
    const wire = (received: Buffer, requestWritten = true) => ({
      requestWritten,
      tls: undefined,
      received,
      error: undefined,
      timedOut: false,
    })
    const raw = (status: string, body: string) =>
      Buffer.from(
        `HTTP/1.1 ${status}\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\n\r\n${body}`,
      )
    expect(readReply(wire(FIXED['login-state-rejected']), 'envelope')).toEqual({
      kind: 'entry',
      answer: 'login-state-rejected',
    })
    // 第 2 步只看体：状态码不是 200 也认得出版本对不上
    expect(readReply(wire(raw('426 Upgrade', '"version-mismatch"')), 'envelope')).toEqual({
      kind: 'entry',
      answer: 'version-mismatch',
    })
    expect(readReply(wire(answerBytes('{"failure":"notAuthorized"}')), 'envelope')).toEqual({
      kind: 'failure',
      name: 'notAuthorized',
    })
    for (const [why, bytes] of [
      ['nothing', Buffer.alloc(0)],
      ['cut short', FIXED['unavailable'].subarray(0, 120)],
      ['bytes after the answer', Buffer.concat([FIXED['unavailable'], Buffer.from('x')])],
      ['status 500', raw('500 Internal Server Error', '"unavailable"')],
      ['not JSON', raw('200 OK', 'unavailable')],
      ['another string', raw('200 OK', '"denied"')],
      ['result plus extra member', raw('200 OK', '{"result":1,"extra":2}')],
    ] as const)
      expect(readReply(wire(bytes), 'envelope').kind, why).toBe('unreachable')
    expect(readReply(wire(FIXED['invalid-input'], false), 'envelope').kind).toBe('unreachable')
    expect(
      readReply(wire(answerBytes('{"reachable":true,"centerId":"x","version":"1"}')), 'envelope')
        .kind,
    ).toBe('unreachable')
  })

  it('测量自检：证据目录的秘密搜查五种形式都搜得出、遮蔽后搜不出；本目录的源码不 import 任何产品包', () => {
    const probeRoot = tempRoot('scan-selfcheck')
    try {
      const probe = new Evidence(probeRoot)
      const planted = randomBytes(24).toString('base64url')
      probe.secrets.add(planted, 'presentation')
      expect(probe.secrets.mask(`a ${planted} b`)).toBe('a *** b')
      probe.output('masked.txt', `x ${planted} y`)
      expect(probe.scan().hits).toEqual([])
      for (const form of secretForms(planted)) {
        writeFileSync(join(probeRoot, 'output', `planted-${form.form}.txt`), `.. ${form.text} ..`)
        expect(
          probe.scan().hits.some(hit => hit.form === form.form),
          form.form,
        ).toBe(true)
      }
    } finally {
      rmSync(probeRoot, { recursive: true, force: true })
    }
    for (const file of readdirSync(import.meta.dirname).filter(name => name.endsWith('.ts'))) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8')
      const imports = [...source.matchAll(/(?:^import|\bfrom) '([^']+)'/gm)].map(m => m[1] ?? '')
      expect(imports.length, file).toBeGreaterThan(0)
      for (const specifier of imports) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/^@omne-harness-lite\//)
        expect(specifier, `${file} imports ${specifier}`).toMatch(
          /^(node:|vitest$|\.\/[a-z]+\.ts$)/,
        )
      }
    }
  })

  describe('一、起不来时点名差的是什么 [PF-017 §一 第 1、2 行；§三「不半开」]', () => {
    const reasons: string[] = []

    it('[PF-017 §一「第一次启动，密钥没给」] 退出 1、恰一条 startup-failed 点名部署密钥；什么都没留下', async () => {
      const d = { ...dA, dbFile: join(root, 'no-key', 'center.sqlite'), opsDir: opsDirectory(root) }
      mkdirSync(join(root, 'no-key'))
      const run = await serveFails('no-deployment-key', without(envOf(d), Object.keys(dA.keys)))
      expect(run.code).toBe(1)
      const [failure, ...more] = startupFailures(run)
      expect(more).toEqual([])
      expect(String(failure?.['item'])).toMatch(/^OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM/)
      reasons.push(`${String(failure?.['stage'])}:${String(failure?.['item'])}`)
      expect(existsSync(d.dbFile), '库文件没有被建出来').toBe(false)
      expect(readdirSync(d.opsDir), '运维面套接字没有被建出来').toEqual([])
    })

    it('[PF-017 §一「某一项部署参数没给」；§三「参数缺一不可」] 五项逐一拿掉：各自起不来并点名那一项', async () => {
      for (const variable of PARAMETER_VARIABLES) {
        const run = await serveFails(`missing-${variable}`, without(envOf(dA), [variable]))
        expect(run.code, variable).toBe(1)
        const [failure, ...more] = startupFailures(run)
        expect(more).toEqual([])
        expect(failure?.['item'], variable).toBe(variable)
        reasons.push(`${String(failure?.['stage'])}:${String(failure?.['item'])}`)
      }
      expect(existsSync(dA.dbFile)).toBe(false)
    })

    it('[PF-017 §三「不半开」] 拿掉数据所在（库文件的目录不存在）与 TLS 私钥：同样起不来；各次原因互不相同', async () => {
      const noStorage = await serveFails(
        'storage-unreachable',
        envOf({ ...dA, dbFile: join(root, 'no-such-directory', 'center.sqlite') }),
      )
      expect(noStorage.code).toBe(1)
      const [storageFailure, ...moreStorage] = startupFailures(noStorage)
      expect(moreStorage).toEqual([])
      reasons.push(`${String(storageFailure?.['stage'])}:${String(storageFailure?.['item'])}`)
      const noTlsKey = await serveFails(
        'missing-tls-private-key',
        without(envOf(dA), [ENV.entryTlsPrivateKeyFile]),
      )
      expect(noTlsKey.code).toBe(1)
      const [tlsFailure] = startupFailures(noTlsKey)
      expect(String(tlsFailure?.['item'])).toMatch(/^OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM/)
      reasons.push(`${String(tlsFailure?.['stage'])}:${String(tlsFailure?.['item'])}`)
      expect(reasons).toHaveLength(8)
      expect(new Set(reasons).size, reasons.join(' | ')).toBe(reasons.length)
      expect(existsSync(dA.dbFile)).toBe(false)
    })
  })

  describe('二、第一次起来 [PF-017 §一 第 3、40、41 行；§三「生来是空的」「体检只说部署」]', () => {
    it('[PF-017 §一「第一次启动成功」「运维者看完整体检」] 运维面完整体检十项按书写次序；参数即配置值；密钥在且完整', async () => {
      scenario('pf017-first-start')
      const health = await start('A-1-first-start', dA)
      const h = expectKeys(health, FULL_HEALTH_KEYS, 'full health')
      expect(h['reachable']).toBe(true)
      expect(h['centerId']).toMatch(CENTER_ID)
      centerIdA = asString(h['centerId'], 'centerId')
      expect(h['startedAt']).toMatch(INSTANT)
      expect([
        h['storageReachable'],
        h['deploymentKeyPresent'],
        h['deploymentKeyComplete'],
      ]).toEqual([true, true, true])
      expect([h['clockSane'], h['defectCount']]).toEqual([true, 0])
      const parameters = expectKeys(h['deploymentParameters'], PARAMETER_KEYS, 'parameters')
      expect(parameters).toEqual({
        unactivatedRetention: 7 * DAY,
        invitationTtlDefault: 14 * DAY,
        affiliationRequestTtlDefault: 14 * DAY,
        copyNoticeTtlDefault: 7 * DAY,
        sharingInvitationTtlDefault: 7 * DAY,
      })
      cA = client(address(dA), { observe })
    })

    it('[PF-017 §一「一个还没登录的人看体检」；HB S-15] 公开体检未登录可答、恰三样、同一标识与版本；一次运行期间同一份字节，方法路径与头不看', async () => {
      scenario('pf017-public-health')
      const first = await publicHealth(cA)
      expect(first.reply).toEqual({
        kind: 'public-health',
        value: { reachable: true, centerId: centerIdA, version: expect.any(String) },
      })
      const body = parseHttpAnswer(first.wire.received)
      if (typeof body === 'string') throw new Error(body)
      expectKeys(
        JSON.parse(body.body.toString('utf8')),
        ['reachable', 'centerId', 'version'],
        'public health body',
      )
      const other = await publicHealth(cA, 'public-health GET /x', {
        method: 'GET',
        path: '/x',
        host: null,
        headers: [['User-Agent', 'another-program/1']],
      })
      expect(text(other)).toBe(text(first))
    })

    it('[PF-017 §三「生来是空的」；§二「中心里存在一个没人注册过的账号」] 刚立起来：任何标识与凭据都登录不了，答复逐字相同', async () => {
      scenario('pf017-born-empty')
      const answers = new Set<string>()
      for (const [identifier, credential] of [
        ['admin', 'admin'],
        ['root', 'password'],
        ['administrator', password()],
        ['operator@example.invalid', password()],
        ['ada@example.invalid', password()],
      ] as const) {
        const e = await call(
          cA,
          'login',
          { loginIdentifier: identifier, credential },
          undefined,
          `login ${identifier}`,
        )
        expectFailure(e, 'identifier-or-credential-rejected')
        answers.add(text(e))
      }
      expect(answers.size).toBe(1)
    })
  })

  describe('三、PF-001 主要旅程与分支 [PF-001 flows §1.1～1.8、§二；PF-017 §一 第 4、5 行]', () => {
    it('[PF-001 §1.1；PF-017 §一「第一个人来」] 注册 ⇒ registered；登录可用；个人组织与第一个租户已在，他是那里的超管；第二、三个人走一模一样的步骤', async () => {
      scenario('pf001-1.1-register')
      for (const name of ['ada', 'bob', 'cy']) {
        const registered = await register(cA, account(name), `${name}:register`)
        expect(expectResult(registered)).toBe('registered')
        expect(text(registered).endsWith('\r\n\r\n{"result":"registered"}')).toBe(true)
        logins.set(`${name}1`, await logIn(cA, account(name), `${name}:login`))
        const current = asTenantId(expectResult(await as(`${name}1`, 'currentTenant')))
        tenants.set(name, current)
        tenants.set(`${name}1`, current)
        expect(await myTenants(`${name}1`)).toEqual([current])
        expect(
          expectResult(
            await as(`${name}1`, 'readOrganization', { organization: current.organization }),
          ),
        ).toEqual({ organization: current.organization, organizationKind: 'personal' })
        expect(
          expectResult(await as(`${name}1`, 'membershipStanding', { tenant: current })),
        ).toEqual({
          standing: 'effective',
          role: 'superAdministrator',
        })
      }
      expect(new Set(['ada', 'bob', 'cy'].map(n => personal(n).organization)).size).toBe(3)
    })

    it('[PF-001 §二 注册 1] 标识已被占用（同凭据、不同凭据同一答复）；凭据不合规则 ⇒ credential-rejected 且标识没被占住；表示层不合格 ⇒ invalid-input', async () => {
      scenario('pf001-2-register-branches')
      const same = await register(cA, account('ada'), 'ada again, same credential')
      expectFailure(same, 'identifier-taken')
      const different = await register(
        cA,
        { loginIdentifier: account('ada').loginIdentifier, credential: password() },
        'ada again, another credential',
      )
      expectFailure(different, 'identifier-taken')
      expect(text(different)).toBe(text(same))
      const weak = { loginIdentifier: 'weak@example.invalid', credential: 'short' }
      const rejected = await register(cA, weak, 'weak credential')
      expectFailure(rejected, 'credential-rejected')
      noteAnomaly(
        'A-2',
        'PF-001 flows §二「注册 1：凭据不符合规则 ⇒ 具体哪条规则不满足」 vs EC S-7／Schema RouteFailure（只有具名值）',
        rejected,
        '凭据短于政策的最短长度（minLength 12，给了 5 个字符）',
      )
      const strong = await register(
        cA,
        { loginIdentifier: weak.loginIdentifier, credential: password() },
        'same identifier, compliant credential',
      )
      expect(expectResult(strong)).toBe('registered')
      expectEntry(
        await register(cA, { loginIdentifier: '', credential: password() }, 'empty identifier'),
        'invalid-input',
      )
      expectEntry(
        await register(
          cA,
          { loginIdentifier: 'x@example.invalid', credential: '' },
          'empty credential',
        ),
        'invalid-input',
      )
    })

    it('[PF-001 §1.2、§二 登录 2] 登录交出出示物与句柄；标识不存在与凭据错误的答复逐字相同', async () => {
      scenario('pf001-1.2-login')
      const ada2 = await logIn(cA, account('ada'), 'ada:login again')
      logins.set('ada2', ada2)
      expect(ada2.handle).not.toBe(login('ada1').handle)
      expect(ada2.presentation).not.toBe(login('ada1').presentation)
      expect(asTenantId(expectResult(await as('ada2', 'currentTenant')))).toEqual(personal('ada'))
      const wrong = await call(
        cA,
        'login',
        { loginIdentifier: account('ada').loginIdentifier, credential: password() },
        undefined,
        'wrong credential',
      )
      const unknown = await call(
        cA,
        'login',
        { loginIdentifier: 'nobody@example.invalid', credential: password() },
        undefined,
        'unknown identifier',
      )
      expectFailure(wrong, 'identifier-or-credential-rejected')
      expect(text(unknown)).toBe(text(wrong))
    })

    it('[PF-001 §1.3；PF-017 §一「列出本账号的登录状态」] 列出本账号全部有效登录状态、各带签发时间；逐个撤销、其余不受影响；选中自己即退出；撤销后立刻被拒；列表项当出示物用不了', async () => {
      scenario('pf001-1.3-logout-list-revoke')
      logins.set('ada3', await logIn(cA, account('ada'), 'ada:login 3'))
      logins.set('ada4', await logIn(cA, account('ada'), 'ada:login 4'))
      const listed = asArray(expectResult(await as('ada1', 'listLoginStates')), 'login states')
      const handles = listed.map(item => {
        const entry = expectKeys(item, ['loginStateHandle', 'issuedAt'], 'list item')
        expect(entry['issuedAt']).toMatch(INSTANT)
        return asString(entry['loginStateHandle'], 'handle')
      })
      expect(new Set(handles)).toEqual(
        new Set(['ada1', 'ada2', 'ada3', 'ada4'].map(n => login(n).handle)),
      )
      expect(
        expectResult(
          await as('ada1', 'revokeLoginState', { loginStateHandle: login('ada3').handle }),
        ),
      ).toBe('ok')
      expectEntry(await as('ada3', 'myTenants'), 'login-state-rejected')
      for (const other of ['ada1', 'ada2', 'ada4']) expectResult(await as(other, 'myTenants'))
      const after = asArray(expectResult(await as('ada2', 'listLoginStates')), 'login states')
      expect(after.map(item => asRecord(item, 'item')['loginStateHandle']).sort()).toEqual(
        ['ada1', 'ada2', 'ada4'].map(n => login(n).handle).sort(),
      )
      expect(
        expectResult(
          await as('ada4', 'revokeLoginState', { loginStateHandle: login('ada4').handle }),
        ),
      ).toBe('ok')
      expectEntry(await as('ada4', 'myTenants'), 'login-state-rejected')
      for (const handle of handles)
        expectEntry(
          await call(cA, 'myTenants', {}, handle, 'list handle used as a presentation'),
          'login-state-rejected',
        )
    })

    it('[PF-001 §二 撤销登录状态 2] 从没签发过的句柄、别人的句柄 ⇒ login-state-not-found；已失效的那一个再撤 ⇒ ok（EC S-20 的幂等；与 PF-001 字面的出入见证据「异常」）；其余不受影响', async () => {
      scenario('pf001-2-revoke-branches')
      expectFailure(
        await as('ada1', 'revokeLoginState', { loginStateHandle: '0'.repeat(64) }),
        'login-state-not-found',
      )
      expectFailure(
        await as('ada1', 'revokeLoginState', { loginStateHandle: login('bob1').handle }),
        'login-state-not-found',
      )
      expectResult(await as('bob1', 'myTenants'))
      const again = await as('ada1', 'revokeLoginState', { loginStateHandle: login('ada3').handle })
      expect(expectResult(again)).toBe('ok')
      noteAnomaly(
        'A-1',
        'PF-001 flows §二「撤销登录状态 2：指定的那一个已经失效 ⇒ 这个登录已经不在有效之列」 vs EC S-20／AI S-16「已撤销 ⇒ ok」',
        again,
        '列表上指定的那一个已被撤销之后再撤它',
      )
      expectResult(await as('ada2', 'myTenants'))
    })

    it('[PF-001 §1.4；PF-017 §一「第二个人来，也建了一个组织」] 团队组织一次建成、创建者即超管；带创建键重发认回同一个；先来者没有特殊待遇', async () => {
      scenario('pf001-1.4-create-organization')
      const x = asString(
        expectResult(await as('ada1', 'createOrganization', { creationKey: 'e2e-org-x' })),
        'X',
      )
      expect(
        expectResult(await as('ada1', 'createOrganization', { creationKey: 'e2e-org-x' })),
      ).toBe(x)
      ids.set('X', x)
      tenants.set('X:ada', { organization: x, account: personal('ada').account })
      expect(expectResult(await as('ada1', 'readOrganization', { organization: x }))).toEqual({
        organization: x,
        organizationKind: 'team',
      })
      expect(
        expectResult(await as('ada1', 'membershipStanding', { tenant: tenants.get('X:ada') })),
      ).toEqual({
        standing: 'effective',
        role: 'superAdministrator',
      })
      expect(await myTenants('ada1')).toEqual(
        expect.arrayContaining([personal('ada'), tenants.get('X:ada')]),
      )
      const y = asString(expectResult(await as('cy1', 'createOrganization')), 'Y')
      ids.set('Y', y)
      tenants.set('Y:cy', { organization: y, account: personal('cy').account })
      expect(
        expectResult(await as('cy1', 'membershipStanding', { tenant: tenants.get('Y:cy') })),
      ).toEqual({
        standing: 'effective',
        role: 'superAdministrator',
      })
      expectFailure(await as('ada1', 'readOrganization', { organization: y }), 'notAuthorized')
    })

    it('[PF-001 §1.5、§1.8] 个人组织不能发起邀请；切到团队组织后超管邀请、被邀请者看到并接受、租户产生；默认时长按部署参数', async () => {
      scenario('pf001-1.5-invite-join')
      expectFailure(
        await as('ada1', 'invite', { invitedAccount: personal('bob').account }),
        'issuerIsPersonalOrganization',
      )
      await switchTo('ada1', tenants.get('X:ada') ?? personal('ada'))
      expect(asTenantId(expectResult(await as('ada1', 'currentTenant')))).toEqual(
        tenants.get('X:ada'),
      )
      const inv1 = await invite('ada1', 'bob')
      const received = asArray(
        expectResult(await as('bob1', 'listReceivedInvitations')),
        'received',
      )
      const view = invitationView(
        received.find(item => asRecord(item, 'view')['invitation'] === inv1),
      )
      expect(view).toMatchObject({
        invitation: inv1,
        issuerOrganization: id('X'),
        invitedAccount: personal('bob').account,
        role: 'member',
        offerState: 'pending',
      })
      expect(millisBetween(view['offerTiming'])).toBe(14 * DAY)
      const joined = asTenantId(
        expectResult(await as('bob1', 'acceptInvitation', { invitation: inv1 })),
      )
      expect(joined).toEqual({ organization: id('X'), account: personal('bob').account })
      tenants.set('X:bob', joined)
      expect(await myTenants('bob1')).toEqual(expect.arrayContaining([personal('bob'), joined]))
      const members = asArray(expectResult(await as('ada1', 'listMembers')), 'members')
      expect(members).toEqual(
        expect.arrayContaining([
          { tenant: tenants.get('X:ada'), role: 'superAdministrator', effective: true },
          { tenant: joined, role: 'member', effective: true },
        ]),
      )
      expect(members).toHaveLength(2)
    })

    it('[PF-001 §二 加入 2；flows §四 角色与操作] 过期与撤回的邀请都不再有效；已是成员再邀被拒；普通成员不能邀请、看不到发出的邀约，但看得到只含有效成员的名单', async () => {
      scenario('pf001-2-invite-branches')
      const expiring = await invite('ada1', 'cy', { offerTtl: 1000 })
      await sleep(1500)
      expectFailure(
        await as('cy1', 'acceptInvitation', { invitation: expiring }),
        'offerNoLongerValid',
      )
      expect((await readInvitation('cy1', expiring, 'account'))['offerState']).toBe('expired')
      const withdrawn = await invite('ada1', 'cy')
      expect(expectResult(await as('ada1', 'withdrawInvitation', { invitation: withdrawn }))).toBe(
        'ok',
      )
      expectFailure(
        await as('cy1', 'acceptInvitation', { invitation: withdrawn }),
        'offerNoLongerValid',
      )
      expect((await readInvitation('cy1', withdrawn, 'account'))['offerState']).toBe('withdrawn')
      const pending = asArray(expectResult(await as('cy1', 'listReceivedInvitations')), 'received')
      expect(pending.map(item => asRecord(item, 'view')['invitation'])).not.toEqual(
        expect.arrayContaining([expiring]),
      )
      expect(pending.map(item => asRecord(item, 'view')['invitation'])).not.toEqual(
        expect.arrayContaining([withdrawn]),
      )
      expectFailure(
        await as('ada1', 'invite', { invitedAccount: personal('bob').account }),
        'alreadyAnEffectiveMember',
      )
      await switchTo('bob1', tenants.get('X:bob') ?? personal('bob'))
      expectFailure(
        await as('bob1', 'invite', { invitedAccount: personal('cy').account }),
        'notAuthorized',
      )
      expectFailure(await as('bob1', 'listIssuedOffers'), 'notAuthorized')
      const roster = asArray(expectResult(await as('bob1', 'listMembers')), 'members')
      expect(roster).toHaveLength(2)
      expectFailure(await as('bob1', 'listMembers', { includeIneffective: true }), 'notAuthorized')
    })

    it('[PF-001 §1.6、§3.3] 本人退出、超管移除；再加入回来的是同一个租户；个人组织退不了；最后一位超管退不了', async () => {
      scenario('pf001-1.6-leave')
      const xBob = tenants.get('X:bob') ?? personal('bob')
      expect(expectResult(await as('bob1', 'removeMember', { targetTenant: xBob }))).toBe('ok')
      expect(expectResult(await as('ada1', 'membershipStanding', { tenant: xBob }))).toEqual({
        standing: 'ineffective',
      })
      expect(await myTenants('bob1')).not.toEqual(expect.arrayContaining([xBob]))
      expectFailure(await as('bob1', 'membershipStanding', { tenant: xBob }), 'notAuthorized')
      const current = asArray(expectResult(await as('ada1', 'listMembers')), 'members')
      expect(current).toEqual([
        { tenant: tenants.get('X:ada'), role: 'superAdministrator', effective: true },
      ])
      expect(
        asArray(expectResult(await as('ada1', 'listMembers', { includeIneffective: true })), 'all'),
      ).toEqual(expect.arrayContaining([{ tenant: xBob, role: 'member', effective: false }]))
      const again = await invite('ada1', 'bob')
      expect(
        asTenantId(expectResult(await as('bob1', 'acceptInvitation', { invitation: again }))),
      ).toEqual(xBob)
      expect(expectResult(await as('ada1', 'removeMember', { targetTenant: xBob }))).toBe('ok')
      expect(await myTenants('bob1')).not.toEqual(expect.arrayContaining([xBob]))
      expectFailure(
        await as('ada1', 'removeMember', { targetTenant: tenants.get('X:ada') }),
        'wouldLeaveNoSuperAdministrator',
      )
      await switchTo('ada1', personal('ada'))
      expectFailure(
        await as('ada1', 'removeMember', { targetTenant: personal('ada') }),
        'personalOrganizationMemberCannotLeave',
      )
      await switchTo('ada1', tenants.get('X:ada') ?? personal('ada'))
    })

    it('[PF-001 §1.7] 两个不同账号建的组织：一方发起、另一方接受才建立；接受不产生租户；解除是单方面的', async () => {
      scenario('pf001-1.7-affiliation')
      await switchTo('cy1', tenants.get('Y:cy') ?? personal('cy'))
      const request = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: id('Y'),
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      const incoming = asArray(
        expectResult(await as('cy1', 'listIncomingAffiliationRequests')),
        'incoming',
      )
      const view = expectKeys(
        incoming.find(item => asRecord(item, 'view')['affiliationRequest'] === request),
        ['affiliationRequest', 'issuerOrganization', 'direction', 'offerTiming', 'offerState'],
        'IncomingAffiliationRequestView',
      )
      expect(view).toMatchObject({
        issuerOrganization: id('X'),
        direction: 'recipientAsParent',
        offerState: 'pending',
      })
      expect(millisBetween(view['offerTiming'])).toBe(14 * DAY)
      const tenantsBefore = [await myTenants('ada1'), await myTenants('cy1')]
      expect(
        expectResult(await as('cy1', 'acceptAffiliationRequest', { affiliationRequest: request })),
      ).toBe('ok')
      expect(expectResult(await as('ada1', 'readOrganization', { organization: id('X') }))).toEqual(
        {
          organization: id('X'),
          organizationKind: 'team',
          parentOrganization: id('Y'),
        },
      )
      expect(expectResult(await as('ada1', 'superiorChain', { organizations: [id('X')] }))).toEqual(
        [id('Y')],
      )
      expect([await myTenants('ada1'), await myTenants('cy1')]).toEqual(tenantsBefore)
      expect(
        expectResult(await as('cy1', 'dissolveAffiliation', { childOrganization: id('X') })),
      ).toBe('ok')
      expect(expectResult(await as('ada1', 'readOrganization', { organization: id('X') }))).toEqual(
        {
          organization: id('X'),
          organizationKind: 'team',
        },
      )
      // 已解除后由下级一方重发：两种读法都得 noSuchAffiliation（OG S-33 ⑦、EC S-21「重发」一列）
      expectFailure(
        await as('ada1', 'dissolveAffiliation', { childOrganization: id('X') }),
        'noSuchAffiliation',
      )
      // 由原上级一方重发：EC S-21「已解除后重发 ⇒ noSuchAffiliation」与 OG S-33 ②「任一方」在关系已不在时怎样读，
      // 契约没有写定——只记下观察，不判通过或失败（证据 README「异常」A-3）
      noteAnomaly(
        'A-3',
        'EC S-21 解除隶属「重发」一列 vs OG S-33 ②⑦',
        await as('cy1', 'dissolveAffiliation', { childOrganization: id('X') }),
        '原上级一方（cy，Y 的超管）在解除之后重发同一次解除',
      )
    })

    it('[PF-001 §二 建立隶属] 个人组织不参与；撤回与过期的请求不再有效；会成环、己方已有上级 ⇒ 关系未建立；同一人两个组织自发自受', async () => {
      scenario('pf001-2-affiliation-branches')
      expectFailure(
        await as('ada1', 'requestAffiliation', {
          recipientOrganization: personal('cy').organization,
          direction: 'recipientAsParent',
        }),
        'personalOrganizationTakesNoPartInAffiliation',
      )
      expectFailure(
        await as('ada1', 'requestAffiliation', {
          recipientOrganization: id('X'),
          direction: 'recipientAsParent',
        }),
        'wouldFormACycle',
      )
      const withdrawn = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: id('Y'),
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      expect(
        expectResult(
          await as('ada1', 'withdrawAffiliationRequest', { affiliationRequest: withdrawn }),
        ),
      ).toBe('ok')
      expectFailure(
        await as('cy1', 'acceptAffiliationRequest', { affiliationRequest: withdrawn }),
        'offerNoLongerValid',
      )
      const expiring = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: id('Y'),
            direction: 'recipientAsParent',
            offerTtl: 1000,
          }),
        ),
        'request',
      )
      await sleep(1500)
      expectFailure(
        await as('cy1', 'acceptAffiliationRequest', { affiliationRequest: expiring }),
        'offerNoLongerValid',
      )
      const standing1 = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: id('Y'),
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      expect(
        expectResult(
          await as('cy1', 'acceptAffiliationRequest', { affiliationRequest: standing1 }),
        ),
      ).toBe('ok')
      const cycle = asString(
        expectResult(
          await as('cy1', 'requestAffiliation', {
            recipientOrganization: id('X'),
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      expectFailure(
        await as('ada1', 'acceptAffiliationRequest', { affiliationRequest: cycle }),
        'wouldFormACycle',
      )
      const z = asString(expectResult(await as('cy1', 'createOrganization')), 'Z')
      ids.set('Z', z)
      const second = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: z,
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      await switchTo('cy1', { organization: z, account: personal('cy').account })
      expectFailure(
        await as('cy1', 'acceptAffiliationRequest', { affiliationRequest: second }),
        'alreadyHasAParentOrganization',
      )
      await switchTo('cy1', tenants.get('Y:cy') ?? personal('cy'))
      const x2 = asString(expectResult(await as('ada1', 'createOrganization')), 'X2')
      ids.set('X2', x2)
      tenants.set('X2:ada', { organization: x2, account: personal('ada').account })
      await switchTo('ada1', tenants.get('X2:ada') ?? personal('ada'))
      const own = asString(
        expectResult(
          await as('ada1', 'requestAffiliation', {
            recipientOrganization: id('X'),
            direction: 'recipientAsParent',
          }),
        ),
        'request',
      )
      await switchTo('ada1', tenants.get('X:ada') ?? personal('ada'))
      expect(
        expectResult(await as('ada1', 'acceptAffiliationRequest', { affiliationRequest: own })),
      ).toBe('ok')
      expect(expectResult(await as('ada1', 'superiorChain', { organizations: [x2] }))).toEqual([
        id('X'),
        id('Y'),
      ])
    })

    it('[PF-001 §1.8、§二 切换 1] 不在目标组织 ⇒ membershipNotEffective；别人的租户 ⇒ notOwnTenant；切换之后新建的东西落在新组织，之前的不动；账号身份不变', async () => {
      scenario('pf001-1.8-switch')
      expectFailure(
        await as('ada1', 'switchTenant', {
          targetTenant: { organization: id('Y'), account: personal('ada').account },
        }),
        'membershipNotEffective',
      )
      expectFailure(
        await as('ada1', 'switchTenant', { targetTenant: tenants.get('Y:cy') }),
        'notOwnTenant',
      )
      expect(asTenantId(expectResult(await as('ada1', 'currentTenant')))).toEqual(
        tenants.get('X:ada'),
      )
      const fromX = await invite('ada1', 'cy')
      await switchTo('ada1', tenants.get('X2:ada') ?? personal('ada'))
      const current = asTenantId(expectResult(await as('ada1', 'currentTenant')))
      expect(current).toEqual(tenants.get('X2:ada'))
      expect(current.account).toBe(personal('ada').account)
      const fromX2 = await invite('ada1', 'cy')
      expect((await readInvitation('cy1', fromX2, 'account'))['issuerOrganization']).toBe(id('X2'))
      expect((await readInvitation('cy1', fromX, 'account'))['issuerOrganization']).toBe(id('X'))
      await switchTo('ada1', tenants.get('X:ada') ?? personal('ada'))
      ids.set('invitation-for-cy', fromX)
    })

    it('[PF-001 §二「移除或降级超管：两位超管同时移除或降级对方」、§3.3「同时发生也只有一种收场」] 两位超管在两条连接上同时降级、再同时移除对方：每轮恰一方成立，另一方得到与单次被拒逐字相同的答复，组织始终有一位超管', async () => {
      scenario('pf001-2-concurrent-super-administrators')
      const w = asString(expectResult(await as('ada1', 'createOrganization')), 'W')
      const wAda = { organization: w, account: personal('ada').account }
      const wCy = { organization: w, account: personal('cy').account }
      await switchTo('ada1', wAda)
      const invitation = await invite('ada1', 'cy', { role: 'superAdministrator' })
      expect(asTenantId(expectResult(await as('cy1', 'acceptInvitation', { invitation })))).toEqual(
        wCy,
      )
      await switchTo('cy1', wCy)
      // 单次被拒的样子：只剩一位超管时他把自己降级
      const superAdministrators = async (reader: string) =>
        asArray(expectResult(await as(reader, 'listMembers')), 'members')
          .map(m => asRecord(m, 'member'))
          .filter(m => m['role'] === 'superAdministrator' && m['effective'] === true)
      const rounds: [string, (self: string, other: TenantId) => Promise<Exchange>][] = [
        [
          'demote',
          (self, other) => as(self, 'changeRole', { targetTenant: other, role: 'member' }),
        ],
        ['remove', (self, other) => as(self, 'removeMember', { targetTenant: other })],
      ]
      for (const [round, act] of rounds) {
        const [byAda, byCy] = await Promise.all([act('ada1', wCy), act('cy1', wAda)])
        const outcomes = [describeExchange(byAda), describeExchange(byCy)].sort()
        expect(outcomes, round).toEqual(['failure wouldLeaveNoSuperAdministrator', 'result "ok"'])
        // 被拒的那一次是后成的；先成的那一次把对方降级／移除了，所以仍是超管的是先成的那一方
        const loser = byAda.reply.kind === 'failure' ? byAda : byCy
        const survivor = byAda.reply.kind === 'failure' ? 'cy1' : 'ada1'
        const survivorTenant = survivor === 'ada1' ? wAda : wCy
        const single = await as(survivor, 'changeRole', {
          targetTenant: survivorTenant,
          role: 'member',
        })
        expect(text(loser), round).toBe(text(single))
        expect(await superAdministrators(survivor), round).toHaveLength(1)
        if (round === 'demote') {
          const demoted = survivor === 'ada1' ? wCy : wAda
          expect(
            expectResult(
              await as(survivor, 'changeRole', {
                targetTenant: demoted,
                role: 'superAdministrator',
              }),
            ),
          ).toBe('ok')
          expect(await superAdministrators(survivor)).toHaveLength(2)
        }
      }
      await switchTo('ada1', tenants.get('X:ada') ?? personal('ada'))
      await switchTo('cy1', tenants.get('Y:cy') ?? personal('cy'))
    })

    it('[手动演练入口] walk.ts 与套件共用驱动器：另起一个 Node 进程走注册→登录→建组织→邀请→接受；它打印的东西里没有一样能当出示物用', async () => {
      scenario('walk-entry')
      const walk = join(import.meta.dirname, 'walk.ts')
      const run = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
        done => {
          const child = spawn(
            process.execPath,
            [
              '--experimental-strip-types',
              '--no-warnings',
              walk,
              // 简报给的形式：地址与 CA 文件，主机名按 D-029 ② 取地址的主机部分（证书里有 IP:127.0.0.1）
              `127.0.0.1:${String(dA.port)}`,
              ca.certFile,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          )
          let stdout = ''
          let stderr = ''
          child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
          child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
          child.once('exit', code => setImmediate(() => done({ code, stdout, stderr })))
        },
      )
      evidence.output('walk/stdout.txt', run.stdout)
      evidence.output('walk/stderr.txt', run.stderr)
      expect(run.code, run.stderr).toBe(0)
      expect(run.stdout).toContain('走完')
      expect(run.stdout).toContain('"presentedLoginState":"***"')
      expect(run.stdout).toContain('"credential":"***"')
      const tokens = new Set(run.stdout.match(/[A-Za-z0-9_-]{20,}/g) ?? [])
      expect(tokens.size).toBeGreaterThan(0)
      for (const token of tokens)
        expectEntry(
          await call(cA, 'myTenants', {}, token, 'walk output token as a presentation'),
          'login-state-rejected',
        )
    })
  })

  describe('四、中心只认自己签发且此刻有效的登录状态 [PF-017 §一 第 6～10、14、17、18 行；§二 第 2、3、5、6、21、末行；§三]', () => {
    let foreign = ''

    it('[PF-017 §二「两个不同的中心标识相同」；§三「从零立两个中心，标识不同」] 另立一个中心 B：标识不同；在 B 签发一个登录状态', async () => {
      scenario('pf017-second-center')
      const keysB = await keygen(join(root, 'keys-b'), command)
      for (const path of Object.values(keysB)) {
        const pem = readFileSync(path, 'utf8')
        keyFileContents.push(pem)
        if (pem.includes('PRIVATE KEY')) evidence.secrets.add(pem, 'private-key')
      }
      mkdirSync(join(root, 'b'))
      const dB: Deployment = {
        ...dA,
        dbFile: join(root, 'b', 'center.sqlite'),
        keys: keysB,
        port: await freePort(),
        opsDir: opsDirectory(root),
      }
      const B = CenterProcess.serve('B', envOf(dB), command)
      processes.push(B)
      const health = await B.ready(opsSocketOf(dB))
      evidence.output('health/B-ready.json', `${JSON.stringify(health, null, 2)}\n`)
      expect(health['centerId']).toMatch(CENTER_ID)
      expect(health['centerId']).not.toBe(centerIdA)
      const cB = client(address(dB), { observe })
      const other = { loginIdentifier: account('ada').loginIdentifier, credential: password() }
      expect(expectResult(await register(cB, other, 'B: register ada'))).toBe('registered')
      foreign = (await logIn(cB, other, 'B: login ada')).presentation
      expect(await B.terminate()).toEqual({ code: 0, signal: null })
    })

    it('[PF-017 §一 第 7～10 行、§二「四种不认的情形答复不同」、§三「拒绝逐字相同」；EC S-11] 没带、多个、表示层不合格、从没签发、已撤销、别的中心签的、列表句柄、只放在 Authorization 头：同一件事，线上答复逐字节相同（HB examples §3.1 那 137 个字节）', async () => {
      scenario('pf017-rejections-identical')
      const tenantsBefore = await myTenants('ada1')
      const valid = login('ada1').presentation
      const cases: [string, Promise<Exchange>][] = [
        ['none', call(cA, 'myTenants', {}, undefined, 'none')],
        [
          'two presentations',
          callRaw(
            cA,
            'two presentations',
            `{"protocolVersion":"1","presentedLoginState":${JSON.stringify(valid)},"presentedLoginState":"x","operation":"${ROUTE.myTenants}","payload":{}}`,
          ),
        ],
        ['malformed', call(cA, 'myTenants', {}, ` ${valid}`, 'malformed (leading space)')],
        [
          'never issued',
          call(cA, 'myTenants', {}, randomBytes(32).toString('base64url'), 'never issued'),
        ],
        ['revoked', call(cA, 'myTenants', {}, login('ada3').presentation, 'revoked')],
        ['other center', call(cA, 'myTenants', {}, foreign, 'issued by another center')],
        ['list handle', call(cA, 'myTenants', {}, login('ada1').handle, 'list handle')],
        [
          'authorization header only',
          callRaw(
            cA,
            'Authorization header only',
            envelopeBody({
              protocolVersion: PROTOCOL_VERSION,
              operation: ROUTE.myTenants,
              payload: {},
            }),
            {
              headers: [
                ['Content-Type', 'application/json'],
                ['Authorization', `Bearer ${valid}`],
              ],
            },
          ),
        ],
      ]
      for (const [label, pending] of cases) {
        const e = await pending
        expectEntry(e, 'login-state-rejected')
        expect(sha256(e.wire.received), label).toBe(FIXED_SHA256['login-state-rejected'])
      }
      for (const presentation of [undefined, login('ada3').presentation, foreign])
        expectEntry(
          await call(
            cA,
            'createOrganization',
            {},
            presentation,
            'write route while not recognised',
          ),
          'login-state-rejected',
        )
      expect(await myTenants('ada1')).toEqual(tenantsBefore)
    })

    it('[PF-017 §一「已撤销的登录状态来」] 账号、组织、成员资格原样都在；重新登录得到一个新的登录状态', async () => {
      scenario('pf017-revoked-then-relogin')
      const fresh = await logIn(cA, account('ada'), 'ada: login after revocation')
      logins.set('ada5', fresh)
      expect([login('ada3').handle, login('ada4').handle]).not.toContain(fresh.handle)
      expect(await myTenants('ada5')).toEqual(
        expect.arrayContaining([personal('ada'), tenants.get('X:ada')]),
      )
      expect(
        expectResult(await as('ada5', 'membershipStanding', { tenant: tenants.get('X:ada') })),
      ).toEqual({
        standing: 'effective',
        role: 'superAdministrator',
      })
    })

    it('[PF-017 §一 第 17、18 行；§二「版本对不上时还去判了登录状态」；§三「答复的先后」「版本对不上就明说」] 带有效、已撤销、别的中心的、什么都没带四种来：只得 version-mismatch（133 字节），那件事没有发生；同一客户端读公开体检照常', async () => {
      scenario('pf017-version-mismatch')
      const old = client(address(dA), { protocolVersion: '0-obsolete', observe })
      const before = await myTenants('ada1')
      for (const presentation of [
        login('ada1').presentation,
        login('ada3').presentation,
        foreign,
        undefined,
      ]) {
        const e = await call(
          old,
          'createOrganization',
          {},
          presentation,
          'old client creates an organization',
        )
        expectEntry(e, 'version-mismatch')
        expect(sha256(e.wire.received)).toBe(FIXED_SHA256['version-mismatch'])
      }
      expect(await myTenants('ada1')).toEqual(before)
      const health = await publicHealth(old, 'old client reads public health')
      expect(health.reply).toMatchObject({ kind: 'public-health', value: { centerId: centerIdA } })
    })

    it('[PF-017 §一「输入格式就不对」；§三「答复的先后」] 有效登录状态配格式不对的载荷 ⇒ invalid-input；已撤销的配同一份 ⇒ login-state-rejected（先认人，后看输入）', async () => {
      scenario('pf017-input-after-recognition')
      for (const payload of [
        { invitedAccount: '' },
        { invitedAccount: personal('cy').account, offerTtl: 1.5 },
        {},
      ]) {
        expectEntry(await as('ada1', 'invite', payload), 'invalid-input')
        expectEntry(
          await call(cA, 'invite', payload, login('ada3').presentation, 'revoked + same payload'),
          'login-state-rejected',
        )
      }
    })

    it('[PF-017 §一「不问来者是哪台机器、什么程序」；§二「中心记住并区别对待某个客户端」；§三「只认登录状态，不认客户端」] 同一出示物做同一件事：换来源地址、换方法路径与头、换一个程序（openssl s_client），答复逐字节相同', async () => {
      scenario('pf017-not-the-client')
      const request = httpRequest(
        envelopeBody({
          protocolVersion: PROTOCOL_VERSION,
          presentedLoginState: login('ada1').presentation,
          operation: ROUTE.myTenants,
          payload: {},
        }),
        'localhost',
      )
      const first = await call(
        cA,
        'myTenants',
        {},
        login('ada1').presentation,
        'this client from 127.0.0.1',
      )
      expectResult(first)
      const elsewhere = client(address(dA, { localAddress: '127.0.0.2' }), { observe })
      const script = await callRaw(
        elsewhere,
        'a script from 127.0.0.2: PUT, another path, no Host, other headers',
        envelopeBody({
          protocolVersion: PROTOCOL_VERSION,
          presentedLoginState: login('ada1').presentation,
          operation: ROUTE.myTenants,
          payload: {},
        }),
        {
          method: 'PUT',
          path: '/scripted?via=cron',
          host: null,
          headers: [
            ['User-Agent', 'nightly-script/0.1'],
            ['Connection', 'keep-alive'],
          ],
        },
      )
      expect(text(script)).toBe(text(first))
      const viaOpenssl = await opensslClient(dA.port, ca.certFile, request)
      const wire = {
        requestWritten: true,
        tls: undefined,
        received: viaOpenssl.stdout,
        error: undefined,
        timedOut: false,
      }
      observe({
        label: 'openssl s_client (another program)',
        face: 'client',
        request,
        wire,
        reply: readReply(wire, 'envelope'),
      })
      expect(viaOpenssl.code, viaOpenssl.stderr).toBe(0)
      expect(viaOpenssl.stdout.toString('utf8')).toBe(text(first))
    })

    it('[PF-017 §二「中心认了客户端说它验过了、运维者说放行」] 信封里夹带「已验过」「运维者放行」的成员 ⇒ invalid-input，那件事没做', async () => {
      scenario('pf017-no-vouching')
      const before = await myTenants('ada1')
      for (const extra of [{ verifiedByClient: true }, { approvedByOperator: true }]) {
        const body = JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          operation: ROUTE.createOrganization,
          payload: {},
          ...extra,
        })
        expectEntry(
          await callRaw(cA, `vouching member ${Object.keys(extra).join()}`, body),
          'invalid-input',
        )
      }
      expect(await myTenants('ada1')).toEqual(before)
    })
  })

  describe('五、运维者没有门 [PF-017 §一 第 37～41 行；§二 第 19、20 行；§三「运维者没有门」「体检只说部署」]', () => {
    it('[PF-017 §一「替同事接受邀请、移出、撤销登录状态」；EC S-25] 运维面对任何请求都只答完整体检，事后什么都没变', async () => {
      scenario('pf017-ops-no-door')
      const socket = opsSocketOf(dA)
      const invitation = id('invitation-for-cy')
      const attempts: [string, string, { method?: string; path?: string }][] = [
        [
          'accept invitation for cy',
          envelopeBody({
            protocolVersion: '1',
            operation: ROUTE.acceptInvitation,
            payload: { invitation },
          }),
          {},
        ],
        [
          'remove ada',
          envelopeBody({
            protocolVersion: '1',
            operation: ROUTE.removeMember,
            payload: { targetTenant: tenants.get('X:ada') },
          }),
          {},
        ],
        [
          'revoke ada1',
          envelopeBody({
            protocolVersion: '1',
            operation: ROUTE.revokeLoginState,
            payload: { loginStateHandle: login('ada1').handle },
          }),
          {},
        ],
        [
          'register mallory',
          envelopeBody({
            protocolVersion: '1',
            operation: ROUTE.register,
            payload: { loginIdentifier: 'mallory@example.invalid', credential: password() },
          }),
          {},
        ],
        ['DELETE /accounts/ada', '', { method: 'DELETE', path: '/accounts/ada' }],
        ['GET /admin', '', { method: 'GET', path: '/admin' }],
      ]
      for (const [label, body, shape] of attempts) {
        const e = await fullHealth(socket, `ops: ${label}`, body, shape, observe)
        expectKeys(e.health, FULL_HEALTH_KEYS, label)
      }
      expect((await readInvitation('cy1', invitation, 'account'))['offerState']).toBe('pending')
      expect(
        expectResult(await as('ada1', 'membershipStanding', { tenant: tenants.get('X:ada') })),
      ).toEqual({
        standing: 'effective',
        role: 'superAdministrator',
      })
      expectResult(await as('ada1', 'myTenants'))
      expectFailure(
        await call(
          cA,
          'login',
          { loginIdentifier: 'mallory@example.invalid', credential: password() },
          undefined,
          'mallory login',
        ),
        'identifier-or-credential-rejected',
      )
    })

    it('[PF-017 §一「运维者想撤销某个同事的登录状态」；§二「运维者有任何一条不经登录状态的路」] 进程入口只有 keygen 与 serve，别的子命令一律用法错误', async () => {
      scenario('pf017-cli-no-door')
      for (const args of [
        ['revoke', 'ada'],
        ['accept-invitation'],
        ['remove-member'],
        ['admin'],
        ['users'],
        [],
      ]) {
        const run = await runCli(args, {}, command)
        cliRuns.push({ label: `cli ${args.join(' ')}`, run })
        expect(run.code, args.join(' ')).toBe(2)
        expect(run.stderr).toContain('usage: tenancy-host keygen <directory> | tenancy-host serve')
      }
    })

    it('[PF-017 §一「运维者看完整体检」「运维者想看部署密钥的值」；§二「运维者能从产品里看到谁在里面」] 完整体检里没有账号、组织、登录标识、句柄，也没有密钥内容', async () => {
      scenario('pf017-full-health-scope')
      const e = await fullHealth(
        opsSocketOf(dA),
        'full health after the journeys',
        '{}',
        {},
        observe,
      )
      const h = expectKeys(e.health, FULL_HEALTH_KEYS, 'full health')
      expect(h['defectCount']).toBe(0)
      const body = e.wire.received.toString('utf8')
      const facts = [
        ...[...tenants.values()].flatMap(t => [t.organization, t.account]),
        ...ids.values(),
        ...[...accounts.values()].map(a => a.loginIdentifier),
        ...[...logins.values()].map(l => l.handle),
      ]
      for (const fact of facts) expect(body, fact).not.toContain(fact)
      for (const pem of keyFileContents)
        for (const line of pem.split('\n').filter(l => l.length >= 16 && !l.startsWith('-----')))
          expect(body).not.toContain(line)
    })
  })

  describe('六、重启、强行结束、搬家、重立、换钥、改参数、备份 [PF-017 §一 第 19、22～24、27～31、34、42 行；§二 第 7、8、17 行；§三]', () => {
    it('[PF-017 §一「中心重启」；§二「重启之后有人被退出登录，或已撤销的又能用了」；§三「重启不让任何人退出登录」] SIGTERM 退出 0 再 serve：标识不变；三个此前有效的照常能用；此前撤销的仍被拒', async () => {
      scenario('pf017-restart')
      await stopA()
      const health = await start('A-2-restart', dA)
      expect(health['centerId']).toBe(centerIdA)
      for (const name of ['ada1', 'ada2', 'ada5', 'bob1', 'cy1'])
        expectResult(await as(name, 'myTenants'))
      for (const name of ['ada3', 'ada4'])
        expectEntry(await as(name, 'myTenants'), 'login-state-rejected')
    })

    it('[PF-017 §一「强行结束再起来」「崩掉之后马上重启，钟没动过」「停机那一刻邀请刚发出」；§三「停机」；HB S-16、S-20（闸未开不答）] SIGKILL 后马上 serve：等钟那段两张面都问不到、一个字节不写；不报时钟错，工程记录里看得见等待；已答复成功的注册、邀请、撤销都在；回执没到的那份邀请要么完整在、要么不在', async () => {
      scenario('pf017-kill-restart')
      expect(
        expectResult(await register(cA, account('dan'), 'dan: register before the kill')),
      ).toBe('registered')
      const danLogin = await logIn(cA, account('dan'), 'dan: login before the kill')
      logins.set('dan1', danLogin)
      tenants.set('dan', asTenantId(expectResult(await as('dan1', 'currentTenant'))))
      const invited = await invite('ada1', 'dan')
      expect(
        expectResult(
          await as('ada1', 'revokeLoginState', { loginStateHandle: login('ada2').handle }),
        ),
      ).toBe('ok')
      const issuedBefore = asArray(
        asRecord(
          expectResult(await as('ada1', 'listIssuedOffers', { includeConcluded: true })),
          'issued',
        )['invitations'],
        'invitations',
      ).length
      const center = A
      if (center === undefined) throw new Error('A is not running')
      // 请求一写出就强行结束中心：它可能已提交而回执没送达，也可能还没办——两支都合 §三，只看有没有半份
      const racingRequest = httpRequest(
        envelopeBody({
          protocolVersion: PROTOCOL_VERSION,
          presentedLoginState: login('ada1').presentation,
          operation: ROUTE.invite,
          payload: { invitedAccount: personal('bob').account },
        }),
        'localhost',
      )
      let killed: Promise<unknown> = Promise.resolve()
      const racingWire = await sendTls(address(dA), racingRequest, 10_000, () => {
        killed = center.kill()
      })
      await killed
      expect(center.running).toBe(false)
      A = undefined
      const raced: Exchange = {
        label: 'invite written, then the center is killed',
        face: 'client',
        request: racingRequest,
        wire: racingWire,
        reply: readReply(racingWire, 'envelope'),
      }
      observe(raced)
      const restarted = CenterProcess.serve('A-3-after-kill', envOf(dA), command)
      processes.push(restarted)
      A = restarted
      const probes: { tls: string; ops: string }[] = []
      let silentTls = 0
      let silentOps = 0
      for (;;) {
        const tlsProbe = await sendTls(
          address(dA),
          httpRequest(PUBLIC_HEALTH_BODY, 'localhost'),
          5_000,
        )
        const opsProbe = await fullHealth(opsSocketOf(dA), 'ops probe', '{}', {}, undefined)
        probes.push({
          tls: `written=${String(tlsProbe.requestWritten)} tls=${String(tlsProbe.tls?.protocol)} err=${String(tlsProbe.error)} bytes=${String(tlsProbe.received.length)}`,
          ops: `written=${String(opsProbe.wire.requestWritten)} err=${String(opsProbe.wire.error)} bytes=${String(opsProbe.wire.received.length)}`,
        })
        if (tlsProbe.requestWritten && tlsProbe.received.length === 0 && !tlsProbe.timedOut)
          silentTls++
        if (
          opsProbe.wire.requestWritten &&
          opsProbe.wire.received.length === 0 &&
          !opsProbe.wire.timedOut
        )
          silentOps++
        if (tlsProbe.received.length > 0) {
          expect(readReply(tlsProbe, 'public-health')).toMatchObject({
            kind: 'public-health',
            value: { centerId: centerIdA },
          })
          break
        }
        if (!restarted.running) throw new Error(`restart exited: ${restarted.stderr()}`)
        await sleep(200)
      }
      evidence.output('kill-restart/probes.json', `${JSON.stringify(probes, null, 2)}\n`)
      expect(
        silentTls,
        'TLS 连接握上手、请求写出，中心在开闸之前关掉它而不写任何字节',
      ).toBeGreaterThan(0)
      expect(silentOps, '运维面连接被接受，开闸之前关掉而不写任何字节').toBeGreaterThan(0)
      await restarted.ready(opsSocketOf(dA))
      const records = restarted.records()
      expect(records.filter(r => r['event'] === 'startup-failed')).toEqual([])
      const serving = records.find(r => r['event'] === 'serving')
      const waiting = records.filter(
        r =>
          r['level'] === 'warn' &&
          r['name'] === 'clock' &&
          Number(r['ts']) <= Number(serving?.['ts']),
      )
      expect(waiting.length, '工程记录里看得见开闸之前的等钟').toBeGreaterThan(0)
      expect(serving?.['centerId']).toBe(centerIdA)
      await logIn(cA, account('dan'), 'dan: login after the kill')
      expectResult(await as('dan1', 'myTenants'))
      expectEntry(await as('ada2', 'myTenants'), 'login-state-rejected')
      const issued = asArray(
        asRecord(
          expectResult(await as('ada1', 'listIssuedOffers', { includeConcluded: true })),
          'issued',
        )['invitations'],
        'invitations',
      ).map(v => invitationView(v))
      expect(issued.map(v => v['invitation'])).toContain(invited)
      expect([issuedBefore, issuedBefore + 1]).toContain(issued.length)
      if (raced.reply.kind === 'result')
        expect(issued.map(v => v['invitation'])).toContain(raced.reply.value)
      evidence.output(
        'kill-restart/racing-invitation.txt',
        `racing invitation read as: ${describeExchange(raced)}\ninvitations before ${String(issuedBefore)}, after ${String(issued.length)}\n`,
      )
      for (const view of issued) expect(millisBetween(view['offerTiming'])).toBeGreaterThan(0)
    }, 90_000)

    it('[PF-017 §一「搬到另一台机器、换了地址」；§三「同一个中心换地址还是它」] 同一份数据换目录、换端口起来：标识相同，登录状态照用', async () => {
      scenario('pf017-move')
      await stopA()
      const moved = join(root, 'moved')
      mkdirSync(moved)
      for (const suffix of ['', '-wal', '-shm'])
        if (existsSync(`${dA.dbFile}${suffix}`))
          renameSync(`${dA.dbFile}${suffix}`, join(moved, `center.sqlite${suffix}`))
      dA = {
        ...dA,
        dbFile: join(moved, 'center.sqlite'),
        port: await freePort(),
        opsDir: opsDirectory(root),
      }
      cA = client(address(dA), { observe })
      const health = await start('A-4-moved', dA)
      expect(health['centerId']).toBe(centerIdA)
      for (const name of ['ada1', 'ada5', 'bob1', 'cy1', 'dan1'])
        expectResult(await as(name, 'myTenants'))
    })

    it('[PF-017 §一「从零重立一个中心，用同一个地址」] 同一端口上从零立起来的中心：标识不同，原来的登录状态与账号在那里都不作数', async () => {
      scenario('pf017-rebuilt-same-address')
      await stopA()
      mkdirSync(join(root, 'rebuilt'))
      const fresh: Deployment = {
        ...dA,
        dbFile: join(root, 'rebuilt', 'center.sqlite'),
        opsDir: opsDirectory(root),
      }
      const health = await start('F-rebuilt', fresh)
      expect(health['centerId']).toMatch(CENTER_ID)
      expect(health['centerId']).not.toBe(centerIdA)
      expectEntry(await as('ada1', 'myTenants'), 'login-state-rejected')
      expectFailure(
        await call(
          cA,
          'login',
          {
            loginIdentifier: account('ada').loginIdentifier,
            credential: account('ada').credential,
          },
          undefined,
          'ada login at the rebuilt center',
        ),
        'identifier-or-credential-rejected',
      )
      await stopA()
      expect((await start('A-5-back', dA))['centerId']).toBe(centerIdA)
    })

    it('[PF-017 §一「中心开着时，机器上那份部署密钥被删了」「运维者丢了部署密钥」；§二「丢了部署密钥导致读不出来」；§三「密钥不加密任何东西」] 开着时删掉：什么都不变；下次起不来并点名密钥；换一套新密钥起来，一样没少', async () => {
      scenario('pf017-deployment-key-lost')
      const tenantsBefore = await myTenants('ada1')
      for (const path of Object.values(dA.keys)) rmSync(path)
      const health = await fullHealth(
        opsSocketOf(dA),
        'full health after the key files were deleted',
        '{}',
        {},
        observe,
      )
      expect([
        health.health?.['deploymentKeyPresent'],
        health.health?.['deploymentKeyComplete'],
      ]).toEqual([true, true])
      expect(
        expectResult(
          await register(cA, account('erin'), 'erin: register while the key files are gone'),
        ),
      ).toBe('registered')
      logins.set('erin1', await logIn(cA, account('erin'), 'erin: login'))
      expectResult(await as('ada1', 'myTenants'))
      await stopA()
      const run = await serveFails('deployment-key-lost', envOf(dA))
      expect(run.code).toBe(1)
      const [failure, ...more] = startupFailures(run)
      expect(more).toEqual([])
      expect(String(failure?.['item'])).toMatch(/^OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM/)
      const keys = await keygen(join(root, 'keys-a2'), command)
      for (const path of Object.values(keys)) {
        const pem = readFileSync(path, 'utf8')
        keyFileContents.push(pem)
        if (pem.includes('PRIVATE KEY')) evidence.secrets.add(pem, 'private-key')
      }
      dA = { ...dA, keys }
      expect((await start('A-6-new-keys', dA))['centerId']).toBe(centerIdA)
      expect(await myTenants('ada1')).toEqual(tenantsBefore)
      for (const name of ['ada5', 'bob1', 'cy1', 'dan1', 'erin1'])
        expectResult(await as(name, 'myTenants'))
      await logIn(cA, account('erin'), 'erin: login after the key swap')
      expect(
        expectResult(await register(cA, account('frank'), 'frank: register with the new keys')),
      ).toBe('registered')
      logins.set('frank1', await logIn(cA, account('frank'), 'frank: login'))
      tenants.set('frank', asTenantId(expectResult(await as('frank1', 'currentTenant'))))
    })

    it('[PF-017 §一「运维者改了一项部署参数」「把邀请的默认时长调短再重启」；§二「改一项部署参数，让一份已经发出的邀约到期时刻变了」；§三「参数…邀约例外」] 已发出的邀请到期时刻始终不变、已过期的始终不可接受；此后新发、没填时长的按新默认', async () => {
      scenario('pf017-parameter-change')
      const restartWith = async (label: string, invitationTtlDefault: string, expected: number) => {
        await stopA()
        dA = { ...dA, settings: { ...dA.settings, invitationTtlDefault } }
        const health = await start(label, dA)
        expect(asRecord(health['deploymentParameters'], 'parameters')['invitationTtlDefault']).toBe(
          expected,
        )
      }
      const timingOf = async (invitation: string) =>
        asRecord((await readInvitation('ada1', invitation, 'tenant'))['offerTiming'], 'timing')
      await restartWith('A-7-ttl-1500ms', '1500', 1500)
      const invE = await invite('ada1', 'frank')
      await sleep(2000)
      expect((await readInvitation('frank1', invE, 'account'))['offerState']).toBe('expired')
      await restartWith('A-8-ttl-10min', '600000', 600_000)
      const invP = await invite('ada1', 'frank')
      const invT = await invite('ada1', 'frank', { offerTtl: DAY })
      const before = { E: await timingOf(invE), P: await timingOf(invP), T: await timingOf(invT) }
      expect(millisBetween(before.E)).toBe(1500)
      expect(millisBetween(before.P)).toBe(600_000)
      expect(millisBetween(before.T)).toBe(DAY)
      await restartWith('A-9-ttl-shortened', '1000', 1000)
      expect({ E: await timingOf(invE), P: await timingOf(invP), T: await timingOf(invT) }).toEqual(
        before,
      )
      expectFailure(
        await as('frank1', 'acceptInvitation', { invitation: invE }),
        'offerNoLongerValid',
      )
      expect(
        millisBetween(
          (await readInvitation('ada1', await invite('ada1', 'frank'), 'tenant'))['offerTiming'],
        ),
      ).toBe(1000)
      await restartWith('A-10-ttl-lengthened', 'P30D', 30 * DAY)
      expect({ E: await timingOf(invE), P: await timingOf(invP), T: await timingOf(invT) }).toEqual(
        before,
      )
      expectFailure(
        await as('frank1', 'acceptInvitation', { invitation: invE }),
        'offerNoLongerValid',
      )
      expect(
        millisBetween(
          (await readInvitation('ada1', await invite('ada1', 'frank'), 'tenant'))['offerTiming'],
        ),
      ).toBe(30 * DAY)
      expect(
        asTenantId(expectResult(await as('frank1', 'acceptInvitation', { invitation: invP }))),
      ).toEqual({
        organization: id('X'),
        account: personal('frank').account,
      })
      tenants.set('X:frank', { organization: id('X'), account: personal('frank').account })
      await restartWith('A-11-ttl-restored', SETTINGS.invitationTtlDefault, 14 * DAY)
    }, 90_000)

    let backupDir = ''

    it('[PF-017 §一「运维者从备份恢复」] 恢复出来的还是原来那个中心；备份之后签发的不作数、注册的不在；备份之后撤销的又有效、移出的成员又回来了', async () => {
      scenario('pf017-backup-restore')
      await stopA()
      backupDir = join(root, 'backup')
      mkdirSync(backupDir)
      const files = ['', '-wal', '-shm'].filter(s => existsSync(`${dA.dbFile}${s}`))
      for (const suffix of files)
        copyFileSync(`${dA.dbFile}${suffix}`, join(backupDir, `center.sqlite${suffix}`))
      evidence.output('backup/files.txt', `${files.map(s => `center.sqlite${s}`).join('\n')}\n`)
      await start('A-12-before-backup-actions', dA)
      const after = await logIn(cA, account('ada'), 'ada: login after the backup')
      logins.set('ada6', after)
      expect(
        expectResult(
          await as('ada1', 'revokeLoginState', { loginStateHandle: login('ada5').handle }),
        ),
      ).toBe('ok')
      expectEntry(await as('ada5', 'myTenants'), 'login-state-rejected')
      expect(
        expectResult(await register(cA, account('gina'), 'gina: register after the backup')),
      ).toBe('registered')
      expect(
        expectResult(await as('ada1', 'removeMember', { targetTenant: tenants.get('X:frank') })),
      ).toBe('ok')
      await stopA()
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${dA.dbFile}${suffix}`, { force: true })
      for (const suffix of files)
        copyFileSync(join(backupDir, `center.sqlite${suffix}`), `${dA.dbFile}${suffix}`)
      expect((await start('A-13-restored', dA))['centerId']).toBe(centerIdA)
      expectEntry(await as('ada6', 'myTenants'), 'login-state-rejected')
      expectResult(await as('ada5', 'myTenants'))
      expectFailure(
        await call(
          cA,
          'login',
          {
            loginIdentifier: account('gina').loginIdentifier,
            credential: account('gina').credential,
          },
          undefined,
          'gina login after restore',
        ),
        'identifier-or-credential-rejected',
      )
      expect(
        expectResult(await as('ada1', 'membershipStanding', { tenant: tenants.get('X:frank') })),
      ).toEqual({
        standing: 'effective',
        role: 'member',
      })
    })

    it('[PF-017 §一「一份中心数据的备份外泄了」；§三「不交出能直接用的凭证」（备份那一半）；EC S-41] 备份字节里搜不到口令与出示物；备份里每一个字符串值当出示物都被拒、答复逐字相同；两个仍有效的照常能用', async () => {
      scenario('pf017-backup-leak')
      const bytes = readFileSync(join(backupDir, 'center.sqlite'))
      const sidecars = ['-wal', '-shm']
        .map(s => join(backupDir, `center.sqlite${s}`))
        .filter(p => existsSync(p))
        .map(p => readFileSync(p))
      const all = Buffer.concat([bytes, ...sidecars])
      for (const secret of evidence.secrets.all.filter(s => s.kind !== 'private-key'))
        for (const form of secretForms(secret.value))
          expect(all.includes(Buffer.from(form.text, 'utf8')), `${secret.kind} ${form.form}`).toBe(
            false,
          )
      const copy = join(root, 'backup-copy.sqlite')
      copyFileSync(join(backupDir, 'center.sqlite'), copy)
      const strings = new Set<string>()
      const db = new DatabaseSync(copy)
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
        for (const table of tables) {
          const name = asString(table['name'], 'table name')
          for (const row of db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all())
            for (const value of Object.values(row))
              if (typeof value === 'string' && value !== '') strings.add(value)
        }
      } finally {
        db.close()
      }
      expect(strings.size).toBeGreaterThan(20)
      // 备份里有凭据的派生材料（盐与散列）：它不进证据。这一段的来往不落 transcript，只留每个值的 SHA-256 与读法；
      // 凭据材料另登记为秘密，于是整棵证据目录与中心的一切输出都要搜不到它（EC S-29「账号的凭据材料」）
      for (const value of strings)
        if (value.startsWith('$password-')) evidence.secrets.add(value, 'credential')
      const quiet = client(address(dA), { observe: e => exchanges.push(e) })
      const tried: string[] = ['value-sha256\tlength\tread\tanswer-sha256']
      for (const value of strings) {
        const e = await call(quiet, 'myTenants', {}, value, 'backup string as a presentation')
        expectEntry(e, 'login-state-rejected')
        tried.push(
          `${sha256(value)}\t${String(value.length)}\t${describeExchange(e)}\t${sha256(e.wire.received)}`,
        )
      }
      evidence.output('backup/tried-as-presentations.tsv', `${tried.join('\n')}\n`)
      for (const name of ['ada1', 'bob1']) expectResult(await as(name, 'myTenants'))
    }, 120_000)
  })

  describe('七、防冒充：客户端核中心的证书 [PF-017 §二「冒牌货」；D-029 ①②⑤；HB S-4]', () => {
    it('[HB S-4] 握手里出示的叶子证书就是部署配置给的那一张；协议 TLS 1.3', async () => {
      scenario('d029-certificate')
      const e = await publicHealth(cA, 'public health (certificate check)')
      expect(e.wire.tls?.protocol).toBe('TLSv1.3')
      expect(e.wire.tls?.peerLeafDer?.equals(new X509Certificate(goodCert.leafPem).raw)).toBe(true)
    })

    it('[PF-017 §二「客户端把报出同一个中心标识的冒牌货当成了中心」；D-029 ①⑤] 同一个中心（同一标识）换一张别的 CA 签的证书起来：客户端握手即拒、不写一个字节；它确实在答（信任那张 CA 的客户端读得到同一标识）', async () => {
      scenario('d029-rogue-certificate-center')
      await stopA()
      const rogue: Deployment = {
        ...dA,
        tls: { chainFile: rogueCert.chainFile, keyFile: rogueCert.keyFile },
      }
      expect((await start('A-14-rogue-certificate', rogue))['centerId']).toBe(centerIdA)
      const refused = await call(
        cA,
        'myTenants',
        {},
        login('ada1').presentation,
        'client trusting e2e-ca → rogue certificate',
      )
      expect(refused.reply.kind).toBe('unreachable')
      expect(refused.wire.requestWritten).toBe(false)
      expect(refused.wire.received.length).toBe(0)
      const trustingRogue = client({ ...address(dA), ca: rogueCa.certPem }, { observe })
      expect(
        (await publicHealth(trustingRogue, 'client trusting rogue-ca (control)')).reply,
      ).toMatchObject({
        kind: 'public-health',
        value: { centerId: centerIdA },
      })
      await stopA()
      await start('A-15-good-certificate', dA)
      expectResult(await as('ada1', 'myTenants'))
    })

    it('[D-029 ①②；PF-017 §二「冒牌货」] 冒牌 TLS 端点（别的 CA 签的、或同一 CA 签给别的主机名的）：客户端拒绝，冒牌者收到零字节应用数据；持合格证书的端点收得到（对照）', async () => {
      scenario('d029-impostor-endpoint')
      const reply = Buffer.from(
        answerBytes(JSON.stringify({ reachable: true, centerId: centerIdA, version: '0.0.0' })),
      )
      for (const [label, certificate, believed] of [
        ['rogue CA, same host name', rogueCert, false],
        ['right CA, another host name', wrongHostCert, false],
        ['right CA, right host name (control)', goodCert, true],
      ] as const) {
        const impostor = await impostorEndpoint(certificate, reply)
        try {
          const e = await call(
            client({ ...address(dA), port: impostor.port }, { observe }),
            'myTenants',
            {},
            login('ada1').presentation,
            `impostor: ${label}`,
          )
          await sleep(100)
          if (believed) {
            expect(impostor.received(), label).toBeGreaterThan(0)
            expect(e.wire.requestWritten).toBe(true)
          } else {
            expect(e.reply.kind, label).toBe('unreachable')
            expect(e.wire.requestWritten, label).toBe(false)
            expect(impostor.received(), label).toBe(0)
          }
        } finally {
          await impostor.close()
        }
      }
    })
  })

  describe('八、输出里搜不到秘密与来者 [PF-017 §二 第 12、16 行；§三「秘密不经产品的任何呈现与输出交出去」；EC S-29、S-30、S-46；HB S-11]', () => {
    it('[HB S-11、S-12] 客户端一面的每一份答复：状态行与四个头逐字节固定、体无空白且按 RFC 8785 写', () => {
      const answered = exchanges.filter(e => e.face === 'client' && e.wire.received.length > 0)
      expect(answered.length).toBeGreaterThan(100)
      for (const e of answered) {
        const answer = parseHttpAnswer(e.wire.received)
        if (typeof answer === 'string') throw new Error(`${e.label}: ${answer}`)
        expect(answer.statusLine, e.label).toBe('HTTP/1.1 200 OK')
        expect(answer.headers, e.label).toEqual([
          ['Content-Type', 'application/json'],
          ['Cache-Control', 'no-store'],
          ['Content-Length', String(answer.body.length)],
          ['Connection', 'close'],
        ])
        expect(isCompactCanonical(answer.body), e.label).toBe(true)
      }
    })

    it('[PF-017 §二「部署密钥的值出现在…任何输出里」「工程记录里出现对端地址，或账号、租户能被还原出来的标识」] 全部答复、两种体检、工程记录、启动失败说明：密钥与口令一处都没有；出示物只在签发它的那一次登录答复里；工程记录里没有来源地址、没有任何账号标识与登录标识', async () => {
      const last = await fullHealth(opsSocketOf(dA), 'full health at the end', '{}', {}, observe)
      expect(last.health?.['defectCount'], '整段旅程入口层没有记下任何缺陷').toBe(0)
      if (A !== undefined) await stopA()
      const outputs: { readonly where: string; readonly text: string }[] = [
        ...exchanges.map(e => ({
          where: `answer ${e.label}`,
          text: e.wire.received.toString('utf8'),
        })),
        ...processes.flatMap(p => [
          { where: `center ${p.label} stderr`, text: p.stderr() },
          { where: `center ${p.label} stdout`, text: p.stdout() },
        ]),
        ...cliRuns.flatMap(({ label, run }) => [
          { where: `cli ${label} stderr`, text: run.stderr },
          { where: `cli ${label} stdout`, text: run.stdout },
        ]),
      ]
      const keyLike = evidence.secrets.all.filter(s => s.kind !== 'presentation')
      for (const secret of keyLike)
        for (const form of secretForms(secret.value))
          for (const output of outputs)
            expect(
              output.text.includes(form.text),
              `${secret.kind} (${form.form}) in ${output.where}`,
            ).toBe(false)
      const presentations = evidence.secrets.all.filter(s => s.kind === 'presentation')
      expect(presentations.length).toBeGreaterThan(10)
      for (const { value } of presentations) {
        const places = outputs.filter(o => secretForms(value).some(f => o.text.includes(f.text)))
        expect(places.length, 'a presentation appears exactly once').toBe(1)
        expect(places[0]?.where).toMatch(/^answer .*login/)
        expect(places[0]?.text).toContain(`{"result":{"loginState":"${value}"`)
      }
      const logs = processes.map(p => p.stderr()).join('\n')
      expect(logs).not.toContain('127.0.0.2')
      for (const t of tenants.values())
        expect(logs, 'AccountId in the engineering records').not.toContain(t.account)
      for (const a of accounts.values())
        expect(logs, 'login identifier in the engineering records').not.toContain(a.loginIdentifier)
      const organizationsInLogs = [
        ...new Set([...tenants.values()].map(t => t.organization)),
      ].filter(o => logs.includes(o))
      evidence.output(
        'log-scan.txt',
        [
          `engineering records: ${String(processes.length)} processes, ${String(logs.split('\n').filter(Boolean).length)} lines`,
          `peer address 127.0.0.2: absent; AccountIds: ${String(tenants.size)} checked, absent; login identifiers: ${String(accounts.size)} checked, absent`,
          `OrganizationIds seen in the records (observation, not a criterion): ${String(organizationsInLogs.length)}`,
          '',
        ].join('\n'),
      )
    })
  })
})

// ---- 另一个程序与冒牌端点 ----

/** 用 openssl s_client 发同一份请求字节（「另一个程序」）：核 CA 链与主机名，握手失败即非零退出。 */
function opensslClient(
  port: number,
  caFile: string,
  request: Buffer,
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  const args = [
    's_client',
    '-connect',
    `127.0.0.1:${String(port)}`,
    '-servername',
    'localhost',
    '-verify_hostname',
    'localhost',
    '-CAfile',
    caFile,
    '-verify_return_error',
    '-tls1_3',
    '-quiet',
  ]
  command(`openssl ${args.join(' ')} < <request bytes>`)
  const child = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const out: Buffer[] = []
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  child.stdin.end(request)
  return new Promise(done => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
    child.once('exit', code => {
      clearTimeout(timer)
      setImmediate(() => done({ code, stdout: Buffer.concat(out), stderr }))
    })
  })
}

/** 一个冒牌 TLS 端点：出示给定证书，数它收到的应用数据字节；收到请求就答一份报出中心标识的「公开体检」。 */
async function impostorEndpoint(
  certificate: ServerCertificate,
  reply: Buffer,
): Promise<{ port: number; received: () => number; close: () => Promise<void> }> {
  let received = 0
  const server = createTlsServer(
    { cert: readFileSync(certificate.chainFile), key: certificate.keyPem, minVersion: 'TLSv1.3' },
    socket => {
      socket.on('data', (chunk: Buffer) => {
        received += chunk.length
      })
      socket.on('end', () => socket.end(reply))
      socket.on('error', () => undefined)
    },
  )
  server.on('tlsClientError', () => undefined)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const bound = server.address()
  if (bound === null || typeof bound === 'string') throw new Error('impostor did not bind')
  return {
    port: bound.port,
    received: () => received,
    close: () => new Promise(done => server.close(() => done())),
  }
}
