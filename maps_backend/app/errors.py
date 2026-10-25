class ApiError(Exception):
    """Answered as {"detail": ..., "code": ...}: a neutral message, and a code the app can react
    to with its own wording."""

    def __init__(self, status: int, detail: str, code: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.code = code
