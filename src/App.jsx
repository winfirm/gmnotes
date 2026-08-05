// App 顶层组件，组合 Provider 与 AppShell
import React from 'react';
import { I18nProvider } from './contexts/I18nContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { GitHubConfigProvider } from './contexts/GitHubConfigContext.jsx';
import { NotesProvider } from './contexts/NotesContext.jsx';
import { AiProvider } from './contexts/AiContext.jsx';
import { ImageProvider } from './contexts/ImageContext.jsx';
import { ImageGalleryDrawer } from './components/images/ImageGalleryDrawer.jsx';
import { useSidebar } from './hooks/useSidebar';
import { useAi } from './contexts/AiContext.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Main } from './components/Main.jsx';
import { GitHubConfigModal } from './components/modals/GitHubConfigModal.jsx';
import { AiConfigModal } from './components/modals/AiConfigModal.jsx';
import { AiDrawer } from './components/ai/AiDrawer.jsx';
import { InsertModeModal } from './components/modals/InsertModeModal.jsx';
import { Toast } from './components/Toast.jsx';
import { LanguageToggle } from './components/LanguageToggle.jsx';

function AppShell() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const [previewMode, setPreviewMode] = React.useState(false);
  const { setShowAiDrawer } = useAi();
  const textareaRef = React.useRef(null);

  // 监听子组件派发的事件
  React.useEffect(() => {
    const onCloseSidebar = () => closeSidebar();
    const onCloseAiDrawer = () => setShowAiDrawer(false);
    window.addEventListener('gmnotes:close-sidebar', onCloseSidebar);
    window.addEventListener('gmnotes:close-ai-drawer', onCloseAiDrawer);
    return () => {
      window.removeEventListener('gmnotes:close-sidebar', onCloseSidebar);
      window.removeEventListener('gmnotes:close-ai-drawer', onCloseAiDrawer);
    };
  }, [closeSidebar, setShowAiDrawer]);

  const handleTogglePreview = React.useCallback((v) => setPreviewMode(v), []);

  return (
    <React.Fragment>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <Main
        onToggleSidebar={toggleSidebar}
        previewMode={previewMode}
        onTogglePreview={handleTogglePreview}
        textareaRef={textareaRef}
      />
      <GitHubConfigModal />
      <AiConfigModal />
      <AiDrawer />
      <InsertModeModal />
      <ImageGalleryDrawer />
      <Toast />
      <LanguageToggle />
    </React.Fragment>
  );
}

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <GitHubConfigProvider>
          <NotesProvider>
            <ImageProvider>
              <AiProvider>
                <AppShell />
              </AiProvider>
            </ImageProvider>
          </NotesProvider>
        </GitHubConfigProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
