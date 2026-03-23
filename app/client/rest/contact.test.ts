// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

const mockDiskFiles = new Map<string, string>();
const mockDiskDirs = new Set<string>();

/** 测试用：覆盖所有磁盘缓存文件的 modificationTime（秒时间戳），用于验证 7 天过期逻辑 */
let mockDiskFileModificationTimeOverride: number | undefined;
const mockDocumentDirectory = '/mock-doc/';

jest.mock('expo-file-system', () => {
    return {
        documentDirectory: mockDocumentDirectory,
        deleteAsync: jest.fn(async (uri: string) => {
            mockDiskFiles.delete(uri);
        }),
        getInfoAsync: jest.fn(async (uri: string) => {
            if (mockDiskFiles.has(uri)) {
                const modificationTime = mockDiskFileModificationTimeOverride ?? Date.now() / 1000;
                return {exists: true, isDirectory: false, modificationTime};
            }
            if (mockDiskDirs.has(uri)) {
                return {exists: true, isDirectory: true};
            }
            return {exists: false, isDirectory: false};
        }),
        makeDirectoryAsync: jest.fn(async (dir: string) => {
            mockDiskDirs.add(dir);
        }),
        readAsStringAsync: jest.fn(async (uri: string) => {
            const v = mockDiskFiles.get(uri);
            if (typeof v !== 'string') {
                throw new Error('File does not exist');
            }
            return v;
        }),
        readDirectoryAsync: jest.fn(async (dir: string) => {
            const prefix = dir;
            const names = new Set<string>();
            for (const uri of mockDiskFiles.keys()) {
                if (!uri.startsWith(prefix)) {
                    continue;
                }
                const rest = uri.slice(prefix.length);
                if (rest.includes('/')) {
                    continue;
                }
                names.add(rest);
            }
            return Array.from(names);
        }),
        writeAsStringAsync: jest.fn(async (uri: string, contents: string) => {
            mockDiskFiles.set(uri, contents);
        }),
    };
});

const mockClientResponse = {ok: true, data: {}, metrics: {latency: 0, compressedSize: 0, size: 0, startTime: 0, endTime: 0}};

jest.mock('@managers/network_performance_manager', () => ({
    __esModule: true,
    default: {
        startRequestTracking: jest.fn(() => 'req-1'),
        completeRequestTracking: jest.fn(),
        cancelRequestTracking: jest.fn(),
    },
}));

jest.mock('@managers/performance_metrics_manager', () => ({
    __esModule: true,
    default: {
        collectNetworkRequestData: jest.fn(),
    },
}));

jest.mock('@mattermost/react-native-network-client', () => ({
    getOrCreateAPIClient: jest.fn(() => Promise.resolve({
        client: {
            baseUrl: 'https://contact.example.com',
            get: mockGet,
            post: mockPost,
            put: mockPut,
            delete: mockDelete,
        },
    })),
    RetryTypes: {EXPONENTIAL_RETRY: 'exponential'},
}));

import ContactService, {contactRoutes} from './contact';
import {writeContactDiskCache} from './contact_disk_cache';

