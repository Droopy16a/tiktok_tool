'use client';

export default function Home() {
  async function generateSpeech() {
    const res = await fetch("/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: "Bubble sort is a simple sorting algorithm. This sorting algorithm is comparison-based algorithm in which each pair of adjacent elements is compared and the elements are swapped if they are not in order. This algorithm is not suitable for large data sets as its average and worst case complexity are of O(n2) where n is the number of items." }),
    });

    const audio = await res.json();
    console.log(audio.url);
  }

  return <button className="p-4 bg-sky-500 hover:bg-sky-700 rounded-xl hover:cursor-pointer" onClick={generateSpeech}>Generate speech</button>;
}
