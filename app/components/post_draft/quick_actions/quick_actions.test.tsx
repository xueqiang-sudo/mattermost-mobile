// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PostPriorityType} from '@constants/post';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import QuickActions from './quick_actions';

describe('Quick Actions', () => {
    const baseProps: Parameters<typeof QuickActions>[0] = {
        canUploadFiles: true,
        fileCount: 0,
        isPostPriorityEnabled: true,
        canShowPostPriority: true,
        maxFileCount: 10,
        value: '',
        updateValue: jest.fn(),
        addFiles: jest.fn(),
        postPriority: {
            priority: PostPriorityType.STANDARD,
        },
        updatePostPriority: jest.fn(),
        focus: jest.fn(),
    };

    it('should render quick actions without slash action', () => {
        const {queryByTestId} = renderWithIntlAndTheme(<QuickActions {...baseProps}/>);
        expect(queryByTestId('slash-input-action')).toBeNull();
    });
});
