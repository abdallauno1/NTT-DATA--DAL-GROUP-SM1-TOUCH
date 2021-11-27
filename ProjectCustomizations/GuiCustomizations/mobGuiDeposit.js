//#region _mobGuiDepositExtensionCust

function _mobGuiDepositExtensionCust() {

    
    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.beforeOpenSubDetailFromList = function (context) {
        context.ctrl.gui._storeDocOnTempCache();

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
                z_idenc: context.entity.get("IDENC"), //populated
                codparty: context.entity.get("CODPARTY"), //populated
                dteenc: context.entity.get("DTEENC"), //populated
                encashmentGuiOpenMode: CommonNameSpace.EncashmentGuiOpenMode.DepositMasterEncashmentChild,
                parentDocumentStore: context.ctrl.gui.docStore, //contains deposit and new empty row
            },
            entityName: "Encashment"
        });

        return true;
    };

    // CR02_20180406_MA CHECK SEQUENCE CLOSING OF COLLOECTION DEPOSIT.
    this.validateDocument = function (gui) {
        var localExecutionQueue = new ExecutionQueue();
        var closeDay = new _mobGuiCloseDayActivity();
        var check = true;
        
        var action;
        var self = this;
        var deposit = gui.getDocument();
        var detailContext = gui.detailCtrl;
        var isValid = true;
        var invalidFields = [];

        if (XApp.isEmptyOrWhitespaceString(deposit.get("CODCUR"))) {
            isValid = false;
            invalidFields.push("CODCUR");
        }

        if (XApp.isEmptyOrWhitespaceString(deposit.get("CODTYPDEP")) || !CommonEngine.isDepositTypeValid(deposit)) {
            isValid = false;
            invalidFields.push("CODTYPDEP");
        }

        if (XApp.isEmptyOrWhitespaceString(deposit.get("CODSTATUS"))) {
            isValid = false;
            invalidFields.push("CODSTATUS");
        }

        

        if (!CommonEngine.isDepositDateValid(deposit)) {
            isValid = false;
            invalidFields.push("DTEDEP");
        }

        if (!isValid && detailContext) {
            for (var i = 0, n = invalidFields.length; i < n; i++) {
                var f = detailContext.fields[invalidFields[i]];
                if (f) {
                    f.fieldContext.isValid = false;
                }
            }
            detailContext.setFieldsStatus();
        }
        //Disable Sequence CR02 MA_20190131
        //20180404 - DAL CUSTOMIZATION - MA: CR02, first check Inventory orders.
        //if (isValid && deposit.get("CODSTATUS") == "1" && UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYINVENTORY')) {

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
        //    //extraction of all orders 70 and 80 which were modified after the last closed inventory
        //    var ordersCheck = XNavHelper.getNavRecords("NAV_MOB_ORDERS", constrOrd);

        //    if (ordersCheck.length == 0 || !ordersCheck) {
                    
        //        isValid = true;
                    
        //    }else{

        //        isValid = false;
        //        gui.errorReports["VANLOAD_STATUS"] = {
        //            caption: UserContext.tryTranslate("MOB.ACTION_CHECK_CLOSE_INVENTORY]")
        //               };
        //        }

        //}
        //Disable Sequence CR02 MA_20190131
        //20180404 - DAL CUSTOMIZATION - MA: CR02, seconde check LOAD orders
        //if (isValid && deposit.get("CODSTATUS") == "1" && UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYLOAD')){
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

        //    var statuses = [SalesForceNameSpace.SM1OrderStatus.CLOSED,
        //                    SalesForceNameSpace.SM1OrderStatus.VALIDO,
        //                    SalesForceNameSpace.SM1OrderStatus.SOSPESO,
        //                    SalesForceNameSpace.SM1OrderStatus.BLOCCATO];

        //    var calendar = XApp.GlobalData.CALENDARS[UserContext.CodDiv];
        //    var today = new Date().toDate();
        //    var checkDate = new Date(today);
        //    var oneDay = 24 * 60 * 60 * 1000;
        //    var days = UserContext.getConfigParam("ORDER_DTEDELIV_CUST_50", UserContext.CodDiv);
        //    days = parseInt(days);
        //    if (!calendar) {
        //        checkDate = new Date(checkDate.getTime() + (oneDay * days));
        //        return;
        //    }
       
        //    var i = 0;
        //    while (true) {

        //        var day = calendar.findByConstraints(new XConstraints({
        //            logicalOp: "AND",
        //            constraints: [
        //                new XConstraint("NUMYEAR", "=", checkDate.getFullYear()),
        //                new XConstraint("NUMMONTH", "=", checkDate.getMonth() + 1),
        //                new XConstraint("DAYOFMONTH", "=", checkDate.getDate())
        //            ]
        //        }));

        //        if (!day) {
        //            XLog.logWarn("Calendar missing value for " + days.toDateString());
        //            break;
        //        }

        //        if (i >= days && day.getValueFromName("WORKDAY") != 0)
        //            break;

        //        checkDate = new Date(checkDate.getTime() + oneDay); // add one day
        //        if (day.getValueFromName("WORKDAY") != 0)
        //            i++;
        //    };

        //    checkDate.setDate(checkDate.getDate());


        //    var loadRequests = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", new XConstraints({
        //        logicalOp: "AND",
        //        constraints: [
        //            new XConstraint("CODDIV", "=", UserContext.CodDiv),
        //            new XConstraint("CODWHS", "=", user.get("CODWHSSALES")),
        //            new XConstraint("CODTYPORD", "=", SalesForceNameSpace.OrderCTORD.LOAD),
        //            new XConstraint("CODSTATUS", SqlRelationalOperator.In, statuses),
        //            new XConstraint("DTEDELIV", "=", checkDate)
        //        ]
        //    }));

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

           
        //    var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));

           
        //    if ((loadRequests && loadRequests.length > 0)) {
        //        isValid = true;
        //    }
        //    else {

        //        isValid = false;
        //        gui.errorReports["VANLOAD_STATUS"] = {
        //            caption: UserContext.tryTranslate("MOB.ACTION_CHECK_CLOSE_LOAD]")
        //        };
               
        //    }
        
        //}
        //Disable Sequence CR02 MA_20190131
        //20180406 - DAL CUSTOMIZATION - MA: CR02, finaly check UNLoad orders defore close the deposit
        //if (isValid && deposit.get("CODSTATUS") == "1" && UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'CLOSEDAY_MANDATORYUNLOAD')) {
            
        //    gui.CacheData = {
        //        m_prodConv: SalesForceEngine.getProductConversions(UserContext.CodDiv)
        //    };
        //    var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
        //    SalesForceEngine.calculateWarehouseBalance(user.get("CODWHSSALES"), '', gui.CacheData,
        //         function (response) {
        //             var sellableProductsPresent = false;
        //             //success
        //             if (response) {
        //                 for (var prodBalKey in response.OrdProdWhsBalances) {
        //                     var prodWhsBalance = response.OrdProdWhsBalances[prodBalKey];
        //                     if (prodWhsBalance.QTYORD > 0 && SM1OrderHelper.isSellable(prodWhsBalance.CODTYPROW)) {
        //                         sellableProductsPresent = true;
        //                         break;
        //                     }
        //                 }
        //                 if (sellableProductsPresent) {

        //                     check = false;
        //                     XUI.showErrorMsgBox({ msg: '[MUST_DO_UNLOAD]' });
                            
        //                 }

        //             }
                     
        //         },
        //            function () {
        //                //failure
        //                XUI.showErrorMsgBox({ msg: '[ERROR_ON_LOAD_WHS_BALANCE]' });
        //                //self.base._buildCodTypRowQtabs(gui, availableCodTypRows);
        //                //XUI.hideWait();
        //            });

            


        //}
       

        return isValid;
    };

};

XApp.registerGuiExtensionCust("mobGuiDeposit", new _mobGuiDepositExtensionCust());
//#endregion