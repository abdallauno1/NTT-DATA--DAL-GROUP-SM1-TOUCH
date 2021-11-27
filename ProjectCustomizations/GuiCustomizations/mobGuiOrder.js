//#region _mobGuiOrderExtensionCust

function _mobGuiOrderExtensionCust() {

    PaymentMode = {
        CASH: "CS",
        CREDIT: "CR",
        CASHANDCREDIT: "CSR"
    };

    this._getMinSaleOrderExpDate = function (codTypOrd) {
        var expDate = SM1OrderHelper.getDedicatedIntParameter("ORD_EXP_DATE", codTypOrd, "3");
        var minDate = new Date();
        minDate.setMonth(minDate.getMonth() + expDate);
        return minDate.toDate();
    };

    //Check if exist an order row type with macro type RETURN and with expire date lower than today + 3 months
    //show a message bar with the error and highlight the first cell with error
    this._checkExpireDateOrder = function (contextOrder) {
        var self = this;
        var minExpDate = self._getMinSaleOrderExpDate(contextOrder.codTypOrd);
        var exit = true;
        if (contextOrder.order) {
            var orStore = contextOrder.order.getSubEntityStore(SFConstants.ORDERROW);
            orStore.each(function (orderRow) {
                if (contextOrder.order != null && self._isZDTEXPIREVisible(contextOrder.order) && self._isZDTEXPIREEditable(contextOrder.order, orderRow) &&
                orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN &&
                orderRow.get("Z_DTEXPIRE") < minExpDate)
                    exit = false;
                return exit;
            });
            if (!exit)
                return false;
            return true;
        }
        else
            if (contextOrder.orderRow) {
                var order = contextOrder.orderRow.getParentEntity();
                if (order != null && self._isZDTEXPIREEditable(order, contextOrder.orderRow) &&
                   contextOrder.orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN &&
                   contextOrder.orderRow.get("Z_DTEXPIRE") < minExpDate)
                    return false;
                return true;
            }
    };

    this._showErrorMessageExpDateOrder = function (data) {
        var self = this;
        var order = data.gui.getDocument();
        var contextOrder = {
            order: order,
            codTypOrd: order.get("CODTYPORD")
        };
        if (!self._checkExpireDateOrder(contextOrder)) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.EXP_DATE_LOWER_THAN_3MONTHS]") });
            data.cancel = true;
        }
    };

    this._checkPaymentMode = function (data) {
        var order = data.gui.getDocument();

        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
            return;

        if (order.get("CODPAYMOD") == PaymentMode.CASHANDCREDIT) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[ERR_INVALID_PAYMENT_MODE]") });
            data.cancel = true;
        }
    }

    //CUSTOMIZATON 37068: Return QTY control on pharma order
    this._checkPreviousOrderedQty = function (context) {

        if (context.order) {
            valid = true;

            if (context.gui && context.gui._previousOrderedQtys) {

                //sum up the returned qty for all rows and validate agains previous ordered qty
                var sums = {};
                context.order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                    if (row.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN) {
                        var qty = SalesForceEngine.convertQuantity(row.get("CODART"), row.get("QTYORD"), row.get("UMORD"), context.order.get("UMQTYTOT"), context.gui.CacheData, false);
                        if (sums[row.get("CODART")] == undefined)
                            sums[row.get("CODART")] = qty;
                        else
                            sums[row.get("CODART")] += qty;
                    }
                });

                //Validate
                for (var codart in sums) {
                    if (sums[codart] != 0 && (context.gui._previousOrderedQtys[codart] == undefined || sums[codart] > context.gui._previousOrderedQtys[codart])) {
                        valid = false;
                        break;
                    }
                }
            }

            return valid;
        }

        if (context.orderRow) {

            if (context.gui && context.gui._previousOrderedQtys) {

                //sum up the returned qty for all rows with same codart and validate agains previous ordered qty
                var order = context.orderRow.getParentEntity()
                var codart = context.orderRow.get("CODART")
                if (context.orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN) {
                    var sumQty = 0;
                    order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                        if (row.get("CODART") == codart && row.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN) {
                            sumQty += SalesForceEngine.convertQuantity(codart, row.get("QTYORD"), row.get("UMORD"), order.get("UMQTYTOT"), context.gui.CacheData, false);
                        }
                    });

                    if (sumQty != 0 && (context.gui._previousOrderedQtys[codart] == undefined || sumQty > context.gui._previousOrderedQtys[codart]))
                        return false;
                }
            }
        }


        return true;
    };

    //Customization 37069  : INVENTORY customization: control on close for specific users
    this._checkAdjustmentQty = function (context) {
        if (context && context.order) {


            if (context.order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY &&
                 context.order.get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.SOSPESO) {

                var constraints = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODUSR", "=", UserContext.CodUsrReal),
                          new XConstraint("CODDIV", "=", UserContext.CodDiv)
                          //the CODGRP does not matter
                    ]
                });
                var user = XNavHelper.getFromMemoryCache("NAV_MOB_USERS").findByConstraints(constraints);
                if (user && user.get("Z_FLGINVENTORYCHECK")) {
                    var valid = true;
                    context.order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                        if (row.get("ADJUSTMENTQTY") && row.get("ADJUSTMENTQTY") != 0
                            && row.get("ADJUSTMENTQTY") != -Infinity)
                            valid = false;
                        return valid; //stop the search
                    });

                    return valid;
                }
            }
        }
        return true;
    };

    this._refreshOrderRowGrid = function (gui) {
        var rowDetailContext = gui.tabCtrls["ROWS"];
        var order = gui.getDocument();
        var rows = order.getSubEntityStore(SFConstants.ORDERROW);

        if (rowDetailContext) {
            if (rowDetailContext.sections["GRID"]) {
                var orStore = rowDetailContext.sections["GRID"].grid.getStore();
                rows.rebindSenchaStore(orStore);
            }
            rowDetailContext.refreshGui();
        }

    };

    this.beforeConfirm = function (data) {

        var self = this;
        data.cancel = false;
        var order = data.gui.getDocument();
        //var codParty = order.get("CODCUSTINV");
        //var codUser = order.get("CODUSR");
        //var codDiv = order.get("CODDIV");
        //var orderTyp = order.get("CODTYPORD");
        //var codStatus = order.get("CODSTATUS");
        //var codPayMod = order.get("CODPAYMOD");
        //var pendingInvoices = [];
        //var pendingInvoices2 = [];
        //var notSaveOrder = false;
        //var blockOrderStatus = false;

        //var constraints = new XConstraints({
        //    logicalOp: 'AND',
        //    constraints: [
        //        new XConstraint("CODUSR1", "=", codUser),
        //        new XConstraint("CODDIV", "=", codDiv),
        //        new XConstraint("CODPARTY", "=", codParty)
        //    ]
        //});
        //var customer1 = XNavHelper.getNavRecords("NAV_MOB_CUST", constraints);
        //for (var i = 0 ; i < customer1.length ; i++) {
        //    var pendingInvoice = customer1[i].get("Z_INVOICE_AMOUNT");
        //    pendingInvoices2.push(pendingInvoice);
        //}

        //var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST", constraints);
        //var cust = customer.filterByConstraints(constraints);
        //for (var i = 0 ; i < cust.length ; i++) {
        //    var pendingInvoice = cust[i].get("Z_INVOICE_AMOUNT");
        //    pendingInvoices.push(pendingInvoice);
        //}

        //check the open invoices based on t048 - CR05 MA 20180510
        //for (var r = 0 ; r < pendingInvoices.length ; r++) {

        //    if (pendingInvoices[r] > 0 && codPayMod == PaymentMode.CREDIT && orderTyp == SalesForceNameSpace.OrderCTORD.SALES) {
        //        //order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //        ////self.base._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
        //        //order.set("CODSTATUSMAN", "");
        //        //blockOrderStatus = true;

        //        //  break;
        //    }

        //    //in case order type 70 / 80  do not allow to save the order CR05 MA 20180510 
        //    if (pendingInvoices[r] > 0 && codPayMod == PaymentMode.CREDIT && (orderTyp == SalesForceNameSpace.OrderCTORD.INVOICE || orderTyp == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY)) {
        //        //order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //        ////self.base._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
        //        //order.set("CODSTATUSMAN", "");
        //        //notSaveOrder = true;

        //    }

        //}
        //if (blockOrderStatus) {
        //    //order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //    //order.set("CODSTATUSMAN", "");
        //    //XUI.showMsgBox({
        //    //    title: "[MOB.WARN]",
        //    //    msg: UserContext.tryTranslate("[MOB.SAVE_BLOCK_STATUS]"),
        //    //    icon: "WARN",
        //    //    buttons: 'OK',
        //    //    onResult: Ext.emptyFn
        //    //});
          
           
        //}

        self._showErrorMessageExpDateOrder(data);
        if (data.cancel == false)
            self._checkPaymentMode(data);

        //CUSTOMIZATON 37068: Return QTY control on pharma order
        if (data.cancel == false) {
            //lazy load previous ordered qtys on first confirm - at this point we are sure to be online
            if (!data.gui._previousOrderedQtys) {
                var prevOrders = parseInt(UserContext.getConfigParam("RETURN_ORDER_CHECK", "0"), 10);
                if (prevOrders > 0) {

                    data.cancel = true;

                    XUI.showWait();
                    //call server to get all errors;
                    var order = data.gui.getDocument();
                    var orderClone = order.clone();
                    self.base._clearExtraEntities(orderClone);

                    XApp.callCust("engineCustomizer", "salesForceEngine", 'loadOrderedQty', [orderClone, function (e) {
                        XUI.hideWait();
                        XLog.logEx(e);
                        XUI.showExceptionMsgBox(e);
                    }, function (response) {
                        XUI.hideWait();
                        data.gui._previousOrderedQtys = response;

                        //call confirm again.
                        data.gui.confirmButton.handler();
                    }]);
                }
            }
            else {

                //just validate the previous orderd qtys
                var valid = self._checkPreviousOrderedQty({
                    gui: data.gui,
                    order: data.gui.getDocument()
                });

                if (!valid) {
                    data.cancel = true;
                    XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[ORDER_RETURN_HIGHER_THAN_SOLD]") });
                    self._refreshOrderRowGrid(data.gui);
                }
            }
        }


    };

    this.beforeClose = function (data) {
        var self = this;
        self._showErrorMessageExpDateOrder(data);
        if (data.cancel == true)
            return;

        //Customization 37069  : INVENTORY customization: control on close for specific users
        if (!self._checkAdjustmentQty({ gui: data.gui, order: data.gui.getDocument() })) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[ORDER_INVENTORY_MISSING_QTY]") });
            data.cancel = true;
            return;
        }

        /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
        //in order to be able to distinguish if save was called by close button/ back button/cancel order
        if (data.gui.isEditable() && data.gui.getDocument().get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {
            data.gui.saveMode = "NO_CONFIRMATION";
        }
        //DAL CUSTOMIZATION - 20180227 - MA: SECONDE LEVEL AUTHORIZATION ON CLOSE BUTTON. 
        var order = data.gui.getDocument();
        var secondLevAutho = false;
        var qtyChanged = false;
        // add the checker code for the order (if exists). MADY CR 19/09/2021
        var checkerCode = UserContext.UserData.SM1User.CODAUTHORIZATION;
        order.set("CODUSR5", checkerCode);

        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {
                if (row.get("ADJUSTMENTQTY") != 0) {
                    qtyChanged = true;

                }

            }
            if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.ADJUSTMENT) {
                if (row.get("QTYORD") > 0 && (row.get("CODTYPROW") == SalesForceNameSpace.OrderTYROW.LOAD || row.get("CODTYPROW") == SalesForceNameSpace.OrderTYROW.MISSING)) {
                    qtyChanged = true;

                }

            }

        });

        if (qtyChanged) {
            secondLevAutho = self._beforeRequestActionOnClosure(order.get("CODTYPORD"));
        }
        if (secondLevAutho) {
            data.cancel = true;
            return;
        }


    };
    //DAL CUSTOMIZATION - 20180227 -  CR 01 MA: SECONDE LEVEL AUTHORIZATION ON CLOSE BUTTON.  
    this._beforeRequestActionOnClosure = function (orderType) {
        self = this;
        var boolean = false;
        var authContext = {
            //actionContext: context,
            codFunction: ""
        };

        switch (orderType) {
            case SalesForceNameSpace.OrderCTORD.INVENTORY:
                authContext.codFunction = CommonNameSpaceCust.AUTHF.INVENTORY_2;
                break;

            case SalesForceNameSpace.OrderCTORD.ADJUSTMENT:
                authContext.codFunction = CommonNameSpaceCust.AUTHF.STKCOR_2;
                break;
        }

        if (!XApp.isEmptyOrWhitespaceString(authContext.codFunction)) {
            //context.canceled = true;
            boolean = true;

            XUI.authorizeFunction({
                codFunction: authContext.codFunction,
                onFailure: function () { },
                onSuccess: function () { self._closeOrder() }

            });
        }
        return boolean
    };

    //DAL CUSTOMIZATION - 20180227 - MA: SECONDE LEVEL AUTHORIZATION ON CLOSE BUTTON. 

    this._closeOrder = function (gui) {
        {
            var self = this;
            if (!self.base)
                return;
            var gui = app.getSM1Controllers().gui;
            var order = gui.getDocument();

            if (!order)
                return;
            order.set("CODSTATUSMAN", "");

            var checkerCode = UserContext.UserData.SM1User.CODAUTHORIZATION;
            order.set("CODUSR5", checkerCode); // AS AGREED WITH DAL WE WILL USE THIS COLUMN TO STORE THE CHKER CODE -- MADY CR 19/09/2021 

            //unable to close the order due to batch qtys differences
            if (self.base._blockingControlOnOrderConfirmation(order, SalesForceNameSpace.OrderAction.CLOSE))
                return;

            if (!self.base._hasOrderToBeSigned(order, SalesForceNameSpace.OrderAction.CLOSE)) {
                XUI.showWait();
                gui.validateDocument(function (response) {
                    if (response != "OK") {
                        XUI.hideWait();
                        return;
                    }
                    gui.docModified = true;
                    order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.CLOSED);
                    self.base.setOpenDayID(gui);
                    if (order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY)
                        self.base._removeZeroOrderRows(order);
                    order.set("DTECLOSE", new Date());
                    self.base._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
                    if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {
                        SalesForceEngine.createAdjustmentOrder(order, gui.CacheData, function (e) {
                            XUI.hideWait();
                            XUI.showExceptionMsgBox(e);
                        }, function () {
                            self.base.saveOrder(gui);
                        });
                    }
                    else {
                        self.base.saveOrder(gui);
                    }
                }, "EDIT");
            } else {
                self.base.saveOrder(gui, true, SalesForceNameSpace.OrderAction.CLOSE);
            }
        }
    };

    this.setFieldStatus = function (context) {

        var self = this;
        //call base product implementation
        if (self.base)
            self.base.setFieldStatus(context);

        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        var order = context.gui.gui.getDocument();
        var contextOrder = {
            orderRow: entity,
            codTypOrd: context.sectionContext.document.get("CODTYPORD")
        };
        switch (entity.getEntityName()) {
            case SFConstants.SM1ORDER:
                switch (fieldName) {
                    case "CODPAYMOD":
                        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
                            return;

                        if (!order.InvoiceCustomer)
                            return;

                        var customerDiv = order.InvoiceCustomer.getSubEntityStore('CustomerDiv').findBy(function (r) {
                            return r.get("CODDIV") == UserContext.CodDiv;
                        });

                        if (!customerDiv)
                            return;

                        switch (customerDiv.get("CODPAYMOD")) {
                            case PaymentMode.CASH:
                                context.editable = false;
                                break;
                            case PaymentMode.CREDIT:
                                var userType = UsrGroup.getGroup(UserContext.CodGrp).USRTYPE;
                                // 6 - Head office/Sales office
                                if (userType == "6") {
                                    context.editable = true;
                                }
                                else
                                    context.editable = false;
                                break;
                            case PaymentMode.CASHANDCREDIT:
                                context.editable = true;
                                break;
                        }
                        break;
                    case "CODPAYTRM":
                        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
                            return;

                        switch (order.get("CODPAYMOD")) {
                            case PaymentMode.CASH:
                            case PaymentMode.CASHANDCREDIT:
                                context.editable = false;
                                break;
                            case PaymentMode.CREDIT:
                                var userType = UsrGroup.getGroup(UserContext.CodGrp).USRTYPE;
                                // 6 - Head office/Sales office
                                if (userType == "6") {
                                    context.editable = true;
                                }
                                else
                                    context.editable = false;
                                break;
                        }
                        break;
                        /*CUSTOMIZATION: 36701 DCODE - Display remaining credit limit in the order header.*/
                    case "Z_VALCREDITLIMIT":
                        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES) {
                            context.visible = false;
                            return;
                        }
                        switch (order.get("CODPAYMOD")) {
                            case PaymentMode.CASH:
                            case PaymentMode.CASHANDCREDIT:
                                context.visible = false;
                                break;
                            case PaymentMode.CREDIT:
                                context.visible = true;
                                break;
                        }
                        break;
                        /*CUSTOMIZATION:  ENH 40775: Delivery Date: default calculation and editability per division and order type*/
                    case "DTEDELIV":
                    case "DTEDELIV2":
                    case "DTEDELIV3":
                    case "DTEDELIV4":
                    case "DTEDELIV5":
                        var deliveDisabled = SM1OrderHelper.getDedicatedParameter("DISABLE_DTEDELIV_ONLOAD", order.get("CODTYPORD"), "0") != "0";
                        var usrGroup = UsrGroup.getGroup(UserContext.CodGrp);
                        if (usrGroup.USRTYPE == 6)
                            deliveDisabled = SM1OrderHelper.getDedicatedParameter("DISABLE_DTEDELIV_HQ", order.get("CODTYPORD"), "0") != "0";
                        else
                            deliveDisabled = SM1OrderHelper.getDedicatedParameter("DISABLE_DTEDELIV_FIELD", order.get("CODTYPORD"), "0") != "0";
                        context.editable = context.editable && !deliveDisabled;

                        break;
                }
                break;
            case SFConstants.ORDERROW:
                //for Price Delivery fields should be editable only for empty or returnable products
                if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY &&
                    order.get("CODSTATUS") != "16") {
                    if (fieldName == "CODTYPROW" || fieldName == "UMORD") {
                        context.editable = SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity);
                    }
                    else {
                        // for QTYORD, CODQTYMODCAUSE, CODQTYREJCAUSE keep the base logic
                        if (!(SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity)) &&
                            fieldName != "QTYORD" && fieldName != "CODQTYMODCAUSE" && fieldName != "CODQTYREJCAUSE")
                            context.editable = false;
                    }
                }

                //Skip this part if base already disabled the field
                if (!context.editable)
                    return;
                /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
                if (entity.get("Z_ISREADONLYEMPTY")) {
                    context.editable = false;
                    return;
                }
                switch (fieldName) {
                    case "Z_DTEXPIRE":
                        if (!self._checkExpireDateOrder(contextOrder))
                            context.valid = false;
                        break;
                    case "CODTYPROW":
                        var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(entity.get("CODART"), entity.get("CODDIV")));
                        if (prod.get("FLGEMPTY")) {
                            //context.valid can be true or false from the previous validation
                            context.valid = context.valid && this._isRowTypValid(entity.get("CODTYPROW"), entity.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD"));
                        } else {
                            context.valid = context.valid && !this._isConsignmentRowType(entity.get("CODTYPROW"));
                        }
                        break;
                    case "QTYORD":

                        //CUSTOMIZATON 37068: Return QTY control on pharma order
                        var validReturnQty = self._checkPreviousOrderedQty({
                            gui: context.gui.gui,
                            orderRow: entity
                        });

                        if (!validReturnQty) {
                            context.valid = false;
                            return;
                        }

                        /*Consignment customization*/
                        //context.valid can be true or false from the previous validation
                        if (entity.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT) {
                            context.valid = context.valid && !(this._isConsignmentAgrementExceeeded(-entity.get("QTYORD"), entity.get("CODART"), entity, order.get("DTEORD")) && entity.get("QTYORD") != 0);
                        }
                        if (entity.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT) {
                            context.valid = context.valid && !(this._isConsignmentAgrementExceeeded(entity.get("QTYORD"), entity.get("CODART"), entity, order.get("DTEORD"), true) && entity.get("QTYORD") != 0);
                        }

                        break;
                }
                break;
        }
    };

    this.afterCreateGridColumn = function (fieldContext) {

        var self = this;
        //call base product implementation
        if (self.base)
            self.base.afterCreateGridColumn(fieldContext);

        var entityName = fieldContext.sectionContext.entityName;
        switch (entityName) {
            case SFConstants.SM1ORDER:
                switch (fieldContext.fieldName) {
                    case "CODTYPROW":
                        var baseValidator = fieldContext.column.validator;
                        fieldContext.column.validator = (function (gui, baseValidator) {
                            return function (context) {

                                if (baseValidator) {
                                    baseValidator(context);
                                    if (!context.isValid)
                                        return;
                                }

                                var orderRow = context.rec.xrec;
                                var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(orderRow.get("CODART"), orderRow.get("CODDIV")));
                                if (!prod.get("FLGEMPTY") && self._isConsignmentRowType(orderRow.get("CODTYPROW"))) {
                                    context.isValid = false;
                                    return;
                                }
                                var order = orderRow.getParentEntity();
                                context.isValid = self._isRowTypValid(orderRow.get("CODTYPROW"), orderRow.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD"));
                            };
                        })(fieldContext.sectionContext.gui, baseValidator);
                        break;
                    case "QTYORD":
                        var baseValidator = fieldContext.column.validator;
                        fieldContext.column.validator = (function (gui, baseValidator) {
                            return function (context) {

                                if (baseValidator) {
                                    baseValidator(context);
                                    if (!context.isValid)
                                        return;
                                }

                                //CUSTOMIZATON 37068: Return QTY control on pharma order
                                var validReturnQty = self._checkPreviousOrderedQty({
                                    gui: gui,
                                    orderRow: context.rec.xrec
                                });

                                if (!validReturnQty) {
                                    context.isValid = false;
                                    return;
                                }

                                /*Consignment customization*/
                                var orderRow = context.rec.xrec;
                                var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(orderRow.get("CODART"), orderRow.get("CODDIV")));
                                if (prod.get("FLGEMPTY")) {
                                    var order = orderRow.getParentEntity();
                                    if (orderRow.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT) {
                                        context.isValid = !(self._isConsignmentAgrementExceeeded(-orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD")) && orderRow.get("QTYORD") != 0);
                                        return;
                                    }
                                    if (orderRow.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT) {
                                        context.isValid = !(self._isConsignmentAgrementExceeeded(orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD"), true) && orderRow.get("QTYORD") != 0);
                                    }
                                }
                            };
                        })(fieldContext.sectionContext.gui, baseValidator);
                        break;

                    case "Z_DTEXPIRE":
                        var baseValidator = fieldContext.column.validator;
                        fieldContext.column.validator = (function (gui, baseValidator) {
                            return function (context) {

                                if (baseValidator) {
                                    baseValidator(context);
                                    if (!context.isValid)
                                        return;
                                }

                                var rowEntity = context.rec.xrec;
                                var contextOrder = {
                                    orderRow: rowEntity,
                                    codTypOrd: rowEntity.getParentEntity().get("CODTYPORD")
                                };

                                if (!self._checkExpireDateOrder(contextOrder))
                                    context.isValid = false;
                            };
                        })(fieldContext.sectionContext.gui, baseValidator);
                        break;

                }
        }

    };

    this.afterNotifyLeave = function (context) {

        var self = this;
        if (this.base)
            this.base.afterNotifyLeave(context);

        var gui = context.ctrl;

        //CUSTOMIZATON 37068: Return QTY control on pharma order
        delete gui._previousOrderedQtys;

        /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
        delete gui._empties;

    };

    /// <summary>
    /// Check if Z_DTEXPIRE  is editable
    /// </summary>
    this._isZDTEXPIREEditable = function (order, orderRow) {

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("Z_DTEXPIRE",
            order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);
        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;
        return false;
    };


    /// <summary>
    /// Check if Z_DTEXPIRE  is visible
    /// </summary>
    this._isZDTEXPIREVisible = function (order) {
        var codStatusGroup = SM1OrderHelper.getStatusGroup(order.get("CODSTATUS"));

        //T112 configuration
        var rowVis = SM1OrderHelper.getVisibilityConfig("Z_DTEXPIRE", order.get("CODTYPORD"), codStatusGroup, UserContext.CodDiv);
        if (rowVis)
            return rowVis.FLGVISIBLE != 0;
        return false;
    };

    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {
        var self = this;

        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;
        var gui = context.gui;
        var order = context.entity;

        switch (context.entityName) {
            case SFConstants.SM1ORDER:
                switch (fieldName) {
                    case "CODPAYMOD":
                        XApp.callCust("guiCustomizer", "salesForceEngine", 'adjustPaymentTerm', order);
                        break;
                    case "TYPDELIV":
                        /*Customization : ENH 36698: DCODE - URGENT order DTEDELIVERY calculation */
                        //if urgent order then DTEDELIV should be today.
                        var delivCust = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey("Customer|" + order.get("CODCUSTDELIV"));
                        date = SM1OrderHelper.calculateDelivDate(order, delivCust);

                        if (order.get("DTEDELIV") - date != 0) {

                            if (self.base._validateDeliveryDate(date, order, detailContext)) {
                                var rows = order.getSubEntityStore(SFConstants.ORDERROW);
                                //refresh the delivery dates for the OrderRows
                                rows.each(function (row) {
                                    row.set("DTEDELIV", date);
                                });

                                self._refreshOrderRowGrid(gui);

                                self.base._validateDeliveryDateOrdersOptInfoAsync(order, date, detailContext);
                                order.set("DTEDELIV", date);
                                XLog.logWarn(UserContext.tryTranslate("[DELIV_DATE_HAS_BEEN_CHANGED]"));
                            }

                        }
                        break;
                }
                break;
        }

        //call base order implementation
        if (self.base)
            self.base.onEditEnding(ctrl, fieldName, newVal, oldVal);
    }

    this.beforeUpdateHeaderPaymentInfo = function (context) {
        if (context.order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES)
            context.canceled = true;
        else
            context.canceled = false;
    }

    this.validateDocument = function (gui,data, context) {
        
        var self = this;
        var order = gui.getDocument();
       
        //MA Pending Invoice based on T048 --> z_invoice_amount DAL CUSTOMIZATION  20180426 CR05
        //MA If credit customer &&  z_invoice_amount > 0 order will be blocked  codTypOrd (0,70,80,)  DAL CUSTOMIZATION  20180426 CR05
        //var codParty = order.get("CODCUSTINV");
        //var codUser = order.get("CODUSR");
        //var codDiv = order.get("CODDIV");
        //var orderTyp = order.get("CODTYPORD");
        //var codStatus = order.get("CODSTATUS");
        //var codPayMod = order.get("CODPAYMOD");
        //var pendingInvoices = [];
        //var pendingInvoices2 = [];
        //var notSaveOrder = false;
        //var blockOrderStatus = false;
      
        //var constraints = new XConstraints({
        //    logicalOp: 'AND',
        //    constraints: [
        //        new XConstraint("CODUSR1", "=", codUser),
        //        new XConstraint("CODDIV", "=", codDiv),
        //        new XConstraint("CODPARTY", "=", codParty)
        //    ]
        //});
        //var customer1 = XNavHelper.getNavRecords("NAV_MOB_CUST", constraints);
        //for (var i = 0 ; i < customer1.length ; i++) {
        //    var pendingInvoice = customer1[i].get("Z_INVOICE_AMOUNT");
        //    pendingInvoices2.push(pendingInvoice); 
        //}

        //var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST", constraints);
        //var cust = customer.filterByConstraints(constraints);
        //for (var i = 0 ; i < cust.length ; i++) {
        //    var pendingInvoice = cust[i].get("Z_INVOICE_AMOUNT");
        //    pendingInvoices.push(pendingInvoice);
        //}

        ////check the open invoices based on t048 - CR05 MA 20180510
        //for (var r = 0 ; r < pendingInvoices.length ; r++) {

        //    if (pendingInvoices[r] > 0 && codPayMod == PaymentMode.CREDIT && orderTyp == SalesForceNameSpace.OrderCTORD.SALES) {
        //       // order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //       //self.base._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
        //       // blockOrderStatus = true;

        //      //  break;
        //    }
           
        //    //in case order type 70 / 80  do not allow to save the order CR05 MA 20180510 
        //    if (pendingInvoices[r] > 0 && codPayMod == PaymentMode.CREDIT && (orderTyp == SalesForceNameSpace.OrderCTORD.INVOICE || orderTyp == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY)) {
        //        //order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //        //self.base._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
        //        //order.set("CODSTATUSMAN", "");            
        //        //notSaveOrder = true;
                
        //    }
            
        //}
        //if (blockOrderStatus) {
        //   // order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
        //   // gui.NonBlockingAnom = true;
         
        // //   this.beforeConfirm(gui));
            

        //}
        //if (notSaveOrder) {
        //    //     
        //  // gui.errorReports["SAVE_INVENTORY"] = { caption: UserContext.tryTranslate("[MOB.NOT_SAVE_ORDER]") };
        //  // return false;
        //} 

        delete gui.errorReports["CODTYPROW"];
        delete gui.errorReports["QTYORD"];
        delete gui.errorReports["Z_DTEXPIRE"];
        delete gui.errorReports["SAVE_INVENTORY"];
        delete gui.errorReports["SAVE_LOAD"];


        /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
        if (gui.saveMode == "CONFIRMATION" && gui.isEditable() && order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {
            gui.errorReports["SAVE_INVENTORY"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.CANNOT_SAVE_DRAFT_INVENTORY]") };
            return false;
        }

        /*CUSTOMIZATION ENH 41206: DCODE: Customization - block save of empty Van Load/Van Load integration*/
        if (gui.saveMode == "CONFIRMATION" && gui.isEditable() && (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.LOAD || order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.LOADINTEGRATION) && order.get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.SOSPESO) {

            var allRowsEmpty = true;
            order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {
                if (orderRow.get("QTYORD") > 0) {
                    allRowsEmpty = false;
                    return false;
                }
            });
            if (allRowsEmpty) {
                gui.errorReports["SAVE_LOAD"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.CANNOT_SAVE_EMPTY_LOAD]") };
                return false;
            }
        }

        var codTypRowValid = true;
        var qtyOrdValid = true;
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {
            var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(orderRow.get("CODART"), orderRow.get("CODDIV")));
            if (!prod.get("FLGEMPTY")) {
                if (self._isConsignmentRowType(orderRow.get("CODTYPROW"))) {
                    gui.errorReports["CODTYPROW"] = { caption: UserContext.tryTranslate("[CODTYPROW]") };
                    codTypRowValid = false;
                    return false;
                }
                return;
            }

            if (!self._isRowTypValid(orderRow.get("CODTYPROW"), orderRow.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD"))) {
                gui.errorReports["CODTYPROW"] = { caption: UserContext.tryTranslate("[CODTYPROW]") };
                codTypRowValid = false;
                return false;
            }

            switch (orderRow.get("CODTYPROW")) {
                case SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT:
                    if (self._isConsignmentAgrementExceeeded(-orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD"))) {
                        gui.errorReports["QTYORD"] = { caption: UserContext.tryTranslate("[QTYORD]") };
                        qtyOrdValid = false;
                        return false;
                    }
                    break;
                case SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT:
                    if (self._isConsignmentAgrementExceeeded(orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD"), true)) {
                        gui.errorReports["QTYORD"] = { caption: UserContext.tryTranslate("[QTYORD]") };
                        qtyOrdValid = false;
                        return false;
                    }
                    break;
            }
        });



        //call base product implementation
        if (self.base)
            return self.base.validateDocument(gui);

        return true;
    }

    this.getQtabsVoices = function (fieldContext) {
        //call base order implementation
        if (this.base)
            this.base.getQtabsVoices(fieldContext);

        switch (fieldContext.fieldName) {
            case "CODTYPROW":
                var order = fieldContext.sectionContext.gui.getDocument();
                var entity = fieldContext.sectionContext.entity;
                if (entity.getEntityName() == SFConstants.ORDERROW) {
                    var prod = entity.getProduct();
                    if (prod) {
                        if (prod.get("FLGEMPTY") != 0) {
                            if (this.base._isAddEmpty)
                                //remove return row types
                                fieldContext["voices"] = [];

                            //add default empty
                            fieldContext["voices"] = this.addDefaultEmptyRowType(fieldContext["voices"], entity, order);

                            //add consignment and back consignment
                            if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVOICE ||
                                order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY) {
                                fieldContext["voices"] = this._addNewRowTypes(fieldContext["voices"]);
                            }
                        }
                        else
                            fieldContext["voices"] = this.removeEmptyRowType(fieldContext["voices"], entity, order);
                    }
                }
                break;
        }
    };

    ////for returnable products added from dedicated ADDRETURN selector
    //allow the system to set the empty row type value if it not exist
    this.addDefaultEmptyRowType = function (voices, orderRow, order) {

        var exist = false;
        var defaultEmptyRowType = OrderParameters.getInstance(order.get("CODTYPORD")).getDefaultEmptyRowType();

        if (XApp.isEmptyOrWhitespaceString(defaultEmptyRowType))
            return voices;

        for (i = 0, n = voices.length; i < n; i++) {
            var voice = voices[i];
            if (voice.value == defaultEmptyRowType)
                exist = true;
        }

        if (!exist) {
            var de = UserContext.getDecodeEntry("TYROW", defaultEmptyRowType, "TYROW");
            if (de != null) {
                voices.push({ value: de.cod, text: de.des });
            }
        }
        return voices;
    };


    this.removeEmptyRowType = function (voices, orderRow, order) {

        var defaultEmptyRowType = OrderParameters.getInstance(order.get("CODTYPORD")).getDefaultEmptyRowType();

        if (XApp.isEmptyOrWhitespaceString(defaultEmptyRowType))
            return voices;

        for (i = 0, n = voices.length; i < n; i++) {
            var voice = voices[i];
            if (voice.value == defaultEmptyRowType) {
                voices.splice(i, 1);
                break;
            }
        }

        return voices;
    };

    this.gridBeginEdit = function (context) {
        //call base order implementation
        if (this.base)
            this.base.gridBeginEdit(context);
        var entity = context.rowEntity;
        switch (entity.getEntityName()) {
            case SFConstants.ORDERROW:
                var order = context.detailContext.gui.getDocument();
                /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
                if (entity.get("Z_ISREADONLYEMPTY") ||
                    (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY &&
                     context.column.fieldName != "QTYORD" && context.column.fieldName != "CODQTYMODCAUSE" && context.column.fieldName != "CODQTYREJCAUSE" &&
                     !(SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity)))) {
                    context.canceled = true;
                }
                else {
                    switch (context.column.fieldName) {
                        case "CODTYPROW":
                            var prod = entity.getProduct();
                            if (prod) {
                                if (prod.get("FLGEMPTY") != 0) {

                                    //add default empty
                                    context.voices = [];
                                    context.voices = this.addDefaultEmptyRowType(context.voices, entity, order);

                                    //add consignment and back consignment
                                    if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVOICE ||
                                        order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY) {
                                        context.voices = this._addNewRowTypes(context["voices"]);
                                    }
                                }
                                else
                                    context["voices"] = this.removeEmptyRowType(context.voices, entity, order);
                            }
                            break;
                        default:
                            break;
                    }
                }
                break;
        }
    };

    this.validateField = function (context) {
        var valid = true;
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        //call base only if the field is different from QTYORD
        if (entity.getEntityName() != SFConstants.ORDERROW && fieldName != "QTYORD") {
            if (this.base)
                valid = this.base.validateField(context);
        }

        switch (entity.getEntityName()) {
            case SFConstants.ORDERROW:
                switch (fieldName) {
                    case "CODTYPROW":
                        var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(entity.get("CODART"), entity.get("CODDIV")));
                        if (!prod.get("FLGEMPTY")) {
                            if (this._isConsignmentRowType(context.newVal)) {
                                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[INVALID_ROW_TYPE]") });
                                return false;
                            }
                            return valid && true;
                        }
                        var order = entity.getParentEntity();
                        if (!this._isRowTypValid(context.newVal, entity.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD"))) {
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[NO_CONSIGNMENT_AGREEMENT_PRESENT]") });
                            return false;
                        }

                        if (!this._isConsignmentRowValid(entity, context.newVal, entity.get("QTYORD"), order.get("DTEORD"))) {
                            return false;
                        }
                        break;
                    case "QTYORD":
                        var order = entity.getParentEntity();
                        //for this field execute base code first
                        //if product is empty or returnable no constraint on QTYORD for Price Delivery order
                        if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY &&
                            !(SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity))) {
                            var msg = this.base._validateDeliveryQtyOrd(entity, context.newVal);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                return false;
                            }
                        }
                        if (entity.get(fieldName) < 0 ||
                            !this.base._validateBenefitQtyOrd(context.gui, entity) ||
                            entity.isWhsBalanceExceeded("QTYORD", context.newVal))
                            return false;

                        var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(entity.get("CODART"), entity.get("CODDIV")));
                        if (!prod.get("FLGEMPTY"))
                            return valid && true;
                        if (!this._isConsignmentRowValid(entity, entity.get("CODTYPROW"), context.newVal, order.get("DTEORD"))) {
                            return false;
                        }
                        break;
                }
            default:
                break;
        }

        return valid;
    };

    this.validateGridField = function (context) {
        var entity = context.rowEntity;
        try {
            //call base only if the field is different from QTYORD
            if (entity.getEntityName() != SFConstants.ORDERROW && context.fieldName != "QTYORD") {
                //call base order implementation
                if (this.base)
                    this.base.validateGridField(context);
            }

            XUI.showWait();
            switch (entity.getEntityName()) {
                case SFConstants.ORDERROW:
                    switch (context.fieldName) {
                        case "CODTYPROW":
                            var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(entity.get("CODART"), entity.get("CODDIV")));
                            if (!prod.get("FLGEMPTY")) {
                                if (this._isConsignmentRowType(context.newVal)) {
                                    XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[INVALID_ROW_TYPE]") });
                                }

                                XUI.hideWait();
                                return;
                            }
                            var order = entity.getParentEntity();

                            if (!this._isRowTypValid(context.newVal, entity.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD"))) {
                                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[NO_CONSIGNMENT_AGREEMENT_PRESENT]") });
                                XUI.hideWait();
                                return;
                            }

                            if (!this._isConsignmentRowValid(entity, context.newVal, entity.get("QTYORD"), order.get("DTEORD"))) {
                                XUI.hideWait();
                                return;
                            }
                            break;
                        case "QTYORD":
                            var order = entity.getParentEntity();
                            //for this field execute base code first
                            context.silent = true;
                            //if product is empty or returnable no constraint on QTYORD for Price Delivery order
                            if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY &&
                                !(SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity))) {
                                var msg = this.base._validateDeliveryQtyOrd(entity, context.newVal);
                                if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                    context.newVal = context.oldVal;
                                    XUI.showErrorMsgBox({ msg: msg });
                                    XUI.hideWait();
                                    return;
                                }
                            }
                            context.rowEntity.set(context.fieldName, context.newVal);
                            context.rowEntity.calculateBenefits(context.gui.CacheData);
                            if (SM1OrderHelper.isUpdateOfOrigQtyRequired(context.gui.getDocument())) {
                                entity.set("QTYORDORIG", entity.get("QTYORD"));
                            }


                            var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(entity.get("CODART"), entity.get("CODDIV")));
                            if (!prod.get("FLGEMPTY")) {
                                XUI.hideWait();
                                return;
                            }
                            if (!this._isConsignmentRowValid(entity, entity.get("CODTYPROW"), context.newVal, order.get("DTEORD"))) {
                                XUI.hideWait();
                                return;
                            }
                            break;
                    }
                default:
                    break;
            }

            context.detailContext.refreshControls();
            XUI.hideWait();

        } catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
    };

    this.validateEntity = function (detailContext) {

        //flag for custom validation 
        var customValidateFlg = true;
        switch (detailContext.entityName) {
            case SFConstants.ORDERROW:
                var orderRow = detailContext.entity;
                var order = orderRow.getParentEntity();
                var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(orderRow.get("CODART"), orderRow.get("CODDIV")));
                if (!prod.get("FLGEMPTY")) {
                    customValidateFlg = !this._isConsignmentRowType(orderRow.get("CODTYPROW"));
                }

                if (!this._isRowTypValid(orderRow.get("CODTYPROW"), orderRow.get("CODART"), order.get("CODCUSTINV"), order.get("DTEORD")))
                    customValidateFlg = false;

                switch (orderRow.get("CODTYPROW")) {
                    case SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT:
                        customValidateFlg = !this._isConsignmentAgrementExceeeded(orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD"));
                        break;
                    case SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT:
                        customValidateFlg = !this._isConsignmentAgrementExceeeded(orderRow.get("QTYORD"), orderRow.get("CODART"), orderRow, order.get("DTEORD"), true);
                        break;
                }
                break;
            default:
                break;
        }

        //call base order implementation
        if (this.base)
            return customValidateFlg && this.base.validateEntity(detailContext);
    };

    this.afterLoadDocument = function (gui) {
        try {
            var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
            var limitVisit = user.get("CODLIMITNEWVISIT");
            var check = false;

            var self = this;
            //call base product implementation
            if (self.base)
                self.base.afterLoadDocument(gui);


            //20180404 dal customization - order editability 
            SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
                if (!openDay && UserContext.checkRight("SELLINGDAY", "CUSTOMIZATION", 'EDIT_ORDER_BEFORE_OPEN_DAY')) {
                    gui.openMode = 'VIEW';
                    XUI.showMsgBox({
                        title: "[MOB.WARN]",
                        msg: UserContext.tryTranslate("[MOB.ORDER_NOT_EDITABLE]"),
                        icon: "WARN",
                        buttons: 'OK',
                        onResult: Ext.emptyFn
                    });
                  //CR03 20181011 Not edit the order if the day not open MADY
                } else if (!openDay && limitVisit == "YES") {
                    //Commentato Mady 20190627 -- NO need for the moment...

                    gui.openMode = 'VIEW';
                    XUI.showMsgBox({
                        title: "[MOB.WARN]",
                        msg: UserContext.tryTranslate("[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]"),
                        icon: "WARN",
                        buttons: 'OK',
                        onResult: Ext.emptyFn
                    });

                }
                else {
                    //do nothing
                }
            });

            /*CUSTOMIZATION 36698: DCODE - URGENT order DTEDELIVERY calculation*/

            if (gui.openMode == 'VIEW')
                return;

            var doc = gui.getDocument();

            if (doc.get("TYPDELIV")) {

                if (doc.get("DTEDELIV") - doc.get("DTEORD") != 0) {
                    doc.set("DTEDELIV", doc.get("DTEORD"));
                    XLog.logWarn(UserContext.tryTranslate("[DELIV_DATE_HAS_BEEN_CHANGED]"));
                }
            }


        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };



    /*CUSTOMIZATION 40688: Allow only 1 open invoice for customer*/
    this._findOpenInvoice = function (gui) {
        var doc = gui.getDocument();

        var mUserGroup = UsrGroup.getGroup(UserContext.CodGrp);
        var xconstr = UsrGroup.getRightExprAsConstraints(mUserGroup, "NAV_MOB_CUST", "TOUCH_RESTRICT_OPEN_INVOICE");

        if (xconstr != null && xconstr.Constraints.length) {
            var customerKey = CommonEngine.buildCustomerKey(doc.get("CODCUSTDELIV"));
            var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(customerKey);
            if (!customer)
                return false;

            if (!customer.checkConstraints(xconstr))
                return false;
        }

        //if we reach this point it means that:
        //1. there are no constraints for the right 
        //2. OR constraints are present and apply to customer of order.
        //(we should check open invoice)
        var openInvoicePresent = false;
        var openInvoices = XNavHelper.getFromMemoryCache("NAV_MOB_PARTYBALANCE");
        if (openInvoices) {
            var openInvoicesBalances = {};
            var cons = new XConstraints({
                logicalOp: 'AND',
                constraints: [new XConstraint("CODUSR", "=", doc.get("CODUSR")),
                    new XConstraint("DTEDOC", "=", (new Date().toDate()))
                    , new XConstraint("CODPARTY", "=", doc.get("CODCUSTDELIV"))
                ]
            });

            openInvoices = openInvoices.filterByConstraints(cons);

            if (openInvoices && openInvoices.length) {
                openInvoicesBalances = CommonEngineCust.calculateOpenInvoicesBalances(openInvoices);

                for (var key in openInvoicesBalances) {
                    var openInvoiceBalance = openInvoicesBalances[key];
                    if (openInvoiceBalance.get("VALABBUONO") > 0) {
                        openInvoicePresent = true;
                        break;
                    }
                };
            }
        }
        return openInvoicePresent;
    };

    this.postAfterCacheLoad = function (context) {

        var gui = context.gui;
        var order = gui.getDocument();
        var self = this;

        var exe = new ExecutionQueue();
        exe.pushHandler(self, function () {
            self._calculateFinalResidualAmount({
                order: order,
                cachedData: gui.CacheData,
                onSuccess: function (residualAmount) {
                    var isModified = order.isModified();
                    order.set("Z_VALCREDITLIMIT", residualAmount);
                    if (!isModified) {
                        order.setModified(false);
                    }
                    exe.executeNext();
                },
                onFailure: function (e) {
                    XLog.logEx(e);
                    exe.executeNext();
                }
            });
        });

        exe.pushHandler(self, function () {
            self._calculateCompleteEmpties({
                order: order,
                gui: gui,
                onSuccess: function () { exe.executeNext(); },
                onFailure: function (e) {
                    XLog.logEx(e);
                    exe.executeNext();
                }
            });
        });

        exe.pushHandler(this, (function (doc) {
            return function () {

                /*CUSTOMIZATION 40688: Allow only 1 open invoice for customer*/
                if (SM1OrderHelper.isAnInvoice(doc.get("CODTYPORD")) && UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "TOUCH_RESTRICT_OPEN_INVOICE")) {
                    if (self._findOpenInvoice(gui)) {
                        XUI.showWarnOk({
                            msg: UserContext.tryTranslate("[MOBGUIORDER.OPEN_INVOICE_PRESENT]"),
                            onResult: function (buttonCode) {
                                exe.executeNext();
                            }
                        });
                        if (gui.confirmButton)
                            gui.confirmButton.setDisabled(true);
                        return;
                    }
                }

                exe.executeNext();
            };
        })(order));

        exe.pushHandler(this, function () {
            XUI.hideWait();
        });

        //START QUEUE
        XUI.showWait();
        exe.executeNext();
    };

    this._addNewRowTypes = function (voices) {
        var de = UserContext.getDecodeEntry("TYROW", SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT, "TYROW");
        if (de)
            voices.push({ value: SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT, text: de.des });
        de = UserContext.getDecodeEntry("TYROW", SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT, "TYROW");
        if (de)
            voices.push({ value: SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT, text: de.des });

        return voices;
    };

    /*CUSTOMIZATION: 36701 DCODE - Display remaining credit limit in the order header.*/
    /*
    context={
        order,
        onSuccess,
        onFailure
    }
    */
    this._calculateFinalResidualAmount = function (context) {

        if (!context)
            return;

        if (!context.order)
            return;

        if (context.order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES) {
            if (context.onSuccess)
                context.onSuccess(0);
            return;
        }

        var self = this;
        var order = context.order;
        var paidAmount = 0;
        var exeq = new ExecutionQueue();

        if (!XApp.isOnline() || UserContext.isFullOfflineMode()) {

            if (!order.InvoiceCustomer) {
                exeq.pushHandler(order, function () {
                    XDocsCache.loadFromLocalCache("Customer|" + order.get("CODCUSTINV"),
                        function (docStore) {
                            if (docStore && docStore.getCount() > 0) {
                                order.InvoiceCustomer = docStore.getAt(0);
                                exeq.executeNext();
                            } else
                                XApp.exec(context.onFailure, [new Error("Eval customer credit - Invoice customer not found in local cache: " + order.get("CODCUSTINV"))]);
                        },
                        function () {
                            XApp.exec(context.onFailure, [new Error("Eval customer credit - Could not load from local cache invoice customer: " + order.get("CODCUSTINV"))]);
                        });
                });
            }

            //calculate the amount paid by customer in open deposits
            exeq.pushHandler(order, function () {
                if (UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVIGATE")
                    || UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVDATA")) {
                    CommonEngine.calculatePaidAmount(this.get("CODCUSTINV"), this.get("CODDIV"),
                        function (calcAmount) {
                            paidAmount = calcAmount;
                            exeq.executeNext();
                        },
                        function (e) {
                            exeq.clear();
                            if (context.onFailure) context.onFailure(e);
                        });
                }
                else exeq.executeNext();
            });

            //actual check
            exeq.pushHandler(order, function () {
                var cDiv = order.InvoiceCustomer.getSubEntityStore("CustomerDiv").findBy(function (cd) {
                    return cd.get("CODDIV") == order.get("CODDIV");
                });
                var cAmount = (!cDiv || cDiv.getSubEntityStore("CustomerAmount").getCount() == 0) ? null :
                    cDiv.getSubEntityStore("CustomerAmount").getAt(0);

                if (!cAmount) {
                    if (context.onSuccess)
                        context.onSuccess(0);
                    return;
                }

                var numDays = UserContext.getRefdatValue("CPTRM", order.get("CODPAYTRM"), "NUMDAYS");
                if (!XApp.isEmptyOrWhitespaceString(numDays) && numDays == 0) {
                    if (context.onSuccess) context.onSuccess(0);
                    return;
                }

                var residualAmount = !cAmount ? 0 : cAmount.get("VALCREDIT") - cAmount.get("VALEXPOSED");
                var orderedAmount = SalesForceEngine.calculateOrderedAmount(order, context.cachedData);

                var orderStatus = order.get("CODSTATUS");
                if ((orderStatus != SalesForceNameSpace.SM1OrderStatus.VALIDO &&
                      orderStatus != SalesForceNameSpace.SM1OrderStatus.BLOCCATO &&
                      orderStatus != SalesForceNameSpace.SM1OrderStatus.CLOSED &&
                      orderStatus != SalesForceNameSpace.SM1OrderStatus.INVOICED) ||
                    //Order is sent to ERP
                      !XApp.isEmptyDate(order.get("DTETOHOST")))
                    orderedAmount -= order.get("TOTALPAY");

                var balance = residualAmount + paidAmount - orderedAmount;
                if (context.onSuccess) context.onSuccess(balance);

            });

        }
        else {

            exeq.pushHandler(order, function () {

                var orderClone = order.clone();
                self.base._clearExtraEntities(orderClone);

                XHttpHelper.ExecuteServerOp({
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesForce.SM1OrderTouchEngineCust',
                    methodName: 'CalculateFinalResidualAmount',
                    data: {
                        "order": orderClone.toJsonObject()
                    }
                },
                  function (response, textStatus, e) {
                      if (context.onFailure)
                          context.onFailure(e);
                  },
                  function (response) {
                      if (response && response.residualAmount != undefined) {
                          if (context.onSuccess) {
                              context.onSuccess(response.residualAmount);
                              return;
                          }
                      }
                      if (context.onSuccess)
                          context.onSuccess(0);
                  });
            });
        }

        exeq.executeNext();

    };

    /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
    this._calculateCompleteEmpties = function (context) {
        var gui = context.gui;
        var order = gui.getDocument();
        var self = this;

        if (gui.isEditable() && order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {

            // if the navigator is not cached or there is an error show message
            var navMobProdParts = XNavHelper.getFromMemoryCache("NAV_MOB_PRODPARTS");
            if (navMobProdParts == null) {
                XLog.logWarn("View not found, or check the NAVDATA right for NAV_MOB_PRODPARTS");
                if (context.onSuccess)
                    context.onSuccess();
                return; //EXIT
            }

            gui._empties = {
                compounds: {},
                singles: {}
            };


            //identify all existing empties: compounds and singles
            order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {
                //This customization works only if product is an empty
                if (orderRow.Product && orderRow.Product.get("FLGEMPTY") && orderRow.get("CODTYPROW") == SalesForceNameSpace.OrderTYROW.EMPTY) {
                    if (orderRow.Product.get("FLGARTCOMP")) {
                        //mark duplicates
                        if (gui._empties.compounds[orderRow.get("CODART")])
                            gui._empties.compounds[orderRow.get("CODART")].exclude = true;
                        else
                            gui._empties.compounds[orderRow.get("CODART")] = {
                                codArt: orderRow.get("CODART"),
                                orderRow: orderRow,
                                singles: null
                            };
                    }
                    else {
                        //mark duplicates
                        if (gui._empties.singles[orderRow.get("CODART")])
                            gui._empties.singles[orderRow.get("CODART")].exclude = true;
                        else
                            gui._empties.singles[orderRow.get("CODART")] = {
                                codArt: orderRow.get("CODART"),
                                orderRow: orderRow,
                                compounds: null
                            };
                    }
                }
            });

            //cleanup duplicates
            for (var codArtCompound in gui._empties.compounds) {
                var compound = gui._empties.compounds[codArtCompound];
                if (compound.exclude)
                    delete gui._empties.compounds[codArtCompound];
            }

            for (var codArtSingle in gui._empties.singles) {
                var single = gui._empties.singles[codArtSingle];
                if (single.exclude)
                    delete gui._empties.singles[codArtSingle];
            }

            //no single empty - then nothing to do
            if (!Object.keys(gui._empties.singles)) {
                if (context.onSuccess)
                    context.onSuccess();
                return; //EXIT
            }

            //Transfor the kit/components navigator in an indexed collection
            var allCompounds = {};

            for (var i = 0; i < navMobProdParts.Rows.length; i++) {


                if (navMobProdParts.Rows[i].get("CODDIV") != UserContext.CodDiv)
                    continue;

                var codArtCompound = navMobProdParts.Rows[i].get("CODART");

                if (!allCompounds[codArtCompound]) {
                    allCompounds[codArtCompound] = {
                        parts: {}
                    };
                }

                allCompounds[codArtCompound].parts[navMobProdParts.Rows[i].get("CODARTSON")] = {
                    umson: navMobProdParts.Rows[i].get("UMSON"),
                    qty: navMobProdParts.Rows[i].get("QTY")
                };

            }

            for (var codArtCompound in allCompounds) {

                var compoundDefinition = allCompounds[codArtCompound];

                //compound was already found in order rows or in previous loops
                if (gui._empties.compounds[codArtCompound]) {
                    var compound = gui._empties.compounds[codArtCompound];
                }
                else {
                    //compund not present - it  must be created
                    var compound = {
                        codArt: codArtCompound,
                        orderRow: null,
                        singles: null
                    };
                    gui._empties.compounds[codArtCompound] = compound;
                }


                //Associated singles to compounds
                for (var codArtSingle in gui._empties.singles) {
                    var single = gui._empties.singles[codArtSingle];
                    //if current compound has been excluded in a previous loop then makes no sense to continue searching his components
                    if (compound.exclude)
                        break;

                    //if current single has been excluded in a previous loop then makes no sense to try associated with compound
                    if (single.exclude) {
                        compound.exclude = true;
                        break;
                    }

                    var part = compoundDefinition.parts[codArtSingle];
                    if (part) {
                        if (!single.compounds) single.compounds = [];

                        single.part = part;
                        single.compounds.push(compound);

                        if (!compound.singles) compound.singles = [];
                        compound.singles.push(single);

                        //customization works only if single empty are present in only one complete empty
                        //exclude compounds that hae singles with 0 QTY. Division will not be possible later.
                        if (single.compounds.length > 1 || single.part.qty <= 0) {
                            single.exclude = true;
                            for (var ic = 0; ic < single.compounds.length ; ic++)
                                single.compounds[ic].exclude = true;
                            break;
                        }
                    }
                }

                // if compound parts are less than singles then we cannot calculate a complete empty
                if (!compound.exclude && (!compound.singles || Object.keys(compoundDefinition.parts).length != compound.singles.length))
                    compound.exclude = true;
            }

            var umInteger = OrderParameters.getInstance(order.get("CODTYPORD")).getUmInteger();
            var umRemainder = OrderParameters.getInstance(order.get("CODTYPORD")).getUmRemainder();
            var recalculateBenefits = false;

            //calculated complete empties
            for (var codArtCompound in gui._empties.compounds) {
                var compound = gui._empties.compounds[codArtCompound];
                //customization works only if sinlge empty are present in only one complete empty
                if (compound.exclude)
                    continue;

                // calculated how many times the single empty fit in the compound empty.
                var divisor = Number.MAX_VALUE;
                for (var iSingle in compound.singles) {
                    var single = compound.singles[iSingle];
                    // convert integer part and remainder part in qty needed by compound empty
                    single.qtyInUMSON = SalesForceEngine.convertQuantity(single.orderRow.get("CODART"), single.orderRow.get("WHSBALANCEORD"), single.orderRow.get("UMORD"), single.part.umson, gui.CacheData);

                    //how many times does the single(integer+remainder) fit in the compound
                    var compQty = single.part.qty; //in UMSON
                    var div = Math.floor(single.qtyInUMSON / compQty); //compQTY = 0 already excluded in a previous step
                    if (div < divisor) divisor = div;
                }

                if (divisor != Number.MAX_VALUE && divisor >= 1) {

                    //create compound empty order row if none present
                    if (compound.orderRow == null) {

                        var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(codArtCompound, UserContext.CodDiv));

                        if (!prod) {
                            XLog.logInfo("\tCompound empty not created. Product not present in navigator for codart: " + codArtCompound);
                            compound.exclude = true;
                            continue;
                        }

                        var prodBal = {
                            CODART: codArtCompound,
                            CODDIV: UserContext.CodDiv,
                            CODTYPROW: SalesForceNameSpace.OrderTYROW.EMPTY,
                            QTYORD: 0,
                            UMORD: prod.get("UMWHS"),
                            QTYINV: 0,
                            OrdBatchWhsBalances: {}
                        };
                        var key = SalesForceEngine.buildProdWhsBalanceKey(codArtCompound, SalesForceNameSpace.OrderTYROW.EMPTY);
                        gui.CacheData.m_whsBalances[order.get("CODWHS")].OrdProdWhsBalances[key] = prodBal;

                        var orderRowInfo = order.AddOrderRow(prod, SalesForceNameSpace.OrderTYROW.EMPTY, "", 0, "", gui.CacheData);
                        if (!orderRowInfo.orderRow) {
                            XLog.logInfo("\tCompound empty not created. AddOrderRow returned error: " + orderRowInfo.errCode);
                            compound.exclude = true;
                            continue;
                        }

                        compound.orderRow = orderRowInfo.orderRow;
                        compound.orderRow.set("BUDGETBALANCE", 0);
                        compound.orderRow.set("INITIALWHSBALANCEORD", 0);
                        compound.orderRow.set("INITIALWHSBALANCEINV", 0);
                        compound.orderRow.set("ADJUSTMENTQTY", 0);
                        compound.orderRow.set("REQUESTEDQTYORD", 0);

                    }

                    for (var iSingle in compound.singles) {
                        var single = compound.singles[iSingle];

                        var remainderUmOrd = SalesForceEngine.convertQuantity(single.orderRow.get("CODART"), single.qtyInUMSON - divisor * single.part.qty, single.part.umson, single.orderRow.get("UMORD"), gui.CacheData);
                        var remainderUmInv = SalesForceEngine.convertQuantity(single.orderRow.get("CODART"), remainderUmOrd, single.orderRow.get("UMORD"), single.orderRow.get("UMINV"), gui.CacheData);

                        //update qty in single empty
                        var prevQtyOrd = single.orderRow.get("QTYORD");
                        single.orderRow.set("QTYORD", 0);
                        single.orderRow.splitQuantityFieldValue("QTYORD", 0, gui.CacheData);
                        self.base._updateQtyInvFieldValue(single.orderRow, prevQtyOrd, "QTYORD", gui.CacheData);

                        //Update whs balance  - single
                        var prodBalance = SalesForceEngine.getWhsBalance(order.get("CODWHS"), single.orderRow.get("CODART"), order.get("CODTYPORD"), single.orderRow.get("CODTYPROW"), gui.CacheData);
                        if (prodBalance != null) {
                            prodBalance.QTYORD = SalesForceEngine.convertQuantity(prodBalance.CODART, remainderUmOrd, single.orderRow.get("UMORD"), prodBalance.UMORD, gui.CacheData);
                            prodBalance.QTYINV = remainderUmInv;
                        }

                        single.orderRow.set("INITIALWHSBALANCEORD", remainderUmOrd);
                        single.orderRow.set("INITIALWHSBALANCEINV", remainderUmInv);
                        single.orderRow.splitQuantityFieldValue("WHSBALANCEORD", remainderUmOrd, gui.CacheData);
                        SM1OrderHelper.updateAdjustmentData(single.orderRow, gui.CacheData);

                        //mark empties as readonly
                        single.orderRow.set("Z_ISREADONLYEMPTY", true);
                        single.orderRow.set("Z_EMPTYGROUP", codArtCompound);
                    }


                    //move quantity in compound empty
                    var prevQtyOrd = compound.orderRow.get("QTYORD");
                    compound.orderRow.set("QTYORD", compound.orderRow.get("WHSBALANCEORD") + divisor);
                    compound.orderRow.splitQuantityFieldValue("QTYORD", compound.orderRow.get("QTYORD"), gui.CacheData);
                    self.base._updateQtyInvFieldValue(compound.orderRow, prevQtyOrd, "QTYORD", gui.CacheData);

                    //Update whs balance  - compound
                    var prodBalance = SalesForceEngine.getWhsBalance(order.get("CODWHS"), compound.orderRow.get("CODART"), order.get("CODTYPORD"), compound.orderRow.get("CODTYPROW"), gui.CacheData);
                    if (prodBalance != null) {
                        prodBalance.QTYORD = SalesForceEngine.convertQuantity(prodBalance.CODART, compound.orderRow.get("QTYORD"), compound.orderRow.get("UMORD"), prodBalance.UMORD, gui.CacheData);
                        prodBalance.QTYINV = compound.orderRow.get("QTYINV");
                    }

                    compound.orderRow.set("INITIALWHSBALANCEORD", compound.orderRow.get("QTYORD"));
                    compound.orderRow.set("INITIALWHSBALANCEINV", compound.orderRow.get("QTYINV"));
                    compound.orderRow.splitQuantityFieldValue("WHSBALANCEORD", compound.orderRow.get("WHSBALANCEORD"), gui.CacheData);
                    SM1OrderHelper.updateAdjustmentData(compound.orderRow, gui.CacheData);

                    compound.orderRow.set("Z_EMPTYGROUP", codArtCompound);

                    recalculateBenefits = true;
                }
            }

            if (recalculateBenefits)
                order.calculateBenefits(gui.CacheData);

            //group compound and empties and sort  compounds first in group
            order.getSubEntityStore(SFConstants.ORDERROW).sortStore(function (or1, or2) {
                if (or1.get("Z_EMPTYGROUP") < or2.get("Z_EMPTYGROUP"))
                    return -1;
                else
                    if (or1.get("Z_EMPTYGROUP") > or2.get("Z_EMPTYGROUP"))
                        return 1;
                    else
                        if (!or1.get("Z_EMPTYGROUP") && or2.get("Z_EMPTYGROUP"))
                            return 1;
                        else if (or1.get("Z_EMPTYGROUP") && !or2.get("Z_EMPTYGROUP"))
                            return -1;
                        else
                            if (or1.Product.get("FLGARTCOMP"))
                                return -1;
                            else
                                if (or2.Product.get("FLGARTCOMP"))
                                    return 1;
                                else
                                    return 0;

            });
        }

        if (context.onSuccess)
            context.onSuccess(); //EXIT
    };


    this.beforeCreateGridColumn = function (fieldContext) {

        // mady 20170703


        //var self = this;
        //var entityName = fieldContext.sectionContext.entityName;
        //var fieldName = fieldContext.column.fieldName;
        //var entity = fieldContext.sectionContext.gui.getDocument();

        //if (self.base)
        //    self.base.beforeCreateGridColumn(fieldContext);


        ///*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
        //switch (entityName) {
        //    case SFConstants.SM1ORDER:
        //        //apply background to all columns if row has Z_ISREADONLYEMPTY
        //        var baseValidator = fieldContext.column.validator;
        //        fieldContext.column.validator = (function (fieldContext, baseValidator) {
        //            return function (opt) {
        //                var row = opt.rec;

        //                if (baseValidator)
        //                    baseValidator(opt);

        //                if (row.get("Z_ISREADONLYEMPTY"))
        //                    opt.classNames.push("inventory-grid-detail-column");
        //            };
        //        })(fieldContext, baseValidator);
        //        switch (fieldName) {
        //            case "CODTYPROW":
        //                if (entity.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY) {
        //                    fieldContext.column.editable = true;
        //                }
        //                break;
        //        }
        //        break;
        //}
    }

    this._getAvailableConsignment = function (codArt, codCustInv, dteOrd) {
        var existingConsignment;
        var availableConsignments = XNavHelper.getFromMemoryCache("NAV_MOB_CONSIGNMENTS");
        if (!availableConsignments)
            return existingConsignment;

        availableConsignments.Rows.some(function (consignment) {
            if (consignment.get("CODART") == codArt && consignment.get("CODPARTY") == codCustInv && (consignment.get("DTESTART") - dteOrd <= 0) && (consignment.get("DTEEND") - dteOrd >= 0)) {
                existingConsignment = consignment;
                return true;
            }
        });
        return existingConsignment;
    };

    this._isConsignmentAgrementExceeeded = function (qty, codArt, row, dteOrd, isBackConsignment) {
        var order = row.getParentEntity();
        var codCustInv = order.get("CODCUSTINV");
        var existingConsignment = this._getAvailableConsignment(codArt, codCustInv, dteOrd);

        if (!existingConsignment)
            return false;

        order.getSubEntityStore(SFConstants.ORDERROW).toArray()
            .filter(function (orderRow) {
                return orderRow.get("CODART") == codArt
                    && orderRow.get("NUMROW") != row.get("NUMROW")
                    && (orderRow.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT
                    || orderRow.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT);
            }).forEach(function (orderRow) {
                qty += (orderRow.get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT) ? -orderRow.get("QTYORD") : orderRow.get("QTYORD");
            });

        return ((qty > existingConsignment.get("QTYAGREE") - existingConsignment.get("QTYBALANCE") && isBackConsignment) || ((-qty > existingConsignment.get("QTYBALANCE") && !isBackConsignment)));
    };

    this._isRowTypValid = function (codTypRow, codArt, codCustInv, dteOrd) {
        if (codTypRow != SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT &&
            codTypRow != SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT)
            return true;

        return this._getAvailableConsignment(codArt, codCustInv, dteOrd) != undefined;
    };

    this._isConsignmentRowValid = function (entity, rowType, quantity, dteOrd) {
        try {
            if (rowType == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT &&
                this._isConsignmentAgrementExceeeded(-quantity, entity.get("CODART"), entity, dteOrd)) {
                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[CONSIGNMENT_BALANCE_EXCEEDED]") });
                return false;
            }

            if (rowType == SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT &&
                this._isConsignmentAgrementExceeeded(quantity, entity.get("CODART"), entity, dteOrd, true)) {
                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[CONSIGNMENT_AGREMENT_EXCEEDED]") });
                return false;
            }

            return true;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    };

    this._isConsignmentRowType = function (rowType) {
        return (rowType == SalesForceNameSpaceCust.OrderTYROW.CONSIGNMENT || rowType == SalesForceNameSpaceCust.OrderTYROW.BACKCONSIGNMENT);
    };

    this.getMenuButtons = function (context) {

        var self = this;
        //call base product implementation
        if (self.base)
            self.base.getMenuButtons(context);
        
     

        var gui = context.ctrl;
        var order = gui.getDocument();


        //TODO - DCODE- ADD zebra print button for devliery document
        var zebraReportButton = {
            buttonCls: 'sm1-toolbar-button',
            msg: UserContext.tryTranslate("[MOBORDER.DELIVERY_REPORT]"),
            visible: gui.openMode != "NEW",
            docked: "",
            handler: function () {
                var doc = gui.getDocument();

                //Build the ZPL string with the print
                var zpl = "TODO - create print text here from doc";
                //Call zebraPrint
                app.zebraPrint(zpl);
            }
        };
        //TODO - add the button in the collection ONLY for delivery order type
        context.buttons.push(zebraReportButton);

        //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
        if (gui.cancelOrderButton && context.buttons.indexOf(gui.cancelOrderButton))
            context.buttons.splice(context.buttons.indexOf(gui.cancelOrderButton), 1);

        gui.cancelOrderButton = {
            msg: UserContext.tryTranslate("[MOBORDER.CANCEL_ORDER]"),
            visible: (XApp.isEmptyOrWhitespaceString(SalesForceEngine.canCancelOrder(gui.getDocument())) &&
            gui.getDocument().get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO),
            handler: (function (ui) {
                return function () {
                    var doc = ui.getDocument();

                    //Improve the cancel order functionality allowing to cancel an invoice order type (see optinfo ISANINVOICE) in invoiced status (status = 11 - new)  
                    if (SM1OrderHelper.isAnInvoice(doc.get("CODTYPORD"))) {
                        SalesForceEngine.searchOpenInvoice(doc.get("CODUSR"), doc.get("CODTYPORD"), doc.get("NUMDOC"), doc.get("NUMORD"), doc.get("DTEORD"), XUI.showExceptionMsgBox, function (openInvoiceCheckResponse) {
                            try {

                                switch (openInvoiceCheckResponse.openInvoiceState) {
                                    //Case #1: if the invoice has not created an open invoice the system has to update the invoice status in "cancelled".
                                    case SalesForceNameSpace.OpenInvoiceState.NOOPENINVOICE:
                                        self.base.doCancelOrder(ui);
                                        break;

                                        //Case #2: if the open invoice not is associated to an encashment, update the order (invoice order type) status in "cancelled". 
                                        // If the application  is touch the open invoice generated from the cancelled order has to be removed from the open invoice list.
                                    case SalesForceNameSpace.OpenInvoiceState.NOENCASHMENT:
                                        //Remove the invoice from the invoices list/nav
                                        if (openInvoiceCheckResponse.openInvoice) {
                                            SalesForceEngine.removeOpenInvoice(openInvoiceCheckResponse.openInvoice,
                                                XUI.showExceptionMsgBox, function () {
                                                    self.base.doCancelOrder(ui);
                                                });
                                        }
                                        else
                                            self.base.doCancelOrder(ui);
                                        break;
                                        //#Case #3: if the open invoice is associated to an encashment linked to a deposit that cannot be loaded: an error message has to be shown
                                    case SalesForceNameSpace.OpenInvoiceState.DEPOSITUNAVAILABLE:
                                        XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.DOC_UNAVAILABLE]") });
                                        //and do nothing
                                        break;
                                        //Case #4:    if the open invoice is associated to an encashment linked to a closed deposit: an error message has to be shown
                                    case SalesForceNameSpace.OpenInvoiceState.DEPOSITCLOSED:
                                        XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.INVOICE_ALREADY_PAID]") });
                                        //and do nothing
                                        break;
                                        //Case #5:  if the open invoice is associated to an encashment linked to a open deposit  a warning message has to be shown
                                    case SalesForceNameSpace.OpenInvoiceState.DEPOSITOPEN:
                                        XUI.showYESNO({
                                            icon: 'WARN',
                                            title: UserContext.tryTranslate("[MOB.WARN]"),
                                            msg: UserContext.tryTranslate("[MOBGUIORDER.ASK_CANCEL_ENCASHMENT]"),
                                            onResult: function (buttonCode) {
                                                switch (buttonCode) {
                                                    //If yes the system update the order (invoice order type) status in "cancelled"; and call the method that cancel the encashment containign the open invoice.
                                                    //If the application  is touch the open invoice generated from the cancelled order has to be removed from the open invoice list.
                                                    case 'YES':
                                                        var deposit = openInvoiceCheckResponse.deposit;
                                                        var encashment = openInvoiceCheckResponse.encashment;
                                                        //MADY hundel cancel invoice after payment collection 20200317                                                  
                                                        //start                                              
                                                        var codParty = null;
                                                        var coddiv = null;
                                                        var dteEnc = null;
                                                        var idEnc = null;

                                                        //FIX null value Mady 20200317
                                                        if (encashment == null)
                                                        {
                                                            
                                                            var encs = deposit.ActiveEncashmentDetails();
                                                            for (var i = 0, l = encs.getCount() ; i < l; i++) {
                                                                var enc = encs.getAt(i);

                                                                codParty = enc.get("CODPARTY");
                                                                coddiv = enc.get("CODDIV");
                                                                dteEnc = enc.get("DTEENC");
                                                                idEnc = enc.get("IDENC");
                                                            }
                                                              //  var encashments = deposit.ActiveEncashmentDetails();
                                                              //  for (var i = 0, l = encashments.getCount() ; i < l; i++) {
                                                              //      var enc = encashments.getAt(i);
                                                              //      var encRows = enc.getSubEntityStore("EncashmentRow");

                                                              //      for (var j = 0, s = encRows.getCount() ; j < s; j++) 
                                                              //      {
                                                              //          var encRow = encRows.getAt(j);
                                                              //          codParty = encRow.get("CODPARTY");
                                                              //          coddiv = encRow.get("CODDIV");
                                                              //          dteEnc = encRow.get("DTEENC");
                                                              //          idEnc = encRow.get("IDENC");
                                                              //      }                                            
                                                              //}
                                                        }
                                                       else {
                                                            codParty = encashment.get("CODPARTY") ;
                                                            coddiv = encashment.get("CODDIV");
                                                            dteEnc = encashment.get("DTEENC");
                                                            idEnc = encashment.get("IDENC");
                                                        }
                                                        
                                                        //start reomve encashment if the invoice cancelled.. mady 20200317
                                                        CommonEngineCust.removeEncashmentCust(deposit.get("CODUSR"), deposit.get("IDDEP"), codParty, coddiv, dteEnc, idEnc, XUI.showExceptionMsgBox, function (removed) {
                                                            if (removed) {
                                                                //update invoices navigator
                                                                if (openInvoiceCheckResponse.openInvoice) {
                                                                    SalesForceEngine.removeOpenInvoice(openInvoiceCheckResponse.openInvoice,
                                                                        XUI.showExceptionMsgBox, function () {
                                                                            self.base.doCancelOrder(ui);
                                                                        });
                                                                }
                                                            } else {
                                                                XUI.showExceptionMsgBox();
                                                            }
                                                        });

                                                        break;
                                                    default:
                                                        //If no: do nothing
                                                        break;
                                                }
                                            }
                                        });
                                        break;
                                    default:
                                        XUI.showExceptionMsgBox();
                                        break;

                                }
                            } catch (e) {
                                XUI.showExceptionMsgBox(e);
                            }
                        });
                    }
                    else
                        //previous behaviour -standard order cancel functionality
                        self.base.doCancelOrder(ui);
                };
            })(gui)
        };
        context.buttons.push(gui.cancelOrderButton);

        /* DCODE - Cancel Order should be allowed if there is the right , even if order is read-only         */
        if (!gui.cancelOrderButton.visible) {
            if (SalesForceEngine.canCancelOrder(order) == "[MOB.CUST.ORDER_VALID_STATUS_NOT_EDITABLE]") {
                if (order.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)
                    gui.cancelOrderButton.visible = true;
            }
        }
    };

    this.getSectionButtons = function (context) {
        if (this.base)
            this.base.getSectionButtons(context);

        var doc = context.gui.getDocument();
        if (doc && doc.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY) {
            var sectionName = context.config.attrs["caption"];
            var subEntityName = context.config.attrs["detailObject"];

            if (sectionName == "GRID" && subEntityName == SFConstants.ORDERROW) {
                for (var i = 0; i < context.buttons.length; i++) {
                    var button = context.buttons[i];
                    if (button.msg == UserContext.tryTranslate("[MOBORDER.ADDRETURN]") || button.msg == UserContext.tryTranslate("[MOBORDER.ADDEMPTY]"))
                        button.visible = true;
                }
            }
        }
    };

    this.setRemoveButtonsStatus = function (context) {
        if (this.base)
            this.base.setRemoveButtonsStatus(context);

        var entity = context.subGui.entity;
        var order = context.gui.getDocument();
        switch (context.detailEntityName) {
            case SFConstants.ORDERROW:
                if (order && order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY) {
                    context.visible = SalesForceEngineCust.isReturnableProduct(entity) || SalesForceEngineCust.isEmptyProduct(entity);
                }
                break;
        }
    };
};

XApp.registerGuiExtensionCust("mobGuiOrder", new _mobGuiOrderExtensionCust());
//#endregion
