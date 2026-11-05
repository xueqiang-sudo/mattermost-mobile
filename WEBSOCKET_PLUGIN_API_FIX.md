# WebSocket Plugin API 实现 - 编译修复记录

## 📋 问题概述

智能笔记本实时语音转文本功能使用 WebSocket 路由到插件，但 Plugin API 缺少必要的 WebSocket 方法，导致编译失败。

## 🔍 编译错误

### 错误 1: Plugin API 方法不存在
```
./plugin.go:65:23: p.API.RegisterWebSocketHandler undefined
./plugin.go:66:65: cannot use p.voiceStreamHandler (wrong type)
./plugin.go:86:27: p.API.GetManifest undefined
```

### 错误 2: RPC 层方法缺失
```
../../../server/public/plugin/client_rpc.go:296:19: *apiRPCClient does not implement API
../../../server/public/plugin/supervisor.go:113:16: *apiTimerLayer does not implement API
```

### 错误 3: Server 实现层方法缺失
```
channels/app/plugin.go:167:9: *PluginAPI does not implement plugin.API
```

### 错误 4: WebSocket handler 签名错误
```
channels/web/plugin_websocket.go: multiple errors (Session, App, ResponseWriter)
```

## ✅ 修复方案

### 1. 添加 Plugin API 接口方法

**文件**: `/home/work/mattermost-master/server/public/plugin/api.go`

在 API 接口末尾（第 1639 行前）添加：

```go
// RegisterWebSocketHandler registers a WebSocket handler for the plugin.
// The handler will receive WebSocket connections for the specified plugin type.
// pluginType is a functional type (e.g., "voice-stream"), not the plugin name.
//
// @tag Plugin
// Minimum server version: 10.11
RegisterWebSocketHandler(pluginType string, pluginID string, handler WebSocketHandler) error

// UnregisterWebSocketHandler unregisters a previously registered WebSocket handler.
//
// @tag Plugin
// Minimum server version: 10.11
UnregisterWebSocketHandler(pluginType string, pluginID string) error
}

// WebSocketHandler is the interface that plugins must implement to handle WebSocket connections
type WebSocketHandler interface {
	// HandleWebSocket handles a WebSocket connection
	HandleWebSocket(conn any, userID string, r *http.Request)
}
```

### 2. 添加 RPC 层实现

**文件**: `/home/work/mattermost-master/server/public/plugin/api_timer_layer_generated.go`

在文件末尾添加：

```go
func (api *apiTimerLayer) RegisterWebSocketHandler(pluginType string, pluginID string, handler WebSocketHandler) error {
	startTime := timePkg.Now()
	_returnsA := api.apiImpl.RegisterWebSocketHandler(pluginType, pluginID, handler)
	api.recordTime(startTime, "RegisterWebSocketHandler", _returnsA == nil)
	return _returnsA
}

func (api *apiTimerLayer) UnregisterWebSocketHandler(pluginType string, pluginID string) error {
	startTime := timePkg.Now()
	_returnsA := api.apiImpl.UnregisterWebSocketHandler(pluginType, pluginID)
	api.recordTime(startTime, "UnregisterWebSocketHandler", _returnsA == nil)
	return _returnsA
}
```

**文件**: `/home/work/mattermost-master/server/public/plugin/client_rpc_generated.go`

在文件末尾添加 RPC 客户端和服务端方法：

```go
type Z_RegisterWebSocketHandlerArgs struct {
	A string
	B string
	C WebSocketHandler
}

type Z_RegisterWebSocketHandlerReturns struct {
	A error
}

func (g *apiRPCClient) RegisterWebSocketHandler(pluginType string, pluginID string, handler WebSocketHandler) error {
	_args := &Z_RegisterWebSocketHandlerArgs{pluginType, pluginID, handler}
	_returns := &Z_RegisterWebSocketHandlerReturns{}
	if err := g.client.Call("Plugin.RegisterWebSocketHandler", _args, _returns); err != nil {
		log.Printf("RPC call to RegisterWebSocketHandler API failed: %s", err.Error())
	}
	return _returns.A
}

func (s *apiRPCServer) RegisterWebSocketHandler(args *Z_RegisterWebSocketHandlerArgs, returns *Z_RegisterWebSocketHandlerReturns) error {
	if hook, ok := s.impl.(interface {
		RegisterWebSocketHandler(pluginType string, pluginID string, handler WebSocketHandler) error
	}); ok {
		returns.A = hook.RegisterWebSocketHandler(args.A, args.B, args.C)
		returns.A = encodableError(returns.A)
	} else {
		return encodableError(fmt.Errorf("API RegisterWebSocketHandler called but not implemented."))
	}
	return nil
}

// Similar for UnregisterWebSocketHandler...
```

