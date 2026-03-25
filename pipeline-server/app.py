import os
from contextvars import ContextVar
from datetime import datetime, timezone
import logging
from time import perf_counter
from typing import Any
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response

load_dotenv()

app = FastAPI()

DEFAULT_TIMEOUT_SECONDS = float(os.getenv("PIPELINE_REQUEST_TIMEOUT_SECONDS", "120"))
MAX_LOG_VALUE_LENGTH = 1200
TRACE_PREFIX = "            | "
REQUEST_ID_CONTEXT: ContextVar[str | None] = ContextVar("pipeline_request_id", default=None)


def truncate(value: str) -> str:
    if len(value) > MAX_LOG_VALUE_LENGTH:
        return f"{value[:MAX_LOG_VALUE_LENGTH]}...<truncated>"

    return value


def get_log_level() -> str:
    raw_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()

    if raw_level == "NONE":
        return "none"
    if raw_level == "SUMMARY":
        return "summary"

    return "info"


def should_log_info() -> bool:
    return get_log_level() == "info"


def should_log_summary() -> bool:
    log_level = get_log_level()
    return log_level in {"info", "summary"}


def configure_uvicorn_access_logging() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.disabled = get_log_level() == "none"


def serialise_for_log(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, bytes):
        return f"<{len(value)} bytes>"

    if isinstance(value, str):
        return truncate(value)

    try:
        import json

        return truncate(json.dumps(value))
    except Exception:
        return truncate(str(value))


def format_value(value: Any) -> str:
    serialised = serialise_for_log(value)
    if serialised == "":
        return ""
    if isinstance(value, str):
        return f'"{serialised}"'

    return serialised


def build_log_fields(details: dict[str, Any], *, include_request_id: bool) -> str:
    fields: list[str] = []

    if include_request_id:
        request_id = REQUEST_ID_CONTEXT.get()
        if request_id:
            fields.append(f"requestId={request_id}")

    for key, value in details.items():
        if value is None or value == "":
            continue

        fields.append(f"{key}={format_value(value)}")

    return f" {' '.join(fields)}" if fields else ""


def log_request_start(message: str, **details: Any) -> None:
    if not should_log_info():
        return

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] "
        f"{message}{build_log_fields(details, include_request_id=True)}"
    )


def log_event(message: str, **details: Any) -> None:
    if not should_log_info():
        return

    print(f"{TRACE_PREFIX}{message}{build_log_fields(details, include_request_id=True)}")


def log_summary(message: str, **details: Any) -> None:
    if not should_log_summary():
        return

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] "
        f"{message}{build_log_fields(details, include_request_id=True)}"
    )


def summarise_request_payload(kwargs: dict[str, Any]) -> dict[str, Any]:
    details: dict[str, Any] = {}

    if "json" in kwargs:
        details["body"] = kwargs["json"]

    files = kwargs.get("files")
    if isinstance(files, dict):
        file_details: dict[str, Any] = {}
        for field_name, file_value in files.items():
            if isinstance(file_value, tuple):
                filename = file_value[0] if len(file_value) > 0 else None
                body = file_value[1] if len(file_value) > 1 else b""
                content_type = file_value[2] if len(file_value) > 2 else None
                file_details[field_name] = {
                    "filename": filename,
                    "bytes": len(body) if isinstance(body, bytes) else None,
                    "contentType": content_type,
                }

        if file_details:
            details["files"] = file_details

    return details


def summarise_response_payload(response: requests.Response) -> Any:
    content_type = response.headers.get("Content-Type", "")
    media_type = content_type.split(";", 1)[0].strip().lower()

    if media_type == "application/json" or media_type.endswith("+json"):
        try:
            return response.json()
        except ValueError:
            return response.text.strip() or None

    if media_type.startswith("text/"):
        return response.text.strip() or None

    return {
        "contentType": content_type or None,
        "bytes": len(response.content),
    }


configure_uvicorn_access_logging()


class PipelineError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        service: str,
        state: str,
        upstream_status: int | None = None,
        upstream_error: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.service = service
        self.state = state
        self.upstream_status = upstream_status
        self.upstream_error = upstream_error


def with_http_scheme(url: str) -> str:
    if url.startswith(("http://", "https://")):
        return url

    return f"http://{url}"


def build_service_url(raw_url: str | None, default_path: str, env_name: str) -> str:
    if raw_url is None or raw_url.strip() == "":
        raise PipelineError(
            status_code=500,
            message=f"{env_name} is not configured.",
            service="pipeline-server",
            state="loading_configuration",
        )

    parsed = urlparse(with_http_scheme(raw_url.strip()))
    path = parsed.path if parsed.path and parsed.path != "/" else default_path

    return urlunparse(parsed._replace(path=path))


