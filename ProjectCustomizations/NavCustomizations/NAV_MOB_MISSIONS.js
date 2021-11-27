function _NAV_MOB_MISSIONSExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on MISSIONS navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}

XApp.registerNavigatorExtensionCust("NAV_MOB_MISSIONS", new _NAV_MOB_MISSIONSExtensionCust());