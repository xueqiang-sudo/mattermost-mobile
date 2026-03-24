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
        const updateValue = jest.fn();
        const focus = jest.fn();

        const {getByTestId} = renderWithIntlAndTheme(
            <QuickActionsSheet
                testID='quick_actions_sheet'
                canUploadFiles={true}
                fileCount={0}
                isPostPriorityEnabled={true}
                canShowPostPriority={true}
                canShowSlashCommands={true}
                maxFileCount={10}
                value=''
                updateValue={updateValue}
                addFiles={jest.fn()}
                postPriority={{priority: PostPriorityType.STANDARD}}
                updatePostPriority={jest.fn()}
                focus={focus}
                onDismiss={onDismiss}
            />,
        );

        fireEvent.press(getByTestId('quick_actions_sheet.at_action'));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(updateValue).not.toHaveBeenCalled();
        expect(focus).not.toHaveBeenCalled();

        await act(async () => {
            resolveDismiss?.();
        });

        await waitFor(() => {
            expect(updateValue).toHaveBeenCalledTimes(1);
            expect(focus).toHaveBeenCalledTimes(1);
        });
    });
});
