function _NAV_MOB_ATTACHMENTS_CUSTExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on attachments navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_ATTACHMENTS_CUST", new _NAV_MOB_ATTACHMENTS_CUSTExtensionCust());