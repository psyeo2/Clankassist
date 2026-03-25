# Pipeline Server

`pipeline-server/` is the audio-in pipeline orchestrator for the voice assistant.

It accepts audio, runs the full server-side pipeline, and can return either a WAV response or plain text:

1. send audio to `whisper-api`
2. send the transcript to `process-api`
3. if `outputType=audio`, send the response text to `piper-api`
4. return either generated speech audio or the raw response text

This is the service an ESP device should talk to if you want the device to stay simple.

## Base URL

```text
http://<host>:8003
```

## Endpoints

### 1. Health Check

**GET /**

Returns the resolved upstream URLs.

Example response:

```json
{
  "status": "ok",
  "services": {
    "whisper": "http://localhost:8001/transcribe",
    "process": "http://localhost:3001/api/v1/process",
    "piper": "http://localhost:8002/"
  }
}
```

### 2. Multipart Voice Pipeline

**POST /pipeline**

Request:

- Content-Type: `multipart/form-data`
- Body:
  - `file`: audio file
  - `outputType`: optional, `audio` or `text`
    - defaults to `audio`

Audio example:

```bash
curl -X POST http://localhost:8003/pipeline \
  -F "file=@test-audio/pipeline-test/hello.wav" \
  -F "outputType=audio" \
  --output response.wav
```

Text example:

```bash
curl -X POST http://localhost:8003/pipeline \
  -F "file=@../test-audio/piper-out/hello.wav" \
  -F "outputType=text"
```

On success:

- `outputType=audio` returns WAV audio from `piper-api`
- `outputType=text` returns the final `process-api` response as `text/plain`

### 3. Raw-Body Voice Pipeline

**POST /pipeline/raw?outputType=audio|text**

Request:

- Content-Type: audio type such as `audio/wav`, or `application/octet-stream`
- Body:
  - raw audio bytes
- Query params:
  - `outputType`: optional, `audio` or `text`
    - defaults to `audio`

Audio example:

```bash
curl -X POST "http://localhost:8003/pipeline/raw?outputType=audio" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav" \
  --output response.wav
```

Text example:

```bash
curl -X POST "http://localhost:8003/pipeline/raw?outputType=text" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav"
```

On success:

- `outputType=audio` returns WAV audio from `piper-api`
- `outputType=text` returns the final `process-api` response as `text/plain`

## Error Behaviour

If any upstream step fails, `pipeline-server` forwards the failure as JSON and includes:

- which service failed
- what state the pipeline was in
- the upstream HTTP status where available
- the upstream error body where available

Example error response:

```json
{
  "status": 502,
  "message": "whisper-api could not be reached.",
  "data": {
    "service": "whisper-api",
    "state": "transcribing_audio",
    "upstreamStatus": null,
    "upstreamError": "HTTPConnectionPool(...)"
  }
}
```

Pipeline states:

- `validating_request`
- `receiving_audio`
- `transcribing_audio`
- `processing_text`
- `synthesising_speech`
- `loading_configuration`

## Environment Variables

`pipeline-server` resolves three upstream service URLs.

- `WHISPER_URL`
  Base URL or full `/transcribe` URL for `whisper-api`
- `PROCESS_URL`
  Base URL or full `/api/v1/process` URL for `process-api`
- `PIPER_URL`
  Base URL or full synthesis URL for `piper-api`
- `PIPELINE_REQUEST_TIMEOUT_SECONDS`
  Optional timeout for each upstream HTTP request. Default: `120`

Examples:

```env
WHISPER_URL=http://localhost:8001
PROCESS_URL=http://localhost:3001
PIPER_URL=http://localhost:8002
PIPELINE_REQUEST_TIMEOUT_SECONDS=120
```

The service also accepts values without a scheme, for example:

```env
WHISPER_URL=192.168.1.161:8001
```

## Quick Start

1. Copy `.env.example` to `.env`
2. Set the upstream service URLs
3. Start the service:

```bash
docker compose up --build
```

## Testing With `hello.wav`

From the repo root:

```bash
curl -X POST http://localhost:8003/pipeline \
  -F "file=@test-audio/piper-out/hello.wav" \
  -F "outputType=audio" \
  --output test-audio/pipeline-response.wav
```

If the upstream services are working, that should:

- transcribe `test-audio/piper-out/hello.wav`
- generate a text response through `process-api`
- synthesise the response through `piper-api` when `outputType=audio`
- save the returned audio to `test-audio/pipeline-response.wav`

Raw-body example:

```bash
curl -X POST "http://localhost:8003/pipeline/raw?outputType=text" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav"
```
