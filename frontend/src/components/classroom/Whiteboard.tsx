import React, { useRef, useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { useWebSocketStore, MsgWhiteboardDraw, MsgWhiteboardClear, MsgWhiteboardDrawFinish, MsgWhiteboardPermit, MsgWhiteboardActive } from '../../store/websocketStore';
import { Trash2, Edit3, Eraser, Unlock, Lock, GripHorizontal } from 'lucide-react';

interface WhiteboardProps {
  isHost: boolean;
  code: string;
  lines?: any[];
  isDraggable?: boolean;
  isFloating?: boolean;
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

export default function Whiteboard({ isHost, code, lines }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const strokeSegmentsRef = useRef<any[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  
  const { classState, sendPacket, addLocalLines } = useWebSocketStore();
  const whiteboardLines = lines !== undefined ? lines : (classState?.whiteboardLines || []);
  const whiteboardPermit = classState?.whiteboardPermit || 'none';
  const whiteboardActive = classState?.whiteboardActive ?? false;
  
  const { tool, color } = useWhiteboardToolStore();

  // Strict permission check: Master switch must be ON. If ON, Host can always draw, students need permit='all'
  const canDraw = whiteboardActive && (isHost || whiteboardPermit === 'all');
  const brushSize = 4;

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth || window.innerWidth;
        canvas.height = parent.clientHeight || window.innerHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      const context = canvas.getContext('2d');
      if (context) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        contextRef.current = context;
      }
      setCanvasSize({ w: canvas.width, h: canvas.height });
    };

    resizeCanvas();

    const parent = canvas.parentElement;
    if (parent) {
      const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserver.observe(parent);
      return () => resizeObserver.disconnect();
    } else {
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }
  }, []);

  // Center-relative coordinate normalization:
  // Both teacher (narrow container) and student (wide container) have the same HEIGHT
  // but different WIDTHs. The PDF is centered in both.
  // By normalizing relative to the center using HEIGHT as the scale factor,
  // coordinates are perfectly synchronized regardless of container width.
  const getScreenCoords = useCallback((nx: number, ny: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: nx * canvas.height + canvas.width / 2,
      y: ny * canvas.height + canvas.height / 2
    };
  }, []);

  const getNormalizedCoords = useCallback((offsetX: number, offsetY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.height === 0) return { x: 0, y: 0 };
    return {
      x: (offsetX - canvas.width / 2) / canvas.height,
      y: (offsetY - canvas.height / 2) / canvas.height
    };
  }, []);

  // Redraw all lines when whiteboardLines changes
  useEffect(() => {
    if (isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);

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

      const start = getScreenCoords(line.points[0], line.points[1]);
      context.moveTo(start.x, start.y);
      for (let i = 2; i < line.points.length; i += 2) {
        const point = getScreenCoords(line.points[i], line.points[i + 1]);
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    });
    
    context.globalCompositeOperation = 'source-over';
    
  }, [whiteboardLines, canvasSize, getScreenCoords]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    
    if (e.nativeEvent instanceof TouchEvent) {
      e.nativeEvent.preventDefault();
    }

    const { offsetX, offsetY } = getCoordinates(e);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(offsetX, offsetY);
    setIsDrawing(true);
    isDrawingRef.current = true;
    strokeSegmentsRef.current = [];
    
    const canvas = canvasRef.current;
    if (canvas) {
      const { x: nx, y: ny } = getNormalizedCoords(offsetX, offsetY);
      strokeSegmentsRef.current.push({ x: nx, y: ny });
    }
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    contextRef.current?.closePath();
    setIsDrawing(false);
    isDrawingRef.current = false;

    if (strokeSegmentsRef.current.length === 1) {
      const point = strokeSegmentsRef.current[0];
      const newLine = {
        points: [point.x, point.y, point.x, point.y],
        color,
        size: brushSize,
        tool
      };
      addLocalLines([newLine]);
      sendPacket(MsgWhiteboardDraw, {
        code,
        ...newLine
      });
      sendPacket(MsgWhiteboardDrawFinish, { code });
    } else {
      const newLines = [];
      for (let i = 1; i < strokeSegmentsRef.current.length; i++) {
        if (strokeSegmentsRef.current[i].isSent) {
           newLines.push(strokeSegmentsRef.current[i].lineData);
        }
      }
      if (newLines.length > 0) {
        addLocalLines(newLines);
      }
      sendPacket(MsgWhiteboardDrawFinish, { code });
    }
    
    strokeSegmentsRef.current = [];
    setCanvasSize(prev => ({ ...prev }));
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw) return;
    
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

      const { x: newX, y: newY } = getNormalizedCoords(offsetX, offsetY);
      
      if (strokeSegmentsRef.current.length > 0) {
        const lastPoint = strokeSegmentsRef.current[strokeSegmentsRef.current.length - 1];
        
        const newLineData = {
          points: [lastPoint.x, lastPoint.y, newX, newY],
          color,
          size: brushSize,
          tool
        };
        
        strokeSegmentsRef.current.push({
          x: newX,
          y: newY,
          isSent: true,
          lineData: newLineData
        });
        
        sendPacket(MsgWhiteboardDraw, {
          code,
          ...newLineData
        });
      } else {
         strokeSegmentsRef.current.push({ x: newX, y: newY });
      }
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { offsetX: 0, offsetY: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
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
        className={`w-full h-full ${canDraw ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

// Draggable Whiteboard Toolbar
export function WhiteboardToolbar({ isHost, code, isDraggable = true, isFloating = true }: WhiteboardProps) {
  const { classState, sendPacket } = useWebSocketStore();
  const whiteboardPermit = classState?.whiteboardPermit || 'none';
  const whiteboardActive = classState?.whiteboardActive ?? false;
  const { tool, setTool, color, setColor } = useWhiteboardToolStore();

  const canDraw = isHost || whiteboardPermit === 'all';
  const effectiveCanDraw = whiteboardActive && canDraw;

  // Drag state
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!toolbarRef.current) return;
    e.preventDefault();
    const rect = toolbarRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };
    
    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
    
    setIsDragging(true);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const newX = clientX - dragOffset.current.x;
      const newY = clientY - dragOffset.current.y;
      
      // Clamp to viewport
      const maxX = window.innerWidth - (toolbarRef.current?.offsetWidth || 200);
      const maxY = window.innerHeight - (toolbarRef.current?.offsetHeight || 60);
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging]);

  if (!canDraw) return null;

  
  // When dragged, use fixed positioning; otherwise, let parent control layout
  const positionStyle: React.CSSProperties = position ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 9999,
    transform: 'none',
    width: 'auto',
  } : {};

  const baseClasses = isFloating 
    ? "absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-lg select-none"
    : "w-full bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center select-none";

  const dragClasses = isDragging ? 'shadow-2xl scale-[1.02]' : 'transition-shadow transition-transform';

  if (!canDraw) return null;


  return (
    <div
      ref={toolbarRef}
      style={positionStyle}
      className={`flex flex-wrap items-center gap-3 ${baseClasses} ${dragClasses}`}
    >
      {/* Drag Handle */}
      {isDraggable && (
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 px-1 border-r border-slate-200 pr-3"
          title="Drag to move"
        >
          <GripHorizontal size={18} />
        </div>
      )}

      {isHost && (
        <div className="flex items-center gap-3 border-r border-slate-200 pr-3">
          <button
            onClick={() => {
              const newActive = !whiteboardActive;
              useWebSocketStore.setState((state) => ({
                classState: state.classState ? { ...state.classState, whiteboardActive: newActive } : null
              }));
              sendPacket(MsgWhiteboardActive, { code, active: newActive });
            }}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border-2 flex items-center gap-1.5 ${whiteboardActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            <span>DRAW:</span>
            <span>{whiteboardActive ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}

      <div className={`flex items-center gap-1.5 border-r border-slate-200 pr-3 transition-opacity ${!effectiveCanDraw ? 'opacity-40 pointer-events-none' : ''}`}>
        <button
          onClick={() => setTool('pen')}
          className={`p-1.5 rounded-lg transition-all ${tool === 'pen' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Edit3 size={18} />
        </button>
        <button
          onClick={() => setTool('eraser')}
          className={`p-1.5 rounded-lg transition-all ${tool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Eraser size={18} />
        </button>
      </div>

      <div className={`flex items-center gap-2 border-r border-slate-200 pr-3 transition-opacity ${!effectiveCanDraw ? 'opacity-40 pointer-events-none' : ''}`}>
        {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000', '#ffffff'].map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('pen'); }}
            className={`w-7 h-7 rounded-full transition-transform border-2 border-slate-200 ${color === c && tool === 'pen' ? 'scale-110 ring-2 ring-offset-1 ring-blue-500' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className={`flex items-center gap-3 transition-opacity ${!effectiveCanDraw ? 'opacity-40 pointer-events-none' : ''}`}>
        {isHost && (
          <>
            <button
              onClick={() => sendPacket(MsgWhiteboardClear, { code })}
              className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Clear All"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={() => {
                const newPermit = whiteboardPermit === 'all' ? 'none' : 'all';
                useWebSocketStore.setState((state) => ({
                  classState: state.classState ? { ...state.classState, whiteboardPermit: newPermit } : null
                }));
                sendPacket(MsgWhiteboardPermit, { code, permit: newPermit });
              }}
              className={`p-2 rounded-lg transition-colors ${whiteboardPermit === 'all' ? 'text-green-500 hover:bg-green-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              title={whiteboardPermit === 'all' ? "Students can draw" : "Students locked"}
            >
              {whiteboardPermit === 'all' ? <Unlock size={18} /> : <Lock size={18} />}
              <span className="text-[10px] font-bold hidden md:inline">
                {whiteboardPermit === 'all' ? 'UNLOCKED' : 'LOCKED'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
