//salesForceEngineExtensionCust 

function _salesForceEngineExtensionCust() {

    this.adjustPaymentTerm = function (order) {
        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
            return;

        switch (order.get("CODPAYMOD")) {
            case PaymentMode.CASH:
                order.set("CODPAYTRM", "000");  //default for cache sale
                break;
            case PaymentMode.CASHANDCREDIT:
                order.set("CODPAYTRM", "");
                break;
            case PaymentMode.CREDIT:
                if (!order.InvoiceCustomer)
                    return
                var customerDiv = order.InvoiceCustomer.getSubEntityStore('CustomerDiv').findBy(function (r) {
                    return r.get("CODDIV") == UserContext.CodDiv;
                });
                order.set("CODPAYTRM", customerDiv.get("CODPAYTRM"));
                break;
        }
    };
    //MA_CR03_20191706 NEW METHOD   beforeCanEditOrder.
    this.beforeCanEditOrder = function (entity) {

        // CUSTOMIZ MA_CR03_20191706
        //var user = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
        //var limitVisit = user.get("CODLIMITNEWVISIT");
        //var check = false;
        //SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
        //    if (limitVisit == "YES" &&  !openDay) {
        //             check = true;
        //        };
        //})      
        //SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv,
        //    function () {
        //        XUI.hideWait();
        //        XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]') });
        //    },
        //    function (found) {
        //        XUI.hideWait();
        //        if (!found && limitVisit == "YES") {
        //             // check = true;
        //            // XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]') });
        //        }
        //    })
        //     if (!found && limitVisit == "YES") {
        //         check = true;
        //     }
           
        //if ( check = true && (entity.get("IDDAY") == null || entity.get("IDDAY") == ""))
        //     {
        //         entity.canceled = true;          
        //     }
    };


    this.afterAssignCustomer = function (context) {
        var order = context.order;
        this.adjustPaymentTerm(order);
    };
    /// Calculate the ordered amount for current invoice customer as SUM(T100.NETAMOUN+T100.TAXAMOUNT+T100.VATAMOUNT)
    //DAL CUSTOMIZATION CR-4 - 20191706 - MA: AGGIUNTI I CODTYPORD IN STATO DELIVERD E BOZZA(SOSPESO).
    this.calculateOrderedAmount = function (order, cacheData) {
        var statuses = [
            SalesForceNameSpace.SM1OrderStatus.VALIDO,
            SalesForceNameSpace.SM1OrderStatus.BLOCCATO,
            SalesForceNameSpace.SM1OrderStatus.CLOSED,
            SalesForceNameSpace.SM1OrderStatus.INVOICED,
            SalesFoceNameSpace.SM1OrderStatus.DELIVERED,
            SalesForceNameSpace.SM1OrderStatus.SOSPESO
        ];

        //determine sales order types
        var orderTypes = [];
        var ctord = UserContext.getDecodeTable("CTORD");
        if (ctord) {
            for (var codTypOrd in ctord) {
                if (SalesForceEngine.getOrderMacroType(codTypOrd) == SalesForceNameSpace.OrderMacroType.SALES)
                    orderTypes.push(codTypOrd);
            }
        }

        //sum up amounts to be paid from orders invoiced to the same customer
        var constraints = new XConstraints({
            logicalOp: "AND",
            constraints: [
                new XConstraint("CODDIV", SqlRelationalOperator.Equal, order.get("CODDIV")),
                new XConstraint("CODCUSTINV", SqlRelationalOperator.Equal, order.get("CODCUSTINV")),
                new XConstraint("CODSTATUS", SqlRelationalOperator.In, statuses),
                new XConstraint("CODTYPORD", SqlRelationalOperator.In, orderTypes),
                //the order is not yet sent to ERP (DTETOHOST is empty)
                new XConstraints({
                    logicalOp: "OR",
                    constraints: [
                        new XConstraint("DTETOHOST", SqlRelationalOperator.IsNull),
                        new XConstraint("DTETOHOST", SqlRelationalOperator.Equal, Constants.SM1MINDATE)
                    ]
                }),
                //exclude current order while reading from nav, its amount is calculated from in memory obj
                new XConstraint("DOCUMENTKEY", SqlRelationalOperator.NotEqual, order.get("DOCUMENTKEY"))
            ]
        });

        //make sure that all current amounts are calculated correctly
        order.calculateBenefits(cacheData);
        var ordAmount = order.get("TOTALPAY");

        //since only sales orders are needed for calculation, it is not needed to read data from van movements nav
        var orders = XNavHelper.getNavRecords("NAV_MOB_ORDERS", constraints);
        for (var i = 0; i < orders.length; i++) {
            var ordNavRow = orders[i];
            ordAmount += ordNavRow.get("NETAMOUNT") + ordNavRow.get("TAXAMOUNT") + ordNavRow.get("VATAMOUNT");
        }

        return ordAmount;
    };


    //Customization Enh #39342 When an empty product is added in order row from empty selector: the user has to have 
    //the possibility to edit the order row type in "Consigment" or "Back Consigment"
    this.beforeIsRowTypeEditable = function (context) {
        context.canceled = true;

        var orderRow = context.orderRow;
        var order = context.order;
        //CODTYPROW is not editable if the row was added by pricing engine (is a benefit)
        if (orderRow.get("CODSRC") != SalesForceNameSpace.OrderBESRC.MANUALE) {
            context.result = false;
            return;
        }

        //for inventory orders, CODTYPROW is editable only when adding a new row
        if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY &&
            orderRow.get("NUMROW") != this._newNumRow) {
            context.result = false;
            return;
        }

        context.result = true;
    };

    //#region Warehouse balance

    this.beforeCalculateWarehouseBalance = function (context) {
        context.cancel = true;

        if (UserContext.isFullOfflineMode()) {
            //invoke customized method
            this._calculateWarehouseBalanceOfflineCust(context.codWhs, context.excludeOrdDocKey,
                context.cacheData, context.onSuccess, context.onFail);
            return;
        };

        if (XApp.isOnline()) {
            //invoke method from base engine
            //it is customized server side
            context.base._calculateWarehouseBalanceOnline(context.codWhs, context.excludeOrdDocKey,
                context.onSuccess, context.onFail);
            return;
        }

        //the app is not in full oflline mode and it does not have connectivity
        //calculation can not be performed
        context.onSuccess();
    };

    // Calculates warehouse balance for products from current warehouse
    // and tracks different movement types
    // by using locally cahed data in full offline mode
    this._calculateWarehouseBalanceOfflineCust = function (codWhs, excludeOrdDocKey, cacheData, onSuccess, onFail) {
        try {
            //holds calculated whs balance per product
            var prodBalances = {
                CODWHS: codWhs,
                CODDIV: UserContext.CodDiv,
                OrdProdWhsBalances: {}
            };

            if (!UserContext.isFullOfflineMode() ||
                XApp.isEmptyOrWhitespaceString(codWhs)) {
                onSuccess(prodBalances);
                return;
            }

            var navWhsBalances = XNavHelper.getFromMemoryCache("NAV_MOB_WHSBALANCE");
            if (!navWhsBalances) {
                XLog.logWarn("NAV_MOB_WHSBALANCE not found.", true);
                onSuccess(prodBalances);
                return;
            }

            var navWhsBalancesBatch = XNavHelper.getFromMemoryCache("NAV_MOB_WHSBALANCE_BATCH");
            if (!navWhsBalancesBatch) {
                XLog.logWarn("NAV_MOB_WHSBALANCE_BATCH not found.", true);
                onSuccess(prodBalances);
                return;
            }

            prodBalances.DTEMOD = SalesForceEngine._getLastInventoryUpdate(codWhs);

            //load all current warehouse balances
            var filteredWhsBalances = navWhsBalances.filterByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("CODDIV", "=", UserContext.CodDiv),
                    new XConstraint("CODWHS", "=", codWhs)
                ]
            }));

            for (var i = 0; i < filteredWhsBalances.length; i++) {
                var whsBalance = filteredWhsBalances[i];
                var codArt = whsBalance.get("CODART");
                var codDiv = whsBalance.get("CODDIV");
                var prodKey = CommonEngine.buildProductKey(codArt, codDiv);

                var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(prodKey);
                if (!prod)
                    continue;

                //load batch warehouse balances for current prod
                var filteredWhsBalancesBatch = navWhsBalancesBatch.filterByConstraints(new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODDIV", "=", UserContext.CodDiv),
                        new XConstraint("CODWHS", "=", codWhs),
                        new XConstraint("CODART", "=", codArt)
                    ]
                }));

                //create "start values"
                var prodBal = {
                    CODART: codArt,
                    CODDIV: prodBalances.CODDIV,
                    CODTYPROW: SalesForceNameSpace.OrdProdWhsBalance.ALLDELIVERY,
                    QTYORD: whsBalance.get("QTYSTOCK"),
                    UMORD: whsBalance.get("UMSTOCK"),
                    QTYINV: whsBalance.get("QTYINV"),
                    OrdBatchWhsBalances: {},
                    //customization
                    QTYSTART: whsBalance.get("QTYSTOCK"),
                    QTYSELL: 0,
                    QTYRETURN: 0,
                    QTYMISS: 0,
                    QTYSPOIL: 0
                };

                for (var j = 0; j < filteredWhsBalancesBatch.length; j++) {
                    var batchBal = filteredWhsBalancesBatch[j];
                    prodBal.OrdBatchWhsBalances[batchBal.get("IDBATCH")] = {
                        IDBATCH: batchBal.get("IDBATCH"),
                        DTEEXPIRE: batchBal.get("DTEEXPIRE"),
                        QTYORD: batchBal.get("QTYSTOCK"),
                        QTYINV: batchBal.get("QTYINV"),
                        //customization
                        QTYSTART: batchBal.get("QTYSTOCK"),
                        QTYSELL: 0,
                        QTYRETURN: 0,
                        QTYMISS: 0,
                        QTYSPOIL: 0
                    };
                }

                var key = SalesForceEngine.buildProdWhsBalanceKey(prodBal.CODART, prodBal.CODTYPROW);
                prodBalances.OrdProdWhsBalances[key] = prodBal;
            }

            var exeq = new ExecutionQueue();

            var processPrevOrders = function () {

                var self = this;
                //MADY_20190617 cutomization CR06 OFFLINE_users 
                var dteDeliv = new Date();
				
                var orderTypes = SM1OrderHelper.getWhsAllocOrderTypes();
                var orderStatuses = SM1OrderHelper.getWhsAllocOrderStatuses();
                var constr = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODDIV", "=", UserContext.CodDiv),
                        new XConstraint("CODWHS", "=", codWhs),
                        new XConstraint("CODTYPORD", SqlRelationalOperator.In, orderTypes),
                        new XConstraint("CODSTATUS", SqlRelationalOperator.In, orderStatuses),
                        new XConstraint("DTECLOSE", ">", prodBalances.DTEMOD),
                        new XConstraint("DOCUMENTKEY", "!=", excludeOrdDocKey),
                        // add this constraint MADY_20190617 
                        new XConstraint("DTEDELIV", "<=", dteDeliv)
                    ]
                });

                SalesForceEngine._processWhsBalRow(constr,
                    //order row processing function
                    function (row) {
                        var sellableOp = SM1OrderHelper.getSellableWhsOp(row.get("CODTYPROW"));
                        var unsellableOp = SM1OrderHelper.getUnsellableWhsOp(row.get("CODTYPROW"));
                        if (sellableOp == SalesForceNameSpace.WarehouseOperation.IGNORE &&
                            unsellableOp == SalesForceNameSpace.WarehouseOperation.IGNORE)
                            return;

                        var codArt = row.get("CODART");
                        var key, codTypRow;
                        var prodBal;

                        //consider sellable products/batches not present in the warehouse but returned
                        if (sellableOp == SalesForceNameSpace.WarehouseOperation.ADD) {
                            codTypRow = SM1OrderHelper.getSellableRowTypeDestination(row.get("CODTYPROW"));
                            key = SalesForceEngine.buildProdWhsBalanceKey(codArt, codTypRow);
                            prodBal = prodBalances.OrdProdWhsBalances[key];

                            if (!prodBal) {
                                prodBal = {
                                    CODART: codArt,
                                    CODDIV: prodBalances.CODDIV,
                                    CODTYPROW: codTypRow,
                                    QTYORD: 0,
                                    UMORD: row.get("UMORD"),
                                    QTYINV: 0,
                                    OrdBatchWhsBalances: {},
                                    //customization
                                    QTYSTART: 0,
                                    QTYSELL: 0,
                                    QTYRETURN: 0,
                                    QTYMISS: 0,
                                    QTYSPOIL: 0
                                };
                                prodBalances.OrdProdWhsBalances[key] = prodBal;
                            }

                            row.getSubEntityStore(SFConstants.ORDERROWBATCH).each(function (batch) {
                                if (prodBal.OrdBatchWhsBalances[batch.get("IDBATCH")])
                                    return;

                                prodBal.OrdBatchWhsBalances[batch.get("IDBATCH")] = {
                                    IDBATCH: batch.get("IDBATCH"),
                                    DTEEXPIRE: batch.get("DTEEXPIRE"),
                                    QTYORD: 0,
                                    QTYINV: 0,
                                    //customization
                                    QTYSTART: 0,
                                    QTYSELL: 0,
                                    QTYRETURN: 0,
                                    QTYMISS: 0,
                                    QTYSPOIL: 0
                                };
                            });
                        }

                        //consider unsellable products/batches
                        if (unsellableOp != SalesForceNameSpace.WarehouseOperation.IGNORE) {
                            codTypRow = SM1OrderHelper.getUnsellableRowTypeDestination(row.get("CODTYPROW"));
                            key = SalesForceEngine.buildProdWhsBalanceKey(codArt, codTypRow);
                            prodBal = prodBalances.OrdProdWhsBalances[key];

                            if (!prodBal) {
                                prodBal = {
                                    CODART: codArt,
                                    CODDIV: prodBalances.CODDIV,
                                    CODTYPROW: codTypRow,
                                    QTYORD: 0,
                                    UMORD: row.get("UMORD"),
                                    QTYINV: 0,
                                    OrdBatchWhsBalances: {},
                                    //customization
                                    QTYSTART: 0,
                                    QTYSELL: 0,
                                    QTYRETURN: 0,
                                    QTYMISS: 0,
                                    QTYSPOIL: 0
                                };
                                prodBalances.OrdProdWhsBalances[key] = prodBal;
                            }

                            row.getSubEntityStore(SFConstants.ORDERROWBATCH).each(function (batch) {
                                if (prodBal.OrdBatchWhsBalances[batch.get("IDBATCH")])
                                    return;

                                prodBal.OrdBatchWhsBalances[batch.get("IDBATCH")] = {
                                    IDBATCH: batch.get("IDBATCH"),
                                    DTEEXPIRE: batch.get("DTEEXPIRE"),
                                    QTYORD: 0,
                                    QTYINV: 0,
                                    //customization
                                    QTYSTART: 0,
                                    QTYSELL: 0,
                                    QTYRETURN: 0,
                                    QTYMISS: 0,
                                    QTYSPOIL: 0
                                };
                            });
                        }

                        if (!row.getProduct())
                            return;

                        if (sellableOp != SalesForceNameSpace.WarehouseOperation.IGNORE) {
                            codTypRow = SM1OrderHelper.getSellableRowTypeDestination(row.get("CODTYPROW"));
                            key = SalesForceEngine.buildProdWhsBalanceKey(codArt, codTypRow);
                            prodBal = prodBalances.OrdProdWhsBalances[key];
                            if (prodBal) {
                                //customization
                                var prevUmOrd = prodBal.UMORD;
                                SalesForceEngine.interpretWarehouseOperation(prodBal, row, sellableOp, cacheData);
                                self._interpretWarehouseOperationCust(prodBal, row, cacheData, prevUmOrd);
                            }
                        }

                        if (unsellableOp != SalesForceNameSpace.WarehouseOperation.IGNORE) {
                            codTypRow = SM1OrderHelper.getUnsellableRowTypeDestination(row.get("CODTYPROW"));
                            key = SalesForceEngine.buildProdWhsBalanceKey(codArt, codTypRow);
                            prodBal = prodBalances.OrdProdWhsBalances[key];
                            if (prodBal) {
                                //customization
                                var prevUmOrd = prodBal.UMORD;
                                SalesForceEngine.interpretWarehouseOperation(prodBal, row, unsellableOp, cacheData);
                                self._interpretWarehouseOperationCust(prodBal, row, cacheData, prevUmOrd);
                            }
                        }
                    },
                    //success function
                    function () {
                        //try to convert back to warehouse um
                        //customization
                        self._tryConvertAllToWhsUmCust(prodBalances, cacheData);

                        exeq.executeNext();
                    });
            };

            var processDelivOrders = function () {

                var self = this;

                //clone balances for ALLDELIVERY
                for (prodBalKey in prodBalances.OrdProdWhsBalances) {
                    var prodBal = prodBalances.OrdProdWhsBalances[prodBalKey];
                    if (prodBal.CODTYPROW != SalesForceNameSpace.OrdProdWhsBalance.ALLDELIVERY)
                        continue;

                    var clone = Ext.clone(prodBal);
                    clone.CODTYPROW = SalesForceNameSpace.OrdProdWhsBalance.ALLSELLABLE;
                    var cloneKey = SalesForceEngine.buildProdWhsBalanceKey(clone.CODART, clone.CODTYPROW);
                    prodBalances.OrdProdWhsBalances[cloneKey] = clone;
                }

                var orderTypes = SM1OrderHelper.getDeliveryOrderTypes();
                var constr = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODDIV", "=", UserContext.CodDiv),
                        new XConstraint("CODWHS", "=", codWhs),
                        new XConstraint("CODTYPORD", SqlRelationalOperator.In, orderTypes),
                        new XConstraint("CODSTATUS", "=", SalesForceNameSpace.SM1OrderStatus.SOSPESO),
                        new XConstraint("DOCUMENTKEY", "!=", excludeOrdDocKey)
                    ]
                });

                SalesForceEngine._processWhsBalRow(constr,
                    //order row processing function
                    function (row) {
                        if (!row.getProduct())
                            return;

                        var sellableOp = SM1OrderHelper.getSellableWhsOp(row.get("CODTYPROW"));

                        if (sellableOp != SalesForceNameSpace.WarehouseOperation.IGNORE) {
                            var key = SalesForceEngine.buildProdWhsBalanceKey(row.get("CODART"), SalesForceNameSpace.OrdProdWhsBalance.ALLSELLABLE);
                            var prodBal = prodBalances.OrdProdWhsBalances[key];
                            if (prodBal)
                                SalesForceEngine.interpretWarehouseOperation(prodBal, row, sellableOp, cacheData);
                        }
                    },
                    //success function
                    function () {
                        //try to convert back to warehouse um
                        //customization
                        self._tryConvertAllToWhsUmCust(prodBalances, cacheData);

                        exeq.executeNext();
                    });
            };

            exeq.pushHandler(this, processPrevOrders);
            exeq.pushHandler(this, processDelivOrders);
            exeq.pushHandler(this, function () { onSuccess(prodBalances); });
            exeq.executeNext();
        }
        catch (e) {
            XLog.logEx(e);
            onFail();
        }
    };

    //Tracks different movement types
    //for easier understanding of how the van stock was reached
    this._interpretWarehouseOperationCust = function (prodBal, row, cacheData, prevUmOrd) {
        var codArt = row.get("CODART");

        //in case umord was adapted
        //convert also additional custom fields
        if (prodBal.UMORD != prevUmOrd) {

            prodBal.QTYSTART = SalesForceEngine.convertQuantity(codArt, prodBal.QTYSTART, prevUmOrd, prodBal.UMORD, cacheData, true);
            prodBal.QTYSELL = SalesForceEngine.convertQuantity(codArt, prodBal.QTYSELL, prevUmOrd, prodBal.UMORD, cacheData, true);
            prodBal.QTYRETURN = SalesForceEngine.convertQuantity(codArt, prodBal.QTYRETURN, prevUmOrd, prodBal.UMORD, cacheData, true);
            prodBal.QTYMISS = SalesForceEngine.convertQuantity(codArt, prodBal.QTYMISS, prevUmOrd, prodBal.UMORD, cacheData, true);
            prodBal.QTYSPOIL = SalesForceEngine.convertQuantity(codArt, prodBal.QTYSPOIL, prevUmOrd, prodBal.UMORD, cacheData, true);

            for (var idBatch in prodBal.OrdBatchWhsBalances) {
                var batchBal = prodBal.OrdBatchWhsBalances[idBatch];
                batchBal.QTYSTART = SalesForceEngine.convertQuantity(codArt, batchBal.QTYSTART, prevUmOrd, prodBal.UMORD, cacheData, true);
                batchBal.QTYSELL = SalesForceEngine.convertQuantity(codArt, batchBal.QTYSELL, prevUmOrd, prodBal.UMORD, cacheData, true);
                batchBal.QTYRETURN = SalesForceEngine.convertQuantity(codArt, batchBal.QTYRETURN, prevUmOrd, prodBal.UMORD, cacheData, true);
                batchBal.QTYMISS = SalesForceEngine.convertQuantity(codArt, batchBal.QTYMISS, prevUmOrd, prodBal.UMORD, cacheData, true);
                batchBal.QTYSPOIL = SalesForceEngine.convertQuantity(codArt, batchBal.QTYSPOIL, prevUmOrd, prodBal.UMORD, cacheData, true);
            }
        }

        //track different movement types
        var codTypOrd = row.getParentEntity().get("CODTYPORD");
        var orderMacroType = SalesForceEngine.getOrderMacroType(codTypOrd);
        var codTypRow = row.get("CODTYPROW");
        var rowMacroType = SalesForceEngine.getMacroType(codTypRow);
        var rowBatches = row.getSubEntityStore(SFConstants.ORDERROWBATCH);

        switch (orderMacroType) {
            case SalesForceNameSpace.OrderMacroType.WHSLOAD:
                //addition by load or load integration
                prodBal.QTYSTART += SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                rowBatches.each(function (rowBatch) {
                    var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                    if (batchBal)
                        batchBal.QTYSTART += SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                });

                break;
            case SalesForceNameSpace.OrderMacroType.WHSUNLOAD:
                switch (codTypRow) {
                    case SalesForceNameSpaceCust.OrderTYROW.MISSING:
                        //goods missing on the van
                        prodBal.QTYMISS += SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        rowBatches.each(function (rowBatch) {
                            var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                            if (batchBal)
                                batchBal.QTYMISS += SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        });

                        break;
                    case SalesForceNameSpaceCust.OrderTYROW.EXPIRED_VAN:
                    case SalesForceNameSpaceCust.OrderTYROW.SPOILED_VAN:
                        //goods spoiled or expired on the van
                        prodBal.QTYSPOIL += SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        rowBatches.each(function (rowBatch) {
                            var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                            if (batchBal)
                                batchBal.QTYSPOIL += SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        });

                        break;
                    default:
                        //unloaded goods
                        prodBal.QTYSTART -= SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        rowBatches.each(function (rowBatch) {
                            var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                            if (batchBal)
                                batchBal.QTYSTART -= SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        });

                        break;
                }
                break;
            case SalesForceNameSpace.OrderMacroType.SALES:
                switch (rowMacroType) {
                    case SalesForceNameSpace.OrderRowMacroType.SALES:
                    case SalesForceNameSpace.OrderRowMacroType.GIFT:
                        //sold or free goods
                        prodBal.QTYSELL += SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        rowBatches.each(function (rowBatch) {
                            var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                            if (batchBal)
                                batchBal.QTYSELL += SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                        });

                        break;
                    case SalesForceNameSpace.OrderRowMacroType.RETURN:
                        //sellable returned goods
                        if (SM1OrderHelper.getSellableWhsOp(codTypRow) == SalesForceNameSpace.WarehouseOperation.ADD) {
                            prodBal.QTYRETURN += SalesForceEngine.convertQuantity(codArt, row.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                            rowBatches.each(function (rowBatch) {
                                var batchBal = prodBal.OrdBatchWhsBalances[rowBatch.get("IDBATCH")];
                                if (batchBal)
                                    batchBal.QTYRETURN += SalesForceEngine.convertQuantity(codArt, rowBatch.get("QTYORD"), row.get("UMORD"), prodBal.UMORD, cacheData, true);
                            });
                        }

                        break;
                }
                break;
        }
    };

    /// <summary>
    /// Attempts to convert all available quantities from smallest order um to warehouse um
    /// also for custom fields
    /// </summary>
    this._tryConvertAllToWhsUmCust = function (prodBalances, cacheData) {
        for (prodBalKey in prodBalances.OrdProdWhsBalances) {
            var prodBal = prodBalances.OrdProdWhsBalances[prodBalKey];

            var product = XNavHelper.getFromMemoryCache("NAV_MOB_PROD")
                .findByKey(CommonEngine.buildProductKey(prodBal.CODART, prodBal.CODDIV));
            if (!product)
                continue;

            this._tryConvertToWhsUmCust(prodBal, product, cacheData);
        }
    };

    /// <summary>
    /// Attempts to convert available quantity from smallest order um to warehouse um
    /// also for custom fields
    /// </summary>
    this._tryConvertToWhsUmCust = function (whsProdBal, prod, cacheData) {
        var umWhs = prod.get("UMWHS");
        var idBatch;

        if (whsProdBal.UMORD == umWhs ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYORD, whsProdBal.UMORD, umWhs, cacheData, true)) ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSTART, whsProdBal.UMORD, umWhs, cacheData, true)) ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSELL, whsProdBal.UMORD, umWhs, cacheData, true)) ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYRETURN, whsProdBal.UMORD, umWhs, cacheData, true)) ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYMISS, whsProdBal.UMORD, umWhs, cacheData, true)) ||
            XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSPOIL, whsProdBal.UMORD, umWhs, cacheData, true)))
            return;

        for (idBatch in whsProdBal.OrdBatchWhsBalances) {
            var b = whsProdBal.OrdBatchWhsBalances[idBatch];
            if (XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYORD, whsProdBal.UMORD, umWhs, cacheData, true)) ||
                XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYSTART, whsProdBal.UMORD, umWhs, cacheData, true)) ||
                XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYSELL, whsProdBal.UMORD, umWhs, cacheData, true)) ||
                XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYRETURN, whsProdBal.UMORD, umWhs, cacheData, true)) ||
                XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYMISS, whsProdBal.UMORD, umWhs, cacheData, true)) ||
                XApp.hasDecimals(SalesForceEngine.convertQuantity(whsProdBal.CODART, b.QTYSPOIL, whsProdBal.UMORD, umWhs, cacheData, true)))
                return;
        }

        whsProdBal.QTYORD = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYORD, whsProdBal.UMORD, umWhs, cacheData, true);
        whsProdBal.QTYSTART = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSTART, whsProdBal.UMORD, umWhs, cacheData, true);
        whsProdBal.QTYSELL = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSELL, whsProdBal.UMORD, umWhs, cacheData, true);
        whsProdBal.QTYRETURN = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYRETURN, whsProdBal.UMORD, umWhs, cacheData, true);
        whsProdBal.QTYMISS = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYMISS, whsProdBal.UMORD, umWhs, cacheData, true);
        whsProdBal.QTYSPOIL = SalesForceEngine.convertQuantity(whsProdBal.CODART, whsProdBal.QTYSPOIL, whsProdBal.UMORD, umWhs, cacheData, true);
        for (idBatch in whsProdBal.OrdBatchWhsBalances) {
            var batch = whsProdBal.OrdBatchWhsBalances[idBatch];
            batch.QTYORD = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYORD, whsProdBal.UMORD, umWhs, cacheData, true);
            batch.QTYSTART = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYSTART, whsProdBal.UMORD, umWhs, cacheData, true);
            batch.QTYSELL = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYSELL, whsProdBal.UMORD, umWhs, cacheData, true);
            batch.QTYRETURN = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYRETURN, whsProdBal.UMORD, umWhs, cacheData, true);
            batch.QTYMISS = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYMISS, whsProdBal.UMORD, umWhs, cacheData, true);
            batch.QTYSPOIL = SalesForceEngine.convertQuantity(whsProdBal.CODART, batch.QTYSPOIL, whsProdBal.UMORD, umWhs, cacheData, true);
        }
        whsProdBal.UMORD = umWhs;
    };

    //#endregion

    //#region Customisation 37068: Return QTY control on pharma order MADY 17072019

    /*
     Check if return quantity <= ordered quantity in the last x orders for the delivery customer
    */
    this.loadOrderedQty = function (order, onFailure, onSuccess) {

        XHttpHelper.ExecuteServerOp(
            {
                assemblyName: 'Xtel.SM1.Touch',
                className: 'Xtel.SM1.Touch.SalesForce.SM1OrderTouchEngineCust',
                methodName: 'LoadOrderedQty',
                data: {
                    order: order.toJsonObject()
                }
            },
            function (response, textStatus, e) {
                if (onFailure)
                    onFailure(e);
            },
            function (response) {

                if (onSuccess)
                    onSuccess(response);
            }
        );
    };

    //#endregion

    SalesForceNameSpaceCust = {
        OrderTYROW:
        {
            /// <summary>
            /// Consignment
            /// </summary>
            CONSIGNMENT: "Z30",
            /// <summary>
            /// Back consignment
            /// </summary>
            BACKCONSIGNMENT: "Z31",
            /// <summary>
            /// Missing product
            /// </summary>
            MISSING: "61",
            /// <summary>
            /// Expired in the van
            /// </summary>
            EXPIRED_VAN: "64",
            /// <summary>
            /// Spoiled in the van
            /// </summary>
            SPOILED_VAN: "65",
            /// <summary>
            /// Expired
            /// </summary>
            PERISH: "33"
        },
        SM1OrderStatus:
        {
            /// <summary>
            /// CANCELLED BY ERP
            /// </summary>
            CANCELLED_BY_ERP: "3"
        }
    };
    //Added this method Mady 20190619  
    this.copyDataFromDeliveryCust = function ( order, cust, dteOrd, codTypOrd, skipDelivDateCalc) {
        var def = !codTypOrd ? this.getDefaultOrderType(cust.get("CODCUSTDELIV")) : codTypOrd;
        if (def == null)
            def = order.get("CODTYPORD")
        var delivColumns = ["CODCUSTDELIV", "CODCUR", "CODPAYTRM", "CODPAYMOD", "CODIBAN", "DESBAN", "DESBRA", "CODWHS", "CODSHIPPER", "CODMODDELIV"];
        order.set("CODTYPORD", def);
        order.set("DTEORD", !dteOrd ? SalesForceEngine.getDefaultOrderDate() : dteOrd); //get the current date without the time
        order.set("DTECRE", new Date());
        order.set("CODUSRCRE", UserContext.CodUsr);
        order.set("DTEMOD", new Date());
        order.set("CODUSRMOD", UserContext.CodUsr);
        if (cust != null) {
            if (cust.getValueFromName('FLGCUSTSALE'))
                order.set("CODCUSTSALE", cust.getValueFromName("CODPARTY"));
            order.set("CODCUSTINV", cust.getValueFromName('FLGCUSTINV') ? cust.get("CODPARTY") : cust.get("CODCUSTINV"));
            //copy deliv columns
            for (var i = 0; i < delivColumns.length; i++) {
                try {
                    order.set(delivColumns[i], cust.getValueFromName(delivColumns[i]));
                } catch (ex) {
                    XLog.logWarn("Missing column " + delivColumns[i] + " from customer navigator");
                }
            }

            if (!skipDelivDateCalc) {
                var date = this.calculateDelivDate(order, cust);
                order.set("DTEDELIV", date);
                order.set("DTEPROPDELIV", date);
            }
        }
        SalesForceEngine.copyDataFromLoggedUser(order);
    };

    this.beforeCreateAdjustmentOrder = function (context) {

       /* context.canceled = false;


        //check if adjustment is already created
        if (context.inventory.get("NUMORDREF") != 0) {
            if (context.onSuccess)
                context.onSuccess();
            return;
        }
        var self = this;
        var codWhs = context.inventory.get("CODWHS");

        var adjustment = new XEntity({
            entityName: SFConstants.SM1ORDER,
            data: {
                DOCUMENTKEY: 'SM1Order|[NEW]' + XApp.newGUID(),
                CODDIV: UserContext.CodDiv,
                CODUSR: UserContext.CodUsr,
                CODEUSR: context.inventory.get("CODEUSR"),
                CODTYPORD: SalesForceNameSpace.OrderCTORD.ADJUSTMENT,
                CODSTATUS: SalesForceNameSpace.SM1OrderStatus.CLOSED,
                CODWHS: codWhs,
                DTEORD: context.inventory.get("DTEORD"),
                DTEDELIV: context.inventory.get("DTEDELIV"),
                DTEPROPDELIV: context.inventory.get("DTEPROPDELIV"),
                DTECLOSE: new Date(context.inventory.get("DTECLOSE").getTime() - 1000), //close adjustment 1sec before inventory
                IDDAY: context.inventory.get("IDDAY")
            }
        });

        //var adjustment = new XEntity({ entityName: SFConstants.SM1ORDER });
        //adjustment.set("DOCUMENTKEY", 'SM1Order|[NEW]' + XApp.newGUID());
        //adjustment.set("CODDIV", UserContext.CodDiv);
        //adjustment.set("CODUSR", UserContext.CodUsr);
        //adjustment.set("CODEUSR", context.inventory.get("CODEUSR"));
        //adjustment.set("CODTYPORD", SalesForceNameSpace.OrderCTORD.ADJUSTMENT);
        //adjustment.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.CLOSED);
        //adjustment.set("CODWHS", codWhs);
        //adjustment.set("DTEORD", context.inventory.get("DTEORD"));
        //adjustment.set("DTEDELIV", context.inventory.get("DTEDELIV"));
        //adjustment.set("DTEPROPDELIV", context.inventory.get("DTEPROPDELIV"));
        //adjustment.set("DTECLOSE", new Date(context.inventory.get("DTECLOSE").getTime() - 1000)); //close adjustment 1sec before inventory
        //adjustment.set("IDDAY", context.inventory.get("IDDAY"));

        var custNavRow = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey("Customer|" + context.inventory.get("CODCUSTDELIV"));
       // this.copyDataFromDeliveryCust( adjustment, custNavRow, adjustment.get("DTEORD"), SalesForceNameSpace.OrderCTORD.ADJUSTMENT, true)
        SM1OrderHelper.copyDataFromDeliveryCust("NAV_MOB_CUST", adjustment, custNavRow, adjustment.get("DTEORD"), SalesForceNameSpace.OrderCTORD.ADJUSTMENT, true);
        context.inventory.getSubEntityStore(SFConstants.ORDERROW).each(function (invRow) {
            var prodBal = SalesForceEngine.getWhsBalance(codWhs, invRow.get("CODART"), SalesForceNameSpace.OrderCTORD.ADJUSTMENT, invRow.get("CODTYPROW"), context.cacheData);
            var adjustmentRowAttrs = self._getAdjustmentRowAttributesCust(invRow, prodBal, context.cacheData);

            if (!adjustmentRowAttrs.shouldAddAnyRows())
                return;

            var adjustmentQtyOrd, adjustmentQtyInv;
            var adjustmentCodTypRow = "";
            if (adjustmentRowAttrs.shouldAddMissingRow()) {
                adjustmentQtyOrd = adjustmentRowAttrs.missingQtyOrd;
                adjustmentQtyInv = adjustmentRowAttrs.missingQtyInv;
                adjustmentCodTypRow = SalesForceNameSpace.OrderTYROW.MISSING;
            }
            if (adjustmentRowAttrs.shouldAddLoadRow()) {
                adjustmentQtyOrd = adjustmentRowAttrs.loadQtyOrd;
                adjustmentQtyInv = adjustmentRowAttrs.loadQtyInv;
                adjustmentCodTypRow = SalesForceNameSpace.OrderTYROW.LOAD;
            }
            if (adjustmentRowAttrs.shouldAddUnsellableRow()) {
                adjustmentQtyOrd = adjustmentRowAttrs.unsellableQtyOrd;
                adjustmentQtyInv = adjustmentRowAttrs.unsellableQtyInv;
                adjustmentCodTypRow = adjustmentRowAttrs.unsellableCodTypRow;
            }

            var existingRow = adjustment.getSubEntityStore(SFConstants.ORDERROW).findBy(function (row) {
                return row.get("CODART") == invRow.get("CODART") && row.get("CODTYPROW") == adjustmentCodTypRow;
            });

            if (existingRow) {
                //already exist a row having same codart and same codtyprow
                if (existingRow.get("UMORD") != adjustmentRowAttrs.umOrd &&
                    SalesForceEngine.shouldAdaptUm(prodBal, existingRow, context.cacheData)) {
                    var value = SalesForceEngine.convertQuantity(existingRow.get("CODART"), existingRow.get("QTYORD"), existingRow.get("UMORD"), adjustmentRowAttrs.umOrd, context.cacheData) + adjustmentQtyOrd;
                    existingRow.set("QTYORD", value);
                    existingRow.set("UMORD", adjustmentRowAttrs.umOrd);
                }
                else {
                    var value = SalesForceEngine.convertQuantity(existingRow.get("CODART"), adjustmentQtyOrd, adjustmentRowAttrs.umOrd, existingRow.get("UMORD"), context.cacheData) + existingRow.get("QTYORD");
                    existingRow.set("QTYORD", value);
                }

                var value = existingRow.get("QTYINV") + adjustmentQtyInv;
                existingRow.set("QTYINV", value);
                self._updateAdjustmentRowBatchesCust(invRow, existingRow, prodBal);
            }
            else {

                var addRow = adjustment.AddOrderRow(invRow.getProduct(), adjustmentCodTypRow, adjustmentRowAttrs.umOrd, adjustmentQtyOrd, SalesForceNameSpace.OrderBESRC.MANUALE, context.cacheData).orderRow;
                if (addRow) {
                    addRow.set("CODTYPROWCAUSE", invRow.get("CODTYPROWCAUSE"));
                    addRow.set("QTYINV", adjustmentQtyInv);
                    addRow.set("UMINV", invRow.get("UMINV"));
                    self._updateAdjustmentRowBatchesCust(invRow, addRow, prodBal);
                }
            }
        });

        if (adjustment.getSubEntityStore(SFConstants.ORDERROW).getCount() == 0) {
            //set a dummy value to avoid wrong adjustment generation server side
            context.inventory.set("NUMORDREF", XApp.model.getFieldDef(SFConstants.SM1ORDER, "NUMORDREF").minVal);
            context.onSuccess();
            return;
        }

        adjustment.calculateBenefits(context.cacheData);
        XDocs.saveDocument(adjustment, true, context.onFailure, function (savedAdjustment) {
            context.inventory.set("NUMORDREF", savedAdjustment.get("NUMORD"));
            context.onSuccess(savedAdjustment);
        });*/
    };



    /// <summary>
    /// Determines how the inventory should be automatically adjusted for a specific row
    /// </summary>
    this._getAdjustmentRowAttributesCust = function (inventoryRow, prodBal, cacheData) {
        var self = this;
        var adjustmentRowAttrs = new AdjustmentRowAttributesCust();

        if (inventoryRow.getProduct() && inventoryRow.getProduct().get("FLGBATCHNUMBER") &&
            inventoryRow.getSubEntityStore(SFConstants.ORDERROWBATCH).getCount() > 0) {

            inventoryRow.getSubEntityStore(SFConstants.ORDERROWBATCH).each(function (batch) {

                var qtyInfo = self._getAdjustmentBatchQuantitiesCust(batch, prodBal, cacheData);
                adjustmentRowAttrs.umOrd = qtyInfo.umOrd;

                adjustmentRowAttrs.setSellableAttributes(inventoryRow, qtyInfo.qtyOrd, qtyInfo.qtyInv, inventoryRow.get("CODTYPROW"));
                adjustmentRowAttrs.setUnsellableAttributes(inventoryRow, qtyInfo.qtyOrd, qtyInfo.qtyInv, inventoryRow.get("CODTYPROW"));
            });
        }
        else {
            var qtyInfo = self._getAdjustmentRowQuantitiesCust(inventoryRow, prodBal, cacheData);
            adjustmentRowAttrs.umOrd = qtyInfo.umOrd;

            adjustmentRowAttrs.setSellableAttributes(inventoryRow, qtyInfo.qtyOrd, qtyInfo.qtyInv, inventoryRow.get("CODTYPROW"));
            adjustmentRowAttrs.setUnsellableAttributes(inventoryRow, qtyInfo.qtyOrd, qtyInfo.qtyInv, inventoryRow.get("CODTYPROW"));
        }

        return adjustmentRowAttrs;
    };


    /// <summary>
    /// Creates automatic adjustment batches
    /// </summary>
    this._updateAdjustmentRowBatchesCust = function (inventoryRow, adjustmentRow, prodBal) {
        var adjustmentRowBatches = adjustmentRow.getSubEntityStore(SFConstants.ORDERROWBATCH);
        var adjustedBatchQtyOrd, adjustedBatchQtyInv;
        inventoryRow.getSubEntityStore(SFConstants.ORDERROWBATCH).each(function (inventoryBatch) {
            var idBatch = inventoryBatch.get("IDBATCH");
            var adjustmentRowBatch = adjustmentRowBatches.findBy(function (b) {
                return b.get("IDBATCH") == idBatch;
            });
            if (!adjustmentRowBatch) {
                adjustmentRowBatch = new XEntity({
                    entityName: SFConstants.ORDERROWBATCH,
                    data: {
                        CODUSR: adjustmentRow.get("CODUSR"),
                        NUMORD: adjustmentRow.get("NUMORD"),
                        NUMROW: adjustmentRow.get("NUMROW"),
                        IDBATCH: idBatch,
                        DTEEXPIRE: inventoryBatch.get("DTEEXPIRE")
                    }
                });
                adjustmentRowBatches.add(adjustmentRowBatch);
            }
            if (prodBal && prodBal.OrdBatchWhsBalances[idBatch]) {
                adjustedBatchQtyOrd = prodBal.OrdBatchWhsBalances[idBatch].QTYORD - inventoryBatch.get("QTYORD");
                adjustedBatchQtyInv = prodBal.OrdBatchWhsBalances[idBatch].QTYINV - inventoryBatch.get("QTYINV");
            }
            else {
                adjustedBatchQtyOrd = (-1) * inventoryBatch.get("QTYORD");
                adjustedBatchQtyInv = (-1) * inventoryBatch.get("QTYINV");
            }
            switch (adjustmentRow.get("CODTYPROW")) {
                case SalesForceNameSpace.OrderTYROW.LOAD:
                    if (adjustedBatchQtyOrd < 0)
                        adjustmentRowBatch.set("QTYORD", (-1) * adjustedBatchQtyOrd);
                    if (adjustedBatchQtyInv < 0)
                        adjustmentRowBatch.set("QTYINV", (-1) * adjustedBatchQtyInv);
                    break;
                case SalesForceNameSpace.OrderTYROW.MISSING:
                    if (adjustedBatchQtyOrd > 0)
                        adjustmentRowBatch.set("QTYORD", adjustedBatchQtyOrd);
                    if (adjustedBatchQtyInv > 0)
                        adjustmentRowBatch.set("QTYINV", adjustedBatchQtyInv);
                    break;
                default:
                    adjustmentRowBatch.set("QTYORD", adjustedBatchQtyOrd < 0 ? (-1) * adjustedBatchQtyOrd : adjustedBatchQtyOrd);
                    adjustmentRowBatch.set("QTYINV", adjustedBatchQtyInv < 0 ? (-1) * adjustedBatchQtyInv : adjustedBatchQtyInv);
                    break;
            }
        });
    };

    /// <summary>
    /// Determines automatic adjustment quantities for a row batch
    /// </summary>
    this._getAdjustmentBatchQuantitiesCust = function (inventoryRowBatch, prodBal, cacheData) {
        var inventoryRow = inventoryRowBatch.getParentEntity();

        var qtyInfo = {
            qtyOrd: 0,
            qtyInv: 0,
            umOrd: inventoryRow.get("UMORD")
        };

        var batchQtyOrd = inventoryRowBatch.get("QTYORD");
        var idBatch = inventoryRowBatch.get("IDBATCH");


        var batchWhsBalance = prodBal && prodBal.OrdBatchWhsBalances && prodBal.OrdBatchWhsBalances[idBatch] ? prodBal.OrdBatchWhsBalances[idBatch] : null;
        if (batchWhsBalance) {
            qtyInfo.qtyOrd = batchWhsBalance.QTYORD;
            qtyInfo.qtyInv = batchWhsBalance.QTYINV;

            var prodBalQtyConvertedToInventoryUM = SalesForceEngine.convertQuantity(inventoryRow.get("CODART"), batchWhsBalance.QTYORD, prodBal.UMORD, qtyInfo.umOrd, cacheData, true);
            if (XApp.getDecimalsCount(prodBalQtyConvertedToInventoryUM) > CommonEngine.getUmDecimals(inventoryRow.get("UMORD"))) {
                batchQtyOrd = SalesForceEngine.convertQuantity(inventoryRow.get("CODART"), batchQtyOrd, prodBal.UMORD, qtyInfo.umOrd, cacheData, true);
                qtyInfo.umOrd = prodBal.UMORD;
            }
            else {
                qtyInfo.qtyOrd = prodBalQtyConvertedToInventoryUM;
            }

        }

        qtyInfo.qtyOrd -= batchQtyOrd;
        qtyInfo.qtyInv -= inventoryRowBatch.get("QTYINV");

        return qtyInfo;
    };

    /// <summary>
    /// Determines automatic adjustment quantities for a row
    /// </summary>
    this._getAdjustmentRowQuantitiesCust = function (inventoryRow, prodBal, cacheData) {
        var qtyInfo = {
            qtyOrd: 0,
            qtyInv: 0,
            umOrd: inventoryRow.get("UMORD")
        };

        var inventoryQtyOrd = inventoryRow.get("QTYORD");

        if (prodBal) {
            qtyInfo.qtyOrd = prodBal.QTYORD;
            qtyInfo.qtyInv = prodBal.QTYINV;

            var prodBalQtyConvertedToInventoryUM = SalesForceEngine.convertQuantity(inventoryRow.get("CODART"), prodBal.QTYORD, prodBal.UMORD, inventoryRow.get("UMORD"), cacheData, true);
            if (XApp.getDecimalsCount(prodBalQtyConvertedToInventoryUM) > CommonEngine.getUmDecimals(inventoryRow.get("UMORD"))) {
                inventoryQtyOrd = SalesForceEngine.convertQuantity(inventoryRow.get("CODART"), inventoryRow.get("QTYORD"), inventoryRow.get("UMORD"), prodBal.UMORD, cacheData, true);
                qtyInfo.umOrd = prodBal.UMORD;
            }
            else {
                qtyInfo.qtyOrd = prodBalQtyConvertedToInventoryUM;
            }

        }

        qtyInfo.qtyOrd -= inventoryQtyOrd;
        qtyInfo.qtyInv -= inventoryRow.get("QTYINV");

        return qtyInfo;
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.beforeSearchOpenInvoice = function (context) {
        context.canceled = true;

        var codUsr = context.codUsr;
        var codTypOrd = context.codTypOrd;
        var numDoc = context.numDoc;
        var dteDoc = context.dteDoc;
        var numOrd = context.numOrd;
        var onSuccess = context.onSuccess;
        var onFailure = context.onFailure;

        try {
            var fakeNumDoc = SalesForceEngine.getOpenInvoiceNumDoc(codUsr, codTypOrd, numDoc, numOrd);
            //case#1. If the invoice has not created an open invoice the system has to update the invoice status in "cancelled".
            var constraints = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("NUMDOC", "=", fakeNumDoc),
                    new XConstraint("DTEDOC", "=", dteDoc)
                ]
            });
            var openInvoice = XNavHelper.getNavRecord("NAV_MOB_PARTYBALANCE", constraints);
            if (!openInvoice) {
                if (onSuccess)
                    onSuccess({
                        openInvoiceState: SalesForceNameSpace.OpenInvoiceState.NOOPENINVOICE
                    });
                return;
            }

            //If we reached this point it means that an open invoice exists
            //Case #2   if the open invoice not is associated to an encashment, update the order (invoice order type) status in "cancelled". 

            constraints = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("NUMDOC", "=", openInvoice.get("NUMDOC")),
                    new XConstraint("CODTYPDOC", "=", openInvoice.get("CODTYPDOC")),
                    new XConstraint("DTEDOC", "=", openInvoice.get("DTEDOC"))
                ]
            });
            var encBalance = XNavHelper.getNavRecord("NAV_MOB_ENCBALANCE", constraints);
            if (!encBalance) {
                if (onSuccess)
                    onSuccess({
                        openInvoiceState: SalesForceNameSpace.OpenInvoiceState.NOENCASHMENT,
                        //pass back the open invoice row so it's removed from the navigator
                        openInvoice: openInvoice
                    });
                return;
            }

            //If we reached this point it means we have also an encashment. We can load the encashment and the parent deposit.
            XDocs.loadDocument(CommonEngine.buildDepositKey(encBalance.get("CODUSR"), encBalance.get("IDDEP")), false, function () {
                //#Case #3: if the open invoice is associated to an encashment linked to a deposit that cannot be loaded: an error message has to be shown
                if (onSuccess)
                    onSuccess({
                        openInvoiceState: SalesForceNameSpace.OpenInvoiceState.DEPOSITUNAVAILABLE,
                    });
            }, function (depositStore) {
                try {
                    if (!depositStore || !depositStore.getAt(0)) {
                        //#Case #3: if the open invoice is associated to an encashment linked to a deposit that cannot be loaded: an error message has to be shown
                        if (onSuccess)
                            onSuccess({
                                openInvoiceState: SalesForceNameSpace.OpenInvoiceState.DEPOSITUNAVAILABLE,
                            });
                    } else {
                        var deposit = depositStore.getAt(0);

                        //Case #4:    if the open invoice is associated to an encashment linked to a closed deposit: an error message has to be shown
                        if (deposit.get("CODSTATUS") == CommonNameSpace.DepositStatus.Closed) {
                            if (onSuccess)
                                onSuccess({
                                    openInvoiceState: SalesForceNameSpace.OpenInvoiceState.DEPOSITCLOSED,
                                    deposit: deposit
                                });
                        } else {
                            //Case #5:  if the open invoice is associated to an encashment linked to a open deposit  a warning message has to be shown 
                            var encashment = deposit.getSubEntityStore("Encashment").findBy(function (enc) {
                                return enc.get("CODPARTY") == encBalance.get("CODPARTY") &&
                                    enc.get("CODDIV") == encBalance.get("CODDIV") &&
                                    enc.get("DTEENC") - encBalance.get("DTEENC") == 0 &&
                                    enc.get("IDDEP") == deposit.get("IDDEP") &&
                                    enc.get("CODUSR") == deposit.get("CODUSR") &&
                                    enc.get("IDENC") == encBalance.get("IDENC")
                                ;
                            });
                            if (onSuccess)
                                onSuccess({
                                    openInvoiceState: SalesForceNameSpace.OpenInvoiceState.DEPOSITOPEN,
                                    deposit: deposit,
                                    encashment: encashment,
                                    //pass back the open invoice row so it's removed from the navigator
                                    openInvoice: openInvoice
                                });
                        }
                    }
                } catch (e) {
                    XLog.logEx(e);

                    if (onFailure)
                        onFailure(e);
                }
            });

        } catch (e) {
            XLog.logEx(e);

            if (onFailure)
                onFailure(e);
        }
    };
};

