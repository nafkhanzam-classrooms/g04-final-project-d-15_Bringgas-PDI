import React, { useRef, useState, useEffect } from 'react';
import { useWebSocketStore, MsgWhiteboardDraw, MsgWhiteboardClear, MsgWhiteboardPermit } from '../../store/websocketStore';
import { Trash2, Edit3, Eraser, Unlock, Lock } from 'lucide-react';

interface WhiteboardProps {
  isHost: boolean;
  code: string;
}

export default function Whiteboard({ isHost, code }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444');
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [currentLine, setCurrentLine] = useState<number[]>([]);
  
  const { classState, sendPacket } = useWebSocketStore();
  const whiteboardLines = classState?.whiteboardLines || [];
  const whiteboardPermit = classState?.whiteboardPermit || 'none';

  const canDraw = isHost || whiteboardPermit === 'all';
  const brushSize = 4;

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions to match its CSS size precisely
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
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
  }, []);

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
      context.strokeStyle = line.tool === 'eraser' ? 'rgba(255,255,255,1)' : line.color; // If erasing on transparent, it might be tricky. Actually, we use 'destination-out' for eraser on canvas.
      
      if (line.tool === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = line.size * 5; // Eraser is bigger
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = line.color;
        context.lineWidth = line.size;
      }

      context.moveTo(line.points[0], line.points[1]);
      for (let i = 2; i < line.points.length; i += 2) {
        context.lineTo(line.points[i], line.points[i + 1]);
      }
      context.stroke();
    });
    
    // Reset composite operation
    context.globalCompositeOperation = 'source-over';
    
  }, [whiteboardLines]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    
    // Disable scrolling when touching canvas
    if (e.nativeEvent instanceof TouchEvent) {
      e.nativeEvent.preventDefault();
    }

    const { offsetX, offsetY } = getCoordinates(e);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(offsetX, offsetY);
    setIsDrawing(true);
    setCurrentLine([offsetX, offsetY]);
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    contextRef.current?.closePath();
    setIsDrawing(false);

    if (currentLine.length > 2) {
      // Send line to server
      sendPacket(MsgWhiteboardDraw, {
        code,
        points: currentLine,
        color,
        size: brushSize,
        tool
      });
    }
    setCurrentLine([]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw) return;
    
    if (e.nativeEvent instanceof TouchEvent) {
      e.nativeEvent.preventDefault();
    }

    const { offsetX, offsetY } = getCoordinates(e);
    
    const context = contextRef.current;
    if (context) {
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
    }

    setCurrentLine(prev => [...prev, offsetX, offsetY]);
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { offsetX: 0, offsetY: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        offsetX: e.touches[0].clientX - rect.left,
        offsetY: e.touches[0].clientY - rect.top
      };
    }
    return {
      offsetX: e.nativeEvent.offsetX,
      offsetY: e.nativeEvent.offsetY
    };
  };

  const togglePermit = () => {
    if (!isHost) return;
    const newPermit = whiteboardPermit === 'all' ? 'none' : 'all';
    sendPacket(MsgWhiteboardPermit, { code, permit: newPermit });
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
      
      {/* Toolbar */}
      {canDraw && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-6 py-3 rounded-2xl shadow-xl border border-slate-200 pointer-events-auto flex items-center gap-4 transition-all hover:shadow-2xl">
          <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
            <button
              onClick={() => setTool('pen')}
              className={`p-2 rounded-xl transition-all ${tool === 'pen' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Edit3 size={20} />
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-xl transition-all ${tool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Eraser size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
            {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#000000'].map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-6 h-6 rounded-full transition-transform ${color === c && tool === 'pen' ? 'scale-125 ring-2 ring-offset-2 ring-blue-500' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            {isHost && (
              <>
                <button
                  onClick={() => sendPacket(MsgWhiteboardClear, { code })}
                  className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Clear All"
                >
                  <Trash2 size={20} />
                </button>
                <button
                  onClick={togglePermit}
                  className={`p-2 rounded-xl transition-all flex items-center gap-2 ${whiteboardPermit === 'all' ? 'bg-green-100 text-green-600' : 'text-slate-500 hover:bg-slate-100'}`}
                  title={whiteboardPermit === 'all' ? 'Students can draw' : 'Only Host can draw'}
                >
                  {whiteboardPermit === 'all' ? <Unlock size={20} /> : <Lock size={20} />}
                  <span className="text-xs font-semibold hidden md:inline">
                    {whiteboardPermit === 'all' ? 'Siswa Bisa Coret' : 'Kunci Coretan'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
