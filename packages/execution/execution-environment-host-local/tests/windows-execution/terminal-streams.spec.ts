/** @module-tag slow */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { psString, terminalFixture } from './terminal-fixture.ts'

it('renders PowerShell output, error, host and diagnostic streams through actual ConPTY bytes', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-streams-')))
  const release = join(directory, 'release')
  const f = terminalFixture(directory)
  const chunks: Uint8Array[] = []
  try {
    const created = await f.manager.facility.create(f.request)
    expect(created.kind).toBe('done')
    if (created.kind !== 'done') return
    const running = await f.manager.facility.execute({
      ...f.call,
      terminal: created.value.terminal,
      script: `Write-Output 'OMNE_OUTPUT'; Write-Host -NoNewline -ForegroundColor Green 'OMNE_HOST'; Write-Error 'OMNE_ERROR'; Write-Warning 'OMNE_WARNING'; $VerbosePreference='Continue'; Write-Verbose 'OMNE_VERBOSE'; $DebugPreference='Continue'; Write-Debug 'OMNE_DEBUG'; Write-Information 'OMNE_INFORMATION' -InformationAction Continue; Write-Progress -Activity 'OMNE_PROGRESS' -Status 'OMNE_STATUS'; & ([IO.Path]::Combine($env:SystemRoot,'System32','cmd.exe')) /d /c 'echo OMNE_NATIVE & echo OMNE_NATIVE_ERR 1>&2'; [Console]::Write("OMNE_RAW\r\n"); while (-not [IO.File]::Exists(${psString(release)})) { Start-Sleep -Milliseconds 10 }`,
    })
    expect(running.kind).toBe('done')
    if (running.kind !== 'done') return
    const reading = (async () => {
      for await (const chunk of running.value.output) chunks.push(chunk.data)
    })()
    for (const marker of [
      'OMNE_OUTPUT',
      'OMNE_HOST',
      'OMNE_ERROR',
      'OMNE_WARNING',
      'OMNE_VERBOSE',
      'OMNE_DEBUG',
      'OMNE_INFORMATION',
      'OMNE_PROGRESS',
      'OMNE_STATUS',
      'OMNE_RAW',
      'OMNE_NATIVE',
      'OMNE_NATIVE_ERR',
    ])
      await expect
        .poll(() => Buffer.concat(chunks).toString('utf8'), { timeout: 5000 })
        .toContain(marker)
    const raw = Buffer.concat(chunks)
    expect(raw.includes(27)).toBe(true)
    expect(raw.includes(Buffer.from('\r\n'))).toBe(true)
    await writeFile(release, '')
    expect(await running.value.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
    })
    await reading
  } finally {
    await f.manager.stopAll()
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
