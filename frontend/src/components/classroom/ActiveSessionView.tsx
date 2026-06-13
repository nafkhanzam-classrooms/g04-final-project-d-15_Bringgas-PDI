import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, StopCircle, Radio, PlayCircle, Send, PlusCircle, Trophy, Folder, ChevronDown, ChevronUp, Code, ThumbsUp, Monitor, Maximize, Minimize } from 'lucide-react';
import Swal from 'sweetalert2';
import { useWebSocketStore, MsgCreateClass, MsgSlideChange, MsgToggleVideoCall, MsgSendQuestion, MsgStopQuestion, MsgLeaderboard, MsgGradeCode } from '../../store/websocketStore';
import { useClassStore } from '../../store/classStore';
import { useAuthStore } from '../../store/authStore';
import type { QuestionBankItem } from '../../store/classStore';
import VideoConference from './VideoConference';
import PdfSlideViewer from './PdfSlideViewer';
import Whiteboard, { WhiteboardToolbar } from './Whiteboard';

const resolvePresentationUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/uploads/')) {
    const idx = url.indexOf('/uploads/');
    return window.location.origin + url.substring(idx);
  }
  return url;
};


export default function ActiveSessionView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { isConnected, classState, connect, disconnect, sendPacket, sendWithRetry, error, clearError } = useWebSocketStore();
  const { questionBank, questionSets, fetchQuestionBank, fetchQuestionSets, endClass } = useClassStore();
  const [expandedFolderId, setExpandedFolderId] = useState<number | null>(null);
  
  // Persist slide number in sessionStorage to recover immediately after a refresh
  const [slideNumber, setSlideNumber] = useState(() => {
    const saved = sessionStorage.getItem(`host_slide_${code}`);
    return saved ? parseInt(saved, 10) : 1;
  });
  const requestedSlide = useRef(slideNumber);
  const [rosterCount, setRosterCount] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Redirect to active session if we visited `/host/session` but a session is active
  useEffect(() => {
    if (!code) {
      if (classState?.code) {
        navigate(`/host/session/${classState.code}`);
      } else {
        const activeClass = useClassStore.getState().classes.find(c => c.isActive);
        if (activeClass) {
          navigate(`/host/session/${activeClass.code}`);
        }
      }
    }
  }, [code, classState, navigate]);

  // Fetch class roster count
  useEffect(() => {
    if (code) {
      fetch(`/api/teacher/classes/${code}/students`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setRosterCount(data.length);
          }
        })
        .catch(err => console.error("Error fetching roster:", err));
    }
  }, [code]);

  const changeSlideRef = useRef<any>(null);
  useEffect(() => {
    changeSlideRef.current = changeSlide;
  });

  const presentationAreaRef = useRef<HTMLDivElement>(null);
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState(false);

  const togglePresentationFullscreen = () => {
    if (!presentationAreaRef.current) return;
    if (!document.fullscreenElement) {
      presentationAreaRef.current.requestFullscreen().then(() => {
        setIsPresentationFullscreen(true);
      }).catch(err => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsPresentationFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsPresentationFullscreen(document.fullscreenElement === presentationAreaRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Listen to keyboard arrow keys for slide navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        changeSlideRef.current(-1);
      } else if (e.key === 'ArrowRight') {
        changeSlideRef.current(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // BroadcastChannel for projector
  useEffect(() => {
    if (code) {
      channelRef.current = new BroadcastChannel(`lopyta_projector_${code}`);
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'REQUEST_INITIAL_STATE' && classState) {
          channelRef.current?.postMessage({ type: 'STATE_UPDATE', classState });
        }
      };
      
      channelRef.current.addEventListener('message', handleMessage);
      
      return () => {
        channelRef.current?.removeEventListener('message', handleMessage);
        channelRef.current?.close();
      };
    }
  }, [code, classState]);

  // Broadcast updates
  useEffect(() => {
    if (classState && channelRef.current) {
      channelRef.current.postMessage({ type: 'STATE_UPDATE', classState, rosterCount });
    }
  }, [classState, rosterCount]);

  useEffect(() => {
    fetchQuestionSets();
    fetchQuestionBank();
    if (!isConnected) {
      connect();
    }
    
    // Refresh question bank when returning to this tab
    const handleFocus = () => {
      fetchQuestionSets();
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

  const ws = useWebSocketStore(state => state.ws);
  const [lastConnectedWs, setLastConnectedWs] = useState<WebSocket | null>(null);

  // If there's a code in URL, we should tell the backend we are the host for this class on every connect/reconnect
  useEffect(() => {
    if (isConnected && code && ws && ws !== lastConnectedWs) {
      setLastConnectedWs(ws);
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
    
    Swal.fire({
      title: 'Akhiri Sesi Kelas?',
      text: 'Seluruh data aktivitas akan disimpan dan semua siswa akan otomatis keluar dari kelas.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Akhiri Kelas',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await endClass(code);
        if (ok) {
          disconnect();
          Swal.fire({
            title: 'Sesi Kelas Berhasil Diakhiri',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
          }).then(() => {
            navigate('/host/classes');
          });
        } else {
          Swal.fire({
            title: 'Gagal',
            text: 'Gagal mengakhiri kelas. Silakan coba lagi.',
            icon: 'error',
            confirmButtonColor: '#3b82f6'
          });
        }
      }
    });
  };

  const handleGradeCode = (studentName: string) => {
    if (!classState) return;
    sendWithRetry(MsgGradeCode, {
      code: classState.code,
      studentName: studentName,
      points: 100 * (classState.pointMultiplier || 1)
    }, () => true);
    
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Excellent! +100 points to ${studentName}`,
      showConfirmButton: false,
      timer: 2000
    });
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
              onClick={() => {
                const popup = window.open(`/host/projector/${code}`, 'projector', 'width=1280,height=720,menubar=no,status=no,toolbar=no,location=no,resizable=yes');
                if (popup) {
                  popup.addEventListener('load', () => {
                    popup.document.documentElement.requestFullscreen().catch(err => {
                      console.log("Auto-fullscreen on load blocked:", err);
                    });
                  });
                }
              }}
              className="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <Monitor size={18} />
              <span className="hidden md:inline">Projector View</span>
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
        <div 
          ref={presentationAreaRef} 
          className={`flex-1 w-full flex flex-col relative overflow-hidden mx-auto bg-white transition-all ${
            isPresentationFullscreen 
              ? 'w-screen h-screen max-w-none max-h-none rounded-none border-0' 
              : 'max-w-full aspect-video rounded-2xl shadow-lg border border-slate-100 max-h-[70vh]'
          }`}
        >
          {/* Floating Fullscreen button for teacher in-place fullscreen */}
          <button
            onClick={togglePresentationFullscreen}
            className="absolute bottom-6 right-6 z-50 bg-white/95 hover:bg-slate-50 text-slate-800 border border-slate-200 p-3.5 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            title={isPresentationFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isPresentationFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>



          {/* Whiteboard Overlay for Non-Presentations is handled by IframeSlideViewer */}

          {classState?.currentQuestion ? (
            <div className="absolute inset-0 z-20 bg-slate-50 flex flex-col items-center justify-start text-center p-8 overflow-y-auto w-full h-full">
              <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-5xl border border-slate-100 flex flex-col items-center relative">
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40 overflow-hidden rounded-3xl">
                  <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-100 blur-3xl mix-blend-overlay"></div>
                </div>
                
                <div className="font-bold text-sm mb-6 bg-blue-100 text-blue-700 px-6 py-2 rounded-full uppercase tracking-widest shadow-sm z-10">
                  {classState.currentQuestion.activityType === 'quiz' ? 'Multiple Choice Quiz' : 'Code Challenge'}
                </div>
                <h3 className="text-3xl md:text-5xl font-extrabold text-slate-800 mb-8 max-w-4xl leading-tight z-10">{classState.currentQuestion.questionText}</h3>
                
                {classState.currentQuestion.activityType === 'code' && classState.currentQuestion.answers && Object.keys(classState.currentQuestion.answers).length > 0 && (
                  <div className="w-full mt-6 text-left z-10 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h4 className="font-bold text-lg text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                      <Code size={20} className="text-blue-600" /> Submitted Solutions ({Object.keys(classState.currentQuestion.answers).length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(classState.currentQuestion.answers).map(([student, code], i) => (
                        <div key={i} className="bg-slate-900 rounded-xl p-4 shadow-md border border-slate-800 flex flex-col max-h-[250px]">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-blue-400 font-bold text-sm uppercase tracking-wider">{student}</span>
                             <div className="flex items-center gap-3">
                               <button 
                                 onClick={() => handleGradeCode(student)}
                                 className="text-slate-400 hover:text-green-400 hover:bg-green-400/20 p-1.5 rounded-lg transition-all flex items-center gap-1"
                                 title="Beri Nilai Benar"
                               >
                                 <ThumbsUp size={16} /> <span className="text-[10px] font-bold">APPROVE</span>
                               </button>
                               <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                             </div>
                          </div>
                          <pre className="text-green-300 font-mono text-xs overflow-y-auto flex-1 p-2 bg-black/50 rounded-lg whitespace-pre-wrap">{code}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {classState.currentQuestion.activityType === 'code' && (!classState.currentQuestion.answers || Object.keys(classState.currentQuestion.answers).length === 0) && (
                   <div className="w-full mt-6 text-center z-10 bg-slate-50 p-12 rounded-2xl border border-slate-200 border-dashed">
                      <p className="text-slate-500 font-semibold text-lg uppercase tracking-wider animate-pulse">Waiting for submissions...</p>
                   </div>
                )}
                
                <button onClick={stopQuiz} className="mt-8 z-10 bg-red-50 text-red-600 border border-red-200 px-10 py-4 rounded-2xl hover:bg-red-600 hover:text-white font-bold text-lg flex items-center gap-3 transition-all shadow-md">
                  <StopCircle size={24} /> Stop Activity
                </button>
              </div>
            </div>
          ) : classState?.presentationUrl ? (
            <div className="flex-1 w-full h-full relative bg-slate-50 overflow-hidden">
              <div className="absolute inset-0 z-10">
                <PdfSlideViewer 
                  url={resolvePresentationUrl(classState.presentationUrl)} 
                  slideNumber={classState.activeSlide} 
                />
              </div>
              {/* Fullscreen Whiteboard Overlay */}
              {code && (
                <div className="absolute inset-0 z-20">
                  <Whiteboard isHost={true} code={code} />
                </div>
              )}
              
              {/* Floating Toolbar */}
              {code && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
                  <WhiteboardToolbar isHost={true} code={code} />
                </div>
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
            <span className="font-semibold text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
              {Object.values(classState?.participants || {}).filter(p => p.active).length} / {rosterCount}
            </span>
          </div>
          <div className="overflow-y-auto p-0 flex-1">
            {Object.values(classState?.participants || {}).length === 0 && (
              <div className="p-6 text-center text-slate-500 text-sm font-semibold uppercase tracking-wide">Waiting for students...</div>
            )}
            {Object.values(classState?.participants || {}).map((p, i) => (
              <div key={i} className="px-4 py-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${p.active ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className={`font-semibold text-slate-700 truncate ${!p.active ? 'text-slate-400' : ''}`}>{p.name}</span>
                </div>
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
            {questionSets.map(set => {
              const itemsInSet = questionBank.filter(q => q.set_id === set.id);
              const isExpanded = expandedFolderId === set.id;
              
              return (
                <div key={set.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => setExpandedFolderId(isExpanded ? null : set.id)}
                    className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 flex justify-between items-center transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Folder size={16} className="text-blue-600" />
                      <span className="font-bold text-sm text-slate-800 truncate pr-2 max-w-[140px]">{set.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{itemsInSet.length}</span>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="p-2 space-y-2 bg-white border-t border-slate-100">
                      {itemsInSet.length === 0 ? (
                        <div className="text-center p-3 text-slate-400 font-semibold text-xs uppercase">Empty Folder</div>
                      ) : (
                        itemsInSet.map(q => (
                          <button 
                            key={q.id}
                            onClick={() => launchQuiz(q)}
                            disabled={!!classState?.currentQuestion}
                            className="w-full text-left p-3 rounded-lg border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col gap-1"
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-sm text-slate-800 leading-tight group-hover:text-blue-700">{q.title}</span>
                              <Send size={14} className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide group-hover:text-blue-600/70">{q.activityType} • {q.durationSeconds}s</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {questionSets.length === 0 && (
               <div className="text-center p-4 text-slate-400 font-semibold text-xs uppercase">No folders available.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
