# 部门管理 API 文档

## 概述

本文档描述了部门管理相关的 RESTful API 接口，包括部门的 CRUD 操作、树形结构管理、成员管理以及员工联系人管理功能。

**基础路径**: `/api/v4`

---

## 目录

- [部门管理](#部门管理)
  - [获取部门列表](#获取部门列表)
  - [创建部门](#创建部门)
  - [获取单个部门](#获取单个部门)
  - [更新部门](#更新部门)
  - [删除部门](#删除部门)
- [部门树形结构](#部门树形结构)
  - [获取部门树](#获取部门树)
  - [获取子部门](#获取子部门)
  - [获取祖先部门](#获取祖先部门)
- [部门成员管理](#部门成员管理)
  - [获取部门成员列表](#获取部门成员列表)
  - [添加单个成员](#添加单个成员)
  - [批量添加成员](#批量添加成员)
  - [批量移除成员](#批量移除成员)
  - [移除单个成员](#移除单个成员)
- [用户部门查询](#用户部门查询)
  - [获取用户所属部门](#获取用户所属部门)
- [员工联系人管理](#员工联系人管理)
  - [获取员工联系人列表](#获取员工联系人列表)
  - [添加员工联系人](#添加员工联系人)
  - [更新员工联系人](#更新员工联系人)
  - [删除员工联系人](#删除员工联系人)
  - [获取带详细信息的联系人](#获取带详细信息的联系人)

---

## 数据模型

### Department（部门）

```json
{
  "id": 1,
  "team_id": "abc123def456",
  "name": "技术部",
  "description": "负责产品研发和技术支持",
  "parent_id": null,
  "create_at": 1712345678000,
  "update_at": 1712345678000,
  "delete_at": 0,
  "children": [],
  "employees": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 部门ID（自动生成） |
| team_id | string | 团队ID（26字符） |
| name | string | 部门名称（最大255字符） |
| description | string | 部门描述（最大65535字符） |
| parent_id | int/null | 父部门ID，null表示根部门 |
| create_at | int64 | 创建时间戳（毫秒） |
| update_at | int64 | 更新时间戳（毫秒） |
| delete_at | int64 | 删除时间戳，0表示未删除 |
| children | Department[] | 子部门列表（可选） |
| employees | User[] | 员工列表（可选） |

### DepartmentMember（部门成员）

```json
{
  "department_id": 1,
  "user_id": "xyz789abc012",
  "team_id": "abc123def456"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| department_id | int | 部门ID |
| user_id | string | 用户ID（26字符） |
| team_id | string | 团队ID（26字符） |

### EmployeeContact（员工联系人）

```json
{
  "id": "contact123",
  "employee_id": "emp456",
  "contact_id": "cust789",
  "contact_type": "customer",
  "description": "主要业务联系人",
  "remark": "重要客户",
  "create_at": 1712345678000,
  "update_at": 1712345678000,
  "employee_name": "张三",
  "employee_email": "zhangsan@example.com",
  "contact_name": "李四",
  "contact_email": "lisi@customer.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 联系人关系ID（26字符） |
| employee_id | string | 员工ID（26字符） |
| contact_id | string | 联系人ID（26字符） |
| contact_type | string | 联系人类型：`customer`（客户）或 `supplier`（供应商） |
| description | string | 描述 |
| remark | string | 备注 |
| create_at | int64 | 创建时间戳（毫秒） |
| update_at | int64 | 更新时间戳（毫秒） |
| employee_name | string | 员工姓名（仅详情接口返回） |
| employee_email | string | 员工邮箱（仅详情接口返回） |
| contact_name | string | 联系人姓名（仅详情接口返回） |
| contact_email | string | 联系人邮箱（仅详情接口返回） |

---

## 部门管理

### 获取部门列表

获取指定团队下的部门列表，支持分页和搜索。

**请求**

```
GET /api/v4/teams/{team_id}/departments
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | int | 否 | 0 | 页码（从0开始） |
| per_page | int | 否 | 60 | 每页数量 |
| search | string | 否 | - | 搜索关键词（匹配部门名称） |

**响应**

状态码: `200 OK`

```json
{
  "departments": [
    {
      "id": 1,
      "team_id": "abc123def456",
      "name": "技术部",
      "description": "负责产品研发",
      "parent_id": null,
      "create_at": 1712345678000,
      "update_at": 1712345678000,
      "delete_at": 0
    }
  ],
  "total_count": 10
}
```

**权限要求**

- 需要登录
- 需要团队成员权限

---

### 创建部门

在指定团队下创建新部门。

**请求**

```
POST /api/v4/teams/{team_id}/departments
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |

**请求体**

```json
{
  "name": "市场部",
  "description": "负责市场推广和销售",
  "parent_id": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 部门名称（最大255字符） |
| description | string | 否 | 部门描述（最大65535字符） |
| parent_id | int/null | 否 | 父部门ID，null或不传表示根部门 |

**响应**

状态码: `201 Created`

```json
{
  "id": 2,
  "team_id": "abc123def456",
  "name": "市场部",
  "description": "负责市场推广和销售",
  "parent_id": null,
  "create_at": 1712345700000,
  "update_at": 1712345700000,
  "delete_at": 0
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效（如部门名称为空或超长）
- `403 Forbidden`: 没有团队管理员权限
- `404 Not Found`: 团队不存在

**权限要求**

- 需要登录
- 需要团队管理员权限

---

### 获取单个部门

获取指定部门的详细信息。

**请求**

```
GET /api/v4/teams/{team_id}/departments/{department_id}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**响应**

状态码: `200 OK`

```json
{
  "id": 1,
  "team_id": "abc123def456",
  "name": "技术部",
  "description": "负责产品研发",
  "parent_id": null,
  "create_at": 1712345678000,
  "update_at": 1712345678000,
  "delete_at": 0
}
```

**错误响应**

- `404 Not Found`: 部门不存在或已删除

**权限要求**

- 需要登录
- 需要团队成员权限

---

### 更新部门

更新指定部门的信息。

**请求**

```
PUT /api/v4/teams/{team_id}/departments/{department_id}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**请求体**

```json
{
  "name": "技术研发部",
  "description": "负责产品研发、技术支持和运维",
  "parent_id": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 部门名称（最大255字符） |
| description | string | 否 | 部门描述（最大65535字符） |
| parent_id | int/null | 否 | 父部门ID |

**响应**

状态码: `200 OK`

```json
{
  "id": 1,
  "team_id": "abc123def456",
  "name": "技术研发部",
  "description": "负责产品研发、技术支持和运维",
  "parent_id": null,
  "create_at": 1712345678000,
  "update_at": 1712345800000,
  "delete_at": 0
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `403 Forbidden`: 没有团队管理员权限
- `404 Not Found`: 部门不存在

**权限要求**

- 需要登录
- 需要团队管理员权限

---

### 删除部门

软删除指定部门（将 `delete_at` 设置为当前时间戳）。

**请求**

```
DELETE /api/v4/teams/{team_id}/departments/{department_id}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**响应**

状态码: `200 OK`

```json
{
  "status": "OK"
}
```

**错误响应**

- `403 Forbidden`: 没有团队管理员权限
- `404 Not Found`: 部门不存在

**注意事项**

- 删除部门不会删除其子部门和成员关系
- 建议先移除所有成员后再删除部门

**权限要求**

- 需要登录
- 需要团队管理员权限

---

## 部门树形结构

### 获取部门树

获取指定团队下完整的部门树形结构。

**请求**

```
GET /api/v4/teams/{team_id}/departments/tree
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": 1,
    "team_id": "abc123def456",
    "name": "总公司",
    "description": "",
    "parent_id": null,
    "create_at": 1712345678000,
    "update_at": 1712345678000,
    "delete_at": 0,
    "children": [
      {
        "id": 2,
        "team_id": "abc123def456",
        "name": "技术部",
        "description": "",
        "parent_id": 1,
        "create_at": 1712345680000,
        "update_at": 1712345680000,
        "delete_at": 0,
        "children": []
      },
      {
        "id": 3,
        "team_id": "abc123def456",
        "name": "市场部",
        "description": "",
        "parent_id": 1,
        "create_at": 1712345682000,
        "update_at": 1712345682000,
        "delete_at": 0,
        "children": []
      }
    ]
  }
]
```

**权限要求**

- 需要登录
- 需要团队成员权限

---

### 获取子部门

获取指定部门的直接子部门列表。

**请求**

```
GET /api/v4/teams/{team_id}/departments/{department_id}/children
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": 2,
    "team_id": "abc123def456",
    "name": "前端组",
    "description": "",
    "parent_id": 1,
    "create_at": 1712345680000,
    "update_at": 1712345680000,
    "delete_at": 0
  },
  {
    "id": 3,
    "team_id": "abc123def456",
    "name": "后端组",
    "description": "",
    "parent_id": 1,
    "create_at": 1712345682000,
    "update_at": 1712345682000,
    "delete_at": 0
  }
]
```

**权限要求**

- 需要登录
- 需要团队成员权限

---

### 获取祖先部门

获取指定部门的所有祖先部门（从根到父部门）。

**请求**

```
GET /api/v4/teams/{team_id}/departments/{department_id}/ancestors
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": 1,
    "team_id": "abc123def456",
    "name": "总公司",
    "description": "",
    "parent_id": null,
    "create_at": 1712345678000,
    "update_at": 1712345678000,
    "delete_at": 0
  },
  {
    "id": 2,
    "team_id": "abc123def456",
    "name": "技术部",
    "description": "",
    "parent_id": 1,
    "create_at": 1712345680000,
    "update_at": 1712345680000,
    "delete_at": 0
  }
]
```

**权限要求**

- 需要登录
- 需要团队成员权限

---

## 部门成员管理

### 获取部门成员列表

获取指定部门的成员列表，支持分页。

**请求**

```
GET /api/v4/teams/{team_id}/departments/{department_id}/members
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | int | 否 | 0 | 页码（从0开始） |
| per_page | int | 否 | 60 | 每页数量 |

**响应**

状态码: `200 OK`

```json
{
  "users": [
    {
      "id": "user123",
      "username": "zhangsan",
      "email": "zhangsan@example.com",
      "first_name": "三",
      "last_name": "张",
      "nickname": "张三"
    }
  ],
  "total_count": 15
}
```

**权限要求**

- 需要登录
- 需要团队成员权限

---

### 添加单个成员

将单个用户添加到指定部门。

**请求**

```
POST /api/v4/teams/{team_id}/departments/{department_id}/members
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**请求体**

```json
{
  "user_id": "xyz789abc012"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 用户ID（26字符） |

**响应**

状态码: `201 Created`

```json
{
  "department_id": 1,
  "user_id": "xyz789abc012",
  "team_id": "abc123def456"
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `404 Not Found`: 部门或用户不存在
- `409 Conflict`: 用户已经是该部门成员

**权限要求**

- 需要登录
- 需要团队管理员权限

---

### 批量添加成员

批量将多个用户添加到指定部门。

**请求**

```
POST /api/v4/teams/{team_id}/departments/{department_id}/members/batch
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**请求体**

```json
{
  "user_ids": ["user1", "user2", "user3"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_ids | string[] | 是 | 用户ID数组 |

**响应**

状态码: `201 Created`

```json
{
  "status": "OK",
  "added_count": 3
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `404 Not Found`: 部门不存在

**权限要求**

- 需要登录
- 需要团队管理员权限

---

### 批量移除成员

批量从指定部门移除多个用户。

**请求**

```
DELETE /api/v4/teams/{team_id}/departments/{department_id}/members/batch
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |

**请求体**

```json
{
  "user_ids": ["user1", "user2", "user3"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_ids | string[] | 是 | 用户ID数组 |

**响应**

状态码: `200 OK`

```json
{
  "status": "OK",
  "removed_count": 3
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `404 Not Found`: 部门不存在

**权限要求**

- 需要登录
- 需要团队管理员权限

---

### 移除单个成员

从指定部门移除单个用户。

**请求**

```
DELETE /api/v4/teams/{team_id}/departments/{department_id}/members/{user_id}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |
| department_id | int | 是 | 部门ID |
| user_id | string | 是 | 用户ID |

**响应**

状态码: `200 OK`

```json
{
  "status": "OK"
}
```

**错误响应**

- `404 Not Found`: 部门或成员关系不存在

**权限要求**

- 需要登录
- 需要团队管理员权限

---

## 用户部门查询

### 获取用户所属部门

获取指定用户所属的所有部门。

**请求**

```
GET /api/v4/users/{user_id}/departments
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 用户ID |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| team_id | string | 是 | 团队ID |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": 1,
    "team_id": "abc123def456",
    "name": "技术部",
    "description": "",
    "parent_id": null,
    "create_at": 1712345678000,
    "update_at": 1712345678000,
    "delete_at": 0
  },
  {
    "id": 5,
    "team_id": "abc123def456",
    "name": "前端组",
    "description": "",
    "parent_id": 1,
    "create_at": 1712345690000,
    "update_at": 1712345690000,
    "delete_at": 0
  }
]
```

**权限要求**

- 需要登录
- 需要查看目标用户的权限

---

## 员工联系人管理

### 获取员工联系人列表

获取指定员工的联系人列表。

**请求**

```
GET /api/v4/users/{user_id}/contacts
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 员工用户ID |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_type | string | 否 | 过滤联系人类型：`customer` 或 `supplier` |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": "contact123",
    "employee_id": "emp456",
    "contact_id": "cust789",
    "contact_type": "customer",
    "description": "主要业务联系人",
    "remark": "重要客户",
    "create_at": 1712345678000,
    "update_at": 1712345678000
  }
]
```

**权限要求**

- 需要登录
- 需要查看目标用户的权限

---

### 添加员工联系人

为员工添加新的联系人关系。

**请求**

```
POST /api/v4/users/{user_id}/contacts
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 员工用户ID |

**请求体**

```json
{
  "contact_id": "cust789",
  "contact_type": "customer",
  "description": "主要业务联系人",
  "remark": "重要客户"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_id | string | 是 | 联系人用户ID（26字符） |
| contact_type | string | 是 | 联系人类型：`customer` 或 `supplier` |
| description | string | 否 | 描述 |
| remark | string | 否 | 备注 |

**响应**

状态码: `201 Created`

```json
{
  "id": "contact123",
  "employee_id": "emp456",
  "contact_id": "cust789",
  "contact_type": "customer",
  "description": "主要业务联系人",
  "remark": "重要客户",
  "create_at": 1712345678000,
  "update_at": 1712345678000
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `404 Not Found`: 员工或联系人不存在
- `409 Conflict`: 联系人关系已存在

**权限要求**

- 需要登录
- 需要编辑目标用户的权限

---

### 更新员工联系人

更新现有的员工联系人关系。

**请求**

```
PUT /api/v4/users/{user_id}/contacts
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 员工用户ID |

**请求体**

```json
{
  "contact_id": "cust789",
  "contact_type": "customer",
  "description": "更新后的描述",
  "remark": "更新后的备注"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_id | string | 是 | 联系人用户ID |
| contact_type | string | 是 | 联系人类型 |
| description | string | 否 | 描述 |
| remark | string | 否 | 备注 |

**响应**

状态码: `200 OK`

```json
{
  "id": "contact123",
  "employee_id": "emp456",
  "contact_id": "cust789",
  "contact_type": "customer",
  "description": "更新后的描述",
  "remark": "更新后的备注",
  "create_at": 1712345678000,
  "update_at": 1712345900000
}
```

**错误响应**

- `400 Bad Request`: 请求参数无效
- `404 Not Found`: 联系人关系不存在

**权限要求**

- 需要登录
- 需要编辑目标用户的权限

---

### 删除员工联系人

删除员工与联系人的关系。

**请求**

```
DELETE /api/v4/users/{user_id}/contacts
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 员工用户ID |

**请求体**

```json
{
  "contact_id": "cust789",
  "contact_type": "customer"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_id | string | 是 | 联系人用户ID |
| contact_type | string | 是 | 联系人类型 |

**响应**

状态码: `200 OK`

```json
{
  "status": "OK"
}
```

**错误响应**

- `404 Not Found`: 联系人关系不存在

**权限要求**

- 需要登录
- 需要编辑目标用户的权限

---

### 获取带详细信息的联系人

获取员工联系人列表，包含员工和联系人的详细信息。

**请求**

```
GET /api/v4/users/{user_id}/contacts/details
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 是 | 员工用户ID |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_type | string | 否 | 过滤联系人类型：`customer` 或 `supplier` |

**响应**

状态码: `200 OK`

```json
[
  {
    "id": "contact123",
    "employee_id": "emp456",
    "contact_id": "cust789",
    "contact_type": "customer",
    "description": "主要业务联系人",
    "remark": "重要客户",
    "create_at": 1712345678000,
    "update_at": 1712345678000,
    "employee_name": "张三",
    "employee_email": "zhangsan@example.com",
    "contact_name": "李四",
    "contact_email": "lisi@customer.com"
  }
]
```

**权限要求**

- 需要登录
- 需要查看目标用户的权限

---

## 认证与授权

### 认证方式

所有API端点都需要通过身份验证。支持以下认证方式：

1. **Personal Access Token**: 在请求头中添加 `Authorization: Bearer <token>`
2. **Session Cookie**: 使用登录后的会话Cookie

### 权限说明

| 权限级别 | 说明 |
|----------|------|
| 系统管理员 | 可以管理所有团队的部门 |
| 团队管理员 | 可以管理所在团队的部门 |
| 团队成员 | 可以查看部门的只读信息 |
| 普通用户 | 只能查看自己的部门和联系人 |

---

## 错误处理

### 错误响应格式

```json
{
  "id": "api.error_message",
  "message": "错误描述信息",
  "detailed_error": "详细的错误信息（仅开发环境）",
  "request_id": "请求ID",
  "status_code": 400
}
```

### 常见错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如重复添加） |
| 500 | 服务器内部错误 |

---

## 速率限制

API 实施速率限制以防止滥用：

- 默认限制: 每秒 10 次请求
- 超出限制将返回 `429 Too Many Requests`

---

## 示例代码

### JavaScript/TypeScript

```typescript
// 获取部门列表
async function getDepartments(teamId: string, page = 0, perPage = 60) {
  const response = await fetch(
    `/api/v4/teams/${teamId}/departments?page=${page}&per_page=${perPage}`,
    {
      headers: {
        'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

// 创建部门
async function createDepartment(teamId: string, department: {
  name: string;
  description?: string;
  parent_id?: number | null;
}) {
  const response = await fetch(`/api/v4/teams/${teamId}/departments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
    },
    body: JSON.stringify(department)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

// 批量添加成员
async function addMembersBatch(
  teamId: string,
  departmentId: number,
  userIds: string[]
) {
  const response = await fetch(
    `/api/v4/teams/${teamId}/departments/${departmentId}/members/batch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
      },
      body: JSON.stringify({ user_ids: userIds })
    }
  );
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}
```

### Python

```python
import requests

BASE_URL = "https://your-mattermost-instance.com/api/v4"
TOKEN = "YOUR_ACCESS_TOKEN"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 获取部门列表
def get_departments(team_id, page=0, per_page=60):
    response = requests.get(
        f"{BASE_URL}/teams/{team_id}/departments",
        headers=headers,
        params={"page": page, "per_page": per_page}
    )
    response.raise_for_status()
    return response.json()

# 创建部门
def create_department(team_id, name, description=None, parent_id=None):
    data = {
        "name": name,
        "description": description or "",
        "parent_id": parent_id
    }
    response = requests.post(
        f"{BASE_URL}/teams/{team_id}/departments",
        headers=headers,
        json=data
    )
    response.raise_for_status()
    return response.json()

# 获取部门树
def get_department_tree(team_id):
    response = requests.get(
        f"{BASE_URL}/teams/{team_id}/departments/tree",
        headers=headers
    )
    response.raise_for_status()
    return response.json()
```

### cURL

```bash
# 获取部门列表
curl -X GET \
  "https://your-mattermost-instance.com/api/v4/teams/abc123def456/departments?page=0&per_page=60" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 创建部门
curl -X POST \
  "https://your-mattermost-instance.com/api/v4/teams/abc123def456/departments" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "市场部",
    "description": "负责市场推广和销售",
    "parent_id": null
  }'

# 批量添加成员
curl -X POST \
  "https://your-mattermost-instance.com/api/v4/teams/abc123def456/departments/1/members/batch" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": ["user1", "user2", "user3"]
  }'

# 获取部门树
curl -X GET \
  "https://your-mattermost-instance.com/api/v4/teams/abc123def456/departments/tree" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 更新日志

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-04-15 | 初始版本，包含完整的部门管理API |

---

## 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue: [GitHub Issues](https://github.com/mattermost/mattermost/issues)
- 社区论坛: [Mattermost Community](https://community.mattermost.com/)
