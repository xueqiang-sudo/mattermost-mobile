// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 供应商、客户 API 模块
 * 专门用于管理供应商和客户，基于通信录 API 的 company 类型。
 * 使用单例模式，与 Mattermost 主 Client 分离。
 * 服务地址和 API Key 通过 init(supplierCustomerServiceUrl, apiKey) 注入。
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

export const SUPPLIER_CUSTOMER_API_BASE_ROUTE = '/api/v1';
export const API_KEY_HEADER = 'X-API-KEY';

/** 公司类型枚举：supplier=供应商，customer=客户 */
export const SupplierCustomerTypes = {
    Supplier: 'supplier',
    Customer: 'customer',
} as const;
export type SupplierCustomerType = typeof SupplierCustomerTypes[keyof typeof SupplierCustomerTypes];

/** 供应商/客户数据模型：id 为 36 位字符串主键，type 区分供应商/客户 */
export type SupplierCustomer = {
    id: string;
    name: string;
    type: SupplierCustomerType;
    owner_id: string;
    description?: string;
};

/** 创建供应商/客户请求体：id/name/type 必填，id 需客户端生成 36 位字符串 */
export type CreateSupplierCustomerRequest = SupplierCustomer;
export type UpdateSupplierCustomerRequest = CreateSupplierCustomerRequest;

/**
 * 供应商、客户 API 客户端接口定义
 * 包含供应商和客户的 CRUD 操作
 */
export interface ClientSupplierCustomerMix {

    /** POST /api/v1/companies - 创建供应商 */
    createSupplier: (supplier: CreateSupplierCustomerRequest) => Promise<SupplierCustomer>;

    /** GET /api/v1/companies - 获取所有供应商 */
    getSuppliers: () => Promise<SupplierCustomer[]>;

    /** GET /api/v1/companies/:id - 获取单个供应商 */
    getSupplier: (supplierId: string) => Promise<SupplierCustomer>;

    /** PUT /api/v1/companies/:id - 更新供应商 */
    updateSupplier: (supplierId: string, supplier: UpdateSupplierCustomerRequest) => Promise<SupplierCustomer>;

    /** DELETE /api/v1/companies/:id - 软删除供应商 */
    deleteSupplier: (supplierId: string) => Promise<Record<string, never>>;

    /** DELETE /api/v1/companies/:id/force - 强制删除供应商 */
    deleteSupplierForce: (supplierId: string) => Promise<Record<string, never>>;

    /** POST /api/v1/companies - 创建客户 */
    createCustomer: (customer: CreateSupplierCustomerRequest) => Promise<SupplierCustomer>;

    /** GET /api/v1/companies - 获取所有客户 */
    getCustomers: () => Promise<SupplierCustomer[]>;

    /** GET /api/v1/companies/:id - 获取单个客户 */
    getCustomer: (customerId: string) => Promise<SupplierCustomer>;

    /** PUT /api/v1/companies/:id - 更新客户 */
    updateCustomer: (customerId: string, customer: UpdateSupplierCustomerRequest) => Promise<SupplierCustomer>;

    /** DELETE /api/v1/companies/:id - 软删除客户 */
    deleteCustomer: (customerId: string) => Promise<Record<string, never>>;

    /** DELETE /api/v1/companies/:id/force - 强制删除客户 */
    deleteCustomerForce: (customerId: string) => Promise<Record<string, never>>;

    /** GET /api/v1/companies - 获取所有公司（包括供应商和客户） */
    getAllCompanies: () => Promise<SupplierCustomer[]>;
}

/**
 * 供应商、客户 API 路径映射（均需 X-API-KEY）
 */
export const supplierCustomerRoutes = {

    /** POST/GET /api/v1/companies */
    companies: () => `${SUPPLIER_CUSTOMER_API_BASE_ROUTE}/companies`,

    /** GET/PUT/DELETE /api/v1/companies/:id */
    company: (id: string) => `${SUPPLIER_CUSTOMER_API_BASE_ROUTE}/companies/${id}`,

    /** DELETE /api/v1/companies/:id/force - 强制删除 */
    companyForce: (id: string) => `${SUPPLIER_CUSTOMER_API_BASE_ROUTE}/companies/${id}/force`,
};

