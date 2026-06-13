import React, { useRef, useState, useEffect } from 'react';
import { create } from 'zustand';
import { useWebSocketStore, MsgWhiteboardDraw, MsgWhiteboardClear, MsgWhiteboardPermit } from '../../store/websocketStore';
import { Trash2, Edit3, Eraser, Unlock, Lock } from 'lucide-react';

interface WhiteboardProps {
  isHost: boolean;
  code: string;
  lines?: any[];
  width?: number;
  height?: number;
}

export const useWhiteboardToolStore = create<{
  tool: 'pen' | 'eraser';
  setTool: (t: 'pen' | 'eraser') => void;
  color: string;
  setColor: (c: string) => void;
  isDrawingMode: boolean;
  setIsDrawingMode: (v: boolean) => void;
}>((set) => ({
  tool: 'pen',
  setTool: (tool) => set({ tool }),
  color: '#ef4444',
  setColor: (color) => set({ color }),
  isDrawingMode: false,
  setIsDrawingMode: (isDrawingMode) => set({ isDrawingMode }),
}));

export default function Whiteboard({ isHost, code, lines, width, height }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState<number[]>([]);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  
  const { classState, sendPacket } = useWebSocketStore();
  const whiteboardLines = lines !== undefined ? lines : (classState?.whiteboardLines || []);
  const whiteboardPermit = classState?.whiteboardPermit || 'none';
  
  const { tool, color, isDrawingMode } = useWhiteboardToolStore();

  const canDraw = isHost || whiteboardPermit === 'all';
  const effectiveCanDraw = isHost ? isDrawingMode : canDraw;
  const brushSize = 4;

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      if (width && height) {
        canvas.width = width;
        canvas.height = height;
      } else {
        const parent = canvas.parentElement;
        if (parent) {
          canvas.width = parent.clientWidth;
          canvas.height = parent.clientHeight;
        } else {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        }
      }
      const context = canvas.getContext('2d');
      if (context) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        contextRef.current = context;
      }
      setWindowSize({ w: canvas.width, h: canvas.height });
    };

    resizeCanvas();
    
    if (!width || !height) {
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }
  }, [width, height]);

  // Redraw all lines when whiteboardLines changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all lines from state
    whiteboardLines.forEach(line => {
      if (line.points.length < 2) return;
      context.beginPath();
      
      if (line.tool === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = line.size * 5;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = line.color;
        context.lineWidth = line.size;
      }

      context.moveTo(line.points[0] * canvas.width, line.points[1] * canvas.height);
      for (let i = 2; i < line.points.length; i += 2) {
        context.lineTo(line.points[i] * canvas.width, line.points[i + 1] * canvas.height);
      }
      context.stroke();
    });
    
    // Reset composite operation
    context.globalCompositeOperation = 'source-over';
    
  }, [whiteboardLines, windowSize]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!effectiveCanDraw) return;
    
    // Disable scrolling when touching canvas
    if (e.nativeEvent instanceof TouchEvent) {
      e.nativeEvent.preventDefault();
    }

    const { offsetX, offsetY } = getCoordinates(e);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(offsetX, offsetY);
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (canvas) {
      setCurrentLine([offsetX / canvas.width, offsetY / canvas.height]);
    }
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    contextRef.current?.closePath();
    setIsDrawing(false);

    // If it was just a click (dot)
    if (currentLine.length === 2) {
      sendPacket(MsgWhiteboardDraw, {
        code,
        points: [currentLine[0], currentLine[1], currentLine[0], currentLine[1]],
        color,
        size: brushSize,
        tool
      });
    }
    setCurrentLine([]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !effectiveCanDraw) return;
    
    if (e.nativeEvent instanceof TouchEvent) {
      e.nativeEvent.preventDefault();
    }

    const { offsetX, offsetY } = getCoordinates(e);
    
    const context = contextRef.current;
    const canvas = canvasRef.current;
    if (context && canvas) {
      if (tool === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = brushSize * 5;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = color;
        context.lineWidth = brushSize;
      }
      context.lineTo(offsetX, offsetY);
      context.stroke();

      setCurrentLine(prev => {
        const newX = offsetX / canvas.width;
        const newY = offsetY / canvas.height;
        const next = [...prev, newX, newY];
        
        // Send true real-time segments
        if (prev.length >= 2) {
          const lastX = prev[prev.length - 2];
          const lastY = prev[prev.length - 1];
          sendPacket(MsgWhiteboardDraw, {
            code,
            points: [lastX, lastY, newX, newY],
            color,
            size: brushSize,
            tool
          });
        }
        return next;
      });
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { offsetX: 0, offsetY: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Fallback if width/height is 0 to avoid Infinity
    if (canvas.width === 0 || canvas.height === 0) {
      return { offsetX: 0, offsetY: 0 };
    }
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top
    };
  };

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={finishDrawing}
        onMouseOut={finishDrawing}
        onMouseMove={draw}
        onTouchStart={startDrawing}
        onTouchEnd={finishDrawing}
        onTouchCancel={finishDrawing}
        onTouchMove={draw}
        className={`w-full h-full ${effectiveCanDraw ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

export function WhiteboardToolbar({ isHost, code }: WhiteboardProps) {
  const { classState, sendPacket } = useWebSocketStore();
  const whiteboardPermit = classState?.whiteboardPermit || 'none';
  const { tool, setTool, color, setColor, isDrawingMode, setIsDrawingMode } = useWhiteboardToolStore();

  const canDraw = isHost || whiteboardPermit === 'all';
  const effectiveCanDraw = isHost ? isDrawingMode : canDraw;

  if (!canDraw) return null;

  const togglePermit = () => {
    if (!isHost) return;
    const newPermit = whiteboardPermit === 'all' ? 'none' : 'all';
    sendPacket(MsgWhiteboardPermit, { code, permit: newPermit });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full">
      {isHost && (
        <div className="flex items-center gap-4 border-r border-slate-200 pr-4">
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border-2 flex items-center gap-2 ${isDrawingMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <span>DRAW:</span>
            <span>{isDrawingMode ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}

      <div className={`flex items-center gap-2 border-r border-slate-200 pr-4 transition-opacity ${!effectiveCanDraw ? 'opacity-50 pointer-events-none' : ''}`}>
        <button
          onClick={() => setTool('pen')}
          className={`p-2 rounded-xl transition-all flex items-center gap-2 ${tool === 'pen' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Edit3 size={20} />
          <span className="text-xs font-bold hidden sm:inline">Pen</span>
        </button>
        <button
          onClick={() => setTool('eraser')}
          className={`p-2 rounded-xl transition-all flex items-center gap-2 ${tool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Eraser size={20} />
          <span className="text-xs font-bold hidden sm:inline">Eraser</span>
        </button>
      </div>

      <div className={`flex items-center gap-3 border-r border-slate-200 pr-4 transition-opacity ${!effectiveCanDraw ? 'opacity-50 pointer-events-none' : ''}`}>
        {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000', '#ffffff'].map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('pen'); }}
            className={`w-8 h-8 rounded-full transition-transform border-2 border-slate-200 ${color === c && tool === 'pen' ? 'scale-110 ring-2 ring-offset-2 ring-blue-500' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className={`flex items-center gap-4 transition-opacity ${!effectiveCanDraw ? 'opacity-50 pointer-events-none' : ''}`}>
        {isHost && (
          <>
            <button
              onClick={() => sendPacket(MsgWhiteboardClear, { code })}
              className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2"
              title="Clear All"
            >
              <Trash2 size={20} />
              <span className="text-xs font-bold hidden sm:inline">Clear All</span>
            </button>
            <button
              onClick={togglePermit}
              className={`p-2 rounded-xl transition-all flex items-center gap-2 ${whiteboardPermit === 'all' ? 'bg-green-100 text-green-600' : 'text-slate-500 hover:bg-slate-100'}`}
              title={whiteboardPermit === 'all' ? 'Students can draw' : 'Only Host can draw'}
            >
              {whiteboardPermit === 'all' ? <Unlock size={20} /> : <Lock size={20} />}
              <span className="text-xs font-semibold hidden md:inline">
                {whiteboardPermit === 'all' ? 'Students Allowed' : 'Lock Drawing'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