### 3. 添加 PluginAPI 实现

**文件**: `/home/work/mattermost-master/server/channels/app/plugin_api.go`

添加导入：
```go
import (
	// ... existing imports ...
	"github.com/mattermost/mattermost/server/public/plugin"
)
```

在文件末尾添加方法：

```go
// RegisterWebSocketHandler registers a WebSocket handler for the plugin
func (api *PluginAPI) RegisterWebSocketHandler(pluginType string, pluginID string, handler plugin.WebSocketHandler) error {
	api.logger.Infof("Registering WebSocket handler for plugin type: %s, plugin ID: %s", pluginType, pluginID)
	api.app.RegisterPluginWebSocketHandler(pluginType, pluginID, handler)
	return nil
}

// UnregisterWebSocketHandler unregisters a WebSocket handler for the plugin
func (api *PluginAPI) UnregisterWebSocketHandler(pluginType string, pluginID string) error {
	api.logger.Infof("Unregistering WebSocket handler for plugin type: %s, plugin ID: %s", pluginType, pluginID)
	api.app.UnregisterPluginWebSocketHandler(pluginType, pluginID)
	return nil
}
```

### 4. 添加 App 和 Channels 方法

**文件**: `/home/work/mattermost-master/server/channels/app/plugin_websocket_hub.go`

修改导入和类型定义：

```go
package app

import (
	"sync"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

// PluginWebSocketHandler represents a registered plugin handler
type PluginWebSocketHandler struct {
	PluginID string
	Handler  plugin.WebSocketHandler
}
```

更新方法签名使用 `plugin.WebSocketHandler`。

**文件**: `/home/work/mattermost-master/server/channels/app/plugin.go`

在文件末尾添加：

```go
// RegisterPluginWebSocketHandler registers a WebSocket handler for a plugin
func (ch *Channels) RegisterPluginWebSocketHandler(pluginType string, pluginID string, handler plugin.WebSocketHandler) {
	globalWebSocketHub.RegisterHandler(pluginType, pluginID, handler)
}

// UnregisterPluginWebSocketHandler unregisters a WebSocket handler for a plugin
func (ch *Channels) UnregisterPluginWebSocketHandler(pluginType string, pluginID string) {
	globalWebSocketHub.UnregisterHandler(pluginType, pluginID)
}
```

### 5. 修复 WebSocket Handler

**文件**: `/home/work/mattermost-master/server/channels/web/plugin_websocket.go`

添加导入：
```go
import (
	// ... existing imports ...
	"github.com/mattermost/mattermost/server/public/model"
)
```

修复函数签名和实现：

```go
func (w *Web) handlePluginWebSocket(c *Context, wri http.ResponseWriter, r *http.Request) {
	// 使用 c.App 而不是 w.App
	// 使用 c.AppContext.Session() 而不是 c.Session
	// 使用 wri 作为 ResponseWriter，不是 w
	userID := c.AppContext.Session().UserId
	if userID == "" {
		token := r.URL.Query().Get("token")
		if token != "" {
			session, err := c.App.GetSession(token)
			if err == nil && session != nil {
				userID = session.UserId
			}
		}
		if userID == "" {
			http.Error(wri, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}
	// ... rest of implementation
}
```

### 6. 修复插件代码

**文件**: `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/plugin.go`

使用硬编码的插件 ID 而不是从 Manifest 获取：

```go
// OnActivate
p.voiceStreamHandler = &VoiceStreamHandler{plugin: p}
p.API.RegisterWebSocketHandler("voice-stream", "com.superera.voice-recognition", p.voiceStreamHandler)

// OnDeactivate
if p.voiceStreamHandler != nil {
	p.API.UnregisterWebSocketHandler("voice-stream", "com.superera.voice-recognition")
}
```

**文件**: `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/voice_stream_handler.go`

修复 HandleWebSocket 签名：

```go
func (h *VoiceStreamHandler) HandleWebSocket(connAny any, userID string, r *http.Request) {
	conn, ok := connAny.(*websocket.Conn)
	if !ok {
		h.plugin.API.LogError("WebSocket 连接类型错误")
		return
	}
	// ... rest of implementation
}
```

**文件**: `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/tencent_asr_stream.go`

