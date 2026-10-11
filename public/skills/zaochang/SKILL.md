---
name: zaochang-agent-connect
description: Use 造场 MCP tools to list, submit, and update projects owned by the signed-in user's personal API key, and check their review status.
---

# 造场 Agent 接入

Use this skill when the user asks you to submit a project to 造场, edit one of their projects, check its review status, or upload a project cover.

## Get and store a key

1. Sign in to 造场 in a browser and open **个人主页 → 编辑资料 → Agent API key** (`/profile/edit`).
2. Create a key with a 30, 90, or 365 day lifetime. The plaintext is shown once; copy it before leaving the page.
3. Save it as the local environment variable `ZAOCHANG_API_KEY` or in the operating system's secret manager. Do not put the value in a project file, source code, prompt log, or repository.
4. Use the public MCP endpoint `<PUBLIC_APP_ORIGIN>/api/mcp` shown in the settings page. Personal keys work only through this MCP endpoint; they do not authorize the site's REST APIs.

For PowerShell, set the variable in the current terminal before launching an agent:

```powershell
$env:ZAOCHANG_API_KEY = Read-Host "造场 API key"
```

For Bash or zsh, use a local secret manager or a private shell environment, not a tracked repository file:

```sh
export ZAOCHANG_API_KEY="$(your-secret-manager read zaochang/api-key)"
```

## Connect an MCP client

Claude Code over HTTP:

```sh
claude mcp add --transport http zaochang "<PUBLIC_APP_ORIGIN>/api/mcp" --header "Authorization: Bearer ${ZAOCHANG_API_KEY}"
```

Codex `config.toml` entry:

```toml
[mcp_servers.zaochang]
url = "<PUBLIC_APP_ORIGIN>/api/mcp"
http_headers = { Authorization = "Bearer ${ZAOCHANG_API_KEY}" }
```

Cursor or a generic MCP client:

```json
{
  "mcpServers": {
    "zaochang": {
      "url": "<PUBLIC_APP_ORIGIN>/api/mcp",
      "headers": {
        "Authorization": "Bearer ${ZAOCHANG_API_KEY}"
      }
    }
  }
}
```

Client configuration support for environment-variable expansion differs. If a client does not expand `${ZAOCHANG_API_KEY}`, use its secret/environment-variable UI or paste the key there without saving it in a repository file.

## Call MCP without a client

Send JSON-RPC 2.0 POST requests to `<PUBLIC_APP_ORIGIN>/api/mcp`. The endpoint returns JSON (no SSE). Example: list the tools.

```sh
curl -sS "<PUBLIC_APP_ORIGIN>/api/mcp" \
  -H "Authorization: Bearer ${ZAOCHANG_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Example: submit a project.

```sh
curl -sS "<PUBLIC_APP_ORIGIN>/api/mcp" \
  -H "Authorization: Bearer ${ZAOCHANG_API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_product","arguments":{"title":"My project","description":"A clear description of what the project does and who it helps.","category":"开发工具"}}}'
```

## Available tools

- `list_my_products`: list only the key owner's projects, including `status`, `review_status`, `review_version`, and `approved_version`.
- `get_product(id)`: read a project only when its `owner_email` matches the key owner.
- `create_product(title, description, category, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: submit a new project. `category` is one of `效率工具`, `互动体验`, `声音影像`, `生活方式`, or `开发工具`.
- `update_product(id, title?, description?, category?, demo_url?, pricing_model?, price?, cover_theme?, cover_upload_key?)`: edit only the key owner's project. Editing an approved project sends the changed version back for review.
- `upload_cover(filename, mime_type, data_base64)`: submit a PNG, JPEG, or WebP cover for scanning. Use the returned `cover_upload_key` with `create_product` or `update_product`.

Business errors are returned in a tool result with `isError: true`. Do not retry by calling REST endpoints. After submitting or materially editing a project, use `get_product` or `list_my_products` to check its review status and wait for the 造场 review before treating it as published.

Manage, inspect, or revoke keys only from the signed-in settings page. OAuth-based MCP authorization is not part of this release.
