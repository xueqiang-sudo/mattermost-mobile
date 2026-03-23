# Contact Management API 文档

## 概述
一个用于管理公司、部门和员工关系的 RESTful API 服务。支持多对多关系，员工可以属于多个公司，也可以属于多个部门。

## 基础信息
- **API 版本**: v1
- **API 基础路径**: `/api/v1`
- **认证**: API Key 认证
  - Header: `X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr`
- **数据格式**: JSON

---

## 公共端点

### 健康检查
```
GET /health
```
**响应**:
```json
{
  "status": "ok"
}
```

### API 信息
```
GET /
```
**响应**:
```json
{
  "name": "Contact Management API",
  "version": "v1"
}
```

---

## API 端点

### 公司管理

#### 1. 创建公司
```
POST /api/v1/companies
```
**请求体**:
```json
{
  "id": "string",
  "name": "string",
  "type": "team/supplier/customer",
  "description": "string"
}
```

#### 2. 获取所有公司
```
GET /api/v1/companies
```

#### 3. 获取单个公司
```
GET /api/v1/companies/:id
```
**参数**:
- `id`: 公司ID

#### 4. 更新公司
```
PUT /api/v1/companies/:id
```
**参数**:
- `id`: 公司ID
**请求体**: 同创建公司

#### 5. 删除公司
```
DELETE /api/v1/companies/:id
```
**参数**:
- `id`: 公司ID

#### 6. 获取公司及其部门
```
GET /api/v1/companies/:id/departments
```
**参数**:
- `id`: 公司ID

#### 7. 获取公司及其员工
```
GET /api/v1/companies/:id/employees
```
**参数**:
- `id`: 公司ID

---

### 部门管理

#### 1. 创建部门
```
POST /api/v1/departments
```
**请求体**:
```json
{
  "company_id": "string",
  "name": "string",
  "description": "string",
  "parent_id": "uint (可选)"
}
```

#### 2. 获取单个部门
```
GET /api/v1/departments/:id
```
**参数**:
- `id`: 部门ID

#### 3. 更新部门
```
PUT /api/v1/departments/:id
```
**参数**:
- `id`: 部门ID
**请求体**: 同创建部门

#### 4. 删除部门
```
DELETE /api/v1/departments/:id
```
**参数**:
- `id`: 部门ID

#### 5. 获取部门及其员工
```
GET /api/v1/departments/:id/employees
```
**参数**:
- `id`: 部门ID

---

### 员工管理

#### 1. 创建员工
```
POST /api/v1/employees
```
**请求体**:
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "position": "string",
  "phone": "string"
}
```

#### 2. 获取单个员工
```
GET /api/v1/employees/:id
```
**参数**:
- `id`: 员工ID

#### 3. 更新员工
```
PUT /api/v1/employees/:id
```
**参数**:
- `id`: 员工ID
**请求体**: 同创建员工

#### 4. 删除员工
```
DELETE /api/v1/employees/:id
```
**参数**:
- `id`: 员工ID

#### 5. 获取员工详细信息
```
GET /api/v1/employees/:id/details
```
**参数**:
- `id`: 员工ID

---

### 员工-公司关联管理

#### 1. 添加员工到公司
```
POST /api/v1/employees/:id/companies
```
**参数**:
- `id`: 员工ID
**请求体**:
```json
{
  "company_id": "string"
}
```

#### 2. 从公司移除员工
```
DELETE /api/v1/employees/:id/companies
```
**参数**:
- `id`: 员工ID
**请求体**:
```json
{
  "company_id": "string"
}
```

#### 3. 获取员工所属公司
```
GET /api/v1/employees/:id/companies
```
**参数**:
- `id`: 员工ID

#### 4. 获取员工所属公司详情
```
GET /api/v1/employees/:id/companies/details
```
**参数**:
- `id`: 员工ID

#### 5. 获取公司下所有员工
```
GET /api/v1/company-employees/:companyId/employees
```
**参数**:
- `companyId`: 公司ID

---

### 员工-部门关联管理

#### 1. 添加员工到部门
```
POST /api/v1/employees/:id/departments
```
**参数**:
- `id`: 员工ID
**请求体**:
```json
{
  "department_id": "uint",
  "company_id": "string"
}
```

#### 2. 从部门移除员工
```
DELETE /api/v1/employees/:id/departments
```
**参数**:
- `id`: 员工ID
**请求体**:
```json
{
  "department_id": "uint",
  "company_id": "string"
}``



#### 5. 获取部门下所有员工
```
GET /api/v1/department-employees/:departmentId/employees
```
**参数**:
- `departmentId`: 部门ID

---

## 数据模型

### Company 公司
```go
{
  "id": "string",          // 主键，36位字符串
  "name": "string",        // 必填，255字符
  "type": "string",        // 可选，50字符，枚举：team, supplier, customer,公司类型是team，如果是供应商是supplier,如果是客户列表是customer
  "description": "string"  // 可选，文本
}
```

