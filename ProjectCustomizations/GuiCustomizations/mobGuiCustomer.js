//#region _mobGuiCustomerExtensionCust

function _mobGuiCustomerExtensionCust() {

    this.ResearchCenterDivisions = ["RES"];

    //Return true if the customer is a "credit" customer.
    this._isCreditCustomer = function (customer) {
        if (!customer)
            return false;

        var codPayMode = customer.get("CODPAYMOD");
        if (!XApp.isEmptyOrWhitespaceString(codPayMode)) {
            return UserContext.getRefdatValue("CPMOD", codPayMode, "ISCREDIT");
        }

        return false;
    };

    this.setFieldStatus = function (context) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.setFieldStatus(context);

        //ENH 34390: Different system behaviour in edit for different customer type (credit / cash customers)
        /*
         * 1. For CASH Customer : 
         *  - all fields are editable based on configuration
         *  - fields populated by the system (like customer code) are read-only
         *  - payment modality field is read-only
         * 2. For CREDIT Customer:
         *  - same as above plus all fields managed by ERP are read-only:  
         *  
         * ! Payment modality field is always read-only when editing and existing customer.
         */

        var customer = context.gui.gui.getDocument();
        var cdiv = customer.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });

        if (context.gui.gui.isEditable() && context.gui.gui.openMode != 'NEW' && cdiv && cdiv.get("CODSTATUS") == "0") {

            var fieldName = context.field.getName();

            //Payment modality field is always read-only when editing and existing customer.
            if (fieldName == "CODPAYMOD") {
                context.editable = false;
                return;
            }

            var entityName = context.field.fieldContext.sectionContext.entityName;

            if (self._isCreditCustomer(customer)) {
                switch (entityName) {
                    case "Customer":
                        switch (fieldName) {
                            //CODPARTY - automatically popuplated. disabled by configuration. Enforce configuration.
                            case "CODPARTY":
                                //DESPARTY1 - IMPORTED FROM SAGE. must be disabled for credit customer
                            case "DESPARTY1":
                                //FLGCUSTDELIV - IMPORTED FROM SAGE. automatically popuplated. Enforce configuration in customization. Must be set visible and always read-only in UI configuration. 
                            case "FLGCUSTDELIV":
                                //FLGCUSTSALE - IMPORTED FROM SAGE. automatically popuplated. Enforce configuration in customization. Must be  set visible and always read-only in UI configuration.
                            case "FLGCUSTSALE":
                                //FLGCUSTINV - IMPORTED FROM SAGE. automatically popuplated.  Enforce configuration in customization. Must be set visible and always  read-only in UI configuration.
                            case "FLGCUSTINV":
                                //FLGCUSTWHS -IMPORTED FROM SAGE. automatically popuplated.  Enforce configuration in customization. Must be set visible and always  read-only in UI configuration.
                            case "FLGCUSTWHS":
                                //FLGCUSTVAN - IMPORTED FROM SAGE. automatically popuplated. Enforce configuration in customization. Must be set visible and always  read-only in UI configuration.
                            case "FLGCUSTVAN":
                                //Z_FLGCONSUMER - IMPORTED FROM SAGE. automatically popuplated.  Enforce configuration in customization. Must be set visible and always  read-only in UI
                            case "Z_FLGCONSUMER":
                                //CODCUSTINV -  IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "CODCUSTINV":
                                //  CODCUR - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "CODCUR":
                                //CODVAT - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "CODVAT":
                                //CODCUSTDELIV - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "CODCUSTDELIV":
                                context.editable = false;
                                break;
                        }
                        break;
                    case "CustomerDiv":
                        switch (fieldName) {
                            //CODSTATUS - automatically popuplated/imported from sage. already disabled. . Enforce configuration.
                            case "CODSTATUS":
                                //CODCATDIV1 - IMPORTED FROM SAGE.  must be disabled for credit customer
                            case "CODCATDIV1":
                                context.editable = false;
                                break;
                        }
                        break;
                    case "CustomerBank":
                        switch (fieldName) {
                            //   CODPAYTRM - IMPORTED FROM SAGE. must be disabled for credit customer
                            case "CODPAYTRM":
                                //CODVATMGMT - IMPORTED FROM SAGE. must be disabled for credit customer
                            case "CODVATMGMT":
                                context.editable = false;
                                break;
                        }
                        break;
                    case "CustomerAmount":
                        switch (fieldName) {
                            // VALCREDIT - IMPORTED FROM SAGE.Must be disabled for credit customer
                            case "VALCREDIT":
                                //VALNOTMATURED   - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "VALNOTMATURED":
                                // DTEVALIDCREDIT - IMPORTED FROM SAGE. Not present in UI but if set Must be disabled for credit customer
                            case "DTEVALIDCREDIT":
                                context.editable = false;
                                break;
                        }
                        break;
                    case "CustomerPdvPdc":
                        switch (fieldName) {
                            //CODCUSTDELIV - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "CODCUSTDELIV":
                                //FLGPRIMARY - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "FLGPRIMARY":
                                //FLGANN -IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "FLGANN":
                                //DTEFROM/DTETO - IMPORTED FROM SAGE. Must be disabled for credit customer
                            case "DTEFROM":
                            case "DTETO":
                                context.editable = false;
                                break;
                        }
                        break;
                }
            }
        }
    };

    this.setNewButtonsStatus = function (context) {

        var self = this;

        //call base product implementation
        if (self.base)
            self.base.setNewButtonsStatus(context);

        //ENH 34390: Different system behaviour in edit for different customer type (credit / cash customers)
        if (context.gui.isEditable() && context.gui.openMode != 'NEW') {
            var customer = context.gui.getDocument();
            if (self._isCreditCustomer(customer))
                switch (context.detailEntityName) {
                    //Disable the posibility to add/remove records
                    case "CustomerPdvPdc":
                        context.visible = false;
                        break;
                }
        }
    };

    this.preFillSection = function (sectionContext) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.preFillSection(sectionContext);

        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "NON_CONSUMER_INFO":
            case "CONSUMER_INFO_DIVISION":
                sectionContext.entityName = 'CustomerDiv';
                var e = self.base._ensureCustomerDiv(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "CONSUMER_INFO_ADDRESS":
                sectionContext.entityName = 'CustomerAddr';
                var e = sectionContext.entity.getSubEntityStore('CustomerAddr').getAt(0);
                if (e == undefined || e == null) {
                    e = new XEntity({ entityName: 'CustomerAddr' });
                    e.set("CODPARTY", sectionContext.entity.get("CODPARTY"));
                    e.set("CODADDR", "1");
                    sectionContext.entity.getSubEntityStore('CustomerAddr').add(e);
                }
                sectionContext.entity = e;
                break;
        }
    };

    this.afterGuiCreated = function (gui, options) {
        var rcTab = gui.tabSubDetailsByName["RESEARCH_CENTER"];
        if (rcTab) {
            if (Ext.Array.contains(this.ResearchCenterDivisions, UserContext.CodDiv)) {
                rcTab.tabConfig.attrs.visible = "true";

                var customerDiv = gui.getDocument().getSubEntityStore('CustomerDiv').findBy(function (r) {
                    return r.get("CODDIV") == UserContext.CodDiv;
                });
                if (customerDiv.get("Z_FLGCONSUMER"))
                    gui.tabPanel.setActiveItem(rcTab);
            }
            else
                rcTab.tabConfig.attrs.visible = "false";
        }
    };

    this.afterSectionCreated = function (context) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.afterSectionCreated(context);

        var panel = context.panel;
        var entity = context.detailGui.entity;
        var entityName = context.detailGui.entityName;

        switch (context.detailGui.tabName) {
            case "RESEARCH_CENTER":
                switch (context.sectionConfig.attrs["caption"]) {
                    case "NON_CONSUMER_INFO":
                        var customerDiv = null;
                        if (entityName == "Customer")
                            customerDiv = entity.getSubEntityStore('CustomerDiv').findBy(function (r) {
                                return r.get("CODDIV") == UserContext.CodDiv;
                            });
                        if (customerDiv && customerDiv.get("Z_FLGCONSUMER") == false)
                            panel.setHidden(false);
                        else
                            panel.setHidden(true);
                        break;
                    case "CONSUMER_INFO_MAIN":
                    case "CONSUMER_INFO_DIVISION":
                    case "CONSUMER_INFO_ADDRESS":
                        var customerDiv = null;
                        if (entityName == "Customer")
                            customerDiv = entity.getSubEntityStore('CustomerDiv').findBy(function (r) {
                                return r.get("CODDIV") == UserContext.CodDiv;
                            });
                        if (customerDiv && customerDiv.get("Z_FLGCONSUMER") == true)
                            panel.setHidden(false);
                        else
                            panel.setHidden(true);
                        break;
                }
                break;
        }
    }

    this.validateField = function (context) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.validateField(context);

        switch (context.field.fieldContext.sectionContext.entityName) {
            case "Customer":
                switch (context.field.config.name) {
                    case "DTEBIRTHDAY":
                        var dteBirthday = context.field.fieldContext.sectionContext.detailContext.fields.DTEBIRTHDAY.getValue();
                        var currentDate = new Date().setHours(0, 0, 0, 0);
                        if (dteBirthday >= currentDate) {
                            context.newVal = context.oldVal;
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.INVALID_DATE]") });
                        }
                        break;
                }
                break;
        }
    }

    this.onEndEditEnded = function (ctrl, fieldName, newValue) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.onEndEditEnded(ctrl, fieldName, newValue);

        switch (fieldName) {
            case "Z_CONTACTEDBEFORE":
                var dteContacted = ctrl.fieldContext.sectionContext.detailContext.fields.Z_DTECONTACTED;
                if (!newValue) {
                    dteContacted.setValue(Constants.SM1MINDATE);
                }
                break;
        }
    }
};

XApp.registerGuiExtensionCust("mobGuiCustomer", new _mobGuiCustomerExtensionCust());
//#endregion
