(() => {
  const selectableButtons = ".mr-seg-btn, .mn-seg-btn, .sp-seg-btn, .sp-stage-pill";
  let queued = false;

  const syncPressedState = () => {
    queued = false;
    document.querySelectorAll(selectableButtons).forEach((button) => {
      button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
    });
  };

  const scheduleSync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(syncPressedState);
  };

  const start = () => {
    syncPressedState();
    new MutationObserver(scheduleSync).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
