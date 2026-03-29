
# 联系人管理API文档

## 概述

联系人管理功能允许员工（Employee）建立和管理与其他员工之间的业务关系，支持客户（Customer）和供应商（Supplier）两种关系类型。所有联系人都是系统中已存在的员工对象，通过统一的关系表建立联系。

### 业务场景
- **客户关系**：记录员工与客户之间的业务往来关系
- **供应商关系**：记录员工与供应商之间的合作关系
- **统一管理**：通过 `contact_type` 参数区分客户和供应商

### 核心特点
- ✅ 统一接口，通过 `contact_type` 参数区分客户/供应商
- ✅ 支持关系描述，便于记录业务详情
- ✅ 支持简单查询和详细查询两种模式
- ✅ 完整的唯一性约束，避免重复关系

---

## 数据模型

### EmployeeContact（员工联系人关系表）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | VARCHAR(36) | PRIMARY KEY | 关系ID（UUID） |
| employee_id | VARCHAR(36) | NOT NULL, INDEX | 员工ID（关系的发起方） |
| contact_id | VARCHAR(36) | NOT NULL, INDEX | 联系人ID（关系的目标方） |
| contact_type | VARCHAR(20) | NOT NULL, DEFAULT 'customer' | 关系类型：customer（客户）、supplier（供应商） |
| description | TEXT | - | 关系描述 |
| created_at | BIGINT | AUTO | 创建时间戳 |
| updated_at | BIGINT | AUTO | 更新时间戳 |

**唯一约束**：`(employee_id, contact_id, contact_type)` 联合唯一索引

---

## API接口

### 基础URL
```
/api/v1/employees/{employee_id}/contacts
```

---

### 1. 添加联系人

#### 接口描述
为指定员工添加客户或供应商关系

#### 请求信息
- **URL**：`POST /api/v1/employees/{employee_id}/contacts`
- **认证**：需要API Key（X-API-KEY）
- **Content-Type**：`application/json`

#### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_id | string | 是 | 员工ID |

#### 请求体
```json
{
    "contact_id": "emp_87654321",
    "contact_type": "customer",
    "description": "重要客户，长期合作"
}
```

#### 参数说明
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_id | string | 是 | 联系人员工ID（系统中已存在的员工） |
| contact_type | string | 是 | 关系类型：`customer`（客户）或 `supplier`（供应商） |
| description | string | 否 | 关系描述，最大长度不限 |

#### 响应示例
**成功响应**：
```json
{
    "message": "Contact added successfully"
}
```

**错误响应**：
```json
{
    "error": "Contact already exists"
}
```

```json
{
    "error": "contact_type must be 'customer' or 'supplier'"
}
```

---

### 2. 移除联系人

#### 接口描述
删除员工与指定联系人的关系

#### 请求信息
- **URL**：`DELETE /api/v1/employees/{employee_id}/contacts`
- **认证**：需要API Key（X-API-KEY）

#### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_id | string | 是 | 员工ID |

#### 查询参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_id | string | 是 | 联系人员工ID |
| contact_type | string | 是 | 关系类型：`customer` 或 `supplier` |

#### 响应示例
**成功响应**：
```json
{
    "message": "Contact removed successfully"
}
```

**错误响应**：
```json
{
    "error": "contact_id is required"
}
```

---

### 3. 获取联系人列表（基础信息）

#### 接口描述
获取指定员工的所有客户或供应商（仅包含联系人的基本信息）

#### 请求信息
- **URL**：`GET /api/v1/employees/{employee_id}/contacts`
- **认证**：需要API Key（X-API-KEY）

#### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_id | string | 是 | 员工ID |

#### 查询参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_type | string | 是 | 关系类型：`customer` 或 `supplier` |

#### 响应示例
```json
{
    "employee_id": "emp_12345678",
    "contact_type": "customer",
    "contacts": [
        {
            "id": "emp_87654321",
            "name": "张三",
            "email": "zhangsan@example.com",
            "position": "采购经理",
            "phone": "13800138000"
        },
        {
            "id": "emp_11223344",
            "name": "李四",
            "email": "lisi@example.com",
            "position": "CEO",
            "phone": "13900139000"
        }
    ]
}
```

---

### 4. 获取联系人列表（详细信息）

#### 接口描述
获取指定员工的所有客户或供应商，包含关系描述和创建时间等详细信息