### Department 部门
```go
{
  "id": "uint",            // 主键，自增
  "company_id": "string",  // 必填，36位字符串，关联公司ID
  "name": "string",        // 必填，255字符
  "description": "string", // 可选，文本
  "parent_id": "uint"      // 可选，父部门ID
}
```

### Employee 员工
```go
{
  "id": "string",          // 主键，36位字符串
  "name": "string",        // 必填，255字符
  "email": "string",       // 可选，255字符
  "position": "string",    // 可选，255字符
  "phone": "string"        // 可选，50字符
}
```

### 关联表
- **CompanyEmployee**: 公司-员工多对多关联
- **DepartmentEmployee**: 部门-员工多对多关联（包含冗余的company_id字段）

---

## 错误处理

所有错误响应都遵循以下格式：
```json
{
  "error": "错误描述",
  "code": "错误代码"
}
```

**常见错误代码**:
- `INVALID_API_KEY`: API Key无效或缺失
- `NOT_FOUND`: 资源不存在
- `VALIDATION_ERROR`: 数据验证失败

---

## 使用示例

### 示例1：创建公司并添加员工
```bash
# 1. 创建公司
curl -X POST https://api.example.com/api/v1/companies \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "company_001",
    "name": "ABC科技有限公司",
    "type": "team",
    "description": "主要技术团队"
  }'

# 2. 创建员工
curl -X POST https://api.example.com/api/v1/employees \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "emp_001",
    "name": "张三",
    "email": "zhangsan@example.com",
    "position": "软件工程师",
    "phone": "13800138000"
  }'

# 3. 将员工添加到公司
curl -X POST https://api.example.com/api/v1/employees/emp_001/companies \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "company_001"
  }'
```

### 示例2：查询公司下所有员工
```bash
curl -X GET https://api.example.com/api/v1/company-employees/company_001/employees \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"
```

---

## 注意事项

1. **API Key认证**: 所有API端点（除公共端点外）都需要在Header中提供有效的API Key
2. **ID生成**: 公司和员工的ID需要客户端自行生成（36位字符串）
3. **关联操作**: 添加员工到部门时需要同时提供公司ID
4. **数据完整性**: 删除操作会级联删除关联表中的记录
5. **分页**: 当前版本未实现分页，获取列表接口会返回所有数据



# API 使用文档 - 新增功能

## 1. 获取公司总人数

获取指定公司的员工总数（去重）。

**Endpoint:** `GET /api/v1/company-employees/:companyId/total-employees`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| companyId | string | 是 | 公司ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
{
    "company_id": "comp_123456",
    "total": 42
}
```

---

## 2. 获取部门总人数（含子部门）

获取指定部门及其所有子部门的员工总数（去重）。

**Endpoint:** `GET /api/v1/department-employees/:departmentId/total-employees`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| departmentId | uint | 是 | 部门ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
{
    "department_id": 5,
    "total": 28
}
```

---

## 3. 移动员工部门

将员工从一个部门移动到另一个部门。

**Endpoint:** `PUT /api/v1/employees/:id/move-department`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 员工ID |

**请求体:**
```json
{
    "from_department_id": 10,
    "to_department_id": 15,
    "company_id": "comp_123456"
}
```

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| from_department_id | uint | 是 | 原部门ID |
| to_department_id | uint | 是 | 目标部门ID |
| company_id | string | 是 | 公司ID（用于验证） |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
Content-Type: application/json
```

**响应示例:**
```json
{
    "message": "Employee moved successfully"
}
```

---

## 4. 获取公司部门列表（带过滤）

获取公司的部门列表，支持按父部门过滤

**Endpoint:** `GET /api/v1/by_companies/:companyId/departments`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| companyId | string | 是 | 公司ID |

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| parent_department_id | int | 否 | 父部门ID过滤：<br>- 不传：返回所有部门<br>- <0：只返回顶级部门（parent_id为null）<br>- >=0：返回指定父部门下的子部门 |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**

*不传 parent_department_id（所有部门）:*
```json
[
    {
        "id": 1,
        "company_id": "comp_123456",
        "name": "技术部",
        "description": "技术研发中心",
        "parent_id": null
    },
    {
        "id": 2,
        "company_id": "comp_123456",
        "name": "前端组",
        "description": "前端开发",
        "parent_id": 1
    },
    {
        "id": 3,
        "company_id": "comp_123456",
        "name": "后端组",
        "description": "后端开发",
        "parent_id": 1
    }
]
```

*parent_department_id=-1（顶级部门）:*
```json
[
    {
        "id": 1,
        "company_id": "comp_123456",
        "name": "技术部",
        "description": "技术研发中心",
        "parent_id": null
    },
    {
        "id": 4,
        "company_id": "comp_123456",
        "name": "市场部",
        "description": "市场营销",
        "parent_id": null
    }
]
```

*parent_department_id=1（技术部下的子部门）:*
```json
[
    {
        "id": 2,
        "company_id": "comp_123456",
        "name": "前端组",
        "description": "前端开发",
        "parent_id": 1
    },
    {
        "id": 3,
        "company_id": "comp_123456",
        "name": "后端组",
        "description": "后端开发",
        "parent_id": 1
    }
]
```

---

## 5. 获取员工详细信息及级联部门

获取员工在指定公司的详细信息，以及所属的所有级联部门。

**Endpoint:** `GET /api/v1/employees/:id/cascade-departments`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 员工ID |

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| company_id | string | 是 | 公司ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
{
    "employee": {
        "id": "emp_789012",
        "name": "张三",
        "email": "zhangsan@example.com",
        "position": "高级开发工程师",
        "phone": "13800138000"
    },
    "cascade_departments": [
        [
            {
                "id": 1,
                "company_id": "comp_123456",
                "name": "技术部",
                "description": "技术研发中心",
                "parent_id": null
            },
            {
                "id": 3,
                "company_id": "comp_123456",
                "name": "后端组",
                "description": "后端开发",
                "parent_id": 1
            }
        ],
        [
            {
                "id": 1,
                "company_id": "comp_123456",
                "name": "技术部",
                "description": "技术研发中心",
                "parent_id": null
            },
            {
                "id": 5,
                "company_id": "comp_123456",
                "name": "架构组",
                "description": "系统架构",
                "parent_id": 1
            }
        ]
    ]
}
```

