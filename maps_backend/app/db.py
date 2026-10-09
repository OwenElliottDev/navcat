from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

from .config import settings

pool = AsyncConnectionPool(
    settings.database_url,
    open=False,
    kwargs={"row_factory": dict_row},
    # Test each connection before handing it out, so a database restart doesn't
    # surface as errors from connections that died while sitting in the pool
    check=AsyncConnectionPool.check_connection,
)


async def get_db() -> AsyncIterator[AsyncConnection[DictRow]]:
    """A pooled connection for one request. Commits if the request succeeds, rolls back if not."""
    async with pool.connection() as conn:
        yield conn


Db = Annotated[AsyncConnection[DictRow], Depends(get_db)]
