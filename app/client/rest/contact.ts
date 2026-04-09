// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 通讯录 API 模块
 * 通讯录为外部系统服务，使用单例模式，与 Mattermost 主 Client 分离。
 * 服务地址和 API Key 通过 init(contactServiceUrl, apiKey) 注入。
 * 继承 ClientTracking 复用请求处理与错误处理逻辑。
 */

import {
    getOrCreateAPIClient,
    RetryTypes,
    type APIClientConfiguration,
    type APIClientInterface,
} from '@mattermost/react-native-network-client';
import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import {modelName, osName, osVersion} from 'expo-device';

import * as ClientConstants from '@client/rest/constants';
import ClientError from '@client/rest/error';
import ClientTracking from '@client/rest/tracking';

import {
    cleanupExpiredContactDiskCache,
    clearContactDiskCacheCompany,
    clearAllContactDiskCache,
    readContactDiskCache,
    writeContactDiskCache,
} from './contact_disk_cache';

export const CONTACT_API_BASE_ROUTE = '/api/v1';
export const API_KEY_HEADER = 'X-API-KEY';
const CONTACT_VERSION_CACHE_TTL_MS = 5000;

/**
 * 是否启用通讯录「按公司」的版本号 + 响应体缓存（doRequestCompanyProxy）。
 * 调试接口或排查缓存问题时改为 `false`，所有走代理的请求将每次直连，不再读/写缓存、也不再为 GET 额外请求版本接口。
 */
export const CONTACT_ENABLE_COMPANY_PROXY_CACHE = true;

/** 用于识别默认部门的名称约定，与后端一致 */
export const DEFAULT_DEPARTMENT_NAME = 'FORCE_DEFAULT_DEPARTMENT';

/** 公司类型枚举：team=本公司/团队 */
export const ContactCompanyTypes = {
    Team: 'team',
} as const;
export type ContactCompanyType = typeof ContactCompanyTypes[keyof typeof ContactCompanyTypes];

/** 公司模型：id 为 36 位字符串主键，type 区分本公司/供应商/客户 */
export type ContactCompany = {
    id: string;
    name: string;
    type: ContactCompanyType;
    owner_id: string;
    description?: string;
}

/** 部门模型：id 为自增主键，parent_id 为父部门 ID，支持树形结构 */
export type ContactDepartment = {
    id: number;
    company_id: string;
    name: string;
    description?: string;
    parent_id?: number;
}

/** 员工模型：id 为 36 位字符串主键，支持多公司、多部门关联 */
export type ContactEmployee = {
    id: string;
    name: string;
    email?: string;
    position?: string;
    phone?: string;
}

/** 员工在公司下的级联部门路径（从根到叶） */
export type ContactCascadeDepartmentPath = ContactDepartment[];

/** 获取员工详细信息及级联部门响应 */
export type ContactEmployeeCascadeDepartments = {
    employee: ContactEmployee;
    cascade_departments: ContactCascadeDepartmentPath[];
}

/** 搜索员工返回项（包含员工与级联部门） */
export type ContactEmployeeSearchItem = {
    employee: ContactEmployee;
    cascade_departments: ContactCascadeDepartmentPath[];
    company_id?: string;
}

/** 创建公司请求体：id/name/type 必填，id 需客户端生成 36 位字符串 */
export type CreateCompanyRequest = ContactCompany;
export type UpdateCompanyRequest = Partial<Omit<ContactCompany, 'id'>>;

/** 创建部门请求：company_id 必填，parent_id 可选（有则为子部门） */
export type CreateDepartmentRequest = {
    company_id: string;
    name: string;
    description?: string;
    parent_id?: number | null;
};

/** 更新部门请求：parent_id 为 null 表示移到根（顶层） */
export type UpdateDepartmentRequest = Partial<Omit<ContactDepartment, 'id'>> & {company_id: string};

/** 创建员工请求体：id/name 必填，id 需客户端生成 36 位字符串 */
export type CreateEmployeeRequest = ContactEmployee;
export type UpdateEmployeeRequest = Partial<Omit<ContactEmployee, 'id'>>;

/** 员工-公司关联请求体 */
export type CompanyEmployeeRequest = {
    company_id: string;
}

/** 员工-部门关联请求体：添加/移除部门时需同时指定 company_id */
export type DepartmentEmployeeRequest = {
    department_id: number;
    company_id: string;
}

/** 员工部门调动请求（后端正式接口字段） */
export type MoveEmployeeToDepartmentRequest = {
    company_id: string;
    from_department_id: number;
    to_department_id: number;
}

/** 转移企业所有权请求体（POST /users/:userId/transfer-ownership/:companyId） */
export type TransferContactOwnershipRequest = {
    new_owner_id: string;
}

