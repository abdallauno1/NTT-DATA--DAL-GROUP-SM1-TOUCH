function _NAV_MOB_CONTACTSExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on CONTACTS navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_CONTACTS", new _NAV_MOB_CONTACTSExtensionCust());