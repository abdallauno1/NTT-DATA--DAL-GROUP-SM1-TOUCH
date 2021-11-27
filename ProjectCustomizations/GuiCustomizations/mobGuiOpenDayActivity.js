
function _mobGuiOpenDayActivityCust() {

    this.openCustomLink = function (context) {
        try {

            var gui = context.ctrl;
            var self = this;
            var findContext;
            switch (context.linkRow.get("code")) {

                case "PRINT_LNK":
                case "SELLINGDAY.PRINT_LNK":
                case "MOB.SELLINGDAY.PRINT_LNK":
                    {

                        //CUSTOMIZATION 39322: DSD PROCESS - Customization - shipping bill functionality in Open Day Screen has to lunch  gate pass print (PDF using Christal Report) on HQ printer
                        var canOrder = UserContext.checkRight("NAV_MOB_ORDERS", "CUSTOMIZATION", "CANORDER_" + SalesForceNameSpace.OrderCTORD.VALORIZEDDELIVERY);
                        if (canOrder) {
                            //FOR DSD the shipping bill has to be managed online only because it needs to be printed on HQ printer
                            if (!XApp.isOnline()) {
                                XUI.showMsgBox({
                                    title: "[MOB.WARN]",
                                    msg: UserContext.tryTranslate("[MOB.SELLINGDAY.ACTION_AVAILABLE_ONLY_ONLINE]"),
                                    icon: "WARN",
                                    buttons: 'OK',
                                    onResult: Ext.emptyFn
                                });
                            }
                            else
                                this._handlePrintLinkDSD(context);
                            return; //stop processing here
                        }
                        //else proceed with base implementation
                        break;
                    }
            }

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

        //call base implementation
        if (this.base && this.base.openCustomLink)
            this.base.openCustomLink(context);
    };

    this.afterSaveDocument = function (gui, doc, onError, onSuccess) {
        var self = this;
        
        var checkerCode = UserContext.UserData.SM1User.CODAUTHMODE;       
        doc.set("Z_CHECKER_START", checkerCode);


        //update presales order at open day confirmation (DSD PROCESS customization) Enh #39318
        if (XApp.isOnline()) {
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesForce.SM1OrderTouchEngineCust',
                    methodName: 'UpdatePreSalesOrderStatus',
                    data: {}

                },
                function (response, textStatus, e) {
                    //call base product implementation
                    if (self.base)
                        self.base.afterSaveDocument(gui, doc, onError, onSuccess);
                    //error
                    XUI.showExceptionMsgBox(e);
                },
                function (response) {
                    // success
                    //call base product implementation
                    if (self.base)
                        self.base.afterSaveDocument(gui, doc, onError, onSuccess);
                }
            );
        }
        else
            //call base product implementation
            if (self.base)
                self.base.afterSaveDocument(gui, doc, onError, onSuccess);

    };

    /*
    The link prints the shipping bill document.
    If the document doesn't exist, it is generated first.
    */
    this._handlePrintLinkDSD = function (context) {
        var self = this;
        var gui = context.ctrl;

        //shipping bill already exists
        if (!XApp.isEmptyOrWhitespaceString(this.base._shippingBillDocKey)) {
            this._printShippingBillDSD();
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
                                    //For DSD the shipping bill has to be managed online only because it needs to be printed on HQ printer
                                    true,
                                    onFailure,
                                    function (savedShippingBill) {

                                        XUI.hideWait();
                                        self.base._shippingBillDocKey = savedShippingBill.get("DOCUMENTKEY");
                                        self._printShippingBillDSD();
                                    });
                            }
                            else {
                                XUI.hideWait();
                            }
                        });
                });
        }
    };

    //CUSTOMIZATION 39322: DSD PROCESS - Customization - shipping bill functionality in Open Day Screen has to lunch  gate pass print (PDF using Christal Report) on HQ printer
    this._printShippingBillDSD = function () {

        XUI.showWait();

        var shippingBill = XNavHelper.getFromMemoryCache("NAV_MOB_VANMOVEMENTS").findByKey( this.base._shippingBillDocKey);
        XHttpHelper.ExecuteServerOp(
                   {
                       assemblyName: 'Xtel.SM1.Touch',
                       className: 'Xtel.SM1.Touch.SalesForce.SM1OrderTouchEngine',
                       methodName: 'GenerateOrderReport',
                       data: {
                           codUsr: shippingBill.get("CODUSR"),
                           codDiv: shippingBill.get("CODDIV"),
                           numOrd: shippingBill.get("NUMORD"),
                           codTypOrd: shippingBill.get("CODTYPORD"),
                           macroType: SalesForceEngine.getOrderMacroType(shippingBill.get("CODTYPORD"))
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
                           if (XApp.environment.isChrome) {
                               setTimeout(function () {
                                   window.open(link);
                               }, 10);
                           } else {
                               XApp.openURL(link);
                           }
                       }
                   }
        );
    };

    this.getSaveConfirmationMessage = function (gui) {
        //CUSTOMIZATION 39324: DSD PROCESS - Customization - In open day required to add multi pallets fields for every pallet category 
        var doc = gui.getDocument();

        var checkerCode = UserContext.UserData.SM1User.CODAUTHMODE;
        doc.set("Z_CHECKER_START", checkerCode);
       
        if (doc.get("Z_NUMPALLETSTART_A") == 0)
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_A_NOT_DEFINED]");
        if (doc.get("Z_NUMPALLETSTART_B") == 0)
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_B_NOT_DEFINED]");
        if (doc.get("Z_NUMPALLETSTART_C") == 0)
            return UserContext.tryTranslate("[MOB.SELLINGDAY.PALLET_C_NOT_DEFINED]");
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
                    case "Z_NUMPALLETSTART_A":
                    case "Z_NUMPALLETSTART_B":
                    case "Z_NUMPALLETSTART_C":
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
}

XApp.registerGuiExtensionCust("mobGuiOpenDayActivity", new _mobGuiOpenDayActivityCust());
