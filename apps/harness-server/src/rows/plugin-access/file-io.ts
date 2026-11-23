import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'

/** How the plugin sources touch a file. Each costs what it touches: a digest reads the file once as a stream, a range reads that range. */
export type FileIo = Readonly<{
  digest(
    path: string,
    keepText: boolean,
  ): Promise<Readonly<{ digest: string; text: string | null }>>
  range(path: string, offset: number, length: number): Promise<Uint8Array>
}>

export const nodeFileIo: FileIo = Object.freeze({
  digest(path: string, keepText: boolean) {
    return new Promise<Readonly<{ digest: string; text: string | null }>>((resolve, reject) => {
      const hash = createHash('sha256')
      const kept: Buffer[] = []
      createReadStream(path)
        .on('data', chunk => {
          hash.update(chunk)
          if (keepText) kept.push(Buffer.from(chunk))
        })
        .on('error', reject)
        .on('end', () =>
          resolve({
            digest: hash.digest('hex'),
            text: keepText ? Buffer.concat(kept).toString('utf8') : null,
          }),
        )
    })
  },
  async range(path: string, offset: number, length: number) {
    const handle = await open(path, 'r')
    try {
      const buffer = new Uint8Array(Math.max(0, length))
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, offset)
      return buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  },
})
