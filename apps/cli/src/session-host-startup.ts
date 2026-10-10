import { z } from 'zod'
import { resolveStateHome, type TenantBinding } from './state-layout.ts'
import { checkedTenantBinding } from './state-layout-values.ts'

const startup = z.strictObject({
  format: z.literal('omne-session-host-startup/1'),
  home: z.string().min(1).max(4096),
  binding: z.unknown(),
  routeName: z.string().min(1).max(1024),
})
export interface SessionHostStartup {
  readonly format: 'omne-session-host-startup/1'
  readonly home: string
  readonly binding: TenantBinding
  readonly routeName: string
}

/** Process input is data. The host obtains current identity and credentials from its tenant. */
export function parseSessionHostStartup(text: string): SessionHostStartup {
  if (Buffer.byteLength(text, 'utf8') > 65_536) throw new TypeError('Session host input too large')
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch (cause) {
    throw new TypeError('invalid Session host startup JSON', { cause })
  }
  const checked = startup.safeParse(decoded)
  if (!checked.success) throw new TypeError('invalid Session host startup input')
  const value = checked.data
  try {
    const home = resolveStateHome({ explicitHome: value.home, osHome: value.home })
    if (home !== value.home) throw new TypeError('Session host requires a canonical home')
    return Object.freeze({
      format: value.format,
      home,
      binding: Object.freeze(checkedTenantBinding(value.binding)),
      routeName: value.routeName,
    })
  } catch (cause) {
    throw new TypeError('invalid Session host startup identity or home', { cause })
  }
}
