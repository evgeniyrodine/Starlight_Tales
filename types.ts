
export interface StoryChapter {
  title: string;
  content: string;
  illustrationPrompt: string;
  imageUrl?: string;
}

export type AgeGroup = '0-2' | '3-6' | '7-10';
export type StoryMode = 'BOOK' | 'AUDIO';

export interface Story {
  title: string;
  childName: string;
  theme: string;
  language: string;
  ageGroup: AgeGroup;
  mode: StoryMode;
  chapters: StoryChapter[];
  coverImageUrl?: string;
  audioData?: string; // Base64 PCM data
}

export enum ImageSize {
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K'
}

export type Language = 'English' | 'Spanish' | 'French' | 'German' | 'Chinese' | 'Japanese' | 'Russian';
