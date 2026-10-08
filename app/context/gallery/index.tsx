// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

interface GalleryInitProps {
    children: JSX.Element;
    galleryIdentifier: string;
}

export function GalleryInit({children}: GalleryInitProps) {
    return children;
}
