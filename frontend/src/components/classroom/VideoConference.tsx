import { useState } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface VideoConferenceProps {
  roomName: string;
  displayName: string;
  onClose?: () => void;
  isHost?: boolean;
}

export default function VideoConference({ roomName, displayName, onClose, isHost = false }: VideoConferenceProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Generate a safe room name
  const safeRoomName = `Bringgas_Lopyta_Class_${roomName.replace(/[^a-zA-Z0-9]/g, '_')}`;

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-surface-dark text-surface p-4 border-4 border-primary shadow-[8px_8px_0px_#111827] flex items-center gap-4 cursor-pointer hover:bg-primary transition-colors"
           onClick={() => setIsMinimized(false)}>
        <div className="w-3 h-3 rounded-full bg-error animate-pulse"></div>
        <span className="font-display font-bold uppercase tracking-widest">Video Call Active</span>
        <Maximize2 size={20} />
      </div>
    );
  }

  const containerClasses = isMaximized 
    ? "fixed inset-4 z-50 bg-surface border-4 border-surface-dark shadow-[16px_16px_0px_#111827] flex flex-col"
    : "fixed bottom-6 right-6 z-50 w-[400px] md:w-[600px] h-[400px] md:h-[450px] bg-surface border-4 border-surface-dark shadow-[12px_12px_0px_#111827] flex flex-col";

  return (
    <div className={containerClasses}>
      {/* Header / Draggable handle area */}
      <div className="bg-surface-dark text-surface p-2 flex justify-between items-center cursor-move">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-error animate-pulse"></div>
          <span className="font-mono text-xs font-bold uppercase tracking-widest">Live Class</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-surface/20 transition-colors"
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
          <button 
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 hover:bg-surface/20 transition-colors hidden md:block"
            title="Maximize"
          >
            <Maximize2 size={16} />
          </button>
          {isHost && onClose && (
            <button 
              onClick={onClose}
              className="p-1 hover:bg-error transition-colors ml-2"
              title="End Video Call"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Jitsi Iframe Container */}
      <div className="flex-1 bg-black relative">
        <JitsiMeeting
          domain="jitsi.riot.im"
          roomName={safeRoomName}
          configOverwrite={{
            startWithAudioMuted: !isHost,
            startWithVideoMuted: !isHost,
            disableModeratorIndicator: true,
            startScreenSharing: false,
            enableEmailInStats: false,
          }}
          interfaceConfigOverwrite={{
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            SHOW_CHROME_EXTENSION_BANNER: false,
          }}
          userInfo={{
            displayName: displayName,
            email: `${displayName.replace(/[^a-zA-Z0-9]/g, '')}@lopyta.org`
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = '100%';
            iframeRef.style.width = '100%';
            iframeRef.style.border = '0';
          }}
        />
      </div>
    </div>
  );
}
