/**
 * HTTP helper: fetch dengan timeout + error handling.
 * Node 18+ (built-in fetch).
 */
const DEFAULT_TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '15000', 10);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function http(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/html;q=0.9', ...headers },
      body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* bukan JSON */
    }
    return { status: res.status, ok: res.ok, text, json };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout ${timeoutMs}ms: ${url}`);
    }
    throw new Error(`Request gagal: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { http, BROWSER_UA, DEFAULT_TIMEOUT_MS };
