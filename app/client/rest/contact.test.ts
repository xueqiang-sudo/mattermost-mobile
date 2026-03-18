// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

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

describe('ContactService', () => {
    const contactServiceUrl = 'https://contact.example.com';
    const apiKey = 'test-contact-api-key';

    beforeAll(async () => {
        await ContactService.init(contactServiceUrl, apiKey);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockResolvedValue(mockClientResponse);
        mockPost.mockResolvedValue(mockClientResponse);
        mockPut.mockResolvedValue(mockClientResponse);
        mockDelete.mockResolvedValue(mockClientResponse);
    });

    it('should call contactHealthCheck with correct path and no API key', async () => {
        await ContactService.contactHealthCheck();

        expect(mockGet).toHaveBeenCalledWith(
            contactRoutes.health(),
            expect.objectContaining({
                headers: expect.not.objectContaining({'X-API-KEY': expect.anything()}),
            }),
        );
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
});
