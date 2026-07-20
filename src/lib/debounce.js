// 通用 debounce
export function debounce(fn, delay) {
  let timer = null;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(null, args);
    }, delay);
  }
  debounced.cancel = function () {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  debounced.flush = function (...args) {
    if (timer) { clearTimeout(timer); timer = null; }
    fn.apply(null, args);
  };
  return debounced;
}
