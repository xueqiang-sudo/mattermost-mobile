# 笔记本功能 · 完整实现方案

> **确认项**：个人笔记本 / 无实时协作 / PC 端优先 / 腾讯 COS 存储
>
> **日期**：2026-10-28

---

## 一、总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端                                  │
├───────────────────────────┬─────────────────────────────────────┤
│  PC (React)               │  Mobile (React Native) Phase 2      │
│  channels/src/components/ │  app/screens/notebook/              │
│  └── notebook/            │  └── (复用 PC 端 API + 原生编辑器)    │
│      ├── editor/          │                                     │
│      │   └── Plate.js     │                                     │
│      ├── sidebar/         │                                     │
│      ├── timeline/        │                                     │
│      └── graph/           │                                     │
└─────────────┬─────────────┴──────────────┬──────────────────────┘
              │  REST + WebSocket          │
              ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Mattermost Server (Go)                        │
│  channels/app/notebook/     ← 业务逻辑层                        │
│  channels/api4/notebook.go  ← REST API                         │
│  channels/store/sqlstore/   ← 数据层                           │
│  platform/shared/filestore/ ← COS 存储（复用现有）              │
├─────────────────────────────────────────────────────────────────┤
│                        数据层                                    │
│  PostgreSQL: notes / note_blocks / note_tags                    │
│  腾讯 COS: 图片/音频/视频/附件（复用 s3store.go）                │
│  Graphiti+Neo4j: 知识图谱（Phase 4）                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、数据模型设计

### 2.1 数据库表结构

```sql
-- 笔记主表
CREATE TABLE IF NOT EXISTS notes (
    id          VARCHAR(26) PRIMARY KEY,  -- snowflake ID
    user_id     VARCHAR(26) NOT NULL,     -- 所属用户（个人笔记本）
    title       VARCHAR(500) DEFAULT '',
    icon        VARCHAR(10) DEFAULT '',   -- emoji icon
    cover_url   VARCHAR(500) DEFAULT '',  -- 封面图 COS URL
    status      VARCHAR(20) DEFAULT 'active',  -- active/archived/deleted
    pinned      BOOLEAN DEFAULT FALSE,
    word_count  INTEGER DEFAULT 0,
    create_at   BIGINT NOT NULL,
    update_at   BIGINT NOT NULL,
    delete_at   BIGINT DEFAULT 0
);

CREATE INDEX idx_notes_user_id ON notes(user_id, delete_at);
CREATE INDEX idx_notes_update_at ON notes(update_at DESC);

-- 笔记内容块表（Block 结构）
CREATE TABLE IF NOT EXISTS note_blocks (
    id          VARCHAR(26) PRIMARY KEY,
    note_id     VARCHAR(26) NOT NULL,
    type        VARCHAR(30) NOT NULL,     -- text/heading/list/image/audio/video/file/table/code/quote/divider/callout/math
    content     TEXT DEFAULT '',           -- 文本内容或 JSON（表格、代码等）
    properties  TEXT DEFAULT '{}',         -- JSON: 块级属性（如 heading level、list style、image caption）
    parent_id   VARCHAR(26) DEFAULT '',   -- 嵌套块的父块 ID（空=顶级块）
    order_num   INTEGER NOT NULL,         -- 排序序号
    create_at   BIGINT NOT NULL,
    update_at   BIGINT NOT NULL,
    delete_at   BIGINT DEFAULT 0
);

CREATE INDEX idx_note_blocks_note_id ON note_blocks(note_id, delete_at);
CREATE INDEX idx_note_blocks_order ON note_blocks(note_id, order_num);

-- 标签表
CREATE TABLE IF NOT EXISTS note_tags (
    id          VARCHAR(26) PRIMARY KEY,
    user_id     VARCHAR(26) NOT NULL,
    note_id     VARCHAR(26) NOT NULL,
    tag_name    VARCHAR(100) NOT NULL,
    create_at   BIGINT NOT NULL
);

CREATE INDEX idx_note_tags_user_id ON note_tags(user_id);
CREATE INDEX idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag_name ON note_tags(user_id, tag_name);

-- 双向链接表
CREATE TABLE IF NOT EXISTS note_links (
    id            VARCHAR(26) PRIMARY KEY,
    source_note_id VARCHAR(26) NOT NULL,  -- 引用方
    target_note_id VARCHAR(26) NOT NULL,  -- 被引用方
    user_id       VARCHAR(26) NOT NULL,
    create_at     BIGINT NOT NULL,
    delete_at     BIGINT DEFAULT 0
);

CREATE INDEX idx_note_links_source ON note_links(source_note_id, delete_at);
CREATE INDEX idx_note_links_target ON note_links(target_note_id, delete_at);

-- 事件/事实表（Phase 3 时间线）
CREATE TABLE IF NOT EXISTS note_events (
    id            VARCHAR(26) PRIMARY KEY,
    note_id       VARCHAR(26) NOT NULL,
    block_id      VARCHAR(26) DEFAULT '',  -- 关联的块（可选）
    user_id       VARCHAR(26) NOT NULL,
    event_time    BIGINT NOT NULL,         -- 事件发生时间
    event_end_time BIGINT DEFAULT 0,       -- 事件结束时间（0=时间点事件）
    entity_type   VARCHAR(50) DEFAULT '',  -- 实体类型：person/project/location/file
    entity_id     VARCHAR(100) DEFAULT '', -- 实体标识
    entity_name   VARCHAR(200) DEFAULT '', -- 实体名称
    relation      VARCHAR(50) DEFAULT '',  -- 关系类型：参与/负责/产生/影响
    source        VARCHAR(20) DEFAULT 'manual', -- manual/ai_extracted
    confirmed     BOOLEAN DEFAULT TRUE,    -- AI 提取需用户确认
    create_at     BIGINT NOT NULL,
    delete_at     BIGINT DEFAULT 0
);

CREATE INDEX idx_note_events_user_time ON note_events(user_id, event_time);
CREATE INDEX idx_note_events_entity ON note_events(entity_type, entity_id);
```

