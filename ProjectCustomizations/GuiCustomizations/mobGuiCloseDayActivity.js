function _mobGuiCloseDayActivityCust() {

    this.getSaveConfirmationMessage = function (gui) {
        /* Enh 39324 DSD PROCESS - Customization - In open day required to add multi pallets fields 
            for every pallet category like: pallet a, pallet b, pallet c.*/
        var doc = gui.getDocument();
        if (doc.get("Z_NUMPALLETSTART_A") != doc.get("Z_NUMPALLETEND_A"))
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_A_DIFFERENT_FROM_OPENDAY]");
        if (doc.get("Z_NUMPALLETSTART_B") != doc.get("Z_NUMPALLETEND_B"))
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_B_DIFFERENT_FROM_OPENDAY]");
        if (doc.get("Z_NUMPALLETSTART_C") != doc.get("Z_NUMPALLETEND_C"))
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_C_DIFFERENT_FROM_OPENDAY]");
        //call base, product implementation
        if (this.base)
            return this.base.getSaveConfirmationMessage(gui);
    };

    this.afterCardFieldCreation = function (f, context) {

        //call base, product implementation
        if (this.base)
            this.base.afterCardFieldCreation(f, context);
        //CUSTOMIZATION 39324: DSD PROCESS - Customization - In open day required to add multi pallets fields for every pallet category 
        switch (context.sectionContext.entityName) {
            case "SellingDay":

                switch (context.fieldConfig.attrs.name) {
                    case "Z_NUMPALLETEND_A":
                    case "Z_NUMPALLETEND_B":
                    case "Z_NUMPALLETEND_C":
                        //Fix pallet authorization config Mady 17/09/2019
                        f.config.onMaskTap = function (tapContext) {
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

    this.afterLoad = function (gui) {
        var localExecutionQueue = new ExecutionQueue();
        var action;
        var self = this;

        //- Check if the VAN is fully unloaded
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYUNLOAD')) {
            action = function () {
                self.base._checkVanLoad(gui,
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                        localExecutionQueue.executeNext();
                    },
                    function (sellableProductsPresent) {
                        self.base._vanNotUnloaded = sellableProductsPresent;
                        localExecutionQueue.executeNext();
                    });
            };
            localExecutionQueue.pushHandler(this, action);
        }

        //check if CLOSED Van Inventory Order Exists
        //ENH #33045: Allow to configure mandatory Load / Unload / Inventory in Open and Close day
        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY')) {
            action = function () {
                self.base._checkForClosedVanInvetoryOrder(gui,
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                        localExecutionQueue.executeNext();
                    },
                    function (documentKey) {
                        self.base._inventoryOrdDocKey = documentKey;
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


    this.afterNotifyLeave = function (context) {

        if (this.base.afterNotifyLeave)
            this.base.afterNotifyLeave(context);

        //CUSTOMIZATION #41167: Mandatory VANLOAD in Close day
        delete this._loadOrdDocKey;
    };

    //CUSTOMIZATION #41167: Mandatory VANLOAD in Close day
    this._checkDraftVanLoadOrder = function (gui, onFailure, onSuccess) {
        if (!gui.currentUserRow || XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")))
            if (onSuccess)
                onSuccess(null);

        var findContext = {
            customer: gui.currentUserRow.get("CODPARTY"),
            dteOrd: (new Date()).toDate(),
            codTypOrds: [SalesForceNameSpace.OrderCTORD.LOAD],
            statuses: [SalesForceNameSpace.SM1OrderStatus.CLOSED, SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO],
            onFailure: onFailure,
            onSuccess: function (orderRow) {
                var documentKey = orderRow ? orderRow.get("DOCUMENTKEY") : null;
                if (onSuccess)
                    onSuccess(documentKey);
            }
        };
        SalesForceEngine.findOrder(findContext);
    };

    this.validateDocument = function (gui) {

        var valid = true;
        if (this.base.validateDocument)
             valid = this.base.validateDocument(gui);

       

        if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYLOAD') &&
         XApp.isEmptyOrWhitespaceString(this._loadOrdDocKey))
        
        {
            //mady check Load order 16/07/2020
            var today = new Date().toDate();
            var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
            var loadRequests = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", new XConstraints({
                logicalOp: "AND",
                constraints: [
                    new XConstraint("CODDIV", "=", UserContext.CodDiv),
                    new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                    new XConstraint("CODTYPORD", "=", SalesForceNameSpace.OrderCTORD.LOAD),
                    new XConstraint("CODSTATUS", "!=", SalesForceNameSpace.SM1OrderStatus.ANNULLATO),
                   // new XConstraint("DTEDELIV", "=", checkDate)  -->  MODIFICATION THE DTEDELIV TO DTEORD TO FIX THE SEQUENCE MA_02190109 
                    new XConstraint("DTEORD", ">=", today)
                ]
            }));

            if (loadRequests && loadRequests.length <= 0) {
                gui.errorReports["VANLOAD_STATUS"] = {
                    caption: UserContext.tryTranslate("[MOB.SELLINGDAY.MISSING_VANLOAD]")
                };
                valid = false;

            }
           
        }

        //CR02_check again the inventory and unload before confirm close day button _ MA
        if (valid) {

            delete gui.errorReports["VANLOAD_STATUS"];
            valid = this.base.validateDocument(gui);
        }

        
        

        // BEFORE CLOSE THE DAY FINALY CHECK IF DEPOSIT OPEND OR NOT! C202_20180329_MA
        if (valid) {

            delete gui.errorReports["CLOSEDAY_VANINVENTORY_STATUS"];
            delete gui.errorReports["VANLOAD_STATUS"];
            delete gui.errorReports["CLOSEDAY_VANUNLOAD_STATUS"];


            var constraints = new XConstraints({
                logicalOp: "AND",
                constraints: [
                    new XConstraint("CODUSR", "=", UserContext.CodUsr),
                    new XConstraint("CODSTATUS", "=", CommonNameSpace.DepositStatus.Opened)
                ]
            });

            // var deposits = XNavHelper.getNavRecords("NAV_MOB_DEPOSIT", constraints);
            var navData = XNavHelper.getFromMemoryCache("NAV_MOB_DEPOSIT");
            if (navData) {
                for (var o = 0; o < navData.Rows.length; o++) {
                    if (navData.Rows[o].get("CODSTATUS") == CommonNameSpace.DepositStatus.Opened && navData.Rows[o].get("CODUSR") == UserContext.CodUsr) {
                        gui.errorReports["DEPOSIT_STATUS"] = {
                            caption: UserContext.tryTranslate("[MOB.ACTION_CHECK_DEPOSIT]")
                        };
                        valid = false;
                        break;
                    }
                }
            }

        }
         
             
        return valid;
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
                        //DAL CUSTOMIZATION - 20180301 - MA: CHECK THE CLOSE DAY INVENTROY FIRST .
                        var maxDteClose = Constants.SM1MINDATE;
                        var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));

                        var inventories = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", new XConstraints({
                            logicalOp: "AND",
                            constraints: [
                                new XConstraint("CODDIV", "=", UserContext.CodDiv),
                                new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                                new XConstraint("CODTYPORD", "=", SalesForceNameSpace.OrderCTORD.INVENTORY),
                                new XConstraint("CODSTATUS", "=", SalesForceNameSpace.SM1OrderStatus.CLOSED)
                            ]
                        }));

        
                        for (var i = 0; i < inventories.length; i++) {
                            var dteClose = inventories[i].get("DTECLOSE");
                            if (dteClose > maxDteClose)
                                maxDteClose = dteClose;
                        }

                        var invoicesStatuses = [SalesForceNameSpace.SM1OrderStatus.INVOICED,
                                                SalesForceNameSpace.SM1OrderStatus.ANNULLATO,
                                                SalesForceNameSpace.SM1OrderStatus.DELIVERED];
                        var invoicesTypes = [SalesForceNameSpace.OrderCTORD.INVOICE,
                                             SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY];

                        var statuses = [
                                        SalesForceNameSpace.SM1OrderStatus.CLOSED,
                                        SalesForceNameSpace.SM1OrderStatus.VALIDO,
                                        SalesForceNameSpace.SM1OrderStatus.SOSPESO,
                                        SalesForceNameSpace.SM1OrderStatus.BLOCCATO,
                                        SalesForceNameSpace.SM1OrderStatus.INVOICED,
                                        SalesForceNameSpace.SM1OrderStatus.DELIVERED                                       
                                      ];

                        var cancelledStatus = SalesForceNameSpace.SM1OrderStatus.ANNULLATO;


                        var calendar = XApp.GlobalData.CALENDARS[UserContext.CodDiv];
                        var today = new Date().toDate();
                        var checkDate = new Date(today);
                        var oneDay = 24 * 60 * 60 * 1000;
                        var days = UserContext.getConfigParam("ORDER_DTEDELIV_CUST_50", UserContext.CodDiv);
                        days = parseInt(days);
                        if (!calendar) {
                            checkDate = new Date(checkDate.getTime() + (oneDay * days));
                            return;
                        }
                         
                        var i = 0;
                        while (true) {

                            var day = calendar.findByConstraints(new XConstraints({
                                logicalOp: "AND",
                                constraints: [
                                    new XConstraint("NUMYEAR", "=", checkDate.getFullYear()),
                                    new XConstraint("NUMMONTH", "=", checkDate.getMonth() + 1),
                                    new XConstraint("DAYOFMONTH", "=", checkDate.getDate())
                                ]
                            }));

                            if (!day) {
                                XLog.logWarn("Calendar missing value for " + days.toString()); // fix mady 19/09/2021
                                break;
                            }

                            if (i >= days && day.getValueFromName("WORKDAY") != 0)
                                break;

                            checkDate = new Date(checkDate.getTime() + oneDay); // add one day
                            if (day.getValueFromName("WORKDAY") != 0)
                                i++;
                        };

                        checkDate.setDate(checkDate.getDate());
                        
                       
                     
                       //Disable Sequence CR02 MA_20190131
                        //var loadRequests = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", new XConstraints({
                        //    logicalOp: "AND",
                        //    constraints: [
                        //        new XConstraint("CODDIV", "=", UserContext.CodDiv),
                        //        new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                        //        new XConstraint("CODTYPORD", "=", SalesForceNameSpace.OrderCTORD.LOAD),
                        //        new XConstraint("CODSTATUS", "!=", SalesForceNameSpace.SM1OrderStatus.ANNULLATO),
                        //       // new XConstraint("DTEDELIV", "=", checkDate)  -->  MODIFICATION THE DTEDELIV TO DTEORD TO FIX THE SEQUENCE MA_02190109 
                        //        new XConstraint("DTEORD", ">=", today)
                        //    ]
                        //}));

                        //var constrOrd = new XConstraints({
                        //    logicalOp: "AND",
                        //    constraints: [
                        //        new XConstraint("CODDIV", "=", UserContext.CodDiv),
                        //        new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                        //        //new XConstraint("FLGANN", "=", 0),
                        //        new XConstraint("CODTYPORD", SqlRelationalOperator.In, invoicesTypes),
                        //        new XConstraint("CODSTATUS", SqlRelationalOperator.In, invoicesStatuses),
                        //        new XConstraint("DTEMOD", ">", maxDteClose)
                        //    ]
                        //});

                     //Disable Sequence CR02 MA_20190131
                        //extraction of all orers 70 and 80 which were modified after the last closed inventory
                        //var ordersCheck = XNavHelper.getNavRecords("NAV_MOB_ORDERS", constrOrd);

                        ////20180301 - DAL CUSTOMIZATION - RB: CR02, must create a Load request before unload
                        //var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
                        
                        //if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", "CLOSEDAY_MANDATORYLOAD")) {
                        //    //20180301 - DAL CUSTOMIZATION - RB: CR02, close Day Order Of Activities
                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY")) && user) {
                            findContext = {
                                customer: gui.currentUserRow.get("CODPARTY"),
                                dteOrd: XApp.today(),
                                codTypOrds: [SalesForceNameSpace.OrderCTORD.UNLOAD],
                                statuses: [SalesForceNameSpace.SM1OrderStatus.VALIDO, SalesForceNameSpace.SM1OrderStatus.SOSPESO],
                                onFailure: XUI.showExceptionMsgBox,
                                onSuccess: function (orderRow) {
                                    if (orderRow) {
                                        self.base._openExistingOrder(gui, orderRow);
                                    } 
                                    else {

                                        self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                                    }

                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        }
 
                      //Disable Sequence CR02 MA_20190131
                        //if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", "CLOSEDAY_MANDATORYLOAD")) {
                        //    //20180301 - DAL CUSTOMIZATION - RB: CR02, close Day Order Of Activities
                        //    if (((loadRequests && loadRequests.length > 0) && (!ordersCheck || ordersCheck.length == 0))) {
                        //        self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                        //    }   
                        //    else {
                        //        XUI.showMsgBox({
                        //            title: "[MOB.WARN]",
                        //            msg: UserContext.tryTranslate("[MOB.ACTION_VAN_UNLOAD]"),
                        //            icon: "WARN",
                        //            buttons: 'OK',
                        //            onResult: Ext.emptyFn
                        //        });                                        
                        //    }

                        //}
                        
                       
                    //Disable Sequence CR02 MA_20190131
                        //else {
                           
                        //    if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY')) {
                        //        if (ordersCheck.length == 0 || !ordersCheck) {
                        //            self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                        //        }
                        //        else {

                        //            XUI.showMsgBox({
                        //                title: "[MOB.WARN]",
                        //                msg: UserContext.tryTranslate("[MOB.ACTION_NEW_ORDER_LOAD]"),
                        //                icon: "WARN",
                        //                buttons: 'OK',
                        //                onResult: Ext.emptyFn
                        //            });
                        //        }
                        //    } else {

                        //        self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.UNLOAD);
                        //    }
                            
                        //}
                        break;
                    }

                case "ADJUSTMENT_LNK":
                case "SELLINGDAY.ADJUSTMENT_LNK":
                case "MOB.SELLINGDAY.ADJUSTMENT_LNK":
                    {
                        self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.ADJUSTMENT);
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
                                        self.base._openExistingOrder(gui, orderRow);
                                    } else {
                                        self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY);
                                    }
                                }
                            };
                            SalesForceEngine.findOrder(findContext);
                        } else {
                            self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.INVENTORY);
                        }
                        break;
                    }
                case "VAN_LOAD_LNK":
                case "SELLINGDAY.VAN_LOAD_LNK":
                case "MOB.SELLINGDAY.VAN_LOAD_LNK":
                    {

                        if (gui.currentUserRow && !XApp.isEmptyOrWhitespaceString(gui.currentUserRow.get("CODPARTY"))) {
                            //Disable Sequence CR02 MA_20190131
                            //DAL CUSTOMIZATION - 20180301 - MA: CHECK THE CLOSE DAY INVENTROY FIRST .
                            //    var maxDteClose = Constants.SM1MINDATE;
                            //    var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));


                            //    var inventories = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", new XConstraints({
                            //        logicalOp: "AND",
                            //        constraints: [
                            //            new XConstraint("CODDIV", "=", UserContext.CodDiv),
                            //            new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                            //            new XConstraint("CODTYPORD", "=", SalesForceNameSpace.OrderCTORD.INVENTORY),
                            //            new XConstraint("CODSTATUS", "=", SalesForceNameSpace.SM1OrderStatus.CLOSED)
                            //        ]
                            //    }));

                            //    for (var i = 0; i < inventories.length; i++) {
                            //        var dteClose = inventories[i].get("DTECLOSE");
                            //        if (dteClose > maxDteClose)
                            //            maxDteClose = dteClose;
                            //    }

                            //    var invoicesStatuses = [SalesForceNameSpace.SM1OrderStatus.INVOICED,
                            //                            SalesForceNameSpace.SM1OrderStatus.ANNULLATO,
                            //                            SalesForceNameSpace.SM1OrderStatus.DELIVERED];
                            //    var invoicesTypes = [SalesForceNameSpace.OrderCTORD.INVOICE,
                            //                         SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY];

                            //    var constrOrd = new XConstraints({
                            //        logicalOp: "AND",
                            //        constraints: [
                            //            new XConstraint("CODDIV", "=", UserContext.CodDiv),
                            //            new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
                            //            //new XConstraint("FLGANN", "=", 0),
                            //            new XConstraint("CODTYPORD", SqlRelationalOperator.In, invoicesTypes),
                            //            new XConstraint("CODSTATUS", SqlRelationalOperator.In, invoicesStatuses),
                            //            new XConstraint("DTEMOD", ">", maxDteClose)
                            //        ]
                            //    });

                            //    if (UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY')) {

                            //        //extraction of all orders 70 and 80 which were modified after the last closed inventory
                            //        var ordersCheck = XNavHelper.getNavRecords("NAV_MOB_ORDERS", constrOrd);

                            //        if (ordersCheck.length == 0 || !ordersCheck) {
                            //            self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.LOAD);
                            //        }
                            //        else {

                            //            XUI.showMsgBox({
                            //                title: "[MOB.WARN]",
                            //                msg: UserContext.tryTranslate("[MOB.ACTION_NEW_ORDER_LOAD]"),
                            //                icon: "WARN",
                            //                buttons: 'OK',
                            //                onResult: Ext.emptyFn
                            //            });
                            //        }
                            //    }


                            //}                        
                                  self.base._openNewOrder(gui, SalesForceNameSpace.OrderCTORD.LOAD);
                            break;
                        }
                    }
                //LINK Close collection depsoit CR2 MA 20180529
                case "DEPOSIT":
                case "CLOSE_COLLECTION_DEPOSIT":
                    {
                        gui._storeDocOnTempCache();
                        //CALL THE COLLECTION DEPOSITE NAVIGATOR. CR02 MA 20180529
                        XHistory.go({
                            controller: app.getSM1Controllers().nav,
                            action: 'show',
                            id: "NAV_MOB_DEPOSIT"
                        });

                        break;
                    }

            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };


}

XApp.registerGuiExtensionCust("mobGuiCloseDayActivity", new _mobGuiCloseDayActivityCust());