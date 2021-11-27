//#region _mobGuiRouteExtension
function _mobGuiRouteExtensionCust() {
    this.afterSectionCreated = function (context) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.afterSectionCreated(context);

        if (context.sectionConfig.attrs["name"] == "editRoutePopup_customerSection") {
            var entitySelector = context.detailGui.fields.CODPARTY;
            entitySelector.showNewButton = false;
        }
    }
};
XApp.registerGuiExtensionCust("mobGuiRoute", new _mobGuiRouteExtensionCust());
//#endregion