#### 请求信息
- **URL**：`GET /api/v1/employees/{employee_id}/contacts/details`
- **认证**：需要API Key（X-API-KEY）

#### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_id | string | 是 | 员工ID |

#### 查询参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contact_type | string | 是 | 关系类型：`customer` 或 `supplier` |

#### 响应示例
```json
{
    "employee_id": "emp_12345678",
    "contact_type": "customer",
    "contacts": [
        {
            "contact": {
                "id": "emp_87654321",
                "name": "张三",
                "email": "zhangsan@example.com",
                "position": "采购经理",
                "phone": "13800138000"
            },
            "contact_type": "customer",
            "description": "重要客户，长期合作",
            "created_at": 1700000000
        },
        {
            "contact": {
                "id": "emp_11223344",
                "name": "李四",
                "email": "lisi@example.com",
                "position": "CEO",
                "phone": "13900139000"
            },
            "contact_type": "customer",
            "description": "新客户，正在洽谈",
            "created_at": 1700001000
        }
    ]
}
```

---

### 5. 获取所有联系人

#### 接口描述
获取指定员工的所有客户和供应商，按类型分组返回

#### 请求信息
- **URL**：`GET /api/v1/employees/{employee_id}/contacts/all`
- **认证**：需要API Key（X-API-KEY）

#### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| employee_id | string | 是 | 员工ID |

#### 响应示例
```json
{
    "employee_id": "emp_12345678",
    "contacts": {
        "customers": [
            {
                "id": "emp_87654321",
                "name": "张三",
                "email": "zhangsan@example.com",
                "position": "采购经理",
                "phone": "13800138000"
            },
            {
                "id": "emp_11223344",
                "name": "李四",
                "email": "lisi@example.com",
                "position": "CEO",
                "phone": "13900139000"
            }
        ],
        "suppliers": [
            {
                "id": "emp_99887766",
                "name": "王五",
                "email": "wangwu@example.com",
                "position": "销售总监",
                "phone": "13700137000"
            },
            {
                "id": "emp_55443322",
                "name": "赵六",
                "email": "zhaoliu@example.com",
                "position": "项目经理",
                "phone": "13600136000"
            }
        ]
    }
}
```

---

## 业务规则

### 关系管理
1. **唯一性约束**：同一个员工与同一个联系人的同一类型关系只能存在一条
2. **关系独立性**：同一个人可以同时是客户和供应商（可以同时存在 customer 和 supplier 两种关系）
3. **单向关系**：关系是单向的，A将B设为客户，不代表B将A设为客户
4. **关系删除**：删除关系不影响员工本身的信息

### 数据完整性
1. **员工存在性**：添加联系人时，`employee_id` 和 `contact_id` 必须存在于系统中
2. **类型验证**：`contact_type` 只能是 `customer` 或 `supplier`
3. **级联删除**：删除员工时，自动删除该员工的所有联系人关系（作为 employee_id 的记录）
4. **事务保证**：所有写操作都在数据库事务中执行，保证数据一致性

---

## 错误码

| HTTP状态码 | 错误信息 | 说明 | 解决方案 |
|------------|----------|------|----------|
| 400 | contact_type must be 'customer' or 'supplier' | contact_type参数值无效 | 使用正确的值：customer 或 supplier |
| 400 | contact_id is required | 缺少contact_id参数 | 在请求中提供contact_id |
| 400 | contact_type is required | 缺少contact_type参数 | 在请求中提供contact_type |
| 400 | Invalid contact ID | 联系人ID格式错误 | 检查contact_id格式 |
| 401 | Invalid or missing API key | API密钥无效或缺失 | 在请求头中添加正确的X-API-KEY |
| 404 | Employee not found | 员工不存在 | 检查employee_id是否正确 |
| 404 | Contact person not found | 联系人不存在 | 检查contact_id是否正确 |
| 409 | Contact already exists | 联系人关系已存在 | 关系已存在，无需重复添加 |
| 500 | Internal server error | 服务器内部错误 | 联系技术支持 |

---

## 使用示例

### cURL 示例