### 2.2 Go Model 定义

```go
// server/public/model/note.go
type Note struct {
    Id        string `json:"id"`
    UserId    string `json:"user_id"`
    Title     string `json:"title"`
    Icon      string `json:"icon"`
    CoverUrl  string `json:"cover_url"`
    Status    string `json:"status"`
    Pinned    bool   `json:"pinned"`
    WordCount int    `json:"word_count"`
    CreateAt  int64  `json:"create_at"`
    UpdateAt  int64  `json:"update_at"`
    DeleteAt  int64  `json:"delete_at"`
}

type NoteBlock struct {
    Id         string `json:"id"`
    NoteId     string `json:"note_id"`
    Type       string `json:"type"`
    Content    string `json:"content"`
    Properties string `json:"properties"`  // JSON string
    ParentId   string `json:"parent_id"`
    OrderNum   int    `json:"order_num"`
    CreateAt   int64  `json:"create_at"`
    UpdateAt   int64  `json:"update_at"`
    DeleteAt   int64  `json:"delete_at"`
}

type NoteTag struct {
    Id       string `json:"id"`
    UserId   string `json:"user_id"`
    NoteId   string `json:"note_id"`
    TagName  string `json:"tag_name"`
    CreateAt int64  `json:"create_at"`
}

type NoteLink struct {
    Id           string `json:"id"`
    SourceNoteId string `json:"source_note_id"`
    TargetNoteId string `json:"target_note_id"`
    UserId       string `json:"user_id"`
    CreateAt     int64  `json:"create_at"`
    DeleteAt     int64  `json:"delete_at"`
}

type NoteEvent struct {
    Id           string `json:"id"`
    NoteId       string `json:"note_id"`
    BlockId      string `json:"block_id"`
    UserId       string `json:"user_id"`
    EventTime    int64  `json:"event_time"`
    EventEndTime int64  `json:"event_end_time"`
    EntityType   string `json:"entity_type"`
    EntityId     string `json:"entity_id"`
    EntityName   string `json:"entity_name"`
    Relation     string `json:"relation"`
    Source       string `json:"source"`
    Confirmed    bool   `json:"confirmed"`
    CreateAt     int64  `json:"create_at"`
    DeleteAt     int64  `json:"delete_at"`
}
```

