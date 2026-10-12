import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkExistingTenantAuth, prepareStateDirectory } from './state-layout.ts'
import { checkPrivateFile } from './state-layout-files.ts'
import { connectSessionHost, type SessionHostConnectionPolicy } from './session-host-connection.ts'
import { parseSessionHostStartup, type SessionHostStartup } from './session-host-startup.ts'

/** The child owns duplicated log descriptors and its own Session resources after launch. */
export async function connectProductionSessionHost(
  input: SessionHostStartup,
  signal: AbortSignal,
  policy: SessionHostConnectionPolicy,
) {
  const startup = parseSessionHostStartup(JSON.stringify(input))
  const paths = await checkExistingTenantAuth(startup.home, startup.binding)
  await prepareStateDirectory(startup.home, paths.logs)
  const log = await open(
    join(paths.logs, 'session-host.log'),
    constants.O_CREAT |
      constants.O_APPEND |
      constants.O_WRONLY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  )
  try {
    await checkPrivateFile(log)
    return await connectSessionHost({
      home: startup.home,
      binding: startup.binding,
      signal,
      policy,
      launch: () =>
        spawn(
          process.execPath,
          [
            fileURLToPath(new URL('./session-host-main.js', import.meta.url)),
            JSON.stringify(startup),
          ],
          { detached: true, stdio: ['ignore', 'ignore', log.fd] },
        ),
    })
  } finally {
    await log.close()
  }
}
