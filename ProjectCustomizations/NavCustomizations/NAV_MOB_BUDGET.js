function _NAV_MOB_BUDGETExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on BUDGET navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_BUDGET", new _NAV_MOB_BUDGETExtensionCust());