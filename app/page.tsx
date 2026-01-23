'use client';
import { useEffect, useState, useRef } from "react";

export default function Home() {
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // const TEXT = "Bubble sort is a simple sorting algorithm. This sorting algorithm is comparison-based algorithm in which each pair of adjacent elements is compared and the elements are swapped if they are not in order. This algorithm is not suitable for large data sets as its average and worst case complexity are of O(n2) where n is the number of items.";
  const TEXT = "Bubble sort is a simple sorting algorithm. This sorting algorithm is comparison-based algorithm in which each pair of adjacent elements is compared and the elements are swapped if they are not in order.";

  useEffect(() => {
    fetch("/api/gpt", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Generate a short, engaging TikTok script (under 150 words) about bubble sort. Include a hook, explanation, and call to action. Format as JSON with fields: title, hook, explanation, cta. " + TEXT
      })
    })
      .then(res => res.json())
      .then(data => console.log(data))
      .catch(error => console.error("Error fetching GPT response:", error));
  }, [])

  function getKeyword(TEXT: string) {
    const words = TEXT.split(' ');
    const dictionary: { [word: string]: number } = {};

    words.forEach((word) => {
      const cleanedWord = word.toLowerCase().replace(/[.,]|(is)|(are)/g, '');
      if (dictionary[cleanedWord]) {
        dictionary[cleanedWord] += 1;
      } else {
        dictionary[cleanedWord] = 1;
      }
    });

    return dictionary;
  }

  const keywords = getKeyword(TEXT);

  useEffect(() => {
    const sortedKeywords = Object.entries(keywords).sort((a, b) => b[1] - a[1]);
    const mostFrequentKeyword = sortedKeywords.length > 0 ? sortedKeywords[0][0] : "algorithm";
    console.log(mostFrequentKeyword);
  }, []);

  async function getImage(keyword: string) {
    const res = await fetch("/api/pexel", {
      method: "POST",
      body: JSON.stringify({ keyword: keyword })
    });

    const body = await res.json();
    return body.url;
  }

  function generateSubtitles(timestamps: any) {
    const chunks = timestamps.chunks;
    const subtitles: { text: string; startTime: number; endTime: number; words: Array<{text: string, start: number, end: number}> }[] = [];

    let currentSubtitle: { text: string; startTime: number; endTime: number; words: Array<{text: string, start: number, end: number}> } | null = null;

    let index = 0;

    chunks.forEach((chunk: any) => {
      const [startTime, endTime] = chunk.timestamp;
      const text = chunk.text.toUpperCase();

      if (!currentSubtitle) {
        currentSubtitle = {
          text: text,
          startTime: startTime,
          endTime: endTime,
          words: [{text, start: startTime, end: endTime}]
        };
      } else {
        currentSubtitle.text += text;
        currentSubtitle.endTime = endTime;
        currentSubtitle.words.push({text, start: startTime, end: endTime});
      }

      if (text.trim().endsWith('.') || text.trim().endsWith('!') || text.trim().endsWith('?') || index % 10 == 0) {
        subtitles.push(currentSubtitle);
        currentSubtitle = null;
      }

      index++;
    });

    if (currentSubtitle) {
      subtitles.push(currentSubtitle);
    }

    return subtitles;
  }

  function findWordTimings(timestamps: any, keywords: string[]) {
    const timings: { keyword: string; time: number; index: number }[] = [];
    
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      let firstOccurrence = true;
      
      for (const chunk of timestamps.chunks) {
        if (chunk.text.toLowerCase().includes(keyword.toLowerCase())) {
          if (firstOccurrence) {
            timings.push({
              keyword: keyword,
              time: chunk.timestamp[0],
              index: i
            });
            firstOccurrence = false;
            break;
          }
        }
      }
    }
    
    return timings.sort((a, b) => a.time - b.time);
  }

  async function generateSpeech() {
    console.log("Generating speech...");
    setIsProcessing(true);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: TEXT }),
      });

      const audio = await res.json();
      console.log("Audio response:", audio);
      
      const audioUrl = audio.url.startsWith('http') ? audio.url : `${window.location.origin}${audio.url}`;
      console.log("Full audio URL:", audioUrl);
      setAudioFile(audioUrl);

      const sortedKeywords = Object.entries(keywords).sort((a, b) => b[1] - a[1]);
      const mostFrequentKeywords = sortedKeywords.slice(0, 5).map(item => item[0]);

      console.log("Most frequent keywords:", mostFrequentKeywords);

      const videoResponse = await fetch('/video.mp4');
      const videoBlob = await videoResponse.blob();

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      const audioBlob = await audioResponse.blob();

      const imagePromises = mostFrequentKeywords.map(keyword => getImage(keyword));
      const imageUrls = await Promise.all(imagePromises);

      console.log("Image URLs:", imageUrls);

      const validImageUrls = imageUrls.filter(url => url != null);
      
      const imageResponsePromises = validImageUrls.map(url => fetch(url));
      const imageResponses = await Promise.all(imageResponsePromises);

      const imageBlobPromises = imageResponses.map(res => res.blob());
      const imageBlobs = await Promise.all(imageBlobPromises);

      const videoUrl = await addAudioAndImages(videoBlob, audioBlob, imageBlobs, mostFrequentKeywords, audio.timestamps);
      console.log("Video with added audio URL:", videoUrl);
      setGeneratedVideo(videoUrl);
    } catch (error) {
      console.error("Error generating video:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function addAudioAndImages(
    videoBlob: Blob,
    audioBlob: Blob,
    imageBlobs: Blob[],
    keywords: string[],
    timestamps: any,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) {
          reject(new Error('Canvas not available'));
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        canvas.width = 1080;
        canvas.height = 1920;

        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(videoBlob);
        videoElement.muted = true;
        videoElement.preload = 'auto';
        videoElement.loop = true;
        
        await new Promise((res) => {
          videoElement.onloadedmetadata = res;
        });

        const audioElement = new Audio(URL.createObjectURL(audioBlob));
        await new Promise((res) => {
          audioElement.onloadedmetadata = res;
        });
        
        const images = await Promise.all(
          imageBlobs.map((blob) => {
            return new Promise<HTMLImageElement>((res, rej) => {
              const img = new Image();
              img.onload = () => res(img);
              img.onerror = (e) => {
                console.error("Image load error:", e);
                rej(e);
              };
              img.src = URL.createObjectURL(blob);
            });
          })
        );

        const subtitles = generateSubtitles(timestamps);
        console.log('Subtitles:', subtitles);

        const wordTimings = findWordTimings(timestamps, keywords);
        console.log('Word timings (first occurrence only):', wordTimings);

        const fps = 30;
        const stream = canvas.captureStream(fps);

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audioElement);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);

        const audioTrack = dest.stream.getAudioTracks()[0];
        stream.addTrack(audioTrack);

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          videoElement.pause();
          audioElement.pause();
          resolve(url);
        };

        mediaRecorder.start();

        const totalDuration = audioElement.duration;
        const imagePadding = 100;
        const imageDisplayDuration = 2.0;
        const transitionDuration = 0.4;
        
        let startTime = performance.now();

        videoElement.play();
        audioElement.play();

        const getFadeOpacity = (elapsed: number, timing: number): number => {
          const timeSinceTrigger = elapsed - timing;
          
          if (timeSinceTrigger < 0) return 0;
          
          if (timeSinceTrigger < transitionDuration) {
            return timeSinceTrigger / transitionDuration;
          }
          
          if (timeSinceTrigger < imageDisplayDuration - transitionDuration) {
            return 1;
          }
          
          if (timeSinceTrigger < imageDisplayDuration) {
            return 1 - ((timeSinceTrigger - (imageDisplayDuration - transitionDuration)) / transitionDuration);
          }
          
          return 0;
        };

        const drawSubtitleWithHighlights = (line: Array<{text: string, start: number, end: number}>, y: number, currentTime: number) => {
          const fontSize = 56;
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
      
          const fullLineText = line.map(w => w.text).join('');
          const totalWidth = ctx.measureText(fullLineText).width;
          let currentX = (canvas.width - totalWidth) / 2;
      
          line.forEach((word) => {
              const cleanWord = word.text.trim().toLowerCase().replace(/[.,!?]/g, '');
              const isActive = currentTime >= word.start && currentTime <= word.end;
      
              const wordWidth = ctx.measureText(word.text).width;
              const wordCenterX = currentX + wordWidth / 2;

              ctx.shadowBlur = 0;
              ctx.shadowColor = 'transparent';
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;

              if (isActive) {
                  ctx.fillStyle = '#FFFF00';
                  ctx.shadowColor = 'rgba(255, 255, 0, 0.9)';
                  ctx.shadowBlur = 10;
              } else {
                  ctx.fillStyle = '#FFFFFF';
                  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                  ctx.shadowBlur = 5;
                  ctx.shadowOffsetX = 2;
                  ctx.shadowOffsetY = 2;
              }
              
              ctx.fillText(word.text, wordCenterX, y);
      
              currentX += wordWidth;
          });

          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        };

        const drawFrame = () => {
          const elapsed = (performance.now() - startTime) / 1000;
          
          if (elapsed >= totalDuration) {
            mediaRecorder.stop();
            videoElement.pause();
            audioElement.pause();
            return;
          }

          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (videoElement.readyState >= 2) {
            const scale_video = Math.max(
              canvas.width / videoElement.videoWidth,
              canvas.height / videoElement.videoHeight
            );
            const x_video = (canvas.width / 2) - (videoElement.videoWidth / 2) * scale_video;
            const y_video = (canvas.height / 2) - (videoElement.videoHeight / 2) * scale_video;
            ctx.drawImage(
              videoElement,
              x_video, y_video,
              videoElement.videoWidth * scale_video,
              videoElement.videoHeight * scale_video
            );
          }

          let currentImage: { opacity: number; index: number } | null = null;

          for (const timing of wordTimings) {
            const opacity = getFadeOpacity(elapsed, timing.time);
            
            if (opacity > 0) {
              const wouldOverlap = currentImage !== null;
              
              if (!wouldOverlap) {
                currentImage = { opacity, index: timing.index };
              }
            }
          }

          if (currentImage && currentImage.opacity > 0 && images.length > currentImage.index) {
            const img = images[currentImage.index];
            
            const targetAspectRatio = 16 / 9;
            let sx, sy, sWidth, sHeight;

            const originalAspectRatio = img.width / img.height;

            if (originalAspectRatio > targetAspectRatio) {
              sHeight = img.height;
              sWidth = sHeight * targetAspectRatio;
              sx = (img.width - sWidth) / 2;
              sy = 0;
            } else {
              sWidth = img.width;
              sHeight = sWidth / targetAspectRatio;
              sx = 0;
              sy = (img.height - sHeight) / 2;
            }

            const availableWidth = canvas.width - (imagePadding * 2);
            const dWidth = availableWidth;
            const dHeight = dWidth / targetAspectRatio;
            const dx = imagePadding;
            const dy = (canvas.height - dHeight) / 6;
            
            ctx.save();
            ctx.globalAlpha = currentImage.opacity;
            
            const zoomScale = 1 - (currentImage.opacity * 0.1);
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(1 / zoomScale, 1 / zoomScale);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(dx - 10, dy - 10, dWidth + 20, dHeight + 20);
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
            
            ctx.restore();
          }

          const currentSubtitle = subtitles.find(
            sub => elapsed >= sub.startTime && elapsed < sub.endTime
          );
          
          if (currentSubtitle) {
            const timedWords = currentSubtitle.words;
            const lines: Array<Array<{text: string, start: number, end: number}>> = [];
            let currentLine: Array<{text: string, start: number, end: number}> = [];

            ctx.font = 'bold 56px Arial';
            const maxWidth = canvas.width - 100;

            timedWords.forEach(word => {
                const lineWithNextWord = [...currentLine, word];
                const testLineText = lineWithNextWord.map(w => w.text).join('');
                const metrics = ctx.measureText(testLineText);

                if (metrics.width > maxWidth && currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = [word];
                } else {
                    currentLine.push(word);
                }
            });
            if (currentLine.length > 0) {
                lines.push(currentLine);
            }

            const lineHeight = 90;
            const totalLinesHeight = (lines.length - 1) * lineHeight;
            const startY = canvas.height / 2 - totalLinesHeight / 2;

            lines.forEach((line, index) => {
                const lineY = startY + (index * lineHeight);
                drawSubtitleWithHighlights(line, lineY, elapsed);
            });
          }

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Enhanced Video Generator</h1>
        
        <button
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          onClick={generateSpeech}
          disabled={isProcessing}
        >
          {isProcessing ? '⏳ Processing...' : '🎬 Generate Video'}
        </button>
        
        {audioFile && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-white mb-2">Audio Preview</h2>
            <audio src={audioFile} controls className="w-full" />
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {generatedVideo && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Generated Video</h2>
              <video src={generatedVideo} controls className="w-full rounded-lg shadow-xl" />
            </div>
          )}
          
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Live Preview</h2>
            <canvas ref={canvasRef} className="w-full border-2 border-gray-700 rounded-lg shadow-xl" style={{aspectRatio: '9/16'}} />
          </div>
        </div>
      </div>
    </div>
  );
}