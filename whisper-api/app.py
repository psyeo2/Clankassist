from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import tempfile

app = FastAPI()

# Load model once at startup
model = WhisperModel(
    "medium",
    device="cuda",
    compute_type="float16"
)

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Save uploaded audio temporarily
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name

    # Transcribe
    segments, info = model.transcribe(
        path,
        language="en",
        beam_size=1,
        vad_filter=True
    )

    # Force execution (generator)
    segments = list(segments)

    text = " ".join(seg.text for seg in segments)

    return {
        "text": text.strip(),
        "language": info.language,
        "duration": info.duration
    }