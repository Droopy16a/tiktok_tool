'use client';
import { useEffect, useState, useRef } from "react";

export default function Home() {
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState<string>("");
  const [videoTitle, setVideoTitle] = useState<string>("Generated Video");
  const [isUploading, setIsUploading] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationUsername, setRegistrationUsername] = useState<string>("");
  const [registrationCookies, setRegistrationCookies] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationTab, setRegistrationTab] = useState<"manual" | "auto">("manual");
  const [autoUsername, setAutoUsername] = useState<string>("");
  const [autoPassword, setAutoPassword] = useState<string>("");
  const [autoTiktokUsername, setAutoTiktokUsername] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function getText(title : string) {
    const res = await fetch(`/api/wiki?title=${encodeURIComponent(title)}`, {
      method: "GET"
    });
    const data = await res.json();
    return data.text as string;
  }

  function getKeyword(TEXT: string) {
    const words = TEXT.split(' ');
    const dictionary: { [word: string]: number } = {};

    words.forEach((word) => {
      const cleanedWord = word.toLowerCase().replace(/\b(is|are|the|and|in|he|she|a|of|on|with)\b|[.,]|\b\w+s\b/gi, '');
      if (cleanedWord && cleanedWord.length > 0) {
        if (dictionary[cleanedWord]) {
          dictionary[cleanedWord] += 1;
        } else {
          dictionary[cleanedWord] = 1;
        }
      }
    });

    return dictionary;
  }

  async function getImage(keyword: string, imageIndex: number = 0) {
    const res = await fetch("/api/pexel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ keyword: keyword, imageIndex: imageIndex })
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
    const timings: { keyword: string; time: number; index: number; imageIndex: number }[] = [];
    const keywordOccurrenceCount: { [key: string]: number } = {};
    
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      
      // Initialize occurrence counter for this keyword
      if (!keywordOccurrenceCount[keyword]) {
        keywordOccurrenceCount[keyword] = 0;
      }
      
      for (const chunk of timestamps.chunks) {
        if (chunk.text.toLowerCase().includes(keyword.toLowerCase())) {
          // Record this occurrence with its imageIndex
          timings.push({
            keyword: keyword,
            time: chunk.timestamp[0],
            index: i,
            imageIndex: keywordOccurrenceCount[keyword]
          });
          
          // Increment for next occurrence
          keywordOccurrenceCount[keyword]++;
          break; // Only first occurrence per keyword for display
        }
      }
    }
    
    return timings.sort((a, b) => a.time - b.time);
  }

  async function generateSpeech() {
    console.log("Generating speech...");
    setIsProcessing(true);

    try {
      // Get the Wikipedia text first
      // const TEXT = await getText("star_citizen");
      const TEXT = "I eat chocolate every day because chocolate is the better meal all time";
      
      // Extract keywords from the text
      const keywords = getKeyword(TEXT);
      const sortedKeywords = Object.entries(keywords).sort((a, b) => b[1] - a[1]);
      const mostFrequentKeywords = sortedKeywords.slice(0, 5).map(item => item[0]);

      console.log("Most frequent keywords:", mostFrequentKeywords);

      // Generate TTS from the text
      const res = await fetch("/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: TEXT }),
      });

      const audio = await res.json();
      console.log("Audio response:", audio);
      
      const audioUrl = audio.url.startsWith('http') ? audio.url : `${window.location.origin}${audio.url}`;
      console.log("Full audio URL:", audioUrl);
      setAudioFile(audioUrl);

      // Find word timings to determine which image index to use for each keyword
      const wordTimings = findWordTimings(audio.timestamps, mostFrequentKeywords);
      console.log('Word timings:', wordTimings);

      // Sort word timings by time to ensure images are fetched in order
      wordTimings.sort((a, b) => a.time - b.time);

      const videoResponse = await fetch('/video.mp4');
      const videoBlob = await videoResponse.blob();

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      const audioBlob = await audioResponse.blob();

      // Fetch images using the correct imageIndex for each keyword occurrence
      const imagePromises = wordTimings.map(timing => 
        getImage(timing.keyword, timing.imageIndex)
      );
      const imageUrls = await Promise.all(imagePromises);

      console.log("Image URLs:", imageUrls);

      const validImageUrls = imageUrls.filter(url => url != null && url !== '');
      
      if (validImageUrls.length === 0) {
        console.warn("No valid image URLs found");
      }
      
      const imageResponsePromises = validImageUrls.map(url => fetch(url));
      const imageResponses = await Promise.all(imageResponsePromises);

      const imageBlobPromises = imageResponses.map(res => res.blob());
      const imageBlobs = await Promise.all(imageBlobPromises);

      const videoUrl = await addAudioAndImages(videoBlob, audioBlob, imageBlobs, wordTimings, audio.timestamps);
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
    wordTimings: { keyword: string; time: number; index: number; imageIndex: number }[],
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
          clearInterval(intervalId);
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
        // const fps = 30;
        const frameDuration = 1000 / fps; // ~33.33ms per frame
        
        let frameTime = 0;

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

        const drawSubtitleWithHighlights = (line: Array<{text: string, start: number, end: number}>, y: number, audioTime: number) => {
          const fontSize = 56;
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
      
          const fullLineText = line.map(w => w.text).join('');
          const totalWidth = ctx.measureText(fullLineText).width;
          let currentX = (canvas.width - totalWidth) / 2;
      
          line.forEach((word) => {
              const cleanWord = word.text.trim().toLowerCase().replace(/[.,!?]/g, '');
              const isActive = audioTime >= word.start && audioTime <= word.end;
      
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
          const elapsed = frameTime / 1000;
          
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

          let currentImage: { opacity: number; imageIndex: number } | null = null;

          for (let i = 0; i < wordTimings.length; i++) {
            const timing = wordTimings[i];
            const opacity = getFadeOpacity(elapsed, timing.time);
            
            if (opacity > 0) {
              const wouldOverlap = currentImage !== null;
              
              if (!wouldOverlap) {
                currentImage = { opacity, imageIndex: i };
              }
            }
          }

          if (currentImage && currentImage.opacity > 0 && images.length > currentImage.imageIndex) {
            const img = images[currentImage.imageIndex];
            
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
                drawSubtitleWithHighlights(line, lineY, audioElement.currentTime);
            });
          }

        };

        const intervalId = setInterval(() => {
          drawFrame();
          frameTime += frameDuration;
        }, frameDuration);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  async function uploadToTikTok() {
    if (!generatedVideo) {
      alert("Please generate a video first");
      return;
    }

    if (!tiktokUsername) {
      alert("Please enter your TikTok username");
      return;
    }

    setIsUploading(true);
    try {
      // Convert video blob to file
      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append("video", blob, "generated_video.webm");
      formData.append("username", tiktokUsername);
      formData.append("title", videoTitle);
      formData.append("visibility", "PRIVATE");

      const uploadResponse = await fetch("http://127.0.0.1:8000/api/upload-tiktok", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (uploadResponse.ok) {
        alert("✅ Video uploaded to TikTok successfully!");
      } else {
        alert(`❌ Upload failed: ${uploadData.message}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Error uploading to TikTok: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsUploading(false);
    }
  }

  async function registerTikTokCookies() {
    if (!registrationUsername || !registrationCookies) {
      alert("Please fill in both username and cookies");
      return;
    }

    setIsRegistering(true);
    try {
      let cookies;
      try {
        cookies = JSON.parse(registrationCookies);
      } catch (e) {
        alert("Invalid JSON format for cookies. Please ensure it's valid JSON.");
        setIsRegistering(false);
        return;
      }

      const registerResponse = await fetch("http://127.0.0.1:8000/api/register-tiktok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: registrationUsername,
          cookies: cookies,
        }),
      });

      const registerData = await registerResponse.json();

      if (registerResponse.ok) {
        alert(`✅ ${registerData.message}`);
        setRegistrationUsername("");
        setRegistrationCookies("");
        setShowRegistration(false);
      } else {
        alert(`❌ Registration failed: ${registerData.message}`);
      }
    } catch (error) {
      console.error("Registration error:", error);
      alert(`Error registering cookies: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRegistering(false);
    }
  }

  async function autoRegisterTikTok() {
    if (!autoUsername || !autoPassword || !autoTiktokUsername) {
      alert("Please fill in all fields");
      return;
    }

    setIsRegistering(true);
    try {
      const autoRegisterResponse = await fetch("http://127.0.0.1:8000/api/auto-register-tiktok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: autoUsername,
          password: autoPassword,
          tiktok_username: autoTiktokUsername,
        }),
      });

      const autoRegisterData = await autoRegisterResponse.json();

      if (autoRegisterResponse.ok) {
        alert(`✅ ${autoRegisterData.message}`);
        setAutoUsername("");
        setAutoPassword("");
        setAutoTiktokUsername("");
        setShowRegistration(false);
      } else {
        alert(`❌ Auto-registration failed: ${autoRegisterData.message}`);
      }
    } catch (error) {
      console.error("Auto-registration error:", error);
      alert(`Error during auto-registration: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Enhanced Video Generator</h1>
          <button
            onClick={() => setShowRegistration(!showRegistration)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all"
          >
            {showRegistration ? '✕ Close' : '🔐 Register TikTok'}
          </button>
        </div>

        {showRegistration && (
          <div className="mb-8 p-6 bg-gray-800 rounded-lg border-2 border-pink-500">
            <h2 className="text-2xl font-bold text-white mb-4">🔐 Register TikTok Cookies</h2>
            
            {/* Tabs */}
            <div className="flex gap-4 mb-6">
              <button
                onClick={() => setRegistrationTab("auto")}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  registrationTab === "auto"
                    ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                ⚡ Auto Register (Easiest)
              </button>
              <button
                onClick={() => setRegistrationTab("manual")}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  registrationTab === "manual"
                    ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                🔧 Manual Register
              </button>
            </div>

            {/* Auto Registration Tab */}
            {registrationTab === "auto" && (
              <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded-lg text-sm text-gray-300 mb-4">
                  <p className="font-semibold mb-2">✨ Just enter your TikTok login credentials!</p>
                  <p>We'll automatically extract your cookies using browser automation. Your password is only used for login and not stored.</p>
                </div>

                <input
                  type="email"
                  placeholder="TikTok Email or Phone"
                  value={autoUsername}
                  onChange={(e) => setAutoUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />

                <input
                  type="password"
                  placeholder="TikTok Password"
                  value={autoPassword}
                  onChange={(e) => setAutoPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />

                <input
                  type="text"
                  placeholder="Your TikTok Username (for saving)"
                  value={autoTiktokUsername}
                  onChange={(e) => setAutoTiktokUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />

                <button
                  onClick={autoRegisterTikTok}
                  disabled={isRegistering}
                  className="w-full px-4 py-2 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegistering ? '⏳ Auto-registering... (this may take 30-60 seconds)' : '⚡ Auto-Register Cookies'}
                </button>
              </div>
            )}

            {/* Manual Registration Tab */}
            {registrationTab === "manual" && (
              <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded-lg text-sm text-gray-300 mb-4">
                  <p className="mb-2"><strong>How to get your TikTok cookies:</strong></p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Open TikTok.com in your browser</li>
                    <li>Open Developer Tools (F12 or Right-click → Inspect)</li>
                    <li>Go to the "Application" tab → "Cookies"</li>
                    <li>Select "tiktok.com" and copy all cookies</li>
                    <li>You need at least: <code className="bg-gray-900 px-2 py-1 rounded">sessionid</code></li>
                  </ol>
                </div>

                <input
                  type="text"
                  placeholder="TikTok Username"
                  value={registrationUsername}
                  onChange={(e) => setRegistrationUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />

                <textarea
                  placeholder='Paste your cookies as JSON format: {"sessionid": "value", "csrf_session_id": "value", ...}'
                  value={registrationCookies}
                  onChange={(e) => setRegistrationCookies(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500 h-32 font-mono text-sm"
                />

                <button
                  onClick={registerTikTokCookies}
                  disabled={isRegistering}
                  className="w-full px-4 py-2 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegistering ? '⏳ Registering...' : '✅ Register Cookies'}
                </button>
              </div>
            )}
          </div>
        )}
        
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
              
              <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                <h3 className="text-lg font-semibold text-white mb-4">Upload to TikTok</h3>
                
                <input
                  type="text"
                  placeholder="Video Title"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="w-full px-4 py-2 mb-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />
                
                <input
                  type="text"
                  placeholder="TikTok Username"
                  value={tiktokUsername}
                  onChange={(e) => setTiktokUsername(e.target.value)}
                  className="w-full px-4 py-2 mb-4 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-pink-500"
                />
                
                <button
                  onClick={uploadToTikTok}
                  disabled={isUploading || !generatedVideo}
                  className="w-full px-4 py-2 bg-gradient-to-r from-black to-gray-800 hover:from-gray-900 hover:to-black text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border-2 border-pink-500"
                >
                  {isUploading ? '⏳ Uploading to TikTok...' : '🎵 Upload to TikTok'}
                </button>
              </div>
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