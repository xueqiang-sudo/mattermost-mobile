// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import OptionItem from '@components/option_item';

type Props = {
    icon: string;
    activeIcon?: string;
    label: string;
    value: boolean;
    onToggle: () => void;
    testID?: string;
}

const ToggleRow = ({icon, activeIcon, label, value, onToggle, testID}: Props) => {
    return (
        <OptionItem
            action={onToggle}
            icon={value && activeIcon ? activeIcon : icon}
            label={label}
            type='toggle'
            selected={value}
            testID={testID || `channel_info.shared.toggle.${label.toLowerCase().replace(/\s/g, '_')}`}
        />
    );
};

export default ToggleRow;
