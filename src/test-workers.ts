import { pool } from './db.js';
import { claimUrl } from './frontier.js';

async function main() {
  const results = await Promise.all([
    claimUrl('worker-2'),
    claimUrl('worker-3'),
  ]);

  console.log(results);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
