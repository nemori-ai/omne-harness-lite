// `scripts/tool-release.mjs check`（B3-T2a 第 1 项）：正式清单与已构建的 tool-definitions 一致时退出 0；清单与
// 产物不一致、清单被手改（含只改格式）时退出 1 并逐项写出差异。脚本读已构建的包，先构建 tool-definitions。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const member = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))
const SCRIPT = member('scripts/tool-release.mjs')
const FORMAL = member('config/tool-release.json')

function check(manifest: string) {
  const result = spawnSync(process.execPath, [SCRIPT, 'check', '--manifest', manifest], {
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

let scratch: string
beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'tool-release-script-')))
})
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function variant(name: string, edit: (text: string) => string): string {
  const path = join(scratch, name)
  writeFileSync(path, edit(readFileSync(FORMAL, 'utf8')))
  return path
}

describe('tool-release.mjs check', () => {
  test('the formal manifest matches the built artifacts', () => {
    const run = check(FORMAL)
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/^tool-release: ok entries=4 artifacts=\d+ generation=sha256:/)
  })

  test('exits 1 and names the artifact when the manifest and the artifacts disagree', () => {
    const path = variant('artifact.json', text => {
      const manifest = JSON.parse(text) as {
        artifacts: { files: { path: string; sha256: string }[] }
      }
      const first = manifest.artifacts.files.find(file => file.path === 'dist/index.js')
      if (first === undefined) throw new Error('fixture: no dist/index.js')
      first.sha256 = '0'.repeat(64)
      return `${JSON.stringify(manifest, null, 2)}\n`
    })
    const run = check(path)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('artifact dist/index.js')
  })

  test('exits 1 when an entry was edited by hand', () => {
    const run = check(
      variant('entry.json', text => text.replace('"Files.settings"', '"Files.other"')),
    )
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('entry Files')
  })

  test('exits 1 when only the formatting differs', () => {
    const run = check(variant('format.json', text => JSON.stringify(JSON.parse(text))))
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('differs only in formatting')
  })

  test('exits 2 on a usage error', () => {
    const result = spawnSync(process.execPath, [SCRIPT, 'verify'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
  })
})