添加缺少的导入：

```go
import (
	// ... existing imports ...
	"net/http"  // Added for http.Header{}
)
```

**文件**: `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/go.mod`

添加本地 replace 指令：

```go
// Use local server code with new WebSocket Plugin API methods
replace github.com/mattermost/mattermost/server/public => ../../server/public
```

## 📝 修改文件清单

### Server (9 files)
1. `/home/work/mattermost-master/server/public/plugin/api.go` - 添加 API 方法声明
2. `/home/work/mattermost-master/server/public/plugin/api_timer_layer_generated.go` - 添加 timer 层实现
3. `/home/work/mattermost-master/server/public/plugin/client_rpc_generated.go` - 添加 RPC 实现
4. `/home/work/mattermost-master/server/channels/app/plugin_api.go` - 添加 PluginAPI 实现
5. `/home/work/mattermost-master/server/channels/app/plugin.go` - 添加 Channels 方法
6. `/home/work/mattermost-master/server/channels/app/plugin_websocket_hub.go` - 更新类型定义
7. `/home/work/mattermost-master/server/channels/web/plugin_websocket.go` - 修复 handler 实现
8. `/home/work/mattermost-master/server/channels/web/plugin_websocket_init.go` - 路由注册 (已存在)

### Plugin (4 files)
1. `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/plugin.go` - 使用硬编码 ID
2. `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/voice_stream_handler.go` - 修复签名
3. `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/tencent_asr_stream.go` - 添加导入
4. `/home/work/mattermost-master/all-plugin/voice-to-text-plugin/go.mod` - 添加 replace

## 🧪 编译验证

### Plugin 编译
```bash
cd /home/work/mattermost-master/all-plugin/voice-to-text-plugin/server
go build -o /tmp/plugin-test
# ✅ 成功
```

### Server 编译
```bash
cd /home/work/mattermost-master/server
make build
# ✅ 成功
```

## 🔑 关键设计决策

### 1. WebSocketHandler 使用 `any` 类型
```go
HandleWebSocket(conn any, userID string, r *http.Request)
```
- **原因**: Plugin API 是接口，不能依赖具体的 WebSocket 库
- **好处**: 插件可以使用任何 WebSocket 实现
- **插件侧**: 需要类型断言 `conn.(*websocket.Conn)`

### 2. 插件 ID 硬编码
```go
p.API.RegisterWebSocketHandler("voice-stream", "com.superera.voice-recognition", handler)
```
- **原因**: MattermostPlugin 结构体没有 Manifest 字段
- **替代方案**: 使用 build 生成的 manifest 包（复杂）
- **权衡**: 硬编码简单直接，适合单插件场景

### 3. 本地 replace 指令
```go
replace github.com/mattermost/mattermost/server/public => ../../server/public
```
- **原因**: 新 API 方法尚未发布到官方版本
- **好处**: 开发阶段可以直接使用本地代码
- **注意**: 发布前需要移除，等待官方版本发布

## 📚 架构总结

```
插件层                    Plugin API 层              Server 实现层
────────                  ──────────────              ─────────────
VoiceStreamHandler  ───>  API.RegisterWebSocketHandler()
                          ↓
                          apiRPCClient ─────────────> PluginAPI.RegisterWebSocketHandler()
                          ↓                              ↓
                          apiTimerLayer                 App.RegisterPluginWebSocketHandler()
                                                           ↓
                                                         Channels.RegisterPluginWebSocketHandler()
                                                           ↓
                                                         globalWebSocketHub.RegisterHandler()
```

## ✅ 完成状态

- [x] Plugin API 接口方法定义
- [x] RPC 层实现（client + server）
- [x] Timer 层实现
- [x] PluginAPI 实现
- [x] App 和 Channels 方法
- [x] WebSocket Hub 类型更新
- [x] Web handler 实现
- [x] 插件代码修复
- [x] Plugin 编译成功
- [x] Server 编译成功
- [ ] 端到端测试
- [ ] 性能测试

## 🚀 下一步

1. **打包插件**: `make dist` 生成 plugin.tar.gz
2. **上传插件**: 通过管理控制台上传到 Mattermost
3. **配置插件**: 设置腾讯云 ASR 密钥
4. **测试功能**: 在智能笔记本中测试实时语音转文本
5. **性能优化**: 监控延迟和资源使用

---

**修复时间**: 2026-11-05  
**修复人员**: xq_mattermost_server  
**状态**: ✅ 编译成功
