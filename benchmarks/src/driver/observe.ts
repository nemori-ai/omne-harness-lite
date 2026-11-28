import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTenantText } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk'
import { sessionProtocol } from '@omne-harness/session-protocol'

type Login = Readonly<{ tenantId: string; loginProof: string }>

export async function firstFrame(
  input: Readonly<{ directory: string; server: string; session: string }>,
): Promise<string> {
  const login = JSON.parse(
    readFileSync(join(input.directory, 'omne', 'login.json'), 'utf8'),
  ) as Login
  const tenant = readTenantText(login.tenantId)
  if (tenant === undefined) throw new Error('the login of the client names no tenant')
  const transport = createHttpProtocolTransport({
    origin: input.server,
    credentials: () => ({ proof: login.loginProof }),
  })
  const leave = new AbortController()
  const frames = createClient(sessionProtocol, transport).observe['observe-session'](
    { tenant, session: input.session } as never,
    { signal: leave.signal, messageId: randomUUID() },
  )
  try {
    const first = await frames.next()
    if (first.done === true) throw new Error('the observation ended before its first frame')
    return (first.value as Readonly<{ kind: string }>).kind
  } finally {
    leave.abort()
    await frames.return?.(undefined as never).catch(() => {})
  }
}
