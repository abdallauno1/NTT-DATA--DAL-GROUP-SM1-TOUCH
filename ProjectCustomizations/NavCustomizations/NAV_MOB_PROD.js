function _NAV_MOB_PRODExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on PROD navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_PROD", new _NAV_MOB_PRODExtensionCust());