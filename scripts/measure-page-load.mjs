// Playwright CLI probe: run-code --filename scripts/measure-page-load.mjs
// Navigate the CLI's page to the target origin first. Each sample uses a fresh
// Chromium context, disabled cache, 100 ms latency / 10 Mbps and 4x CPU slowdown.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this file as a function expression.
async (page) => {
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser();
  const samples = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (let run = 1; run <= 3; run += 1) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const sample = await context.newPage();
      const cdp = await context.newCDPSession(sample);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 100,
        downloadThroughput: 10_000_000 / 8, uploadThroughput: 10_000_000 / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await sample.addInitScript(() => {
        window.__loadProbe = { lcp: 0, cls: 0, longTasks: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__loadProbe.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__loadProbe.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__loadProbe.longTasks += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      });
      await sample.goto(origin + '/', { waitUntil: 'load' });
      await sample.waitForTimeout(3000);
      const result = await sample.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const css = resources.filter((r) => new URL(r.name).pathname.endsWith('.css'));
        const fonts = resources.filter((r) => /\.(woff2?|ttf)$/.test(new URL(r.name).pathname));
        const rsc = resources.filter((r) => new URL(r.name).pathname.endsWith('.rsc'));
        const images = resources.filter((r) => /images\.unsplash\.com/.test(r.name));
        return {
          ttfbMs: nav.responseStart,
          fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
          loadMs: nav.loadEventEnd,
          ...window.__loadProbe,
          cssBytes: css.reduce((sum, r) => sum + r.encodedBodySize, 0),
          fontBytes: fonts.reduce((sum, r) => sum + r.encodedBodySize, 0),
          imageBytes: images.reduce((sum, r) => sum + r.encodedBodySize, 0),
          totalResourceBytes: resources.reduce((sum, r) => sum + r.encodedBodySize, 0),
          requests: resources.length, rscRequests: rsc.length,
          title: document.querySelector('h1')?.textContent,
          overflow: document.documentElement.scrollWidth - innerWidth,
          resources: resources.map((r) => ({ url: r.name, bytes: r.encodedBodySize, durationMs: r.duration })),
        };
      });
      samples.push({ viewport, run, ...result });
      await context.close();
    }
  }
  return { origin, measuredAt: new Date().toISOString(), conditions: 'cold cache, 100 ms latency, 10 Mbps, 4x CPU, 3 s post-load observation', samples };
}
