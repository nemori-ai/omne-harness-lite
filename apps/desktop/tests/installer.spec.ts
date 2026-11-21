import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { checkInstaller, recordInstaller } from '../scripts/installer-receipt.ts'
import { nsisFileList, writeNsisFileList } from '../scripts/nsis-files.ts'
import { judgeWindowsDistribution, parseAuthenticode } from '../scripts/release-signing.ts'

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'desktop-installer-')))

it('卸载程序只删打进包的文件：先查目录不是链接，再逐个删文件、删空目录，字面的 $ 转义', () => {
  const project = scratch()
  try {
    const payload = join(project, 'win-unpacked')
    mkdirSync(join(payload, 'resources'), { recursive: true })
    writeFileSync(join(payload, 'omne.exe'), '')
    writeFileSync(join(payload, 'resources', 'cost $1.txt'), '')
    writeNsisFileList(payload, project, 'arm64')
    expect(readFileSync(nsisFileList(project, 'arm64'), 'utf8').trim().split('\n')).toEqual([
      '!insertmacro CheckDirectory "$INSTDIR\\resources"',
      '!insertmacro RemoveInstalledFile "$INSTDIR\\omne.exe"',
      '!insertmacro RemoveInstalledFile "$INSTDIR\\resources\\cost $$1.txt"',
      'RMDir "$INSTDIR\\resources"',
    ])
    // NSIS reads the file as UTF-8 only with a byte order mark.
    expect([...readFileSync(nsisFileList(project, 'arm64')).subarray(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ])
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

it('安装器回执：没有回执、安装器换了、程序或 app.asar 重新打过，都不认', async () => {
  const root = scratch()
  try {
    const installer = join(root, 'omne Setup 0.1.0.exe')
    const executable = join(root, 'omne.exe')
    const asar = join(root, 'resources', 'app.asar')
    await mkdir(join(root, 'resources'))
    for (const path of [installer, executable, asar]) await writeFile(path, 'original')
    await expect(checkInstaller(installer, 'arm64', executable)).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await recordInstaller(installer, 'arm64', executable)
    await checkInstaller(installer, 'arm64', executable)
    for (const path of [installer, executable, asar]) {
      await writeFile(path, 'rebuilt')
      await expect(checkInstaller(installer, 'arm64', executable)).rejects.toThrow(/do not match/)
      await writeFile(path, 'original')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('Windows 发行要程序与安装器都签了名；缺安装器或任何一个没签都失败', () => {
  const valid = parseAuthenticode('{"Status":"Valid","Signer":"CN=x"}')
  const unsigned = parseAuthenticode('{"Status":"NotSigned","StatusMessage":"m"}')
  const name = 'omne Setup 0.1.0.exe'
  expect(judgeWindowsDistribution(valid, name, valid).status).toBe('pass')
  expect(judgeWindowsDistribution(valid, name, undefined)).toEqual({
    status: 'fail',
    reason: `application: Authenticode signature valid: CN=x; missing distribution installer: ${name}`,
  })
  expect(judgeWindowsDistribution(valid, name, unsigned).reason).toContain(
    `${name}: Authenticode: NotSigned`,
  )
  expect(judgeWindowsDistribution(unsigned, name, valid).status).toBe('fail')
})