---

## 三、API 设计

### 3.1 REST API

```
# 笔记 CRUD
GET    /api/v4/users/me/notes                    # 笔记列表（分页、搜索、排序）
POST   /api/v4/users/me/notes                    # 创建笔记
GET    /api/v4/users/me/notes/{note_id}          # 获取笔记详情（含 blocks）
PUT    /api/v4/users/me/notes/{note_id}          # 更新笔记元数据（title/icon/pinned）
DELETE /api/v4/users/me/notes/{note_id}          # 软删除
POST   /api/v4/users/me/notes/{note_id}/duplicate # 复制笔记

# 笔记块 CRUD
GET    /api/v4/users/me/notes/{note_id}/blocks   # 获取所有块
POST   /api/v4/users/me/notes/{note_id}/blocks   # 批量保存块（全量替换或增量更新）
PUT    /api/v4/users/me/notes/{note_id}/blocks/{block_id}  # 更新单个块
DELETE /api/v4/users/me/notes/{note_id}/blocks/{block_id}  # 删除单个块

# 标签
GET    /api/v4/users/me/notes/tags               # 获取用户所有标签
POST   /api/v4/users/me/notes/{note_id}/tags     # 为笔记添加标签
DELETE /api/v4/users/me/notes/{note_id}/tags/{tag_id}  # 删除标签

# 双向链接
GET    /api/v4/users/me/notes/{note_id}/links     # 获取笔记的引用关系
GET    /api/v4/users/me/notes/{note_id}/backlinks # 获取引用了本笔记的笔记

# 媒体上传（复用现有 COS 逻辑）
POST   /api/v4/users/me/notes/upload             # 上传文件到 COS，返回 URL
GET    /api/v4/users/me/notes/upload/{file_id}   # 获取 COS 预签名 URL

# 时间线（Phase 3）
GET    /api/v4/users/me/notes/timeline           # 时间线查询
POST   /api/v4/users/me/notes/{note_id}/events   # 创建/更新事件

# AI 抽取（Phase 4）
POST   /api/v4/users/me/notes/{note_id}/extract  # 触发 AI 实体抽取
GET    /api/v4/users/me/notes/{note_id}/events/pending  # 待确认的 AI 提取事件
POST   /api/v4/users/me/notes/events/{event_id}/confirm # 确认 AI 提取
```

### 3.2 WebSocket 事件

```
note_updated      → 通知其他设备刷新笔记列表
note_deleted      → 通知其他设备删除笔记
```

---

## 四、服务端修改清单（Go）

### 4.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `server/public/model/note.go` | Note/NoteBlock/NoteTag/NoteLink/NoteEvent 模型定义 |
| `server/public/model/note_test.go` | 模型验证测试 |
| `server/channels/store/store.go` | 添加 NoteStore 接口到 Store 总接口 |
| `server/channels/store/sqlstore/note_store.go` | SQL 实现：笔记 CRUD + 搜索 |
| `server/channels/store/sqlstore/note_block_store.go` | SQL 实现：块 CRUD + 批量保存 |
| `server/channels/store/sqlstore/note_tag_store.go` | SQL 实现：标签 CRUD |
| `server/channels/store/sqlstore/note_link_store.go` | SQL 实现：双向链接 |
| `server/channels/store/sqlstore/note_event_store.go` | SQL 实现：事件/时间线 |
| `server/channels/app/notebook.go` | 业务逻辑层：编排 store + COS + WebSocket |
| `server/channels/api4/notebook.go` | REST API handler（路由注册） |
| `server/channels/api4/notebook_test.go` | API 集成测试 |
| `server/channels/db/migrations/postgres/000208_create_notes.up.sql` | 建表迁移 |
| `server/channels/db/migrations/postgres/000208_create_notes.down.sql` | 回滚迁移 |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `server/channels/store/sqlstore/store.go` | 注册 NoteStore 到 SqlStore 初始化 |
| `server/channels/app/app.go` | 添加 notebook 相关的 app 方法代理 |
| `server/channels/api4/api.go` | 在 InitApi() 中调用 `api.InitNotebook()` |
| `server/channels/api4/routes.go` | 添加 `/users/{user_id}/notes` 路由组 |
| `server/channels/web/web.go` | 如需要，添加 WebSocket 事件处理 |
| `server/public/model/client.go` | 添加 notebook 相关的客户端方法签名 |