/** 通讯录版本信息 */
export type ContactVersionInfo = {
    company_id: string;
    version: string;
    type: 'contacts';
}

/** 更新通讯录版本响应 */
export type UpdateContactVersionResponse = {
    company_id: string;
    version: string;
    message?: string;
}

/**
 * 通讯录 API 客户端接口定义
 * 对应后端 Contact Management API v1，包含公司、部门、员工及其关联的 CRUD 操作
 */
export interface ClientContactMix {

    /** POST /api/v1/companies - 创建公司 */
    createCompany: (company: CreateCompanyRequest) => Promise<ContactCompany>;

    /** GET /api/v1/companies - 获取所有公司 */
    getCompanies: () => Promise<ContactCompany[]>;

    /** GET /api/v1/companies/:id - 获取单个公司 */
    getCompany: (companyId: string) => Promise<ContactCompany>;

    /** PUT /api/v1/companies/:id - 更新公司 */
    updateCompany: (companyId: string, company: UpdateCompanyRequest) => Promise<ContactCompany>;

    /** DELETE /api/v1/companies/:id - 软删除公司 */
    deleteCompany: (companyId: string) => Promise<Record<string, never>>;

    /** DELETE /api/v1/companies/:id/force - 强制删除公司及其关联的部门与员工 */
    deleteCompanyForce: (companyId: string) => Promise<Record<string, never>>;

    /** GET /api/v1/companies/:id/departments — 获取公司及其部门（按公司过滤子集请用 getDepartmentsByCompany） */
    getCompanyWithDepartments: (companyId: string) => Promise<ContactCompany & {departments?: ContactDepartment[]}>;

    /**
     * GET /api/v1/companies/:id/employees — 获取公司员工。
     * 文档描述响应可能「含公司信息」；当前按纯 `ContactEmployee[]` 解析，若服务端返回包装对象需在调用方适配。
     */
    getCompanyWithEmployees: (companyId: string) => Promise<ContactEmployee[]>;

    /** 获取公司下员工总数 */
    getCompanyEmployeeCount: (companyId: string) => Promise<number>;

    /** POST /api/v1/departments - 创建部门 */
    createDepartment: (department: CreateDepartmentRequest) => Promise<ContactDepartment>;

    /** GET /api/v1/departments/:id - 获取单个部门（companyId 用于版本缓存） */
    getDepartment: (companyId: string, departmentId: number) => Promise<ContactDepartment>;

    /** PUT /api/v1/departments/:id - 更新部门 */
    updateDepartment: (departmentId: number, department: UpdateDepartmentRequest) => Promise<ContactDepartment>;

    /** DELETE /api/v1/departments/:id - 删除部门（级联删除关联） */
    deleteDepartment: (companyId: string, departmentId: number) => Promise<Record<string, never>>;

    /** DELETE /api/v1/departments/:id/force - 强制删除部门（含级联） */
    deleteDepartmentForce: (companyId: string, departmentId: number) => Promise<Record<string, never>>;

    /**
     * GET /api/v1/departments/:id/employees — 获取部门员工。
     * 文档描述响应可能「含部门信息」；当前按纯 `ContactEmployee[]` 解析，若服务端返回包装对象需在调用方适配。
     */
    getDepartmentWithEmployees: (companyId: string, departmentId: number) => Promise<ContactEmployee[]>;

    /** GET /api/v1/departments/:id/sub-departments - 7. 获取子部门列表 */
    getSubDepartments: (companyId: string, parentDepartmentId: number) => Promise<ContactDepartment[]>;

    /** GET /api/v1/departments/:id/children - 获取部门及其子部门 */
    getDepartmentWithChildren: (companyId: string, departmentId: number) => Promise<ContactDepartment[]>;

    /** GET /api/v1/departments/:id/ancestors - 获取部门祖先链（含自身，从上到下） */
    getDepartmentAncestors: (companyId: string, departmentId: number) => Promise<ContactDepartment[]>;

    /** 获取部门及其子部门下员工总数 */
    getEmployeeCountOfDepartment: (companyId: string, departmentId: number) => Promise<number>;

    /** POST /api/v1/employees - 创建员工 */
    createEmployee: (employee: CreateEmployeeRequest) => Promise<ContactEmployee>;

    /** GET /api/v1/employees/:id - 获取单个员工（id 与 Mattermost user id 对齐时可与 MM 资料合并，见 fetchMergedUserProfileForQrCard） */
    getEmployee: (employeeId: string) => Promise<ContactEmployee>;

    /** PUT /api/v1/employees/:id - 更新员工 */
    updateEmployee: (employeeId: string, employee: UpdateEmployeeRequest) => Promise<ContactEmployee>;

    /** DELETE /api/v1/employees/:id - 删除员工（级联删除关联） */
    deleteEmployee: (employeeId: string) => Promise<Record<string, never>>;

