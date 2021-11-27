function _mobGuiCloseDayRecap() {

    this.beforeUiRendering = function (context) {

        try {
            XApp.callCust("guiCustomizer", "mobGuiCloseDayActivity", "beforeUiRendering", context);
            //Add here behaviour not managed by mobGuiCloseDayActivity extension
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

    };

    this.getQtabsVoices = function (fieldContext) {
        try {
            XApp.callCust("guiCustomizer", "mobGuiCloseDayActivity", "getQtabsVoices", fieldContext);
            //Add here behaviour not managed by mobGuiCloseDayActivity extension
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.setFieldStatus = function (context) {
        try {

            XApp.callCust("guiCustomizer", "mobGuiCloseDayActivity", "setFieldStatus", context);
            //Add here behaviour not managed by mobGuiCloseDayActivity extension

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterLoad = function (gui) {
        gui.clearModified();
    };

    ///Enhancement 37776 - Shipping-bill print and creation link during selling days
    this.preCreateLink = function (context) {
        try {
            if (!this._visibleLinksCount)
                this._visibleLinksCount = 0;
            switch (context.linkRow.code) {

                case "PRINT_LNK":
                case "SELLINGDAY.PRINT_LNK":
                case "MOB.SELLINGDAY.PRINT_LNK":
                    {
                        context.linkRow.imageCls = "docs_sellingday_actions_shipping_bill_19";
                        context.canceled = !UserContext.checkRight("SELLINGDAY", "RECAP", 'LNK_PRINT');
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
                        new XConstraint("DTECLOSE", "<=", new Date()),
                        new XConstraint("IDDAY", "=", context.ctrl.entity.get("IDDAY"))
                        ]
                    });
                    break;
                case "NAV_MOB_VANMOVEMENTS":
                case "SELLINGDAY.NAV_MOB_VANMOVEMENTS":
                case "MOB.SELLINGDAY.NAV_MOB_VANMOVEMENTS":
                    //Add in close day recap tab a new carousel item with all the Van Movements (T100.DTECLOSE BETWEEN TA0300.DTESTART and SYSDATE + T100.codeuser = TA0300.CODUSR + T100.CODDIV = TA0300.CODDIV for the link)
                    //or IDDAY because SYSDATE constraint excludes orders created from current ui (e.g. shipping bill)
                    context.linkRow.hcs = new XConstraints({
                        logicalOp: "OR",
                        constraints:
                            [
                            new XConstraints({
                                logicalOp: "AND",
                                constraints:
                                    [
                                    new XConstraint("DTECLOSE", ">=", context.ctrl.entity.get("DTESTART")),
                                    new XConstraint("DTECLOSE", "<=", new Date()),
                                    new XConstraint("CODEUSR", "=", context.ctrl.entity.get("CODUSR")),
                                    new XConstraint("CODDIV", "=", context.ctrl.entity.get("CODDIV"))
                                    ]
                            }),
                            new XConstraint("IDDAY", "=", context.ctrl.entity.get("IDDAY"))
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

    this.openCustomLink = function (context) {
        try {
            var self = this;
            switch (context.linkRow.get("code")) {                
                case "PRINT_LNK":
                case "SELLINGDAY.PRINT_LNK":
                case "MOB.SELLINGDAY.PRINT_LNK":
                    {
                        this._handlePrintLink(context);
                        break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    //The link prints the shipping bill document.
    this._handlePrintLink = function (context) {
        var self = this;
        var gui = context.ctrl;

            //Shipping bill has to be created everytime the link is tapped regardless if it exists or not
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
                                        self._refreshLinkedNav(gui, "NAV_MOB_VANMOVEMENTS", function () {
                                            XUI.hideWait();
                                            self._shippingBillDocKey = savedShippingBill.get("DOCUMENTKEY");
                                            self._printShippingBill();
                                        });
                                    });
                            }
                            else {
                                XUI.hideWait();
                            }
                        });
                });    
    };

    this._refreshLinkedNav = function (gui, navName, onSuccess) {

        var navCarouselTab = gui.tabCtrls.CLOSE_DAY_RECAP;
        if (navCarouselTab) {
            var carouselSection = navCarouselTab.sections.LINK_CAROUSEL;
            if (carouselSection) {
                var navCtrl = carouselSection.sectionContext.ctrls[navName];
                if (navCtrl)
                    //in full offline mode navigators don't retrieve data from server
                    if (!UserContext.isFullOfflineMode())
                        navCtrl.refresh(onSuccess);
                    else
                        navCtrl.afterRefresh(onSuccess);
                
                return;
            }
        }

        onSuccess();
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

    this.afterNotifyLeave = function (context) {
        delete this._visibleLinksCount;
    };

    this._printShippingBill = function () {
        XUI.showInfoOk({ msg: "PRINT " + this._shippingBillDocKey });
    };

}

XApp.registerGuiExtension("mobGuiCloseDayRecap", new _mobGuiCloseDayRecap());