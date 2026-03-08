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

export const ContactCompanyTypes = {
    Team: 'team',
    Supplier: 'supplier',
    Customer: 'customer',
} as const;
export type ContactCompanyType = typeof ContactCompanyTypes[keyof typeof ContactCompanyTypes];

export type ContactCompany = {
    id: string;
    name: string;
    type: ContactCompanyType;
    description?: string;
}

export type ContactDepartment = {
    id: number;
    company_id: string;
    name: string;
    description?: string;
    parent_id?: number;
}

export type ContactEmployee = {
    id: string;
    name: string;
    email?: string;
    position?: string;
    phone?: string;
}

export type ContactEmployeeDetails = ContactEmployee & {
    companies?: ContactCompany[];
    departments?: ContactDepartment[];
}

export type CreateCompanyRequest = ContactCompany;
export type UpdateCompanyRequest = CreateCompanyRequest;

export type CreateDepartmentRequest = {
    company_id: string;
    name: string;
    description?: string;
    parent_id?: number;
}
export type UpdateDepartmentRequest = CreateDepartmentRequest;

export type CreateEmployeeRequest = ContactEmployee;
export type UpdateEmployeeRequest = CreateEmployeeRequest;

export type CompanyEmployeeRequest = {
    company_id: string;
}

export type DepartmentEmployeeRequest = {
    department_id: number;
    company_id: string;
}

export type MoveEmployeeToDepartmentRequest = DepartmentEmployeeRequest & {
    old_department_id: number;
}

export type ContactApiInfo = {
    name: string;
    version: string;
}

export type ContactHealth = {
    status: string;
}

export interface ClientContactMix {
    contactHealthCheck: () => Promise<ContactHealth>;
    getContactAPIInfo: () => Promise<ContactApiInfo>;

    createCompany: (company: CreateCompanyRequest) => Promise<ContactCompany>;
    getCompanies: () => Promise<ContactCompany[]>;
    getCompany: (companyId: string) => Promise<ContactCompany>;
    updateCompany: (companyId: string, company: UpdateCompanyRequest) => Promise<ContactCompany>;
    deleteCompany: (companyId: string) => Promise<Record<string, never>>;
    getCompanyDepartments: (companyId: string) => Promise<ContactDepartment[]>;
    getCompanyEmployees: (companyId: string) => Promise<ContactEmployee[]>;
    getCompanyEmployeeCount: (companyId: string) => Promise<number>;

    createDepartment: (department: CreateDepartmentRequest) => Promise<ContactDepartment>;
    getDepartment: (departmentId: number) => Promise<ContactDepartment>;
    updateDepartment: (departmentId: number, department: UpdateDepartmentRequest) => Promise<ContactDepartment>;
    deleteDepartment: (departmentId: number) => Promise<Record<string, never>>;
    getDepartmentEmployees: (departmentId: number) => Promise<ContactEmployee[]>;
    getSubDepartments: (parentDepartmentId: number) => Promise<ContactDepartment[]>;

    createEmployee: (employee: CreateEmployeeRequest) => Promise<ContactEmployee>;
    getEmployee: (employeeId: string) => Promise<ContactEmployee>;
    updateEmployee: (employeeId: string, employee: UpdateEmployeeRequest) => Promise<ContactEmployee>;
    deleteEmployee: (employeeId: string) => Promise<Record<string, never>>;
    getEmployeeDetails: (employeeId: string) => Promise<ContactEmployeeDetails>;

    addEmployeeToCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;
    removeEmployeeFromCompany: (employeeId: string, body: CompanyEmployeeRequest) => Promise<Record<string, never>>;
    getEmployeeCompanies: (employeeId: string) => Promise<ContactCompany[]>;
    getEmployeeCompanyDetails: (employeeId: string) => Promise<ContactCompany[]>;
    getCompanyAllEmployees: (companyId: string) => Promise<ContactEmployee[]>;

    addEmployeeToDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;
    removeEmployeeFromDepartment: (employeeId: string, body: DepartmentEmployeeRequest) => Promise<Record<string, never>>;
    moveEmployeeToDepartment: (employeeId: string, body: MoveEmployeeToDepartmentRequest) => Promise<Record<string, never>>;
    getDepartmentAllEmployees: (departmentId: number) => Promise<ContactEmployee[]>;
}