---

## 6. 获取部门祖先

获取指定部门的所有祖先部门（包含自身），按从上到下的顺序返回。

**Endpoint:** `GET /api/v1/departments/:id/ancestors`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | uint | 是 | 部门ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**

假设部门结构：技术部(1) → 后端组(3) → Java组(8)

请求 `/api/v1/departments/8/ancestors` 返回：
```json
[
    {
        "id": 1,
        "company_id": "comp_123456",
        "name": "技术部",
        "description": "技术研发中心",
        "parent_id": null
    },
    {
        "id": 3,
        "company_id": "comp_123456",
        "name": "后端组",
        "description": "后端开发",
        "parent_id": 1
    },
    {
        "id": 8,
        "company_id": "comp_123456",
        "name": "Java组",
        "description": "Java开发",
        "parent_id": 3
    }
]
```

---

## 7. 搜索员工

搜索员工，支持在公司范围或部门范围内搜索。

### 7.1 在公司范围内搜索

**Endpoint:** `GET /api/v1/company-employees/:companyId/search`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| companyId | string | 是 | 公司ID |

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（匹配姓名、邮箱、电话） |
| department_id | uint | 否 | 限定在该部门及其子部门内搜索 |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

### 7.2 在部门范围内搜索

**Endpoint:** `GET /api/v1/department-employees/:departmentId/search`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| departmentId | uint | 是 | 部门ID |

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（匹配姓名、邮箱、电话） |
| company_id | string | 是 | 公司ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
[
    {
        "employee": {
            "id": "emp_789012",
            "name": "张三",
            "email": "zhangsan@example.com",
            "position": "高级开发工程师",
            "phone": "13800138000"
        },
        "cascade_departments": [
            [
                {
                    "id": 1,
                    "company_id": "comp_123456",
                    "name": "技术部",
                    "parent_id": null
                },
                {
                    "id": 3,
                    "company_id": "comp_123456",
                    "name": "后端组",
                    "parent_id": 1
                }
            ]
        ],
        "company_id": "comp_123456"
    },
    {
        "employee": {
            "id": "emp_789013",
            "name": "张伟",
            "email": "zhangwei@example.com",
            "position": "后端开发工程师",
            "phone": "13800138001"
        },
        "cascade_departments": [
            [
                {
                    "id": 1,
                    "company_id": "comp_123456",
                    "name": "技术部",
                    "parent_id": null
                },
                {
                    "id": 3,
                    "company_id": "comp_123456",
                    "name": "后端组",
                    "parent_id": 1
                }
            ]
        ],
        "company_id": "comp_123456"
    }
]
```

---

## 8. 通讯录版本控制

### 8.1 获取通讯录版本

获取指定公司的通讯录数据版本号，用于客户端缓存。

**Endpoint:** `GET /api/v1/versions/companies/:companyId/contacts`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| companyId | string | 是 | 公司ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
{
    "company_id": "comp_123456",
    "version": "550e8400-e29b-41d4-a716-446655440000",
    "type": "contacts"
}
```

### 8.2 更新通讯录版本

手动更新通讯录版本（通常用于测试或手动触发缓存刷新）。

**Endpoint:** `PUT /api/v1/versions/companies/:companyId/contacts`

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| companyId | string | 是 | 公司ID |

**请求头:**
```
X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr
```

**响应示例:**
```json
{
    "company_id": "comp_123456",
    "version": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "message": "Version updated successfully"
}
```

---

## 错误响应格式

所有接口在出错时返回统一的错误格式：

```json
{
    "error": "错误描述信息"
}
```

常见HTTP状态码：
- `200 OK` - 请求成功
- `400 Bad Request` - 请求参数错误
- `401 Unauthorized` - API密钥无效或缺失
- `404 Not Found` - 资源不存在
- `500 Internal Server Error` - 服务器内部错误