    /** GET /api/v1/employees/:id/check-delete - 检查员工是否可删除（响应结构以服务端为准） */
    getEmployeeCheckDelete: (employeeId: string) => Promise<unknown>;

    /** GET /api/v1/employees/:id/owned-companies - 员工拥有的企业 */
    getEmployeeOwnedCompanies: (employeeId: string) => Promise<ContactCompany[]>;

    /** GET /api/v1/employees/:id/cascade-departments - 获取员工在指定公司下的级联部门 */
    getEmployeeCascadeDepartments: (employeeId: string, companyId: string) => Promise<ContactEmployeeCascadeDepartments>;

    /** POST /api/v1/employees/:id/companies - 将员工添加到公司 */
    addEmployeeToCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;

    /**
     * 将员工从公司移除。OpenAPI 文档示例为 DELETE + JSON body；本客户端使用 query `company_id=`，
     * 因部分栈不解析 DELETE body。若后端仅支持其中一种，请与后端对齐。
     */
    removeEmployeeFromCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;

    /** GET /api/v1/employees/:id/companies - 获取员工所属公司 */
    getEmployeeCompanies: (employeeId: string) => Promise<ContactCompany[]>;

    /** GET /api/v1/company-employees/:companyId/employees - 5. 获取公司下所有员工 */
    getEmployeesOfCompany: (companyId: string) => Promise<ContactEmployee[]>;

    /** POST /api/v1/employees/:id/departments - 将员工添加到部门（body 含 company_id） */
    addEmployeeToDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;

    /**
     * 将员工从部门移除。文档示例为 DELETE + JSON body；本客户端使用 query 传 `department_id` 与 `company_id`。
     */
    removeEmployeeFromDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;

    /** PUT /api/v1/employees/:id/move-department - 移动员工部门 */
    moveEmployeeToDepartment: (employeeId: string, body: MoveEmployeeToDepartmentRequest) => Promise<void>;

    /** GET /api/v1/department-employees/:departmentId/employees - 5. 获取部门下所有员工 */
    getEmployeesOfDepartment: (companyId: string, departmentId: number) => Promise<ContactEmployee[]>;

    /** GET /api/v1/by_companies/:companyId/departments - 获取公司部门列表（带 parent_department_id 过滤） */
    getDepartmentsByCompany: (companyId: string, opts?: {parentDepartmentId?: number}) => Promise<ContactDepartment[]>;

    /** GET /api/v1/company-employees/:companyId/search - 公司范围搜索员工 */
    searchCompanyEmployees: (companyId: string, params: {keyword: string; departmentId?: number}) => Promise<ContactEmployeeSearchItem[]>;

    /** GET /api/v1/department-employees/:departmentId/search - 部门范围搜索员工 */
    searchDepartmentEmployees: (departmentId: number, params: {keyword: string; companyId: string}) => Promise<ContactEmployeeSearchItem[]>;

    /** GET /api/v1/versions/companies/:companyId/contacts - 获取通讯录版本 */
    getContactVersion: (companyId: string) => Promise<ContactVersionInfo>;

    /** PUT /api/v1/versions/companies/:companyId/contacts - 更新通讯录版本 */
    updateContactVersion: (companyId: string) => Promise<UpdateContactVersionResponse>;

    /** GET /api/v1/users/:userId/companies - 用户所在企业 */
    getUserCompanies: (userId: string) => Promise<ContactCompany[]>;

    /** GET /api/v1/users/:userId/owned-companies - 用户拥有的企业 */
    getUserOwnedCompanies: (userId: string) => Promise<ContactCompany[]>;

    /** POST /api/v1/users/:userId/transfer-ownership/:companyId - 转移企业所有权 */
    transferUserCompanyOwnership: (userId: string, companyId: string, body: TransferContactOwnershipRequest) => Promise<unknown>;

    /** GET /api/v1/employees/search - 全局搜索员工【精准匹配， 查询字符串可以是员工的昵称、手机号、邮箱等】 */
    searchExactEmployees: (searchQuery: string) => Promise<ContactEmployee[]>;
}

/**
 * 通讯录 API 路径映射（均需 X-API-KEY）
 */
