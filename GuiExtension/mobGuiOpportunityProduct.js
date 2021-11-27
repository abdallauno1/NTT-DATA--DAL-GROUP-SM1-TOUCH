//#region _mobGuiOpportunityProductExtension
function _mobGuiOpportunityProductExtension() {

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        return doc.get("DESART");
    };
}
XApp.registerGuiExtension("mobGuiOpportunityProduct", new _mobGuiOpportunityProductExtension());
//#endregion