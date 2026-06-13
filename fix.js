const fs = require('fs');
const file = '/var/www/classroom-bringgas/frontend/src/components/classroom/Whiteboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const togglePermit = \(\) => \{[\s\S]*?if \(!canDraw\) return null;/;
content = content.replace(regex, `
  // When dragged, use fixed positioning; otherwise, let parent control layout
  const positionStyle: React.CSSProperties = position ? {
    position: 'fixed',
    left: \`\${position.x}px\`,
    top: \`\${position.y}px\`,
    zIndex: 9999,
    transform: 'none',
    width: 'auto',
  } : {};

  const baseClasses = isFloating 
    ? "absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-lg select-none"
    : "w-full bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center select-none";

  const dragClasses = isDragging ? 'shadow-2xl scale-[1.02]' : 'transition-shadow transition-transform';

  if (!canDraw) return null;
`);

fs.writeFileSync(file, content);
