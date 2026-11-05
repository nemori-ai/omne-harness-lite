import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { nativeSource } from '../../src/windows-execution/native-source.ts'

export async function compileTerminalSource(
  directory: string,
  terminalSource: string,
  bridgeSource = nativeSource,
) {
  const source = join(directory, 'bridge.cs')
  const terminal = join(directory, 'terminal.cs')
  const executable = join(directory, 'bridge.exe')
  await writeFile(source, bridgeSource)
  await writeFile(terminal, terminalSource)
  const system = process.env['SystemRoot'] ?? 'C:\\Windows'
  const framework = join(system, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
  await promisify(execFile)(
    join(framework, 'csc.exe'),
    [
      '/nologo',
      '/target:exe',
      '/main:OmneTerminalEntry',
      `/out:${executable}`,
      `/reference:${join(framework, 'System.Web.Extensions.dll')}`,
      `/reference:${join(system, 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Management.Automation', 'v4.0_3.0.0.0__31bf3856ad364e35', 'System.Management.Automation.dll')}`,
      source,
      terminal,
    ],
    { windowsHide: true },
  )
  return executable
}
