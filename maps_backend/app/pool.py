from collections.abc import Callable

from anyio import CapacityLimiter, to_thread

from .upstream import Failed


class Busy(Failed):
    """The pool's queue is full."""


class Pool:
    """A few threads of its own, turning work away past a short queue, so a flood of slow
    requests can't take the shared threads photo uploads and road data use."""

    # Running and waiting, for each thread
    PENDING_PER_THREAD = 5

    def __init__(self, size: float):
        self.limiter = CapacityLimiter(size)
        # Counted here rather than from the limiter, which only sees a task once it's waiting
        self.pending = 0

    async def run[T, *Args](self, fn: Callable[[*Args], T], *args: *Args) -> T:
        if self.pending >= self.PENDING_PER_THREAD * self.limiter.total_tokens:
            raise Busy("Too many requests at once")
        self.pending += 1
        try:
            return await to_thread.run_sync(fn, *args, limiter=self.limiter)
        finally:
            self.pending -= 1
