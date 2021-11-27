function _NAV_MOB_CONSIGNMENTSExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on CONSIGNMENTS navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_CONSIGNMENTS", new _NAV_MOB_CONSIGNMENTSExtensionCust());