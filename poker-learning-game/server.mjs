import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import { createCareerApiMiddleware } from './server/careerApi.mjs'
import { CareerLedgerError, openCareerLedger } from './server/careerLedger.mjs'

const port = Number(process.env.PORT ?? 5173)
const host = process.env.HOST ?? '127.0.0.1'
let ledger
try {
  ledger = openCareerLedger({ dbPath: resolve(process.env.CAREER_DB_PATH ?? 'data/career.sqlite') })
} catch {
  const unavailable = () => { throw new CareerLedgerError('The local career database could not be opened. Practice mode is still available.', 'DATABASE_UNAVAILABLE', 503) }
  ledger = { read: unavailable, borrow: unavailable, repay: unavailable, settleRound: unavailable, close: () => undefined }
  console.error('Career mode is unavailable because the local SQLite database could not be opened.')
}
const careerApi = createCareerApiMiddleware({ ledger })
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })

const server = createServer((request, response) => {
  void careerApi(request, response, () => vite.middlewares(request, response, () => {
    response.writeHead(404)
    response.end('Not found')
  }))
})

server.listen(port, host, () => {
  console.log(`Poker Study Lab running at http://${host}:${port}`)
})

const shutdown = () => {
  server.close(() => {
    void vite.close().finally(() => {
      ledger.close()
      process.exit(0)
    })
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