describe('ContactService', () => {
    const contactServiceUrl = 'https://contact.example.com';
    const apiKey = 'test-contact-api-key';

    beforeAll(async () => {
        await ContactService.init(contactServiceUrl, apiKey);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockDiskFiles.clear();
        mockDiskDirs.clear();
        mockDiskFileModificationTimeOverride = undefined;
        mockGet.mockResolvedValue(mockClientResponse);
        mockPost.mockResolvedValue(mockClientResponse);
        mockPut.mockResolvedValue(mockClientResponse);
        mockDelete.mockResolvedValue(mockClientResponse);
    });

    it('should call createCompany with correct path, method, body and headers', async () => {
        const company = {
            id: 'company_001',
            name: 'ABC科技有限公司',
            type: 'team' as const,
            description: '主要技术团队',
        };

        await ContactService.createCompany(company);

        expect(mockPost).toHaveBeenCalledWith(
            contactRoutes.companies(),
            expect.objectContaining({
                body: company,
                headers: expect.objectContaining({'X-API-KEY': 'test-contact-api-key'}),
            }),
        );
    });

    it('should call getEmployeeCompanies with correct path and headers', async () => {
        const employeeId = 'emp_001';

        await ContactService.getEmployeeCompanies(employeeId);

        expect(mockGet).toHaveBeenCalledWith(
            contactRoutes.employeeCompanies(employeeId),
            expect.objectContaining({
                headers: expect.objectContaining({'X-API-KEY': 'test-contact-api-key'}),
            }),
        );
    });

    it('should call deleteDepartmentForce with correct path and method', async () => {
        const companyId = 'company_001';
        const departmentId = 42;

        await ContactService.deleteDepartmentForce(companyId, departmentId);

        expect(mockDelete).toHaveBeenCalledWith(
            contactRoutes.departmentForce(departmentId),
            expect.objectContaining({
                headers: expect.objectContaining({'X-API-KEY': 'test-contact-api-key'}),
            }),
        );
    });

    it('should call transferUserCompanyOwnership with body', async () => {
        const userId = 'user_001';
        const companyId = 'company_001';
        const body = {new_owner_id: 'user_002'};

        await ContactService.transferUserCompanyOwnership(userId, companyId, body);

        expect(mockPost).toHaveBeenCalledWith(
            contactRoutes.userTransferOwnership(userId, companyId),
            expect.objectContaining({
                body,
                headers: expect.objectContaining({'X-API-KEY': 'test-contact-api-key'}),
            }),
        );
    });

    it('should call getContactVersion on each invocation (direct, no response cache)', async () => {
        const companyId = 'company_ver';
        const versionInfo = {company_id: companyId, version: 'v9', type: 'contacts' as const};
        mockGet.mockResolvedValue({
            ...mockClientResponse,
            data: versionInfo,
        });

        await ContactService.getContactVersion(companyId);
        await ContactService.getContactVersion(companyId);

        const versionPath = contactRoutes.contactVersion(companyId);
        const calls = mockGet.mock.calls.filter(([p]) => p === versionPath).length;
        expect(calls).toBe(2);
    });

    it('should call removeEmployeeFromDepartment with correct path and headers', async () => {
        const employeeId = 'emp_001';
        const body = {
            company_id: 'company_001',
            department_id: 2,
        };

        await ContactService.removeEmployeeFromDepartment(employeeId, body);

        expect(mockDelete).toHaveBeenCalledWith(
            `${contactRoutes.employeeDepartments(employeeId)}?department_id=${body.department_id}&company_id=${encodeURIComponent(body.company_id)}`,
            expect.objectContaining({
                headers: expect.objectContaining({'X-API-KEY': 'test-contact-api-key'}),
            }),
        );
    });

    it('should cache GET response when contact version unchanged', async () => {
        const companyId = 'company_001';
        const employees = [{id: 'emp_001', name: 'Alice'}];
        const versionInfo = {company_id: companyId, version: 'v1', type: 'contacts' as const};

        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === contactRoutes.employeesOfCompany(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: employees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        const first = await ContactService.getEmployeesOfCompany(companyId);
        const second = await ContactService.getEmployeesOfCompany(companyId);

        expect(first).toEqual(employees);
        expect(second).toEqual(employees);

        const versionCalls = mockGet.mock.calls.filter(([p]) => p === contactRoutes.contactVersion(companyId)).length;
        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === contactRoutes.employeesOfCompany(companyId)).length;
        expect(versionCalls).toBe(1);
        expect(employeesCalls).toBe(1);
    });

    it('should invalidate caches after mutation and re-fetch on next GET', async () => {
        const companyId = 'company_002';
        const employees = [{id: 'emp_001', name: 'Alice'}];
        const versionInfo = {company_id: companyId, version: 'v1', type: 'contacts' as const};

        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === contactRoutes.employeesOfCompany(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: employees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        await ContactService.getEmployeesOfCompany(companyId);

        await ContactService.updateCompany(companyId, {
            id: companyId,
            name: 'New Name',
            type: 'team' as const,
        });

        await ContactService.getEmployeesOfCompany(companyId);

        const versionCalls = mockGet.mock.calls.filter(([p]) => p === contactRoutes.contactVersion(companyId)).length;
        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === contactRoutes.employeesOfCompany(companyId)).length;

        // 第一次 GET：version + employees；mutation 之后失效；第二次 GET 再拉一遍
        expect(versionCalls).toBe(2);
        expect(employeesCalls).toBe(2);
    });

    it('should read company proxy GET from disk when version matches', async () => {
        const companyId = 'company_disk_hit';
        const employees = [{id: 'emp_disk_001', name: 'Disk Alice'}];
        const employeesPath = contactRoutes.employeesOfCompany(companyId);
        const version = 'v_disk_1';
        const versionInfo = {company_id: companyId, version, type: 'contacts' as const};

        await writeContactDiskCache(contactServiceUrl, companyId, employeesPath, version, employees);

        const networkEmployees = [{id: 'emp_net_001', name: 'Network Bob'}];
        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === employeesPath) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: networkEmployees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        const res = await ContactService.getEmployeesOfCompany(companyId);
        expect(res).toEqual(employees);

        const versionCalls = mockGet.mock.calls.filter(([p]) => p === contactRoutes.contactVersion(companyId)).length;
        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === employeesPath).length;
        expect(versionCalls).toBe(1);
        expect(employeesCalls).toBe(0);
    });

    it('should skip disk cache when file is older than 7 days', async () => {
        const companyId = 'company_disk_expired';
        const diskEmployees = [{id: 'emp_disk_old', name: 'Expired Disk'}];
        const employeesPath = contactRoutes.employeesOfCompany(companyId);
        const version = 'v_disk_1';
        const versionInfo = {company_id: companyId, version, type: 'contacts' as const};

        await writeContactDiskCache(contactServiceUrl, companyId, employeesPath, version, diskEmployees);
        mockDiskFileModificationTimeOverride = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;

        const networkEmployees = [{id: 'emp_net_fresh', name: 'Fresh From Network'}];
        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === employeesPath) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: networkEmployees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        const res = await ContactService.getEmployeesOfCompany(companyId);
        expect(res).toEqual(networkEmployees);

        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === employeesPath).length;
        expect(employeesCalls).toBe(1);
    });

    it('should skip disk cache when version mismatches', async () => {
        const companyId = 'company_disk_miss_version';
        const diskEmployees = [{id: 'emp_disk_002', name: 'Old Disk'}];
        const employeesPath = contactRoutes.employeesOfCompany(companyId);
        const diskVersion = 'v_disk_old';
        const version = 'v_disk_new';
        const versionInfo = {company_id: companyId, version, type: 'contacts' as const};

        await writeContactDiskCache(contactServiceUrl, companyId, employeesPath, diskVersion, diskEmployees);

        const networkEmployees = [{id: 'emp_net_002', name: 'Network New'}];
        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === employeesPath) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: networkEmployees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        const res = await ContactService.getEmployeesOfCompany(companyId);
        expect(res).toEqual(networkEmployees);

        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === employeesPath).length;
        expect(employeesCalls).toBe(1);
    });

    it('should clear disk cache after mutation', async () => {
        const companyId = 'company_disk_clear_after_mutation';
        const employeesPath = contactRoutes.employeesOfCompany(companyId);
        const version = 'v_disk_clear_1';
        const versionInfo = {company_id: companyId, version, type: 'contacts' as const};
        const diskEmployees = [{id: 'emp_disk_003', name: 'Disk Before Mutation'}];
        const networkEmployees = [{id: 'emp_net_003', name: 'Network After Mutation'}];

        await writeContactDiskCache(contactServiceUrl, companyId, employeesPath, version, diskEmployees);

        mockGet.mockImplementation((path: string) => {
            if (path === contactRoutes.contactVersion(companyId)) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: versionInfo,
                });
            }
            if (path === employeesPath) {
                return Promise.resolve({
                    ...mockClientResponse,
                    data: networkEmployees,
                });
            }
            return Promise.resolve(mockClientResponse);
        });

        await ContactService.updateCompany(companyId, {
            id: companyId,
            name: 'New Name',
            type: 'team' as const,
        });

        const res = await ContactService.getEmployeesOfCompany(companyId);
        expect(res).toEqual(networkEmployees);

        const employeesCalls = mockGet.mock.calls.filter(([p]) => p === employeesPath).length;
        expect(employeesCalls).toBe(1);
    });
});
