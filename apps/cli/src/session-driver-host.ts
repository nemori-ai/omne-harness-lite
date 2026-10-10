import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  SessionDriverControl,
  SessionDriverCloseResult,
} from '@omne-harness-lite/session-runtime'
import {
  createLocalSessionDriver,
  type LocalSessionDriverOptions,
} from '@omne-harness-lite/session-runtime-local'
import { checkedTenantBinding, type TenantBinding } from './state-layout-values.ts'
import { createSessionHostEndpoint, type SessionCreationDefaults } from './session-host-protocol.ts'
import {
  startLocalSessionHost,
  type LocalSessionHost,
  type SessionHostPolicy,
} from './session-host-server.ts'

export interface SessionDriverHostOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly creation?: SessionCreationDefaults
  readonly initialRouteName?: string
  readonly transport: SessionHostPolicy
  readonly driver: LocalSessionDriverOptions
}
export interface SessionDriverHost {
  readonly socketPath: string
  readonly close: () => Promise<SessionDriverCloseResult>
}
export class SessionDriverHostStartupFailure extends AggregateError {
  constructor(
    errors: readonly unknown[],
    readonly closeRetained: SessionDriverHost['close'],
  ) {
    super(errors, 'Session host startup and cleanup failed; original resources retained')
  }
}

/** The socket owns admission. The public driver owns all Run and call progression. */
export async function startSessionDriverHost(
  options: SessionDriverHostOptions,
): Promise<SessionDriverHost> {
  const binding = Object.freeze(checkedTenantBinding(options.binding))
  if (!tenantIdEquals(binding.tenant, options.driver.tenant))
    throw new TypeError('Session host and driver must share the fixed tenant')
  const owner = new DriverHost()
  owner.server = await startLocalSessionHost({
    home: options.home,
    binding,
    endpoint: createSessionHostEndpoint({
      binding,
      ingress: options.driver.ingress,
      clock: options.driver.clock,
      ...(options.initialRouteName === undefined
        ? {}
        : { initialRouteName: options.initialRouteName }),
      ...(options.creation === undefined ? {} : { creation: options.creation }),
    }),
    policy: options.transport,
    diagnostic: error => {
      owner.stop()
      options.driver.diagnostic(error)
    },
  })
  try {
    owner.driver = await createLocalSessionDriver(
      {
        ...options.driver,
        diagnostic: error => {
          owner.stop()
          options.driver.diagnostic(error)
        },
      },
      owner.signal.signal,
    )
    return Object.freeze({ socketPath: owner.server.socketPath, close: owner.close })
  } catch (error) {
    try {
      await owner.close()
    } catch (cleanup) {
      throw new SessionDriverHostStartupFailure([error, cleanup], owner.close)
    }
    throw error
  }
}
class DriverHost {
  readonly signal = new AbortController()
  server?: LocalSessionHost
  driver?: SessionDriverControl
  closing?: Promise<SessionDriverCloseResult>
  stop() {
    this.server?.stopAdmission()
    this.signal.abort()
    this.driver?.requestStop()
  }
  close = (): Promise<SessionDriverCloseResult> => {
    this.stop()
    this.closing ??= this.finishClose().finally(() => {
      delete this.closing
    })
    return this.closing
  }
  async finishClose(): Promise<SessionDriverCloseResult> {
    const [socket, driver] = await Promise.allSettled([
      Promise.resolve().then(() => this.server?.close()),
      Promise.resolve().then(() => this.driver?.close() ?? { closed: true as const }),
    ])
    const errors = [socket, driver].flatMap(result =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (errors.length)
      throw new AggregateError(errors, 'Session host close failed; original resources retained')
    if (driver.status === 'rejected') throw driver.reason
    return driver.value
  }
}
