// 原生 DSH hook —— 在 PermissionRequest 与 Stop 两个时机各执行一条命令（bat）。
//
// 用法 A（推荐，免重启，动态 cordis 插件）：
//   在 `cordis` 预设里用 cordis_define，把本文件内容作为 code.host 的“函数体”返回
//   （cordis_define 的 code.host 要求返回一个 Cordis 插件对象，即下面这个对象字面量本身）。
//
// 用法 B（持久化，需重启）：见同目录 lib/index.js 与 README.md。
//
// 配置字段（config）：
//   onPermissionRequest: string   触发点：agent 调用 ask_user_question 工具（权限请求）时执行的命令
//   onStop:              string   触发点 agent/turn-stopping（该停时）执行的命令
//   workdir:             string   命令工作目录（可选；缺省用 executor 默认值）
//   timeoutMs:           number   单条命令超时（默认 60000）
//   sandboxMode:         string   命令执行沙箱模式（默认 'danger-full-access'）
//
// 注意：PermissionRequest = agent 调用 ask_user_question 工具（tools/pre-execute 拦截），
// 与沙箱审批策略无关，任何权限预设下都会触发。

{
  name: 'native-hook-permission-stop',
  inject: ['shell', 'tools'],
  apply(ctx, config) {
    const timeoutMs = (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) ? config.timeoutMs : 60000
    const workdir = (typeof config.workdir === 'string' && config.workdir) ? config.workdir : undefined
    const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

    // 解析命令的沙箱策略：默认 danger-full-access，可经 sandboxMode 覆盖。
    function sandboxPolicy() {
      const mode = SANDBOX_MODES.includes(config.sandboxMode) ? config.sandboxMode : 'danger-full-access'
      const sp = ctx.get('sandboxPolicy')
      if (sp && typeof sp.resolve === 'function') {
        try { return sp.resolve({ mode }) } catch (_) { /* fall through */ }
      }
      return { mode, workspaceRoot: workdir || '.' }
    }

    // 后台执行一条命令（fire-and-forget），不阻塞 agent 循环；超时兜底，失败只告警。
    function runCommand(command, label, env) {
      if (typeof command !== 'string' || command.trim() === '') return
      try {
        const spec = ctx.shell.resolve({ command, workdir, timeoutMs, env, sandboxPolicy: sandboxPolicy() })
        void ctx.shell.run(spec).then(
          (result) => {
            if (result.exitCode === 0) console.log(`[native-hook] ${label}: ok`)
            else console.warn(`[native-hook] ${label}: exit=${result.exitCode} signal=${result.signal}`)
          },
          (err) => console.warn(`[native-hook] ${label}: ${String(err)}`),
        )
      } catch (err) {
        console.warn(`[native-hook] ${label}: resolve failed: ${String(err)}`)
      }
    }

    // PermissionRequest → agent 调用 ask_user_question 工具（tools/pre-execute 瀑布）：
    // 执行命令，然后 next() 放行，不改变工具决策。
    if (config.onPermissionRequest) {
      ctx.on('tools/pre-execute', (exec, next) => {
        if (exec.name === 'ask_user_question') {
          runCommand(config.onPermissionRequest, `permission-request:${exec.name}`, {
            DSH_HOOK_EVENT: 'permission-request',
            DSH_HOOK_TOOL: exec.name,
          })
        }
        return next()
      })
    }

    // Stop → agent/turn-stopping（serial）：执行命令。
    if (config.onStop) {
      ctx.on('agent/turn-stopping', (payload) => {
        runCommand(config.onStop, 'stop', {
          DSH_HOOK_EVENT: 'stop',
          DSH_HOOK_TURN: String(payload.turn),
        })
      })
    }
  },
}
