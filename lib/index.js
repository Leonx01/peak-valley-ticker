// Host half of the peak-valley-ticker plugin.
// The visual work happens in the client half (lib/client.js): it registers a
// `shell.overlay` list-slot entry rendering the 峰/谷 price ticker plus the
// DeepSeek API remaining balance.
// This host half proxies the DeepSeek balance API so the browser never sees
// the API key: the client fetches /peak-valley-ticker/balance on the same
// origin, and the host resolves the credential (ctx.credentials seam, then
// the launching environment) and calls api.deepseek.com server-side.

export const name = 'peak-valley-ticker'

export const inject = ['webServer']

const BALANCE_PATH = '/peak-valley-ticker/balance'
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance'

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function fetchBalance(apiKey) {
  const res = await fetch(BALANCE_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `http-${res.status}` }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'bad-response' }
  }
  const balanceInfos = Array.isArray(data.balance_infos)
    ? data.balance_infos.map((b) => ({
        currency: b.currency,
        totalBalance: b.total_balance,
        grantedBalance: b.granted_balance,
        toppedUpBalance: b.topped_up_balance,
      }))
    : []
  return { ok: true, isAvailable: data.is_available === true, balanceInfos }
}

export function apply(ctx, config) {
  const c = config && typeof config === 'object' ? config : {}
  const apiKeyEnv =
    typeof c.apiKeyEnv === 'string' && c.apiKeyEnv.length > 0 ? c.apiKeyEnv : DEFAULT_API_KEY_ENV

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: BALANCE_PATH,
      handler: async (req, res) => {
        try {
          let apiKey
          const credentials = ctx.get('credentials')
          if (credentials !== undefined) {
            const hit = await credentials.resolve(apiKeyEnv)
            if (hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0) {
              apiKey = hit.value
            }
          }
          if (apiKey === undefined) {
            const ambient = process.env[apiKeyEnv]
            if (typeof ambient === 'string' && ambient.length > 0) apiKey = ambient
          }
          if (apiKey === undefined) {
            return sendJson(res, 200, { ok: false, error: 'no-api-key' })
          }
          const result = await fetchBalance(apiKey)
          sendJson(res, 200, result)
        } catch {
          sendJson(res, 200, { ok: false, error: 'network' })
        }
      },
    })
  )
}
