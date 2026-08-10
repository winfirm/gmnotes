// BoardContext：画图模态框 + 白板查看器状态管理 + 白板保存通知
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const BoardContext = createContext(null);

export function BoardProvider({ children }) {
  const [showDraw, setShowDraw] = useState(false);
  const [viewer, setViewer] = useState(null); // { url, title } 或 null
  // 最近一次保存成功的白板缩略图信息 { thumbRawUrl, blobUrl }，预览据此立即刷新缩略图
  const [lastSavedThumb, setLastSavedThumb] = useState(null);

  const openDraw = useCallback(() => setShowDraw(true), []);
  const closeDraw = useCallback(() => setShowDraw(false), []);

  const openViewer = useCallback((url, title) => setViewer({ url, title }), []);
  const closeViewer = useCallback(() => setViewer(null), []);

  const notifyBoardSaved = useCallback((info) => setLastSavedThumb(info), []);

  const value = useMemo(() => ({
    showDraw, openDraw, closeDraw,
    viewer, openViewer, closeViewer,
    lastSavedThumb, notifyBoardSaved
  }), [showDraw, openDraw, closeDraw, viewer, openViewer, closeViewer, lastSavedThumb, notifyBoardSaved]);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be used within BoardProvider');
  return ctx;
}