import { spawn } from 'node:child_process'
import {
  spawnFailedFrame,
  standardInput,
  type CommandFrame,
  type GateRequest,
} from './command-gate-core.ts'

/** Only a private gate process calls this. The child inherits the open working directory. */
export function spawnGateChild(
  request: GateRequest,
  send: (frame: CommandFrame) => unknown,
  closeControl: () => void,
) {
  const failed = (error: unknown) => {
    send(spawnFailedFrame(error instanceof Error ? Reflect.get(error, 'code') : undefined))
    closeControl()
  }
  try {
    process.chdir(request.cwd)
    const cwd = process.cwd()
    const child = spawn(request.executable, [...request.args], {
      env: { ...request.env },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    })
    child.stdio[3]?.destroy()
    child.stdin?.on('error', () => undefined)
    let spawned = false
    child.once('error', error => {
      if (!spawned) failed(error)
    })
    child.once('spawn', () => {
      spawned = true
      send({ t: 'started', cwd })
      child.stdin?.end(standardInput(request))
    })
    return child
  } catch (error) {
    failed(error)
    return undefined
  }
}
