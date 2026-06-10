import React, { useState, useEffect } from 'react';
import { LogIn, User, Hash, Zap, Code, CheckCircle, Flame, Trophy } from 'lucide-react';
import Swal from 'sweetalert2';
import { useWebSocketStore, MsgJoinClass, MsgSubmitAnswer } from '../store/websocketStore';
import VideoConference from '../components/classroom/VideoConference';
import PdfSlideViewer from '../components/classroom/PdfSlideViewer';

export default function StudentScreen() {
  const { isConnected, connect, classState, myName, sendPacket, lastQuizResult, clearLastQuizResult, error, clearError } = useWebSocketStore();
  const [localScore, setLocalScore] = useState(0);
  const [localStreak, setLocalStreak] = useState(0);
  const [showStreakAnim, setShowStreakAnim] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState(0);
  const [scorePopup, setScorePopup] = useState<{points: number, visible: boolean}>({points: 0, visible: false});
  
  const [code, setCode] = useState(() => sessionStorage.getItem('lopyta_student_code') || '');
  const [pin, setPin] = useState(() => sessionStorage.getItem('lopyta_student_pin') || '');
  const [hasJoined, setHasJoined] = useState(() => sessionStorage.getItem('lopyta_student_joined') === 'true');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

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
    }
  }, [classState?.currentQuestion, clearLastQuizResult]);

  // Handle WebSocket errors
  useEffect(() => {
    if (error) {
      // Only show kick/end popups for session-ending errors
      const lowerErr = error.toLowerCase();
      const isSessionEnding = lowerErr.includes("diakhiri") || lowerErr.includes("ditendang") || lowerErr.includes("not found");
      
      if (isSessionEnding) {
        Swal.fire({
          icon: 'error',
          title: 'Pemberitahuan',
          text: error,
          confirmButtonColor: '#000000',
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
  }, [error, clearError]);

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
    sendPacket(MsgSubmitAnswer, { answer: option });
  };

  if (!hasJoined || !classState) {
    return (
      <div className="min-h-screen bg-primary flex flex-col justify-center items-center p-4 relative overflow-hidden">
        {/* Abstract Backgrounds */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white blur-3xl mix-blend-overlay" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-surface-dark blur-3xl mix-blend-multiply" />
        </div>

        <div className="w-full max-w-md bg-surface p-8 border-4 border-surface-dark shadow-[12px_12px_0px_#111827] relative z-10">
          <div className="flex justify-center mb-8">
            <div className="bg-surface-dark text-primary p-4 rounded-full border-4 border-surface shadow-[4px_4px_0px_#111827]">
              <Zap size={48} />
            </div>
          </div>
          
          <h1 className="font-display text-4xl font-bold text-center mb-2 uppercase text-surface-dark">Ready to Learn?</h1>
          <p className="font-mono text-center text-sm font-bold text-on-surface-variant mb-8 uppercase">Enter your details to join</p>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block font-mono text-xs font-bold uppercase mb-2">Class Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-dark">
                  <Hash size={20} />
                </div>
                <input 
                  type="text" 
                  value={code} 
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  className="w-full pl-10 pr-4 py-4 border-4 border-surface-dark bg-surface focus:outline-none focus:ring-4 focus:ring-secondary/50 font-bold font-mono text-xl uppercase tracking-widest transition-all"
                  placeholder="CODE"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block font-mono text-xs font-bold uppercase mb-2">Your PIN Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-dark">
                  <User size={20} />
                </div>
                <input 
                  type="password" 
                  value={pin} 
                  onChange={e => setPin(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 border-4 border-surface-dark bg-surface focus:outline-none focus:ring-4 focus:ring-secondary/50 font-bold text-lg transition-all tracking-[0.5em]"
                  placeholder="••••"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={!isConnected}
              className="w-full bg-secondary text-surface py-5 border-4 border-surface-dark font-display font-bold text-2xl uppercase tracking-wider shadow-[6px_6px_0px_#111827] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all flex justify-center items-center gap-3 disabled:opacity-50"
            >
              <LogIn size={28} />
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
    <div className="min-h-screen bg-surface-dim flex flex-col font-sans">
      {/* Header */}
      <header className="bg-surface border-b-4 border-surface-dark p-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary border-2 border-surface-dark flex items-center justify-center text-surface shadow-[2px_2px_0px_#111827]">
            <Zap size={20} />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl uppercase tracking-widest leading-none text-surface-dark">{classState.className}</h1>
            <p className="font-mono text-xs font-bold text-on-surface-variant uppercase mt-1">Host: {classState.hostName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="text-right hidden md:block">
            <span className="font-mono text-xs font-bold uppercase block mb-1">Student</span>
            <span className="font-display font-bold text-lg">{myName || 'Student'}</span>
          </div>
          <div className="flex items-center gap-4 bg-surface-container-high p-2 px-4 border-2 border-surface-dark shadow-[4px_4px_0px_#111827] relative">
            <div className="flex flex-col items-center relative">
              <span className="font-mono text-xs font-bold uppercase">Score</span>
              <span className="font-display font-bold text-xl transition-all duration-300">{displayScore}</span>
              {scorePopup.visible && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-primary font-bold text-sm animate-bounce whitespace-nowrap">+{scorePopup.points}</span>
              )}
            </div>
            <div className="w-0.5 h-8 bg-surface-dark/20"></div>
            <div className={`flex flex-col items-center transition-all duration-300 ${displayStreak >= 3 ? 'text-orange-500' : 'text-error'}`}>
              <span className="font-mono text-xs font-bold uppercase">Streak</span>
              <span className="font-display font-bold text-xl flex items-center gap-1">
                <Flame size={16} className={displayStreak >= 3 ? 'animate-pulse text-orange-500' : ''}/> {displayStreak}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-surface-dark text-surface p-2 border-2 border-surface-dark hover:bg-error transition-colors"
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
          <div className="absolute inset-0 z-40 bg-surface/95 backdrop-blur-sm p-4 md:p-8 overflow-y-auto animate-in fade-in duration-300">
            <div className="max-w-3xl mx-auto bg-surface border-4 border-surface-dark shadow-[12px_12px_0px_#111827] mt-8 mb-8">
              <div className="bg-primary text-surface p-6 border-b-4 border-surface-dark flex items-center justify-center gap-4">
                <Trophy size={40} className="animate-bounce" />
                <h2 className="font-display text-4xl font-bold uppercase tracking-widest">Class Leaderboard</h2>
              </div>
              <div className="p-6">
                {classState.leaderboard && classState.leaderboard.length > 0 ? (
                  <div className="space-y-4">
                    {classState.leaderboard.slice(0, 10).map((entry, idx) => (
                      <div key={idx} className={`flex items-center gap-4 p-4 border-4 border-surface-dark transition-transform hover:-translate-y-1 ${entry.name === myName ? 'bg-secondary text-surface shadow-[4px_4px_0px_#111827]' : 'bg-surface-container-high'}`}>
                        <div className={`w-12 h-12 flex items-center justify-center font-display text-2xl font-bold border-2 ${entry.name === myName ? 'border-surface bg-surface text-secondary' : 'border-surface-dark bg-surface'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-xl truncate">{entry.name}</h3>
                          {entry.name === myName && <span className="font-mono text-xs uppercase opacity-80">(You)</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-display text-2xl font-bold">{entry.score} pts</div>
                          {entry.streak >= 3 && (
                            <div className="flex items-center justify-end gap-1 font-bold text-sm text-orange-400">
                              <Flame size={14} className="animate-pulse" /> {entry.streak} Streak
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="font-mono font-bold text-on-surface-variant uppercase">No scores yet. Waiting for players...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {!classState.currentQuestion ? (
          // Slide View
          classState?.presentationUrl ? (
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
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-container bg-[linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db),linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db)] [background-size:20px_20px] [background-position:0_0,10px_10px]">
              <div className="bg-surface p-12 border-8 border-surface-dark shadow-[12px_12px_0px_#111827] max-w-2xl w-full transform -rotate-1 hover:rotate-0 transition-transform duration-300">
                <span className="font-mono font-bold bg-primary text-surface px-4 py-1 border-2 border-surface-dark text-sm uppercase absolute -top-4 -left-4 shadow-[4px_4px_0px_#111827]">Slide {classState.activeSlide}</span>
                <h2 className="font-display text-4xl md:text-5xl font-bold uppercase text-surface-dark">Follow along on the main screen</h2>
                <p className="mt-6 font-mono font-bold text-on-surface-variant">Waiting for interactive activity...</p>
              </div>
            </div>
          )
        ) : (
          // Quiz/Activity View
          <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-primary relative">
            {/* Streak Milestone Animation Overlay */}
            {showStreakAnim && (
              <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                <div className="animate-bounce bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-white flex flex-col items-center gap-2" style={{animation: 'pulse 0.5s ease-in-out infinite, bounce 1s ease-in-out infinite'}}>
                  <Flame size={48} className="animate-pulse" />
                  <span className="font-display text-4xl font-bold">🔥 {streakMilestone} STREAK!</span>
                  <span className="font-mono text-lg font-bold">+{Math.min((streakMilestone - 1) * 20, 100)} Bonus Points!</span>
                </div>
              </div>
            )}

             <div className="max-w-4xl w-full mx-auto bg-surface border-4 border-surface-dark shadow-[8px_8px_0px_#111827] flex flex-col h-full animate-in zoom-in-95 duration-300">
                <div className="p-6 md:p-8 border-b-4 border-surface-dark bg-surface-container-high relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-secondary opacity-10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                   <span className="font-mono text-sm font-bold bg-secondary text-surface px-3 py-1 border-2 border-surface-dark inline-block mb-4 shadow-[2px_2px_0px_#111827]">
                     {classState.currentQuestion.activityType.toUpperCase()}
                   </span>
                   <h3 className="font-display text-3xl md:text-5xl font-bold leading-tight">{classState.currentQuestion.questionText}</h3>
                </div>

                <div className="p-6 md:p-8 flex-1 flex flex-col justify-center">
                  {lastQuizResult ? (
                    <div className={`p-8 border-4 border-surface-dark flex flex-col items-center justify-center text-center animate-in zoom-in ${lastQuizResult.isCorrect ? 'bg-primary text-surface' : 'bg-secondary text-surface'}`}>
                       <div className="mb-6 bg-surface text-surface-dark p-4 rounded-full border-4 border-surface-dark shadow-[4px_4px_0px_#111827]">
                         {lastQuizResult.isCorrect ? <CheckCircle size={64} /> : <Zap size={64} />}
                       </div>
                       <h2 className="font-display text-5xl font-bold uppercase mb-4">{lastQuizResult.isCorrect ? 'Correct!' : 'Incorrect'}</h2>
                       <p className="font-mono text-xl font-bold">You earned +{lastQuizResult.pointsEarned} pts</p>
                       {lastQuizResult.isCorrect && displayStreak >= 3 && (
                         <div className="mt-4 flex items-center gap-2 bg-orange-500/20 px-4 py-2 border-2 border-orange-400 rounded-lg">
                           <Flame size={20} className="text-orange-400" />
                           <span className="font-bold text-orange-300">{displayStreak} Streak! +{Math.min((displayStreak - 1) * 20, 100)} Bonus</span>
                         </div>
                       )}
                       {!lastQuizResult.isCorrect && (
                         <>
                           <p className="mt-4 font-bold bg-surface-dark text-surface px-4 py-2 border-2 border-surface">Correct answer: {lastQuizResult.correct}</p>
                           {displayStreak === 0 && localStreak > 0 && (
                             <p className="mt-2 font-mono text-sm opacity-75">Streak lost! 😢</p>
                           )}
                         </>
                       )}
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
                                className={`flex items-center gap-4 p-4 md:p-6 border-4 font-bold text-left transition-all ${
                                  isSelected 
                                    ? 'bg-secondary border-surface-dark text-surface translate-x-[4px] translate-y-[4px] shadow-none' 
                                    : 'bg-surface border-surface-dark hover:bg-surface-dim shadow-[4px_4px_0px_#111827] hover:shadow-[2px_2px_0px_#111827] hover:translate-x-[2px] hover:translate-y-[2px]'
                                } disabled:cursor-not-allowed`}
                              >
                                <div className={`w-12 h-12 flex items-center justify-center border-2 border-surface-dark font-display text-2xl ${isSelected ? 'bg-surface text-secondary' : 'bg-surface-container'}`}>
                                  {letter}
                                </div>
                                <span className="text-xl md:text-2xl">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center py-12">
                          <Code size={64} className="text-surface-dark/20 mb-6" />
                          <h2 className="font-display text-2xl font-bold uppercase mb-4">Code Sandbox Mode</h2>
                          <p className="font-mono font-bold text-on-surface-variant">Code submission via UI coming soon.</p>
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