/** 创建占位 API Client，用于构造函数调用 super()，实际请求前会被 init() 替换 */
function createPlaceholderApiClient(): APIClientInterface {
    const throwNotInit = () => {
        throw new ClientError('supplier_customer', {
            message: 'SupplierCustomerService not initialized. Call init(supplierCustomerServiceUrl, apiKey) first.',
            url: supplierCustomerRoutes.companies(),
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

class SupplierCustomerServiceClass extends ClientTracking implements ClientSupplierCustomerMix {
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
     * 初始化供应商、客户服务
     * @param supplierCustomerServiceUrl 供应商、客户 API 基础 URL（如 https://contact.example.com）
     * @param apiKey API Key，对应 Header X-API-KEY
     */
    init = async (supplierCustomerServiceUrl: string, apiKey: string): Promise<void> => {
        if (!supplierCustomerServiceUrl) {
            return;
        }
        this.apiKey = apiKey;
        this.baseUrl = supplierCustomerServiceUrl;
        const config = this.buildConfig();
        const {client} = await getOrCreateAPIClient(supplierCustomerServiceUrl, config);
        this.apiClient = client;
    };

    /** 确保已调用 init()，否则抛出 ClientError */
    private ensureInitialized(): void {
        if (!this.baseUrl) {
            throw new ClientError('supplier_customer', {
                message: 'SupplierCustomerService not initialized. Call init(supplierCustomerServiceUrl, apiKey) first.',
                url: supplierCustomerRoutes.companies(),
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
     * 供应商操作
     */
    createSupplier = (supplier: CreateSupplierCustomerRequest) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.companies(), 'post', supplier);

    getSuppliers = async () => {
        const companies = await this.doRequestDirect<SupplierCustomer[]>(supplierCustomerRoutes.companies(), 'get');
        return companies.filter(company => company.type === SupplierCustomerTypes.Supplier);
    };

    getSupplier = (supplierId: string) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.company(supplierId), 'get');

    updateSupplier = (supplierId: string, supplier: UpdateSupplierCustomerRequest) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.company(supplierId), 'put', supplier);

    deleteSupplier = (supplierId: string) =>
        this.doRequestDirect<Record<string, never>>(supplierCustomerRoutes.company(supplierId), 'delete');

    deleteSupplierForce = (supplierId: string) =>
        this.doRequestDirect<Record<string, never>>(supplierCustomerRoutes.companyForce(supplierId), 'delete');

    /**
     * 客户操作
     */
    createCustomer = (customer: CreateSupplierCustomerRequest) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.companies(), 'post', customer);

    getCustomers = async () => {
        const companies = await this.doRequestDirect<SupplierCustomer[]>(supplierCustomerRoutes.companies(), 'get');
        return companies.filter(company => company.type === SupplierCustomerTypes.Customer);
    };

    getCustomer = (customerId: string) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.company(customerId), 'get');

    updateCustomer = (customerId: string, customer: UpdateSupplierCustomerRequest) =>
        this.doRequestDirect<SupplierCustomer>(supplierCustomerRoutes.company(customerId), 'put', customer);

    deleteCustomer = (customerId: string) =>
        this.doRequestDirect<Record<string, never>>(supplierCustomerRoutes.company(customerId), 'delete');

    deleteCustomerForce = (customerId: string) =>
        this.doRequestDirect<Record<string, never>>(supplierCustomerRoutes.companyForce(customerId), 'delete');

    /**
     * 获取所有公司（包括供应商和客户）
     */
    getAllCompanies = () =>
        this.doRequestDirect<SupplierCustomer[]>(supplierCustomerRoutes.companies(), 'get');
}

const SupplierCustomerService = new SupplierCustomerServiceClass();

export {SupplierCustomerService};
export default SupplierCustomerService;
