import { pool } from './db.js';

export async function claimUrl(workerId: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        WITH next_url AS (
          SELECT id
          FROM frontier
          WHERE status = 'queued'
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE frontier AS f
        SET
          status = 'processing',
          locked_by = $1,
          locked_at = NOW(),
          updated_at = NOW()
        FROM next_url
        WHERE f.id = next_url.id
        RETURNING f.id, f.url, f.depth;
      `,
      [workerId],
    );
    // // claim one queued URL without waiting on rows another worker has locked
    await client.query('COMMIT');

    return result.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markFetched(
  id: string,
  httpStatus: number,
  workerId: string,
) {
  await pool.query(
    `
      UPDATE frontier
      SET
        status = 'fetched',
        http_status = $1,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
      WHERE id = $2
        AND status = 'processing'
        AND locked_by = $3
    `,
    [httpStatus, id, workerId],
  );
}

export async function markFailed(
  id: string,
  error: string,
  workerId: string,
) {
  await pool.query(
    `
      UPDATE frontier
      SET
        status = 'failed',
        error = $1,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
      WHERE id = $2
        AND status = 'processing'
        AND locked_by = $3
    `,
    [error, id, workerId],
  );
}

export async function enqueueUrl(url: string, depth: number) {
  await pool.query(
    `
      INSERT INTO frontier (url, depth)
      VALUES ($1, $2)
      ON CONFLICT (url) DO NOTHING
    `,
    [url, depth],
  );
}

// check is there any processing url stuck more then 30s if yes then put the status queued and lock free
export async function recoverExpiredLeases() {
  const result = await pool.query(`
    UPDATE frontier
    SET
      status = 'queued',
      locked_by = NULL,
      locked_at = NULL,
      updated_at = NOW()
    WHERE status = 'processing'
      AND locked_at < NOW() - INTERVAL '15 seconds'
  `);

  return result.rowCount ?? 0;
}