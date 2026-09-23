// 运维面的本机套接字（https-json/1 S-20；入口契约 S-25）：部署配置给的目录下恰为 `governance-center-ops.sock`。
// 「只在本机可达」由操作系统的文件访问控制兑现：目录只对中心的运行用户可访问，否则启动失败，中心不替运维者改权限。
// 启动失败说明不含 config 的值（目录路径也不写）。
import { lstat, stat, unlink } from 'node:fs/promises'
import { type Server, connect, createServer } from 'node:net'
import { join } from 'node:path'

export const OPS_SOCKET_NAME = 'governance-center-ops.sock'

export type OpsSocketFailure =
  | 'directory-missing'
  | 'not-a-directory'
  | 'directory-permissions'
  | 'unsupported-platform'
  | 'socket-in-use'
  | 'not-a-socket'
  | 'unusable'

const EXPLANATIONS: Record<OpsSocketFailure, string> = {
  'directory-missing': 'the ops socket directory does not exist',
  'not-a-directory': 'the ops socket directory is not a directory',
  'directory-permissions':
    'the ops socket directory must be owned by the running user and grant no permission to group or others',
  'unsupported-platform': 'the ops face needs POSIX file ownership (process.getuid)',
  'socket-in-use': `another process is listening on ${OPS_SOCKET_NAME}; another center instance may be running`,
  'not-a-socket': `${OPS_SOCKET_NAME} exists and is not a socket; refusing to remove it`,
  unusable: `${OPS_SOCKET_NAME} could not be prepared or bound`,
}

export class OpsSocketError extends Error {
  override readonly name = 'OpsSocketError'
  readonly failure: OpsSocketFailure

  constructor(failure: OpsSocketFailure, options?: { readonly cause?: unknown }) {
    super(`governance-center-ops: ${EXPLANATIONS[failure]}`, options)
    this.failure = failure
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

/** 目录核验：存在、是目录、所有者是运行用户、组与其他用户没有任何权限位。 */
async function verifyDirectory(directory: string): Promise<void> {
  let info
  try {
    info = await stat(directory)
  } catch (error) {
    throw new OpsSocketError(errorCode(error) === 'ENOENT' ? 'directory-missing' : 'unusable', {
      cause: error,
    })
  }
  if (!info.isDirectory()) throw new OpsSocketError('not-a-directory')
  const uid = process.getuid?.()
  if (uid === undefined) throw new OpsSocketError('unsupported-platform')
  if (info.uid !== uid || (info.mode & 0o077) !== 0)
    throw new OpsSocketError('directory-permissions')
}

/** 试连一个已有的套接字文件：连得上 ⇒ 有人在听。 */
function someoneListens(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = connect(path)
    probe.once('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.once('error', error => {
      probe.destroy()
      if (errorCode(error) === 'ECONNREFUSED') resolve(false)
      else reject(error)
    })
  })
}

/**
 * 核目录、处理那个位置上已有的文件：有人在听的套接字 ⇒ 启动失败、不抢占；没人在听的 ⇒ 上次的残留，删掉；
 * 不是套接字 ⇒ 启动失败、不删。返回套接字路径。
 */
export async function prepareSocketPath(directory: string): Promise<string> {
  await verifyDirectory(directory)
  const path = join(directory, OPS_SOCKET_NAME)
  let existing
  try {
    existing = await lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return path
    throw new OpsSocketError('unusable', { cause: error })
  }
  if (!existing.isSocket()) throw new OpsSocketError('not-a-socket')
  let listening: boolean
  try {
    listening = await someoneListens(path)
  } catch (error) {
    throw new OpsSocketError('unusable', { cause: error })
  }
  if (listening) throw new OpsSocketError('socket-in-use')
  try {
    await unlink(path)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw new OpsSocketError('unusable', { cause: error })
  }
  return path
}

/** 在套接字路径上监听（`allowHalfOpen`：对端先半关也要写得出答复）。 */
export function listenOnSocket(path: string): Promise<Server> {
  const server = createServer({ allowHalfOpen: true })
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(
        new OpsSocketError(errorCode(error) === 'EADDRINUSE' ? 'socket-in-use' : 'unusable', {
          cause: error,
        }),
      )
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(server)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(path)
  })
}

/** 撤除收尾：删掉本实例绑定的套接字文件（已不在不算错）。 */
export async function removeSocketFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}
