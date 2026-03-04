import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';

const genAI = new GoogleGenerativeAI(apiKey);

export function getGeminiModel(modelId: string = 'gemini-2.5-pro') {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }
    return genAI.getGenerativeModel({ model: modelId });
}
