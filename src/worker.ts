import { pool } from "./db.js";
import {
  claimUrl,
  markFetched,
  markFailed,
  enqueueUrl,
} from "./frontier.js";
import { fetchPage } from "./fetcher.js";
import { extractLinks } from "./parser.js";

const MAX_DEPTH = 2;

async function main() {
  const workerId = process.argv[2] ?? `worker-${process.pid}`;
  let processed = 0;

  console.log(`starting worker ${workerId}`);

  try {
    while (true) {
      const job = await claimUrl(workerId);
      if (!job) {
        console.log(`no queued urls`);
        break;
      }

      console.log(`${workerId} processing ${job.url}`);

      try {
        const result = await fetchPage(job.url);

        console.log(
          `${workerId}: ${result.status} ${job.url} (${result.html?.length ?? 0} bytes)`,
        );

        if (result.html && job.depth < MAX_DEPTH) {
          const links = extractLinks(result.html, job.url);

          for (const link of links) {
            await enqueueUrl(link, job.depth + 1);
          }

          console.log(`${workerId}: enqueued ${links.length} links`);
        }

        await markFetched(job.id, result.status);
        processed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await markFailed(job.id, message);
        console.error(`${workerId}: failed ${job.url}: ${message}`);
      }
    }
  } finally {
    await pool.end();
  }
      console.log(`${workerId}: processed ${processed} urls`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
