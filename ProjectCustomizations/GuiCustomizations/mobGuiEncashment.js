//#region _mobGuiEncashmentExtensionCust

function _mobGuiEncashmentExtensionCust() {

    this._isCashCustomer = function (codParty) {
        var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey("Customer|" + codParty);
        if (customer == null)
            return false;

        var codPayMode = customer.get("CODPAYMOD");
        if (!XApp.isEmptyOrWhitespaceString(codPayMode)) {
            return !UserContext.getRefdatValue("CPMOD", codPayMode, "ISCREDIT");
        }
        return false;
    }

    this.afterCardFieldCreation = function (field, context) {

        var self = this;
        var fieldName = context.fieldConfig.attrs["name"];
        var sectionName = context.sectionContext.config.attrs["caption"];
        var isEntityNew = context.sectionContext.entity.isNew;

        //call base product implementation
        if (self.base)
            self.base.afterCardFieldCreation(field, context);

        if (sectionName == "MAIN_INFO" && fieldName == "CODPARTY" && isEntityNew)
            field.showNewButton = false;

        return field;
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        switch (fieldName) {
            case "CODTYPPAY":
                //filter available payment types according to OPTINFO configuration
                var depositType = fieldContext.sectionContext.document.get("CODTYPDEP");

                if (this._isCashCustomer(this.base._encashment.get("CODPARTY"))) {
                    var newVoices = [];
                    newVoices.push({
                        value: "", text: ""
                    });

                    if (this.base) {
                        for (var codTabRow in this.base._typay) {
                            var row = this.base._typay[codTabRow];
                            if (((depositType == CommonNameSpace.DepositType.Bank && this.base._getTyPayFlag(codTabRow, 0)) ||
                                (depositType == CommonNameSpace.DepositType.Post && this.base._getTyPayFlag(codTabRow, 1))) &&
                                this.base._isCashPayment(codTabRow))
                                newVoices.push({ value: codTabRow, text: row.des });
                        }
                    }
                    fieldContext["voices"] = newVoices;
                    break;
                }

                if (this.base)
                    fieldContext["voices"] = this.base._getAvailablePaymentTypes(depositType);

                break;
        }
    };

   
    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.preNewDocument = function (gui) {
        //validate arguments
        var b = this.base.preNewDocument(gui);

        //Generate new key field Z_IDENC
        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild:
                    {
                        //Generate new key field Z_IDENC -- Nuova versione 7.0 TABLE t092ENCASHMENT colum called IDENC not Z_IDENC MADY 20190621
                      //  this.base._encashment.set("Z_IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        this.base._encashment.set("IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        
                        break;
                    }
            }
        }

        return b;
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.afterLoadDocument = function (gui) {
        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {

                        //TODO
                        //If encashment and deposit exists for same customer same date
                        //Use that encashment and open gui in read -only mode.
                        //Lock fields codparty and dteenc - done is setfieldstatus
                        //this._loadExistingEncashment(gui);

                        //Search for existing encashment for same customer and date
                        //If it exists use that one else create a new default one
                        var deposit = gui.getDocument();
                        gui.openData.customData.iddep = deposit.get("IDDEP");

                        //Always create new encashment- DO not reuese existing one
                        this.base._encashment = this.base._createNewEncashment(gui);

                        //Generate new key field Z_IDENC -- IDENC
                       // this.base._encashment.set("Z_IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        this.base._encashment.set("IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        
                        return; //skip base implementation
                    }
                default:
                    {
                        //In this situation encashment should already be present in the deposit document
                        this._loadExistingEncashmentCust(gui);
                        break;
                    }
            }
        }

    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this._loadExistingEncashmentCust = function (gui) {
        var deposit = gui.getDocument();
        this.base._encashment = deposit.getSubEntityStore("Encashment").findBy(
            function (entity) {
                return entity.get("CODUSR") == gui.openData.customData.codusr &&
                    entity.get("CODDIV") == gui.openData.customData.coddiv &&
                    entity.get("IDDEP") == gui.openData.customData.iddep &&
                    entity.get("IDENC") == gui.openData.customData.z_idenc &&
                    entity.get("CODPARTY") == gui.openData.customData.codparty &&
                    entity.get("DTEENC") - gui.openData.customData.dteenc == 0;

            });
        return this.base._encashment;
    }

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.validateDocument = function (gui) {
        var detailContext = gui.detailCtrl;
        var isValid = true;
        var invalidFields = [];

        //Do not validate duplicate encashment for same day same codparty
        if (XApp.isEmptyOrWhitespaceString(this.base._encashment.get("CODPARTY"))) {
            isValid = false;
            invalidFields.push("CODPARTY");
        }

        if (this.base._encashment.get("VALENC") <= 0) {
            isValid = false;
            this.base._isSaveValidation = true;
        }

        if (!this.base._isEncashmentDateValid(this.base._encashment.get("DTEENC"))) {
            isValid = false;
            invalidFields.push("DTEENC");
        }

        if (!this.base._isAllowanceValid(this.base._encashment.get("ALLOWANCE"))) {
            isValid = false;
        }

        if (!this.base._isNotMatchedValid(this.base._encashment.get("NOTMATCHED"))) {
            isValid = false;
        }

        if (!this.base._checkMaxCashVal(this.base._encashment))
            isValid = false;

        if (!isValid && detailContext) {
            for (var i = 0, n = invalidFields.length; i < n; i++) {
                var f = detailContext.fields[invalidFields[i]];
                if (f) {
                    f.fieldContext.isValid = false;
                }
            }
            detailContext.setFieldsStatus();
            if (gui.errorReports.CASH)
                gui.errorReports.CASH.caption = UserContext.tryTranslate("[MOB.MAX_CASH_EXCEEDED]") + DepositParameters.getInstance().getEncMaxCashVal();
        }

        return isValid;
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.setFieldStatus = function (context) {
        var entityName = context.sectionContext.entityName;

        switch (entityName) {
            case "Encashment":
                var fieldName = context.field.getName();
                switch (fieldName) {
                    case "CODPARTY":
                        {
                            context.editable = this.base._encashment.isNew && (!context.gui.gui.openData.customData || context.gui.gui.openData.customData.encashmentGuiOpenMode != CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild);
                            //Do not validate duplicate encashment for same customer and day
                            return;
                        }
                }
                break;
        }
        this.base.setFieldStatus(context);
    }

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.afterNewDocument = function (gui) {

        this.base.afterNewDocument(gui);

        var deposit = gui.getDocument();
        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {
                        //Generate new key field Z_IDENC
                      //  this.base._encashment.set("Z_IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        this.base._encashment.set("IDENC", XApp.newUserGUID(this.base._encashment.get("CODUSR")));
                        
                        break;
                    }
            }
        }
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.newDetail = function (context) {
        
        this.base.newDetail(context);

        var entity = context.newEntity;
        var detEntityName = context.detailEntityName;
        switch (detEntityName) {
            case "EncashmentRow":
                entity.set("IDENC", this.base._encashment.get("IDENC"));
               // entity.set("Z_IDENC", this.base._encashment.get("IDENC"));
                break;
        }
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.onSaveDocument = function (gui, document, onSuccess) {
        var self = this;

        var idenc = this.base._encashment.get("IDENC");
        this.base._encashment.getSubEntityStore("EncashmentRow").each(function (row) {
            row.set("IDENC", idenc);
           // row.set("Z_IDENC", idenc);
        });

        this.base._encashment.getSubEntityStore("EncashmentBalance").each(function (row) {
            row.set("IDENC", idenc);
          //  row.set("Z_IDENC", idenc);
        });

        if (this.base._removeEncashmentOnSave) {

            document.getSubEntityStore("Encashment").remove(this.base._encashment);

        } else {

            this.base._cleanupEncashment();
            this.base._setProgressives();

            var notMatched = this.base._encashment.get("NOTMATCHED");
            if (notMatched > 0) {
                this.base._addDefaultBalance(notMatched);
                this.base._calculateEncashmentFields();

                this.base._encashment.getSubEntityStore("EncashmentBalance").each(function (row) {
                    row.set("IDENC", idenc);
                   // row.set("Z_IDENC", idenc);
                });
            }

            //workaround for correctly opening encashment UI after returning from another UI
            gui.openData.customData.codparty = this.base._encashment.get("CODPARTY");
            gui.openData.customData.dteenc = this.base._encashment.get("DTEENC");
            gui.openData.customData.z_idenc = this.base._encashment.get("IDENC");
        }
        CommonEngine.calculateDeposit(document);

        //Uses flag _removeEncashmentOnSave
        this._updateEncBalNavDataCust(function () {
            //Now we can reset the flag. 
            self.base._removeEncashmentOnSave = undefined;
            self.base._encashment.isNew = false;

            if (onSuccess)
                onSuccess();
        });
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    //updates encashment balance navigator
    this._updateEncBalNavDataCust = function (onSuccess) {
        var balancesTable = XNavHelper.getFromMemoryCache("NAV_MOB_ENCBALANCE");
        if (balancesTable == null)
            return;

        if (this.base._removeEncashmentOnSave) {
            var constraints = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("CODUSR", "=", this.base._encashment.get("CODUSR")),
                    new XConstraint("CODDIV", "=", this.base._encashment.get("CODDIV")),
                    new XConstraint("IDDEP", "=", this.base._encashment.get("IDDEP")),
                    new XConstraint("IDENC", "=", this.base._encashment.get("IDENC"))
                ]
            });
            var rows = XNavHelper.getNavRecords("NAV_MOB_ENCBALANCE", constraints);
            if (rows) {
                for (var i = 0; i < rows.length; i++) {
                    balancesTable.removeRow(rows[i]);
                }
            }

        } else {
            var flgProcessed = this.base._encashment.get("FLGPROCESSED") || false;
            var encBals = this.base._encashment.getSubEntityStore("EncashmentBalance");
            for (var i = 0, l = encBals.getCount() ; i < l; i++) {
                var encBal = encBals.getAt(i);

                var row = balancesTable.newRow();
                for (var iName = 0; iName < balancesTable.Columns.length; iName++) {
                    var name = balancesTable.Columns[iName].Name;
                    var value = encBal.get(name);
                    if (value == undefined)
                        continue;
                    row.setValueByName(name, value);
                }
                row.setValueByName("FLGPROCESSED", flgProcessed);
                row.setValueByName("IDSURVEY", this.base._encashment.get("IDSURVEY"));
                row.setValueByName("IDDEP", this.base._encashment.get("IDDEP"));
                row.setValueByName("IDENC", this.base._encashment.get("IDENC"));

                balancesTable.Rows.unshift(row);
            }
        }

        XNavHelper.updateCache("NAV_MOB_ENCBALANCE", balancesTable, function (e) {

            XUI.showExceptionMsgBox(e);

            if (onSuccess)
                onSuccess();

        }, onSuccess);
    };
};

XApp.registerGuiExtensionCust("mobGuiEncashment", new _mobGuiEncashmentExtensionCust());
//#endregion