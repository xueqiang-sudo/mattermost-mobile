# 笔记本功能优化方案 - 富媒体混排 + 知识图谱

## 核心目标

打造一个**个人知识管理系统**，支持：
- 富媒体混排编辑（文字、图片、音视频、表格）
- 内容版本控制和元数据管理
- 基于时间线的知识关联
- 知识图谱可视化展示

---

## 第一阶段：富媒体混排编辑器

### 1.1 编辑器架构

**选型建议**：使用 **Slate.js** 或 **Prosemirror** 改造移动版本

两者对比：

| 方面 | Slate.js | Prosemirror |
|------|----------|-----------|
| 学习曲线 | 平缓 | 陡峭 |
| 移动支持 | 需自己适配 | 有社区方案 |
| 自定义程度 | 高 | 极高 |
| 社区活跃度 | 活跃 | 非常活跃 |
| 适合场景 | 快速原型 | 企业级应用 |

**推荐方案**：在Mattermost框架内集成 **Draft.js** (Facebook) 或自建轻量级编辑器

### 1.2 数据结构设计

```typescript
// 笔记内容块（Block-based 结构）
interface NoteBlock {
  id: string;              // 唯一标识
  type: 'text' | 'image' | 'video' | 'audio' | 'table' | 'code' | 'embed';
  content: any;            // 根据类型存储内容
  metadata: {
    createdAt: number;
    updatedAt: number;
    tags: string[];        // 标签
    mentions: string[];    // @提及的笔记ID
    relatedIds: string[];  // 关联的笔记ID
    timeline?: {
      startDate: number;   // 时间线开始
      endDate?: number;    // 时间线结束
      events: TimelineEvent[]; // 关键事件
    };
  };
}

// 文本块
interface TextBlock extends NoteBlock {
  type: 'text';
  content: {
    text: string;
    format: 'plain' | 'rich'; // 是否包含样式
    styles?: RichTextStyle[];  // 加粗、斜体等
  };
}

// 图片块
interface ImageBlock extends NoteBlock {
  type: 'image';
  content: {
    uri: string;          // 图片URL或本地路径
    caption?: string;     // 图片描述
    width?: number;
    height?: number;
    ocrText?: string;     // OCR提取的文本（用于搜索）
  };
}

// 表格块
interface TableBlock extends NoteBlock {
  type: 'table';
  content: {
    rows: number;
    columns: number;
    cells: TableCell[][];
  };
}

// 时间线事件
interface TimelineEvent {
  id: string;
  date: number;
  title: string;
  description: string;
  relatedNoteIds?: string[];
}

// 笔记文档
interface Note {
  id: string;
  title: string;
  content: NoteBlock[];  // Block数组
  metadata: {
    createdAt: number;
    updatedAt: number;
    owner: string;
    isPublic: boolean;
    tags: string[];
    timeline?: Timeline;
    related: {
      byTag: Map<string, string[]>;      // 标签关联
      byTime: TimelineRelation[];         // 时间关联
      byMention: Map<string, string[]>;   // 提及关联
    };
  };
  versions?: NoteVersion[];  // 版本历史
}

// 时间线关联
interface TimelineRelation {
  sourceNoteId: string;
  targetNoteId: string;
  date: number;
  type: 'before' | 'after' | 'simultaneous' | 'related';
  strength: number; // 0-1 关联强度
}
```

### 1.3 开源方案整合

**推荐的开源库组合**：

1. **编辑器核心** - Slate.js + React Native 适配
   ```bash
   npm install slate slate-react
   # 或
   npm install prosemirror-model prosemirror-view prosemirror-state
   ```

2. **富文本渲染** - Quill Editor
   ```bash
   npm install quill react-quill
   ```

3. **表格编辑** - Handsontable
   ```bash
   npm install handsontable
   ```

4. **Markdown 支持** - unified + remark
   ```bash
   npm install unified remark remark-parse remark-stringify
   ```

5. **数据存储** - 选择其中一个
   - **SQLite** (离线优先，本地存储)
   - **RxDB** (PouchDB，支持同步)
   - **ManyWho** (本地第一数据库)

---

## 第二阶段：知识关联引擎

### 2.1 关联策略

**四种关联维度**：

#### 1. 标签关联
```typescript
// 自动发现相同标签的笔记
function findRelatedByTag(noteId: string): string[] {
  const note = notes.get(noteId);
  const tags = note.metadata.tags;
  
  return Array.from(notes.values())
    .filter(n => n.id !== noteId)
    .filter(n => n.metadata.tags.some(t => tags.includes(t)))
    .map(n => n.id);
}
```

#### 2. 时间线关联
```typescript
// 基于时间顺序建立关联
function findRelatedByTimeline(noteId: string, timeDelta: number = 7*24*60*60*1000): string[] {
  const note = notes.get(noteId);
  const timeline = note.metadata.timeline;
  
  if (!timeline) return [];
  
  const timeRange = [timeline.startDate - timeDelta, timeline.endDate + timeDelta];
  
  return Array.from(notes.values())
    .filter(n => {
      const nTimeline = n.metadata.timeline;
      return nTimeline && 
             nTimeline.startDate >= timeRange[0] && 
             nTimeline.endDate <= timeRange[1];
    })
    .map(n => n.id);
}
```

