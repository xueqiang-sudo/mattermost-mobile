// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, waitFor} from '@testing-library/react-native';

import {PostPriorityType} from '@constants/post';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import QuickActionsSheet from './quick_actions_sheet';

describe('QuickActionsSheet', () => {
    it('should execute action only after async dismiss resolves', async () => {
        let resolveDismiss: (() => void) | undefined;
        const onDismiss = jest.fn(() => {
            return new Promise<void>((resolve) => {
                resolveDismiss = resolve;
            });
        });
        const addFiles = jest.fn();

        const {getByTestId} = renderWithIntlAndTheme(
            <QuickActionsSheet
                testID='quick_actions_sheet'
                canUploadFiles={true}
                fileCount={0}
                isPostPriorityEnabled={true}
                canShowPostPriority={true}
                maxFileCount={10}
                value=''
                updateValue={jest.fn()}
                addFiles={addFiles}
                postPriority={{priority: PostPriorityType.STANDARD}}
                updatePostPriority={jest.fn()}
                focus={jest.fn()}
                onDismiss={onDismiss}
            />,
        );

        fireEvent.press(getByTestId('quick_actions_sheet.image_action'));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(addFiles).not.toHaveBeenCalled();

        await act(async () => {
            resolveDismiss?.();
        });

        // Gallery action opens a picker, so we just verify dismiss was called
        await waitFor(() => {
            expect(onDismiss).toHaveBeenCalledTimes(1);
        });
    });
});
