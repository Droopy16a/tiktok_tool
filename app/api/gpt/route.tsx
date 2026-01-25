import { NextResponse } from 'next/server';
import { pipeline } from '@huggingface/transformers';

let gen: any;

export async function POST(req: Request) {
    function safeJsonParse(text: string) {
        try {
            return JSON.parse(text);
        } catch {
            // Try to extract JSON array from the text
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                return JSON.parse(match[0]);
            }
            throw new Error('Could not parse JSON from response');
        }
    }

    const { prompt } = await req.json();
    
    if (!gen) {
        gen = await pipeline(
            'text-generation',
            'Xenova/Phi-3-mini-4k-instruct'
        );
    }

    const response = await gen(     
        `Create a viral tiktok video about that :
${prompt}`,
        { 
            max_new_tokens: 400,
            temperature: 0.7,
            do_sample: true
        }
    );

    console.log('Full response:', response);
    
    // Transformers.js returns an array with generated_text
    const generatedText = response[0].generated_text;
    
    try {
        // const parsed = safeJsonParse(generatedText);
        return NextResponse.json({ ok: true, result: generatedText });
    } catch (error) {
        return NextResponse.json({ 
            ok: false, 
            error: (error as Error).message,
            rawText: generatedText 
        });
    }
}