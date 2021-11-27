function _NAV_MOB_PENDING_ACTExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on PENDING ACT navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_PENDING_ACT", new _NAV_MOB_PENDING_ACTExtensionCust());