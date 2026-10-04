import { pool } from './db.js';

export async function claimUrl(workerId: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        WITH next_url AS (
          SELECT f.id, f.domain
          FROM frontier f
          JOIN hosts h ON f.domain = h.domain
          WHERE f.status = 'queued'
            AND h.in_flight = false
            AND h.next_allowed_at <= NOW()
          ORDER BY f.id
          FOR UPDATE OF f, h SKIP LOCKED
          LIMIT 1
        ),
        update_hosts AS (
          UPDATE hosts h
          SET in_flight = true
          FROM next_url
          WHERE h.domain = next_url.domain
        )
        UPDATE frontier AS f
        SET
          status = 'processing',
          locked_by = $1,
          locked_at = NOW(),
          updated_at = NOW()
        FROM next_url
        WHERE f.id = next_url.id
        RETURNING f.id, f.url, f.depth, f.domain;
      `,
      [workerId],
    );

    const job = result.rows[0];

    await client.query('COMMIT');

    return job ?? null;
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
    WITH completed AS(
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
      RETURNING domain
  )
      UPDATE hosts h
      SET 
        in_flight = false,
        next_allowed_at = NOW() + INTERVAL '1 second'
      FROM completed 
      WHERE h.domain = completed.domain
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
      WITH failed AS (
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
        RETURNING domain
      )
      UPDATE hosts h
      SET
        in_flight = false,
        next_allowed_at = NOW() + INTERVAL '1 second'
      FROM failed
      WHERE h.domain = failed.domain;
    `,
    [error, id, workerId],
  );
}

export async function enqueueUrl(url: string, depth: number) {
  const host = new URL(url).hostname;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO hosts (domain)
        VALUES ($1)
        ON CONFLICT (domain) DO NOTHING
      `,
      [host],
    );

    await client.query(
      `
        INSERT INTO frontier (url, depth, domain)
        VALUES ($1, $2, $3)
        ON CONFLICT (url) DO NOTHING
      `,
      [url, depth, host],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// check is there any processing url stuck more then 30s if yes then put the status queued and lock free
export async function recoverExpiredLeases() {
  const result = await pool.query(`
    WITH expired AS (
      UPDATE frontier
      SET
        status = 'queued',
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
      WHERE status = 'processing'
        AND locked_at < NOW() - INTERVAL '15 seconds'
      RETURNING domain
    )
    UPDATE hosts h
    SET
      in_flight = false,
      next_allowed_at = NOW()
    FROM expired
    WHERE h.domain = expired.domain
    RETURNING h.domain;
  `);

  return result.rowCount ?? 0;
}

export async function markBlocked(
  id: string,
  workerId: string,
) {
  await pool.query(
    `
      UPDATE frontier
      SET
        status = 'blocked',
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
    `,
    [id, workerId],
  );
}