### 4.3 媒体上传（COS）

**不需要新增 COS 代码**。复用现有 `FileBackend` 接口（底层为 `S3FileBackend`，使用腾讯 COS SDK `github.com/tencentyun/cos-go-sdk-v5`）。

关键接口（`platform/shared/filestore/filesstore.go`）：

```go
type FileBackend interface {
    WriteFile(fr io.Reader, path string) (int64, error)
    Reader(path string) (ReadCloseSeeker, error)
    ReadFile(path string) ([]byte, error)
    FileExists(path string) (bool, error)
    RemoveFile(path string) error
    CopyFile(oldPath, newPath string) error
    MoveFile(oldPath, newPath string) error
    // ...
}

type FileBackendWithLinkGenerator interface {
    GeneratePublicLink(path string) (string, time.Duration, error)
}
```

notebook.go 中的上传逻辑示例：

```go
func (a *App) UploadNoteMedia(userId string, file io.Reader, filename string) (string, error) {
    // 生成 COS 路径，与 Drive 的路径模式一致
    fileId := model.NewId()
    ext := filepath.Ext(filename)
    cosPath := fmt.Sprintf("notebook/%s/%s/%s%s",
        userId,
        time.Now().Format("2006/01"),
        fileId,
        ext,
    )

    // 复用现有 FileBackend 写入 COS
    // 底层调用 S3FileBackend.WriteFile → cos.Client.Object.Put()
    _, err := a.FileBackend().WriteFile(file, cosPath)
    if err != nil {
        return "", errors.Wrap(err, "upload_note_media")
    }

    // 生成预签名 URL（COS SDK 的 GetPresignedURL）
    // 或直接使用 CDN URL（如果配置了 AmazonS3CDNURL）
    if linkGen, ok := a.FileBackend().(filestore.FileBackendWithLinkGenerator); ok {
        url, _, err := linkGen.GeneratePublicLink(cosPath)
        return url, err
    }

    return cosPath, nil
}
```

COS 路径规范：
- 笔记本媒体文件路径：`notebook/{user_id}/{年/月}/{fileId}{.ext}`
- 与云盘路径 `drive/{team_id}/...` 完全隔离
- COS 对象 key 不含中文/空格，避免编码问题

---

## 五、PC 端修改清单（React）

### 5.1 新增文件

```
webapp/channels/src/components/notebook/
├── index.tsx                    # 笔记本入口（侧边栏面板或独立页面）
├── notebook_api.ts              # API 调用层（对标 drive_api.ts）
├── types.ts                     # TypeScript 类型定义
│
├── sidebar/
│   ├── notebook_sidebar.tsx     # 左侧笔记列表
│   ├── note_item.tsx            # 单条笔记卡片
│   ├── search_bar.tsx           # 搜索框
│   └── tag_filter.tsx           # 标签筛选
│
├── editor/
│   ├── note_editor.tsx          # 编辑器主容器
│   ├── plate_config.ts          # Plate.js 插件配置
│   ├── toolbar.tsx              # 顶部工具栏（B/I/U/H1/列表/代码/表格/...）
│   ├── slash_menu.tsx           # / 命令菜单
│   ├── blocks/
│   │   ├── text_block.tsx       # 段落块
│   │   ├── heading_block.tsx    # 标题块
│   │   ├── list_block.tsx       # 列表块
│   │   ├── image_block.tsx      # 图片块（上传+预览）
│   │   ├── audio_block.tsx      # 音频块
│   │   ├── video_block.tsx      # 视频块
│   │   ├── file_block.tsx       # 文件附件块
│   │   ├── table_block.tsx      # 表格块
│   │   ├── code_block.tsx       # 代码块
│   │   ├── quote_block.tsx      # 引用块
│   │   ├── callout_block.tsx    # 提示框块
│   │   ├── math_block.tsx       # 公式块
│   │   ├── divider_block.tsx    # 分割线块
│   │   └── embed_block.tsx      # 嵌入块（Post/网页引用）
│   └── plugins/
│       ├── with_drag_drop.ts    # 拖拽排序插件
│       ├── with_markdown.ts     # Markdown 快捷输入插件
│       ├── with_paste.ts        # 富文本粘贴处理
│       └── with_slash_cmd.ts    # 斜杠命令插件
│
├── timeline/                    # Phase 3
│   ├── timeline_view.tsx        # 时间线视图
│   └── event_card.tsx           # 事件卡片
│
├── graph/                       # Phase 5
│   ├── graph_view.tsx           # 知识图谱视图（React Flow）
│   └── node_types.tsx           # 自定义节点类型
│
└── hooks/
    ├── use_notes.ts             # 笔记列表 hook
    ├── use_note.ts              # 单条笔记 hook
    ├── use_blocks.ts            # 块数据 hook
    ├── use_autosave.ts          # 自动保存 hook
    └── use_tags.ts              # 标签 hook
```

