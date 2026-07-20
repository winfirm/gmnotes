// 移动端遮罩
export function SidebarOverlay({ visible, onClose }) {
  if (!visible) return null;
  return <div className="sidebar-overlay active" onClick={onClose}></div>;
}
