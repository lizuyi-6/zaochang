---
name: zaochang-agent-connect
description: Use 造场 MCP tools to list, submit, update, and check projects owned by the signed-in user, upload covers, and host authorized static sites.
---

# 造场 Agent 接入

Use this skill when the user asks you to submit a project to 造场, edit one of their projects, check its review status, upload a project cover, or host an authorized static site.

## Connect with OAuth (recommended)

OAuth registers a public MCP client, then opens a browser so you can sign in to 造场 and approve access. The authorization grants only `mcp:projects`: the assistant can list, read, submit, and update your own projects and upload covers. Submissions and edits return to review. OAuth MCP access cannot spend 果子 or read your email.

Claude Code over HTTP:

```sh
claude mcp add --transport http zaochang https://aetherstudio.top/api/mcp
```

Then authorize (opens a browser to sign in to 造场 and approve):

```sh
claude mcp login zaochang
```

You can also run `/mcp` inside a Claude Code session and choose the server to authenticate. On a machine without a browser, `claude mcp login zaochang --no-browser` prints the authorization URL; paste the redirect URL back when prompted.

Codex CLI (syntax checked with the installed `codex mcp add --help` and `codex mcp login --help`):

```sh
codex mcp add zaochang --url "https://aetherstudio.top/api/mcp"
codex mcp login zaochang --oauth-client-registration dcr
```

## Personal API key backup

Use a personal API key only when the agent has no browser, such as CI. Sign in to 造场 and open **个人主页 → 编辑资料 → Agent API key** (`/profile/edit`). Create a key with a 30, 90, or 365 day lifetime; its plaintext is shown once. Store it in a secret manager or a private environment variable, never in a repository or prompt log.

For PowerShell:

```powershell
$env:ZAOCHANG_API_KEY = Read-Host "造场 API key"
```

For Bash or zsh, use a local secret manager or a private shell environment:

```sh
export ZAOCHANG_API_KEY="$(your-secret-manager read zaochang/api-key)"
```

Claude Code key fallback:

```sh
claude mcp add --transport http zaochang https://aetherstudio.top/api/mcp --header "Authorization: Bearer ${ZAOCHANG_API_KEY}"
```

Codex CLI key fallback (the bearer-token environment option is documented by local CLI help):

```sh
codex mcp add zaochang --url "https://aetherstudio.top/api/mcp" --bearer-token-env-var ZAOCHANG_API_KEY
```

Cursor or a generic MCP client:

```json
{
  "mcpServers": {
    "zaochang": {
      "url": "https://aetherstudio.top/api/mcp",
      "headers": {
        "Authorization": "Bearer ${ZAOCHANG_API_KEY}"
      }
    }
  }
}
```

Client configuration support for environment-variable expansion differs. If a client does not expand `${ZAOCHANG_API_KEY}`, use its secret/environment-variable UI or paste the key there without saving it in a repository file.

## Call MCP without a client

Send JSON-RPC 2.0 POST requests to `https://aetherstudio.top/api/mcp`. The endpoint returns JSON (no SSE). Example: list the tools.

```sh
curl -sS "https://aetherstudio.top/api/mcp" \
  -H "Authorization: Bearer ${ZAOCHANG_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Example: submit a project.

```sh
curl -sS "https://aetherstudio.top/api/mcp" \
  -H "Authorization: Bearer ${ZAOCHANG_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_product","arguments":{"title":"My project","description":"A clear description of what the project does and who it helps.","category":"开发工具"}}}'