### 5.2 新增 npm 依赖

```json
{
  "@udecode/plate": "^38.0.0",        // Plate.js 编辑器核心
  "@udecode/plate-alignment": "^38.0.0",
  "@udecode/plate-autoformat": "^38.0.0",
  "@udecode/plate-basic-marks": "^38.0.0",
  "@udecode/plate-block-quote": "^38.0.0",
  "@udecode/plate-break": "^38.0.0",
  "@udecode/plate-code-block": "^38.0.0",
  "@udecode/plate-combobox": "^38.0.0",
  "@udecode/plate-dnd": "^38.0.0",
  "@udecode/plate-heading": "^38.0.0",
  "@udecode/plate-highlight": "^38.0.0",
  "@udecode/plate-horizontal-rule": "^38.0.0",
  "@udecode/plate-image": "^38.0.0",
  "@udecode/plate-indent-list": "^38.0.0",
  "@udecode/plate-link": "^38.0.0",
  "@udecode/plate-list": "^38.0.0",
  "@udecode/plate-media": "^38.0.0",
  "@udecode/plate-mention": "^38.0.0",
  "@udecode/plate-paragraph": "^38.0.0",
  "@udecode/plate-slash-command": "^38.0.0",
  "@udecode/plate-table": "^38.0.0",
  "@udecode/plate-trailing-block": "^38.0.0",
  "slate": "^0.103.0",
  "slate-history": "^0.100.0",
  "slate-react": "^0.108.0",
  "reactflow": "^11.11.0",             // 知识图谱可视化（Phase 5）
  "katex": "^0.16.9",                  // LaTeX 公式渲染
  "prismjs": "^1.29.0",               // 代码高亮
  "react-dnd": "^16.0.0"              // 拖拽
}
```

### 5.3 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `webapp/channels/src/components/sidebar/workbench_panel/` | 添加笔记本入口 tab |
| `webapp/channels/src/components/app.tsx` | 注册笔记本路由 |
| `webapp/channels/src/i18n/en.json` / `zh.json` | 添加笔记本相关国际化文案 |
| `webapp/channels/src/sass/` | 添加笔记本样式文件 |

---

## 六、移动端修改清单（React Native）—— Phase 2

### 6.1 新增文件

```
app/screens/notebook/
├── notebook_list.tsx            # 笔记列表页
├── note_editor.tsx              # 编辑器页（基于 tentap-editor）
├── notebook_api.ts              # API 调用层
├── components/
│   ├── note_card.tsx            # 列表卡片
│   ├── editor_toolbar.tsx       # 底部工具栏
│   ├── slash_menu.tsx           # / 命令菜单（BottomSheet）
│   ├── media_picker.tsx         # 媒体选择器
│   └── block_renderers.tsx     # 块渲染器（text/image/audio/video）
└── hooks/
    └── use_offline_sync.ts      # 离线编辑同步

app/database/models/
├── Note.ts                      # WatermelonDB Model
├── NoteBlock.ts                 # WatermelonDB Model
└── NoteTag.ts                   # WatermelonDB Model

app/database/schema/
└── notebook_schema.ts           # WatermelonDB Schema
```