export const contactRoutes = {
    health: () => '/health',
    apiInfo: () => '/',
    companies: () => `${CONTACT_API_BASE_ROUTE}/companies`,
    company: (id: string) => `${CONTACT_API_BASE_ROUTE}/companies/${id}`,
    companyDepartments: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/departments`,
    companyEmployees: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/companies/${companyId}/employees`,
    departments: () => `${CONTACT_API_BASE_ROUTE}/departments`,
    department: (id: number) => `${CONTACT_API_BASE_ROUTE}/departments/${id}`,
    departmentEmployees: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/departments/${departmentId}/employees`,
    employees: () => `${CONTACT_API_BASE_ROUTE}/employees`,
    employee: (id: string) => `${CONTACT_API_BASE_ROUTE}/employees/${id}`,
    employeeDetails: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/details`,
    employeeCompanies: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/companies`,
    employeeCompanyDetails: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/companies/details`,
    employeeDepartments: (employeeId: string) => `${CONTACT_API_BASE_ROUTE}/employees/${employeeId}/departments`,
    companyAllEmployees: (companyId: string) => `${CONTACT_API_BASE_ROUTE}/company-employees/${companyId}/employees`,
    departmentAllEmployees: (departmentId: number) => `${CONTACT_API_BASE_ROUTE}/department-employees/${departmentId}/employees`,
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

    /** 初始化通讯录服务，注入外部系统服务地址和 API Key */
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

    private ensureInitialized(): void {
        if (!this.baseUrl) {
            throw new ClientError('contact', {
                message: 'ContactService not initialized. Call init(contactServiceUrl, apiKey) first.',
                url: contactRoutes.companies(),
            });
        }
    }

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

    getCompanyDepartments = (companyId: string) =>
        this.doRequest<ContactDepartment[]>(contactRoutes.companyDepartments(companyId), 'get');

    getCompanyEmployees = (companyId: string) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.companyEmployees(companyId), 'get');

    // TODO qgs 临时用现有接口实现，等服务器接口
    getCompanyEmployeeCount = (companyId: string) =>
        this.getCompanyAllEmployees(companyId).then((employees) => (Array.isArray(employees) ? employees : []).length);

    createDepartment = (department: CreateDepartmentRequest) =>
        this.doRequest<ContactDepartment>(contactRoutes.departments(), 'post', department);

    getDepartment = (departmentId: number) =>
        this.doRequest<ContactDepartment>(contactRoutes.department(departmentId), 'get');

    updateDepartment = (departmentId: number, department: UpdateDepartmentRequest) =>
        this.doRequest<ContactDepartment>(contactRoutes.department(departmentId), 'put', department);

    deleteDepartment = (departmentId: number) =>
        this.doRequest<Record<string, never>>(contactRoutes.department(departmentId), 'delete');

    getDepartmentEmployees = (departmentId: number) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.departmentEmployees(departmentId), 'get');

    // TODO qgs 临时用现有接口实现，等服务器接口
    getSubDepartments = (parentDepartmentId: number) =>
        this.getCompanyDepartments('tmpteam1001').then((departments) => departments.filter((department) => department.parent_id === parentDepartmentId));

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

    getCompanyAllEmployees = (companyId: string) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.companyAllEmployees(companyId), 'get');

    addEmployeeToDepartment = (employeeId: string, body: DepartmentEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeDepartments(employeeId), 'post', body);

    removeEmployeeFromDepartment = (employeeId: string, body: DepartmentEmployeeRequest) =>
        this.doRequest<Record<string, never>>(contactRoutes.employeeDepartments(employeeId), 'delete', body);

    moveEmployeeToDepartment = async (employeeId: string, body: MoveEmployeeToDepartmentRequest) => {
        try {
            await this.removeEmployeeFromDepartment(employeeId, {
                department_id: body.department_id,
                company_id: body.company_id,
            });
        } catch (delErr) {
            const delMsg = (delErr as ClientError).message;
            if (!(delMsg && delMsg.includes('not belong to'))) {
                // 如果不是因为不在部门中，则抛出错误
                throw delErr;
            }
        }
        return this.addEmployeeToDepartment(employeeId, {
            department_id: body.department_id,
            company_id: body.company_id,
        });
    };

    getDepartmentAllEmployees = (departmentId: number) =>
        this.doRequest<ContactEmployee[]>(contactRoutes.departmentAllEmployees(departmentId), 'get');
}

const ContactService = new ContactServiceClass();

export {ContactService};
export default ContactService;
