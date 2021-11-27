//#region _NewCustomerExtensionCust

function _NewCustomerExtensionCust() {

    this.getQtabsVoices = function (fieldContext) {
        var allRightsDisabled = UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_INVOICE") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_SHIPTO") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_SHIPTO_INVOICE") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_POS") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_SHIPTO_POS") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_SHIPTO_INVOICE_POS") == false
                            && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_CONSUMER") == false;

        if (allRightsDisabled || UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "NEW_CONSUMER"))
            fieldContext.voices.push({ value: 'CONSUMER', text: UserContext.tryTranslate('[MOB.NEWCUSTOMER.CONSUMER]') });
    }

    this.afterTypeChange = function (gui, newVal) {
        switch (newVal) {
            case "CONSUMER":
                var viewItems = gui.view.getItems();
                for (var i = 0; i < viewItems.length; i++) {
                    if (viewItems.getAt(i).getId() != "newCustomerTypesFieldSet" &&
                        viewItems.getAt(i).getId() != "newCustomerToolbar")
                        viewItems.getAt(i).setHidden(true);
                }
                break;
        }
    }

    this.afterValidate = function (gui, newCustomerRequest, errMsg) {
        /*Allow creation of customer with empty VAT code*/
        if (newCustomerRequest.codVat == "" && errMsg == "[MOB.NEWCUSTOMER.ERR.NOPIVA]") {
            return { skip: false, errMsg: "" }
        }
    }
};

XApp.registerGuiExtensionCust("guiNewCustomer", new _NewCustomerExtensionCust());
//#endregion