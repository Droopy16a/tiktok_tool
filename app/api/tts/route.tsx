import { pipeline } from "@xenova/transformers";
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { WaveFile } from 'wavefile';
import { createClient } from 'pexels';

let tts: any;
let generator : any;

export async function POST(req: Request) {
  const { text } = await req.json();

  const client = createClient('866URLSijsafUGBAutW0LNy9Z8BemDZKkZuvJDyNfHynszftzggQyngT');

  await client.photos.search({ query: 'nature', per_page: 1 }).then((res) => {
    if (res){
      console.log(res.photos[0].src);
    }
  });

  if (!tts) {
    tts = await pipeline("text-to-speech", "Xenova/mms-tts-eng");
  }
  // if (!generator) {
  //   generator = await pipeline("text-generation", "Xenova/gpt2");
  // }

  // const query = `the bubble sort is`;
  // const output = await generator(query, {
  //   max_new_tokens: 20,
  //   do_sample: true,
  //   top_k: 5,
  // });  
  // console.log(output);

  const speaker_embeddings =
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

  const audio = await tts(text, { speaker_embeddings });

  const wav = new WaveFile();
  wav.fromScratch(1, audio.sampling_rate, '32f', audio.audio);

  const filePath = path.join(process.cwd(), 'public', 'out.wav');
  fs.writeFileSync(filePath, wav.toBuffer());

  return NextResponse.json({ ok: true, url: '/out.wav' });
}
