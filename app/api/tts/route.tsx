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
    asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-small.en");
  }

  const speaker_embeddings =
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

  const audio = await tts(text, { speaker_embeddings });

  const wav = new WaveFile();
  wav.fromScratch(1, audio.sampling_rate, '32f', audio.audio);

  const filePath = path.join(process.cwd(), 'public', 'out.wav');
  fs.writeFileSync(filePath, wav.toBuffer());

  // Process audio in chunks to handle longer audio
  const timestamps = await processAudioInChunks(audio.audio, audio.sampling_rate);

  return NextResponse.json({ ok: true, url: '/out.wav', timestamps });
}

async function processAudioInChunks(audioData: Float32Array, samplingRate: number) {
  // Whisper can handle ~30 seconds reliably, use 25 seconds for safety
  const CHUNK_DURATION_SECONDS = 25;
  const OVERLAP_SECONDS = 2; // Overlap to avoid cutting words
  
  const samplesPerChunk = CHUNK_DURATION_SECONDS * samplingRate;
  const overlapSamples = OVERLAP_SECONDS * samplingRate;
  
  const totalDuration = audioData.length / samplingRate;
  
  // If audio is short enough, process normally
  if (totalDuration <= CHUNK_DURATION_SECONDS) {
    return await asr(audioData, {
      return_timestamps: 'word'
    });
  }
  
  // Process in chunks
  const allChunks: any[] = [];
  let offset = 0;
  
  while (offset < audioData.length) {
    const end = Math.min(offset + samplesPerChunk, audioData.length);
    const chunk = audioData.slice(offset, end);
    
    const result = await asr(chunk, {
      return_timestamps: 'word'
    });
    
    // Adjust timestamps based on chunk offset
    const timeOffset = offset / samplingRate;
    
    if (result.chunks) {
      result.chunks.forEach((chunk: any) => {
        // Only add chunks that aren't in the overlap region (except for the first chunk)
        const chunkStart = chunk.timestamp[0];
        const isInOverlap = offset > 0 && chunkStart < OVERLAP_SECONDS;
        
        if (!isInOverlap || offset === 0) {
          allChunks.push({
            text: chunk.text,
            timestamp: [
              chunk.timestamp[0] + timeOffset,
              chunk.timestamp[1] + timeOffset
            ]
          });
        }
      });
    }
    
    // Move to next chunk, accounting for overlap
    offset += samplesPerChunk - overlapSamples;
  }
  
  return {
    text: allChunks.map(c => c.text).join(''),
    chunks: allChunks
  };
}