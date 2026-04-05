// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import DatabaseManager from '@database/manager';
import ContactService from '@client/rest/contact';
import NetworkManager from '@managers/network_manager';

import {
    syncEnterpriseDisplayNameWithMattermost,
    transferContactCompanyOwnership,
} from './contact';

jest.mock('@actions/remote/session', () => ({
    forceLogoutIfNecessary: jest.fn(),
}));

const serverUrl = 'https://example.test';

const baseCompany = {
    id: 'team-1',
    name: 'Old Name',
    type: 'team' as const,
    owner_id: 'user-1',
};

describe('syncEnterpriseDisplayNameWithMattermost', () => {
    const patchTeam = jest.fn();
    const handleTeam = jest.fn().mockResolvedValue([]);
    const batchRecords = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(ContactService, 'getCompany').mockResolvedValue(baseCompany);
        jest.spyOn(ContactService, 'updateCompany').mockResolvedValue({
            ...baseCompany,
            name: 'New Name',
        });
        NetworkManager.getClient = jest.fn().mockReturnValue({patchTeam});
        patchTeam.mockResolvedValue({...baseCompany, id: 'team-1', display_name: 'New Name'});
        jest.spyOn(DatabaseManager, 'getServerDatabaseAndOperator').mockReturnValue({
            operator: {handleTeam, batchRecords},
        } as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should update contact only when not a Mattermost team', async () => {
        const res = await syncEnterpriseDisplayNameWithMattermost(serverUrl, {
            companyId: 'team-1',
            displayName: 'New Name',
            hasContactCompanyRecord: true,
            isMattermostTeam: false,
        });
        expect(res.error).toBeUndefined();
        expect(ContactService.updateCompany).toHaveBeenCalled();
        expect(patchTeam).not.toHaveBeenCalled();
    });

    it('should patch Mattermost only when no contact record', async () => {
        const res = await syncEnterpriseDisplayNameWithMattermost(serverUrl, {
            companyId: 'team-1',
            displayName: 'New Name',
            hasContactCompanyRecord: false,
            isMattermostTeam: true,
        });
        expect(res.error).toBeUndefined();
        expect(ContactService.updateCompany).not.toHaveBeenCalled();
        expect(patchTeam).toHaveBeenCalledWith({id: 'team-1', display_name: 'New Name'});
        expect(handleTeam).toHaveBeenCalled();
        expect(batchRecords).toHaveBeenCalled();
    });

    it('should update contact then patch team when both apply', async () => {
        const res = await syncEnterpriseDisplayNameWithMattermost(serverUrl, {
            companyId: 'team-1',
            displayName: 'New Name',
            hasContactCompanyRecord: true,
            isMattermostTeam: true,
        });
        expect(res.error).toBeUndefined();
        expect(ContactService.updateCompany).toHaveBeenCalled();
        expect(patchTeam).toHaveBeenCalled();
    });

    it('should return error when displayName is empty', async () => {
        const res = await syncEnterpriseDisplayNameWithMattermost(serverUrl, {
            companyId: 'team-1',
            displayName: '   ',
            hasContactCompanyRecord: true,
            isMattermostTeam: false,
        });
        expect(res.error).toBeDefined();
    });
});

describe('transferContactCompanyOwnership', () => {
    beforeEach(() => {
        jest.spyOn(ContactService, 'transferUserCompanyOwnership').mockResolvedValue({});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should call ContactService with new_owner_id', async () => {
        const res = await transferContactCompanyOwnership('user-1', 'comp-1', 'user-2');
        expect(res.error).toBeUndefined();
        expect(ContactService.transferUserCompanyOwnership).toHaveBeenCalledWith('user-1', 'comp-1', {
            new_owner_id: 'user-2',
        });
    });

    it('should error when new owner equals current user', async () => {
        const res = await transferContactCompanyOwnership('user-1', 'comp-1', 'user-1');
        expect(res.error).toBeDefined();
        expect(ContactService.transferUserCompanyOwnership).not.toHaveBeenCalled();
    });
});
