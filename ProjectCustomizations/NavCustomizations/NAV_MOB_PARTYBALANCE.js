function _NAV_MOB_PARTYBALANCEExtensionCust() {

    this.getRequiredNavFields = function (context) {
        context.neededFields["DTEDOC"] = 1;
        context.neededFields["DTEEXPIRE"] = 1;
        context.neededFields["CODTYPDOC"] = 1;
    };

    this.getCustomNavFields = function (context) {
        var fields = [];

        var openInvoicesBalances = {};
        var openInvoices = XNavHelper.getFromMemoryCache("NAV_MOB_PARTYBALANCE");
        if (openInvoices && openInvoices.length) {
            openInvoicesBalances = CommonEngineCust.calculateOpenInvoicesBalances(openInvoices.Rows);
        }

        fields.push({
            name: "INVOICE_ID_LABEL",
            convert: function (v, rec) {
                return UserContext.tryTranslate("[INVOICE_ID_LABEL]");
            }
        });
        fields.push({
            name: "INVOICE_DATE_LABEL",
            convert: function (v, rec) {
                return UserContext.tryTranslate("[INVOICE_DATE_LABEL]");
            }
        });
        fields.push({
            name: "DUE_DATE_LABEL",
            convert: function (v, rec) {
                return UserContext.tryTranslate("[DUE_DATE_LABEL]");
            }
        });
        fields.push({
            name: "AMOUNT_LABEL",
            convert: function (v, rec) {
                return UserContext.tryTranslate("[AMOUNT_LABEL]");
            }
        });
        fields.push({
            name: "BALANCE_LABEL",
            convert: function (v, rec) {
                return UserContext.tryTranslate("[BALANCE_LABEL]");
            }
        });
        fields.push({
            name: "VALABBUONO",
            convert: function (v, rec) {
                var openInvoiceBalance = openInvoicesBalances[rec.get("NUMDOC")];
                var openInvoiceBalanceVal = openInvoiceBalance.get("VALABBUONO");
                var balanceFormatString = "###,###,###,##0.00";
                return UserContext.formatNumber(openInvoiceBalanceVal, balanceFormatString);
            }
        });
        fields.push({
            name: "PAYMENTCOMPLETED",
            convert: function (v, rec) {
                var openInvoiceBalance = openInvoicesBalances[rec.get("NUMDOC")];
                if (openInvoiceBalance) {
                    if (openInvoiceBalance.get("VALABBUONO") == 0) {
                        return true;
                    }
                }
                return false;
            }
        });

        return fields;
    };

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on PARTYBALANCE navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };
}
XApp.registerNavigatorExtensionCust("NAV_MOB_PARTYBALANCE", new _NAV_MOB_PARTYBALANCEExtensionCust());