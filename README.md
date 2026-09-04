# 原生 DSH hook：PermissionRequest + Stop 各执行一条命令

原生 hook = 一个普通 Cordis 插件，直接订阅 DSH 的类型化拦截事件（不走 shell 命令协议，无序列化边界）。

| 时机 | 原生事件 | 事件种类 | 说明 |
|---|---|---|---|
| PermissionRequest | `tools/pre-execute`（按 `exec.name === 'ask_user_question'` 过滤） | waterfall | agent 调用 `ask_user_question` 工具时 |
| Stop | `agent/turn-stopping` | serial | 本轮自然停止边界（`dsh-agent`） |

插件在触发点**后台执行你配置的命令**（fire-and-forget，`timeoutMs` 兜底），并把决定权原样交还下游——它只做“到点跑命令”，不拦截、不改变 agent 行为。

## 配置字段

```yaml
onPermissionRequest: 'cmd /c "C:\\hooks\\on-permission.bat"'   # ask_user_question 调用时执行
onStop:             'cmd /c "C:\\hooks\\on-stop.bat"'          # 停止时执行
workdir:            'C:\\your\\project'                        # 可选
timeoutMs:          60000                                      # 可选，默认 60000
sandboxMode:        'danger-full-access'                       # 可选，默认 danger-full-access
```

命令通过 `ctx.shell` 执行，默认以 `danger-full-access` 沙箱运行（本机 Windows 的 ACL 沙箱在
workspace=家目录时不可用，走 `workspace-write` 会因无沙箱后端而拒绝执行）。Windows 上
`ctx.shell` 是 pwsh 执行器，所以 `.bat/.cmd` 要用 `cmd /c "..."` 包一层（也可以直接写 pwsh 命令）。
命令可用环境变量拿到上下文：

- `DSH_HOOK_EVENT` — `permission-request` 或 `stop`
- `DSH_HOOK_TOOL` — 触发工具名（permission-request 时为 `ask_user_question`）
- `DSH_HOOK_TURN` — 仅 stop 有（turn 号）

> PermissionRequest 绑定的是 `ask_user_question` 工具调用，与沙箱审批策略无关，任何权限预设下都会触发。

## 用法

1. 把本目录装进 profile：
   ```sh
   dsh plugin --profile web add github:Ghpt6/dsh-hooks
   ```
2. 在 `~\.dsh\cordis.patch.yml` 加一行：
   ```yaml
   - insert:
       - id: dsh-hook
         name: '@Ghpt6/dsh-hooks'
         config:
           onPermissionRequest: 'command'
           onStop: 'command'
   ```
3. 重启 `dsh web` 进程生效。

## 文件

- `hook.body.js` — 动态路径用的插件对象字面量（可直接贴进 `cordis_define`）
- `lib/index.js` — 持久化路径的 ESM 包入口（具名导出 `name`/`inject`/`apply`）
- `package.json` — 持久化路径的最小包清单
