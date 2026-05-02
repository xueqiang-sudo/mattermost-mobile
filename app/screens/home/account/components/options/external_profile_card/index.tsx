// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {showModalWithBackButton} from '@screens/navigation';

const CLOSE_EXTERNAL_PROFILE_CARD = 'close-account-external-profile-card';

const ExternalProfileCard = () => {
    const intl = useIntl();

    const openExternalProfileCard = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD,
            intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
            CLOSE_EXTERNAL_PROFILE_CARD,
        );
    }, [intl]));

    return (
        <OptionItem
            action={openExternalProfileCard}
            icon='credit-card-outline'
            label={intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'})}
            testID='account.external_profile_card.option'
            type='default'
        />
    );
};

export default ExternalProfileCard;