```

## Available tools

- `list_my_products`: list only the signed-in user's projects, including `status`, `review_status`, `review_version`, and `approved_version`.
- `get_product(id)`: read a project only when its `owner_email` matches the signed-in user.
- `create_product(title, description, category, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: submit a new project. `category` is one of `效率工具`, `互动体验`, `声音影像`, `生活方式`, or `开发工具`. External experience links (`demo_url`) cannot currently pass platform review because review requires experience content that cannot be replaced in place. If you have a hosting grant, use static hosting instead of an external link and keep `demo_url` empty.
- `update_product(id, title?, description?, category?, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: edit only the signed-in user's project. Editing an approved project sends the changed version back for review. The same `demo_url` restriction applies; for a hosted project, keep `demo_url` empty.
- `upload_cover(filename, mime_type, data_base64)`: submit a PNG, JPEG, or WebP cover for scanning. Use the returned `cover_upload_key` with `create_product` or `update_product`.
- `begin_hosting_upload(product_id)`: for a product you own, create a one-time ZIP upload URL when your account has an invitation hosting grant and `demo_url` is empty.
- `get_hosting_status(product_id)`: read hosting state, review state, the public hosted URL when available, and a suggested next step.
- `remove_hosting(product_id)`: request removal of your hosted site. `get_hosting_status` reports `state: removing` while the deployer deletes the remote site, then returns `hosting: null` once the removal has completed.

## Static hosting

Static hosting accepts a ZIP bundle and serves static files only. The ZIP must be at most 10 MiB, contain no more than 500 archive entries (directory entries count), and have `index.html` at its root. Include only supported static asset types: HTML, CSS, JavaScript and modules, JSON and maps, text/XML/SVG, images, fonts, WebAssembly, PDF and media, Markdown, TSX, or JSX. Do not include dotfiles (including `.env`), private keys, `node_modules`, or server-side code. An invitation hosting grant is required. Keep the hosted product's `demo_url` empty; hosted links are public only after platform review approves the product.

Follow this flow:

1. Create the product with `create_product`, leaving `demo_url` omitted or empty. Hosting can only be requested for a product that already exists and belongs to the signed-in member.
2. Build the production static output. Inspect the output directory and package only the files needed to serve the site. Put `index.html` directly at the ZIP root, then check the ZIP size, archive entry count (including directory entries), extensions, hidden files, and secret/key filenames.
3. Call `begin_hosting_upload(product_id)`. The tool returns an absolute `upload_url`, `max_bytes`, an expiry, and a copyable shell command. The URL is one-time, expires after 15 minutes, and must not be shared. Token creation is limited to 10 attempts per member per hour.
4. Use a local shell to upload the ZIP. Keep the archive bytes out of every MCP tool argument:

   ```sh
   curl --fail --show-error -sS -X PUT -H "content-type: application/zip" --data-binary @bundle.zip "<upload_url>"
   ```

   Replace `<upload_url>` with the returned URL and run the command once before it expires. A successful upload returns HTTP 201; the one-time URL cannot be replayed.
5. Call `get_hosting_status(product_id)` every 10–20 seconds while `hosting.state` is `queued`, `deploying`, or `promoting`. Use `next_step` as guidance. `staged` means the bundle is waiting for platform review; pause rapid polling and check again later. `live` with a non-empty `hosting.hostedUrl` means the approved hosted link is public and the deployment polling loop can stop. For `failed`, stop polling and follow the `failureCode`; do not infer public availability from an upload or staged preview. Rows whose removal has completed (`state: removed`) are dropped from the status response, so `hosting: null` means either no site was ever uploaded for this project or a requested removal has finished; a removal still in progress is reported as `removing`.
6. Handle common failures:
   - `validation_bundle`: correct the ZIP structure, root `index.html`, size, archive entry count (including directories), path, or unsupported extension, then create a new upload URL.
   - `validation_secret`: remove the detected secret or key from the static output, rebuild the ZIP, and create a new upload URL.
   - `bundle_missing`: rebuild and upload the bundle again.
   - `provider_quota`, `provider_auth`, `provider_audit_rejected`, `provider_error`, or `internal`: include `failureCode` and `failureDetail` when contacting the hosting operator; provider credentials and quota are operator-managed.
   - `ambiguous`: remote state needs operator reconciliation. Do not upload another bundle until the site has been reconciled.
7. Call `remove_hosting(product_id)` when the user asks to take down the site. Its success means the removal request was accepted. Poll `get_hosting_status` every 10–20 seconds: `hosting.state: removing` means the deployer is still deleting the remote site, and `hosting: null` means the removal has completed and the project can host a new bundle. If the state stays `removing` for several minutes, contact the hosting operator.

Never put ZIP bytes, base64 ZIP data, or file contents in an MCP argument. Only `begin_hosting_upload` returns the one-time URL; use it only from the shell command and do not paste or share it elsewhere.

Business errors are returned in a tool result with `isError: true`. Do not retry by calling REST endpoints. After submitting or materially editing a project, use `get_product` or `list_my_products` to check its review status and wait for the 造场 review before treating it as published.

Manage or revoke personal API keys from the signed-in settings page. Manage OAuth approvals at **开发者接入中心 → 已授权应用**; revocation immediately invalidates that client's MCP access and refresh tokens.
