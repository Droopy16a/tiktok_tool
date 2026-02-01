from rest_framework.decorators import api_view
from rest_framework.response import Response
import numpy as np
from kokoro import KPipeline, KModel
import whisper
import torch
import torchaudio
import base64
import json
import tempfile
import os
from pathlib import Path
import time

@api_view(["GET"])
def health(request):
    text = request.query_params.get("age")
    return Response({
        "status": "ok",
        "message": "Django API is running 🚀",
        "age" : text
    })

@api_view(["POST"])
def tts(request):
    text = request.data.get("text")

    if not text:
        return Response(
            {"status": "error", "message": "text is required"},
            status=400
        )

    voice = "bm_george"
    speed = float(request.data.get("speed", 1.0))

    # Initialize pipeline
    pipeline = KPipeline(lang_code="a")

    # Load voice pack
    pack = pipeline.load_voice(voice)

    # Initialize model ONCE
    model = KModel().eval()

    audio_chunks = []

    for _, ps, _ in pipeline(text, voice, speed):
        ref_s = pack[len(ps) - 1]
        audio = model(ps, ref_s, speed)
        audio_chunks.append(audio.cpu().numpy())

    if not audio_chunks:
        return Response(
            {"status": "error", "message": "No audio generated"},
            status=500
        )

    audio_array = np.concatenate(audio_chunks)
    sample_rate = 24000

    return Response({
        "status": "ok",
        "audio_array": audio_array.tolist(),  # ✅ JSON safe
        "sample_rate": sample_rate
    })

@api_view(["POST"])
def asr(request):
    audio_array = request.data.get("audio_array")
    sample_rate = request.data.get("sample_rate", 24000)

    if not audio_array:
        return Response(
            {"status": "error", "message": "audio_array is required"},
            status=400
        )

    # Convert to numpy array
    audio = np.array(audio_array, dtype=np.float32)

    # Resample to 16kHz if necessary
    if sample_rate != 16000:
        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
        audio = resampler(torch.from_numpy(audio)).numpy()

    # Load Whisper model (small for efficiency)
    model = whisper.load_model("small")

    # Transcribe
    result = model.transcribe(audio, fp16=False, word_timestamps=True)  # fp16=False for CPU

    return Response({
        "status": "ok",
        "text": result["text"],
        "segments": result["segments"]  # Includes timestamps
    })