import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    const { prompt } = await req.json();

    const response = await fetch(
        "https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct",
        {
            headers: {
                Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 500,
                    temperature: 0.7,
                    return_full_text: false,
                }
            }),
        }
    );

    const result = await response.json();
    
    try {
        const generatedText = result[0].generated_text;
        const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
        const parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        
        return NextResponse.json({ ok: true, result: parsedResult });
    } catch (error) {
        return NextResponse.json({ 
            ok: false, 
            error: 'Failed to parse JSON',
            rawText: result 
        });
    }
}