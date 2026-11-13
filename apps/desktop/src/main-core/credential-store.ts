// Where the login proof is kept between runs (RFC-0015 §10「凭据库」). This run keeps it only in
// the host process's memory: a restart signs out. The interface is the one the OS-encrypted store
// will implement later.
import type { LoginStateId } from '@omne-harness/legal-identity'

/** One login, as the login session holds it. `tenant` is the acting tenant's wire text. */
export type StoredLogin = Readonly<{ proof: string; tenant: string; loginId: LoginStateId }>

export interface CredentialStore {
  /** The saved login, or `undefined` when there is none or it cannot be read. */
  read(): Promise<StoredLogin | undefined>
  write(login: StoredLogin): Promise<void>
  erase(): Promise<void>
}

export function memoryCredentialStore(initial?: StoredLogin): CredentialStore {
  let saved = initial
  return {
    read: async () => saved,
    write: async login => {
      saved = login
    },
    erase: async () => {
      saved = undefined
    },
  }
}
