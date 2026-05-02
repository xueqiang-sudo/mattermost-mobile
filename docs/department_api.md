# Department Management API Documentation

本文档描述了 Mattermost 部门管理系统的所有 API 端点，包括部门管理、成员管理、员工联系人管理、版本同步功能，以及与本项目配合使用的 Mattermost 标准用户搜索接口。

---

## Table of Contents

- [Department Management API Documentation](#department-management-api-documentation)
  - [Table of Contents](#table-of-contents)
  - [Base Information](#base-information)
  - [1. Department CRUD Operations](#1-department-crud-operations)
    - [1.1 Get Departments](#11-get-departments)
    - [1.2 Create Department](#12-create-department)
    - [1.3 Get Department](#13-get-department)
    - [1.4 Update Department](#14-update-department)
    - [1.5 Delete Department](#15-delete-department)
  - [2. Department Tree Operations](#2-department-tree-operations)
    - [2.1 Get Department Tree](#21-get-department-tree)
    - [2.2 Get Department Children](#22-get-department-children)
    - [2.3 Get Department Ancestors](#23-get-department-ancestors)
  - [3. Department Member Operations](#3-department-member-operations)
    - [3.1 Get Department Members](#31-get-department-members)
    - [3.2 Get Users Without Department Membership](#32-get-users-without-department-membership)
    - [3.3 Add Department Member](#33-add-department-member)
    - [3.4 Remove Department Member](#34-remove-department-member)
    - [3.5 Batch Add Members](#35-batch-add-members)
    - [3.6 Batch Remove Members](#36-batch-remove-members)
    - [3.7 Move Department Member](#37-move-department-member)
    - [3.8 Batch Move Members](#38-batch-move-members)
  - [4. User Department Operations](#4-user-department-operations)
    - [4.1 Get User Departments](#41-get-user-departments)
  - [5. Employee Contact Operations](#5-employee-contact-operations)
    - [5.1 Get Employee Contacts](#51-get-employee-contacts)
    - [5.2 Add Employee Contact](#52-add-employee-contact)
    - [5.3 Update Employee Contact](#53-update-employee-contact)
    - [5.4 Delete Employee Contact](#54-delete-employee-contact)
  - [6. Contact Version Management](#6-contact-version-management)
    - [6.1 Get Contact Version](#61-get-contact-version)
    - [6.2 Update Contact Version](#62-update-contact-version)
  - [7. Department Statistics](#7-department-statistics)
    - [7.1 Get Department Stats](#71-get-department-stats)
  - [8. Team Version Management](#8-team-version-management)
    - [8.1 Get Team Version](#81-get-team-version)
    - [8.2 Update Team Version](#82-update-team-version)
  - [9. User Search (Mattermost)](#9-user-search-mattermost)
    - [9.1 Search Users](#91-search-users)
  - [Cache Synchronization Strategy](#cache-synchronization-strategy)
    - [Recommended Approach](#recommended-approach)
    - [Best Practices](#best-practices)
  - [Data Models](#data-models)
    - [Department](#department)
    - [DepartmentMember](#departmentmember)
    - [EmployeeContact](#employeecontact)
    - [DepartmentMembersWithCount](#departmentmemberswithcount)
    - [DepartmentStats](#departmentstats)
  - [Audit Logging](#audit-logging)
  - [Error Handling Examples](#error-handling-examples)
    - [JavaScript Example](#javascript-example)
  - [Rate Limiting](#rate-limiting)
  - [Support](#support)

---

## Base Information

**Base URL:** `/api/v4`

**Authentication:** All endpoints require authentication via Bearer token in the Authorization header.

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Common Query Parameters:**
- `page`: Page number (0-indexed, default: 0)
- `per_page`: Items per page (default: 60)

**Common Error Responses:**
- `400 Bad Request` - Invalid or missing parameters
- `401 Unauthorized` - Authentication required or invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## 1. Department CRUD Operations

### 1.1 Get Departments

获取团队中的所有部门（分页）。

**Endpoint:** `GET /teams/{team_id}/departments`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| team_id   | string | Yes      | The team ID     |

**Query Parameters:**
| Parameter | Type   | Required | Description         | Default |
|-----------|--------|----------|---------------------|---------|
| parent_id | number | No       | 不传则不指定， -1: 根部门, >= 0: 指定 parent id  | undefined       |
| page      | number | No       | Page number         | 0       |
| per_page  | number | No       | Items per page      | 60      |

**Response:** `200 OK`
```json
{
  "departments": [
    {
      "id": 1,
      "team_id": "abc123...",
      "name": "Engineering",
      "description": "Engineering Department",
      "parent_id": null,
      "create_at": 1713340800000,
      "update_at": 1713340800000,
      "delete_at": 0
    }
  ],
  "total_count": 15
}
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments?page=0&per_page=20' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 1.2 Create Department

创建新部门。

**Endpoint:** `POST /teams/{team_id}/departments`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Request Body:**
```json
{
  "name": "Marketing",
  "description": "Marketing Department",
  "parent_id": null,
  "is_unique_name": true
}
```

**Request Fields:**
| Field       | Type   | Required | Description                                    |
|-------------|--------|----------|------------------------------------------------|
| name        | string | Yes      | Department name (max 255 chars)               |
| description | string | No       | Department description (max 65535 chars)      |
| parent_id   | number | No       | Parent department ID (null for root level)    |
| is_unique_name | boolean | No   | 控制部门名是否唯一 |

**Response:** `201 Created`
```json
{
  "id": 5,
  "team_id": "abc123...",
  "name": "Marketing",
  "description": "Marketing Department",
  "parent_id": null,
  "create_at": 1713340800000,
  "update_at": 1713340800000,
  "delete_at": 0
}
```

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/teams/abc123/departments' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Marketing","description":"Marketing Department","is_unique_name":true}'
```

---

### 1.3 Get Department

获取单个部门的详细信息。

**Endpoint:** `GET /teams/{team_id}/departments/{department_id}`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Response:** `200 OK`
```json
{
  "id": 5,
  "team_id": "abc123...",
  "name": "Marketing",
  "description": "Marketing Department",
  "parent_id": null,
  "create_at": 1713340800000,
  "update_at": 1713340800000,
  "delete_at": 0
}
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/5' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 1.4 Update Department

更新部门信息。

**Endpoint:** `PUT /teams/{team_id}/departments/{department_id}`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Request Body:**
```json
{
  "name": "Marketing & Sales",
  "description": "Updated description",
  "parent_id": 2
}
```

**Response:** `200 OK`
```json
{
  "id": 5,
  "team_id": "abc123...",
  "name": "Marketing & Sales",
  "description": "Updated description",
  "parent_id": 2,
  "create_at": 1713340800000,
  "update_at": 1713427200000,
  "delete_at": 0
}
```

**Example:**
```bash
curl -X PUT \
  'http://localhost:8065/api/v4/teams/abc123/departments/5' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Marketing & Sales","parent_id":2}'
```

---

### 1.5 Delete Department

软删除部门（标记为已删除）。

**Endpoint:** `DELETE /teams/{team_id}/departments/{department_id}`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- This is a soft delete; the department is marked as deleted but not removed from the database
- All child departments will also be deleted
- Team version is automatically updated

**Example:**
```bash
curl -X DELETE \
  'http://localhost:8065/api/v4/teams/abc123/departments/5' \
  -H 'Authorization: Bearer TOKEN'
```

---

## 2. Department Tree Operations

### 2.1 Get Department Tree

获取部门的树形结构。

**Endpoint:** `GET /teams/{team_id}/departments/tree`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Query Parameters:**
| Parameter | Type   | Required | Description                        | Default |
|-----------|--------|----------|------------------------------------|---------|
| parent_id | number | No       | Parent department ID (null for root) | null    |
| page      | number | No       | Page number                        | 0       |
| per_page  | number | No       | Items per page                     | 60      |

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "team_id": "abc123...",
    "name": "Engineering",
    "description": "Engineering Department",
    "parent_id": null,
    "create_at": 1713340800000,
    "update_at": 1713340800000,
    "delete_at": 0
  },
  {
    "id": 2,
    "team_id": "abc123...",
    "name": "Sales",
    "description": "Sales Department",
    "parent_id": null,
    "create_at": 1713340800000,
    "update_at": 1713340800000,
    "delete_at": 0
  }
]
```

**Example:**
```bash
# Get root departments
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/tree' \
  -H 'Authorization: Bearer TOKEN'

# Get children of department 1
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/tree?parent_id=1' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 2.2 Get Department Children

获取部门的直接子部门。

**Endpoint:** `GET /teams/{team_id}/departments/{department_id}/children`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Response:** `200 OK`
```json
[
  {
    "id": 3,
    "team_id": "abc123...",
    "name": "Frontend Team",
    "description": "Frontend Development",
    "parent_id": 1,
    "create_at": 1713340800000,
    "update_at": 1713340800000,
    "delete_at": 0
  }
]
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/1/children' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 2.3 Get Department Ancestors

获取部门的所有祖先部门（从根到父级）。

**Endpoint:** `GET /teams/{team_id}/departments/{department_id}/ancestors`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "team_id": "abc123...",
    "name": "Engineering",
    "parent_id": null
  },
  {
    "id": 2,
    "team_id": "abc123...",
    "name": "Development",
    "parent_id": 1
  }
]
```

**Notes:**
- Returns ancestors from immediate parent to root
- Does not include the department itself
- Useful for breadcrumb navigation

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/ancestors' \
  -H 'Authorization: Bearer TOKEN'
```

---

## 3. Department Member Operations

### 3.1 Get Department Members

获取部门的成员列表（带总数）。

**Endpoint:** `GET /teams/{team_id}/departments/{department_id}/members`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Query Parameters:**
| Parameter | Type   | Required | Description     | Default |
|-----------|--------|----------|-----------------|---------|
| page      | number | No       | Page number     | 0       |
| per_page  | number | No       | Items per page  | 60      |

**Response:** `200 OK`
```json
{
  "members": [
    {
      "id": "user1abc...",
      "username": "john.doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "nickname": "",
      "position": "Developer"
    }
  ],
  "total_count": 25
}
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members?page=0&per_page=20' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 3.2 Get Users Without Department Membership

获取团队中未加入任何部门的用户列表（带总数）。

**Endpoint:** `GET /teams/{team_id}/departments/without-members`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| team_id   | string | Yes      | The team ID     |

**Query Parameters:**
| Parameter | Type   | Required | Description     | Default |
|-----------|--------|----------|-----------------|---------|
| page      | number | No       | Page number     | 0       |
| per_page  | number | No       | Items per page  | 60      |

**Response:** `200 OK`
```json
{
  "members": [
    {
      "id": "user123",
      "username": "zhangsan",
      "email": "zhangsan@example.com",
      "first_name": "三",
      "last_name": "张"
    },
    {
      "id": "user456",
      "username": "lisi"
    }
  ],
  "total_count": 25
}
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/without-members?page=0&per_page=50' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 3.3 Add Department Member

添加成员到部门。

**Endpoint:** `POST /teams/{team_id}/departments/{department_id}/members`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Request Body:**
```json
{
  "user_id": "xyz789..."
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- Team version is automatically updated after successful addition
- Audit log entry is created

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"xyz789..."}'
```

---

### 3.4 Remove Department Member

从部门移除成员。

**Endpoint:** `DELETE /teams/{team_id}/departments/{department_id}/members/{user_id}`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |
| user_id       | string | Yes      | The user ID        |

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- Team version is automatically updated
- Audit log entry is created

**Example:**
```bash
curl -X DELETE \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members/xyz789...' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 3.5 Batch Add Members

批量添加成员到部门。

**Endpoint:** `POST /teams/{team_id}/departments/{department_id}/members/batch`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Request Body:**
```json
{
  "user_ids": ["user1...", "user2...", "user3..."]
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- All-or-nothing operation (transactional)
- Team version is updated once after all additions
- More efficient than individual adds

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members/batch' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"user_ids":["user1...","user2..."]}'
```

---

### 3.6 Batch Remove Members

批量从部门移除成员。

**Endpoint:** `DELETE /teams/{team_id}/departments/{department_id}/members/batch`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description        |
|---------------|--------|----------|--------------------|
| team_id       | string | Yes      | The team ID        |
| department_id | number | Yes      | The department ID  |

**Request Body:**
```json
{
  "user_ids": ["user1...", "user2..."]
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Example:**
```bash
curl -X DELETE \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members/batch' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"user_ids":["user1...","user2..."]}'
```

---

### 3.7 Move Department Member

将成员从一个部门移动到另一个部门。

**Endpoint:** `POST /teams/{team_id}/departments/{department_id}/members/move`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter     | Type   | Required | Description              |
|---------------|--------|----------|--------------------------|
| team_id       | string | Yes      | The team ID              |
| department_id | number | Yes      | Source department ID     |

**Request Body:**
```json
{
  "user_id": "xyz789...",
  "target_department_id": 8
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- Removes member from source department
- Adds member to target department
- Team version is updated once

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/teams/abc123/departments/5/members/move' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"xyz789...","target_department_id":8}'
```

---

### 3.8 Batch Move Members

批量移动成员到另一个部门。

**Endpoint:** `POST /teams/{team_id}/departments/members/move-batch`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Request Body:**
```json
{
  "source_department_id": 5,
  "target_department_id": 8,
  "user_ids": ["user1...", "user2..."]
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Notes:**
- Efficient for moving multiple members at once
- Team version is updated once
- Transactional operation

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/teams/abc123/departments/members/move-batch' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"source_department_id":5,"target_department_id":8,"user_ids":["user1...","user2..."]}'
```

---

## 4. User Department Operations

### 4.1 Get User Departments

获取用户所属的所有部门。

**Endpoint:** `GET /users/{user_id}/departments`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Query Parameters:**
| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| team_id   | string | Yes      | The team ID     |

**Response:** `200 OK`
```json
[
  {
    "id": 5,
    "team_id": "abc123...",
    "name": "Marketing",
    "description": "Marketing Department",
    "parent_id": null
  },
  {
    "id": 8,
    "team_id": "abc123...",
    "name": "Product",
    "description": "Product Management",
    "parent_id": null
  }
]
```

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/users/xyz789.../departments?team_id=abc123...' \
  -H 'Authorization: Bearer TOKEN'
```

---

## 5. Employee Contact Operations

### 5.1 Get Employee Contacts

获取员工的联系人列表（客户/供应商）。

**Endpoint:** `GET /users/{user_id}/contacts`

**Permissions:** 
- Users can only view their own contacts
- System admins can view any user's contacts

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Query Parameters:**
| Parameter   | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| contact_type| string | No       | Filter by type: "customer" or "supplier" |
| page        | number | No       | Page number                          |
| per_page    | number | No       | Items per page                       |
| granularity | number | No       | 控制返回的 contact 粒度, 不传: 不返回 contact，1: 完整 contact，1， 2: 简洁 contact |

**Response:** `200 OK`
```json
[
  {
    "id": "contact1...",
    "employee_id": "xyz789...",
    "contact_id": "contact_abc...",
    "contact_type": "customer",
    "description": "Key customer",
    "remark": "VIP client",
    "create_at": 1713340800000,
    "update_at": 1713340800000
  }
]
```

**Example:**
```bash
# Get all contacts
curl -X GET \
  'http://localhost:8065/api/v4/users/xyz789.../contacts' \
  -H 'Authorization: Bearer TOKEN'

# Get only customers
curl -X GET \
  'http://localhost:8065/api/v4/users/xyz789.../contacts?contact_type=customer' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 5.2 Add Employee Contact

添加员工联系人关系。

**Endpoint:** `POST /users/{user_id}/contacts`

**Permissions:** Same as Get Employee Contacts

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Request Body:**
```json
{
  "contact_id": "contact_abc...",
  "contact_type": "customer",
  "description": "Key customer relationship",
  "remark": "VIP client"
}
```

**Request Fields:**
| Field        | Type   | Required | Description                           |
|--------------|--------|----------|---------------------------------------|
| contact_id   | string | Yes      | The contact user ID                   |
| contact_type | string | Yes      | "customer" or "supplier"              |
| description  | string | No       | Description of the relationship       |
| remark       | string | No       | Additional notes                      |

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/users/xyz789.../contacts' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"contact_id":"contact_abc...","contact_type":"customer","description":"Key customer"}'
```

---

### 5.3 Update Employee Contact

更新员工联系人信息。

**Endpoint:** `PUT /users/{user_id}/contacts`

**Permissions:** Same as Get Employee Contacts

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Request Body:**
```json
{
  "contact_id": "contact_abc...",
  "contact_type": "customer",
  "description": "Updated description",
  "remark": "Updated remark"
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Example:**
```bash
curl -X PUT \
  'http://localhost:8065/api/v4/users/xyz789.../contacts' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"contact_id":"contact_abc...","contact_type":"customer","description":"Updated"}'
```

---

### 5.4 Delete Employee Contact

删除员工联系人关系。

**Endpoint:** `DELETE /users/{user_id}/contacts`

**Permissions:** Same as Get Employee Contacts

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Request Body:**
```json
{
  "contact_id": "contact_abc...",
  "contact_type": "customer"
}
```

**Response:** `200 OK`
```json
{
  "status": "OK"
}
```

**Example:**
```bash
curl -X DELETE \
  'http://localhost:8065/api/v4/users/xyz789.../contacts' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"contact_id":"contact_abc...","contact_type":"customer"}'
```

---

## 6. Contact Version Management

### 6.1 Get Contact Version

获取用户联系人的当前版本号（用于缓存同步）。

**Endpoint:** `GET /users/{user_id}/contacts/version`

**Permissions:**
- Users can only view their own version
- System admins can view any user's version

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Response:** `200 OK`
```json
{
  "user_id": "xyz789...",
  "version": "v1713340800000",
  "last_updated": 1713340800000
}
```

**Use Case:**
Clients poll this endpoint periodically to detect if their cached contact data is stale. If the version has changed, they should refresh their cache.

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/users/xyz789.../contacts/version' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 6.2 Update Contact Version

更新用户联系人的版本号（在修改联系人后调用）。

**Endpoint:** `PUT /users/{user_id}/contacts/version`

**Permissions:** Same as Get Contact Version

**Path Parameters:**
| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| user_id   | string | Yes      | The user ID   |

**Request Body:**
```json
{
  "version": "v1713427200000"
}
```

**Request Fields:**
| Field   | Type   | Required | Description                              |
|---------|--------|----------|------------------------------------------|
| version | string | Yes      | New version string (recommended: timestamp) |

**Response:** `200 OK`
```json
{
  "user_id": "xyz789...",
  "version": "v1713427200000",
  "updated_at": 1713427200000
}
```

**Notes:**
- Should be called after adding/updating/deleting contacts
- Audit log entry is created
- Other clients polling will detect the change

**Example:**
```bash
curl -X PUT \
  'http://localhost:8065/api/v4/users/xyz789.../contacts/version' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"version":"v1713427200000"}'
```

---

## 7. Department Statistics

### 7.1 Get Department Stats

获取团队的部门统计数据。

**Endpoint:** `GET /teams/{team_id}/departments/stats`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Query Parameters:**
| Parameter   | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| department_id | number | No       | 指定 department_id，如果没有则获取的是整个 team 的 |

**Response:** `200 OK`
```json
{
  "team_id": "abc123...",
  "total_departments": 15,
  "root_departments": 5,
  "total_members": 120,
  "average_members_per_department": 8.5
}
```

**Response Fields:**
| Field                             | Type   | Description                                    |
|-----------------------------------|--------|------------------------------------------------|
| team_id                           | string | The team ID                                    |
| total_departments                 | number | Total active departments                       |
| root_departments                  | number | Top-level departments (no parent)              |
| total_members                     | number | Unique users across all departments            |
| average_members_per_department    | number | Average members per department                 |

**Use Cases:**
- Dashboard statistics
- Capacity planning
- Organizational reporting

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/departments/stats' \
  -H 'Authorization: Bearer TOKEN'
```

---

## 8. Team Version Management

### 8.1 Get Team Version

获取团队的当前版本号（用于缓存同步）。

**Endpoint:** `GET /api/v4/teams/{team_id}/version`

**Permissions:** `PermissionViewTeam`

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Response:** `200 OK`
```json
{
  "team_id": "abc123...",
  "version": "v1713340800000",
  "updated_at": 1713340800000
}
```

**Automatic Updates:**
The team version is automatically updated when:
- A department is created
- A department is updated
- A department is deleted
- A member is added to a department
- A member is removed from a department
- Members are moved between departments

**Use Case:**
Clients poll this endpoint to detect changes in team structure (departments and members). When the version changes, refresh cached department/member data.

**Example:**
```bash
curl -X GET \
  'http://localhost:8065/api/v4/teams/abc123/version' \
  -H 'Authorization: Bearer TOKEN'
```

---

### 8.2 Update Team Version

手动更新团队版本号（通常用于调试或特定同步场景）。

**Endpoint:** `PUT /api/v4/teams/{team_id}/version`

**Permissions:** `PermissionManageTeam` (Team Admin)

**Path Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| team_id   | string | Yes      | The team ID |

**Request Body:** 无需请求体（空 body）

**Response:** `200 OK`
```json
{
  "team_id": "abc123...",
  "version": "v1713427200001",
  "updated_at": 1713427200000
}
```

**Notes:**
- 服务端会自行生成并更新最新版本号，无需客户端传入 `version`
- 调用后可强制触发客户端下一轮版本检查时的数据刷新

**Example:**
```bash
curl -X PUT \
  'http://localhost:8065/api/v4/teams/abc123/version' \
  -H 'Authorization: Bearer TOKEN'
```

---

## 9. User Search (Mattermost)

本节为 Mattermost 平台自带的用户搜索能力，常用于选人、加成员、通讯录检索等场景。完整字段与行为以官方文档为准。

**官方参考：** [SearchUsers](https://developers.mattermost.com/api-documentation/#/operations/SearchUsers)

### 9.1 Search Users

按关键词在指定范围（团队、频道等）内搜索用户，返回 `User` 对象数组。

**Endpoint:** `POST /users/search`

**Permissions:** 需已认证；实际可见用户受团队/频道成员关系及服务器「用户可见性」等策略约束。

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| term | string | 是 | 搜索关键词（用户名、姓名等，具体匹配规则见官方说明） |
| team_id | string | 否 | 限定在指定团队内搜索 |
| not_in_team | string | 否 | 排除指定团队内的用户 |
| in_channel_id | string | 否 | 限定在指定频道成员中搜索 |
| not_in_channel_id | string | 否 | 排除指定频道内的用户 |
| in_group_id | string | 否 | 限定在指定用户组内 |
| group_constrained | boolean | 否 | 与组约束相关的过滤 |
| allow_inactive | boolean | 否 | 是否包含已停用用户 |
| without_team | boolean | 否 | 与「无团队」用户相关的过滤（见官方 API） |
| limit | number | 否 | 返回条数上限（数字形式，与客户端一致） |

**本仓库扩展字段（若服务端支持）：**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| department_id | number | 否 | 按部门维度过滤（与自定义部门功能配合时使用） |
| exact_match | boolean | 否 | 是否精确匹配 |

**Response:** `200 OK`

返回 JSON 数组，元素为 Mattermost `User` / `UserProfile` 结构（字段与标准用户对象一致，如 `id`、`username`、`email`、`first_name`、`last_name` 等）。

**Example:**
```bash
curl -X POST \
  'http://localhost:8065/api/v4/users/search' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "term": "zhang",
    "team_id": "abc123...",
    "allow_inactive": false,
    "limit": "50"
  }'
```

**Notes:**
- 与 `GET /users` 分页列表不同，本接口用于**按条件检索**，适合搜索框、选人组件。
- 客户端封装见 `ClientUsers.searchUsers`（`POST` 至 `users/search`，body 为 `{ term, ...options }`）；类型定义见 `types/api/users.d.ts` 中的 `SearchUserOptions`。
- 与「@ 提及自动完成」等场景相比，部分界面使用 `GET /users/autocomplete`（查询参数如 `in_team`、`in_channel`、`name`），与 `POST /users/search` 用途不同，请按产品需求选择。

---

## Cache Synchronization Strategy

### Recommended Approach

1. **Initial Load:**
   ```javascript
   // Load departments and store version
   const depts = await fetchDepartments(teamId);
   localStorage.setItem(`dept_version_${teamId}`, depts.version);
   ```

2. **Periodic Polling:**
   ```javascript
   // Check every 30 seconds
   setInterval(async () => {
     const response = await fetch(`/api/v4/teams/${teamId}/version`);
     const { version } = await response.json();
     
     const storedVersion = localStorage.getItem(`dept_version_${teamId}`);
     if (version !== storedVersion) {
       // Refresh cache
       await refreshDepartmentsCache();
       localStorage.setItem(`dept_version_${teamId}`, version);
     }
   }, 30000);
   ```

3. **Contact Sync:**
   ```javascript
   // Similar approach for contacts
   const checkContactUpdates = async () => {
     const response = await fetch(`/api/v4/users/${userId}/contacts/version`);
     const { version } = await response.json();
     
     if (version !== storedContactVersion) {
       await refreshContactsCache();
     }
   };
   ```

### Best Practices

- **Polling Interval:** 30-60 seconds for most applications
- **Version Format:** Use `"v{timestamp}"` format (e.g., `"v1713340800000"`)
- **Fallback:** Provide manual refresh button for users
- **Error Handling:** Gracefully handle network errors during version checks
- **Optimization:** Only fetch full data when version actually changes

---

## Data Models

### Department
```go
type Department struct {
    Id          int     `json:"id"`
    TeamId      string  `json:"team_id"`
    Name        string  `json:"name"`
    Description string  `json:"description"`
    ParentId    *int    `json:"parent_id"`
    CreateAt    int64   `json:"create_at"`
    UpdateAt    int64   `json:"update_at"`
    DeleteAt    int64   `json:"delete_at"`
}
```

### DepartmentMember
```go
type DepartmentMember struct {
    DepartmentId int    `json:"department_id"`
    UserId       string `json:"user_id"`
    TeamId       string `json:"team_id"`
}
```

### EmployeeContact
```go
type EmployeeContact struct {
    Id          string `json:"id"`
    EmployeeId  string `json:"employee_id"`
    ContactId   string `json:"contact_id"`
    ContactType string `json:"contact_type"` // "customer" or "supplier"
    Description string `json:"description"`
    Remark      string `json:"remark"`
    CreateAt    int64  `json:"create_at"`
    UpdateAt    int64  `json:"update_at"`
}
```

### DepartmentMembersWithCount
```go
type DepartmentMembersWithCount struct {
    Members    []*User `json:"members"`
    TotalCount int64   `json:"total_count"`
}
```

### DepartmentStats
```go
type DepartmentStats struct {
    TeamId                      string  `json:"team_id"`
    TotalDepartments            int     `json:"total_departments"`
    RootDepartments             int     `json:"root_departments"`
    TotalMembers                int     `json:"total_members"`
    AverageMembersPerDepartment float64 `json:"average_members_per_department"`
}
```

---

## Audit Logging

The following operations create audit log entries:
- `createDepartment`
- `updateDepartment`
- `deleteDepartment`
- `addDepartmentMember`
- `removeDepartmentMember`
- `batchAddDepartmentMembers`
- `batchRemoveDepartmentMembers`
- `moveDepartmentMember`
- `batchMoveDepartmentMembers`
- `updateContactVersion`

Audit logs include:
- Action name
- Status (success/fail)
- Relevant metadata (IDs, timestamps)

---

## Error Handling Examples

### JavaScript Example
```javascript
async function callDepartmentAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`/api/v4${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Usage
try {
  const members = await callDepartmentAPI(
    `/teams/${teamId}/departments/${deptId}/members`
  );
  console.log(members);
} catch (error) {
  if (error.message.includes('403')) {
    alert('You do not have permission to view department members');
  } else {
    alert('Failed to load members: ' + error.message);
  }
}
```

---

## Rate Limiting

All API endpoints are subject to rate limiting configured in the Mattermost server. Excessive requests may receive `429 Too Many Requests` responses.

**Recommendations:**
- Use caching to reduce API calls
- Implement exponential backoff for retries
- Use batch operations when possible
- Follow the version-based sync strategy to minimize unnecessary fetches

---

## Support

For questions or issues:
- Check server logs for detailed error messages
- Review audit logs for operation history
- Contact your Mattermost administrator
- Refer to the official Mattermost documentation

---

**Last Updated:** April 2026  
**API Version:** v4  
**Mattermost Version:** Compatible with v8+
