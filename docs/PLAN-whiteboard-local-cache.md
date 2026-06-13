# PLAN - Whiteboard Offline Cache & Optimistic Sync

## Overview
This plan outlines the design and implementation for offline caching and optimistic reconciliation of whiteboard annotations in order to handle slow/disconnected internet conditions without losing drawings during component remounts (like fullscreen transitions) or refreshes.

---

## Project Type
WEB (React Vite TypeScript)

---

## Success Criteria
- Newly drawn lines render optimistically on screen immediately.
- If internet is slow or connection is broken, drawings are saved in `localStorage`.
- Drawings persist through fullscreen transitions and refreshes under slow networks.
- As soon as the server echoes the lines, the matching items are removed from `localStorage`.
- When class ends or is cleared, the cache is cleanly purged.

---

## Proposed Changes

### Frontend (React)

#### 1. Zustand Store Extensions
- File: [websocketStore.ts](file:///var/www/classroom-bringgas/frontend/src/store/websocketStore.ts)
- Add state `unsyncedLines: Record<string, WhiteboardLine[]>` initialized by checking `localStorage`.
- Add `addUnsyncedLine`, `reconcileUnsyncedLines`, and `clearUnsyncedLines` functions.
- Update WebSocket message handlers (`MsgClassState`, `MsgWhiteboardDraw`, `MsgWhiteboardClear`) to trigger reconciliation.

#### 2. Whiteboard Drawing Flow
- File: [Whiteboard.tsx](file:///var/www/classroom-bringgas/frontend/src/components/classroom/Whiteboard.tsx)
- Merge synced lines with store's unsynced lines when redrawing.
- Add drawn segments to unsynced lines optimistically.

---

## Verification Plan

### Automated Tests
- Build verification:
  - `go build -o classroom-bringgas .`
  - In `frontend/`: `npm run build`

### Manual Verification
1. **Fullscreen Toggle**: Draw, toggle fullscreen, verify lines persist.
2. **Offline Simulation**: Disconnect network, draw, reconnect, verify lines upload and clear local cache.
3. **Session Purge**: End session, verify `localStorage` keys are cleared.

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ No critical issues
- Build: ✅ Success
- Date: 2026-06-13

