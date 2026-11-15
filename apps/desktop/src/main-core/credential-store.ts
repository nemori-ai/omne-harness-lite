import type { LoginStateId } from '@omne-harness/legal-identity'

export type StoredLogin = Readonly<{ proof: string; tenant: string; loginId: LoginStateId }>

export interface CredentialStore {
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
