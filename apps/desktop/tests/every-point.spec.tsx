// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as ui from '@omne-harness/ui-kit'
import React from 'react'
import { serverPointsContract } from '@omne-harness/client-assembly'
import { list } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { fiberOf, readManifest } from '@omne-harness/plugin-protocol'
import { installOn } from '@omne-harness/plugin-ui'
import { tenantScope, type ShellLogin } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { servePoint, serveProtocol } from '@omne-harness/shell-contract/testing'
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { tokenOf, tokensOf } from '../src/page/shell/changes-sheet.ts'
import { shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'
import { quietConnection } from './support/shell-setup.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const TOKENS = join(import.meta.dirname, '../../../packages/frontend/ui-kit/src/styles/tokens.css')

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

const silent = () =>
  new Proxy({}, { get: (_, name) => (name === 'observe' ? {} : () => new Promise(() => {})) })

/** The desktop's own client tree, signed in as one tenant, and the shell as a module of the tree sees it. */
async function signedIn() {
  const sheet = document.createElement('style')
  sheet.textContent = readFileSync(TOKENS, 'utf8')
  document.head.append(sheet)
  const root = new Context()
  const state = createShellState(login, {
    knowsToken: tokenOf(document),
    tokens: tokensOf(document),
  })
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(state))
  root.reflect.provide('connection', quietConnection)
  await servePoint(root, serverPointsContract, {
    keys: () => undefined,
    subscribe: () => () => undefined,
  })
  for (const protocol of assembly.protocols) await serveProtocol(root, protocol, silent())
  for (const module of assembly.modules) await root.plugin(module)
  state.scope.set(TENANT)
  let inside: ShellService | undefined
  await root.plugin({ name: 'loader', inject: ['shell'], apply: ctx => void (inside = ctx.shell) })
  return { root, shell: inside! }
}

/** A plugin of one member from a member to copy: the member's line, then each file under a line naming it. */
function copied(name: string, example: string) {
  const filled = example.replaceAll('<plugin>', name).replaceAll('<key>', 'some-key')
  const [first = '', ...rest] = filled.split('\n')
  const files = new Map<string, string>()
  let at: string | undefined
  for (const line of rest) {
    const named = /^(\S+\.js):$/u.exec(line)
    if (named !== null) at = named[1]
    else if (at !== undefined) files.set(at, `${files.get(at) ?? ''}${line}\n`)
  }
  const read = readManifest(
    `{"schema":1,"name":"${name}","summary":"s","client":{"members":[${first}]}}`,
  )
  if (read.kind !== 'read') throw new Error(read.reason)
  return { members: read.manifest.client?.members ?? [], files }
}

const nameOf = (point: string, as: string) => `${as}-${point.replaceAll('.', '-')}`

/** C7: the points of the client tree closed to plugins, and why; any other closed point is a defect. */
const CLOSED = {
  'shell.gate': 'no-tenant',
  'human-intervention.release-detail': 'speaks-as-system',
  'connection.protocols': 'grants-itself',
  'connection.server-points': 'grants-itself',
  'plugin.ports': 'grants-itself',
  'plugin.guest-forms': 'grants-itself',
  'assets.governance': 'grants-itself',
  'identity.account-preferences': 'grants-itself',
  'media.picture-intake': 'grants-itself',
  'model.choices': 'grants-itself',
  'session.block-reads-source': 'grants-itself',
  'session.composer': 'grants-itself',
  'session.composer-intake': 'grants-itself',
  'session.model-choice': 'grants-itself',
  'slash-command.composer': 'grants-itself',
  'workspace.choices': 'grants-itself',
}

