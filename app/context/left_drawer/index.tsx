// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useCallback, useContext, useState} from 'react';

type LeftDrawerContextValue = {
    isOpen: boolean;

    /** 汉堡图标底部在屏幕上的 Y 坐标，抽屉面板从此处开始显示 */
    hamburgerY: number;
    openDrawer: (y?: number) => void;
    closeDrawer: () => void;
};

const LeftDrawerContext = createContext<LeftDrawerContextValue | undefined>(undefined);

export function LeftDrawerProvider({children}: {children: React.ReactNode}) {
    const [isOpen, setIsOpen] = useState(false);
    const [hamburgerY, setHamburgerY] = useState(0);

    const openDrawer = useCallback((y?: number) => {
        if (y !== undefined) {
            setHamburgerY(y);
        }
        setIsOpen(true);
    }, []);

    const closeDrawer = useCallback(() => {
        setIsOpen(false);
    }, []);

    const value: LeftDrawerContextValue = {
        isOpen,
        hamburgerY,
        openDrawer,
        closeDrawer,
    };

    return (
        <LeftDrawerContext.Provider value={value}>
            {children}
        </LeftDrawerContext.Provider>
    );
}

export function useLeftDrawer(): LeftDrawerContextValue {
    const context = useContext(LeftDrawerContext);
    if (context === undefined) {
        throw new Error('useLeftDrawer must be used within a LeftDrawerProvider');
    }
    return context;
}
