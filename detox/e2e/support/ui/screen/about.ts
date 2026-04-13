// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {SettingsScreen} from '@support/ui/screen';
import {timeouts} from '@support/utils';
import {expect} from 'detox';

class AboutScreen {
    testID = {
        aboutScreen: 'about.screen',
        backButton: 'screen.back.button',
        scrollView: 'about.scroll_view',
        logo: 'about.logo',
        siteName: 'about.site_name',
        title: 'about.title',
        subtitle: 'about.subtitle',
        cardTitle: 'about.card.title',
        appVersionTitle: 'about.app_version.title',
        appVersionValue: 'about.app_version.value',
        buildNumberTitle: 'about.build_number.title',
        buildNumberValue: 'about.build_number.value',
        copyInfoButton: 'about.copy_info',
        copyright: 'about.copyright',
    };

    aboutScreen = element(by.id(this.testID.aboutScreen));
    backButton = element(by.id(this.testID.backButton));
    scrollView = element(by.id(this.testID.scrollView));
    logo = element(by.id(this.testID.logo));
    siteName = element(by.id(this.testID.siteName));
    title = element(by.id(this.testID.title));
    subtitle = element(by.id(this.testID.subtitle));
    cardTitle = element(by.id(this.testID.cardTitle));
    appVersionTitle = element(by.id(this.testID.appVersionTitle));
    appVersionValue = element(by.id(this.testID.appVersionValue));
    buildNumberTitle = element(by.id(this.testID.buildNumberTitle));
    buildNumberValue = element(by.id(this.testID.buildNumberValue));
    copyInfoButton = element(by.id(this.testID.copyInfoButton));
    copyright = element(by.id(this.testID.copyright));

    toBeVisible = async () => {
        await waitFor(this.aboutScreen).toExist().withTimeout(timeouts.TEN_SEC);

        return this.aboutScreen;
    };

    open = async () => {
        await SettingsScreen.aboutOption.tap();

        return this.toBeVisible();
    };

    back = async () => {
        await this.backButton.tap();
        await expect(this.aboutScreen).not.toBeVisible();
    };
}

const aboutScreen = new AboutScreen();
export default aboutScreen;
