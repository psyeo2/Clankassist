FROM python:3.12-slim

ENV PIP_BREAK_SYSTEM_PACKAGES=1

WORKDIR /app

RUN pip3 install "piper-tts[http]"

COPY cori-high/ /voices/cori-high/

EXPOSE 5000

CMD ["python3", "-m", "piper.http_server", "--host", "0.0.0.0", "--port", "5000", "-m", "/voices/cori-high/en_GB-cori-high.onnx"]
