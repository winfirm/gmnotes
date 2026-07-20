// 通用 modal 外壳
export function ModalShell({ show, onClose, zIndex, children, ariaLabel }) {
  if (!show) return null;
  const overlayStyle = zIndex ? { zIndex } : undefined;
  return (
    <div className="modal-overlay" style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
