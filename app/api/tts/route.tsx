import { pipeline } from "@xenova/transformers";
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { WaveFile } from 'wavefile';

let tts: any;

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!tts) {
    tts = await pipeline("text-to-speech", "Xenova/mms-tts-eng");
  }

  const speaker_embeddings =
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

  const audio = await tts(text, { speaker_embeddings });

  const wav = new WaveFile();
  wav.fromScratch(1, audio.sampling_rate, '32f', audio.audio);

  const filePath = path.join(process.cwd(), 'public', 'out.wav');
  fs.writeFileSync(filePath, wav.toBuffer());

  return NextResponse.json({ ok: true, url: '/out.wav' });
}
