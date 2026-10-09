from pathlib import Path

from psycopg_pool import AsyncConnectionPool

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def migrate(pool: AsyncConnectionPool) -> None:
    """Applies migrations/*.sql files that haven't run yet, in name order, in one transaction."""
    async with pool.connection() as conn:
        # Stops two backends starting at once from both migrating
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))")
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        cursor = await conn.execute("SELECT name FROM schema_migrations")
        applied = {row["name"] for row in await cursor.fetchall()}

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                continue
            await conn.execute(path.read_text())
            await conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
