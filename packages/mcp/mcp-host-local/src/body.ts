import { BYTE_LIMIT } from './limits.ts'

export async function bodyOf(response: Response): Promise<string> {
  const body = response.body
  if (body === null) return ''
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  for await (const chunk of body) {
    bytes += chunk.byteLength
    if (bytes > BYTE_LIMIT) {
      await body.cancel().catch(() => undefined)
      throw new RangeError('the body is above the byte bound')
    }
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}
