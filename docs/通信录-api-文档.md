# Contact Management API 文档

## 基本信息

- **基础 URL**: `/api/v1`
- **认证方式**: API Key（Header: `X-API-KEY`）
- **API Key**（示例）: `b3cz8fsbrfd4ukmfmssf864pqr`

---

## 数据模型（与后端 Go 模型一致）

以下字段名与 JSON 序列化一致，用于核对请求体与响应。

### Company（公司）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 主键，36 字符 |
| `name` | string | 必填 |
| `type` | string | 如 `team`（本公司/团队）、`supplier`（供应商）、`customer`（客户） |
| `description` | string | 可选 |
| `owner_id` | string | 企业拥有者 ID，36 字符 |

说明：公司**没有** `address`、`phone`、`email` 等字段；与员工、部门的关联通过关联表维护。

### Department（部门）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 主键，自增 |
| `company_id` | string | 所属公司 ID，36 字符 |
| `name` | string | 必填 |
| `description` | string | 可选 |
| `parent_id` | number \| null | 可选，父部门 ID；顶层为 `null` |

### Employee（员工）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 主键，36 字符 |
| `name` | string | 必填 |
| `email` | string | 可选 |
| `position` | string | 可选 |
| `phone` | string | 可选 |

说明：员工实体**不包含** `department_id`；加入部门通过「员工-部门关联」接口，数据落在 `department_employees` 关联表（含 `department_id`、`employee_id` 及冗余的 `company_id`）。

### 关联表（概念）

- **CompanyEmployee**：`company_id` + `employee_id`（多对多：员工可属于多家公司）。
- **DepartmentEmployee**：`department_id`（uint）+ `employee_id` + `company_id`（company_id 为冗余字段便于按公司查询）。

---

## 公共接口（无需认证）

### 健康检查

- **URL**: `GET /health`
- **描述**: 检查服务健康状态
- **响应示例**:

```json
{
  "status": "ok"
}
```

### API 信息

- **URL**: `GET /`
- **描述**: 获取 API 基本信息
- **响应示例**:

```json
{
  "name": "Contact Management API",
  "version": "v1"
}
```

### API 文档

- **URL**: `GET /api/v1/docs`
- **描述**: 获取 API 端点列表
- **响应示例**:

```json
{
  "api_version": "v1",
  "endpoints": [
    "GET /api/v1/companies",
    "POST /api/v1/companies",
    "GET /api/v1/companies/:id",
    "DELETE /api/v1/companies/:id/force",
    "DELETE /api/v1/departments/:id/force",
    "GET /api/v1/users/:userId/companies",
    "GET /api/v1/employees/:id/check-delete",
    "GET /api/v1/company-employees/:companyId/search"
  ]
}
```

---

## 公司管理接口

### 创建公司

- **URL**: `POST /api/v1/companies`
- **描述**: 创建新公司
- **请求体**（`id` 通常由客户端生成字符串）:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "公司名称",
  "type": "team",
  "description": "可选说明",
  "owner_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

### 获取所有公司

- **URL**: `GET /api/v1/companies`
- **描述**: 获取公司列表

### 获取单个公司

- **URL**: `GET /api/v1/companies/:id`
- **参数**: `id` — 公司 ID（string）

### 更新公司

- **URL**: `PUT /api/v1/companies/:id`
- **参数**: `id` — 公司 ID
- **请求体**: 与创建公司相同字段，传入哪个字段就只更新哪一个字段，id 排除，不允许更新 id

```json
{
  "name": "新公司名称",
  "type": "team",
  "description": "新说明",
  "owner_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

### 删除公司

- **URL**: `DELETE /api/v1/companies/:id`
- **参数**: `id` — 公司 ID
- **描述**: 软删除公司（软删除或级联策略以服务端为准）

### 强制删除公司（含级联）

- **URL**: `DELETE /api/v1/companies/:id/force`
- **参数**: `id` — 公司 ID
- **描述**: 强制删除公司及其关联的部门与员工等

### 获取公司的所有部门(含公司自身信息)

- **URL**: `GET /api/v1/companies/:id/departments`
- **参数**: `id` — 公司 ID

### 获取公司的所有员工(含公司自身信息)

- **URL**: `GET /api/v1/companies/:id/employees`
- **参数**: `id` — 公司 ID

---

## 部门管理接口

### 创建部门

- **URL**: `POST /api/v1/departments`
- **描述**: 创建新部门
- **请求体**:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "部门名称",
  "description": "部门描述",
  "parent_id": null
}
```

`parent_id` 为子部门时填父部门数字 ID；顶层部门使用 `null`。

### 获取单个部门

- **URL**: `GET /api/v1/departments/:id`
- **参数**: `id` — 部门 ID（number）

