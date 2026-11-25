/** PDFs written here, byte by byte, so each case of the engine has a file that is only what it says. */
function pdf(objects: readonly string[], trailer = ''): Uint8Array {
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  const entries = offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries.join('')}`
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R ${trailer}>>\n`
  out += `startxref\n${String(xref)}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

function stream(content: string): string {
  return `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`
}

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>'
const PAGES = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
const page = (resources: string) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources ${resources} >>`
const hex = (bytes: number) => `<${'ab'.repeat(bytes)}>`

/** Two columns, the left one written first, as most typesetting writes them. */
export function twoColumns(): Uint8Array {
  const left = 'BT /F1 12 Tf 72 720 Td (Left one.) Tj 0 -16 Td (Left two.) Tj ET'
  const right = 'BT /F1 12 Tf 320 720 Td (Right one.) Tj 0 -16 Td (Right two.) Tj ET'
  return pdf([
    CATALOG,
    PAGES,
    page('<< /Font << /F1 5 0 R >> >>'),
    stream(`${left}\n${right}`),
    FONT,
  ])
}

/** A scan: one page that is a picture and has no text layer. */
export function scan(): Uint8Array {
  const image =
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray' +
    ' /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 3 >>\nstream\n80>\nendstream'
  const draw = 'q 540 0 0 720 36 36 cm /Im1 Do Q'
  return pdf([CATALOG, PAGES, page('<< /XObject << /Im1 5 0 R >> >>'), stream(draw), image])
}

/** A PDF that asks for a password to open it. */
export function encrypted(): Uint8Array {
  const handler = `<< /Filter /Standard /V 1 /R 2 /O ${hex(32)} /U ${hex(32)} /P -4 >>`
  const blank = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'
  return pdf([CATALOG, PAGES, blank, handler], `/Encrypt 4 0 R /ID [${hex(16)} ${hex(16)}] `)
}

/** The first half of a PDF: its structure ends before its cross-reference does. */
export function damaged(): Uint8Array {
  const whole = twoColumns()
  return whole.subarray(0, Math.floor(whole.byteLength / 2))
}

/** A tree of pages that holds itself: pdf.js fails on it with an error it does not name. */
export function selfHoldingPages(): Uint8Array {
  return pdf([CATALOG, '<< /Type /Pages /Kids [2 0 R] /Count 1 >>'])
}
