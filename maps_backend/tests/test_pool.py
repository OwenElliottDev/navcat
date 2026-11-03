"""Pools of threads for slow work, turning work away past a short queue."""

import math
import threading

import anyio
import pytest

from app.pool import Busy, Pool


def test_unlimited_pools_never_turn_work_away():
    pool = Pool(math.inf)
    release = threading.Event()

    async def main():
        async with anyio.create_task_group() as tasks:
            try:
                for _ in range(20):
                    tasks.start_soon(pool.run, release.wait, 5)
                await anyio.wait_all_tasks_blocked()
                assert pool.pending == 20
                assert pool.limiter.borrowed_tokens == 20  # all running, none queued
            finally:
                release.set()

    anyio.run(main)


def test_work_past_the_queue_is_turned_away():
    pool = Pool(1)
    release = threading.Event()

    async def main():
        async with anyio.create_task_group() as tasks:
            try:
                for _ in range(5):  # one running, four waiting
                    tasks.start_soon(pool.run, release.wait, 5)
                await anyio.wait_all_tasks_blocked()
                with pytest.raises(Busy):
                    await pool.run(release.wait, 5)
            finally:
                release.set()

    anyio.run(main)
