// 本传输（https-json/1）答复的外形与体里时间点的写法，两张面共用。
// 契约：composition.governance-center-entry-https-json v1 S-11（答复的外形）、S-12（体的写出规则，时间点一行）。
// 放在 ops 目录下：运维面的导入白名单（契约 SC-2）只许 ops 目录内文件，客户端面从这里导入它，不另写第二份。

/** S-11：状态行与四个头恰此次序；`Content-Length` 是体的字节数（十进制、无前导零）。没有 `Date` 与任何随请求变化的头。 */
export function responseBytes(body: string): Buffer {
  const bodyBytes = Buffer.from(body, 'utf8')
  const head =
    'HTTP/1.1 200 OK\r\n' +
    'Content-Type: application/json\r\n' +
    'Cache-Control: no-store\r\n' +
    `Content-Length: ${String(bodyBytes.length)}\r\n` +
    'Connection: close\r\n' +
    '\r\n'
  return Buffer.concat([Buffer.from(head, 'latin1'), bodyBytes])
}

/**
 * S-12 时间点一行：UTC，`YYYY-MM-DDTHH:MM:SSZ`，秒的小数部分只在非零时写、取最少位数。
 * 不用 offer-expiry 的 `instantToRfc3339`：它总写三位小数。输入是 OE `Instant`（毫秒整数）；
 * 不是安全整数或落在 0000～9999 年之外 ⇒ 抛出（调用方按缺陷收场，不写出一个不合 OE Schema 的时间点）。
 */
export function formatInstant(epochMs: number): string {
  if (!Number.isSafeInteger(epochMs)) throw new RangeError('instant is not an integer millisecond')
  const iso = new Date(epochMs).toISOString()
  // 0000～9999 年恒为 `YYYY-MM-DDTHH:MM:SS.mmmZ`；此外 toISOString 写六位带号年份
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
    throw new RangeError('instant is outside the four-digit year range')
  }
  const fraction = iso.slice(20, 23).replace(/0+$/, '')
  return fraction === '' ? `${iso.slice(0, 19)}Z` : `${iso.slice(0, 19)}.${fraction}Z`
}
