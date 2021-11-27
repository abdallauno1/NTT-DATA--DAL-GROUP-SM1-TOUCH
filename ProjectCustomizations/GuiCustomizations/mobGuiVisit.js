//#region _mobGuiVisitExtensionCust

function _mobGuiVisitExtensionCust() {

    this.afterLoad = function (gui, openData) {

        var self = this;
        var visit = gui.getDocument();


        //Customization ENH 34409: Capture timestamp on first visit opening
        //keep a single time for all activities
        var openTime = new Date();
        //set time of open for all customer surveys that are not detached and that no not already have this information
        visit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
            //activity was not detached from visit
            if (cs.get("CODSTATUS") == visit.get("CODSTATUS")) {
                if (XApp.isEmptyDate(cs.get("Z_OPENTIME")))
                    cs.set("Z_OPENTIME", openTime);
            }
        });

        //Customization ENH 34408: Capture coordinates on first visit opening
        XApp.getCoordinates(function (latitude, longitude) {
            if (MapServices.areValidCoordinates(latitude, longitude)) {
                visit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
                    //activity was not detached from visit
                    if (cs.get("CODSTATUS") == visit.get("CODSTATUS") && !MapServices.areValidCoordinates(cs.get("Z_GPSOPENLATITUDE"), cs.get("Z_GPSOPENLONGITUDE"))) {
                        cs.set("Z_GPSOPENLATITUDE", latitude);
                        cs.set("Z_GPSOPENLONGITUDE", longitude);
                    }
                });
            }

            //call base product implementation
            if (self.base)
                self.base.afterLoad(gui, openData);
        });


        return true;//keep wait.
    };

    this.afterComputeStateFlag = function (context) {
        var self = this;
        var gui = context.gui;
        var entity = gui.getDocument();

        var isExpired = SalesExecutionEngine.appointmentIsExpired({ "mobVisit": entity });

        // allow cancelling expired visits (Enh #39099) 
        if (isExpired) {

            this.clientValid = self.base._loadCustomer(gui);

            this.editFuture = (UserContext.getConfigParam("EDIT_FUTURE", "0") != 0);

            this.futureVisit = (entity.get("DTEVISIT").toDate() > (new Date()).toDate());

            this.hasEditRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codFunc);
            //use this flag to allow canceling expired visits 
            gui._flagCancelAndSuspendVisitButton = (this.futureVisit && !this.editFuture) || !this.hasEditRight || !this.clientValid;
        }
    };

    this.afterUpdateVisitButtonState = function (context) {
        // allow cancelling expired visits (Enh 39099)
        var gui = context.gui;
        var visit = gui.getDocument();

        if (SalesExecutionEngine.appointmentIsExpired({ "mobVisit": visit })) {
            var cancelRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codFunc);
            if (cancelRight && this.hasEditRight) {
                var cancelEnabled = (!gui._flagCancelAndSuspendVisitButton && SalesExecutionEngine.canCancel({ "mobVisit": visit }));
                gui.cancelVisitButton.enabled = cancelEnabled;
            }

            var suspendRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codFunc);
            if (suspendRight && this.hasEditRight) {
                var suspendEnabled = (!gui._flagCancelAndSuspendVisitButton && (SalesExecutionEngine.canSuspend({ "mobVisit": visit }) || SalesExecutionEngine.canCancel({ "mobVisit": visit })));
                gui.suspendVisitButton.enabled = suspendEnabled;
            }
        }
    };

    this.getCustomLayout = function (layout, detailContext) {

        try {

            var self = this;
            //call base product implementation
            if (self.base)
                layout = self.base.getCustomLayout(layout, detailContext);

            switch (detailContext.entityName) {
                case "MVCustomerSurvey":
                    {
                        /*CUSTOMIZATION 36697: DCODE - Hide attachments section in SM1Touch activity tabs.*/
                        for (var i = 0; i < layout.children.length; i++) {
                            var section = layout.children[i];
                            if (section.attrs && section.attrs.caption == 'ACTIVITY_ATTACHMENTS') {

                                var codTypSurvey = detailContext.entity.get("CODTYPSURVEY");
                                var activityType = SalesExecutionEngine.getActivityType(codTypSurvey);
                                if (activityType != SalesExecutionNameSpace.ActivityType.ATTACHMENTS) {
                                    layout.children.splice(i, 1);
                                    break;
                                }
                                break;
                            }
                        }
                    }
            }

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

        return layout;

    };

    this.afterNotifyLeave = function (context) {
        var self = this;

        //call base product implementation
        if (self.base)
            self.base.afterNotifyLeave(context);

        var gui = context.ctrl;

        //delete cached values
        delete gui._flagCancelAndSuspendVisitButton;
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.afterLoadVisit = function (context) {

        //If we reach this customizer method it means that the base/product code did not create an encashment activity and 
        //did not redirect to encashment UI (see  localExecutionQueue.clear(); after call to _createMandatoryPayment in base._loadVisit) 

        //If we are in the case that the product implementation already created an encashment in a previous session,
        //with this customizaiton we need to continue and create a new one ONLY if there are other orders in this visit with open invoices.
        try {

            var gui = context.gui;
            var self = this;
            var mandatoryPaymentDocNumber;
            if (mandatoryPaymentDocNumber = self._getMissingMandatoryPayment(gui)) {
                XUI.showWarnOk({
                    msg: UserContext.tryTranslate("[MOBGUIVISIT.MISSING_ENCASHMENT]"),
                    buttons: 'OK',
                    onResult: function () {
                        self.base._createNewEncashmentActivity(context.gui, mandatoryPaymentDocNumber);
                    }
                });

                context.localExecutionQueue.clear();
                context.canceled = true;
            }

        } catch (ex) {
            if (context.onFailure)
                context.onFailure(ex);
        }
    };
    //Customization 41340: CUSTOMIZATION: MA 20181012 Allow two cash collection for the same customer in the same day, same deposit
    this.beforeCloseVisit = function (context) {
       
        var gui = context.gui;
        var codParty = gui.getDocument().get("CODPARTY");
        var codPayMod;
        var codPayTrm;
        var self = this;
        var mandatoryPaymentDocNumber;
        var codUser = UserContext.CodUsr;
        var codDiv = UserContext.CodDiv;
        var numDocEnch = [];
        var numDocBal = [];
      

        //var year = new Date();
        //var yyyy = year.getFullYear();

        //var constraintsEnc = new XConstraints({
        //    logicalOp: 'AND',
        //    constraints: [
        //        new XConstraint("CODUSR", "=", codUser),
        //        new XConstraint("CODDIV", "=", codDiv),
        //        new XConstraint("CODPARTY", "=", codParty)
        //        ]
        //});

        //var constraintsBal = new XConstraints({
        //    logicalOp: 'AND',
        //    constraints: [
        //        new XConstraint("CODUSR", "=", codUser),
        //        new XConstraint("CODDIV", "=", codDiv),
        //        new XConstraint("CODCUSTINV", "=", codParty)
        //    ]
        //});
       

        //var encashment = XNavHelper.getFromMemoryCache("NAV_MOB_ENCBALANCE", constraintsEnc);
        //var ench = encashment.filterByConstraints(constraintsEnc);
       
        //var balance = XNavHelper.getFromMemoryCache("NAV_MOB_ORDERS", constraintsBal);
        //if (balance) {
           

        //    var bal = balance.filterByConstraints(constraintsBal);

        //    for (var i = 0 ; i < bal.length ; i++) {           
        //        var docBal = bal[i].get("NUMDOC");
        //        var codStatus = bal[i].get("CODSTATUS");
        //        var yearDoc = bal[i].get("DTEORD");
        //        var yD = yearDoc.getFullYear(yearDoc);
        //       // var flgPaid = bal[i].get("FLGTOTALPAID");
        //       // codPayMod = bal[i].get("CODPAYMOD");
        //        codPayTrm = bal[i].get("CODPAYTRM");
              
        //        if (yD == yyyy && codStatus == "11")
        //                  numDocBal.push(docBal);
        //         }

        //    for (var i = 0 ; i < ench.length ; i++) {
        //        var docEnc = ench[i].get("NUMDOC");
        //        var yearDoc = ench[i].get("DTEDOC");
        //        var yD = yearDoc.getFullYear(yearDoc);

        //            if (yD == yyyy) 
        //                  numDocEnch.push(docEnc);
        //        }

         /*  if (numDocBal.length  !=  numDocEnch.length  && codPayTrm == "000" ) {
                XUI.showWarnOk({
                    msg: UserContext.tryTranslate("[MOBGUIVISIT.MISSING_ENCASHMENT]"),
                    buttons: 'OK',
                    onResult: function () {
                        self.base._createNewEncashmentActivity(context.gui, mandatoryPaymentDocNumber);
                    }
                });

                context.canceled = true;
            }*/
        //}

        

        //if (bal) {
        //    for (var o = 0 ; o < bal.length ; o++) {
        //        //var CodPayMod = balance.Rows[o].get("CODPAYMOD");
        //        if (bal[o].get("FLGTOTALPAID") == 0 && bal[o].get("CODPAYMOD") == "CS" && bal[o].get("CODPARTY") == codParty) {
        //            //XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOB.ACTION_CHECK_INVOICE]") });

        //            XUI.showWarnOk({
        //                msg: UserContext.tryTranslate("[MOBGUIVISIT.MISSING_ENCASHMENT]"),
        //                buttons: 'OK',
        //                onResult: function () {
        //                    self.base._createNewEncashmentActivity(context.gui, mandatoryPaymentDocNumber);
        //                }
        //            });

                    
        //            context.canceled = true;
        //            break;
        //        }
        //    }

        //}

        if (self._getMissingMandatoryPayment(gui)) {
            XUI.showWarnOk({
                msg: UserContext.tryTranslate("[MOBGUIVISIT.MISSING_ENCASHMENT]"),
                buttons: 'OK',
                onResult: function () {
                }
            });

            context.canceled = true;
        }
    };

    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.getSectionButtons = function (context) {

        this.base.getSectionButtons(context);

        var self = this;
        var sectionName = context.sectionContext.config.attrs["caption"];
        var subEntityName = context.sectionContext.config.attrs["detailObject"];

        //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
        if (context.buttons && context.buttons.length) {
            for (var i = 0; i < context.buttons.length; i++) {
                var b = context.buttons[i];
                if (b && b.code && b.code == "VIEW_ENCASHMENT") {

                    var navData = XNavHelper.getFromMemoryCache('NAV_MOB_ENCBALANCE');
                    if (navData) {
                        var encashment = null;
                        for (var o = 0; o < navData.Rows.length; o++) {
                            if (navData.Rows[o].getValueFromName("IDSURVEY") == context.sectionContext.entity.get("IDSURVEY")) {
                                encashment = navData.Rows[o];
                                break;
                            }
                        }
                        if (encashment) {
                            b.handler = (function (encashment, gui) {
                                return function () {
                                    var editRight = UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "EDIT");

                                    XHistory.go({
                                        controller: app.getSM1Controllers().gui,
                                        action: 'show',
                                        //dockey - it's not needed. It will be searched by mobGuiEncashment.preLoadDocument
                                        docName: "Deposit",
                                        guiName: "mobGuiEncashment",
                                        entityName: "Encashment",
                                        navId: "NAV_MOB_DEPOSIT",
                                        customData: {
                                            codusr: encashment.get("CODUSR"), //should be present in NAV_MOB_ENCBALANCE
                                            coddiv: encashment.get("CODDIV"), //should be present in NAV_MOB_ENCBALANCE
                                            iddep: encashment.get("IDDEP"), //should be present in NAV_MOB_ENCBALANCE
                                            z_idenc: encashment.get("IDENC"),
                                            codparty: encashment.get("CODPARTY"), //should be present in NAV_MOB_ENCBALANCE
                                            dteenc: encashment.get("DTEENC"), //should be present in NAV_MOB_ENCBALANCE
                                            encashmentGuiOpenMode: CommonNameSpace.EncashmentGuiOpenMode.EncashmentReadOnly
                                        },
                                        openMode: editRight ? 'EDIT' : 'VIEW'
                                    });
                                };
                            })(encashment, context.gui)
                        }
                    }


                }
            }
        }

    };
    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this._getMissingMandatoryPayment = function (gui) {

        var visit = gui.getDocument();
        var gui = gui;
        var self = this;

        var encSurvey = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
        if (!encSurvey) {
            XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
            return;
        }

        var orderSrvConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
        if (!orderSrvConfig) {
            XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
            return;
        }

        //User has right to create encashment and that activity type can be added to this visit
        if (this.base._canCreateNewEncashment(gui) && (gui.openMode != "VIEW") && SalesExecutionEngine.canCreateSurvey(encSurvey, visit)) {

            //If there is AT LEAST one order that is has mandatory payment 
            //And all cash has not been collected for it
            //Then Create a new ecashment activity and redirect to enacashment UI

            //Calculated open invoices for the customer of the visit
            var openInvoicesBalances = {};
            var openInvoices = XNavHelper.getFromMemoryCache("NAV_MOB_PARTYBALANCE");
            if (openInvoices) {
                var cons = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [new XConstraint("CODUSR", "=", visit.get("CODUSR")),
                         new XConstraint("CODPARTY", "=", visit.get("CODPARTY"))
                         //no constraint on date because we don't know when order has been created - so we don't know when open invoice has been created
                    ]
                });

                openInvoices = openInvoices.filterByConstraints(cons);

                if (openInvoices && openInvoices.length) {
                    openInvoicesBalances = CommonEngineCust.calculateOpenInvoicesBalances(openInvoices);
                }
            }

            var mandatoryPaymentFieldName = SalesExecutionEngine.getMandatoryPaymentFieldName(orderSrvConfig);
            //Go trough all orders linked to the visit and check if there is any with open invoice(not collected)
            for (var i = 0; i < visit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                var cs = visit.getSubEntityStore("MVCustomerSurvey").getAt(i);
                if (cs.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey())
                    continue;

                var headerCsr = cs.get("HEADER");
                if (headerCsr) {
                    var mandatoryPaymentSet = headerCsr.get(mandatoryPaymentFieldName);
                    if (mandatoryPaymentSet) {

                        //select the order that generated the open invoice
                        var orders = SalesForceEngine.getAllOrderNavRows(new XConstraints({
                            logicalOp: 'AND',
                            constraints: [
                                new XConstraint("IDSURVEY", "=", cs.get("IDSURVEY"))
                            ]
                        }));

                        if (orders && orders.length) {
                            var order = orders[0];
                            //get the open invoice numdoc
                            var mandatoryPaymentDocNumber = SalesForceEngine.getOpenInvoiceNumDoc(order.get("CODUSR"), order.get("CODTYPORD"), order.get("NUMDOC"), order.get("NUMORD"));
                            if (openInvoicesBalances[mandatoryPaymentDocNumber]) {
                                if (openInvoicesBalances[mandatoryPaymentDocNumber].get("VALABBUONO") > 0) {
                                    return mandatoryPaymentDocNumber;

                                }
                            }
                        }
                    }
                }
            }
        }

        return null;
    }
};

XApp.registerGuiExtensionCust("mobGuiVisit", new _mobGuiVisitExtensionCust());
//#endregion