XApp.registerExtensionCust("engineCustomizer", "salesForceEngine", new _salesForceEngineExtensionCust());

function SalesForceEngineCust() {
    this.isReturnableProduct = function (row) {
        var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(row.get("CODART"), row.get("CODDIV")));

        if (!artRow)
            return false;

        return artRow.get("FLGRETURNABLE") == -1 && artRow.get("FLGEMPTY") == 0;
    };

    this.isEmptyProduct = function (row) {
        var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(row.get("CODART"), row.get("CODDIV")));

        if (!artRow)
            return false;

        return artRow.get("FLGRETURNABLE") == -1 && artRow.get("FLGEMPTY") == -1;
    };
}

var SalesForceEngineCust = new SalesForceEngineCust();

//#region AdjustmentRowAttributesCust

/// <summary>
/// Custom Helper object for automatic adjustment order rows
/// </summary>
function AdjustmentRowAttributesCust() {
    this.missingQtyOrd = 0;
    this.missingQtyInv = 0;
    this.loadQtyOrd = 0;
    this.loadQtyInv = 0;
    this.unsellableQtyOrd = 0;
    this.unsellableQtyInv = 0;
    this.unsellableCodTypRow = "";
    this.umOrd = "";
};

AdjustmentRowAttributesCust.prototype = function () {
    var shouldAddMissingRow = function () { return this.missingQtyOrd > 0 || this.missingQtyInv > 0; };
    var shouldAddLoadRow = function () { return this.loadQtyOrd > 0 || this.loadQtyInv > 0; };
    var shouldAddUnsellableRow = function () { return this.unsellableQtyOrd > 0 || this.unsellableQtyInv > 0; };
    var shouldAddAnyRows = function () { return this.shouldAddMissingRow() || this.shouldAddLoadRow() || this.shouldAddUnsellableRow(); };

    var setSellableAttributes = function (row, qtyOrd, qtyInv, codTypRow) {
        if (row.get("Z_ISREADONLYEMPTY") || SM1OrderHelper.isSellable(codTypRow) || codTypRow == SalesForceNameSpace.OrderTYROW.INVENTORY) {

            if (qtyOrd < 0) {
                this.loadQtyOrd += (-1) * qtyOrd;
            }
            else {
                this.missingQtyOrd += qtyOrd;
            }

            if (qtyInv < 0) {
                this.loadQtyInv += (-1) * qtyInv;
            }
            else {
                this.missingQtyInv += qtyInv;
            }
        }
    };

    var setUnsellableAttributes = function (row, qtyOrd, qtyInv, codTypRow) {
        if (!row.get("Z_ISREADONLYEMPTY") && SM1OrderHelper.isUnsellable(codTypRow) && (qtyOrd != 0 || qtyInv != 0)) {
            this.unsellableCodTypRow = codTypRow;
            // DELTA = QTYORD – (SIGN OPTINFO ORDER ROW TYPE FOR UNSELLABLE) * WHSBALANCEORD
            // Because in our case delta is calculated as WHSBALANCEORD - QTYORD the sign will be changed if the unsellable optinfo is "+"
            if (SM1OrderHelper.getUnsellableWhsOp(codTypRow) == SalesForceNameSpace.WarehouseOperation.ADD) {
                this.unsellableQtyOrd = (-1) * qtyOrd;
                this.unsellableQtyInv = (-1) * qtyInv;
            }
        }
    };

    return {
        shouldAddMissingRow: shouldAddMissingRow,
        shouldAddLoadRow: shouldAddLoadRow,
        shouldAddUnsellableRow: shouldAddUnsellableRow,
        shouldAddAnyRows: shouldAddAnyRows,
        setSellableAttributes: setSellableAttributes,
        setUnsellableAttributes: setUnsellableAttributes
    };
}();