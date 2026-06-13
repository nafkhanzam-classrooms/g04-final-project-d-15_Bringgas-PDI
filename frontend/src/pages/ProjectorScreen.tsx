import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy, Code, Play, Maximize, Minimize } from 'lucide-react';
import PdfSlideViewer from '../components/classroom/PdfSlideViewer';
import Whiteboard from '../components/classroom/Whiteboard';

const resolvePresentationUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/uploads/')) {
    const idx = url.indexOf('/uploads/');
    return window.location.origin + url.substring(idx);
  }
  return url;
};


export default function ProjectorScreen() {
  const { code } = useParams();
  const [classState, setClassState] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!code) return;
    const channel = new BroadcastChannel(`lopyta_projector_${code}`);
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'STATE_UPDATE') {
        setClassState(event.data.classState);
      }
    };
    
    channel.addEventListener('message', handleMessage);
    
    // Request initial state on mount
    channel.postMessage({ type: 'REQUEST_INITIAL_STATE' });
    
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [code]);

  if (!classState) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-8 text-center font-sans">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-3xl font-extrabold uppercase tracking-wider text-slate-200">Menunggu Dashboard Guru...</h2>
        <p className="text-slate-400 mt-2 font-semibold">Silakan biarkan tab ini terbuka. Tampilan proyektor akan otomatis aktif setelah terhubung.</p>
        <div className="mt-8 text-sm font-semibold bg-slate-800 px-4 py-2 rounded-xl text-blue-400 border border-slate-700 uppercase tracking-widest">
          Class Code: {code}
        </div>
      </div>
    );
  }

  const { className, hostName, activeSlide, totalSlides, presentationUrl, isShowingLeaderboard, currentQuestion, leaderboard, participants } = classState;
  const activeParticipants = Object.values(participants || {}).filter((p: any) => p.active);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans overflow-hidden select-none">
      {/* Premium minimal header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center z-20 px-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Play size={20} className="text-white fill-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-wide text-slate-100">{className}</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Presenter: {hostName}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-slate-800/80 px-4 py-1.5 rounded-xl border border-slate-700/50 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Students</span>
            <span className="text-sm font-black text-green-400">{activeParticipants.length}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Class Code</span>
            <span className="font-mono font-black text-2xl text-blue-400 tracking-wider">{code}</span>
          </div>
        </div>
      </header>

      {/* Main Display Area */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-6">
        
        {/* Leaderboard View */}
        {isShowingLeaderboard && (
          <div className="absolute inset-0 z-40 bg-slate-950 p-6 md:p-12 overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
            <div className="max-w-5xl mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-950 text-white p-8 flex items-center justify-center gap-4">
                <Trophy size={48} className="text-yellow-400 animate-bounce" />
                <h2 className="text-4xl font-extrabold uppercase tracking-widest text-slate-100">Class Leaderboard</h2>
              </div>
              <div className="p-8">
                {leaderboard && leaderboard.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {leaderboard.slice(0, 10).map((entry: any, idx: number) => (
                      <div 
                        key={idx} 
                        className={`flex items-center gap-4 p-5 rounded-2xl border transition-all ${
                          idx === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border-yellow-500/30' :
                          idx === 1 ? 'bg-slate-800/80 border-slate-700' :
                          idx === 2 ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-900/50 border-slate-800/30'
                        }`}
                      >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black ${
                          idx === 0 ? 'bg-yellow-500 text-slate-950 shadow-lg shadow-yellow-500/20' :
                          idx === 1 ? 'bg-slate-300 text-slate-950' :
                          idx === 2 ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-extrabold text-2xl truncate text-slate-200">{entry.name}</h3>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-black text-slate-100">{entry.score} <span className="text-xs font-semibold text-slate-500 uppercase">pts</span></div>
                          {entry.streak >= 3 && (
                            <div className="flex items-center justify-end gap-1 font-bold text-xs text-orange-500">
                              🔥 {entry.streak} Streak
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <p className="font-extrabold text-slate-500 text-lg uppercase tracking-widest">Belum ada skor masuk. Mulai aktivitas!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Presentation Slide vs Question Activity */}
        {!isShowingLeaderboard && (
          currentQuestion ? (
            /* Quiz / Activity Screen */
            <div className="w-full max-w-6xl bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-10 flex flex-col justify-between min-h-[70vh] animate-in zoom-in-95 duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 opacity-5 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3"></div>
              
              <div className="border-b border-slate-800 pb-8 bg-slate-900/50">
                <span className="text-xs font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 px-4 py-2 rounded-full border border-blue-500/20 inline-block mb-6">
                  {currentQuestion.activityType.toUpperCase()}
                </span>
                <h3 className="text-4xl md:text-6xl font-black text-slate-100 leading-tight">{currentQuestion.questionText}</h3>
              </div>

              <div className="flex-1 flex flex-col justify-center py-10">
                {currentQuestion.activityType === 'quiz' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {currentQuestion.options.map((opt: string, i: number) => {
                      const letter = String.fromCharCode(65 + i);
                      return (
                        <div
                          key={letter}
                          className="flex items-center gap-6 p-6 rounded-2xl border border-slate-800 bg-slate-950/60 font-bold text-left shadow-md"
                        >
                          <div className="w-14 h-14 flex items-center justify-center rounded-xl text-3xl font-black bg-slate-800 text-blue-400 border border-slate-700">
                            {letter}
                          </div>
                          <span className="text-2xl md:text-3xl text-slate-200 leading-snug">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 bg-slate-950/20 p-12 rounded-3xl text-center">
                    <Code size={72} className="text-blue-500 animate-pulse mb-6" />
                    <h4 className="text-3xl font-black text-slate-200 uppercase tracking-wide">Tantangan Pemrograman Aktif</h4>
                    <p className="text-slate-500 mt-3 font-semibold text-lg max-w-2xl">Kirimkan solusi javascript Anda melalui layar siswa. Hasil akan dinilai oleh guru di layar utama.</p>
                  </div>
                )}
              </div>
            </div>
          ) : presentationUrl ? (
            /* Standalone Slide Display */
            <div className="w-full aspect-video bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 relative overflow-hidden mx-auto max-w-[95%] max-h-[80vh]">
              {code && <Whiteboard isHost={false} code={code} />}

              {presentationUrl.toLowerCase().endsWith('.pdf') ? (
                <div className="absolute inset-0 z-10">
                  <PdfSlideViewer 
                    url={resolvePresentationUrl(presentationUrl)} 
                    slideNumber={activeSlide} 
                  />
                </div>
              ) : (
                <iframe 
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
                    resolvePresentationUrl(presentationUrl)
                  )}`}
                  width="100%" 
                  height="100%" 
                  frameBorder="0"
                  className="w-full h-full border-0 absolute top-0 left-0"
                  title="PowerPoint Presentation"
                ></iframe>
              )}
            </div>
          ) : (
            /* Standalone Fallback slide counter */
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 p-16 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center">
              <span className="font-extrabold text-sm bg-blue-500/10 text-blue-400 border border-blue-500/20 px-6 py-2 rounded-full uppercase tracking-wider mb-8">Slide Presentasi</span>
              <div className="text-[120px] md:text-[180px] font-black text-slate-200 leading-none select-none tracking-tight">
                {activeSlide}
              </div>
            </div>
          )
        )}
      </main>

      {/* Floating Fullscreen Control */}
      <div className="fixed bottom-6 right-6 z-50 pointer-events-auto">
        <button
          onClick={toggleFullscreen}
          className="bg-slate-800/90 hover:bg-slate-700 text-white backdrop-blur-md border border-slate-700/50 p-3.5 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center group"
          title={isFullscreen ? "Minimize Screen" : "Maximize Fullscreen"}
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      {/* Minimal Footer */}
      {!isShowingLeaderboard && (
        <footer className="bg-slate-900/50 border-t border-slate-900 p-4 px-8 flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-widest z-10">
          <span>Bringgas PDI Projector Panel</span>
          <span>Slide {activeSlide} of {totalSlides || '?'}</span>
        </footer>
      )}
    </div>
  );
}
