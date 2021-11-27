//#region _mobGuiEncashment
function _mobGuiEncashment() {

    //#region Custom
    this.getMenuButtons = function (context) {
        var self = this;
        var gui = context.ctrl;

        //REMOVE ENCASHMENT
        if (self._encashment && !self._encashment.isNew && gui.openMode != "VIEW" && CommonEngine.canRemoveEncashment(gui.getDocument())) {
            gui.removeEncashmentButton = {
                msg: UserContext.tryTranslate("[MOB.MOBGUIENCASHMENT.REMOVE]"),
                id: 'mobguiencashment-contextualmenu-remove',
                iconCls: 'guis_encashment_navbar_remove_payment_23',
                handler: (function (gui) {
                    return function () {
                        try {

                            var deposit = gui.getDocument();

                            var context = {
                                gui: gui,
                                deposit: deposit,
                                encashment: self._encashment,
                                canceled: false
                            };
                            XApp.callCust("guiCustomizer", "mobGuiEncashment", 'beforeRemoveEncashment', context);
                            if (context.canceled)
                                return;

                            //start validation and save process;
                            self._removeEncashmentOnSave = true;
                            gui.setModified(deposit);

                            gui.doBack();

                        } catch (e) {
                            XUI.showExceptionMsgBox(e);
                        }
                    };
                })(gui)
            };
            context.buttons.push(gui.removeEncashmentButton);
        }
    },

    this.beforeUiRendering = function (context) {
        //customizer level data
        var deposit = context.gui.getDocument();
        this._calcCashRow = deposit.get("CODTYPDEP") == CommonNameSpace.DepositType.Bank;
        if (!this._typay)
            this._typay = UserContext.getDecodeTable("TYPAY");

        //Reset customizer level flags
        this._removeEncashmentOnSave = undefined;
    };

    this.beforeGuiCreated = function (context, openData) {
        // when gui is opened with codparty sent from exterior
        // show the payment tab
        if (openData.customData.codparty) {
            openData.selectedTabName = "PAYMENT";
        }
    };

    this.afterLoad = function (gui) {
        //Gui is opened with codparty sent from exterior
        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {
                        if (this._encashment.isNew) {
                            this._loadEncashmentDetails(this._encashment.get("CODPARTY"), gui);
                        }
                        break;
                    }
            }
        }
    };

    this.getDocumentDescription = function (context) {
        return this._getPaymentTitle();
    };

    this.preNewDocument = function (gui) {

        //validate arguments
        this._validateGuiArguments(gui);

        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild:
                    {
                        //In this case we receive the Deposit from the caller.
                        gui.docStore = gui.openData.customData.parentDocumentStore;
                        this._setDocumentKey(gui.getDocument(), gui);

                        //create new encashment
                        this._encashment = this._createNewEncashment(gui);
                        return false;
                    }
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {
                        //new encashment: should accept 2 parameters: customer and cash date.
                        //if an open deposit is present the system has NOT to create the new deposit and link the encashment to the existing one. 
                        //If not present a deposit in OPEN STATUS, the system should automatically create a new deposit for the same day. 
                        var depositRow = null;
                        var navData = XNavHelper.getFromMemoryCache("NAV_MOB_DEPOSIT");
                        if (navData) {
                            for (var o = 0; o < navData.Rows.length; o++) {
                                if (navData.Rows[o].get("CODUSR") == gui.openData.customData.codusr &&
                                    navData.Rows[o].get("CODDIV") == gui.openData.customData.coddiv &&
                                    navData.Rows[o].get("CODTYPDEP") == CommonNameSpace.DepositType.Bank &&
                                    navData.Rows[o].get("CODSTATUS") == CommonNameSpace.DepositStatus.Opened) {
                                    depositRow = navData.Rows[o];
                                    break;
                                }
                            }
                        }

                        if (depositRow) {

                            //Switch to edit mode and tell gui that it should load the existing deposit , not create a new one
                            var actualConfig = XHistory.actualConfig();
                            actualConfig.openMode = 'EDIT';
                            this._setDocumentKey(depositRow, gui);
                            //Let gui load document and encashment will be loaded or created by  afterLoadDocument
                            return false; //false because we don't want to create a new document but load an existing one.
                        } else {
                            //create a new deposit 
                            return true; //let gui continue and create a new deposit and manage it in afterNewDocument
                        }
                    }
            }
        }

        return true;
    };

    //same as mobGuiDeposti.afterNewDocument
    this.afterNewDocument = function (gui) {

        var deposit = gui.getDocument();

        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {
                        //In this case the system did not find any open deposit and created a new one with default values.
                        deposit.set("CODTYPDEP", CommonNameSpace.DepositType.Bank); //this is the default to be used when creating from visit detail

                        //create also the new encashment
                        this._encashment = this._createNewEncashment(gui);
                        break;
                    }
            }
        }
    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionContext.entityName) {
            case "EncashmentRow":
                // we have section "PAYMENT" on both entities and behave differently
                switch (sectionName) {
                    case "ATTACHMENT":
                        if (sectionContext.entityName == "EncashmentRow") {
                            sectionContext.document = sectionContext.entity;
                            var sectionContextEditable = sectionContext.config.attrs["editable"];
                            sectionContext.config.attrs["editable"] = ((sectionContextEditable == undefined || sectionContextEditable == "true") && this._encashment.isNew && sectionContext.document.get("CODSTATUS") != CommonNameSpace.DepositStatus.Closed).toString();
                        }
                        break;
                }
                break;
            case "Deposit":
                switch (sectionName) {
                    case "MAIN_INFO":
                    case "PAYMENT":
                    case "ENCASHMENTROW_GRID":
                    case "ENCASHMENTBALANCE_GRID":
                        sectionContext.entityName = this._encashment.getEntityName();
                        sectionContext.entity = this._encashment;
                        if (sectionName == "MAIN_INFO" || sectionName == "PAYMENT")
                            this._calculateEncashmentFields(sectionContext.gui);
                }
                break;
        }
    };

    this.preLoadDocument = function (context) {
        //validate arguments
        this._validateGuiArguments(context.gui);
        var gui = context.gui;
        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild:
                    {
                        //In this case parent deposit is always passed from deposit gui
                        gui.docStore = gui.openData.customData.parentDocumentStore;
                        this._setDocumentKey(gui.getDocument(), gui);
                        return false;
                    }
                case CommonNameSpace.EncashmentGuiOpenMode.EncashmentReadOnly:
                    {
                        //In this case the caller should have provided the deposit key and encashment key
                        var depositRow = null;
                        var navData = XNavHelper.getFromMemoryCache("NAV_MOB_DEPOSIT");
                        if (navData) {
                            for (var o = 0; o < navData.Rows.length; o++) {
                                if (navData.Rows[o].get("CODUSR") == gui.openData.customData.codusr &&
                                    navData.Rows[o].get("CODDIV") == gui.openData.customData.coddiv &&
                                    navData.Rows[o].get("IDDEP") == gui.openData.customData.iddep) {
                                    depositRow = navData.Rows[o];
                                    break;
                                }
                            }
                        }

                        if (depositRow) {
                            this._setDocumentKey(depositRow, gui);
                        }
                        return true;   //let gui load deposit
                    }
            }
        }
        return true;
    };

    this.afterLoadDocument = function (gui) {

        if (gui.openData.customData) {
            switch (gui.openData.customData.encashmentGuiOpenMode) {
                case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                    {
                        //Search for existing encashment for same customer and date
                        //If it exists use that one else create a new default one
                        var deposit = gui.getDocument();
                        gui.openData.customData.iddep = deposit.get("IDDEP");

                        //If encashment and deposit exists for same customer same date
                        //Use that encashment and open gui in read -only mode.
                        //Lock fields codparty and dteenc - done is setfieldstatus
                        this._loadExistingEncashment(gui);

                        //If Encashment not found - create a new one        
                        if (!this._encashment) {
                            //create new encashment
                            this._encashment = this._createNewEncashment(gui);
                        }
                        else {
                            // Bug 38916 set docModified = false so the saving popup won't show on exit
                            gui.clearModified();
                        }
                        break;
                    }
                default:
                    {
                        //In this situation encashment should already be present in the deposit document
                        this._loadExistingEncashment(gui);
                        break;
                    }
            }
        }

    };

    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "EncashmentBalance":
                //EncashmentBalance cannot be added
                context.visible = false;
                break;
            case "EncashmentRow":
                context.enabled = this._encashment.isNew &&
                                 !XApp.isEmptyOrWhitespaceString(this._encashment.get("CODPARTY")) &&
                                  this._canAddEncashmentRow;
                break;
        }
    };

    this.setRemoveButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "EncashmentBalance":
                //EncashmentBalance cannot be removed
                context.visible = false;
                break;
            case "EncashmentRow":
                context.enabled = this._encashment.isNew;
                break;
        }
    };

    //update cash row, if necessary
    this.beforeRemoveDetail = function (context) {
        var entity = context.detailEntity;
        if (entity.getEntityName() != "EncashmentRow" ||
            this._isCashPayment(entity.get("CODTYPPAY")))
            return;

        if (this._updateCashRow(entity)) {
            var encRows = this._encashment.getSubEntityStore("EncashmentRow");
            encRows.remove(entity);
            this._rebindEncRowsGridStore(context.gui.gui);
        }
    };

    this.beforeOpenSubDetailFromList = function () {
        var actualConfig = XHistory.actualConfig();
        if (actualConfig.entityName)
            actualConfig.entityName = undefined;
        return false;
    };

    this.afterCloseHandler = function (context) {
        var options = context.opt;
        var ctrl = context.ctrl;
        var detailEntity = ctrl.entity;
        var entityName = detailEntity.getEntityName();
        if (options.reason == "CANCEL") {
            switch (entityName) {
                case "EncashmentRow":
                    //remove error reports
                    for (var fieldName in ctrl.fields)
                        delete ctrl.gui.errorReports[fieldName];
                    break;
                case "EncashmentBalance":
                    if (this._updateCashRow() && ctrl.parentCtrl) {
                        this._rebindEncRowsGridStore(context.ctrl.gui);
                    }
                    break;
                default:
                    break;
            }

            return;
        }
        else {
            if (entityName == "EncashmentRow") {
                this._rebindEncRowsGridStore(context.ctrl.gui);
            }
        }

        var parentCtrl = ctrl.parentCtrl;

        switch (entityName) {
            case "EncashmentRow":
                if (!options.canceled && options.modified &&
                this._isCashPayment(detailEntity.get("CODTYPPAY")) && detailEntity.get("VALENC") > 0)
                    this._calcCashRow = false;
                this._calculateEncashmentValue();
                this._calculateEncashmentFields(context.ctrl.gui);
                parentCtrl.refreshControls();
                parentCtrl.setFieldsStatus();
                break;
            case "EncashmentBalance":
                this._calculateEncashmentValue();
                this._calculateEncashmentFields(context.ctrl.gui);
                parentCtrl.refreshControls();
                parentCtrl.setFieldsStatus();
                break;
        }
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        switch (fieldName) {
            case "CODTYPPAY":
                //filter available payment types according to OPTINFO configuration
                var depositType = fieldContext.sectionContext.document.get("CODTYPDEP");
                fieldContext["voices"] = this._getAvailablePaymentTypes(depositType);
                break;
        }
    };

    this.newDetail = function (context) {
        var actualConfig = XHistory.actualConfig();
        if (actualConfig.entityName)
            actualConfig.entityName = undefined;

        var entity = context.newEntity;
        var detEntityName = context.detailEntityName;
        var parentEntity = context.parentEntity;
        switch (detEntityName) {
            case "EncashmentRow":
                //set defaults from encashment
                entity.set("IDENC", this._encashment.get("IDENC"));
                entity.set("IDDEP", this._encashment.get("IDDEP"));
                //set default payment type
                var depositType = parentEntity.getParentEntity().get("CODTYPDEP");
                var defPayment = this._getDefaultPaymentType(depositType);
                var availablePaymentTypes = this._getAvailablePaymentTypes(depositType);
                for (var i = 0, l = availablePaymentTypes.length; i < l; i++) {
                    if (availablePaymentTypes[i].value == defPayment) {
                        entity.set("CODTYPPAY", defPayment);
                        break;
                    }
                }
                break;
        }
    };

    this.setFieldStatus = function (context) {
        var entityName = context.sectionContext.entityName;
        switch (entityName) {
            case "Encashment":
                this._setEncashmentFieldStatus(context);
                break;
            case "EncashmentRow":
                this._setEncashmentRowFieldStatus(context);
                break;
            case "EncashmentBalance":
                this._setEncashmentBalanceFieldStatus(context);
                break;
        }
    };

    this.validateField = function (context) {
        var fieldContext = context.field.fieldContext;
        var sectionContext = fieldContext.sectionContext;
        switch (sectionContext.entityName) {
            case "EncashmentBalance":
                var encBal = sectionContext.entity;
                switch (fieldContext.fieldName) {
                    case "VALENCDET":
                    case "FLGCLOSED":
                        if (!this._checkOpenInvoiceCurrency(encBal)) {
                            context.newVal = context.oldVal;
                            return;
                        }

                        if (fieldContext.fieldName == "VALENCDET") {
                            return encBal.get("VALDOC") >= 0 ?
                                context.newVal >= 0 && context.newVal <= encBal.get("VALRATE") :
                                context.newVal <= 0 && context.newVal >= encBal.get("VALRATE");
                        }
                        break;
                }
                break;
        }
        return true;
    };

    this.onEditEnding = function (ctrl, fieldName, newValue) {
        var fieldContext = ctrl.fieldContext;
        var sectionContext = fieldContext.sectionContext;
        var gui = sectionContext.gui;
        var entityName = sectionContext.entityName;
        var entity = sectionContext.entity;
        switch (entityName) {
            case "Encashment":
                switch (fieldName) {
                    case "CODPARTY":
                        if (fieldContext.isValid) {
                            //load encashment details
                            this._canAddEncashmentRow = true;
                            this._loadEncashmentDetails(newValue, gui);
                        }

                        // when selecting a different customer, change the UI title accordingly
                        this._setPaymentTitle(gui);

                        break;
                    case "DTEENC":
                        if (fieldContext.isValid) {
                            this._canAddEncashmentRow = true;
                        }
                        break;
                }
                break;
            case "EncashmentRow":
                switch (fieldName) {
                    case "CODABIPAY":
                    case "CODCABPAY":
                        if (fieldContext.isValid) {
                            var codAbi = entity.get("CODABIPAY");
                            var codCab = entity.get("CODCABPAY");
                            var codParty = entity.get("CODPARTY");
                            if (!XApp.isEmptyOrWhitespaceString(codAbi) && !XApp.isEmptyOrWhitespaceString(codCab) && !XApp.isEmptyOrWhitespaceString(codParty)) {
                                XUI.showWait();
                                var bankInfo = this._loadBankInfo(codParty, codAbi, codCab);
                                if (bankInfo != null) {
                                    entity.set("DESBANPAY", bankInfo.DESBAN);
                                    entity.set("DESBRAPAY", bankInfo.DESBRA);
                                    entity.set("DESLOC", bankInfo.DESLOC);
                                }
                                XUI.hideWait();
                            }
                        }
                        break;
                    case "CODTYPPAY":
                        var depositType = gui.getDocument().get("CODTYPDEP");
                        this._resetEncashmentRowFields(entity, newValue, depositType);
                        break;
                }
                break;
            case "EncashmentBalance":
                switch (fieldName) {
                    case "VALENCDET":
                        if (newValue == 0)
                            entity.set("FLGCLOSED", false);

                        if (newValue == entity.get("VALRATE"))
                            entity.set("FLGCLOSED", true);

                        var numberOfDecimals = this._getCurrencyDecimalsNumber(gui.getDocument());
                        entity.set("VALABBUONO", XApp.toDecimals(entity.get("VALRATE") - newValue, numberOfDecimals));

                        if (fieldContext.isValid) {
                            if (this._updateCashRow())
                                this._rebindEncRowsGridStore(gui);

                            this._calculateEncashmentValue();
                            this._calculateEncashmentFields(gui);
                        }
                        break;
                    case "FLGCLOSED":
                        this._toggleEncBalanceFlgClosed(entity, newValue);
                        if (this._updateCashRow()) {
                            this._rebindEncRowsGridStore(gui);
                        }
                        this._calculateEncashmentValue();
                        this._calculateEncashmentFields(gui);
                        break;
                }
                break;
        }

    };

    this.beforeTabControlActiveItemChange = function (context) {
        var actualConfig = XHistory.actualConfig();
        if (actualConfig.entityName == undefined)
            actualConfig.entityName = "Encashment";
    };

    // Enh 39334 In all the amounts fields  collection deposit functionality, show the number of decimals defined for the currency (CUR.NUMDECIAMALS) using T090.CODCUR
    this.getCustomLayout = function (l, detailContext) {

        if (!detailContext.originalLayout)
            detailContext.originalLayout = l;
        var layout = Ext.clone(detailContext.originalLayout);

        var document = detailContext.gui.getDocument();
        var defaultNumberOfDecimals = 2;

        var formatString = SM1OrderHelper.getNumericFormat(document.get("CODDIV"), document.get("CODCUR"), defaultNumberOfDecimals);

        switch (layout.attrs.baseObject) {
            case "Encashment":
                for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                    var section = layout.children[idxSection];
                    if (section.attrs.caption == "MAIN_INFO" ||
                        section.attrs.caption == "PAYMENT" ||
                        section.attrs.caption == "ENCASHMENTROW_GRID" ||
                        section.attrs.caption == "ENCASHMENTBALANCE_GRID") {
                        var columns = (section.attrs.caption == "MAIN_INFO" || section.attrs.caption == "PAYMENT") ? section.children : section.children[0].children;
                        for (var i = 0; i < columns.length; i++) {
                            switch (columns[i].attrs.name) {
                                case "ALLOWANCE":
                                case "CASH":
                                case "CHECK":
                                case "ELECTRONIC":
                                case "MATCHED":
                                case "NOTMATCHED":
                                case "VALENC":
                                case "VALENCDET":
                                case "VALRATE":
                                case "VALABBUONO":
                                    columns[i].attrs.formatString = formatString;
                            }
                        }
                    }
                }
                break;
            case "EncashmentRow":
                var section = layout.children[0];
                if (section.attrs.caption == 'PAYMENT') {
                    var columns = section.children;
                    for (var i = 0; i < columns.length; i++) {
                        switch (columns[i].attrs.name) {
                            case "VALENC":
                                columns[i].attrs.formatString = formatString;
                        }
                    }
                }
                break;
            case "EncashmentBalance":
                var section = layout.children[0];
                if (section.attrs.caption == 'INVOICE') {
                    var columns = section.children;
                    for (var i = 0; i < columns.length; i++) {
                        switch (columns[i].attrs.name) {
                            case "VALDOC":
                            case "VALENCDATE":
                            case "VALRATE":
                            case "VALABBUONO":
                                columns[i].attrs.formatString = formatString;
                        }
                    }
                }
                break;
        }
        return layout;
    };

    this.getSaveConfirmationMessage = function (context) {
        if (this._removeEncashmentOnSave) {
            return UserContext.tryTranslate("[MOBGUIENCASHMENT.CONFIRM_REMOVE_ENCASHMENT]");
        }
        else {
            var notMatched = this._encashment.get("NOTMATCHED");
            return (notMatched > 0) ?
                [UserContext.tryTranslate("[MOB.DEP_CREATE_DEFAULT_INCASSO]"), " ", notMatched, " ?"].join("") :
                this.base.getSaveConfirmationMessage(context);
        }
    };

    this.preSaveDocument = function (gui, document) {
        //workaround for correctly opening encashment UI after returning from another UI
        XHistory.actualConfig().entityName = "Encashment";

        return true;
    }

    this.onSaveDocument = function (gui, document, onSuccess) {
        var self = this;

        if (this._removeEncashmentOnSave) {
            this._encashment.Cancel(UserContext.CodUsr);
        } else {

            this._cleanupEncashment();
            this._setProgressives();
            //after resseting progresives recalculate the id used by payment attachments, since NUMROWENC is part of the key
            this._recalcIdForPaymentAttachments();

            var notMatched = this._encashment.get("NOTMATCHED");
            if (notMatched > 0) {
                this._addDefaultBalance(notMatched);
                this._calculateEncashmentFields(gui);
            }

            //workaround for correctly opening encashment UI after returning from another UI
            gui.openData.customData.codparty = this._encashment.get("CODPARTY");
            gui.openData.customData.dteenc = this._encashment.get("DTEENC");
        }
        CommonEngine.calculateDeposit(document);

        //Uses flag _removeEncashmentOnSave
        this._updateEncBalNavData(function () {
            //Now we can reset the flag. 
            self._removeEncashmentOnSave = undefined;
            self._encashment.isNew = false;

            if (onSuccess)
                onSuccess();
        });
    };

    this.onDiscardDocument = function (gui, doc, onSuccess) {

        //Remove new encashment created in this gui. because we did not save the deposit.
        //This is usefull when user navigates away and returns to this gui.
        if (this._encashment.isNew)
            doc.getSubEntityStore("Encashment").remove(this._encashment);

        this._removeEncashmentOnSave = undefined;

        if (onSuccess)
            onSuccess();
    };
    this.onSaveCanceled = function (gui) {

        this._removeEncashmentOnSave = undefined;
    };

    this.afterSaveDocument = function (gui, document, onError, onSuccess) {
        try {

            if (gui.openData.customData) {
                switch (gui.openData.customData.encashmentGuiOpenMode) {
                    case CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild:
                        {
                            //workaround for correctly opening the deposit UI after first encashment is added on new deposit
                            //If encashment was opened from master deposit then always pass back the modified deposit document.
                            var depositHistIndex = XHistory.hist.length - 2;
                            if (depositHistIndex >= 0) {
                                var depositHistConfig = XHistory.hist[depositHistIndex];
                                depositHistConfig.controller.docKey = document.get("DOCUMENTKEY");
                                depositHistConfig.docKey = document.get("DOCUMENTKEY");
                                depositHistConfig.depositStore = new XStore({ entityName: gui.docName }).add(document);
                            }
                            break;
                        }
                }
            }

            CommonEngine.updateNavMobAttachmentsCust(document, onError, onSuccess);
        } catch (e) {
            if (onError)
                onError(e);
            return;
        }
    };

    this.afterCardFieldCreation = function (field, context) {
        var fieldName = context.fieldConfig.attrs["name"];
        var sectionName = context.sectionContext.config.attrs["caption"];
        var isEntityNew = context.sectionContext.entity.isNew;

        if (sectionName == "MAIN_INFO" && fieldName == "CODPARTY" && isEntityNew) {
            //add constraints to customer selector
            var xconstr = UsrGroup.getRightExprAsConstraints(UsrGroup.getGroup(UserContext.CodGrp), "NAV_MOB_CUST", "CANENCASH");
            if (xconstr == null) {
                xconstr = new XConstraint({ attr: "FLGCUSTINV", op: '!=', value: 0 });
            }

            field.hiddenConstraints = xconstr;
        }

        return field;
    };

    this.validateEntity = function (detailContext) {
        var entity = detailContext.entity;
        switch (detailContext.entityName) {
            case "EncashmentRow":
                {
                    if (!this._encashment.isNew)
                        return true;

                    if (this._isCashAlredyAdded(entity))
                        return false;

                    for (var fieldName in detailContext.fields) {
                        var f = detailContext.fields[fieldName];
                        if (!f.fieldContext.isValid) {
                            return false;
                        }
                    }

                    var result = true;

                    if (entity.get("VALENC") <= 0) {
                        result = false;
                    }

                    var paymentType = entity.get("CODTYPPAY");

                    if (XApp.isEmptyOrWhitespaceString(paymentType)) {
                        result = false;
                    }
                    else {
                        if (this._isNumSerRequired(paymentType) && XApp.isEmptyOrWhitespaceString(entity.get("NUMSER"))) {
                            result = false;
                        }
                        if (this._isTransactionCodeRequired(paymentType) && XApp.isEmptyOrWhitespaceString(entity.get("CODTRANSACTION"))) {
                            result = false;
                        }
                        if (this._areBankFieldsRequired(paymentType) &&
                           (!this._isAbiCabValid(entity.get("CODABIPAY")) ||
                            !this._isAbiCabValid(entity.get("CODCABPAY")) ||
                            XApp.isEmptyOrWhitespaceString(entity.get("CODACCOUNTPAY"))))
                            result = false;
                    }

                    if (!result) {
                        this._setFieldErrors = true;
                        detailContext.setFieldsStatus();
                        this._setFieldErrors = false;
                    }

                    return result;
                }
            case "EncashmentBalance":
                return entity.get("VALDOC") >= 0 ?
                    (entity.get("VALENCDET") <= entity.get("VALRATE") && entity.get("VALENCDET") >= 0) :
                    (entity.get("VALENCDET") >= entity.get("VALRATE") && entity.get("VALENCDET") <= 0);
        }
        return true;
    };

    this.validateDocument = function (gui) {
        var isValid = (!gui.errorReports || Ext.Object.getKeys(gui.errorReports).length == 0);
        var invalidFields = [];
        var isValEncInvalid = false;

        if (XApp.isEmptyOrWhitespaceString(this._encashment.get("CODPARTY")) || !this._isEncashmentValid(gui.getDocument())) {
            isValid = false;
            invalidFields.push("CODPARTY");
        }

        if (this._encashment.get("VALENC") <= 0) {
            isValid = false;
            isValEncInvalid = true;
            this._isSaveValidation = true;
        }

        if (!this._isEncashmentDateValid(this._encashment.get("DTEENC"))) {
            isValid = false;
            invalidFields.push("DTEENC");
        }

        if (!this._isAllowanceValid(this._encashment.get("ALLOWANCE"))) {
            isValid = false;
        }

        if (!this._isNotMatchedValid(this._encashment.get("NOTMATCHED"))) {
            isValid = false;
        }

        if (!this._checkMaxCashVal(this._encashment))
            isValid = false;

        if (!isValid) {
            var paymentDetailContext = gui.tabCtrls.PAYMENT;
            if (paymentDetailContext) {
                for (var i = 0, n = invalidFields.length; i < n; i++) {
                    var f = paymentDetailContext.fields[invalidFields[i]];
                    if (f) {
                        f.fieldContext.isValid = false;
                    }
                }
                paymentDetailContext.setFieldsStatus();
            }

            // Because VALENC is present on 2 tabs after the first time the status of the field is evaluated _isSaveValidation is set to false
            if (isValEncInvalid) {
                this._isSaveValidation = true;
            }

            var mainInfoDetailContext = gui.tabCtrls.MAIN_INFO;
            if (mainInfoDetailContext) {
                for (var i = 0, n = invalidFields.length; i < n; i++) {
                    var f = mainInfoDetailContext.fields[invalidFields[i]];
                    if (f) {
                        f.fieldContext.isValid = false;
                    }
                }
                mainInfoDetailContext.setFieldsStatus();
            }

            if (gui.errorReports.CASH)
                gui.errorReports.CASH.caption = UserContext.tryTranslate("[MOB.MAX_CASH_EXCEEDED]") + DepositParameters.getInstance().getEncMaxCashVal();
        }

        return isValid;
    };

    this._isFlgClosedEditableToNewValue = function (newVal, entity, gui) {
        //if opened from a visit, don't allow the deselection of FLGCLOSED checkbox for the passed open invoice
        if (!XApp.isEmptyOrWhitespaceString(gui.openData.customData.idSurvey) && !XApp.isEmptyOrWhitespaceString(gui.openData.customData.mandatoryPaymentDocNumber)) {
            if (!newVal && entity.get("NUMDOC") == gui.openData.customData.mandatoryPaymentDocNumber && SM1OrderHelper.isMandatoryCashCollection(entity.get("CODPAYTRM"))) {
                return false;
            }
        }
        return true;
    }

    this.gridBeginEdit = function (context) {
        switch (context.column.fieldName) {
            case "FLGCLOSED":
                context.canceled = context.canceled || !this._isFlgClosedEditableToNewValue(!context.rowEntity.get("FLGCLOSED"), context.rowEntity, context.gui);
                context.canceled = context.canceled || !this._checkOpenInvoiceCurrency(context.rowEntity);
                //saved encashments are not editable
                context.canceled = context.canceled || !this._encashment.isNew;
                break;
        }
    };

    this.onGridEndEditEnded = function (context) {
        switch (context.fieldName) {
            //close invoice from grid
            case "FLGCLOSED":
                this._toggleEncBalanceFlgClosed(context.rowEntity, context.newVal);
                if (this._updateCashRow()) {
                    this._rebindEncRowsGridStore(context.gui);
                }
                this._rebindEncBalancesGridStore(context.gui);
                this._calculateEncashmentValue();
                this._calculateEncashmentFields(context.gui);
                context.detailContext.refreshGui();
                break;
        }
    };

    //#endregion

    //#region Private methods

    this._loadEncashmentDetails = function (codParty, gui) {
        //set DESPARTY1 for the encashment
        var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(codParty));
        if (customer)
            this._encashment.set("DESPARTY1", customer.get("DESPARTY1"));

        //clear encashment rows and add cash row, if necessary
        this._setEncashmentRows(gui.getDocument());

        //load encashment balances and calculate encashment fields
        this._calcCashRow = gui.getDocument().get("CODTYPDEP") == CommonNameSpace.DepositType.Bank;
        this._setEncBalances(codParty, gui);

        //refresh the encahsment balances and encashment rows grid
        this._rebindEncBalancesGridStore(gui);
        this._rebindEncRowsGridStore(gui);
        gui.refreshGui();
    };

    this._addDefaultBalance = function (amount) {
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var params = DepositParameters.getInstance();

        var encBal = new XEntity({ entityName: "EncashmentBalance" });
        encBal.set("IDENC", this._encashment.get("IDENC"));
        encBal.set("IDDEP", this._encashment.get("IDDEP"));
        encBal.set("DTEEXPIRE", now);
        encBal.set("CODTYPDOC", params.getDefaultCodTypDoc());
        encBal.set("VALENCDET", amount);
        encBal.set("NUMDOC", params.getDefaultNumDoc());
        encBal.set("VALDOC", amount);
        encBal.set("CODCURORIG", "");
        encBal.set("DTEDOC", now);
        encBal.set("VALABBUONO", 0);
        encBal.set("VALRATE", amount);
        encBal.set("FLGCLOSED", false);

        this._encashment.getSubEntityStore("EncashmentBalance").add(encBal);
    };

    this._updateCashRow = function (skipRow) {
        if (!this._calcCashRow)
            return false;

        var self = this;
        var cashRow = null;
        var totalEncRow = 0;

        this._encashment.getSubEntityStore("EncashmentRow").each(function (encRow) {
            if (skipRow && skipRow == encRow)
                return;
            totalEncRow += encRow.get("VALENC");

            if (!cashRow && self._isCashPayment(encRow.get("CODTYPPAY"))) {
                cashRow = encRow;
            }
        });


        if (cashRow) {
            var covered = 0;
            this._encashment.getSubEntityStore("EncashmentBalance").each(function (encBal) {
                covered += encBal.get("VALENCDET");
            });

            var newVal = cashRow.get("VALENC") + covered - totalEncRow;
            if (newVal < 0)
                newVal = 0;
            cashRow.set("VALENC", newVal);
            return true;
        }
        return false;
    };

    //only one encashment allowed per customer and date
    this._isEncashmentValid = function (deposit) {
        var encs = deposit.ActiveEncashmentDetails();
        for (var i = 0, l = encs.getCount() ; i < l; i++) {
            var enc = encs.getAt(i);
            if (enc != this._encashment &&
                enc.get("CODPARTY") == this._encashment.get("CODPARTY") &&
                (enc.get("DTEENC").getTime() == this._encashment.get("DTEENC").toLocal().getTime() ||
                enc.get("DTEENC").getTime() == this._encashment.get("DTEENC").getTime()))
                return false;
        }
        return true;
    };

    this._isEncashmentDateValid = function (dteEnc) {
        //check date inside interval
        if (!dteEnc)
            return false;

        var now = new Date();
        now.setHours(0, 0, 0, 0);
        return dteEnc.isInsideInterval(now, DepositParameters.getInstance().getEncMaxFuture(), DepositParameters.getInstance().getEncMaxPast());
    };

    this._isAllowanceValid = function (allowance) {
        return allowance <= DepositParameters.getInstance().getDeltaValEncash() && allowance >= 0;
    };

    this._isNotMatchedValid = function (notMatched) {
        return !(notMatched < 0 || (notMatched > 0 && !DepositParameters.getInstance().getEncAllowPositiveUnmatchedSave()))
    };

    this._setEncashmentFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var fieldContext = context.field.fieldContext;
        var entity = fieldContext.sectionContext.entity;

        switch (fieldName) {
            case "DTEENC":
                //when gui is opened from visit detail it document can be new but fields DTEENC and CODPARTY should be passed from exterior and locked
                context.editable = this._encashment.isNew && (!context.gui.gui.openData.customData || context.gui.gui.openData.customData.encashmentGuiOpenMode != CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild);
                //check date inside interval
                //and only one encashment for the same customer and date is allowed
                var now = new Date();
                now.setHours(0, 0, 0, 0);
                context.valid = this._isEncashmentDateValid(entity.get(fieldName));
                this._canAddEncashmentRow = this._canAddEncashmentRow && context.valid;

                break;
            case "ALLOWANCE":
                context.valid = this._isAllowanceValid(entity.get(fieldName));
                break;
            case "NOTMATCHED":
                context.valid = this._isNotMatchedValid(entity.get(fieldName));
                break;
            case "CODPARTY":
                //when gui is opened from visit detail it document can be new but fields DTEENC and CODPARTY should be passed from exterior and locked
                context.editable = this._encashment.isNew && (!context.gui.gui.openData.customData || context.gui.gui.openData.customData.encashmentGuiOpenMode != CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild);
                context.valid = context.valid && this._isEncashmentValid(context.sectionContext.gui.getDocument());
                this._canAddEncashmentRow = this._canAddEncashmentRow && context.valid;
                break;
            case "DESNOTE":
                context.editable = this._encashment.isNew;
                break;
            case "VALENC":
                context.valid = !this._isSaveValidation;
                this._isSaveValidation = false;
                break;
            case "CASH":
                context.valid = this._checkMaxCashVal(entity);
        }
    };

    this._setEncashmentBalanceFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        switch (fieldName) {
            case "VALENCDET":
                context.editable = this._encashment.isNew && !entity.get("FLGINFULLPAY");
                if (context.editable) {
                    var valEncDet = entity.get("VALENCDET");
                    context.valid = entity.get("VALDOC") >= 0 ?
                        valEncDet >= 0 && valEncDet <= entity.get("VALRATE") :
                        valEncDet <= 0 && valEncDet >= entity.get("VALRATE");
                }
                break;
            case "FLGCLOSED":
                context.editable = this._isFlgClosedEditableToNewValue(!entity.get("FLGCLOSED"), entity, context.gui.gui);
                context.editable = !context.editable ? context.editable : this._encashment.isNew;
                break;
            case "DESNOTE":
                context.editable = this._encashment.isNew;
                break;
        }
    };

    this._setEncashmentRowFieldStatus = function (context) {
        //detail entity is editable only for new encashments
        context.editable = context.editable && this._encashment.isNew;
        var fieldName = context.field.getName();
        var entity = context.sectionContext.entity;
        var paymentType;
        switch (fieldName) {
            case "NUMSER":
                paymentType = entity.get("CODTYPPAY");
                if (!XApp.isEmptyOrWhitespaceString(paymentType)) {
                    context.visible = this._isNumSerRequired(paymentType);
                    if (context.visible && context.editable) {
                        context.valid = !XApp.isEmptyOrWhitespaceString(entity.get(fieldName));
                    }
                }
                break;
            case "CODABIPAY":
            case "CODCABPAY":
                paymentType = entity.get("CODTYPPAY");
                if (!XApp.isEmptyOrWhitespaceString(paymentType)) {
                    context.visible = this._areBankFieldsRequired(paymentType);
                    if (context.visible && context.editable) {
                        context.valid = this._isAbiCabValid(entity.get(fieldName));
                    }
                }
                break;
            case "DESBANPAY":
            case "DESBRAPAY":
            case "DESLOC":
                paymentType = entity.get("CODTYPPAY");
                if (!XApp.isEmptyOrWhitespaceString(paymentType)) {
                    context.visible = this._areBankFieldsRequired(paymentType);
                }
                break;
            case "CODACCOUNTPAY":
                paymentType = entity.get("CODTYPPAY");
                if (!XApp.isEmptyOrWhitespaceString(paymentType)) {
                    context.visible = this._areBankFieldsRequired(paymentType);
                    if (context.visible && context.editable) {
                        context.valid = !XApp.isEmptyOrWhitespaceString(entity.get(fieldName));
                    }
                }
                break;
            case "DTEENCASS":
            case "CODENCASS":
                var deposit = context.gui.gui.getDocument();
                context.visible = deposit.get("CODTYPDEP") != CommonNameSpace.DepositType.Bank;
                break;
            case "VALENC":
                if (context.editable) {
                    context.valid = entity.get(fieldName) > 0;
                }
                break;
            case "CODTYPPAY":
                if (context.editable && this._setFieldErrors) {
                    context.valid = !XApp.isEmptyOrWhitespaceString(entity.get(fieldName));
                }
                if (context.valid && entity.get("CODTYPPAY") == "CO") {
                    if (this._isCashAlredyAdded(entity)) {
                        context.valid = false;
                    }
                }
                break;
            case "CODTRANSACTION":
                paymentType = entity.get("CODTYPPAY");
                if (!XApp.isEmptyOrWhitespaceString(paymentType)) {
                    context.visible = this._isElectronicPayment(paymentType);
                    if (context.visible && context.editable) {
                        context.valid = this._isTransactionCodeRequired(paymentType) && !XApp.isEmptyOrWhitespaceString(entity.get(fieldName));
                    }
                }
                break;
        }

        if (!context.visible || !context.editable)
            context.valid = true;
    };

    this._isCashAlredyAdded = function (entity) {
        var cashAlreadyAdded = false;
        this._encashment.getSubEntityStore("EncashmentRow").each(function (row) {
            if (row.get("CODTYPPAY") == "CO" && entity.get("CODTYPPAY") == "CO" && row != entity) {
                cashAlreadyAdded = true;
                return;
            }
        });

        return cashAlreadyAdded;
    };

    this._resetEncashmentRowFields = function (encashmentRow, paymentType, depositType) {
        if (depositType == CommonNameSpace.DepositType.Bank) {
            encashmentRow.set("CODENCASS", "");
            encashmentRow.set("DTEENCASS", Constants.SM1MINDATE);
        }

        if (XApp.isEmptyOrWhitespaceString(paymentType))
            return;

        if (!this._isNumSerRequired(paymentType)) {
            encashmentRow.set("NUMSER", "");
        }

        if (!this._areBankFieldsRequired(paymentType)) {
            encashmentRow.set("CODABIPAY", "");
            encashmentRow.set("CODCABPAY", "");
            encashmentRow.set("DESBANPAY", "");
            encashmentRow.set("DESBRAPAY", "");
            encashmentRow.set("DESLOC", "");
            encashmentRow.set("CODACCOUNTPAY", "");
        }
    };

    this._isAbiCabValid = function (code) {
        if (code.length > 5)
            return false;
        return !isNaN(parseInt(code, 10)) && isFinite(code);
    };

    this._validateGuiArguments = function (gui) {
        try {
            if (gui.openData.customData) {
                switch (gui.openData.customData.encashmentGuiOpenMode) {
                    case CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild:
                        {
                            if (!gui.openData.customData.parentDocumentStore)
                                throw "customData.parentDocumentStore is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.iddep))
                                throw "customData.iddep is mandatory";
                            break;
                        }
                    case CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild:
                        {
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.codusr))
                                throw "customData.codusr is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.coddiv))
                                throw "customData.coddiv is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.codparty))
                                throw "customData.codparty is mandatory";
                            if (XApp.isEmptyDate(gui.openData.customData.dteenc))
                                throw "customData.dteenc is mandatory";
                            break;
                        }
                    case CommonNameSpace.EncashmentGuiOpenMode.EncashmentReadOnly:
                        {
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.codusr))
                                throw "customData.codusr is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.coddiv))
                                throw "customData.coddiv is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.codparty))
                                throw "customData.codparty is mandatory";
                            if (XApp.isEmptyOrWhitespaceString(gui.openData.customData.iddep))
                                throw "customData.iddep is mandatory";
                            if (XApp.isEmptyDate(gui.openData.customData.dteenc))
                                throw "customData.dteenc is mandatory";
                            break;
                        }
                }
            }
        } catch (e) {
            gui.exe.clear();
            XUI.hideWait();
            XLog.logErr("mobGuiEncashment opened with invalid arguments.");
            XUI.showExceptionMsgBox(e);
            return false;
        }
        return true;

    };

    this._loadExistingEncashment = function (gui) {
        var deposit = gui.getDocument();
        this._encashment = deposit.ActiveEncashmentDetails().findBy(
            function (entity) {
                return entity.get("CODUSR") == gui.openData.customData.codusr &&
                    entity.get("CODDIV") == gui.openData.customData.coddiv &&
                    entity.get("IDDEP") == gui.openData.customData.iddep &&
                    entity.get("CODPARTY") == gui.openData.customData.codparty &&
                    entity.get("DTEENC") - gui.openData.customData.dteenc == 0;

            });
        return this._encashment;
    };

    this._setDocumentKey = function (deposit, gui) {
        var actualConfig = XHistory.actualConfig();
        actualConfig.docKey = deposit.get("DOCUMENTKEY");
        gui.docKey = deposit.get("DOCUMENTKEY");
    };

    this._createNewEncashment = function (gui) {

        var deposit = gui.getDocument();

        this._encashment = new XEntity({ entityName: "Encashment" });
        this._encashment.set("CODDIV", deposit.get("CODDIV"));
        this._encashment.set("CODUSR", deposit.get("CODUSR"));
        this._encashment.set("IDDEP", deposit.get("IDDEP"));
        this._encashment.set("IDENC", XApp.newUserGUID()); //local generated unique id containing also user code.

        if (gui.openData.customData && gui.openData.customData.encashmentGuiOpenMode == CommonNameSpace.EncashmentGuiOpenMode.AgendaMasterEncashmentChild) {
            this._encashment.set("DTEENC", (new Date().toDate()));
            this._encashment.set("CODPARTY", gui.openData.customData.codparty);

        } else {
            this._encashment.set("CODPARTY", "");
            if ((new Date().toDate()) > deposit.get("DTEDEP"))
                this._encashment.set("DTEENC", deposit.get("DTEDEP"));
            else
                this._encashment.set("DTEENC", (new Date().toDate()));
        }

        if (gui.openData.customData.idSurvey)
            this._encashment.set("IDSURVEY", gui.openData.customData.idSurvey);

        this._encashment.isNew = true;
        this._canAddEncashmentRow = true;

        deposit.getSubEntityStore("Encashment").add(this._encashment);

        return this._encashment;
    };

    //calculate totals for encashment
    this._calculateEncashmentFields = function (gui) {
        var self = this;
        var cash = 0, check = 0, matched = 0, allowance = 0, electronic = 0, notMatched;

        this._encashment.getSubEntityStore("EncashmentRow").each(function (encRow) {
            if (self._isCashPayment(encRow.get("CODTYPPAY")))
                cash += encRow.get("VALENC");
            else if (self._isElectronicPayment(encRow.get("CODTYPPAY")))
                electronic += encRow.get("VALENC");
            else
                check += encRow.get("VALENC");
        });

        this._encashment.getSubEntityStore("EncashmentBalance").each(function (balance) {
            matched += balance.get("VALENCDET");
            if (balance.get("FLGCLOSED"))
                allowance += balance.get("VALABBUONO");
        });

       
        var numberOfDecimals = this._getCurrencyDecimalsNumber(gui.getDocument());
        matched = XApp.toDecimals(matched, numberOfDecimals);
        notMatched = XApp.toDecimals(this._encashment.get("VALENC") - matched, numberOfDecimals);
        allowance = XApp.toDecimals(allowance, numberOfDecimals);
        cash = XApp.toDecimals(cash, numberOfDecimals);
        check = XApp.toDecimals(check, numberOfDecimals);
        electronic = XApp.toDecimals(electronic, numberOfDecimals);

        this._encashment.set("CASH", cash);
        this._encashment.set("CHECK", check);
        this._encashment.set("ELECTRONIC", electronic);
        this._encashment.set("MATCHED", matched);
        this._encashment.set("NOTMATCHED", notMatched);
        this._encashment.set("ALLOWANCE", allowance);

        if (gui)
            this._refreshEncashmentFields(gui);
    };

    //calculate encashment's total amount
    this._calculateEncashmentValue = function () {
        var encRows = this._encashment.getSubEntityStore("EncashmentRow");
        var encVal = 0;
        for (var i = 0, l = encRows.getCount() ; i < l; i++) {
            var row = encRows.getAt(i);
            encVal += row.get("VALENC");
        }
        this._encashment.set("VALENC", encVal);
    };

    this._isCashPayment = function (codTypPay) {
        return this._getTyPayFlag(codTypPay, 4);
    };

    this._isElectronicPayment = function (paymentType) {
        return UserContext.getRefdatValue("TYPAY", paymentType, "ISELECTRONIC");
    };

    this._isTransactionCodeRequired = function (paymentType) {
        return UserContext.getRefdatValue("TYPAY", paymentType, "TRANSACTIONCODE");
    };

    //checks whether NUMSER field is required, according to payment type
    this._isNumSerRequired = function (paymentType) {
        return this._getTyPayFlag(paymentType, 2);
    };

    //checks whether bank fields are required, according to payment type
    this._areBankFieldsRequired = function (paymentType) {
        return this._getTyPayFlag(paymentType, 3);
    };

    //default is given by the 6th flag from OPTINFO
    this._getDefaultPaymentType = function (depositType) {
        for (var codTabRow in this._typay) {
            if (((depositType == CommonNameSpace.DepositType.Bank && this._getTyPayFlag(codTabRow, 0)) ||
                (depositType == CommonNameSpace.DepositType.Post && this._getTyPayFlag(codTabRow, 1))) &&
                this._getTyPayFlag(codTabRow, 5)) {
                return codTabRow;
            }
        }

        return "";
    };

    //cash payment is given by the 5th flag from OPTINFO
    this._getCashPaymentType = function () {
        for (var codTabRow in this._typay) {
            if (this._getTyPayFlag(codTabRow, 4))
                return codTabRow;
        }

        return "";
    };

    //filter available payment types according to OPTINFO configuration
    this._getAvailablePaymentTypes = function (depositType) {
        var newVoices = [];
        newVoices.push({
            value: "", text: ""
        });

        for (var codTabRow in this._typay) {
            var row = this._typay[codTabRow];
            if ((depositType == CommonNameSpace.DepositType.Bank && this._getTyPayFlag(codTabRow, 0)) ||
                (depositType == CommonNameSpace.DepositType.Post && this._getTyPayFlag(codTabRow, 1)))
                newVoices.push({ value: codTabRow, text: row.des });
        }

        return newVoices;
    };

    /* gets an OPTINFO flag from TYPAY qtab
    paymentType: CodTabRow
    i: flag index */
    this._getTyPayFlag = function (paymentType, i) {
        if (XApp.isEmptyOrWhitespaceString(paymentType))
            return false;

        try {
            return this._typay[paymentType].optInfo[i] != "0";
        }
        catch (e) {
            XLog.logErr("Wrong TYPAY configuration");
            XLog.logEx(e);
        }

        return false;
    };

    this._getPartyBalancesForCustomer = function (codParty) {
        var balancesTable = XNavHelper.getFromMemoryCache("NAV_MOB_PARTYBALANCE");
        if (balancesTable == null)
            return [];

        var balanceRows = balancesTable.filterByConstraints(new XConstraint({
            attr: "CODPARTY",
            op: '=',
            value: codParty
        }));
        balanceRows.sort(function (a, b) {
            var expA = a.getValueFromName("DTEEXPIRE");
            var expB = b.getValueFromName("DTEEXPIRE");
            if (expA < expB)
                return -1;
            if (expA.getTime() == expB.getTime())
                return 0;
            return 1;
        });

        return balanceRows;
    };

    this._getEncBalancesForCustomer = function (codParty) {
        var balancesTable = XNavHelper.getFromMemoryCache("NAV_MOB_ENCBALANCE");
        if (balancesTable == null)
            return [];

        var constraints = new XConstraints({
            logicalOp: 'AND',
            constraints: [
        {
            attr: 'CODPARTY', op: '=', value: codParty
        }
            ]
        });

        return balancesTable.filterByConstraints(constraints);
    };

    this._checkOpenInvoiceCurrency = function (encBalance) {

        var codParty = this._encashment ? this._encashment.get("CODPARTY") : null;
        var partyBalanceRows = null;
        if (!XApp.isEmptyOrWhitespaceString(codParty))
            partyBalanceRows = this._getPartyBalancesForCustomer(codParty);

        var deposit = encBalance.getParentEntity().getParentEntity();
        if (partyBalanceRows != null && partyBalanceRows.length > 0)
            var invoice = partyBalanceRows.filter(function (row) {
            return row.get("CODTYPDOC") == encBalance.get("CODTYPDOC") &&
                row.get("NUMDOC") == encBalance.get("NUMDOC") &&
                row.get("DTEDOC") == encBalance.get("DTEDOC") &&
                row.get("NUMROWBAL") == encBalance.get("NUMROWBAL");
            })[0];

        if (invoice == null || XApp.isEmptyOrWhitespaceString(invoice.get("CODCURORIG")))
            return true;
           
        if (invoice.get("CODCURORIG") != deposit.get("CODCUR"))
        {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOB.OPEN_INVOICE_CURRENCY_DIFFERENT_FROM_DEPOSIT_CURRENCY]") });
            return false;
        }
            
        return true;
    };

    this._setEncBalances = function (codParty, gui) {
        var balanceStore = this._encashment.getSubEntityStore("EncashmentBalance");
        balanceStore.clear();

        if (!XApp.isEmptyOrWhitespaceString(codParty)) {
            var partyBalanceRows = this._getPartyBalancesForCustomer(codParty);
            var encBalanceRows = this._getEncBalancesForCustomer(codParty);

            var encBals = [];
            var encBal, i, n;
            for (i = 0, n = partyBalanceRows.length; i < n; i++) {
                var pbr = partyBalanceRows[i];
                var valRateEur = pbr.getValueFromName("VALRATEEUR");
                encBal = new XEntity({ entityName: "EncashmentBalance" });
                encBal.set("IDENC", this._encashment.get("IDENC"));
                encBal.set("CODUSR", this._encashment.get("CODUSR"));
                encBal.set("IDDEP", this._encashment.get("IDDEP"));
                encBal.set("CODTYPDOC", pbr.getValueFromName("CODTYPDOC"));
                encBal.set("NUMDOC", pbr.getValueFromName("NUMDOC"));
                encBal.set("DTEDOC", pbr.getValueFromName("DTEDOC"));
                encBal.set("NUMROWBAL", pbr.getValueFromName("NUMROWBAL"));
                encBal.set("DTEEXPIRE", pbr.getValueFromName("DTEEXPIRE"));
                encBal.set("VALDOC", pbr.getValueFromName("VALDOCEUR"));
                encBal.set("CODCURORIG", pbr.getValueFromName("CODCURORIG"));
                encBal.set("VALRATE", valRateEur);
                encBal.set("CODPAYMOD", pbr.getValueFromName("CODPAYMOD"));
                encBal.set("CODPAYTRM", pbr.getValueFromName("CODPAYTRM"));
                encBal.set("VALENCDET", 0);
                encBal.set("FLGCLOSED", false);
                encBal.set("FLGINFULLPAY", pbr.getValueFromName("FLGINFULLPAY"));
                encBal.set("FLGERPGENERATED", pbr.getValueFromName("FLGERPGENERATED"));
                encBal.set("DESNOTE", "");
                encBal.set("VALABBUONO", valRateEur);
                encBal.set("FLGTOTALPAID", pbr.getValueFromName("FLGTOTALPAID")); 

                encBals.push(encBal);
            }

            //match invoices and encashments
            for (i = 0, n = encBalanceRows.length; i < n; i++) {
                var ebr = encBalanceRows[i];
                var valEnc = ebr.getValueFromName("VALENCDET");
                var flgClosed = ebr.getValueFromName("FLGCLOSED");
                var numDoc = ebr.getValueFromName("NUMDOC");
                var codTypDoc = ebr.getValueFromName("CODTYPDOC");
                var dteDocTime = ebr.getValueFromName("DTEDOC").getTime();
                var flgProcessed = ebr.getValueFromName("FLGPROCESSED");

                for (var j = 0, m = encBals.length; j < m; j++) {
                    encBal = encBals[j];
                    if (encBal.get("NUMDOC") == numDoc &&
                    encBal.get("CODTYPDOC") == codTypDoc &&
                    encBal.get("DTEDOC").getTime() == dteDocTime) {
                        //if the encashment was procecessed by ERP and the open invoice is generated by ERP(T096) then don't substract the payment because it was already
                        //substracted by ERP. If the open invoice is generated by SM1(T100) then substract the payment even if the encashment was processed by ERP
                        if (flgProcessed && !encBal.get("FLGERPGENERATED"))
                            continue;

                        if (flgClosed)
                            encBal.set("VALRATE", 0);
                        else
                            encBal.set("VALRATE", encBal.get("VALRATE") - valEnc);

                        break;
                    }
                }
            }

            //remove fully covered invoices
            for (i = 0, n = encBals.length; i < n; i++) {
                encBal = encBals[i];
                var valRate = encBal.get("VALRATE");
                var valDoc = encBal.get("VALDOC");
                if (valRate == 0 || (valRate < 0 && valDoc > 0) || (valRate > 0 && valDoc < 0))
                    continue;

                //before add invoice check again if the invoice was not already paid(Bug 46656)
                if (encBal.get("FLGTOTALPAID"))
                    continue;

                encBal.set("VALABBUONO", encBal.get("VALRATE"));

                balanceStore.add(encBal);
            }
        }

        var isValid = true;
        var toSelect = null;
        if (!XApp.isEmptyOrWhitespaceString(gui.openData.customData.mandatoryPaymentDocNumber)) {

            var defaultInvoice = balanceStore.findBy(function (invoice) {
                return invoice.get("NUMDOC") == gui.openData.customData.mandatoryPaymentDocNumber;
            });

            isValid = this._checkOpenInvoiceCurrency(defaultInvoice);
            if (defaultInvoice != null && isValid) {
                defaultInvoice.set("FLGCLOSED", true);
                var index = balanceStore.findIndex(defaultInvoice);
                balanceStore.setAt(index, balanceStore.getAt(0));
                balanceStore.setAt(0, defaultInvoice);
                this._toggleEncBalanceFlgClosed(defaultInvoice, true);
                this._updateCashRow();
            }
        }

        if (balanceStore.getCount() == 1) 
            toSelect = balanceStore.getAt(0);
        else if (balanceStore.getCount() > 1 && !balanceStore.getAt(0).get("FLGCLOSED")) {
             toSelect = balanceStore.findBy(function (openInvoice) {
                return openInvoice.get("FLGERPGENERATED") && SM1OrderHelper.isMandatoryCashCollection(openInvoice.get("CODPAYTRM"));
            });
            toSelect = toSelect || balanceStore.getAt(0);
        }
        
        if (isValid && toSelect && this._checkOpenInvoiceCurrency(toSelect)) {
            toSelect.set("FLGCLOSED", true);
            this._toggleEncBalanceFlgClosed(toSelect, true);
            this._updateCashRow();
        }

        this._calculateEncashmentValue();
        this._calculateEncashmentFields(gui);
    };

    //updates encashment balance navigator
    this._updateEncBalNavData = function (onSuccess) {
        var balancesTable = XNavHelper.getFromMemoryCache("NAV_MOB_ENCBALANCE");
        if (balancesTable == null)
            return;

        if (this._removeEncashmentOnSave) {
            var constraints = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("CODUSR", "=", this._encashment.get("CODUSR")),
                    new XConstraint("CODDIV", "=", this._encashment.get("CODDIV")),
                    new XConstraint("IDDEP", "=", this._encashment.get("IDDEP")),
                    new XConstraint("CODPARTY", "=", this._encashment.get("CODPARTY")),
                    new XConstraint("DTEENC", "=", this._encashment.get("DTEENC"))
                ]
            });
            var rows = XNavHelper.getNavRecords("NAV_MOB_ENCBALANCE", constraints);
            if (rows) {
                for (var i = 0; i < rows.length; i++) {
                    balancesTable.removeRow(rows[i]);
                }
            }

        } else {
            var flgProcessed = this._encashment.get("FLGPROCESSED") || false;
            var encBals = this._encashment.getSubEntityStore("EncashmentBalance");
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
                row.setValueByName("IDSURVEY", this._encashment.get("IDSURVEY"));
                row.setValueByName("IDDEP", this._encashment.get("IDDEP"));
                row.setValueByName("CODPARTY", this._encashment.get("CODPARTY"));
                row.setValueByName("CODDIV", this._encashment.get("CODDIV"));
                row.setValueByName("DTEENC", this._encashment.get("DTEENC"));
                balancesTable.Rows.unshift(row);
            }
        }

        XNavHelper.updateCache("NAV_MOB_ENCBALANCE", balancesTable, function (e) {

            XUI.showExceptionMsgBox(e);

            if (onSuccess)
                onSuccess();

        }, onSuccess);
    };

    //clears encashment rows and optionally adds an empty cash row for the specified customer
    this._setEncashmentRows = function (deposit) {
        var encRows = this._encashment.getSubEntityStore("EncashmentRow");
        encRows.clear();

        var depositType = deposit.get("CODTYPDEP");
        if (depositType == CommonNameSpace.DepositType.Bank && this._encashment.isNew) {
            var encRow = new XEntity({ entityName: "EncashmentRow" });
            encRow.set("IDENC", this._encashment.get("IDENC"));
            encRow.set("CODUSR", this._encashment.get("CODUSR"));
            encRow.set("IDDEP", this._encashment.get("IDDEP"));
            encRow.set("CODTYPPAY", this._getCashPaymentType());
            encRows.add(encRow);
        }
    };

    //updates NUMROWENC and NUMROWBAL
    this._setProgressives = function () {
        var i = 0;
        this._encashment.getSubEntityStore("EncashmentRow").each(function (encRow) {
            encRow.set("NUMROWENC", i++);
        });

        i = 0;
        this._encashment.getSubEntityStore("EncashmentBalance").each(function (encBal) {
            encBal.set("NUMROWBAL", i++);
        });
    };

    this._recalcIdForPaymentAttachments = function () {
        this._encashment.getSubEntityStore("EncashmentRow").each(function (encRow) {
            var encRowAtts = encRow.getAttachments();
            for (var i = 0; i < encRowAtts.length ; i++) {
                encRowAtts[i].DOCKEY = encRow.getKey();
            }
        });
    };


    //removes unnecessary EncashmentRows and EncashmentBalances
    this._cleanupEncashment = function () {
        this._encashment.getSubEntityStore("EncashmentBalance").removeBy(function (encBal) {
            return encBal.get("VALENCDET") != 0;
        });

        this._encashment.getSubEntityStore("EncashmentRow").removeBy(function (encRow) {
            return encRow.get("VALENC") > 0;
        });
    };

    this._loadBankInfo = function (codParty, codAbi, codCab) {
        //find customer's cod nation
        var custTable = XNavHelper.getFromMemoryCache("NAV_MOB_CUST");
        if (custTable == null)
            return null;
        var cust = custTable.findByConstraints(new XConstraint({
            attr: "CODPARTY",
            op: '=',
            value: codParty
        }));

        if (cust == null)
            return null;

        var codNation = cust.getValueFromName("CODNATION");

        var banksTable = XNavHelper.getFromMemoryCache("NAV_MOB_BANKS");
        if (banksTable == null)
            return null;
        var bankInfo = banksTable.findByConstraints(new XConstraints({
            logicalOp: 'AND',
            constraints: [
        {
            attr: 'CODNATION', op: '=', value: codNation
        },
        {
            attr: 'CODABI', op: '=', value: codAbi
        },
        {
            attr: 'CODCAB', op: '=', value: codCab
        }
            ]
        }));

        if (bankInfo == null)
            return null;

        return {
            "DESBAN": bankInfo.getValueFromName("DESBAN"),
            "DESBRA": bankInfo.getValueFromName("DESBRA"),
            "DESLOC": bankInfo.getValueFromName("DESLOC")
        };
    };

    this._checkMaxCashVal = function (encashment) {
        return encashment.get("CASH") <= DepositParameters.getInstance().getEncMaxCashVal();
    };

    this._rebindEncRowsGridStore = function (gui) {
        if (!gui.tabCtrls.PAYMENT)
            return;

        var gridStore = gui.tabCtrls.PAYMENT.sections.ENCASHMENTROW_GRID.grid.getStore();
        this._encashment.getSubEntityStore("EncashmentRow").rebindSenchaStore(gridStore);
    };

    this._rebindEncBalancesGridStore = function (gui) {
        if (!gui.tabCtrls.PAYMENT)
            return;

        var gridStore = gui.tabCtrls.PAYMENT.sections.ENCASHMENTBALANCE_GRID.grid.getStore();
        this._encashment.getSubEntityStore("EncashmentBalance").rebindSenchaStore(gridStore);
    };

    this._toggleEncBalanceFlgClosed = function (encBal, isClosed) {
        if (isClosed) {
            if (encBal.get("VALENCDET") == 0) {
                encBal.set("VALENCDET", encBal.get("VALRATE"));
                encBal.set("VALABBUONO", 0);
            }
            else {
                if ((encBal.get("VALENCDET") >= encBal.get("VALRATE") && encBal.get("VALDOC") > 0) ||
                    (encBal.get("VALENCDET") <= encBal.get("VALRATE") && encBal.get("VALDOC") < 0)) {
                    return;
                }
            }
        }
        else {
            if ((encBal.get("VALENCDET") >= encBal.get("VALRATE") && encBal.get("VALDOC") > 0) ||
                (encBal.get("VALENCDET") <= encBal.get("VALRATE") && encBal.get("VALDOC") < 0)) {
                encBal.set("VALENCDET", 0);
                encBal.set("VALABBUONO", encBal.get("VALRATE"));
            }
        }
    };

    this._getPaymentTitle = function () {
        var self = this;
        if (self._encashment) {
            return self._encashment.get("DESPARTY1");
        }

        return null;
    };

    this._setPaymentTitle = function (gui) {
        var title = this._getPaymentTitle();
        if (title)
            app.viewport.setApplicationToolbarTitle(title);
        else
            app.viewport.setApplicationToolbarTitle(UserContext.tryTranslate("[" + gui.guiName + "]"));
    };

    // refresh total fields on both tabs
    this._refreshEncashmentFields = function (gui) {
        for (var tab in gui.tabCtrls) {
            if (tab == gui.getActualTabName())
                continue;

            var mainTab = gui.tabCtrls[tab];
            if (mainTab) {
                mainTab.refreshControls();
                mainTab.setFieldsStatus();
            }
        }
    };

    this._getCurrencyDecimalsNumber = function (document) {
        var defaultNumberOfDecimals = 2;
        return SM1OrderHelper.getCurrencyDecimalsNumber(document.get("CODDIV"), document.get("CODCUR"), defaultNumberOfDecimals);
    };

    //#endregion

};
XApp.registerGuiExtension("mobGuiEncashment", new _mobGuiEncashment());
//#endregion