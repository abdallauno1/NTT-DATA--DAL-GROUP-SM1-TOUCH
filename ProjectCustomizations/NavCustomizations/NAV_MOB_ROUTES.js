function _NAV_MOB_ROUTESExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on Routes navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_ROUTES", new _NAV_MOB_ROUTESExtensionCust());