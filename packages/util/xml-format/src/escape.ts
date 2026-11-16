const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export function escapeXmlContent(text: string): string {
  assertXmlCharacters(text)
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function assertXmlCharacters(text: string): void {
  for (const char of text) {
    const point = char.codePointAt(0)
    if (
      point === undefined ||
      !(
        point === 0x09 ||
        point === 0x0a ||
        point === 0x0d ||
        (point >= 0x20 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff)
      )
    ) {
      throw new TypeError(`illegal XML 1.0 character: ${JSON.stringify(char)}`)
    }
  }
}

export function escapeXmlAttribute(text: string): string {
  return escapeXmlContent(text).replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function isXmlName(name: string): boolean {
  return XML_NAME.test(name)
}

export function assertXmlName(name: string, role: string): string {
  if (!isXmlName(name)) {
    throw new Error(`invalid XML ${role} name: ${JSON.stringify(name)}`)
  }
  return name
}