### 更新部门

- **URL**: `PUT /api/v1/departments/:id`
- **参数**: `id` — 部门 ID
- **请求体**（需包含 `company_id`，`parent_id` 可为 `null` 表示移到顶层，以服务端为准）:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "新部门名称",
  "description": "新描述",
  "parent_id": null
}
```

### 删除部门

- **URL**: `DELETE /api/v1/departments/:id`
- **参数**: `id` — 部门 ID
- **描述**: 删除部门（软删除或级联策略以服务端为准）

### 强制删除部门（含级联）

- **URL**: `DELETE /api/v1/departments/:id/force`
- **参数**: `id` — 部门 ID


### 获取部门的员工(含部门信息)

- **URL**: `GET /api/v1/departments/:id/employees`
- **参数**: `id` — 部门 ID

### 获取子部门（children）

- **URL**: `GET /api/v1/departments/:id/children`
- **参数**: `id` — 部门 ID

### 获取下级子部门列表

- **URL**: `GET /api/v1/departments/:id/sub-departments`
- **参数**: `id` — 部门 ID

### 获取部门祖先路径

- **URL**: `GET /api/v1/departments/:id/ancestors`
- **参数**: `id` — 部门 ID

### 按公司获取部门列表（支持父级过滤）

- **URL**: `GET /api/v1/by_companies/:companyId/departments`
- **参数**:
  - `companyId` — 公司 ID（string）
  - 查询参数 `parent_department_id`（可选）:
    - 不传：返回该公司全部部门（以服务端为准）
    - `< 0`（如 `-1`）：仅顶级部门（`parent_id` 为 null）
    - `>= 0`：指定父部门下的子部门

---

## 员工管理接口

### 创建员工

- **URL**: `POST /api/v1/employees`
- **描述**: 创建新员工（不包含部门；入部门见「员工-部门关联」）
- **请求体**:

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "员工姓名",
  "email": "employee@example.com",
  "phone": "13800138000",
  "position": "职位"
}
```

### 获取单个员工

- **URL**: `GET /api/v1/employees/:id`
- **参数**: `id` — 员工 ID（string）

### 获取员工详细信息

- **URL**: `GET /api/v1/employees/:id/details` 【⚠️注意： 这个接口不可用， 目前也不需要】
- **参数**: `id` — 员工 ID
- **描述**: 获取员工完整信息（含部门、公司等，以服务端为准）

### 更新员工

