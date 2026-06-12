import { create } from 'zustand';

// Protocol msg types from Go backend
export const MsgCreateClass = 0x0001;
export const MsgJoinClass = 0x0002;
export const MsgClassState = 0x0003;
export const MsgJoinSuccess = 0x0008; // Custom for our PIN login
export const MsgSendQuestion = 0x0010;
export const MsgSubmitAnswer = 0x0011;
export const MsgQuizResult = 0x0012;
export const MsgStopQuestion = 0x0013;
export const MsgSlideChange = 0x0020;
export const MsgLeaderboard = 0x0030;
export const MsgToggleVideoCall = 0x0040;
export const MsgWhiteboardDraw = 0x0050;
export const MsgWhiteboardClear = 0x0051;
export const MsgWhiteboardPermit = 0x0052;
export const MsgHeartbeat = 0x00F0;
export const MsgError = 0x00FF;

const MAGIC_NUMBER = 0xCAFE;
const VERSION = 0x01;

function crc32(buf: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ (-1)) >>> 0;
}

export interface Participant {
  name: string;
  score: number;
  streak: number;
  joinedAt: string;
  hasAnsweredCurrent: boolean;
}

export interface Question {
  id: number;
  title: string;
  questionText: string;
  options: string[];
  correctOption: string;
  activityType: 'quiz' | 'poll' | 'essay' | 'code' | 'yesno';
  durationSeconds: number;
  pointMultiplier: number;
}

export interface WhiteboardLine {
  points: number[];
  color: string;
  size: number;
  tool: string;
  student?: string;
}

export interface ClassState {
  code: string;
  className: string;
  hostName: string;
  isActive: boolean;
  activeSlide: number;
  totalSlides: number;
  presentationUrl: string;
  isVideoCallActive: boolean;
  isShowingLeaderboard: boolean;
  whiteboardPermit: string;
  whiteboardLines: WhiteboardLine[];
  pointMultiplier: number;
  currentQuestion: Question | null;
  participants: Record<string, Participant>;
  leaderboard: { name: string, score: number, streak: number, rank: number, change: number, lastRank: number }[];
}

interface PendingAction {
  payload: any;
  checkAck: (state: WebSocketState) => boolean;
  intervalId: number;
}

interface WebSocketState {
  ws: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  classState: ClassState | null;
  myName: string | null;
  lastQuizResult: { isCorrect: boolean; pointsEarned: number; correct: string; newScore?: number; newStreak?: number } | null;
  pendingActions: Record<number, PendingAction>;
  
