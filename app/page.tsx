'use client';
import { useState } from "react";

export default function Home() {
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const TEXT = "Bubble sort is a simple sorting algorithm. This sorting algorithm is comparison-based algorithm in which each pair of adjacent elements is compared and the elements are swapped if they are not in order. This algorithm is not suitable for large data sets as its average and worst case complexity are of O(n2) where n is the number of items.";

  function getKeyword(TEXT : string) {
    const words = TEXT.split(' ');
    var dictionary: { [word: string]: number } = {};

    words.forEach((word) => {
      const cleanedWord = word.toLowerCase().replace(/[.,]/g, '');
      if (dictionary[cleanedWord]) {
        dictionary[cleanedWord] += 1;
      } else {
        dictionary[cleanedWord] = 1;
      }
    });

    // let maxCount = 0;
    // let mostFrequentWord = '';
    
    // for (const word in dictionary) {
    //   if (dictionary[word] > maxCount) {
    //     maxCount = dictionary[word];
    //     mostFrequentWord = word;
    //   }
    // }
    return dictionary;
  }

  console.log("Most frequent word:", getKeyword(TEXT));

  async function generateSpeech() {
    console.log("Generating speech...");
    const res = await fetch("/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: TEXT }),
    });

    const audio = await res.json();
    console.log(audio.url);
    setAudioFile(audio.url);

    addAudio('/video.mp4' as any, audio.url).then((videoUrl) => {
      console.log("Video with added audio URL:", videoUrl);
    }).catch((error) => {
      console.error("Error adding audio to video:", error);
    });
  }


  async function addAudio(videoFile: File, audioFile: File) {
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('audio', audioFile);

    const res = await fetch('/api/edit', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Failed to add audio');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return url;
  }
    

  return (
    <div>
      <button className="p-4 bg-sky-500 hover:bg-sky-700 rounded-xl hover:cursor-pointer" onClick={generateSpeech}>Generate speech</button>
      <audio src={audioFile || undefined} controls className="w-full mb-4" />
    </div>
  );
}
