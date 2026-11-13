// This machine's ephemeral port range starts at 1024, so `listen(0)` can land on a port that
// `fetch` refuses ("bad port", Fetch standard §2.9). Such a host is closed and made again.
import type { WebHost } from '../../src/web-host/server.ts'

const FETCH_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
])

export async function listenFetchable(
  make: () => WebHost,
): Promise<{ readonly host: WebHost; readonly port: number }> {
  for (;;) {
    const host = make()
    const port = await host.listen(0)
    if (!FETCH_BAD_PORTS.has(port)) return { host, port }
    await host.close()
  }
}
