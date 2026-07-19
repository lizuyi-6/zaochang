const jsonForInlineScript = (value: string) => JSON.stringify(value).replaceAll("<", "\\u003c");

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

export function githubConnectionPage(authorizeUrl: URL, returnTo: string) {
  const failureUrl = `/signin?error=github_unreachable&return_to=${encodeURIComponent(returnTo)}`;
  const authorizeTarget = jsonForInlineScript(authorizeUrl.toString());
  const failureTarget = jsonForInlineScript(failureUrl);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>正在连接 GitHub | 造场</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#101416;color:#e9eee9;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}body{align-items:center;display:flex;justify-content:center;min-height:100svh;padding:24px}.gate{border:1px solid rgba(216,180,106,.32);max-width:440px;padding:28px;width:100%}.mark{color:#d8b46a;font-size:11px;letter-spacing:.12em}.pulse{animation:pulse 1.1s ease-in-out infinite;background:#d8b46a;border-radius:50%;display:inline-block;height:8px;margin-right:10px;vertical-align:1px;width:8px}.gate h1{font-family:serif;font-size:26px;font-weight:500;margin:18px 0 10px}.gate p{color:#a9b2ae;font-size:12px;line-height:1.8;margin:0}.actions{display:none;gap:10px;margin-top:22px}.actions.visible{display:flex}.actions button,.actions a{align-items:center;background:transparent;border:1px solid #59625e;color:#e9eee9;cursor:pointer;display:inline-flex;font:inherit;font-size:11px;justify-content:center;min-height:40px;padding:0 14px;text-decoration:none}.actions button{background:#d8b46a;border-color:#d8b46a;color:#161a18}.detail{border-top:1px solid rgba(255,255,255,.08);font-size:10px!important;margin-top:22px!important;padding-top:14px}@keyframes pulse{50%{opacity:.35;transform:scale(.72)}}
  </style>
</head>
<body>
  <main class="gate">
    <div class="mark"><span class="pulse"></span>ZAOCHANG / GITHUB</div>
    <h1>正在连接 GitHub</h1>
    <p id="status" role="status" aria-live="polite">正在寻找可用的 GitHub 连接...</p>
    <div class="actions" id="actions">
      <button id="retry" type="button">重新连接</button>
      <a href="${escapeHtml(failureUrl)}">返回登录</a>
    </div>
    <p class="detail">造场不会获取你的 GitHub 密码。连接成功后将直接进入 GitHub 官方授权页。</p>
    <noscript><p><a href="${escapeHtml(authorizeUrl.toString())}">继续前往 GitHub</a></p></noscript>
  </main>
  <script>
    (() => {
      const target = ${authorizeTarget};
      const failure = ${failureTarget};
      const status = document.getElementById("status");
      const actions = document.getElementById("actions");
      const retry = document.getElementById("retry");
      const maxAttempts = 3;
      const timeoutMs = 5000;
      const expiresAt = Date.now() + 9 * 60 * 1000;
      let attempt = 0;
      let active = false;

      const showFailure = () => {
        active = false;
        status.textContent = "当前网络暂时无法连接 GitHub，请检查网络后重试。";
        actions.classList.add("visible");
      };

      const probe = () => {
        if (active) return;
        if (Date.now() >= expiresAt) {
          location.replace(failure);
          return;
        }
        active = true;
        attempt += 1;
        actions.classList.remove("visible");
        status.textContent = "正在连接 GitHub（" + attempt + "/" + maxAttempts + "）...";
        const image = new Image();
        let settled = false;
        const finish = (reachable) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          image.remove();
          active = false;
          if (reachable) {
            status.textContent = "连接成功，正在进入 GitHub 官方授权页...";
            location.replace(target);
          } else if (attempt < maxAttempts) {
            setTimeout(probe, 350);
          } else {
            showFailure();
          }
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.alt = "";
        image.hidden = true;
        document.body.appendChild(image);
        image.src = "https://github.com/favicon.ico?zaochang_connect=" + Date.now() + "_" + attempt;
      };

      retry.addEventListener("click", () => {
        attempt = 0;
        probe();
      });
      probe();
    })();
  </script>
</body>
</html>`;
}
