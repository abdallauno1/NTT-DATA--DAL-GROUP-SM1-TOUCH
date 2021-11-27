//#region _mobGuiDeposit
function _mobGuiDeposit() {

    //#region Custom

    this.preNewDocument = function (gui) {
        return this._checkHistory(gui);
    };

    this.preLoadDocument = function (context) {
        return this._checkHistory(context.gui);
    };

    /*Check if the user navigated back in history from a document that returned the deposit. If yes then use the returned deposit. */
    this._checkHistory = function (gui) {
        var actualConfig = XHistory.actualConfig();
        if (actualConfig.depositStore) {
            actualConfig.openMode = 'EDIT';
            gui.docStore = actualConfig.depositStore;
            gui.docKey = actualConfig.docKey;
            return false;
        }
        return true;
    };

    this.afterLoad = function (gui) {
        var self = this;
        SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
            if (openDay)
                self._openDayID = openDay.get("IDDAY");
        });
    };

    this.afterLoadDocument = function (gui) {
        gui.getDocument().getSubEntityStore("Encashment").removeBy(function (enc) {
            return !enc.isNew;
        });
    };

    this.afterSaveDocument = function (gui, document, onError, onSuccess) {
        if (document) {
            gui.setDocument(document);
        }
        CommonEngine.updateNavMobAttachmentsCust(document, onError, onSuccess);
    };

    this.beforeOpenSubDetailFromList = function (context) {
        var gui = context.ctrl.gui;

        var openEncashment = function () {
            //open encashment as main UI instead of detail UI
            XHistory.go({
                controller: app.getSM1Controllers().gui,
                action: "show",
                docName: "Deposit",
                //dockey - it's not needed. It will be read from customData.parentDocumentStore
                guiName: "mobGuiEncashment",
                navId: "NAV_MOB_DEPOSIT",
                openMode: "EDIT",
                customData: {
                    codusr: context.entity.get("CODUSR"),  //populated
                    coddiv: context.entity.get("CODDIV"), //populated
                    iddep: context.entity.get("IDDEP"), //populated
                    codparty: context.entity.get("CODPARTY"), //populated
                    dteenc: context.entity.get("DTEENC"), //populated
                    encashmentGuiOpenMode: CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild,
                    parentDocumentStore: gui.docStore, //contains deposit and new empty row
                },
                entityName: "Encashment"
            });
        };

        if (gui.docModified) {
            gui.saveDocNoConfirmation(openEncashment);
        }
        else {
            openEncashment();
        }

        return true;
    };

    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "Encashment":
                var deposit = context.gui.getDocument();
                context.enabled = context.gui.isEditable() && this._allowAddingEncashments && CommonEngine.canAddEncashments(deposit);
                break;
        }
    };

    this.preFillSection = function (sectionContext) {
        switch (sectionContext.entityName) {
            case "Deposit":
                if (sectionContext.config.attrs["caption"] == "GENERAL_DATA") {
                    CommonEngine.calculateDeposit(sectionContext.entity);
                }
                break;
        }
    };

    // Enh 39334 In all the amounts fields  collection deposit functionality, show the number of decimals defined for the currency (CUR.NUMDECIAMALS) using T090.CODCUR
    this.getCustomLayout = function (l, detailContext) {

        if (!detailContext.originalLayout)
            detailContext.originalLayout = l;
        var layout = Ext.clone(detailContext.originalLayout);

        var document = detailContext.gui.getDocument();
        var defaultNumberOfDecimals = 2;

        var formatString = SM1OrderHelper.getNumericFormat(document.get("CODDIV"), document.get("CODCUR"), defaultNumberOfDecimals);

        if (layout.attrs.baseObject == "Deposit") {
            //the main tab
            for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                var section = layout.children[idxSection];
                if (section.attrs.caption == "GENERAL_DATA") {
                    var columns = section.children;
                    for (var i = 0; i < columns.length; i++) {
                        switch (columns[i].attrs.name) {
                            case "CASH":
                            case "CHECK":
                            case "ELECTRONIC":
                            case "VALDEP":
                                columns[i].attrs.formatString = formatString;
                        }
                    }
                }
                if (section.attrs.caption == "ENCASHMENTS_GRID") {
                    var columns = section.children[0].children;
                    for (var i = 0; i < columns.length; i++) {
                        switch (columns[i].attrs.name) {
                            case "VALENC":
                                columns[i].attrs.formatString = formatString;
                        }
                    }
                }

            }
        }
        return layout;
    };

    this.afterSectionCreated = function (context) {
        var sectionConfig = context.sectionConfig;
        var sectionName = sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "ENCASHMENTS_GRID":
                //filter out cancelled encashments
                context.panel.grid.getStore().setFilters([
                    Ext.create('Ext.util.Filter',
                        {
                            filterFn: function (item) {
                                return item.xrec.get("FLGANN") != true;
                            },
                            root: 'data'
                        })
                ]);
                context.panel.grid.refresh();
                break;
            case "GENERAL_DATA":
                //moved from preFillSection, because it was doing the validation before creating the section
                //meaning before creating the fields to validate
                var previousWindow = XHistory.hist[XHistory.hist.length - 2];
                // if the deposit UI has been opened from close day hyperlink validate the empty mandatory fields
                if (previousWindow.shouldTryClosingDeposits != undefined && previousWindow.guiName == "mobGuiCloseDayActivity") {
                    var invalidFields = CommonEngine.validateFields(context.detailGui.entity, context.detailGui);
                }
                break;
        }
    };

    this.newDetail = function (context) {
        var self = this;
        var gui = context.gui;
        var docStore = gui.docStore;
        var entity = context.newEntity;
        var detEntityName = context.detailEntityName;
        var parentEntity = context.parentEntity;
        switch (detEntityName) {
            case "Encashment":
                var senchaStore = context.listStore;
                //before creating the first Encashment, save the deposit
                if (parentEntity.isNew) {
                    gui.saveDocNoConfirmation(function () {
                        var savedDocument = gui.getDocument();
                        parentEntity = savedDocument;
                        parentEntity.isNew = false;
                        context.parentEntity = savedDocument;

                        //the actual history configuration is that of a new Deposit
                        //update it, in order to display this Deposit and not a new one when the user returns from Encashment UI
                        var histConfig = XHistory.actualConfig();
                        if (histConfig) {
                            histConfig.docKey = savedDocument.get("DOCUMENTKEY");
                            histConfig.openMode = UserContext.checkRight(histConfig.navId, histConfig.navId, 'EDIT') ? 'EDIT' : 'VIEW';
                        }

                        CommonEngine.updateNavMobAttachmentsCust(savedDocument, XUI.showExceptionMsgBox, Ext.emptyFn);
                        self._openNewEncashment(gui, parentEntity, entity, senchaStore, docStore);
                    });
                }
                else {
                    this._openNewEncashment(gui, parentEntity, entity, senchaStore, docStore);
                }
                return true;
        }
        return false;
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        switch (fieldName) {
            case "CODABI":
                //load user's bank accounts
                fieldContext["voices"] = CommonEngine.getUserAccountsDecode();
                break;
        }
    };

    this.afterNewDocument = function (gui) {
        //moved logic in Deposit.postCreation
    };

    this.validateField = function (context) {
        var fieldName = context.field.fieldContext.fieldName;
        var deposit = context.field.fieldContext.sectionContext.entity;
        if (deposit.EncashmentDetailsStore.getCount() > 0 || deposit.get("CODSTATUS") == CommonNameSpace.DepositStatus.Opened)
            switch (fieldName) {
                case "CODCUR":
                case "CODSTATUS":
                case "CODTYPDEP":
                    return !XApp.isEmptyOrWhitespaceString(context.newVal);
            }
        return true;
    };

    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var fieldContext = context.field.fieldContext;
        var entity = fieldContext.sectionContext.entity;
        switch (fieldName) {
            case "DTEDEP":
                context.editable = entity.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed && context.editable;
                context.valid = !context.editable || (CommonEngine.isDepositDateValid(entity) && context.valid);
                break;
            case "CODTYPDEP":
                context.editable = entity.isNew && entity.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed && context.editable;
                context.valid = fieldContext.isValid != false && context.valid;
                context.valid = !context.editable || (context.valid && CommonEngine.isDepositTypeValid(entity));
                //allow adding new encashments only for valid deposit types
                this._allowAddingEncashments = context.valid;
                break;
            case "CODCUR":
                this._setCurrencyStatus(entity, context);

                if (context.editable) {
                    context.valid = fieldContext.isValid != false;
                }
                break;
            case "CODSTATUS":
                context.editable = entity.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed && context.editable;
                context.valid = !context.editable || (fieldContext.isValid != false && context.valid);
                break;
            case "DESNOTE":
            case "NUMDISTINTA":
            case "CODABI":
                context.editable = entity.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed && context.editable;
                context.valid = !context.editable || (fieldContext.isValid != false && context.valid);
                break;
        }
    };

    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {

        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;
        var entity = context.entity;

        switch (fieldName) {
            case "CODSTATUS":
                if (entity.EncashmentDetailsStore.getCount() > 0 || entity.get("CODSTATUS") == CommonNameSpace.DepositStatus.Opened) {
                    var invalidFields = CommonEngine.validateFields(entity, detailContext);
                    Ext.Array.each(Ext.Object.getKeys(context.gui.errorReports), function (a) {
                        if (invalidFields.indexOf(a) == -1) {
                            invalidFields.push(a);
                        }
                    });
                    if (invalidFields.length > 0) {
                        var msg = "";
                        for (var i = 0, n = invalidFields.length; i < n; i++) {
                            msg = msg.concat(UserContext.tryTranslate("[" + invalidFields[i] + "]"));
                            if (i != n - 1)
                                msg = msg + ", ";
                        }
                        msg = msg + ".";
                        XUI.showWarnOk({
                            title: UserContext.tryTranslate("[MOB.DEPOSIT.INVALID_FIELDS]"),
                            msg: UserContext.tryTranslate("[MOB.DEPOSIT.STATUS_CAN_NOT_CHANGE]") + msg
                        });
                        entity.set(fieldName, oldVal);
                    }
                }
                break;
            case "CODCUR":
                detailContext.layoutConfig = this.getCustomLayout(detailContext.layoutConfig, detailContext);
                detailContext.renderDetailGui(detailContext.mainPanel);
                break;
        }
    };

    this.onSaveDocument = function (gui, doc, onSuccess) {
        if (doc.EncashmentDetailsStore.getCount() == 0 && doc.get("CODSTATUS") == CommonNameSpace.DepositStatus.Closed) {
            if (doc.get("DTEDEP").getTime() == Constants.SM1MINDATE.getTime())
                doc.set("DTEDEP", new Date());

            if (XApp.isEmptyOrWhitespaceString(doc.get("CODCUR")))
                doc.set("CODCUR", gui.detailCtrl.fields.CODCUR.fieldContext.voices[1].value);
        }
        if (this._openDayID)
            doc.set("IDDAY", this._openDayID);
        onSuccess(); //continue save
    };

    this.validateDocument = function (gui) {
        delete gui.errorReports["CODCUR"];
        delete gui.errorReports["CODTYPDEP"];
        delete gui.errorReports["CODSTATUS"];
        delete gui.errorReports["DTEDEP"];
        delete gui.errorReports["NUMDISTINTA"];
        delete gui.errorReports["CODABI"];

        var deposit = gui.getDocument();
        var detailContext = gui.detailCtrl;
        var invalidFields = CommonEngine.validateFields(deposit, detailContext);
        var isValid = invalidFields.length == 0 && (!gui.errorReports || Ext.Object.getKeys(gui.errorReports).length == 0);

        for (var i in invalidFields) {
            var field = invalidFields[i];
            gui.errorReports[field] = {
                caption: UserContext.tryTranslate("[MOBGUIDEPOSIT." + field + "]")
            };
        }

        if (!isValid && detailContext) {
            // if the fields are mark as invalid because of a previous validation reset the state
            this._tryResetFieldState("NUMDISTINTA", invalidFields, detailContext);
            this._tryResetFieldState("CODABI", invalidFields, detailContext);

            detailContext.setFieldsStatus();
        }

        return isValid;
    };

    //#endregion

    //#region Private methods

    this._openNewEncashment = function (gui, deposit, encashment, encashmentsSenchaStore, docStore) {
        var openEncashment = function () {
            //open encashment as main UI instead of detail UI
            XHistory.go({
                controller: app.getSM1Controllers().gui,
                action: "show",
                //dockey - it's not needed. It will be read from customData.parentDocumentStore
                docName: "Deposit",
                guiName: "mobGuiEncashment",
                navId: "NAV_MOB_DEPOSIT",
                openMode: "NEW",
                customData: {
                    codusr: deposit.get("CODUSR"),
                    coddiv: deposit.get("CODDIV"),
                    iddep: deposit.get("IDDEP"),
                    encashmentGuiOpenMode: CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild,
                    parentDocumentStore: docStore, //contains deposit and new empty row
                },
                entityName: "Encashment"
            });
        };

        if (gui.docModified && gui.openMode != "NEW") {
            gui.saveDocNoConfirmation(openEncashment);
        }
        else {
            openEncashment();
        }
    };

    this._tryResetFieldState = function (fieldName, invalidFields, detailContext) {
        if (invalidFields.indexOf(fieldName) == -1) {
            var f = detailContext.fields[fieldName];
            if (f) {
                f.fieldContext.isValid = true;
            }
        }
    };

    this.afterNotifyLeave = function (context) {
        delete this._openDayID;
    };

    /// <summary>
    /// If at least one encashment, linked to an invoice and has CODCURORIG != empty 
    /// is present in the deposit, set the deposit currency field in ReadOnly
    /// </summary>
    this._setCurrencyStatus = function (deposit, currField) {
        var paidInvoiceWithCur = deposit.EncashmentDetailsStore.findBy(function (enc) {
            return enc.get("FLGANN") == 0 && enc.EncashmentBalanceDetailsStore.findBy(function (eb) {
                return !XApp.isEmptyOrWhitespaceString(eb.get("CODCURORIG"));
            }) != null;
        });

        if (paidInvoiceWithCur)
            currField.editable = false;
        else
            currField.editable = deposit.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed;
    };

    //#endregion
};
XApp.registerGuiExtension("mobGuiDeposit", new _mobGuiDeposit());
//#endregion