import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Whiteboard from './Whiteboard';

// Use CDN for worker to avoid Vite bundling issues with PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfSlideViewerProps {
  url: string;
  slideNumber: number;
  showWhiteboard?: boolean;
  isHost?: boolean;
  code?: string;
  whiteboardLines?: any[];
}

export default function PdfSlideViewer({ url, slideNumber, showWhiteboard, isHost, code, whiteboardLines }: PdfSlideViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentViewportSize, setCurrentViewportSize] = useState<{ width: number, height: number } | null>(null);

  // Track container dimensions to re-scale on resize/fullscreen events
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Load PDF document once
  useEffect(() => {
    let active = true;
    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise.then((doc) => {
      if (active) setPdfDoc(doc);
    }).catch(err => {
      console.error('Error loading PDF:', err);
    });

    return () => {
      active = false;
      loadingTask.destroy();
    };
  }, [url]);

  // Render specific page when slideNumber or dimensions change
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const timeoutId = setTimeout(async () => {
      try {
        const pageToRender = Math.min(Math.max(1, slideNumber), pdfDoc.numPages);
        const page = await pdfDoc.getPage(pageToRender);
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate scale to fit container width/height while preserving aspect ratio
        const containerWidth = containerRef.current!.clientWidth || dimensions.width || 800;
        const containerHeight = containerRef.current!.clientHeight || dimensions.height || 600;

        // Get unscaled viewport
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = containerWidth / unscaledViewport.width;
        const scaleY = containerHeight / unscaledViewport.height;
        const scale = Math.min(scaleX, scaleY); // Fit inside container

        const viewport = page.getViewport({ scale });

        // High DPI canvas rendering for sharp text
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        setCurrentViewportSize({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height)
        });

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : undefined;

        const renderContext = {
          canvasContext: ctx,
          transform: transform,
          viewport: viewport,
        };

        renderTask = page.render(renderContext as any);
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    }, 100); // 100ms debounce to prevent race conditions during layout shifts

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, slideNumber, dimensions.width, dimensions.height]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
      {!pdfDoc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
      
      <div 
        className={`relative shadow-lg transition-opacity duration-300 ${currentViewportSize ? 'opacity-100' : 'opacity-0'}`} 
        style={currentViewportSize ? { 
          width: `${currentViewportSize.width}px`, 
          height: `${currentViewportSize.height}px` 
        } : {}}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
        
        {showWhiteboard && code && currentViewportSize && (
          <Whiteboard 
            isHost={isHost || false} 
            code={code} 
            lines={whiteboardLines}
          />
        )}
      </div>
    </div>
  );
}