```bash
# 1. 添加客户
curl -X POST \
  http://localhost:8080/api/v1/employees/emp_12345678/contacts \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_id": "emp_87654321",
    "contact_type": "customer",
    "description": "重要客户"
  }'

# 2. 添加供应商
curl -X POST \
  http://localhost:8080/api/v1/employees/emp_12345678/contacts \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_id": "emp_99887766",
    "contact_type": "supplier",
    "description": "主要供应商"
  }'

# 3. 获取客户列表
curl -X GET \
  "http://localhost:8080/api/v1/employees/emp_12345678/contacts?contact_type=customer" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 4. 获取供应商列表（详细信息）
curl -X GET \
  "http://localhost:8080/api/v1/employees/emp_12345678/contacts/details?contact_type=supplier" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 5. 获取所有联系人
curl -X GET \
  http://localhost:8080/api/v1/employees/emp_12345678/contacts/all \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 6. 移除客户
curl -X DELETE \
  "http://localhost:8080/api/v1/employees/emp_12345678/contacts?contact_id=emp_87654321&contact_type=customer" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"

# 7. 移除供应商
curl -X DELETE \
  "http://localhost:8080/api/v1/employees/emp_12345678/contacts?contact_id=emp_99887766&contact_type=supplier" \
  -H "X-API-KEY: b3cz8fsbrfd4ukmfmssf864pqr"
```

### JavaScript (Axios) 示例

```javascript
// 配置
const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'b3cz8fsbrfd4ukmfmssf864pqr';

const headers = {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json'
};

// 添加客户
async function addCustomer(employeeId, customerId, description) {
    try {
        const response = await axios.post(
            `${API_BASE}/employees/${employeeId}/contacts`,
            {
                contact_id: customerId,
                contact_type: 'customer',
                description: description
            },
            { headers }
        );
        console.log('客户添加成功:', response.data);
        return response.data;
    } catch (error) {
        console.error('添加客户失败:', error.response?.data);
    }
}

// 获取客户列表
async function getCustomers(employeeId) {
    try {
        const response = await axios.get(
            `${API_BASE}/employees/${employeeId}/contacts`,
            {
                params: { contact_type: 'customer' },
                headers
            }
        );
        return response.data.contacts;
    } catch (error) {
        console.error('获取客户列表失败:', error.response?.data);
    }
}

// 获取所有联系人
async function getAllContacts(employeeId) {
    try {
        const response = await axios.get(
            `${API_BASE}/employees/${employeeId}/contacts/all`,
            { headers }
        );
        return response.data.contacts;
    } catch (error) {
        console.error('获取联系人列表失败:', error.response?.data);
    }
}

// 移除供应商
async function removeSupplier(employeeId, supplierId) {
    try {
        const response = await axios.delete(
            `${API_BASE}/employees/${employeeId}/contacts`,
            {
                params: {
                    contact_id: supplierId,
                    contact_type: 'supplier'
                },
                headers
            }
        );
        console.log('供应商移除成功:', response.data);
        return response.data;
    } catch (error) {
        console.error('移除供应商失败:', error.response?.data);
    }
}

// 使用示例
await addCustomer('emp_12345678', 'emp_87654321', '重要客户');
const customers = await getCustomers('emp_12345678');
console.log('客户列表:', customers);

const allContacts = await getAllContacts('emp_12345678');
console.log('客户:', allContacts.customers);
console.log('供应商:', allContacts.suppliers);
```

---

## 注意事项

1. **员工存在性**：所有添加的联系人必须是系统中已存在的员工
2. **关系方向**：关系是单向的，添加客户只表示当前员工将该联系人视为客户
3. **数据一致性**：删除员工时，该员工的所有关系（作为 employee_id）会自动删除
4. **性能考虑**：查询大量联系人时，建议后续扩展分页功能
5. **描述字段**：description 字段可用于记录业务关系详情，如合作历史、合同编号等
6. **类型验证**：API 会严格验证 contact_type 参数，必须是 'customer' 或 'supplier'

---

## 后续扩展建议

1. **分页支持**：为列表查询添加分页参数（page, limit）
2. **搜索功能**：支持按姓名、邮箱、电话搜索联系人
3. **批量操作**：支持批量添加/删除联系人
4. **关系标签**：支持自定义标签，如"VIP客户"、"战略供应商"等
5. **关系历史**：记录关系变更历史
6. **双向同步**：可选支持双向关系的自动建立
7. **导出功能**：支持导出联系人列表为 Excel 或 CSV 格式
8. **统计报表**：提供联系人数量统计、关系分析等功能