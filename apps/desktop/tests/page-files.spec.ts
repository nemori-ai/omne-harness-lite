import { describe, expect, it } from 'vitest'
import { answerPageFile, pageSegments, type PageFileReader } from '../src/shared/page-files.ts'
import { CONTENT_SECURITY_POLICY } from '../src/shared/page-policy.ts'

function files(contents: Record<string, string>) {
  const asked: string[] = []
  const read: PageFileReader = async segments => {
    const path = segments.join('/')
    asked.push(path)
    const text = contents[path]
    return text === undefined ? undefined : new TextEncoder().encode(text)
  }
  return { read, asked }
}

describe('页面的静态文件', () => {
  it.each([
    '/../secret.txt',
    '/a/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/assets/..%5c..%5csecret.txt',
    '/%E0%A4%A',
    '/a%00.js',
  ])('越界或读不懂的路径 %s 答 404，不去读文件', async path => {
    const disk = files({ 'secret.txt': 'secret' })
    expect(await answerPageFile(path, disk.read)).toEqual({ status: 404 })
    expect(disk.asked).toEqual([])
  })

  it('目录里的「..」只在目录之内退回', async () => {
    expect(pageSegments('/assets/x/../app.js')).toEqual(['assets', 'app.js'])
    expect(pageSegments('/./assets//app.js')).toEqual(['assets', 'app.js'])
  })

  it('根路径是 index.html；读不到的文件答 404', async () => {
    const disk = files({ 'index.html': '<html></html>' })
    expect((await answerPageFile('/', disk.read)).status).toBe(200)
    expect(await answerPageFile('/missing.js', disk.read)).toEqual({ status: 404 })
    expect(disk.asked).toEqual(['index.html', 'missing.js'])
  })

  it('HTML 带内容安全策略，别的类型不带', async () => {
    const disk = files({ 'index.html': '<html></html>', 'assets/app.js': '1' })
    const html = await answerPageFile('/index.html', disk.read)
    const script = await answerPageFile('/assets/app.js', disk.read)
    if (html.status !== 200 || script.status !== 200) throw new Error('both files exist')
    expect(html.headers).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': CONTENT_SECURITY_POLICY,
    })
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(script.headers['content-security-policy']).toBeUndefined()
    expect(new TextDecoder().decode(script.body)).toBe('1')
  })

  it.each([
    ['/assets/blob.wasm', 'application/octet-stream'],
    ['/.hidden', 'application/octet-stream'],
    ['/LICENSE', 'application/octet-stream'],
    ['/fonts/inter.woff2', 'font/woff2'],
  ])('%s 的类型是 %s，不猜内容', async (path, type) => {
    const disk = files({ [path.slice(1)]: 'x' })
    const answer = await answerPageFile(path, disk.read)
    if (answer.status !== 200) throw new Error('the file exists')
    expect(answer.headers['content-type']).toBe(type)
    expect(answer.headers['x-content-type-options']).toBe('nosniff')
  })
})
