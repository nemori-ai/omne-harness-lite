import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PQW_FLOAT, PQW_VENDOR, pqwScripts } from '../src/locations.ts'
import { scratch, writeJson } from './support.ts'

const SCRIPTS = 'skills/slice-closeout/scripts'

function project(pinned: string | undefined, floated: number | undefined): string {
  const root = scratch()
  if (pinned !== undefined)
    writeJson(join(root, '.meta_harness/agents/pqw/contract-version'), Number(pinned))
  if (floated !== undefined) {
    writeJson(join(root, PQW_FLOAT, 'design/consumer-contract.json'), { version: floated })
  }
  return root
}

it('没有浮动副本时读子模块里的脚本', () => {
  const root = project('1', undefined)
  expect(pqwScripts(root)).toBe(join(root, PQW_VENDOR, SCRIPTS))
})

it('浮动副本的接入约定版本与项目钉的相同时读浮动副本', () => {
  const root = project('1', 1)
  expect(pqwScripts(root)).toBe(join(root, PQW_FLOAT, SCRIPTS))
})

it('浮动副本的接入约定版本不同，或项目没有钉版本时，读子模块', () => {
  expect(pqwScripts(project('1', 2))).toContain(PQW_VENDOR)
  expect(pqwScripts(project(undefined, 1))).toContain(PQW_VENDOR)
})
