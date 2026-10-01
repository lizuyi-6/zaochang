export interface LessonDelayControl {
  cancelled: boolean;
  paused: boolean;
  skipped: boolean;
}

/** Course time stops on pause; interjection cooldown uses wall time instead. */
export function lessonDelay(
  ms: number,
  control: LessonDelayControl,
  runWhilePaused = false,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let left = ms;
    let last = Date.now();
    const interval = globalThis.setInterval(() => {
      if (control.cancelled) {
        globalThis.clearInterval(interval);
        reject(new Error('cancelled'));
        return;
      }
      if (control.skipped) {
        globalThis.clearInterval(interval);
        resolve();
        return;
      }
      const now = Date.now();
      if (runWhilePaused || !control.paused) left -= now - last;
      last = now;
      if (left <= 0) {
        globalThis.clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}
