// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type EnterpriseUserTagKey = 'owner' | 'manager' | 'self';

type BuildEnterpriseUserTagKeysParams = {
    userId: string;
    ownerId?: string;
    currentUserId?: string;
    managerIds?: Set<string>;
};

export const buildEnterpriseUserTagKeys = ({
    userId,
    ownerId,
    currentUserId,
    managerIds,
}: BuildEnterpriseUserTagKeysParams): EnterpriseUserTagKey[] => {
    const isOwner = Boolean(ownerId && ownerId === userId);
    const isSelf = Boolean(currentUserId && currentUserId === userId);
    const isManager = Boolean(managerIds?.has(userId));

    const keys: EnterpriseUserTagKey[] = [];
    if (isOwner) {
        keys.push('owner');
    } else if (isManager) {
        keys.push('manager');
    }
    if (isSelf) {
        keys.push('self');
    }
    return keys;
};
