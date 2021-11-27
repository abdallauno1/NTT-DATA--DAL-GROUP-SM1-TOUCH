//#region _mobGuiProductExtension
function _mobGuiProductExtension() {

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        var title = [doc.get("DESART"), doc.get("CODART")].join(" | ");
        if (!XApp.isEmptyOrWhitespaceString(doc.get("CODEAN13")))
            title += (" (") + doc.get("CODEAN13") + ") ";

        return title;
    };

    this.preCreateLink = function (context) {
        var linkRow = context.linkRow;
        var doc = context.ctrl.entity;
        switch (linkRow.type) {
            case "NAVLINKDASH":
                // setting initVars for the 'MOB_SP_DASH_PRODUCT' dashboard
                if (linkRow.dashName == "MOB_SP_DASH_PRODUCT") {
                    linkRow.filters = {
                        "CODART": doc.get("CODART")
                    };
                }
                break;
        }
    };
}
XApp.registerGuiExtension("mobGuiProduct", new _mobGuiProductExtension());
//#endregion