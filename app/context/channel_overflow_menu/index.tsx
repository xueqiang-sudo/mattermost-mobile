// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useCallback, useContext, useState} from 'react';

export type ChannelOverflowMenuItem = {
    labelId: string;
    defaultLabel: string;
    onPress: () => void;
    testID: string;
};

type OpenChannelOverflowMenuArgs = {
    anchorLeft: number;
    anchorWidth: number;
    anchorTop: number;
    items: ChannelOverflowMenuItem[];
};

type ChannelOverflowMenuContextValue = {
    visible: boolean;
    anchorLeft: number;
    anchorWidth: number;
    anchorTop: number;
    items: ChannelOverflowMenuItem[];
    openChannelOverflowMenu: (args: OpenChannelOverflowMenuArgs) => void;
    closeChannelOverflowMenu: () => void;
};

const ChannelOverflowMenuContext = createContext<ChannelOverflowMenuContextValue | undefined>(undefined);

export function ChannelOverflowMenuProvider({children}: {children: React.ReactNode}) {
    const [visible, setVisible] = useState(false);
    const [anchorLeft, setAnchorLeft] = useState(0);
    const [anchorWidth, setAnchorWidth] = useState(0);
    const [anchorTop, setAnchorTop] = useState(0);
    const [items, setItems] = useState<ChannelOverflowMenuItem[]>([]);

    const openChannelOverflowMenu = useCallback((args: OpenChannelOverflowMenuArgs) => {
        setAnchorLeft(args.anchorLeft);
        setAnchorWidth(args.anchorWidth);
        setAnchorTop(args.anchorTop);
        setItems(args.items);
        setVisible(true);
    }, []);

    const closeChannelOverflowMenu = useCallback(() => {
        setVisible(false);
    }, []);

    const value: ChannelOverflowMenuContextValue = {
        visible,
        anchorLeft,
        anchorWidth,
        anchorTop,
        items,
        openChannelOverflowMenu,
        closeChannelOverflowMenu,
    };

    return (
        <ChannelOverflowMenuContext.Provider value={value}>
            {children}
        </ChannelOverflowMenuContext.Provider>
    );
}

export function useChannelOverflowMenu(): ChannelOverflowMenuContextValue {
    const context = useContext(ChannelOverflowMenuContext);
    if (context === undefined) {
        throw new Error('useChannelOverflowMenu must be used within a ChannelOverflowMenuProvider');
    }
    return context;
}
