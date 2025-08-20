'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

test('localhost wildcard subdomain resolution per RFC 6761 and Fetch spec', async (t) => {
  const { ok, strictEqual } = tspl(t, { plan: 14 })

  const server = createServer((req, res) => {
    // Verify the Host header is set correctly for SNI/virtual hosting
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      host: req.headers.host,
      url: req.url,
      method: req.method
    }))
  })

  t.after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')

  const port = server.address().port

  // Test cases for localhost wildcard subdomains
  // Note: Hostnames are normalized to lowercase per RFC 3986
  const localhostCases = [
    'localhost',
    'api.localhost',
    'test.localhost',
    'my-service.localhost',
    'sub.domain.localhost',
    'localhost.',
    'api.localhost.'
  ]

  for (const hostname of localhostCases) {
    const response = await fetch(`http://${hostname}:${port}/test`)
    const data = await response.json()

    ok(response.ok, `${hostname} should resolve successfully`)
    strictEqual(data.host, `${hostname}:${port}`, `Host header should be correctly set for ${hostname}`)
  }
})

test('localhost wildcard should not affect non-localhost domains', async (t) => {
  const { rejects } = tspl(t, { plan: 2 })

  // These should NOT be treated as localhost domains
  const nonLocalhostCases = [
    'example.localhost.com',
    'notlocalhost.com'
  ]

  for (const hostname of nonLocalhostCases) {
    // These should fail with network errors since they're not actually localhost
    await rejects(
      fetch(`http://${hostname}:12345/test`, {
        signal: AbortSignal.timeout(100) // Quick timeout to avoid hanging
      }),
      /Error/,
      `${hostname} should not be treated as localhost subdomain`
    )
  }
})

test('localhost wildcard case insensitive matching', async (t) => {
  const { ok, strictEqual } = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      host: req.headers.host
    }))
  })

  t.after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')

  const port = server.address().port

  // Test case-insensitive matching per RFC requirements
  // Note: HTTP hostnames are normalized to lowercase per RFC 3986
  const caseVariations = [
    { input: 'LOCALHOST', expected: 'localhost' },
    { input: 'API.LOCALHOST', expected: 'api.localhost' },
    { input: 'Mixed.LocalHost', expected: 'mixed.localhost' }
  ]

  for (const { input, expected } of caseVariations) {
    const response = await fetch(`http://${input}:${port}/test`)
    const data = await response.json()

    ok(response.ok, `${input} should resolve successfully (case insensitive)`)
    strictEqual(data.host, `${expected}:${port}`, `Host header should be normalized to lowercase for ${input}`)
  }
})
