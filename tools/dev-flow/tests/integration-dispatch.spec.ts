// @module-tag slow
// Slow: drives a real start in a temporary Git checkout with a gh stand-in process.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import {
  dispatchComment,
  dispatchDecision,
  DISPATCH_PLACEHOLDER,
} from '../src/delivery/dispatch.ts'
import { contextPath, parseContext } from '../src/integration/context.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { integrationFixture } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})

it('starts from the dispatch comment that post writes, prose and all', async () => {
  const f = integrationFixture()
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  const dispatch = 'https://github.com/owner/repo/issues/1#issuecomment-1'
  const planned: TaskBindingV2 = {
    ...f.binding,
    schemaVersion: 2,
    dispatch: DISPATCH_PLACEHOLDER,
    line: 'integration',
    nature: 'integration',
    contractChange: 'none',
    milestone: 'M1',
  }
  const { binding, decision } = dispatchDecision(
    { binding: planned, confirmations: [] },
    dispatch,
    ['fixture explicit authorization'],
  )
  f.update(binding, [], 'open', {
    line: 'integration',
    nature: 'integration',
    contractChange: 'none',
  })
  const path = join(f.home, 'platform.json'),
    platform = JSON.parse(readFileSync(path, 'utf8'))
  platform.comments = [
    {
      id: 1,
      html_url: dispatch,
      issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
      user: { login: 'human', node_id: 'U_human' },
      body: dispatchComment('## 正式派发\n\n人读的派发说明。\n', decision),
      updated_at: '2026-10-11T00:00:00Z',
    },
  ]
  writeFileSync(path, JSON.stringify(platform))
  const context = parseContext(
    await (
      await openIntegration({ root: f.root, report: () => {} })
    ).execute({
      kind: 'start',
      authority: dispatch,
      issue: binding.issue.url,
      revision: 1,
      attempt: 'one',
    }),
  )
  expect(context.ownerTask).toEqual(binding)
  expect(JSON.parse(readFileSync(contextPath(f.root), 'utf8')).ownerTask).toEqual(binding)
})
