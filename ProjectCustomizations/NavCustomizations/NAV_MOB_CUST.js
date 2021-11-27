function _NAV_MOB_CUSTExtensionCust() {


    this.getNavMenuButtons = function (context) {
        if (this.base && this.base.getNavMenuButtons)
            this.base.getNavMenuButtons(context);

        //CUSTOMIZATION 39096: DSD PROCESS - Customization - Remove "New" Customer
        if (context.navCtrl.options.panel && context.navCtrl.options.parentGui && !context.navCtrl.selector) {
            for (var i in context.buttons) {
                var btn = context.buttons[i];
                if (btn.code == "NEW") {
                    context.buttons.splice(i, 1);
                    break;
                }
            }
        }
    };

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on CUSTOMER navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_CUST", new _NAV_MOB_CUSTExtensionCust());