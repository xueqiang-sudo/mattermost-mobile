// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 员工联系人 API 模块
 * 用于管理员工之间的客户和供应商关系
 * 使用单例模式，与 Mattermost 主 Client 分离
 * 服务地址和 API Key 通过 init(employeeContactServiceUrl, apiKey) 注入
 * 继承 ClientTracking 复用请求处理与错误处理逻辑
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

export const EMPLOYEE_CONTACT_API_BASE_ROUTE = '/api/v1';
export const API_KEY_HEADER = 'X-API-KEY';

/** 联系人类型枚举：customer=客户，supplier=供应商 */
export const EmployeeContactTypes = {
    Customer: 'customer',
    Supplier: 'supplier',
} as const;
export type EmployeeContactType = typeof EmployeeContactTypes[keyof typeof EmployeeContactTypes];

/** 联系人（员工）基本信息 */
export type EmployeeContact = {
    id: string;
    name: string;
    email?: string;
    position?: string;
    phone?: string;
};

/** 员工联系人关系详细信息 */
export type EmployeeContactDetail = {
    contact: EmployeeContact;
    contact_type: EmployeeContactType;
    description?: string;
    created_at: number;
};

/** 创建联系人关系请求体 */
export type CreateEmployeeContactRequest = {
    contact_id: string;
    contact_type: EmployeeContactType;
    description?: string;
};

/** 获取联系人列表响应 */
export type EmployeeContactListResponse = {
    employee_id: string;
    contact_type: EmployeeContactType;
    contacts: EmployeeContact[];
};

/** 获取联系人详细信息响应 */
export type EmployeeContactDetailResponse = {
    employee_id: string;
    contact_type: EmployeeContactType;
    contacts: EmployeeContactDetail[];
};

/** 获取所有联系人响应 */
export type EmployeeContactAllResponse = {
    employee_id: string;
    contacts: {
        customers: EmployeeContact[];
        suppliers: EmployeeContact[];
    };
};

/**
 * 员工联系人 API 客户端接口定义
 * 包含客户和供应商关系的 CRUD 操作
 */
export interface ClientEmployeeContactMix {
    /** POST /api/v1/employees/{employee_id}/contacts - 添加联系人 */
    addContact: (employeeId: string, contact: CreateEmployeeContactRequest) => Promise<{message: string}>;

    /** DELETE /api/v1/employees/{employee_id}/contacts - 移除联系人 */
    removeContact: (employeeId: string, contactId: string, contactType: EmployeeContactType) => Promise<{message: string}>;

    /** GET /api/v1/employees/{employee_id}/contacts - 获取联系人列表（基础信息） */
    getContacts: (employeeId: string, contactType: EmployeeContactType) => Promise<EmployeeContactListResponse>;

    /** GET /api/v1/employees/{employee_id}/contacts/details - 获取联系人列表（详细信息） */
    getContactsWithDetails: (employeeId: string, contactType: EmployeeContactType) => Promise<EmployeeContactDetailResponse>;

    /** GET /api/v1/employees/{employee_id}/contacts/all - 获取所有联系人（分组返回） */
    getAllContacts: (employeeId: string) => Promise<EmployeeContactAllResponse>;
}

/**
 * 员工联系人 API 路径映射（均需 X-API-KEY）
 */
export const employeeContactRoutes = {
    /** POST/GET /api/v1/employees/{employee_id}/contacts */
    contacts: (employeeId: string) => `${EMPLOYEE_CONTACT_API_BASE_ROUTE}/employees/${encodeURIComponent(employeeId)}/contacts`,

    /** GET /api/v1/employees/{employee_id}/contacts/details */
    contactsDetails: (employeeId: string) => `${EMPLOYEE_CONTACT_API_BASE_ROUTE}/employees/${encodeURIComponent(employeeId)}/contacts/details`,

    /** GET /api/v1/employees/{employee_id}/contacts/all */
    contactsAll: (employeeId: string) => `${EMPLOYEE_CONTACT_API_BASE_ROUTE}/employees/${encodeURIComponent(employeeId)}/contacts/all`,
};

