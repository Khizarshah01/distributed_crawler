import { fetch } from 'undici';
import { dnsAgent } from './dns.js';

export async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'distributed-crawler/0.1',
    },
    signal: AbortSignal.timeout(10_000),
    dispatcher: dnsAgent,
  });

  const contentType = response.headers.get('content-type') ?? '';

  const html = contentType.includes('text/html')
    ? await response.text()
    : null;

  return {
    status: response.status,
    contentType,
    html,
  };
}