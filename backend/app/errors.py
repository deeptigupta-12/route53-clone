from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIError(Exception):
    """Error returned to the client as {"code": ..., "message": ...}."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def bad_change(message: str) -> APIError:
    return APIError(400, "InvalidChangeBatch", message)


_HTTP_CODES = {401: "NotAuthenticated", 403: "AccessDenied", 404: "NotFound", 405: "MethodNotAllowed"}


def _format_validation_error(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Invalid request."
    err = errors[0]
    loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
    msg = str(err.get("msg", "Invalid value"))
    return f"{loc}: {msg}" if loc else msg


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def _api_error(_req: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "Error")
        return JSONResponse(status_code=exc.status_code, content={"code": code, "message": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_req: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"code": "InvalidInput", "message": _format_validation_error(exc)})
