// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useCallback, useContext, useState} from 'react';

export type PlusMenuItem = {
    icon: string;
    labelId: string;
    defaultLabel: string;
    onPress: () => void;
    testID: string;
};

export type PlusMenuSeparator = {
    type: 'separator';
};

export type PlusMenuEntry = PlusMenuItem | PlusMenuSeparator;

type OpenPlusMenuArgs = {
    anchorLeft: number;
    anchorWidth: number;
    anchorTop: number;
    items: PlusMenuEntry[];
};

type PlusMenuContextValue = {
    visible: boolean;
    anchorLeft: number;
    anchorWidth: number;
    anchorTop: number;
    items: PlusMenuEntry[];
    openPlusMenu: (args: OpenPlusMenuArgs) => void;
    closePlusMenu: () => void;
};

const PlusMenuContext = createContext<PlusMenuContextValue | undefined>(undefined);

export function PlusMenuProvider({children}: {children: React.ReactNode}) {
    const [visible, setVisible] = useState(false);
    const [anchorLeft, setAnchorLeft] = useState(0);
    const [anchorWidth, setAnchorWidth] = useState(0);
    const [anchorTop, setAnchorTop] = useState(0);
    const [items, setItems] = useState<PlusMenuEntry[]>([]);

    const openPlusMenu = useCallback((args: OpenPlusMenuArgs) => {
        setAnchorLeft(args.anchorLeft);
        setAnchorWidth(args.anchorWidth);
        setAnchorTop(args.anchorTop);
        setItems(args.items);
        setVisible(true);
    }, []);

    const closePlusMenu = useCallback(() => {
        setVisible(false);
    }, []);

    const value: PlusMenuContextValue = {
        visible,
        anchorLeft,
        anchorWidth,
        anchorTop,
        items,
        openPlusMenu,
        closePlusMenu,
    };

    return (
        <PlusMenuContext.Provider value={value}>
            {children}
        </PlusMenuContext.Provider>
    );
}

export function usePlusMenu(): PlusMenuContextValue {
    const context = useContext(PlusMenuContext);
    if (context === undefined) {
        throw new Error('usePlusMenu must be used within a PlusMenuProvider');
    }
    return context;
}
