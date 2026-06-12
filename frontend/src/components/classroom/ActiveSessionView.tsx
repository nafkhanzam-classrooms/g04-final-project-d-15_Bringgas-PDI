import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, StopCircle, Radio, PlayCircle, Send, PlusCircle, Trophy } from 'lucide-react';
import Swal from 'sweetalert2';
import { useWebSocketStore, MsgCreateClass, MsgSlideChange, MsgToggleVideoCall, MsgSendQuestion, MsgStopQuestion, MsgLeaderboard } from '../../store/websocketStore';
import { useClassStore } from '../../store/classStore';
import { useAuthStore } from '../../store/authStore';
import type { QuestionBankItem } from '../../store/classStore';
import VideoConference from './VideoConference';
import PdfSlideViewer from './PdfSlideViewer';
import Whiteboard, { WhiteboardToolbar } from './Whiteboard';

export default function ActiveSessionView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { isConnected, classState, connect, disconnect, sendPacket, sendWithRetry, error, clearError } = useWebSocketStore();
  const { questionBank, fetchQuestionBank, endClass } = useClassStore();
  
  // Persist slide number in sessionStorage to recover immediately after a refresh
  const [slideNumber, setSlideNumber] = useState(() => {
    const saved = sessionStorage.getItem(`host_slide_${code}`);
    return saved ? parseInt(saved, 10) : 1;
  });
  const requestedSlide = useRef(slideNumber);

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
      
      // If we recovered a slide number > 1 from sessionStorage, sync it to the backend immediately
      if (slideNumber > 1) {
        sendWithRetry(
          MsgSlideChange, 
          { code, slide: slideNumber },
          (state) => state.classState?.activeSlide === slideNumber
        );
      }
    }
  }, [isConnected, code, classState, sendPacket, sendWithRetry, slideNumber]);

  // Sync initial slide or handle remote slide changes without snapping back
  useEffect(() => {
    if (classState?.activeSlide) {
      if (classState.activeSlide !== requestedSlide.current) {
        setSlideNumber(classState.activeSlide);
        requestedSlide.current = classState.activeSlide;
      }
    }
  }, [classState?.activeSlide]);

  // Handle WebSocket errors for Host
  useEffect(() => {
    if (error) {
      if (error.toLowerCase().includes('sesi sebelumnya ditutup')) {
        Swal.fire({
          title: 'Sesi Berpindah',
          text: 'Anda membuka sesi di tab atau perangkat lain. Harap gunakan koneksi yang baru di tab tersebut.',
          icon: 'warning',
          confirmButtonColor: '#2563eb',
          allowOutsideClick: false,
        }).then(() => {
          clearError();
          disconnect();
          navigate('/host');
        });
        return;
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Koneksi Bermasalah',
          text: error,
          confirmButtonColor: '#000000',
        });
      }
      clearError();
    }
  }, [error, clearError, navigate, logout, disconnect]);

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
    sessionStorage.setItem(`host_slide_${code}`, newSlide.toString());
    requestedSlide.current = newSlide;
    sendWithRetry(
      MsgSlideChange, 
      { code, slide: newSlide },
      (state) => state.classState?.activeSlide === newSlide
    );

    // Call Wails if available
    if (window.go?.main?.App?.ChangeSlide) {
      window.go.main.App.ChangeSlide(delta);
    }
  };

  const launchQuiz = (q: QuestionBankItem) => {
    sendWithRetry(
      MsgSendQuestion, 
      {
        code,
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        durationSeconds: q.durationSeconds,
        pointMultiplier: 1,
        activityType: q.activityType
      },
      (state) => state.classState?.currentQuestion?.questionText === q.questionText
    );
  };

  const stopQuiz = () => {
    sendWithRetry(
      MsgStopQuestion, 
      { code },
      (state) => state.classState?.currentQuestion === null
    );
  };

  if (!code) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <Radio size={64} className="text-slate-300 mb-6" />
        <h2 className="text-2xl font-bold uppercase">No Active Session</h2>
        <p className="text-slate-500 mt-2 mb-6">Select a module from My Classes to start broadcasting.</p>
        <button onClick={() => navigate('/host/classes')} className="bg-blue-600 text-white px-6 py-3 font-bold uppercase rounded-lg hover:bg-blue-700 transition-all">Go to Classes</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500">
      
      {/* Main Stage (Left) */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold text-xs text-red-500 tracking-wide uppercase">Live Broadcast</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{classState?.className || 'Loading...'}</h2>
            <div className="text-sm font-semibold text-slate-600 bg-slate-100 inline-block px-3 py-1.5 rounded-lg mt-2">
              CODE: <span className="text-blue-600 font-bold">{code}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => {
                const desiredState = !classState?.isShowingLeaderboard;
                sendWithRetry(
                  MsgLeaderboard, 
                  { code, active: desiredState },
                  (state) => state.classState?.isShowingLeaderboard === desiredState
                );
              }}
              className={`px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${classState?.isShowingLeaderboard ? 'bg-violet-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              <Trophy size={18} />
              <span className="hidden md:inline">{classState?.isShowingLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}</span>
            </button>
            <button 
              onClick={() => {
                const desiredState = !classState?.isVideoCallActive;
                sendWithRetry(
                  MsgToggleVideoCall, 
                  { code, active: desiredState },
                  (state) => state.classState?.isVideoCallActive === desiredState
                );
              }}
              className={`px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${classState?.isVideoCallActive ? 'bg-blue-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              <span className="hidden md:inline">{classState?.isVideoCallActive ? 'End Video Call' : 'Start Video Call'}</span>
            </button>
            <button 
              onClick={handleEndSession}
              className="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              <StopCircle size={18} />
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
            onClose={() => sendWithRetry(MsgToggleVideoCall, { code, active: false }, (state) => state.classState?.isVideoCallActive === false)}
          />
        )}

        {/* Presentation Area */}
        <div className="flex-1 w-full max-w-full aspect-video bg-white rounded-2xl shadow-lg border border-slate-100 flex flex-col relative overflow-hidden mx-auto max-h-[70vh]">
          {/* Whiteboard Overlay */}
          {code && <Whiteboard isHost={true} code={code} />}

          {classState?.currentQuestion ? (
            <div className="absolute inset-0 z-10 bg-blue-600/95 text-white p-8 flex flex-col items-center justify-center text-center">
              <div className="font-semibold text-sm mb-4 bg-white/20 px-4 py-1.5 rounded-full">
                {classState.currentQuestion.activityType === 'quiz' ? 'Multiple Choice Quiz' : 'Code Challenge'}
              </div>
              <h3 className="text-3xl md:text-5xl font-bold mb-8 max-w-3xl leading-tight">{classState.currentQuestion.questionText}</h3>
              <button onClick={stopQuiz} className="bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-slate-50 font-bold text-lg flex items-center gap-3 transition-all shadow-xl shadow-black/10">
                <StopCircle size={24} /> Stop Activity
              </button>
            </div>
          ) : classState?.presentationUrl ? (
            <div className="flex-1 w-full h-full relative bg-slate-50 overflow-hidden">
              {classState.presentationUrl.toLowerCase().endsWith('.pdf') ? (
                <div className="absolute inset-0 z-10">
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
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
               <div className="text-8xl md:text-[150px] font-bold text-slate-200 select-none">
                 {slideNumber}
               </div>
            </div>
          )}
        </div>

        {/* Toolbar Outside PPT */}
        {code && <WhiteboardToolbar isHost={true} code={code} />}
        
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800">Slide {slideNumber} of {classState?.totalSlides || '?'}</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => changeSlide(-1)} 
              disabled={slideNumber <= 1} 
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-300 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button 
              onClick={() => changeSlide(1)} 
              disabled={slideNumber >= (classState?.totalSlides || 1)} 
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-300 disabled:cursor-not-allowed"
            >
              Next Slide
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar (Right) */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        
        {/* Participants */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col flex-1 max-h-[300px] overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Users size={18} className="text-blue-600" />
              Students
            </h3>
            <span className="font-semibold text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{Object.values(classState?.participants || {}).length}</span>
          </div>
          <div className="overflow-y-auto p-0 flex-1">
            {Object.values(classState?.participants || {}).length === 0 && (
              <div className="p-6 text-center text-slate-500 text-sm font-semibold uppercase tracking-wide">Waiting for students...</div>
            )}
            {Object.values(classState?.participants || {}).map((p, i) => (
              <div key={i} className="px-4 py-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <span className="font-semibold text-slate-700 truncate pr-2">{p.name}</span>
                <span className="font-bold text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{p.score}pt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Command Palette / Question Bank */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[300px] overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <PlayCircle size={18} className="text-violet-600" />
              Launch Activity
            </h3>
            <button onClick={() => navigate('/host/bank')} className="text-slate-400 hover:text-blue-600 transition-colors">
               <PlusCircle size={20} />
            </button>
          </div>
          <div className="overflow-y-auto p-4 space-y-3">
            {questionBank.map(q => (
              <button 
                key={q.id}
                onClick={() => launchQuiz(q)}
                disabled={!!classState?.currentQuestion}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col gap-1"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-slate-800 leading-tight group-hover:text-blue-700">{q.title}</span>
                  <Send size={14} className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide group-hover:text-blue-600/70">{q.activityType} • {q.durationSeconds}s</span>
              </button>
            ))}
            {questionBank.length === 0 && (
               <div className="text-center p-4 text-slate-400 font-semibold text-xs uppercase">No questions in bank.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
