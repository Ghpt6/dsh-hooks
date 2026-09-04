// 与 hook.body.js 相同的逻辑，但以 ESM 具名导出形式，供“组合文件持久化”路径作为包入口。
// 安装后作为 cordis.yml 的一行（见 README.md）。

export const name = 'hook-permission-stop'

export const inject = ['shell', 'tools']

export function apply(ctx, config) {
  const timeoutMs = (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) ? config.timeoutMs : 60000
  const workdir = (typeof config.workdir === 'string' && config.workdir) ? config.workdir : undefined
  const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

  function sandboxPolicy() {
    const mode = SANDBOX_MODES.includes(config.sandboxMode) ? config.sandboxMode : 'danger-full-access'
    const sp = ctx.get('sandboxPolicy')
    if (sp && typeof sp.resolve === 'function') {
      try { return sp.resolve({ mode }) } catch (_) { /* fall through */ }
    }
    return { mode, workspaceRoot: workdir || '.' }
  }

  function runCommand(command, label, env) {
    if (typeof command !== 'string' || command.trim() === '') return
    try {
      const spec = ctx.shell.resolve({ command, workdir, timeoutMs, env, sandboxPolicy: sandboxPolicy() })
      void ctx.shell.run(spec).then(
        (result) => {
          if (result.exitCode === 0) console.log(`[hook] ${label}: ok`)
          else console.warn(`[hook] ${label}: exit=${result.exitCode} signal=${result.signal}`)
        },
        (err) => console.warn(`[hook] ${label}: ${String(err)}`),
      )
    } catch (err) {
      console.warn(`[hook] ${label}: resolve failed: ${String(err)}`)
    }
  }

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

  if (config.onStop) {
    ctx.on('agent/turn-stopping', (payload) => {
      runCommand(config.onStop, 'stop', {
        DSH_HOOK_EVENT: 'stop',
        DSH_HOOK_TURN: String(payload.turn),
      })
    })
  }
}