### 6.2 新增 npm 依赖

```json
{
  "@10play/tentap-editor": "^0.5.0",  // RN 富文本编辑器
  "react-native-webview": "^13.0.0"    // tentap-editor 依赖（如果尚未安装）
}
```

---

## 七、开发顺序（Phase 1：PC 端核心功能）

```
Week 1-2: 服务端基础
├── [1] 数据库迁移 + Model 定义
├── [2] NoteStore / NoteBlockStore SQL 实现
├── [3] notebook.go 业务逻辑
├── [4] REST API handler
├── [5] 媒体上传（复用 COS）
└── 验证: curl 测试全部 API

Week 3-4: PC 端编辑器
├── [1] Plate.js 集成 + 基础 Block 类型
├── [2] 工具栏 + 斜杠命令
├── [3] 图片/文件上传到 COS
├── [4] 自动保存（防抖 2s）
├── [5] 笔记列表侧边栏
└── 验证: 创建/编辑/删除笔记全流程

Week 5: 标签 + 双向链接
├── [1] 标签 CRUD
├── [2] [[ 双向链接语法解析
├── [3] 反向链接面板
└── 验证: 标签筛选 + 链接跳转

Week 6: 时间线视图
├── [1] 事件 CRUD API
├── [2] 时间线视图 UI
├── [3] 事件手动添加/编辑
└── 验证: 按时间查看笔记事件
```

---

## 八、关键设计决策

### 8.1 块存储策略：全量替换 vs 增量更新

**推荐：全量替换**

每次保存时，客户端发送完整的 blocks 数组，服务端：
1. 对比新旧 blocks
2. 新增的新块 → INSERT
3. 已有的块 → UPDATE（如果 content/properties/order 变了）
4. 删除的块 → 软 DELETE

原因：
- 客户端实现简单（不需要跟踪 diff）
- 无实时协作，不存在并发冲突
- 一次保存通常只有几十个块，性能可接受

### 8.2 自动保存策略

```
用户停止输入 2 秒 → 自动保存
保存失败 → 显示 toast，本地缓存未保存数据
页面离开前 → 立即保存未保存的变更
```

### 8.3 离线支持（移动端）

- WatermelonDB 本地存储完整笔记副本
- 在线时：直接读写服务端，同步到本地
- 离线时：写入本地队列，上线后批量同步
- 冲突解决：以服务端为准（个人笔记本，冲突概率极低）

### 8.4 AI 实体抽取成本控制

```
触发条件：
  1. 用户手动点击「提取实体」按钮
  2. 笔记保存后异步执行（可选开关）

流程：
  笔记内容 → LLM 提取实体/关系 → 写入 note_events (confirmed=false)
  → 用户在笔记侧边栏看到「AI 发现 N 个关联」→ 逐条确认/拒绝
  → 确认后写入 note_events (confirmed=true)

成本估算：
  每条笔记约 2000-5000 tokens
  使用千问/DeepSeek，每万 token 约 ¥0.01-0.05
  1000 条笔记 ≈ ¥1-5
```

---

## 九、安全与权限

```
1. 笔记只能属于创建者（user_id 校验）
2. API 层统一校验 session.user_id == note.user_id
3. COS 路径隔离：notebook/{user_id}/...，不跨用户
4. COS 预签名 URL 有效期 1 小时
5. 软删除 + 30 天后硬删除（可恢复期）
6. WebSocket 事件只推送给同一用户（多设备同步）
```

---

## 十、与现有功能集成点

| 功能 | 集成方式 |
|------|---------|
| 云盘 | 笔记中可引用云盘文件（FileBlock 选择器调用现有 `drive_file_picker_modal`） |
| 知识库 | 笔记中可引用知识库文档（EmbedBlock） |
| 聊天消息 | Post 右键菜单 →「收藏到笔记本」 |
| @提及 | 笔记内容 @某人 → 复用 Mattermost mention 通知系统 |
| 文件上传 | 复用现有 `S3FileBackend.WriteFile()` 和 COS 预签名 URL |
| 搜索 | 复用 Mattermost 搜索基础设施，添加 notes 表到搜索范围 |