def get_whisper_url() -> str:
    return build_service_url(os.getenv("WHISPER_URL"), "/transcribe", "WHISPER_URL")


def get_process_url() -> str:
    return build_service_url(os.getenv("PROCESS_URL"), "/api/v1/process", "PROCESS_URL")


def get_piper_url() -> str:
    return build_service_url(os.getenv("PIPER_URL"), "/", "PIPER_URL")


def parse_upstream_error(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        text = response.text.strip()
        return text if text else None


def request_upstream(
    *,
    service: str,
    state: str,
    method: str,
    url: str,
    **kwargs: Any,
) -> requests.Response:
    started_at = perf_counter()
    log_event(
        "outbound_api_request",
        service=service,
        state=state,
        method=method,
        url=url,
        **summarise_request_payload(kwargs),
    )

    try:
        response = requests.request(
            method=method,
            url=url,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            **kwargs,
        )
    except requests.RequestException as error:
        log_event(
            "outbound_api_response",
            service=service,
            state=state,
            method=method,
            url=url,
            durationMs=round((perf_counter() - started_at) * 1000),
            error=str(error),
        )
        raise PipelineError(
            status_code=502,
            message=f"{service} could not be reached.",
            service=service,
            state=state,
            upstream_error=str(error),
        ) from error

    if response.status_code >= 400:
        upstream_error = parse_upstream_error(response)
        log_event(
            "outbound_api_response",
            service=service,
            state=state,
            method=method,
            url=url,
            status=response.status_code,
            durationMs=round((perf_counter() - started_at) * 1000),
            error=upstream_error,
        )
        raise PipelineError(
            status_code=response.status_code,
            message=f"{service} returned an error.",
            service=service,
            state=state,
            upstream_status=response.status_code,
            upstream_error=upstream_error,
        )

    log_event(
        "outbound_api_response",
        service=service,
        state=state,
        method=method,
        url=url,
        status=response.status_code,
        durationMs=round((perf_counter() - started_at) * 1000),
        response=summarise_response_payload(response),
    )

    return response


def parse_json_response(
    response: requests.Response,
    *,
    service: str,
    state: str,
) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as error:
        raise PipelineError(
            status_code=502,
            message=f"{service} returned invalid JSON.",
            service=service,
            state=state,
            upstream_status=response.status_code,
            upstream_error=response.text.strip() or None,
        ) from error

    if not isinstance(payload, dict):
        raise PipelineError(
            status_code=502,
            message=f"{service} returned an unexpected JSON payload.",
            service=service,
            state=state,
            upstream_status=response.status_code,
            upstream_error=payload,
        )

    return payload


def extract_transcript(payload: dict[str, Any]) -> str:
    text = payload.get("text")

    if not isinstance(text, str) or text.strip() == "":
        raise PipelineError(
            status_code=502,
            message="whisper-api returned no transcription text.",
            service="whisper-api",
            state="transcribing_audio",
            upstream_error=payload,
        )

    return text.strip()


def extract_response_text(payload: dict[str, Any]) -> str:
    data = payload.get("data")

    if not isinstance(data, dict):
        raise PipelineError(
            status_code=502,
            message="process-api returned an unexpected response payload.",
            service="process-api",
            state="processing_text",
            upstream_error=payload,
        )

    direct_response = data.get("response")

    if isinstance(direct_response, str) and direct_response.strip():
        return direct_response.strip()

    execution = data.get("execution")
    if isinstance(execution, dict):
        execution_speech = execution.get("speech")
        if isinstance(execution_speech, str) and execution_speech.strip():
            return execution_speech.strip()

    raise PipelineError(
        status_code=502,
        message="process-api returned no speech response.",
        service="process-api",
        state="processing_text",
        upstream_error=payload,
    )


def parse_output_type(raw_output_type: str | None) -> str:
    if raw_output_type is None or raw_output_type.strip() == "":
        return "audio"

    output_type = raw_output_type.strip().lower()
    if output_type in {"audio", "text"}:
        return output_type

    raise PipelineError(
        status_code=400,
        message="Invalid outputType. Expected 'audio' or 'text'.",
        service="pipeline-server",
        state="validating_request",
        upstream_error={"outputType": raw_output_type},
    )


def infer_audio_filename(content_type: str | None) -> str:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()

    if media_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return "audio.wav"
    if media_type in {"audio/mpeg", "audio/mp3"}:
        return "audio.mp3"
    if media_type in {"audio/flac", "audio/x-flac"}:
        return "audio.flac"
    if media_type == "audio/ogg":
        return "audio.ogg"
    if media_type in {"audio/mp4", "audio/x-m4a"}:
        return "audio.m4a"
    if media_type == "audio/webm":
        return "audio.webm"

    return "audio.wav"


def run_pipeline(
    *,
    audio_bytes: bytes,
    filename: str,
    content_type: str,
    requested_output_type: str,
) -> Response:
    if not audio_bytes:
        raise PipelineError(
            status_code=400,
            message="No audio file data provided.",
            service="pipeline-server",
            state="receiving_audio",
        )

    whisper_response = request_upstream(
        service="whisper-api",
        state="transcribing_audio",
        method="POST",
        url=get_whisper_url(),
        files={
            "file": (
                filename,
                audio_bytes,
                content_type,
            )
        },
    )
    whisper_payload = parse_json_response(
        whisper_response,
        service="whisper-api",
        state="transcribing_audio",
    )
    transcript = extract_transcript(whisper_payload)

    process_response = request_upstream(
        service="process-api",
        state="processing_text",
        method="POST",
        url=get_process_url(),
        json={"speech": transcript},
    )
    process_payload = parse_json_response(
        process_response,
        service="process-api",
        state="processing_text",
    )
    response_text = extract_response_text(process_payload)

    if requested_output_type == "text":
        return Response(content=response_text, media_type="text/plain")

    piper_response = request_upstream(
        service="piper-api",
        state="synthesising_speech",
        method="POST",
        url=get_piper_url(),
        json={"text": response_text},
    )

    return Response(
        content=piper_response.content,
        media_type=piper_response.headers.get("Content-Type", "audio/wav"),
    )


@app.middleware("http")
async def log_http_request(request: Request, call_next: Any) -> Response:
    request_id = str(uuid4())
    started_at = perf_counter()
    token = REQUEST_ID_CONTEXT.set(request_id)

    log_request_start(
        "incoming_request",
        method=request.method,
        path=request.url.path,
        query=request.url.query or None,
        contentType=request.headers.get("content-type"),
        contentLength=request.headers.get("content-length"),
    )

    try:
        response = await call_next(request)
    except PipelineError as error:
        log_event(
            "request_complete",
            method=request.method,
            path=request.url.path,
            status=error.status_code,
            durationMs=round((perf_counter() - started_at) * 1000),
            error=error.message,
        )
        REQUEST_ID_CONTEXT.reset(token)
        raise
    except Exception as error:
        log_event(
            "request_complete",
            method=request.method,
            path=request.url.path,
            status=500,
            durationMs=round((perf_counter() - started_at) * 1000),
            error=str(error),
        )
        REQUEST_ID_CONTEXT.reset(token)
        raise

    log_event(
        "request_complete",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        durationMs=round((perf_counter() - started_at) * 1000),
    )
    REQUEST_ID_CONTEXT.reset(token)
    return response


@app.exception_handler(PipelineError)
async def handle_pipeline_error(_: Any, error: PipelineError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={
            "status": error.status_code,
            "message": error.message,
            "data": {
                "service": error.service,
                "state": error.state,
                "upstreamStatus": error.upstream_status,
                "upstreamError": error.upstream_error,
            },
        },
    )


@app.get("/")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "services": {
            "whisper": get_whisper_url(),
            "process": get_process_url(),
            "piper": get_piper_url(),
        },
    }


@app.post("/pipeline")
async def pipeline(
    file: UploadFile = File(...),
    output_type: str = Form("audio", alias="outputType"),
) -> Response:
    requested_output_type = parse_output_type(output_type)
    audio_bytes = await file.read()

    return run_pipeline(
        audio_bytes=audio_bytes,
        filename=file.filename or "audio.wav",
        content_type=file.content_type or "application/octet-stream",
        requested_output_type=requested_output_type,
    )


@app.post("/pipeline/raw")
async def pipeline_raw(
    request: Request,
    output_type: str = Query("audio", alias="outputType"),
) -> Response:
    requested_output_type = parse_output_type(output_type)
    content_type = request.headers.get("content-type") or "application/octet-stream"
    audio_bytes = await request.body()

    return run_pipeline(
        audio_bytes=audio_bytes,
        filename=infer_audio_filename(content_type),
        content_type=content_type,
        requested_output_type=requested_output_type,
    )