  connect: () => void;
  disconnect: () => void;
  sendPacket: (msgType: number, payload: any) => void;
  sendWithRetry: (msgType: number, payload: any, checkAck: (state: WebSocketState) => boolean) => void;
  cancelRetry: (msgType: number) => void;
  clearError: () => void;
  clearLastQuizResult: () => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => {
  let reconnectTimeout: number | null = null;

  return {
    ws: null,
    isConnected: false,
    isConnecting: false,
    error: null,
    classState: null,
    myName: null,
    lastQuizResult: null,
    pendingActions: {},

    connect: () => {
      const { ws, isConnecting, isConnected } = get();
      if (ws || isConnecting || isConnected) return;

      set({ isConnecting: true, error: null });

      // Determine ws protocol based on location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        set({ ws: socket, isConnected: true, isConnecting: false, error: null });
        console.log('WebSocket Connected');

        // Start Heartbeat (timeout protection)
        const intervalId = window.setInterval(() => {
          const state = get();
          if (state.isConnected && state.ws) {
            state.sendPacket(MsgHeartbeat, { status: "ping" });
          }
        }, 5000) as unknown as number;

        set((state) => ({
          pendingActions: {
            ...state.pendingActions,
            [MsgHeartbeat]: { payload: {}, checkAck: () => true, intervalId }
          }
        }));
      };

      socket.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        
        const data = new Uint8Array(event.data);
        if (data.length < 17) return; // Header 13 + Checksum 4
        
        const view = new DataView(data.buffer);
        const magic = view.getUint16(0, false);
        if (magic !== MAGIC_NUMBER) return;
        
        const msgType = view.getUint16(3, false);
        const payloadLen = view.getUint32(9, false);
        
        const payloadBytes = data.slice(13, 13 + payloadLen);
        const payloadStr = new TextDecoder().decode(payloadBytes);
        
        try {
          let payload: any = null;
          if (payloadStr.trim().length > 0) {
            try {
              payload = JSON.parse(payloadStr);
            } catch (jsonErr) {
              console.warn('JSON parse error for msgType', msgType, jsonErr);
            }
          }
          
          if (msgType === MsgClassState) {
            set({ classState: payload });
          } else if (msgType === MsgWhiteboardDraw) {
            const line = payload;
            set((state) => {
              if (state.classState) {
                return {
                  classState: {
                    ...state.classState,
                    whiteboardLines: [...(state.classState.whiteboardLines || []), line]
                  }
                };
              }
              return state;
            });
          } else if (msgType === MsgWhiteboardClear) {
            set((state) => {
              if (state.classState) {
                return {
                  classState: {
                    ...state.classState,
                    whiteboardLines: []
                  }
                };
              }
              return state;
            });
          } else if (msgType === MsgJoinSuccess) {
            set({ myName: payload.name });
          } else if (msgType === MsgQuizResult) {
            set({ lastQuizResult: payload });
          } else if (msgType === MsgError) {
            set({ error: payload.message || 'Unknown server error' });
          }
        } catch (err) {
          console.error('Failed to parse WS message', err);
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket Disconnected', event.code);
        
        // Clear all intervals
        const { pendingActions } = get();
        Object.values(pendingActions).forEach(action => window.clearInterval(action.intervalId));

        set({ ws: null, isConnected: false, isConnecting: false, pendingActions: {} });
        
        // Auto reconnect logic could go here
        if (event.code !== 1000) { // Not a clean close
          set({ error: 'Connection lost. Reconnecting...' });
          reconnectTimeout = window.setTimeout(() => {
            get().connect();
          }, 3000);
        } else {
           set({ classState: null });
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket Error', error);
        set({ error: 'WebSocket connection error' });
      };
    },

    disconnect: () => {
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      const { ws, pendingActions } = get();
      Object.values(pendingActions).forEach(action => window.clearInterval(action.intervalId));
      if (ws) {
        ws.close(1000, 'User triggered disconnect');
      }
      set({ ws: null, isConnected: false, isConnecting: false, classState: null, error: null, pendingActions: {} });
    },

    sendPacket: (msgType: number, payload: any) => {
      const { ws, isConnected } = get();
      if (!ws || !isConnected) {
        console.warn('Cannot send, not connected');
        set({ error: 'Cannot send message. Disconnected from server.' });
        return;
      }
      
      const payloadStr = JSON.stringify(payload);
      const payloadBytes = new TextEncoder().encode(payloadStr);
      
      const buffer = new Uint8Array(13 + payloadBytes.length + 4);
      const view = new DataView(buffer.buffer);
      
      view.setUint16(0, MAGIC_NUMBER, false);
      view.setUint8(2, VERSION);
      view.setUint16(3, msgType, false);
      
      const seq = Math.floor(Math.random() * 1000000);
      view.setUint32(5, seq, false);
      view.setUint32(9, payloadBytes.length, false);
      
      buffer.set(payloadBytes, 13);
      
      const checksum = crc32(payloadBytes);
      view.setUint32(13 + payloadBytes.length, checksum, false);
      
      ws.send(buffer.buffer);
    },
    
    sendWithRetry: (msgType: number, payload: any, checkAck: (state: WebSocketState) => boolean) => {
      const { sendPacket, cancelRetry } = get();
      
      cancelRetry(msgType);
      
      sendPacket(msgType, payload);
      
      const intervalId = window.setInterval(() => {
        const state = get();
        if (checkAck(state)) {
          state.cancelRetry(msgType);
        } else if (state.isConnected && state.ws) {
          state.sendPacket(msgType, payload);
        }
      }, 2000);
      
      set(state => ({
        pendingActions: {
          ...state.pendingActions,
          [msgType]: { payload, checkAck, intervalId }
        }
      }));
    },

    cancelRetry: (msgType: number) => {
      const { pendingActions } = get();
      if (pendingActions[msgType]) {
        window.clearInterval(pendingActions[msgType].intervalId);
        const newActions = { ...pendingActions };
        delete newActions[msgType];
        set({ pendingActions: newActions });
      }
    },

    clearError: () => set({ error: null }),
    clearLastQuizResult: () => set({ lastQuizResult: null }),
  };
});
