// 预览
export function PreviewPane({ html }) {
  return (
    <div
      className="preview-pane"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
