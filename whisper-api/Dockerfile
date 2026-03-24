FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Python deps
RUN pip install --no-cache-dir \
    faster-whisper \
    fastapi \
    uvicorn[standard] \
    python-multipart

# Pre-download model at build time (CPU is fine for download)
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu')"

# Copy app
COPY app.py .

# Run API
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]