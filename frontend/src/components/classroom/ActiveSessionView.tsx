import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, StopCircle, Radio, PlayCircle, Send, PlusCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { useWebSocketStore, MsgCreateClass, MsgSlideChange, MsgToggleVideoCall, MsgSendQuestion, MsgStopQuestion } from '../../store/websocketStore';
import { useClassStore } from '../../store/classStore';
import type { QuestionBankItem } from '../../store/classStore';
import VideoConference from './VideoConference';
import PdfSlideViewer from './PdfSlideViewer';

export default function ActiveSessionView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { isConnected, classState, connect, disconnect, sendPacket, error, clearError } = useWebSocketStore();
  const { questionBank, fetchQuestionBank, endClass } = useClassStore();
  const [slideNumber, setSlideNumber] = useState(1);

  useEffect(() => {
    fetchQuestionBank();
    if (!isConnected) {
      connect();
    }
    
    // Refresh question bank when returning to this tab
    const handleFocus = () => {
      fetchQuestionBank();
    };
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      // Don't disconnect on unmount if we want background connection, 
      // but for this simple SPA we disconnect if they leave the active session page.
      // Actually let's keep it connected but we will need to re-join if needed.
    };
  }, [isConnected, connect, fetchQuestionBank]);

  // If there's a code in URL but no active classState, we should tell the backend we are the host for this class.
  useEffect(() => {
    if (isConnected && code && (!classState || classState.code !== code)) {
      sendPacket(MsgCreateClass, { code });
    }
  }, [isConnected, code, classState, sendPacket]);

  // Handle WebSocket errors for Host
  useEffect(() => {
    if (error) {
      Swal.fire({
        icon: 'error',
        title: 'Koneksi Bermasalah',
        text: error,
        confirmButtonColor: '#000000',
      }).then(() => {
        clearError();
      });
    }
  }, [error, clearError]);

  const handleEndSession = async () => {
    if (!code) return;
    if (window.confirm('Are you sure you want to end this session?')) {
      await endClass(code);
      disconnect();
      navigate('/host/classes');
    }
  };

  const changeSlide = (delta: number) => {
    const newSlide = Math.max(1, slideNumber + delta);
    setSlideNumber(newSlide);
    sendPacket(MsgSlideChange, { code, slide: newSlide });

    // Call Wails if available
    if (window.go?.main?.App?.ChangeSlide) {
      window.go.main.App.ChangeSlide(delta);
    }
  };

  const launchQuiz = (q: QuestionBankItem) => {
    sendPacket(MsgSendQuestion, {
      code,
      questionText: q.questionText,
      options: q.options,
      correctOption: q.correctOption,
      durationSeconds: q.durationSeconds,
      pointMultiplier: 1,
      activityType: q.activityType
    });
  };

  const stopQuiz = () => {
    sendPacket(MsgStopQuestion, { code });
  };

  if (!code) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <Radio size={64} className="text-surface-dark/20 mb-6" />
        <h2 className="font-display text-2xl font-bold uppercase">No Active Session</h2>
        <p className="text-on-surface-variant font-mono mt-2 mb-6">Select a module from My Classes to start broadcasting.</p>
        <button onClick={() => navigate('/host/classes')} className="bg-primary text-surface px-6 py-3 border-4 border-surface-dark font-bold uppercase shadow-[4px_4px_0px_#111827] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none transition-all">Go to Classes</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500">
      
      {/* Main Stage (Left) */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-surface border-4 border-surface-dark p-6 flex justify-between items-center shadow-[6px_6px_0px_#111827]">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-3 h-3 rounded-full bg-secondary animate-pulse" />
              <span className="font-mono text-xs font-bold text-secondary uppercase tracking-widest">Live Broadcast</span>
            </div>
            <h2 className="font-display text-2xl font-bold uppercase">{classState?.className || 'Loading...'}</h2>
            <div className="font-mono text-sm font-bold bg-surface-container inline-block px-2 py-1 border-2 border-surface-dark mt-2">
              CODE: <span className="text-primary">{code}</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => sendPacket(MsgToggleVideoCall, { code, active: !classState?.isVideoCallActive })}
              className={`px-4 py-3 border-4 border-surface-dark font-bold uppercase flex items-center gap-2 shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all ${classState?.isVideoCallActive ? 'bg-primary text-surface' : 'bg-surface hover:bg-surface-container'}`}
            >
              <span className="hidden md:inline">{classState?.isVideoCallActive ? 'End Video Call' : 'Start Video Call'}</span>
            </button>
            <button 
              onClick={handleEndSession}
              className="bg-surface hover:bg-error/20 text-error px-4 py-3 border-4 border-surface-dark font-bold uppercase flex items-center gap-2 shadow-[4px_4px_0px_#111827] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <StopCircle size={20} strokeWidth={3} />
              <span className="hidden md:inline">End Session</span>
            </button>
          </div>
        </div>

        {/* Video Conference Overlay */}
        {classState?.isVideoCallActive && (
          <VideoConference 
            roomName={classState.code} 
            displayName={classState.hostName} 
            isHost={true} 
            onClose={() => sendPacket(MsgToggleVideoCall, { code, active: false })}
          />
        )}

        {/* Presentation Area */}
        <div className="flex-1 bg-surface border-4 border-surface-dark shadow-[6px_6px_0px_#111827] flex flex-col relative overflow-hidden min-h-[400px]">
          {classState?.currentQuestion ? (
            <div className="absolute inset-0 z-10 bg-primary/95 text-surface p-8 flex flex-col items-center justify-center text-center">
              <div className="font-mono font-bold uppercase tracking-widest mb-4 bg-surface-dark text-primary px-4 py-1 border-2 border-surface">
                {classState.currentQuestion.activityType === 'quiz' ? 'Multiple Choice Quiz' : 'Code Challenge'}
              </div>
              <h3 className="font-display text-4xl md:text-5xl font-bold mb-8 max-w-3xl leading-tight">{classState.currentQuestion.questionText}</h3>
              <button onClick={stopQuiz} className="bg-secondary text-surface px-8 py-4 border-4 border-surface-dark shadow-[6px_6px_0px_#111827] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] font-bold uppercase text-xl flex items-center gap-3 transition-all">
                <StopCircle size={24} /> Stop Activity
              </button>
            </div>
          ) : classState?.presentationUrl ? (
            <div className="flex-1 w-full h-full relative bg-surface-container-high border-b-4 md:border-b-0 md:border-r-4 border-surface-dark overflow-hidden min-h-[80vh] md:min-h-screen">
              {classState.presentationUrl.toLowerCase().endsWith('.pdf') ? (
                <div className="absolute inset-0 z-10 bg-surface-container">
                  <PdfSlideViewer 
                    url={classState.presentationUrl} 
                    slideNumber={classState.activeSlide} 
                  />
                </div>
              ) : (
                <iframe 
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
                    classState.presentationUrl.startsWith('http') ? classState.presentationUrl : window.location.origin + classState.presentationUrl
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
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface-container bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:20px_20px]">
               <div className="font-display text-8xl md:text-[150px] font-bold text-surface-dark/10 select-none">
                 {slideNumber}
               </div>
            </div>
          )}
          
          <div className="h-16 border-t-4 border-surface-dark bg-surface flex items-center justify-between px-6 z-20">
            <button onClick={() => changeSlide(-1)} className="font-bold uppercase text-sm hover:text-primary transition-colors">Prev Slide</button>
            <span className="font-mono font-bold bg-surface-dark text-surface px-4 py-1">SLIDE {slideNumber}</span>
            <button onClick={() => changeSlide(1)} className="font-bold uppercase text-sm hover:text-primary transition-colors">Next Slide</button>
          </div>
        </div>
      </div>

      {/* Sidebar (Right) */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        
        {/* Participants */}
        <div className="bg-surface border-4 border-surface-dark shadow-[6px_6px_0px_#111827] flex flex-col flex-1 max-h-[300px]">
          <div className="p-4 border-b-4 border-surface-dark bg-surface-container flex justify-between items-center">
            <h3 className="font-display font-bold uppercase flex items-center gap-2">
              <Users size={18} />
              Students
            </h3>
            <span className="font-mono font-bold bg-primary text-surface px-2 py-0.5">{Object.values(classState?.participants || {}).length}</span>
          </div>
          <div className="overflow-y-auto p-0 flex-1">
            {Object.values(classState?.participants || {}).length === 0 && (
              <div className="p-6 text-center text-on-surface-variant font-mono text-xs uppercase font-bold">Waiting for students...</div>
            )}
            {Object.values(classState?.participants || {}).map((p, i) => (
              <div key={i} className="px-4 py-3 border-b-2 border-surface-dark/10 flex justify-between items-center hover:bg-surface-dim">
                <span className="font-bold truncate pr-2">{p.name}</span>
                <span className="font-mono text-xs bg-surface-dark text-surface px-2 py-0.5">{p.score}pt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Command Palette / Question Bank */}
        <div className="bg-surface border-4 border-surface-dark shadow-[6px_6px_0px_#111827] flex flex-col flex-1 min-h-[300px]">
          <div className="p-4 border-b-4 border-surface-dark bg-surface-container flex justify-between items-center">
            <h3 className="font-display font-bold uppercase flex items-center gap-2">
              <PlayCircle size={18} />
              Launch Activity
            </h3>
            <button onClick={() => navigate('/host/bank')} className="text-secondary hover:text-red-700">
               <PlusCircle size={20} />
            </button>
          </div>
          <div className="overflow-y-auto p-4 space-y-3">
            {questionBank.map(q => (
              <button 
                key={q.id}
                onClick={() => launchQuiz(q)}
                disabled={!!classState?.currentQuestion}
                className="w-full text-left p-3 border-2 border-surface-dark hover:bg-primary hover:text-surface hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col gap-1"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm leading-tight group-hover:text-surface">{q.title}</span>
                  <Send size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="font-mono text-[10px] uppercase opacity-70 group-hover:opacity-100">{q.activityType} • {q.durationSeconds}s</span>
              </button>
            ))}
            {questionBank.length === 0 && (
               <div className="text-center p-4 text-on-surface-variant font-mono text-xs uppercase font-bold">No questions in bank.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
