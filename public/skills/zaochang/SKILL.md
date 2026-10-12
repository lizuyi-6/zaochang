---
name: zaochang-agent-connect
description: Use 造场 MCP tools to list, submit, and update projects owned by the signed-in user, and check their review status.
---

# 造场 Agent 接入

Use this skill when the user asks you to submit a project to 造场, edit one of their projects, check its review status, or upload a project cover.

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
- `create_product(title, description, category, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: submit a new project. `category` is one of `效率工具`, `互动体验`, `声音影像`, `生活方式`, or `开发工具`. External experience links (`demo_url`) cannot currently pass platform review because review requires experience content that cannot be replaced in place. Until static hosting is available, leave `demo_url` blank and use the cover and description to present the project.
- `update_product(id, title?, description?, category?, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: edit only the signed-in user's project. Editing an approved project sends the changed version back for review. The same `demo_url` review restriction applies to updates.
- `upload_cover(filename, mime_type, data_base64)`: submit a PNG, JPEG, or WebP cover for scanning. Use the returned `cover_upload_key` with `create_product` or `update_product`.

Business errors are returned in a tool result with `isError: true`. Do not retry by calling REST endpoints. After submitting or materially editing a project, use `get_product` or `list_my_products` to check its review status and wait for the 造场 review before treating it as published.

Manage or revoke personal API keys from the signed-in settings page. Manage OAuth approvals at **开发者接入中心 → 已授权应用**; revocation immediately invalidates that client's MCP access and refresh tokens.
