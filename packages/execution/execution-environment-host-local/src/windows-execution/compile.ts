import {
  frameworkAssembly,
  powershellAssembly,
  windowsNativeExecutable,
} from '../windows-native/compile.ts'
import { nativeSource } from './native-source.ts'
import { terminalNativeSource } from './terminal-native-source.ts'

const bridgeSource = { fileName: 'bridge.cs', text: nativeSource }

const bridge = windowsNativeExecutable({
  cacheName: 'omne-windows-execution',
  executableName: 'bridge.exe',
  sources: [bridgeSource],
  references: [frameworkAssembly('System.Web.Extensions.dll')],
})

const terminal = windowsNativeExecutable({
  cacheName: 'omne-windows-execution',
  executableName: 'bridge.exe',
  sources: [{ fileName: 'terminal.cs', text: terminalNativeSource }, bridgeSource],
  main: 'OmneTerminalEntry',
  references: [frameworkAssembly('System.Web.Extensions.dll'), powershellAssembly()],
})

/** Compile only project source with the installed .NET Framework compiler. */
export function windowsBridgeExecutable(): Promise<string> {
  return bridge()
}

export function windowsTerminalExecutable(): Promise<string> {
  return terminal()
}
