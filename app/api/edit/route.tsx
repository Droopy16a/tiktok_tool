import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function saveFile(file: Blob, filename: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filepath = path.join('/tmp', filename);
  await fs.promises.writeFile(filepath, buffer);
  return filepath;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const videoFile = formData.get('video') as Blob;
    const audioFile = formData.get('audio') as Blob;

    if (!videoFile || !audioFile) {
      return NextResponse.json({ error: 'Missing video or audio file' }, { status: 400 });
    }

    const videoPath = await saveFile(videoFile, 'input.mp4');
    const audioPath = await saveFile(audioFile, 'input.mp3');
    const outputPath = path.join('/tmp', 'output.mp4');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions('-c:v copy')
        .outputOptions('-c:a aac')
        .on('end', () => resolve())
        .on('error', (err : any) => reject(err))
        .save(outputPath);
    });

    const videoBuffer = await fs.promises.readFile(outputPath);

    [videoPath, audioPath, outputPath].forEach((file) => fs.unlink(file, () => {}));

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="output.mp4"',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to process video' }, { status: 500 });
  }
}
