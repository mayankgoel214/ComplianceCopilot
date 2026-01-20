// Add polyfills that need to be available before anything else loads

// Add TextEncoder/TextDecoder polyfills
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Add fetch polyfill
import 'whatwg-fetch'

// Polyfill for Response and Request
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Map(Object.entries(init?.headers || {}))
    }

    async json() {
      return JSON.parse(this.body)
    }

    async text() {
      return this.body
    }
  }
}

if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init) {
      this.url = input
      this.method = init?.method || 'GET'
      this.headers = new Map(Object.entries(init?.headers || {}))
      this.body = init?.body
    }
  }
}