export const contactRoutes = {

    /** POST/GET /api/v1/companies */
    companies: () => `${CONTACT_API_BASE_ROUTE}/companies`,

    /** GET/PUT/DELETE /api/v1/companies/:id */
    company: (id: string) => `${CONTACT_API_BASE_ROUTE}/companies/${id}`,

    /** DELETE /api/v1/companies/:id/force - 强制删除公司（含级联） */
    companyForce: (id: string) => `${CONTACT_API_BASE_ROUTE}/companies/${id}/force`,

    /** GET /api/v1/companies/:id/departments - 获取公司及其部门 */
    companyWithDepartments: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/departments`,

    /** GET /api/v1/by_companies/:companyId/departments - 获取公司部门列表（带 parent_department_id 过滤） */
    departmentsByCompany: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/by_companies/${companyId}/departments`,

    /** GET /api/v1/companies/:id/employees - 获取公司及其员工 */
    companyWithEmployees: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/employees`,

    /** POST /api/v1/departments */
    departments: () => `${CONTACT_API_BASE_ROUTE}/departments`,

    /** GET/PUT/DELETE /api/v1/departments/:id */
    department: (id: number) => `${CONTACT_API_BASE_ROUTE}/departments/${id}`,

    /** DELETE /api/v1/departments/:id/force - 强制删除部门（含级联） */
    departmentForce: (id: number) => `${CONTACT_API_BASE_ROUTE}/departments/${id}/force`,

    /** GET /api/v1/departments/:id/employees - 获取部门及其员工 */
    departmentWithEmployees: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/employees`,

    /** GET /api/v1/departments/:id/ancestors - 获取部门祖先链 */
    departmentAncestors: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/ancestors`,

    /** GET /api/v1/departments/:id/children -  获取部门及其子部门 */
    departmentWithChildren: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/children`,

    /** GET /api/v1/departments/:id/sub-departments - 获取子部门列表 */
    subDepartments: (parentDepartmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${parentDepartmentId}/sub-departments`,

    /** POST/GET /api/v1/employees */
    employees: () => `${CONTACT_API_BASE_ROUTE}/employees`,

    /** GET/PUT/DELETE /api/v1/employees/:id */
    employee: (id: string) => `${CONTACT_API_BASE_ROUTE}/employees/${id}`,

    /** GET /api/v1/employees/search - 全局搜索员工【精准匹配】 */
    employeeSearch: () => `${CONTACT_API_BASE_ROUTE}/employees/search`,

    /** GET /api/v1/employees/:id/check-delete */
    employeeCheckDelete: (id: string) => `${CONTACT_API_BASE_ROUTE}/employees/${id}/check-delete`,

    /** GET /api/v1/employees/:id/owned-companies */
    employeeOwnedCompanies: (id: string) => `${CONTACT_API_BASE_ROUTE}/employees/${id}/owned-companies`,

    /** GET /api/v1/employees/:id/cascade-departments - 员工详情及级联部门（需 company_id query） */
    employeeCascadeDepartments: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/cascade-departments`,

    /** POST/GET/DELETE /api/v1/employees/:id/companies - 员工-公司关联 */
    employeeCompanies: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/companies`,

    /** POST/DELETE /api/v1/employees/:id/departments - 员工-部门关联 */
    employeeDepartments: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/departments`,

    /** PUT /api/v1/employees/:id/move-department - 移动员工部门 */
    moveEmployeeDepartment: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/move-department`,

    /** GET /api/v1/company-employees/:companyId/employees - 5. 获取公司下所有员工 */
    employeesOfCompany: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/company-employees/${companyId}/employees`,

    /** GET /api/v1/company-employees/:companyId/search - 公司范围搜索员工 */
    searchEmployeesOfCompany: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/company-employees/${companyId}/search`,

    /** GET /api/v1/department-employees/:departmentId/employees - 5. 获取部门下所有员工 */
    employeesOfDepartment: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/department-employees/${departmentId}/employees`,

    /** GET /api/v1/company-employees/:companyId/total-employees - 获取公司总人数 */
    totalEmployeesOfCompany: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/company-employees/${companyId}/total-employees`,

    /** GET /api/v1/department-employees/:departmentId/total-employees - 获取部门总人数（含子部门） */
    totalEmployeesOfDepartment: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/department-employees/${departmentId}/total-employees`,

    /** GET /api/v1/department-employees/:departmentId/search - 部门范围搜索员工 */
    searchEmployeesOfDepartment: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/department-employees/${departmentId}/search`,

    /** GET/PUT /api/v1/versions/companies/:companyId/contacts - 获取/更新通讯录版本 */
    contactVersion: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/versions/companies/${companyId}/contacts`,

    /** GET /api/v1/users/:userId/companies */
    userCompanies: (userId: string) => `${CONTACT_API_BASE_ROUTE}/users/${encodeURIComponent(userId)}/companies`,

    /** GET /api/v1/users/:userId/owned-companies */
    userOwnedCompanies: (userId: string) => `${CONTACT_API_BASE_ROUTE}/users/${encodeURIComponent(userId)}/owned-companies`,

    /** POST /api/v1/users/:userId/transfer-ownership/:companyId */
    userTransferOwnership: (userId: string, companyId: string) =>
        `${CONTACT_API_BASE_ROUTE}/users/${encodeURIComponent(userId)}/transfer-ownership/${encodeURIComponent(companyId)}`,
};

/** 创建占位 API Client，用于构造函数调用 super()，实际请求前会被 init() 替换 */
function createPlaceholderApiClient(): APIClientInterface {
    const throwNotInit = () => {
        throw new ClientError('contact', {
            message: 'ContactService not initialized. Call init(contactServiceUrl, apiKey) first.',
            url: contactRoutes.companies(),
        });
    };
    const rejectNotInit = () => Promise.reject(throwNotInit());
    return {
        baseUrl: '',
        config: {},
        get: rejectNotInit,
        post: rejectNotInit,
        put: rejectNotInit,
        patch: rejectNotInit,
        delete: rejectNotInit,
        head: rejectNotInit,
        onClientError: () => {/* placeholder - never invoked */},
        upload: () => rejectNotInit() as ReturnType<APIClientInterface['upload']>,
        download: () => rejectNotInit() as ReturnType<APIClientInterface['download']>,
        getHeaders: rejectNotInit,
        addHeaders: rejectNotInit,
        importClientP12: rejectNotInit,
        invalidate: rejectNotInit,
    } as APIClientInterface;
}

class ContactServiceClass extends ClientTracking implements ClientContactMix {
    private baseUrl = '';
    private apiKey = '';

    /**
     * doRequestCompanyProxy（按公司维度的 GET 缓存）用到的三块状态：
     *
     * - versionByCompany：该公司通讯录「版本号」的短期缓存（含写入时间）。
     *   在 TTL 内复用同一 version，避免每条业务 GET 都打版本接口；mutation 或非 GET 会整公司清空。
     *
     * - versionInflight：同一 companyId 并发拉版本时，只发一次版本请求，其余 await 同一条 Promise，
     *   防止短时间内多个列表/详情同时过期时重复 GET contactVersion。
     *
     * - responseByCompany：按 companyId → (请求 path → {当时版本号, 响应体, 写入时间})。
     *   业务 GET 若命中「当前 version 一致 + 仍在 TTL」则直接返回缓存 body，否则直连并写入。
     */
    private versionByCompany = new Map<string, {version: string; at: number}>();
    private versionInflight = new Map<string, Promise<string>>();
    private responseByCompany = new Map<string, Map<string, {version: string; data: unknown; at: number}>>();
    private diskInvalidationInFlight = new Set<string>();

    constructor() {
        super(createPlaceholderApiClient());
    }

    private buildConfig(): APIClientConfiguration {
        const userAgent = `Mattermost Mobile/${nativeApplicationVersion}+${nativeBuildVersion} (${osName}; ${osVersion}; ${modelName})`;

        return {
            headers: {
                [ClientConstants.HEADER_USER_AGENT]: userAgent,
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                ...(this.apiKey ? {[API_KEY_HEADER]: this.apiKey} : {}),
            },
            sessionConfiguration: {
                allowsCellularAccess: true,
                waitsForConnectivity: false,
                httpMaximumConnectionsPerHost: 100,
                cancelRequestsOnUnauthorized: false,
                collectMetrics: true,
            },
            retryPolicyConfiguration: {
                type: RetryTypes.EXPONENTIAL_RETRY,
                retryLimit: 3,
                exponentialBackoffBase: 2,
                exponentialBackoffScale: 0.5,
            },
        };
    }

    getRequestHeaders(_requestMethod: string): Record<string, string> { // eslint-disable-line @typescript-eslint/no-unused-vars -- Override parent; API Key auth does not use requestMethod (no CSRF)
        return {
            [ClientConstants.HEADER_ACCEPT]: 'application/json',
            ...(this.apiKey ? {[API_KEY_HEADER]: this.apiKey} : {}),
        };
    }

    /**
     * 初始化通讯录服务
     * @param contactServiceUrl 通讯录 API 基础 URL（如 https://contact.example.com）
     * @param apiKey API Key，对应 Header X-API-KEY
     */
    init = async (contactServiceUrl: string, apiKey: string): Promise<void> => {
        if (!contactServiceUrl) {
            return;
        }
        this.apiKey = apiKey;
        this.baseUrl = contactServiceUrl;
        const config = this.buildConfig();
        const {client} = await getOrCreateAPIClient(contactServiceUrl, config);
        this.apiClient = client;
        cleanupExpiredContactDiskCache().catch(() => undefined);
    };

    /** 确保已调用 init()，否则抛出 ClientError */
    private ensureInitialized(): void {
        if (!this.baseUrl) {
            throw new ClientError('contact', {
                message: 'ContactService not initialized. Call init(contactServiceUrl, apiKey) first.',
                url: contactRoutes.companies(),
            });
        }
    }

    private async doRequestDirect<T>(path: string, method: string, body?: object, headers?: Record<string, string>): Promise<T> {
        this.ensureInitialized();
        const options: ClientOptions = {
            method: method.toUpperCase(),
            ...(body !== undefined && method.toLowerCase() !== 'get' && {body: body as Record<string, unknown>}),
        };
        // eslint-disable-next-line no-unused-expressions
        headers && typeof headers === 'object' && (options.headers = Object.assign(options.headers || {}, headers));
        return this.doFetchWithTracking(path, options, true) as Promise<T>;
    }

    private async invalidateAllCompanyCache() {
        this.versionByCompany.clear();
        this.responseByCompany.clear();
        this.versionInflight.clear();
        this.diskInvalidationInFlight.clear();
        await clearAllContactDiskCache();
    }

    private async invalidateCompanyCache(companyId: string) {
        this.versionByCompany.delete(companyId);
        this.responseByCompany.delete(companyId);
        this.versionInflight.delete(companyId);

        // 磁盘缓存与内存缓存同一套“按 companyId 全量失效”的策略。
        this.diskInvalidationInFlight.add(companyId);
        try {
            await clearContactDiskCacheCompany(this.baseUrl, companyId);
        } finally {
            this.diskInvalidationInFlight.delete(companyId);
        }
    }

    /** 显式传入 companyId 的读写：GET 按版本做响应缓存；非 GET 先失效再请求。版本/更新版本接口勿用此方法。 */
    private async doRequestCompanyProxy<T>(
        companyIdOfVersion: string,
        path: string,
        method: string,
        body?: object,
        headers?: Record<string, string>,
    ): Promise<T> {
        if (!CONTACT_ENABLE_COMPANY_PROXY_CACHE) {
            return this.doRequestDirect<T>(path, method, body, headers);
        }
        const upper = method.toUpperCase();
        if (upper !== 'GET') {
            await this.invalidateCompanyCache(companyIdOfVersion);
            const res = await this.doRequestDirect<T>(path, method, body, headers);
            await this.invalidateCompanyCache(companyIdOfVersion);
            return res;
        }

        const now = Date.now();
        let version: string;
        try {
            const cachedV = this.versionByCompany.get(companyIdOfVersion);
            if (cachedV && now - cachedV.at <= CONTACT_VERSION_CACHE_TTL_MS) {
                version = cachedV.version;
            } else {
                const inflight = this.versionInflight.get(companyIdOfVersion);
                if (inflight) {
                    version = await inflight;
                } else {
                    const p = (async () => {
                        const info = await this.doRequestDirect<ContactVersionInfo>(
                            contactRoutes.contactVersion(companyIdOfVersion),
                            'get',
                        );
                        const v = info.version;
                        this.versionByCompany.set(companyIdOfVersion, {version: v, at: Date.now()});
                        return v;
                    })();
                    this.versionInflight.set(companyIdOfVersion, p);
                    try {
                        version = await p;
                    } finally {
                        this.versionInflight.delete(companyIdOfVersion);
                    }
                }
            }
        } catch {
            return this.doRequestDirect<T>(path, method, body, headers);
        }

        let map = this.responseByCompany.get(companyIdOfVersion);
        if (!map) {
            map = new Map();
            this.responseByCompany.set(companyIdOfVersion, map);
        }
        const hit = map.get(path);
        if (hit && hit.version === version) {
            return hit.data as T;
        }
        const baseUrl = this.baseUrl;
        if (baseUrl && !this.diskInvalidationInFlight.has(companyIdOfVersion)) {
            const diskData = await readContactDiskCache(baseUrl, companyIdOfVersion, path, version);
            if (diskData !== null) {
                map.set(path, {version, data: diskData, at: Date.now()});
                return diskData as T;
            }
        }

        const data = await this.doRequestDirect<T>(path, method, body, headers);
        map.set(path, {version, data, at: Date.now()});

        if (baseUrl) {
            await writeContactDiskCache(baseUrl, companyIdOfVersion, path, version, data);
        }
        return data;
    }

    createCompany = (company: CreateCompanyRequest) =>
        this.doRequestDirect<ContactCompany>(contactRoutes.companies(), 'post', company);

    getCompanies = () =>
        this.doRequestDirect<ContactCompany[]>(contactRoutes.companies(), 'get');

    getCompany = (companyId: string) =>
        this.doRequestCompanyProxy<ContactCompany>(companyId, contactRoutes.company(companyId), 'get');

    updateCompany = (companyId: string, company: UpdateCompanyRequest) =>
        this.doRequestCompanyProxy<ContactCompany>(companyId, contactRoutes.company(companyId), 'put', company);

    deleteCompany = (companyId: string) =>
        this.doRequestCompanyProxy<Record<string, never>>(companyId, contactRoutes.company(companyId), 'delete');

    deleteCompanyForce = (companyId: string) =>
        this.doRequestCompanyProxy<Record<string, never>>(companyId, contactRoutes.companyForce(companyId), 'delete');

    getCompanyWithDepartments = async (companyId: string) =>
        this.doRequestCompanyProxy<ContactCompany & {departments?: ContactDepartment[]}>(
            companyId,
            contactRoutes.companyWithDepartments(companyId),
            'get',
        );

    getCompanyWithEmployees = (companyId: string) =>
        this.doRequestCompanyProxy<ContactEmployee[]>(companyId, contactRoutes.companyWithEmployees(companyId), 'get');

    getCompanyEmployeeCount = (companyId: string) =>
        this.doRequestCompanyProxy<{total: number}>(companyId, contactRoutes.totalEmployeesOfCompany(companyId), 'get').then((res) => res.total);

    createDepartment = (department: CreateDepartmentRequest) =>
        this.doRequestCompanyProxy<ContactDepartment>(
            department.company_id,
            contactRoutes.departments(),
            'post',
            department,
        );

    getDepartment = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<ContactDepartment>(companyId, contactRoutes.department(departmentId), 'get');

    updateDepartment = (departmentId: number, department: UpdateDepartmentRequest) =>
        this.doRequestCompanyProxy<ContactDepartment>(
            department.company_id,
            contactRoutes.department(departmentId),
            'put',
            department,
        );

    deleteDepartment = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<Record<string, never>>(companyId, contactRoutes.department(departmentId), 'delete');

    deleteDepartmentForce = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<Record<string, never>>(companyId, contactRoutes.departmentForce(departmentId), 'delete');

    getDepartmentWithEmployees = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<ContactEmployee[]>(companyId, contactRoutes.departmentWithEmployees(departmentId), 'get');

    getSubDepartments = (companyId: string, parentDepartmentId: number) =>
        this.doRequestCompanyProxy<ContactDepartment[]>(companyId, contactRoutes.subDepartments(parentDepartmentId), 'get');

    getDepartmentWithChildren = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<ContactDepartment[]>(companyId, contactRoutes.departmentWithChildren(departmentId), 'get');

    getDepartmentAncestors = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<ContactDepartment[]>(companyId, contactRoutes.departmentAncestors(departmentId), 'get');

    getEmployeeCountOfDepartment = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<{total: number}>(companyId, contactRoutes.totalEmployeesOfDepartment(departmentId), 'get').then((res) => res.total);

    createEmployee = (employee: CreateEmployeeRequest) =>
        this.doRequestDirect<ContactEmployee>(contactRoutes.employees(), 'post', employee);

    getEmployee = (employeeId: string) =>
        this.doRequestDirect<ContactEmployee>(contactRoutes.employee(employeeId), 'get');

    updateEmployee = async (employeeId: string, employee: UpdateEmployeeRequest): Promise<ContactEmployee> => {
        try {
            const result = await this.doRequestDirect<ContactEmployee>(contactRoutes.employee(employeeId), 'put', employee);
            await this.invalidateAllCompanyCache();
            return result;
        } catch (err) {
            await this.invalidateAllCompanyCache();
            throw err;
        }
    };

    deleteEmployee = (employeeId: string) =>
        this.doRequestDirect<Record<string, never>>(contactRoutes.employee(employeeId), 'delete');

    getEmployeeCheckDelete = (employeeId: string) =>
        this.doRequestDirect<unknown>(contactRoutes.employeeCheckDelete(employeeId), 'get');

    getEmployeeOwnedCompanies = (employeeId: string) =>
        this.doRequestDirect<ContactCompany[]>(contactRoutes.employeeOwnedCompanies(employeeId), 'get');

    getEmployeeCascadeDepartments = (employeeId: string, companyId: string) => {
        const path = `${contactRoutes.employeeCascadeDepartments(employeeId)}?company_id=${encodeURIComponent(companyId)}`;
        return this.doRequestCompanyProxy<ContactEmployeeCascadeDepartments>(companyId, path, 'get');
    };

    addEmployeeToCompany = (employeeId: string, body: CompanyEmployeeRequest) =>
        this.doRequestCompanyProxy<Record<string, never>>(body.company_id, contactRoutes.employeeCompanies(employeeId), 'post', body);

    removeEmployeeFromCompany = (employeeId: string, body: CompanyEmployeeRequest) => {
        const path = `${contactRoutes.employeeCompanies(employeeId)}?company_id=${encodeURIComponent(body.company_id)}`;
        return this.doRequestCompanyProxy<Record<string, never>>(body.company_id, path, 'delete');
    };

    getEmployeeCompanies = (employeeId: string) =>
        this.doRequestDirect<ContactCompany[]>(contactRoutes.employeeCompanies(employeeId), 'get');

    getEmployeesOfCompany = (companyId: string) =>
        this.doRequestCompanyProxy<ContactEmployee[]>(companyId, contactRoutes.employeesOfCompany(companyId), 'get');

    addEmployeeToDepartment = (employeeId: string, body: DepartmentEmployeeRequest) =>
        this.doRequestCompanyProxy<Record<string, never>>(body.company_id, contactRoutes.employeeDepartments(employeeId), 'post', body);

    /** 后端可能不解析 DELETE body，故用 query 传 department_id 与 company_id */
    removeEmployeeFromDepartment = (employeeId: string, body: DepartmentEmployeeRequest) => {
        const path = `${contactRoutes.employeeDepartments(employeeId)}?department_id=${body.department_id}&company_id=${encodeURIComponent(body.company_id)}`;
        return this.doRequestCompanyProxy<Record<string, never>>(body.company_id, path, 'delete');
    };

    moveEmployeeToDepartment = async (employeeId: string, body: MoveEmployeeToDepartmentRequest) => {
        if (body.from_department_id === body.to_department_id) {
            return;
        }

        await this.doRequestCompanyProxy<Record<string, never>>(
            body.company_id,
            contactRoutes.moveEmployeeDepartment(employeeId),
            'put',
            body,
        );
    };

    getEmployeesOfDepartment = (companyId: string, departmentId: number) =>
        this.doRequestCompanyProxy<ContactEmployee[]>(companyId, contactRoutes.employeesOfDepartment(departmentId), 'get');

    getDepartmentsByCompany = (companyId: string, opts?: {parentDepartmentId?: number}) => {
        const parentDepartmentId = opts?.parentDepartmentId;
        const path = `${contactRoutes.departmentsByCompany(companyId)}${typeof parentDepartmentId === 'number' ? `?parent_department_id=${parentDepartmentId}` : ''}`;
        return this.doRequestCompanyProxy<ContactDepartment[]>(companyId, path, 'get');
    };

    searchCompanyEmployees = (companyId: string, params: {keyword: string; departmentId?: number}) => {
        const queryParts = [
            `keyword=${encodeURIComponent(params.keyword)}`,
            ...(typeof params.departmentId === 'number' ? [`department_id=${encodeURIComponent(String(params.departmentId))}`] : []),
        ];
        return this.doRequestDirect<{data: ContactEmployeeSearchItem[]}>(
            `${contactRoutes.searchEmployeesOfCompany(companyId)}?${queryParts.join('&')}`,
            'get',
        ).then((res) => res.data || []);
    };

    searchDepartmentEmployees = (departmentId: number, params: {keyword: string; companyId: string}) => {
        const queryParts = [
            `keyword=${encodeURIComponent(params.keyword)}`,
            `company_id=${encodeURIComponent(params.companyId)}`,
        ];
        return this.doRequestDirect<{data: ContactEmployeeSearchItem[]}>(
            `${contactRoutes.searchEmployeesOfDepartment(departmentId)}?${queryParts.join('&')}`,
            'get',
        ).then((res) => res.data || []);
    };

    getContactVersion = (companyId: string) =>
        this.doRequestDirect<ContactVersionInfo>(contactRoutes.contactVersion(companyId), 'get');

    updateContactVersion = (companyId: string) =>
        this.doRequestDirect<UpdateContactVersionResponse>(contactRoutes.contactVersion(companyId), 'put');

    getUserCompanies = (userId: string) =>
        this.doRequestDirect<ContactCompany[]>(contactRoutes.userCompanies(userId), 'get');

    getUserOwnedCompanies = (userId: string) =>
        this.doRequestDirect<ContactCompany[]>(contactRoutes.userOwnedCompanies(userId), 'get');

    transferUserCompanyOwnership = (userId: string, companyId: string, body: TransferContactOwnershipRequest) =>
        this.doRequestCompanyProxy<unknown>(companyId, contactRoutes.userTransferOwnership(userId, companyId), 'post', body);

    /**
     * 通过查询字符串搜索联系人，也就是搜索员工
     * 查询字符串可以是员工的昵称、手机号、邮箱等【精准匹配】
     */
    searchExactEmployees = async (searchQuery: string): Promise<ContactEmployee[]> => {
        const normalizedQuery = searchQuery ? searchQuery.trim() : '';
        if (!normalizedQuery) {
            return [];
        }
        return this.doRequestDirect<ContactEmployee[]>(`${contactRoutes.employeeSearch()}?keyword=${normalizedQuery}`, 'get').then((res) => res.employees || []);
    };
}

const ContactService = new ContactServiceClass();

export {ContactService};
export default ContactService;
