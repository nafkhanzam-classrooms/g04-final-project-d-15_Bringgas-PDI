import * as React from 'react';
import { useState, useEffect } from 'react';
import { LogIn, User, Hash, Zap, Code, CheckCircle, Flame, Trophy } from 'lucide-react';
import Swal from 'sweetalert2';
import { useWebSocketStore, MsgJoinClass, MsgSubmitAnswer } from '../store/websocketStore';
import VideoConference from '../components/classroom/VideoConference';
import PdfSlideViewer from '../components/classroom/PdfSlideViewer';
import Whiteboard, { WhiteboardToolbar } from '../components/classroom/Whiteboard';

export default function StudentScreen() {
  const { isConnected, connect, classState, myName, sendPacket, sendWithRetry, lastQuizResult, clearLastQuizResult, error, clearError } = useWebSocketStore();
  const [localScore, setLocalScore] = useState(0);
  const [localStreak, setLocalStreak] = useState(0);
  const [showStreakAnim, setShowStreakAnim] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState(0);
  const [scorePopup, setScorePopup] = useState<{points: number, visible: boolean}>({points: 0, visible: false});
  
  const [code, setCode] = useState(() => sessionStorage.getItem('lopyta_student_code') || '');
  const [pin, setPin] = useState(() => sessionStorage.getItem('lopyta_student_pin') || '');
  const [hasJoined, setHasJoined] = useState(() => sessionStorage.getItem('lopyta_student_joined') === 'true');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [codeAnswer, setCodeAnswer] = useState('');
  const [runOutput, setRunOutput] = useState<{stdout: string, stderr: string, error?: string} | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    connect();
  }, [connect]);

  // Auto-join on page refresh
  useEffect(() => {
    if (isConnected && hasJoined && code && pin && !classState) {
      sendPacket(MsgJoinClass, { code, entryCode: pin });
    }
  }, [isConnected, hasJoined, code, pin, classState, sendPacket]);

  // Handle quiz result clear when question changes
  useEffect(() => {
    if (!classState?.currentQuestion) {
      clearLastQuizResult();
      setSelectedOption(null);
      setCodeAnswer('');
    }
  }, [classState?.currentQuestion, clearLastQuizResult]);

  // Handle WebSocket errors
  useEffect(() => {
    if (error) {
      const lowerErr = error.toLowerCase();
      const isSessionEnding = lowerErr.includes("diakhiri") || lowerErr.includes("ditendang") || lowerErr.includes("not found");
      const isJoinError = !classState || lowerErr.includes("pin") || lowerErr.includes("tidak terdaftar") || lowerErr.includes("belum dimulai") || lowerErr.includes("salah") || lowerErr.includes("tidak ditemukan");
      
      if (isSessionEnding || isJoinError) {
        Swal.fire({
          icon: 'error',
          title: isJoinError ? 'Gagal Masuk Kelas' : 'Pemberitahuan',
          text: error,
          confirmButtonColor: '#3b82f6',
        }).then(() => {
          clearError();
          sessionStorage.removeItem('lopyta_student_code');
          sessionStorage.removeItem('lopyta_student_pin');
          sessionStorage.removeItem('lopyta_student_joined');
          window.location.reload();
        });
      } else {
        // Non-critical errors: just log and clear, don't kick
        console.warn('Non-critical WS error:', error);
        clearError();
      }
    }
  }, [error, clearError, classState]);

  // Handle quiz result - update local score/streak with animations
  useEffect(() => {
    if (lastQuizResult) {
      const result = lastQuizResult as any;
      if (result.newScore !== undefined) {
        setLocalScore(result.newScore);
      }
      if (result.newStreak !== undefined) {
        setLocalStreak(result.newStreak);
        // Show streak animation for milestones (3, 5, 10, etc.)
        if (result.newStreak >= 3 && result.isCorrect) {
          setStreakMilestone(result.newStreak);
          setShowStreakAnim(true);
          setTimeout(() => setShowStreakAnim(false), 3000);
        }
      }
      if (result.pointsEarned > 0) {
        setScorePopup({points: result.pointsEarned, visible: true});
        setTimeout(() => setScorePopup(prev => ({...prev, visible: false})), 2000);
      }
    }
  }, [lastQuizResult]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || !code.trim() || !isConnected) return;
    
    // Save to session storage
    sessionStorage.setItem('lopyta_student_code', code.toUpperCase());
    sessionStorage.setItem('lopyta_student_pin', pin);
    sessionStorage.setItem('lopyta_student_joined', 'true');
    
    // Send PIN in entryCode
    // We don't send the packet here to avoid double sending, as the useEffect below will handle it
    setHasJoined(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('lopyta_student_code');
    sessionStorage.removeItem('lopyta_student_pin');
    sessionStorage.removeItem('lopyta_student_joined');
    setHasJoined(false);
    setCode('');
    setPin('');
    // You could also send a leave message or disconnect, but reloading or clearing state is enough
    window.location.reload();
  };

  const handleAnswer = (option: string) => {
    setSelectedOption(option);
    sendWithRetry(
      MsgSubmitAnswer, 
      { answer: option },
      (state) => {
        const myData = state.classState?.participants?.[state.myName || ''];
        return !!state.lastQuizResult || !!myData?.hasAnsweredCurrent;
      }
    );
  };

  const handleRunCode = async () => {
    if (!codeAnswer.trim()) return;
    setIsRunning(true);
    setRunOutput(null);
    try {
      const logs: string[] = [];
      const originalConsoleLog = console.log;
      
      console.log = (...args) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      };

      try {
        // eslint-disable-next-line no-new-func
        const result = new Function('print', codeAnswer)(console.log);
        if (result !== undefined) logs.push(String(result));
        setRunOutput({ stdout: logs.join('\n'), stderr: '' });
      } catch(e: any) {
        setRunOutput({ stdout: logs.join('\n'), stderr: e.message });
      } finally {
        console.log = originalConsoleLog;
      }
    } catch (err: any) {
      setRunOutput({ stdout: '', stderr: '', error: 'Gagal menjalankan kode: ' + err.message });
    } finally {
      setIsRunning(false);
    }
  };

  if (!hasJoined || !classState) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        {/* Abstract Backgrounds */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-100 blur-3xl mix-blend-overlay" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-100 blur-3xl mix-blend-multiply" />
        </div>

        <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-100 shadow-xl relative z-10">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl shadow-inner border border-blue-100">
              <Zap size={48} />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-center mb-2 text-slate-800">Ready to Learn?</h1>
          <p className="text-center text-sm font-semibold text-slate-500 mb-8 uppercase tracking-wide">Enter your details to join</p>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Class Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Hash size={20} />
                </div>
                <input 
                  type="text" 
                  value={code} 
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-bold font-mono text-xl uppercase tracking-widest transition-all"
                  placeholder="CODE"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Your PIN Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <User size={20} />
                </div>
                <input 
                  type="password" 
                  value={pin} 
                  onChange={e => setPin(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-bold text-lg transition-all tracking-[0.5em]"
                  placeholder="••••"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={!isConnected}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-xl uppercase tracking-wider shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:translate-y-[-2px] transition-all flex justify-center items-center gap-3 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <LogIn size={24} />
              {isConnected ? "Join Class" : "Connecting..."}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active Session View for Student
  const myData = Object.values(classState.participants || {}).find(p => p.name === myName);
  // Use local score/streak if available (updated in real-time from quiz results), fallback to classState
  const displayScore = localScore || myData?.score || 0;
  const displayStreak = localStreak || myData?.streak || 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex justify-between items-center z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner border border-blue-100">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="font-bold text-lg tracking-wide text-slate-800">{classState.className}</h2>
            <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">Host: {classState.hostName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="text-right hidden md:block">
            <span className="text-xs font-semibold text-slate-500 uppercase block mb-0.5">Student</span>
            <span className="font-bold text-lg text-slate-800">{myName || 'Student'}</span>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-2 px-4 border border-slate-200 shadow-sm relative">
            <div className="flex flex-col items-center relative">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Score</span>
              <span className="font-bold text-xl text-blue-600 transition-all duration-300">{displayScore}</span>
              {scorePopup.visible && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-blue-600 font-bold text-sm animate-bounce whitespace-nowrap">+{scorePopup.points}</span>
              )}
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className={`flex flex-col items-center transition-all duration-300 ${displayStreak >= 3 ? 'text-orange-500' : 'text-slate-400'}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest">Streak</span>
              <span className="font-bold text-xl flex items-center gap-1">
                <Flame size={16} className={displayStreak >= 3 ? 'animate-pulse text-orange-500' : ''}/> {displayStreak}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition-all"
            title="Keluar Kelas"
          >
            <LogIn size={20} className="rotate-180" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col">
        {/* Video Conference Overlay for Student */}
        {classState?.isVideoCallActive && (
          <VideoConference 
            roomName={classState.code} 
            displayName={myName || 'Student'} 
            isHost={false} 
          />
        )}
        
        {/* Leaderboard Overlay */}
        {classState?.isShowingLeaderboard && (
          <div className="absolute inset-0 z-40 bg-slate-900/60 backdrop-blur-sm p-4 md:p-8 overflow-y-auto animate-in fade-in duration-300">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl mt-8 mb-8 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex items-center justify-center gap-4">
                <Trophy size={40} className="animate-bounce" />
                <h2 className="text-3xl font-bold uppercase tracking-widest">Class Leaderboard</h2>
              </div>
              <div className="p-6">
                {classState.leaderboard && classState.leaderboard.length > 0 ? (
                  <div className="space-y-4">
                    {classState.leaderboard.slice(0, 10).map((entry, idx) => (
                      <div key={idx} className={`flex items-center gap-4 p-4 rounded-xl transition-all ${entry.name === myName ? 'bg-blue-50 border-2 border-blue-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200 hover:-translate-y-1'}`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold ${entry.name === myName ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-600 shadow-sm'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-xl truncate ${entry.name === myName ? 'text-blue-800' : 'text-slate-800'}`}>{entry.name}</h3>
                          {entry.name === myName && <span className="text-xs font-semibold uppercase opacity-80 text-blue-600">(You)</span>}
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${entry.name === myName ? 'text-blue-700' : 'text-slate-700'}`}>{entry.score} pts</div>
                          {entry.streak >= 3 && (
                            <div className="flex items-center justify-end gap-1 font-bold text-sm text-orange-500">
                              <Flame size={14} className="animate-pulse" /> {entry.streak} Streak
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="font-semibold text-slate-500 uppercase tracking-widest">No scores yet. Waiting for players...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {!classState.currentQuestion ? (
          // Slide View
          classState?.presentationUrl ? (
            <>
              <div className="w-full aspect-video relative bg-slate-100 overflow-hidden mx-auto max-w-full max-h-[80vh]">
                {/* Whiteboard Overlay */}
                {code && <Whiteboard isHost={false} code={code} />}

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
                  />
                )}
              </div>
              
              {code && <WhiteboardToolbar isHost={false} code={code} />}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
              <div className="bg-white p-12 rounded-3xl shadow-xl max-w-2xl w-full">
                <span className="font-semibold bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm uppercase inline-block mb-6">Slide {classState.activeSlide}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-800">Follow along on the main screen</h2>
                <p className="mt-6 font-semibold text-slate-500 tracking-wide">Waiting for interactive activity...</p>
              </div>
            </div>
          )
        ) : (
          // Quiz/Activity View
          <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-blue-50 relative">
            {/* Streak Milestone Animation Overlay */}
            {showStreakAnim && (
              <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                <div className="animate-bounce bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 text-white px-8 py-6 rounded-2xl shadow-2xl border-2 border-white flex flex-col items-center gap-2" style={{animation: 'pulse 0.5s ease-in-out infinite, bounce 1s ease-in-out infinite'}}>
                  <Flame size={48} className="animate-pulse" />
                  <span className="text-4xl font-bold">🔥 {streakMilestone} STREAK!</span>
                  <span className="font-semibold text-lg text-orange-100">+{Math.min((streakMilestone - 1) * 20, 100)} Bonus Points!</span>
                </div>
              </div>
            )}

             <div className="max-w-4xl w-full mx-auto bg-white rounded-3xl shadow-xl flex flex-col h-full animate-in zoom-in-95 duration-300 overflow-hidden border border-slate-100">
                 <div className="p-6 md:p-10 border-b border-slate-100 bg-slate-50 relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                   <span className="text-xs font-bold uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full inline-block mb-4">
                     {classState.currentQuestion.activityType.toUpperCase()}
                   </span>
                   <h3 className="text-3xl md:text-5xl font-bold text-slate-800 leading-tight">{classState.currentQuestion.questionText}</h3>
                </div>

                <div className="flex-1 overflow-y-auto w-full p-4 md:p-8 relative min-h-[400px]">
                  {selectedOption !== null && lastQuizResult ? (
                    <div className="absolute inset-0 z-10 bg-slate-50 flex items-center justify-center p-4">
                      <div className={`p-8 rounded-2xl flex flex-col items-center justify-center text-center animate-in zoom-in ${
                        classState.currentQuestion.activityType === 'code' ? 'bg-slate-800 text-white shadow-xl' :
                        lastQuizResult.isCorrect ? 'bg-green-500 text-white shadow-green-500/20 shadow-xl' : 'bg-red-50 text-red-600 border border-red-100'
                      }`}>
                        <div className={`mb-6 p-4 rounded-full ${
                          classState.currentQuestion.activityType === 'code' && lastQuizResult.correct !== 'Approved by Teacher' ? 'bg-slate-700 text-blue-400' :
                          lastQuizResult.isCorrect ? 'bg-white text-green-500' : 'bg-red-100'
                        }`}>
                          {classState.currentQuestion.activityType === 'code' && lastQuizResult.correct !== 'Approved by Teacher' ? <Code size={64} /> :
                           lastQuizResult.isCorrect ? <CheckCircle size={64} /> : <Zap size={64} />}
                        </div>
                        <h2 className="text-4xl font-bold uppercase mb-4">
                          {classState.currentQuestion.activityType === 'code' && lastQuizResult.correct !== 'Approved by Teacher' ? 'Code Submitted!' :
                           lastQuizResult.isCorrect ? 'Correct!' : 'Incorrect'}
                        </h2>
                        
                        {classState.currentQuestion.activityType === 'code' && lastQuizResult.correct !== 'Approved by Teacher' ? (
                          <p className="font-semibold text-xl text-slate-300">Your solution has been sent to the teacher.</p>
                        ) : (
                          <>
                            <div className="text-xl font-semibold mb-4">
                              {lastQuizResult.isCorrect ? 'You earned' : 'Correct answer was'}
                              <span className={`mx-2 text-2xl font-black ${lastQuizResult.isCorrect ? 'text-white' : 'text-slate-800'}`}>
                                {lastQuizResult.isCorrect ? `+${lastQuizResult.pointsEarned} pts` : classState.currentQuestion.correctOption}
                              </span>
                            </div>
                            <div className={`text-sm font-bold tracking-widest uppercase opacity-80 flex items-center gap-2 justify-center ${lastQuizResult.isCorrect ? 'text-green-100' : 'text-red-400'}`}>
                              <Flame size={16} /> Streak: {lastQuizResult.newStreak}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {classState.currentQuestion.activityType === 'quiz' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                          {classState.currentQuestion.options.map((opt, i) => {
                            const letter = String.fromCharCode(65 + i);
                            const isSelected = selectedOption === letter;
                            return (
                              <button
                                key={letter}
                                onClick={() => handleAnswer(letter)}
                                disabled={selectedOption !== null}
                                className={`flex items-center gap-4 p-4 md:p-6 rounded-2xl font-bold text-left transition-all ${
                                  isSelected 
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                                    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:scale-[1.02]'
                                } disabled:opacity-50`}
                              >
                                <div className={`w-12 h-12 flex items-center justify-center rounded-xl text-2xl ${isSelected ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                                  {letter}
                                </div>
                                <span className="text-xl md:text-2xl">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col h-full w-full max-w-3xl mx-auto animate-in fade-in">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-slate-700">
                              <Code size={24} />
                              <h2 className="text-xl font-bold uppercase">Write your code (JavaScript)</h2>
                            </div>
                            <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold text-sm uppercase">JS</span>
                          </div>
                          <textarea
                            value={codeAnswer}
                            onChange={(e) => setCodeAnswer(e.target.value)}
                            disabled={selectedOption !== null}
                            className="flex-1 w-full p-4 bg-slate-900 text-green-400 font-mono text-sm md:text-base rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner resize-none min-h-[200px]"
                            placeholder={`// Type your javascript solution here...`}
                            spellCheck={false}
                          />

                          {runOutput && (
                            <div className="mt-4 p-4 bg-black rounded-xl border border-slate-800 font-mono text-sm shadow-inner text-left">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-500 uppercase">Output Terminal</span>
                                <button onClick={() => setRunOutput(null)} className="text-slate-500 hover:text-white font-bold">&times;</button>
                              </div>
                              {runOutput.error && <div className="text-red-500 mb-1">{runOutput.error}</div>}
                              {runOutput.stderr && <div className="text-red-400 whitespace-pre-wrap">{runOutput.stderr}</div>}
                              {runOutput.stdout && <div className="text-green-400 whitespace-pre-wrap">{runOutput.stdout}</div>}
                              {!runOutput.stdout && !runOutput.stderr && !runOutput.error && <div className="text-slate-500 italic">Program finished with no output.</div>}
                            </div>
                          )}

                          <div className="mt-4 flex justify-between gap-4">
                            <button
                              onClick={handleRunCode}
                              disabled={selectedOption !== null || !codeAnswer.trim() || isRunning}
                              className="bg-slate-800 text-white px-6 py-4 rounded-xl font-bold uppercase tracking-wider hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 flex-1 md:flex-none"
                            >
                              {isRunning ? <span className="animate-pulse">Running...</span> : <><Zap size={18} /> Run Code</>}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOption('code_submitted');
                                sendWithRetry(
                                  MsgSubmitAnswer, 
                                  { answer: codeAnswer },
                                  (state) => !!state.lastQuizResult || !!state.classState?.participants?.[state.myName || '']?.hasAnsweredCurrent
                                );
                              }}
                              disabled={selectedOption !== null || !codeAnswer.trim()}
                              className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex-1"
                            >
                              {selectedOption !== null ? 'Submitted' : 'Submit Solution'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
