// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {showModalWithBackButton} from '@screens/navigation';

const CLOSE_BUTTON_ID = 'close-external-profile-card';

type Props = {
    isTablet: boolean;
}

const ExternalProfileCardOption = ({isTablet}: Props) => {
    const intl = useIntl();
    const openExternalProfileCard = usePreventDoubleTap(useCallback(() => {
        if (!isTablet) {
            showModalWithBackButton(
                Screens.EXTERNAL_PROFILE_CARD,
                intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
                CLOSE_BUTTON_ID,
            );
        }
    }, [intl, isTablet]));

    if (isTablet) {
        return null;
    }

    return (
        <OptionItem
            icon='account-outline'
            label={intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'})}
            testID='account.external_profile_card.option'
            type='default'
            action={openExternalProfileCard}
        />
    );
};

export default ExternalProfileCardOption;
