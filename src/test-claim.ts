import { pool } from './db.js';
import { claimUrl } from './frontier.js';

async function main() {
  const job = await claimUrl('worker-1');

  console.log('Claimed:', job);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
