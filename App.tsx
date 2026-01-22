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
  const [language, setLanguage] = useState<Language>('English');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('3-5');
  const [mode, setMode] = useState<StoryMode>('BOOK');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const t = translations[language] || translations.English;
  const storyContentRef = useRef<HTMLDivElement>(null);

  const playAudio = async (base64: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const bytes = decodeBase64(base64);
      const buffer = await decodeAudioData(bytes, ctx);
      
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (e) {}
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      const slideDuration = buffer.duration / story!.chapters.length;
      let slideIdx = 0;
      setCurrentSlide(0);
      
      const interval = setInterval(() => {
        slideIdx++;
        if (slideIdx < story!.chapters.length) {
          setCurrentSlide(slideIdx);
        } else {
          clearInterval(interval);
        }
      }, slideDuration * 1000);

      source.onended = () => clearInterval(interval);
      source.start();
      audioSourceRef.current = source;
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const exportVideo = async () => {
    if (!story || !story.audioData) return;
    setIsExporting(true);

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const bytes = decodeBase64(story.audioData);
      const audioBuffer = await decodeAudioData(bytes, ctx);

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) throw new Error("Could not get canvas context");

      const stream = canvas.captureStream(30);
      const dest = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);

      stream.addTrack(dest.stream.getAudioTracks()[0]);

      const mimeType = MediaRecorder.isTypeSupported('video/mp4') 
        ? 'video/mp4' 
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
          ? 'video/webm;codecs=vp9,opus' 
          : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = () => {
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${story.title}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setIsExporting(false);
      };

      const durationPerChapter = audioBuffer.duration / story.chapters.length;
      recorder.start();
      source.start();

      for (let i = 0; i < story.chapters.length; i++) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = story.chapters[i].imageUrl || story.coverImageUrl || "";
        await new Promise(r => {
          img.onload = r;
          img.onerror = r;
        });

        const chapterStartTime = Date.now();
        const chapterDurationMs = durationPerChapter * 1000;
        
        while (Date.now() - chapterStartTime < chapterDurationMs) {
          canvasCtx.fillStyle = '#000';
          canvasCtx.fillRect(0, 0, 1024, 1024);
          canvasCtx.drawImage(img, 0, 0, 1024, 1024);
          
          canvasCtx.fillStyle = 'rgba(0,0,0,0.5)';
          canvasCtx.fillRect(0, 850, 1024, 174);
          
          canvasCtx.fillStyle = 'white';
          canvasCtx.font = 'bold 44px Quicksand, sans-serif';
          canvasCtx.textAlign = 'center';
          canvasCtx.fillText(story.chapters[i].title, 512, 950);
          
          await new Promise(r => requestAnimationFrame(r));
        }
      }

      source.stop();
      recorder.stop();
    } catch (err) {
      console.error(err);
      alert(t.errorMagic);
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!story || !storyContentRef.current) return;
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      const canvas = await (window as any).html2canvas(storyContentRef.current, { 
        scale: 2,
        useCORS: true,
        allowTaint: true
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      doc.save(`${story.title}.pdf`);
    } catch (err) {
      console.error("PDF Export error:", err);
      alert(t.errorMagic);
    }
  };

  const handleGenerate = async () => {
    if (!name || !theme) return;
    setIsLoading(true);
    setStory(null);
    try {
      setLoadingStep(t.step1);
      const storyData = await generateStoryStructure(name, theme, language, ageGroup);
      storyData.mode = mode;
      
      setLoadingStep(t.step2);
      storyData.coverImageUrl = await generateImage(`Magical cover for: ${storyData.title}. Pixar style animation.`, ageGroup);

      setLoadingStep(t.step3);
      storyData.chapters = await Promise.all(storyData.chapters.map(async (ch, idx) => {
        setLoadingStep(t.stepChapter(idx + 1, storyData.chapters.length));
        const img = await generateImage(ch.illustrationPrompt, ageGroup);
        return { ...ch, imageUrl: img };
      }));

      if (mode === 'AUDIO') {
        setLoadingStep(t.step4);
        const fullText = storyData.chapters.map(c => c.content).join(" ");
        storyData.audioData = await generateAudio(fullText, language);
      }

      setStory(storyData);
    } catch (err) {
      console.error(err);
      alert(t.errorMagic);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pb-32">
      <header className="text-center mb-6 md:mb-10">
        <h1 className="text-4xl md:text-6xl font-pacifico text-indigo-600 drop-shadow-sm select-none">{t.title}</h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base">{t.subtitle}</p>
      </header>

      {!story ? (
        <div className="bg-white rounded-3xl shadow-xl p-5 md:p-10 space-y-6 border border-indigo-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-1">
              <label className="text-xs md:text-sm font-bold text-slate-600 ml-2">{t.childName}</label>
              <input type="text" placeholder={t.childPlaceholder} className="w-full px-5 py-3 md:py-4 bg-slate-50 rounded-2xl outline-none ring-indigo-400 focus:ring-2 text-base" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs md:text-sm font-bold text-slate-600 ml-2">{t.language}</label>
              <select className="w-full px-5 py-3 md:py-4 bg-slate-50 rounded-2xl outline-none text-base cursor-pointer" value={language} onChange={e => setLanguage(e.target.value as Language)}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs md:text-sm font-bold text-slate-600 ml-2">{t.ageGroup}</label>
            <div className="grid grid-cols-3 gap-2">
              {AGE_GROUPS.map(age => (
                <button key={age} onClick={() => setAgeGroup(age)} className={`py-3 rounded-xl font-bold border-2 transition-all text-sm md:text-base ${ageGroup === age ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                  {t.ageLabel(age)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs md:text-sm font-bold text-slate-600 ml-2">{t.modeSelect}</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('BOOK')} className={`p-3 md:p-4 rounded-2xl border-2 text-left transition-all ${mode === 'BOOK' ? 'border-indigo-500 bg-indigo-50 shadow-inner' : 'border-slate-100'}`}>
                <div className="text-xl md:text-2xl mb-1">📖</div>
                <div className="font-bold text-sm md:text-base">{t.modeBook}</div>
                <div className="hidden md:block text-xs text-slate-500">{t.modeBookDesc}</div>
              </button>
              <button onClick={() => setMode('AUDIO')} className={`p-3 md:p-4 rounded-2xl border-2 text-left transition-all ${mode === 'AUDIO' ? 'border-indigo-500 bg-indigo-50 shadow-inner' : 'border-slate-100'}`}>
                <div className="text-xl md:text-2xl mb-1">🎧</div>
                <div className="font-bold text-sm md:text-base">{t.modeAudio}</div>
                <div className="hidden md:block text-xs text-slate-500">{t.modeAudioDesc}</div>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs md:text-sm font-bold text-slate-600 ml-2">{t.theme}</label>
            <textarea placeholder={t.themePlaceholder} className="w-full px-5 py-3 md:py-4 bg-slate-50 rounded-2xl outline-none ring-indigo-400 focus:ring-2 h-24 text-base resize-none" value={theme} onChange={e => setTheme(e.target.value)} />
          </div>

          <button onClick={handleGenerate} disabled={isLoading || !name || !theme} className="w-full py-4 md:py-5 rounded-2xl font-bold text-lg md:text-xl bg-indigo-600 text-white shadow-lg disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.98]">
            {isLoading ? <span className="flex items-center justify-center gap-3"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {loadingStep}</span> : `✨ ${t.generateBtn}`}
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-between items-center bg-white p-3 md:p-4 rounded-2xl shadow-sm border sticky top-2 z-20">
            <button onClick={() => { setStory(null); if (audioSourceRef.current) audioSourceRef.current.stop(); }} className="text-slate-400 font-bold px-2 md:px-4 text-sm md:text-base">{t.startOver}</button>
            <div className="flex gap-2">
              {story.mode === 'BOOK' && (
                <button onClick={handleDownloadPdf} className="bg-indigo-600 text-white px-4 md:px-6 py-2 rounded-xl font-bold flex items-center gap-2 text-sm md:text-base shadow-sm">
                  {t.downloadPdf}
                </button>
              )}
              {story.mode === 'AUDIO' && (
                <button 
                  onClick={exportVideo} 
                  disabled={isExporting}
                  className="bg-indigo-600 text-white px-4 md:px-6 py-2 rounded-xl font-bold disabled:bg-slate-300 flex items-center gap-2 text-sm md:text-base shadow-sm"
                >
                  {isExporting ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t.exportingVideo}</span> : t.downloadMp4}
                </button>
              )}
            </div>
          </div>

          {story.mode === 'BOOK' ? (
            <div ref={storyContentRef} className="space-y-6 md:space-y-12 pb-12">
              <div className="bg-white p-6 md:p-16 rounded-3xl shadow-xl text-center flex flex-col items-center justify-center min-h-[500px] md:min-h-[700px]">
                <h1 className="text-3xl md:text-5xl font-pacifico text-indigo-600 mb-4">{story.title}</h1>
                <p className="text-slate-400 italic text-lg md:text-xl mb-8">{t.forAmazing(story.childName)}</p>
                {story.coverImageUrl && <img src={story.coverImageUrl} className="w-full max-w-sm md:max-w-md rounded-2xl shadow-2xl border-4 md:border-8 border-white" alt="Cover" />}
              </div>
              {story.chapters.map((ch, idx) => (
                <div key={idx} className="bg-white p-6 md:p-16 rounded-3xl shadow-xl space-y-6 md:space-y-8 min-h-[600px] md:min-h-[800px]">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-800">{t.chapterLabel(idx + 1)}: {ch.title}</h2>
                  {ch.imageUrl && <img src={ch.imageUrl} className="w-full aspect-square object-cover rounded-2xl shadow-md" alt={`Chapter ${idx + 1}`} />}
                  <p className="text-base md:text-xl leading-relaxed text-slate-700 whitespace-pre-wrap">{ch.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden aspect-square relative group max-w-2xl mx-auto w-full">
                <img 
                  src={story.chapters[currentSlide]?.imageUrl || story.coverImageUrl} 
                  className="w-full h-full object-cover transition-opacity duration-1000" 
                  alt="Slide"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-6 md:p-10 text-white">
                  <h2 className="text-2xl md:text-4xl font-bold mb-1 md:mb-2">{story.title}</h2>
                  <p className="text-lg md:text-2xl opacity-90">{t.chapterLabel(currentSlide + 1)}: {story.chapters[currentSlide]?.title}</p>
                </div>
                {!audioSourceRef.current && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <button onClick={() => playAudio(story.audioData!)} className="bg-white text-indigo-600 w-20 h-20 md:w-24 md:h-24 rounded-full text-3xl md:text-4xl shadow-2xl hover:scale-110 transition-transform flex items-center justify-center pl-2">
                      ▶
                    </button>
                  </div>
                )}
              </div>
              <div className="text-center p-5 md:p-6 bg-white/70 rounded-2xl border border-indigo-100 italic text-slate-600 max-w-2xl mx-auto w-full text-sm md:text-base">
                {story.chapters[currentSlide]?.content}
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