#### 3. 提及关联（@笔记名）
```typescript
// 在编辑器中支持 @mention 其他笔记
// 自动生成双向引用
function processMentions(noteId: string, content: NoteBlock[]): string[] {
  const mentionPattern = /@\[([^\]]+)\]\(([^\)]+)\)/g;
  const mentions = new Set<string>();
  
  content.forEach(block => {
    if (block.type === 'text') {
      let match;
      while ((match = mentionPattern.exec(block.content.text))) {
        mentions.add(match[2]); // 捕获笔记ID
      }
    }
  });
  
  return Array.from(mentions);
}
```

#### 4. 内容相似度关联
```typescript
// 使用 TF-IDF 或向量相似度计算
// 推荐库：compromise.js, natural.js
import natural from 'natural';

function findSimilarNotes(noteId: string, topN: number = 5): string[] {
  const note = notes.get(noteId);
  const query = extractText(note.content);
  const tfidf = new natural.TfIdf();
  
  Array.from(notes.values()).forEach(n => {
    tfidf.addDocument(extractText(n.content));
  });
  
  tfidf.tfidfs(query, (i, score) => {
    // 排序返回相似度最高的N条
  });
}
```

### 2.2 关联强度计算

```typescript
interface RelationScore {
  tag: number;        // 标签匹配度（0-1）
  timeline: number;   // 时间邻近度（0-1）
  mention: number;    // 提及关系（0-1）
  content: number;    // 内容相似度（0-1）
}

function calculateRelationStrength(
  sourceId: string,
  targetId: string,
  weights = {tag: 0.3, timeline: 0.2, mention: 0.3, content: 0.2}
): number {
  const score: RelationScore = {
    tag: calculateTagSimilarity(sourceId, targetId),
    timeline: calculateTimelineSimilarity(sourceId, targetId),
    mention: hasMentionRelation(sourceId, targetId) ? 1 : 0,
    content: calculateContentSimilarity(sourceId, targetId),
  };
  
  return Object.entries(weights).reduce((acc, [key, weight]) => {
    return acc + score[key as keyof RelationScore] * weight;
  }, 0);
}
```

---

## 第三阶段：知识图谱可视化

### 3.1 图谱展示库

**推荐方案**：

1. **D3.js** - 强大但陡峭
   ```bash
   npm install d3
   ```

2. **Cytoscape.js** - 图表优化
   ```bash
   npm install cytoscape cytoscape-cose-bilkent
   ```

3. **Vis.js** - React友好
   ```bash
   npm install vis-network
   ```

4. **G6** (蚂蚁金服) - 移动友好 ⭐ 推荐
   ```bash
   npm install @antv/g6
   ```

5. **Force-Graph** - 简洁高效
   ```bash
   npm install force-graph
   ```

**推荐选择 G6 或 Vis.js**，因为它们对React和移动有较好的支持。

### 3.2 图谱数据结构

```typescript
interface GraphNode {
  id: string;
  label: string;
  type: 'note' | 'tag' | 'event' | 'person';
  size: number;  // 基于关联数量
  color: string; // 基于类型或热度
  metadata: {
    created: number;
    updated: number;
    relationCount: number;
  };
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;  // 关联强度
  type: 'tag' | 'timeline' | 'mention' | 'similar';
  label?: string;
}

interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    centerNodeId?: string;  // 焦点笔记
    depth: number;          // 展示深度（1-3层）
  };
}
```

### 3.3 时间线可视化

```typescript
interface TimelineNode {
  id: string;
  date: number;
  title: string;
  description: string;
  noteIds: string[];      // 关联的笔记
  importance: number;     // 0-1 重要程度
  tags: string[];
}

interface TimelineView {
  nodes: TimelineNode[];
  range: {
    start: number;
    end: number;
  };
  groupBy: 'day' | 'week' | 'month' | 'year';
}
```

---

## 第四阶段：实现路线图

### Phase 1：核心编辑器（2-3周）

```
1. 搭建Block-based编辑器框架
   - 基础文本编辑
   - 图片插入和管理
   - 数据持久化到SQLite

2. 扩展功能
   - 视频/音频块
   - 表格编辑
   - 代码高亮

3. 版本控制
   - 自动保存版本
   - 版本对比
```

### Phase 2：知识关联（2周）

```
1. 实现关联引擎
   - 标签关联
   - @mention 系统
   - 时间线关联

2. 关联强度计算
   - 权重调优
   - 性能优化

3. 关联UI
   - 相关笔记面板
   - 关联预览
```

### Phase 3：知识图谱（2-3周）

```
1. 图谱生成
   - 从关联数据构建图
   - 递归展示（深度限制）

2. 交互功能
   - 节点/边点击
   - 缩放/平移
   - 筛选关联类型

3. 时间线视图
   - 时间线渲染
   - 事件关联
```