it('PL-I27：桌面客户端树上的每个点，要么规矩写明关与理由、装载方照这个理由拒，要么照抄的成员装上并对这个租户生效', async () => {
  const { root, shell } = await signedIn()
  const scope = tenantScope(TENANT)
  const points = shell.described().points
  const lines: string[] = []
  const missing: string[] = []
  const closed: Record<string, string> = {}
  for (const { name, contract, form } of points) {
    const { scopes } = contract
    if (scopes !== undefined && scopes !== 'all') {
      closed[name] = scopes.why
      const probe = nameOf(name, 'probe')
      const refused = await installOn(
        shell,
        { name: probe, version: 'v1', members: [{ point: name, key: 'probe', data: {} }] },
        scope,
      )
      expect(refused, name).toMatchObject({ kind: 'failed' })
      expect(JSON.stringify(refused), name).toContain(
        `the point is closed to plugins (${scopes.why}): ${scopes.note}`,
      )
      lines.push(`${name}: closed (${scopes.why})`)
      continue
    }
    const example = form?.example ?? contract.example
    if (example === undefined) {
      missing.push(name)
      continue
    }
    const copy = nameOf(name, 'copy')
    const { members, files } = copied(copy, example)
    const installed = await installOn(shell, { name: copy, version: 'v1', members }, scope, {
      given: { React, ui },
      load: async (_name, _version, path) =>
        import(
          /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(files.get(path) ?? '')}`
        ),
    })
    expect(installed.kind, `${name}: ${JSON.stringify(installed)}`).toBe('installed')
    const read = list(root.dynamis.registry(), name, null, scope)
    const mine =
      read.kind === 'read'
        ? read.items.filter(item => item.entry.instance.fiber.startsWith(fiberOf(copy, 'v1')))
        : []
    expect(mine.length, `${name}: the member to copy counts for the tenant`).toBeGreaterThan(0)
    lines.push(`${name}: open, the member to copy is in effect`)
  }
  console.log(`client points:\n  ${lines.join('\n  ')}`)
  expect(missing, 'open points without a member to copy').toEqual([])
  expect(lines.length).toBe(points.length)
  expect(closed).toEqual(CLOSED)
})

const LOOK = join(
  import.meta.dirname,
  '../../../packages/plugin/plugin-host-local/skills/extending-the-app/examples/send-button-look/plugin.json',
)

it('the look the developer handbook gives as an example installs as written, and both its members count for the tenant', async () => {
  const { root, shell } = await signedIn()
  const scope = tenantScope(TENANT)
  const read = readManifest(readFileSync(LOOK, 'utf8'))
  if (read.kind !== 'read') throw new Error(read.reason)
  const { name, client } = read.manifest
  const members = client?.members ?? []
  const installed = await installOn(shell, { name, version: 'v1', members }, scope)
  expect(installed.kind, JSON.stringify(installed)).toBe('installed')
  for (const member of members) {
    const listed = list(root.dynamis.registry(), member.point, member.key, scope)
    const mine =
      listed.kind === 'read'
        ? listed.items.filter(item => item.entry.instance.fiber.startsWith(fiberOf(name, 'v1')))
        : []
    expect(mine.length, `${member.point} ${member.key}`).toBe(1)
  }
})

it.each([
  [
    'the assets page',
    '{"point":"shell.pages","key":"","id":"assets","module":"m.js","export":"m"}',
    "export const m = () => ({ id: 'assets', title: 'Mine', order: 0, icon: 'x', render: () => null })",
  ],
  [
    'the account block',
    '{"point":"shell.sidebar","key":"","id":"identity.account","module":"m.js","export":"m"}',
    "export const m = () => ({ id: 'identity.account', order: 0, render: () => null })",
  ],
  [
    'an action of the shell',
    '{"point":"shell.actions","key":"","id":"shell.palette","module":"m.js","export":"m"}',
    "export const m = () => ({ id: 'shell.palette', title: 'Mine', group: 'x', kind: 'ui', order: 0, available: () => true, run: () => undefined })",
  ],
])(
  'FE-I73：%s 带锁：同标识的一份 Plugin 装不上，回执写被锁住，官方的照常',
  async (_name, member, code) => {
    const { root, shell } = await signedIn()
    const scope = tenantScope(TENANT)
    const read = readManifest(
      `{"schema":1,"name":"mine","summary":"s","client":{"members":[${member}]}}`,
    )
    if (read.kind !== 'read') throw new Error(read.reason)
    const before = list(root.dynamis.registry(), JSON.parse(member).point, null, scope)
    const installed = await installOn(
      shell,
      { name: 'mine', version: 'v1', members: read.manifest.client?.members ?? [] },
      scope,
      {
        given: { React, ui },
        load: async () =>
          import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`),
      },
    )
    expect(installed).toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('locked by'),
    })
    expect(list(root.dynamis.registry(), JSON.parse(member).point, null, scope)).toEqual(before)
  },
)

const NOTES_PAGE = join(
  import.meta.dirname,
  '../../../packages/plugin/plugin-host-local/skills/extending-the-app/examples/notes-page',
)

it('the page with its own server data the developer handbook gives installs as written: it is in the sidebar under its id and shows what its server side answers through its port', async () => {
  const { root, shell } = await signedIn()
  const server = (await import(join(NOTES_PAGE, 'protocol.js'))) as {
    protocol: () => { handlers: { list: () => Promise<unknown> } }
  }
  const { handlers } = server.protocol()
  await serveProtocol(root, { name: 'notes', major: 1 }, { list: () => handlers.list() })
  const read = readManifest(readFileSync(join(NOTES_PAGE, 'plugin.json'), 'utf8'))
  if (read.kind !== 'read') throw new Error(read.reason)
  const { name, client } = read.manifest
  const code = {
    given: { React, ui },
    load: (_name: string, _version: string, path: string) => import(join(NOTES_PAGE, path)),
  }
  const listed = { name, version: 'v1', members: client?.members ?? [], needs: client?.needs ?? [] }
  const installed = await installOn(shell, listed, tenantScope(TENANT), code)
  expect(installed.kind, JSON.stringify(installed)).toBe('installed')
  const page = shell.items('pages').find(each => each.id === 'notes')
  expect(page && [page.title, page.order]).toEqual(['Notes', 60])
  const drawn = render(<>{page!.render({ scope: TENANT })}</>)
  expect(await drawn.findByText('Buy milk')).toBeDefined()
  expect(drawn.getByText('Call the plumber')).toBeDefined()
  drawn.unmount()
})
