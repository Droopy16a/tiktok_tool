import { pipeline, AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { WaveFile } from 'wavefile';

let tts : any;
let asr: AutomaticSpeechRecognitionPipeline;

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!tts) {
    tts = await pipeline("text-to-speech", "Xenova/mms-tts-eng");
  }

  if (!asr) {
    asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en");
  }

  const speaker_embeddings =
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

  const audio = await tts(text, { speaker_embeddings });

  const wav = new WaveFile();
  wav.fromScratch(1, audio.sampling_rate, '32f', audio.audio);

  const filePath = path.join(process.cwd(), 'public', 'out.wav');
  fs.writeFileSync(filePath, wav.toBuffer());

  // Pass the raw audio data directly to ASR, not the WAV buffer
  const timestamps = await asr(audio.audio, {
    return_timestamps: 'word'
  });

  return NextResponse.json({ ok: true, url: '/out.wav', timestamps });
}
