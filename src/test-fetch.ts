import 'dotenv/config';
import { pool } from './db.js';
import { claimUrl, markFetched, markFailed } from './frontier.js';
import { fetchPage } from './fetcher.js';

async function main() {
  const job = await claimUrl('worker-1');

  if (!job) {
    console.log('No queued URL');
    return;
  }

  console.log('Claimed:', job);

  try {
    const result = await fetchPage(job.url);

    console.log('HTTP status:', result.status);
    console.log('Content type:', result.contentType);
    console.log('HTML received:', result.html?.length ?? 0, 'bytes');

    await markFetched(job.id, result.status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await markFailed(job.id, message);

    console.error('Fetch failed:', message);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
