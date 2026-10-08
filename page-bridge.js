// ---------------------------------------------------------------------------
// TTD Pilgrim Autofill - Page Bridge
//
// Runs in the MAIN world to bridge React synthetic events that require
// isTrusted flags or direct component handler calls.
// ---------------------------------------------------------------------------

(function() {
  if (window.__TTD_BRIDGE_LOADED__) return;
  window.__TTD_BRIDGE_LOADED__ = true;

  function triggerReactClick(el) {
    if (!el) return false;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps"));
    if (key && el[key] && typeof el[key].onClick === "function") {
      try {
        el[key].onClick({
          isTrusted: true,
          nativeEvent: { isTrusted: true },
          preventDefault: function() {},
          stopPropagation: function() {},
          target: el,
          currentTarget: el,
        });
        return true;
      } catch (err) {
        console.warn("[TTD Bridge] React onClick error:", err);
      }
    }
    el.click();
    return true;
  }

  window.addEventListener(
    "__TTD_REACT_CLICK__",
    function(e) {
      if (triggerReactClick(e.target)) {
        e.preventDefault();
      }
    },
    true
  );
})();
