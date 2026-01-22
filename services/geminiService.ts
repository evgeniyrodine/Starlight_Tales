
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Story, StoryChapter, AgeGroup } from "../types";

export const generateStoryStructure = async (
  name: string,
  theme: string,
  language: string,
  ageGroup: AgeGroup
): Promise<Story> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  let chapterCount = 5;
  let wordTarget = "400-500 words total";
  let complexity = "engaging and descriptive";

  if (ageGroup === '0-2') {
    chapterCount = 3;
    wordTarget = "150-200 words total";
    complexity = "extremely simple, repetitive, high focus on sounds and simple concepts for toddlers";
  } else if (ageGroup === '3-5') {
    chapterCount = 4;
    wordTarget = "400-500 words total";
    complexity = "playful and clear, magical and adventurous";
  } else if (ageGroup === '6-8') {
    chapterCount = 5;
    wordTarget = "800-1000 words total";
    complexity = "narrative-driven with a clear plot and more descriptive language";
  }

  const prompt = `Write a children's fairy tale in ${language} about "${theme}". 
  Target audience age: ${ageGroup} years old. 
  Complexity: ${complexity}.
  
  CRITICAL RULES:
  1. DO NOT mention the child's name ("${name}") in the story text.
  2. Exactly ${chapterCount} chapters.
  3. Total length roughly ${wordTarget}.
  4. Global Character Description must be used in every image prompt for consistency. Protagonist is the same throughout.
  5. Cinematic 3D animation style (Pixar/Disney). No text on images.
  
  For each chapter, provide:
  1. A chapter title (in ${language}).
  2. The full story text (in ${language}).
  3. A descriptive prompt (in English) for an AI image generator including the protagonist description.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                illustrationPrompt: { type: Type.STRING }
              },
              required: ["title", "content", "illustrationPrompt"]
            }
          }
        },
        required: ["title", "chapters"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    childName: name,
    theme: theme,
    language: language,
    ageGroup: ageGroup,
    mode: 'BOOK' // Default, will be overridden
  };
};

export const generateAudio = async (text: string, language: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this story clearly and warmly for a child in ${language}: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  return base64Audio;
};

export const generateImage = async (prompt: string, ageGroup: AgeGroup): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const stylePrefix = "Cinematic 3D render, Disney style, realistic textures, volumetric lighting, masterpiece. ABSOLUTELY NO TEXT: ";

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `${stylePrefix}${prompt}` }] },
    config: { imageConfig: { aspectRatio: "1:1" } },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("No image data");
};

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

export const chatWithGemini = async (message: string, language: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a helpful fairy tale assistant. Respond in ${language}.`
    }
  });
  const response = await chat.sendMessage({ message });
  return response.text;
};
