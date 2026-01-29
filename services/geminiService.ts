import { GoogleGenAI, Type, Modality, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { Story, AgeGroup } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    throw new Error("Critical: API_KEY is missing or invalid. Please set it in Vercel Environment Variables.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export const generateStoryStructure = async (
  name: string,
  theme: string,
  language: string,
  ageGroup: AgeGroup
): Promise<Story> => {
  const ai = getAI();
  
  let chapterCount = 5;
  let wordTarget = "750 words total";
  let complexity = "engaging and descriptive";

  if (ageGroup === '0-2') {
    chapterCount = 3;
    wordTarget = "400-450 words total";
    complexity = "extremely simple, rhythmic, repetitive sounds, short sentences";
  } else if (ageGroup === '3-6') {
    chapterCount = 5;
    wordTarget = "700-750 words total";
    complexity = "playful, clear, imaginative, with a clear moral";
  } else if (ageGroup === '7-10') {
    chapterCount = 6;
    wordTarget = "1000-1100 words total";
    complexity = "rich vocabulary, complex narrative arc, emotional depth";
  }

  const prompt = `Write a delightful children's fairy tale in ${language} about "${theme}". 
  Target audience: children aged ${ageGroup} years. 
  Complexity level: ${complexity}.
  
  REQUIRED STRUCTURE:
  - Exactly ${chapterCount} chapters.
  - Total story length MUST be approximately ${wordTarget}.
  - For each chapter, create a detailed English image prompt for illustrations.
  - Use a magical, cinematic 3D Pixar-like animation style.
  
  CONSTRAINTS:
  - DO NOT use the child's name ("${name}") inside the story text itself.
  - Output ONLY the JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: `You are a world-class children's book author. You specialize in the ${ageGroup} age group in ${language}. Respond strictly in JSON. Ensure story length matches ${wordTarget}.`,
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
        },
        safetySettings: SAFETY_SETTINGS
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI returned empty text.");
    
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

export const chatWithGemini = async (message: string, language: string): Promise<string> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: message }] },
      config: {
        systemInstruction: `You are a magical fairy tale assistant for Starlight Tales. Help users in ${language}.`,
        safetySettings: SAFETY_SETTINGS
      },
    });
    return response.text || "";
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};

export const generateAudio = async (text: string, language: string): Promise<string> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Narrate this in ${language} warmly: ${text}` }] }],
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
    if (!base64Audio) throw new Error("TTS failed.");
    return base64Audio;
  } catch (error) {
    console.error("Audio Generation Error:", error);
    throw error;
  }
};

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
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
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

export const generateImage = async (prompt: string, ageGroup: AgeGroup): Promise<string> => {
  const ai = getAI();
  const style = "High quality 3D animated movie style, magical fairytale atmosphere, soft cinematic lighting, vivid colors. NO TEXT, NO LOGOS. Subject: ";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `${style}${prompt}` }] },
      config: { 
        imageConfig: { aspectRatio: "1:1" },
        safetySettings: SAFETY_SETTINGS
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No response candidate from image model.");

    if (!candidate.content || !candidate.content.parts) {
      const reason = candidate.finishReason || "Unknown";
      throw new Error(`Model returned no content. Finish Reason: ${reason}. This may be due to safety filters.`);
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    const textExplanation = candidate.content.parts.find(p => p.text)?.text;
    if (textExplanation) {
      console.warn("Model returned text instead of image:", textExplanation);
      throw new Error(`Image blocked: ${textExplanation}`);
    }

    throw new Error("Image generation failed for an unknown reason.");
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}