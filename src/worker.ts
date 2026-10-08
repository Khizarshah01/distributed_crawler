import { pool } from "./db.js";
import {
  claimUrl,
  markFetched,
  markFailed,
  markBlocked,
  enqueueUrl,
  recoverExpiredLeases,
} from './frontier.js';
import { fetchPage } from "./fetcher.js";
import { extractLinks } from "./parser.js";
import { canCrawl } from "./robots.js";
import { getDnsStats } from './dns.js';

const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 2);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const workerId = process.argv[2] ?? `worker-${process.pid}`;
  let processed = 0;

  console.log(`starting worker ${workerId}`);

  try {
    let lastRecovery = 0;

    while (true) {
      if (Date.now() - lastRecovery >= 5000) {
        const recovered = await recoverExpiredLeases();

        if (recovered > 0) {
          console.log(
            `${workerId}: recovered ${recovered} expired lease(s)`,
          );
        }

        lastRecovery = Date.now();
      }

      const job = await claimUrl(workerId);
      if (!job) {
        await sleep(1000);
        continue;
      }

      console.log(`${workerId} processing ${job.url}`);

      try {
        const allowed = await canCrawl(job.url);

        if (!allowed) {
          console.log(`${workerId}: blocked by robots.txt ${job.url}`);

          await markBlocked(job.id, workerId);
          continue;
        }

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

        await markFetched(job.id, result.status, workerId);
        processed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await markFailed(job.id, message, workerId);
        console.error(`${workerId}: failed ${job.url}: ${message}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
