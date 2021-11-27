function _NAV_MOB_ORDERSExtensionCust() {

    this.getNavMenuButtons = function (context) {
        // Add "refresh" button only for "Van Documents" navigator in full offline mode
        if (context.navCtrl && UserContext.isFullOfflineMode() && context.navCtrl.navId == "NAV_MOB_VANMOVEMENTS") {
            var refreshButton = context.navCtrl.createRefreshButton();
            if (refreshButton != null && context.buttons) {
                context.buttons.push(refreshButton);
            }
        }

        this.base.getNavMenuButtons(context);
    };

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on ORDER navigator (39097) - ignore case when navigator is "Van Documents" and mode is full offline
        if (context.navCtrl && UserContext.isFullOfflineMode() && context.navCtrl.navId == "NAV_MOB_VANMOVEMENTS")
            return;
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };

    this.beforeRefresh = function (context) {
        if (!XApp.isOnline()) {
            context.canceled = true;
            XUI.hideWait();
            XUI.showErrorMsgBox({
                msg: UserContext.tryTranslate("[MOB.CONN_NOT_AVAILABLE]")
            });
        }
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_ORDERS", new _NAV_MOB_ORDERSExtensionCust());
XApp.registerNavigatorExtensionCust("NAV_MOB_VANMOVEMENTS", new _NAV_MOB_ORDERSExtensionCust());