import { closeSync, fsyncSync, mkdirSync, openSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { DOMAIN_RULE } from './config.ts'
import { DIRECTORY_FILE_FORMAT, fsyncDirectory, readDirectoryFile } from './directory.ts'

export type TenantDirectoryLocation = Readonly<{ storageRoot: string; directoryFile: string }>

function validateLocation({ storageRoot, directoryFile }: TenantDirectoryLocation): void {
  if (
    !isAbsolute(storageRoot) ||
    !isAbsolute(directoryFile) ||
    resolve(directoryFile) === resolve(storageRoot) ||
    dirname(resolve(directoryFile)) !== resolve(storageRoot)
  )
    throw new Error('tenant domain directory file must be a direct child of the storage root')
}

/** Only a newly claimed storage root may receive an empty registration file. */
export function initializeTenantDirectory(location: TenantDirectoryLocation): void {
  validateLocation(location)
  try {
    mkdirSync(location.storageRoot)
    const fd = openSync(location.directoryFile, 'wx')
    try {
      writeFileSync(
        fd,
        `${JSON.stringify({ format: DIRECTORY_FILE_FORMAT, domainRule: DOMAIN_RULE, tenants: [] })}\n`,
      )
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    fsyncDirectory(location.storageRoot)
    fsyncDirectory(dirname(location.storageRoot))
  } catch {
    throw new Error('tenant domain directory initialization failed')
  }
}

/** Call before loading storage, identity or session rows. Existing roots must have a valid file. */
export function prepareTenantDirectory(location: TenantDirectoryLocation): void {
  validateLocation(location)
  let missing = false
  try {
    if (!statSync(location.storageRoot).isDirectory())
      throw new Error('storage root is not a directory')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') missing = true
    else throw new Error('tenant domain directory storage root could not be opened')
  }
  if (missing) initializeTenantDirectory(location)
  else readDirectoryFile(location.directoryFile)
}