- **URL**: `PUT /api/v1/employees/:id`
- **参数**: `id` — 员工 ID
- **请求体**: 与创建员工相同字段，传入哪个字段就只更新哪一个字段，id 排除，不允许更新 id

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "新姓名",
  "email": "new@example.com",
  "phone": "新电话",
  "position": "新职位"
}
```

### 删除员工

- **URL**: `DELETE /api/v1/employees/:id`
- **参数**: `id` — 员工 ID

### 检查员工是否可以删除

- **URL**: `GET /api/v1/employees/:id/check-delete`
- **参数**: `id` — 员工 ID

### 获取员工拥有的企业

- **URL**: `GET /api/v1/employees/:id/owned-companies`
- **参数**: `id` — 员工 ID

---

### 员工-公司关联管理

#### 将员工添加到公司

- **URL**: `POST /api/v1/employees/:id/companies`
- **参数**: `id` — 员工 ID
- **请求体**:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 从公司移除员工

- **URL**: `DELETE /api/v1/employees/:id/companies`
- **参数**: `id` — 员工 ID
- **请求体**:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 获取员工所在公司

- **URL**: `GET /api/v1/employees/:id/companies`
- **参数**: `id` — 员工 ID

#### 获取员工所在公司详情

- **URL**: `GET /api/v1/employees/:id/companies/details` 【⚠️注意： 这个接口不可用， 目前也不需要】
- **参数**: `id` — 员工 ID

---

### 员工-部门关联管理

#### 将员工添加到部门

- **URL**: `POST /api/v1/employees/:id/departments`
- **参数**: `id` — 员工 ID
- **请求体**（`company_id` 必填，与关联表一致）:

```json
{
  "department_id": 10,
  "company_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 从部门移除员工

- **URL**: `DELETE /api/v1/employees/:id/departments`
- **参数**: `id` — 员工 ID
- **请求体**:

```json
{
  "department_id": 10,
  "company_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 获取员工所在部门（级联）

- **URL**: `GET /api/v1/employees/:id/cascade-departments`
- **参数**:
  - 路径：`id` — 员工 ID
  - 查询：**`company_id`（必填）** — 公司 ID，用于限定该公司下的部门路径

示例：`GET /api/v1/employees/7c9e6679-7425-40de-944b-e07fc1f90ae7/cascade-departments?company_id=550e8400-e29b-41d4-a716-446655440000`

#### 移动员工到其他部门

- **URL**: `PUT /api/v1/employees/:id/move-department`
- **参数**: `id` — 员工 ID
- **请求体**:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "from_department_id": 10,
  "to_department_id": 15
}
```

---

## 公司-员工批量查询接口

### 获取公司的所有员工

- **URL**: `GET /api/v1/company-employees/:companyId/employees`
- **参数**: `companyId` — 公司 ID（string）

### 获取公司员工总数

- **URL**: `GET /api/v1/company-employees/:companyId/total-employees`
- **参数**: `companyId` — 公司 ID

### 搜索公司员工

- **URL**: `GET /api/v1/company-employees/:companyId/search`
- **参数**:
  - `companyId` — 公司 ID（路径）
  - `keyword` — 搜索关键词（查询参数，必填；通常匹配姓名、邮箱、电话）
  - `department_id` — 可选；若提供，可限定在该部门及其子部门范围内搜索（以服务端为准）

**示例**:

`/api/v1/company-employees/550e8400-e29b-41d4-a716-446655440000/search?keyword=%E5%BC%A0%E4%B8%89`

---

## 部门-员工批量查询接口

### 获取部门的所有员工

- **URL**: `GET /api/v1/department-employees/:departmentId/employees`
- **参数**: `departmentId` — 部门 ID（number）

### 获取部门员工总数

- **URL**: `GET /api/v1/department-employees/:departmentId/total-employees`
- **参数**: `departmentId` — 部门 ID

### 搜索部门员工

- **URL**: `GET /api/v1/department-employees/:departmentId/search`
- **参数**:
  - `departmentId` — 部门 ID（路径）
  - `keyword` — 搜索关键词（查询参数，必填）
  - `company_id` — **必填**，公司 ID（string）

**示例**:

`/api/v1/department-employees/10/search?keyword=%E6%9D%8E%E5%9B%9B&company_id=550e8400-e29b-41d4-a716-446655440000`

---

## 用户相关接口

### 获取用户所在企业

- **URL**: `GET /api/v1/users/:userId/companies`
- **参数**: `userId` — 用户 ID（格式以服务端为准）

### 获取用户拥有的企业

- **URL**: `GET /api/v1/users/:userId/owned-companies`
- **参数**: `userId` — 用户 ID

### 转移企业所有权

- **URL**: `POST /api/v1/users/:userId/transfer-ownership/:id`
- **参数**:
  - `userId` — 当前所有者用户 ID
  - `id` — 公司 ID（string）
- **请求体**（`new_owner_id` 为员工/用户侧 ID，与 `owner_id` 同为字符串）:

```json
{
  "new_owner_id": "8f14e45f-ceea-267a-9b99-b840d4ffcb76"
}
```

---

## 版本管理接口

### 获取联系人版本

- **URL**: `GET /api/v1/versions/companies/:companyId/contacts`
- **参数**: `companyId` — 公司 ID
- **响应示例**（`version` 多为字符串，如 UUID，以服务端为准）:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "contacts"
}
```

### 更新联系人版本（通常用于测试或手动触发缓存刷新）

- **URL**: `PUT /api/v1/versions/companies/:companyId/contacts`
- **参数**: `companyId` — 公司 ID
- **请求体**: **无**（空 body；由服务端 bump 版本）。客户端调用示例为无 JSON 的 `PUT`。

**响应示例**:

```json
{
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Version updated successfully"
}
```

---

## 错误响应

### 认证错误

```json
{
  "error": "Invalid or missing API key",
  "code": "INVALID_API_KEY"
}
```

### 404 错误

```json
{
  "error": "Endpoint not found: /api/v1/invalid-path"
}
```

### 通用错误格式

```json
{
  "error": "错误描述信息"
}
```

---

## 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 资源创建成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败（API Key 无效） |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 使用示例

### cURL 示例

```bash
# 创建公司（字段与 Company 模型一致，无 address/phone/email）
curl -X POST http://localhost:8080/api/v1/companies \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "id":"550e8400-e29b-41d4-a716-446655440000",
    "name":"测试公司",
    "type":"team",
    "description":"说明",
    "owner_id":"6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  }'

# 获取公司列表
curl -X GET http://localhost:8080/api/v1/companies \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 搜索公司员工（companyId 为公司 UUID）
curl -X GET "http://localhost:8080/api/v1/company-employees/550e8400-e29b-41d4-a716-446655440000/search?keyword=%E5%BC%A0%E4%B8%89" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 更新通讯录版本（无请求体）
curl -X PUT "http://localhost:8080/api/v1/versions/companies/550e8400-e29b-41d4-a716-446655440000/contacts" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"
```
