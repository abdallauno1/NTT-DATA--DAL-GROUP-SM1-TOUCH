//#region _mobGuiOrderExtension
function _mobGuiOrderExtension() {

    this.afterGuiCreated = function (gui) {
        app.viewport.setApplicationToolbarIcon("nav_mob_orders");
    };

    this.setOpenDayID = function (gui) {
        var doc = gui.getDocument();
        if (gui.openData.idDay)
            doc.set("IDDAY", gui.openData.idDay);
        else
            if (this._openDayID)
                doc.set("IDDAY", this._openDayID);
    };

    this.getMenuButtons = function (context) {
        var gui = context.ctrl;
        var order = gui.getDocument();
        var self = this;
        var toolbar = gui.toolbar;

        gui.confirmButton = {
            msg: UserContext.tryTranslate("[MOBORDER.CONFIRM]"),
            id: 'mobguiorder-contextualmenu-confirm',
            iconCls: 'guis_order_navbar_confirm_23',
            visible: SM1OrderHelper.canOrderBeConfirmed(gui.getDocument().get("CODTYPORD")),
            docked: "",
            handler: function () {
                if (!self._canConfirmOrCloseOrder(order)) {
                    XLog.logInfo("Can't confirm in offline mode.");
                    return;
                }

                var data = {
                    gui: gui,
                    cancel: false
                };
                XApp.callCust("guiCustomizer", "mobGuiOrder", 'beforeConfirm', data);
                if (data.cancel)
                    return;

                var doc = gui.getDocument();

                //unable to confirm the order due to batch qtys differences
                if (self._blockingControlOnOrderConfirmation(doc, SalesForceNameSpace.OrderAction.CONFIRM))
                    return;

                gui.validateDocument(function (response) {
                    if (response != "OK")
                        return;

                    var standaloneCodes = self._getStandaloneProductCodes(doc);
                    if (standaloneCodes.length > 0) {
                        var msg = standaloneCodes.length > 1 ? "[MOBGUIORDER.CANNOT_ADD_STANDALONE_PRODUCTS]" : "[MOBGUIORDER.CANNOT_ADD_STANDALONE_PRODUCT]";
                        XUI.showErrorMsgBox(UserContext.tryTranslate(msg) + "<br />" + standaloneCodes.join("<br />"));
                        XUI.hideWait();
                        self.cancelConfirmation(doc, gui);
                        return;
                    }
                    if (SM1OrderHelper.isNewMultideliveryActivated(doc.get("CODTYPORD"), doc.get("CODSTATUS"))) {
                        var unusedDeliveryDates = self._getUnusedDeliveryDates(doc);
                        if (unusedDeliveryDates.length > 0) {
                            var msg = unusedDeliveryDates.length > 1 ? "[MOBGUIORDER.UNUSED_DELIVERY_DATES]" : "[MOBGUIORDER.UNUSED_DELIVERY_DATE]";
                            XUI.showErrorMsgBox(UserContext.tryTranslate(msg) + "<br />" + unusedDeliveryDates.join("<br />"));
                            XUI.hideWait();
                            self.cancelConfirmation(doc, gui);
                            return;
                        }
                    }

                    var status;
                    // the order will change it's status if it is not valid
                    if (!self._hasOrderToBeSigned(doc, SalesForceNameSpace.OrderAction.CONFIRM)) {
                        status = self._getConfirmOrderStatus(doc);
                    }

                    //called later after we decide if we need to generate NUMDOC or not
                    var onConfirm = function () {

                        //no need to generate anomalies for order rows with QTYORD = 0
                        self._removeZeroOrderRows(doc);

                        self.reaplyBenefits(gui.getDocument(), gui, true);
                        SalesForceEngine.refreshCanvasActions(doc, gui.CacheData, true, true);

                        //multidelivery: free merchandise validation
                        var msgs = [];
                        if (self._checkMultiDeliveryFreeMerchandise(gui, msgs)) {
                            XUI.showErrorMsgBox({ msg: msgs.join("<br />") });
                            self._refreshTab(gui, doc, true);
                            return;
                        }

                        if (status)
                            doc.set("CODSTATUS", status);
                        self._setCloseButtonStatus(gui, doc.get("CODSTATUS"), doc.get("CODTYPORD"));
                        doc.set("CODSTATUSMAN", "");
                        doc.set("DTECLOSE", new Date());
                        self.setOpenDayID(gui);

                        gui.docModified = true;

                        // reevaluate anomalies, the canvass problems will be shown in the anomaly grid popup
                        XApp.exec(gui.reevaluateAnomalies, undefined, gui);
                    };

                    //Enh #32430: Number of document management 
                    if (self._numDocGenerationRequired(status, doc.get("NUMDOC"))) {
                        SalesForceEngine.generateNumDoc(doc, function (e) {

                            XLog.logEx(e);
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.ERR_GENERATE_NUMDOC]") });

                            if (XUI.isWaitActive())
                                XUI.hideWait(); //if any wait windows was shown
                        },
                        function (numDoc) {
                            doc.set("NUMDOC", numDoc);
                            doc._isNumDocGeneratedAtConfirmButtonClick = true;
                            onConfirm();
                        });
                    } else
                        onConfirm();
                }, "EDIT");
                XApp.callCust("guiCustomizer", "mobGuiOrder", 'afterConfirm', data);
            },
            hide: function () {
                if (this.button)
                    this.button.hide();
                this.visible = false;
            },
            setDisabled: function (state) {
                if (this.button)
                    this.button.setDisabled(state);
                this.enabled = !state;
            }
        };

        context.buttons.push(gui.confirmButton);

        gui.closeButton = {
            msg: UserContext.tryTranslate("[MOBORDER.CLOSE]"),
            id: 'mobguiorder-contextualmenu-close',
            iconCls: 'guis_order_navbar_close_23',
            visible: SM1OrderHelper.canOrderBeClosed(gui.getDocument().get("CODTYPORD")),
            docked: "",
            handler: function () {
                var order = gui.getDocument();
                if (!self._canConfirmOrCloseOrder(order)) {
                    XLog.logInfo("Can't close in offline mode.");
                    return;
                }

                if (!order)
                    return;
                order.set("CODSTATUSMAN", "");

                var data = {
                    gui: gui,
                    cancel: false
                };
                XApp.callCust("guiCustomizer", "mobGuiOrder", 'beforeClose', data);
                if (data.cancel)
                    return;

                //unable to close the order due to batch qtys differences
                if (self._blockingControlOnOrderConfirmation(order, SalesForceNameSpace.OrderAction.CLOSE))
                    return;

                if (!self._hasOrderToBeSigned(order, SalesForceNameSpace.OrderAction.CLOSE)) {
                    XUI.showWait();
                    gui.validateDocument(function (response) {
                        if (response != "OK") {
                            XUI.hideWait();
                            return;
                        }
                        gui.docModified = true;
                        order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.CLOSED);
                        self.setOpenDayID(gui);
                        if (order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY)
                            self._removeZeroOrderRows(order);
                        order.set("DTECLOSE", new Date());
                        self._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
                        if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY) {
                            SalesForceEngine.createAdjustmentOrder(order, gui.CacheData, function (e) {
                                XUI.hideWait();
                                XUI.showExceptionMsgBox(e);
                            }, function () {
                                self.saveOrder(gui);
                            });
                        }
                        else {
                            self.saveOrder(gui);
                        }
                    }, "EDIT");
                } else {
                    self.saveOrder(gui, true, SalesForceNameSpace.OrderAction.CLOSE);
                }
                XApp.callCust("guiCustomizer", "mobGuiOrder", 'afterClose', data);
            },
            hide: function () {
                if (this.button)
                    this.button.hide();
                this.visible = false;
            },
            setDisabled: function (state) {
                if (this.button)
                    this.button.setDisabled(state);
                this.enabled = !state;
            }
        };
        context.buttons.push(gui.closeButton);

        gui.reportButton = {
            msg: UserContext.tryTranslate("[MOBORDER.REPORT]"),
            id: 'mobguiorder-contextualmenu-report',
            iconCls: 'guis_order_navbar_report_23',
            visible: XApp.isOnline() && gui.openMode != "NEW",
            docked: "",
            handler: function () {
                var oldDoc = gui.getDocument();
                gui.saveDocNoConfirmation(function () {
                    XUI.hideWait();
                    var newDoc = gui.getDocument();
                    //copy some old properties to the new doc
                    newDoc.m_excludedAutoActions = oldDoc.m_excludedAutoActions;
                    newDoc.m_usrIndicatedCnvGrp = oldDoc.m_usrIndicatedCnvGrp;
                    newDoc.m_usrUnappliableCnv = oldDoc.m_usrUnappliableCnv;

                    XUI.showWait();
                    XHttpHelper.ExecuteServerOp(
                    {
                        assemblyName: 'Xtel.SM1.Touch',
                        className: 'Xtel.SM1.Touch.SalesForce.SM1OrderTouchEngine',
                        methodName: 'GenerateOrderReport',
                        data: {
                            codUsr: gui.getDocument().get("CODUSR"),
                            codDiv: gui.getDocument().get("CODDIV"),
                            numOrd: gui.getDocument().get("NUMORD"),
                            codTypOrd: gui.getDocument().get("CODTYPORD"),
                            macroType: gui.getDocument().get("MACROTYPE")
                        }
                    },
                    function (response, textStatus, e) {
                        XUI.hideWait();
                        XUI.showExceptionMsgBox(e);
                    },
                    function (response) {
                        XUI.hideWait();
                        if (!XApp.isEmptyOrWhitespaceString(response.link)) {
                            var link = XApp.getHomeUrl() + "/" + response.link;
                            //chrome behaviour:
                            //if the document need not be saved, opens report in a new tab
                            //if the document is saved, opens report in a popup
                            //conclusion:
                            //always force chrome to open report in a popup
                            if (XApp.environment.isChrome) {
                                setTimeout(function () {
                                    window.open(link);
                                }, 10);
                            } else {
                                XApp.openURL(link);
                            }
                        }
                    });
                });
            }
        };
        context.buttons.push(gui.reportButton);

        if (gui.refreshPricingButton)
            context.buttons.push(gui.refreshPricingButton);

        gui.reloadPricingButton = {
            msg: UserContext.tryTranslate("[MOBORDER.RELOAD_PRICING]"),
            id: 'mobguiorder-contextualmenu-reload-pricing',
            iconCls: 'guis_order_navbar_reload_pricing_23',
            visible: gui.openMode != 'VIEW' &&
                OrderParameters.getInstance(gui.getDocument().get("CODTYPORD")).getFlgTopSellingManaged() &&
                XApp.isOnline() &&
                !UserContext.isFullOfflineMode() &&
                !SM1OrderHelper.restrictedEditability(gui.getDocument()),
            handler: (function (ui) {
                return function () {
                    self._reloadCacheData(ui);
                };
            })(gui)
        };
        context.buttons.push(gui.reloadPricingButton);

        gui.preloadAssoButton = {
            msg: UserContext.tryTranslate("[MOBORDER.PRELOAD_FROM_ASSO]"),
            id: 'mobguiorder-contextualmenu-preload-assortment',
            iconCls: 'guis_order_navbar_preload_assortment_23',
            visible: gui.openMode != 'VIEW' &&
                order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.ASSET &&
                !SM1OrderHelper.restrictedEditability(order) &&
                !SM1OrderHelper.isADelivery(order.get("CODTYPORD")),
            handler: (function (ui) {
                return function () {
                    var order = ui.getDocument();
                    if (XApp.isEmptyOrWhitespaceString(order.get("CODTYPORD"))) {
                        XLog.logWarn("Can't preload assortment: order type not set.");
                        return;
                    }

                    self._preloadAssortment(ui);
                    self.reaplyBenefits(order, ui, true);
                    self.refreshAll(ui, true);
                };
            })(gui)
        };
        context.buttons.push(gui.preloadAssoButton);

        gui.preloadButton = {
            msg: UserContext.tryTranslate("[MOBORDER.ORDERPRELOAD]"),
            id: 'mobguiorder-contextualmenu-preload-order',
            iconCls: 'guis_order_navbar_favourite_products_23',
            visible: gui.openMode != 'VIEW' && SM1OrderHelper.canPreload(order) &&
                order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY &&
                order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.UNLOAD &&
                order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.SHIPPINGBILL &&
                order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.ASSET &&
                !SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD")) &&
                !SM1OrderHelper.restrictedEditability(order) &&
                !SM1OrderHelper.isADelivery(order.get("CODTYPORD")),
            handler: (function (ui) {
                return function () {
                    var order = ui.getDocument();

                    //online state of app might have changed between the moment whe button visibility was set and this point.
                    //we must check again the conditions for preload
                    if (!SM1OrderHelper.canPreload(order)) {
                        XUI.showMsgBox({
                            title: "[MOB.WARN]",
                            msg: UserContext.tryTranslate("[MOBGUIORDER.CONNECTIVITY_REQUIRED_FOR_PRELOAD]"),
                            icon: "WARN",
                            buttons: 'OK',
                            onResult: Ext.emptyFn
                        });
                        return;
                    }

                    self._showPreloadOrderPopup(ui,
                        function (response) {
                            var preloadedOrder = null;
                            if (response.PreloadedOrder) {
                                preloadedOrder = new XEntity({ entityName: "SM1Order", data: response.PreloadedOrder });
                            }
                            var notOrderableVirtualKitOroducts = response.NotOrderableProducts;

                            var preloadContext = {
                                gui: ui,
                                preloadedOrder: preloadedOrder,
                                cancel: false
                            };

                            ui.callCust("beforePrevOrderRowsLoaded", preloadContext);
                            if (preloadContext.cancel) {
                                return;
                            }

                            if (preloadedOrder) {
                                SalesForceEngine.loadLatestOrderedProducts(order, preloadedOrder, ui.CacheData);
                                self.reaplyBenefits(order, ui, true);
                                self.refreshAll(ui, true);

                                var virtualKitNotOrderable = notOrderableVirtualKitOroducts != null ? notOrderableVirtualKitOroducts["VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE"] : null;
                                if (virtualKitNotOrderable) {
                                    self._evaluateArtcodesAtCopy(preloadedOrder, virtualKitNotOrderable);
                                }

                                ui.callCust("afterPrevOrderRowsLoaded", preloadContext);
                            }
                            XUI.hideWait();
                        },
                    function () {
                        XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.ERR_ORDERPRELOAD]") });
                        XUI.hideWait();
                    });
                };
            })(gui)
        };
        context.buttons.push(gui.preloadButton);

        gui.preloadAssetsButton = {
            msg: UserContext.tryTranslate("[MOBORDER.PRELOAD_FROMASSETS]"),
            id: 'mobguiorder-contextualmenu-preload-assets',
            iconCls: 'guis_order_navbar_preload_assets_23',
            visible: gui.openMode != 'VIEW' &&
                     SM1OrderHelper.isAssetPickup(order.get("MACROTYPE"), order.get("CODTYPORD")),
            handler: (function (ui) {
                return function () {
                    //preload assets on customer
                    var order = ui.getDocument();
                    if (SM1OrderHelper.isAssetPickup(order.get("MACROTYPE"), order.get("CODTYPORD")) &&
                        gui.CacheData.m_customerAssetBalances != null) {

                        order.getSubEntityStore(SFConstants.ORDERROW).clear();
                        self._preloadCustomerAssets(gui);
                        self.refreshAll(ui, true);
                    }
                };
            })(gui)
        };
        context.buttons.push(gui.preloadAssetsButton);


        if (gui.removeZeroOrderRowsButton)
            context.buttons.push(gui.removeZeroOrderRowsButton);

        gui.cancelOrderButton = {
            msg: UserContext.tryTranslate("[MOBORDER.CANCEL_ORDER]"),
            id: 'mobguiorder-contextualmenu-cancel-order',
            iconCls: 'guis_order_navbar_cancel_order_23',
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
                                        self.doCancelOrder(ui);
                                        break;

                                        //Case #2: if the open invoice not is associated to an encashment, update the order (invoice order type) status in "cancelled". 
                                        // If the application  is touch the open invoice generated from the cancelled order has to be removed from the open invoice list.
                                    case SalesForceNameSpace.OpenInvoiceState.NOENCASHMENT:
                                        //Remove the invoice from the invoices list/nav
                                        if (openInvoiceCheckResponse.openInvoice) {
                                            SalesForceEngine.removeOpenInvoice(openInvoiceCheckResponse.openInvoice,
                                                XUI.showExceptionMsgBox, function () {
                                                    self.doCancelOrder(ui);
                                                });
                                        }
                                        else
                                            self.doCancelOrder(ui);
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
                                                        CommonEngine.removeEncashment(deposit.get("CODUSR"), deposit.get("IDDEP"), encashment.get("IDENC"), XUI.showExceptionMsgBox, function (removed) {
                                                            if (removed) {
                                                                //update invoices navigator
                                                                if (openInvoiceCheckResponse.openInvoice) {
                                                                    SalesForceEngine.removeOpenInvoice(openInvoiceCheckResponse.openInvoice,
                                                                        XUI.showExceptionMsgBox, function () {
                                                                            self.doCancelOrder(ui);
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
                        self.doCancelOrder(ui);
                };
            })(gui)
        };
        context.buttons.push(gui.cancelOrderButton);
        //get signature from attachments
        var signature = null;

        gui.getDocument().getAttachments().forEach(function (attachment) {
            if (attachment.CODFILETYPE == "S") {
                signature = attachment;
            }
        });

        if (SM1OrderHelper.isSignatureRequired(gui.getDocument().get("CODTYPORD")) != SalesForceNameSpace.SignatureRequired.NOSIGNATURE) {
            gui.viewSignatureButton = {
                msg: UserContext.tryTranslate("[MOBORDER.VIEW_SIGNATURE]"),
                id: 'mobguiorder-contextualmenu-view-signature',
                iconCls: 'guis_order_navbar_view_signature_23',
                handler: (function (ui, sign) {
                    return function () {
                        var attachmentData = {
                            des: sign.DESSUBJECT,
                            fileExt: sign.FILENAME.substr(sign.FILENAME.lastIndexOf(".") + 1, sign.FILENAME.length),
                            docKey: ui.getDocument().getKey(),
                            idFile: sign.IDFILE,
                            extUrl: ""
                        };
                        //retrieve attachment
                        ui.openAttachment(ui.getDocument(), attachmentData);
                    };
                })(gui, signature)
            };
            context.buttons.push(gui.viewSignatureButton);

            //update button state
            gui.viewSignatureButton.enabled = signature ? true : false;
        }

        if (this._isRouteFieldVisible(gui)) {
            gui.showRoute = {
                msg: UserContext.tryTranslate("[MOB.SHOW_ROUTE]"),
                id: 'mobguiorder-contextualmenu-show-route',
                iconCls: 'guis_order_navbar_show_route_23',
                handler: (function (doc) {
                    return function () { SalesExecutionEngine.showRoute(doc.get("IDROUTE")) };
                })(order)
            };
            context.buttons.push(gui.showRoute);
        }
    };

    //Checks if the route is displayed in the order UI
    this._isRouteFieldVisible = function (gui) {
        //find main tab config
        var mainTabCfg = JsonXmlHelper.filterNodesByAttr(gui.guiConfig.children, "name", "MAIN");
        if (mainTabCfg.length == 0)
            return false;

        //IDROUTE is a field of SM1Order entity
        var orderLayoutCfg = JsonXmlHelper.filterNodesByAttr(mainTabCfg[0].children, "baseObject", "SM1Order");
        if (orderLayoutCfg.length == 0)
            return false;

        //check visible card sections
        var cards = JsonXmlHelper.filterNodesByAttr(orderLayoutCfg[0].children, "type", "CARD");
        for (var i = 0; i < cards.length; i++) {
            var cardCfg = cards[i];

            var cardVisibleAttr = cardCfg.attrs.visible;
            if (cardVisibleAttr && cardVisibleAttr.toLowerCase() == "false")
                continue;

            var idRouteCfg = JsonXmlHelper.filterNodesByAttr(cardCfg.children, "name", "IDROUTE");
            if (idRouteCfg.length > 0) {
                var visibleAttr = idRouteCfg[0].attrs.visible;
                return visibleAttr == undefined || visibleAttr.toLowerCase() == "true";
            }
        }

        return false;
    };

    this._setPreloadFromAssoState = function (gui) {
        if (gui.preloadAssoButton) {
            if (!gui.CacheData || !gui.CacheData.m_cacheAssortments || gui.CacheData.m_cacheAssortments.isEmpty()) {
                gui.preloadAssoButton.visible = false;
            }
            else {
                gui.preloadAssoButton.visible = gui.isEditable() &&
                    gui.getDocument().get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.ASSET &&
                    !SM1OrderHelper.restrictedEditability(gui.getDocument()) &&
                    !SM1OrderHelper.isADelivery(gui.getDocument().get("CODTYPORD"));
            }
        }
    };

    //#region cache region
    // Cache the assortments for each division of the current customer
    // The cached data will be saved on the order
    this._cacheAssortments = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var pdv = gui.CacheContext.codCustSale;
            var codparty = XApp.isEmptyOrWhitespaceString(pdv) ? gui.CacheContext.codCustDeliv : pdv;
            gui.CacheData.m_cacheAssortments = new XIndexedCollection();

            if (codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve assortments for Customer: " + codparty);
                        onSuccess();
                    },
                    onSuccess: function (assortmentDictionary) {
                        try {
                            if (assortmentDictionary) {
                                XLog.logInfo("Loading Assortments from cache: found  " + assortmentDictionary.length + " items");
                                for (var i = 0; i < assortmentDictionary.length; i++) {
                                    if (order.get("CODDIV") != assortmentDictionary[i].key) {
                                        continue;
                                    }

                                    var filtered = Ext.Array.filter(assortmentDictionary[i].value, function (a) {
                                        return UserContext.getRefdatValue("ASSOTYPE", a.CODASSORTMENTTYPE, "ASSOORD") == "1";
                                    });

                                    for (var j = 0; j < filtered.length; j++) {
                                        gui.CacheData.m_cacheAssortments.add(filtered[j].CODART, filtered[j]);
                                        if (filtered[j].FLGMANDATORY)
                                            gui.CacheData.m_cacheAssortments.isMandatory = true;
                                    }

                                    break;
                                }
                            } else {
                                XLog.logWarn("No assortment cache for Customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve assortments for Customer: " + codparty);
                        }
                        onSuccess();
                    }
                });
            } else {
                if (onSuccess)
                    onSuccess();
            }
        }
        catch (e) {
            if (onFailure)
                onFailure(e);
        }

    };
    // Cache pricelist
    // The cached data will be saved on the order
    this._cachePriceList = function (gui, onFailure, onSuccess) {
        try {
            var codparty = gui.CacheContext.codCustDeliv;
            gui.CacheData.m_evalPriceListCollection = new XIndexedCollection();

            if (codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.PRICELISTS,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve price list from cache for customer:" + codparty);
                        if (onSuccess)
                            onSuccess();
                    },
                    onSuccess: function (priceList) {
                        try {
                            if (priceList) {
                                XLog.logInfo("Loading Price lists from cache: found  " + priceList.length + " items");
                                for (var i = 0; i < priceList.length; i++) {
                                    var priceListItem = priceList[i];
                                    gui.CacheData.m_evalPriceListCollection.add(priceListItem.CODART, priceListItem);
                                }

                                //remove from cache reduced data
                                if (gui.CacheContext.topSelling && gui.CacheContext.deleteReducedCache) {
                                    SfaCacheManager.removeFromCache({
                                        entityName: SfaCacheManagerNamespace.CacheObjects.PRICELISTS,
                                        date: gui.CacheContext.dteRef,
                                        codparty: codparty,
                                        coddiv: UserContext.CodDiv,
                                        onFailure: Ext.emptyFn,
                                        onSuccess: Ext.emptyFn
                                    });
                                }
                            } else {
                                XLog.logWarn("No pricelist cache for customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve price list from cache for customer:" + codparty);
                        }
                        if (onSuccess)
                            onSuccess();
                    }
                });
            }
            else {
                if (onSuccess)
                    onSuccess();
            }
        } catch (e) {
            onFailure(e);
        }
    };
    // Cache pricelists for gift and return rows
    // The cached data will be saved on the order
    this._cacheGiftReturnPriceList = function (gui, onFailure, onSuccess) {
        try {
            gui.CacheData.m_giftEvalPriceListCollection = new Ext.util.MixedCollection();
            gui.CacheData.m_returnEvalPriceListCollection = new Ext.util.MixedCollection();

            SfaCacheManager.getFromCache({
                entityName: SfaCacheManagerNamespace.CacheObjects.GIFT_RETURN_PRICELISTS,
                date: gui.CacheContext.dteRef,
                coddiv: UserContext.CodDiv,
                onFailure: function () {
                    XLog.logErr("Could not retrieve price list from cache for date: " + gui.CacheContext.dteRef);
                    onSuccess();
                },
                onSuccess: function (priceList) {
                    try {
                        if (priceList) {
                            XLog.logInfo("Loading Gift and Return Price lists from cache: found  " + priceList.length + " items");
                            var extractedPriceLists = SalesForceEngine.extractGiftAndReturnPriceLists(priceList);
                            gui.CacheData.m_giftEvalPriceListCollection = extractedPriceLists.giftList;
                            gui.CacheData.m_returnEvalPriceListCollection = extractedPriceLists.returnList;
                        } else {
                            XLog.logWarn("No pricelist cache for date: " + gui.CacheContext.dteRef);
                        }
                    } catch (ex) {
                        XLog.logErr("Could not retrieve price list from cache for date: " + gui.CacheContext.dteRef);
                    }
                    if (onSuccess)
                        onSuccess();
                }
            });

        } catch (e) {
            if (onFailure)
                onFailure(e);
        }
    };
    // Cache discountlist
    // The cached data will be saved on the order
    this._cacheDiscountList = function (gui, onFailure, onSuccess) {
        try {
            var codparty = gui.CacheContext.codCustDeliv;
            gui.CacheData.m_evalDiscountListCollection = new XIndexedCollection();

            if (SM1OrderHelper.canApplyDiscountLists(gui.getDocument().get("CODTYPORD")) &&
                codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.EVALS,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve price list from cache for customer:" + codparty);
                        if (onSuccess) onSuccess();
                    },
                    onSuccess: function (discountList) {
                        try {
                            if (discountList) {
                                var dlOrderTypeEnabled = OrderParameters.getInstance().getDlOrderTypeEnabled();
                                var codTypOrd = gui.getDocument().get('CODTYPORD');
                                XLog.logInfo("Loading Discount Lists from cache: found  " + discountList.length + " items");
                                for (var i = 0; i < discountList.length; i++) {
                                    var discount = discountList[i];

                                    if (dlOrderTypeEnabled && discount.ORDATTRVAL != codTypOrd)
                                        continue;

                                    //keep a indexed collection (indexed by CODDISCR) of evalDiscounts indexed collections (indexed by CODART)
                                    var indexedCollection = gui.CacheData.m_evalDiscountListCollection.findBy(discount.CODDISCR);
                                    if (!indexedCollection) {
                                        indexedCollection = new XIndexedCollection();
                                        gui.CacheData.m_evalDiscountListCollection.add(discount.CODDISCR, indexedCollection);
                                    }
                                    indexedCollection.add(discount.CODART, discount);
                                }

                                //remove from cache reduced data
                                if (gui.CacheContext.topSelling && gui.CacheContext.deleteReducedCache) {
                                    SfaCacheManager.removeFromCache({
                                        entityName: SfaCacheManagerNamespace.CacheObjects.EVALS,
                                        date: gui.CacheContext.dteRef,
                                        codparty: codparty,
                                        coddiv: UserContext.CodDiv,
                                        onFailure: Ext.emptyFn,
                                        onSuccess: Ext.emptyFn
                                    });
                                }
                            } else {
                                XLog.logWarn("No discount cache for customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve discount list for customer:" + codparty);
                        }
                        if (onSuccess) onSuccess();
                    }
                });

            } else {
                XLog.logInfo("Skipped loading discount lists.");
                if (onSuccess)
                    onSuccess();
            }
        } catch (e) {
            onFailure(e);
        }
    };
    // Cache canvass
    // The cached data will be saved on the order
    this._cacheCanvass = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var codparty = gui.CacheContext.codCustDeliv;
            gui.CacheData.m_canvassCollection = new Ext.util.MixedCollection();
            order.m_excludedAutoActions = new Ext.util.MixedCollection();
            order.m_usrIndicatedCnvGrp = new Ext.util.MixedCollection();
            order.m_usrUnappliableCnv = [];
            if (SM1OrderHelper.canApplyCanvass(order.get("CODTYPORD")) &&
                codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.CANVASS,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve canvasses list from cache for customer:" + codparty);
                        if (onSuccess) onSuccess();
                    },
                    onSuccess: function (canvass) {
                        try {
                            if (canvass) {
                                var i;

                                XLog.logInfo("Loading Canvass from cache: found  " + canvass.length + " items");
                                for (i = 0; i < canvass.length; i++) {
                                    var cnv = canvass[i];
                                    var cnvEntity = new XEntity({ entityName: "CnvAction", data: cnv });
                                    XLog.logInfo("Loaded CnvAction: [IDCNV]" + cnv.IDCNV + "\t[CODCNVACT]" + cnv.CODCNVACT);
                                    gui.CacheData.m_canvassCollection.add(cnvEntity);
                                }
                            } else {
                                XLog.logWarn("No canvass cache for customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve canvasses list from cache for customer:" + codparty);
                        }

                        if (onSuccess) onSuccess();
                    }
                });
            } else {
                XLog.logInfo("Skipped loading canvass actions.");
                if (onSuccess)
                    onSuccess();
            }

        } catch (e) {
            onFailure(e);
        }
    };

    // Cache historical order rows
    // The cached data will be saved on the order
    this._cacheHistoricalOrderRows = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var codparty = gui.CacheContext.codCustDeliv;
            if (SM1OrderHelper.canApplyCanvass(order.get("CODTYPORD")) &&
                codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.HISTORICAL_ORDER_ROWS,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve historical order rows list from cache for customer:" + codparty);
                        if (onSuccess) onSuccess();
                    },
                    onSuccess: function (histRows) {
                        try {
                            if (histRows) {
                                var i;
                                XLog.logInfo("Loading HistoricalOrderRows from cache: found  " + histRows.length + " items");
                                var historicalOrderRows = order.getSubEntityStore(SFConstants.HISTORICALORDERROW);
                                historicalOrderRows.clear();
                                for (i = 0; i < histRows.length; i++) {
                                    var histRow = new XEntity({ entityName: SFConstants.HISTORICALORDERROW, data: histRows[i] });
                                    historicalOrderRows.add(histRow);
                                }
                            } else {
                                XLog.logWarn("No historical order rows cache for customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve historical order rows list from cache for customer:" + codparty);
                        }

                        if (onSuccess) onSuccess();
                    }
                });
            } else {
                XLog.logInfo("Skipped loading historical order rows.");
                if (onSuccess)
                    onSuccess();
            }

        } catch (e) {
            onFailure(e);
        }
    };

    // Cache budget
    // The cached data will be saved on the order
    this._cacheBudget = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var codparty = gui.CacheContext.codCustDeliv;
            gui.CacheData.m_budgetGroupCollection = new XStore({ entityName: SFConstants.BUDGETGROUP });


            if (SM1OrderHelper.canApplyCanvass(order.get("CODTYPORD")) &&
                codparty && !XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.BUDGETGROUP,
                    date: gui.CacheContext.dteRef,
                    codparty: codparty,
                    onFailure: function () {
                        XLog.logErr("Could not retrieve budget from cache for customer:" + codparty);
                        if (onSuccess) onSuccess();
                    },
                    onSuccess: function (bdgRows) {
                        try {
                            if (bdgRows) {
                                var i;
                                XLog.logInfo("Loading budget from cache: found  " + bdgRows.length + " items");

                                for (i = 0; i < bdgRows.length; i++) {
                                    var bdgRow = new XEntity({ entityName: SFConstants.BUDGETGROUP, data: bdgRows[i] });
                                    gui.CacheData.m_budgetGroupCollection.add(bdgRow);
                                }
                            } else {
                                XLog.logWarn("No budgets cache for customer:" + codparty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve budget list from cache for customer:" + codparty);
                        }

                        if (onSuccess) onSuccess();
                    }
                });
            } else {
                XLog.logInfo("Skipped loading budgets.");
                if (onSuccess)
                    onSuccess();
            }

        } catch (e) {
            onFailure(e);
        }
    };

    // Cache cutomer asset balance
    // The cached data will be saved on the order
    this._cacheCustomerAssetBalance = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var codParty = !XApp.isEmptyOrWhitespaceString(gui.CacheContext.codCustSale) ? gui.CacheContext.codCustSale : gui.CacheContext.codCustDeliv;
            gui.CacheData.m_customerAssetBalances = new XIndexedCollection();

            if (codParty && !XApp.isEmptyOrWhitespaceString(codParty)) {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.CUSTOMERASSETBALANCE,
                    date: new Date(),
                    codparty: codParty,
                    coddiv: order.get("CODDIV"),
                    onFailure: function () {
                        XLog.logErr("Could not retrieve asset balance for Customer: " + codParty);
                        onSuccess();
                    },
                    onSuccess: function (assetBalanceDictionary) {
                        try {
                            if (assetBalanceDictionary) {
                                XLog.logInfo("Loading Asset Balances from cache, for customer " + codParty + ": found " + assetBalanceDictionary.length + " items");
                                for (var i = 0; i < assetBalanceDictionary.length; i++) {
                                    gui.CacheData.m_customerAssetBalances.add(assetBalanceDictionary[i].ASSETID, assetBalanceDictionary[i]);
                                }
                            } else {
                                XLog.logWarn("No asset balance cache for Customer:" + codParty);
                            }
                        } catch (ex) {
                            XLog.logErr("Could not retrieve asset balance for Customer: " + codParty);
                        }
                        onSuccess();
                    }
                });
            } else {
                if (onSuccess)
                    onSuccess();
            }
        }
        catch (e) {
            if (onFailure)
                onFailure(e);
        }
    };

    // Cache promo actions
    // The cached data will be saved on the order
    // save the cache of the promos in the m_promoTable and the appliable promos for rows in the m_rowPromo collection
    this._cachePromoActions = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();

            gui.CacheData.m_promoTable = new Ext.util.MixedCollection();
            gui.CacheData.m_rowPromo = new Ext.util.MixedCollection();

            if (SM1OrderHelper.canApplyPromo(order.get("CODTYPORD"))) {
                var navData = XNavHelper.getFromMemoryCache("NAV_MOB_APPLIABLEPROMOACTIONS");

                if (navData == null) {
                    XLog.logWarn("No promo cache found, or check the NAVDATA right for QNAVMOB_APPLIABLEPROMOACTIONS");
                }
                else {
                    var innerCons = new XConstraints({
                        logicalOp: 'AND',
                        constraints: [new XConstraint("CODWFSTATEHARD", "=", "INT"),
                            new XConstraint("DTEABORT", ">=", order.get("DTEORD"))
                        ]
                    });
                    var promoConfircons = new XConstraints({
                        logicalOp: 'OR',
                        constraints: [innerCons,
                            new XConstraint("CODWFSTATEHARD", "=", "CON")
                        ]
                    });
                    var constraints = new XConstraints({
                        logicalOp: 'AND',
                        constraints: [new XConstraint("CODDELIVERYPOINT", "=", order.get("CODCUSTDELIV")),
                            new XConstraint("DTESTART", "<=", order.get("DTEORD")),
                            new XConstraint("DTEEND", ">=", order.get("DTEORD")),
                            new XConstraint("DTESTARTSELLIN", "<=", order.get("DTEORD")),
                            new XConstraint("DTEENDSELLIN", ">=", order.get("DTEORD")),
                            promoConfircons
                        ]
                    });

                    var promos = navData.filterByConstraints(constraints);
                    if (promos == null) {
                        XLog.LogWarn("No promos found from the constraints");
                    }
                    else {

                        XLog.logInfo("Loading Promo Actions from cache: found  " + promos.length + " items");

                        for (var i = 0; i < promos.length; i++) {
                            var prow = promos[i];

                            gui.CacheData.m_promoTable.add(prow);
                            // set for each CODART the cache of promos
                            var codart = prow.getValueFromName("CODART");
                            if (!gui.CacheData.m_rowPromo.getByKey(codart)) {
                                gui.CacheData.m_rowPromo.add(codart, new Ext.util.MixedCollection());
                            }
                            if (SalesForceEngine.promoRowGivesBenefitsToOrder(prow)) {
                                gui.CacheData.m_rowPromo.getByKey(codart).add(prow);
                            }
                        }
                    }
                }
            }
            else
                XLog.logInfo("Skipped loading promo actions.");

            if (onSuccess)
                onSuccess();

        } catch (e) {
            onFailure(e);
        }
    };

    // Cache product conversions
    // Cache the product conversion navigator for fast access in a dictionary for optimal time use,
    // the values are saved in the CacheData
    this._cacheProductConversions = function (gui, onFailure, onSuccess) {
        try {
            var doc = gui.getDocument();
            var localExeQueue = new ExecutionQueue();
            gui.CacheData.m_prodConv = {};
            var callback = (function (order) {
                return function () {
                    gui.CacheData.m_prodConv = SalesForceEngine.getProductConversions(order.get("CODDIV"));
                    localExeQueue.executeNext();
                };
            })(doc);
            localExeQueue.pushHandler(this, callback);

            localExeQueue.pushHandler(this, onSuccess);
            localExeQueue.executeNext();

        } catch (e) {
            onFailure(e);
        }
    };

    //load from local cache delivery, invoice and workplace customers of current order
    //the workplace customer is loaded only if the delivery customer is a doctor
    this._loadCustomers = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            var codCustDeliv = gui.CacheContext.codCustDeliv;
            var codCustInv = gui.CacheContext.codCustInv;
            var localExeQueue = new ExecutionQueue();

            if (!XApp.isEmptyOrWhitespaceString(codCustDeliv)) {
                var delivAction = (function (delivCust, ord) {
                    return function () {
                        XDocsCache.loadFromLocalCache(CommonEngine.buildCustomerKey(delivCust),
                            function (docStore) {
                                try {
                                    if (docStore && docStore.getCount() > 0) {
                                        XLog.logInfo("Loading delivery customer from cache; found:" + delivCust);
                                        ord.DeliveryCustomer = docStore.getAt(0);
                                    } else {
                                        XLog.logWarn("Delivery customer not found in local cache: " + delivCust);
                                    }
                                } catch (ex) {
                                    XLog.logErr("Could not load from local cache delivery customer: " + delivCust);
                                }
                                localExeQueue.executeNext();
                            },
                            function () {
                                XLog.logErr("Could not load from local cache delivery customer: " + delivCust);
                                localExeQueue.executeNext(); //continue even if error
                            });
                    };
                })(codCustDeliv, order);
                localExeQueue.pushHandler(this, delivAction);

                if (CommonEngine.isDoctor(codCustDeliv)) {
                    var wpCod = CommonEngine.getCustAddrRef(order);
                    //if the delivery customer is a doctor, get related main WP of this customer 
                    //or the codstructure of the visit where the order is created
                    var workplaceAction = (function (wpCod, ord) {
                        return function () {
                            XDocsCache.loadFromLocalCache(CommonEngine.buildCustomerKey(wpCod),
                                function (docStore) {
                                    try {
                                        if (docStore && docStore.getCount() > 0) {
                                            XLog.logInfo("Loading workplace customer from cache; found:" + wpCod);
                                            ord.WorkplaceCustomer = docStore.getAt(0);
                                        } else {
                                            XLog.logWarn("Workplace customer not found in local cache: " + wpCod);
                                        }
                                    } catch (ex) {
                                        XLog.logErr("Could not load from local cache workplace customer: " + wpCod);
                                    }
                                    localExeQueue.executeNext();
                                },
                                function () {
                                    XLog.logErr("Could not load from local cache workplace customer: " + wpCod);
                                    localExeQueue.executeNext(); //continue even if error
                                });
                        };
                    })(wpCod, order);
                    localExeQueue.pushHandler(this, workplaceAction);

                }
            }

            if (!XApp.isEmptyOrWhitespaceString(codCustInv)) {
                var invAction = (function (invCust, ord) {
                    return function () {
                        //skip cache reading if it's the same customer
                        if (ord.DeliveryCustomer && ord.DeliveryCustomer.get("CODPARTY") == invCust) {
                            XLog.logInfo("Skip loading invoice customer from cache; same as delivery customer.");
                            ord.InvoiceCustomer = ord.DeliveryCustomer;
                            localExeQueue.executeNext();
                            return;
                        }

                        XDocsCache.loadFromLocalCache(CommonEngine.buildCustomerKey(invCust),
                            function (docStore) {
                                try {
                                    if (docStore && docStore.getCount() > 0) {
                                        XLog.logInfo("Loading invoice customer from cache; found:" + invCust);
                                        ord.InvoiceCustomer = docStore.getAt(0);
                                    } else {
                                        XLog.logWarn("Invoice customer not found in local cache: " + invCust);
                                    }
                                } catch (ex) {
                                    XLog.logErr("Could not load from local cache invoice customer: " + invCust);
                                }
                                localExeQueue.executeNext();
                            },
                            function () {
                                XLog.logErr("Could not load from local cache invoice customer: " + invCust);
                                localExeQueue.executeNext(); //continue even if error
                            });
                    };
                })(codCustInv, order);
                localExeQueue.pushHandler(this, invAction);
            }
            localExeQueue.pushHandler(this, onSuccess);
            localExeQueue.executeNext();
        } catch (e) {
            onFailure(e);
        }
    };

    // Cache prevOrderInfo for gift and return rows
    // The cached data will be saved on the order
    this._cachePrevOrderInfo = function (gui, onFailure, onSuccess) {
        try {
            var pdv = gui.CacheContext.codCustSale;
            var codParty = XApp.isEmptyOrWhitespaceString(pdv) ? gui.CacheContext.codCustDeliv : pdv;
            gui.CacheData.m_prevOrderInfo = new XStore({ entityName: "PrevOrderInfo" });

            SfaCacheManager.getFromCache({
                entityName: SfaCacheManagerNamespace.CacheObjects.PREVORDERINFOS,
                //in full offline mode, no data is cached for a future date. So the the minimum between sys date and order dteRef will be used
                date: UserContext.isFullOfflineMode() ? new Date(Math.min(gui.CacheContext.dteRef.getTime(), new Date().toDate().getTime())) : gui.CacheContext.dteRef,
                codparty: codParty,
                coddiv: UserContext.CodDiv,
                onFailure: function () {
                    XLog.logErr("Could not retrieve previous orders info from cache for date: " + gui.CacheContext.dteRef);
                    onSuccess();
                },
                onSuccess: function (prevOrderInfos) {
                    try {
                        if (prevOrderInfos) {
                            XLog.logInfo("Loading previous orders info from cache: found  " + prevOrderInfos.length + " items");
                            for (var i = 0; i < prevOrderInfos.length; i++) {
                                var prevOrderInfo = prevOrderInfos[i];
                                var prevOrderInfoEntity = new XEntity({ entityName: "PrevOrderInfo", data: prevOrderInfo });
                                gui.CacheData.m_prevOrderInfo.add(prevOrderInfoEntity);
                            }
                        } else {
                            XLog.logWarn("No previous orders info cache for date: " + gui.CacheContext.dteRef);
                        }
                    } catch (ex) {
                        XLog.logErr("Could not retrieve previous orders info from cache for date: " + gui.CacheContext.dteRef);
                    }
                    if (onSuccess)
                        onSuccess();
                }
            });

        } catch (e) {
            if (onFailure)
                onFailure(e);
        }
    };

    this._buildCacheContext = function (gui) {
        var order = gui.getDocument();

        gui.CacheContext = {
            gui: gui,
            cancel: false,
            codCustDeliv: order.get("CODCUSTDELIV"),
            codCustSale: order.get("CODCUSTSALE"),
            codCustInv: order.get("CODCUSTINV"),
            dteRef: order.get("DTEORD"),
            topSelling: (gui.openMode == "NEW" && !gui.openData.orderCopy && !gui.openData.cart &&
                OrderParameters.getInstance(order.get("CODTYPORD")).getFlgTopSellingManaged()) ? true : false,
            allowBatchModifications: (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) && this._orderHasBatches(order)) ? false : true
        };

        return gui.CacheContext;
    };

    this._getCacheFailCallback = function (gui) {
        var self = this;
        return function (e) {
            self._setPreloadFromAssoState(gui);
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
    };

    //Load cache data in a Queue
    this._loadFromCache = function (contextGui, onFinish) {
        XLog.logInfo("Loading from cache...");

        var self = this;
        var localExecutionQueue = new ExecutionQueue();

        var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);
        var failureCallback = this._getCacheFailCallback(contextGui);
        var f;

        //refresh BenefitState for PromoApplier
        SalesForceEngine.orderBenefitState = new OrderBenefitState();

        if (!contextGui.CacheContext.isReload) {
            // load cached assortments
            f = (function (gui) {
                return function () {
                    self._cacheAssortments(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load gift and return pricelists
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Assortment load duration ", true);
                    self._cacheGiftReturnPriceList(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);
        }

        // load cached price lists
        f = (function (gui) {
            return function () {
                if (!gui.CacheContext.isReload) {
                    SM1OrderHelper._showTime("Gift Return pricelists load duration ", true);
                }
                self._setPreloadFromAssoState(contextGui);

                self._cachePriceList(gui, failureCallback, successCallback);
            };
        })(contextGui);
        localExecutionQueue.pushHandler(this, f);

        // load cached previous orders info lists
        f = (function (gui) {
            return function () {
                SM1OrderHelper._showTime("Price lists load duration ", true);

                self._cachePrevOrderInfo(gui, failureCallback, successCallback);
            };
        })(contextGui);
        localExecutionQueue.pushHandler(this, f);

        // load cached discount lists
        f = (function (gui) {
            return function () {
                SM1OrderHelper._showTime("Previous orders info load duration ", true);
                self._cacheDiscountList(gui, failureCallback, successCallback);
            };
        })(contextGui);
        localExecutionQueue.pushHandler(this, f);

        if (!contextGui.CacheContext.isReload) {
            // load cached canvasses
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Discount lists load duration ", true);
                    self._cacheCanvass(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load cached historical order rows
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Canvasses load duration ", true);
                    self._cacheHistoricalOrderRows(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load cached budget 
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Historical order rows load duration ", true);
                    self._cacheBudget(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load cached asset balances           
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Budget load duration ", true);
                    self._cacheCustomerAssetBalance(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load the promoactions from the navigator
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Asset balance load duration ", true);
                    self._cachePromoActions(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load the product conversions from the navigator
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Promoactions load duration ", true);
                    self._cacheProductConversions(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load delivery / invoice customer
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Product conversions load duration ", true);
                    self._loadCustomers(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load warehouse balance
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Customers load duration ", true);
                    self._loadWarehouseBalances(gui, failureCallback, successCallback, gui.openMode == "NEW");
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            //load calculation requested qty
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Warehouse balance load duration ", true);
                    self._loadCalculationRequestedQty(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // load source visit
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Requested quantities load duration ", true);
                    self._loadVisit(gui, failureCallback, successCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);

            // after load cache
            // work with loaded date on opening the order
            // check the gui.openMode
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Visit load duration ", true);
                    self._afterCacheLoad(gui, successCallback, failureCallback);
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);
        }
        else {
            //only pricelists and discountlists need to be reloaded from cache
            f = (function (gui) {
                return function () {
                    SM1OrderHelper._showTime("Discount lists load duration ", true);
                    //reset (inner) discount cache
                    gui.CacheData.DiscountApplier = new DiscountApplier.OrderDiscountApplier(gui.getDocument(), gui.CacheData);
                    SalesForceEngine.refreshCanvasActions(gui.getDocument(), gui.CacheData);
                    successCallback();
                };
            })(contextGui);
            localExecutionQueue.pushHandler(this, f);
        }

        //refresh gui
        f = (function (gui, succesCb) {
            return function () {
                SalesForceEngine.refreshOrderSurveyMeasures(gui.getDocument(), gui.CacheData);
                //rebind objects
                self._refreshTab(gui, gui.getDocument(), true);
                XUI.hideWait();

                XApp.exec(onFinish);
            };
        })(contextGui, successCallback);

        localExecutionQueue.pushHandler(this, f);

        SM1OrderHelper._startTimer();
        localExecutionQueue.executeNext();
    };

    //initial load of cache
    this._loadCacheData = function (contextGui, onFinish) {
        var context = contextGui.CacheContext;
        if (!context || context.cancel)
            return;

        var self = this;

        var failureCb = this._getCacheFailCallback(contextGui);

        // init CacheData structure to prevent crash if cache is not loaded completly
        contextGui.CacheData = {
            m_cacheAssortments: new XIndexedCollection(),
            m_canvassCollection: new Ext.util.MixedCollection(),
            m_evalDiscountListCollection: new XIndexedCollection(),
            m_evalPriceListCollection: new XIndexedCollection(),
            m_giftEvalPriceListCollection: new Ext.util.MixedCollection(),
            m_returnEvalPriceListCollection: new Ext.util.MixedCollection(),
            m_customerAssetBalances: new XIndexedCollection(),
            m_prodConv: {},
            m_cacheProd: {},
            m_promoTable: new Ext.util.MixedCollection(),
            m_rowPromo: new Ext.util.MixedCollection(),
            //maintain for each warehouse (key of main dictionary)
            //the balance for each available product (product key = key of inner dictionary)
            m_whsBalances: {},
            //maintain for each cod cust deliv (key of main dictionary)
            //the qtyord for each available product (product key = key of inner dictionary)
            m_calculationRequestedQty: {},
            //used to store discarded benefits info
            m_discardedBenefitsManager: new DiscardedBenefitsManager(),
            m_previousOrderedRowsInfo: {},
            m_surveyMeasureData: {},
            m_orderRowsProductInfo: {},
            m_visit: null
        };

        //cache retrieval for delivery customer is performed before ui rendering
        if (!XApp.isEmptyOrWhitespaceString(context.codCustSale) && context.codCustSale != context.codCustDeliv) {

            var load = {};
            for (var entry in SfaCacheManagerNamespace.CacheObjects) {
                //bring only ASSORTMENT, EVALS, PREVORDERINFOS
                if (SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS &&
                    SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.EVALS &&
                    SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.PREVORDERINFOS)
                    load[SfaCacheManagerNamespace.CacheObjects[entry]] = false;
            }

            SfaCacheManager.syncData({
                loadDefinitions: [
                    {
                        codparty: context.codCustSale,
                        date: context.dteRef,
                        coddiv: UserContext.CodDiv,
                        load: load
                    }
                ],
                flags: { "TOPSELLING": context.topSelling },
                onFailure: failureCb,
                onSuccess: function () {
                    self._loadFromCache(contextGui, onFinish);
                }
            });
        }
        else {
            SfaCacheManager.waitForCache(function () { self._loadFromCache(contextGui, onFinish); });
        }
    };

    //reload the cache by forcing all products in the pricelist
    //reload only relevant entities
    this._reloadCacheData = function (gui) {
        var cacheContext = this._buildCacheContext(gui);
        cacheContext.topSelling = false;
        cacheContext.isReload = true;

        XApp.callCust("guiCustomizer", "mobGuiOrder", "preLoadCacheData", cacheContext);
        if (cacheContext.cancel) {
            return;
        }

        var self = this;
        XUI.showWait();

        var failureCb = this._getCacheFailCallback(gui);

        var successCb = function () {
            //if CODCUSTSALE is not empty and is different from CODCUSTDELIV, then cache data also for that client code
            if (!XApp.isEmptyOrWhitespaceString(cacheContext.codCustSale) && cacheContext.codCustSale != cacheContext.codCustDeliv) {

                var load = {};
                for (var entry in SfaCacheManagerNamespace.CacheObjects) {
                    //bring only ASSORTMENT, EVALS
                    if (SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS && SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.EVALS)
                        load[SfaCacheManagerNamespace.CacheObjects[entry]] = false;
                }

                SfaCacheManager.syncData({
                    loadDefinitions: [
                        {
                            codparty: cacheContext.codCustSale,
                            date: cacheContext.dteRef,
                            coddiv: UserContext.CodDiv,
                            load: load
                        }
                    ],
                    flags: { "TOPSELLING": cacheContext.topSelling },
                    onFailure: failureCb,
                    onSuccess: function () {
                        self._loadFromCache(gui);
                    }
                });
            }
            else {
                self._loadFromCache(gui);
            }
        };


        var load = {};
        load[SfaCacheManagerNamespace.CacheObjects.MOBVISIT] = false;
        load[SfaCacheManagerNamespace.CacheObjects.CUSTOMER] = false;

        SfaCacheManager.syncData({
            loadDefinitions: [{
                codparty: cacheContext.codCustDeliv,
                date: cacheContext.dteRef,
                coddiv: UserContext.CodDiv,
                load: load
            }],
            flags: { "TOPSELLING": cacheContext.topSelling },
            onFailure: failureCb,
            onSuccess: successCb
        });
    };

    this._loadWarehouseBalances = function (gui, onFailure, onSuccess, removeBatchOnCalculate) {
        try {
            if (removeBatchOnCalculate == undefined)
                removeBatchOnCalculate = true;

            var order = gui.getDocument();

            if (!order || XApp.isEmptyOrWhitespaceString(order.get("CODWHS"))) {
                onSuccess();
                return;
            }

            if (!XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order))) {
                onSuccess();
                return;
            }

            if (gui.CacheData.m_whsBalances[order.get("CODWHS")] ||
                (!SM1OrderHelper.isPreloadFromWarehouseEnabled(order.get("CODTYPORD")) && !SM1OrderHelper.isWarehouseAllocationEnabled(order.get("CODTYPORD")))) {
                order.removePreloadedBatches();
                SalesForceEngine.refreshWhsBalance(order, gui.CacheData);
                order.distributeOrderedQuantityToBatches(gui.CacheData);
                onSuccess();
                return;
            }

            SalesForceEngine.calculateWarehouseBalance(order.get("CODWHS"), order.get("DOCUMENTKEY"), gui.CacheData,
                function (response) {
                    if (removeBatchOnCalculate)
                        order.removePreloadedBatches();

                    if (response) {
                        if (gui.CacheData)
                            gui.CacheData.m_whsBalances[order.get("CODWHS")] = response;
                    }

                    SalesForceEngine.refreshWhsBalance(order, gui.CacheData);

                    order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                        SM1OrderHelper.updateAdjustmentData(row, gui.CacheData);
                    });

                    if (removeBatchOnCalculate)
                        order.distributeOrderedQuantityToBatches(gui.CacheData);

                    onSuccess();
                },
            function () {
                order.removePreloadedBatches();
                SalesForceEngine.refreshWhsBalance(order, gui.CacheData);
                order.distributeOrderedQuantityToBatches(gui.CacheData);
                onFailure();
            });
        }
        catch (e) {
            onFailure(e);
        }
    };

    //Calculate requested qtyord
    this._loadCalculationRequestedQty = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();
            //verify if macrotype is load or unload
            if (!(order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.WHSLOAD || order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.WHSUNLOAD)) {
                onSuccess();
                return;
            }

            if (!XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order))) {
                onSuccess();
                return;
            }

            if (!order ||
                XApp.isEmptyOrWhitespaceString(order.get("CODCUSTDELIV")) ||
                    gui.CacheData.m_calculationRequestedQty[order.get("DelivCustAndDateKey")]) {
                SalesForceEngine.refreshCalculationRequestedQtyAllRows(order, gui.CacheData);
                onSuccess();
                return;
            }

            //verifiy if exist conectivity
            if (!XApp.isOnline()) {
                XLog.logInfo("Cannot calculate requested qtyord in offline mode.");
                onSuccess();
                return;
            }
            else {
                //calculate requested qty
                SalesForceEngine.calculateRequestedQty(order.get("CODCUSTDELIV"), order.get("DTEDELIV"), order.get("DOCUMENTKEY"),
                    function (response) {
                        if (response) {
                            gui.CacheData.m_calculationRequestedQty[order.get("DelivCustAndDateKey")] = response;
                        }
                        SalesForceEngine.refreshCalculationRequestedQtyAllRows(order, gui.CacheData);
                        onSuccess();
                    },
                    function () {
                        SalesForceEngine.refreshCalculationRequestedQtyAllRows(order, gui.CacheData);
                        onFailure();
                    });
            }
        }
        catch (e) {
            onFailure(e);
        }
    };

    //load visit from which current order is created, if any
    this._loadVisit = function (gui, onFailure, onSuccess) {
        try {
            var order = gui.getDocument();

            //for performance reasons, load visit only if order needs data from it
            if (SalesForceEngine.getVisibleMeasureFields(order.get("CODTYPORD"), order.get("CODSTATUS"), order.get("CODDIV")).length == 0) {
                onSuccess();
                return;
            }

            //document passed from visit ui
            gui.CacheData.m_visit = XHistory.actualConfig().visit;
            if (gui.CacheData.m_visit) {
                onSuccess();
                return;
            }

            //try to find the visit from which current order was created
            if (XApp.isEmptyOrWhitespaceString(order.get("IDSURVEY"))) {
                onSuccess();
                return;
            }

            var activitiesNav = XNavHelper.getFromMemoryCache("NAV_MOB_SE_ACTIVITIES");
            if (!activitiesNav) {
                XLog.logWarn("Load visit: activities navigator not found.", true);
                onSuccess();
                return;
            }

            var navRow = activitiesNav.findByConstraints(new XConstraint("IDSURVEY", "=", order.get("IDSURVEY")));
            if (!navRow) {
                XLog.logWarn("Load visit: survey not found; IDSURVEY=" + order.get("IDSURVEY"), true);
                onSuccess();
                return;
            }

            if (XApp.isEmptyOrWhitespaceString(navRow.get("IDVISIT"))) {
                XLog.logWarn("Load visit: visit not found; IDSURVEY=" + order.get("IDSURVEY"), true);
                onSuccess();
                return;
            }

            var visitDocKey = "MobVisit|" + navRow.get("IDVISIT");
            XDocs.loadDocument(visitDocKey, false, onFailure,
                function (docStore) {
                    if (docStore && docStore.getCount() > 0) {
                        gui.CacheData.m_visit = docStore.getAt(0);
                    }
                    onSuccess();
                });
        }
        catch (e) {
            onFailure(e);
        }
    };

    //#endregion

    //check if the requested action is accepted by the current ui
    this.beforeRequestAction = function (context) {

        var authContext = {
            actionContext: context,
            codFunction: ""
        };

        XApp.callCust("guiCustomizer", "mobGuiOrder", "getAuthorizationFunction", authContext);

        if (!XApp.isEmptyOrWhitespaceString(authContext.codFunction)) {
            context.canceled = true;

            XUI.authorizeFunction({
                codFunction: authContext.codFunction,
                onFailure: context.onFailure,
                onSuccess: context.onSuccess
            });
        }
    };

    //determine if the action must be authorized
    this.getAuthorizationFunction = function (context) {
        var actionContext = context.actionContext.actionContext;

        if (actionContext.action == XHistoryAction.Go &&
            actionContext.config &&
            actionContext.config.openMode == "NEW") {
            switch (actionContext.config.orderType) {

                case SalesForceNameSpace.OrderCTORD.INVENTORY:
                    context.codFunction = CommonNameSpace.AUTHF.INVENTORY;
                    break;

                case SalesForceNameSpace.OrderCTORD.UNLOAD:
                    context.codFunction = CommonNameSpace.AUTHF.UNLOAD;
                    break;

                case SalesForceNameSpace.OrderCTORD.ADJUSTMENT:
                    context.codFunction = CommonNameSpace.AUTHF.STKCOR;
                    break;
            }
        }
    };

    this.beforeUiRendering = function (context) {

        var self = this;
        var gui = context.gui;
        var order = gui.getDocument();

        //create (sooner) some menu buttons

        //check if pricing conditions are enabled
        var codTypOrd = order.get("CODTYPORD");
        var applyConditions = SM1OrderHelper.canApplyDiscountLists(codTypOrd) ||
            SM1OrderHelper.canApplyPromo(codTypOrd) ||
            SM1OrderHelper.canApplyCanvass(codTypOrd);

        gui.refreshPricingButton = {
            msg: UserContext.tryTranslate("[MOBORDER.REFRESH_PRICING]"),
            id: 'mobguiorder-contextualmenu-refresh-pricing',
            iconCls: 'guis_order_navbar_refresh_pricing_23',
            visible: gui.openMode != 'VIEW' && applyConditions && !SM1OrderHelper.restrictedEditability(order),
            handler: (function (ui) {
                return function () {
                    var order = ui.getDocument();
                    self.reaplyBenefits(order, ui, true);
                    self.refreshAll(ui, true);
                };

            })(gui)
        };

        gui.removeZeroOrderRowsButton = {
            msg: UserContext.tryTranslate("[MOBORDER.REMOVE_ZERO_ORDER_ROWS]"),
            id: 'mobguiorder-contextualmenu-remove-zerorows',
            iconCls: 'guis_order_navbar_remove_rows_23',
            visible: !SM1OrderHelper.isADelivery(gui.getDocument().get("CODTYPORD")),
            handler: (function (ui) {
                return function () {
                    var doc = ui.getDocument();
                    var cacheData = doc.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY ? ui.cacheData : null;

                    var removed = self._removeZeroOrderRows(doc, ui.CacheData);

                    if (!removed)
                        return;

                    self.refreshAll(ui, true, true);

                    var rowDetailContext = ui.tabCtrls["ROWS"];

                    if (rowDetailContext && rowDetailContext.sections["GRID"]) {
                        var grid = rowDetailContext.sections["GRID"].grid;
                        var orStore = grid.getStore();
                        doc.getSubEntityStore(SFConstants.ORDERROW).rebindSenchaStore(orStore);

                        if (grid.getScrollable()) {
                            var scroller = grid.getScrollable();
                            if (scroller) {
                                // Scroll to start: 1 because sencha bug
                                scroller.scrollTo(0, 1);
                            }
                        }
                    }
                };
            })(gui)
        };

        //hold ui rendering until refresh se data server call is made
        this._buildCacheContext(gui);
        XApp.callCust("guiCustomizer", "mobGuiOrder", "preLoadCacheData", gui.CacheContext);
        if (gui.CacheContext.cancel) {
            return;
        }

        //hold ui rendering
        context.executeNext = false;


        var localExecutionQueue = new ExecutionQueue();
        var action;

        //docFromCache is set to true when navigating back from a link
        if (gui.openMode == "NEW" && !gui.docFromCache) {

            action = (function (order) {
                return function () {
                    XApp.getCoordinates(function (lat, lng) {
                        if (lat !== null)
                            order.set("GPSVALLATITUDE", lat);
                        if (lng !== null)
                            order.set("GPSVALLONGITUDE", lng);

                        //Enh #33399: New order timestamp and calculated spent time
                        order.set("DTENEW", new Date());

                        localExecutionQueue.executeNext();
                    });
                };
            })(order);
            localExecutionQueue.pushHandler(this, action);
        }

        gui.CacheContext.deleteReducedCache = false;
        if (gui.CacheContext.topSelling) {
            action = (function (ui) {
                return function () {
                    var cacheContext = ui.CacheContext;
                    //check if full price list is already cached
                    //if not, a reduced set of data will be retrieved first
                    SfaCacheManager.getFromCache({
                        entityName: SfaCacheManagerNamespace.CacheObjects.PRICELISTS,
                        date: cacheContext.dteRef,
                        codparty: cacheContext.codCustDeliv,
                        coddiv: UserContext.CodDiv,
                        onFailure: function () {
                            cacheContext.deleteReducedCache = true;
                            localExecutionQueue.executeNext();
                        },
                        onSuccess: function (data) {
                            if (!data) {
                                cacheContext.deleteReducedCache = true;
                            }
                            localExecutionQueue.executeNext();
                        }
                    });
                };
            })(gui);
            localExecutionQueue.pushHandler(this, action);
        }

        action = (function (ui) {
            return function () {
                var cacheContext = ui.CacheContext;

                var refreshCallback = function () {
                    //start ui generation
                    ui.exe.executeNext();
                };

                //customers to be retrieved by cache manager
                var load = {};
                load[SfaCacheManagerNamespace.CacheObjects.MOBVISIT] = false;

                var loadDefinitions = [{
                    codparty: cacheContext.codCustDeliv,
                    codcustsale: cacheContext.codCustSale,
                    date: cacheContext.dteRef,
                    coddiv: UserContext.CodDiv,
                    load: load
                }];

                if (!XApp.isEmptyOrWhitespaceString(cacheContext.codCustInv) && cacheContext.codCustInv != cacheContext.codCustDeliv) {

                    var load = {};
                    for (var entry in SfaCacheManagerNamespace.CacheObjects)
                        if (SfaCacheManagerNamespace.CacheObjects[entry] != SfaCacheManagerNamespace.CacheObjects.CUSTOMER)
                            load[SfaCacheManagerNamespace.CacheObjects[entry]] = false;

                    var loadDefinition = {
                        codparty: cacheContext.codCustInv,
                        codcustsale: cacheContext.codCustSale,
                        date: cacheContext.dteRef,
                        coddiv: UserContext.CodDiv,
                        load: load
                    };

                    loadDefinitions.push(loadDefinition);
                }


                if (!XApp.isEmptyOrWhitespaceString(cacheContext.codCustDeliv) && CommonEngine.isDoctor(cacheContext.codCustDeliv)) {

                    var order = cacheContext.gui.getDocument();
                    var wpCod = CommonEngine.getCustAddrRef(order);

                    var load = {};
                    var loadDefinition = {
                        codparty: wpCod,
                        codcustsale: cacheContext.codCustSale,
                        date: cacheContext.dteRef,
                        coddiv: UserContext.CodDiv,
                        load: load
                    };

                    loadDefinitions.push(loadDefinition);
                }

                SfaCacheManager.syncData({
                    loadDefinitions: loadDefinitions,
                    flags: { "TOPSELLING": cacheContext.topSelling },
                    onFailure: Ext.emptyFn,
                    onSuccess: Ext.emptyFn, //if offline cache manager will first call onRefresh and after that onSuccess
                    onRefresh: refreshCallback
                });

            };
        })(gui);
        localExecutionQueue.pushHandler(this, action);

        localExecutionQueue.executeNext();
    };

    ///full refresh of order rows tab
    this._refreshTab = function (gui, doc, gridRefresh, resetScroll) {
        try {
            var self = this;
            var refresh = (function (orderGui, order) {
                return function () {

                    var startTimer = new Date();
                    if (orderGui.tabCtrls) {
                        var mDetailContext = orderGui.tabCtrls["MAIN"];
                        var rows = order.getSubEntityStore(SFConstants.ORDERROW);
                        if (mDetailContext) {
                            //comented out for performance reasons
                            //mDetailContext.refreshGui();
                            mDetailContext.refreshControls();
                            mDetailContext.setFieldsStatus();
                        }
                        if (gridRefresh) {
                            var rowDetailContext = orderGui.tabCtrls["ROWS"];
                            if (rowDetailContext) {
                                if (rowDetailContext.sections["GRID"]) {
                                    var grid = rowDetailContext.sections["GRID"].grid;
                                    var scroller = grid.getScrollable();
                                    var selectedIndex = self._getSelectedRowIndex(rowDetailContext);

                                    var orStore = grid.getStore();
                                    var previousFilters = Ext.clone(orStore.getFilters().items);
                                    var selectedOrderRowRecord = orStore.getAt(selectedIndex);
                                    var selectedOrderRow;

                                    if (selectedOrderRowRecord)
                                        selectedOrderRow = selectedOrderRowRecord.xrec;

                                    //#Bug 41448 - resets the scroll position after rebind sencha store
                                    var xScrollPosition = scroller.position.x;
                                    var yScrollPosition = scroller.position.y;

                                    orStore.clearFilter(true);
                                    rows.rebindSenchaStore(orStore);
                                    orStore.filter(previousFilters);

                                    scroller.scrollTo(xScrollPosition, yScrollPosition);

                                    //reselect the row
                                    if (selectedOrderRow) {
                                        selectedIndex = orStore.findBy(function (record) {
                                            if (record.xrec.get("NUMROW") == selectedOrderRow.get("NUMROW"))
                                                return true;
                                        });
                                    }
                                    self._selectOrderRow(rowDetailContext, selectedIndex, resetScroll);
                                }
                                //comented out for performance reasons
                                //rowDetailContext.refreshGui();
                                rowDetailContext.refreshControls();
                                rowDetailContext.setFieldsStatus();
                            }
                        }
                    }
                    SM1OrderHelper._showTime("Refresh of tab gui", false, startTimer);
                };
            })(gui, doc);

            setTimeout(refresh, 10);
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._refreshOrderRowsGrid = function (gui) {
        var rowDetailContext = gui.tabCtrls["ROWS"];
        var rows = gui.getDocument().getSubEntityStore(SFConstants.ORDERROW);

        //refresh the grid
        if (rowDetailContext) {
            if (rowDetailContext.sections["GRID"]) {
                var orStore = rowDetailContext.sections["GRID"].grid.getStore();

                rows.rebindSenchaStore(orStore);
            }

            rowDetailContext.refreshGui();
        }
    };

    this._refreshBatchGrid = function (orderRowDetailContext) {
        var section = orderRowDetailContext.sections["BATCHGRID"];
        if (!section)
            return;

        var batches = orderRowDetailContext.entity.getSubEntityStore(SFConstants.ORDERROWBATCH);
        batches.rebindSenchaStore(section.grid.getStore());
    };

    //refresh batches when row type changes
    this._reloadBatches = function (gui, orderRow, oldCodTypRow, newCodTypRow) {
        var order = gui.getDocument();

        if (order.get("CODTYPORD") == SalesForceNameSpace.OrderCTORD.INVENTORY ||
            SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD")) ||
            !SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) ||
            !orderRow.getProduct().get("FLGBATCHNUMBER"))
            return false;

        var wereBatchesPreloaded = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), oldCodTypRow);
        var shouldPreloadBatches = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), newCodTypRow);

        if (wereBatchesPreloaded) {
            //batch details were automatically preloaded
            //and now should be managed by the user
            if (!shouldPreloadBatches)
                orderRow.getSubEntityStore(SFConstants.ORDERROWBATCH).clear();
        }
        else {
            //remove batches manually added by user
            //now they should be automatically preloaded from warehouse availability
            if (shouldPreloadBatches) {
                orderRow.getSubEntityStore(SFConstants.ORDERROWBATCH).clear();
                SalesForceEngine.refreshRowWhsBalance(order, orderRow, gui.CacheData);
                orderRow.distributeOrderedQuantityToBatches(gui.CacheData);
                return true;
            }
        }

        return false;
    };

    this._afterCacheLoad = function (gui, onSuccess, onFailure) {
        try {

            var context = {
                gui: gui,
                onSuccess: onSuccess,
                onFailure: onFailure,
                cancel: false
            };
            XApp.callCust("guiCustomizer", "mobGuiOrder", "preAfterCacheLoad", context);
            if (context.cancel)
                return;

            // clear the collection that save the previous benefits states
            SalesForceEngine.orderBenefitState.StateCollection.clear();

            var self = this;
            var order = gui.getDocument();
            // reconstruct the omag_art_seltra benefits
            SalesForceEngine.constructOmmagioASceltaFromOrder(order, gui.CacheData);
            // reconstruct manually changed benefit amounts for type 5
            SalesForceEngine.constructRowAmountDiscountQuantity(order, gui.CacheData);


            gui.CacheData.m_surveyMeasureData = SalesForceEngine.collectAllOrderMeasures(order, gui.CacheData.m_visit);

            var histConfig = XHistory.actualConfig();
            if (!histConfig.skipRefreshAll) {
                histConfig.skipRefreshAll = false;

                var initialAppliedCnvGroups = null;

                //reset empty dynamic fields for proper grid refresh
                if (gui.openMode != "NEW" && order && order.get("OrderRowDetails"))
                    SalesForceEngine.resetDynamicFields(order.get("OrderRowDetails"));

                if (XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order))) {
                    // load the rows from the cart
                    var options = gui.openData;
                    var checkRemovedProductsFlag = false;
                    if (options.cart) {
                        order.set("CODCUSTDELIV", options.codParty);
                        order.set("CODCUSTINV", options.codParty);

                        for (var i = 0; i < options.cart.length; i++) {
                            var item = options.cart[i];

                            var orderItem = {};
                            orderItem["detailEntityName"] = "OrderRow";
                            orderItem["selectorKey"] = CommonEngine.buildProductKey(item.CODART, item.CODDIV);
                            orderItem["parentEntity"] = order;
                            orderItem["newEntity"] = new XEntity({ entityName: 'OrderRow' });
                            orderItem["gui"] = gui;
                            orderItem.newEntity.set("QTYORD", item.qty);
                            orderItem.newEntity.set("GROSSARTAMOUNT", item.PRZVAL);
                            this.applyDataToNewOrderRow(gui, orderItem.newEntity, item.CODART);
                            orderItem.newEntity.isNew = false;
                            gui.setModified(order);
                        }
                    }

                    switch (gui.openMode) {
                        case "NEW":
                            //docFromCache is set to true when navigating back from a link
                            if (!context.gui.docFromCache) {
                                SalesForceEngine.assignCustomer(order);

                                if (order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET && XApp.isEmptyOrWhitespaceString(order.get("CODWHS")))
                                    XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.MISSING_ASSET_WAREHOUSE]") });
                            }

                            if (!options.orderCopy) {
                                this._loadAssortmentLocations(gui, true);
                                this._preLoad(gui, onSuccess, onFailure);
                                this._loadPrevVanLoadRequestProducts(gui);
                                SalesForceEngine.sortWarehouseProducts(gui);

                                this._loadCustAddresses(gui, true);
                            }
                            else {
                                order.set("CODADDR", "");// don t copy 
                                this._loadCustAddresses(gui, true);
                                this._loadAssortmentLocations(gui, false);
                                this._evaluateAssoLocationAtCopy(gui,
                                    function () {
                                        var message = "";
                                        if (self._checkUnavailableLocation(gui)) {
                                            message = UserContext.tryTranslate("[WARNING_LOCATION_UNAVAILABLE]") + "<br/>";
                                        }
                                        self._evaluateArtcodesAtCopy(order, options.originalCopyProducts);

                                        onSuccess();
                                    },
                                    onFailure);
                            }
                            break;
                        default:
                            initialAppliedCnvGroups = new XStore({ entityName: SFConstants.ORDERAPPLIEDCNVGROUP });
                            order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).each(function (oacg) {
                                initialAppliedCnvGroups.add(oacg.clone());
                            });

                            //Apply the new UM conversion factor if it has changed
                            self._recalculateInvoicedQuantities(order, gui.CacheData);

                            if (this._checkUnavailableLocation(gui)) {
                                this._loadAssortmentLocations(gui, true);
                                var unorderableProducts = this._removeNotOrderableProducts(gui);
                                if (unorderableProducts && unorderableProducts.length > 0) {
                                    var unorderables = [];
                                    for (var i = 0; i < unorderableProducts.length; i++)
                                        unorderables.push(unorderableProducts[i].get("CODART") + " " + unorderableProducts[i].get("DESART"));
                                    var message = UserContext.tryTranslate("[WARNING_LOCATION_UNAVAILABLE]") + "<br/>" + UserContext.tryTranslate("[ARTICLES_REMOVED_NOTORDERABLE]") + " : " + "<br/>" + unorderables.join("<br/>");
                                    XUI.showWarnOk({ msg: message });
                                }
                                this._preloadAssortmentForLocation(gui);
                            }
                            else {
                                //asynchronous call 
                                var onResultRemovedProducts = function () {
                                    self._checkForDiscardedOrderRowsBenefits(gui, onResultDiscardedBenefits);
                                };
                                this._loadAssortmentLocations(gui, false);
                                this._removeNotOrderableProducts(gui, onResultRemovedProducts);
                                checkRemovedProductsFlag = true;
                            }
                            //refresh the price list
                            order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                                SalesForceEngine.applyPriceListOnRow(order, row, gui.CacheData);
                            });
                            this._loadCustAddresses(gui, this._checkUnavailableCustAddress(gui) || XApp.isEmptyOrWhitespaceString(order.get("CODADDR")));

                            onSuccess();
                    }

                    order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                        row.splitQuantityFieldValue("QTYORD", row.get("QTYORD"), gui.CacheData);
                        row.splitQuantityFieldValue("WHSBALANCEORD", row.get("WHSBALANCEORD"), gui.CacheData);
                    });

                    if (gui.isEditable())
                        OrderPaymentValidator.validate(order, gui.CacheData);

                    this.reaplyBenefits(order, gui, true);
                    SalesForceEngine.refreshCanvasActions(order, gui.CacheData);

                    // asynchronous call for _checkForDiscardedOrderRowsBenefits
                    var onResultDiscardedBenefits = function () {
                        if (initialAppliedCnvGroups) {
                            self._checkForRemovedCanvass(order, initialAppliedCnvGroups, gui.CacheData);
                        }

                        //rebuild user selected canvass groups hash
                        order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).each(function (appGroup) {
                            if (appGroup.get("NUMROW") != 0) {
                                order.m_usrIndicatedCnvGrp.add("CnvActRangeGroup|" + appGroup.get('IDCNV') + "|" + appGroup.get('CODCNVACT') + "|" + appGroup.get('IDBENGRP') + "|" + appGroup.get('IDCNVRNG'));
                            }
                        });
                    };

                    if (checkRemovedProductsFlag == false)
                        this._checkForDiscardedOrderRowsBenefits(gui, onResultDiscardedBenefits);
                } else {
                    this._loadCustAddresses(gui, false);
                    onSuccess();
                }
            }
            else {
                this.reaplyBenefits(order, gui, true);
                onSuccess();
            }

            XApp.callCust("guiCustomizer", "mobGuiOrder", "postAfterCacheLoad", context);

        } catch (ex) {
            XUI.hideWait();
            onFailure(ex);
        }
    };

    this.reaplyBenefits = function (order, gui, skipApply) {
        gui.CacheData.DiscountApplier = new DiscountApplier.OrderDiscountApplier(order, gui.CacheData);
        SalesForceEngine.calculateAppliableBenefits(order, gui.CacheData, skipApply);
        // If application is online calculate budget balance field
        if (XApp.isOnline()) {
            gui.CacheData.BudgetBalanceValues = new Object();
            this.refreshBalance(order, gui.CacheData, gui);
        }
        else {
            this.setBudgetBalanceToEmpty(order);
        }
    };

    this.displayAppliedCanvass = function (order) {
        var appCnvs = order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP);
        if (appCnvs.getCount() == 0)
            return;

        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            var appBens = row.getSubEntityStore("AppliableBenefit");
            var bens = row.getSubEntityStore(SFConstants.ORDERROWBENEFIT);

            var numRow = row.get("NUMROW");
            var rowAppCnvs = appCnvs.queryBy(function (oacg) {
                return oacg.get("NUMROW") == numRow;
            });

            var codArt = row.get("CODART");
            var artAppCnvs = appCnvs.queryBy(function (oacg) {
                return oacg.get("NUMROW") == 0 && oacg.get("CODART") == codArt;
            });

            var i, n, benAdapter;

            // read-only adapter, for use in view mode
            for (i = 0, n = rowAppCnvs.length; i < n; i++) {
                benAdapter = SalesForceEngine.createRowBenefitFromT102(rowAppCnvs[i], row);
                appBens.add(benAdapter);
            }

            for (i = 0, n = artAppCnvs.length; i < n; i++) {
                var appBen = artAppCnvs[i];
                benAdapter = SalesForceEngine.createRowBenefitFromT102(appBen, row);
                if (bens.findBy(function (ben) { return ben.get("CODSRCREF") == benAdapter.get("Reference"); }) != null) {
                    appBens.add(benAdapter);
                }
            }
        });
    };

    /// <summary>
    /// On entering edit, the canvasses are reapplied.
    /// Warn the user about the canvasses that are no longer valid
    /// and have been unselected
    /// </summary>
    this._checkForRemovedCanvass = function (order, initialAppliedCnvGroups, cacheData) {
        var removedInfo = [];

        var appliedCnvGroups = order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP);

        initialAppliedCnvGroups.each(function (ioacg) {
            if (ioacg.get("NUMROW") != 0)
                return;

            var codCnvAct = ioacg.get("CODCNVACT"),
                 idCnvRng = ioacg.get("IDCNVRNG"),
                 idBenGrp = ioacg.get("IDBENGRP"),
            idPromoAction = ioacg.get("IDPROMOACTION"),
                  codList = ioacg.get("CODLIST"),
                  prgList = ioacg.get("PRGLIST"),
                   prgRow = ioacg.get("PRGROW"),
                   codArt = ioacg.get("CODART");

            var foundOacg = appliedCnvGroups.findBy(function (oacg) {
                return oacg.get("CODCNVACT") == codCnvAct &&
                       oacg.get("IDCNVRNG") == idCnvRng &&
                       oacg.get("IDBENGRP") == idBenGrp &&
                       oacg.get("NUMROW") == 0 &&
                       oacg.get("IDPROMOACTION") == idPromoAction &&
                       oacg.get("CODLIST") == codList &&
                       oacg.get("PRGLIST") == prgList &&
                       oacg.get("PRGROW") == prgRow &&
                       oacg.get("CODART") == codArt;
            });

            if (!foundOacg) {
                if (!XApp.isEmptyOrWhitespaceString(idPromoAction)) {
                    removedInfo.push(idPromoAction + "/" + ioacg.get("DESACTION"));
                }
                else if (!XApp.isEmptyOrWhitespaceString(codList)) {
                    removedInfo.push(codList + "/" + ioacg.get("DESLIST"));
                }
                else {
                    removedInfo.push(codCnvAct + "/" + idCnvRng + "/" + ioacg.get("DESBENGRP"));
                }
            }
        });

        if (removedInfo.length == 0)
            return;

        XUI.showInfoOk({
            title: UserContext.tryTranslate("[MOBORDER.INFO_CANVASSES_REMOVED_ONSTART_EDIT]"),
            msg: removedInfo.join("<br />")
        });

        order.set("ForceTeoCalculation", true);
        order.calculateBenefits(cacheData);
        order.set("ForceTeoCalculation", false);

    };

    this._checkForDiscardedOrderRowsBenefits = function (gui, onResult) {
        var discardMessages = [];
        var cacheData = gui.CacheData;
        var discardedBenefitCollection = cacheData.m_discardedBenefitsManager.getDiscardedBenefits();

        for (var index in discardedBenefitCollection) {
            var discardedBenefits = discardedBenefitCollection[index];
            var reason = discardedBenefits["discardReason"];
            var discardedBenefitObject = discardedBenefits["discardedBenefitObject"];
            for (var benefitPair in discardedBenefitObject) {
                var discardedBenefit = discardedBenefitObject[benefitPair];
                var benefit = discardedBenefit["benefitObject"];
                var codArt = benefit.get("CODART");
                var prodDes = SM1OrderHelper.getDescriptionByArticleCode(codArt, gui.CacheData);

                if (reason == SalesForceNameSpace.OrderErrorCodes.GIFT_ASSORTMENT_MANDATORY)
                    discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.BENEFIT_DISCARDED_GIFT_PROD_NOT_PRESENT_IN_MANDATORY_ASSO]")
                    .replace("@", codArt + " " + prodDes));
                else if (reason == SalesForceNameSpace.OrderErrorCodes.VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE)
                    discardMessages.push(UserContext.tryTranslate("[BENEFIT_DISCARDED_VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE]")
                    .replace("@", codArt + " " + prodDes));
                else if (reason == SalesForceNameSpace.OrderErrorCodes.ARTICLE_OUTSIDE_ORDERABLE_PERIOD)
                    discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.DISCARDED_ORDER_ROW_OUTSIDE_ORDERABLE_PERIOD]")
                    .replace("@", codArt + " " + prodDes));
                else if (reason == SalesForceNameSpace.OrderErrorCodes.NO_CONVERSION_UNIT_AMOUNT_BEN)
                    discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.AMOUNT_BEN_DISCARDED_NO_CONVERSION_UNIT]")
                    .replace("@", codArt + " " + prodDes)
                    .replace("@", UserContext.tryTranslate("[MOB.CNVACTION]"))
                    .replace("@", benefit.get("DESBENGRP")));
                else {
                    if (!XApp.isEmptyOrWhitespaceString(benefit.get("CODLIST"))) {
                        discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.DISCARDED_ORDER_ROW_FROM_SALES_CONDITIONS]")
                                .replace("@", codArt + " " + prodDes)
                            .replace("@", UserContext.tryTranslate("[MOB.DISCLIST]"))
                                .replace("@", benefit.get("DESLIST")));
                    }
                    else if (!XApp.isEmptyOrWhitespaceString(benefit.get("IDPROMOACTION"))) {
                        discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.DISCARDED_ORDER_ROW_FROM_SALES_CONDITIONS]")
                                .replace("@", codArt + " " + prodDes)
                            .replace("@", UserContext.tryTranslate("[MOB.PROMO]"))
                                .replace("@", benefit.get("DESACTION")));
                    }
                    else {
                        discardMessages.push(UserContext.tryTranslate("[MOBGUIORDER.DISCARDED_ORDER_ROW_FROM_SALES_CONDITIONS]")
                                .replace("@", codArt + " " + prodDes)
                            .replace("@", UserContext.tryTranslate("[MOB.CNVACTION]"))
                                .replace("@", benefit.get("DESBENGRP")));
                    }
                }
            }
        }

        if (discardMessages.length != 0) {
            XUI.showInfoOk({
                msg: discardMessages.join("<br/>"),
                onResult: onResult
            });
        }
        //km_discardedBenefitsManager MADY 20190618
        cacheData.m_discardedBenefitsManager.clearBenefitDiscardList();
    };

    /// At Copy check what products are valid
    this._evaluateArtcodesAtCopy = function (order, originalCopyProducts) {
        if (!originalCopyProducts) m_discardedBenefitsManager //km_discardedBenefitsManager MADY 20190618
            return;

        var message = "";
        var removedCodes = new Array();
        var virtualKitProducts = new Array();
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);

        for (var i = 0; i < originalCopyProducts.length; i++) {
            var origCodArt = originalCopyProducts[i];
            var product = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(origCodArt, order.get("CODDIV")));
            var found = orderRows.findBy(function (or) {
                return or.get("CODART") == origCodArt &&
                    or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.MANUALE;
            });
            if (!found) {
                if (product && product.get("FLGVIRTUALKIT"))
                    virtualKitProducts.push(origCodArt + " " + SM1OrderHelper.getDescriptionByArticleCode(origCodArt));
                else
                    removedCodes.push(origCodArt + " " + SM1OrderHelper.getDescriptionByArticleCode(origCodArt));
            }
        }

        if (removedCodes && removedCodes.length > 0)
            message += UserContext.tryTranslate("[ARTICLES_REMOVED_NOTORDERABLE]") + " : " + "<br/>" + removedCodes.join("<br/>") + "<br/>";

        if (virtualKitProducts && virtualKitProducts.length > 0)
            message += UserContext.tryTranslate("[VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE]") + " : " + "<br/>" + virtualKitProducts.join("<br/>");

        if (!XApp.isEmptyOrWhitespaceString(message))
            XUI.showWarnOk({ msg: message });

    };

    /// <summary>
    /// Align copied order with assortment location
    /// </summary>
    this._evaluateAssoLocationAtCopy = function (gui, onSuccess, onFail) {
        if (this._checkUnavailableLocation(gui))
            this._setDefaultAssortmentLocation(gui);

        this._preLoad(gui, onSuccess, onFail);
    };

    this._blockingControlOnOrderConfirmation = function (order, action) {
        var flgOrderConfirmation = false;
        var cannotConfirmOrCloseReasons = [];
        if (order != null && ((SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) && !this._areBatchesValid(order, cannotConfirmOrCloseReasons)) | this._areInvoicedQuantitiesMissing(order, cannotConfirmOrCloseReasons))) {
            cannotConfirmOrCloseReasons = Ext.Array.unique(cannotConfirmOrCloseReasons);
            switch (action) {
                case SalesForceNameSpace.OrderAction.CONFIRM:
                    if (SM1OrderHelper.canOrderBeConfirmed(order.get("CODTYPORD")) && !SM1OrderHelper.canOrderBeClosed(order.get("CODTYPORD"))) {
                        XUI.showMsgBox({
                            title: UserContext.tryTranslate("[ERR_ORDER_CAN_NOT_BE_CONFIRMED]"),
                            msg: cannotConfirmOrCloseReasons.length != 0 ? cannotConfirmOrCloseReasons.join('<br />') : '',
                            icon: "ERR",
                            buttons: 'OK',
                            onResult: Ext.emptyFn
                        });
                        flgOrderConfirmation = true;
                    }
                    break;
                case SalesForceNameSpace.OrderAction.CLOSE:
                    if (SM1OrderHelper.canOrderBeClosed(order.get("CODTYPORD"))) {
                        XUI.showMsgBox({
                            title: UserContext.tryTranslate("[ERR_ORDER_CAN_NOT_BE_CLOSE]"),
                            msg: cannotConfirmOrCloseReasons.length != 0 ? cannotConfirmOrCloseReasons.join('<br />') : '',
                            icon: "ERR",
                            buttons: 'OK',
                            onResult: Ext.emptyFn
                        });
                        flgOrderConfirmation = true;
                    }
                    break;
            }
        }
        return flgOrderConfirmation;
    };

    // Check if the batches are valid
    this._areBatchesValid = function (order, cannotConfirmOrCloseReasons) {

        var self = this;
        var areBatchesValid = true;
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            //exclude zero quantity rows, they will be removed
            if (self._isRemovableZeroQtyRow(order, row))
                return;

            var product = row.getProduct();
            if (product && product.get("FLGBATCHNUMBER") != 0) {
                var batches = row.getSubEntityStore(SFConstants.ORDERROWBATCH);
                if (batches.getCount() == 0) {
                    areBatchesValid = false;
                    cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_BATCH_QTYORD]"));
                    return;
                }

                var qtyOrdSum = 0;
                var qtyInvSum = 0;

                batches.each(function (batch) {
                    qtyOrdSum += batch.get("QTYORD");
                    qtyInvSum += batch.get("QTYINV");
                    if ((batch.get("QTYORD") != 0 || batch.get("QTYINV") != 0) && batch.isUnsellable()) {
                        areBatchesValid = false;
                        cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_BATCH_UNSELLABLE]"));
                        return;
                    }
                });

                if (row.get("QTYORD") != qtyOrdSum) {
                    areBatchesValid = false;
                    cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_BATCH_QTYORD]"));
                }
                if (row.get("QTYINV") != qtyInvSum) {
                    areBatchesValid = false;
                    cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_BATCH_QTYINV]"));
                }
            }
        });

        return areBatchesValid;
    };

    this._areInvoicedQuantitiesMissing = function (order, cannotConfirmOrCloseReasons) {
        var self = this;
        var areInvoicedQuantitiesMissing = false;

        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            //exclude zero quantity rows, they will be removed
            if (self._isRemovableZeroQtyRow(order, row))
                return;

            if (row.get("QTYORD") > 0 && row.get("QTYINV") == 0) {
                areInvoicedQuantitiesMissing = true;
                cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_MISSING_QTYINV_VALUE]"));
                return;
            }

            var product = row.getProduct();
            if (product && product.get("FLGBATCHNUMBER") != 0) {
                var batches = row.getSubEntityStore(SFConstants.ORDERROWBATCH);

                batches.each(function (batch) {
                    if (batch.get("QTYORD") > 0 && batch.get("QTYINV") == 0) {
                        areInvoicedQuantitiesMissing = true;
                        cannotConfirmOrCloseReasons.push(UserContext.tryTranslate("[MOBGUIORDER.ERR_MISSING_QTYINV_VALUE]"));
                        return;
                    }
                });
            }
        });
        return areInvoicedQuantitiesMissing;
    };

    //checks whether free merchandise multidelivery quantities are valid
    //if not, builds the message to be displayed
    this._checkMultiDeliveryFreeMerchandise = function (gui, cannotConfirmMsg) {
        var hasErrors = false;
        var order = gui.getDocument();

        order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {
            var result = SalesForceEngine.validateMultiDeliveryFreeMerchandise(orderRow, gui.CacheData);
            if (!result.errCode)
                return;

            var qtyMsgs = [];
            for (var codSrcRef in result.multiples) {
                var qtyInfo = result.multiples[codSrcRef];
                qtyMsgs.push(qtyInfo.QTYEACH + " " + UserContext.decode("UMART", qtyInfo.UMEACH));
            };

            cannotConfirmMsg.push(
                UserContext.tryTranslate("[MOBGUIORDER.PRODUCT]") + " " +
                orderRow.get("DESART") + " " +
                UserContext.tryTranslate("[MOBGUIORDER.MUST_ORDER_MULTIPLE]") +
                qtyMsgs.join(", "));
            hasErrors = true;
        });

        return hasErrors;
    };

    // Print the invoice on user request
    this._printInvoice = function () {
        XUI.showYESNO({
            icon: 'INFO',
            title: UserContext.tryTranslate("[PRINT_INVOICE_TITLE]"),
            msg: UserContext.tryTranslate("[PRINT_INVOICE]"), onResult: function (msg) {
                if (msg == "YES") {
                    // The system will run the touch invoice print
                }

                XHistory.back();
                XUI.hideWait();
            }
        });
    };

    this._setCloseButtonStatus = function (gui, orderStatus, codTypOrd) {
        var custContext = {
            gui: gui,
            codStatus: orderStatus,
            codTypOrd: codTypOrd,
            cancel: false
        };

        gui.callCust("beforeSetCloseButtonStatus", custContext);
        if (custContext.cancel)
            return;

        if (gui.closeButton) {
            // disabled if in View mode
            var isEnabled = (gui.openMode != 'VIEW');

            if (UserContext.isFullOfflineMode())
                isEnabled = isEnabled && (XApp.isOnline() || !SM1OrderHelper.managedOnlyOnline(codTypOrd));
            else
                isEnabled = isEnabled && XApp.isOnline();

            isEnabled = isEnabled && ((codTypOrd == SalesForceNameSpace.OrderCTORD.LOAD ||
                                       codTypOrd == SalesForceNameSpace.OrderCTORD.LOADINTEGRATION) ?
                                       orderStatus == SalesForceNameSpace.SM1OrderStatus.VALIDO : true);

            isEnabled = isEnabled && (
                     UserContext.checkRight("SM1ORDER", "RIGHTS", "CLOSEORDERSTATUS")
                     || UserContext.checkRight("SM1ORDER", "CUSTOMIZATION", "CLOSEORDERSTATUS_" + gui.getDocument().get("CODTYPORD"))
            );

            gui.closeButton.enabled = isEnabled;
            app.viewport.refreshControllerToolbarContextualButtons();
        }

        gui.callCust("afterSetCloseButtonStatus", custContext);
    };

    this._setConfirmButtonStatus = function (gui) {
        if (gui.confirmButton) {
            var codTypOrd = gui.getDocument().get("CODTYPORD"); // selecting codtypord from the GUI/document object

            var isEnabled = (gui.openMode != 'VIEW');

            // enable button if generic grants (CONFIRMORDERSTATUS) or order type grants (CONFIRMORDERSTATUS_<ORDERTYPE> are enabled)
            var isEnabled = isEnabled && (
                                UserContext.checkRight("SM1ORDER", "RIGHTS", "CONFIRMORDERSTATUS")
                                || UserContext.checkRight("SM1ORDER", "CUSTOMIZATION", "CONFIRMORDERSTATUS_" + codTypOrd)
                            );

            if (!SM1OrderHelper.isAnInvoice(codTypOrd)) {
                if (UserContext.isFullOfflineMode()) {
                    isEnabled = isEnabled && (XApp.isOnline() || !SM1OrderHelper.managedOnlyOnline(codTypOrd));
                } else {
                    isEnabled = isEnabled && XApp.isOnline();
                }
            }

            gui.confirmButton.enabled = isEnabled; // final disable/enable
            app.viewport.refreshControllerToolbarContextualButtons();
        }
    };

    // preload orders and assorments
    this._preLoad = function (gui, onSuccess, onFail) {
        var order = gui.getDocument();

        //preload from assortment
        if (SM1OrderHelper.canOrderPreloadAssortment(order.get("CODDIV"), order.get("CODTYPORD")) &&
            gui.CacheData.m_cacheAssortments != null && !gui.CacheData.m_cacheAssortments.isEmpty()) {
            this._preloadAssortment(gui);
            onSuccess();
            return;
        }

        //preload assets on customer
        var codParty = !XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE")) ? order.get("CODCUSTSALE") : order.get("CODCUSTDELIV");
        if (SM1OrderHelper.isAssetPickup(order.get("MACROTYPE"), order.get("CODTYPORD")) &&
            gui.CacheData.m_customerAssetBalances != null) {
            this._preloadCustomerAssets(gui);
            onSuccess();
            return;
        }

        //preload products from current warehouse
        if (SM1OrderHelper.isPreloadFromWarehouseEnabled(order.get("CODTYPORD")) &&
            gui.CacheData.m_whsBalances != null && gui.CacheData.m_whsBalances[order.get("CODWHS")]) {
            var currentWhsBalances = gui.CacheData.m_whsBalances[order.get("CODWHS")].OrdProdWhsBalances;

            var found = false;
            //check if products are present in warehouse
            for (var i in currentWhsBalances) {
                if (SalesForceEngine.canBePreloadedFromWarehouse(order, currentWhsBalances[i])) {
                    found = true;
                    break;
                }
            }

            if (found) {
                this._preloadFromWarehouse(gui);
                onSuccess();
                return;
            }
        }


        //preload from previous order orders
        if (SM1OrderHelper.isPreLoadPrevOrderRequired(order.get("CODDIV"), order.get("CODTYPORD"))) {
            try {
                var self = this;
                var preLoadPrevOrders = OrderParameters.getInstance(gui.getDocument().get("CODTYPORD")).getPreloadPrevOrders();
                var orderClone = gui.getDocument().clone();
                this._clearExtraEntities(orderClone);
                SalesForceEngine.getLatestOrderedProducts(orderClone, preLoadPrevOrders, gui.CacheData,
                    function (preloadOrder) {
                        if (preloadOrder) {
                            preloadOrder = new XEntity({ entityName: "SM1Order", data: preloadOrder.PreloadedOrder });
                            SalesForceEngine.loadLatestOrderedProducts(gui.getDocument(), preloadOrder, gui.CacheData);
                            self.reaplyBenefits(gui.getDocument(), gui, true);
                            self.refreshAll(gui, true);
                        }
                        onSuccess();
                    },
                    onFail);
            }
            catch (e) {
                XLog.logEx(e);
            }

        }
        else {
            onSuccess();
        }
    };

    this._preloadFromWarehouse = function (gui) {
        XLog.logInfo("Preloading products from Warehouse");

        var order = gui.getDocument();
        var codTypOrd = order.get("CODTYPORD");
        var rejectedCodTypRow = SalesForceEngine.preloadFromWarehouse(order, gui.CacheData);

        if (!XApp.isEmptyOrWhitespaceString(rejectedCodTypRow)) {
            var warn = UserContext.tryTranslate("[MOBGUIORDER.ROW_TYPE_NOT_SUPPORTED]");
            warn = warn.replace("@", rejectedCodTypRow + " " + UserContext.decode("TYROW", rejectedCodTypRow));
            warn = warn.replace("@", codTypOrd + " " + UserContext.decode("CTORD", codTypOrd));
            XUI.showWarnOk({ msg: warn });
        }
    };

    this._loadPrevVanLoadRequestProducts = function (gui) {
        XLog.logInfo("Preloading products from previous requests");

        var order = gui.getDocument();
        var codTypOrd = order.get("CODTYPORD");
        var defaultRowType = this._getDefaultOrderRowType(order);
        var cacheData = gui.CacheData;

        if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSLOAD ||
           !SM1OrderHelper.isPreloadFromWarehouseEnabled(order.get("CODTYPORD")) ||
           !this._isRequestedQtyordVisible(order))
            return;

        if (!cacheData.m_calculationRequestedQty || !cacheData.m_calculationRequestedQty[order.get("DelivCustAndDateKey")])
            return;

        var prodNav = SalesForceEngine.getOrderableProductsNav(order.get("CODTYPORD"));
        var products = cacheData.m_calculationRequestedQty[order.get("DelivCustAndDateKey")].OrdProdRequestedQty;
        var articlesToAdd = [];

        for (var productKey in products) {
            // if the order contains already the row(from copy order functionality) then don't add it anymore
            var rowAlreadyPresent = order.getSubEntityStore(SFConstants.ORDERROW).findBy(function (row) {
                return row.getProductKey() == productKey;
            });
            if (rowAlreadyPresent)
                continue;

            var articleRow = prodNav.findByKey(productKey);
            if (!articleRow) {
                XLog.logInfo("\tProduct not present in navigator for codart: " + productArtCode);
                continue;
            }
            articlesToAdd.push(articleRow);
        }

        SalesForceEngine.sortProducts(articlesToAdd);

        articlesToAdd.forEach(function (article) {
            var orderRowInfo = order.AddOrderRow(article, defaultRowType, "", 0, SalesForceNameSpace.OrderBESRC.MANUALE, cacheData);
        });
    };

    // Load assets present at the customer location
    this._preloadCustomerAssets = function (gui) {
        var self = this;
        var startDate = new Date();
        XLog.logInfo("Preloading assets found at customer location");

        var order = gui.getDocument();
        var codTypOrd = order.get("CODTYPORD");
        var defaultRowType = this._getDefaultOrderRowType(order);
        var codParty = !XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE")) ? order.get("CODCUSTSALE") : order.get("CODCUSTDELIV");

        var assetCache = gui.CacheData.m_customerAssetBalances;
        if (XApp.isEmptyOrWhitespaceString(codParty) || !assetCache || assetCache.isEmpty()) {
            XLog.logWarn("Asset balance cache empty, could not load assets found at the customer");
            return;
        }

        var prodNav = SalesForceEngine.getOrderableProductsNav(order.get("CODTYPORD"));
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);
        var discardedProductsCollection = new Array();

        assetCache.each(function (asset) {

            var articleRow = prodNav.findByKey(CommonEngine.buildProductKey(asset.CODART, UserContext.CodDiv));

            // Skip products not available
            if (!articleRow) {
                XLog.logInfo("\tProduct not present in navigator for codart: " + asset.CODART);
                return;
            }

            var rowAlreadyPresent = orderRows.findBy(function (row) {
                return row.get("CODART") == asset.CODART && row.get("CODDIV") == asset.CODDIV && row.get("NUMORDRESO") == asset.RESERVATIONORDER;
            });

            var orderRow = null;
            var orderRowInfo = null;

            // check if row already added
            if (rowAlreadyPresent) {
                orderRow = rowAlreadyPresent;
            }
            else {
                orderRowInfo = order.AddOrderRow(articleRow, defaultRowType, asset.UM, 0, SalesForceNameSpace.OrderBESRC.MANUALE, gui.CacheData);
                orderRow = orderRowInfo.orderRow;
            }

            if (orderRow) {
                // add order rows with corresponding batches
                orderRow.set("NUMORDRESO", asset.RESERVATIONORDER);

                var batches = orderRow.getSubEntityStore(SFConstants.ORDERROWBATCH);
                if (!batches)
                    return;

                var batch = batches.findBy(function (batch) {
                    return batch.get("IDBATCH") == asset.IDBATCH;
                });

                if (!XApp.isEmptyOrWhitespaceString(asset.IDBATCH) && !batch) {
                    var batch = new XEntity({ entityName: SFConstants.ORDERROWBATCH });

                    batch.isNew = true;
                    batch.set("CODUSR", orderRow.get("CODUSR"));
                    batch.set("NUMORD", orderRow.get("NUMORD"));
                    batch.set("NUMROW", orderRow.get("NUMROW"));
                    batch.set("IDBATCH", asset.IDBATCH);

                    batches.add(batch);
                }
            }

            if (orderRowInfo && orderRowInfo.errCode && orderRowInfo.errCode != 0) {
                self._addDiscardedProductsToList(articleRow, orderRowInfo.errCode, discardedProductsCollection);
            }
        });

        SalesForceEngine.refreshWhsBalance(order, gui.CacheData);

        if (discardedProductsCollection.length > 0) {
            self._showRemovedProductsMessage(discardedProductsCollection);
        }

        SM1OrderHelper._showTime("_preloadCustomerAssets", false, startDate);
    };

    this._preloadAssortmentForLocation = function (gui) {
        var order = gui.getDocument();

        //preload from assortment
        if (SM1OrderHelper.canOrderPreloadAssortment(order.get("CODDIV"), order.get("CODTYPORD")) &&
            gui.CacheData.m_cacheAssortments != null && !gui.CacheData.m_cacheAssortments.isEmpty()) {
            this._preloadAssortment(gui);
        }
    };

    this._preloadAssortment = function (gui) {
        var context = {
            gui: gui,
            cancel: false
        };

        gui.callCust("beforePreloadAssortment", context);
        if (context.cancel) {
            return;
        }

        var self = this;
        var startDate = new Date();
        XLog.logInfo("Preloading Assortment");
        var order = gui.getDocument();
        var assoCache = gui.CacheData.m_cacheAssortments;
        var defaultType = this._getDefaultOrderRowType(order);
        if (!assoCache || assoCache.isEmpty()) {
            XLog.logWarn("Assortment cache empty, could not load products from assortment");
            return;
        }

        var prodNav = SalesForceEngine.getOrderableProductsNav(order.get("CODTYPORD"));
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);
        var discardedProductsCollection = new Array();

        var assortmentLocations = this._getAssortmentLocations(gui.CacheData);

        var sortable = [];
        assoCache.each(function (assoRow) {
            sortable.push(assoRow);
        });
        sortable.sort(function (a, b) { return a.PRGCLIENTE - b.PRGCLIENTE; });

        sortable.forEach(function (assoRow) {
            if (!XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE"))) {
                //add only the products from the selected location
                if (!XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")) && (!Ext.Array.contains(assortmentLocations, order.get("CODLOCATION")) || assoRow.CODLOCATION != order.get("CODLOCATION")))
                    return;
                    //add only the products having no location
                else if (XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")) && (!Ext.Array.contains(assortmentLocations, SFConstants.EMPTYCODLOCATION) || assoRow.CODLOCATION != SFConstants.EMPTYCODLOCATION))
                    return;
            }

            var similarRow = orderRows.getIndexedCollection().findBy(assoRow.CODART);

            if (similarRow) {
                XLog.logInfo("\tOrder already contains row for codart: " + assoRow.CODART, true);
                return;
            }

            var artRow = prodNav.findByKey(CommonEngine.buildProductKey(assoRow.CODART, assoRow.CODDIV));
            if (!artRow) {
                XLog.logInfo("\tProduct not present in navigator for codart: " + assoRow.CODART);
                return;
            }

            if (!SM1OrderHelper.checkProdInWarehouse(order, assoRow.CODART, defaultType, gui.CacheData)) {
                XLog.logInfo("\tProduct " + assoRow.CODART + " is not present in warehouse: " + order.get("CODWHS"), true);
                return;
            }

            var orderRowInfo = order.AddOrderRow(artRow, defaultType, "", 0, SalesForceNameSpace.OrderBESRC.MANUALE, gui.CacheData);

            if (orderRowInfo.errCode) {
                self._addDiscardedProductsToList(artRow, orderRowInfo.errCode, discardedProductsCollection);
            }

            if (orderRowInfo.orderRow) {
                SalesForceEngine.addKitArticles(order, orderRowInfo.orderRow, gui.CacheData);
            }
        });

        if (discardedProductsCollection.length > 0) {
            self._showRemovedProductsMessage(discardedProductsCollection, true);
        }

        gui.callCust("afterPreloadAssortment", context);

        SM1OrderHelper._showTime("_preloadAssortment", false, startDate);
    };

    // Default order row type for the given order type
    /*
    isReturn: true if the order row was added from the return or empty selectors
    */
    this._getDefaultOrderRowType = function (order, flgGift, isReturn) {
        var codTypRow = "";
        var codTypOrd = order.get("CODTYPORD");
        var codDiv = order.get("CODDIV");
        var availableRowTypes = SM1OrderHelper.getOrderRowTypes(codTypOrd, codDiv);

        if (isReturn && (this._isAddReturn || this._isAddEmpty)) {
            //invoked from add return / add empty product selectors
            if (this._isAddEmpty) {
                codTypRow = OrderParameters.getInstance(codTypOrd).getDefaultEmptyRowType();
            }
            else {
                var returnRowType = OrderParameters.getInstance(codTypOrd).getDefaultReturnRowType();
                //we need to check whether the default row type
                //is enabled for current order type
                //only for returns, not also for empty products
                if (Ext.Array.filter(availableRowTypes, function (conf) { return conf.CODTYPROW == returnRowType; }).length > 0)
                    codTypRow = returnRowType;
            }
        }
        else {
            codTypRow = SM1OrderHelper.getDefaultOrderRowType(codTypOrd, codDiv, availableRowTypes);
        }

        //Enh 39923 - For order marcotype <> 0 (sale): don't set the default order row type imposed in some cases by the product master data
        //make sure that the order row macrotype is gift for gift products
        if (flgGift && order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES
            && SalesForceEngine.getMacroType(codTypRow) != SalesForceNameSpace.OrderRowMacroType.GIFT) {
            codTypRow = isReturn ? "" : SalesForceNameSpace.OrderTYROW.getGiftRowType(codDiv, codTypOrd);
        }

        return codTypRow;
    };

    this._getConfirmOrderStatus = function (order, checkAnomalies, numberOfAnomalies) {
        var status;

        if (SM1OrderHelper.isADelivery(order.get("CODTYPORD"))) {
            status = SalesForceNameSpace.SM1OrderStatus.DELIVERED;
        }
        else if (SM1OrderHelper.isAnInvoice(order.get("CODTYPORD"))) {
            status = SalesForceNameSpace.SM1OrderStatus.INVOICED;
        }
        else if ((!checkAnomalies && !numberOfAnomalies) || (checkAnomalies && numberOfAnomalies == 0)) {
            status = SalesForceNameSpace.SM1OrderStatus.VALIDO;
        }

        return status;
    };

    this.validateEntity = function (detailContext) {

        if (XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(detailContext.gui.getDocument())) || detailContext.gui.isEditable()) {
            switch (detailContext.entityName) {
                case SFConstants.ORDERROW:
                    var orderRow = detailContext.entity;
                    var order = detailContext.gui.getDocument();

                    //special price benefit can be given only to sales rows (@27697)
                    orderRow._zeroPriceValid = orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.SALES ?
                        this._validatePriceZero(detailContext.gui, orderRow) : true;

                    if (orderRow._zeroPriceValid == false ||
                        XApp.isEmptyOrWhitespaceString(orderRow.get("CODTYPROW")) ||
                        XApp.isEmptyOrWhitespaceString(orderRow.get("CODART")) ||
                        orderRow._codArtValid == false ||
                        orderRow._umOrdValid == false ||
                                    !this._validateBenefitQtyOrd(detailContext.gui, orderRow) ||
                        orderRow.isWhsBalanceExceeded("QTYORD") ||
                        orderRow.isWhsBalanceExceeded("QTYINV")) {
                        detailContext.setFieldsStatus();
                        //if the PRZSPEC field is not in the configuration, the error won't be shown when calling setFieldStatus. Show it here
                        this._checkZeroPriceValid(orderRow);
                        return false;
                    }

                    var orderRowType = orderRow.get("CODTYPROW");
                    var parentOrder = detailContext.gui.getDocument();
                    var codArt = orderRow.get("CODART");

                    if (XApp.isEmptyOrWhitespaceString(orderRowType))
                        return false;

                    // Product is in warehouse validation.
                    if (!SM1OrderHelper.checkProdInWarehouse(parentOrder, codArt, orderRowType, detailContext.gui.CacheData))
                        return false;

                    // Multiple rows for the same product validation.
                    if (SalesForceEngine.countManualRowsPerProd(parentOrder, codArt, orderRowType, orderRow.get("CODSRC")) > 1) {
                        return false;
                    }

                    //batches not valid?
                    var order = detailContext.gui.getDocument();
                    if (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD"))) {
                        var self = this;
                        var invalidBatch = orderRow.getSubEntityStore(SFConstants.ORDERROWBATCH).findBy(function (batch) {
                            return !self._validateBatch(batch, orderRow, order);
                        });
                        if (invalidBatch != null)
                            return false;
                    }

                    //Validate CODQTYMODCAUSE
                    if (!this._validateCodQtyModCauseField(order, orderRow))
                        return false;

                    //Validate CODQTYREJCAUSE
                    if (!this._validateCodQtyRejCauseField(order, orderRow))
                        return false;

                    break;
                case SFConstants.ORDERROWBATCH:
                    return this._validateBatch(detailContext.entity, detailContext.parentCtrl.entity, detailContext.gui.getDocument());
            }

        }
        return true;
    };

    this._validateBatch = function (batch, orderRow, order) {
        var preloadedBatches = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"));

        var isExpDateValid = (XApp.isEmptyDate(batch.get("DTEEXPIRE")) && order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET) ||
            ((!XApp.isEmptyDate(batch.get("DTEEXPIRE")) || order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET) &&
            ((preloadedBatches && !batch.isNew) || batch.get("DTEEXPIRE") >= this._getMinBatchExpDate(order.get("CODTYPORD"))));

        var isIdBatchValid = !XApp.isEmptyOrWhitespaceString(batch.get("IDBATCH")) &&
            !orderRow.containsIdBatch(batch.get("IDBATCH"), batch);

        var areQtiesValid = SalesForceEngine.isBatchQtyValueValid("QTYORD", batch, orderRow, order) &&
            SalesForceEngine.isBatchQtyValueValid("QTYINV", batch, orderRow, order);

        return isExpDateValid && isIdBatchValid && areQtiesValid;
    };

    // check if user must input special price because there is not price list present
    this._validatePriceZero = function (gui, orderRow) {
        var codTypOrd = gui.getDocument().get("CODTYPORD");

        if (orderRow.getProduct().get("FLGVIRTUALKIT"))
            return true;

        if (XApp.isEmptyOrWhitespaceString(orderRow.get("CODART")) ||
            orderRow._codArtValid == false ||
            OrderParameters.getInstance(codTypOrd).getPriceZeroAllowed()) {
            return true;
        }

        var noListAllowed = OrderParameters.getInstance(codTypOrd).getNoListAllowed();
        var noListAllowedGift = OrderParameters.getInstance(codTypOrd).getNoListAllowedGiftRow();

        var priceList = SalesForceEngine.getPriceListForRow(gui.getDocument(), orderRow, gui.CacheData);
        var orderRowMacroType = SalesForceEngine.getMacroType(orderRow.get("CODTYPROW"));
        if (!priceList && orderRow.get("PRZSPEC") == 0 && orderRow.get("QTYORD") > 0 &&
            ((noListAllowed && orderRowMacroType == SalesForceNameSpace.OrderRowMacroType.SALES) || (noListAllowedGift && orderRowMacroType == SalesForceNameSpace.OrderRowMacroType.GIFT) ||
            orderRowMacroType == SalesForceNameSpace.OrderRowMacroType.RETURN || orderRowMacroType == SalesForceNameSpace.OrderRowMacroType.WHSLOAD || orderRowMacroType == SalesForceNameSpace.OrderRowMacroType.WHSUNLOAD)) {
            return false;
        }

        return true;
    };

    this._checkZeroPriceValid = function (orderRow) {
        if (orderRow._zeroPriceValid == false && orderRow.get("PRZSPEC") == 0) {
            orderRow._zeroPriceValid = true;
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.PRICE_MANDATORY_BECAUSE_NO_LIST_PRESENT]") });
            return false;
        }
        return true;
    };

    //check that QTYORD of an order row added by a canvass is within range
    this._validateBenefitQtyOrd = function (gui, orderRow, qtyOrd) {
        if (!qtyOrd) {
            qtyOrd = orderRow.get("QTYORD");
        }

        if (orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.GIFT) {
            if (orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.CANVAS) {

                var numRow = orderRow.get("NUMROW");
                delete this._cnvQtyOrd[numRow];

                var ben = SalesForceEngine.findGroupBenefitByKey(gui.CacheData.m_canvassCollection, orderRow.get("CODSRCREF"));
                if (!ben)
                    return true;

                var maxVal = ben.GiftMaxQuantity.getByKey(orderRow.get("CODART"));
                if (Ext.isNumber(maxVal) && qtyOrd > maxVal) {
                    this._cnvQtyOrd[numRow] = qtyOrd;
                    return false;
                }

                var minVal = ben.GiftMinQuantity.getByKey(orderRow.get("CODART"));
                if (minVal == undefined)
                    minVal = 0;
                else
                    minVal = Math.max(0, minVal);
                if (Ext.isNumber(minVal) && minVal > qtyOrd) {
                    this._cnvQtyOrd[numRow] = qtyOrd;
                    return false;
                }
            }
            else if (orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.ANAGRAFICA || orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.PROMOTION) {
                var ben = orderRow.getSubEntityStore(SFConstants.ORDERROWPARENTBENEFIT).getAt(0);
                if (ben && (ben.get("QTYBENMIN") > qtyOrd || ben.get("QTYBENMAX") < qtyOrd))
                    return false;
            }
        }

        return true;
    };

    this._validateQtyOrdRemainder = function (orderRow, newVal, cacheData) {
        var order = orderRow.getParentEntity();
        var product = orderRow.getProduct();
        var umInteger = OrderParameters.getInstance(order.get("CODTYPORD")).getUmInteger();
        var umRemainder = OrderParameters.getInstance(order.get("CODTYPORD")).getUmRemainder();

        var productConversionUnit = CommonEngine.getProductConversionUnit(product.get("CODART"), product.get(umInteger), product.get(umRemainder), cacheData);

        if (productConversionUnit && (productConversionUnit.DIRECTCONVERSION ? productConversionUnit.VALCONVFACT <= newVal : productConversionUnit.VALCONVFACTREV <= newVal)) {
            return UserContext.tryTranslate("[MOBGUIORDER_QTYORDREMAINDER_INVALID]") + (productConversionUnit.DIRECTCONVERSION ? productConversionUnit.VALCONVFACT : productConversionUnit.VALCONVFACTREV);
        }

        return "";
    };

    this._validateDeliveryQtyOrd = function (orderRow, newVal) {
        var order = orderRow.getParentEntity() || orderRow.newParent;
        if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) &&
            SM1OrderHelper.canOnlyReduceQtyOrd(order.get("CODTYPORD")) &&
            newVal > orderRow.get("QTYORDORIG")) {
            return UserContext.tryTranslate("[MOBGUIORDER.CAN_ONLY_REDUCE_QTYORD]");
        }

        return "";
    };

    this._validateFreeMerchandiseMultiQtyDeliv = function (gui, orderRow, fieldName) {
        var result = SalesForceEngine.validateMultiDeliveryFreeMerchandise(orderRow, gui.CacheData);
        if (!result.errCode)
            return true;

        for (var codSrcRef in result.multiples) {
            if (Ext.Array.contains(result.multiples[codSrcRef].invalidQtys, fieldName))
                return false;
        }

        return true;
    };

    this._validateDuplicateVirtualKitComponents = function (orderRow, orderRowType, cacheData) {
        var order = orderRow.getParentEntity() || orderRow.newParent;

        if (!SM1OrderHelper.isVirtualKit(orderRow))
            return;

        if (!SM1OrderHelper.isCheckOfMultipleRowsPerProdRequired(order.get("CODTYPORD")))
            return;

        var kitComponentParts = SalesForceEngine.retrieveKitArticles(orderRow, cacheData);
        if (!kitComponentParts || kitComponentParts.length == 0)
            return;

        for (i = 0; i < kitComponentParts.length; i++) {
            matchRow = order.getSubEntityStore(SFConstants.ORDERROW).findBy(function (or) {
                return or.get("CODART") == kitComponentParts[i].get("CODARTSON") && or.get("CODTYPROW") == orderRowType &&
                    or.get("NUMROWKITREF") == 0 && or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.MANUALE;
            });
            if (matchRow)
                return UserContext.tryTranslate("[MOBGUIORDER.VIRTUAL_KIT_COMPONENT_ALREADY_PRESENT]").replace("@", matchRow.get("DESART"));
        }
    };

    /// If price list is not mandatory, a price has to be specified
    this._checkSpecialPricePresent = function (gui) {
        var missingSpecialPrice = [];
        var self = this;

        gui.getDocument().getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            if (row.get("CODSRC") != SalesForceNameSpace.OrderBESRC.CANVAS && !self._validatePriceZero(gui, row)) {
                missingSpecialPrice.push(row.get("CODART") + " " + row.get("DESART"));
            }
        });

        return missingSpecialPrice;
    };

    this.validateDocument = function (gui) {
        var self = this;
        var order = gui.getDocument();

        var isIbanValid = true;
        if (OrderPaymentValidator.PaymentFieldsStatus.CODIBAN.mandatory &&
            XApp.isEmptyOrWhitespaceString(order.get("CODIBAN"))) {
            isIbanValid = false;
        }

        delete gui.errorReports["WHSCHK"];
        delete gui.errorReports["CNV_QTYORD"];
        delete gui.errorReports["WHSBALANCE"];
        delete gui.errorReports["CODQTYMODCAUSE"];
        delete gui.errorReports["CODQTYREJCAUSE"];

        // Offline mode: check products that are not present in the warehouse!
        var allProdsInWhs = true;
        if (!XApp.isOnline() && SM1OrderHelper.isWarehouseCheckRequired(order.get("CODTYPORD"))) {

            var row = order.getSubEntityStore(SFConstants.ORDERROW).findBy(function (or) {
                return !SM1OrderHelper.checkProdInWarehouse(order, or.get("CODART"), or.get("CODTYPROW"), gui.CacheData);
            });

            if (row != null) {
                allProdsInWhs = false;
                gui.errorReports["WHSCHK"] = { caption: UserContext.tryTranslate("[MOBGUIORDER_OFFLINE_PRODUCTS_NOTPRESENT_INWAREHOUSE]") };
            }
        }

        var cnvQtyValid = true, whsQtyValid = true, codQtyModCauseValid = true, codQtyRejCauseValid = true;
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {

            if (codQtyModCauseValid && !self._validateCodQtyModCauseField(order, orderRow)) {
                codQtyModCauseValid = false;
                gui.errorReports["CODQTYMODCAUSE"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.INVALID_CODQTYMODCAUSE]") };
            }

            if (codQtyRejCauseValid && !self._validateCodQtyRejCauseField(order, orderRow)) {
                codQtyRejCauseValid = false;
                gui.errorReports["CODQTYREJCAUSE"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.INVALID_CODQTYREJCAUSE]") };
            }

            if (cnvQtyValid && self._cnvQtyOrd[orderRow.get("NUMROW")]) {
                cnvQtyValid = false;
                gui.errorReports["CNV_QTYORD"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.INVALID_CNV_QTYORD]") };
            }
            if (whsQtyValid && (orderRow.isWhsBalanceExceeded("QTYORD") || orderRow.isWhsBalanceExceeded("QTYINV"))) {
                whsQtyValid = false;
                gui.errorReports["WHSBALANCE"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.EXCEEDED_WHS_BALANCE]") };
            }
            //break the loop when both cnvQtyValid, or whsQtyValid are false OR codQtyModCauseValid is false OR codQtyRejCauseValid is false
            return codQtyModCauseValid && codQtyRejCauseValid && (cnvQtyValid || whsQtyValid);
        });

        var invalidBatch = this._orderHasInvalidBatch(order);
        if (invalidBatch) {
            gui.errorReports["WHSBALANCE"] = { caption: UserContext.tryTranslate("[MOBGUIORDER.EXCEEDED_WHS_BALANCE]") };
        }

        // Validate DTEDELIV2 , 3 , 4 and 5 fields
        var dteDelivOptValid = this._validateCustomDate(gui, order, order.get("DTEDELIV2"), order.get("DTEDELIV2"), "DTEDELIV", "DTEDELIV3", false) &&
            this._validateCustomDate(gui, order, order.get("DTEDELIV3"), order.get("DTEDELIV3"), "DTEDELIV2", "DTEDELIV4", false) &&
            this._validateCustomDate(gui, order, order.get("DTEDELIV4"), order.get("DTEDELIV4"), "DTEDELIV3", "DTEDELIV5", false) &&
            this._validateCustomDate(gui, order, order.get("DTEDELIV5"), order.get("DTEDELIV5"), "DTEDELIV4", "", false);

        delete gui.errorReports["CODTYPORD"];
        var canHandlerOrder = SalesForceEngine.canHandleOrder(order.get("CODTYPORD"));
        if (!canHandlerOrder.returnValue)
            gui.errorReports["CODTYPORD"] = { caption: canHandlerOrder.message };

        return Object.keys(gui.errorReports).length == 0 && allProdsInWhs && cnvQtyValid && whsQtyValid && isIbanValid && !invalidBatch &&
            !XApp.isEmptyOrWhitespaceString(order.get("CODTYPORD")) &&
            dteDelivOptValid && canHandlerOrder.returnValue && codQtyModCauseValid && codQtyRejCauseValid;
    };

    //Cancel order and save
    this.doCancelOrder = function (gui) {
        var doc = gui.getDocument();
        doc.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.ANNULLATO);
        this._setCloseButtonStatus(gui, doc.get("CODSTATUS"), doc.get("CODTYPORD"));
        doc.set("CODSTATUSMAN", "");
        //Extension level flag tested in preSaveDocument
        this._isCancellingOrder = true;

        this.saveOrder(gui);
    };

    this.saveOrder = function (gui, checkSignature, action) {
        var _gui = gui;
        var self = this;
        var _checkSignature = checkSignature;
        var _action = action;
        gui.saveDocNoConfirmation(function () {
            var successCallback = function () {
                if (_checkSignature) {
                    switch (_action) {
                        case SalesForceNameSpace.OrderAction.CONFIRM:
                            self._checkSignature(_gui, _gui.getDocument(), _gui.getDocument().anomalyReport.Rows, SalesForceNameSpace.OrderAction.CONFIRM, function () {
                                _gui.docModified = true;
                                var status;
                                var doc = _gui.getDocument();
                                var anomalies = doc.anomalyReport.Rows;
                                if (!UserContext.isFullOfflineMode() || SM1OrderHelper.managedOnlyOnline(doc.get("CODTYPORD"))) {
                                    if (anomalies.length == 1 &&
                                        anomalies[0].get("CODANOMALY") == SalesForceNameSpace.OrderAnomalyCodes.SIGNATURE_MANDATORY) {
                                        status = self._getConfirmOrderStatus(doc);
                                        doc.set("CODSTATUS", status);
                                    }
                                } else {
                                    status = self._getConfirmOrderStatus(doc, true, anomalies.length);
                                }

                                var onConfirm = function () {
                                    if (status)
                                        doc.set("CODSTATUS", status);
                                    XUI.showWait();
                                    self.saveOrder(_gui);
                                };

                                //Enh #32430: Number of document management 
                                if (self._numDocGenerationRequired(status, doc.get("NUMDOC"))) {
                                    SalesForceEngine.generateNumDoc(doc, function (e) {
                                        XLog.logEx(e);
                                        XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.ERR_GENERATE_NUMDOC]") });
                                        if (XUI.isWaitActive())
                                            XUI.hideWait(); //if any wait windows was shown
                                    },
                                    function (numDoc) {
                                        doc.set("NUMDOC", numDoc);
                                        onConfirm();
                                    });
                                } else
                                    onConfirm();
                            });
                            XUI.hideWait();
                            return;
                            break;
                        case SalesForceNameSpace.OrderAction.CLOSE:
                            self._checkSignature(_gui, _gui.getDocument(), "", SalesForceNameSpace.OrderAction.CLOSE, function () {
                                _gui.validateDocument(function (response) {
                                    if (response != "OK")
                                        return;
                                    _gui.docModified = true;
                                    _gui.getDocument().set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.CLOSED);
                                    if (_gui.getDocument().get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY)
                                        self._removeZeroOrderRows(_gui.getDocument());
                                    _gui.getDocument().set("DTECLOSE", new Date());
                                    self._setCloseButtonStatus(_gui, _gui.getDocument().get("CODSTATUS"), _gui.getDocument().get("CODTYPORD"));
                                    self.saveOrder(_gui);
                                }, "EDIT");
                            });
                            XUI.hideWait();
                            return;
                            break;
                        default:
                            XUI.hideWait();
                            return;
                            break;
                    }
                }
                if (_gui.getDocument().get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.INVOICED) {
                    self._printInvoice();
                } else {
                    XUI.hideWait();
                    XHistory.back();
                }
            };

            switch (_gui.getDocument().get("CODSTATUS")) {
                case SalesForceNameSpace.SM1OrderStatus.CLOSED:
                    if (_gui.getDocument().get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY ||
                        !XApp.isOnline()) {
                        successCallback();
                    }
                    else {
                        var failureCallback = function (e) {
                            XUI.hideWait();
                            XUI.showExceptionMsgBox(e);
                        };

                        XUI.showWait();
                        XNavHelper.refreshNav('NAV_MOB_WHSBALANCE', failureCallback, function () {
                            XNavHelper.loadNavData("NAV_MOB_WHSBALANCE", failureCallback, function () {
                                XNavHelper.refreshNav('NAV_MOB_WHSBALANCE_BATCH', failureCallback, function () {
                                    XNavHelper.loadNavData("NAV_MOB_WHSBALANCE_BATCH", failureCallback, function () {
                                        successCallback();
                                    });
                                });
                            });
                        });
                    }
                    break;
                default:
                    successCallback();
                    break;
            }
        });
    };

    this.setAnomaliesButtonStatus = function (context) {
        context.enabled = context.gui.isEditable() && XApp.isOnline();
    };

    this.onEvaluatingAnomalies = function (context, evaluateAnomalies, afterAnomaliesEvaluated, onFail) {
        try {
            var order = context.doc;
            // try to save the order for the evaluation of anomalies
            context.gui.callCust("onSaveDocument", [context.gui, order, function () {
                //if it's the case, try to create the report offline
                if (UserContext.isFullOfflineMode() && !SM1OrderHelper.managedOnlyOnline(order.get("CODTYPORD"))) {

                    SalesForceEngine.evalAnomaliesOffline(order, context.gui.CacheData,
                        function () {
                            XApp.exec(afterAnomaliesEvaluated, [{
                                ibanValid: true,
                                reportTruncated: false
                            }, order.anomalyReport]);
                        },
                        function (e) {
                            XLog.logEx(e);
                            XUI.hideWait()
                            XUI.showErrorMsgBox(UserContext.tryTranslate("[MOB.ANOM_REPORT_FAIL]"));
                        });
                } else
                    XApp.exec(evaluateAnomalies);
            }]);
        } catch (e) {
            onFail(e);
        }
    };


    //skip anomaly report initialization during ui creation for performance reasons
    //it will be executed at "Confirm"
    this.beforeCreateAnomalyReport = function (context) {
        context.cancel = true;
    };

    this.afterAnomaliesEvaluated = function (context) {
        var gui = context.gui;
        var order = gui.getDocument();
        var blocking = false;
        var nonBlocking = false;

        if (!gui.anomReportGui || !gui.anomalyGrid) {
            this.createConfirmPopup(gui);
        }

        // add the messages about the canvasses that cannot be applied
        if (order.m_usrUnappliableCnv) {
            if (order.m_usrUnappliableCnv.length != 0 || !context.data.ibanValid) {
                var table = context.anomalyReport;
                var row;

                for (var j = 0; j < order.m_usrUnappliableCnv.length; j++) {
                    table.addRowFromObject(order.m_usrUnappliableCnv[j]);
                }

                //IBAN anomaly
                if (!context.data.ibanValid) {
                    row = {
                        ISBLOCKING: true,
                        IDANOMALY: "IBAN_ANOM",
                        DTECRE: new Date(),
                        DESANOMALY: UserContext.tryTranslate("[MOBGUIORDER.INVALID_IBAN]"),
                        DES2: " ",
                        DES1: " "
                    };
                    table.addRowFromObject(row);
                }
                gui.anomalyGrid.setStore(table.toSenchaStore());
            }
        }

        // after evaluation see the blocking anomalies
        for (var i = 0; i < context.anomalyReport.Rows.length; i++) {
            if (context.anomalyReport.Rows[i].getValueFromName("ISBLOCKING")) {
                blocking = true;
            }
            else {
                nonBlocking = true;
            }
        }

        gui.BlockingAnom = blocking;
        gui.NonBlockingAnom = nonBlocking;
        gui.AnomalyCount = context.anomalyReport.Rows.length;

        if (gui.AnomalyCount == 0) {
            this.saveOrder(gui, true, SalesForceNameSpace.OrderAction.CONFIRM);
            return true; // keep show wait
        }

        gui.anomReportGui.popup.init();
        gui.anomReportGui.popup.setHidden(false);

        // change the status, block the order if there are blocking anomalies or unsigned non blocking anomalies
        if (gui.BlockingAnom || gui.NonBlockingAnom) {
            if (!SM1OrderHelper.isAnInvoice(order.get("CODTYPORD")) || gui.BlockingAnom)
                order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
            this._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
            order.set("CODSTATUSMAN", "");
        }

        XUI.hideWait();

        return false;
    };

    this.closeAnomalyPopup = function (gui) {
        if (!gui.anomReportGui || !gui.anomReportGui.popup)
            return;

        var popup = gui.anomReportGui.popup;
        popup.setHidden(true);
        popup.clear();
    };

    this.createConfirmPopup = function (gui) {
        this.anomalyGuiSection.attrs.caption = "ANOMALY_POPUP";
        var startTimer = new Date();
        var self = this;
        var detailContext = new DetailContext({
            masterGui: gui,
            storeEntity: gui.getDocument(),
            isRootContext: true
        });
        // remove AppliableBenefits collections
        gui.getDocument().AppliableBenefits = null;

        gui.getDocument().getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
            or.AppliableBenefitDetailsStore = null;
        });

        //create anom section
        var anomPanel = detailContext.createSection(this.anomalyGuiSection);

        var popup = Ext.create('XBasePopup', {
            modal: true,
            hidden: true,
            centered: true,
            cls: 'sm1-popup sm1-anomalyreport-popup',
            hideOnMaskTap: false,
            layout: 'card',
            topToolbar: true,
            bottomToolbar: true,
            title: UserContext.tryTranslate('[ANOMALY_REPORT]'),
            items: [gui.anomalyGrid],
            SM1Listeners: {
                onConfirm: function () {
                    self.handleOKAction(gui);
                },
                onCancel: function () {
                    self.handleCancelAction(gui);
                },
                onKeyUp: function (event) {
                    switch (event.keyCode) {
                        case 13:
                            self.handleOKAction(gui);
                            break;
                        case 27:
                            self.handleCancelAction(gui);
                    }
                    return false;
                }
            }
        });

        gui.anomReportGui = { detailContext: detailContext, popup: popup, anomPanel: anomPanel };
        Ext.Viewport.add(popup);

        SM1OrderHelper._showTime("createConfirmPopup", false, startTimer);
    };

    this.handleCancelAction = function (gui) {
        var order = gui.getDocument();
        //at this point if the user confirmed an invoice NUMDOC is populated
        //when cancel the anomaly popup for an invoice try to decrease the maxim value from memory for numdocs generted until here
        //because if the user will click on confirm again a new NUMDOC will be generated and a wrong value for the NUMDOC will be generated(will incrise by 2 and not by one)
        if (order._isNumDocGeneratedAtConfirmButtonClick) {

            var year = (new Date()).getFullYear();
            var key = order.get("CODUSR") + "|" + order.get("CODTYPORD") + "|" + year;
            //in offline mode try to decrease the maxim value
            if (window.NumDocs != undefined && window.NumDocs[key] != undefined) {
                window.NumDocs[key] = window.NumDocs[key] - 1;
            }
            //if NUMDOC is populated then remove it to avoid to save an order in DRAFT with NUMDOC populated
            if (!XApp.isEmptyOrWhitespaceString(order.get("NUMDOC")))
                order.set("NUMDOC", "");

            //reset the flag
            order._isNumDocGeneratedAtConfirmButtonClick = false;
        }

        this.closeAnomalyPopup(gui);
        gui.docModified = true;
        this.reaplyBenefits(gui.getDocument(), gui, true);
        this.refreshAll(gui, true, true);

    };


    this.handleOKAction = function (gui) {
        if (gui.AnomalyCount) {
            var order = gui.getDocument();
            if (!SM1OrderHelper.isAnInvoice(gui.getDocument().get("CODTYPORD")) || gui.BlockingAnom)
                order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.BLOCCATO);
            this._setCloseButtonStatus(gui, order.get("CODSTATUS"), order.get("CODTYPORD"));
            order.set("CODSTATUSMAN", "");
        }
        if (gui.BlockingAnom) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.BLOCKING_ANOMS_PRESENT]") });
            return;
        }
        this.closeAnomalyPopup(gui);
        //self.refreshAll(gui);

        XUI.showWait();
        this.saveOrder(gui, true, SalesForceNameSpace.OrderAction.CONFIRM);

    };

    this._getNewNumRow = function () {
        return this._newNumRow;
    };

    this._getRowTypeVoices = function (gui, orderRow) {
        var order = gui.getDocument();
        var prod = orderRow.getProduct();
        var defaultEmptyRowType = OrderParameters.getInstance(order.get("CODTYPORD")).getDefaultEmptyRowType();
        var i, n, row, voice;

        var voices = [];

        if (SalesForceEngine.isRowTypeEditable(order, orderRow, this._getNewNumRow()) && gui.openMode != 'VIEW') {
            voices = order.getRowTypes(order.get("CODTYPORD"));

            //Enh 39923
            if (order.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
                return voices;

            if (prod) {
                var newVoices = [];

                //for gift products, show only order row types with macrotype GIFT
                if (prod.get("FLGGIFT") != 0) {
                    for (i = 0, n = voices.length; i < n; i++) {
                        voice = voices[i];
                        if (SalesForceEngine.getMacroType(voice.value) == SalesForceNameSpace.OrderRowMacroType.GIFT) {
                            newVoices.push(voice);
                        }
                    }
                    return newVoices;
                }

                //for returnable products added from dedicated ADDRETURN selector
                //only return row types are available
                //excluding the empty row type
                if (orderRow.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.RETURN ||
                    (XApp.isEmptyOrWhitespaceString(orderRow.get("CODTYPROW")) && this._isAddReturn)) {//the system was not able to set default value
                    for (i = 0, n = voices.length; i < n; i++) {
                        voice = voices[i];
                        if (SalesForceEngine.getMacroType(voice.value) == SalesForceNameSpace.OrderRowMacroType.RETURN &&
                            (XApp.isEmptyOrWhitespaceString(defaultEmptyRowType) || voice.value != defaultEmptyRowType)) {
                            newVoices.push(voice);
                        }
                    }
                    return newVoices;
                }

                if (orderRow.get("MACROTYPE") != SalesForceNameSpace.OrderRowMacroType.RETURN) {
                    for (i = 0, n = voices.length; i < n; i++) {
                        voice = voices[i];
                        if (SalesForceEngine.getMacroType(voice.value) != SalesForceNameSpace.OrderRowMacroType.RETURN) {
                            newVoices.push(voice);
                        }
                    }
                    return newVoices;
                }
            }
        }
        else {
            //if CODTYPROW control isn't editable
            //order row types are not filtered out according to t110, for decoding purpose
            var rows = UserContext.getDecodeEntriesOrdered("TYROW");
            for (i in rows) {
                row = rows[i];
                voices.push({ value: row.cod, text: row.des });
            }
        }

        return voices;
    };

    this.onTabControlActiveItemChange = function (context) {
        var gui = context.gui;
        var order = gui.getDocument();

        switch (context.newTab.tabName) {
            case "MAIN":
                if (context.isAtFirstLoad) {
                    if (gui.tabCtrls.MAIN.fields.DTEDELIV) {
                        gui.tabCtrls.MAIN.fields.DTEDELIV.fieldContext.isValid = this._isValidDteDeliv;
                        gui.tabCtrls.MAIN.setFieldsStatus();
                        delete this._isValidDteDeliv;
                    }

                    this._reAlignRoute(order.get("DTEDELIV"), gui);

                    if (gui.CacheData)
                        this._loadAssortmentLocations(gui, false);

                    this._loadCustAddresses(gui, this._checkUnavailableCustAddress(gui) || XApp.isEmptyOrWhitespaceString(order.get("CODADDR")));
                }
                break;

            case "ROWS":
                if (context.isAtFirstLoad || (gui.tabCtrls.MAIN && gui.tabCtrls.MAIN.deliveryDatesModified)) {
                    if (SM1OrderHelper.isNewMultideliveryActivated(order.get("CODTYPORD"), order.get("CODSTATUS"))) {
                        this._refreshDeliveryQtyColumns(gui);
                    }

                    if (XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order))) {
                        this._checkForNotDeliverableProducts(gui);

                        if (gui.CacheData) {
                            this.reaplyBenefits(order, gui, true);
                            this.refreshAll(gui, true);
                        }
                    }
                }

                break;
        }
    };

    /// <summary>
    /// if FLGONEORDERPERDATE is set for the order type we check to see if there are other
    /// orders with the same DTEDELIV, same ship to customer and same POS.
    /// </summary>
    this._validateDeliveryDateOrdersOptInfoAsync = function (order, dteDeliv, context) {
        var self = this;
        if (SM1OrderHelper.isOneOrderPerDateCheckRequired(order.get("CODTYPORD"))) {
            XUI.showWait();
            this._validateOneOrderPerDelivDate(dteDeliv, order,
                function () {
                    XUI.hideWait();
                },
                function (isValid) {
                    if (false == isValid) {
                        XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOB.ORDERWITH_SAMEORDERDATE_SAMECUSTOMER_ALREADY_EXISTS]") });
                    }
                    if (context) {
                        var dteDelivField = context.fields.DTEDELIV;
                        if (dteDelivField) {
                            dteDelivField.fieldContext.isValid = isValid;
                            context.refreshControls();
                            context.setFieldsStatus();
                        }
                    }
                    else {
                        self._isValidDteDeliv = isValid;
                    }
                    XUI.hideWait();
                });
        }
    };

    this.afterLoad = function (gui) {
        var self = this;
        var currentOrder = gui.getDocument();
        var productDictionary = new Array();

        //invalid QTYORDS of rows added by canvasses
        //the key is NUMROW
        this._cnvQtyOrd = {};

        BarcodeScanner.addListener(self._getBarcodeScannedHandler(gui), self);
        this._loadCacheData(gui, function () {
            if (gui.isEditable()) {

                //add products cod and description to Chace dictionary to be used when removing products
                var orderRows = currentOrder.get("OrderRowDetails");
                for (var index in orderRows) {
                    var orderRow = orderRows[index];
                    var products = new Object();
                    products.codArt = orderRow["CODART"];
                    products.desArt = orderRow["DESART"];

                    productDictionary.push(products);
                }
                gui.CacheData.m_orderRowsProductInfo = productDictionary;
                self._validateDeliveryDateOrdersOptInfoAsync(currentOrder, currentOrder.get("DTEDELIV"), mDetailContext);
            }

        });

        this._reAlignRoute(gui.getDocument().get("DTEDELIV"), gui);
        var mDetailContext = gui.tabCtrls["MAIN"];
        if (gui.openMode == 'VIEW') {
            //disable buttons from header
            if (mDetailContext) {
                mDetailContext.refreshGui();
            }
            gui.refreshPricingButton.enabled = false;
            gui.reloadPricingButton.enabled = false;
            gui.removeZeroOrderRowsButton.enabled = false;
            gui.preloadAssoButton.enabled = false;
        }
        else {
            gui.removeZeroOrderRowsButton.enabled = XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(currentOrder));

            //Enh #33399: New order timestamp and calculated spent time : start the timer for this order
            self._startOrderDurationCounter(gui);
        }

        // setting a flag used for order rows reevaluation
        if (mDetailContext)
            mDetailContext.deliveryDatesModified = false;

        this._setConfirmButtonStatus(gui);
        this._setCloseButtonStatus(gui, gui.getDocument().get("CODSTATUS"), gui.getDocument().get("CODTYPORD"));

        SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
            if (openDay)
                self._openDayID = openDay.get("IDDAY");
        });

        try {
            this.customGridChanges(gui);
        } catch (ex) // the gui might not be loaded yet
        {
        }
        if (gui.getDocument().get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.CLOSED ||
            gui.getDocument().get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.INVOICED ||
            gui.getDocument().get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.DELIVERED)
            gui.clearModified();
        return true;
    };

    this.preLoadDocument = function (context) {
        //force loading from the server, even if it is cached - for configured order types
        if (context.gui.openData.selectedNavRow)
            context.forceServerLoad = SM1OrderHelper.managedOnlyOnline(context.gui.openData.selectedNavRow.get("CODTYPORD"));
        return true;
    };

    this.afterLoadDocument = function (gui) {

        try {
            this.customGridChanges(gui);
        } catch (ex) // the gui might not be loaded yet
        { }

        var doc = gui.getDocument();

        //mark all the benefits as User Modified
        doc.markBenefitsAsUserModified();

        var noEditMessage = SalesForceEngine.canEditOrder(doc);
        var canOrder = XApp.isEmptyOrWhitespaceString(noEditMessage);

        if (!canOrder) {
            gui.openMode = 'VIEW';
            XUI.showInfoOk({ msg: UserContext.tryTranslate(noEditMessage) });
            return;
        }

        // open for edit put in suspended status
        if (OrderParameters.getInstance(doc.get("CODTYPORD")).getSuspendOnEdit() && XApp.isEmptyOrWhitespaceString(doc.get("CODSTATUSMAN")) &&
            doc.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSLOAD && doc.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSUNLOAD) {
            doc.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
            this._setCloseButtonStatus(gui, doc.get("CODSTATUS"), doc.get("CODTYPORD"));
            doc.set("CODSTATUSMAN", "99");
        }

        var delivCust = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(doc.get("CODCUSTDELIV")));
        var date = SM1OrderHelper.calculateDelivDate(doc, delivCust);

        // delivery date needs to be updated
        if (doc.get("DTEDELIV") - date < 0) {
            doc.set("DTEDELIV", date);
            XLog.logWarn(UserContext.tryTranslate("[DELIV_DATE_HAS_BEEN_CHANGED]"));
        }
    };

    this.afterSectionCreated = function (context) {
        if (!context.gui.mainSections)
            context.gui.mainSections = {};

        var sectionName = context.sectionConfig.attrs["caption"];

        switch (sectionName) {
            case "SIZEQUANTITY":
                var store = this.buildSizeQuantityStore(context.detailGui, context.detailGui.entity);
                var grid = this.buildSizeQuantityGrid(context.detailGui, store, context.detailGui.entity);
                context.detailGui.entity.SizeQuantityGrid = grid;
                grid.onValueChanged = function () {
                    grid.updateRowQuantity();
                    context.detailGui.refreshGui();
                };

                context.panel.removeAt(1);
                context.panel.add(grid);
                break;
            case "GRID":
                //order rows grid
                //filter out rows with status removed
                context.panel.grid.getStore().setFilters([
                    Ext.create('Ext.util.Filter', {
                        filterFn: function (item) {
                            return item.get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA;
                        },
                        root: 'data'
                    })
                ]);

                context.panel.grid.setGenerateUpdatedListItemEvent(true);
                context.panel.grid.on("updatedListItem", function (item, record) {
                    item.removeCls("sm1-order-row-from-sales-condition");
                    if (!record || !record.xrec)
                        return;
                    var recordCodSrc = record.xrec.get("CODSRC");
                    if (recordCodSrc == SalesForceNameSpace.OrderBESRC.CANVAS ||
                        recordCodSrc == SalesForceNameSpace.OrderBESRC.BUDGET ||
                        recordCodSrc == SalesForceNameSpace.OrderBESRC.ANAGRAFICA ||
                        recordCodSrc == SalesForceNameSpace.OrderBESRC.PROMOTION) {
                        item.addCls("sm1-order-row-from-sales-condition");
                    }
                })
                break;


            case "APPLIABLEBENEFITS":
                context.panel.grid.getStore().setFilters([
                    Ext.create('Ext.util.Filter',
                        {
                            filterFn: function (item) {
                                if (!item.xrec)
                                    return false;

                                //always show promo
                                if (item.xrec.get("TagString") == "PROMO")
                                    return true;

                                //show auto only if parameter
                                if (item.xrec.IsAutoApply()) {
                                    var order = context.detailGui.entity.getParentEntity() || context.detailGui.entity.newParent;
                                    return OrderParameters.getInstance(order.get("CODTYPORD")).getOrderShowAutoCond();
                                }

                                //always show discretional
                                return true;
                            },
                            root: 'data'
                        })
                ]);

                //define sort
                context.panel.grid.getStore().setSorters([
                     Ext.create('Ext.util.Sorter', {
                         sorterFn: function (record1, record2) {
                             // Sort Sales condition tab by 4 criteria
                             var sort = record1.xrec.get("PrgDisc") - record2.xrec.get("PrgDisc");
                             if (sort != 0) {
                                 return sort;
                             }
                             sort = record1.xrec.get("PrgSrc") - record2.xrec.get("PrgSrc");
                             if (sort != 0) {
                                 return sort;
                             }
                             sort = (record1.xrec.get("CodSrcRef")).localeCompare(record2.xrec.get("CodSrcRef"));
                             if (sort != 0) {
                                 return sort;
                             }
                             return record1.xrec.get("Threshold") - record2.xrec.get("Threshold");
                         },
                         direction: 'ASC'
                     })
                ]);
                //apply sort
                context.panel.grid.refresh();
                break;
            case "PREVIOUSORDEREDROWSINFO":
                var orderRow = context.detailGui.entity;
                var order = context.gui.getDocument();
                if (orderRow && order) {
                    var codLocation = XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")) ? SFConstants.EMPTYCODLOCATION : order.get("CODLOCATION");
                    // check if alredy previous ordered rows for this product were loaded
                    var cacheRows = context.gui.CacheData.m_previousOrderedRowsInfo[orderRow.get("CODART").concat("|", codLocation)];
                    if (cacheRows) {
                        var previousOrderedRowsInfo = orderRow.getSubEntityStore(SFConstants.PREVIOUSORDEREDROWSINFO);
                        if (previousOrderedRowsInfo && previousOrderedRowsInfo.getCount() == 0) {
                            previousOrderedRowsInfo = cacheRows;
                            var orStore = context.panel.grid.getStore();
                            previousOrderedRowsInfo.rebindSenchaStore(orStore);
                        }
                    }
                    else {
                        // if previous ordered rows not present in cache load them
                        var orderClone = order.clone();
                        this._clearExtraEntities(orderClone);
                        var onSuccess = (function (context) {
                            return function (response) {
                                var prevRows = context.detailGui.entity.getSubEntityStore(SFConstants.PREVIOUSORDEREDROWSINFO);
                                prevRows.clear();

                                var tablePrevRows = response;
                                for (var row in tablePrevRows.Rows) {
                                    var prevRow = tablePrevRows.Rows[row];
                                    var prevOrderedRowInfo = new XEntity({ entityName: 'PreviousOrderedRowsInfo' });
                                    prevOrderedRowInfo.set("CodeTypeRow", prevRow.getValueFromName("CODTYPROW"));
                                    prevOrderedRowInfo.set("CodTypRow", prevRow.getValueFromName("DESTYPROW"));
                                    prevOrderedRowInfo.set("DteDeliv", prevRow.getValueFromName("DTEDELIV_HEAD"));
                                    prevOrderedRowInfo.set("DteOrd", prevRow.getValueFromName("DTEORD_HEAD"));
                                    prevOrderedRowInfo.set("QtyOrd", prevRow.getValueFromName("QTYORD"));
                                    prevOrderedRowInfo.set("QtyDel", prevRow.getValueFromName("QTYDEL"));
                                    prevOrderedRowInfo.set("QtyAnn", prevRow.getValueFromName("QTYANN"));

                                    prevRows.add(prevOrderedRowInfo);
                                }

                                // save to cache data loaded for this product
                                context.gui.CacheData.m_previousOrderedRowsInfo[orderRow.get("CODART").concat("|", codLocation)] = prevRows;
                                var orStore = context.detailGui.sections.PREVIOUSORDEREDROWSINFO.grid.getStore();
                                if (orStore)
                                    prevRows.rebindSenchaStore(orStore);
                            };
                        })(context);
                        SalesForceEngine.loadPreviousOrderedRowsInfo(orderRow.get("CODART"), orderClone, function () { }, onSuccess);
                    }
                }

                context.panel.grid.getStore().setSorters([
                     Ext.create('Ext.util.Sorter', {
                         sorterFn: function (record1, record2) {
                             // sort by DTEORD desc
                             var sort = record1.xrec.get("DteOrd") - record2.xrec.get("DteOrd");
                             if (sort != 0) {
                                 return -sort;
                             }
                             // then sort by DTEDELIV desc
                             sort = record1.xrec.get("DteDeliv") - record2.xrec.get("DteDeliv");
                             if (sort != 0) {
                                 return -sort;
                             }
                             // then by CODTYPROW asc
                             sort = record1.xrec.get("CodeTypeRow") - record2.xrec.get("CodeTypeRow");
                             if (sort != 0) {
                                 return sort;
                             }
                         }
                     })]);
                //apply sort
                context.panel.grid.refresh();
                break;
        }
    };

    this.preFillSection = function (sectionContext) {
        //If this order has restricted editability then keep editable only QTYINV and Batch details
        switch (sectionContext.entityName) {
            case SFConstants.SM1ORDER:
                //leave enabled only the ORDERROWGRID
                switch (sectionContext.config.attrs.caption) {
                    case "GRID":
                        return; //leave as is
                }
                break;
            case SFConstants.ORDERROW:
                switch (sectionContext.config.attrs.caption) {
                    case "ORDERROW":
                    case "BATCHGRID":
                        return;
                }
                break;
            case SFConstants.ORDERROWBATCH:
                return;
        }

        //Disable all sections except the ones mentioned above
        if (SM1OrderHelper.restrictedEditability(sectionContext.gui.getDocument())) {
            sectionContext.config.attrs.editable = "false";
        }
    };

    this.getFullSectionName = function (context) {
        var gui = context.gui;
        var sectionContext = context.sectionContext;

        var guiName = gui.guiName;
        var codTypOrd = gui.getDocument().get("CODTYPORD");
        var codStatus = gui.getDocument().get("CODSTATUS");
        var tabName = sectionContext.detailContext.tabName;
        if (!tabName)
            tabName = "";
        var sectionName = sectionContext.config.attrs.caption;

        return guiName + "|" + codTypOrd + "|" + codStatus + "|" + tabName + "|" + sectionName;
    };

    this.getDocumentDescription = function (context) {
        return UserContext.decode("CTORD", context.document.get("CODTYPORD"));
    };

    /*var 
      fieldContext = {
      fieldName: fieldName,
      caption: caption,
      "sectionContext": sectionContext,
      config: col,
      xdef: xdef,
      editable: colEditable,
      column: column
      };*/
    this.afterCreateGridColumn = function (fieldContext) {
        var self = this;
        var entityName = fieldContext.sectionContext.entityName;
        if (!XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(fieldContext.sectionContext.entity)) || !fieldContext.sectionContext.gui.isEditable())
            return;
        switch (entityName) {
            case SFConstants.SM1ORDER:
                switch (fieldContext.fieldName) {
                    case "QTYORD":
                        fieldContext.column.validator = (function (gui, extension) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();
                                context.isValid = context.isValid &&
                                    extension._validateBenefitQtyOrd(gui, orderRow, context.value) &&
                                    !orderRow.isWhsBalanceExceeded("QTYORD");
                                if (context.isValid) {
                                    var isQtyOrdEditable = self._isQtyOrdEditable(order, orderRow);
                                    isQtyOrdEditable = isQtyOrdEditable != undefined ? isQtyOrdEditable && this.editable : this.editable;
                                    isQtyOrdEditable = isQtyOrdEditable && self._getOrderRowFieldEditability(gui, orderRow, context.column.fieldName);
                                    context.isWarning = orderRow.isWhsBalanceExceeded("QTYORD") ||
                                        (SM1OrderHelper.isBatchManaged(gui.getDocument().get("CODTYPORD")) && orderRow.isBatchQtyOrdDiff(isQtyOrdEditable));
                                    if (!context.isWarning) {
                                        context.yellowInfo = order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.WHSLOAD &&
                                            orderRow.get("QTYORD") != orderRow.get("QTYORDORIG");
                                    }
                                }
                            };
                        })(fieldContext.sectionContext.gui, this);
                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        fieldContext.column.validator = (function (gui, extension) {
                            return function (context) {
                                var orderRow = context.rec.xrec;

                                //gift qty is set on last delivery date
                                if (context.column.fieldName == SM1OrderHelper.getDeliveryQtyFieldName(SM1OrderHelper.getLastDeliveryDateName(gui.getDocument()))) {
                                    context.isValid = context.isValid && extension._validateBenefitQtyOrd(gui, orderRow, context.value);
                                }

                                context.isWarning = context.isWarning || !extension._validateFreeMerchandiseMultiQtyDeliv(gui, orderRow, context.column.fieldName);
                            };
                        })(fieldContext.sectionContext.gui, this);
                        break;
                    case "WHSBALANCEORD":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                if (context.isValid) {
                                    context.isWarning = context.rec.xrec.isWhsBalanceExceeded("QTYORD");
                                }
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "QTYINV":
                        fieldContext.column.validator = (function (mobGuiExtension, gui) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();

                                context.isValid = context.isValid && !orderRow.isWhsBalanceExceeded("QTYINV") && !mobGuiExtension._isMissingQtyInvField(orderRow, order.get("CODTYPORD"), gui.CacheData);

                                if (context.isValid) {

                                    //check if user manually changed qtyinv
                                    var isVariableWeightWarn = mobGuiExtension._isQtyInvEditable(order, orderRow) &&
                                        !mobGuiExtension._isValidQtyInvField(context.rec.xrec, order.get("CODTYPORD"), gui.CacheData);

                                    if (isVariableWeightWarn) {
                                        context.isWarning = true;
                                        return;
                                    };

                                    //check batch sum
                                    //check invoice balance
                                    var isQtyInvEditable = self._isQtyInvEditable(order, orderRow);
                                    if (isQtyInvEditable == undefined)
                                        isQtyInvEditable = this.editable;
                                    context.isWarning =
                                        (
                                            SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) &&
                                            orderRow.isBatchQtyInvDiff(isQtyInvEditable)
                                        ) ||
                                        orderRow.isWhsBalanceExceeded("QTYINV");
                                }
                            };
                        })(this, fieldContext.sectionContext.gui);
                        break;
                    case "CODTYPROW":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();

                                context.isValid = SM1OrderHelper.checkProdInWarehouse(order, orderRow.get("CODART"), orderRow.get("CODTYPROW"), gui.CacheData);
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "WHSBALANCEINV":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                if (context.isValid) {
                                    context.isWarning = context.rec.xrec.isWhsBalanceExceeded("QTYINV");
                                }
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "CODQTYMODCAUSE":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();

                                context.isValid = !(context.column.editable && !self._validateCodQtyModCauseField(order, orderRow));
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "CODQTYREJCAUSE":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();

                                context.isValid = !(context.column.editable && !self._validateCodQtyRejCauseField(order, orderRow));
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "ADJUSTMENTQTY":
                        fieldContext.column.validator = (function (gui) {
                            return function (context) {
                                var orderRow = context.rec.xrec;
                                var order = orderRow.getParentEntity();

                                context.isWarning = order.get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.SOSPESO &&
                                    orderRow.get("ADJUSTMENTQTY") &&
                                    orderRow.get("ADJUSTMENTQTY") != 0 &&
                                    orderRow.get("ADJUSTMENTQTY") != -Infinity;
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case "SALESCONDITIONS":
                        fieldContext.column.filterFn = function (item) {
                            //the caller will pass the scope containing this.filterValue
                            return Ext.Array.contains(item.get("SALESCONDITIONS"), this.filterValue);
                        }
                        break;

                }
                break;
            case SFConstants.ORDERROW:
                switch (fieldContext.fieldName) {
                    case "QTYORD":
                        fieldContext.column.validator = (function (mobGuiExtension) {
                            return function (context) {
                                var batch = context.rec.xrec;
                                var orderRow = batch.getParentEntity();
                                var order = orderRow.getParentEntity();

                                context.isValid = context.isValid && SalesForceEngine.isBatchQtyValueValid("QTYORD", batch, orderRow, order);

                                if (context.isValid)
                                    context.isWarning = mobGuiExtension._checkInconsistentBatchQties(order, orderRow, batch);
                            };
                        })(this);
                        break;
                    case "QTYINV":
                        fieldContext.column.validator = (function (mobGuiExtension, gui) {
                            return function (context) {
                                var batch = context.rec.xrec;
                                var orderRow = batch.getParentEntity();
                                var order = orderRow.getParentEntity();

                                context.isValid = context.isValid && SalesForceEngine.isBatchQtyValueValid("QTYINV", batch, orderRow, order) && !mobGuiExtension._isMissingBatchQtyInvField(batch, gui.CacheData);

                                if (context.isValid)
                                    context.isWarning = !mobGuiExtension._isValidBatchQtyInvField(batch, gui.CacheData) ||
                                        mobGuiExtension._checkInconsistentBatchQties(order, orderRow, batch);
                            };
                        })(this, fieldContext.sectionContext.gui);
                        break;
                    case "DTEEXPIRE":
                        fieldContext.column.validator = (function (mobGuiExtension) {
                            return function (context) {
                                var batch = context.rec.xrec;
                                var orderRow = batch.getParentEntity();
                                var order = orderRow.getParentEntity();

                                var preloaded = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"));

                                context.isValid = (XApp.isEmptyDate(batch.get("DTEEXPIRE")) && order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET)
                                    || preloaded || batch.get("DTEEXPIRE") >= mobGuiExtension._getMinBatchExpDate(order.get("CODTYPORD"));
                            };
                        })(this);
                        break;
                }
                break;
        }
    };

    this.buildCanvassChoicePopup = function (appBen, gui, orderExt) {

        var startTime = new Date();

        if (appBen.get("IsSelected") == false)
            return null;

        var rangeGroup = appBen.getCnvActGroup();

        var benefit = rangeGroup.getSubEntityStore(SFConstants.CNVACTRANGEGROUPBENEFIT).findBy(function (x) {
            return (x.get("CODTYPBEN") == SalesForceNameSpace.OrderBENTYP.OMAG_ART_SCELTA);
        });
        if (!benefit)
            return null;

        var range = rangeGroup.getParentEntity();
        if (!range)
            return null;

        var cnvAct = range.getParentEntity();
        if (!cnvAct)
            return null;

        var backup = appBen.clone();
        var orderGui = gui;
        var orderExtension = orderExt;

        orderExtension.refreshAll(orderGui, true);

        cnvAct.set("CnvOrderValue", cnvAct.calculateOrderCnvActionValue(orderGui.getDocument(), gui.CacheData));
        var maxTimes = cnvAct.maxTimesRangeGroupApplicable(rangeGroup);
        rangeGroup.set("QtyRange", maxTimes);

        appBen.set("QtyMaximum", benefit.get("QTYBEN") * rangeGroup.get("QtyRange"));
        appBen.set("QtyMinimum", benefit.get("QTYBENMIN") * rangeGroup.get("QtyRange"));

        if (appBen.getSubEntityStore("ChoiceArtDistrib").getCount() == 0) {

            var artGroup = cnvAct.getSubEntityStore(SFConstants.CNVACTBENARTGRP).findBy(function (x) {
                return (x.get("IDBENARTGRP") == benefit.get("IDBENARTGRP"));
            });

            artGroup.getSubEntityStore(SFConstants.CNVACTBENART).each(function (art) {
                var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(art.get("CODART"), art.get("CODDIV")));
                if (prod != null) {
                    var cad = new XEntity({ entityName: 'ChoiceArtDistrib' });
                    cad.set("CODART", prod.getValueFromName("CODART"));
                    cad.set("DESART", prod.getValueFromName("DESART"));
                    cad.set("MINORD", prod.getValueFromName("QTYORDMIN"));
                    cad.set("UMORDMIN", prod.getValueFromName("UMORDMIN"));

                    var matchBen = benefit.ChoiceArtDistribution.findBy(function (b) {
                        return b.get("CODART") == cad.get("CODART");
                    });
                    if (matchBen) {
                        cad.set("IsSelected", matchBen.get("IsSelected"));
                        cad.set("AMOUNT", matchBen.get("AMOUNT"));
                    }
                    else {
                        cad.set("IsSelected", false);
                        cad.set("AMOUNT", 0);
                    }

                    cad.Product = prod;

                    appBen.getSubEntityStore("ChoiceArtDistrib").add(cad);
                }
            });

            appBen.calculateRemaining();
        }

        // create the store for the grid
        var store = appBen.getSubEntityStore("ChoiceArtDistrib").toSenchaStore({ keepBind: true });
        var amountDef = XApp.model.getFieldDef("ChoiceArtDistrib", "AMOUNT");

        var columns = [
            {
                editable: gui.openMode != 'VIEW',
                header: UserContext.tryTranslate("[IsSelected]"),
                dataIndex: "IsSelected",
                width: "20%",
                fieldName: 'IsSelected',
                fieldType: 'bool',
                classNames: [],
                styles: [],
                headerClassNames: [],
                presType: 'bool',
                headerStyles: [],
                renderer: null,
                validator: null
            },
            {
                editable: gui.openMode != 'VIEW',
                header: UserContext.tryTranslate("[QTYORD]"),
                dataIndex: "AMOUNT",
                width: "20%",
                fieldName: 'AMOUNT',
                minValue: Math.max(0, amountDef.minVal),
                maxValue: amountDef.maxVal,
                fieldType: 'decimal',
                classNames: [],
                styles: [],
                headerClassNames: [],
                headerStyles: [],
                renderer: null,
                validator: null
            },
            {
                editable: false,
                header: UserContext.tryTranslate("[CODART]"),
                dataIndex: "CODART",
                width: "20%",
                fieldName: 'CODART',
                fieldType: 'string',
                classNames: [],
                styles: [],
                headerClassNames: [],
                headerStyles: [],
                renderer: null,
                validator: null
            }, {
                editable: false,
                header: UserContext.tryTranslate("[DESART]"),
                dataIndex: "DESART",
                width: "40%",
                fieldName: 'DESART',
                fieldType: 'string',
                classNames: [],
                styles: [],
                headerClassNames: [],
                headerStyles: [],
                renderer: null,
                validator: null
            }];

        var qtyRemainingCard = new XNumTextBox({
            label: UserContext.tryTranslate("[MOB.QTYREMAINING]"),
            disabled: true
        });
        qtyRemainingCard.setValue(appBen.get("QtyRemaining"));

        var qtyCard = new XNumTextBox({
            label: UserContext.tryTranslate("[MOB.QTYMAXIMUM]"),
            disabled: true
        });
        qtyCard.setValue(appBen.get("QtyMaximum"));

        var rowHeight = parseInt(UserContext.getConfigParam("TOUCH_GRID_ROWHEIGHT", "26"), 10);

        var grid = Ext.create('Ext.ux.XGrid', {
            id: 'grdCanvasChoice',
            store: store,
            columns: columns,
            disabled: false,
            variableHeights: false,
            itemHeight: rowHeight,
            infinite: false,
            scrollable: true,
            listeners: {
                valueChanged: function (g, info) {
                    var rowEntity = info.record.xrec;
                    var appBen = rowEntity.getParentEntity();

                    switch (info.fieldName) {
                        case "IsSelected":
                            if (appBen.get("QtyRemaining") == 0)
                                info.newVal = false;
                            if (info.newVal)
                                rowEntity.set("AMOUNT", appBen.get("QtyRemaining"));
                            else
                                rowEntity.set("AMOUNT", 0);
                            break;
                        case "AMOUNT":
                            appBen.set("QtyRemaining", appBen.get("QtyRemaining") + info.oldVal);
                            if (info.newVal > appBen.get("QtyRemaining"))
                                info.newVal = appBen.get("QtyRemaining");
                            if (info.newVal < 0)
                                info.newVal = 0;
                            rowEntity.set("IsSelected", info.newVal > 0);
                            break;
                    }
                    rowEntity.set(info.fieldName, info.newVal);

                    appBen.calculateRemaining();
                    // update header quantity
                    qtyRemainingCard.setValue(appBen.get("QtyRemaining"));
                    rowEntity.syncSenchaEntity();
                    //propagate changed value so grid can use it after event finishes.
                    info.newVal = info.record.xrec.get(info.fieldName);
                }
            }
        });

        var setGridHeight = function (p) {
            try {

                var height = (p.getHeight() - //popup
                    Ext.select(".sm1-popup-top-toolbar", true, p).elements[0].getHeight() - //top toolbar
                    Ext.select(".sm1-popup-bottom-toolbar", true, p).elements[0].getHeight() - //bottom toolbar
                    Ext.select(".sm1-gui-fieldset", true, p).elements[0].getHeight() - //field set
                    (XApp.isDesktop() ? 8 : 0)); //extra pixels for scrollbar

                var grd = Ext.getCmp('grdCanvasChoice');
                grd.setHeight(height);
                if (!XApp.isDesktop()) {
                    //workaround for hidden scrollbar
                    grd.setWidth(p.getWidth());
                }
            }
            catch (ex) {
                XLog.logEx(ex);
            }
        };

        var closePopup = function () {
            popup.hide();
            Ext.Viewport.remove(popup);
            popup.destroy();
        };

        var confirmPopup = function () {
            if (appBen.get("QtyMaximum") - appBen.get("QtyRemaining") < appBen.get("QtyMinimum")) {
                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.CHOICEART_QTY_INTERVAL]") + " [ " + appBen.get("QtyMinimum") + " - " + appBen.get("QtyMaximum") + " ]" });
                return;
            }

            // save to ChoiceArtDistribution
            benefit.ChoiceArtDistribution.clear();
            appBen.getSubEntityStore("ChoiceArtDistrib").each(function (c) {
                if (c.get("IsSelected"))
                    benefit.ChoiceArtDistribution.add(c);
            });
            // remove temporary collection
            appBen.getSubEntityStore("ChoiceArtDistrib").clear();

            orderExtension.refreshAll(orderGui, true);

            closePopup();
        };

        var cancelPopup = function () {
            appBen.set("QtyRange", backup.get("QtyRange"));
            appBen.getSubEntityStore("ChoiceArtDistrib").clear();
            backup.getSubEntityStore("ChoiceArtDistrib").each(function (c) {
                appBen.getSubEntityStore("ChoiceArtDistrib").add(c);
            });

            closePopup();
        };

        var popup = Ext.create('XBasePopup', {
            modal: true,
            centered: true,
            layout: 'vbox',
            cls: 'sm1-popup sm1-ordergui-popup',
            hideOnMaskTap: false,
            topToolbar: true,
            bottomToolbar: true,
            title: UserContext.tryTranslate('[SELECT_GIFT_ARTICLE]'),
            items: [
                {
                    xtype: 'fieldset',
                    cls: 'sm1-gui-fieldset',
                    items: [
                        qtyRemainingCard,
                        qtyCard
                    ]
                },
                grid
            ],
            SM1Listeners: {
                onConfirm: confirmPopup,
                onCancel: cancelPopup,
                onKeyUp: function (event) {
                    switch (event.keyCode) {
                        case 13:
                            confirmPopup();
                            break;
                        case 27:
                            cancelPopup();
                    }
                    return false;
                }
            },
            listeners: {
                resize: setGridHeight
            }
        });

        SM1OrderHelper._showTime("buildCanvassChoicePopup", false, startTime);
        return popup;
    };

    this.beforeCreateGridColumn = function (fieldContext) {
        var self = this;
        var entityName = fieldContext.sectionContext.entityName;
        var fieldName = fieldContext.column.fieldName;

        switch (entityName) {
            case SFConstants.ORDERROW:
                switch (fieldName) {
                    case "UserAction":
                        fieldContext.config.attrs.handler = function (rec) {
                            switch (rec.xrec.get("TagString")) {
                                case (SalesForceNameSpace.AppliableBenefitType.CANVAS):
                                case (SalesForceNameSpace.AppliableBenefitType.BUDGET):
                                    {
                                        var popup = self.buildCanvassChoicePopup(rec.xrec, fieldContext.sectionContext.gui, self);
                                        if (popup) {
                                            popup.init();
                                            Ext.Viewport.add(popup);
                                        }
                                    }
                                    break;
                                case (SalesForceNameSpace.AppliableBenefitType.PROMO):
                                    {
                                        if (!SalesForceEngine.canOpenPromo())
                                            return;

                                        if (!fieldContext.sectionContext.detailContext.validateEntity()) {
                                            //show all the error messages
                                            fieldContext.sectionContext.detailContext.setFieldsStatus();
                                            return;
                                        }
                                        SalesForceEngine.openPromo(rec.xrec);
                                    }
                                    break;
                            };
                        };
                        break;
                    case "REQUESTEDQTYORD":
                    case "WHSBALANCEORD":
                    case "WHSBALANCEINV":
                    case "BUDGETBALANCE":
                        //don't show unavailable balances
                        fieldContext.column.hideValue = -Infinity;
                        break;
                    case "QTYORD":
                    case "QTYINV":
                        fieldContext.column.minValue = 0;
                        SalesForceEngine.setCellQtyRenderer(fieldContext);
                        break;
                }
                break;
            case SFConstants.SM1ORDER:
                switch (fieldName) {
                    case "QTYORD":
                    case "QTYINV":
                        fieldContext.column.minValue = 0;
                        SalesForceEngine.setCellQtyRenderer(fieldContext);
                        break;
                    case "QTYORDINTEGER":
                        fieldContext.column.minValue = 0;
                        break;
                    case "QTYORDREMAINDER":
                        fieldContext.column.minValue = 0;
                        SalesForceEngine.setCellQtyRenderer(fieldContext);
                        break;
                    case "CODTYPROW":
                        fieldContext.column.renderer = (function (fldContext) {
                            return function (value, values) {
                                //decode value, even if the option is not available
                                var des = UserContext.decode("TYROW", value);
                                return fldContext.column.grid.formatCell("&nbsp;" + des, fldContext.column, value, values);
                            };
                        })(fieldContext);
                        break;
                    case "CODQTYMODCAUSE":
                        //set it editable by default, no matter the configuration. The real editability check will be performed in onGridBeginEdt
                        fieldContext.column.editable = true;
                        break;
                    case "BENEFITINFO":
                        fieldContext.config.attrs.handler = function (rec) {
                            if (SM1OrderHelper.getBenefitInfoBehaviour(rec.xrec.getParentEntity().get("CODTYPORD")) == 1)
                                return;

                            if (!SalesForceEngine.canOpenPromo())
                                return;

                            var appBen = rec.xrec.getSubEntityStore("AppliableBenefit");
                            var promo = appBen.findBy(function (a) {
                                return a.get("TagString") == "PROMO";
                            });

                            SalesForceEngine.openPromo(promo);
                        };
                        break;
                    case "UMORD":
                    case "UMINV":
                        fieldContext.column.renderer = (function (fieldContext) {
                            return function (value, values) {
                                //don't show description
                                return fieldContext.column.grid.formatCell("&nbsp;" + value, fieldContext.column, value, values);
                            };
                        })(fieldContext);
                        break;
                    case "REQUESTEDQTYORD":
                    case "WHSBALANCEORD":
                    case "WHSBALANCEINV":
                    case "BUDGETBALANCE":
                        //don't show unavailable balances
                        fieldContext.column.hideValue = -Infinity;
                        break;
                    case "DESART":
                        //if "DESART" is configured as hyperlink then it should always be editable in order to allow navigation to the product UI
                        if (fieldContext.config.attrs["presType"] == 'hyperlink') {
                            fieldContext.config.attrs.handler = (function (gui) {
                                return function (record) {
                                    var histConfig = XHistory.actualConfig();
                                    if (histConfig) {
                                        //skip applying all pricing conditions again
                                        histConfig.skipRefreshAll = true;
                                    }
                                    gui._storeDocOnTempCache();

                                    var navId = "NAV_MOB_PROD";
                                    var prodViewRight = UserContext.checkRight(navId, navId, 'VIEW');
                                    var prodEditRight = UserContext.checkRight(navId, navId, 'EDIT');
                                    if (prodViewRight || prodEditRight) {
                                        XHistory.go({
                                            controller: app.getSM1Controllers().gui,
                                            action: 'show',
                                            docKey: CommonEngine.buildProductKey(record.xrec.get("CODART"), record.xrec.get("CODDIV")),
                                            navId: navId,
                                            openMode: prodEditRight ? 'EDIT' : 'VIEW'
                                        });
                                    }
                                };
                            })(fieldContext.sectionContext.gui);
                        }
                        break;
                    case "ADJUSTMENTQTY":
                        fieldContext.column.hideValue = -Infinity;
                        SalesForceEngine.setCellQtyRenderer(fieldContext);
                        break;
                    case "COLORMEASURE":
                        fieldContext.column.renderer = (function (fieldContext) {
                            return function (value, values) {
                                //render a circle
                                var radius = parseInt(UserContext.getConfigParam("TOUCH_GRID_ROWHEIGHT", "26"), 10) / 4;
                                return '<div style="background-color:' + value + ';height:' + 2 * radius + 'px;width:' + 2 * radius + 'px;-webkit-border-radius:' + radius + 'px;margin-left:auto;margin-right:auto"></div>';
                            };
                        })(fieldContext);
                        break;
                    case "NUMROW":
                        fieldContext.column.renderer = (function (fldContext) {
                            return function (value, values) {
                                var orderRow = fldContext.column.grid.getStore().getById(values.id).xrec;
                                var numRow = "";
                                if (orderRow) {
                                    if (orderRow.get("NUMROWKITREF")) {
                                        numRow = orderRow.get("NUMROWKITREF") + " >> " + orderRow.get("NUMROW");
                                    }
                                    else {
                                        numRow = orderRow.get("NUMROW");
                                    }
                                }
                                return fldContext.column.grid.formatCell(numRow, fldContext.column, value, values);
                            };
                        })(fieldContext);
                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        SalesForceEngine.setCellQtyRenderer(fieldContext);
                        break;
                }
                break;
        }
    };

    this.afterCardFieldCreation = function (f, context) {
        var fieldName = context.fieldConfig.attrs.name;
        switch (context.sectionContext.entityName) {
            case SFConstants.ORDERROW:

                switch (fieldName) {
                    case "REQUESTEDQTYORD":
                    case "WHSBALANCEORD":
                    case "WHSBALANCEINV":
                    case "BUDGETBALANCE":
                        //don't show unavailable balances
                        f.config.hideValue = -Infinity;
                        break;
                    case "QTYORD":
                    case "QTYINV":
                    case "QTYORDREMAINDER":
                    case "WHSBALANCEORDREMAINDER":
                        SalesForceEngine.setFieldQtyFormat(f, fieldName, context.detailContext.entity);
                        break;
                    case "ADJUSTMENTQTY":
                        f.config.hideValue = -Infinity;
                        SalesForceEngine.setFieldQtyFormat(f, fieldName, context.detailContext.entity);
                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        SalesForceEngine.setFieldQtyFormat(f, fieldName, context.detailContext.entity);
                        var order = context.gui.getDocument();
                        var deliveryDateFieldName = SM1OrderHelper.getDeliveryDateFieldName(fieldName);
                        if (this._isDeliveryDateSet(deliveryDateFieldName, order)) {
                            var fieldLabel = this._getDeliveryQtyLabel(deliveryDateFieldName, order);
                            f.setLabel(fieldLabel);
                        }
                        else
                            context.fieldConfig.attrs.visible = "false";
                        break;
                }

                break;
            case SFConstants.ORDERROWBATCH:

                switch (fieldName) {
                    case "WHSBALANCEORD":
                    case "WHSBALANCEINV":
                        //don't show unavailable balances
                        f.config.hideValue = -Infinity;
                        break;
                    case "QTYORD":
                    case "QTYINV":
                        SalesForceEngine.setFieldQtyFormat(f, fieldName, context.detailContext.entity);
                        break;
                }

                break;
        }

        return f;
    };

    this.buildSizeQuantityStore = function (gui, orderRow) {

        if (orderRow.sizeQuantity && orderRow.sizeQuantity.sizeStore)
            return orderRow.sizeQuantity.sizeStore;
        // create the model for the store save it on the orderRow
        orderRow.sizeQuantity = {};
        orderRow.sizeQuantity.columns = ["CODCOLOR"];
        orderRow.sizeQuantity.nrFilledColumns = 1;
        var colors = {};
        orderRow.colors = [];
        orderRow.sizeQuantity.fields = [{ name: "CODCOLOR", type: "string" }];

        // add the size columns
        var cons = new XConstraints({
            logicalOp: 'AND',
            constraints: [new XConstraint("CODDIV", "=", orderRow.get("CODDIV")), new XConstraint("CODART", '=', orderRow.get("CODART"))]
        });

        var sizeColor = XNavHelper.getFromMemoryCache("NAV_MOB_PRODSIZECOLOR").filterByConstraints(cons);
        orderRow.sizeQuantity.navData = sizeColor;
        orderRow.sizeQuantity.defaults = {};

        orderRow.sizeQuantity.getNavRow = function (or, codcolor, codsize, codsize2) {
            if (!codsize2) codsize2 = '';
            if (!or.sizeQuantity.defaults) return null;

            return or.sizeQuantity.defaults[codcolor + '|' + codsize.name + '|' + codsize2];

        };

        var color = '';
        for (var i = 0; i < sizeColor.length; i++) {
            var sColor = sizeColor[i];
            orderRow.sizeQuantity.defaults[sColor.get("CODCOLOR") + '|' + sColor.get("CODSIZE") + '|' + sColor.get("CODSIZE2")] = sColor;

            if (XApp.isEmptyOrWhitespaceString(color)) {
                color = sColor.get("CODCOLOR");
                colors[color] = color;
                orderRow.colors.push(sColor.get("CODCOLOR"));
            }

            if (sColor.get("CODCOLOR") != color) {
                if (!colors[sColor.get("CODCOLOR")]) {
                    colors[sColor.get("CODCOLOR")] = sColor.get("CODCOLOR");
                    orderRow.colors.push(sColor.get("CODCOLOR"));
                }
                continue;
            }
            orderRow.sizeQuantity.columns.push(sColor.get("CODSIZE"));
            orderRow.sizeQuantity.fields.push({ name: sColor.get("CODSIZE"), type: 'int' });
        }

        Ext.define('ChoiseQuantityDistribution', {
            extend: 'Ext.data.Model',
            config: {
                fields: orderRow.sizeQuantity.fields
            }
        });

        var sizeStore = Ext.create('Ext.data.Store', {
            model: 'ChoiseQuantityDistribution',
        });

        for (var j = 0; j < orderRow.colors.length; j++) {
            var row = {};

            for (var k = 0; k < orderRow.sizeQuantity.fields.length; k++) {
                var field = orderRow.sizeQuantity.fields[k];
                if (k < orderRow.sizeQuantity.nrFilledColumns)
                    row[field.name] = orderRow.colors[j];
                else row[field.name] = 0;
            }

            sizeStore.add(row);
        }
        orderRow.sizeQuantity.sizeStore = sizeStore;
        return sizeStore;
    };

    this.buildColumnHeader = function (colName, isFilled) {
        if (isFilled) return UserContext.tryTranslate("[" + colName + "]");

        var v = UserContext.decode("PRODSIZE", colName);

        if (XApp.isEmptyOrWhitespaceString(v)) {
            return colName;
        }

        return v.substring(5);

    };

    this.buildSizeQuantityGrid = function (gui, store, orderRow) {

        //create columns
        var columns = [];
        var i, field;
        // sort columns by size code
        Ext.Array.sort(orderRow.sizeQuantity.fields, function (a, b) {
            return a - b;
        });

        for (i = 0; i < orderRow.sizeQuantity.fields.length; i++) {
            field = orderRow.sizeQuantity.fields[i];

            var col = {
                editable: gui.openMode != 'VIEW' && (i >= orderRow.sizeQuantity.nrFilledColumns),
                header: this.buildColumnHeader(field.name, i < orderRow.sizeQuantity.nrFilledColumns),
                dataIndex: field.name,
                width: (100 / orderRow.sizeQuantity.fields.length) + "%",
                fieldName: field.name,
                fieldType: i < orderRow.sizeQuantity.nrFilledColumns ? 'string' : 'decimal',
                classNames: [],
                styles: [],
                headerClassNames: [],
                presType: i < orderRow.sizeQuantity.nrFilledColumn ? 'string' : 'decimal',
                headerStyles: [],
                renderer: null,
                validator: null
            };
            columns.push(col);

        }
        // create grid
        var rowHeight = parseInt(UserContext.getConfigParam("TOUCH_GRID_ROWHEIGHT", "26"), 10);
        var grid = Ext.create('Ext.ux.XGrid', {
            store: store,
            infinite: false,
            variableHeights: false,
            itemHeight: rowHeight,
            height: 2 * rowHeight + (store ? store.getCount() * (rowHeight + 0.5) : 0),
            elementName: "grid",
            columns: columns,
            listeners: {
                valueChanged: function (g, info) {
                    grid.onValueChanged(g, info);
                }
            },

        });

        grid.orderRow = orderRow;
        grid.updateRowQuantity = function () {
            var or = grid.orderRow;
            var sum = 0;
            for (i = or.sizeQuantity.nrFilledColumns; i < or.sizeQuantity.fields.length; i++) {
                field = or.sizeQuantity.fields[i];

                for (var j = 0; j < or.sizeQuantity.sizeStore.getCount() ; j++) {
                    var row = or.sizeQuantity.sizeStore.getAt(j);
                    sum += row.get(field.name);
                }

            }

            or.set("QTYORD", sum);
        };


        return grid;
    };

    this.martrixUpdateValues = function (orderRow, grid, newValue) {
        var sum = 0;
        for (var i = orderRow.sizeQuantity.nrFilledColumns; i < orderRow.sizeQuantity.fields.length; i++) {
            var field = orderRow.sizeQuantity.fields[i];

            for (var j = 0; j < orderRow.sizeQuantity.sizeStore.getCount() ; j++) {
                var row = orderRow.sizeQuantity.sizeStore.getAt(j);

                var r = orderRow.sizeQuantity.getNavRow(orderRow, row.get("CODCOLOR"), field);
                var val = 0;

                if (r) {
                    val = Math.floor((r.get("PRCQTY") * newValue) / 100);
                } else {
                    XLog.logWarn("Row not found in sizequantity navigator " + row.get("CODCOLOR") + " - " + field.name);
                }

                if (i == orderRow.sizeQuantity.fields.length - 1 && j == orderRow.sizeQuantity.sizeStore.getCount() - 1) {
                    val = newValue - sum;
                }

                row.set(field.name, val);
                sum += val;
                grid.updateRowQuantity();
            }
        }
        return sum;
    };

    this.buildSizeQuantityPopup = function (context, orderRow, grid) {
        var startTime = new Date();

        var self = this;
        var backup = orderRow.clone();

        var qtyOrderField = Ext.create('XNumTextBox',
            {
                label: UserContext.tryTranslate("[QTYORD]"),
                name: "QTYORD",
                formatstring: '',
                "minValue": 0,
                "maxValue": 9999999,
                listeners: {
                    change: function (ctrl, newValue) {
                        if (!ctrl.updateRows) return;
                        var sum = self.martrixUpdateValues(orderRow, grid, newValue);

                        orderRow.set("QTYORD", sum);
                        qtyOrderField.updateRows = false;
                        qtyOrderField.updateValue(sum);
                        qtyOrderField.updateRows = true;
                    }
                }
            }
        );

        grid.onValueChanged = function () {
            grid.updateRowQuantity();
            qtyOrderField.updateRows = false;
            qtyOrderField.updateValue(orderRow.get("QTYORD"));
            qtyOrderField.updateRows = true;
        };

        var closePopup = function () {
            popup.hide();
            Ext.Viewport.remove(popup);
            popup.destroy();
        };

        var confirmPopup = function () {
            grid.updateRowQuantity();
            var cntx = { record: context.record, fieldName: "QTYORD", newVal: orderRow.get("QTYORD"), oldVal: backup.get("QTYORD") };
            context.detailContext.sections.GRID.grid.fireEvent("valueChanged", context.editable, cntx);

            closePopup();
        };

        var popup = Ext.create('XBasePopup', {
            modal: true,
            centered: true,
            cls: 'sm1-popup sm1-ordergui-popup',
            layout: 'fit',
            hideOnMaskTap: false,
            topToolbar: true,
            bottomToolbar: true,
            title: UserContext.tryTranslate('[SELECT_QUANTITY_FOR_SIZE_AND_COLOR]'),
            items: [
                {
                    xtype: 'fieldset',
                    cls: 'sm1-gui-fieldset',
                    items: [qtyOrderField]
                },
         grid
            ],
            SM1Listeners: {
                onConfirm: confirmPopup,
                onCancel: closePopup,
                onKeyUp: function (event) {
                    switch (event.keyCode) {
                        case 13:
                            confirmPopup();
                            break;
                        case 27:
                            closePopup();
                    }
                    return false;
                }
            }
        });

        qtyOrderField.updateRows = false;
        qtyOrderField.updateValue(orderRow.get("QTYORD"));
        qtyOrderField.updateRows = true;

        SM1OrderHelper._showTime("buildSizeQuantityPopup", false, startTime);

        return popup;
    };

    this.gridBeginEdit = function (context) {
        var startDate = new Date();
        var entity = context.rowEntity;
        switch (entity.getEntityName()) {
            case SFConstants.ORDERROW:
                if (!this._getOrderRowFieldEditability(context.gui, entity, context.column.fieldName)) {
                    context.canceled = true;
                    return;
                }

                if (context.column.fieldName != "QTYINV") {
                    // apply T114 configs
                    var conf = SM1OrderHelper.getOrderRowConfig(context.column.fieldName,
                        context.gui.getDocument().get("CODTYPORD"), entity.get("CODTYPROW"), UserContext.CodDiv);
                    if (conf && conf.FLGEDITABLE == 0) {
                        context.canceled = true;
                    }
                }

                switch (context.column.fieldName) {
                    case "UMORD":
                        context.voices = SalesForceEngine.getUmVoices(context.gui.getDocument(), entity, context.gui.CacheData);
                        context.silent = true;
                        break;
                    case "QTYORD":
                        context.silent = true;
                        var order = context.gui.getDocument();
                        if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) && !SM1OrderHelper.canOnlyReduceQtyOrd(order.get("CODTYPORD"))) {
                            context.canceled = true;
                            return;
                        }
                        if (entity.get("SIZEPRESENT")) { // don't show the numpicker and show the grid with all the sizes
                            context.canceled = true;
                            XUI.showWait();
                            var store = this.buildSizeQuantityStore(context.gui, entity);
                            var grid = this.buildSizeQuantityGrid(context.gui, store, entity);
                            var popup = this.buildSizeQuantityPopup(context, entity, grid);
                            if (popup) {
                                popup.init();
                                Ext.Viewport.add(popup);
                            }
                            XUI.hideWait();
                        }
                        else {
                            SalesForceEngine.setEditCellQtyFormat(context);
                        }
                        break;
                    case "CODTYPROW":
                        context.canceled = context.canceled || !SalesForceEngine.isRowTypeEditable(context.detailContext.gui.getDocument(), entity, this._getNewNumRow());
                        context.voices = this._getRowTypeVoices(context.detailContext.gui, entity);
                        break;
                    case "CODTYPROWCAUSE":
                        context.voices = this._getRowTypeCauseVoices(entity.get("CODTYPROW"));
                        break;
                    case "QTYINV":
                        context.canceled = this._isQtyInvEditable(entity.getParentEntity(), entity) === false;
                        if (!context.canceled)
                            SalesForceEngine.setEditCellQtyFormat(context);
                        break;
                    case "UMINV":
                        //uminv is never editable, regardless of configuration
                        context.canceled = true;
                        break;
                    case "QTYORDINTEGER":
                        //take into consideration also prevs=ious value of the 'context.canceled' because it was set previous with the value from T114
                        context.canceled = context.canceled || !entity.hasValidIntegerUm();
                        break;
                    case "QTYORDREMAINDER":
                        //take into consideration also prevs=ious value of the 'context.canceled' because it was set previous with the value from T114
                        context.canceled = context.canceled || !entity.hasValidRemainderUm(context.gui.CacheData);
                        if (!context.canceled)
                            SalesForceEngine.setEditCellQtyFormat(context);
                        break;
                    case "CODQTYMODCAUSE":
                        context.canceled = !this._isCodQtyModCauseEditable(context.gui.getDocument(), entity);
                        break;
                    case "CODQTYREJCAUSE":
                        context.canceled = !this._isCodQtyRejCauseEditable(context.gui.getDocument(), entity);
                        break;
                    case "FREEGOODSDISC":
                        context.canceled = context.canceled || (entity.get("CODTYPROW") == SalesForceNameSpace.OrderRowMacroType.GIFT);
                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        var order = context.gui.getDocument();
                        var deliveryDateFieldName = SM1OrderHelper.getDeliveryDateFieldName(context.column.fieldName);
                        context.canceled = context.canceled || !this._isDeliveryQtyEditable(deliveryDateFieldName, order, entity);
                        if (!context.canceled)
                            SalesForceEngine.setEditCellQtyFormat(context);
                }
                break;
            case SFConstants.ORDERROWBATCH:
                switch (context.column.fieldName) {
                    case "QTYINV":
                        context.canceled = (this._isQtyInvEditable(entity.getParentEntity().getParentEntity(), entity.getParentEntity()) === false) || entity.isUnsellable();
                        if (!context.canceled)
                            SalesForceEngine.setEditCellQtyFormat(context);
                        break;
                    case "QTYORD":
                        if (!context.gui.CacheContext.allowBatchModifications || entity.isUnsellable())
                            context.canceled = true;
                        SalesForceEngine.setEditCellQtyFormat(context);
                        break;
                }
                break;
        }
        SM1OrderHelper._showTime("gridBeginEdit", false, startDate);
    };

    this.validateGridField = function (context) {
        var entity = context.rowEntity;
        var startTimer = new Date();
        var doc = context.gui.getDocument(); // change to suspenso if property change on ANY grid
        if (OrderParameters.getInstance(doc.get("CODTYPORD")).getSuspendOnEdit() && XApp.isEmptyOrWhitespaceString(doc.get("CODSTATUSMAN")) &&
            doc.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSLOAD && doc.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSUNLOAD) {
            doc.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
            this._setCloseButtonStatus(context.gui, doc.get("CODSTATUS"), doc.get("CODTYPORD"));
            doc.set("CODSTATUSMAN", "99");
        }

        try {
            XUI.showWait();
            switch (entity.getEntityName()) {
                case SFConstants.APPLIABLEBENEFIT:
                    switch (context.fieldName) {
                        case "IsSelected":
                            if (entity.IsAutoApply()) {
                                context.newVal = context.oldVal; // don't let the user edit the checkbox if there are auto benefits
                                XUI.hideWait();
                                return;
                            }

                            var applied = true;
                            context.gui.setModified(doc); // modify the document if you select a new benefit
                            switch (entity.get("TagString")) {
                                case SalesForceNameSpace.AppliableBenefitType.PROMO:
                                    this.promoRowChanged(context);
                                    break;
                                case SalesForceNameSpace.AppliableBenefitType.DISCOUNT:
                                    applied = this.discountRowChanged(context);
                                    break;
                                case SalesForceNameSpace.AppliableBenefitType.BUDGET:
                                case SalesForceNameSpace.AppliableBenefitType.CANVAS:
                                    entity.set("IsSelected", context.newVal); // for correct calculation of "max times appliable"
                                    applied = this.canvassRowChanged(context);
                                    break;
                            }

                            if (!applied) {
                                context.newVal = context.oldVal;
                            }
                    }

                    break;
                case SFConstants.ORDERROW:
                    switch (context.fieldName) {
                        case "QTYORD":
                            //don't synchronize the sencha entity. The whole grid will be synchronized
                            context.silent = true;
                            var msg = this._validateDeliveryQtyOrd(entity, context.newVal);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                            msg = this._validateDuplicateVirtualKitComponents(entity, entity.get("CODTYPROW"), context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                            context.rowEntity.set(context.fieldName, context.newVal);
                            context.rowEntity.calculateBenefits(context.gui.CacheData);
                            if (SM1OrderHelper.isUpdateOfOrigQtyRequired(context.gui.getDocument())) {
                                entity.set("QTYORDORIG", entity.get("QTYORD"));
                            }
                            break;
                        case "UMORD":
                            //don't synchronize the sencha entity. The whole grid will be synchronized
                            context.silent = true;
                            var msg = this._validateDuplicateVirtualKitComponents(entity, entity.get("CODTYPROW"), context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                            context.rowEntity.set(context.fieldName, context.newVal);
                            context.rowEntity.calculateBenefits(context.gui.CacheData);
                            break;
                        case "DTEDELIV":
                            // Check if the new DTEDELIV equals any Order's DTEDELIV
                            if (this._validateOrderRowDteDeliv(context.gui.getDocument(), context.newVal)) {
                                context.newVal = context.oldVal;
                            }
                            break;
                        case "CODTYPROW":
                            var msg = this._validateDuplicateVirtualKitComponents(entity, context.newVal, context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                            if (context.newVal != context.oldVal) {
                                entity.set("CODTYPROWCAUSE", "");
                            }
                            // Multiple rows for same product validation.
                            if (context.newVal != context.oldVal && SalesForceEngine.countManualRowsPerProd(context.gui.getDocument(),
                                context.rowEntity.get("CODART"), context.newVal, context.rowEntity.get("CODSRC")) > 0) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MULTIPLE_ROWS_SAME_PRODUCT]") });
                            }
                            else
                                SalesForceEngine.refreshRowSurveyMeasures(entity, context.gui.CacheData);
                            break;
                        case "QTYORDREMAINDER":
                            var msg = this._validateQtyOrdRemainder(context.rowEntity, context.newVal, context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                            }
                            break;

                    }

                default:
                    break;
            }
            //commented out for performance reasons
            //context.detailContext.refreshGui(); // refresh data
            context.detailContext.refreshControls();
            XUI.hideWait();
        } catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
        SM1OrderHelper._showTime("validateGridField", false, startTimer);
    };

    this.validateOrderRowBenefitQuantity = function (orb, args) {
        if (!orb) {
            XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.NO_BENFIT_FOUND_FOR_CONFIG]") });
            return false;
        }
        var minMaxMessage = UserContext.tryTranslate("[MOBGUIORDER.VALUE_MUST_BE_BETWEEN_MIN_AND_MAX]") + " (" + orb.get("QTYBENMIN") + " - " + orb.get("QTYBENMAX") + ")";

        var parentRow = orb.getParentEntity();
        var newDecValue = args.newVal;
        if (!parentRow) return false;
        if (orb.get("QTYBENMIN") != 0) {
            if (newDecValue < orb.get("QTYBENMIN")) {
                XUI.showInfoOk({ msg: minMaxMessage });
                return false;
            }
        }
        if (orb.get("QTYBENMAX") != 0) {
            if (newDecValue > orb.get("QTYBENMAX")) {
                XUI.showInfoOk({ msg: minMaxMessage });
                return false;
            }
        } else if (newDecValue != args.oldVal) {// @16552 
            XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.BENEFIT_NOT_MODIFIABLE]") });
            return false;
        }
        return true;
    };

    this.onGridEndEditEnded = function (context) {
        var entity = context.rowEntity;
        var order = entity.getParentEntity();
        var startTimer = new Date();
        try {
            switch (entity.getEntityName()) {
                case SFConstants.ORDERROW:
                    switch (context.fieldName) {
                        case "QTYORD":
                            this._updateOrderRowDetailAfterQtyOrdChange(entity, context.oldVal, context.gui);
                            break;
                        case "UMORD":
                            if (SalesForceEngine.existsConversionFactor(entity.get("CODART"), entity.get("UMORD"), entity.get("UMINV"), context.gui.CacheData)) {
                                entity.roundToUmDecimals(context.gui.CacheData);
                                if (SM1OrderHelper.isUpdateOfOrigQtyRequired(context.gui.getDocument())) {
                                    entity.set("QTYORDORIG", entity.get("QTYORD"));
                                }
                                this._updateQtyInvFieldValue(entity, context.oldVal, context.fieldName, context.gui.CacheData);
                                entity.convertWhsBalance(context.oldVal, context.newVal, context.gui.CacheData);
                                SM1OrderHelper.updateAdjustmentData(entity, context.gui.CacheData);
                                entity.convertBatchQtyInv(context.newVal, context.gui.CacheData);

                                if (order)
                                    order.calculateBenefits(context.gui.CacheData);

                                entity.splitQuantityFieldValue("QTYORD", entity.get("QTYORD"), context.gui.CacheData);
                                entity.splitQuantityFieldValue("WHSBALANCEORD", entity.get("WHSBALANCEORD"), context.gui.CacheData);
                            }
                            else {
                                entity.set("QTYINV", 0);
                                XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.NO_CONVERSION_UNIT]") });
                                entity._umOrdValid = false;
                            }
                            this._refreshTab(context.gui, context.gui.getDocument(), true);

                            break;
                        case "CODTYPROW":
                            if (entity.get("PRZSPEC") != 0) {
                                entity.set("PRZSPEC", 0);
                            }
                            if (entity.get("FREEGOODSDISC") != 0)
                                entity.set("FREEGOODSDISC", 0);
                            SalesForceEngine.applyPriceListOnRow(context.gui.getDocument(), entity, context.gui.CacheData);
                            SalesForceEngine.addManualHeaderDiscounts(context.gui.getDocument(), entity);
                            SalesForceEngine.getPossibleBenefitsForRow(entity, context.gui.CacheData);
                            this.refreshDiscounts(context.gui, entity, true);
                            var isWhsBalanceRefreshed = this._reloadBatches(context.gui, entity, context.oldVal, context.newVal);
                            if (!isWhsBalanceRefreshed) {
                                if (SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD")))
                                    entity.getSubEntityStore(SFConstants.ORDERROWBATCH).clear();
                                SalesForceEngine.refreshRowWhsBalance(order, entity, context.gui.CacheData);
                            }
                            break;
                        case "PRZSPEC":
                            this.refreshDiscounts(context.gui, entity, true);
                            break;
                        case "QTYINV":
                            var order = context.gui.getDocument();
                            if (!SM1OrderHelper.isADelivery(order.get("CODTYPORD")))
                                this._updateQtyOrdFieldValue(entity, context.gui.CacheData);
                            SM1OrderHelper.updateAdjustmentData(entity, context.gui.CacheData);
                            entity.splitQuantityFieldValue("QTYORD", entity.get("QTYORD"), context.gui.CacheData);
                            entity.splitQuantityFieldValue("WHSBALANCEORD", entity.get("WHSBALANCEORD"), context.gui.CacheData);
                            if (order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY &&
                                !SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD")) &&
                                SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) &&
                                SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), entity.get("CODTYPROW")) &&
                                !entity.isWhsBalanceExceeded("QTYINV")) {
                                entity.distributeInvoicedQuantityToBatches(context.gui.CacheData);
                            }
                            order.calculateBenefits(context.gui.CacheData);
                            this._refreshTab(context.gui, order, true);
                            break;
                        case "QTYORDINTEGER":
                        case "QTYORDREMAINDER":
                            entity.updateQtyOrdFieldValue(context.newVal, context.fieldName, context.gui.CacheData);
                            SM1OrderHelper.updateAdjustmentData(entity, context.gui.CacheData);
                            this._updateQtyInvFieldValue(entity, context.oldVal, context.fieldName, context.gui.CacheData);
                            this._refreshTab(context.gui, context.gui.getDocument(), true);
                            break;
                        case "FREEGOODSDISC":
                            this.refreshDiscounts(context.gui, entity, true);
                            var order = entity.getParentEntity();
                            if (order)
                                order.calculateBenefits(context.gui.CacheData);
                            break;

                        case "QTYDELIV1":
                        case "QTYDELIV2":
                        case "QTYDELIV3":
                        case "QTYDELIV4":
                        case "QTYDELIV5":
                            var order = entity.getParentEntity();
                            var prevQtyOrd = entity.get("QTYORD");
                            entity.set(context.fieldName, context.newVal);
                            this._updateOrderRowDetailAfterQtyOrdChange(entity, prevQtyOrd, context.gui);
                            this._refreshTab(context.gui, order, entity, false);
                            break;
                    }
                    if (context.oldVal != context.newVal)
                        SalesForceEngine.updateKitOnParentChanged(entity, context.fieldName, context.gui.CacheData);
                    break;
                case SFConstants.ORDERROWBATCH:

                    var order = context.gui.getDocument();
                    var orderRow = entity.getParentEntity();
                    var prod = orderRow.getProduct();

                    switch (context.fieldName) {
                        case "QTYINV":
                            //automatically update ordered quantity if the user didn't change it
                            if (prod &&
                                prod.get("FLGVARIABLEWEIGHT") &&
                                entity.get("QTYORD") == 0) {

                                entity.set("QTYORD", SalesForceEngine.convertQuantity(orderRow.get("CODART"),
                                    entity.get("QTYINV"), orderRow.get("UMINV"), orderRow.get("UMORD"), context.gui.CacheData));
                                this._refreshBatchGrid(context.detailContext);
                            }

                            //update order row QTYINV
                            orderRow.updateQtyInvFromBatch();
                            if (SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"))) {
                                orderRow.updateQtyOrdFromBatch(context.gui.CacheData);
                                SM1OrderHelper.updateAdjustmentData(orderRow, context.gui.CacheData);
                            }

                            context.detailContext.refreshGui();

                            // validate batches
                            if (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD"))) {
                                context.detailContext.detailValid = this._validateBatch(entity, orderRow, order);
                            }

                            this._refreshTab(context.gui, order, true);
                            break;
                        case "QTYORD":
                            var updateRowInv = false;
                            var order = context.gui.getDocument();
                            //automatically update invoiced quantity if the user didn't change it
                            if (prod &&
                                (!prod.get("FLGVARIABLEWEIGHT") ||
                                context.oldVal == 0 ||
                                context.oldVal == SalesForceEngine.convertQuantity(orderRow.get("CODART"),
                                    entity.get("QTYINV"), orderRow.get("UMINV"), orderRow.get("UMORD"), context.gui.CacheData, true) ||
                                SM1OrderHelper.skipQtyInvConversion(prod.get("FLGVARIABLEWEIGHT"), order.get("CODTYPORD")))) {

                                entity.set("QTYINV", SM1OrderHelper.calculateQtyInv(orderRow.get("CODART"), prod.get("FLGVARIABLEWEIGHT"), context.newVal, order.get("CODTYPORD"), orderRow.get("UMORD"), orderRow.get("UMINV"), context.gui.CacheData));
                                this._refreshBatchGrid(context.detailContext);
                                updateRowInv = true;
                            }

                            if (SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"))) {
                                orderRow.updateQtyOrdFromBatch(context.gui.CacheData);
                                SM1OrderHelper.updateAdjustmentData(orderRow, context.gui.CacheData);
                                updateRowInv = true;
                            }

                            if (updateRowInv)
                                orderRow.updateQtyInvFromBatch();

                            context.detailContext.refreshGui();

                            // validate batches
                            if (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD"))) {
                                context.detailContext.detailValid = this._validateBatch(entity, orderRow, order);
                            }

                            this._refreshTab(context.gui, order, true);
                            break;
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

        SM1OrderHelper._showTime("onGridEndEditEnded", false, startTimer);
    };

    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case SFConstants.APPLIABLEBENEFIT:
            case SFConstants.PREVIOUSORDEREDROWSINFO:
                context.visible = false;
                break;
            case SFConstants.ORDERROW:
                context.enabled = context.enabled && this._canAddOrderRow(context.gui.getDocument());
                var order = context.gui.getDocument();
                if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) ||
                    SM1OrderHelper.isAssetPickup(order.get("MACROTYPE"), order.get("CODTYPORD")))
                    context.visible = false;
                break;
            case SFConstants.ORDERROWBATCH:
                var order = context.gui.getDocument();
                var codTypOrd = order.get("CODTYPORD");
                context.enabled = context.enabled &&
                    (codTypOrd == SalesForceNameSpace.OrderCTORD.INVENTORY ||
                    SM1OrderHelper.isAStockCorrection(codTypOrd) ||
                    !SM1OrderHelper.areBatchesPreloaded(codTypOrd, context.subGui.entity.get("CODTYPROW")));
                if (SM1OrderHelper.isADelivery(codTypOrd) && !context.gui.CacheContext.allowBatchModifications)
                    context.visible = false;
                break;
        }
    };

    this.promoRowChanged = function (context) {
        var startTimer = new Date();
        var entity = context.rowEntity;
        var or = entity.get("SourceRow");
        var order = context.gui.docStore.getAt(0);
        if (context.newVal) {
            SalesForceEngine.removePromoBenefitsFromRow(entity.get("Reference"), or);
            entity.addAppliedBenefit(or);
            entity.addAppliedBenefit(null, order);
            SalesForceEngine.applyPromoBenefitsToRow(entity.get("Tag"), or, context.gui.CacheData);
        } else {
            SalesForceEngine.removePromoBenefitsFromRow(entity.get("Reference"), or);
            entity.removeAppliedBenefit(or);
            entity.removeAppliedBenefit(null, order);
            or.calculateBenefits(context.gui.CacheData);
        }
        SM1OrderHelper._showTime("promoRowChanged", false, startTimer);
    };

    this.discountRowChanged = function (context) {
        var entity = context.rowEntity;
        var startTimer = new Date();
        var or = entity.get("SourceRow");

        if (or.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.GIFT) {
            return false;
        }

        var order = context.gui.docStore.getAt(0);
        var applied = true;
        if (context.newVal) {
            applied = context.gui.CacheData.DiscountApplier.applyDiscounts(new DiscountApplier.ApplicationContext(or, null, entity.EvalDiscount));
            if (applied) {
                entity.addAppliedBenefit(or, order);
            } else {
                entity.removeAppliedBenefit(or, order);
            }
        } else {
            context.ManuallyRemovedByUser = true;
            context.gui.CacheData.DiscountApplier.removeDiscounts(new DiscountApplier.ApplicationContext(or, null, entity.EvalDiscount));
            entity.removeAppliedBenefit(or, order);
        }
        or.calculateBenefits(context.gui.CacheData);
        SM1OrderHelper._showTime("discountRowChanged", false, startTimer);
        return applied;
    };

    this.canvassRowChanged = function (context) {
        var startTimer = new Date();
        var adapter = context.rowEntity;
        var currRow = adapter.get("SourceRow");
        var order = context.gui.docStore.getAt(0);
        var rangeGroup = adapter.getCnvActGroup();

        if (context.newVal) { // checked true
            var exclGroup = SalesForceEngine.exclusionActionsPresent(adapter.getCnvActGroup(), context.gui.CacheData);
            if (exclGroup) {
                context.newVal = false;
                XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.IN_EXCLUSION_WITH_APPLIED_ACTION] " + exclGroup) });
                XLog.logWarn("Selected canvas is in exclusion with applied action " + exclGroup);
            }
            else {

                var cnvEngine = new CanvassApplier.CnvActionEngine(order);
                // update fields on the order row and doner range group;
                // this affects CalculateOrderCnvActionValue if valorization constraints are set on AZCTOAPPLY
                currRow.set("AZCTOAPPLY", cnvEngine.removeKeyFromField(currRow.get("AZCTOAPPLY"), rangeGroup.getKey()));

                var parent = rangeGroup.getParentEntity().getParentEntity();
                parent.set("CnvOrderValue", parent.calculateOrderCnvActionValue(order, context.gui.CacheData));
                var maxTimes = parent.maxTimesRangeGroupApplicable(rangeGroup);

                var grpExcl = false;
                if (parent.get("FLGEXCLGROUPS")) {
                    //cnv range group selected only for the current row
                    //check for other ranges selected only for the current row
                    if (parent.hasConstraintOnField("AZCTOAPPLY", SalesForceNameSpace.CnvTreeType.BENEFIT)) {
                        var azcToApply = currRow.get("AZCTOAPPLY");
                        var rangeGroupKey = rangeGroup.getKey();

                        var exclGrp = parent.getSubEntityStore(SFConstants.CNVACTRANGE).findBy(function (rng) {
                            return rng.getSubEntityStore(SFConstants.CNVACTRANGEGROUP).findBy(function (rngGrp) {
                                var rngGrpKey = rngGrp.getKey();
                                return rngGrpKey != rangeGroupKey && azcToApply.indexOf(rngGrpKey) >= 0;
                            }) != null;
                        });

                        grpExcl = exclGrp != null;
                    }
                    else {
                        //cnv range group selected automatically by the system for all appliable rows
                        //check for other ranges selected on all potential rows
                        grpExcl = maxTimes == 0 || cnvEngine.findDifferentGroup(parent, rangeGroup.getKey(), true) != null;
                    }
                }

                if (grpExcl) {
                    context.newVal = false;
                    //the reason for maxTimes = 0 is FLGEXCLGROUPS
                    XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.CNV_GROUP_SELECTED_FLGEXCLGROUPS]") });
                    XLog.logWarn("Selected groups are exclusive");
                    currRow.set("AZCTOAPPLY", cnvEngine.removeKeyFromField(currRow.get("AZCTOAPPLY"), rangeGroup.getKey()));
                    return false;
                }

                if (parent.get("FLGMAXRNGONLY")) {
                    var groups = cnvEngine.findGroups(parent, function (tempGroup) {
                        return (SalesForceEngine.createCanvasBenefitAdapter(tempGroup, null).isBenefitApplied(order, currRow) &&
                                    tempGroup.getParentEntity().getKey() != rangeGroup.getParentEntity().getKey() && tempGroup.get("IsSelected"));
                    });

                    if (groups && groups.length > 0) {
                        XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.MUST_SELECT_GROUPS_FROM_MAXRANGE_ONLY]") });
                        XLog.logWarn("Must select groups from maxrange only");
                        currRow.set("AZCTOAPPLY", cnvEngine.removeKeyFromField(currRow.get("AZCTOAPPLY"), rangeGroup.getKey()));
                        return false;
                    }
                }

                adapter.set("QtyRange", maxTimes);
                rangeGroup.set("QtyRange", maxTimes);
                this.applyRowCnvGroup(rangeGroup, currRow, order, context.gui);
                return true;
            }
        } else {
            this.removeRowCnvGroup(adapter, currRow, order, context.gui);
            return true;
        }
        SM1OrderHelper._showTime("canvassRowChanged", false, startTimer);
    };

    this.removeRowCnvGroup = function (adapter, selectedRow, order, gui) {
        var rGroup = adapter.getCnvActGroup();
        var cnvEngine = new CanvassApplier.CnvActionEngine(order);
        selectedRow.set("AZCTOAPPLY", cnvEngine.removeKeyFromField(selectedRow.get("AZCTOAPPLY"), rGroup.getKey()));
        adapter.removeAppliedBenefit(selectedRow, order);

        if (rGroup.getParentEntity() && rGroup.getParentEntity().getParentEntity()) {
            var cnvAction = rGroup.getParentEntity().getParentEntity();
            if (cnvAction.get("CODDISCR") != SalesForceNameSpace.CnvActionDiscretion.AUTOMATIC &&
                !cnvAction.hasConstraintOnField("AZCTOAPPLY", SalesForceNameSpace.CnvTreeType.BENEFIT)) {

                var headConstr = cnvAction.getSubEntityStore(SFConstants.CNVACTTREECONSTR).findBy(function (p) {
                    return (p.get("CODTREE") == SalesForceNameSpace.CnvTreeType.BENEFIT && p.get("IDNODE") == 0);
                });

                //remove from other rows which have benefits from current range group
                order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                    if (row.get("NUMROW") == selectedRow.get("NUMROW"))
                        return;

                    if (cnvAction.evalTreeConstraints(headConstr, row, SalesForceNameSpace.CnvTreeType.BENEFIT, false, gui.CacheData)) {
                        adapter.removeAppliedBenefit(row, order);
                        row.set("AZCTOAPPLY", cnvEngine.removeKeyFromField(row.get("AZCTOAPPLY"), rGroup.getKey()));
                    }
                });
            }
        }

        adapter.set("QtyRange", 0);
        rGroup.set("QtyRange", 0);
        //remove benefits only if it is not selected on another row
        if (!adapter.isBenefitApplied(order, null, true)) {
            adapter.removeAppliedBenefit(null, order);
            cnvEngine.removeRangeGroupBenefits(rGroup, order);
            order.m_usrIndicatedCnvGrp.remove(rGroup.getKey());
            rGroup.set("IsSelected", false);
        } else { // retry and see if any other rows dissapear
            cnvEngine.removeRangeGroupBenefits(rGroup, order);
            cnvEngine.applyCanvasBenefitsToOrder(order, rGroup.getParentEntity().getParentEntity(), rGroup.getKey(), gui.CacheData);
        }
        order.calculateBenefits(gui.CacheData);
    };

    this.applyRowCnvGroup = function (rGroup, selectedRow, order, gui) {
        rGroup.set("IsSelected", true);
        var cnvEngine = new CanvassApplier.CnvActionEngine(order);
        selectedRow.set("AZCTOAPPLY", cnvEngine.addKeyToField(selectedRow.get("AZCTOAPPLY"), rGroup.getKey()));
        cnvEngine.removeRangeGroupBenefits(rGroup, order);
        cnvEngine.applyCanvasBenefitsToOrder(order, rGroup.getParentEntity().getParentEntity(), rGroup.getKey(), gui.CacheData);

        // add this benefit in the header
        var ben = SalesForceEngine.createCanvasBenefitAdapter(rGroup, selectedRow);

        ben.addAppliedBenefit(null, order);
        ben.addAppliedBenefit(selectedRow, order);
        this._autoSelectIfHeaderBenefit(rGroup, selectedRow, order, gui.CacheData);

        order.calculateBenefits(gui.CacheData);
        order.m_usrIndicatedCnvGrp.add(rGroup.getKey());
    };

    /// <summary>
    /// As a result of workItems 13089 & 30676: If the selected group gives
    /// header benefits, auto-select it on all rows that satisfy benefit tree
    /// </summary>
    this._autoSelectIfHeaderBenefit = function (rGroup, selectedOnRow, order, cacheData) {
        if (!rGroup.getParentEntity() || !rGroup.getParentEntity().getParentEntity())
            return;

        var ca = rGroup.getParentEntity().getParentEntity();
        if (ca.hasConstraintOnField("AZCTOAPPLY", SalesForceNameSpace.CnvTreeType.BENEFIT))
            return;

        var headBen = rGroup.getSubEntityStore(SFConstants.CNVACTRANGEGROUPBENEFIT).findBy(function (b) {
            var codTypBen = b.get("CODTYPBEN");

            return codTypBen == SalesForceNameSpace.OrderBENTYP.SC_PROC_TESTA ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.SC_PIEDEORDINE ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.OM_ART_PREDEF ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.SC_IMPORT_TESTA ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.MAGGIOR_TESTA ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.SC_MERCE ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.RIGA_VENDITA ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.OMAG_PRODUCT ||
                codTypBen == SalesForceNameSpace.OrderBENTYP.OMAG_ART_SCELTA;
        });
        if (!headBen)
            return;

        var headConstr = ca.getSubEntityStore(SFConstants.CNVACTTREECONSTR).findBy(function (p) {
            return (p.get("CODTREE") == SalesForceNameSpace.CnvTreeType.BENEFIT && p.get("IDNODE") == 0);
        });

        var cnvEngine = new CanvassApplier.CnvActionEngine(order);
        var groupKey = rGroup.getKey();
        var numRow = selectedOnRow.get("NUMROW");
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (r) {
            if (r.get("CODSRC") != SalesForceNameSpace.OrderBESRC.MANUALE ||
                r.get("NUMROW") == numRow ||
                !ca.evalTreeConstraints(headConstr, r, SalesForceNameSpace.CnvTreeType.BENEFIT, true, cacheData))
                return;

            SalesForceEngine.createCanvasBenefitAdapter(rGroup, r).addAppliedBenefit(r, order);
            r.set("AZCTOAPPLY", cnvEngine.addKeyToField(r.get("AZCTOAPPLY"), groupKey));
        });
    };

    this.beforeGuiCreated = function (gui) {
        for (var i = 0; i < gui.guiConfig.children.length; i++) {
            var tab = gui.guiConfig.children[i];
            //hide anomalies tab; they are displayed in popup
            if (tab.attrs.name == "ANOMALIES") {
                tab.attrs.visible = "false";
                this.anomalyGuiSection = Ext.clone(tab.children[0].children[0]);
                break;
            }
        }
    };
    //test if column is user discount 
    this.isUserDiscount = function (colname) {
        if (!colname)
            return false;

        var userDiscounts = ["PRCDISCOUNT", "VALAMOUNTPZ", "PRZSPEC", "AUTOMATIC_", "FREEGOODSDISC"];

        for (var i = 0; i < userDiscounts.length; i++) {
            var ud = userDiscounts[i];

            if (colname.indexOf(ud) == 0)
                return true;
        }

        return false;
    };

    // order custom layout apply modifications for T112 and T114
    this.getCustomLayout = function (l, detailContext) {
        var startTimer = new Date();
        var parentEntity = detailContext.entity.getParentEntity() || detailContext.entity.newParent;

        // refresh appliable benefits grid first
        if (detailContext.entity.getEntityName() == SFConstants.ORDERROW) {
            SalesForceEngine.refreshAppliableBenefits(detailContext.entity, detailContext.gui.CacheData);
        }

        if (!detailContext.originalLayout)
            detailContext.originalLayout = l;
        var layout = Ext.clone(detailContext.originalLayout);

        if (detailContext.gui.openMode == 'VIEW' && layout.attrs.baseObject == SFConstants.ORDERROW) {
            try {
                // find grid and disable columns
                var applicableBenefitsSection = JsonXmlHelper.filterNodesByAttr(layout.children, "caption", "APPLIABLEBENEFITS");
                if (applicableBenefitsSection != null && applicableBenefitsSection.length > 0) {
                    var appBenGrid = JsonXmlHelper.selectChildByName(applicableBenefitsSection[0], "grid");
                    if (appBenGrid != null) {
                        var columns = JsonXmlHelper.selectChildrenByName(appBenGrid, "column");
                        if (columns != null && columns.length > 0) {
                            var isSelectedCol = JsonXmlHelper.filterNodesByAttr(columns, "name", "IsSelected");
                            if (isSelectedCol != null && isSelectedCol.length > 0) {
                                isSelectedCol[0].attrs.editable = "false";
                            }
                        }
                    }
                }

            } catch (ex) {
                XLog.logWarn("Check AppliableBenefits grid layout, switch to editable = false failed");
            }
        }

        switch (detailContext.tabName) {
            case "ROWS":
                for (var i = 0; i < layout.children.length; i++) {
                    var c = layout.children[i];

                    switch (c.attrs["caption"]) {
                        case ("APPLIABLEBENEFITS"):
                            if (detailContext.entity.get("SIZEPRESENT")) {
                                if (!detailContext.entity.gridSection) {
                                    var gridSection = Ext.clone(c);
                                    gridSection.attrs["caption"] = "SIZEQUANTITY";
                                    detailContext.entity.gridSection = gridSection;
                                }

                                // create the configs for the size grid and show it 
                                layout.children.push(detailContext.entity.gridSection);
                            }
                            break;
                        case ("ORDERROW"):
                            {
                                parentEntity = parentEntity || detailContext.gui.getDocument();
                                if (parentEntity == null)
                                    return l;

                                var defaultRowType = this._getDefaultOrderRowType(parentEntity);

                                for (var k in c.children) {
                                    var child = c.children[k];

                                    // apply T112 configurations here
                                    var configVisibility = SM1OrderHelper.interpretVisibilityConfigs(child.attrs.name,
                                        parentEntity.get("CODTYPORD"),
                                        SM1OrderHelper.getStatusGroup(parentEntity.get("CODSTATUS")),
                                        parentEntity.get("CODDIV"));
                                    switch (configVisibility.Visibility) {
                                        case SalesForceNameSpace.TA112OrdVisibility.VISIBLE:
                                            child.attrs.visible = "true";
                                            break;
                                        case SalesForceNameSpace.TA112OrdVisibility.HIDDEN:
                                            child.attrs.visible = "false";
                                            break;
                                    }

                                    //@22759 for ommagio rows the discount fields will have the default will be editable = false;
                                    if (this.isUserDiscount(child.attrs.name) &&
                                        detailContext.entity.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.GIFT) {
                                        child.attrs.editable = "false";
                                    }

                                    // apply T114 configurations here
                                    var typrow;
                                    var coddiv = parentEntity.get("CODDIV");
                                    var typord = parentEntity.get("CODTYPORD");
                                    if (XApp.isEmptyString(detailContext.entity.get("CODART"))) {
                                        //popup for adding a row by typing in codart
                                        //row type is not known in this point
                                        typrow = defaultRowType;
                                    }
                                    else {
                                        typrow = detailContext.entity.get("CODTYPROW");
                                    }

                                    var conf = SM1OrderHelper.getOrderRowConfig(child.attrs.name, typord, typrow, coddiv);
                                    if (conf) {
                                        child.attrs.editable = (conf["FLGEDITABLE"] != 0 && conf["FLGEDITABLE"] != false) ? "true" : "false";
                                    }

                                    if (child.attrs.editable == "false" && this.isUserDiscount(child.attrs.name)) {
                                        detailContext.entity.set(child.attrs.name, 0); // this will trigger to remove the manual discounts given if the configuration specifies it to be readonly
                                    }

                                    switch (child.attrs.name) {
                                        case "QTYINV":
                                            var isQtyInvEditable = this._isQtyInvEditable(parentEntity, detailContext.entity);
                                            if (isQtyInvEditable != undefined)
                                                child.attrs.editable = isQtyInvEditable ? "true" : "false";
                                            break;
                                        case "QTYDELIV2":
                                        case "QTYDELIV3":
                                        case "QTYDELIV4":
                                        case "QTYDELIV5":
                                            var fieldIndex = child.attrs.name.substr(child.attrs.name.length - 1, 1);
                                            var optionalDeliveryDatesNumber = OrderParameters.getInstance(parentEntity.get("CODTYPORD")).getOrderNrDelivDte();
                                            if (optionalDeliveryDatesNumber < fieldIndex)
                                                child.attrs.visible = "false";
                                            break;
                                    }
                                }
                            }
                            break;
                        case ("GRID"):
                            {
                                c.attrs["usePopupOnPhone"] = "true";
                                if (XApp.isPhone()) {
                                    c.attrs["startExpanded"] = "false";
                                    c.attrs["scrollable"] = "true";
                                    layout.attrs["scrollable"] = "true";
                                }//else we consider the settings from SilverlightGuiModel/touch ui configuration.

                                var gridConfig = JsonXmlHelper.selectChildByName(c, "grid");
                                var typord = detailContext.entity.get("CODTYPORD");
                                var typstatusgroup = SM1OrderHelper.getStatusGroup(detailContext.entity.get("CODSTATUS"));
                                var codDiv = detailContext.entity.get("CODDIV");

                                //remove columns hidden by model AND t112
                                gridConfig.children = Ext.Array.filter(gridConfig.children,
                                    function (col) {
                                        var configVisibility = SM1OrderHelper.interpretVisibilityConfigs(col.attrs.name, typord, typstatusgroup, codDiv);
                                        switch (configVisibility.Visibility) {
                                            case SalesForceNameSpace.TA112OrdVisibility.VISIBLE:
                                                // The configured column width specified in T112ORDERROWVISIBILITY(always in %) overrides the width from SilverlightGUIModel.
                                                if (configVisibility.ColumnWidth > 0) {
                                                    col.attrs.width = configVisibility.ColumnWidth + '%';
                                                }
                                                //visibility specified in T112ORDERROWVISIBILITY overrides the visibility from SilverlightGUIModel
                                                col.attrs.visible = "true";
                                                return true;
                                            case SalesForceNameSpace.TA112OrdVisibility.HIDDEN:
                                                return false || (col.attrs.filter && col.attrs.filter.toLowerCase() == "true"); //don't remove filterable columns because they are needed in the sencha store for filtering
                                            case SalesForceNameSpace.TA112OrdVisibility.NOTFOUND:
                                                return !col.attrs.visible || col.attrs.visible != 'false' || (col.attrs.filter && col.attrs.filter.toLowerCase() == "true");
                                        }
                                    }, this);

                                //T114 configs can not be applied here because they are pero row type
                                //and grid rows could have several types
                                //managed in gridBeginEdit

                                for (var i in gridConfig.children) {
                                    var col = gridConfig.children[i];

                                    //other configs
                                    switch (col.attrs.name) {
                                        case "QTYORD":
                                            col.attrs.minVal = 0;
                                            col.attrs.maxVal = 999999;
                                            break;
                                        case "UMORD":
                                            col.attrs.editable = SM1OrderHelper.isUmReadOnly(detailContext.entity) ? "false" : col.attrs.editable;
                                            break;
                                        case "QTYDELIV2":
                                        case "QTYDELIV3":
                                        case "QTYDELIV4":
                                        case "QTYDELIV5":
                                            var fieldIndex = col.attrs.name.substr(col.attrs.name.length - 1, 1);
                                            var optionalDeliveryDatesNumber = OrderParameters.getInstance(detailContext.entity.get("CODTYPORD")).getOrderNrDelivDte();
                                            if (optionalDeliveryDatesNumber < fieldIndex)
                                                col.attrs.visible = "false";
                                            break;
                                    }
                                }
                            }
                            break;
                        case "BATCHGRID":
                            var batchSection = JsonXmlHelper.filterNodesByAttr(layout.children, "caption", "BATCHGRID");
                            if (batchSection != null && batchSection.length > 0) {
                                var batchGrid = JsonXmlHelper.selectChildByName(batchSection[0], "grid");
                                if (batchGrid != null) {
                                    var columns = JsonXmlHelper.selectChildrenByName(batchGrid, "column");
                                    if (columns != null && columns.length > 0) {

                                        var order = detailContext.gui.getDocument();
                                        var orderRow = detailContext.entity;

                                        var isQtyInvEditable = this._isQtyInvEditable(order, orderRow);
                                        var isQtyInvVisible = this._isQtyInvVisible(order, orderRow);

                                        //disable / hide QTYINV if product is not variable weight
                                        var qtyInvCol = JsonXmlHelper.filterNodesByAttr(columns, "name", "QTYINV");
                                        if (qtyInvCol != null && qtyInvCol.length > 0) {
                                            if (isQtyInvVisible === false) {
                                                columns = Ext.Array.remove(columns, qtyInvCol[0]);
                                            }
                                            else {
                                                if (isQtyInvEditable != undefined) {
                                                    qtyInvCol[0].attrs.editable = isQtyInvEditable ? "true" : "false";
                                                }
                                            }
                                        }

                                        //hide WHSBALANCEINV if QTYINV is not visible
                                        if (isQtyInvVisible === false) {
                                            var whsBalInvCol = JsonXmlHelper.filterNodesByAttr(columns, "name", "WHSBALANCEINV");
                                            if (whsBalInvCol != null && whsBalInvCol.length > 0) {
                                                columns = Ext.Array.remove(columns, whsBalInvCol[0]);
                                            }
                                        }

                                        batchGrid.children = columns;
                                    }
                                }
                            }
                            break;
                        case "BATCHDETAIL":
                            //some order row T112 and T114 configs apply also here
                            var order = detailContext.gui.getDocument();
                            var orderRow = detailContext.parentCtrl.entity;

                            var isQtyInvEditable = this._isQtyInvEditable(order, orderRow);
                            var isQtyInvVisible = this._isQtyInvVisible(order, orderRow);

                            for (var k in c.children) {
                                var child = c.children[k];

                                switch (child.attrs.name) {
                                    case "QTYINV":
                                        if (isQtyInvVisible != undefined) {
                                            child.attrs.visible = isQtyInvVisible ? "true" : "false";
                                        }
                                        if (isQtyInvEditable != undefined) {
                                            child.attrs.editable = isQtyInvEditable ? "true" : "false";
                                        }
                                        break;
                                    case "WHSBALANCEINV":
                                        if (isQtyInvVisible != undefined) {
                                            child.attrs.visible = isQtyInvVisible ? "true" : "false";
                                        }
                                        break;
                                }
                            }

                            break;
                    }
                }
                break;
            case "MAIN":
                if (OrderParameters.getInstance(detailContext.entity.get("CODTYPORD")).getOrderNrDelivDte() <= 1) {
                    //hide multiple delivery dates section
                    var delivDatesSectionConfig = JsonXmlHelper.filterNodesByAttr(layout.children, "caption", "MULTIPLE_DATES");
                    if (delivDatesSectionConfig && delivDatesSectionConfig.length > 0) {
                        delivDatesSectionConfig[0].attrs.visible = "false";
                    }
                }
                break;
        }

        SM1OrderHelper._showTime("getCustomLayout", false, startTimer);
        return layout;
    };

    this.removeUserDiscounts = function (entity, newVal) {

        // remove appliable benefits for non gift rows
        if (entity.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.GIFT) {
            return;
        }

        var toRemove = entity.getSubEntityStore("AppliableBenefit").filterToStore(function (a) {
            return a.get("TagString") == SalesForceNameSpace.AppliableBenefitType.PROMO ||
                a.get("TagString") == SalesForceNameSpace.AppliableBenefitType.DISCOUNT;
        });
        entity.getSubEntityStore("AppliableBenefit").removeAll(toRemove);

        var typrow = newVal ? newVal : entity.get("CODTYPROW");
        var typord = (entity.getParentEntity() == null) ? entity.newParent.get("CODTYPORD") : entity.getParentEntity().get("CODTYPORD");

        var configs = SM1OrderHelper.getOrderRowConfigs(typord, typrow, UserContext.CodDiv);
        var conf;
        for (var colName in configs) {
            conf = configs[colName];

            if (this.isUserDiscount(conf["COLUMNNAME"])) {
                var editable = (conf["FLGEDITABLE"] != 0 && conf["FLGEDITABLE"] != false);
                if (!editable) {
                    entity.set(conf["COLUMNNAME"], 0); // this will trigger to remove the manual discounts given if the configuration specifies it to be readonly
                }
            }
        }
    };

    // filter the CODTYPORD values in the combo for only the ones specific for the selected customer
    this.getQtabsVoices = function (fieldContext) {
        var entity = fieldContext.sectionContext.entity;

        switch (fieldContext.fieldName) {
            case "CODTYPORD":

                if (!XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(entity)) ||
                    fieldContext.config.attrs.editable === "false") {
                    //since the order/field is not editable, don't filter order types to allow decoding for UI
                    return;
                }

                var codParty = entity.get('CODCUSTDELIV');
                var newVoices = SalesForceEngine.filterVoicesForCTORD(codParty);
                var orderTypeAllowed = false;
                var codTypOrd = entity.get("CODTYPORD");

                for (i = 0; i < newVoices.length; i++) {
                    var val = newVoices[i];
                    orderTypeAllowed = orderTypeAllowed || val.value == codTypOrd;
                }

                if (newVoices.length == 0) {
                    XLog.logErr("Configuration error, check the DB config for CANORDER rights in the NAV_MOB_CUST and the NAV_MOB_ORDERS, in current case no order type can be defined");
                    XUI.showMsgBox({
                        title: "[MOB.ORDER]",
                        msg: UserContext.tryTranslate("[MOBGUIORDER.CANORDER_CONFIGURATION_ERROR]"),
                        buttons: 'OK',
                        onResult: function (context) {
                            if (context == 'OK') {
                                XHistory.back();
                                XUI.hideWait();
                            }
                        }
                    });
                }
                fieldContext["voices"] = newVoices;

                if (!orderTypeAllowed) {
                    entity.set("CODTYPORD", "");
                }

                break;
            case "UMORD":
                if (entity.getEntityName() == SFConstants.ORDERROW &&
                    !XApp.isEmptyOrWhitespaceString(entity.get("CODART")) &&
                    entity._codArtValid != false) {
                    var gui = fieldContext.sectionContext.gui;
                    fieldContext["voices"] = SalesForceEngine.getUmVoices(gui.getDocument(), entity, gui.CacheData);
                }
                break;

            case "CODTYPROW":
                var selectedRowType = fieldContext.sectionContext.entity.get("CODTYPROW");
                if (!XApp.isEmptyOrWhitespaceString(entity.get("CODART")) && entity._codArtValid != false) {
                    fieldContext["voices"] = this._getRowTypeVoices(fieldContext.sectionContext.gui, entity);
                    //select the row type if there's only one row type
                    if (XApp.isEmptyOrWhitespaceString(selectedRowType) && fieldContext["voices"].length == 1 && fieldContext.voices[0].value)
                        fieldContext.sectionContext.entity.set("CODTYPROW", fieldContext.voices[0].value);
                }
                break;

            case "CODTYPROWCAUSE":
                if (!XApp.isEmptyOrWhitespaceString(entity.get("CODART")) && entity._codArtValid != false) {
                    fieldContext["voices"] = this._getRowTypeCauseVoices(entity.get("CODTYPROW"));
                }
                break;
            case "CODWHS":
                fieldContext["voices"] = this._getWhsVoices(entity.get("MACROTYPE"));
                break;
        }
    };

    this.afterNewDocument = function (gui, options) {
        var ord = gui.getDocument();
        var startTimer = new Date();


        if (options.orderCopy) {
            gui.docStore.removeAll();
            options.orderCopy.set("DTECRE", new Date());
            gui.docStore.add(options.orderCopy);
            var order = gui.docStore.getAt(0);

            if (OrderParameters.getInstance(order.get("CODTYPORD")).getSuspendOnEdit() &&
                XApp.isEmptyOrWhitespaceString(order.get("CODSTATUSMAN")) &&
                gui.isEditable()) {
                order.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
                order.set("CODSTATUSMAN", "99");
            }

            gui.setModified(gui.docStore.getAt(0));
            return;
        }

        var obj = gui.docStore.getAt(0);
        var row = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(options.codParty));
        // set data to order from the customer
        var startTimer1 = new Date();
        SM1OrderHelper.copyDataFromDeliveryCust(options.navId, obj, row, options.orderDate, options.orderType, false, options.posCodParty);
        SM1OrderHelper._showTime("SM1OrderHelper.copyDataFromDeliveryCus", false, startTimer1);

        if (OrderParameters.getInstance(obj.get("CODTYPORD")).getSuspendOnEdit()) {
            obj.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
            obj.set("CODSTATUSMAN", "99");
        } else
            obj.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);

        obj.set("CODEUSR", UserContext.CodUsr);

        //Integration with Sales Execution Order Management
        if (options.idSurvey) {
            obj.set("IDSURVEY", options.idSurvey);
            gui.setModified(obj);
        }

        SM1OrderHelper._showTime("afterNewDocument", false, startTimer);
    };

    this.beforeCallSelector = function (context, selname, config) {
        var startTimer = new Date();
        if (selname == "NAV_MOB_PROD") {
            //set return/empty flags
            this._isAddReturn = config.isReturn;
            this._isAddEmpty = config.isEmpty;

            var order = context.entity;
            var cons = null;

            if (SM1OrderHelper.isWarehouseCheckRequired(order.get("CODTYPORD")) &&
                XApp.isEmptyOrWhitespaceString(order.get("CODWHS")) && !this._isAddReturn && !this._isAddEmpty) {
                //no products can be added because the warehouse is not known
                cons = new XConstraint({
                    attr: "CODART",
                    op: SqlRelationalOperator.Equal,
                    value: ""
                });
            }
            else {
                var assortmentConstraints = this.getAssortmentConstraints(order, context.gui);
                var priceListConstraints = this.getPriceListConstraints(order, context.gui);
                //add constraint to add virtual kits even if they do not have price list
                priceListConstraints.Constraints.push(new XConstraint("FLGVIRTUALKIT", "=", true));

                var mUserGroup = UsrGroup.getGroup(UserContext.CodGrp);
                var xconstr = UsrGroup.getRightExprAsConstraints(mUserGroup, selname, "CANBEORDERED_" + order.get('CODTYPORD'));
                cons = new XConstraints({ logicalOp: "AND" });

                if (xconstr) {
                    cons.Constraints.push(xconstr);
                }

                if (!context.gui.CacheData.m_cacheAssortments || context.gui.CacheData.m_cacheAssortments.isEmpty() || !context.gui.CacheData.m_cacheAssortments.isMandatory) {
                    if (!OrderParameters.getInstance(order.get("CODTYPORD")).getNoListAllowed() && priceListConstraints)
                        cons.Constraints.push(priceListConstraints);
                }
                else {
                    var skipControlGiftMandatoryAsso = OrderParameters.getInstance(order.get("CODTYPORD")).getSkipControlGiftMandatoryAss();
                    var skipControlReturnMandatoryAsso = OrderParameters.getInstance(order.get("CODTYPORD")).getSkipControlReturnMandatoryAss();
                    var rowTypes = SM1OrderHelper.getOrderRowTypes(order.get("CODTYPORD"), UserContext.CodDiv);
                    var orderCanHaveGiftRows = rowTypes.some(function (row) {
                        return row.CODTYPROW == SalesForceNameSpace.OrderRowMacroType.GIFT;
                    });
                    var orderCanHaveReturnRows = rowTypes.some(function (row) {
                        return row.CODTYPROW == SalesForceNameSpace.OrderRowMacroType.RETURN;
                    });

                    if (!OrderParameters.getInstance(order.get("CODTYPORD")).getNoListAllowed() && priceListConstraints) {
                        cons.Constraints.push(priceListConstraints);
                    }

                    var assortmentRelatedConstraints = new XConstraints({ logicalOp: 'OR' });
                    if (assortmentConstraints)
                        assortmentRelatedConstraints.Constraints.push(assortmentConstraints);

                    if (!this._isAddReturn && !this._isAddEmpty && skipControlGiftMandatoryAsso && orderCanHaveGiftRows)
                        assortmentRelatedConstraints.Constraints.push(new XConstraint("FLGGIFT", "=", -1));

                    if (this._isAddReturn && skipControlReturnMandatoryAsso && orderCanHaveReturnRows)
                        assortmentRelatedConstraints.Constraints.push(new XConstraint("FLGRETURNABLE", "=", -1));

                    if (assortmentRelatedConstraints.Constraints.length)
                        cons.Constraints.push(assortmentRelatedConstraints);
                }

                if (SM1OrderHelper.isWarehouseCheckRequired(order.get("CODTYPORD")) && !this._isAddReturn && !this._isAddEmpty) {
                    //products need to be in the warehouse
                    var whsCons = this.getWarehouseConstraints(context.gui.CacheData.m_whsBalances, order.get("CODWHS"), order.get("CODTYPORD"));
                    if (whsCons)
                        cons.Constraints.push(whsCons);
                }
            }
            if (!config.hiddenConstraints) {
                config.hiddenConstraints = cons;
            }
            else {
                //merge current constraints with existing ones (e.g.: add return/empty products)
                config.hiddenConstraints = new XConstraints({
                    logicalOp: "AND",
                    constraints: [config.hiddenConstraints, cons]
                });
            }
        }
        SM1OrderHelper._showTime("beforeCallSelector", false, startTimer);
    };

    this.getPriceListConstraints = function (order, gui) {
        var startTimer = new Date();
        if (gui.CacheData.m_evalPriceListCollection || gui.CacheData.m_giftEvalPriceListCollection || gui.CacheData.m_returnEvalPriceListCollection) {
            var codArts = {};

            var addProducts = function (p) {
                if (!p.FLGTAXES) {
                    codArts[p.CODART] = true;
                }
            };

            gui.CacheData.m_evalPriceListCollection.each(addProducts);
            gui.CacheData.m_giftEvalPriceListCollection.each(addProducts);
            gui.CacheData.m_returnEvalPriceListCollection.each(addProducts);

            var codartCons = new XConstraint({
                attr: "CODART",
                op: SqlRelationalOperator.In,
                value: codArts
            });

            var giftArtConstr = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("FLGGIFT", "=", -1),
                    new XConstraint("CODSTATUS", "=", 0)
                ]
            });

            var cons = new XConstraints({
                logicalOp: 'OR',
                constraints: [
                    codartCons
                ]
            });

            if (OrderParameters.getInstance(order.get("CODTYPORD")).getNoListAllowedGiftRow())
                cons.Constraints.push(giftArtConstr);
            SM1OrderHelper._showTime("getPriceListConstraints", false, startTimer);
            return cons;
        }
        SM1OrderHelper._showTime("getPriceListConstraints", false, startTimer);

        return null;
    };

    this.getAssortmentConstraints = function (order, gui) {
        var startTimer = new Date();
        if (!gui.CacheData.m_cacheAssortments || gui.CacheData.m_cacheAssortments.isEmpty())
            return null;

        if (!gui.CacheData.m_cacheAssortments.isMandatory || XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE")))
            return null;

        var orderAssortmentLocation = SFConstants.EMPTYCODLOCATION;
        if (order && !XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")))
            orderAssortmentLocation = order.get("CODLOCATION");

        var codArts = [];
        gui.CacheData.m_cacheAssortments.each(function (p) {
            if (p.CODLOCATION == orderAssortmentLocation) {
                codArts.push(p.CODART);
            }
        });

        var codartCons = new XConstraint({
            attr: "CODART",
            op: SqlRelationalOperator.In,
            value: codArts
        });

        SM1OrderHelper._showTime("getAssortmentConstraints", false, startTimer);
        return codartCons;
    };

    this.getAssortmentAndPriceListConstraints = function (order, gui) {
        var startTimer = new Date();
        var codArts = this.intersectAssoAndPriceProducts(order, gui);

        var codartCons = new XConstraint({
            attr: "CODART",
            op: SqlRelationalOperator.In,
            value: codArts
        });

        if (OrderParameters.getInstance(order.get("CODTYPORD")).getNoListAllowedGiftRow()) {
            var giftArtConstr = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("FLGGIFT", "=", -1),
                    new XConstraint("CODSTATUS", "=", 0)
                ]
            });

            var cons = new XConstraints({
                logicalOp: 'OR',
                constraints: [
                    codartCons,
                    giftArtConstr
                ]
            });

            SM1OrderHelper._showTime("getAssortmentAndPriceListConstraints", false, startTimer);
            return cons;
        }

        SM1OrderHelper._showTime("getAssortmentAndPriceListConstraints", false, startTimer);
        return codartCons;
    };

    this.intersectAssoAndPriceProducts = function (order, gui) {
        var assoProducts = [];
        var priceListProducts = [];

        var orderAssortmentLocation = SFConstants.EMPTYCODLOCATION;
        if (order && !XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")))
            orderAssortmentLocation = order.get("CODLOCATION");

        gui.CacheData.m_cacheAssortments.each(function (p) {
            if (p.CODLOCATION == orderAssortmentLocation) {
                assoProducts.push(p.CODART);
            }
        });

        gui.CacheData.m_evalPriceListCollection.each(function (p) {
            if (!p.FLGTAXES) {
                priceListProducts.push(p.CODART);
            }
        });

        return Ext.Array.intersect(assoProducts, priceListProducts);
    };

    this.getWarehouseConstraints = function (whsBalances, codWhs, codTypOrd) {

        var whs = whsBalances[codWhs];
        if (!whs) {
            XLog.logWarn("Warehouse data not found: " + codWhs, true);
            return null;
        }

        var balance = whs.OrdProdWhsBalances;

        if (!balance)
            return null;

        var allowProductsWithZeroOrdBalance = OrderParameters.getInstance(codTypOrd).getAllowProductsWithZeroOrdBalance();

        var codArts = [];
        for (var i in balance)
            if (allowProductsWithZeroOrdBalance) {
                codArts.push(balance[i].CODART);
            }
            else {
                if (balance[i].QTYORD > 0)
                    codArts.push(balance[i].CODART);
            }

        return new XConstraint({
            attr: "CODART",
            op: SqlRelationalOperator.In,
            value: codArts
        });
    };

    this.afterCloseHandler = function (context) {
        var gui = context.ctrl.gui;

        if (context.ctrl.entityName == SFConstants.ORDERROW) {
            delete this._newNumRow;
        }

        if (context.ctrl.entityName == SFConstants.ORDERROWBATCH) {
            gui.subDetailCtrl = gui.OrderRowPopupContext.detailContext;
        }

        if (context.opt.reason == "CANCEL") {
            return;
        }

        var order = gui.getDocument();

        switch (context.ctrl.entityName) {
            case SFConstants.ORDERROW:
                var orderRow = context.ctrl.entity;
                if (context.opt.reason == "REMOVE" &&
                    (XApp.isEmptyOrWhitespaceString(orderRow.get("CODART")) || orderRow._codArtValid == false)) {
                    return;
                }

                orderRow.isNew = false;

                if (XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order))) {
                    if (context.opt.reason != "REMOVE")
                        SalesForceEngine.getPossibleBenefitsForRow(orderRow, gui.CacheData);
                    this.refreshBalance(gui.getDocument(), gui.CacheData, gui);
                    SalesForceEngine.refreshCanvasActions(gui.getDocument(), gui.CacheData);
                    this._refreshTab(gui, order, true);
                    this._checkForDiscardedOrderRowsBenefits(gui);
                }
                else {
                    var rowDetailContext = gui.tabCtrls["ROWS"];
                    if (rowDetailContext) {
                        if (rowDetailContext.sections["GRID"]) {
                            var selectedIndex = this._getSelectedRowIndex(rowDetailContext);
                            this._selectOrderRow(rowDetailContext, selectedIndex);
                        }
                    }
                }
                break;
            case SFConstants.ORDERROWBATCH:
                var orderRowDetailContext = context.ctrl.parentCtrl;
                var orderRow = orderRowDetailContext.entity;
                orderRow.updateQtyInvFromBatch(context.opt.reason == "REMOVE");
                if (SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"))) {
                    orderRow.updateQtyOrdFromBatch(gui.CacheData, context.opt.reason == "REMOVE");
                    SM1OrderHelper.updateAdjustmentData(orderRow, gui.CacheData);
                }
                orderRowDetailContext.refreshGui();
                this._refreshTab(gui, order, true);
                break;
        }
    };

    this.refreshBalance = function (order, cacheData, gui) {
        var budgetGroupIds = [];
        var orderClone;
        var self;
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            var appBens = row.getSubEntityStore("AppliableBenefit");
            var orderRowBens = row.getSubEntityStore(SFConstants.ORDERROWBENEFIT);

            if (appBens) {
                appBens.each(function (appliableBenefit) {
                    if (appliableBenefit.get("TagString") == SalesForceNameSpace.AppliableBenefitType.BUDGET &&
                        !XApp.isEmptyOrWhitespaceString(appliableBenefit.get("Reference"))) {
                        if (budgetGroupIds.indexOf(appliableBenefit.get("Reference")) == -1) {
                            budgetGroupIds.push(appliableBenefit.get("Reference"));
                        }
                    }
                });
            }

            if (orderRowBens) {
                orderRowBens.each(function (rowBen) {
                    if (rowBen.get("CODSRC") == SalesForceNameSpace.OrderBESRC.BUDGET &&
                        !XApp.isEmptyOrWhitespaceString(rowBen.get("CODSRCREF"))) {
                        var split = [];
                        split = rowBen.get("CODSRCREF").split('|');
                        if (split) {
                            var idBudgetGroup = split[0].replace("CnvActRangeGroupBenefit", "");
                            if (idBudgetGroup) {
                                if (budgetGroupIds.indexOf(idBudgetGroup) == -1) {
                                    budgetGroupIds.push(idBudgetGroup);
                                }
                            }
                        }
                    }
                });
            }
            row.set("BUDGETBALANCE", -Infinity);
        });

        if (budgetGroupIds.length != 0) {
            self = this;
            orderClone = order.clone();
            this._clearExtraEntities(orderClone);
            SalesForceEngine.getBudgetBalance(budgetGroupIds, orderClone,
                function () {
                },
                function (response) {
                    if (response) {
                        for (var idBudgetGroup in response) {
                            if (response.hasOwnProperty(idBudgetGroup) && XApp.isOnline()) {
                                if (cacheData.BudgetBalanceValues[idBudgetGroup] == undefined) {
                                    cacheData.BudgetBalanceValues[idBudgetGroup] = response[idBudgetGroup];
                                }
                            }
                        }

                        SalesForceEngine.refreshOrderRowBudgetBalance(cacheData.BudgetBalanceValues, order);
                        SalesForceEngine.refreshAppliableBenefitsBalance(cacheData.BudgetBalanceValues, order);
                        self._refreshTab(gui, order, true, false);

                    }
                });
        }
    };

    this.setBudgetBalanceToEmpty = function (order) {
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            row.set("BUDGETBALANCE", -Infinity);
        });
    };

    this.applyDataToNewOrderRow = function (gui, entity, codArt, checkRights, isReturn, scannedCode) {
        var order = gui.getDocument();
        entity.newParent = order;


        var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(codArt, order.get("CODDIV")));
        if (!artRow) {
            return SalesForceNameSpace.OrderErrorCodes.INVALID_COD_ART;
        }
        var defaultRowType = this._getDefaultOrderRowType(order, artRow.get("FLGGIFT") != 0, isReturn);
        var balance = SM1OrderHelper.checkProdInWarehouse(order, codArt, defaultRowType, gui.CacheData);
        if (!balance) {
            return SalesForceNameSpace.OrderErrorCodes.PRODUCT_NOTPRESENT_INWAREHOUSE;
        } else {
            var allowProductsWithZeroOrdBalance = OrderParameters.getInstance(order.get("CODTYPORD")).getAllowProductsWithZeroOrdBalance();
            if (SM1OrderHelper.getSellableWhsOp(defaultRowType) == SalesForceNameSpace.WarehouseOperation.SUBSTRACT &&
                !allowProductsWithZeroOrdBalance && balance.QTYORD == 0)
                return SalesForceNameSpace.OrderErrorCodes.PRODUCT_NOTPRESENT_INWAREHOUSE;
        }
        var errCode = SalesForceEngine.canOrderProduct(artRow, defaultRowType, order, gui.CacheData, checkRights, entity.get("CODSRC"), undefined, scannedCode);

        // Multiple rows for same product is an "exception" error that is handled later in UI.
        if (XApp.isEmptyOrWhitespaceString(errCode) || errCode == SalesForceNameSpace.OrderErrorCodes.MULTIPLE_ROWS_SAME_PRODUCT) {
            order.CreateNewOrderRow(entity, artRow, defaultRowType, "", null, SalesForceNameSpace.OrderBESRC.MANUALE, gui.CacheData, scannedCode);
            order.addRow(entity);

            SalesForceEngine.applySelectedPromoToNewRow(entity, gui.CacheData);
            SalesForceEngine.getPossibleBenefitsForRow(entity, gui.CacheData);
        }

        return errCode;
    };

    /*
    context {
    gui:              source gui
    subGui:           sub gui
    detailEntityName: entity name of the detail
    newEntity:        newEntity
    parentEntity:     parent entity
    selectorKey:      if from selector
    }
    */
    this.newDetail = function (context) {
        switch (context.detailEntityName) {
            case SFConstants.ORDERROW:
                if (!XApp.isEmptyOrWhitespaceString(context.selectorKey)) {
                    //new detail from selector
                    var codArt = context.selectorKey.split("|")[1];
                    var order = context.parentEntity;

                    var skipExecution = this._newOrderRow(codArt, context.newEntity, order, context.gui, false, (this._isAddReturn || this._isAddEmpty));
                    if (skipExecution)
                        return true;

                    SalesForceEngine.refreshCanvasActions(order, context.gui.CacheData);

                    //UI
                    if (context.listStore) {
                        //show also the kit components
                        if (context.newEntity.get("FLGARTKIT"))
                            this._refreshTab(context.gui, order, true);

                        var senchaEntity = context.newEntity.toSenchaEntity({ senchaEntityName: context.listStore.getModel().getName() });
                        context.listStore.add(senchaEntity);
                        context.senchaEntity = senchaEntity;
                    }

                    var tab = context.gui.tabCtrls.ROWS;
                    var gridSection = tab.sections.GRID;
                    // if exist filter on products collection then remove it
                    var existFilter = context.listStore.getAllCount() - context.listStore.getCount() != 0;
                    if (existFilter) {
                        context.listStore.clearFilter();
                        gridSection.searchField.reset();
                        gridSection.grid.resetFilterSection(false);
                    }

                    var index;
                    if (context.senchaEntity)
                        index = context.listStore.indexOf(context.senchaEntity);

                    context.ctrl.openSubDetailFromList(context.listStore, gridSection.grid, index, context.detailEntityName, context.sectionContext);

                    return true; // to stop execution and not show popup
                }
                else {
                    var self = this;

                    //new detail from add functionality - cod art typed in by user
                    context.gui.openSubDetail({
                        isNewDetail: false, //to generate remove button
                        newEntity: context.newEntity,
                        entityName: context.detailEntityName,
                        parentCtrl: context.ctrl,
                        afterCloseHandler: Ext.emptyFn
                    });

                    //to stop execution and not show popup
                    //don't use the framework behaviour, because the same order row will be added twice
                    return true;
                }
                break;
            case SFConstants.ORDERROWBATCH:
                var orderRow = context.parentEntity;
                var batch = context.newEntity;
                batch.set("CODUSR", orderRow.get("CODUSR"));
                batch.set("NUMORD", orderRow.get("NUMORD"));
                batch.set("NUMROW", orderRow.get("NUMROW"));
                var qties = orderRow.getDefaultBatchQuantities(context.gui.CacheData);
                batch.set("QTYORD", qties.qtyOrd);
                batch.set("QTYINV", qties.qtyInv);
                batch.set("INITIALWHSBALANCEORD", -Infinity);
                batch.set("INITIALWHSBALANCEINV", -Infinity);
                batch.newParent = orderRow;//temporary parent
                break;
        }
        return false;
    };

    this._updateScannedOrderRow = function (codArt, gui, detailContext, code) {
        var self = this;
        var order = gui.getDocument();
        var section = detailContext.sections.GRID;
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);
        var shouldIncreaseQuantity = false;
        var shouldChangeOrderUm = false;

        if (!section)
            return;

        //If the order row detail popup is already opened for another product try to close it
        var popupCtrl = gui.getSubDetailCtrl();
        if (popupCtrl && popupCtrl.entity.get("CODART") != codArt && !popupCtrl.closeDetail())
            return;

        var selectedRowIndex = self._getSelectedRowIndex(detailContext);

        //Try to find the first order row with the scanned codArt starting from the selected row
        var scannedOrderRowIndex = scannedOrderRowIndex = section.store.findBy(function (record) {
            if (record.xrec.get("CODART") == codArt)
                return true;
        }, this, selectedRowIndex != -1 ? selectedRowIndex : 0);

        //Try to find the first order row with the scanned codArt before the selected row
        if (scannedOrderRowIndex == -1) {
            scannedOrderRowIndex = section.store.findBy(function (record) {
                if (record.xrec.get("CODART") == codArt)
                    return true;
            });
        }

        //If there is no row with the scanned codArt try to create a new one
        if (scannedOrderRowIndex == -1) {
            var newOrderRow = new XEntity({ entityName: SFConstants.ORDERROW });
            var skipExecution = this._newOrderRow(codArt, newOrderRow, order, gui, true, false, code);
            if (skipExecution)
                return;
            shouldIncreaseQuantity = true;

            if (section.store) {
                orderRows.rebindSenchaStore(section.store);
            }

            scannedOrderRowIndex = section.store.findBy(function (record) {
                if (record.xrec.get("CODART") == codArt)
                    return true;
            });
        }
        else {
            //the scanned row is already in the grid and the selectedRowIndex has not changed
            var scannedOrderRow = section.store.getAt(scannedOrderRowIndex).xrec;
            if (selectedRowIndex == scannedOrderRowIndex || scannedOrderRow.get("QTYORD") == 0) {
                product = XNavHelper.getNavRecord("NAV_MOB_PROD", new XConstraint("CODART", "=", codArt))
                var orderUm = SM1OrderHelper.getRowUmOrd(order, product, order.get("CODTYPORD"), gui.CacheData, code);
                if (orderUm != scannedOrderRow.get("UMORD")) {
                    if (SalesForceEngine.existsConversionFactor(codArt, orderUm, product.get("UMINV1"), gui.CacheData))
                        shouldChangeOrderUm = true;
                }
                shouldIncreaseQuantity = true;
            }
        }

        if (!gui.getSubDetailCtrl()) {
            self._selectOrderRow(detailContext, scannedOrderRowIndex);
            detailContext.openSubDetailFromList(section.store, section.grid, scannedOrderRowIndex, SFConstants.ORDERROW, section.sectionContext);
            if (shouldIncreaseQuantity)
                //wait for the popup to open
                setTimeout(function () { self._updateScannedOrderRowDetail(gui, shouldIncreaseQuantity, shouldChangeOrderUm, orderUm); }, 100);
        }
        else {
            self._updateScannedOrderRowDetail(gui, shouldIncreaseQuantity, shouldChangeOrderUm, orderUm);
        }
    };

    this._updateScannedOrderRowDetail = function (gui, shouldIncreaseQuantity, shouldChangeOrderUm, orderUm) {
        var self = this;
        var popupCtrl = gui.getSubDetailCtrl();
        var orderRow = popupCtrl.entity;
        var order = gui.getDocument();
        var prevQtyOrd = orderRow.get("QTYORD");

        var isQtyOrdEditable = self._isQtyOrdEditable(order, orderRow);
        if (popupCtrl != null && popupCtrl.originalLayout != null) {
            var orderRowFieldsSection = JsonXmlHelper.filterNodesByAttr(popupCtrl.originalLayout.children, "caption", "ORDERROW");
            if (orderRowFieldsSection != null && orderRowFieldsSection.length > 0) {
                var orderRowDetailQtyOrdField = JsonXmlHelper.filterNodesByAttr(orderRowFieldsSection[0].children, "name", "QTYORD");
                if (orderRowDetailQtyOrdField != null && orderRowDetailQtyOrdField.length > 0) {
                    isQtyOrdEditable = isQtyOrdEditable != undefined ? isQtyOrdEditable && orderRowDetailQtyOrdField[0].attrs["editable"] : orderRowDetailQtyOrdField[0].attrs["editable"];
                }
            }
        }
        isQtyOrdEditable = isQtyOrdEditable != undefined ? isQtyOrdEditable && self._getOrderRowFieldEditability(gui, orderRow, "QTYORD") : self._getOrderRowFieldEditability(gui, orderRow, "QTYORD");

        var isUmOrdEditable = self._isUmOrdEditable(order, orderRow);
        if (popupCtrl != null && popupCtrl.originalLayout != null) {
            var orderRowFieldsSection = JsonXmlHelper.filterNodesByAttr(popupCtrl.originalLayout.children, "caption", "ORDERROW");
            if (orderRowFieldsSection != null && orderRowFieldsSection.length > 0) {
                var orderRowDetailUmOrdField = JsonXmlHelper.filterNodesByAttr(orderRowFieldsSection[0].children, "name", "UMORD");
                if (orderRowDetailUmOrdField != null && orderRowDetailUmOrdField.length > 0) {
                    isUmOrdEditable = isUmOrdEditable != undefined ? isUmOrdEditable && orderRowDetailUmOrdField[0].attrs["editable"] : orderRowDetailUmOrdField[0].attrs["editable"];
                }
            }
        }
        isUmOrdEditable = isUmOrdEditable != undefined ? isUmOrdEditable && self._getOrderRowFieldEditability(gui, orderRow, "UMORD") : self._getOrderRowFieldEditability(gui, orderRow, "UMORD");

        if (shouldChangeOrderUm && isUmOrdEditable)
            orderRow.set("UMORD", orderUm);

        if (isQtyOrdEditable && shouldIncreaseQuantity && orderRow.tryIncreaseByQtyOrdMin() || isUmOrdEditable && shouldChangeOrderUm) {
            self._updateOrderRowDetailAfterQtyOrdChange(orderRow, prevQtyOrd, gui);
            popupCtrl.refreshGui();
            self._refreshBatchGrid(popupCtrl);
            self._refreshTab(gui, gui.getDocument(), true);
        }
    };

    this._newOrderRow = function (codArt, newOrderRow, order, gui, checkRights, isReturn, scannedCode) {
        if (XApp.isEmptyOrWhitespaceString(codArt))
            return true;

        if (order.getSubEntityStore(SFConstants.ORDERROW).findIndex(newOrderRow) != -1)
            return false;

        //@43522 delay the warning to avoid the message box being destroyed by a field popup
        var delayedWarn = function (msg) {
            setTimeout(function () { XUI.showWarnOk({ msg: UserContext.tryTranslate(msg) }); }, 100);
        };

        var types = order.getRowTypes(order.get("CODTYPORD"));
        if (types.length < 1) {
            delayedWarn("[MOBGUIORDER.INVALID_CONFIGURATION]");
            return true;
        }

        var errCode = this.applyDataToNewOrderRow(gui, newOrderRow, codArt, checkRights, isReturn, scannedCode);

        if (errCode == SalesForceNameSpace.OrderErrorCodes.PRODUCT_NOTPRESENT_INWAREHOUSE) {
            delayedWarn("[MOBGUIORDER.PRODUCT_NOT_PRESENT_IN_WHS]");
            XLog.logInfo("\tProduct " + codArt + " is not present in warehouse: " + order.get("CODWHS"), true);
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.KIT_ARTICLE_NOT_ORDERABLE) {
            delayedWarn("[MOBGUIORDER.KIT_ARTICLE_NOT_ORDERABLE]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.NO_CONVERSION_UNIT) {
            delayedWarn("[MOBGUIORDER.NO_CONVERSION_UNIT]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.SR_IN_PRICELIST) {
            delayedWarn("[MOBGUIORDER.NOT_PRESENT_IN_PRICELIST]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.INVALID_COD_ART) {
            delayedWarn("[MOBGUIORDER.CANNOT_ORDER_PRODUCT]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.GIFT_ASSORTMENT_MANDATORY) {
            delayedWarn("[GIFT_PROD_NOT_PRESENT_IN_MANDATORY_ASSO]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.ARTICLE_OUTSIDE_ORDERABLE_PERIOD) {
            delayedWarn("[MOBGUIORDER.DISCARDED_ORDER_ROW_OUTSIDE_ORDERABLE_PERIOD]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.ARTICLE_OUTSIDE_DELIVERABLE_PERIOD) {
            delayedWarn("[MOBGUIORDER.ARTICLE_OUTSIDE_DELIVERABLE_PERIOD]");
            return true;
        }

        if (errCode == SalesForceNameSpace.OrderErrorCodes.VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE) {
            delayedWarn("[VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE]");
            return true;
        }

        if (!XApp.isEmptyOrWhitespaceString(errCode) && errCode != SalesForceNameSpace.OrderErrorCodes.MULTIPLE_ROWS_SAME_PRODUCT) {
            delayedWarn("[MOBGUIORDER.CANNOT_ORDER_PRODUCT]");
            return true;
        }

        if (SalesForceEngine.addKitArticles(order, newOrderRow, gui.CacheData)) {
            this.reaplyBenefits(order, gui);
        }

        SalesForceEngine.refreshRowSurveyMeasures(newOrderRow, gui.CacheData);

        this._newNumRow = newOrderRow.get("NUMROW");

        return false;
    };

    this._canAddOrderRow = function (order) {
        return !XApp.isEmptyOrWhitespaceString(order.get("CODTYPORD")) &&
            XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order)) && !SM1OrderHelper.restrictedEditability(order);
    };

    this.getSectionButtons = function (context) {
        var gui = context.gui;

        //buttons are not visible if the order is not editable
        if (!gui.isEditable())
            return;

        var sectionName = context.config.attrs["caption"];
        var subEntityName = context.config.attrs["detailObject"];
        var doc = gui.getDocument();

        if (sectionName == "GRID" && subEntityName == SFConstants.ORDERROW) {

            //#region add an order row by typing in product code
            if (this._canAddOrderRow(gui.getDocument())) {
                var addFn = (function (contextConfig) {
                    return function () {
                        var detailContext = contextConfig.sectionContext.detailContext;
                        detailContext.newDetail({
                            sectionConfig: contextConfig.sectionContext.config,
                            sectionContext: detailContext,
                            detailObjectName: "OrderRow"
                        });
                    };
                })(context);

                var addButton = {
                    msg: UserContext.tryTranslate("[MOBORDER.ADD_NEW]"),
                    iconCls: 'guis_order_sectionmenu_add_30x17',
                    visible: !SM1OrderHelper.isADelivery(doc.get("CODTYPORD")) &&
                             !SM1OrderHelper.isAssetPickup(doc.get("MACROTYPE"), doc.get("CODTYPORD")),
                    handler: addFn,
                    entityName: subEntityName,
                    id: context.panel.id + '-addnew',
                    scope: this
                };
                context.buttons.push(addButton);
            }
            //#endregion

            if (doc.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSLOAD) {

                var rowTypes = SM1OrderHelper.getOrderRowTypes(doc.get("CODTYPORD"), UserContext.CodDiv);
                //#region add a return product through specific selector
                var canAddReturn = rowTypes.some(function (row) {
                    return SalesForceEngine.getMacroType(row.CODTYPROW) == SalesForceNameSpace.OrderRowMacroType.RETURN &&
                        row.CODTYPROW != OrderParameters.getInstance(doc.get("CODTYPORD")).getDefaultEmptyRowType();
                });
                if (UserContext.checkRight("SM1ORDER", "CUSTOMIZATION", "ADDRETURN") && canAddReturn) {
                    var addReturnFn = (function (contextConfig) {
                        return function () {
                            var selectorContext = {
                                newSelector: JsonXmlHelper.selectChildByName(contextConfig.sectionContext.config, "newButtonSelector"),
                                detailObjectName: SFConstants.ORDERROW,
                                sectionConfig: contextConfig.sectionContext.config,
                                senchaStore: contextConfig.panel.grid.getStore(),
                                sectionPanel: contextConfig.panel,
                                sectionContext: contextConfig.sectionContext,
                                isReturn: true,
                                hiddenConstraints: new XConstraints({
                                    logicalOp: 'AND',
                                    constraints: [
                                        { attr: 'FLGRETURNABLE', op: '=', value: -1 },
                                        { attr: 'FLGEMPTY', op: '=', value: 0 }
                                    ]
                                })
                            };

                            var returnContext = {
                                contextConfig: contextConfig,
                                selectorContext: selectorContext,
                                cancel: false
                            };

                            gui.callCust("beforeAddReturnProduct", returnContext);
                            if (returnContext.cancel)
                                return;

                            contextConfig.detailContext.callSelector.call(contextConfig.detailContext, selectorContext);
                        };
                    })(context);

                    var addReturnButton = {
                        msg: UserContext.tryTranslate("[MOBORDER.ADDRETURN]"),
                        iconCls: 'guis_order_sectionmenu_add_return_30x17',
                        visible: !SM1OrderHelper.isADelivery(doc.get("CODTYPORD")) &&
                                 !SM1OrderHelper.isAssetPickup(doc.get("MACROTYPE"), doc.get("CODTYPORD")),
                        handler: addReturnFn,
                        entityName: subEntityName,
                        id: context.panel.id + '-addreturn',
                        scope: this
                    };
                    context.buttons.push(addReturnButton);
                }
                //#endregion

                //#region add an empty return product through specific selector
                var canAddEmpty = rowTypes.some(function (row) {
                    return row.CODTYPROW == OrderParameters.getInstance(doc.get("CODTYPORD")).getDefaultEmptyRowType();
                });
                if (UserContext.checkRight("SM1ORDER", "CUSTOMIZATION", "ADDEMPTY") && canAddEmpty) {
                    var addEmptyFn = (function (contextConfig) {
                        return function () {
                            var selectorContext = {
                                newSelector: JsonXmlHelper.selectChildByName(contextConfig.sectionContext.config, "newButtonSelector"),
                                detailObjectName: SFConstants.ORDERROW,
                                sectionConfig: contextConfig.sectionContext.config,
                                senchaStore: contextConfig.panel.grid.getStore(),
                                sectionPanel: contextConfig.panel,
                                sectionContext: contextConfig.sectionContext,
                                isEmpty: true,
                                hiddenConstraints: new XConstraints({
                                    logicalOp: 'AND',
                                    constraints: [
                                        { attr: 'FLGRETURNABLE', op: '=', value: -1 },
                                        { attr: 'FLGEMPTY', op: '=', value: -1 }
                                    ]
                                })
                            };

                            var emptyContext = {
                                contextConfig: contextConfig,
                                selectorContext: selectorContext,
                                cancel: false
                            };

                            gui.callCust("beforeAddEmptyProduct", emptyContext);
                            if (emptyContext.cancel)
                                return;

                            contextConfig.detailContext.callSelector.call(contextConfig.detailContext, selectorContext);
                        };
                    })(context);

                    var addEmptyButton = {
                        msg: UserContext.tryTranslate("[MOBORDER.ADDEMPTY]"),
                        visible: !SM1OrderHelper.isADelivery(doc.get("CODTYPORD")),
                        iconCls: 'guis_order_sectionmenu_add_empty_30x17',
                        handler: addEmptyFn,
                        entityName: subEntityName,
                        id: context.panel.id + '-addempty',
                        scope: this
                    };
                    context.buttons.push(addEmptyButton);
                }
                //#endregion
            }

            if (XApp.isPhone()) {
                if (gui.refreshPricingButton)
                    context.buttons.push(gui.refreshPricingButton);

                if (gui.removeZeroOrderRowsButton)
                    context.buttons.push(gui.removeZeroOrderRowsButton);
            }

            XUI.setBtnMsg(context.buttons, "GRID.ADD", UserContext.tryTranslate("[ADD_TO_CART]"));
            XUI.setBtnIcon(context.buttons, "GRID.ADD", "guis_customer_add_to_cart_blue_19");
            XUI.cleanNonContextualBtns(context.buttons);
        }
    };

    this.beforeRemoveDetail = function (context) {
        if (context.detailEntity.getEntityName() != SFConstants.ORDERROW) {
            return false;
        }

        var or = context.detailEntity;
        var gui = context.gui.gui;
        var order = gui.getDocument();
        var self = this;
        var discBenManager = new DiscountApplier.AppliedDiscountBenefitManager(order);
        var orStore = order.getSubEntityStore(SFConstants.ORDERROW);

        // remove all aplied benefits from the order row before remove of order row
        if (this.canDeleteOrderRow(or, order)) {
            //first, check if it is appliable on other rows
            order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                if (row.get("NUMROW") == or.get("NUMROW"))
                    return;
                SalesForceEngine.getAppliableCanvassForRow(row, order, null, gui.CacheData);
            });
            this.removeAllRowCnvAppliedGroups(or, order);
            discBenManager.removeAppliedBenefits(or);
            order.setModified(false);
            context.gui.setModified(order);
            context.gui.doBack(true, true, "REMOVE");
            orStore.remove(or);
            if (SM1OrderHelper.canKitArticlesBeExploded(order, or.get("FLGARTKIT")))
                //also delete all child products
                SalesForceEngine.removeKitArticles(or, order);

        } else if (or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.MANUALE) {
            or.set("CODSTATUS", SalesForceNameSpace.OrderRowStatus.CANCELLATA);
            this._setCloseButtonStatus(gui, or.get("CODSTATUS"), or.get("CODTYPORD"));
            XLog.logInfo("Can't remove order row, changed status to CANCELED");
            order.setModified(false);
            context.gui.setModified(order);
            return true;
        } else {
            XLog.logInfo("Can't remove the order row");
            order.setModified(false);
            return true;
        }

        // check what gift rows have to be removed
        toRemove = [];
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            if (row.get("CODSRC") == SalesForceNameSpace.OrderBESRC.ANAGRAFICA && !XApp.isEmptyOrWhitespaceString(row.get("CODSRCREF"))) {
                toRemove.push(row);
                self.removeAllRowCnvAppliedGroups(row, order);
                discBenManager.removeAppliedBenefits(row);
            }
        });
        if (toRemove.length > 0) {
            order.getSubEntityStore(SFConstants.ORDERROW).removeAll(toRemove);
            context.gui.setModified(order);
        }

        //for remaining articles of removed article codes, recalculate discounts on row
        this.refreshDiscounts(context.gui.gui, order, true);

        return true;
    };

    this.canDeleteOrderRow = function (or, order) {
        var result = false;
        if (order != null)
            result = !order.get("FLGHOSTED");
        //do not allow deleting canvas rows
        if (or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.CANVAS || or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.ANAGRAFICA || or.get("CODSRC") == SalesForceNameSpace.OrderBESRC.PROMOTION)
            return false;
        // do not allow to delete physical kit articles
        if (SM1OrderHelper.isPhysicalKitComponent(or, order)) {
            XLog.logInfo("Can't remove order row, it is part of a kit article");
            return false;
        }
        return result;
    };

    this.removeAllRowCnvAppliedGroups = function (row, order) {
        var rowsToRemove = [];
        order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).each(function (ordAppCnvGroup) {
            if (ordAppCnvGroup.get("NUMROW") == row.get("NUMROW")) {
                rowsToRemove.push(ordAppCnvGroup);
            }
        });
        order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).removeAll(rowsToRemove);

        //remove from head, if needed
        for (var i = 0; i < rowsToRemove.length; i++) {
            var removed = rowsToRemove[i];

            var sameCnvAppGrps = order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).queryBy(function (appCnvGrp) {
                return appCnvGrp.get("IDCNV") == removed.get("IDCNV") &&
                       appCnvGrp.get("CODCNVACT") == removed.get("CODCNVACT") &&
                       appCnvGrp.get("IDCNVRNG") == removed.get("IDCNVRNG") &&
                       appCnvGrp.get("IDBENGRP") == removed.get("IDBENGRP");
            });

            //if 0, it is not present at all
            //if > 1, it is present on other order rows, so there is no need to remove from head
            if (!sameCnvAppGrps || sameCnvAppGrps.length != 1)
                continue;

            var headCnvAppGrp = sameCnvAppGrps[0];
            if (headCnvAppGrp.get("NUMROW") != 0)
                continue;

            order.getSubEntityStore(SFConstants.ORDERAPPLIEDCNVGROUP).remove(headCnvAppGrp);
        }
    };


    this.validateMandatoryField = function (fieldName, value, entity) {
        var order = entity.getParentEntity() || entity.newParent;
        if (!order)
            return true;

        //t114 config table
        var conf = SM1OrderHelper.getOrderRowConfig(fieldName, order.get("CODTYPORD"), entity.get("CODTYPROW"), UserContext.CodDiv);
        if (conf && conf["FLGMANDATORY"] != 0 &&
            (XApp.isEmptyOrWhitespaceString(value) || Ext.isEmpty(value, false) || (Ext.isNumeric(value) && value == 0)))
            return false;

        return true;
    };

    //refresh canvass and gui
    this.refreshAll = function (gui, refreshGrid, resetScroll) {
        var startTimer = new Date();
        XUI.showWait();

        XApp.callCust("guiCustomizer", "mobGuiOrder", "preRefreshAll", gui);
        SalesForceEngine.refreshCanvasActions(gui.getDocument(), gui.CacheData);
        //this._checkForDiscardedOrderRowsBenefits(gui);
        if (XApp.isOnline()) {
            this.refreshBalance(gui.getDocument(), gui.CacheData, gui);
        }
        XApp.callCust("guiCustomizer", "mobGuiOrder", "afterRefreshAll", gui);

        this._refreshTab(gui, gui.getDocument(), refreshGrid, resetScroll);

        XUI.hideWait();

        SM1OrderHelper._showTime("refreshAll", false, startTimer);
    };

    /// <summary>
    /// Removes products that are not deliverable 
    /// and clears quantities for product not deliverable on a specific date
    /// <summary>
    this._checkForNotDeliverableProducts = function (gui) {
        var order = gui.getDocument();
        var removedProducts = [];
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);

        orderRows.each(function (row) {
            if (!row.getProduct())
                return true;

            if (SalesForceEngine.isProductDeliverable(row.getProduct(), order)) {

                //clear quantities if product not deliverable on delivery dates 
                for (var fieldIndex = 1; fieldIndex <= 5; fieldIndex++) {
                    var dteDelivField = fieldIndex == 1 ? "DTEDELIV" : "DTEDELIV" + fieldIndex;

                    if (XApp.isEmptyDate(order.get(dteDelivField)))
                        continue;

                    // verify if the order delivery date is in the deliverable period
                    if (!SalesForceEngine.isProductDeliveryDateValid(order.get(dteDelivField), row.getProduct())) {

                        //if physical kit -> clear delivery date qty on the whole kit
                        if (SM1OrderHelper.isPhysicalKit(row) || SM1OrderHelper.isPhysicalKitComponent(row, order)) {
                            var kitHeaderRow = SM1OrderHelper.getKitHeader(row, order) || row;

                            if (kitHeaderRow) {
                                kitHeaderRow.set("QTYDELIV" + fieldIndex, 0);

                                order.getSubEntityStore(SFConstants.ORDERROW).each(function (kitComponentRow) {
                                    if (kitComponentRow.get("NUMROWKITREF") != kitHeaderRow.get("NUMROW"))
                                        return;

                                    kitComponentRow.set("QTYDELIV" + fieldIndex, 0);
                                });
                            }
                        }
                        else {
                            // clear delivery date qty
                            row.set("QTYDELIV" + fieldIndex, 0);
                        }
                    }
                }
            } else {
                // remove order row
                removedProducts.push(row.getProduct().get("CODART") + " " + row.getProduct().get("DESART"));
                XLog.logWarn("Can't order " + row.getProduct().get("CODART") + " - " + row.getProduct().get("DESART") + ": outside the period when it could be delivered");
                orderRows.remove(row);

                if (row.getProduct().get("FLGARTKIT")) {
                    // if kit and expandible in orders, then remove all it's components too
                    SalesForceEngine.removeKitArticles(row, order);
                } else if (SM1OrderHelper.isPhysicalKitComponent(row, order)) {
                    // if component of a physical kit is not deliverable, remove all kit
                    var headerKit = SM1OrderHelper.getKitHeader(row, order);
                    if (headerKit) {
                        orderRows.remove(headerKit);
                        SalesForceEngine.removeKitArticles(headerKit, order);
                    }
                }
            }
        });

        if (removedProducts.length > 0) {
            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.ARTICLE_OUTSIDE_DELIVERABLE_PERIOD]") + " : " + "<br/>" + removedProducts.join("<br/>") });
        }

        if (gui.tabCtrls.MAIN)
            gui.tabCtrls.MAIN.deliveryDatesModified = false;

        return removedProducts.length > 0;
    };

    this._isDeliveryDateSet = function (deliveryDateFieldName, order) {
        return !XApp.isEmptyDate(order.get(deliveryDateFieldName));
    };

    /// <summary>
    /// Check if a delivery date is set and it is valid
    /// <summary>
    this._isValidDeliveryDate = function (deliveryDateFieldName, order) {

        var mainTab = app.getSM1Controllers().gui.tabCtrls.MAIN;
        var deliveryDateField = null;
        if (mainTab)
            deliveryDateField = mainTab.fields[deliveryDateFieldName];

        return this._isDeliveryDateSet(deliveryDateFieldName, order) && deliveryDateField != null && deliveryDateField.fieldContext.isValid;
    };

    /// <summary>
    /// Check if quantity is editable for the given delivery date
    /// <summary>
    this._isDeliveryQtyEditable = function (dteDelivFieldName, order, orderRow) {
        var product = orderRow.getProduct();

        if (SM1OrderHelper.isPhysicalKit(orderRow)) {
            //check if any of the physical kit components is not deliverable on the given date
            var notDeliverableComponent = order.getSubEntityStore(SFConstants.ORDERROW).findBy(function (kitComponentRow) {
                return kitComponentRow.get("NUMROWKITREF") == orderRow.get("NUMROW") && !SalesForceEngine.isProductDeliveryDateValid(order.get(dteDelivFieldName), kitComponentRow.getProduct());
            });

            if (notDeliverableComponent)
                return false;
        }

        return this._isValidDeliveryDate(dteDelivFieldName, order) && SalesForceEngine.isProductDeliveryDateValid(order.get(dteDelivFieldName), product);
    };

    //refresh discounts and gui
    this.refreshDiscounts = function (gui, targetObject, refreshGrid, resetScroll) {
        var startTimer = new Date();

        gui.CacheData.DiscountApplier.applyDiscounts(new DiscountApplier.ApplicationContext(targetObject));
        this._checkForDiscardedOrderRowsBenefits(gui);
        targetObject.calculateBenefits(gui.CacheData);
        this._refreshTab(gui, gui.getDocument(), refreshGrid, resetScroll);

        SM1OrderHelper._showTime("refreshDiscounts", false, startTimer);
    };

    // get  all row type causes for a order row 
    this._getRowTypeCauseVoices = function (codTypRow) {
        var allCauses = UserContext.getDecodeEntriesOrdered("TROWC");
        var filterCauses = [];
        //add empty row in combo
        filterCauses.push({ value: "", text: "" });
        for (var i in allCauses) {

            //cod foreach Decode Entry like: A , B, C
            var codCause = allCauses[i].cod;

            //extract refDatValue for each Decode Entry
            var orderRowType = SM1OrderHelper.getRowTypeForCause(codCause);

            // codTypRow must be empty or equal with codTypRow
            if (codTypRow == orderRowType || XApp.isEmptyOrWhitespaceString(orderRowType)) {
                filterCauses.push({ value: codCause, text: allCauses[i].des });
            }
        }
        //return new list with all causes respecting conditions
        return filterCauses;
    };

    this._getAssortmentLocations = function (cacheData) {
        var assortmentLocations = [];
        if (cacheData.m_cacheAssortments) {
            cacheData.m_cacheAssortments.each(function (asso) {
                if (!Ext.Array.contains(assortmentLocations, asso.CODLOCATION))
                    assortmentLocations.push(asso.CODLOCATION);
            });
        }
        return assortmentLocations;
    };


    // get the assortment locations voices
    this._getAssortmentLocationVoices = function (cacheData) {
        var assortmentLocationVoices = [];
        //add empty row in combo
        assortmentLocationVoices.push({ value: "", text: "" });
        var actualLocations = this._getAssortmentLocations(cacheData).filter(function (location) {
            return location != SFConstants.EMPTYCODLOCATION;
        });
        for (var i = 0; i < actualLocations.length; i++) {
            assortmentLocationVoices.push({ value: actualLocations[i], text: UserContext.decode("LOCATION", actualLocations[i]) });
        }
        assortmentLocationVoices.sort(function (a, b) { return a.text > b.text ? 1 : (a.text < b.text ? -1 : 0); });
        return assortmentLocationVoices;
    };

    this._getCustomerAddressesVoices = function (order) {
        var addressesVoices = [];
        addressesVoices.push({ value: "", text: "" });
        if (!order.DeliveryCustomer)
            return addressesVoices;

        //if the delivery customer is a doctor, get all the addresses of the main WP of this customer 
        //or the addresses of the codstructure if the order was created in a visit
        if (CommonEngine.isDoctor(order.DeliveryCustomer.get("CODPARTY")))
            if (!order.WorkplaceCustomer || order.WorkplaceCustomer.getSubEntityStore("CustomerAddr").getCount() == 0)
                return addressesVoices;
            else
                order.WorkplaceCustomer.getSubEntityStore("CustomerAddr").each(function (custAddr) {
                    if (UserContext.getRefdatValue("TYADD", custAddr.get("CODADDR"), "ADDRORD")) {
                        addressesVoices.push({ value: custAddr.get("CODADDR"), text: "(" + custAddr.get("CODADDR") + ") " + custAddr.get("DESADDR1") });
                    }
                });
        else
            order.DeliveryCustomer.getSubEntityStore("CustomerAddr").each(function (custAddr) {
                if (UserContext.getRefdatValue("TYADD", custAddr.get("CODADDR"), "ADDRORD")) {
                    addressesVoices.push({ value: custAddr.get("CODADDR"), text: "(" + custAddr.get("CODADDR") + ") " + custAddr.get("DESADDR1") });
                }
            });

        return addressesVoices;
    };

    // get the warehouse voices
    this._getWhsVoices = function (orderMacroType) {
        var distinctAssetWarehouses = [];
        var whsVoices = [];
        //add empty row in combo
        whsVoices.push({ value: "", text: "" });

        var allWarehouses = UserContext.getDecodeEntriesOrdered("WHS");
        if (orderMacroType != SalesForceNameSpace.OrderMacroType.ASSET) {
            for (var i in allWarehouses) {
                whsVoices.push({ value: allWarehouses[i].cod, text: allWarehouses[i].des });
            }
        }
        else {
            for (var i in allWarehouses) {
                var assetWhs = SM1OrderHelper.getAssetWarehouse(allWarehouses[i].cod);
                if (!XApp.isEmptyOrWhitespaceString(assetWhs) && !Ext.Array.contains(distinctAssetWarehouses, assetWhs)) {
                    distinctAssetWarehouses.push(assetWhs);
                    whsVoices.push({ value: assetWhs, text: UserContext.decode("WHS", assetWhs) });
                }
            }
        }
        return whsVoices;
    };

    this.customGridChanges = function (gui, newVal) {
        var startTimer = new Date();
        // gui not loaded completely ?
        if (gui.tabCtrls == null || !gui.tabCtrls.ROWS)
            return;

        var entity = gui.getDocument();
        var tab = gui.tabCtrls.ROWS;
        var gridSection = tab.sections.GRID;

        // refresh voices for TYPROWS in grid
        var voices = entity.getRowTypes(newVal);
        for (var i = 0; i < gridSection.grid._columns.length; i++) {
            var col = gridSection.grid._columns[i];

            //Default for all columns
            if (gui.openMode == 'VIEW')
                col.editable = false;

            switch (col.fieldName) {
                case "DESART":
                    //override default
                    if (col.fieldType == 'hyperlink')
                        col.editable = true;
                    break;
                case "CODTYPROW":
                    col.voices = voices;
                    break;
            }
        }
        SM1OrderHelper._showTime("getPriceListConstraints", false, startTimer);
    };


    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {
        //if (!ctrl.fieldContext.isValid)
        //return;

        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;
        var gui = context.gui;
        var entity = context.entity;
        var order = gui.getDocument();
        var self = this;

        if (context.entityName == SFConstants.ORDERROW && fieldName != "CODART" &&
            (XApp.isEmptyOrWhitespaceString(entity.get("CODART")) || entity._codArtValid == false)) {
            //order row not yet initialized
            return;
        }

        switch (context.entityName) {
            case SFConstants.ORDERROW:
                // recalculation done here because the fire of the handle methods for these fields is done after the values are set    
                switch (fieldName) {
                    case "QTYORD":
                        this._updateOrderRowDetailAfterQtyOrdChange(entity, oldVal, gui);
                        this._refreshBatchGrid(detailContext);
                        if (entity.get("SIZEPRESENT")) {
                            var grid = entity.sizeQuantityGrid;
                            if (grid) {
                                var sum = this.martrixUpdateValues(entity, grid, newVal);
                                if (sum != newVal) {
                                    entity.set("QTYORD", sum);
                                    detailContext.refreshGui();
                                }
                            }
                        }
                        break;
                    case "QTYORDINTEGER":
                    case "QTYORDREMAINDER":
                        var prevQtyOrd = entity.get("QTYORD");
                        var currentUmOrd = entity.get("UMORD");
                        entity.updateQtyOrdFieldValue(newVal, fieldName, gui.CacheData);
                        if (currentUmOrd != entity.get("UMORD") && detailContext.fields.QTYORD) {
                            detailContext.fields.QTYORD.setValue(entity.get("QTYORD"));
                            SalesForceEngine.setFieldQtyFormat(detailContext.fields.QTYORD, "QTYORD", entity);
                            entity.splitQuantityFieldValue("QTYORD", entity.get("QTYORD"), gui.CacheData);
                            entity.splitQuantityFieldValue("WHSBALANCEORD", entity.get("WHSBALANCEORD"), gui.CacheData);
                        }
                        this._updateQtyInvFieldValue(entity, prevQtyOrd, "QTYORD", gui.CacheData);
                        SM1OrderHelper.updateAdjustmentData(entity, gui.CacheData);
                        if (SM1OrderHelper.isUpdateOfOrigQtyRequired(order)) {
                            entity.set("QTYORDORIG", entity.get("QTYORD"));
                        }
                        break;
                    case "PRCDISCOUNT1":
                    case "PRCDISCOUNT2":
                    case "PRCDISCOUNT3":
                    case "VALAMOUNTPZ":
                    case "PRZSPEC":
                    case "FREEGOODSDISC":
                        entity.calculateBenefits(gui.CacheData); // recalculate benefits to apply on the order (row) fields
                        if (entity.getEntityName() == "SM1Order") {
                            //refresh rows' tab fields, to reflect new NETAMOUNT
                            try {
                                if (gui.tabCtrls.ROWS) {
                                    gui.tabCtrls.ROWS.refreshControls();
                                }
                            }
                            catch (ex) {
                                XLog.logEx(ex);
                            }
                        }
                        break;
                    case "UMORD":
                        if (SalesForceEngine.existsConversionFactor(entity.get("CODART"), newVal, entity.get("UMINV"), gui.CacheData)) {
                            entity._umOrdValid = true;

                            if (detailContext.fields.QTYORD)
                                SalesForceEngine.setFieldQtyFormat(detailContext.fields.QTYORD, "QTYORD", entity);
                            if (SM1OrderHelper.isNewMultideliveryActivated(order.get("CODTYPORD"), order.get("CODSTATUS"))) {
                                for (var fieldIndex = 1; fieldIndex <= 5; fieldIndex++) {
                                    if (detailContext.fields["QTYDELIV" + fieldIndex]) {
                                        SalesForceEngine.setFieldQtyFormat(detailContext.fields["QTYDELIV" + fieldIndex], "QTYDELIV" + fieldIndex, entity);
                                    }
                                }
                            }
                            var batchesUpdated = entity.roundToUmDecimals(gui.CacheData);

                            if (SM1OrderHelper.isUpdateOfOrigQtyRequired(order)) {
                                entity.set("QTYORDORIG", entity.get("QTYORD"));
                            }

                            this._updateQtyInvFieldValue(entity, oldVal, fieldName, gui.CacheData);
                            SM1OrderHelper.updateAdjustmentData(entity, gui.CacheData);

                            batchesUpdated = entity.convertWhsBalance(oldVal, newVal, gui.CacheData) || batchesUpdated;
                            batchesUpdated = entity.convertBatchQtyInv(newVal, gui.CacheData) || batchesUpdated;
                            if (batchesUpdated)
                                this._refreshBatchGrid(detailContext);

                            entity.calculateBenefits(gui.CacheData); // recalculate benefits to apply on the order (row) fields
                            if (entity.getEntityName() == "SM1Order") {
                                //refresh rows' tab fields, to reflect new NETAMOUNT
                                try {
                                    if (gui.tabCtrls.ROWS) {
                                        gui.tabCtrls.ROWS.refreshControls();
                                    }
                                }
                                catch (ex) {
                                    XLog.logEx(ex);
                                }
                            }
                        }
                        else {
                            entity.set("QTYINV", 0);
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.NO_CONVERSION_UNIT]") });
                            entity._umOrdValid = false;
                        }
                        entity.splitQuantityFieldValue("QTYORD", entity.get("QTYORD"), gui.CacheData);
                        entity.splitQuantityFieldValue("WHSBALANCEORD", entity.get("WHSBALANCEORD"), gui.CacheData);
                        break;
                    case "QTYINV":
                        if (!SM1OrderHelper.isADelivery(order.get("CODTYPORD")))
                            this._updateQtyOrdFieldValue(entity, gui.CacheData);
                        SM1OrderHelper.updateAdjustmentData(entity, gui.CacheData);
                        entity.splitQuantityFieldValue("QTYORD", entity.get("QTYORD"), gui.CacheData);
                        entity.splitQuantityFieldValue("WHSBALANCEORD", entity.get("WHSBALANCEORD"), gui.CacheData);
                        var codTypOrd = order.get("CODTYPORD");
                        if (codTypOrd != SalesForceNameSpace.OrderCTORD.INVENTORY &&
                            !SM1OrderHelper.isAStockCorrection(codTypOrd) &&
                            SM1OrderHelper.isBatchManaged(codTypOrd) &&
                            SM1OrderHelper.areBatchesPreloaded(codTypOrd, entity.get("CODTYPROW")) &&
                            !entity.isWhsBalanceExceeded("QTYINV")) {
                            entity.distributeInvoicedQuantityToBatches(gui.CacheData);
                            this._refreshBatchGrid(detailContext);
                        }
                        entity.calculateBenefits(gui.CacheData);
                        break;
                    case "CODART":
                        var skipExecution = this._newOrderRow(entity.get("CODART"), entity, order, gui, true);
                        // Multiple rows for same product validation.
                        if (SalesForceEngine.countManualRowsPerProd(order, entity.get("CODART"), entity.get("CODTYPROW"), entity.get("CODSRC")) > 1) {
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MULTIPLE_ROWS_SAME_PRODUCT]") });
                        }

                        if (!skipExecution) {
                            var um = entity.get("UMORD");
                            if (detailContext.fields.QTYORDREMAINDER)
                                SalesForceEngine.setFieldQtyFormat(detailContext.fields.QTYORDREMAINDER, "QTYORDREMAINDER", entity);
                            if (detailContext.fields.WHSBALANCEORDREMAINDER)
                                SalesForceEngine.setFieldQtyFormat(detailContext.fields.WHSBALANCEORDREMAINDER, "WHSBALANCEORDREMAINDER", entity);
                            // reset um because after the format is chage the value of um is lost
                            entity.set("UMORD", um);
                            entity.doBackup();

                            SalesForceEngine.refreshCanvasActions(order, gui.CacheData);

                            this._hideDetailPopupCancelButton(detailContext);
                            //update the title of the popup
                            detailContext._popup.setTitle(this._buildOrderRowDetailTitle(entity));
                            //refresh order rows grid
                            this._refreshTab(gui, order, true, false);

                            //re-render order row detail popup
                            //because the product is now known 
                            //and batch section can be rendered accordingly
                            detailContext.layoutConfig = this.getCustomLayout(detailContext.layoutConfig, detailContext);
                            detailContext.renderDetailGui(detailContext.mainPanel);
                        } else {
                            entity._codArtValid = false;
                            var prod = entity.getProduct();
                            //display product description, even if product can't be ordered
                            entity.set("DESART", prod ? prod.get("DESART") : "");

                            return;
                        }
                        // needed to call the onKeyUp method of the popup
                        detailContext._popup._prepareForKeyNavigation();

                        break;
                    case "CODTYPROW":
                        entity.set("CODTYPROWCAUSE", "");
                        // Multiple rows for same product validation.
                        if (SalesForceEngine.countManualRowsPerProd(order, entity.get("CODART"), newVal, entity.get("CODSRC")) > 1) {
                            entity.set("CODTYPROW", oldVal);
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MULTIPLE_ROWS_SAME_PRODUCT]") });
                        }
                        else
                            SalesForceEngine.refreshRowSurveyMeasures(entity, gui.CacheData);

                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        var prevQtyOrd = entity.get("QTYORD");
                        entity.set(fieldName, newVal);
                        this._updateOrderRowDetailAfterQtyOrdChange(entity, prevQtyOrd, gui);
                        break;
                }
                if (oldVal != newVal)
                    SalesForceEngine.updateKitOnParentChanged(entity, fieldName, gui.CacheData);
                break;
            case SFConstants.SM1ORDER:
                switch (fieldName) {
                    case "CODPAYTRM":
                        OrderPaymentValidator.validate(context.entity, context.gui.CacheData);
                        break;
                    case "DTEDELIV":
                        var self = this;
                        XUI.showWait();
                        //if I change delivery date need to update combo routes
                        this._reAlignRoute(newVal, gui);

                        //recalculate requested quantity
                        this._loadCalculationRequestedQty(gui,
                                                            function (e) {
                                                                XUI.hideWait();
                                                                XUI.showExceptionMsgBox(e);
                                                            },
                                                            function () {
                                                                self._loadPrevVanLoadRequestProducts(gui);
                                                                self._refreshTab(gui, order, true);
                                                                XUI.hideWait();
                                                            });

                        if (newVal != oldVal && gui.tabCtrls.MAIN)
                            gui.tabCtrls.MAIN.deliveryDatesModified = true;

                        break;
                    case "CODLOCATION":
                        var self = this;
                        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);

                        if (orderRows.getCount() == 0 || !gui.CacheData.m_cacheAssortments.isMandatory) {
                            self._preloadAssortmentForLocation(gui);
                            self.reaplyBenefits(order, gui, true);
                            self.refreshAll(gui, true);
                            break;
                        }

                        var onResult = (function (gui, oldValue, self) {
                            var order = gui.getDocument();
                            return function (button) {
                                if (button == "YES") {
                                    self._removeNotOrderableProducts(gui);
                                    self._preloadAssortmentForLocation(gui);
                                    self.reaplyBenefits(order, gui, true);
                                    self.refreshAll(gui, true);
                                }
                                else {
                                    order.set("CODLOCATION", oldValue);
                                    if (detailContext) {
                                        detailContext.refreshControls();
                                        detailContext.setFieldsStatus();
                                    }
                                }
                            }
                        })(gui, oldVal, self);

                        XUI.showYESNO({
                            msg: UserContext.tryTranslate("[MSG_DELETE_ORDER_ROWS]"),
                            icon: 'WARN',
                            title: UserContext.tryTranslate("[MOB.WARN]"),
                            onResult: onResult
                        });
                        break;
                    case "DTEDELIV2":
                    case "DTEDELIV3":
                    case "DTEDELIV4":
                    case "DTEDELIV5":
                        if (XApp.isEmptyDate(newVal)) {
                            var qtyDelivFieldName = SM1OrderHelper.getDeliveryQtyFieldName(fieldName);
                            order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
                                var prevQtyOrd = row.get("QTYORD");
                                row.set(qtyDelivFieldName, 0);
                                self._updateQtyInvFieldValue(row, prevQtyOrd, "QTYORD", gui.CacheData);
                                SalesForceEngine.getPossibleBenefitsForRow(row, gui.CacheData);
                                self.refreshDiscounts(gui, row, true);
                            });
                            order.calculateBenefits(gui.CacheData);
                            this._refreshTab(gui, order, true);
                        }

                        if (newVal != oldVal && gui.tabCtrls.MAIN)
                            gui.tabCtrls.MAIN.deliveryDatesModified = true;

                        break;
                }
                break;
            case "SM1Note":
                switch (fieldName) {
                    case "NOTETYPE":
                        //fill note with description
                        if (XApp.isEmptyOrWhitespaceString(entity.get("NOTE")) &&
                            UserContext.getRefdatValue(this._notesQtab, entity.get("NOTETYPE"), "DESCRIPTION")) {
                            entity.set("NOTE", UserContext.decode(this._notesQtab, entity.get("NOTETYPE")));
                        }
                        break;
                }
                break;
            case SFConstants.ORDERROWBATCH:

                var orderRow = detailContext.parentCtrl.entity;
                var prod = orderRow.getProduct();

                switch (fieldName) {
                    case "IDBATCH":
                        SalesForceEngine.refreshBatchWhsBalance(order, orderRow, entity, gui.CacheData);
                        break;
                    case "DTEEXPIRE":
                        //create batch id from expiration date
                        if ((XApp.isEmptyOrWhitespaceString(entity.get("IDBATCH")) ||
                            (oldVal && entity.get("IDBATCH") == Ext.Date.format(oldVal, "Ymd"))) &&
                            !detailContext.parentCtrl.entity.containsIdBatch(Ext.Date.format(newVal, "Ymd"))) {
                            entity.set("IDBATCH", Ext.Date.format(newVal, "Ymd"));
                            SalesForceEngine.refreshBatchWhsBalance(order, orderRow, entity, gui.CacheData);
                        }
                        break;
                    case "QTYORD":
                        //automatically update invoiced quantity if the user didn't change it
                        if (prod &&
                            (!prod.get("FLGVARIABLEWEIGHT") ||
                            oldVal == 0 ||
                            oldVal == SalesForceEngine.convertQuantity(orderRow.get("CODART"),
                                entity.get("QTYINV"), orderRow.get("UMINV"), orderRow.get("UMORD"), gui.CacheData, true) ||
                            SM1OrderHelper.skipQtyInvConversion(prod.get("FLGVARIABLEWEIGHT"), order.get("CODTYPORD")))) {
                            entity.set("QTYINV", SM1OrderHelper.calculateQtyInv(orderRow.get("CODART"), prod.get("FLGVARIABLEWEIGHT"), newVal, order.get("CODTYPORD"), orderRow.get("UMORD"), orderRow.get("UMINV"), gui.CacheData));
                        }

                        if (SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"))) {
                            orderRow.updateQtyOrdFromBatch(gui.CacheData);
                            SM1OrderHelper.updateAdjustmentData(orderRow, context.gui.CacheData);
                            orderRow.updateQtyInvFromBatch();
                        }

                        break;
                    case "QTYINV":
                        //automatically update ordered quantity if the user didn't change it
                        if (prod &&
                            prod.get("FLGVARIABLEWEIGHT") &&
                            entity.get("QTYORD") == 0) {
                            entity.set("QTYORD", SalesForceEngine.convertQuantity(orderRow.get("CODART"),
                                entity.get("QTYINV"), orderRow.get("UMINV"), orderRow.get("UMORD"), gui.CacheData));
                        }

                        orderRow.updateQtyInvFromBatch();
                        if (SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"))) {
                            orderRow.updateQtyOrdFromBatch(gui.CacheData);
                            SM1OrderHelper.updateAdjustmentData(orderRow, context.gui.CacheData);
                        }
                        break;
                }
                break;
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newValue, oldValue) {
        var self = this;
        var sectionContext = ctrl.fieldContext.sectionContext;
        var detailContext = sectionContext.detailContext;
        var gui = sectionContext.gui;
        var entity = sectionContext.entity;
        var order = gui.getDocument();

        switch (entity.getEntityName()) {
            case SFConstants.ORDERROW:
                switch (fieldName) {
                    case "QTYORD":

                    case "UMORD":
                        if (fieldName == "QTYORD" && ctrl.fieldContext.isValid) {
                            this._handleQtyOrdChange(gui, entity, newValue, oldValue);
                        }
                        break;
                    case "CODTYPROW":
                        SalesForceEngine.applyPriceListOnRow(order, entity, gui.CacheData);
                        SalesForceEngine.addManualHeaderDiscounts(order, entity);
                        SalesForceEngine.getPossibleBenefitsForRow(entity, gui.CacheData);

                        var isWhsBalanceRefreshed = this._reloadBatches(gui, entity, oldValue, newValue);
                        if (!isWhsBalanceRefreshed) {
                            if (SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD")))
                                entity.getSubEntityStore(SFConstants.ORDERROWBATCH).clear();
                            SalesForceEngine.refreshRowWhsBalance(order, entity, gui.CacheData);
                        }
                        if (newValue != oldValue) {
                            entity.set("CODTYPROWCAUSE", "");
                        }
                        //re-render order row detail popup
                        detailContext.layoutConfig = this.getCustomLayout(
                            detailContext.originalLayout || detailContext.layoutConfig, detailContext);
                        detailContext.renderDetailGui(detailContext.mainPanel);
                        break;
                }
                break;
            case SFConstants.SM1ORDER:
                switch (fieldName) {
                    case "CODWHS": {
                        XUI.showWait();
                        if (entity.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET && XApp.isEmptyOrWhitespaceString(newValue))
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.MISSING_ASSET_WAREHOUSE]") });
                        else if (SM1OrderHelper.isWarehouseCheckRequired(entity.get("CODTYPORD")) &&
                            XApp.isEmptyOrWhitespaceString(newValue)) {
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIORDER.WHSCHK]") });
                        }

                        this._loadWarehouseBalances(gui,
                            function () {
                                self._refreshTab(gui, order, true);
                                XUI.hideWait();
                            },
                            function () {
                                self._refreshTab(gui, order, true);
                                XUI.hideWait();
                            });

                        break;
                    }
                    case "DTEDELIV":
                    case "DTEDELIV2":
                    case "DTEDELIV3":
                    case "DTEDELIV4":
                    case "DTEDELIV5": {
                        //when last delivery date is cleared / filled in, update gift delivery quantities 
                        if (SM1OrderHelper.isNewMultideliveryActivated(entity.get("CODTYPORD"), entity.get("CODSTATUS"))) {
                            var nextIndex = parseInt(fieldName.substring(8) || "0") + 1;
                            if ((XApp.isEmptyDate(newValue) || XApp.isEmptyDate(oldValue)) &&
                                (nextIndex == 6 || XApp.isEmptyDate(entity.get("DTEDELIV" + nextIndex)))) {
                                SalesForceEngine.refreshCanvasActions(entity, gui.CacheData);
                                this._refreshTab(gui, entity, true);
                            }
                        }
                        break;
                    }
                }
                break;
        }
    };

    /*
    context {
    gui:       source gui
    field:     field, 
    newVal:    newValue,
    oldVal:    oldValue
    }
    return true to accept newVal, false for validation error
    Is possible to change newVal
    */
    this.validateField = function (context) {
        var startTimer = new Date();
        var self = this;
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        var entityName = context.field.fieldContext.sectionContext.entityName;
        switch (entityName) {
            case SFConstants.ORDERROW:
                if (fieldName == "CODART") {
                    var prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(context.newVal, entity.get("CODDIV")));
                    entity._codArtValid = prod != null && prod != undefined;
                    //display product description, even if product can't be ordered
                    entity.set("DESART", entity._codArtValid ? prod.get("DESART") : "");
                    return entity._codArtValid;
                }
                else {
                    if (XApp.isEmptyOrWhitespaceString(entity.get("CODART")) || entity._codArtValid == false)
                        return true;

                    if (!this.validateMandatoryField(context.field.getName(), context.newVal, entity))
                        return false;

                    switch (fieldName) {
                        case "QTYORD":
                            var msg = this._validateDeliveryQtyOrd(entity, context.newVal);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                return false;
                            }
                            msg = this._validateDuplicateVirtualKitComponents(entity, entity.get("CODTYPROW"), context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                            if (entity.get(fieldName) < 0 ||
                                !this._validateBenefitQtyOrd(context.gui, entity) ||
                                entity.isWhsBalanceExceeded("QTYORD", context.newVal))
                                return false;
                            break;
                        case "QTYINV":
                            if (entity.isWhsBalanceExceeded("QTYINV", context.newVal))
                                return false;
                            break;
                        case "QTYORDREMAINDER":
                            var msg = this._validateQtyOrdRemainder(entity, context.newVal, context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                            }
                            break;
                        case "UMORD":
                        case "CODTYPROW":
                            var orderRowType = (entityName == "CODTYPROW") ? context.newVal : entity.get("CODTYPROW");
                            var msg = this._validateDuplicateVirtualKitComponents(entity, orderRowType, context.gui.CacheData);
                            if (!XApp.isEmptyOrWhitespaceString(msg)) {
                                context.newVal = context.oldVal;
                                XUI.showErrorMsgBox({ msg: msg });
                                XUI.hideWait();
                                return;
                            }
                    }

                    entity.calculateBenefits(context.gui.CacheData);

                    // Check if the new DTEDELIV equals any Order's DTEDELIV
                    if ((fieldName == "DTEDELIV") && (this._validateOrderRowDteDeliv(context.gui.getDocument(), context.newVal))) {
                        context.newVal = context.oldVal;
                        return true;
                    }

                    if (fieldName.startsWith("AUTOMATIC_")) {
                        var orb = entity.getBenefitBehindProperty(fieldName);
                        if (!this.validateOrderRowBenefitQuantity(orb, context)) {
                            context.newVal = context.oldVal; // reset value, constraints not met
                        }
                        else {
                            orb.set("QTYBEN", context.newVal);
                        }
                    }
                }

                break;
            case SFConstants.SM1ORDER:
                var order = context.gui.getDocument();
                // Local array used to keep the DTEDELIVs perivous and next 
                var customDte = new Array("DTEDELIV", "DTEDELIV2", "DTEDELIV3", "DTEDELIV4", "DTEDELIV5", "");
                switch (fieldName) {
                    case "DTEDELIV":
                        if (self._validateDeliveryDate(context.newVal, order, context.field.fieldContext.sectionContext.detailContext)) {
                            var rows = context.gui.getDocument().getSubEntityStore(SFConstants.ORDERROW);
                            //refresh the delivery dates for the OrderRows
                            rows.each(function (row) {
                                row.set("DTEDELIV", context.newVal);
                            });

                            this._refreshOrderRowsGrid(context.gui);
                            this._validateDeliveryDateOrdersOptInfoAsync(order, context.newVal, context.field.fieldContext.sectionContext.detailContext);
                        } else {
                            context.newVal = context.oldVal;
                        }

                        if (SM1OrderHelper.isNewMultideliveryActivated(order.get("CODTYPORD"), order.get("CODSTATUS"))) {
                            // Set the value in entity with new value
                            // To be used in the below validation of DTEDELIVs
                            entity.set(fieldName, context.newVal);
                            // Validate all DTEDELIVs except the current one
                            var dteDelivs = Ext.Array.filter(customDte, function (r) {
                                return r != fieldName && !XApp.isEmptyOrWhitespaceString(r);
                            });
                            self._refreshDeliveryFieldsValidity(context.gui, dteDelivs, customDte);
                        }
                        break;
                    case "DTEDELIV2":
                    case "DTEDELIV3":
                    case "DTEDELIV4":
                    case "DTEDELIV5":
                        // Set the value in entity with new value
                        // To be used in the below validation of DTEDELIVs
                        entity.set(fieldName, context.newVal);
                        // Validate all DTEDELIVs except the current one
                        var dteDelivs = Ext.Array.filter(customDte, function (r) {
                            return r != fieldName && !XApp.isEmptyOrWhitespaceString(r) && r != "DTEDELIV";
                        });
                        self._refreshDeliveryFieldsValidity(context.gui, dteDelivs, customDte);

                        // Validate the current one - let the upper function to fill the fieldCOntext.isValid field
                        return self._validateCustomDate(context.gui, entity, context.newVal, context.oldVal, customDte[customDte.indexOf(fieldName) - 1], customDte[customDte.indexOf(fieldName) + 1], true);
                }
                break;
        }
        SM1OrderHelper._showTime("validateField", false, startTimer);
        return true;
    };

    this._validateDeliveryDate = function (delivDate, order, context) {
        var self = this;
        // check if it is in the correct interval;
        var check1 = this._checkDelivInInterval(delivDate, order);
        if (!XApp.isEmptyOrWhitespaceString(check1)) {
            XUI.showWarnOk({
                title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: check1, onResult: function (msg) {
                    self._validateDeliveryDateOrdersOptInfoAsync(order, order.get("DTEDELIV"), context);
                }
            });
            return false;
        }
        // check if it is a working day
        var check2 = this._checkWorkingDay(delivDate, order, "CONS");
        if (!XApp.isEmptyOrWhitespaceString(check2)) {
            XUI.showWarnOk({
                title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: check2, onResult: function (msg) {
                    self._validateDeliveryDateOrdersOptInfoAsync(order, order.get("DTEDELIV"), context);
                }
            });
            return false;
        }
        // check closure
        var check3 = this._checkWorkingDay(delivDate, order, "CHIU");
        if (!XApp.isEmptyOrWhitespaceString(check3)) {
            XUI.showWarnOk({
                title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: check3, onResult: function (msg) {
                    self._validateDeliveryDateOrdersOptInfoAsync(order, order.get("DTEDELIV"), context);
                }
            });
            return false;
        }

        //check if we have a multiple delivery date and it's lower than that date
        var check4 = this._checkIfLowerThanMultidelivery(delivDate, order, delivDate);
        if (!XApp.isEmptyOrWhitespaceString(check4)) {
            XUI.showErrorMsgBox({
                title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: check4, onResult: function (msg) {
                    self._validateDeliveryDateOrdersOptInfoAsync(order, order.get("DTEDELIV"), context);
                }
            });
            return false;
        }

        return true;
    };

    this._validateOneOrderPerDelivDate = function (delivDate, order, onFailure, onSuccess) {
        try {
            if (!delivDate || !order ||
                XApp.isEmptyOrWhitespaceString(order.get("CODTYPORD")) ||
                XApp.isEmptyOrWhitespaceString(order.get("CODCUSTDELIV")) ||
                !SM1OrderHelper.isOneOrderPerDateCheckRequired(order.get("CODTYPORD"))) {
                onSuccess(true);
                return;
            }

            SalesForceEngine.validateOneOrderPerDelivDate(order.get("NUMORD"), order.get("CODUSR"), order.get("CODTYPORD"), order.get("CODCUSTDELIV"), order.get("CODCUSTSALE"), delivDate,
                function (response) {
                    onSuccess(response.isValid);
                },
                function () {
                    onFailure();
                });
        }
        catch (e) {
            onFailure(e);
        }
    };

    this._checkIfLowerThanMultidelivery = function (delivDate, order, delivDate) {
        if (order.get("DTEDELIV2").getTime() != Constants.SM1MINDATE.getTime()) {
            if (delivDate > order.get("DTEDELIV2"))
                return UserContext.tryTranslate("[MOB.DELIVDATE_SHOULD_BE_LOWER_THEN]") + " " + order.get("DTEDELIV2").toDateString();
        }
        return "";
    };

    this._checkDelivInInterval = function (delivDate, order) {
        var oneDay = 1000 * 60 * 60 * 24;
        var center = order.get("DTEPROPDELIV");
        var startTimer = new Date();

        var nrDays = OrderParameters.getInstance(order.get("CODTYPORD")).getMaxDtaCon();

        if (delivDate > new Date(center.getTime() + nrDays * oneDay)) {
            return UserContext.tryTranslate("[MOB.DELIVDATE_SHOULD_BE_LOWER_THEN]") + new Date(center.getTime() + nrDays * oneDay).toDateString();
        }
        if (delivDate < order.get("DTEORD"))
            return UserContext.tryTranslate("[MOB.DELIVDATE_SHOULB_BE_HIGHER_THAN_ORDERDATE]") + order.get("DTEORD").toDateString();

        SM1OrderHelper._showTime("_checkDelivInInterval", false, startTimer);
        return "";
    };

    this._checkWorkingDay = function (delivDate, order, typplan) {
        var startTimer = new Date();
        var cust = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(order.get("CODCUSTDELIV")));

        if (cust) {
            var v = SM1OrderHelper.isCustomerSpecificDay(typplan, delivDate, cust);
            if (typplan == "CONS" && !v) return UserContext.tryTranslate("[MOB.CONS_REASON]");
            if (typplan == "CHIU" && v) return UserContext.tryTranslate("[MOB.CHIU_REASON]");
        } else {
            XLog.logWarn("CODCUSTDELIV: " + order.get("CODCUSTDELIV") + " not found");
        }
        SM1OrderHelper._showTime("_checkWorkingDay", false, startTimer);
        return "";
    };

    // Check if the newVal of an OrderRow DTEDELIV is equal with any DTEDELIV
    this._validateOrderRowDteDeliv = function (order, newVal) {
        if (newVal.toDate() - order.get("DTEDELIV").toDate() != 0
            && newVal.toDate() - order.get("DTEDELIV2").toDate() != 0
            && newVal.toDate() - order.get("DTEDELIV3").toDate() != 0
            && newVal.toDate() - order.get("DTEDELIV4").toDate() != 0
            && newVal.toDate() - order.get("DTEDELIV5").toDate() != 0)
            return true;
        else return false;
    };

    // Validation function for custon DTEDELIVs - 2, 3, 4 and 5
    this._validateCustomDate = function (gui, order, newDelivDate, oldDelivDate, beforePropName, afterPropName, showMsgs) {

        // Reset time properties
        newDelivDate = newDelivDate ? newDelivDate.toDate() : Constants.SM1MINDATE.toDate();
        oldDelivDate = oldDelivDate ? oldDelivDate.toDate() : Constants.SM1MINDATE.toDate();

        // Used to mark if any valid date exist after current DTEDELIV
        var hasAfter = !XApp.isEmptyOrWhitespaceString(afterPropName);
        // The date after current DTEDELIV
        var afterDate = undefined;
        // The date Before current DTEDELIV
        var beforeDate = undefined;
        // To be used to mark if any order row was changed - refresh order row grid
        var anyRowModified = false;

        // Check if current DTEDELIV has after date
        if (hasAfter) {
            afterDate = order.get(afterPropName);
            if (XApp.isEmptyDate(afterDate))
                hasAfter = false;
            else {
                afterDate = afterDate.toDate();
            }
        }

        // Check before date and use as default the Order's DTEDELIV field
        beforeDate = order.get(beforePropName) || Constants.SM1MINDATE;
        beforeDate = beforeDate.toDate();

        // If newVal is null reset all rows DTEDELIV
        if (XApp.isEmptyDate(newDelivDate)) {
            order.getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
                if (or.get("DTEDELIV").toDate() - oldDelivDate == 0) {
                    or.set("DTEDELIV", order.get("DTEDELIV"));
                    anyRowModified = true;
                }
            });

            // Not valid if a valid date exist after current made null
            if (hasAfter) {
                if (showMsgs)
                    XUI.showErrorMsgBox({ title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: UserContext.tryTranslate("[MOB.FUTURE_DELIVERYDATE_SET]") });
                return false;
            }
        }
        else {
            // If null beforeDate - Not valid
            if (XApp.isEmptyDate(beforeDate)) {
                if (showMsgs)
                    XUI.showErrorMsgBox({ title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: UserContext.tryTranslate("[MOB.CHOOSE_DELIVERYDATE_BEFORE]") });
                return false;
            }

            // Calculate difference of previous DTEDELIV and newVal
            var differenceBefore = XApp.dateDiff(beforeDate, newDelivDate, "d");
            // If difference < 0 => newVal is before the previous DTEDELIV - Not valid
            if (differenceBefore <= 0) {
                if (showMsgs)
                    XUI.showErrorMsgBox({ title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: UserContext.tryTranslate("[MOB.DELIVERY_DATE_LOWER_THAN_PREVIOUS]") });
                return false;
            }

            // Calculate difference between newVal and next DTEDELIV
            var differenceAfter = 0;
            if (hasAfter) {
                differenceAfter = XApp.dateDiff(newDelivDate, afterDate, "d");

                // If difference is < 0 newVal is after next DTEDELIV - Not Valid
                if (differenceAfter <= 0) {
                    if (showMsgs)
                        XUI.showErrorMsgBox({ title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: UserContext.tryTranslate("[MOB.DELIVERY_DATE_HIGHER_THAN_NEXT]") });
                    return false;
                }
            }

            // Read the min and max difference allowed
            var minBetween = OrderParameters.getInstance(order.get("CODTYPORD")).getOrderDteDelivMinBetween();
            var maxBetween = OrderParameters.getInstance(order.get("CODTYPORD")).getOrderDteDelivMaxBetween();

            // Check if differences calculated are between min and max - otherwise Not valid
            if ((minBetween > 0 && (differenceBefore < minBetween || (hasAfter && differenceAfter < minBetween)))
                || (maxBetween > 0 && (differenceBefore > maxBetween || (hasAfter && differenceAfter > maxBetween)))) {
                if (showMsgs)
                    XUI.showErrorMsgBox({ title: UserContext.tryTranslate("[INVALID_DELIVDATE]"), msg: UserContext.tryTranslate("[MOB.DIFERENCE_BETWEEN_DELIVDATES_INTERVAL]") });
                return false;
            }
        }

        // If everything is ok change the DTEDELIV for all orderRows that had the old value of the current custom DTEDELIV
        if (!XApp.isEmptyDate(oldDelivDate) && oldDelivDate - newDelivDate != 0) {
            order.getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
                if (or.get("DTEDELIV").toDate() - oldDelivDate == 0) {
                    or.set("DTEDELIV", newDelivDate);
                    anyRowModified = true;
                }
            });
        }

        // If any row modified refresh the order row grid
        if (anyRowModified)
            this._refreshTab(gui, order, true, false);

        return true;
    };

    this._refreshDeliveryFieldsValidity = function (gui, fieldNames, customDte) {
        var self = this;
        var doc = gui.getDocument();

        for (var i = 0; i < fieldNames.length; i++) {
            var fieldName = fieldNames[i];
            var field = self._getDteDelivField(fieldName);
            if (field) {
                var fieldIndex = customDte.indexOf(fieldName);
                field.fieldContext.isValid =
                    self._validateCustomDate(gui, doc, doc.get(fieldName), doc.get(fieldName), customDte[fieldIndex - 1], customDte[fieldIndex + 1], false);
            }
        }
    };

    this._getDteDelivField = function (fieldName) {
        var mainTab = app.getSM1Controllers().gui.tabCtrls.MAIN;
        if (mainTab) {
            return mainTab.fields[fieldName];
        }
        return null;
    };

    this.setRemoveButtonsStatus = function (context) {
        var entity = context.subGui.entity;
        var order = context.gui.getDocument();
        switch (context.detailEntityName) {
            case SFConstants.ORDERROW:
                if (XApp.isEmptyOrWhitespaceString(entity.get("CODART")) ||
                    entity._codArtValid == false ||
                    SM1OrderHelper.restrictedEditability(order) ||
                   !this._canRemoveOrderRow(order, entity, context.gui.CacheData, true) ||
                    SM1OrderHelper.isADelivery(order.get("CODTYPORD"))) {
                    //hide for the physical kit components, virtual kit components coming from sales conditions or codart not valid (order row not yet added)
                    context.visible = false;
                }
                break;
            case SFConstants.ORDERROWBATCH:
                if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) && !context.gui.CacheContext.allowBatchModifications)
                    context.visible = false;
                else
                    context.visible = !SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), context.subGui.parentCtrl.entity.get("CODTYPROW")) ||
                        SM1OrderHelper.isAStockCorrection(order.get("CODTYPORD"));
                break;
        }
    };

    this.setNavigateButtonsStatus = function (context) {
        var entity = context.subGui.entity;
        if (entity.getEntityName() == SFConstants.ORDERROW) {
            context.visible = !entity.isNew;
        }
    };

    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        var order = context.sectionContext.gui.getDocument();

        if (!XApp.isEmptyOrWhitespaceString(SalesForceEngine.canEditOrder(order)) || !context.field.fieldContext.sectionContext.gui.isEditable())
            return;

        switch (entity.getEntityName()) {
            case SFConstants.SM1ORDER:
                var paymentStatus;
                switch (fieldName) {
                    case "CODTYPORD":
                        context.valid = !XApp.isEmptyOrWhitespaceString(entity.get("CODTYPORD"));
                        break;
                    case "CODIBAN":
                        paymentStatus = OrderPaymentValidator.PaymentFieldsStatus.CODIBAN;
                        context.editable = context.editable && paymentStatus.editable;
                        if (paymentStatus.mandatory) {
                            context.valid = !XApp.isEmptyOrWhitespaceString(entity.get("CODIBAN"));
                        }
                        break;
                    case "CODPAYTRM":
                        paymentStatus = OrderPaymentValidator.PaymentFieldsStatus.CODPAYTRM;
                        context.editable = context.editable && paymentStatus.editable;
                        if (!XApp.isEmptyOrWhitespaceString(paymentStatus.errMsg)) {
                            context.valid = false;
                            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate(paymentStatus.errMsg) });
                        }
                        break;
                    case "DTEDELIV":
                    case "DTEDELIV2":
                    case "DTEDELIV3":
                    case "DTEDELIV4":
                    case "DTEDELIV5":
                        // This field is set from validateField function
                        if (context.field.fieldContext.isValid == false)
                            context.valid = false;
                        break;
                    case "CODLOCATION":
                        if (XApp.isEmptyOrWhitespaceString(entity.get("CODCUSTSALE")))
                            context.visible = false;
                        break;
                }
                break;
            case SFConstants.ORDERROW:
                if ((XApp.isEmptyOrWhitespaceString(entity.get("CODART")) || entity._codArtValid == false) &&
                    fieldName != "CODART" && fieldName != "QTYORD") {
                    context.editable = false;
                }

                context.editable = context.editable && this._getOrderRowFieldEditability(context.gui.gui, entity, fieldName);

                if ((entity._codArtValid === false || XApp.isEmptyOrWhitespaceString(entity.get("CODART")))
                    && fieldName != "CODART")
                    break;

                var order = context.sectionContext.document;

                switch (fieldName) {
                    case "QTYORD":
                        //clear warning and info
                        context.field.removeCls("x-warn-field");
                        context.field.removeCls("x-info-field");

                        if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")) && !SM1OrderHelper.canOnlyReduceQtyOrd(order.get("CODTYPORD"))) {
                            context.editable = false;
                        }

                        context.valid = context.valid &&
                            this._validateBenefitQtyOrd(context.gui.gui, entity) &&
                            !entity.isWhsBalanceExceeded("QTYORD");

                        var isQtyOrdEditable = this._isQtyOrdEditable(order, entity);
                        isQtyOrdEditable = isQtyOrdEditable != undefined ? isQtyOrdEditable && context.editable : context.editable;
                        if (context.valid &&
                            (entity.isWhsBalanceExceeded("QTYORD") ||
                                (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) && entity.isBatchQtyOrdDiff(isQtyOrdEditable)))) {
                            //if it is not valid it should have error background
                            context.field.addCls("x-warn-field");
                        }

                        if (order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.WHSLOAD && entity.get("QTYORD") != entity.get("QTYORDORIG") &&
                            context.field.getCls().indexOf("x-warn-field") == -1 && context.field.getCls().indexOf("x-error-field") == -1)
                            context.field.addCls("x-info-field");
                        break;
                    case "WHSBALANCEORD":
                        //clear warning
                        context.field.removeCls("x-warn-field");

                        if (context.valid && entity.isWhsBalanceExceeded("QTYORD")) {
                            //if it is not valid it should have error background
                            context.field.addCls("x-warn-field");
                        }
                        break;
                    case "PRZSPEC":
                        //special price benefit can be given only to sales rows (@27697)
                        if (entity.get("MACROTYPE") != SalesForceNameSpace.OrderRowMacroType.SALES) {
                            context.editable = false;
                        } else if (!this._checkZeroPriceValid(entity))
                            context.valid = false;
                        break;
                    case "CODTYPROW":
                        var gui = context.gui.gui;
                        context.editable = context.editable && SalesForceEngine.isRowTypeEditable(order, entity, this._getNewNumRow());

                        var codTypRow = entity.get("CODTYPROW");
                        if (!XApp.isEmptyOrWhitespaceString(entity.get("CODART")) && entity._codArtValid != false) {
                            context.valid = !XApp.isEmptyOrWhitespaceString(codTypRow);
                        }

                        if (!SM1OrderHelper.checkProdInWarehouse(order, entity.get("CODART"), codTypRow, gui.CacheData)) {
                            context.valid = false;
                        }

                        // Multiple rows for same product validation.
                        if (!XApp.isEmptyOrWhitespaceString(codTypRow) &&
                            SalesForceEngine.countManualRowsPerProd(order, entity.get("CODART"), codTypRow, entity.get("CODSRC")) > 1) {
                            context.valid = false;
                        }

                        // set default value for budget balance field from order row only when row is created
                        if (entity.get("BUDGETBALANCE") == undefined) {
                            entity.set("BUDGETBALANCE", -Infinity);
                        }
                        break;
                    case "CODART":
                        context.valid = entity._codArtValid != false || XApp.isEmptyOrWhitespaceString(entity.get("CODART"));
                        if (context.valid) {
                            context.editable = context.editable &&
                                (XApp.isEmptyOrWhitespaceString(entity.get("CODART")) || entity._codArtValid == false);
                        }
                        break;
                    case "UMORD":
                        context.editable = context.editable && !SM1OrderHelper.isUmReadOnly(order);
                        context.valid = !SalesForceEngine.existsConversionFactor(entity.get("CODART"),
                            entity.get("UMORD"), entity.get("UMINV"), context.gui.gui.CacheData) ? false : true;
                        break;
                    case "UMINV":
                        //uminv is never editable, regardless of configuration
                        context.editable = false;
                        break;
                    case "QTYINV":
                        //clear warning
                        context.field.removeCls("x-warn-field");
                        context.valid = context.valid && !entity.isWhsBalanceExceeded("QTYINV") && !this._isMissingQtyInvField(entity, order.get("CODTYPORD"), context.gui.gui.CacheData);

                        //if it is not valid it should have error background
                        //check validity when user manually changed the value
                        //check validity against batch sum
                        var isQtyInvEditable = this._isQtyInvEditable(order, entity);
                        if (isQtyInvEditable == undefined)
                            isQtyInvEditable = context.editable;
                        if (context.valid &&
                                (
                                    (!this._isValidQtyInvField(entity, order.get("CODTYPORD"), context.gui.gui.CacheData) &&
                                            context.editable)
                                        ||
                                        (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD")) && entity.isBatchQtyInvDiff(isQtyInvEditable))
                                        ||
                                        entity.isWhsBalanceExceeded("QTYINV")
                                )
                        ) {
                            context.field.addCls("x-warn-field");
                        }
                        break;
                    case "WHSBALANCEINV":
                        //clear warning
                        context.field.removeCls("x-warn-field");

                        if (context.valid && entity.isWhsBalanceExceeded("QTYINV")) {
                            //if it is not valid it should have error background
                            context.field.addCls("x-warn-field");
                        }
                        break;
                    case "QTYORDINTEGER":
                        context.editable = context.editable && entity.hasValidIntegerUm();
                        break;
                    case "QTYORDREMAINDER":
                        context.editable = context.editable && entity.hasValidRemainderUm(context.gui.gui.CacheData);
                        break;
                    case "CODQTYMODCAUSE":
                        context.editable = context.editable && this._isCodQtyModCauseEditable(order, entity);
                        if (context.editable) {
                            if (!this._validateCodQtyModCauseField(order, entity))
                                context.valid = false;
                        }
                        break;
                    case "CODQTYREJCAUSE":
                        context.editable = context.editable && this._isCodQtyRejCauseEditable(order, entity);
                        if (context.editable) {
                            if (!this._validateCodQtyRejCauseField(order, entity))
                                context.valid = false;
                        }
                        break;
                    case "QTYDELIV1":
                    case "QTYDELIV2":
                    case "QTYDELIV3":
                    case "QTYDELIV4":
                    case "QTYDELIV5":
                        var deliveryDateFieldName = SM1OrderHelper.getDeliveryDateFieldName(fieldName);
                        context.editable = context.editable && this._isDeliveryQtyEditable(deliveryDateFieldName, order, entity)
                        if (fieldName == SM1OrderHelper.getDeliveryQtyFieldName(SM1OrderHelper.getLastDeliveryDateName(order))) {
                            context.valid = context.valid && this._validateBenefitQtyOrd(context.gui.gui, entity);
                        }

                        context.field.removeCls("x-warn-field");
                        if (!this._validateFreeMerchandiseMultiQtyDeliv(context.gui.gui, entity, fieldName)) {
                            context.field.addCls("x-warn-field");
                        }
                        break;
                }
                break;
            case SFConstants.ORDERROWBATCH:
                switch (fieldName) {
                    case "IDBATCH":
                        var order = context.sectionContext.document;
                        var codTypOrd = order.get("CODTYPORD");
                        var preloaded = SM1OrderHelper.areBatchesPreloaded(codTypOrd, context.gui.parentCtrl.entity.get("CODTYPROW"));

                        //don't edit field which is part of the key
                        //once batch detail is inserted
                        context.editable = entity.isNew && (!preloaded ||
                            codTypOrd == SalesForceNameSpace.OrderCTORD.INVENTORY ||
                            SM1OrderHelper.isAStockCorrection(codTypOrd));

                        if (entity.isNew)
                            context.valid = !context.editable || (!XApp.isEmptyOrWhitespaceString(entity.get("IDBATCH")) &&
                                !context.gui.parentCtrl.entity.containsIdBatch(entity.get("IDBATCH")));
                        break;
                    case "DTEEXPIRE":
                        var order = context.sectionContext.document;

                        context.editable = entity.isNew;

                        context.valid = (XApp.isEmptyDate(entity.get("DTEEXPIRE")) && order.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET)
                            || !context.editable || entity.get("DTEEXPIRE") >= this._getMinBatchExpDate(context.sectionContext.document.get("CODTYPORD"));
                        break;
                    case "QTYINV":
                        var order = context.gui.gui.getDocument();
                        var orderRow = context.gui.parentCtrl.entity;

                        context.field.removeCls("x-warn-field");

                        var preloaded = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"));
                        context.valid = SalesForceEngine.isBatchQtyValueValid("QTYINV", entity, orderRow, order) && !this._isMissingBatchQtyInvField(entity, context.gui.gui.CacheData, orderRow);

                        if (context.valid && (!this._isValidBatchQtyInvField(entity, context.gui.gui.CacheData, orderRow) ||
                            this._checkInconsistentBatchQties(order, orderRow, entity))) {
                            context.field.addCls("x-warn-field");
                        }

                        context.editable = !entity.isUnsellable();
                        break;
                    case "QTYORD":
                        var order = context.gui.gui.getDocument();
                        var orderRow = context.gui.parentCtrl.entity;
                        var preloaded = SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW"));

                        if ((SM1OrderHelper.isADelivery(order.get("CODTYPORD")) && !context.gui.gui.CacheContext.allowBatchModifications) || entity.isUnsellable()) {
                            context.editable = false;
                        }

                        context.field.removeCls("x-warn-field");

                        context.valid = SalesForceEngine.isBatchQtyValueValid("QTYORD", entity, orderRow, order);

                        if (context.valid && this._checkInconsistentBatchQties(order, orderRow, entity)) {
                            context.field.addCls("x-warn-field");
                        }
                        break;
                }
                break;
        }
    };

    /// <summary>
    /// Check if QTYINV is editable
    /// </summary>
    this._isQtyInvEditable = function (order, orderRow) {

        var prod = orderRow.getProduct();
        if (prod && !prod.get("FLGVARIABLEWEIGHT"))
            return false;

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("QTYINV",
            order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;

        //consider touch ui config/sliverlight gui model editability
        return undefined;
    };

    /// <summary>
    /// Check if QTYORD is editable
    /// </summary>
    this._isQtyOrdEditable = function (order, orderRow) {

        //T114 configuration
        if (order) {
            var rowCfg = SM1OrderHelper.getOrderRowConfig("QTYORD",
                order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);
        }

        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;

        //consider touch ui config/sliverlight gui model editability
        return undefined;
    };

    /// <summary>
    /// Check if UMORD is editable
    /// </summary>
    this._isUmOrdEditable = function (order, orderRow) {

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("UMORD",
            order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;

        //consider touch ui config/sliverlight gui model editability
        return undefined;
    };

    /// <summary>
    /// Check if QTYINV is visible
    /// Different from SL app in the sense that it also checks FLGVARIABLEWEIGHT, due to ui space limitations - only for batch
    /// </summary>
    this._isQtyInvVisible = function (order, orderRow) {

        var prod = orderRow.getProduct();
        if (prod && !prod.get("FLGVARIABLEWEIGHT"))
            return false;

        var codStatusGroup = SM1OrderHelper.getStatusGroup(order.get("CODSTATUS"));

        //T112 configuration
        var rowVis = SM1OrderHelper.getVisibilityConfig("QTYINV",
            order.get("CODTYPORD"), codStatusGroup, UserContext.CodDiv);

        if (rowVis)
            return rowVis.FLGVISIBLE != 0;

        //consider touch ui config/sliverlight gui model editability
        return undefined;
    };

    /// <summary>
    /// Check if Check if REQUESTEDQTYORD  is visible
    /// </summary>
    this._isRequestedQtyordVisible = function (order) {

        var codStatusGroup = SM1OrderHelper.getStatusGroup(order.get("CODSTATUS"));

        //T112 configuration
        var rowVis = SM1OrderHelper.getVisibilityConfig("REQUESTEDQTYORD",
            order.get("CODTYPORD"), codStatusGroup, UserContext.CodDiv);

        if (rowVis)
            return rowVis.FLGVISIBLE != 0;

        //consider touch ui config/sliverlight gui model editability
        return undefined;
    };

    /// <summary>
    /// Check if CODQTYMODCAUSE is editable
    /// </summary>
    this._isCodQtyModCauseEditable = function (order, orderRow) {

        if (orderRow.get("QTYORD") == orderRow.get("QTYORDORIG"))
            return false;

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("CODQTYMODCAUSE", order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;

        return false;
    };


    /// <summary>
    /// Check if CODQTYMODCAUSE is mandatory
    /// </summary>
    this._isCodQtyModCauseMandatory = function (order, orderRow) {

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("CODQTYMODCAUSE", order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGMANDATORY != 0;

        return false;
    };

    /// <summary>
    /// Check if CODQTYMODCAUSE is visible
    /// </summary>
    this._isCodQtyModCauseVisible = function (order) {
        var codStatusGroup = SM1OrderHelper.getStatusGroup(order.get("CODSTATUS"));

        //T112 configuration
        var rowVis = SM1OrderHelper.getVisibilityConfig("CODQTYMODCAUSE", order.get("CODTYPORD"), codStatusGroup, UserContext.CodDiv);

        if (rowVis)
            return rowVis.FLGVISIBLE != 0;

        return false;
    };

    /*Checks if CODQTYMODCAUSE is valid*/
    this._validateCodQtyModCauseField = function (order, orderRow) {
        //Field is editable , mandatory and empty => error condition
        if (this._isCodQtyModCauseVisible(order) && this._isCodQtyModCauseEditable(order, orderRow) && this._isCodQtyModCauseMandatory(order, orderRow) && XApp.isEmptyOrWhitespaceString(orderRow.get("CODQTYMODCAUSE")))
            return false;
        return true;
    };

    /// <summary>
    /// Check if CODQTYREJCAUSE is editable
    /// </summary>
    this._isCodQtyRejCauseEditable = function (order, orderRow) {

        if (orderRow.get("QTYORD") == orderRow.get("QTYORDORIG"))
            return false;

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("CODQTYREJCAUSE", order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGEDITABLE != 0;

        return false;
    };

    /// <summary>
    /// Check if CODQTYREJCAUSE is mandatory
    /// </summary>
    this._isCodQtyRejCauseMandatory = function (order, orderRow) {

        //T114 configuration
        var rowCfg = SM1OrderHelper.getOrderRowConfig("CODQTYREJCAUSE", order.get("CODTYPORD"), orderRow.get("CODTYPROW"), UserContext.CodDiv);

        if (rowCfg)
            return rowCfg.FLGMANDATORY != 0;

        return false;
    };

    /// <summary>
    /// Check if CODQTYREJCAUSE is visible
    /// </summary>
    this._isCodQtyRejCauseVisible = function (order) {
        var codStatusGroup = SM1OrderHelper.getStatusGroup(order.get("CODSTATUS"));

        //T112 configuration
        var rowVis = SM1OrderHelper.getVisibilityConfig("CODQTYREJCAUSE", order.get("CODTYPORD"), codStatusGroup, UserContext.CodDiv);

        if (rowVis)
            return rowVis.FLGVISIBLE != 0;

        return false;
    };

    /*Checks if CODQTYREJCAUSE is valid*/
    this._validateCodQtyRejCauseField = function (order, orderRow) {
        //Field is editable , mandatory and empty => error condition
        if (this._isCodQtyRejCauseVisible(order) && this._isCodQtyRejCauseEditable(order, orderRow) && this._isCodQtyRejCauseMandatory(order, orderRow) && XApp.isEmptyOrWhitespaceString(orderRow.get("CODQTYREJCAUSE")))
            return false;
        return true;
    };

    this._updateQtyInvFieldValue = function (row, prevQTYORD, fieldName, cacheData) {
        var order = row.getParentEntity();
        var product = row.getProduct();
        var skipRounding = !product || SM1OrderHelper.skipConversionRounding(row.get("CODART"), product.get("FLGVARIABLEWEIGHT"), row.get("UMORD"), row.get("UMINV"), cacheData);
        if (this._isQtyInvEditable(order, row) && fieldName != "UMORD") {
            if (prevQTYORD == 0 ||
                row.get("QTYINV") == SalesForceEngine.convertQuantity(row.get("CODART"), prevQTYORD, row.get("UMORD"), row.get("UMINV"), cacheData, skipRounding) ||
                SM1OrderHelper.skipQtyInvConversion(product.get("FLGVARIABLEWEIGHT"), order.get("CODTYPORD"))) {
                row.set("QTYINV", SM1OrderHelper.calculateQtyInv(row.get("CODART"), product.get("FLGVARIABLEWEIGHT"), row.get("QTYORD"), order.get("CODTYPORD"), row.get("UMORD"), row.get("UMINV"), cacheData));
            }
        }
        else {
            row.set("QTYINV", SM1OrderHelper.calculateQtyInv(row.get("CODART"), product.get("FLGVARIABLEWEIGHT"), row.get("QTYORD"), order.get("CODTYPORD"), row.get("UMORD"), row.get("UMINV"), cacheData));
        }
    };

    this._updateQtyOrdFieldValue = function (row, cacheData) {
        var order = row.getParentEntity();
        if (this._isQtyInvEditable(order, row) && row.get("QTYORD") == 0) {
            row.set("QTYORD", SalesForceEngine.convertQuantity(row.get("CODART"), row.get("QTYINV"), row.get("UMINV"), row.get("UMORD"), cacheData));
        }

        if (row.getParentEntity() && SM1OrderHelper.isUpdateOfOrigQtyRequired(row.getParentEntity())) {
            row.set("QTYORDORIG", row.get("QTYORD"));
        }
    };

    this._updateOrderRowDetailAfterQtyOrdChange = function (row, oldQtyOrd, gui) {
        var newQtyOrd = row.get("QTYORD");
        var order = row.getParentEntity();
        //update the children before calculating the order amounts
        SalesForceEngine.updateKitOnParentChanged(row, "QTYORD", gui.CacheData);
        this._updateQtyInvFieldValue(row, oldQtyOrd, "QTYORD", gui.CacheData);
        SM1OrderHelper.updateAdjustmentData(row, gui.CacheData);
        if (SM1OrderHelper.isUpdateOfOrigQtyRequired(order))
            row.set("QTYORDORIG", row.get("QTYORD"));
        var codTypOrd = order.get("CODTYPORD");
        if (codTypOrd != SalesForceNameSpace.OrderCTORD.INVENTORY &&
            !SM1OrderHelper.isAStockCorrection(codTypOrd) &&
            SM1OrderHelper.isBatchManaged(codTypOrd) &&
            (SM1OrderHelper.areBatchesPreloaded(codTypOrd, row.get("CODTYPROW")) ||
             SM1OrderHelper.isADelivery(codTypOrd)) &&
            !row.isWhsBalanceExceeded("QTYORD")) {
            row.distributeOrderedQuantityToBatches(gui.CacheData);
        }

        if (this._validateBenefitQtyOrd(gui, row, newQtyOrd)) {
            this._handleQtyOrdChange(gui, row, newQtyOrd, oldQtyOrd);
        }
        SalesForceEngine.getPossibleBenefitsForRow(row, gui.CacheData);
        this.refreshDiscounts(gui, row, true);
        order.calculateBenefits(gui.CacheData);

        row.splitQuantityFieldValue("QTYORD", newQtyOrd, gui.CacheData);
        row.splitQuantityFieldValue("WHSBALANCEORD", row.get("WHSBALANCEORD"), gui.CacheData);

        //Reset CODQTYMODCAUSE when QTYORD is equal to QTYORDORIG
        if (newQtyOrd == row.get("QTYORDORIG") && !XApp.isEmptyOrWhitespaceString(row.get("CODQTYMODCAUSE")))
            row.set("CODQTYMODCAUSE", "");

        //Reset CODQTYREJCAUSE when QTYORD is equal to QTYORDORIG
        if (newQtyOrd == row.get("QTYORDORIG") && !XApp.isEmptyOrWhitespaceString(row.get("CODQTYREJCAUSE")))
            row.set("CODQTYREJCAUSE", "");

        if (SM1OrderHelper.isADelivery(order.get("CODTYPORD")))
            row.set("QTYREJECT", row.get("QTYORDORIG") - row.get("QTYORD"));
    };

    this._isValidQtyInvField = function (row, codTypOrd, cacheData) {
        var percentLimit = OrderParameters.getInstance(codTypOrd).getPercentLimitValueBetweenQtyinvQtyord() / 100;
        var convertedQtyord = SalesForceEngine.convertQuantity(row.get("CODART"), row.get("QTYORD"), row.get("UMORD"), row.get("UMINV"), cacheData, true);
        var maxLimit = convertedQtyord + (convertedQtyord * percentLimit);
        var minLimit = convertedQtyord - (convertedQtyord * percentLimit);

        if (row.get("QTYINV") > maxLimit || row.get("QTYINV") < minLimit)
            return false;

        return true;
    };

    /// <summary>
    /// Check if the QTYINV field needs to be filled
    /// </summary>
    this._isMissingQtyInvField = function (row, codTypOrd, cacheData) {
        var order = row.getParentEntity();
        var product = row.getProduct();

        return order && product && product.get("FLGVARIABLEWEIGHT") &&
            row.get("QTYORD") > 0 && row.get("QTYINV") == 0 &&
            SM1OrderHelper.skipQtyInvConversion(product.get("FLGVARIABLEWEIGHT"), order.get("CODTYPORD"));
    };

    this._startOrderDurationCounter = function (gui) {
        gui._orderStartTime = new Date().getTime();
    }

    this._stopOrderDurationCounter = function (gui) {
        if (gui._orderStartTime) {
            var document = gui.getDocument();
            //update "CALCULATEDSPENTTIME" field
            var orderEndTime = new Date().getTime();
            var orderDiffTime = Math.round((orderEndTime - gui._orderStartTime) / 1000);
            document.set("CALCULATEDSPENTTIME", document.get("CALCULATEDSPENTTIME") + orderDiffTime, true);
        }
    };

    this.getDetailCustomContext = function (detailGui) {

        switch (detailGui.entityName) {
            case SFConstants.ORDERROW:
                return {
                    "artRow": detailGui.entity.getProduct()
                };
            default:
                return {};
        }
    };

    this.cancelConfirmation = function (obj, gui) {
        obj.set("DTECLOSE", Constants.SM1MINDATE);
        if (obj.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSLOAD && obj.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.WHSUNLOAD) {
            if (OrderParameters.getInstance(gui.getDocument().get("CODTYPORD")).getSuspendOnEdit()) {
                obj.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
                this._setCloseButtonStatus(gui, obj.get("CODSTATUS"), obj.get("CODTYPORD"));
                obj.set("CODSTATUSMAN", "99");
            }
            else {
                obj.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
                this._setCloseButtonStatus(gui, obj.get("CODSTATUS"), obj.get("CODTYPORD"));
            }
        }
        else {
            var constraints = new XConstraints({
                logicalOp: "AND",
                constraints: [
                new XConstraint("NUMORD", SqlRelationalOperator.Equal, gui.getDocument().get("NUMORD")),
                new XConstraint("CODDIV", SqlRelationalOperator.Equal, gui.getDocument().get("CODDIV"))
                ]
            });
            //for van orders keep the previous status
            var orders = XNavHelper.getNavRecords("NAV_MOB_VANMOVEMENTS", constraints);
            if (orders && orders[0])
                obj.set("CODSTATUS", orders[0].get("CODSTATUS"));
            else
                obj.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
            this._setCloseButtonStatus(gui, obj.get("CODSTATUS"), obj.get("CODTYPORD"));
        }
        if (obj._isNumDocGeneratedAtConfirmButtonClick) {
            var year = (new Date()).getFullYear();
            var key = obj.get("CODUSR") + "|" + obj.get("CODTYPORD") + "|" + year;
            //in offline mode try to decrease the maxim value
            if (window.NumDocs != undefined && window.NumDocs[key] != undefined) {
                window.NumDocs[key] = window.NumDocs[key] - 1;
            }
            //if NUMDOC is populated then remove it to avoid to save an order in DRAFT with NUMDOC populated
            if (!XApp.isEmptyOrWhitespaceString(obj.get("NUMDOC")))
                obj.set("NUMDOC", "");

            //reset the flag
            obj._isNumDocGeneratedAtConfirmButtonClick = false;
        }
        this.refreshAll(gui, true);
    };

    this.onSaveDocumentFailed = function (context) {
        if (context.interactive) {
            context.cancel = true;
            XUI.hideWait();
            XUI.showErrorMsgBox(context.exception.message);
            XHistory.back();
        }
    };

    this.onSaveDocument = function (gui, document, onSuccess) {
        var self = this;
        var startTimer = new Date();

        var save = function () {

            self._stopOrderDurationCounter(gui);

            //force saving configured order types to the server (even in full offline mode)
            XApp.exec(onSuccess, [SM1OrderHelper.managedOnlyOnline(document.get("CODTYPORD"))]);
        };

        if (document.get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.BLOCCATO && !gui.NonBlockingAnom) {
            document.set("CODSTATUS", SalesForceNameSpace.SM1OrderStatus.SOSPESO);
            this._setCloseButtonStatus(gui, document.get("CODSTATUS"), document.get("CODTYPORD"));
            document.set("CODSTATUSMAN", "99");
        }

        if (document.get("CODSTATUS") == SalesForceNameSpace.SM1OrderStatus.ANNULLATO) {
            this._clearExtraEntities(document);
            save();
            return true;
        }

        var negativeVals = "";
        document.getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
            if (or.get("QTYORD") < 0) {
                negativeVals = or.get("CODART") + or.get("DESART");
                XLog.logWarn("Removing row with negative quantity: CODART: " + or.get("CODART") + or.get("DESART") + " NUMROW: " + or.get("NUMROW"), true);
            }
        });

        if (!XApp.isEmptyOrWhitespaceString(negativeVals)) {
            XUI.showErrorMsgBox(UserContext.tryTranslate("[ORDERROW_NEGATIVE_VALUE]") + " :" + negativeVals);
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        if (document.getSubEntityStore(SFConstants.ORDERROW).getCount() == 0) {
            XUI.showErrorMsgBox(UserContext.tryTranslate("[ORDER_MUST_HAVE_ROWS]"));
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        if (!this.salesRowsPresent(document)) {
            XUI.showErrorMsgBox(UserContext.tryTranslate("[NO_SALES_ROW]"));
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }
        if (!this.salesRowsPresentNoListAllowed(document)) {
            XUI.showErrorMsgBox(UserContext.tryTranslate("[SALES_ROWS_WITH_NO_PRICE]"));
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        var missingSpecialPrice = this._checkSpecialPricePresent(gui);
        if (missingSpecialPrice.length > 0) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.PRICE_MANDATORY_BECAUSE_NO_LIST_PRESENT]") + "<br />" + missingSpecialPrice.join('<br />') });
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        //check if CODTYPROW is set for all rows
        var missingCodTypRow = false;
        document.getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
            missingCodTypRow = missingCodTypRow || XApp.isEmptyOrWhitespaceString(or.get("CODTYPROW"));
        });
        if (missingCodTypRow) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.MISSING_CODTYPROW]") });
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        if (document.get("MACROTYPE") == SalesForceNameSpace.OrderMacroType.ASSET && XApp.isEmptyOrWhitespaceString(document.get("CODWHS"))) {
            XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBGUIORDER.MISSING_ASSET_WAREHOUSE]") });
            XUI.hideWait();
            this.cancelConfirmation(document, gui);
            this.closeAnomalyPopup(gui);
            return false;
        }

        document.calculateBenefits(gui.CacheData);

        this._clearExtraEntities(document);
        SM1OrderHelper._showTime("onSaveDocument", false, startTimer);

        save();
        return true;
    };

    this._isRemovableZeroQtyRow = function (order, row, cacheData) {
        return row.get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA &&
            row.get("CODSRC") == SalesForceNameSpace.OrderBESRC.MANUALE &&
            row.get("QTYORD") == 0 &&
            row.get("QTYINV") == 0 &&
            row.get("QTYORDORIG") == 0 &&
            this._canRemoveOrderRow(order, row, cacheData);
    };

    this._removeZeroOrderRows = function (order, cacheData) {
        var self = this;
        var rowsToRemove = [];
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);
        orderRows.each(function (or) {
            if (self._isRemovableZeroQtyRow(order, or, cacheData)) {
                rowsToRemove.push(or);
                XLog.logWarn("Removing row with 0 quantity: CODART: " + or.get("CODART") + or.get("DESART") + " NUMROW: " + or.get("NUMROW"), true);
            }
        });

        var discBenManager = new DiscountApplier.AppliedDiscountBenefitManager(order);
        for (var i = 0; i < rowsToRemove.length; i++) {
            var row = rowsToRemove[i];
            this.removeAllRowCnvAppliedGroups(row, order);
            discBenManager.removeAppliedBenefits(row);
            orderRows.remove(row);
            if (SM1OrderHelper.canKitArticlesBeExploded(order, row.get("FLGARTKIT")))
                //also delete all child products
                SalesForceEngine.removeKitArticles(row, order);
        }

        return rowsToRemove.length > 0;
    };

    this._clearExtraEntities = function (document) {

        document.getSubEntityStore(SFConstants.ORDERROW).each(function (or) {
            or.getSubEntityStore("AppliableBenefit").clear();    //clear the appliable benefits to remove cyclic references
        });

        document.AppliableBenefits = [];
    };
    /// <summary>
    /// If the order macro type is sales, check for presence of 
    /// at least one sales row
    /// </summary>
    this.salesRowsPresent = function (document) {
        if (document.get("MACROTYPE") != SalesForceNameSpace.OrderMacroType.SALES)
            return true;

        var saleRow = document.getSubEntityStore(SFConstants.ORDERROW).findBy(function (or) {
            return or.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.SALES;
        });

        return saleRow != null;
    };

    /// <summary>
    /// If the order macro type is sales, check for presence of 
    /// at least one sales row with gross amount  > 0 ... if nolistallowed = false
    /// </summary>
    this.salesRowsPresentNoListAllowed = function (document) {
        var startTimer = new Date();

        var codTypOrd = document.get("CODTYPORD");
        var macrotype = document.get("MACROTYPE") || codTypOrd;

        if (OrderParameters.getInstance(codTypOrd).getNoListAllowed() ||
            macrotype != SalesForceNameSpace.OrderMacroType.SALES)
            return true;

        var nolistrow = document.getSubEntityStore(SFConstants.ORDERROW).findBy(function (or) {
            return (or.get("MACROTYPE") == SalesForceNameSpace.OrderRowMacroType.SALES &&
                or.get("CODSRC") != SalesForceNameSpace.OrderBESRC.CANVAS &&
                or.get("QTYORD") > 0 &&
                or.get("GROSSAMOUNT") == 0);
        });

        SM1OrderHelper._showTime("salesRowsPresent", false, startTimer);

        if (nolistrow && !OrderParameters.getInstance(codTypOrd).getPriceZeroAllowed())
            return false;

        return true;
    };

    this.afterOpenSubDetail = function (context) {
        var startTimer = new Date();
        var order = context.detailContext.gui.getDocument();
        var entity = context.newEntity;
        var self = this;

        switch (entity.getEntityName()) {
            case SFConstants.ORDERROW:
                if (!XApp.isEmptyOrWhitespaceString(entity.get("CODART"))) {
                    //remove cancel button
                    this._hideDetailPopupCancelButton(context.detailContext);
                    //update the title of the popup
                    context.detailContext._popup.setTitle(this._buildOrderRowDetailTitle(entity));
                }

                if (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD"))) {
                    context.detailContext.detailValid = !this._rowHasInvalidBatch(order, entity);
                }

                context.detailContext.gui.OrderRowPopupContext = context;
                break;
        }

        context.detailContext.gui.CacheData.m_discardedBenefitsManager.clearBenefitDiscardList();

        SM1OrderHelper._showTime("afterOpenSubDetail", false, startTimer);
    };

    this._rowHasInvalidBatch = function (order, orderRow) {
        var self = this;

        var invalidBatch = orderRow.getSubEntityStore(SFConstants.ORDERROWBATCH).findBy(function (batch) {
            return !self._validateBatch(batch, orderRow, order);
        });

        return invalidBatch != null;
    };

    this._orderHasInvalidBatch = function (order) {
        var self = this;
        var isInvalid = false;

        if (SM1OrderHelper.isBatchManaged(order.get("CODTYPORD"))) {

            order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {

                if (self._rowHasInvalidBatch(order, orderRow)) {
                    isInvalid = true;
                    return isInvalid;
                }
            });
        }

        return isInvalid;
    };

    this._hideDetailPopupCancelButton = function (detailContext) {
        var dockedItems = detailContext._popup.getDockedItems();
        var toolbar = null;
        for (var i = 0; i < dockedItems.length; i++) {
            if (dockedItems[i].getDocked() == 'top') {
                toolbar = dockedItems[i];
                break;
            }
        }

        if (toolbar) {
            toolbar.items.getAt(1).setHidden(true);
        }
    };

    this.preSaveDocument = function (gui, document) {
        if (this._isCancellingOrder) {
            gui.setModified(document);
            this._isCancellingOrder = false;
        }
        else {
            if (document.isModified() && gui.isEditable())
                gui.setModified(document);
            else
                gui.clearModified();
        }
        return true;
    };

    this._hasOrderToBeSigned = function (order, action) {
        var alreadySigned = false;
        order.getAttachments().forEach(function (attachment) {
            if (attachment.CODFILETYPE == "S") {
                alreadySigned = true;
            }
        });

        switch (SM1OrderHelper.isSignatureRequired(order.get("CODTYPORD"))) {
            case SalesForceNameSpace.SignatureRequired.ONCONFIRM:
                return action == SalesForceNameSpace.OrderAction.CONFIRM && !alreadySigned;
            case SalesForceNameSpace.SignatureRequired.ONCLOSE:
                return action == SalesForceNameSpace.OrderAction.CLOSE && !alreadySigned;
            default:
                return false;
        }
    };

    this._createSignaturePopup = function (onAfterUploadAttachment, gui, order, onCancel, onFailure) {
        var self = this;
        var onDone = function (file) {
            var data = { file: file, des: "Signature" };
            var attsSectionPanel = Ext.create('GuiAttachmentsSectionPanel');
            //change openMode to anything else but 'NEW', because otherwise the signature won't be saved
            gui.openMode = 'OPEN';
            //upload the signature to the attachments collection of the document
            gui.getCtrl().uploadAttachment(order, data, attsSectionPanel, function () {
                onAfterUploadAttachment();
            }, function () {
                onFailure();
            },
                true);
        };

        var popup = Ext.create('XSignaturePopup', {
            SM1Listeners: {
                onConfirm: onDone,
                onCancel: onCancel
            }
        });
        app.viewport.add(popup);
    };

    this._checkSignature = function (gui, order, anomalies, action, afterOrderSigned) {
        if (!this._hasOrderToBeSigned(order, action)) {
            XHistory.back();
            return;
        }
        switch (action) {
            case SalesForceNameSpace.OrderAction.CONFIRM:
                if (!(UserContext.isFullOfflineMode() && !SM1OrderHelper.managedOnlyOnline(order.get("CODTYPORD")))) {
                    for (i = 0; i < anomalies.length; i++) {
                        var anomaly = anomalies[i];
                        if (anomaly.get("CODANOMALY") == SalesForceNameSpace.OrderAnomalyCodes.SIGNATURE_MANDATORY) {
                            this._takeSignatureAndSave(gui, order, afterOrderSigned);
                            break;
                        }
                    }
                } else {
                    this._takeSignatureAndSave(gui, order, afterOrderSigned);
                }
                break;
            case SalesForceNameSpace.OrderAction.CLOSE:
                this._takeSignatureAndSave(gui, order, afterOrderSigned);
                break;
            default:
                break;
        }
    };

    this._takeSignatureAndSave = function (gui, order, afterOrderSigned) {
        var self = this;
        var _gui = gui;
        this._createSignaturePopup(
                function () {
                    XApp.exec(afterOrderSigned);
                }, gui, order,
                function () {
                    // if the user cancel the signature pop up the gui is closed
                    // and reopen because in that moment the order is already saved
                    XHistory.actualConfig().openMode = "EDIT";
                    XHistory.actualConfig().docKey = _gui.getDocument().get("DOCUMENTKEY");
                    XHistory.again();
                },
                function () {
                    XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[SIGNATURE_NOT_SAVE]") });
                });
    };

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        // set the anomaly report because after the new document is set the 
        // reference to the anomalies is lost
        if (!doc)
            return;

        var oldDoc = gui.getDocument();
        doc.anomalyReport = oldDoc.anomalyReport;
        doc.m_excludedAutoActions = oldDoc.m_excludedAutoActions;
        doc.m_usrIndicatedCnvGrp = oldDoc.m_usrIndicatedCnvGrp;
        doc.m_usrUnappliableCnv = oldDoc.m_usrUnappliableCnv;
        gui.docKey = doc.get("DOCUMENTKEY");
        gui.setDocument(doc);
        this._refreshTab(gui, doc, true);

        //see if the document doesn't already have a signature
        var startTimer = new Date();

        if (SM1OrderHelper.canCreateOpenInvoice(doc)) {
            SalesForceEngine.createOpenInvoice(doc, onFailure, onSuccess);
        } else
            XApp.exec(onSuccess);

        SM1OrderHelper._showTime("afterSaveDocument", false, startTimer);
    };

    this.beforeCacheDoc = function (gui) {
        this._stopOrderDurationCounter(gui);
    };

    this._getBarcodeScannedHandler = function (gui) {
        var self = this;
        return function (code) {
            self._onBarcodeScanned(gui, code);
        };
    };

    this._onBarcodeScanned = function (gui, code) {
        var activeTab = gui.tabPanel.getActiveItem();

        //check if the current tab is the one with order rows
        if (!activeTab || activeTab.tabName != "ROWS")
            return;

        //check if the barcode should be ignored
        if (!gui.canInterpretBarcode(this))
            return;

        var prod = BarcodeScannerUtils.getProductRowByEanCode(code);
        //check if the product exists in the navigator
        if (prod) {
            var rowsTab = gui.tabCtrls.ROWS;
            var section = rowsTab.sections.GRID;
            if (!section)
                return;

            if (OrderParameters.getInstance(gui.getDocument().get("CODTYPORD")).getFilterScannedProductOrderRows()) {
                section.searchField.setValue(prod.get("DESART"));
                rowsTab.search.call(rowsTab, section.store, prod.get("DESART"), section.searchField.searchFields);
            }
            else {
                var existFilter = section.store.getAllCount() - section.store.getCount() != 0;
                if (existFilter) {
                    section.store.clearFilter();
                    section.searchField.reset();
                    section.grid.resetFilterSection(false);
                }
            }
            this._updateScannedOrderRow(prod.get("CODART"), gui, rowsTab, code);
        }
        else {
            //If the EAN code is not found in the product master data the product is not added to the order 
            //and an alert message should be shown to the user
            XUI.showWarnOk({
                msg: UserContext.tryTranslate("[MOB.PRODUCT_EAN_NOT_FOUND]")
            });
        }
    };

    this.beforeNotifyLeave = function (context) {
        //remove barcode scanner listener
        BarcodeScanner.removeListener(this._getBarcodeScannedHandler(null), this);
    };

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;
        var document = gui.docStore ? gui.getDocument() : null;
        SalesForceEngine.cleanupCacheData(gui.CacheData, document);
        SalesForceEngine.orderBenefitState = new OrderBenefitState();

        delete this._cnvQtyOrd;
        delete this._newNumRow;
        delete this._openDayID;
        delete gui._orderStartTime;

        delete this._isAddEmpty;
        delete this._isAddReturn;
        delete this._isCancellingOrder;

        if (gui.CacheData) {
            if (gui.CacheData.DiscountApplier) {
                gui.CacheData.DiscountApplier.cleanup();
                delete gui.CacheData.DiscountApplier;
            }
        }

        delete gui.CacheData;
        delete gui.CacheContext;
        delete gui.OrderRowPopupContext;

        //remove buttons
        delete gui.refreshPricingButton;
        delete gui.preloadAssoButton;
        delete gui.preloadAssetsButton;
        delete gui.preloadButton;
        delete gui.removeZeroOrderRowsButton;
        delete gui.cancelOrderButton;
        delete gui.viewSignatureButton;
        delete gui.confirmButton;
        delete gui.reportButton;
        delete gui.closeButton;
        delete gui.reloadPricingButton;
        delete gui.showRoute;

        //remove anomaly popup
        delete this.anomalyGuiSection;
        if (gui.anomReportGui) {
            if (gui.anomReportGui.detailContext)
                gui.anomReportGui.detailContext.cleanup();
            if (gui.anomReportGui.popup) {
                gui.anomReportGui.popup.hide();
                Ext.Viewport.remove(gui.anomReportGui.popup);
                gui.anomReportGui.popup.destroy();
            }
            if (gui.anomReportGui.anomPanel)
                gui.anomReportGui.anomPanel.destroy();
        }
        delete gui.anomReportGui;
    };

    this._showPreloadOrderPopup = function (gui, onSuccess, onFail) {
        var self = this;

        XUI.destroyUIElement("numPrevOrders");
        var numPrevOrders = new XNumTextBox({
            id: 'numPrevOrders',
            label: UserContext.tryTranslate("[MOBORDER.PRELOAD_NR_PREVIOUSORDERS]"),
            formatString: "##",
            minValue: 1,
            maxValue: 20,
            stepValue: 1,
            useSpinners: true
        });
        numPrevOrders.setValue(OrderParameters.getInstance(gui.getDocument().get("CODTYPORD")).getPreloadPrevOrders());

        var popup = Ext.create('XBasePopup', {
            modal: true,
            centered: true,
            hideOnMaskTap: true,
            cls: 'sm1-popup sm1-orderpreload-popup',
            topToolbar: true,
            bottomToolbar: true,
            title: UserContext.tryTranslate("[MOBORDER.ORDERPRELOAD]"),
            items: [{
                xtype: 'fieldset',
                cls: 'sm1-gui-fieldset',
                items: [numPrevOrders]
            }],
            SM1Listeners: {
                onConfirm: function () {
                    self.confirmPreloadOrderPopup(popup, gui, onSuccess, onFail);
                },
                onCancel: function () {
                    self.cancelPreloadOrderPopup(popup);
                },
                onKeyUp: function (event) {
                    switch (event.keyCode) {
                        case 13:
                            self.confirmPreloadOrderPopup(popup, gui, onSuccess, onFail);
                            break;
                        case 27:
                            self.cancelPreloadOrderPopup(popup);
                    }
                    return false;
                }
            }
        });

        popup.init();
        Ext.Viewport.add(popup);
    };

    this.cancelPreloadOrderPopup = function (popup) {
        try {
            popup.hide(true);
            Ext.Viewport.remove(popup);
            popup.destroy();
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.confirmPreloadOrderPopup = function (popup, gui, onSuccess, onFail) {
        try {

            var num = Ext.getCmp('numPrevOrders');
            var prevOrders = num.getValue();
            if (prevOrders <= 0)
                return;

            //validation OK. 
            //Close popup
            popup.hide(true);
            Ext.Viewport.remove(popup);
            popup.destroy();

            //continue with preloading
            XUI.showWait();
            var orderClone = gui.getDocument().clone();
            this._clearExtraEntities(orderClone);
            SalesForceEngine.getLatestOrderedProducts(orderClone, prevOrders, gui.CacheData, onSuccess, onFail);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this._getOrderRowFieldEditability = function (gui, orderRow, fieldName) {
        var order = gui.getDocument();
        //return true for DESART in order to be able to open the hyperlink
        if (fieldName == "DESART")
            return true;

        //When full edit is not enabled the user can edit only QTYINV : ENH 32128 Restrict editability for van load and integration order in valid status
        if (fieldName != "QTYINV" && SM1OrderHelper.restrictedEditability(order))
            return false;

        var codSrc = orderRow.get("CODSRC");
        var isVirtualKit = SM1OrderHelper.isVirtualKit(orderRow);
        var isVirtualKitComponent = SM1OrderHelper.isVirtualKitComponent(orderRow, order);
        var isQtyOrd = (fieldName == "QTYORD" ||
            (SM1OrderHelper.isNewMultideliveryActivated(order.get("CODTYPORD"), order.get("CODSTATUS")) &&
            fieldName == SM1OrderHelper.getDeliveryQtyFieldName(SM1OrderHelper.getLastDeliveryDateName(order))));

        if ((codSrc == SalesForceNameSpace.OrderBESRC.CANVAS || codSrc == SalesForceNameSpace.OrderBESRC.BUDGET) &&
            !XApp.isEmptyOrWhitespaceString(orderRow.get("CODSRCREF"))) {
            var macroType = orderRow.get("MACROTYPE");

            if (isVirtualKit || isVirtualKitComponent) {
                if (fieldName == "PRZSPEC" && macroType == SalesForceNameSpace.OrderRowMacroType.SALES)
                    return true;

                if (isVirtualKitComponent)
                    return false;

                if (isVirtualKit) {
                    if (isQtyOrd) {
                        var ben = SalesForceEngine.findGroupBenefitByKey(gui.CacheData.m_canvassCollection, orderRow.get("CODSRCREF"));
                        if (ben && ben.get("CODTYPBEN") != SalesForceNameSpace.OrderBENTYP.OMAG_ART_SCELTA) {
                            var parentCnvAction = ben.getParentEntity().getParentEntity().getParentEntity();
                            if (parentCnvAction.get("CODDISCR") == SalesForceNameSpace.CnvActionDiscretion.DISCRETIONARY)
                                return true;
                            if (ben.get("QTYBENMIN") != 0 || ben.get("QTYBENMAX") != 0)
                                return true;
                        }
                    }
                    return false;
                }
            }
            else if (isQtyOrd && macroType == SalesForceNameSpace.OrderRowMacroType.GIFT) {
                var ben = SalesForceEngine.findGroupBenefitByKey(gui.CacheData.m_canvassCollection, orderRow.get("CODSRCREF"));
                if (ben && ben.get("CODTYPBEN") != SalesForceNameSpace.OrderBENTYP.OMAG_ART_SCELTA) {
                    return true;
                }
            }

            return false;
        }

        if (codSrc == SalesForceNameSpace.OrderBESRC.ANAGRAFICA) {
            if (isVirtualKitComponent)
                return false;
            if (isVirtualKit) {
                var rowDiscounts = gui.CacheData.DiscountApplier.DiscountCache.getByKey(orderRow.get("CODART"));
                var sourceDiscount;
                for (i = 0; i < rowDiscounts.length; i++) {
                    if (orderRow.get("CODSRCREF").startsWith(rowDiscounts[i].PRGLIST + rowDiscounts[i].CODLIST))
                        sourceDiscount = rowDiscounts[i];
                }
                if (sourceDiscount && sourceDiscount.CODDISCR == SalesForceNameSpace.DiscountDISCR.DISCR && isQtyOrd)
                    return true;
                else
                    return false;
            }
            else {
                if (isQtyOrd)
                    return orderRow.getSubEntityStore(SFConstants.ORDERROWPARENTBENEFIT).getCount() > 0;
                return false;
            }
        }

        if (codSrc == SalesForceNameSpace.OrderBESRC.PROMOTION) {
            if (isVirtualKitComponent)
                return false;
            if (isVirtualKit) {
                if (OrderParameters.getInstance().getOrdAutoApplyPromo() || !isQtyOrd)
                    return false;
                else
                    return true;
            }
            else {
                if (isQtyOrd)
                    return orderRow.getSubEntityStore(SFConstants.ORDERROWPARENTBENEFIT).getCount() > 0;
                return false;
            }
        }

        if (SM1OrderHelper.isPhysicalKitComponent(orderRow, order) && fieldName != "PRZSPEC" && !fieldName.startsWith("PRCDISCOUNT"))
            return false;

        if (SM1OrderHelper.isVirtualKitComponent(orderRow, order) && fieldName != "PRZSPEC" && !fieldName.startsWith("PRCDISCOUNT") &&
            fieldName != "QTYORD" && fieldName != "UMORD" && !fieldName.startsWith("QTYDELIV"))
            return false;

        return true;
    };

    //store user's input qty for canvass/discount/promo gift rows
    this._handleQtyOrdChange = function (gui, orderRow, newValue) {
        if (orderRow.get("MACROTYPE") != SalesForceNameSpace.OrderRowMacroType.GIFT)
            return

        if (orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.CANVAS) {
            var ben = SalesForceEngine.findGroupBenefitByKey(gui.CacheData.m_canvassCollection, orderRow.get("CODSRCREF"));

            if (!ben) {
                return;
            }

            // set benefit value with the user's input value
            var rowBenefit = orderRow.OrderRowBenefitDetailsStore.findBy(function (benefit) { return benefit.get("CODSRCREF") == ben.get("id") });
            if (rowBenefit)
                rowBenefit.set("QTYBEN", newValue);
            ben.UserGiftQty.add(orderRow.get("CODART"), newValue);
        } else if (orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.ANAGRAFICA || orderRow.get("CODSRC") == SalesForceNameSpace.OrderBESRC.PROMOTION) {
            orderRow.getSubEntityStore(SFConstants.ORDERROWPARENTBENEFIT).each(function (ben) {
                if (newValue != ben.get("QTYBEN")) {
                    ben.set("QTYBEN", newValue);
                    ben.set("USERMODIFIED", true);
                }
            });
        }
    };

    //updateRoute
    this._reAlignRoute = function (dteDeliv, gui) {

        var order = gui.getDocument();
        var optionOrderRoutes = SalesForceEngine.getOrderRoutes(dteDeliv, true);
        if (!optionOrderRoutes)
            return;
        var mainDetailContext = gui.tabCtrls["MAIN"];
        if (mainDetailContext) {
            var idRouteField = mainDetailContext.fields.IDROUTE;
            if (idRouteField) {
                idRouteField.setOptions(optionOrderRoutes);
                mainDetailContext.refreshControls();
            }
        }
        //if we have only route set route in combo

        if (gui.isEditable()) {
            //optionOrderRoutes.length == 2  because in position 1 we always have the empty value 
            if (optionOrderRoutes.length == 2) {
                // Set default value for IDROUTE when exist only one avaiable route and the user did not previously select any route
                order.set("IDROUTE", optionOrderRoutes[1].value);
                gui.setModified(order);
                return;
            }

            //If when reopening the Order the previously associated route is no longer valid/present the system should just clear  the IDROUTE field,
            //It does not matter if in the route collection loaded there is only one router or more.
            if (order.get("IDROUTE") != 0 && Ext.Array.filter(optionOrderRoutes, function (r) { return r.value == order.get("IDROUTE"); }).length == 0) {
                order.set("IDROUTE", 0);
                gui.setModified(order);
            }
        }
    };

    this._checkUnavailableLocation = function (gui) {
        var order = gui.getDocument();
        if (XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE")))
            return false;

        var assortmentLocations = this._getAssortmentLocations(gui.CacheData);
        if ((XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")) && !Ext.Array.contains(assortmentLocations, SFConstants.EMPTYCODLOCATION)) ||
            (!XApp.isEmptyOrWhitespaceString(order.get("CODLOCATION")) && !Ext.Array.contains(assortmentLocations, order.get("CODLOCATION")))) {
            XUI.showWarnOk({ msg: UserContext.tryTranslate("[WARNING_LOCATION_UNAVAILABLE]") });
            return true;
        }
        return false;
    };

    this._checkUnavailableCustAddress = function (gui) {
        var order = gui.getDocument();
        if (XApp.isEmptyOrWhitespaceString(order.get("CODADDR")))
            return false;

        var availableAddresses = this._getCustomerAddressesVoices(order);
        if (Ext.Array.filter(availableAddresses, function (addr) { return addr.value == order.get("CODADDR"); }).length == 0) {
            return true;
        }
        return false;
    };

    this._setDefaultAssortmentLocation = function (gui, assortmentLocations) {
        var order = gui.getDocument();
        if (!order || XApp.isEmptyOrWhitespaceString(order.get("CODCUSTSALE")))
            return;

        if (!assortmentLocations)
            assortmentLocations = this._getAssortmentLocationVoices(gui.CacheData);

        if (assortmentLocations.length == 2)
            order.set("CODLOCATION", assortmentLocations[1].value);
        else
            order.set("CODLOCATION", "");
    };

    this._setDefaultCustAddress = function (gui, custAddresses) {
        var order = gui.getDocument();
        if (!order || !order.DeliveryCustomer)
            return;

        if (custAddresses.length >= 2)
            order.set("CODADDR", custAddresses[1].value);
        else
            order.set("CODADDR", "");
    }

    this._loadAssortmentLocations = function (gui, setDefaultAssortmentLocation) {
        var order = gui.getDocument();


        var mainDetailContext = gui.tabCtrls["MAIN"];
        if (mainDetailContext) {
            var codLocation = mainDetailContext.fields.CODLOCATION;
            if (codLocation) {
                var assortmentLocations = this._getAssortmentLocationVoices(gui.CacheData);

                if (setDefaultAssortmentLocation)
                    this._setDefaultAssortmentLocation(gui, assortmentLocations);

                codLocation.setOptions(assortmentLocations);
                if (assortmentLocations.length == 1) {
                    codLocation.fieldContext.config.attrs["editable"] = "false";
                }
            }

            mainDetailContext.refreshControls();
        }
    };

    this._loadCustAddresses = function (gui, setDefaultCustAddress) {
        var order = gui.getDocument();

        var custAddresses = this._getCustomerAddressesVoices(order);

        if (this._checkUnavailableCustAddress(gui)) {
            order.set("CODADDR", "");
        }
        if (setDefaultCustAddress)
            this._setDefaultCustAddress(gui, custAddresses);

        var mainDetailContext = gui.tabCtrls["MAIN"];
        if (mainDetailContext) {
            var codAddr = mainDetailContext.fields.CODADDR;
            if (codAddr)
                codAddr.setOptions(custAddresses);

            mainDetailContext.refreshControls();
        }
    };

    this._removeNotOrderableProducts = function (gui, onResult) {
        var self = this;
        var order = gui.getDocument();
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW);
        var discBenManager = new DiscountApplier.AppliedDiscountBenefitManager(order);
        var toRemove = [];
        var kitArticles = [];
        var errCode;
        var discardedProductsCollection = new Array();

        orderRows.each(function (or) {
            if (!XApp.isEmptyOrWhitespaceString(or.get("CODARTKITREF"))) {
                kitArticles.push(or.get("CODARTKITREF"));
            }
            var product = or.getProduct();
            errCode = SalesForceEngine.canOrderProduct(product, or.get("CODTYPROW"), order, gui.CacheData, true, or.get("CODSRC"), true);

            if (!product || !XApp.isEmptyOrWhitespaceString(errCode)) {
                self.removeAllRowCnvAppliedGroups(or, order);
                discBenManager.removeAppliedBenefits(or);
                if (self.canDeleteOrderRow(or, order)) {
                    toRemove.push(or);
                    self._addDiscardedProductsToList(or, errCode, discardedProductsCollection);
                }
                else
                    or.set("CODSTATUS", SalesForceNameSpace.OrderRowStatus.CANCELLATA);
            }
        });

        if (toRemove.length > 0) {
            orderRows.removeAll(toRemove);
            kitArticles = Ext.Array.unique(kitArticles);
            toRemove.forEach(function (or) {
                if (Ext.Array.contains(kitArticles, or.get("CODART")))
                    SalesForceEngine.removeKitArticles(or, order);
            });
            self._showRemovedProductsMessage(discardedProductsCollection, false, onResult);
        }
        return toRemove;
    };

    this._showRemovedProductsMessage = function (discardedProductsCollection, flgVirtualKitsNotOrderable, onResult) {
        var finalMessage = "";
        for (var index in discardedProductsCollection) {
            var discardReason = discardedProductsCollection[index];
            var message = "";
            var products = discardReason.products;
            for (var index in products) {
                var article = products[index];
                message += "<br/>" + article["codArt"] + " " + article["desArt"];
            }
            var context = {
                message: message,
                finalMessage: finalMessage,
                discardReason: discardReason,
                flgVirtualKitsNotOrderable: flgVirtualKitsNotOrderable,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiOrder", 'afterBuildRemovedProductsMessage', context);
            message = context.message;

            XApp.callCust("guiCustomizer", "mobGuiOrder", 'beforeAddDiscardReasonMessage', context);
            finalMessage = context.finalMessage;
            if (context.canceled) {
                continue;
            }

            switch (discardReason.reason) {
                case SalesForceNameSpace.OrderErrorCodes.ARTICLE_OUTSIDE_ORDERABLE_PERIOD:
                    finalMessage += UserContext.tryTranslate("[MOBGUIORDER.ARTICLES_REMOVED_OUTSIDE_ORDERABLE_PERIOD]") + message + "<br/>";
                    break;
                case SalesForceNameSpace.OrderErrorCodes.ARTICLE_OUTSIDE_DELIVERABLE_PERIOD:
                    finalMessage += UserContext.tryTranslate("[MOBGUIORDER.ARTICLE_OUTSIDE_DELIVERABLE_PERIOD]") + message + "<br/>";
                    break;
                case SalesForceNameSpace.OrderErrorCodes.VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE:
                    if (flgVirtualKitsNotOrderable == true)
                        finalMessage += UserContext.tryTranslate("[VIRTUAL_KIT_ARTICLE_NOT_ORDERABLE]") + message + "<br/>";
                    break;
                case SalesForceNameSpace.OrderErrorCodes.NO_CONVERSION_UNIT:
                    finalMessage += UserContext.tryTranslate("[MOBGUIORDER.ARTICLES_WITHOUT_VALID_UM_CONVERSION_FACTOR]") + message + "<br/>";
                    break;
                default:
                    finalMessage += UserContext.tryTranslate("[ARTICLES_REMOVED_NOTORDERABLE]") + message + "<br/>";
                    break;
            }

            finalMessage += "<br/>";
        }
        XUI.showWarnOk({
            msg: finalMessage,
            onResult: onResult
        });
    };


    this._addDiscardedProductsToList = function (row, reason, discardedProductsCollection) {

        if (discardedProductsCollection.length == 0 || !discardedProductsCollection.find(function (x) { return x.reason == reason; })) {
            var articles = new Array();
            articles.push({ codArt: row.get("CODART"), desArt: row.get("DESART") });
            var discardedProducts = new Object();
            discardedProducts.reason = reason;
            discardedProducts.products = articles;
            discardedProductsCollection.push(discardedProducts);
        }
        else {
            for (var index in discardedProductsCollection) {
                var discardReason = discardedProductsCollection[index];
                var checkArticle = false;
                if (reason == discardReason.reason) {
                    var products = discardReason.products;
                    for (var index in products) {
                        var product = products[index];
                        if (row.get("CODART") == product["codArt"]) {
                            checkArticle = true;
                        }
                    }
                    if (checkArticle == false)
                        products.push({ codArt: row.get("CODART"), desArt: row.get("DESART") });
                }
            }
        }
    };

    this._canRemoveOrderRow = function (order, orderRow, cacheData, checkMultipleProd) {
        if (SM1OrderHelper.isPhysicalKitComponent(orderRow, order))
            return false;

        if (SM1OrderHelper.isVirtualKitComponent(orderRow, order) && orderRow.get("CODSRC") != SalesForceNameSpace.OrderBESRC.MANUALE)
            return false;

        if (order.get("CODTYPORD") != SalesForceNameSpace.OrderCTORD.INVENTORY)
            return true;

        //avoid the situation when order row popup is impossible to close:
        //unable to confirm because the order row is not valid (multiple prod per row type)
        //unable to remove because the product is available in the van 
        if (checkMultipleProd &&
            SalesForceEngine.countManualRowsPerProd(order, orderRow.get("CODART"), orderRow.get("CODTYPROW"), orderRow.get("CODSRC")) > 1)
            return true;
        //even if the WHSBALANCEORD and WHSBALANCEINV are 0, do not remove the order row because it's present in warehouse
        var presentInWarehouse = null;
        if (cacheData != undefined && cacheData != null) {
            presentInWarehouse = SalesForceEngine.getWhsBalance(order.get("CODWHS"), orderRow.get("CODART"), order.get("CODTYPORD"), orderRow.get("CODTYPROW"), cacheData);
        }
        return !presentInWarehouse && orderRow.get("WHSBALANCEORD") <= 0 && orderRow.get("WHSBALANCEINV") <= 0;
    };

    this._buildOrderRowDetailTitle = function (orderRowEntity) {
        var context = {
            title: orderRowEntity.get("DESART") + " | " + orderRowEntity.get("CODART"),
            orderRowEntity: orderRowEntity
        };
        XApp.callCust("guiCustomizer", "mobGuiOrder", "buildOrderRowDetailTitle", context);

        return context.title;
    };

    //CODDOCTYPE used in notes logic
    this._notesDocType = "CNOTO";
    //notes QTAB
    this._notesQtab = "NOTES|CNOTO";

    //#region Batch Id management

    /// <summary>
    /// Validate user provided qtyinv against expected value
    /// </summary
    this._isValidBatchQtyInvField = function (batch, cacheData, orderRow) {
        orderRow = orderRow || batch.getParentEntity();
        if (!orderRow || !orderRow.getProduct() || !orderRow.getProduct().get("FLGVARIABLEWEIGHT"))
            return true;

        var expectedQtyInv = SalesForceEngine.convertQuantity(orderRow.get("CODART"), batch.get("QTYORD"),
            orderRow.get("UMORD"), orderRow.get("UMINV"), cacheData);
        var percentLimit = OrderParameters.getInstance(orderRow.getParentEntity().get("CODTYPORD"))
            .getPercentLimitValueBetweenQtyinvQtyord() / 100;

        if (batch.get("QTYINV") > expectedQtyInv * (1 + percentLimit) ||
            batch.get("QTYINV") < expectedQtyInv * (1 - percentLimit))
            return false;

        return true;
    };

    /// <summary>
    /// Check if the batch QTYINV field needs to be filled
    /// </summary>
    this._isMissingBatchQtyInvField = function (batch, cacheData, orderRow) {
        orderRow = orderRow || batch.getParentEntity();
        if (!orderRow)
            return false;

        var order = orderRow.getParentEntity();
        var product = orderRow.getProduct();

        return order && product && product.get("FLGVARIABLEWEIGHT") &&
            batch.get("QTYORD") > 0 && batch.get("QTYINV") == 0 &&
            SM1OrderHelper.skipQtyInvConversion(product.get("FLGVARIABLEWEIGHT"), order.get("CODTYPORD"));
    };

    this._getMinBatchExpDate = function (codTypOrd) {
        var expDays = OrderParameters.getInstance(codTypOrd).getOrdBatchExpDays();
        var minDate = new Date();
        minDate.setDate(XApp.today().getDate() + expDays + 1); //strictly less than
        return minDate.toDate();
    };

    /// <summary>
    /// Check if the order has any rows with batches
    /// </summary
    this._orderHasBatches = function (order) {
        var hasBatches = false;
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            if (row.getSubEntityStore(SFConstants.ORDERROWBATCH).getCount() > 0) {
                hasBatches = true;
                return false; //breaks out of the 'each' loop
            }
        });
        return hasBatches;
    };

    /// <summary>
    /// Check wether ordered quantity is 0 and invoiced quantity is not zero
    /// And the other way around
    /// </summary>
    this._checkInconsistentBatchQties = function (order, orderRow, batch) {
        if (!SM1OrderHelper.areBatchesPreloaded(order.get("CODTYPORD"), orderRow.get("CODTYPROW")))
            return false;

        var qtyOrd = batch.get("QTYORD");
        var qtyInv = batch.get("QTYINV");

        return (qtyOrd == 0 && qtyInv != 0) || (qtyOrd != 0 && qtyInv == 0);
    };

    /// <summary>
    /// Get selected row from grid order rows
    /// </summary>
    this._getSelectedRowIndex = function (rowDetailContext) {
        var grid = rowDetailContext.sections["GRID"].grid;
        var selectedIndex = -1;

        //get the selected row index
        if (grid.selected != null && grid.selected.items.length > 0) {
            var section = rowDetailContext.sections.GRID;
            selectedIndex = section.store.findBy(function (record) {
                if (record.xrec == grid.selected.items[0].xrec)
                    return true;
            });
        }

        return selectedIndex;
    };

    /// <summary>
    /// Select row and if necessary scroll to it
    /// </summary>
    this._selectOrderRow = function (rowDetailContext, index, resetScroll) {
        var grid = rowDetailContext.sections["GRID"].grid;
        var numberOfRows = grid.getStore().getAllCount();

        var scroller = null;
        if (grid.getScrollable()) {
            scroller = grid.getScrollable();
        }

        //select row
        if (index > -1) {
            //if last row was deleted then mark for selection the new last row
            if (index > numberOfRows - 1)
                index = numberOfRows - 1;

            grid.select(index);
            //grid.refresh(); -> doesn't seem to be needed and it takes a lot of time
        }

        //@workaround: even if resetScroll == true, scroll to position (0,1), because otherwise no row will be shown
        if (scroller) {
            if (resetScroll || index == 0)
                scroller.scrollTo(0, 1);
            else
                if (scroller.getPosition())
                    scroller.scrollTo(0, scroller.getPosition().y);
        }
    };

    /// <summary>
    /// Check if the generation of NumDoc is required
    /// </summary>
    this._numDocGenerationRequired = function (status, numDoc) {
        return ((status == SalesForceNameSpace.SM1OrderStatus.INVOICED
                || status == SalesForceNameSpace.SM1OrderStatus.DELIVERED)
                && XApp.isEmptyOrWhitespaceString(numDoc));
    };

    /// <summary>
    /// Check if the application is online or the order is configured to be closed/confirmed also offline, 
    /// while the connection type is FullOfflineMode or the order is an invoice
    /// </summary>
    this._canConfirmOrCloseOrder = function (order) {
        return XApp.isOnline() ||
                    (!SM1OrderHelper.managedOnlyOnline(order.get("CODTYPORD")) &&
                    (UserContext.isFullOfflineMode() || SM1OrderHelper.isAnInvoice(order.get("CODTYPORD"))));
    };

    /// <summary>
    /// Apply the new UM conversion factor if it has changed
    /// </summary>
    this._recalculateInvoicedQuantities = function (order, cacheData) {

        order.getSubEntityStore(SFConstants.ORDERROW).each(function (orderRow) {
            var product = orderRow.getProduct();

            if (product && SalesForceEngine.existsConversionFactor(product.get("CODART"), orderRow.get("UMINV"), orderRow.get("UMORD"), cacheData)
                && !product.get("FLGVARIABLEWEIGHT")) {

                orderRow.set("QTYINV", SM1OrderHelper.calculateQtyInv(orderRow.get("CODART"), product.get("FLGVARIABLEWEIGHT"), orderRow.get("QTYORD"), order.get("CODTYPORD"), orderRow.get("UMORD"), orderRow.get("UMINV"), cacheData));
            }
        });
    };

    /// <summary>
    /// Return all standalone product codes from the order
    /// </summary>
    this._getStandaloneProductCodes = function (order) {

        var standaloneCodes = [];
        var orderRows = order.getSubEntityStore(SFConstants.ORDERROW).filterToStore(function (or) {
            return or.get("QTYORD") > 0 && or.get("NUMROWKITREF") == 0; // ignore rows with no quantity and kit components
        }).toArray();

        // remove duplicate products (eg products added with different row types)
        var validRows = [];
        for (var i in orderRows) {
            var row = orderRows[i];

            if (validRows.filter(function (or) { return or.get("CODART") == row.get("CODART"); }).length == 0) {
                validRows.push(row);
            }
        }

        var standaloneProducts = validRows.filter(function (or) {
            return or.Product && or.Product.get("FLGSTANDALONE");
        });

        if (standaloneProducts.length > 0 && validRows.length > 1) {
            for (var i = 0; i < standaloneProducts.length ; i++) {
                standaloneCodes.push(" - " + standaloneProducts[i].get("CODART") + " " + standaloneProducts[i].get("DESART"));
            }
        }

        return standaloneCodes;
    };

    this._getUnusedDeliveryDates = function (order) {
        var self = this;
        var unusedDeliveryDates = [];
        var deliveryTotalQuantities = {};
        var deliveryQuantityFields = ["QTYDELIV1", "QTYDELIV2", "QTYDELIV3", "QTYDELIV4", "QTYDELIV5"].filter(function (delivQtyField) {
            var delivDateField = SM1OrderHelper.getDeliveryDateFieldName(delivQtyField);
            return self._isDeliveryDateSet(delivDateField, order);
        });
        order.getSubEntityStore(SFConstants.ORDERROW).each(function (row) {
            for (var i in deliveryQuantityFields) {
                var deliveryQtyField = deliveryQuantityFields[i];
                if (deliveryTotalQuantities[deliveryQtyField] == null)
                    deliveryTotalQuantities[deliveryQtyField] = 0;
                deliveryTotalQuantities[deliveryQtyField] += row.get(deliveryQtyField);
            }
        });
        for (var deliveryQtyFieldName in deliveryTotalQuantities) {
            if (deliveryTotalQuantities[deliveryQtyFieldName] == 0) {
                unusedDeliveryDates.push(order.get(SM1OrderHelper.getDeliveryDateFieldName(deliveryQtyFieldName)).toDateString());
            }
        }
        return unusedDeliveryDates;
    };

    this._getDeliveryQtyLabel = function (deliveryDateFieldName, order) {
        if (this._isDeliveryDateSet(deliveryDateFieldName, order))
            return UserContext.dateToString(order.get(deliveryDateFieldName), true);
        else
            return '';
    };

    /// <summary>
    /// Refreshes the grid columns with the quantities set for each delivery date
    /// </summary>
    this._refreshDeliveryQtyColumns = function (gui) {
        var order = gui.getDocument();
        var detailContext = gui.tabCtrls["ROWS"];
        if (detailContext) {
            var gridPanel = detailContext.sections["GRID"];
            if (gridPanel) {
                var sectionConfig = gridPanel.sectionContext.config;
                sectionConfig.attrs["searchBar"] = "false";
                var gridConfig = sectionConfig.children[1];

                for (i in gridConfig.children) {
                    var columnName = gridConfig.children[i].attrs.name;
                    switch (columnName) {
                        case "QTYDELIV1":
                        case "QTYDELIV2":
                        case "QTYDELIV3":
                        case "QTYDELIV4":
                        case "QTYDELIV5":
                            var deliveryDateFieldName = SM1OrderHelper.getDeliveryDateFieldName(columnName);
                            if (this._isDeliveryDateSet(deliveryDateFieldName, order)) {
                                gridConfig.children[i].attrs.visible = "true";
                                gridConfig.children[i].attrs.caption = this._getDeliveryQtyLabel(deliveryDateFieldName, order);
                            }
                            else
                                gridConfig.children[i].attrs.visible = "false";
                            break;
                    }
                }
                detailContext.renderDetailGui(detailContext.mainPanel);
            }
        }
    };

    //#endregion

    this.getYammerRefNode = function (context) {
        context.codNode = context.gui.getDocument().get("CODCUSTDELIV");
        context.hierLevel = -1;
    };
}
XApp.registerGuiExtension("mobGuiOrder", new _mobGuiOrderExtension());
//#endregion
