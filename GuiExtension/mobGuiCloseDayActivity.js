function _mobGuiCloseDayActivity() {

    this.beforeUiRendering = function (context) {

        var gui = context.gui;
        gui.currentUserRow = CommonEngine.getUserNavRow(UserContext.CodUsr, UserContext.CodDiv, UserContext.CodGrp);

        this._calculateSummaryFields(gui, function () {
            context.queue.executeNext();
        },
            function (e) {
                XUI.showExceptionMsgBox(e);
                context.queue.executeNext();
            });

        context.executeNext = false;

        //if flag set, check if there are invalid deposits when returning from deposit UI and show message
        var lastWindow = XHistory.hist[XHistory.hist.length - 1];
        //if flag is false, skip the deposits check because it was already done
        if (lastWindow.shouldTryClosingDeposits != undefined && lastWindow.shouldTryClosingDeposits == true && lastWindow.guiName == "mobGuiCloseDayActivity") {
            var deposits = CommonEngine.getOpenDeposits();
            CommonEngine.closeDeposits(deposits, function (e) {
                XUI.hideWait();
                XUI.showExceptionMsgBox(e);
            });
        }
        else if (lastWindow.shouldTryClosingDeposits != undefined) {
            //reset flag
            lastWindow.shouldTryClosingDeposits = true;
        }
    };

    this.getSaveConfirmationMessage = function (gui) {
        var doc = gui.getDocument();
        //update Z_CHECKER_END 
        var checkerCode = UserContext.UserData.SM1User.CODAUTHMODE;
        doc.set("Z_CHECKER_END", checkerCode);

        if (doc.get("NUMPALLETSTART") != doc.get("NUMPALLETEND") || doc.get("NUMBASKETSTART") != doc.get("NUMBASKETEND"))
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_DIFFERENT_FROM_OPENDAY]");

        return UserContext.tryTranslate("[MOB.SELLINGDAY.ASK_CLOSEDAY]");
    };

    this.afterGuiCreated = function (gui) {
        var backButton = app.viewport.getControllerToolbarBackButton();
        backButton.setText(UserContext.tryTranslate("[MOB.SELLINGDAY.CLOSE_DAY]"));
        backButton.setIconCls('sm1-bt-contextual-icon guis_closedayactivity_navbar_closeday_23');
        backButton.setIconAlign('top');
        backButton.addCls('sm1-bt sm1-bt-contextual');
        backButton.removeCls('sm1-bt sm1-bt-back');
    };

    this.afterNotifyLeave = function (context) {
        delete this._vanNotUnloaded;
        delete this._inventoryOrdDocKey;
        delete this._visibleLinksCount;
        delete context.ctrl.cacheData;

        var backButton = app.viewport.getControllerToolbarBackButton();
        backButton.setText('');
        backButton.setIconCls('');
        backButton.setIconAlign('');
        backButton.removeCls('sm1-bt sm1-bt-contextual');
        backButton.addCls('sm1-bt sm1-bt-back');
    };

    this.afterLoadDocument = function (gui) {
        var doc = gui.getDocument();
        //set min value for NUMKMEND
        if (!doc.get("NUMKMEND")) {
            doc.set("NUMKMEND", doc.get("NUMKMSTART"));
            gui.setModified(doc);
        }
    };

    this.afterLoad = function (gui) {
        var localExecutionQueue = new ExecutionQueue();
        var action;
        var self = this;

        //- Check if the VAN is fully unloaded
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYUNLOAD')) {
            action = function () {
                self._checkVanLoad(gui,
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                        localExecutionQueue.executeNext();
                    },
                    function (sellableProductsPresent) {
                        self._vanNotUnloaded = sellableProductsPresent;
                        localExecutionQueue.executeNext();
                    });
            };
            localExecutionQueue.pushHandler(this, action);
        }

        //check if CLOSED Van Inventory Order Exists
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY')) {
            action = function () {
                self._checkForClosedVanInvetoryOrder(gui,
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                        localExecutionQueue.executeNext();
                    },
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

    this._getInvoicesOrderTypes = function () {
        var orderTypes = [];
        var ctorQtab = UserContext.getDecodeTable("CTORD");
        for (var codTypOrd in ctorQtab) {
            if (SM1OrderHelper.isAnInvoice(codTypOrd)) {
                orderTypes.push(codTypOrd);
            }
        }
        return orderTypes;
    };

    this._checkInvoicedOrder = function (onFailure, onSuccess) {
        var self = this;
        var findContext = {
            codTypOrds: self._getInvoicesOrderTypes(),
            statuses: [SalesForceNameSpace.SM1OrderStatus.INVOICED, SalesForceNameSpace.SM1OrderStatus.DELIVERED],
            onFailure: onFailure,
            onSuccess: onSuccess
        };
        SalesForceEngine.findOrder(findContext);
    };

    //Check if the van was unloaded of SELLABLE products
    //Return true if there are SELLABLE products present in the VAN WAREHOUSE
    this._checkVanLoad = function (gui, onFailure, onSuccess) {

        //create an object containing the conversion data
        gui.CacheData = {
            m_prodConv: SalesForceEngine.getProductConversions(UserContext.CodDiv)
        };

        //get the Report data and populate the grid store
        SalesForceEngine.calculateWarehouseBalance(gui.currentUserRow.get("CODWHSSALES"), '', gui.CacheData,
             function (response) {
                 var sellableProductsPresent = false;
                 //success
                 if (response) {
                     for (var prodBalKey in response.OrdProdWhsBalances) {
                         var prodWhsBalance = response.OrdProdWhsBalances[prodBalKey];
                         if (prodWhsBalance.QTYORD > 0 && SM1OrderHelper.isSellable(prodWhsBalance.CODTYPROW)) {
                             sellableProductsPresent = true;
                             break;
                         }
                     }
                 }

                 if (onSuccess)
                     onSuccess(sellableProductsPresent);
             }, onFailure);

    };

    //check if CLOSED Van Inventory Order Exists
    this._checkForClosedVanInvetoryOrder = function (gui, onFailure, onSuccess) {
        if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")))
            if (onSuccess)
                onSuccess(null);

        this._checkInvoicedOrder(onFailure, function (invoiceOrderRow) {
            var findContext = {
                customer: gui.currentUserRow.get("CODPARTY"),
                minDteClose: invoiceOrderRow ? invoiceOrderRow.get("DTECLOSE") : null,
                codTypOrds: [SalesForceNameSpace.OrderCTORD.INVENTORY],
                statuses: [SalesForceNameSpace.SM1OrderStatus.CLOSED],
                onFailure: onFailure,
                onSuccess: function (orderRow) {
                    var documentKey = orderRow ? orderRow.get("DOCUMENTKEY") : "";
                    if (onSuccess)
                        onSuccess(documentKey);
                }
            };
            SalesForceEngine.findOrder(findContext);
        });
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
                        case "IDROUTE":
                            {
                                fieldContext.voices = SalesForceEngine.getOrderRoutes(fieldContext.sectionContext.entity.get("DTEDAY"), true);
                                break;
                            }
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.preCreateLink = function (context) {
        try {

            if (!this._visibleLinksCount)
                this._visibleLinksCount = 0;

            switch (context.linkRow.code) {
                case "VAN_UNLOAD_LNK":
                case "SELLINGDAY.VAN_UNLOAD_LNK":
                case "MOB.SELLINGDAY.VAN_UNLOAD_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_unload_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_VANUNLOAD');
                        if (!context.canceled)
                            this._visibleLinksCount++;
                        break;
                    }
                case "ADJUSTMENT_LNK":
                case "SELLINGDAY.ADJUSTMENT_LNK":
                case "MOB.SELLINGDAY.ADJUSTMENT_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_stock_correction_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_ADJUSTMENT');
                        if (!context.canceled)
                            this._visibleLinksCount++;
                        break;
                    }
                case "INVENTORY_LNK":
                case "SELLINGDAY.INVENTORY_LNK":
                case "MOB.SELLINGDAY.INVENTORY_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_inventory_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_INVENTORY');
                        if (!context.canceled)
                            this._visibleLinksCount++;
                        break;
                    }
                case "VAN_LOAD_LNK":
                case "SELLINGDAY.VAN_LOAD_LNK":
                case "MOB.SELLINGDAY.VAN_LOAD_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_van_load_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "SELLINGDAY", 'LNK_VANLOAD');
                        if (!context.canceled)
                            this._visibleLinksCount++;
                        break;
                    }
                case "NAV_MOB_ORDERS":
                case "SELLINGDAY.NAV_MOB_ORDERS":
                case "MOB.SELLINGDAY.NAV_MOB_ORDERS":
                    //Orders placed in the open day: Order navigator filtered by DTECLOSE BETWEEN Opened selling day.DTESTART AND SYSDATE
                    context.linkRow.hcs = new XConstraints({
                        logicalOp: "AND",
                        constraints: [
                        new XConstraint("DTECLOSE", ">=", context.ctrl.entity.get("DTESTART")),
                        new XConstraint("DTECLOSE", "<=", new Date())
                        ]
                    });
                    break;
                case "NAV_MOB_VANMOVEMENTS":
                case "SELLINGDAY.NAV_MOB_VANMOVEMENTS":
                case "MOB.SELLINGDAY.NAV_MOB_VANMOVEMENTS":
                    //Add in close day recap tab a new carousel item with all the Van Movements (T100.DTECLOSE BETWEEN TA0300.DTESTART and SYSDATE + T100.codeuser = TA0300.CODUSR + T100.CODDIV = TA0300.CODDIV for the link)
                    context.linkRow.hcs = new XConstraints({
                        logicalOp: "AND",
                        constraints: [
                        new XConstraint("DTECLOSE", ">=", context.ctrl.entity.get("DTESTART")),
                        new XConstraint("DTECLOSE", "<=", new Date()),
                        new XConstraint("CODEUSR", "=", context.ctrl.entity.get("CODUSR")),
                        new XConstraint("CODDIV", "=", context.ctrl.entity.get("CODDIV"))
                        ]
                    });
                    break;
                case "NAV_MOB_VISITS":
                case "SELLINGDAY.NAV_MOB_VISITS":
                case "MOB.SELLINGDAY.NAV_MOB_VISITS":
                    //Visit navigator Document: filtered by DTEVISIT = current open selling day DTEDAY (both without hour)
                    context.linkRow.hcs = new XConstraints({
                        logicalOp: "AND",
                        constraints: [
                        new XConstraint("DTEVISIT", "=", context.ctrl.entity.get("DTEDAY"))
                        ]
                    });
                    context.linkRow.search = false;
                    break;

                case "NAV_MOB_DEPOSIT":
                case "SELLINGDAY.NAV_MOB_DEPOSIT":
                case "MOB.SELLINGDAY.NAV_MOB_DEPOSIT":
                    //Opened Payment collection and payment collection included in the open selling day: 
                    //filtered by (DTEDEP <= SYSDATE  status active - 0) OR (DTEDEP >= DTESTART of the current open selling day) 
                    context.linkRow.hcs = new XConstraints({
                        logicalOp: "OR",
                        constraints: [
                            new XConstraint("CODSTATUS", "=", CommonNameSpace.DepositStatus.Opened),
                            new XConstraint("DTEDEP", "=", new Date().toDate())
                        ]
                    });
                    break;
            }

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
                    case "NUMKMEND":
                    case "NUMPALLETEND":
                    case "NUMBASKETEND":
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
        var self = this;
        var gui = context.ctrl;

        try {
            var findContext;
            switch (context.linkRow.get("code")) {

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
                                        self._openExistingOrder(gui, orderRow);
                                    } else {
                                        self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                        }
                        break;
                    }
                case "ADJUSTMENT_LNK":
                case "SELLINGDAY.ADJUSTMENT_LNK":
                case "MOB.SELLINGDAY.ADJUSTMENT_LNK":
                    {
                        this._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.ADJUSTMENT);
                        break;
                    }
                case "INVENTORY_LNK":
                case "SELLINGDAY.INVENTORY_LNK":
                case "MOB.SELLINGDAY.INVENTORY_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                            findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteOrd: XApp.today(),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.INVENTORY],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self._openExistingOrder(gui, orderRow);
                                    } else {
                                        self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY);
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY);
                        }
                        break;
                    }
                case "VAN_LOAD_LNK":
                case "SELLINGDAY.VAN_LOAD_LNK":
                case "MOB.SELLINGDAY.VAN_LOAD_LNK":
                    {
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")))
                            self._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.LOAD);
                        break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onSaveDocument = function (gui, doc, onSuccess) {
        // remove other Day Recap or Close day activity UI's from history if the day is closed
        if (XHistory.hist.length > 2) {
            for (var i = 0; i < XHistory.hist.length - 1; i++) {
                if (XHistory.hist[i].guiName && (XHistory.hist[i].guiName == 'mobGuiCloseDayRecap' || XHistory.hist[i].guiName == 'mobGuiCloseDayActivity')) {
                    XHistory.hist.splice(i, 1);
                    i--;
                }
            }
        }
        // UPDATE in CLOSED status the record of sellingday 
        doc.set("CODSTATUS", SalesForceNameSpace.SellingDayStatus.CLOSED);
        //update DTEEND field with current date and time
        doc.set("DTEEND", new Date());

        //update Z_CHECKER_END if exsits mady 10/10/2021
        var checkerCode = UserContext.UserData.SM1User.CODAUTHMODE;
        doc.set("Z_CHECKER_END", checkerCode);

        onSuccess(); //continue save
    };

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {

        try {
            //if data sync is needed, don't go back to the previous ui
            if (SellingDayParameters.getInstance().getForceSyncCloseDay()) {
                gui._clearTempDocument();
                XHistory.clear();
                XUI.hideWait();
                app.viewport.refreshViewport({ refreshOnStart: true });
                }
            else {
                onSuccess();
            }
        } catch (e) {
            if (onFailure)
                onFailure(e);
        }
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
                    case "NUMBASKETEND":
                    case "NUMPALLETEND":

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
                        case "NUMKMEND":
                            var value = entity.get(fieldName);
                            if (value <= 0) {
                                context.valid = false;
                            }
                            break;
                        case "VALINVENC":
                            //ENH #33243: Close day: show the Total encashment related to cash invoices in red, if it’s different than the total sales in cash
                            if (entity.get("VALINVENC") != entity.get("CASHAMOUNT")) {
                                context.valid = false;
                            }
                            break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newValue, oldValue) {
        try {
            var sectionContext = ctrl.fieldContext.sectionContext;
            var entity = sectionContext.entity;

            switch (entity.getEntityName()) {
                case "SellingDay":
                    switch (fieldName) {
                        case "NUMKMEND":
                            if (newValue > 0) {
                                if (entity.get("NUMKMSTART") > newValue)
                                    XUI.showWarnOk({
                                        msg: UserContext.tryTranslate('[MOB.SELLINGDAY.NUMKMEND_LOWER_THAN_NUMKMSTART]') + entity.get("NUMKMSTART")
                                    });
                            }
                            break;
                    };
                    break;
            }

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this._openExistingOrder = function (gui, orderRow) {

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
                openMode: UserContext.checkRight("NAV_MOB_VANMOVEMENTS", "NAV_MOB_VANMOVEMENTS", 'EDIT') ? 'EDIT' : 'VIEW'
            });
        }
    };

    this._openNewOrder = function (gui, orderType) {
        try {
            var orderDate = (new Date()).toDate();

            if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                XLog.logErr("Missing NAV_MOB_USERS.CODPARTY. Cannot create new order.");
                XUI.showInfoOk({
                    msg: UserContext.tryTranslate("MOB.SELLINGDAY.CANNOT_CREATE_NEW_ORDER")
                });
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
                           openMode: 'NEW'
                       });
                   }
               });
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.validateDocument = function (gui) {
        delete gui.errorReports["CLOSEDAY_VANUNLOAD_STATUS"];
        delete gui.errorReports["CLOSEDAY_VANINVENTORY_STATUS"];
        delete gui.errorReports["FORCE_SYNC_CLOSEDAY"];

        var valid = true;

        //If data must be synchronized after closing, connectivity is mandatory
        var closeSyncMsg = SalesForceEngine.checkSyncOnDayClose();
        if (!XApp.isEmptyOrWhitespaceString(closeSyncMsg)) {
            gui.errorReports["FORCE_SYNC_CLOSEDAY"] = {
                caption: UserContext.tryTranslate(closeSyncMsg)
            };
            valid = false;
        }

        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYUNLOAD') && this._vanNotUnloaded) {
            gui.errorReports["CLOSEDAY_VANUNLOAD_STATUS"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.CLOSEDAY_VANUNLOAD_STATUS]")
            };
            valid = false;
        }

        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY') &&
            XApp.isEmptyOrWhitespaceString(this._inventoryOrdDocKey)) {
            gui.errorReports["CLOSEDAY_VANINVENTORY_STATUS"] = {
                caption: UserContext.tryTranslate("[MOB.SELLINGDAY.CLOSEDAY_VANINVENTORY_STATUS]")
            };
            valid = false;
        }
        return valid;
    };
    this._calculateSummaryFields = function (gui, onSuccess, onFailure) {
        try {
            var doc = gui.getDocument();
            //set min value for NUMKMEND

            // 1 - Number of documents present in the order navigator where
            //T100.DTECLOSE BETWEEN Opened selling day.DTESTART AND SYSDATE, counting the number of documents where status <> cancelled (7)
            var constraints = new XConstraints({
                logicalOp: "AND",
                constraints: [
                new XConstraint("DTECLOSE", ">=", doc.get("DTESTART")),
                new XConstraint("DTECLOSE", "<=", new Date()),
                new XConstraint("CODSTATUS", "!=", SalesForceNameSpace.SM1OrderStatus.ANNULLATO),
                new XConstraint("IDDAY", "=", doc.get("IDDAY"))
                ]
            });

            var orders = XNavHelper.getNavRecords("NAV_MOB_ORDERS", constraints);
            if (orders)
                doc.set("ORDERCOUNT", orders.length);

            // 2 - Total amount of all the document counted above (NETAMOUNT + VATAMOUNT + TAXAMOUNT).
            var totalAmount = 0, cashamount = 0, checkamount = 0, totalDiscountAmount = 0, totalGiftAmount = 0;
            var numDocs = {
            };
            for (var i = 0; i < orders.length; i++) {

                var order = orders[i];

                var amount = order.get("NETAMOUNT") + order.get("VATAMOUNT") + order.get("TAXAMOUNT");
                totalAmount += amount;

                //calculate total discount amount
                totalDiscountAmount += order.get("DISCOUNTAMOUNT");

                //calculate total gift amount
                totalGiftAmount += order.get("GIFTAMOUNT");

                var numDays = UserContext.getRefdatValue("CPTRM", order.get("CODPAYTRM"), "NUMDAYS");
                if (!XApp.isEmptyOrWhitespaceString(numDays) && numDays == 0) {
                    //Total Amount Cash: Sum of all the invoices in the open day where payment term days = 0 (Payment term optinfo NUMDAYS)
                    cashamount += amount;
                }
                else
                    //Total Amount Credit: Sum of all the invoices in the open day where payment term days > 0 (Payment term optinfo NUMDAYS)
                    checkamount += amount;

                //Keep a reference to the documents that generated an open invoice so it can be tested later when calculating the encashment values
                if (SM1OrderHelper.autoCreateOpenInvoice(order.get("CODTYPORD")) && !XApp.isEmptyOrWhitespaceString(order.get("NUMDOC"))) {
                    numDocs[SalesForceEngine.getOpenInvoiceRefKeyFromOrder(order)] = true;
                }
            }
            doc.set("TOTALAMOUNT", XApp.toDecimals(totalAmount, 2));
            doc.set("CASHAMOUNT", XApp.toDecimals(cashamount, 2));
            doc.set("CHECKAMOUNT", XApp.toDecimals(checkamount, 2));
            doc.set("TOTALDISCOUNTAMOUNT", XApp.toDecimals(totalDiscountAmount, 2));
            doc.set("TOTALGIFTAMOUNT", XApp.toDecimals(totalGiftAmount, 2));

            //Sum all the encashment included in the Opened Payment collection and payment collection of the open selling day:
            //3 - Total amount of encashment (cash)
            //4 - Total amount of encashment (check)
            //5 - Total amount encashment (3+4)
            constraints = new XConstraints({
                logicalOp: "OR",
                constraints: [
                    new XConstraint("CODSTATUS", "=", CommonNameSpace.DepositStatus.Opened),
                    new XConstraint("DTEDEP", "=", new Date().toDate())
                ]
            });

            var totalCash = 0, totalCheck = 0, totalElectronicAmount = 0, totalInvoiceEnacashment = 0, totalOpenEncashment = 0, totalDepositedAmount = 0;
            var totalDeposited = 0, totalNotDeposited = 0, totalColectedPrevDays = 0;
            var loadQueue = new ExecutionQueue();

            var deposits = XNavHelper.getNavRecords("NAV_MOB_DEPOSIT", constraints);
            if (deposits && deposits.length) {

                for (var iNumber = 0; iNumber < deposits.length; iNumber++) {
                    loadQueue.pushHandler(deposits[iNumber], function () {
                        XDocs.loadDocument(this.get("DOCUMENTKEY"), false, onFailure, function (loadedDocStore) {
                            try {
                                if (loadedDocStore == null) {
                                    loadQueue.executeNext();
                                    return;
                                }
                                var dep = loadedDocStore.getAt(0);
                                dep.ActiveEncashmentDetails().each(function (encashment) {
                                    //Calculate values for  VALCASH, VALCHECK, VALENC
                                    encashment.getSubEntityStore("EncashmentRow").each(function (encRow) {

                                        if (UserContext.getRefdatValue("TYPAY", encRow.get("CODTYPPAY"), "CASHPAYMENT"))
                                            totalCash += encRow.get("VALENC");
                                        else if (UserContext.getRefdatValue("TYPAY", encRow.get("CODTYPPAY"), "ISELECTRONIC"))
                                            totalElectronicAmount += encRow.get("VALENC");
                                        else
                                            totalCheck += encRow.get("VALENC");

                                        if (dep.get("CODSTATUS") == CommonNameSpace.DepositStatus.Closed) {
                                            totalDeposited += encRow.get("VALENC");
                                        } else {
                                            totalNotDeposited += encRow.get("VALENC");
                                        }

                                        if (encashment.get("DTEENC") < new Date().toDate()) {
                                            totalColectedPrevDays += encRow.get("VALENC");
                                        }
                                    });
                                    //Calculate values for VALINVENC, VALOPENENC
                                    encashment.getSubEntityStore("EncashmentBalance").each(function (encBalance) {
                                        // Total encashment of the open day linked to the open day invoices (open invoices generated by the invoice)
                                        if (numDocs[SalesForceEngine.getOpenInvoiceRefKeyFromEncashmentBalance(encBalance)]) {
                                            totalInvoiceEnacashment += encBalance.get("VALENCDET");
                                        } else {
                                            //Total encashment for existing open items
                                            totalOpenEncashment += encBalance.get("VALENCDET");
                                        }
                                    });
                                });

                                if (dep.get("IDDAY") == doc.get("IDDAY")) {
                                    totalDepositedAmount += dep.get("VALDEP");
                                }

                                loadQueue.executeNext();
                            } catch (e) {
                                if (onFailure)
                                    onFailure(e);
                            }
                        });
                    });
                }

            };

            loadQueue.pushHandler(this, function () {
                doc.set("VALCASH", XApp.toDecimals(totalCash, 2));
                doc.set("VALCHECK", XApp.toDecimals(totalCheck, 2));
                doc.set("ELECTRONICAMOUNT", XApp.toDecimals(totalElectronicAmount, 2));
                doc.set("DEPOSITEDAMOUNT", XApp.toDecimals(totalDepositedAmount, 2));
                doc.set("VALENC", XApp.toDecimals(totalCash + totalCheck + totalElectronicAmount, 2));

                doc.set("VALINVENC", XApp.toDecimals(totalInvoiceEnacashment, 2));
                doc.set("VALOPENENC", XApp.toDecimals(totalOpenEncashment, 2));

                doc.set("VALDEP", XApp.toDecimals(totalDeposited, 2));
                doc.set("VALNOTDEP", XApp.toDecimals(totalNotDeposited, 2));
                doc.set("VALPREVDEP", "(" + UserContext.formatNumber(XApp.toDecimals(totalColectedPrevDays, 2), "###,###,###,##0.00") + ")");

                if (onSuccess)
                    onSuccess();
            });
            loadQueue.executeNext();

        } catch (e) {
            if (onFailure)
                onFailure(e);
        }

    }
}

XApp.registerGuiExtension("mobGuiCloseDayActivity", new _mobGuiCloseDayActivity());