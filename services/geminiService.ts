
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Story, AgeGroup } from "../types.ts";

// Helper to create a new AI instance using the required API key from environment
const createAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the structure of a fairy tale including chapters and image prompts.
 */
export const generateStoryStructure = async (
  name: string,
  theme: string,
  language: string,
  ageGroup: AgeGroup
): Promise<Story> => {
  const ai = createAI();
  
  let chapterCount = 5;
  let wordTarget = "750 words total";
  let complexity = "engaging and descriptive";
  let durationMinutes = 5;

  if (ageGroup === '0-2') {
    chapterCount = 3;
    wordTarget = "400-450 words total";
    complexity = "extremely simple, rhythmic, repetitive sounds, short sentences, focus on sensory details";
    durationMinutes = 3;
  } else if (ageGroup === '3-6') {
    chapterCount = 5;
    wordTarget = "700-750 words total";
    complexity = "playful, clear, imaginative, descriptive but easy to follow with a clear moral or lesson";
    durationMinutes = 5;
  } else if (ageGroup === '7-10') {
    chapterCount = 6;
    wordTarget = "1000-1100 words total";
    complexity = "rich vocabulary, complex narrative arc, emotional depth, vivid world-building, and character growth";
    durationMinutes = 7;
  }

  const prompt = `Write a delightful children's fairy tale in ${language} about "${theme}". 
  Target audience: children aged ${ageGroup} years. 
  Complexity level: ${complexity}.
  
  REQUIRED STRUCTURE:
  - Exactly ${chapterCount} chapters.
  - Total story length MUST be approximately ${wordTarget} to ensure it takes ${durationMinutes} minutes to read at a storytelling pace.
  - For each chapter, create a detailed, high-quality English image prompt for the illustrations.
  - The illustrations must feature a consistent protagonist: describe them in detail in every prompt.
  - Use a magical, cinematic 3D Pixar-like animation style.
  
  CONSTRAINTS:
  - DO NOT use the child's name ("${name}") inside the story text itself.
  - Output ONLY the JSON object. No conversational filler.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: `You are a world-class children's book author. You specialize in writing for the ${ageGroup} age group in ${language}. You always respond with valid JSON that strictly follows the provided schema. You ensure your stories are safe, magical, and appropriate for kids. You are extremely strict about meeting word count targets to ensure the desired reading duration of ${durationMinutes} minutes.`,
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

    const text = response.text?.trim();
    if (!text) throw new Error("Magic failed. Empty response.");
    
    const data = JSON.parse(text);
    return {
      ...data,
      childName: name,
      theme: theme,
      language: language,
      ageGroup: ageGroup,
      mode: 'BOOK' 
    };
  } catch (error) {
    console.error("Story Generation Error:", error);
    throw error;
  }
};

/**
 * Fix for: Module '"../services/geminiService"' has no exported member 'chatWithGemini'
 */
export const chatWithGemini = async (message: string, language: string): Promise<string> => {
  const ai = createAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: message,
      config: {
        systemInstruction: `You are a helpful assistant for a children's fairy tale app called Starlight Tales. Answer questions about the stories, help brainstorm ideas for new stories, or just chat in a friendly manner. Respond in ${language}.`,
      },
    });
    return response.text || '';
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};

/**
 * Generates audio narration for the story.
 */
export const generateAudio = async (text: string, language: string): Promise<string> => {
  const ai = createAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: `Narrate this children's story in ${language} with a warm, storytelling voice. Read at a steady, engaging pace suitable for bedtime: ${text}`,
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
    if (!base64Audio) throw new Error("Voice magic failed.");
    return base64Audio;
  } catch (error) {
    console.error("Audio Generation Error:", error);
    throw error;
  }
};

/**
 * Converts raw PCM data to a WAV Blob.
 */
export function pcmToWav(base64Pcm: string, sampleRate: number = 24000): Blob {
  const pcmData = decodeBase64(base64Pcm);
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 32 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);

  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Generates an image based on a prompt.
 */
export const generateImage = async (prompt: string, ageGroup: AgeGroup): Promise<string> => {
  const ai = createAI();
  const stylePrefix = "Cinematic 3D render, Pixar style, vivid colors, volumetric lighting, magical atmosphere, high detail. NO TEXT: ";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `${stylePrefix}${prompt}` }] },
      config: { imageConfig: { aspectRatio: "1:1" } },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Painting failed.");
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

/**
 * Manually implement base64 decoding to follow guidelines.
 */
export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes PCM audio data for browser AudioContext.
 */
export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}
