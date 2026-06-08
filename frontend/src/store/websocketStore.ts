import { create } from 'zustand';

// Protocol msg types from Go backend
export const MsgJoinClass = 0x01;
export const MsgClassState = 0x02;
export const MsgSubmitAnswer = 0x03;
export const MsgQuizResult = 0x04;
export const MsgCreateClass = 0x05;
export const MsgSlideChange = 0x06;
export const MsgError = 0x0F;

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
  durationSeconds: number;
  activityType: string;
}

export interface ClassState {
  code: string;
  className: string;
  hostName: string;
  isActive: boolean;
  participants: Participant[];
  currentQuestion: Question | null;
  questionStartTime: string;
  activeSlide: number;
}

interface WebSocketState {
  ws: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  classState: ClassState | null;
  lastQuizResult: { isCorrect: boolean; pointsEarned: number; correct: string } | null;
  
  connect: () => void;
  disconnect: () => void;
  sendPacket: (msgType: number, payload: any) => void;
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
    lastQuizResult: null,

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
      };

      socket.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        
        const data = new Uint8Array(event.data);
        if (data.length < 5) return;
        
        const msgType = data[0];
        // data[1] to data[4] is sequence
        
        const payloadBytes = data.slice(5);
        const payloadStr = new TextDecoder().decode(payloadBytes);
        
        try {
          const payload = JSON.parse(payloadStr);
          
          if (msgType === MsgClassState) {
            set({ classState: payload });
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
        set({ ws: null, isConnected: false, isConnecting: false });
        
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
      const { ws } = get();
      if (ws) {
        ws.close(1000, 'User triggered disconnect');
      }
      set({ ws: null, isConnected: false, isConnecting: false, classState: null, error: null });
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
      
      const buffer = new Uint8Array(5 + payloadBytes.length);
      buffer[0] = msgType;
      
      // We can just use a dummy sequence number for client -> server
      const seq = Math.floor(Math.random() * 1000000);
      buffer[1] = (seq >> 24) & 0xFF;
      buffer[2] = (seq >> 16) & 0xFF;
      buffer[3] = (seq >> 8) & 0xFF;
      buffer[4] = seq & 0xFF;
      
      buffer.set(payloadBytes, 5);
      
      ws.send(buffer.buffer);
    },
    
    clearError: () => set({ error: null }),
    clearLastQuizResult: () => set({ lastQuizResult: null }),
  };
});
