function _NAV_MOB_DEPOSITExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on DEPOSIT navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
};
XApp.registerNavigatorExtensionCust("NAV_MOB_DEPOSIT", new _NAV_MOB_DEPOSITExtensionCust());
