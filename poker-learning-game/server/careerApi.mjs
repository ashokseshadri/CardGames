import { CareerLedgerError } from './careerLedger.mjs'

const json = (response, status, body) => {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  response.end(payload)
}

const readJson = async (request, maxBytes) => {
  const contentType = String(request.headers['content-type'] ?? '')
  if (contentType && !contentType.toLowerCase().startsWith('application/json')) {
    throw new CareerLedgerError('Request body must be JSON.', 'JSON_REQUIRED', 415)
  }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new CareerLedgerError('JSON body is too large.', 'BODY_TOO_LARGE', 413)
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed
  } catch {
    throw new CareerLedgerError('Malformed JSON request body.', 'INVALID_JSON', 400)
  }
}

export const createCareerApiMiddleware = ({ ledger, maxBodyBytes = 16 * 1024 }) => async (request, response, next) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/career')) {
    if (next) next()
    else json(response, 404, { error: 'Not found.', code: 'NOT_FOUND' })
    return
  }
  try {
    if (url.pathname === '/api/career' && request.method === 'GET') {
      json(response, 200, ledger.read())
      return
    }
    if (request.method === 'POST' && ['/api/career/borrow', '/api/career/repay', '/api/career/round'].includes(url.pathname)) {
      const body = await readJson(request, maxBodyBytes)
      const result = url.pathname === '/api/career/borrow'
        ? ledger.borrow()
        : url.pathname === '/api/career/repay'
          ? ledger.repay()
          : ledger.settleRound(body)
      json(response, 200, result)
      return
    }
    json(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    const known = error instanceof CareerLedgerError
    json(response, known ? error.status : 500, {
      error: known ? error.message : 'Career ledger is temporarily unavailable.',
      code: known ? error.code : 'INTERNAL_ERROR',
    })
  }
}
