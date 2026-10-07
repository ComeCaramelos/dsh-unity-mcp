# @comecaramelos/dsh-unity-mcp

Connects DSH to the **Unity MCP** server — the `unity-ai-relay` executable the
Unity AI Assistant package (`com.unity.ai.assistant`) installs — through the
stock `@deepseek-ai/dsh-mcp-client` stdio bridge, plus a settings/status card in
the Web GUI.

Every tool the relay registers is exposed as a normal `mcp__unity__*` tool.

## Install

```sh
dsh plugin --profile web add @comecaramelos/dsh-unity-mcp
```

The plugin **does not download anything**: it launches the `unity-ai-relay`
executable your Unity Editor installed. Install the
[Unity AI Assistant](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.0/manual/unity-mcp-get-started.html)
package first, and keep a Unity Editor running — the relay is the Editor's
side-channel, so an Editor that is not running answers
`No Unity Editor connected`.

## Configuration

Settings live under **Settings → Plugins → Plugin configuration → DSH Unity MCP**.

- **Unity relay executable** — the executable the bridge launches. Open the
  picker, hit **Fetch executables** to search this machine (the search also walks
  every Windows user profile visible from a WSL host), and pick one. The pick is
  remembered; applying a different one restarts the connection.
- **Extra flags** — one flag per row, appended after the `--mcp` mode flag the
  bridge always passes, for example `--project-path=/home/roberto/game`,
  `--name=MyProject`, `--log-level=debug`.
- **Reduce log output** — keeps the relay's own progress lines out of the DSH
  console by redirecting its stderr into a log file (turn it off to debug the
  raw output).

Nothing is picked for you: what the saved rows list is what you can pick, and a
path you picked stays picked — if it later stops running it reads broken, it is
never silently re-resolved.

### Windows relay from WSL

A Windows relay launched through the WSL interop mount works like a native one:
it speaks MCP over stdio, so nothing about the connection changes. The card says
so when that is what is running, and reminds you to keep the relay's arguments
(`--log-dir`, and `--project-path` when you pin a project) in their Windows
spelling — the relay resolves them on the Windows side.

## Row configuration

For a per-profile pin, edit the plugin row's `config`:

| Key | Default | Meaning |
| --- | --- | --- |
| `serverName` | `unity` | the bridge's server namespace (tool names are `mcp__<serverName>__<tool>`) |
| `relayPath` | `""` | the executable to launch when the card has never picked one |
| `relayPaths` | the platform's relay locations | the candidate list the **Search executables** run probes |
| `extraFlags` | `[]` | flags appended after the `--mcp` mode flag |
| `command` | `""` | a launcher prefix to wrap the spawn with (the relay needs no wrapper) |
| `env` / `cwd` | `{}` / `""` | passed through to the bridge |
| `toolCallTimeoutMs` | `60000` | per-tool-call timeout |
| `failOnStartupError` | `false` | fail the load when the bridge cannot start |
| `reconnect` | `{ enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 }` | reconnect policy |
| `bridgeStderr` | `"log"` | console-output routing: `"log"` captures stderr into a log file, `"console"` echoes it |
| `bridgeStderrLog` | `""` | log path override for `"log"` mode (absolute paths only) |

The environment variable `DSH_UNITY_MCP_FLAGS` (whitespace-separated) seeds the
launch flags for one run.

## Manual installation

Replace `/path/to/dsh-unity-mcp` with your local checkout:

```sh
mkdir -p ~/.dsh/profiles/web/node_modules/@comecaramelos
ln -s /path/to/dsh-unity-mcp ~/.dsh/profiles/web/node_modules/@comecaramelos/dsh-unity-mcp
```

Add the dependency and bundle to `~/.dsh/profiles/web/package.json`, preserving
existing entries:

```json
{
  "dependencies": {
    "@comecaramelos/dsh-unity-mcp": "link:/path/to/dsh-unity-mcp"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@comecaramelos/dsh-unity-mcp"
      ]
    }
  }
}
```

---

[Contributing](CONTRIBUTING.md) · [License](LICENSE.md)
