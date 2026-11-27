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
import { servePoint, serveProtocol } from '@omne-harness/shell-contract/testing'
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
  let inside: Parameters<typeof installOn>[0] | undefined
  await root.plugin({ name: 'loader', inject: ['shell'], apply: ctx => void (inside = ctx.shell) })
  return { root, shell: inside! }
}

/** A plugin of one member from a member to copy: the member's line, then each file under a line naming it. */
function copied(name: string, example: string) {
  const [first = '', ...rest] = example.split('\n')
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

it('PL-I27：桌面客户端树上的每个点，要么规矩写明关与理由、装载方照这个理由拒，要么照抄的成员装上并对这个租户生效', async () => {
  const { root, shell } = await signedIn()
  const scope = tenantScope(TENANT)
  const points = shell.described().points
  const lines: string[] = []
  const missing: string[] = []
  for (const { name, contract, form } of points) {
    const { scopes } = contract
    if (scopes !== undefined && scopes !== 'all') {
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
})
