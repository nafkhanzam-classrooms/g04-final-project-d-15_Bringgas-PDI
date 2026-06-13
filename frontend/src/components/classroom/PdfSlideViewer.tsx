import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Use CDN for worker to avoid Vite bundling issues with PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfSlideViewerProps {
  url: string;
  slideNumber: number;
}

export default function PdfSlideViewer({ url, slideNumber }: PdfSlideViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

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

  // Render specific page when slideNumber changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    let active = true;

    const renderPage = async () => {
      try {
        if (isRendering && renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }
        setIsRendering(true);

        const pageToRender = Math.min(Math.max(1, slideNumber), pdfDoc.numPages);
        const page = await pdfDoc.getPage(pageToRender);
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate scale to fit container width/height while preserving aspect ratio
        const containerWidth = containerRef.current!.clientWidth;
        const containerHeight = containerRef.current!.clientHeight;
        
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

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : undefined;

        const renderContext = {
          canvasContext: ctx,
          transform: transform,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext as any);
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      } finally {
        if (active) setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, slideNumber]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
      {!pdfDoc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full shadow-lg" />
    </div>
  );
}
