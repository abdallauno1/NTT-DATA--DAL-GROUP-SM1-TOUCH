//#region mobGuiOpenDayActivity

function _mobGuiOpenDayActivity() {

    this.preNewDocument = function (gui, options) {
        gui.currentUserRow = CommonEngine.getUserNavRow(UserContext.CodUsr, UserContext.CodDiv, UserContext.CodGrp);
        return true;
    };

    this.getSaveConfirmationMessage = function (gui) {
        var doc = gui.getDocument();
        if (doc.get("NUMPALLETSTART") == 0 && doc.get("NUMBASKETSTART") == 0)
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_NOT_DEFINED]");

        return UserContext.tryTranslate("[MOB.SELLINGDAY.ASK_OPENDAY]");
    };

    this.afterGuiCreated = function (gui) {
        var backButton = app.viewport.getControllerToolbarBackButton();
        backButton.setText(UserContext.tryTranslate("[MOB.SELLINGDAY.OPEN_DAY]"));
        backButton.setIconCls('sm1-bt-contextual-icon guis_opendayactivity_navbar_openday_23');
        backButton.setIconAlign('top');
        backButton.addCls('sm1-bt sm1-bt-contextual');
        backButton.removeCls('sm1-bt sm1-bt-back');
    };

    this.afterNewDocument = function (gui, options) { 
        try {
            var openDayActivity = gui.getDocument();
            openDayActivity.set("IDDAY", XApp.newUserGUID());

            //User (CODUSR): active logged user (see point above). Not editable
            openDayActivity.set("CODUSR", UserContext.CodUsr);
            //Division (CODDIV): logged user "active" division. Not editable
            openDayActivity.set("CODDIV", UserContext.CodDiv);
            //Day (DTEDAY): it is the selling date; should be automatically populated with sysdate. Editable. Mandatory. Control: 1) DTEDAY can not be lower than today
            openDayActivity.set("DTEDAY", new Date().toDate());
            //Sales man (CODSALESUSR): automatically populated with originally logged user (CODUSRREAL). NOT EDITABLE
            openDayActivity.set("CODSALESMAN", UserContext.CodUsrReal ? UserContext.CodUsrReal : UserContext.CodUsr);

            if (gui.currentUserRow) {
                //store the warehouse associated to Van Sales Man (T031 CODWHSDELIV of the CODUSR).
                openDayActivity.set("CODWHSDELIV", gui.currentUserRow.get("CODWHSDELIV"));
                //Van (CODVEHICLE): automatically populated with the plate of the van associated to the user (CODUSR) T031.CODVEHICLE. Mandatory. editable from all the van associate to the same warehouse (list of VEHICLE QTABS where WHS optinfo =  T031.CODWHSDELIV from the logged user)
                var codVehicle = gui.currentUserRow.get("CODVEHICLE");
                if (!XApp.isEmptyOrWhitespaceString(codVehicle)) {
                    openDayActivity.set("CODVEHICLE", codVehicle);

                    //DESPLATE
                    var desPlate = UserContext.getRefdatValue("VEHICLE", codVehicle, "DESPLATE");
                    openDayActivity.set("DESPLATE", XApp.isEmptyOrWhitespaceString(desPlate) ? "" : desPlate.trim())

                    //The JOLLY VAN  will not automatically populated KM start  that will be empty and editable.
                    if (UserContext.getRefdatValue("VEHICLE", codVehicle, "JOLLYVAN") == true)
                        openDayActivity.set("NUMKMSTART", 0)
                    else
                        //VAN KM START (NUMKMSTART) – MANDATORY, EDITABLE, AUTOMATICALLY POPULATED FROM END PROCESS (NUMKMEND of the most recent record in CLOSED status for the same VAN)
                        SalesForceEngine.getNumKmEnd(codVehicle, XUI.showExceptionMsgBox, function (result) {
                            openDayActivity.set("NUMKMSTART", result);
                        });
                }
            }

            //update DTESTART (date and time) field with current date and time
            openDayActivity.set("DTESTART", new Date());

            gui.setModified(openDayActivity);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterLoad = function (gui) {
        var self = this;
        var doc = gui.getDocument();
        var localExecutionQueue = new ExecutionQueue();
        var action;

        //ROUTE (IDROUTE) automatically populated if present in the Van Laod order for the same day. MANDATORY EDITABLE with all the rule used at the moment for the same field on the order and organizer 
        this._updateRoute(gui, doc.get("IDROUTE") == 0);

        //check if shipping bill is already created
        action = function () {
            SalesForceEngine.findShippingBill(gui.currentUserRow.get("CODPARTY"),
         //failure
             function (e) {
                 XUI.showExceptionMsgBox(e);
                 localExecutionQueue.executeNext();
             },
             //success
             function (documentKey) {
                 self._shippingBillDocKey = documentKey;
                 localExecutionQueue.executeNext();
             });
        };
        localExecutionQueue.pushHandler(this, action);

        //check if CLOSED Van Load Order Exists
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'OPENDAY_MANDATORYLOAD')) {
            action = function () {
                self._checkForClosedVanLoadOrder(gui,
                 function (e) {
                     //failure 
                     XUI.showExceptionMsgBox(e);
                     localExecutionQueue.executeNext();
                 },
                 //success
                 function (documentKey) {
                     self._loadOrdDocKey = documentKey;
                     localExecutionQueue.executeNext();
                 });
            };

            localExecutionQueue.pushHandler(this, action);
        }
        //check if CLOSED Van Inventory Order Exists
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'OPENDAY_MANDATORYINVENTORY')) {
            action = function () {
                self._checkForClosedInvetoryOrder(gui,
                function (e) {
                    //failure
                    XUI.showExceptionMsgBox(e);
                    localExecutionQueue.executeNext();
                },
                //success
                function (documentKey) {
                    self._inventoryOrdDocKey = documentKey;
                    localExecutionQueue.executeNext();
                });
            };
            localExecutionQueue.pushHandler(this, action);
        }
        localExecutionQueue.pushHandler(this, function () {
            XUI.hideWait();
        });
        localExecutionQueue.executeNext();
        //keep wait, it will be hidden after checking the presence of various orders
        return true;
    };

    //Check if CLOSED Van Load Order Exists
    this._checkForClosedVanLoadOrder = function (gui, onFailure, onSuccess) {
        if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")))
            if (onSuccess)
                onSuccess(null);

        var findContext = {
            customer: gui.currentUserRow.get("CODPARTY"),
            dteDeliv: gui.getDocument().get("DTEDAY"),
            codTypOrds: [SalesForceNameSpace.OrderCTORD.LOAD],
            statuses: [SalesForceNameSpace.SM1OrderStatus.CLOSED],
            onFailure: onFailure,
            onSuccess: function (orderRow) {
                var documentKey = orderRow ? orderRow.get("DOCUMENTKEY") : null;
                if (onSuccess)
                    onSuccess(documentKey);
            }
        };
        SalesForceEngine.findOrder(findContext);
    };

    //Check if CLOSED Van Inventory Order Exists
    this._checkForClosedInvetoryOrder = function (gui, onFailure, onSuccess) {
        if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")))
            if (onSuccess)
                onSuccess(null);

        SalesForceEngine.findLastSellingDay(onFailure,
            function (lastClosedSellingEndDay) {
                var findContext = {
                    customer: gui.currentUserRow.get("CODPARTY"),
                    minDteCre: lastClosedSellingEndDay ? lastClosedSellingEndDay.get("DTEEND") : null,
                    codTypOrds: [SalesForceNameSpace.OrderCTORD.INVENTORY],
                    statuses: [SalesForceNameSpace.SM1OrderStatus.CLOSED],
                    onFailure: onFailure,
                    onSuccess: function (orderRow) {
                        var documentKey = orderRow ? orderRow.get("DOCUMENTKEY") : null;
                        if (onSuccess)
                            onSuccess(documentKey);
                    }
                };
                SalesForceEngine.findOrder(findContext);
            });
    };

    this.preFillSection = function (sectionContext) {
        switch (sectionContext.entityName) {
            case "PalletBasket":
                sectionContext.document.writeInPalletBasket()
                break;
        }
    };

    this.afterCardFieldCreation = function (f, context) {

        switch (context.sectionContext.entityName) {
            case "SellingDay":

                switch (context.fieldConfig.attrs.name) {
                    case "NUMBASKETSTART":
                    case "NUMPALLETSTART":

                        f.config.beforeShowSM1Picker = function (tapContext) {
                            tapContext.canceled = true;

                            XUI.authorizeFunction({
                                codFunction: CommonNameSpace.AUTHF.PALLET,
                                onFailure: Ext.emptyFn,
                                onSuccess: function (codusrauth) {
                                    if (XApp.isEmptyOrWhitespaceString(codusrauth)) {
                                        //no need to authorize: show standard numeric popup
                                        XUI.showNumberPicker(tapContext);
                                    }
                                    else {
                                        //action authorized: show right popup
                                        var gui = context.gui;
                                        var sellingDay = gui.getDocument();

                                        gui.openSubDetail({
                                            newEntity: sellingDay.getPalletBasket(),
                                            entityName: "PalletBasket",
                                            parentCtrl: context.detailContext,
                                            sectionContext: context.sectionContext,
                                            afterCloseHandler: function (opt) {
                                                if (opt.modified && !opt.canceled) {
                                                    sellingDay.readFromPalletBasket();
                                                    context.detailContext.refreshGui();
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        };

                        break;
                }

                break;
        }

        return f;
    };

    this.setNavigateButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "PalletBasket":
                //single fake detail entity
                context.visible = false;
                break;
        }
    };

    this.setRemoveButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "PalletBasket":
                //unremovable fake detail entity
                context.visible = false;
                break;
        }
    };

    this.setFieldStatus = function (context) {
        try {
            var fieldName = context.field.getName();
            var entity = context.field.fieldContext.sectionContext.entity;
            var entityName = context.field.fieldContext.sectionContext.entityName;

            switch (entityName) {
                case "SellingDay":
                    switch (fieldName) {
                        case "DTEDAY":
                            {
                                // Day (DTEDAY): it is the selling date; should be automatically populated with sysdate. Editable. Mandatory. Control: 1) DTEDAY can not be lower than today
                                var value = entity.get(fieldName);
                                if (!value || (new Date().toDate() - value) > 0) {
                                    context.valid = false;
                                }
                                break;
                            }
                        case "NUMKMSTART":
                            {
                                var value = entity.get(fieldName);
                                if (value <= 0) {
                                    context.valid = false;
                                }
                                break;
                            }
                        case "IDROUTE":
                            {
                                var value = entity.get(fieldName);
                                if (!value) {
                                    context.valid = false;
                                }
                                break;
                            }
                        case "CODVEHICLE":
                            {
                                var value = entity.get(fieldName);
                                if (XApp.isEmptyOrWhitespaceString(value)) {
                                    context.valid = false;
                                }
                                break;
                            }
                        case "DESPLATE":
                            {
                                //The selection of a JOLLY VAN allows the editability of the plate number.
                                //Plate number has to be mandatory without any formal control.
                                if (context.visible) {

                                    var selectedVan = entity.get("CODVEHICLE");
                                    if (!XApp.isEmptyOrWhitespaceString(selectedVan)) {    //The selection of a Jolly Van  type will not automatically populated KM start  that will be empty and editable.
                                        if (UserContext.getRefdatValue("VEHICLE", selectedVan, "JOLLYVAN") == true) {

                                            context.editable = true;
                                            var value = entity.get(fieldName);
                                            if (XApp.isEmptyOrWhitespaceString(value))
                                                context.valid = false;
                                        }
                                    }
                                }
                                break;
                            }
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.getQtabsVoices = function (fieldContext) {
        try {
            var fieldName = fieldContext.fieldName;
            var entityName = fieldContext.sectionContext.entityName;
            switch (entityName) {
                case "SellingDay":
                    switch (fieldName) {
                        case "CODASSISTANT":
                        case "CODDRIVER":
                            {
                                fieldContext.voices = SalesForceEngine.getAvailableAssistans();
                                break;
                            }
                        case "CODVEHICLE":
                            {
                                //Automatically populated with the plate of the van associated to the user (CODUSR) T031.CODVEHICLE.
                                //Mandatory. editable from all the van associate to the same warehouse (list of VEHICLE QTABS where
                                //WHS optinfo =  CODWHSDELIV from  active logged user 
                                var filterdVoices = []; //field is  mandatory

                                if (fieldContext.sectionContext.gui.currentUserRow) {
                                    var codWhs = fieldContext.sectionContext.gui.currentUserRow.get("CODWHSDELIV");

                                    var decodes = UserContext.getDecodeEntriesOrdered(fieldContext.qtabs, true);
                                    for (var i in decodes) {
                                        var codWhsRefdata = UserContext.getRefdatValue(fieldContext.qtabs, decodes[i].cod, "WHS");
                                        //The Jolly Van (“Jolly Van” optinfo = true) has to be always available in the list in open day screen. 
                                        if (UserContext.getRefdatValue(fieldContext.qtabs, decodes[i].cod, "JOLLYVAN") == true || (codWhsRefdata && !XApp.isEmptyOrWhitespaceString(codWhs) && codWhsRefdata.trim() == codWhs.trim()))
                                            filterdVoices.push({ value: decodes[i].cod, text: decodes[i].des });
                                    }
                                }
                                fieldContext.voices = filterdVoices;
                                break;
                            }
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newValue, oldValue) {
        try {
            var self = this;
            var sectionContext = ctrl.fieldContext.sectionContext;
            var gui = sectionContext.gui;
            var entity = sectionContext.entity;

            switch (entity.getEntityName()) {
                case "SellingDay":
                    switch (fieldName) {
                        case "CODVEHICLE":
                            {
                                //VAN KM START (NUMKMSTART) – MANDATORY, EDITABLE, AUTOMATICALLY POPULATED FROM END PROCESS (NUMKMEND of the most recent record in CLOSED status for the same VAN)
                                if (!XApp.isEmptyOrWhitespaceString(newValue)) {    //The selection of a Jolly Van  type will not automatically populated KM start  that will be empty and editable.

                                    if (UserContext.getRefdatValue("VEHICLE", newValue, "JOLLYVAN") == true)
                                        entity.set("NUMKMSTART", 0)
                                    else
                                        SalesForceEngine.getNumKmEnd(newValue, XUI.showExceptionMsgBox, function (result) {
                                            entity.set("NUMKMSTART", result);
                                        });
                                }
                                else
                                    entity.set("NUMKMSTART", 0);

                                //DESPLATE
                                var desPlate = UserContext.getRefdatValue("VEHICLE", newValue, "DESPLATE");
                                entity.set("DESPLATE", XApp.isEmptyOrWhitespaceString(desPlate) ? "" : desPlate.trim())

                                gui.refreshGui();
                                break;
                            }
                        case "DTEDAY":
                            {
                                if (newValue - oldValue != 0) {
                                    self._updateRoute(gui, true);
                                }
                                break;
                            }
                        case "NUMKMSTART":
                            {
                                if (!XApp.isEmptyOrWhitespaceString(entity.get("CODVEHICLE")) && newValue > 0) {
                                    //The modification of NUMKMSTART for a JOLLY VAN will not trigger the validation of NUMKMEND
                                    if (UserContext.getRefdatValue("VEHICLE", newValue, "JOLLYVAN") == false)
                                        SalesForceEngine.getNumKmEnd(entity.get("CODVEHICLE"), XUI.showExceptionMsgBox, function (result) {
                                            if (result && newValue < result)
                                                XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.SELLINGDAY.NUMKMSTART_LOWER_THAN_NUMKMEND]') + result.toString() });
                                        });
                                }

                                break;
                            }
                    };
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.preCreateLink = function (context) {
        try {

            switch (context.linkRow.code) {
                case "VAN_LOAD_LNK":
                case "SELLINGDAY.VAN_LOAD_LNK":
                case "MOB.SELLINGDAY.VAN_LOAD_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_load_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_VANLOAD');
                        break;
                    }
                case "VAN_INTEGRATION_LNK":
                case "SELLINGDAY.VAN_INTEGRATION_LNK":
                case "MOB.SELLINGDAY.VAN_INTEGRATION_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_integration_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_VANINTEGRATION');
                        break;
                    }
                case "VAN_UNLOAD_LNK":
                case "SELLINGDAY.VAN_UNLOAD_LNK":
                case "MOB.SELLINGDAY.VAN_UNLOAD_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_unload_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_VANUNLOAD');
                        break;
                    }
                case "ADJUSTMENT_LNK":
                case "SELLINGDAY.ADJUSTMENT_LNK":
                case "MOB.SELLINGDAY.ADJUSTMENT_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_stock_correction_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_ADJUSTMENT');
                        break;
                    }
                case "INVENTORY_LNK":
                case "SELLINGDAY.INVENTORY_LNK":
                case "MOB.SELLINGDAY.INVENTORY_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_inventory_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_INVENTORY');
                        break;
                    }
                case "PRINT_LNK":
                case "SELLINGDAY.PRINT_LNK":
                case "MOB.SELLINGDAY.PRINT_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_shipping_bill_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_PRINT');
                        break;
                    }
                case "ALERTS_LNK":
                case "SELLINGDAY.ALERTS_LNK":
                case "MOB.SELLINGDAY.ALERTS_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_alerts_19";
                        context.canceled = UserContext.isFullOfflineMode() || !UserContext.checkRight("NAV_MOB_ALERTS", "NAV_MOB_ALERTS", 'NAVIGATE');
                        break;
                    }
            }

            if (!this._visibleLinksCount)
                this._visibleLinksCount = 0;
            if (!context.canceled)
                this._visibleLinksCount++;

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterSectionCreated = function (context) {
        try {

            var sectionName = context.sectionConfig.attrs["caption"];
            switch (sectionName) {
                case "ACTIONS":
                    {
                        //hide links section if user has no right for the links inside
                        if (!this._visibleLinksCount)
                            context.panel.setHidden(true);
                        break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterCardFieldCreation = function (field, context) {
        var self = this;
        switch (context.detailContext.entityName) {
            case "SellingDay":

                switch (context.fieldConfig.attrs.name) {
                    case "NUMKMSTART":
                    case "NUMPALLETSTART":
                    case "NUMBASKETSTART":
                        if (context.fieldConfig.attrs.minVal == null || context.fieldConfig.attrs.minVal == undefined) {
                            context.fieldConfig.attrs.minVal = 0;
                        }

                        field.config.minValue = context.fieldConfig.attrs.minVal;

                        break;
                }

                break;
        }

        return field;
    };

    this.openCustomLink = function (context) {
        try {

            var gui = context.ctrl;
            var self = this;
            var findContext;
            switch (context.linkRow.get("code")) {
                case "VAN_LOAD_LNK":
                case "SELLINGDAY.VAN_LOAD_LNK":
                case "MOB.SELLINGDAY.VAN_LOAD_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                            findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteDeliv: context.entity.get("DTEDAY"),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.LOAD],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.CLOSED],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self._openExistingOrder(gui, orderRow, context.entity.get("IDDAY"));
                                    } else {
                                        XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.SELLINGDAY.VAN_LOAD_ORDER_NOT_FOUND]") });
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.SELLINGDAY.VAN_LOAD_ORDER_NOT_FOUND]") });
                        }

                        break;
                    }
                case "VAN_INTEGRATION_LNK":
                case "SELLINGDAY.VAN_INTEGRATION_LNK":
                case "MOB.SELLINGDAY.VAN_INTEGRATION_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                            findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteDeliv: context.entity.get("DTEDAY"),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.LOADINTEGRATION],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO, SalesForceNameSpace.SM1OrderStatus.CLOSED],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self._openExistingOrder(gui, orderRow, context.entity.get("IDDAY"));
                                    } else {
                                        self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.LOADINTEGRATION, context.entity.get("IDDAY"));
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.LOADINTEGRATION, context.entity.get("IDDAY"));
                        }
                        break;
                    }
                case "VAN_UNLOAD_LNK":
                case "SELLINGDAY.VAN_UNLOAD_LNK":
                case "MOB.SELLINGDAY.VAN_UNLOAD_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                            findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteOrd: XApp.today(),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.UNLOAD],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self._openExistingOrder(gui, orderRow, context.entity.get("IDDAY"));
                                    } else {
                                        self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD, context.entity.get("IDDAY"));
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD, context.entity.get("IDDAY"));
                        }
                        break;
                    }
                case "ADJUSTMENT_LNK":
                case "SELLINGDAY.ADJUSTMENT_LNK":
                case "MOB.SELLINGDAY.ADJUSTMENT_LNK":
                    {
                        this._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.ADJUSTMENT, context.entity.get("IDDAY"));
                        break;
                    }
                case "INVENTORY_LNK":
                case "SELLINGDAY.INVENTORY_LNK":
                case "MOB.SELLINGDAY.INVENTORY_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {

                            var findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteOrd: XApp.today(),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.INVENTORY],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self._openExistingOrder(gui, orderRow, context.entity.get("IDDAY"));
                                    } else {
                                        self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY, context.entity.get("IDDAY"));
                                    }
                                }
                            };

                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY, context.entity.get("IDDAY"));
                        }
                        break;
                    }
                case "PRINT_LNK":
                case "SELLINGDAY.PRINT_LNK":
                case "MOB.SELLINGDAY.PRINT_LNK":
                    {
                        this._handlePrintLink(context);
                        break;
                    }
                case "ALERTS_LNK":
                case "SELLINGDAY.ALERTS_LNK":
                case "MOB.SELLINGDAY.ALERTS_LNK":
                    {
                        XHistory.go({
                            controller: app.getSM1Controllers().nav,
                            action: 'show',
                            id: "NAV_MOB_ALERTS"
                        });
                        break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.getMenuButtons = function (context) {
        context.buttons.push({
            msg: UserContext.tryTranslate("[MOB.SHOW_ROUTE]"),
            id: 'mobguiopendayactivity-contextualmenu-show-route',
            iconCls: "guis_opendayactivity_navbar_showroute_23",
            handler: (function (doc) {
                return function () { SalesExecutionEngine.showRoute(doc.get("IDROUTE")) };
            })(context.ctrl.getDocument())
        });
    };

    this._openExistingOrder = function (gui, orderRow, idDay) {

        var canHandleOrder = SalesForceEngine.canHandleOrder(orderRow.get("CODTYPORD"));
        if (!canHandleOrder.returnValue) {
            XUI.showMsgBox({
                msg: canHandleOrder.message,
                icon: canHandleOrder.messageType,
                buttons: 'OK',
                onResult: Ext.emptyFn
            });
        } else {

            gui._storeDocOnTempCache();
            XHistory.go({
                controller: app.getSM1Controllers().gui,
                action: 'show',
                docKey: orderRow.get("DOCUMENTKEY"),
                docName: 'SM1Order',
                guiName: 'mobGuiOrder',
                selectedNavRow: orderRow,
                idDay: idDay,
                openMode: UserContext.checkRight("NAV_MOB_VANMOVEMENTS", "NAV_MOB_VANMOVEMENTS", 'EDIT') ? 'EDIT' : 'VIEW',
            });
        }
    };

    this._openNewOrder = function (gui, orderType, idDay) {
        try {
            var orderDate = (new Date()).toDate();

            if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                XLog.logErr("Missing NAV_MOB_USERS.CODPARTY. Cannot create new order.");
                XUI.showInfoOk({ msg: UserContext.tryTranslate("MOB.SELLINGDAY.CANNOT_CREATE_NEW_ORDER") });
                return;
            }

            if (UserContext.checkAppReadOnly()) {
                XLog.logErr("Cannot create new order due for the application beeing in read-only mode.");
                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOB.SELLINGDAY.NO_NEW_ORDER_GRANT]") });
                return;
            }

            XUI.showWait();
            SalesForceEngine.canCreateSpecificOrder(gui.currentUserRow.get("CODPARTY"), orderDate, orderType,
                function (canCreateOrder) {
                    XUI.hideWait();
                    if (!canCreateOrder.returnValue) {
                        XUI.showMsgBox({
                            msg: canCreateOrder.message,
                            icon: canCreateOrder.messageType,
                            buttons: 'OK',
                            onResult: Ext.emptyFn
                        });
                    } else {
                        gui._storeDocOnTempCache();
                        XHistory.go({
                            controller: app.getSM1Controllers().gui,
                            action: 'show',
                            codParty: gui.currentUserRow.get("CODPARTY"),
                            docName: 'SM1Order',
                            guiName: 'mobGuiOrder',
                            orderDate: orderDate,
                            orderType: orderType,
                            idDay: idDay,
                            openMode: 'NEW'
                        });
                    }
                }
            );
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.validateDocument = function (gui) {

        delete gui.errorReports["SHIPPINGBILL"];
        delete gui.errorReports["VANLOAD_STATUS"];
        delete gui.errorReports["VANINVENTORY_STATUS"];
        delete gui.errorReports["IDROUTE"];
        var valid = (!gui.errorReports || gui.errorReports.length == 0);

        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'OPENDAY_MANDATORYLOAD') &&
            XApp.isEmptyOrWhitespaceString(this._loadOrdDocKey)) {
            gui.errorReports["VANLOAD_STATUS"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.VANLOAD_STATUS]")
            };
            valid = false;
        }

        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'OPENDAY_MANDATORYINVENTORY') &&
            XApp.isEmptyOrWhitespaceString(this._inventoryOrdDocKey)) {
            gui.errorReports["VANINVENTORY_STATUS"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.VANINVENTORY_STATUS]")
            };
            valid = false;
        }

        //if IDROUTE field is visible, can't open selling day without a route selected
        var doc = gui.getDocument();
        var routeField = gui.detailCtrl.fields.IDROUTE;
        if (!routeField.isHidden() && doc && !doc.get("IDROUTE")) {
            gui.errorReports["IDROUTE"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.MISSING_IDROUTE]")
            };
            valid = false;
        }

        //can't open selling day without a shipping bill
        if (XApp.isEmptyOrWhitespaceString(this._shippingBillDocKey)) {
            gui.errorReports["SHIPPINGBILL"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.MISSING_SHIPPINGBILL]")
            };
            valid = false;
        }
        return valid;
    };

    this.onSaveDocument = function (gui, doc, onSuccess) {
        // UPDATE in STARTED status the record of sellingday 
        doc.set("CODSTATUS", SalesForceNameSpace.SellingDayStatus.STARTED);

        onSuccess(); //continue save
    };

    this.afterSaveDocument = function (gui, doc, onError, onSuccess) {

        var self = this;
        var finishHandler = function () {

            //open the organizer in daily view if the user has the right. If the user has not the right simply close the form
            if (UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.ViewRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.ViewRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.ViewRight.codFunc)) {

                gui._clearTempDocument();
                XHistory.hist.pop();

                //notify leave
                self.afterNotifyLeave(null);

                if (XHistory.hist[XHistory.hist.length - 1].id == "MOB_ORGANIZER") {
                    XHistory.hist.pop();
                }

                //open organizer
                XHistory.go({
                    controller: app.getSM1Controllers().organizerFrame,
                    action: 'show',
                    id: "MOB_ORGANIZER"
                });
            } else {
                //continue normal gui operation
                if (onSuccess)
                    onSuccess();
            }
        };

        //Generate visits for the selected ROUTE for the DTEDAY starting at SYSDATE if SYSDATE 
        //is in the same day of DTEDAY, otherwise at the default starting working time (ORGANIZER_WORKING_HOURDAYSTART)
        var idRoute = doc.get("IDROUTE");
        if (idRoute != 0) {

            var startTime = ParametersDefaultsAndStaticData.getInstance().getOrganizerWorkingHourDayStart();
            if (doc.get("DTEDAY").toDate() - XApp.today() == 0) {
                startTime = SalesExecutionEngine.getClosestHour("STARTING", new Date());
            }

            XUI.showWait();

            SalesExecutionEngine.addRouteToScheduler({
                documentkey: "Route|" + UserContext.CodUsr + "|" + idRoute,
                date: doc.get("DTEDAY"),
                hourFrom: startTime,
                onError: function () {
                    XUI.showWarnOk({
                        msg: UserContext.tryTranslate("[MOBVISIT.UNABLE_TO_PLAN_ROUTE]")
                    });
                    XUI.hideWait();

                    finishHandler(); //continue normal gui operation
                },
                onVisitPlanned: function (doc, date, from, to, codparty, notifyCaller) {
                    XDocs.saveDocument(doc, false,
                        function (e) {
                            XLog.logWarn("SalesExecutionEngine.addRouteToScheduler: Failure to save document for client: " + codparty);
                            if (notifyCaller)
                                notifyCaller(false); // appointment and document has not saved . The time slot should be considered as free and process should continue
                        },
                        function (savedDocument) {
                            if (savedDocument != null) {
                                SalesExecutionEngine.updateCache(savedDocument, [], null, "NEW", XUI.showExceptionMsgBox,
                                    function () {
                                        if (notifyCaller)
                                            notifyCaller(true); // appointment and document has been saved succesfully. The time slot should be considered as used and process should continue
                                    });
                            } else {
                                XLog.logWarn("SalesExecutionEngine.addRouteToScheduler: Failure to save document for client: " + codparty);
                                if (notifyCaller)
                                    notifyCaller(false); // appointment and document has not saved . The time slot should be considered as free and process should continue
                            }

                        }, false);
                },

                //show error message if the route can't be scheduled
                onFinish: function (errorMessages) {
                    if (!XApp.isEmptyOrWhitespaceString(errorMessages))
                        XUI.showWarnOk({ msg: errorMessages });

                    XUI.hideWait();

                    finishHandler(); //continue normal gui operation
                }
            });
        } else
            finishHandler(); //continue normal gui operation

    };

    this.afterNotifyLeave = function (context) {
        delete this._shippingBillDocKey;
        delete this._loadOrdDocKey;
        delete this._inventoryOrdDocKey;
        delete this._visibleLinksCount;

        var backButton = app.viewport.getControllerToolbarBackButton();
        backButton.setText('');
        backButton.setIconCls('');
        backButton.setIconAlign('');
        backButton.removeCls('sm1-bt sm1-bt-contextual');
        backButton.addCls('sm1-bt sm1-bt-back');

        app.viewport._mainMenu.fill();
    };

    /*
    ROUTE (IDROUTE) automatically populated if present in the Van Laod order for the same day. MANDATORY EDITABLE with all the rule used at the moment for the same field on the order and organizer 
    */
    this._updateRoute = function (gui, resetRoute) {
        try {
            var doc = gui.getDocument();
            var date = doc.get("DTEDAY");

            var optionOrderRoutes = SalesForceEngine.getOrderRoutes(date, false);
            gui.detailCtrl.fields.IDROUTE.setOptions(optionOrderRoutes);

            if (resetRoute && optionOrderRoutes) {

                //if there is only one route available, it is the default one
                var defaultRoute = optionOrderRoutes.length == 1 ? optionOrderRoutes[0].value : 0;

                if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                    //search for the route associated to the van load order

                    var findContext = {
                        customer: gui.currentUserRow.get("CODPARTY"),
                        dteDeliv: date,
                        codTypOrds: [SalesForceNameSpace.OrderCTORD.LOAD],
                        statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.CLOSED],
                        onFailure: XUI.showExceptionMsgBox,
                        onSuccess: function (orderRow) {
                            var idRoute = orderRow ? orderRow.get("IDROUTE") : 0;
                            if (idRoute == 0)
                                idRoute = defaultRoute;

                            doc.set("IDROUTE", idRoute);
                            gui.refreshGui();
                        }
                    };

                    SalesForceEngine.findOrder(findContext);
                }
                else {
                    doc.set("IDROUTE", defaultRoute);
                    gui.refreshGui();
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    /*
    The link prints the shipping bill document.
    If the document doesn't exist, it is generated first.
    */
    this._handlePrintLink = function (context) {
        var self = this;
        var gui = context.ctrl;

        //shipping bill already exists
        if (!XApp.isEmptyOrWhitespaceString(this._shippingBillDocKey)) {
            this._printShippingBill();
        }
        else {
            //shipping bill has to be created
            XUI.showWait();
            SalesForceEngine.checkCustomerCoordinates(gui.currentUserRow.get("CODPARTY"), SalesForceNameSpace.OrderCTORD.SHIPPINGBILL,
                function () {
                    XUI.hideWait();
                    XUI.showWarnOk({
                        msg: UserContext.tryTranslate('[MOBORDER.INVALID_CUSTOMER_LOCATION]')
                    });
                },
                function () {

                    var onFailure = function (e) {
                        XUI.hideWait();
                        XUI.showExceptionMsgBox(e);
                    };

                    SalesForceEngine.createShippingBill(gui.currentUserRow.get("CODPARTY"), gui.currentUserRow.get("CODWHSSALES"),
                        onFailure,
                        function (shippingBill) {
                            if (shippingBill) {
                                //save newly created shipping bill document
                                shippingBill.set("IDDAY", context.entity.get("IDDAY"));
                                XDocs.saveDocument(shippingBill,
                                    SM1OrderHelper.managedOnlyOnline(shippingBill.get("CODTYPORD")),
                                    onFailure,
                                    function (savedShippingBill) {
                                        XUI.hideWait();
                                        self._shippingBillDocKey = savedShippingBill.get("DOCUMENTKEY");
                                        self._printShippingBill();
                                    });
                            }
                            else {
                                XUI.hideWait();
                            }
                        });
                });
        }
    };

    this._printShippingBill = function () {
        XUI.showInfoOk({ msg: "PRINT " + this._shippingBillDocKey });
    };
}

XApp.registerGuiExtension("mobGuiOpenDayActivity", new _mobGuiOpenDayActivity());

//#endregion mobGuiOpenDayActivity