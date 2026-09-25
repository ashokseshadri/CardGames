// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCareerApiMiddleware } from './careerApi.mjs'
import { openCareerLedger } from './careerLedger.mjs'

let directory
let ledger
let middleware

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'poker-career-api-'))
  ledger = openCareerLedger({ dbPath: join(directory, 'career.sqlite'), now: () => new Date('2026-02-01T12:00:00.000Z') })
  middleware = createCareerApiMiddleware({ ledger, maxBodyBytes: 128 })
})

afterEach(() => {
  ledger.close()
  rmSync(directory, { recursive: true, force: true })
})

const invoke = ({ method = 'GET', path = '/api/career', body = '', contentType = 'application/json' } = {}) => new Promise((resolve, reject) => {
  const request = Readable.from(body ? [Buffer.from(body)] : [])
  request.method = method
  request.url = path
  request.headers = body ? { 'content-type': contentType } : {}
  let status = 200
  let headers = {}
  const response = {
    writeHead(nextStatus, nextHeaders) { status = nextStatus; headers = nextHeaders },
    end(payload = '') {
      try { resolve({ status, headers, body: payload ? JSON.parse(String(payload)) : null }) }
      catch (error) { reject(error) }
    },
  }
  Promise.resolve(middleware(request, response)).catch(reject)
})

const post = (path, value, contentType) => invoke({ method: 'POST', path, body: value, contentType })

describe('career JSON API', () => {
  it('reads, borrows, repays, and settles through the middleware contract', async () => {
    expect((await invoke()).body).toMatchObject({ availableChips: 0 })
    expect((await post('/api/career/borrow', '{}')).body).toMatchObject({ availableChips: 100, loanPrincipal: 100 })
    expect((await post('/api/career/round', JSON.stringify({ handId: 'api-hand', outcome: 'win', netChips: 37 }))).body).toMatchObject({ availableChips: 137, totalWon: 37, handsPlayed: 1 })
    expect((await post('/api/career/repay', '{}')).body).toMatchObject({ availableChips: 37, totalDebt: 0, totalRepaid: 100 })
  })

  it('returns structured errors for malformed and conflicting requests without extra settlement', async () => {
    const malformed = await post('/api/career/round', '{')
    expect(malformed).toMatchObject({ status: 400, body: { code: 'INVALID_JSON' } })
    await post('/api/career/borrow', '{}')
    await post('/api/career/round', JSON.stringify({ handId: 'same', outcome: 'win', netChips: 25 }))
    const conflict = await post('/api/career/round', JSON.stringify({ handId: 'same', outcome: 'loss', netChips: -25 }))
    expect(conflict).toMatchObject({ status: 409, body: { code: 'HAND_CONFLICT' } })
    expect(ledger.read()).toMatchObject({ availableChips: 125, handsPlayed: 1 })
  })

  it('rejects oversized and non-JSON bodies before invoking a mutation', async () => {
    expect(await post('/api/career/borrow', JSON.stringify({ padding: 'x'.repeat(200) }))).toMatchObject({ status: 413 })
    expect(await post('/api/career/borrow', '{}', 'text/plain')).toMatchObject({ status: 415 })
    expect(ledger.read()).toMatchObject({ availableChips: 0, totalBorrowed: 0 })
  })
})
