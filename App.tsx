import React, { useState, useRef, useEffect } from 'react';
import { generateStoryStructure, generateImage, generateAudio, decodeBase64, decodeAudioData } from './services/geminiService';
import { Story, Language, AgeGroup, StoryMode } from './types';
import ChatBot from './components/ChatBot';
import { translations } from './translations';

const LANGUAGES: Language[] = ['English', 'Russian', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'];
const AGE_GROUPS: AgeGroup[] = ['0-2', '3-5', '6-8'];

const App: React.FC = () => {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('');
  const [language, setLanguage] = useState<Language>('Russian');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('3-5');
  const [mode, setMode] = useState<StoryMode>('BOOK');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const t = translations[language] || translations.Russian;
  const storyContentRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const hasApiKey = !!process.env.API_KEY;

  const playAudio = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const bytes = decodeBase64(base64Data);
      const buffer = await decodeAudioData(bytes, ctx);
      
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      audioSourceRef.current = source;
      setIsPlaying(true);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      setIsPlaying(false);
    }
  };

  const handleGenerate = async () => {
    if (!name || !theme) {
      alert(language === 'Russian' ? 'Пожалуйста, введите имя и тему!' : 'Please enter name and theme!');
      return;
    }
    setIsLoading(true);
    setStory(null);
    setAudioUrl(null);
    stopAudio();

    try {
      setLoadingStep(t.step1);
      const storyData = await generateStoryStructure(name, theme, language, ageGroup);
      storyData.mode = mode;
      
      setLoadingStep(t.step2);
      storyData.coverImageUrl = await generateImage(`Magical cover for children story titled: ${storyData.title}`, ageGroup);

      setLoadingStep(t.step3);
      const updatedChapters = [];
      for (let i = 0; i < storyData.chapters.length; i++) {
        setLoadingStep(t.stepChapter(i + 1, storyData.chapters.length));
        const ch = storyData.chapters[i];
        const img = await generateImage(ch.illustrationPrompt, ageGroup);
        updatedChapters.push({ ...ch, imageUrl: img });
      }
      storyData.chapters = updatedChapters;

      if (mode === 'AUDIO' && hasApiKey) {
        setLoadingStep(t.step4);
        const fullText = storyData.chapters.map(c => c.content).join(" ");
        const audioBase64 = await generateAudio(fullText, language);
        storyData.audioData = audioBase64;
      }

      setStory(storyData);
    } catch (err: any) {
      console.error(err);
      alert(`Ошибка генерации: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!story || !storyContentRef.current) return;
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      const canvas = await (window as any).html2canvas(storyContentRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      doc.save(`${story.title}.pdf`);
    } catch (err) {
      alert("Не удалось создать PDF");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pb-32">
      {!hasApiKey && !isLoading && (
        <div className="bg-amber-50 border-l-4 border-amber-400 text-amber-800 p-4 mb-8 rounded shadow-sm text-sm flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <strong>API_KEY не обнаружен.</strong> Приложение работает в <strong>демо-режиме</strong> с использованием заготовленных данных. 
            Для полноценной работы добавьте API_KEY в настройки окружения.
          </div>
        </div>
      )}

      <header className="text-center mb-10">
        <h1 className="text-5xl font-pacifico text-indigo-600 drop-shadow-sm mb-2">{t.title}</h1>
        <p className="text-slate-500 font-medium">{t.subtitle}</p>
      </header>

      {!story && !isLoading && (
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 space-y-8 border border-indigo-50 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">{t.childName}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.childPlaceholder}
                className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 ml-1">{t.language}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 ml-1">{t.ageGroup}</label>
            <div className="flex gap-4">
              {AGE_GROUPS.map(age => (
                <button
                  key={age}
                  onClick={() => setAgeGroup(age)}
                  className={`flex-1 py-3 rounded-2xl border-2 transition-all font-bold ${
                    ageGroup === age ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-400'
                  }`}
                >
                  {t.ageLabel(age)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 ml-1">{t.modeSelect}</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setMode('BOOK')}
                className={`p-4 rounded-2xl border-2 transition-all text-left flex gap-4 items-center ${
                  mode === 'BOOK' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className="text-3xl">📖</span>
                <div>
                  <div className={`font-bold ${mode === 'BOOK' ? 'text-indigo-700' : 'text-slate-600'}`}>{t.modeBook}</div>
                  <div className="text-xs text-slate-400">{t.modeBookDesc}</div>
                </div>
              </button>
              <button
                onClick={() => setMode('AUDIO')}
                className={`p-4 rounded-2xl border-2 transition-all text-left flex gap-4 items-center ${
                  mode === 'AUDIO' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className="text-3xl">🎙️</span>
                <div>
                  <div className={`font-bold ${mode === 'AUDIO' ? 'text-indigo-700' : 'text-slate-600'}`}>{t.modeAudio}</div>
                  <div className="text-xs text-slate-400">{t.modeAudioDesc}</div>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 ml-1">{t.theme}</label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={t.themePlaceholder}
              rows={3}
              className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!name || !theme}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-bold text-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <span>✨</span> {t.generateBtn}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-6 relative overflow-hidden">
            <span className="text-5xl animate-bounce z-10">✨</span>
            <div className="absolute inset-0 bg-gradient-to-t from-indigo-200 to-transparent animate-pulse"></div>
          </div>
          <h2 className="text-2xl font-bold text-indigo-800 mb-2">{t.creatingMagic}</h2>
          <p className="text-slate-500 italic text-center px-4">{loadingStep}</p>
          <div className="mt-8 w-64 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-indigo-500 animate-[loading_2s_infinite_linear]" style={{ width: '100%', backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.3) 50%, transparent 75%)' }}></div>
          </div>
        </div>
      )}

      {story && (
        <div className="space-y-10 animate-fade-in">
          <div className="flex justify-between items-center bg-white/80 p-4 rounded-2xl backdrop-blur-md sticky top-4 z-20 border border-white shadow-lg">
            <button
              onClick={() => { setStory(null); stopAudio(); }}
              className="text-indigo-600 font-bold hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors"
            >
              {t.startOver}
            </button>
            <div className="flex gap-2">
              {story.audioData && (
                <button
                  onClick={() => isPlaying ? stopAudio() : playAudio(story.audioData!)}
                  className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold shadow-md transition-all ${
                    isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {isPlaying ? '⏹️ Stop' : '▶️ Play Audio'}
                </button>
              )}
              <button
                onClick={handleDownloadPdf}
                className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-indigo-700 transition-colors"
              >
                {t.downloadPdf}
              </button>
            </div>
          </div>

          <div ref={storyContentRef} className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-indigo-50">
            {/* Обложка */}
            <div className="relative h-[650px] flex items-center justify-center bg-indigo-900 overflow-hidden">
              <img 
                src={story.coverImageUrl} 
                alt="Cover" 
                className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105"
              />
              <div className="relative z-10 text-center p-10 max-w-2xl text-white">
                <span className="block text-indigo-200 font-bold tracking-[0.4em] mb-6 text-xs uppercase">{t.aStarlightTale}</span>
                <h1 className="text-6xl md:text-7xl font-pacifico mb-8 drop-shadow-2xl leading-tight">{story.title}</h1>
                <div className="h-1.5 w-32 bg-indigo-400/50 mx-auto mb-8 rounded-full"></div>
                <p className="text-2xl font-medium italic opacity-95">{t.forAmazing(story.childName)}</p>
              </div>
            </div>

            {/* Главы */}
            <div className="p-8 md:p-20 space-y-32">
              {story.chapters.map((chapter, idx) => (
                <div key={idx} className={`flex flex-col gap-12 ${idx % 2 !== 0 ? 'md:flex-row-reverse' : 'md:flex-row'} items-center`}>
                  <div className="flex-1 w-full max-w-lg">
                    <div className="relative group">
                      <div className="absolute -inset-6 bg-indigo-100/50 rounded-[3rem] rotate-2 scale-95 group-hover:rotate-0 transition-transform duration-500"></div>
                      <img 
                        src={chapter.imageUrl} 
                        alt={chapter.title} 
                        className="relative rounded-[2.5rem] shadow-2xl w-full aspect-square object-cover z-10 border-4 border-white"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="h-0.5 flex-1 bg-slate-100"></div>
                      <span className="text-indigo-400 font-bold text-xs tracking-[0.3em] uppercase">{t.chapterLabel(idx + 1)}</span>
                      <div className="h-0.5 flex-1 bg-slate-100"></div>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-800 leading-tight">{chapter.title}</h2>
                    <p className="text-xl md:text-2xl text-slate-600 leading-relaxed font-light first-letter:text-6xl first-letter:font-pacifico first-letter:text-indigo-500 first-letter:mr-3 first-letter:float-left">
                      {chapter.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Футер книги */}
            <div className="bg-indigo-50/50 p-10 text-center border-t border-indigo-100">
               <span className="font-pacifico text-2xl text-indigo-400">The End</span>
            </div>
          </div>
        </div>
      )}

      <ChatBot language={language} />

      <style>{`
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-fade-in {
          animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default App;
