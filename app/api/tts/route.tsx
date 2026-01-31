import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { WaveFile } from 'wavefile';

export async function POST(req: Request) {
  const { text } = await req.json();

  // FIXED: Await the fetch and extract the data
  const response = await fetch("http://127.0.0.1:8000/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      speed: 1.0
    }),
  });

  if (!response.ok) {
    throw new Error("HTTP error " + response.status);
  }

  const data = await response.json();
  console.log("Réponse API :", data);
  console.log("Sample rate :", data.sample_rate);
  console.log("Audio array length :", data.audio_array.length);

  // FIXED: Create audio object with proper structure
  const audio = {
    sample_rate: data.sample_rate,
    audio_array: new Float32Array(data.audio_array) // Ensure it's a Float32Array
  };

  const wav = new WaveFile();
  wav.fromScratch(1, audio.sample_rate, '32f', audio.audio_array);

  const filePath = path.join(process.cwd(), 'public', 'out.wav');
  fs.writeFileSync(filePath, wav.toBuffer());

  // Send audio to backend for ASR
  const asrResponse = await fetch("http://127.0.0.1:8000/api/asr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_array: Array.from(audio.audio_array),  // Convert Float32Array to array
      sample_rate: audio.sample_rate
    }),
  });

  if (!asrResponse.ok) {
    throw new Error("ASR HTTP error " + asrResponse.status);
  }

  const asrData = await asrResponse.json();
  console.log("ASR Response:", asrData);

  if (!asrData.segments) {
    throw new Error("ASR failed to return segments");
  }

  // Transform segments to word-level chunks for compatibility
  const chunks: any[] = [];
  for (const segment of asrData.segments) {
    if (segment.words) {
      for (const word of segment.words) {
        chunks.push({
          text: word.word,
          timestamp: [word.start, word.end]
        });
      }
    }
  }

  return NextResponse.json({ ok: true, url: '/out.wav', timestamps: { text: asrData.text, chunks } });
}

