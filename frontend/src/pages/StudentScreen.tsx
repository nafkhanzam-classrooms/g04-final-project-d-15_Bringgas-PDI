import React, { useState, useEffect } from 'react';
import { LogIn, User, Hash, Zap, Code, CheckCircle, Flame } from 'lucide-react';
import { useWebSocketStore, MsgJoinClass, MsgSubmitAnswer } from '../store/websocketStore';

export default function StudentScreen() {
  const { isConnected, connect, classState, myName, sendPacket, lastQuizResult, clearLastQuizResult } = useWebSocketStore();
  
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => {
    connect();
  }, [connect]);

  // Handle quiz result clear when question changes
  useEffect(() => {
    if (!classState?.currentQuestion) {
      clearLastQuizResult();
      setSelectedOption(null);
    }
  }, [classState?.currentQuestion, clearLastQuizResult]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || !code.trim() || !isConnected) return;
    
    // Send PIN in entryCode
    sendPacket(MsgJoinClass, { code, entryCode: pin });
    setHasJoined(true);
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
  const myData = classState.participants?.find(p => p.name === myName);

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col font-sans">
      {/* Header */}
      <header className="bg-surface border-b-4 border-surface-dark p-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary border-2 border-surface-dark flex items-center justify-center text-surface shadow-[2px_2px_0px_#111827]">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="font-display font-bold text-xl leading-tight uppercase truncate max-w-[150px] md:max-w-xs">{classState.className}</h2>
            <p className="font-mono text-[10px] font-bold text-on-surface-variant uppercase">HOST: {classState.hostName}</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">Score</span>
            <span className="font-display font-bold text-xl">{myData?.score || 0}</span>
          </div>
          <div className="flex flex-col items-end text-secondary">
            <span className="font-mono text-xs font-bold uppercase">Streak</span>
            <span className="font-display font-bold text-xl flex items-center gap-1"><Flame size={16}/> {myData?.streak || 0}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col">
        {!classState.currentQuestion ? (
          // Slide View
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-container bg-[linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db),linear-gradient(45deg,#d1d5db_25%,transparent_25%,transparent_75%,#d1d5db_75%,#d1d5db)] [background-size:20px_20px] [background-position:0_0,10px_10px]">
            <div className="bg-surface p-12 border-8 border-surface-dark shadow-[12px_12px_0px_#111827] max-w-2xl w-full transform -rotate-1 hover:rotate-0 transition-transform duration-300">
              <span className="font-mono font-bold bg-primary text-surface px-4 py-1 border-2 border-surface-dark text-sm uppercase absolute -top-4 -left-4 shadow-[4px_4px_0px_#111827]">Slide {classState.activeSlide}</span>
              <h2 className="font-display text-4xl md:text-5xl font-bold uppercase text-surface-dark">Follow along on the main screen</h2>
              <p className="mt-6 font-mono font-bold text-on-surface-variant">Waiting for interactive activity...</p>
            </div>
          </div>
        ) : (
          // Quiz/Activity View
          <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-primary">
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
                       {!lastQuizResult.isCorrect && (
                         <p className="mt-4 font-bold bg-surface-dark text-surface px-4 py-2 border-2 border-surface">Correct answer: {lastQuizResult.correct}</p>
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