/** 创建占位 API Client，用于构造函数调用 super()，实际请求前会被 init() 替换 */
function createPlaceholderApiClient(): APIClientInterface {
    const throwNotInit = () => {
        throw new ClientError('employee_contact', {
            message: 'EmployeeContactService not initialized. Call init(employeeContactServiceUrl, apiKey) first.',
            url: employeeContactRoutes.contacts(''),
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

class EmployeeContactServiceClass extends ClientTracking implements ClientEmployeeContactMix {
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

    getRequestHeaders(_requestMethod: string): Record<string, string> {
        return {
            [ClientConstants.HEADER_ACCEPT]: 'application/json',
            ...(this.apiKey ? {[API_KEY_HEADER]: this.apiKey} : {}),
        };
    }

    /**
     * 初始化员工联系人服务
     * @param employeeContactServiceUrl 员工联系人 API 基础 URL（如 https://contact.example.com）
     * @param apiKey API Key，对应 Header X-API-KEY
     */
    init = async (employeeContactServiceUrl: string, apiKey: string): Promise<void> => {
        if (!employeeContactServiceUrl) {
            return;
        }
        this.apiKey = apiKey;
        this.baseUrl = employeeContactServiceUrl;
        const config = this.buildConfig();
        const {client} = await getOrCreateAPIClient(employeeContactServiceUrl, config);
        this.apiClient = client;
    };

    /** 确保已调用 init()，否则抛出 ClientError */
    private ensureInitialized(): void {
        if (!this.baseUrl) {
            throw new ClientError('employee_contact', {
                message: 'EmployeeContactService not initialized. Call init(employeeContactServiceUrl, apiKey) first.',
                url: employeeContactRoutes.contacts(''),
            });
        }
    }

    private async doRequestDirect<T>(path: string, method: string, body?: object, headers?: Record<string, string>): Promise<T> {
        this.ensureInitialized();
        const options: ClientOptions = {
            method: method.toUpperCase(),
            ...(body !== undefined && method.toLowerCase() !== 'get' && {body: body as Record<string, unknown>}),
        };
        headers && typeof headers === 'object' && (options.headers = Object.assign(options.headers || {}, headers));
        return this.doFetchWithTracking(path, options, true) as Promise<T>;
    }

    /**
     * 添加联系人关系
     */
    addContact = (employeeId: string, contact: CreateEmployeeContactRequest) =>
        this.doRequestDirect<{message: string}>(employeeContactRoutes.contacts(employeeId), 'post', contact);

    /**
     * 移除联系人关系
     */
    removeContact = (employeeId: string, contactId: string, contactType: EmployeeContactType) => {
        const path = `${employeeContactRoutes.contacts(employeeId)}?contact_id=${encodeURIComponent(contactId)}&contact_type=${encodeURIComponent(contactType)}`;
        return this.doRequestDirect<{message: string}>(path, 'delete');
    };

    /**
     * 获取联系人列表（基础信息）
     */
    getContacts = (employeeId: string, contactType: EmployeeContactType) => {
        const path = `${employeeContactRoutes.contacts(employeeId)}?contact_type=${encodeURIComponent(contactType)}`;
        return this.doRequestDirect<EmployeeContactListResponse>(path, 'get');
    };

    /**
     * 获取联系人列表（详细信息）
     */
    getContactsWithDetails = (employeeId: string, contactType: EmployeeContactType) => {
        const path = `${employeeContactRoutes.contactsDetails(employeeId)}?contact_type=${encodeURIComponent(contactType)}`;
        return this.doRequestDirect<EmployeeContactDetailResponse>(path, 'get');
    };

    /**
     * 获取所有联系人（分组返回）
     */
    getAllContacts = (employeeId: string) =>
        this.doRequestDirect<EmployeeContactAllResponse>(employeeContactRoutes.contactsAll(employeeId), 'get');
}

const EmployeeContactService = new EmployeeContactServiceClass();

export {EmployeeContactService};
export default EmployeeContactService;
