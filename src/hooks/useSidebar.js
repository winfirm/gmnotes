// 移动端 sidebar 开合
import { useState, useCallback } from 'react';

export function useSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(v => !v);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return { sidebarOpen, toggleSidebar, closeSidebar };
}
