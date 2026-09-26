/** Assembly observations only: each resource owner reports its own final result. */
export class MaintenanceFinalization {
  #storage: 'pending' | 'clean' | 'error' = 'pending'
  #controller: 'pending' | 'clean' | 'error' = 'pending'
  get storage() {
    return this.#storage
  }
  get controller() {
    return this.#controller
  }
  readonly storageClosed = (status: 'clean' | 'error'): void => {
    if (this.#storage !== 'error') this.#storage = status
  }
  readonly controllerClosed = (status: 'clean' | 'error'): void => {
    if (this.#controller !== 'error') this.#controller = status
  }
}
