// note id 生成
export function generateId() {
  return 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
