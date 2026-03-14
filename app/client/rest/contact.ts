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
    type ClientResponse,
} from '@mattermost/react-native-network-client';
import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import {modelName, osName, osVersion} from 'expo-device';

import * as ClientConstants from '@client/rest/constants';
import ClientError from '@client/rest/error';
import ClientTracking from '@client/rest/tracking';

export const CONTACT_API_BASE_ROUTE = '/api/v1';
export const API_KEY_HEADER = 'X-API-KEY';

/** 用于识别默认部门的名称约定，与后端一致 */
export const DEFAULT_DEPARTMENT_NAME = 'FORCE_DEFAULT_DEPARTMENT';

/** 公司类型枚举：team=本公司/团队，supplier=供应商，customer=客户 */
export const ContactCompanyTypes = {
    Team: 'team',
    Supplier: 'supplier',
    Customer: 'customer',
} as const;
export type ContactCompanyType = typeof ContactCompanyTypes[keyof typeof ContactCompanyTypes];

/** 公司模型：id 为 36 位字符串主键，type 区分本公司/供应商/客户 */
export type ContactCompany = {
    id: string;
    name: string;
    type: ContactCompanyType;
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

/** 员工详情：包含所属公司列表与部门列表 */
export type ContactEmployeeDetails = ContactEmployee & {
    companies?: ContactCompany[];
    departments?: ContactDepartment[];
}

/** 创建公司请求体：id/name/type 必填，id 需客户端生成 36 位字符串 */
export type CreateCompanyRequest = ContactCompany;
export type UpdateCompanyRequest = CreateCompanyRequest;

/** 创建部门请求：company_id 必填，parent_id 可选（有则为子部门） */
export type CreateDepartmentRequest = {
    company_id: string;
    name: string;
    description?: string;
    parent_id?: number;
}
export type UpdateDepartmentRequest = CreateDepartmentRequest;

/** 创建员工请求体：id/name 必填，id 需客户端生成 36 位字符串 */
export type CreateEmployeeRequest = ContactEmployee;
export type UpdateEmployeeRequest = CreateEmployeeRequest;

/** 员工-公司关联请求体 */
export type CompanyEmployeeRequest = {
    company_id: string;
}

/** 员工-部门关联请求体：添加/移除部门时需同时指定 company_id */
export type DepartmentEmployeeRequest = {
    department_id: number;
    company_id: string;
}

/** 员工部门调动请求：从 old_department_id 调至 department_id */
export type MoveEmployeeToDepartmentRequest = DepartmentEmployeeRequest & {
    old_department_id: number;
}

/** API 基本信息响应（GET /） */
export type ContactApiInfo = {
    name: string;
    version: string;
}

/** 健康检查响应（GET /health） */
export type ContactHealth = {
    status: string;
}

/**
 * 通讯录 API 客户端接口定义
 * 对应后端 Contact Management API v1，包含公司、部门、员工及其关联的 CRUD 操作
 */
export interface ClientContactMix {

    /** GET /health - 健康检查（无需 API Key） */
    contactHealthCheck: () => Promise<ContactHealth>;

    /** GET / - 获取 API 名称与版本（无需 API Key） */
    getContactAPIInfo: () => Promise<ContactApiInfo>;

    /** POST /api/v1/companies - 创建公司 */
    createCompany: (company: CreateCompanyRequest) => Promise<ContactCompany>;

    /** GET /api/v1/companies - 获取所有公司 */
    getCompanies: () => Promise<ContactCompany[]>;

    /** GET /api/v1/companies/:id - 获取单个公司 */
    getCompany: (companyId: string) => Promise<ContactCompany>;

    /** PUT /api/v1/companies/:id - 更新公司 */
    updateCompany: (companyId: string, company: UpdateCompanyRequest) => Promise<ContactCompany>;

    /** DELETE /api/v1/companies/:id - 删除公司（级联删除关联） */
    deleteCompany: (companyId: string) => Promise<Record<string, never>>;

    /** GET /api/v1/companies/:id/departments - 6. 获取公司及其部门 */
    getCompanyWithDepartments: (companyId: string, opts?: {parentDepartmentId?: number}) => Promise<ContactCompany & {departments?: ContactDepartment[]}>;

    /** GET /api/v1/companies/:id/employees - 7. 获取公司及其员工 */
    getCompanyWithEmployees: (companyId: string) => Promise<ContactEmployee[]>;

    /** 获取公司下员工总数（qgstest 临时实现：调用 getEmployeesOfCompany 统计，文档无独立接口） */
    getCompanyEmployeeCount: (companyId: string) => Promise<number>;

    /** POST /api/v1/departments - 创建部门 */
    createDepartment: (department: CreateDepartmentRequest) => Promise<ContactDepartment>;

    /** GET /api/v1/departments/:id - 获取单个部门 */
    getDepartment: (departmentId: number) => Promise<ContactDepartment>;

    /** PUT /api/v1/departments/:id - 更新部门 */
    updateDepartment: (departmentId: number, department: UpdateDepartmentRequest) => Promise<ContactDepartment>;

    /** DELETE /api/v1/departments/:id - 删除部门（级联删除关联） */
    deleteDepartment: (departmentId: number) => Promise<Record<string, never>>;

    /** GET /api/v1/departments/:id/employees - 5. 获取部门及其员工 */
    getDepartmentWithEmployees: (departmentId: number) => Promise<ContactEmployee[]>;

    /** GET /api/v1/departments/:id/sub-departments - 7. 获取子部门列表 */
    getSubDepartments: (parentDepartmentId: number) => Promise<ContactDepartment[]>;

    /** GET /api/v1/departments/:id/children - 获取部门及其子部门 */
    getDepartmentWithChildren: (departmentId: number) => Promise<ContactDepartment[]>;

    /** GET /api/v1/departments/:id/employee-count - 获取部门及子部门下员工总数 */
    getEmployeeCountOfDepartment: (departmentId: number) => Promise<number>;

    /** POST /api/v1/employees - 创建员工 */
    createEmployee: (employee: CreateEmployeeRequest) => Promise<ContactEmployee>;

    /** GET /api/v1/employees/:id - 获取单个员工 */
    getEmployee: (employeeId: string) => Promise<ContactEmployee>;

    /** PUT /api/v1/employees/:id - 更新员工 */
    updateEmployee: (employeeId: string, employee: UpdateEmployeeRequest) => Promise<ContactEmployee>;

    /** DELETE /api/v1/employees/:id - 删除员工（级联删除关联） */
    deleteEmployee: (employeeId: string) => Promise<Record<string, never>>;

    /** GET /api/v1/employees/:id/details - 获取员工详情（含公司、部门列表） */
    getEmployeeDetails: (employeeId: string) => Promise<ContactEmployeeDetails>;

    /** POST /api/v1/employees/:id/companies - 将员工添加到公司 */
    addEmployeeToCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;

    /** DELETE /api/v1/employees/:id/companies - 将员工从公司移除 */
    removeEmployeeFromCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;

    /** GET /api/v1/employees/:id/companies - 3. 获取员工所属公司 */
    getEmployeeCompanies: (employeeId: string) => Promise<ContactCompany[]>;

    /** GET /api/v1/employees/:id/companies/details - 4. 获取员工所属公司详情 */
    getEmployeeCompanyDetails: (employeeId: string) => Promise<ContactCompany[]>;

    /** GET /api/v1/company-employees/:companyId/employees - 5. 获取公司下所有员工 */
    getEmployeesOfCompany: (companyId: string) => Promise<ContactEmployee[]>;

    /** POST /api/v1/employees/:id/departments - 将员工添加到部门（body 含 company_id） */
    addEmployeeToDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;

    /** DELETE /api/v1/employees/:id/departments - 将员工从部门移除（body 含 company_id） */
    removeEmployeeFromDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;

    /** 员工部门调动：先从旧部门移除，再添加到新部门 */
    moveEmployeeToDepartment: (employeeId: string, body: MoveEmployeeToDepartmentRequest) => Promise<Record<string, never>>;

    /** GET /api/v1/department-employees/:departmentId/employees - 5. 获取部门下所有员工 */
    getEmployeesOfDepartment: (departmentId: number) => Promise<ContactEmployee[]>;
}

/**
 * 通讯录 API 路径映射
 * 所有接口需 X-API-KEY 认证，/health 和 / 除外
 */
export const contactRoutes = {

    /** GET /health - 健康检查 */
    health: () => '/health',

    /** GET / - API 信息 */
    apiInfo: () => '/',

    /** POST/GET /api/v1/companies */
    companies: () => `${CONTACT_API_BASE_ROUTE}/companies`,

    /** GET/PUT/DELETE /api/v1/companies/:id */
    company: (id: string) => `${CONTACT_API_BASE_ROUTE}/companies/${id}`,

    /** GET /api/v1/companies/:id/departments - 获取公司及其部门 */
    companyWithDepartments: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/departments`,

    /** GET /api/v1/companies/:id/employees - 获取公司及其员工 */
    companyWithEmployees: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/employees`,

    /** POST /api/v1/departments */
    departments: () => `${CONTACT_API_BASE_ROUTE}/departments`,

    /** GET/PUT/DELETE /api/v1/departments/:id */
    department: (id: number) => `${CONTACT_API_BASE_ROUTE}/departments/${id}`,

    /** GET /api/v1/departments/:id/employees - 获取部门及其员工 */
    departmentWithEmployees: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/employees`,

    /** GET /api/v1/departments/:id/children -  获取部门及其子部门 */
    departmentWithChildren: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/children`,

    /** GET /api/v1/departments/:id/sub-departments - 获取子部门列表 */
    subDepartments: (parentDepartmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${parentDepartmentId}/sub-departments`,

    /** POST/GET /api/v1/employees */
    employees: () => `${CONTACT_API_BASE_ROUTE}/employees`,

    /** GET/PUT/DELETE /api/v1/employees/:id */
    employee: (id: string) => `${CONTACT_API_BASE_ROUTE}/employees/${id}`,

    /** GET /api/v1/employees/:id/details - 员工详情含公司/部门 */
    employeeDetails: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/details`,

    /** POST/GET/DELETE /api/v1/employees/:id/companies - 员工-公司关联 */
    employeeCompanies: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/companies`,

    /** GET /api/v1/employees/:id/companies/details */
    employeeCompanyDetails: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/companies/details`,

    /** POST/DELETE /api/v1/employees/:id/departments - 员工-部门关联 */
    employeeDepartments: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/departments`,

    /** GET /api/v1/company-employees/:companyId/employees - 5. 获取公司下所有员工 */
    employeesOfCompany: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/company-employees/${companyId}/employees`,

    /** GET /api/v1/department-employees/:departmentId/employees - 5. 获取部门下所有员工 */
    employeesOfDepartment: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/department-employees/${departmentId}/employees`,
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

    /** 统一封装 GET/POST/PUT/DELETE 请求，自动附加 API Key 与 tracking */
    private async doRequest<T>(path: string, method: string, body?: object): Promise<T> {
        this.ensureInitialized();
        const options: ClientOptions = {
            method: method.toUpperCase(),
            ...(body !== undefined && method.toLowerCase() !== 'get' && {body: body as Record<string, unknown>}),
        };
        return this.doFetchWithTracking(path, options, true) as Promise<T>;
    }

    contactHealthCheck = async (): Promise<ContactHealth> => {
        this.ensureInitialized();
        const headers = {...this.getRequestHeaders('get')};
        delete headers[API_KEY_HEADER];
        const response = await this.apiClient.get(contactRoutes.health(), {headers}) as ClientResponse;
        if (!response.ok) {
            throw new ClientError(this.baseUrl, {
                message: (response.data as {error?: string})?.error ?? `Health check failed: ${response.code}`,
                status_code: response.code,
                url: contactRoutes.health(),
            });
        }
        return (response.data ?? {}) as ContactHealth;
    };

    getContactAPIInfo = async (): Promise<ContactApiInfo> => {
        this.ensureInitialized();
        const headers = {...this.getRequestHeaders('get')};
        delete headers[API_KEY_HEADER];
        const response = await this.apiClient.get(contactRoutes.apiInfo(), {headers}) as ClientResponse;
        if (!response.ok) {
            throw new ClientError(this.baseUrl, {
                message: (response.data as {error?: string})?.error ?? `API info failed: ${response.code}`,
                status_code: response.code,
                url: contactRoutes.apiInfo(),
            });
        }
        return (response.data ?? {}) as ContactApiInfo;
    };

    createCompany = (company: CreateCompanyRequest) =>
        this.doRequest<ContactCompany>(contactRoutes.companies(), 'post', company);

    getCompanies = () =>
        this.doRequest<ContactCompany[]>(contactRoutes.companies(), 'get');

    getCompany = (companyId: string) =>
        this.doRequest<ContactCompany>(contactRoutes.company(companyId), 'get');

    updateCompany = (companyId: string, company: UpdateCompanyRequest) =>
        this.doRequest<ContactCompany>(contactRoutes.company(companyId), 'put', company);

    deleteCompany = (companyId: string) =>
        this.doRequest<Record<string, never>>(contactRoutes.company(companyId), 'delete');

    // TODO qgs 暂时先模拟 parentDepartmentId 的实现
    getCompanyWithDepartments = async (companyId: string, opts?: {parentDepartmentId?: number}) => {
        const parentDepartmentId = opts?.parentDepartmentId;
        const res = await this.doRequest<ContactCompany & {departments?: ContactDepartment[]}>(`${contactRoutes.companyWithDepartments(companyId)}${ typeof parentDepartmentId === 'number' ? `?parent_department_id=${parentDepartmentId}` : ''}`, 'get');
        if (typeof parentDepartmentId === 'number') {
            res.departments = (res.departments || []).filter((item) => (parentDepartmentId < 0 ? (item.parent_id === null || item.parent_id === undefined) : item.parent_id === parentDepartmentId));
        }
        return res;
    };

    getCompanyWithEmployees = (companyId: string) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.companyWithEmployees(companyId), 'get');

    // TOGO qgstest 临时用现有接口实现
    getCompanyEmployeeCount = (companyId: string) =>
        this.getEmployeesOfCompany(companyId).then((employees) => (Array.isArray(employees) ? employees : []).length);

    createDepartment = (department: CreateDepartmentRequest) =>
        this.doRequest<ContactDepartment>(contactRoutes.departments(), 'post', department);

    getDepartment = (departmentId: number) =>
        this.doRequest<ContactDepartment>(contactRoutes.department(departmentId), 'get');

    updateDepartment = (departmentId: number, department: UpdateDepartmentRequest) =>
        this.doRequest<ContactDepartment>(contactRoutes.department(departmentId), 'put', department);

    deleteDepartment = (departmentId: number) =>
        this.doRequest<Record<string, never>>(contactRoutes.department(departmentId), 'delete');

    getDepartmentWithEmployees = (departmentId: number) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.departmentWithEmployees(departmentId), 'get');

    getSubDepartments = (parentDepartmentId: number) =>
        this.doRequest<ContactDepartment[]>(contactRoutes.subDepartments(parentDepartmentId), 'get');

    getDepartmentWithChildren = (departmentId: number) =>
        this.doRequest<ContactDepartment[]>(contactRoutes.departmentWithChildren(departmentId), 'get');

    // TODO qgstest 临时实现
    getEmployeeCountOfDepartment = async (departmentId: number) => {
        const departmentsMap: {[depId: number]: string[]} = {};
        const getFullDepartments = async (departmentIdArg: number) => {
            if (departmentsMap[departmentIdArg] !== undefined) {
                return;
            }
            departmentsMap[departmentIdArg] = (await this.getEmployeesOfDepartment(departmentIdArg)).map((item) => item.id);
            const departments = await this.getSubDepartments(departmentIdArg);
            for (const department of departments) {
                if (departmentsMap[department.id] !== undefined) {
                    continue;
                }

                // departmentsMap[department.id] = (await this.getEmployeesOfDepartment(department.id)).map((item) => item.id);
                // eslint-disable-next-line no-await-in-loop
                await getFullDepartments(department.id);
            }
        };
        await getFullDepartments(departmentId);
        return new Set<string>(Object.values(departmentsMap).flat()).size;
    };

    createEmployee = (employee: CreateEmployeeRequest) =>
        this.doRequest<ContactEmployee>(contactRoutes.employees(), 'post', employee);

    getEmployee = (employeeId: string) =>
        this.doRequest<ContactEmployee>(contactRoutes.employee(employeeId), 'get');

    updateEmployee = (employeeId: string, employee: UpdateEmployeeRequest) =>
        this.doRequest<ContactEmployee>(contactRoutes.employee(employeeId), 'put', employee);

    deleteEmployee = (employeeId: string) =>
        this.doRequest<Record<string, never>>(contactRoutes.employee(employeeId), 'delete');

    getEmployeeDetails = (employeeId: string) =>
        this.doRequest<ContactEmployeeDetails>(contactRoutes.employeeDetails(employeeId), 'get');

    addEmployeeToCompany = (employeeId: string, body: CompanyEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeCompanies(employeeId), 'post', body);

    removeEmployeeFromCompany = (employeeId: string, body: CompanyEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeCompanies(employeeId), 'delete', body);

    getEmployeeCompanies = (employeeId: string) =>
        this.doRequest<ContactCompany[]>(contactRoutes.employeeCompanies(employeeId), 'get');

    getEmployeeCompanyDetails = (employeeId: string) =>
        this.doRequest<ContactCompany[]>(contactRoutes.employeeCompanyDetails(employeeId), 'get');

    getEmployeesOfCompany = (companyId: string) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.employeesOfCompany(companyId), 'get');

    addEmployeeToDepartment = (employeeId: string, body: DepartmentEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeDepartments(employeeId), 'post', body);

    removeEmployeeFromDepartment = (employeeId: string, body: DepartmentEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeDepartments(employeeId), 'delete', body);

    /**
     * TODO qgstest 先用现有接口临时实现
     * 员工部门调动：先从旧部门移除，再添加到新部门。
     * 后端无专有接口，故本地组合 remove + add。
     * 若员工本不在旧部门（"not belong to" 错误），忽略移除失败，直接执行添加。
     */
    moveEmployeeToDepartment = async (employeeId: string, body: MoveEmployeeToDepartmentRequest) => {
        try {
            await this.removeEmployeeFromDepartment(employeeId, {
                department_id: body.old_department_id,
                company_id: body.company_id,
            });
        } catch (delErr) {
            const delMsg = (delErr as ClientError).message;
            if (!(delMsg && delMsg.includes('not belong to'))) {
                // 如果不是因为不在部门中，则抛出错误
                throw delErr;
            }
            // eslint-disable-next-line no-console
            console.log('employee not belong to department', employeeId, body.department_id, body.company_id);
        }
        return this.addEmployeeToDepartment(employeeId, {
            department_id: body.department_id,
            company_id: body.company_id,
        });
    };

    getEmployeesOfDepartment = (departmentId: number) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.employeesOfDepartment(departmentId), 'get');
}

const ContactService = new ContactServiceClass();

export {ContactService};
export default ContactService;