### Phase 4：优化和集成（1-2周）

```
1. 性能优化
   - 大规模图谱的虚拟化
   - 搜索索引建立

2. 与现有系统集成
   - 与Mattermost集成
   - 数据同步策略

3. 测试和文档
```

---

## 技术栈总结

### 核心库

| 功能 | 推荐库 | 备选方案 |
|------|--------|---------|
| 编辑器 | Slate.js / Draft.js | Prosemirror |
| 表格 | Handsontable | React Table |
| Markdown | unified + remark | markdown-it |
| 图谱 | @antv/g6 | cytoscape.js |
| 时间线 | rc-timeline | react-chrono |
| 本地存储 | SQLite / RxDB | Realm |
| 文本处理 | natural.js | compromise.js |
| 搜索 | Fuse.js | lunr.js |

### 开源项目参考

1. **Roam Research** 的知识图谱灵感
2. **Obsidian** 的双向链接
3. **Notion** 的Block editor
4. **Logseq** 的开源实现

---

## 数据库方案对比

### SQLite (推荐用于移动)
```javascript
// 优点
- 轻量级，无需服务器
- 支持复杂查询
- 性能好
- React Native 有 react-native-sqlite-storage

// 缺点
- 同步较复杂
- 移动端写入速度有限

// 最适合: 单用户、离线优先应用
```

### RxDB (推荐用于同步)
```javascript
// 优点
- 实时同步
- 离线优先
- PouchDB 后端支持
- 反应式编程

// 缺点
- 库较大
- 学习曲线陡

// 最适合: 团队协作、需要实时同步
```

### Realm (性能最好)
```javascript
// 优点
- 超快的查询性能
- 适合大数据量
- React Native 支持好

// 缺点
- 商用许可证费用
- 同步需要额外服务

// 最适合: 大型应用、复杂查询
```

**推荐**: SQLite + 定期导出 JSON 备份

---

## 第一版实现步骤

### Step 1: 创建编辑器框架（Week 1）

```typescript
// components/NoteEditor.tsx
import Slate from 'slate-react';

export const NoteEditor = () => {
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  
  return (
    <View>
      {blocks.map(block => (
        <RenderBlock key={block.id} block={block} />
      ))}
      <InsertBlockMenu onAdd={addBlock} />
    </View>
  );
};
```

### Step 2: 块类型处理（Week 2）

```typescript
// components/blocks/TextBlock.tsx, ImageBlock.tsx, TableBlock.tsx
// 每个块类型一个组件
```

### Step 3: 本地存储（Week 2）

```typescript
// services/noteStorage.ts
import SQLite from 'react-native-sqlite-storage';

export const saveNote = async (note: Note) => {
  // SQLite 持久化
};

export const loadNote = async (noteId: string) => {
  // 从SQLite读取
};
```

### Step 4: 关联引擎（Week 3）

```typescript
// services/relationEngine.ts
export const findRelatedNotes = (noteId: string): string[] => {
  // 实现四种关联
};
```

### Step 5: 知识图谱（Week 3-4）

```typescript
// components/KnowledgeGraph.tsx
import G6 from '@antv/g6';

export const KnowledgeGraph = ({noteId}: {noteId: string}) => {
  const graph = buildGraph(noteId);
  return <G6Graph data={graph} />;
};
```

---

## 部署和集成

### 与 Mattermost 集成

1. **作为应用/插件集成**
   - 在 Mattermost 内部运行
   - 共享用户认证
   - 数据存储在 Mattermost DB

2. **独立应用集成**
   - 单独的数据库
   - 通过 API 与 Mattermost 通信
   - 用户认证通过 OAuth2

**推荐**: 独立应用，通过 Mattermost API 进行松散耦合

---

## 预期成本和时间

| 阶段 | 工作量 | 时间 |
|------|--------|------|
| 编辑器框架 | 40h | 2周 |
| 富媒体块 | 60h | 3周 |
| 关联引擎 | 50h | 2.5周 |
| 图谱可视化 | 60h | 3周 |
| 优化和集成 | 40h | 2周 |
| **总计** | **250h** | **12-13周** |

对于小团队：建议第一版（MVP）做到"编辑器 + 基础关联"，约 4-5 周。

---

## 下一步建议

1. **立即开始**：搭建编辑器框架，从文本块开始
2. **关键里程碑**：验证图片/表格编辑在你的架构上是否可行
3. **迭代方向**：先做关联，再做图谱（关联是图谱的基础）
4. **用户反馈**：尽早让用户试用编辑器，收集需求

---

## 相关开源项目参考

- [Slate.js](https://github.com/ianstormtaylor/slate) - 编辑器框架
- [@antv/g6](https://github.com/antvis/G6) - 知识图谱可视化
- [Logseq](https://github.com/logseq/logseq) - 完整参考实现
- [Obsidian Publish API](https://github.com/obsidianmd/obsidian-api) - API 设计参考
- [RemNote](https://www.remnote.com/) - 类似功能参考

