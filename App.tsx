import React, { useState, useRef, useEffect } from 'react';
import { generateStoryStructure, generateImage, generateAudio, pcmToWav } from './services/geminiService';
import { Story, Language, AgeGroup, StoryMode, StoryChapter } from './types';
import { translations } from './translations';
import ChatBot from './components/ChatBot';

const LANGUAGES: Language[] = ['English', 'Russian', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'];
const AGE_GROUPS: AgeGroup[] = ['0-2', '3-6', '7-10'];

const App: React.FC = () => {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('');
  const [language, setLanguage] = useState<Language>('English');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('3-6');
  const [mode, setMode] = useState<StoryMode>('BOOK');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const storyContentRef = useRef<HTMLDivElement>(null);
  const t = translations[language] || translations.English;

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleAudioToggle = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(error => {
            console.error("Playback failed:", error);
            setIsPlaying(false);
          });
      }
    }
  };

  const downloadAudio = () => {
    if (!story?.audioData) return;
    const blob = pcmToWav(story.audioData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${story.title || 'FairyTale'}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!story || !storyContentRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const { jsPDF } = (window as any).jspdf;
      const html2canvas = (window as any).html2canvas;
      const doc = new jsPDF('p', 'pt', 'a4');
      const pages = storyContentRef.current.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const canvas = await html2canvas(page, { scale: 2, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      doc.save(`${story.title || 'FairyTale'}.pdf`);
    } catch (err) {
      alert('PDF export failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerate = async () => {
    if (!name || !theme) return;
    setIsLoading(true);
    setStory(null);
    setAudioUrl(null);
    setCurrentSlide(0);
    setIsPlaying(false);
    
    try {
      setLoadingStep(t.step1);
      const storyData = await generateStoryStructure(name, theme, language, ageGroup);
      storyData.mode = mode;
      
      setLoadingStep(t.step2);
      storyData.coverImageUrl = await generateImage(`Magical cover: ${storyData.title}`, ageGroup);

      const updatedChapters: StoryChapter[] = [];
      for (let i = 0; i < storyData.chapters.length; i++) {
        setLoadingStep(t.stepChapter(i + 1, storyData.chapters.length));
        const img = await generateImage(storyData.chapters[i].illustrationPrompt, ageGroup);
        updatedChapters.push({ ...storyData.chapters[i], imageUrl: img });
      }
      storyData.chapters = updatedChapters;

      if (mode === 'AUDIO') {
        setLoadingStep(t.step4);
        const fullText = storyData.chapters.map(c => c.content).join(" ");
        const audioBase64 = await generateAudio(fullText, language);
        storyData.audioData = audioBase64;
        
        const blob = pcmToWav(audioBase64);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }

      setStory(storyData);
    } catch (err: any) {
      console.error("Generation Error Details:", err);
      // Показываем конкретную ошибку пользователю для облегчения диагностики на Vercel
      alert(`${t.errorMagic}\n\nDetails: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const onTimeUpdate = () => {
    if (!audioRef.current || !story) return;
    const progress = audioRef.current.currentTime / audioRef.current.duration;
    if (isNaN(progress)) return;
    
    const chapterIndex = Math.floor(progress * story.chapters.length);
    if (chapterIndex < story.chapters.length && chapterIndex !== currentSlide) {
      setCurrentSlide(chapterIndex);
    }
  };

  const reset = () => {
    setStory(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentSlide(0);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pb-24">
      <header className="text-center mb-8">
        <h1 className="text-5xl font-pacifico text-indigo-600 drop-shadow-sm">{t.title}</h1>
        <p className="text-slate-500 mt-2">{t.subtitle}</p>
      </header>

      {!story ? (
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 space-y-6 border border-indigo-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600">{t.childName}</label>
              <input type="text" placeholder={t.childPlaceholder} className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none ring-indigo-400 focus:ring-2" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600">{t.language}</label>
              <select className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none" value={language} onChange={e => setLanguage(e.target.value as Language)}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600">{t.ageGroup}</label>
            <div className="grid grid-cols-3 gap-2">
              {AGE_GROUPS.map(age => (
                <button key={age} onClick={() => setAgeGroup(age as AgeGroup)} className={`py-3 rounded-xl font-bold border-2 transition-all ${ageGroup === age ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-100 text-slate-400'}`}>
                  {t.ageLabel(age)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600">{t.modeSelect}</label>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setMode('BOOK')} className={`p-4 rounded-2xl border-2 text-left transition-all ${mode === 'BOOK' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100'}`}>
                <div className="text-2xl mb-1">📖</div>
                <div className="font-bold">{t.modeBook}</div>
                <div className="text-xs text-slate-500">{t.modeBookDesc}</div>
              </button>
              <button onClick={() => setMode('AUDIO')} className={`p-4 rounded-2xl border-2 text-left transition-all ${mode === 'AUDIO' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100'}`}>
                <div className="text-2xl mb-1">🎧</div>
                <div className="font-bold">{t.modeAudio}</div>
                <div className="text-xs text-slate-500">{t.modeAudioDesc}</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600">{t.theme}</label>
            <textarea placeholder={t.themePlaceholder} className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none ring-indigo-400 focus:ring-2 h-24" value={theme} onChange={e => setTheme(e.target.value)} />
          </div>

          <button onClick={handleGenerate} disabled={isLoading || !name || !theme} className="w-full py-5 rounded-2xl font-bold text-xl bg-indigo-600 text-white shadow-lg disabled:bg-slate-200 disabled:text-slate-400 transition-all">
            {isLoading ? <span className="flex items-center justify-center gap-3"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {loadingStep}</span> : `✨ ${t.generateBtn}`}
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border sticky top-4 z-20">
            <button onClick={reset} className="text-slate-400 font-bold px-4">{t.startOver}</button>
            <div className="flex gap-2">
              {story.mode === 'BOOK' ? (
                <button onClick={downloadPdf} disabled={isDownloading} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50">
                  {isDownloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '📥'} {t.downloadPdf}
                </button>
              ) : (
                <button onClick={downloadAudio} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
                  📥 {t.downloadAudio}
                </button>
              )}
            </div>
          </div>

          {story.mode === 'BOOK' ? (
            <div ref={storyContentRef} className="space-y-12">
              <div className="pdf-page bg-white p-8 md:p-16 rounded-3xl shadow-xl text-center flex flex-col items-center justify-center min-h-[700px] w-full">
                <h1 className="text-4xl font-pacifico text-indigo-600 mb-4">{story.title}</h1>
                <p className="text-slate-400 italic mb-8">{t.forAmazing(story.childName)}</p>
                {story.coverImageUrl && <img src={story.coverImageUrl} className="w-full max-w-md rounded-2xl shadow-2xl border-8 border-white" crossOrigin="anonymous" />}
              </div>
              {story.chapters.map((ch, idx) => (
                <div key={idx} className="pdf-page bg-white p-8 md:p-16 rounded-3xl shadow-xl space-y-8 min-h-[800px] w-full">
                  <h2 className="text-2xl font-bold text-slate-800">{t.chapterLabel(idx + 1)}: {ch.title}</h2>
                  {ch.imageUrl && <img src={ch.imageUrl} className="w-full aspect-square object-cover rounded-2xl shadow-md" crossOrigin="anonymous" />}
                  <p className="text-lg leading-relaxed text-slate-700 whitespace-pre-wrap">{ch.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden aspect-square relative group">
              {audioUrl && (
                <audio 
                  ref={audioRef} 
                  src={audioUrl}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              )}
              <img 
                src={story.chapters[currentSlide]?.imageUrl || story.coverImageUrl} 
                className="w-full h-full object-cover transition-all duration-1000" 
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
                <div className="mb-6">
                  <h2 className="text-3xl font-bold mb-2">{story.title}</h2>
                  <p className="text-lg opacity-80">{t.chapterLabel(currentSlide + 1)}: {story.chapters[currentSlide]?.title}</p>
                </div>
                <div className="flex items-center gap-6">
                   <button 
                    onClick={handleAudioToggle} 
                    className="bg-white text-indigo-600 w-20 h-20 rounded-full text-3xl shadow-2xl hover:scale-110 transition-transform flex items-center justify-center focus:outline-none"
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden relative cursor-pointer" onClick={(e) => {
                    if (!audioRef.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const pct = x / rect.width;
                    audioRef.current.currentTime = pct * audioRef.current.duration;
                  }}>
                    <div 
                      className="h-full bg-indigo-400 transition-all duration-150" 
                      style={{ width: `${audioRef.current ? (audioRef.current.currentTime / audioRef.current.duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <ChatBot language={language} />
    </div>
  );
};

export default App;