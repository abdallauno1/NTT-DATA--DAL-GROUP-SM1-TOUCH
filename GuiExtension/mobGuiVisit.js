//#region _mobGuiVisitExtension
function _mobGuiVisitExtension() {
    //#region Overrides

    this.getMenuButtons = function (context) {
        var self = this;
        var gui = context.ctrl;
        var toolbar = gui.toolbar;
        var poz = 3;

        if (UserContext.getConfigParam("TOUCH_VISIT_INTERMEDIATE_SAVE", "1") != 0) {
            gui.saveVisitButton = {
                msg: UserContext.tryTranslate("[MOBVISIT.SAVE]"),
                id: 'mobguivisit-contextualmenu-save',
                iconCls: 'common_navbar_save_23',
                visible: (gui.openMode != "VIEW"),
                docked: "",
                handler: (function (gui) {
                    return function () {
                        //remember if the planorama results have been saved
                        var savedPlanoramaSurveys = gui.savedPlanoramaSurveys;
                        if (gui.docModified) {
                            gui.saveDocNoConfirmation(function () {
                                gui.reload();
                                gui.clearModified();
                                gui.savedPlanoramaSurveys = savedPlanoramaSurveys;
                            });
                        }
                    };
                })(gui)
            };
            context.buttons.push(gui.saveVisitButton);
        }

        this.closeVisitButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.CLOSE]"),
            id: 'mobguivisit-contextualmenu-close-visit',
            iconCls: 'guis_visit_navbar_done_23',
            visible: false,
            docked: "",
            handler: (function (gui) {
                return function () {
                    self.closeVisitButton.b_closeVisitAttempt = true;
                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", "beforeCloseVisit", context);
                    if (context.canceled)
                        return;

                    var doc = gui.getDocument();

                    // Checks orders, ordersurveys and measures
                    self._checkAndUpdateOrdersStatuses(gui);

                    // Checks encashments, encashment surveys  and its measures
                    self._checkAndUpdateEncashmentsStatuses(gui);

                    //re-calculate calculated measures
                    self._checkAndUpdateCalculatedMeasures(gui);

                    //perform validation on all customer surveys so anmolies blocking save can be found
                    self._validateAll(doc);

                    if (self._checkMinConsumerQuest(gui, doc)) {

                        gui.validateDocument(
                            function (response) {
                                switch (response) {
                                    case "OK":
                                        if (Ext.Object.getSize(gui.recoveryErrorReports) > 0)
                                            self._createRecoveryPopup(gui, doc);
                                        else {
                                            var recoveryAnomalies = doc.getSurveysRecoveryAnomalies(doc);
                                            self._removeResolvedRecoveryActivities(doc, gui, recoveryAnomalies);
                                            self._createCloseVisitPopup(gui);
                                            XUI.showWait();
                                            SalesExecutionEngine.validateSEBudgets(doc, false, function (response) {
                                                if (response && response["messages"]) {
                                                    self.m_budgetValidationMsg = response["messages"];
                                                    self.resetAllMsgAfterBdgValidation(doc);
                                                }
                                                XUI.hideWait();
                                            }, function () {
                                                XUI.hideWait();
                                            });
                                            self._refreshVisitDurationCounterOnOpenPopup(gui);
                                        }
                                        break;
                                    case "EDIT":
                                        //do nothing
                                        break;
                                }
                            }, "EDIT");
                    }
                    self.closeVisitButton.b_closeVisitAttempt = undefined;
                };
            })(gui),
            hide: function () {
                if (this.button)
                    this.button.hide();
                this.visible = false;
            },
            show: function () {
                if (this.button)
                    this.button.show();
                this.visible = true;
            }
        };
        context.buttons.push(this.closeVisitButton);

        this.prepareVisitButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.PREPARE]"),

            iconCls: 'guis_visit_navbar_prepare_23',
            visible: false,
            docked: "",
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePrepareVisit', context);
                    if (context.canceled)
                        return;

                    var doc = gui.getDocument();

                    // Checks orders, ordersurveys and measures
                    self._checkAndUpdateOrdersStatuses(gui);

                    // Checks encashments, encashemnt surveys and its measures
                    self._checkAndUpdateEncashmentsStatuses(gui);

                    //re-calculate calculated measures
                    self._checkAndUpdateCalculatedMeasures(gui);

                    //perform validation on all customer surveys so anmolies blocking save can be found
                    self._validateAll(doc);

                    gui.validateDocument(
                      function (response) {
                          switch (response) {
                              case "OK":
                                  SalesExecutionEngine.createPrepareVisitPopup(doc, function (popup) {
                                      self._prepareVisit(gui, doc, function () {
                                          popup.hide();
                                          Ext.Viewport.remove(popup);
                                          popup.destroy();
                                      });
                                  }, function () {
                                      self._refreshVisitDurationCounterOnClosePopup(gui);
                                  });
                                  self._refreshVisitDurationCounterOnOpenPopup(gui);
                                  break;
                              case "EDIT":
                                  //do nothing
                                  break;
                          }
                      }, "EDIT");
                };
            })(gui),
            hide: function () {
                if (this.button)
                    this.button.hide();
                this.visible = false;
            },
            show: function () {
                if (this.button)
                    this.button.show();
                this.visible = true;
            }
        };
        context.buttons.push(this.prepareVisitButton);


        gui.reloadVisitButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.RELOAD]"),
            id: 'mobguivisit-contextualmenu-reload-visit',
            iconCls: 'common_navbar_reload_23',
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeReloadVisit', context);
                    if (context.canceled)
                        return;

                    self._reloadDataManual(gui);
                };
            })(gui)
        };
        context.buttons.push(gui.reloadVisitButton);

        //CANCEL VISIT
        gui.cancelVisitButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.CANCEL_VISIT]"),
            id: 'mobguivisit-contextualmenu-cancel-visit',
            iconCls: 'guis_visit_navbar_cancelvisit_23',
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCancelVisit', context);
                    if (context.canceled)
                        return;

                    self._createAnnCausePopup(gui); //do cancel of whole visit
                };
            })(gui)
        };
        context.buttons.push(gui.cancelVisitButton);

        //SUSPEND VISIT
        gui.suspendVisitButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.SUSPEND_VISIT]"),
            id: 'mobguivisit-contextualmenu-suspend-visit',
            iconCls: 'guis_visit_navbar_suspendvisit_23',
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeSuspendVisit', context);
                    if (context.canceled)
                        return;
                    self._saveVisitCoordinatesBeforeCancel(gui.getDocument().getSubEntityStore("MVCustomerSurvey").toArray(), function () {
                        self._removeAllCustomerSurveys(gui, false);
                    });
                };
            })(gui)
        };
        context.buttons.push(gui.suspendVisitButton);

        //NEW OPPORTUNITY
        gui.newOpportunityButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.NEW_OPPORTUNITY]"),
            id: 'mobguivisit-contextualmenu-new-opportunity',
            iconCls: 'navs_opportunities_navbar_newopportunity_23',
            handler: (function (gui) {
                return function () {
                    var context = {
                        gui: gui,
                        canceled: false
                    };

                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewOpportunity', context);
                    if (context.canceled)
                        return;

                    var codLevel = CommonEngine.getAccountHierLevel(gui.cust.get("CODDIV"), gui.cust.get("CODPARTY"));
                    XHistory.go({
                        controller: app.getSM1Controllers().gui,
                        action: 'show',
                        docName: 'Opportunity',
                        guiName: 'mobGuiOpportunity',
                        navId: "NAV_MOB_OPPORTUNITIES",
                        openMode: 'NEW',
                        codHier: XApp.isEmptyOrWhitespaceString(codLevel) ? null : UserContext.getConfigParam("CUSTOMERDEFAULTHIER", "COMM"),
                        codAccount: gui.cust.get("CODPARTY"),
                        codLevel: codLevel
                    });

                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterAddingPendingActivities', context);
                };
            })(gui)
        };
        context.buttons.push(gui.newOpportunityButton);

        //NEW ACITIVTY
        gui.newActivityButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.NEW_ACTIVITY]"),
            id: 'mobguivisit-contextualmenu-new-activity',
            iconCls: 'guis_visit_navbar_newactivity_23',
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewActivity', context);
                    if (context.canceled)
                        return;

                    self._createNewSurveyPopup(gui);
                };
            })(gui)
        };
        context.buttons.push(gui.newActivityButton);

        //ADD PENDING ACTIVITIES
        gui.addPendingActivitiesButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.ADD_PENDING_ACTIVITIES]"),
            id: 'mobguivisit-contextualmenu-add-pending-activities',
            iconCls: 'guis_visit_navbar_newactivity_23',
            handler: (function (gui) {
                return function () {

                    var context = {
                        gui: gui,
                        visit: gui.getDocument(),
                        canceled: false
                    };

                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeAddingPendingActivities', context);
                    if (context.canceled)
                        return;

                    XUI.showEntitySelector({
                        navId: "NAV_MOB_PENDING_ACT",
                        parentGui: context.gui,
                        hiddenConstraints: self._getPendingActivitiesConstraints(context.visit),
                        showNewButton: false,
                        handler: function (data) {
                            context.activities = data.activities;
                            if (context.activities == null)
                                return;

                            var f = null;
                            var lastAddedTab = null;
                            var localExecutionQueue = new ExecutionQueue();
                            var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);
                            var failureCallback = function (e) {
                                XUI.hideWait();
                                XUI.showExceptionMsgBox(e);
                            };

                            XUI.showWait();

                            context.activities.forEach(function (activity) {

                                var customerSurvey = null;
                                // load activity
                                f = (function (gui, visit, survey) {
                                    return function () {
                                        if (XApp.isEmptyOrWhitespaceString(survey.get("IDSURVEY"))) {
                                            customerSurvey = SalesExecutionEngine.createNewCustomerSurvey(survey.get("CODTYPSURVEY"), survey.get("CODPARTY"));
                                            successCallback();
                                        } else {
                                            SfaCacheManager.getFromCache({
                                                entityName: SfaCacheManagerNamespace.CacheObjects.CUSTOMERSURVEYS,
                                                idSurvey: survey.get("IDSURVEY"),
                                                onFailure: failureCallback,
                                                onSuccess: function (cs) {
                                                    if (cs) {
                                                        customerSurvey = XDocs.loadEntStore("MVCustomerSurvey", cs).getAt(0);

                                                        var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));
                                                        customerSurvey.reloadsAssortment = SalesExecutionEngine.activityReloadsAssortment(std);
                                                        customerSurvey.reloadsAssets = SalesExecutionEngine.activityReloadsAssets(std);

                                                        successCallback();
                                                    } else {
                                                        failureCallback();
                                                    }
                                                }
                                            });
                                        }
                                    };
                                })(context.gui, context.visit, activity);
                                localExecutionQueue.pushHandler(self, f);

                                f = (function (gui, visit) {
                                    return function () {
                                        self._addActivity(gui, visit, customerSurvey, failureCallback,
                                            function () {
                                                lastAddedTab = gui.tabSubDetailsByName[customerSurvey.uniqueID];
                                                successCallback();
                                            });
                                    }
                                })(context.gui, context.visit);
                                localExecutionQueue.pushHandler(self, f);
                            });

                            f = (function (gui) {
                                return function () {
                                    self._refreshVisit(gui, lastAddedTab, failureCallback, successCallback);
                                };
                            })(context.gui);
                            localExecutionQueue.pushHandler(self, f);

                            f = function () {
                                XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterAddingPendingActivities', context);
                                XUI.hideWait();
                            };
                            localExecutionQueue.pushHandler(self, f);

                            // START
                            localExecutionQueue.executeNext();
                        }
                    });
                };
            })(gui)
        };
        context.buttons.push(gui.addPendingActivitiesButton);

        //NEW ORDER
        var newOrderHandler = (function (gui) {
            return function () {
                var context = {
                    gui: gui,
                    canceled: false
                };
                XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewOrder', context);
                if (context.canceled)
                    return;

                self._addOrderActivity(gui);
            };
        })(gui);

        gui.newOrderButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.NEWORDER]"),
            id: 'mobguivisit-contextualmenu-new-order',
            iconCls: 'guis_visit_navbar_newsale_23',
            code: "NEWORDER",
            handler: newOrderHandler
        };
        context.buttons.push(gui.newOrderButton);

        //NEW ORDER CART
        var newOrderCartHandler = (function (gui) {
            return function () {
                var context = {
                    gui: gui,
                    canceled: false
                };
                XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewOrder', context);
                if (context.canceled)
                    return;

                self._createOrderActivity(gui, function (codParty, idSurvey) {
                    XHistory.go({
                        controller: app.getSM1Controllers().order_cart,
                        action: 'show',
                        codParty: codParty,
                        idSurvey: idSurvey
                    });
                });
            };
        })(gui);

        gui.newOrderCartButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.NEWCART]"),
            id: 'mobguivisit-contextualmenu-new-cart',
            iconCls: 'guis_visit_navbar_newcart_23',
            code: "NEWCART",
            handler: newOrderCartHandler
        };
        context.buttons.push(gui.newOrderCartButton);

        //NEW ENCASHMENT
        gui.newEncashmentButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.NEW_ENCASHMENT]"),
            id: 'mobguivisit-contextualmenu-new-encashment',
            iconCls: 'guis_visit_navbar_newcollection_23',
            code: "NEWENCASHMENT",
            handler: (function (gui) {
                return function () {
                    var context = {
                        gui: gui,
                        canceled: false
                    };
                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewEncashment', context);
                    if (context.canceled)
                        return;

                    self._createNewEncashmentActivity(gui);


                };
            })(gui)
        };
        context.buttons.push(gui.newEncashmentButton);

        //Visit Customer
        gui.visitCustomerButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.VISITCUSTOMER]"),
            iconCls: 'guis_visit_navbar_visitedcustomer_23',
            id: 'mobguivisit-contextualmenu-visited-customer',
            handler: (function (gui) {
                return function () {
                    var entity = gui.getDocument();
                    if (entity) {
                        var docKey = CommonEngine.buildCustomerKey(entity.get("CODPARTY"));
                        var custNav = "NAV_MOB_CUST";
                        var editRight = UserContext.checkRight(custNav, custNav, 'EDIT');
                        var customerRecord = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(docKey);

                        if (!customerRecord) {
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.DOC_UNAVAILABLE]") });
                            return;
                        }

                        XHistory.go({
                            controller: app.getSM1Controllers().gui,
                            action: 'show',
                            docKey: docKey,
                            navId: custNav,
                            openMode: editRight ? 'EDIT' : 'VIEW'
                        });
                    }
                };
            })(gui)
        };
        context.buttons.push(gui.visitCustomerButton);

        gui.customerExternalUrlButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.EXTERNAL_LINK]"),
            id: 'mobguivisit-contextualmenu-external-link',
            iconCls: 'guis_visit_navbar_external_link_23',
            handler: (function (gui) {
                return function () {
                    var codParty = gui.getDocument().get("CODPARTY");
                    var url = SalesExecutionEngine.getExternalCustomerUrl(codParty);
                    if (url)
                        XApp.openURL(url);
                    else
                        XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.ERR_EXTERNAL_URL]') });
                };
            })(gui)
        };
        context.buttons.push(gui.customerExternalUrlButton);

        gui.previousVisitPicturesButton = {
            msg: UserContext.tryTranslate("[MOBVISIT.PREVIOUS_PHOTOS]"),
            id: 'mobguivisit-contextualmenu-previous-photos',
            iconCls: 'guis_visit_navbar_previousvisitphotos_23',
            visible: false, //hidden by default, state will be updated by _updateVisitButtonState
            handler: (function (gui) {
                return function () {
                    var codParty = gui.getDocument().get("CODPARTY");

                    //Select only executed visits in the past for same client
                    var pastExecutedVisits = Ext.Array.filter(XNavHelper.getFromMemoryCache("NAV_MOB_VISITS").Rows, function (row) {
                        return row.get("CODPARTY") == codParty &&
                            row.get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.COMPLETED &&
                            SalesExecutionEngine.getStartMoment(gui.getDocument()) > SalesExecutionEngine.getStartMoment(row);
                        //TBD - maybe filter also on CONTACTMODE
                    });

                    if (pastExecutedVisits.length) {
                        //select visits closest to the current visit
                        var closestFirst = Ext.Array.sort(pastExecutedVisits, function (a, b) {
                            return -(SalesExecutionEngine.getStartMoment(a) - SalesExecutionEngine.getStartMoment(b));
                        });


                        var visit = closestFirst[0];

                        //open that visit
                        var editRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codFunc);
                        XHistory.go({
                            controller: app.getSM1Controllers().gui,
                            action: 'show',
                            docKey: visit.get("DOCUMENTKEY"),
                            navId: "NAV_MOB_VISITS",
                            openMode: editRight ? 'EDIT' : 'VIEW',
                            selectedTabName: "PHOTOS" //pre-select the tab with photos
                        });
                    }
                    else
                        XUI.showInfoOk({ msg: UserContext.tryTranslate('[MOBVISIT.NO_PREVIOUS_EXECUTED_VISITS]') });
                };
            })(gui)
        };
        context.buttons.push(gui.previousVisitPicturesButton);

    },

    this._addActivity = function (gui, visit, customerSurvey, failureCallback, successCallback) {
        var self = this;
        var localExecutionQueue = new ExecutionQueue();
        var localSuccessCallback = function () { localExecutionQueue.executeNext(); };

        // plan customer survey in visit (adds to current document)
        var f = function () {
            SalesExecutionEngine.planCustomerSurvey(customerSurvey, visit, visit.get("CODSTATUS"));
            self._onAfterCustomerSurveyAdded(customerSurvey, gui);
            localSuccessCallback();
        };
        localExecutionQueue.pushHandler(self, f);

        // see if the user wants to add a questionnaire
        if (SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.QUEST) {
            // load questionnair
            f = function () {
                self._loadQuestionnairActivity(customerSurvey, gui, failureCallback, localSuccessCallback);
            };
            localExecutionQueue.pushHandler(self, f);
        }

        // load objective data
        f = function () {
            self._loadObjectives(customerSurvey, gui, failureCallback, localSuccessCallback);
        };
        localExecutionQueue.pushHandler(self, f);

        f = function () {
            self._reloadSurveyData(gui, customerSurvey, failureCallback, localSuccessCallback);
        };
        localExecutionQueue.pushHandler(self, f);

        f = function () {
            // create and add the tab
            self._createCustomerSurveyTab(customerSurvey, gui);
            self._refreshTab(gui, customerSurvey);
            self._addPhotoSurvey(gui, customerSurvey);
            successCallback();
        };
        localExecutionQueue.pushHandler(self, f);

        localExecutionQueue.executeNext();
    },

    this._updateVisitButtonState = function (gui) {

        var context = {
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeUpdateVisitButtonState', context);
        if (context.canceled)
            return;

        var visit = gui.getDocument();
        var codParty = visit.get("CODPARTY");

        var cancelRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codFunc);
        if (cancelRight && this.hasEditRight) {
            var cancelEnabled = (gui.openMode != "VIEW" && SalesExecutionEngine.canCancel({ "mobVisit": visit }));
            gui.cancelVisitButton.enabled = cancelEnabled;
        }
        else
            gui.cancelVisitButton.visible = false;
        var suspendRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codFunc);
        if (suspendRight && this.hasEditRight) {
            var suspendEnabled = (gui.openMode != "VIEW" && (SalesExecutionEngine.canSuspend({ "mobVisit": visit }) || SalesExecutionEngine.canCancel({ "mobVisit": visit })));
            gui.suspendVisitButton.enabled = suspendEnabled;
        }
        else
            gui.suspendVisitButton.visible = false;

        gui.reloadVisitButton.enabled = (gui.openMode != "VIEW");

        var hasNewOpportunityRight = UserContext.checkRight("NAV_MOB_OPPORTUNITIES", "NAV_MOB_OPPORTUNITIES", "NEW");
        if (!gui.cust || !gui.cust.get("FLGACCOUNT") || !hasNewOpportunityRight) {
            gui.newOpportunityButton.visible = false;
        } else {
            gui.newOpportunityButton.enabled = gui.openMode != "VIEW";
        }

        if (XApp.isEmptyOrWhitespaceString(codParty) || !this.hasEditRight) {
            gui.newActivityButton.visible = false;
        } else {

            var surveys = XApp.GlobalData["SURVEYS"];
            var surveysAreAvailable = false;
            for (var i = 0; i < surveys.length; i++) {
                if (SalesExecutionEngine.isSurveyTypeAvailable(surveys[i], visit) && SalesExecutionEngine.isJsonTabVisible(surveys[i])) {
                    surveysAreAvailable = true;
                    break;
                }
            }
            if (!surveysAreAvailable)
                this._eachDistinctConsumerQuestActivity(gui, visit, true, function (mission, cs, nrDoneCs) {
                    if (nrDoneCs < mission.get("MAXCONSUMERQUEST")) {
                        surveysAreAvailable = true;
                        return false; //stop checking for more
                    }
                    return true;
                });

            gui.newActivityButton.enabled = ((gui.openMode != "VIEW") && surveysAreAvailable);
        }

        if (XApp.isEmptyOrWhitespaceString(codParty) || !this.hasEditRight) {
            gui.addPendingActivitiesButton.visible = false;
        } else {
            gui.addPendingActivitiesButton.enabled = (gui.openMode != "VIEW");
            gui.addPendingActivitiesButton.visible = true;
        }

        var hasNewOrderRight = UserContext.checkRight("NAV_MOB_ORDERS", "NAV_MOB_ORDERS", "NEWORDER");
        if (XApp.isEmptyOrWhitespaceString(codParty) || !hasNewOrderRight || !gui.cust || gui.cust.get("FLGORDER") == 0) {
            gui.newOrderButton.visible = false;
        } else {
            gui.newOrderButton.enabled = (gui.openMode != "VIEW");
            gui.newOrderButton.visible = true;
        }

        var hasNewOrderCartRight = UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "NEWCART");
        if (XApp.isEmptyOrWhitespaceString(codParty) || !hasNewOrderCartRight || !gui.cust || gui.cust.get("FLGORDER") == 0) {
            gui.newOrderCartButton.visible = false;
        } else {
            gui.newOrderCartButton.enabled = (gui.openMode != "VIEW");
            gui.newOrderCartButton.visible = true;
        }

        if (!this._canCreateNewEncashment(gui)) {
            gui.newEncashmentButton.visible = false;
        } else {
            gui.newEncashmentButton.enabled = (gui.openMode != "VIEW");
            gui.newEncashmentButton.visible = true;
        }

        var viewCustomerRight = UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", 'VIEW');
        if (XApp.isEmptyOrWhitespaceString(codParty) || !viewCustomerRight) {
            gui.visitCustomerButton.visible = false;
        } else {
            gui.visitCustomerButton.enabled = true;
        }

        var customerExternalUrl = ParametersDefaultsAndStaticData.getInstance().getCustomerExternalUrl();
        if (XApp.isEmptyOrWhitespaceString(customerExternalUrl) || XApp.isEmptyOrWhitespaceString(codParty))
            gui.customerExternalUrlButton.visible = false;

        if (XApp.isEmptyOrWhitespaceString(codParty))
            gui.previousVisitPicturesButton.visible = false;
        else
            gui.previousVisitPicturesButton.visible = true;

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterUpdateVisitButtonState', context);

    },

    this.setSectionButtonsStatus = function (context) {
        var gui = context.gui;
        var entity = context.subGui.entity;

        switch (context.buttonConfig.code) {
            case "MOBVISIT.UPLOAD_IMAGE":
            case "MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE":
                {
                    context.visible = true;
                    context.enabled = (gui.openMode != "VIEW") && gui.m_photoSurveys != undefined && gui.m_photoSurveys.length > 0;
                    break;
                }
            case "CANCEL_SURVEY":
                {
                    context.visible = true;
                    var isMandatoryActivity = SalesExecutionEngine.contactModeFLGMANDATORY(SalesExecutionEngine.getSurveyConfig(entity.get("CODTYPSURVEY")), entity.getParentEntity().get("CONTACTMODE"));
                    context.enabled = (gui.openMode != "VIEW" && !isMandatoryActivity &&
                        SalesExecutionEngine.canCancel({ "customerSurvey": entity }) && XApp.isEmptyOrWhitespaceString(entity.get("IDSURVEYSRC")));
                    break;
                }
            case "SUSPEND_SURVEY":
                {
                    context.visible = true;
                    var isMandatoryActivity = SalesExecutionEngine.contactModeFLGMANDATORY(SalesExecutionEngine.getSurveyConfig(entity.get("CODTYPSURVEY")), entity.getParentEntity().get("CONTACTMODE"));
                    context.enabled = (gui.openMode != "VIEW" && !isMandatoryActivity &&
                        (SalesExecutionEngine.canSuspend({ "customerSurvey": entity }) || SalesExecutionEngine.canCancel({ "customerSurvey": entity })) && XApp.isEmptyOrWhitespaceString(entity.get("IDSURVEYSRC")));
                    break;
                }
            case "TAKE_PLANORAMA_PICTURE":
            case "UPLOAD_PLANORAMA_PICTURE":
                {
                    context.visible = UserContext.getConfigParam("PLANORAMA_ENABLED", "-1") != 0;
                    context.enabled = (gui.openMode != "VIEW" &&
                        XApp.isEmptyOrWhitespaceString(entity.get("PLANORAMASTATUS")) && !entity.get("IDSURVEY").startsWith("[NEW]"));
                    break;
                }
            case "PROCESS_PLANORAMA":
                {
                    context.visible = UserContext.getConfigParam("PLANORAMA_ENABLED", "-1") != 0;
                    context.enabled = (gui.openMode != "VIEW" && entity.get("PLANORAMA_IMAGES") != 0 && XApp.isEmptyOrWhitespaceString(entity.get("PLANORAMASTATUS"))
                        && XApp.isOnline());
                    break;
                }
            case "ADD_PRODUCT":
                {
                    var entityOfSection = context.buttonConfig.sectionContext.entity;

                    context.enabled = (gui.openMode != "VIEW");
                    context.visible = entityOfSection.detachedFrom != null ? true : false;
                    break;
                }
            case "REMOVE_PRODUCT":
                {
                    var sectionContext = context.buttonConfig.sectionContext;
                    var entityOfSection = sectionContext.entity;

                    context.visible = !entityOfSection.detachedFrom ? true : false;
                    context.enabled = (gui.openMode != "VIEW");

                    var customerSurvey = sectionContext.config.MVCustomerSurvey;
                    //enable or disable remove button
                    //disable for NOT manually added products for ASSO(ASSO/ASSOCOMP), PROMO and ASSET activities 
                    //enable for the rest
                    var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));
                    if (std == SalesExecutionNameSpace.SurveyTypeDetail.PROMO ||
                        std == SalesExecutionNameSpace.SurveyTypeDetail.ASSO ||
                        std == SalesExecutionNameSpace.SurveyTypeDetail.ASSOCOMP ||
                        std == SalesExecutionNameSpace.SurveyTypeDetail.ASSET) {

                        var measureName = ParametersDefaultsAndStaticData.getInstance().getManuallyAddedMeasureName();
                        var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfig(customerSurvey.get("CODTYPSURVEY"), measureName);
                        if (surveyMeasure) {
                            var fieldName = surveyMeasure.FIELDNAME;
                            if (entityOfSection.get(fieldName) === 0 || entityOfSection.get(fieldName) === false) {
                                context.enabled = false;
                            }
                        } else
                            context.enabled = false;
                    }
                    break;
                }
            case "NEW_ENCASHMENT":
                {
                    if (!this._canCreateNewEncashment(gui)) {
                        context.visible = false;
                        context.enabled = false;
                    }
                    else {
                        context.visible = true;
                        context.enabled = (gui.openMode != "VIEW");
                    }
                    break;
                }
            case "NEW_ORDER":
                {
                    var hasNewOrderRight = UserContext.checkRight("NAV_MOB_ORDERS", "NAV_MOB_ORDERS", "NEWORDER");
                    var visit = gui.getDocument();
                    var codParty = visit.get("CODPARTY");
                    if (XApp.isEmptyOrWhitespaceString(codParty) || !hasNewOrderRight || !gui.cust || gui.cust.get("FLGORDER") == 0) {
                        context.visible = false;
                        context.enabled = false;
                    } else {
                        context.enabled = (gui.openMode != "VIEW");
                        context.visible = true;
                    }
                    break;
                }
            case "VIEW_ENCASHMENT":
            case "VIEW_ORDER":
                {
                    //always visible because if we don't find encashment or order we don't even add the buttons to the gui so we don't pass trough here
                    context.visible = true;
                    //enabled always. also in view mode (EXECUTED status).
                    context.enabled = true;
                    break;
                }
            case "ACTIVITY_REPORT":
                {
                    context.enabled = true;
                    break;
                }
            default:
                {
                    context.visible = true;
                    context.enabled = (gui.openMode != "VIEW");
                    break;
                }
        }
    },

    this.setRemoveButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "MVCustomerSurveyPicture":
                //leave visible
                break;
            default:
                context.visible = false; //hide for the rest
                break;
        }

    },
    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "MVCustomerSurveyContact":
                {
                    context.visible = false;
                    break;
                }
            case "MVCustomerSurveyRow":
                {
                    if (XApp.isPhone()) {
                        //If buttons is displayed in popup then controls the sate in a different way.
                        // TODO - manage more than one button.
                        if (context.buttonConfig && context.buttonConfig.sectionPanel && (context.buttonConfig.sectionPanel.hasPopup() || context.subGui.tabConfig.attrs.useSideTabBar == "true"))
                            context.visible = true;
                        else
                            context.visible = false;
                    }
                    else context.visible = true;
                    break;
                }
        }
    },

    this.preFillSection = function (sectionContext) {

        var self = this;

        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "VISIT_INFO":
            case "VISIT_DETAIL":
                {
                    //Populate STR_TIME_HOURVISIT and STR_TIME_HOURVISIT
                    sectionContext.entity.set("STR_TIME_HOURVISIT", SalesExecutionEngine.getStartMoment(sectionContext.entity).toShortTimeString());
                    sectionContext.entity.set("STR_TIME_HOURVISITTO", SalesExecutionEngine.getEndMoment(sectionContext.entity).toShortTimeString());

                    break;
                }
            case "HEADER_MEASURES":
                {
                    //change sectioncontext entity from CUSTOMERSURVEY to CUSTOMERSURVEYROW
                    sectionContext.entityName = 'MVCustomerSurveyRow';
                    var e = sectionContext.entity.get("HEADER");
                    if (e == null) {
                        //add fake product
                        var obj = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(sectionContext.entity);
                        obj.set("CODART", ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode());
                        obj.set("CODDIV", UserContext.CodDiv);
                        obj.set("CODLOCATION", SalesExecutionEngine.getMaxCodLocation(sectionContext.entity));

                        sectionContext.entity.set("HEADER", obj);
                        obj.setParentEntity((sectionContext.entity));
                        sectionContext.entity = obj;
                    } else {
                        //use face product
                        sectionContext.entity = e;
                    }

                    break;
                }
            case "CONTACTS_GRID":
                {
                    //create a new fake contact activity that will hold all the contacts associated with the current client and also the associaiton information
                    if (!sectionContext.entity.contactActivity)
                        sectionContext.entity.contactActivity = new XEntity({ entityName: 'MVCustomerSurvey' });

                    //change section entity to this new survey
                    sectionContext.entity = sectionContext.entity.contactActivity;
                    sectionContext.entityName = 'MVCustomerSurvey';

                    sectionContext.config.attrs["editable"] = ((sectionContext.gui.openMode != "VIEW") ? "true" : "false");
                    break;
                }
            case "ACTIVITY_ATTACHMENTS":
                {
                    //setup customer survey documnet for attachments
                    sectionContext.document = sectionContext.entity;
                    break;
                }
            case "MISSION_ATTACHMENTS":
                {
                    //setup mission documnet for attachments
                    sectionContext.document = sectionContext.config.Mission;
                    break;
                }
            case "ATTACHMENT":
                {
                    if (!sectionContext.entity.contactActivity)
                        sectionContext.document = sectionContext.entity;
                    break;
                }
            default:
                {
                    if (!XApp.isEmptyOrWhitespaceString(sectionName) && sectionName.indexOf("CUSTOMERSURVEY.", 0) == 0) {

                        sectionContext.entityName = 'MVCustomerSurveyRow';
                        var csr = sectionContext.config.MVCustomerSurveyRow;

                        if (!csr) {

                            //create dummy empty customer survey row;
                            var obj = new XEntity({ entityName: 'MVCustomerSurveyRow' });

                            //only key values need to be stored in order to retrieve product in add new row
                            obj.set("CODART", sectionContext.config.PRODUCT_ROW.get("CODART"));
                            obj.set("CODDIV", sectionContext.config.PRODUCT_ROW.get("CODDIV"));

                            obj.detachedFrom = sectionContext.config.MVCustomerSurvey;

                            sectionContext.entity = obj;

                        } else {
                            sectionContext.entity = csr;
                            sectionContext.entity.detachedFrom = null;
                        }

                    }

                    break;
                }
        }

        if (sectionContext.config.QuestionnairQuestion) {
            sectionContext.entityName = 'QuestionnairQuestion';

            //retrive and set section context entity
            var qq = sectionContext.config.QuestionnairQuestion;
            sectionContext.entity = qq;

        }

        if (this._isPreviewSection(sectionName)) {
            sectionContext.entityName = "MVCustomerSurvey";

            //find survey which will be previewed in this section
            var previewIndex = sectionContext.config.attrs.previewIndex;
            var previewSurveys = sectionContext.gui.getDocument().getSubEntityStore("MVCustomerSurvey").toArray();
            previewSurveys = Ext.Array.sort(previewSurveys, function (a, b) {
                return SalesExecutionEngine.CompareSurveys(a, b);
            });
            previewSurveys = Ext.Array.filter(previewSurveys, function (cs) {
                return self._hasPreviewSection(cs);
            });

            if (previewSurveys.length <= previewIndex) {
                XLog.logWarn("Survey preview section mismatch.");
            }
            else {
                sectionContext.entity = previewSurveys[previewIndex];
            }
        }
    },
    this.afterSectionCreated = function (context) {
        var self = this;
        var sectionName = context.sectionConfig.attrs["caption"];

        try {
            switch (sectionName) {
                case "VISIT_INFO":
                    {
                        var entity = context.detailGui.entity;
                        context.detailGui.fields.STR_TIME_HOURVISITTO.setValue(entity.get("STR_TIME_HOURVISITTO"));
                        context.detailGui.fields.STR_TIME_HOURVISIT.setValue(entity.get("STR_TIME_HOURVISIT"));
                        break;
                    }
                case "CUSTOMERSURVEYPICTURE":
                    {
                        var innerPanel = context.panel.innerPanel;
                        var picturePanel = Ext.create('XButton', {
                            layout: {
                                type: 'fit'
                            },
                            cls: "se-customersurveypicture-large",
                            html: "<div ALIGN=center  class='img'><img  src='' /></div>",
                            styleHtmlContent: true,
                            SM1Listeners: {
                                onPress: (function (context) {
                                    return function () {
                                        self._openCustomerSurveyPicture(context.gui, context.detailGui.entity);
                                    };
                                })(context)
                            }
                        });

                        var csp = context.detailGui.entity;
                        CspEngine.getFileAsBase64(context.gui.getDocument(), csp.get("IDFILE"), csp.get("IDFILE"), function (base64) {
                            if (!picturePanel.isDestroyed)
                                picturePanel.setHtml("<div ALIGN=center  class='img'><img  src='" + base64 + "' /></div>");
                        }, Ext.emptyFn);

                        innerPanel.add(picturePanel);
                        break;
                    }
                case "HEADER_MEASURES":
                    {
                        //Hide Header Measure section if there are no visible header measures
                        var entity = context.detailGui.entity;
                        var activityType = SalesExecutionEngine.getActivityType(entity.get("CODTYPSURVEY"));
                        var surveyMeasureConfigs = SalesExecutionEngine.getOrderedSurveyMeasureConfig(entity.get("CODTYPSURVEY"));
                        var hasVisibleHeaderMeasures = false;
                        if (surveyMeasureConfigs && surveyMeasureConfigs.length) {
                            for (var i = 0; i < surveyMeasureConfigs.length; i++) {
                                //for customer activity type all measures are considered as header measures, even if they do have FLGHEADER = true
                                if (surveyMeasureConfigs[i]["FLGVISIBLE"] && (activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER || surveyMeasureConfigs[i]["FLGHEADER"])) {
                                    hasVisibleHeaderMeasures = true;
                                    break;
                                }
                            }
                            if (!hasVisibleHeaderMeasures)
                                context.panel.hide();
                        }
                        break;
                    }
                case "VISIT_DETAIL":
                    {
                        var toolbarContainer = context.panel.sectionToolbar.rightContainer;
                        //status icon
                        toolbarContainer.add({
                            xtype: 'image',
                            height: 19,
                            width: 19,
                            margin: '0px 6px 0px 0px',
                            src: XUI.getImageDataFromCSS('.guis_visit_status_' + context.gui.getDocument().get("CODSTATUS") + "_19")
                        });
                        //status description
                        toolbarContainer.add({
                            xtype: 'label',
                            cls: 'sm1-visit-summary-status sm1-visit-summary-status-' + context.gui.getDocument().get("CODSTATUS"),
                            html: context.gui.getDocument().get("DESSTATUS")
                        });
                    }
                    break;
            }

            if (context.sectionConfig.QuestionnairQuestion) {
                var question = context.sectionConfig.QuestionnairQuestion;
                if (question.hidden) {
                    context.panel.hide();
                }
            }

            if (this._isPreviewSection(sectionName)) {
                context.panel.sectionToolbar.setHidden(true);

                var onPreviewTap = (function (gui, self) {
                    //open corresponding tab
                    return function (previewContext) {
                        var tab = gui.tabSubDetailsByName[previewContext.customerSurvey.uniqueID];
                        if (!tab)
                            return;
                        if (self.canOpenTab(tab, context.gui))
                            gui.tabPanel.setActiveItem(tab);
                    };
                })(context.gui, this);

                //extra wrapping panel on top of section panel
                var previewPanel = new Ext.Panel({
                    layout: "hbox"
                });

                var sectionColor = XSequenceIndicator.colors.GREEN;
                var survey = context.panel.sectionContext.entity;
                var activityType = SalesExecutionEngine.getActivityType(survey.get("CODTYPSURVEY"));
                var tab = context.gui.tabSubDetailsByName[survey.uniqueID];
                if (tab) {
                    if (activityType == SalesExecutionNameSpace.ActivityType.PRODUCT
                        || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER) {

                        if (tab.tabConfig.wasVisited) {
                            this._updateCalculatedMeasures(survey, SalesExecutionNameSpace.CalculationTriggers.SHOW, context.gui);
                        }
                        //keep the list of anomalies up-to-date whenever the summary page is shown
                        this._validateSurvey(survey);
                    }

                    this._updateCollectionFlags(survey, tab, context.gui);
                    sectionColor = this._getSequenceIndicatorColor(survey);
                }

                context.panel.sequenceIndicator = previewPanel.add({
                    xtype: "xsequenceindicator",
                    docked: "left",
                    sequenceIndex: context.sectionConfig.attrs.previewIndex + 1,
                    color: sectionColor,
                    dataSource: context.panel.sectionContext.entity
                });

                previewPanel.add(context.panel.innerPanel);

                var surveyPreviewConfig = {
                    xtype: "xcustomersurveypreview",
                    customerSurvey: context.panel.sectionContext.entity,
                    handler: onPreviewTap,
                    title: tab ? tab.tabBtn.getText() : ""
                };
                if (SalesExecutionEngine.surveyHasLinkedDashboard(context.panel.sectionContext.entity.get("CODTYPSURVEY"))) {
                    var onDashTap = (function (gui, customerSurvey) {
                        return function () {
                            self._showSurveyDash.call(self, gui, customerSurvey);
                        };
                    })(context.gui, context.panel.sectionContext.entity);
                    surveyPreviewConfig.dash = {
                        title: UserContext.tryTranslate("[" + SalesExecutionEngine.getSurveyDashName(context.panel.sectionContext.entity.get("CODTYPSURVEY") + "]")),
                        handler: onDashTap
                    };
                }
                context.panel.surveyPreview = context.panel.innerPanel.add(surveyPreviewConfig);

                //styling workaround in order to have sequence indicator "outside" of section panel
                context.panel.innerPanel.addCls(context.panel.getCls());
                context.panel.innerPanel.setUserCls(context.panel.getUserCls());
                context.panel.setCls("");
                context.panel.addCls("sm1-survey-preview-section");
                context.panel.setUserCls("");
                context.panel.removeAll();
                context.panel.add(previewPanel);
            }
            //if the parent tab is configured to use side bar and the host panel is not scrollable, make the section scrollable
            if (context.sectionConfig.attrs["type"] != 'GRID'
                && context.panel.sectionContext.detailContext.tabConfig.attrs.useSideTabBar == "true"
                && context.detailGui.entityName == "MVCustomerSurvey"
                && this._getScrollForActiviy(context.detailGui.entity) == "false") {
                context.panel.setScrollable({ direction: 'vertical' });
                context.panel.setDocked(false);
            }
        } catch (e) {
            XLog.logErr("Error in afterSectionCreated for section " + sectionName);
            XUI.showExceptionMsgBox(e);
        }
    };

    this.getAutoField = function (context) {
        var sectionContext = context.sectionContext;
        var fieldConfig = context.fieldConfig;
        var detailContext = context.detailContext;

        var fieldName = fieldConfig.attrs["name"];

        //STR_TIME_HOURVISIT field has different translations in VISIT_SUMMARY and VISIT_INFO tabs
        var fieldTranslation = (detailContext.tabName == "VISIT_SUMMARY" && fieldName == "STR_TIME_HOURVISIT") ?
            UserContext.tryTranslate("[MOBVISIT.VISIT_SUMMARY.STR_TIME_HOURVISIT]") :
            UserContext.tryTranslate("[" + sectionContext.entityName + "." + fieldName + "]");

        var f = null;

        if (fieldName == "STR_TIME_HOURVISIT" || fieldName == "STR_TIME_HOURVISITTO") {
            var options = [];
            switch (fieldName) {
                case "STR_TIME_HOURVISIT":
                    options = SalesExecutionEngine.getWorkingHours('STARTING');
                    if (options.length > 0) {
                        var startDate = SalesExecutionEngine.getStartMoment(detailContext.entity);
                        var startingHourTimeSpan = new TimeSpan(0, startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
                        //add in the collection also the starting time of the appointment if it's not alreayd present 
                        for (var i = 0; i < options.length; i++) {
                            var currentTimeSpan = options[i].data;
                            var cmp = currentTimeSpan.compareTo(startingHourTimeSpan);
                            if (cmp > 0) {
                                options.splice(i, 0, {
                                    text: startingHourTimeSpan.toShortTimeString(),
                                    value: startingHourTimeSpan.toShortTimeString(),
                                    data: startingHourTimeSpan
                                });
                                break;
                            } else if (cmp == 0)
                                break;
                        }
                    }
                    break;
                case "STR_TIME_HOURVISITTO":
                    options = SalesExecutionEngine.getWorkingHours('ENDING');
                    if (options.length > 0) {
                        var endDate = SalesExecutionEngine.getEndMoment(detailContext.entity);
                        var endingHourTimeSpan = new TimeSpan(0, endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), 0);
                        //add in the collection also the end time of the appointment if it's not alreayd present 
                        for (var i = 0; i < options.length; i++) {
                            var currentTimeSpan = options[i].data;
                            var cmp = currentTimeSpan.compareTo(endingHourTimeSpan);
                            if (cmp > 0) {
                                options.splice(i, 0, {
                                    text: endingHourTimeSpan.toShortTimeString(),
                                    value: endingHourTimeSpan.toShortTimeString(),
                                    data: endingHourTimeSpan
                                });
                                break;
                            } else if (cmp == 0)
                                break;
                        }
                    }
                    this._endOptions = options;
                    break;
            }
            f = new XCombo({
                label: fieldTranslation,
                name: fieldName,
                options: options,
                listeners: {
                    change: function (ctrl, newValue) {
                        detailContext.onEndEdit(ctrl, fieldName, newValue, '');
                    }
                }
            });
        }

        var onSummaryTap = (function (gui, self) {
            //open corresponding tab
            return function (summaryContext) {
                var tabName = "";
                switch (summaryContext.fieldName) {
                    case "VISIT_SUMMARY":
                        tabName = "VISITINFO";
                        break;
                    case "YAMMER_SUMMARY":
                        tabName = "YAMMER";
                        break;
                    case "INFO_SUMMARY":
                        tabName = "VISITLINKS";
                        break;
                    case "CONTACTS_SUMMARY":
                        tabName = "CONTACTS";
                        break;
                    case "ATTACH_SUMMARY":
                        //find the first tab corresponding to an attachments activity
                        for (var i = 0; i < gui.tabSubDetails.length; i++) {
                            var t = gui.tabSubDetails[i].tabName;
                            if (t.startsWith(SalesExecutionNameSpace.ActivityType.ATTACHMENTS)) {
                                tabName = t;
                                break;
                            }
                        }
                        break;
                    case "PHOTO_SUMMARY":
                        tabName = "PHOTOS";
                        break;
                    case "PHARMASTUDY_IN_PROGRESS_SUMMARY":
                    case "PHARMASTUDY_DONE_SUMMARY":
                        tabName = "PHARMASTUDY";
                        break;
                }

                if (XApp.isEmptyOrWhitespaceString(tabName))
                    return;

                var tab = gui.tabSubDetailsByName[tabName];
                if (!tab)
                    return;

                gui.tabPanel.setActiveItem(tab);
            };
        })(detailContext.gui, this);

        var onStudySummaryTap = (function (gui, self, selectTab) {
            return function (summaryContext) {
                try {
                    //coresponding nav is empty and hidden; don't go there
                    if (gui.getDocument().get(summaryContext.fieldName) == 0) {
                        return;
                    }

                    //activate study tab
                    selectTab(summaryContext);

                    //attempt to scroll to correspoding linked nav within tab
                    var carouselSectionItems = gui.tabCtrls["PHARMASTUDY"].sections["LINK_CAROUSEL"].innerPanel.getItems().items;
                    var toolbar = Ext.Array.findBy(carouselSectionItems, function (item) { return item.isXType("toolbar"); });
                    if (!toolbar) {
                        return;
                    }

                    var toolbarItems = toolbar.getItems().items;

                    switch (summaryContext.fieldName) {
                        case "PHARMASTUDY_IN_PROGRESS_SUMMARY":
                            var prevBtn = Ext.Array.findBy(toolbarItems, function (item) { return item.isXType("xbutton") && item.getDocked() == "left"; });
                            if (prevBtn && prevBtn.config && prevBtn.config.SM1Listeners && prevBtn.config.SM1Listeners.onPress) {
                                prevBtn.config.SM1Listeners.onPress();
                            }
                            break;
                        case "PHARMASTUDY_DONE_SUMMARY":
                            var nextBtn = Ext.Array.findBy(toolbarItems, function (item) { return item.isXType("xbutton") && item.getDocked() == "right"; });
                            if (nextBtn && nextBtn.config && nextBtn.config.SM1Listeners && nextBtn.config.SM1Listeners.onPress) {
                                nextBtn.config.SM1Listeners.onPress();
                            }
                            break;
                    }
                }
                catch (ex) {
                    XLog.logEx(ex);
                }
            };
        })(detailContext.gui, this, onSummaryTap);

        var onOpportunitySummaryTap = (function (gui, self) {
            return function (summaryContext) {
                try {
                    var oportunityTab = gui.tabSubDetailsByName["OPPORTUNITYLINKS"];
                    if (!oportunityTab)
                        return;

                    var filter;
                    switch (summaryContext.fieldName) {
                        case "OPPORTUNITY_IN_PROGRESS_SUMMARY":
                            filter = UserContext.tryTranslate("[NAV_MOB_OPPORTUNITIES.OPEN_FILTER]");
                            break;
                        case "OPPORTUNITY_DONE_SUMMARY":
                            filter = UserContext.tryTranslate("[NAV_MOB_OPPORTUNITIES.DONE_FILTER]");
                            break;
                    }

                    if (!gui.tabCtrls["OPPORTUNITYLINKS"]) {
                        // filtering string will be added when creating the link
                        oportunityTab.tabConfig.searchFilter = filter;
                    } else {
                        // set filter on the existing link
                        var link = gui.tabCtrls["OPPORTUNITYLINKS"].sections["OPP_LINK_CAROUSEL"].sectionContext.ctrls.NAV_MOB_VISIT_OPPORTUNITIES;

                        // clear filters from the current link in order to filter on the whole data set
                        if (!XApp.isEmptyOrWhitespaceString(link.searchFilter))
                            link.filter("");

                        // activate the search bar if necessary
                        if (!link.topToolbar.isSearchActive)
                            link.toggleSearchBar();

                        // filter the opportunities navigator
                        link.searchFilter = filter;
                        link.searchField.setValue(link.searchFilter);
                        link.filter(link.searchFilter);
                    }

                    gui.tabPanel.setActiveItem(oportunityTab);
                }
                catch (ex) {
                    XLog.logEx(ex);
                }
            };
        })(detailContext.gui, this);

        switch (fieldName) {
            case "VISIT_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: detailContext.entity.get("DESCONTACTMODE"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.DETAILS]"),
                    hideValue: -Infinity,
                    imgSrc: ".guis_visit_contactmode_" + detailContext.entity.get("CONTACTMODE").toLowerCase() + "_40",
                    handler: onSummaryTap
                });
                break;
            case "YAMMER_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.YAMMER]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.DETAILS]"),
                    hideValue: -Infinity,
                    imgSrc: ".guis_visit_xdet_photos_19",
                    handler: onSummaryTap
                });
                break;
            case "INFO_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.INFO]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.DETAILS]"),
                    hideValue: -Infinity,
                    imgSrc: ".guis_visit_xdet_info_19",
                    handler: onSummaryTap
                });
                break;
            case "CONTACTS_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.CONTACTS]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.CONTACTS]"),
                    imgSrc: ".guis_visit_xdet_contacts_19",
                    handler: onSummaryTap
                });
                break;
            case "ATTACH_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.ATTACHMENTS]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.ATTACHMENTS]"),
                    imgSrc: ".guis_visit_xdet_attachments_19",
                    handler: onSummaryTap
                });
                break;
            case "PHOTO_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.PHOTOS]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.PHOTOS]"),
                    imgSrc: ".guis_visit_xdet_photos_19",
                    handler: onSummaryTap
                });
                break;
            case "PHARMASTUDY_IN_PROGRESS_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.PHARMASTUDY_IN_PROGRESS_SUMMARY]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.PHARMASTUDIES]"),
                    hideValue: -Infinity,
                    imgSrc: ".guis_visit_xdet_studies_19",
                    handler: onStudySummaryTap
                });
                break;
            case "PHARMASTUDY_DONE_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.PHARMASTUDY_DONE_SUMMARY]"),
                    detail: UserContext.tryTranslate("[MOBGUIVISIT.PHARMASTUDIES]"),
                    hideValue: -Infinity,
                    imgSrc: ".guis_visit_xdet_studies_19",
                    handler: onStudySummaryTap
                });
                break;
            case "OPPORTUNITY_IN_PROGRESS_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITY_IN_PROGRESS_SUMMARY]"),
                    detail: detailContext.gui.getDocument().get("OPPORTUNITY_IN_PROGRESS_SUMMARY") == 1 ?
                        UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITY_IN_PROGRESS]") :
                        UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITIES_IN_PROGRESS]"),
                    imgSrc: ".guis_visit_xdet_opportunities_19",
                    handler: onOpportunitySummaryTap
                });
                break;
            case "OPPORTUNITY_DONE_SUMMARY":
                f = new XDetSummary({
                    name: fieldName,
                    title: UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITY_DONE_SUMMARY]"),
                    detail: detailContext.gui.getDocument().get("OPPORTUNITY_DONE_SUMMARY") == 1 ?
                        UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITY_DONE]") :
                        UserContext.tryTranslate("[MOBGUIVISIT.OPPORTUNITIES_DONE]"),
                    imgSrc: ".guis_visit_xdet_opportunities_19",
                    handler: onOpportunitySummaryTap
                });
                break;
            default:
                //the field used to display the dashboard linked to the default activity
                if (fieldName == SalesExecutionEngine.getSurveyDashName(UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST"))) {
                    var defActivity = SalesExecutionEngine.getDefaultActivity(detailContext.entity);
                    var onDashTap = (function (self, gui, customerSurvey) {
                        return function () {
                            self._showSurveyDash.call(self, gui, customerSurvey);
                        };
                    })(this, detailContext.gui, defActivity);
                    f = new XDetSummaryDash({
                        name: fieldName,
                        title: UserContext.tryTranslate("[" + (defActivity != null ? SalesExecutionEngine.getSurveyDashName(defActivity.get("CODTYPSURVEY")) : "") + "]"),
                        handler: onDashTap
                    });
                }
                break;
        }
        return f;
    },

    this.preLoadDocument = function (context) {
        //if document was provided to gui by external call then cancel default document loading and just set the received document in the docstore of 
        //gui
        var gui = context.gui;
        if (gui.openData && gui.openData.document) {
            var docStore = new XStore({ entityName: gui.docName });
            docStore.add(gui.openData.document);
            gui.docStore = docStore;

            gui.setModified(gui.openData.document);

            return false;
        }

        return true;
    };

    this.initDefaultTabs = function (gui) {
        var self = this;


        //set the context for calling the counter functions
        var context = { gui: gui, storeEntity: null };
        //add show and hide event on the default tabs
        gui.tabSubDetails.forEach(function (tab) {
            tab.on("show", (function (context) {
                return function (tabPanel) {
                    self._onTabPanelShown(tabPanel, context);
                };
            })(context));

            tab.on("hide", (function (context) {
                return function (tabPanel) {
                    self._onTabPanelHide(tabPanel, context);
                };
            })(context));
        });
        //start the counter
        self._startVisitDurationCounter(context);
    };

    this._loadCustomer = function (gui) {
        try {

            var entity = gui.getDocument();
            var codParty = entity.get("CODPARTY");
            if (!XApp.isEmptyOrWhitespaceString(codParty)) {
                var cust = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(codParty));
                if (!cust) {
                    XLog.logErr("Could not retrive customer with CODPARTY :" + codParty + " from  NAV_MOB_CUST");
                } else {
                    //take location from selected workplace if the customer is a doctor
                    if (CommonEngine.isDoctor(codParty)) {
                        var currentWorkplace = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(entity.get("CODSTRUCTURE")));
                        if (currentWorkplace) {
                            cust.set("DESLOC1", currentWorkplace.get("DESLOC1"));
                            cust.set("DESADDR1", currentWorkplace.get("DESADDR1") + " " + currentWorkplace.get("DESLOC1") + currentWorkplace.get("CODPRV"));
                        }
                    }

                    gui.cust = cust;
                    return true;
                }
            } else
                return true; // for user visit

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return false;
    },

    this.afterCardFieldCreation = function (field, context) {

        try {
            switch (context.sectionContext.entityName) {
                case "MobVisit":
                    if (context.fieldConfig.attrs.name == "DTEVISITTO")
                        field.setLeftIcon("sm1-field-end-date-icon");
                    break;
                case "QuestionnairQuestion":
                    {
                        //translate MULTIANSWER_[n] into DESQUESTION
                        if (field.getName().indexOf("MULTIANSWER_") == 0) {
                            var codAnswer = field.fieldContext.config.codAnswer;
                            var desanswer = context.sectionContext.entity.getSubEntityStore("QuestionnairAnswer").findBy(function (item) {
                                return item.get("CODANWSER") == codAnswer;
                            }).get("DESANSWER");
                            field.setLabel(desanswer);
                        }
                        break;
                    }
                case "MVCustomerSurveyRow":
                    {
                        //Customization for measure binded fields
                        if (context.sectionContext.entity.getEntityName() == "MVCustomerSurveyRow") {
                            var customerSurvey = context.sectionContext.entity.getParentEntity();
                            if (!customerSurvey)
                                customerSurvey = context.sectionContext.entity.detachedFrom;

                            var codTypSurvey = customerSurvey.get("CODTYPSURVEY");
                            var surveyConfig = SalesExecutionEngine.getSurveyConfig(codTypSurvey);
                            for (var i = 0; i < surveyConfig.SurveyMeasureDetails.length; i++) {
                                if (surveyConfig.SurveyMeasureDetails[i].FIELDNAME == field.getName()) {
                                    //got the correct surveymeassure definition and the measure attachted to this field

                                    //STREMEASUREs
                                    if (surveyConfig.SurveyMeasureDetails[i].FIELDNAME.indexOf("STRMEASURE", 0) == 0) {
                                        //STRING FIELD with qtabs -> combo 
                                        if (!XApp.isEmptyOrWhitespaceString(surveyConfig.SurveyMeasureDetails[i].CODTAB)) {
                                            var qtabs = surveyConfig.SurveyMeasureDetails[i].CODTAB;
                                            var rows = UserContext.getDecodeEntriesOrdered(qtabs);
                                            var voices = [];
                                            if (rows != null) {
                                                if (!surveyConfig.SurveyMeasureDetails[i].FLGMANDATORY)
                                                    voices.push({ value: "", text: "" });
                                                for (var j in rows) {
                                                    voices.push({ value: rows[j].cod, text: rows[j].des });
                                                }
                                            }
                                            var copy = field;

                                            switch (surveyConfig.SurveyMeasureDetails[i].CODPRESENTATIONCONTROL) {
                                                case SalesExecutionNameSpace.SE_STRMESURE_PRESTYPE.SPINNER:
                                                    {
                                                        field = new XSpinner({
                                                            name: copy.getName(),
                                                            label: copy.getLabel(),
                                                            options: voices,
                                                            listeners: {
                                                                change: function (ctrl, newValue) {
                                                                    context.detailContext.onEndEdit(ctrl, copy.getName(), newValue, '');
                                                                }
                                                            }
                                                        });
                                                        break;
                                                    }
                                                default:
                                                    {
                                                        field = new XCombo({
                                                            name: copy.getName(),
                                                            label: copy.getLabel(),
                                                            options: voices,
                                                            listeners: {
                                                                change: function (ctrl, newValue) {
                                                                    context.detailContext.onEndEdit(ctrl, copy.getName(), newValue, '');
                                                                }
                                                            }
                                                        });
                                                    }
                                            }

                                            field["fieldContext"] = copy.fieldContext;
                                            copy.destroy();
                                        }
                                            //STRING FIELD -> text box
                                        else {
                                            //leave as is
                                        }
                                    }
                                        //long, decimal,float field
                                    else if (surveyConfig.SurveyMeasureDetails[i].FIELDNAME.indexOf("DBLMEASURE", 0) == 0 || surveyConfig.SurveyMeasureDetails[i].FIELDNAME.indexOf("LNGMEASURE", 0) == 0) {
                                        //set number format
                                        if (!XApp.isEmptyOrWhitespaceString(surveyConfig.SurveyMeasureDetails[i].FORMATSTR) && surveyConfig.SurveyMeasureDetails[i].FORMATSTR != "CHECKBOX") {
                                            field.fieldContext.config.attrs["formatString"] = surveyConfig.SurveyMeasureDetails[i].FORMATSTR;
                                            field.setFormatString(surveyConfig.SurveyMeasureDetails[i].FORMATSTR);
                                        }
                                    }
                                    //DTEMEASURE leave defaults
                                    //FLGMEASURE leave defaults

                                    if (!field.fieldContext.config.attrs || field.fieldContext.config.attrs == null)
                                        field.fieldContext.config.attrs = {};
                                    field.fieldContext.config.attrs["editable"] = (new Boolean(surveyConfig.SurveyMeasureDetails[i].FLGREADONLY) == false).toString();
                                    field.fieldContext.config.attrs["visible"] = (new Boolean(surveyConfig.SurveyMeasureDetails[i].FLGVISIBLE) == true).toString();
                                    break;
                                }
                            }
                        } else
                            //header customer survey fields (NOTES)
                            field.fieldContext.config.editable = false;
                        break;
                    }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return field;
    },

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
        var entityName = fieldContext.sectionContext.entityName;
        switch (entityName) {
            //parent of MVCustomerSurveyRow is MVCustomerSurvey                                                                                                                                                 
            case "MVCustomerSurvey":
                fieldContext.column.invalidCSS = 'x-measure-error-field';
                fieldContext.column.warningCSS = 'x-measure-warn-field';
                fieldContext.column.validator = (function (extension, gui) {
                    return function (context) {
                        context.gui = gui;
                        // context.isValid = false; // to be delete it, it was used to display and stylize errors
                        extension.setGridFieldStatus(context);
                    };
                })(this, fieldContext.sectionContext.gui);
                break;
        }
    };

    /* var context = {
    gui: this.gui,
    rowEntity: rowEntity,
    fieldName: fieldName,
    newVal: newValue,
    oldVal: oldValue,
    customContext: this.customContext
    };*/
    this.validateGridField = function (context) {

        var entityName = context.rowEntity.getEntityName();
        switch (entityName) {
            case "MVCustomerSurveyRow":
                if (context.fieldName.indexOf("DBLMEASURE") == 0 || context.fieldName.indexOf("LNGMEASURE") == 0)
                    context.newVal = UserContext.stringToNumber(context.newVal);

                var cs = context.rowEntity.getParentEntity();
                var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));

                var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: context.fieldName });
                if (surveyMeasure != null) {

                    //set decimals for DBLMEASURE s with FORMATSTR
                    if (context.fieldName.indexOf("DBLMEASURE") == 0 && !XApp.isEmptyOrWhitespaceString(surveyMeasure.FORMATSTR) && surveyMeasure.FORMATSTR != "CHECKBOX") {
                        var valueWithDecimals = SalesExecutionEngine.setDecimals(context.ctrl.getStrValue(), surveyMeasure.FORMATSTR);
                        context.newVal = valueWithDecimals;
                    }

                    this._onManualMeasureChanged(cs, context.rowEntity, surveyMeasure);

                    //must be done here since after this point the grid will apply the value in the cell and all custom styles must be present so setgridfieldstatus has the classes populated.
                    context.rowEntity.set(context.fieldName, context.newVal);
                    context.codMeasure = surveyMeasure.CODMEASURE;
                }

                //ORDER MANAGEMENT 
                // Clear noordercasue field when YES is selected in ordertaken field
                if (cs.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey() && context.fieldName == SalesExecutionEngine.getOrderTakenFieldName(surveyConfig)) {
                    if (context.newVal == SalesExecutionNameSpace.YesNoQtab.Yes) {
                        var noOrderCauseFieldName = SalesExecutionEngine.getNoOrderCauseFieldName(surveyConfig);
                        context.rowEntity.set(noOrderCauseFieldName, "");
                    }
                }

                //ENCASHMENT MANAGEMENT 
                // Clear noencashmentcasue field when YES is selected in encashmenttaken field
                if (cs.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey() && context.fieldName == SalesExecutionEngine.getEncashmentTakenFieldName(surveyConfig)) {
                    if (context.newVal == SalesExecutionNameSpace.YesNoQtab.Yes) {
                        var fn = SalesExecutionEngine.getNoEncashmentCauseFieldName(surveyConfig);
                        context.rowEntity.set(fn, "");
                    }
                }

                //validate measures
                this._checkCell(context);

                break;
        }
    };

    this.onGridEndEditEnded = function (context) {
        try {
            var entityName = context.rowEntity.getEntityName();
            switch (entityName) {
                case "MVCustomerSurveyRow":
                    var cs = context.rowEntity.getParentEntity();
                    var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: context.fieldName });

                    //Replicate measure values
                    if (surveyMeasure && surveyMeasure.FLGSAMEVALUE) {
                        if (context.newVal != context.oldVal) {
                            SalesExecutionEngine.replicateMeasureValue(surveyMeasure, cs, context.rowEntity.get("CODART"), context.rowEntity.get("CODDIV"), context.newVal);
                        }
                    }

                    //refresh current detail context so changes in calculated measures get updated.
                    setTimeout(function (context) { return function () { context.detailContext.refreshGui(); }; }(context), 100);

                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    /*
      context:{
      record,
      column,
      formatString,
      minValue,
      maxValue,
      voices,
      value
      }
     */
    this.gridBeginEdit = function (context) {
        var entityName = context.rowEntity.getEntityName();
        switch (entityName) {
            case "MVCustomerSurveyRow":

                var cs = context.rowEntity.getParentEntity();
                var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: context.column.fieldName });
                if (surveyMeasure) {
                    var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
                    for (var i = 0; i < surveyConfig.SurveyAnomalyDetails.length; i++) {
                        var anomaly = surveyConfig.SurveyAnomalyDetails[i];
                        if (anomaly.ANOMALYMEASURE == surveyMeasure.CODMEASURE) {
                            if (anomaly.FLGREADONLY) {
                                var evaluator = SalesExecutionEngine.translateSavedConstraints(surveyConfig, anomaly.SurveyAnomalyGroupFilters);
                                if (evaluator && evaluator(context.rowEntity)) {
                                    context.canceled = true;
                                }
                            }
                        }
                    }
                }
                break;
        }
    };


    this._createSummaryFields = function () {
        var fields = {};

        fields["DESPARTY1"] = { elementName: "field", attrs: { name: "DESPARTY1", editable: "false" }, children: [] };
        fields["DESLOC1"] = { elementName: "field", attrs: { name: "DESLOC1", editable: "false" }, children: [] };
        fields["DESPRIORITY"] = { elementName: "field", attrs: { name: "DESPRIORITY", editable: "false" }, children: [] };
        fields["DTEVISIT"] = { elementName: "field", attrs: { name: "DTEVISIT", editable: "false" }, children: [] };
        fields["STR_TIME_HOURVISIT"] = { elementName: "field", attrs: { name: "STR_TIME_HOURVISIT", editable: "false" }, children: [] };
        fields["VISIT_SUMMARY"] = { elementName: "field", attrs: { name: "VISIT_SUMMARY", editable: "false" }, children: [] };
        fields["INFO_SUMMARY"] = { elementName: "field", attrs: { name: "INFO_SUMMARY", editable: "false" }, children: [] };
        fields["CONTACTS_SUMMARY"] = { elementName: "field", attrs: { name: "CONTACTS_SUMMARY", editable: "false" }, children: [] };
        fields["ATTACH_SUMMARY"] = { elementName: "field", attrs: { name: "ATTACH_SUMMARY", editable: "false" }, children: [] };
        fields["PHOTO_SUMMARY"] = { elementName: "field", attrs: { name: "PHOTO_SUMMARY", editable: "false" }, children: [] };
        fields["YAMMER_SUMMARY"] = { elementName: "field", attrs: { name: "YAMMER_SUMMARY", editable: "false" }, children: [] };

        //if default activity has a linked dash
        if (SalesExecutionEngine.surveyHasLinkedDashboard(UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST"))) {
            var dashName = SalesExecutionEngine.getSurveyDashName(UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST"));
            fields[dashName] = { elementName: "field", attrs: { name: dashName, editable: "false" }, children: [] };
        }

        return fields;
    };

    this.getCustomLayout = function (layout, detailContext) {

        try {

            var self = this;

            switch (detailContext.entityName) {
                case "MVCustomerSurvey":
                    {
                        var codTypSurvey = detailContext.entity.get("CODTYPSURVEY");
                        var surveyMeasureConfigs = SalesExecutionEngine.getOrderedSurveyMeasureConfig(codTypSurvey);
                        var activityType = SalesExecutionEngine.getActivityType(codTypSurvey);
                        var surveyConfig = SalesExecutionEngine.getSurveyConfig(codTypSurvey);

                        if (surveyMeasureConfigs && surveyConfig && activityType) {

                            //Build customer survey header
                            if (layout.children[0]) {
                                var mainSection = layout.children[0];
                                if (this._hasSideTabBar(detailContext.entity)) {
                                    mainSection.attrs["startExpanded"] = "fixed";
                                }
                                else if (surveyConfig["FLGCOLLAPSED"] == true || XApp.isPhone()) {
                                    mainSection.attrs["startExpanded"] = "false";
                                }
                                else {
                                    mainSection.attrs["startExpanded"] = "true";
                                }

                                mainSection.children = [];
                                mainSection.children.push({
                                    elementName: "field",
                                    attrs: {
                                        name: "DESHQNOTE",
                                        editable: "false",
                                        presType: "textarea"
                                    },
                                    children: []
                                });

                                //Add prep note field if parameter is set
                                if (ParametersDefaultsAndStaticData.getInstance().getPrepNoteVisible()) {
                                    mainSection.children.push({
                                        elementName: "field",
                                        attrs: {
                                            name: "PREPNOTE",
                                            editable: (detailContext.gui.openMode != "VIEW" && (detailContext.gui.getDocument().get("DTEVISIT").toDate() - (new Date()).toDate()) > 0) ? "true" : "false",
                                            presType: "textarea"
                                        },
                                        children: []
                                    });
                                }


                                mainSection.children.push({
                                    elementName: "field",
                                    attrs: {
                                        name: "DESNOTE",
                                        editable: "true",
                                        presType: "textarea"
                                    },
                                    children: []
                                });
                                mainSection.children.push({
                                    elementName: "field",
                                    attrs: {
                                        name: "FLGOBJECTIVE",
                                        editable: "true"
                                    },
                                    children: []
                                });
                                mainSection.children.push({
                                    elementName: "field",
                                    attrs: {
                                        name: "PREVNOTES",
                                        editable: "false",
                                        presType: "textarea"
                                    },
                                    children: []
                                });
                                mainSection.children.push({
                                    elementName: "field",
                                    attrs: {
                                        name: "FLGPREVIOUSOBJECTIVE",
                                        editable: "false"
                                    },
                                    children: []
                                });

                                if (self._showOpportunities(detailContext.gui.getDocument().get("CODPARTY"))) {
                                    mainSection.children.push({
                                        elementName: "field",
                                        attrs: {
                                            name: "CODOPP",
                                            editable: "true",
                                            presType: "qtabs",
                                        },
                                        children: []
                                    });
                                }
                            }

                            if (layout.children[1])
                                layout.children.splice(1, 1);

                            //BUILD LAYOUT FOR ACTIVITY ATTACHMENTS section
                            if (SalesExecutionEngine.isTabVisible(detailContext.entity) && surveyConfig["FLGHIDEATTACHMENTS"] == false) {
                                var attachSection = this.__createDefaultSection__("ACTIVITY_ATTACHMENTS", "ATTACHMENTS");
                                if (attachSection) {
                                    if (this._hasSideTabBar(detailContext.entity)) {
                                        attachSection.attrs["startExpanded"] = "fixed";
                                    }
                                    else {
                                        attachSection.attrs["startExpanded"] = "false";
                                    }
                                    attachSection.attrs["editable"] = (detailContext.gui.openMode == "VIEW") ? "false" : "true";

                                    layout.children.push(attachSection);
                                }
                            }

                            //BUILD LAYOUT FOR ATTACHEMNTS from mission sections
                            if (!XApp.isEmptyOrWhitespaceString(detailContext.entity.get("IDMISSION")) && detailContext.gui.m_missions != null) {
                                var mission = null;

                                for (var i = 0; i < detailContext.gui.m_missions.length; i++) {
                                    if (detailContext.gui.m_missions[i].get("IDMISSION") == detailContext.entity.get("IDMISSION")) {
                                        mission = detailContext.gui.m_missions[i];
                                        break;
                                    }
                                }

                                if (mission != null && mission.getAttachments().length > 0) {
                                    var attachSection = this.__createDefaultSection__("MISSION_ATTACHMENTS", "ATTACHMENTS");
                                    if (attachSection) {
                                        if (this._hasSideTabBar(detailContext.entity)) {
                                            attachSection.attrs["startExpanded"] = "fixed";
                                        }
                                        else {
                                            attachSection.attrs["startExpanded"] = "false";
                                        }
                                        attachSection.attrs["editable"] = "false";
                                        attachSection.Mission = mission;

                                        layout.children.push(attachSection);
                                    }
                                }
                            }

                            //create header measures card section
                            var cardSection = this.__createDefaultSection__("HEADER_MEASURES");
                            if (cardSection) {

                                //build measure fields layout
                                if (surveyMeasureConfigs != undefined && activityType != undefined) {

                                    var headerMeasures = [];
                                    for (var i = 0; i < surveyMeasureConfigs.length; i++) {
                                        if (surveyMeasureConfigs[i]["FLGHEADER"])
                                            headerMeasures.push(surveyMeasureConfigs[i]);
                                    }

                                    var surveyMeasureToProcess;
                                    if (activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER)
                                        surveyMeasureToProcess = surveyMeasureConfigs;
                                    else //if (headerMeasures.length != 0)
                                        surveyMeasureToProcess = headerMeasures;

                                    for (i = 0; i < surveyMeasureToProcess.length; i++) { //iterate SurveyMeasures
                                        var newField = this.__createMeasureField__(surveyMeasureToProcess[i]);
                                        if (newField)
                                            cardSection.children.push(newField);
                                    }
                                }
                                if (cardSection.children.length != 0)
                                    layout.children.push(cardSection);

                                cardSection.attrs["id"] = "HEADER_MEASURES." + detailContext.entity.uniqueID;
                                if (this._hasSideTabBar(detailContext.entity)) {
                                    cardSection.attrs["startExpanded"] = "fixed";
                                }
                            }

                            //-------------------- START: BUILD LAYOUT FOR PRODUCTS GRID -------------------------------
                            if (activityType == SalesExecutionNameSpace.ActivityType.PRODUCT) {

                                //build products grid
                                cardSection = this.__createDefaultSection__("GRID_PRODUCTS", "GRID");
                                if (cardSection) {
                                    cardSection.attrs.addButton = "true";
                                    if (this._hasSideTabBar(detailContext.entity)) {
                                        cardSection.attrs["startExpanded"] = "fixed";
                                        cardSection.attrs["scrollable"] = "true";
                                    }
                                    else {
                                        cardSection.attrs["usePopupOnPhone"] = "true";
                                        if (XApp.isPhone()) {
                                            cardSection.attrs.startExpanded = "false";
                                            cardSection.attrs.scrollable = "true";
                                        }
                                    }

                                    cardSection.attrs.detailObject = "MVCustomerSurveyRow";
                                    cardSection.attrs.searchBar = "true";
                                    cardSection.attrs.editable = (detailContext.gui.openMode == "VIEW") ? "false" : "true";
                                    cardSection.attrs.useLightSenchaEntity = "true";

                                    cardSection.children = [];
                                    /*
                                    <newButtonSelector nav="NAV_MOB_PROD">
                                    </newButtonSelector>
                                    */
                                    var selectorButton = {
                                        elementName: "newButtonSelector",
                                        attrs: { nav: "NAV_MOB_PROD" },
                                        children: []
                                    };
                                    cardSection.children.push(selectorButton);

                                    //right to navigate to PRODUCT gui using DESART column
                                    var prodNav = "NAV_MOB_PROD";
                                    var viewArt = UserContext.checkRight(prodNav, prodNav, 'EDIT') || UserContext.checkRight(prodNav, prodNav, 'VIEW');

                                    //READ COLUMNS WIDTH
                                    var width = 0;

                                    try {
                                        var productCodeColumWidth = parseInt(UserContext.getConfigParam("WIDTHFACTOR_PRODUCTCODE", 2), 10);
                                        var productDescriptionColumWidth = parseInt(UserContext.getConfigParam("WIDTHFACTOR_PRODUCTDES", 4), 10);
                                        var stringColumnWidthFactor = parseInt(UserContext.getConfigParam("WIDTHFACTOR_STRINGCOLUMN", 4), 10);
                                        var numberColumnWidthFactor = parseInt(UserContext.getConfigParam("WIDTHFACTOR_NUMBERCOLUMN", 2), 10);
                                        var checkBoxColumnWidthFactor = parseInt(UserContext.getConfigParam("WIDTHFACTOR_CHKBOXCOLUMN", 1), 10);
                                        var dateColumnWidthFactor = parseInt(UserContext.getConfigParam("WIDTHFACTOR_DATECOLUMN", 2), 10);
                                    } catch (e) {
                                        XLog.logErr("Error parsing product grid column width information from SilverlightGuiModel. Defaults will be used.");
                                    } finally {
                                        productCodeColumWidth = isNaN(productCodeColumWidth) || productCodeColumWidth <= 0 ? 2 : productCodeColumWidth;
                                        productDescriptionColumWidth = isNaN(productDescriptionColumWidth) || productDescriptionColumWidth <= 0 ? 4 : productDescriptionColumWidth;
                                        stringColumnWidthFactor = isNaN(stringColumnWidthFactor) || stringColumnWidthFactor <= 0 ? 4 : stringColumnWidthFactor;
                                        numberColumnWidthFactor = isNaN(numberColumnWidthFactor) || numberColumnWidthFactor <= 0 ? 2 : numberColumnWidthFactor;
                                        checkBoxColumnWidthFactor = isNaN(checkBoxColumnWidthFactor) || checkBoxColumnWidthFactor <= 0 ? 1 : checkBoxColumnWidthFactor;
                                        dateColumnWidthFactor = isNaN(dateColumnWidthFactor) || dateColumnWidthFactor <= 0 ? 2 : dateColumnWidthFactor;
                                    }


                                    //COUNT COLUMNS

                                    //If a measure ART.CODART or ART.DESART exists, the default CODART and DESART measures will not be added. (TOUCH + WEB)
                                    var hasArtDotCodartMeasure = false;
                                    var hasArtDotDesartMeasure = false;
                                    for (var i = 0; i < surveyMeasureConfigs.length; i++) {
                                        if (!hasArtDotCodartMeasure && surveyMeasureConfigs[i].CODMEASURE == ParametersDefaultsAndStaticData.getInstance().getProductMeasurePrefix() + "CODART") {
                                            hasArtDotCodartMeasure = true;
                                        }
                                        if (!hasArtDotDesartMeasure && surveyMeasureConfigs[i].CODMEASURE == ParametersDefaultsAndStaticData.getInstance().getProductMeasurePrefix() + "DESART") {
                                            hasArtDotDesartMeasure = true;
                                        }
                                    }
                                    if (!hasArtDotCodartMeasure)
                                        width = width + productCodeColumWidth;
                                    if (!hasArtDotDesartMeasure)
                                        width = width + productDescriptionColumWidth;

                                    //COUNT PRODUCTATTRIBUTE[x] columns
                                    for (var prodCol = 1; prodCol <= 3; prodCol++) {
                                        if (!XApp.isEmptyOrWhitespaceString(surveyConfig["PRODUCTATTRIBUTE" + prodCol]))
                                            switch (this._getProductBasedStaticColumnType(surveyConfig["PRODUCTATTRIBUTE" + prodCol])) {
                                                case "number":
                                                    width = width + numberColumnWidthFactor;
                                                    break;
                                                case "date":
                                                    width = width + dateColumnWidthFactor;
                                                    break;
                                                case "checkbox":
                                                    width = width + checkBoxColumnWidthFactor;
                                                    break;
                                                default:
                                                    width = width + stringColumnWidthFactor;
                                                    break;
                                            }
                                    }

                                    //COUNT COLUMNS from survey measures
                                    var surveyMeasureToProcess = [];
                                    for (var i = 0; i < surveyMeasureConfigs.length; i++) {
                                        if (!surveyMeasureConfigs[i]["FLGHEADER"] && surveyMeasureConfigs[i].FLGVISIBLE) {
                                            surveyMeasureToProcess.push(surveyMeasureConfigs[i]);

                                            if (surveyMeasureConfigs[i].FIELDNAME.indexOf("STRMEASURE", 0) == 0) {
                                                width = width + (surveyMeasureConfigs[i].COLWIDTHWEIGHT < 1 ? stringColumnWidthFactor : surveyMeasureConfigs[i].COLWIDTHWEIGHT);
                                            } else if (surveyMeasureConfigs[i].FIELDNAME.indexOf("LNGMEASURE", 0) == 0 || surveyMeasureConfigs[i].FIELDNAME.indexOf("DBLMEASURE", 0) == 0) {
                                                width = width + (surveyMeasureConfigs[i].COLWIDTHWEIGHT < 1 ? numberColumnWidthFactor : surveyMeasureConfigs[i].COLWIDTHWEIGHT);
                                            } else if (surveyMeasureConfigs[i].FIELDNAME.indexOf("FLGMEASURE", 0) == 0) {
                                                width = width + (surveyMeasureConfigs[i].COLWIDTHWEIGHT < 1 ? checkBoxColumnWidthFactor : surveyMeasureConfigs[i].COLWIDTHWEIGHT);
                                            } else if (surveyMeasureConfigs[i].FIELDNAME.indexOf("DTEMEASURE", 0) == 0) {
                                                width = width + (surveyMeasureConfigs[i].COLWIDTHWEIGHT < 1 ? dateColumnWidthFactor : surveyMeasureConfigs[i].COLWIDTHWEIGHT);
                                            }
                                        }
                                    }

                                    var baseColumnWidth = 100 / width;

                                    //Create GRID
                                    var grid = {
                                        elementName: "grid",
                                        children: []
                                    };
                                    cardSection.children.push(grid);

                                    //ADD CODART AND DESART columns
                                    if (!hasArtDotCodartMeasure) {
                                        var column = {
                                            elementName: "column",
                                            attrs: {
                                                name: "CODART",
                                                editable: "false",
                                                visibile: "true",
                                                width: (baseColumnWidth * productCodeColumWidth) + "%"
                                            },
                                            children: []
                                        };
                                        grid.children.push(column);
                                    }
                                    if (!hasArtDotDesartMeasure) {
                                        var column = {
                                            elementName: "column",
                                            attrs: {
                                                name: "DESART",
                                                editable: "false", //default
                                                visibile: "true",
                                                width: (baseColumnWidth * productDescriptionColumWidth) + "%",
                                                presType: "string" //default
                                            },
                                            children: []
                                        };
                                        if (viewArt) {
                                            var prodViewRight = UserContext.checkRight("NAV_MOB_PROD", "NAV_MOB_PROD", 'VIEW');
                                            column.attrs["editable"] = "false";
                                            column.attrs["presType"] = prodViewRight ? "hyperlink" : undefined;
                                            column.attrs["handler"] = (this._viewArtColumnHyperLinkClick(detailContext.gui));
                                        }
                                        grid.children.push(column);
                                    }

                                    // ADD the grid activity static column
                                    for (var prodCol = 1; prodCol <= 3; prodCol++) {
                                        if (!XApp.isEmptyOrWhitespaceString(surveyConfig["PRODUCTATTRIBUTE" + prodCol])) {
                                            var widthFactor;
                                            switch (this._getProductBasedStaticColumnType(surveyConfig["PRODUCTATTRIBUTE" + prodCol])) {
                                                case "number":
                                                    widthFactor = numberColumnWidthFactor;
                                                    break;
                                                case "date":
                                                    widthFactor = dateColumnWidthFactor;
                                                    break;
                                                case "checkbox":
                                                    widthFactor = checkBoxColumnWidthFactor;
                                                    break;
                                                default:
                                                    widthFactor = stringColumnWidthFactor;
                                                    break;
                                            }
                                            var column = this._buildProductBasedStaticColumn(surveyConfig["PRODUCTATTRIBUTE" + prodCol], ("PRODUCTATTRIBUTE" + prodCol), (baseColumnWidth * widthFactor));
                                            if (column) {
                                                grid.children.push(column);
                                            }
                                        }
                                    }

                                    //ADD  measure fields columns
                                    for (i = 0; i < surveyMeasureToProcess.length; i++) { //iterate SurveyMeasures
                                        var measure = surveyMeasureToProcess[i];

                                        var column = {
                                            elementName: "column",
                                            attrs: {
                                                name: measure.FIELDNAME,
                                                caption: UserContext.tryTranslate("[" + measure.CODMEASURE + "]")
                                            },
                                            children: []
                                        };


                                        //Special case for ART.DESART column that should be presented as hyperlink to product gui -
                                        //Enhancement #25877: Survey configurator: allow to specify the touch column width for each measure
                                        if (measure.CODMEASURE == ParametersDefaultsAndStaticData.getInstance().getProductMeasurePrefix() + "DESART") {
                                            column.attrs["presType"] = "string";
                                            column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? stringColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            column.attrs["editable"] = "false";

                                            if (viewArt) {
                                                column.attrs["editable"] = "true";
                                                column.attrs["presType"] = "hyperlink";
                                                column.attrs["handler"] = (this._viewArtColumnHyperLinkClick(detailContext.gui));
                                            }
                                        } else
                                            //STREMEASUREs
                                            if (measure.FIELDNAME.indexOf("STRMEASURE", 0) == 0) {

                                                //STRING FIELD with qtabs -> combo 
                                                if (!XApp.isEmptyOrWhitespaceString(measure.CODTAB)) {
                                                    switch (measure.CODPRESENTATIONCONTROL) {
                                                        case SalesExecutionNameSpace.SE_STRMESURE_PRESTYPE.SPINNER:
                                                            column.attrs["presType"] = "spinner";
                                                            break;
                                                        case SalesExecutionNameSpace.SE_STRMESURE_PRESTYPE.COMBO:
                                                            column.attrs["presType"] = "qtabs";
                                                            break;
                                                        default:
                                                            column.attrs["presType"] = "qtabs";
                                                    }

                                                    column.attrs["qtabs"] = measure.CODTAB;
                                                } else {
                                                    column.attrs["presType"] = "string";
                                                }
                                                column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? stringColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            }
                                                //LNGMEASUREs
                                            else if (measure.FIELDNAME.indexOf("LNGMEASURE", 0) == 0) {
                                                column.attrs["presType"] = "int";
                                                if (!XApp.isEmptyOrWhitespaceString(measure.FORMATSTR) && measure.FORMATSTR != "CHECKBOX")
                                                    column.attrs["formatString"] = measure.FORMATSTR;
                                                // }
                                                column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? numberColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            }
                                                //decimal,float field
                                            else if (measure.FIELDNAME.indexOf("DBLMEASURE", 0) == 0) {
                                                column.attrs["presType"] = "decimal";
                                                //set number format
                                                if (!XApp.isEmptyOrWhitespaceString(measure.FORMATSTR) && measure.FORMATSTR != "CHECKBOX")
                                                    column.attrs["formatString"] = measure.FORMATSTR;
                                                //}
                                                column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? numberColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            } else if (measure.FIELDNAME.indexOf("DTEMEASURE", 0) == 0) {
                                                column.attrs["presType"] = "DateTime";
                                                column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? dateColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            } else if (measure.FIELDNAME.indexOf("FLGMEASURE", 0) == 0) {
                                                column.attrs["presType"] = "bool";
                                                column.attrs["width"] = (baseColumnWidth * (measure.COLWIDTHWEIGHT < 1 ? checkBoxColumnWidthFactor : measure.COLWIDTHWEIGHT)) + "%";
                                            }

                                        column.attrs["editable"] = (new Boolean(measure.FLGREADONLY) == false).toString();
                                        // field.fieldContext.config.attrs["visible"] = (new Boolean(surveyConfig.SurveyMeasureDetails[i].FLGVISIBLE) == true).toString();

                                        grid.children.push(column);
                                    }

                                    layout.children.push(cardSection);
                                }
                            }
                            //-------------------END: BUILD LAYOUT FOR PRODUCTS GRID ---------------------------

                            //BUILD LAYOUT FOR QUESTIONNAIRE ACTIVITY - one section for each question , one field for each answear
                            if (activityType == SalesExecutionNameSpace.ActivityType.QUEST) {
                                if (detailContext.entity.questionnaireRows) {
                                    for (var i = 0; i < detailContext.entity.questionnaireRows.getCount() ; i++) {
                                        var questionnairQuestion = detailContext.entity.questionnaireRows.getAt(i);

                                        cardSection = this.__createDefaultSection__("QUESTIONNAIREQUESTION." + questionnairQuestion.get("IDQUESTION").toString());
                                        if (cardSection) {
                                            cardSection.attrs.detailObject = "QuestionnairQuestion";
                                            cardSection.QuestionnairQuestion = questionnairQuestion;
                                            cardSection.attrs.title = questionnairQuestion.get("DESQUESTION");
                                            cardSection.attrs.id = "QUESTIONNAIREQUESTION." + questionnairQuestion.get("IDQUESTION").toString();
                                            cardSection.children = [];
                                            switch (questionnairQuestion.get("CODTYPEANSWER")) {
                                                case "BOOL":
                                                    {
                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "BOOLANSWER",
                                                                editable: "true"
                                                            },
                                                            children: []
                                                        });
                                                        break;
                                                    }
                                                case "NUMBER":
                                                    {
                                                        var xdef = XApp.model.getFieldDef("MVCustomerSurveyQuestionnair", "NUMANSWER");
                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "NUMANSWER",
                                                                editable: "true",
                                                                minVal: questionnairQuestion.get("MINNUMBER"),
                                                                maxVal: questionnairQuestion.get("MAXNUMBER"),
                                                                formatString: xdef.formatString
                                                            },
                                                            children: []
                                                        });
                                                        break;
                                                    }
                                                case "STRING":
                                                    {
                                                        var xdef = XApp.model.getFieldDef("MVCustomerSurveyQuestionnair", "FREEANSWER");
                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "STRANSWER",
                                                                editable: "true",
                                                                maxSize: xdef.size
                                                            },
                                                            children: []
                                                        });
                                                        break;
                                                    }
                                                case "DATE":
                                                    {
                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "DTEANSWER",
                                                                editable: "true"
                                                            },
                                                            children: []
                                                        });
                                                        break;
                                                    }
                                                case "MULTI":
                                                    {
                                                        var xdef = XApp.model.getFieldDef("MVCustomerSurveyQuestionnair", "FREEANSWER");
                                                        //build layout
                                                        for (var a = 0; a < questionnairQuestion.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {

                                                            cardSection.children.push({
                                                                elementName: "field",
                                                                attrs: {
                                                                    name: "MULTIANSWER_" + a.toString(),
                                                                    editable: "true"
                                                                },
                                                                codAnswer: questionnairQuestion.getSubEntityStore("QuestionnairAnswer").getAt(a).get("CODANWSER"),
                                                                children: []
                                                            });
                                                        }

                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "ALTRO",
                                                                editable: "true",
                                                                presType: "textarea",
                                                                maxSize: xdef.size
                                                            },
                                                            children: []
                                                        });
                                                        break;
                                                    }
                                                case "SINGLE":
                                                    {
                                                        var xdef = XApp.model.getFieldDef("MVCustomerSurveyQuestionnair", "FREEANSWER");
                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "SINGLEANSWER",
                                                                editable: "true"
                                                            },
                                                            children: []
                                                        });

                                                        cardSection.children.push({
                                                            elementName: "field",
                                                            attrs: {
                                                                name: "ALTRO",
                                                                editable: "true",
                                                                presType: "textarea",
                                                                maxSize: xdef.size
                                                            },
                                                            children: []
                                                        });
                                                        break;

                                                    }
                                            }
                                            layout.children.push(cardSection);
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                case "MVCustomerSurveyRow":
                    {
                        var mvCustomerSurveyRow = detailContext.entity;
                        var parentCustomerSurvey = mvCustomerSurveyRow.getParentEntity();

                        var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(mvCustomerSurveyRow.get("CODART"), mvCustomerSurveyRow.get("CODDIV")));
                        if (!artRow) {
                            var err = "Product with id CODART: " + mvCustomerSurveyRow.get("CODART") + " for division CODDIV: " + mvCustomerSurveyRow.get("CODDIV") + " not found it PRODUCTS navigator.";
                            XUI.showExceptionMsgBox({ message: err });
                            break;
                        }

                        if (layout.children[0]) {
                            var mainSection = layout.children[0];
                            mainSection.children = [];
                            mainSection.children.push({
                                elementName: "field",
                                attrs: {
                                    name: "DESART",
                                    editable: "false"
                                },
                                children: []
                            });
                            mainSection.children.push({
                                elementName: "field",
                                attrs: {
                                    name: "CODEAN13",
                                    editable: "false"
                                },
                                children: []
                            });
                            mainSection.children.push({
                                elementName: "field",
                                attrs: {
                                    name: "CODART",
                                    editable: "false"
                                },
                                children: []
                            });
                        }

                        var layoutPos = 1;
                        //clear previous cards
                        layout.children.splice(1, layout.children.length - 1);

                        //build new cards containing measures for a customer survey row for each activity that allows the current selected product
                        var customerSurveys = parentCustomerSurvey.getParentEntity().getSubEntityStore("MVCustomerSurvey");
                        for (i = 0; i < customerSurveys.getCount() ; i++) {
                            var customerSurvey = customerSurveys.getAt(i);
                            //check if customer survey accepts product
                            //if it acepts then create custom layout for customer survey row
                            var xcontrs = this._getProductXContraints(customerSurvey, detailContext.gui);
                            var composedConstraints = new XConstraints({
                                logicalOp: 'AND',
                                constraints: [
                     new XConstraints({
                         logicalOp: 'AND',
                         constraints: [new XConstraint("CODART", "=", mvCustomerSurveyRow.get("CODART")),
                         new XConstraint("CODDIV", "=", mvCustomerSurveyRow.get("CODDIV"))
                         ]
                     }),
                                    xcontrs
                                ]
                            });
                            if (XNavHelper.getNavRecord("NAV_MOB_PROD", composedConstraints)) {
                                var codTypSurvey = customerSurvey.get("CODTYPSURVEY");
                                var idSurvey = customerSurvey.get("IDSURVEY");
                                var activityType = SalesExecutionEngine.getActivityType(codTypSurvey);
                                if (activityType == SalesExecutionNameSpace.ActivityType.PRODUCT) {
                                    //create measures card section

                                    //define the section caption for title & icon
                                    var caption = "CUSTOMERSURVEY." + codTypSurvey;
                                    var title = UserContext.tryTranslate("[" + detailContext.gui.guiName + "." + caption + "]");
                                    //create a section by forcing idsurvey as an unique section ID in case multiple instances of same survey are present
                                    var cardSection = this.__createDefaultSection__(caption, "CARD", "CUSTOMERSURVEY."+idSurvey, title);
                                    if (cardSection) {

                                        //Associated survey id (also acts as a marker that this MVCustomerSurveyRow is for a product and not on a header).
                                        //  cardSection.idSurvey = customerSurvey.get("IDSURVEY");

                                        var surveyMeasureConfigs = SalesExecutionEngine.getOrderedSurveyMeasureConfig(codTypSurvey);
                                        if (surveyMeasureConfigs) {

                                            var productMeasures = [];
                                            for (var j = 0; j < surveyMeasureConfigs.length; j++) {
                                                if (!surveyMeasureConfigs[j]["FLGHEADER"])
                                                    productMeasures.push(surveyMeasureConfigs[j]);
                                            }

                                            for (var j = 0; j < productMeasures.length; j++) { //iterate SurveyMeasures
                                                var newField = this.__createMeasureField__(productMeasures[j]);
                                                if (newField)
                                                    cardSection.children.push(newField);
                                            }
                                        }
                                        if (cardSection.children.length != 0) {
                                            layout.children[layoutPos] = cardSection;
                                            layoutPos++;
                                        }

                                        cardSection.attrs["id"] = "CUSTOMERSURVEY." + customerSurvey.uniqueID;
                                        cardSection.PRODUCT_ROW = artRow;
                                        cardSection.MVCustomerSurvey = customerSurvey;

                                        //if the customer survey is the "current" selected customer survey then for sure the product selected is present in the csr detail rows
                                        if (customerSurvey.get("IDSURVEY") == parentCustomerSurvey.get("IDSURVEY")) {
                                            if (this._hasSideTabBar(customerSurvey)) {
                                                cardSection.attrs["startExpanded"] = "fixed";
                                            }
                                            else {
                                                cardSection.attrs["startExpanded"] = 'true';
                                            }
                                            cardSection.MVCustomerSurveyRow = mvCustomerSurveyRow;
                                        } else
                                            //collapse section if product currently selected CSR is not present in the activity
                                        {
                                            var foundCsr;
                                            if ((foundCsr = customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item, index, length) {
                                                return (item.get("CODART") == mvCustomerSurveyRow.get("CODART") && item.get("CODDIV") == mvCustomerSurveyRow.get("CODDIV"));
                                            })) != null) {

                                                if (this._hasSideTabBar(customerSurvey)) {
                                                    cardSection.attrs["startExpanded"] = "fixed";
                                                }
                                                else {
                                                    cardSection.attrs["startExpanded"] = 'true';
                                                }
                                                cardSection.MVCustomerSurveyRow = foundCsr;
                                            } else
                                                cardSection.attrs["startExpanded"] = 'false';
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                case "MobVisit":
                    {
                        switch (detailContext.tabName) {
                            case "VISIT_SUMMARY":
                                {
                                    var clonedLayout = this._removePreviewSections(Ext.clone(layout));

                                    var sections = JsonXmlHelper.selectChildrenByName(clonedLayout, "section");
                                    var visitDetailSections = JsonXmlHelper.filterNodesByAttr(sections, "caption", "VISIT_DETAIL");
                                    if (visitDetailSections.length > 0) {
                                        var visitDetailSection = visitDetailSections[0];

                                        var summaryCardFields = this._createSummaryFields();

                                        var isCustomerActivity = !XApp.isEmptyOrWhitespaceString(detailContext.entity.get("CODPARTY"));
                                        //workaround for correct column calculation
                                        visitDetailSection.children.push(summaryCardFields["DTEVISIT"]);
                                        visitDetailSection.children.push(summaryCardFields["STR_TIME_HOURVISIT"]);
                                        var numberOfColumns = detailContext.getSectionNumberOfColumns(visitDetailSection);
                                        visitDetailSection.children = [];

                                        //with the current algorithm of field layout creation
                                        //it is not possible to define the sequence in configuration
                                        //in order to have summary fields always on the bottom part of this section
                                        if (isCustomerActivity) {
                                            //customer visit layout
                                            if (numberOfColumns == 2) {
                                                visitDetailSection.children.push(summaryCardFields["DESPARTY1"]);
                                                visitDetailSection.children.push(summaryCardFields["DESLOC1"]);
                                                visitDetailSection.children.push(summaryCardFields["VISIT_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["INFO_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["PHOTO_SUMMARY"]);

                                                visitDetailSection.children.push(summaryCardFields["DTEVISIT"]);
                                                visitDetailSection.children.push(summaryCardFields["STR_TIME_HOURVISIT"]);
                                                visitDetailSection.children.push(summaryCardFields["YAMMER_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["CONTACTS_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["ATTACH_SUMMARY"]);
                                            }
                                            else {
                                                visitDetailSection.children.push(summaryCardFields["DESPARTY1"]);
                                                visitDetailSection.children.push(summaryCardFields["DESLOC1"]);
                                                visitDetailSection.children.push(summaryCardFields["DTEVISIT"]);
                                                visitDetailSection.children.push(summaryCardFields["STR_TIME_HOURVISIT"]);
                                                visitDetailSection.children.push(summaryCardFields["VISIT_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["YAMMER_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["INFO_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["CONTACTS_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["ATTACH_SUMMARY"]);
                                                visitDetailSection.children.push(summaryCardFields["PHOTO_SUMMARY"]);
                                            }
                                            //dashboard linked to default activity 
                                            var defaultActivityDash = SalesExecutionEngine.getSurveyDashName(UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST"));
                                            if (summaryCardFields.hasOwnProperty(defaultActivityDash)) {
                                                //should be displayed always last
                                                if (numberOfColumns == 2 && visitDetailSection.children.length % 2 == 0) {
                                                    visitDetailSection.children.splice(visitDetailSection.children.length / 2 + 1, 0, summaryCardFields[defaultActivityDash]);
                                                }
                                                else {
                                                    visitDetailSection.children.push(summaryCardFields[defaultActivityDash]);
                                                }
                                            }
                                        }
                                        else {
                                            //user visit layout
                                            visitDetailSection.children.push(summaryCardFields["DTEVISIT"]);
                                            visitDetailSection.children.push(summaryCardFields["STR_TIME_HOURVISIT"]);
                                            visitDetailSection.children.push(summaryCardFields["DESPRIORITY"]);
                                        }
                                    }

                                    //customer survey preview sections
                                    var previewIndex = 0;
                                    detailContext.entity.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
                                        if (!self._hasPreviewSection(cs)) {
                                            return;
                                        }

                                        clonedLayout.children.push({
                                            elementName: "section",
                                            attrs: {
                                                caption: "SURVEYPREVIEW_" + previewIndex,
                                                startExpanded: "fixed",
                                                type: "CUSTOM",
                                                previewIndex: previewIndex
                                            },
                                            children: [],
                                            text: ""
                                        });

                                        previewIndex++;
                                    });

                                    return clonedLayout;
                                }
                        }
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

        return layout;
    },

    this._isPreviewSection = function (sectionName) {
        return !XApp.isEmptyOrWhitespaceString(sectionName) &&
            sectionName.startsWith("SURVEYPREVIEW_");
    };

    this._hasPreviewSection = function (cs) {
        var surveyType = SalesExecutionEngine.parseSurveyTypeDetail(cs.get("CODTYPSURVEY"));

        return surveyType != SalesExecutionNameSpace.SurveyTypeDetail.ATTACHMENTS &&
            surveyType != SalesExecutionNameSpace.SurveyTypeDetail.CONTACT &&
            cs.get("CODTYPSURVEY") != UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST");
    };

    this._removePreviewSections = function (layout) {

        layout.children = Ext.Array.filter(layout.children, function (layoutItem) {
            return layoutItem.elementName != "section" ||
                !this._isPreviewSection(layoutItem.attrs.caption);
        }, this);

        return layout;
    };

    this._hasSideTabBar = function (cs) {
        //only activities which have a preview section, excluding questionnaires
        var surveyType = SalesExecutionEngine.parseSurveyTypeDetail(cs.get("CODTYPSURVEY"));
        return this._hasPreviewSection(cs) && surveyType != SalesExecutionNameSpace.SurveyTypeDetail.QUEST;
    };


    this._getProductBasedStaticColumnType = function (productAttribute) {

        var context = {
            productAttribute: productAttribute,
            canceled: false,
            type: "string"
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeGetProductBasedStaticColumnType', context);
        if (context.canceled)
            return context.type;

        var dummyCsr = new XEntity({ entityName: "MVCustomerSurveyRow" });
        var xdef = dummyCsr.getFieldDef(productAttribute);
        if (xdef == null)
            return "string";

        switch (xdef.fldType) {
            case "string":
                return "string";
            case "float":
            case "decimal":
            case "int":
            case "long":
                if (productAttribute.startsWith("CUSTCHECKBOX"))
                    return "checkbox";
                else
                    return "number";
            case "bool":
                return "checkbox";
            case "DateTime":
                return "date";
        }
        return "string";
    };

    this._buildProductBasedStaticColumn = function (productAttribute, colName, width) {
        var column = null;

        var dummyCsr = new XEntity({ entityName: "MVCustomerSurveyRow" });
        var xdef = dummyCsr.getFieldDef(productAttribute);
        if (xdef == null)
            return null;

        switch (xdef.fldType) {
            case "string":
                var qtabs = xdef.qtabs;

                if (XApp.isEmptyOrWhitespaceString(qtabs)) {
                    column = {
                        elementName: "column",
                        attrs: {
                            name: productAttribute,
                            caption: UserContext.tryTranslate("[" + colName + "]"),
                            width: width + "%",
                            editable: "false"
                        },
                        children: []
                    };
                } else {
                    column = {
                        elementName: "column",
                        attrs: {
                            name: productAttribute,
                            caption: UserContext.tryTranslate("[" + colName + "]"),
                            width: width + "%",
                            editable: "false",
                            presType: "qtabs",
                            qtabs: qtabs
                        },
                        children: []
                    };
                }
                break;
            case "float":
            case "decimal":
            case "int":
            case "long":
                if (productAttribute.startsWith("CUSTCHECKBOX")) {
                    column = {
                        elementName: "column",
                        attrs: {
                            name: productAttribute,
                            caption: UserContext.tryTranslate("[" + colName + "]"),
                            width: width + "%",
                            editable: "false",
                            presType: "bool"
                        },
                        children: []
                    };
                } else {
                    column = {
                        elementName: "column",
                        attrs: {
                            name: productAttribute,
                            caption: UserContext.tryTranslate("[" + colName + "]"),
                            width: width + "%",
                            editable: "false",
                            presType: xdef.fldType
                        },
                        children: []
                    };
                }
                break;
            case "bool":
            case "DateTime":
                column = {
                    elementName: "column",
                    attrs: {
                        name: productAttribute,
                        caption: UserContext.tryTranslate("[" + colName + "]"),
                        width: width + "%",
                        editable: "false",
                        presType: xdef.fldType
                    },
                    children: []
                };
                break;
        }

        var context = {
            productAttribute: productAttribute,
            colName: colName,
            column: column,
            width: width
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterBuildProductBasedStaticColumn', context);
        return context.column;
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        var entity = fieldContext.sectionContext.entity;
        var entityName = fieldContext.sectionContext.entityName;
        switch (entityName) {
            case "QuestionnairQuestion":
                switch (fieldName) {
                    case "SINGLEANSWER":
                        var newVoices = [];
                        for (var iq = 0; iq < entity.getSubEntityStore("QuestionnairAnswer").getCount() ; iq++) {
                            var answer = entity.getSubEntityStore("QuestionnairAnswer").getAt(iq);
                            newVoices.push({ value: answer.get("CODANWSER"), text: answer.get("DESANSWER") });
                        }
                        fieldContext["voices"] = newVoices;
                        break;
                }
                break;
            case "MVCustomerSurveyPicture":
                switch (fieldName) {
                    case "IDSURVEY":
                        {
                            var newVoices = [];
                            var photoSurveys = fieldContext.sectionContext.gui.m_photoSurveys;
                            for (var iq = 0; iq < photoSurveys.length; iq++) {
                                var cs = photoSurveys[iq];
                                newVoices.push({ value: cs.get("IDSURVEY"), text: cs.get("DesTypSurveyLong") });
                            }
                            fieldContext["voices"] = newVoices;
                            break;
                        }
                }
                break;
            case "MVCustomerSurvey":
                {
                    //remove empty value from qtabs for grid columns where measure is configured as mandatory
                    //!note.. entity for grid is MVCustomerSurvey
                    if (fieldName.indexOf("STRMEASURE") == 0 && !XApp.isEmptyOrWhitespaceString(fieldContext.qtabs)) {
                        var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: entity, fieldName: fieldName });
                        if (surveyMeasure) {
                            if (surveyMeasure.FLGMANDATORY != 0) {
                                //field is mandatory, remove empty qtabs
                                fieldContext.voices.splice(0, 1);
                            }
                        }
                    }
                    if (fieldName == "CODOPP") {
                        var voices = [];
                        var isReadOnly = fieldContext.sectionContext.gui.openMode == "VIEW";
                        var opportunities = XNavHelper.getFromMemoryCache("NAV_MOB_OPPORTUNITIES");
                        var currentAccountConstr, hierConstr;
                        var constraints = new XConstraints({ logicalOp: 'OR' });
                        var codLevel = CommonEngine.getAccountHierLevel(entity.get("CODDIV"), entity.get("CODPARTY"));

                        if (isReadOnly) {
                            currentAccountConstr = new XConstraints({
                                logicalOp: "AND",
                                constraints: [
                                    new XConstraint("CODDIV", SqlRelationalOperator.Equal, entity.get("CODDIV")),
                                    new XConstraint("CODPARTY", SqlRelationalOperator.Equal, entity.get("CODPARTY"))
                                ]
                            });
                        }
                        else {
                            currentAccountConstr = SalesExecutionEngine.buildOpportunitiesInProgressConstr(entity.get("CODDIV"), entity.get("CODPARTY"));
                        }
                        constraints.add(currentAccountConstr);

                        if (!XApp.isEmptyOrWhitespaceString(codLevel)) {
                            if (isReadOnly) {
                                hierConstr = SalesExecutionEngine.buildHierOpportunitiesContr(entity.get("CODDIV"), entity.get("CODPARTY"), codLevel, false);
                            }
                            else {
                                hierConstr = SalesExecutionEngine.buildHierOpportunitiesContr(entity.get("CODDIV"), entity.get("CODPARTY"), codLevel, true);
                                hierConstr.Constraints.push(new XConstraint("WFSTATETYPE", SqlRelationalOperator.NotEqual, CommonNameSpace.WFStateType.End));
                            }
                            constraints.add(hierConstr);
                        }

                        // add empty voice
                        voices.push({ value: "", text: "" });

                        var rows = opportunities.filterByConstraints(constraints);
                        for (var i = 0; i < rows.length; i++) {
                            var row = rows[i];
                            voices.push({ value: row.get("CODOPP"), text: row.get("DESOPP") });
                        }
                        fieldContext["voices"] = voices;
                    }

                    break;
                }
        }
    };

    this.setClosePrepareButtonsState = function (from, entity) {

        var context = {
            canceled: false,
            from: from,
            entity: entity,
            prepareVisitButton: this.prepareVisitButton,
            closeVisitButton: this.closeVisitButton
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeSetClosePrepareButtonsState', context);
        if (context.canceled)
            return;

        if (!this.prepareVisitButton || !this.closeVisitButton)
            return;

        if (!this.readOnly) {
            var dteVisit = new Date(from);
            var currentDte = new Date();
            currentDte.setHours(0, 0, 0, 0);
            currentDte.setDate(currentDte.getDate() + 1);
            var canPrepareVisit = SalesExecutionEngine.canPrepare({ "mobVisit": context.entity });

            //prepareVisitButton visibility
            this.prepareVisitButton.visible = canPrepareVisit;

            //closeVisitButton visibility
            if (dteVisit.getTime() >= currentDte.getTime()) {
                this.closeVisitButton.visible = false;
            }
            else {
                if (entity.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.COMPLETED)
                    this.closeVisitButton.visible = true;
            }
        }
    };

    this.setFieldStatus = function (context) {
        try {
            var self = this;
            var fieldName = context.field.getName();
            var entity = context.field.fieldContext.sectionContext.entity;
            var value = entity.get(fieldName);

            var entityName = context.field.fieldContext.sectionContext.entityName;
            switch (entityName) {
                case "MobVisit":
                    switch (fieldName) {

                        case "DESPARTY1":
                        case "DESADDR1":
                        case "CONTACTMODE":
                            {
                                var codParty = entity.get("CODPARTY");
                                if (XApp.isEmptyOrWhitespaceString(codParty))
                                    context.visible = false;
                                // else
                                //   context.visible = false;
                                break;
                            }

                        case "STR_TIME_HOURVISIT":
                        case "STR_TIME_HOURVISITTO":
                        case "DTEVISIT":
                        case "DTEVISITTO":
                            {
                                var disableVisitMoveRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.DisableVisitMove.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.DisableVisitMove.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.DisableVisitMove.codFunc);
                                if (this.readOnly || disableVisitMoveRight)
                                    context.editable = false;

                                if (this.closeVisitButton && this.prepareVisitButton) {
                                    this.closeVisitButton.visible = false;
                                    this.prepareVisitButton.visible = false;
                                }

                                var values = this._getDteFromAndTo(fieldName, value, entity);

                                if (values.from - values.to >= 0) {
                                    context.valid = false;
                                    return;
                                }

                                delete context.gui.gui.errorReports[fieldName];
                                var canSchedule = SalesExecutionEngine.canReSchedule(values.from, values.to, SalesExecutionEngine.getVisibleVisits(), { mobVisit: entity });
                                if (canSchedule.returnValue == true) {
                                    context.valid = true;
                                    self.setClosePrepareButtonsState(values.from, entity);
                                    return;
                                } else //Show error box with reason
                                {
                                    context.gui.gui.errorReports[fieldName] = { field: context.field, caption: context.field.fieldContext.caption + ": " + canSchedule.message };
                                    context.skipErrorReports = true;
                                    context.valid = false;
                                    return;
                                }
                            }
                        default:
                            //default activity has a linked dashboard, but for some reason doesn t exist in visit (was cancelled) don t show the dash  
                            if (fieldName == SalesExecutionEngine.getSurveyDashName(UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST"))
                                && SalesExecutionEngine.getDefaultActivity(entity) == null) {
                                context.visible = false;
                            }
                    }
                    break;
                case "QuestionnairQuestion":
                    {
                        this._clearError(context.field);

                        //set field error if field was validated and has errorMessages
                        if (entity.errorMessages[fieldName]) {
                            this._setError(context.field, entity.errorMessages[fieldName].messageType);
                        }

                        switch (fieldName) {
                            case "ALTRO":
                                //enabled state of free text field
                                context.visible = false;

                                if (context.gui.gui.openMode != 'VIEW') {
                                    switch (entity.get("CODTYPEANSWER")) {
                                        case "SINGLE":
                                            {
                                                //if  selected answer has FLGALLOWFREETEXT true then freeanswer text field is editable
                                                context.visible = this._questionAnswerAllowsFreetext(entity, entity.get("SINGLEANSWER"));
                                                break;
                                            }
                                        case "MULTI":
                                            {
                                                //if at least one selected answer has FLGALLOWFREETEXT true then freeanswer text field is editable
                                                for (var a = 0; a < entity.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                                                    var ans = entity.getSubEntityStore("QuestionnairAnswer").getAt(a);
                                                    if (entity.get("MULTIANSWER_" + a.toString()) && ans.get("FLGALLOWFREETEXT")) {
                                                        context.visible = true;
                                                        break;
                                                    }
                                                }
                                                break;
                                            }
                                    }
                                }

                                break;
                        }
                        break;
                    }
                case "MVCustomerSurveyRow":

                    if (context && context.field && context.field.fieldContext.sectionContext.entity.detachedFrom != null) {
                        context.editable = false;
                        return;
                    }

                    //entity is MVCustomerSurveyRow
                    var cs = entity.getParentEntity();
                    var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: fieldName });
                    if (surveyMeasure) {
                        this._clearError(context.field);
                        if (entity.errorMessages[surveyMeasure.CODMEASURE]) {
                            this._setError(context.field, entity.errorMessages[surveyMeasure.CODMEASURE].messageType);
                        }

                        //set Highlight
                        var styles = [];
                        var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
                        for (var i = 0; i < surveyConfig.SurveyAnomalyDetails.length; i++) {
                            var anomaly = surveyConfig.SurveyAnomalyDetails[i];
                            if (anomaly.ANOMALYMEASURE == surveyMeasure.CODMEASURE) {
                                if (anomaly.FLGHIGHLIGHT) {

                                    if (styles.indexOf(anomaly.ANOMALYMEASURE) != -1)
                                        continue;

                                    //clear previous color
                                    context.field.setStyle("background: none;");

                                    var input = null;
                                    var inputs = context.field.element.query("input");
                                    if (inputs.length) {
                                        input = inputs[0];
                                        if (input) {

                                            input.style.color = "";
                                            input.style.webkitTextFillColor = "";
                                        }
                                    }

                                    var evaluator = SalesExecutionEngine.translateSavedConstraints(surveyConfig, anomaly.SurveyAnomalyGroupFilters);
                                    if (evaluator) {
                                        if (evaluator(entity))//has anomaly
                                        {
                                            styles.push(anomaly.ANOMALYMEASURE);

                                            if (!XApp.isEmptyOrWhitespaceString(anomaly.CODBGCOLOR))
                                                var background = "background:" + SalesExecutionNameSpace.AnomalyHighlightColors.parse(anomaly.CODBGCOLOR) + ";";
                                            else
                                                var background = "background:" + SalesExecutionNameSpace.AnomalyHighlightColors.DefaultBackground + ";";
                                            context.field.setStyle(background);
                                            if (input) {
                                                if (!XApp.isEmptyOrWhitespaceString(anomaly.CODFGCOLOR))
                                                    var foreground = SalesExecutionNameSpace.AnomalyHighlightColors.parse(anomaly.CODFGCOLOR);
                                                else
                                                    var foreground = SalesExecutionNameSpace.AnomalyHighlightColors.DefaultForeground;

                                                input.style.color = foreground;
                                                input.style.webkitTextFillColor = foreground;
                                            }
                                        }
                                    }
                                }

                                if (anomaly.FLGREADONLY) {
                                    var evaluator = SalesExecutionEngine.translateSavedConstraints(surveyConfig, anomaly.SurveyAnomalyGroupFilters);
                                    if (evaluator && evaluator(entity)) {

                                        context.editable = false;
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    //grid validator
    /*var context = {
    grid: this,
    column: column,
    value: value,
    rec: rec,
    isValid: true,
    isWarning: false,
    classNames: [],
    styles: []
    };*/
    this.setGridFieldStatus = function (context) {
        var rowEntity = context.rec.xrec;

        switch (rowEntity.getEntityName()) {
            case "MVCustomerSurveyRow":
                var fieldName = context.column.fieldName;
                var cs = rowEntity.getParentEntity();
                var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: fieldName });
                if (surveyMeasure) {
                    if (rowEntity.errorMessages[surveyMeasure.CODMEASURE]) {
                        this._setCellError(context, rowEntity.errorMessages[surveyMeasure.CODMEASURE].messageType);

                    }
                    //set Highlight
                    var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
                    for (var i = 0; i < surveyConfig.SurveyAnomalyDetails.length; i++) {
                        var anomaly = surveyConfig.SurveyAnomalyDetails[i];
                        if (anomaly.ANOMALYMEASURE == surveyMeasure.CODMEASURE) {
                            if (anomaly.FLGHIGHLIGHT) {

                                var evaluator = SalesExecutionEngine.translateSavedConstraints(surveyConfig, anomaly.SurveyAnomalyGroupFilters);
                                if (evaluator) {
                                    if (evaluator(rowEntity)) //has anomaly
                                    {
                                        context.styles = "";
                                        if (!XApp.isEmptyOrWhitespaceString(anomaly.CODBGCOLOR))
                                            context.styles = context.styles + "background:" + SalesExecutionNameSpace.AnomalyHighlightColors.parse(anomaly.CODBGCOLOR) + "  !important;";
                                        else
                                            context.styles = context.styles + "background:" + SalesExecutionNameSpace.AnomalyHighlightColors.DefaultBackground + "  !important;";
                                        if (!XApp.isEmptyOrWhitespaceString(anomaly.CODFGCOLOR))
                                            context.styles = context.styles + "color:" + SalesExecutionNameSpace.AnomalyHighlightColors.parse(anomaly.CODFGCOLOR) + "  !important;";
                                        else
                                            context.styles = context.styles + "color:" + SalesExecutionNameSpace.AnomalyHighlightColors.DefaultForeground + " !important;";
                                    }
                                }
                            }

                            if (context.gui.openMode != "VIEW" && anomaly.FLGREADONLY) {
                                var evaluator = SalesExecutionEngine.translateSavedConstraints(surveyConfig, anomaly.SurveyAnomalyGroupFilters);
                                if (evaluator && evaluator(rowEntity)) {
                                    context.column.editable = false;
                                }
                                else
                                    context.column.editable = true;
                            }
                        }
                    }
                }
                break;
        }
    },

this.beforeCallSelector = function (context, selname, config) {
    try {
        //Product selector opened from customer survey
        if (context.entityName == "MVCustomerSurvey" && selname == "NAV_MOB_PROD") {
            var xconstr = this._getProductXContraints(context.entity, context.gui);
            config.hiddenConstraints = xconstr;
        }
    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
},

this.newDetail = function (context) {
    try {
        switch (context.detailEntityName) {
            //add a new product from the selector                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               
            case 'MVCustomerSurveyRow':
                //get product info
                var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(context.selectorKey);
                //try to add the new customer survey row without showing the detail popup
                this._tryAddNewCustomerSurveyRow(context.gui, context.ctrl, artRow, false);

                //stop execution
                return true;
        }
    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
    return true;
},

this.getSectionButtons = function (context) {
    var self = this;
    var sectionName = context.sectionContext.config.attrs["caption"];
    var subEntityName = context.sectionContext.config.attrs["detailObject"];

    switch (context.entityName) {
        //Build ADD/REMOVE buttons on PRODUCT detail used to add/remove a product from an activity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           
        case "MVCustomerSurveyRow":
            {
                if (sectionName.startsWith("CUSTOMERSURVEY.")) {
                    //ONLY product details have MVCustomerSurvey set
                    if (context.sectionContext.config.MVCustomerSurvey) {

                        if (SalesExecutionEngine.isPhotoSurvey(context.sectionContext.config.MVCustomerSurvey) && XApp.isOnline()) {
                            //Add TAKE PHOTO button
                            var params = {
                                gui: context.gui,
                                CODART: context.sectionContext.config.PRODUCT_ROW.get("CODART"),
                                CODDIV: context.sectionContext.config.PRODUCT_ROW.get("CODDIV"),
                                FLGCOMPETITOR: context.sectionContext.config.PRODUCT_ROW.get("FLGCOMPETITOR"),
                                MVCustomerSurvey: context.sectionContext.config.MVCustomerSurvey,
                                detailContext: context.detailContext
                            };
                            var button = {
                                msg: UserContext.tryTranslate("[MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE]"),
                                iconCls: 'guis_visit_sectionmenu_take_photo_30x17',
                                handler: (function (params) {
                                    return function (button) {
                                        //close detail
                                        params.detailContext.closeDetail();
                                        //switch to PHOTOS tab
                                        params.gui.tabPanel.setActiveItem(params.gui.tabSubDetailsByName["PHOTOS"]);

                                        //open take picture popup
                                        if (XApp.environment.isChrome)
                                            self._takeCustomerSurveyPicture(params);
                                        else
                                            self._uploadCustomerSurveyPicture(params); //for ios
                                    };
                                })(params),
                                code: "TAKE_CUSTOMERSURVEY_PICTURE",
                                id: context.panel.id + '-takepicture',
                                scope: this,
                                entityName: subEntityName,
                            };

                            context.buttons.push(button);
                        }

                        //ADD "ADD/REMOVE" buttons for product
                        var button = {
                            msg: UserContext.tryTranslate("[MOBVISIT.ADD_PRODUCT]"),
                            iconCls: "guis_visit_sectionmenu_add_product_30x17",
                            handler: (function (caller, context) {
                                return function () { caller._addProductToCustomerSurvey(context, false); };
                            })(self, context.sectionContext),
                            code: "ADD_PRODUCT",
                            id: context.panel.id + '-addproduct',
                            scope: this,
                            sectionContext: context.sectionContext
                        };
                        context.buttons.push(button);

                        button = {
                            msg: UserContext.tryTranslate("[MOBVISIT.REMOVE_PRODUCT]"),
                            iconCls: "guis_visit_sectionmenu_remove_product_30x17",
                            handler: (function (caller, context) {
                                return function () { caller._removeProductToCustomerSurvey(context); };
                            })(self, context.sectionContext),
                            code: "REMOVE_PRODUCT",
                            id: context.panel.id + '-removeproduct',
                            scope: this,
                            sectionContext: context.sectionContext
                        };
                        context.buttons.push(button);
                    }
                }

                break;
            }
        case "MVCustomerSurvey":
            {
                if (sectionName == "CUSTOMERSURVEY_HEAD") {

                    if (this.hasEditRight && UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codFunc)) {

                        //ADD cancel button
                        var cancel = {
                            msg: UserContext.tryTranslate("[MOBVISIT.CANCEL]"),
                            iconCls: "guis_visit_sectionmenu_cancel_30x17",
                            handler: (function (gui, customerSurvey) {
                                return function () {

                                    self._createAnnCausePopup(gui, customerSurvey); //do cancel
                                };
                            })(context.gui, context.entity),
                            scope: this,
                            entityName: subEntityName,
                            code: "CANCEL_SURVEY",
                            id: context.panel.id + '-cancel'
                        };
                        context.buttons.push(cancel);
                    }
                    if (this.hasEditRight && UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codFunc)) {

                        //ADD suspend button only for autocreated
                        var suspend = {
                            msg: UserContext.tryTranslate("[MOBVISIT.SUSPEND]"),
                            iconCls: "guis_visit_sectionmenu_suspend_30x17",
                            handler: (function (gui, customerSurvey) {
                                return function () {
                                    self._saveVisitCoordinatesBeforeCancel([customerSurvey], function () {
                                        self._removeCurrentCustomerSurvey(gui, customerSurvey, false);
                                    });
                                };
                            })(context.gui, context.entity),
                            scope: this,
                            entityName: subEntityName,
                            code: "SUSPEND_SURVEY",
                            id: context.panel.id + '-suspend'

                        };
                        context.buttons.push(suspend);
                    }

                    if (context.entity.isPlanoramaSurvey() && UserContext.getConfigParam("PLANORAMA_ENABLED", "-1") != 0) {
                        if (XApp.environment.isChrome) {
                            //ADD TAKE_PLANORAMA_PICTURE button
                            var takePlanoramaPhoto = {
                                msg: UserContext.tryTranslate("[MOBVISIT.TAKE_PLANORAMA_PICTURE]"),
                                iconCls: "guis_visit_sectionmenu_take_planorama_30x17",
                                handler: (function (gui, detailContext, customerSurvey) {
                                    return function () {
                                        if (customerSurvey.getProductsCount() > 0)
                                            self._takePlanoramaPicture(gui, detailContext, customerSurvey);
                                        else
                                            XUI.showErrorMsgBox(UserContext.tryTranslate("[MOB.NEED_GRID_PRODUCTS]"));
                                    };
                                })(context.gui, context.detailContext, context.sectionContext.entity),
                                scope: this,
                                entityName: subEntityName,
                                code: "TAKE_PLANORAMA_PICTURE",
                                id: context.panel.id + '-takeplanoramapicture'

                            };
                            context.buttons.push(takePlanoramaPhoto);
                        } else {
                            //ADD UPLOAD_PLANORAMA_PICTURE button
                            var uploadPlanoramaPhoto = {
                                msg: UserContext.tryTranslate("[MOBVISIT.UPLOAD_PLANORAMA_PICTURE]"),
                                iconCls: "guis_visit_sectionmenu_upload_planorama_30x17",
                                handler: (function (gui, detailContext, customerSurvey) {
                                    return function () {
                                        if (customerSurvey.getProductsCount() > 0)
                                            self._uploadPlanoramaPicture(gui, detailContext, customerSurvey);
                                        else
                                            XUI.showErrorMsgBox(UserContext.tryTranslate("[MOB.NEED_GRID_PRODUCTS]"));
                                    };
                                })(context.gui, context.detailContext, context.sectionContext.entity),
                                scope: this,
                                entityName: subEntityName,
                                code: "UPLOAD_PLANORAMA_PICTURE",
                                id: context.panel.id + '-uploadplanoramapicture'

                            };
                            context.buttons.push(uploadPlanoramaPhoto);
                        }

                        //ADD PROCESS_PLANORAMA_PICTURE button
                        var processPlanorama = {
                            msg: UserContext.tryTranslate("[MOBVISIT.PROCESS_PLANORAMA]"),
                            iconCls: "guis_visit_sectionmenu_process_planorama_30x17",
                            handler: (function (gui, cs) {
                                return function () {
                                    XUI.showWait();
                                    var visit = gui.getDocument();
                                    //upload the planorama images
                                    PlanoramaEngine.saveTempCollection(visit, function () {
                                        var categoryField = UserContext.getConfigParam("CATEGORY_FIELD", "");
                                        if (cs.getProductsCount() > 0) {
                                            var details = cs.getSubEntityStore("MVCustomerSurveyRow");
                                            cs.set("CODCATEGORY", details.getAt(0).get(categoryField));
                                        }

                                        cs.set("PLANORAMASTATUS", SalesExecutionNameSpace.PlanoramaSM1ProcessingStatus.REQUESTED);
                                        XUI.hideWait();
                                        //save the visit
                                        var savedPlanoramaSurveys = gui.savedPlanoramaSurveys;
                                        gui.saveDocNoConfirmation(function () {
                                            gui.reload();
                                            gui.clearModified();
                                            gui.savedPlanoramaSurveys = savedPlanoramaSurveys;
                                        });
                                    });
                                };
                            })(context.gui, context.sectionContext.entity),
                            scope: this,
                            entityName: subEntityName,
                            code: "PROCESS_PLANORAMA",
                            id: context.panel.id + '-processplanorama'
                        };
                        context.buttons.push(processPlanorama);
                    }

                    //ADD REPORT-DASH button
                    if (app.getSM1Controllers().dash2.getDashConfig("MOB_VISITDETAL_DASH_" + context.sectionContext.entity.get("CODTYPSURVEY"))) {
                        //add report button
                        var reportButton = {
                            msg: UserContext.tryTranslate("[REPORT_DIALOG]"),
                            iconCls: "guis_visit_sectionmenu_report_dash_30x17",
                            handler: (function (gui, customerSurvey) {
                                return function () {
                                    self._showSurveyDash.call(self, gui, customerSurvey);
                                };
                            })(context.gui, context.sectionContext.entity),
                            scope: this,
                            entityName: subEntityName,
                            code: "ACTIVITY_REPORT",
                            id: context.panel.id + '-activityreport'

                        };
                        context.buttons.push(reportButton);
                    }

                    //add view order only for ORDER surveys that have an order associated
                    if (context.sectionContext.entity.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey()) {
                        if (UserContext.checkRight("NAV_MOB_ORDERS", "NAV_MOB_ORDERS", "VIEW") || UserContext.checkRight("NAV_MOB_ORDERS", "NAV_MOB_ORDERS", "EDIT")
                        ) {

                            var orders = SalesForceEngine.getAllOrderNavRows(new XConstraints({
                                logicalOp: 'AND',
                                constraints: [
                                    new XConstraint("IDSURVEY", "=", context.sectionContext.entity.get("IDSURVEY"))
                                ]
                            }));

                            if (orders && orders.length) {
                                var order = orders[0];
                                context.buttons.push({
                                    msg: UserContext.tryTranslate("[MOBVISIT.VIEW_ORDER]"),
                                    iconCls: "guis_visit_sectionmenu_view_order_30x17",
                                    handler: (function (order, gui) {
                                        return function () {
                                            var canHandleOrder = SalesForceEngine.canHandleOrder(order.get("CODTYPORD"));
                                            if (!canHandleOrder.returnValue) {
                                                XUI.showMsgBox({
                                                    msg: canHandleOrder.message,
                                                    icon: canHandleOrder.messageType,
                                                    buttons: 'OK',
                                                    onResult: Ext.emptyFn
                                                });
                                            } else {
                                                //open order gui
                                                gui.saveDocNoConfirmation((function (order) {
                                                    return function () {
                                                        var editRight = UserContext.checkRight("NAV_MOB_ORDERS", "NAV_MOB_ORDERS", "EDIT");
                                                        var key = order.getValueFromName("DOCUMENTKEY");

                                                        XHistory.go({
                                                            controller: app.getSM1Controllers().gui,
                                                            action: 'show',
                                                            docKey: key,
                                                            docName: 'SM1Order',
                                                            guiName: 'mobGuiOrder',
                                                            openMode: editRight ? 'EDIT' : 'VIEW',
                                                            visit: gui.getDocument()
                                                        });
                                                    };
                                                })(order));
                                            }
                                        };
                                    })(order, context.gui),
                                    scope: this,
                                    entityName: subEntityName,
                                    code: "VIEW_ORDER",
                                    id: context.panel.id + '-vieworder'
                                });
                            }
                            else {
                                context.buttons.push({
                                    msg: UserContext.tryTranslate("[MOBVISIT.NEW_ORDER]"),
                                    iconCls: "guis_visit_sectionmenu_new_order_30x17",
                                    handler: (function (gui) {
                                        return function () {
                                            var context = {
                                                gui: gui,
                                                canceled: false
                                            };

                                            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewOrder', context);
                                            if (context.canceled)
                                                return;

                                            self._addOrderActivity(gui);
                                        };
                                    })(context.gui),
                                    entityName: subEntityName,
                                    code: "NEW_ORDER",
                                    id: context.panel.id + '-neworder',
                                    scope: this,
                                });
                            }
                        }
                    }

                    //add view encashment only for ENCASHMENT surveys that have an encashment associated
                    if (context.sectionContext.entity.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey()) {
                        if (UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "VIEW") || UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "EDIT")) {

                            var navData = XNavHelper.getFromMemoryCache('NAV_MOB_ENCBALANCE');
                            if (navData) {
                                var encashment;
                                for (var o = 0; o < navData.Rows.length; o++) {
                                    if (navData.Rows[o].getValueFromName("IDSURVEY") == context.sectionContext.entity.get("IDSURVEY")) {
                                        encashment = navData.Rows[o];
                                        break;
                                    }
                                }
                                if (encashment) {

                                    context.buttons.push({
                                        msg: UserContext.tryTranslate("[MOBVISIT.VIEW_ENCASHMENT]"),
                                        iconCls: "guis_visit_sectionmenu_view_encashment_30x17",
                                        handler: (function (encashment, gui) {
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
                                                        codparty: encashment.get("CODPARTY"), //should be present in NAV_MOB_ENCBALANCE
                                                        dteenc: encashment.get("DTEENC"), //should be present in NAV_MOB_ENCBALANCE
                                                        encashmentGuiOpenMode: CommonNameSpace.EncashmentGuiOpenMode.EncashmentReadOnly
                                                    },
                                                    openMode: editRight ? 'EDIT' : 'VIEW'
                                                });
                                            };
                                        })(encashment, context.gui),
                                        scope: this,
                                        entityName: subEntityName,
                                        code: "VIEW_ENCASHMENT",
                                        id: context.panel.id + '-viewencashment',

                                    });
                                }
                                else {
                                    context.buttons.push({
                                        msg: UserContext.tryTranslate("[MOBVISIT.NEW_ENCASHMENT]"),
                                        iconCls: "guis_visit_sectionmenu_new_encashment_30x17",
                                        handler: (function (gui) {
                                            return function () {
                                                var context = {
                                                    gui: gui,
                                                    canceled: false
                                                };
                                                XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeNewEncashment', context);
                                                if (context.canceled)
                                                    return;

                                                self._createNewEncashmentActivity(gui);

                                            };
                                        })(context.gui),
                                        code: "NEW_ENCASHMENT",
                                        id: context.panel.id + '-newencashment',
                                        scope: this,
                                        entityName: subEntityName,
                                    });
                                }
                            } else
                                XLog.logWarn("Missing NAV_MOB_ENCBALANCE navigator.");
                        }
                    }

                    var hasSimplePrintRight = UserContext.checkRight("MISSN", "MISSN", "SIMPLEPRINT");
                    var hasFullPrintRight = UserContext.checkRight("MISSN", "MISSN", "FULLPRINT");

                    if (hasSimplePrintRight || hasFullPrintRight) {
                        var reportButtonOptions = [];
                        reportButtonOptions.push('CANCEL');
                        reportButtonOptions.push('->');
                        if (hasSimplePrintRight)
                            reportButtonOptions.push('SIMPLE_PRINT');
                        if (hasFullPrintRight)
                            reportButtonOptions.push('FULL_PRINT');

                        var reportButton = {
                            msg: UserContext.tryTranslate("[MOBVISIT.REPORT]"),
                            id: context.panel.id + '-report',
                            iconCls: "guis_visit_sectionmenu_report_30x17",
                            visible: XApp.isOnline(),
                            handler: (function (gui, survey, buttons) {
                                return function () {
                                    XUI.showMsgBox({
                                        title: UserContext.tryTranslate("[MOBVISIT.REPORT]"),
                                        msg: UserContext.tryTranslate("[MOBVISIT.SELECT_ACTIVITY_PRINT_TYPE]"),
                                        buttons: buttons.join('|'),
                                        onResult: function (printOption) {
                                            switch (printOption) {
                                                case 'SIMPLE_PRINT':
                                                case 'FULL_PRINT':
                                                    {
                                                        var printType;
                                                        if (printOption == 'SIMPLE_PRINT')
                                                            printType = 'SimplePrint';
                                                        else
                                                            printType = 'FullPrint';

                                                        gui.saveDocNoConfirmation(function () {
                                                            XUI.hideWait();
                                                            gui.reload();
                                                            gui.clearModified();

                                                            if (!XApp.isEmptyOrWhitespaceString(survey.get("IDSURVEY")) &&
                                                                !XApp.isEmptyOrWhitespaceString(survey.get("CODUSR"))) {

                                                                //get the  report url
                                                                var reportUrl = SalesExecutionEngine.getActivityReportUrl(survey.get("CODUSR"),
                                                                    survey.get("IDSURVEY"),
                                                                    printType);

                                                                //chrome behaviour:
                                                                //if the document need not be saved, opens report in a new tab
                                                                //if the document is saved, opens report in a popup
                                                                //conclusion:
                                                                //always force chrome to open report in a popup
                                                                if (XApp.environment.isChrome) {
                                                                    setTimeout(function () {
                                                                        window.open(reportUrl);
                                                                    }, 10);
                                                                } else {
                                                                    XApp.openURL(reportUrl);
                                                                }

                                                            }
                                                        });
                                                    }
                                                    break;
                                            }
                                        }
                                    });
                                };
                            })(context.gui, context.entity, reportButtonOptions),
                        }
                        context.buttons.push(reportButton);
                    }

                    if (this.hasEditRight) {
                        //ADD Take Photo button
                        if (SalesExecutionEngine.isPhotoSurvey(context.sectionContext.entity)) {
                            //Add TAKE PHOTO button
                            var params = {
                                gui: context.gui,
                                MVCustomerSurvey: context.sectionContext.entity
                            };
                            var button = {
                                msg: UserContext.tryTranslate("[MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE]"),
                                iconCls: 'guis_visit_sectionmenu_take_photo_30x17',
                                handler: (function (params) {
                                    return function (button) {
                                        //switch to PHOTOS tab
                                        params.gui.tabPanel.setActiveItem(params.gui.tabSubDetailsByName["PHOTOS"]);
                                        if (XApp.environment.isChrome)
                                            self._takeCustomerSurveyPicture(params);
                                        else
                                            self._uploadCustomerSurveyPicture(params);
                                    };
                                })(params),
                                scope: this,
                                entityName: subEntityName,
                                code: "MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE",
                                id: context.panel.id + '-takepicture',

                            };

                            context.buttons.push(button);
                        }
                    }
                }

                if (sectionName == "MISSION_ATTACHMENTS") {
                    //remove all the buttons from the section
                    context.buttons.splice(0, context.buttons.length);
                }
                break;
            }
        case "MobVisit":
            {
                if (this.hasEditRight && sectionName == "CUSTOMERSURVEYPCITURES") {
                    var gui = context.gui;
                    //ADD TAKE_PHOTO button 
                    var params = { gui: gui };

                    var button = {
                        iconCls: "guis_visit_sectionmenu_upload_30x17",
                        msg: UserContext.tryTranslate("[MOBVISIT.UPLOAD_IMAGE]"),
                        handler: (function (params) {
                            return function (button) {
                                self._uploadCustomerSurveyPicture(params);
                            };
                        })(params),
                        entityName: subEntityName,
                        code: "MOBVISIT.UPLOAD_IMAGE",
                        id: context.panel.id + '-uploadimage',
                        scope: this
                    };
                    context.buttons.push(button);

                    if (XApp.environment.isChrome) {
                        var button = {
                            iconCls: 'guis_visit_sectionmenu_take_photo_30x17',
                            msg: UserContext.tryTranslate("[MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE]"),
                            handler: (function (params) {
                                return function (button) {
                                    self._takeCustomerSurveyPicture(params);
                                };
                            })(params),
                            entityName: subEntityName,
                            code: "MOBVISIT.TAKE_CUSTOMERSURVEY_PICTURE",
                            id: context.panel.id + '-takepicture',
                            scope: this
                        };
                        context.buttons.push(button);
                    }

                }
                break;
            }
    }
    XUI.cleanNonContextualBtns(context.buttons);
},

this.validateField = function (context) {
    var fieldName = context.field.getName();
    var entity = context.field.fieldContext.sectionContext.entity;
    var entityName = context.field.fieldContext.sectionContext.entityName;
    switch (entityName) {
        case "MVCustomerSurveyRow":
            if (fieldName.indexOf("DBLMEASURE") == 0 || fieldName.indexOf("LNGMEASURE") == 0)
                context.newVal = UserContext.stringToNumber(context.newVal);

            var cs = entity.getParentEntity();

            var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: fieldName });
            if (surveyMeasure) {

                //set decimals for DBLMEASURE s with FORMATSTR
                //#Bug 31643 : Ticket#2014061210000163 — Visit - Activity of type Product - When you type the same value in a cell, the last digits are not considered as decimals
                if (!surveyMeasure.FLGHEADER && fieldName.indexOf("DBLMEASURE") == 0 && !XApp.isEmptyOrWhitespaceString(surveyMeasure.FORMATSTR) && surveyMeasure.FORMATSTR != "CHECKBOX") {
                    var valueWithDecimals = SalesExecutionEngine.setDecimals(context.field.getStrValue(), surveyMeasure.FORMATSTR);
                    context.newVal = valueWithDecimals;
                }

                this._onManualMeasureChanged(cs, entity, surveyMeasure);
            }

            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
            //ORDER MANAGEMENT 
            // Clear noordercasue field when YES is selected in ordertaken field
            if (surveyConfig && cs.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey() && fieldName == SalesExecutionEngine.getOrderTakenFieldName(surveyConfig)) {
                if (context.newVal == SalesExecutionNameSpace.YesNoQtab.Yes) {
                    var noOrderCauseFieldName = SalesExecutionEngine.getNoOrderCauseFieldName(surveyConfig);
                    entity.set(noOrderCauseFieldName, "");
                }
            }
            //Encashment MANAGEMENT 
            // Clear noencashmentcasue field when YES is selected in ordertaken field
            if (surveyConfig && cs.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey() && fieldName == SalesExecutionEngine.getEncashmentTakenFieldName(surveyConfig)) {
                if (context.newVal == SalesExecutionNameSpace.YesNoQtab.Yes) {
                    var fn = SalesExecutionEngine.getNoEncashmentCauseFieldName(surveyConfig);
                    entity.set(fn, "");
                }
            }

            break;
        case "QuestionnairQuestion":
            {
                switch (fieldName) {
                    case "NUMANSWER":
                        if (context.newVal && context.newVal != "") {
                            context.newVal = context.newVal - 0;
                        } else
                            context.newVal = 0;
                        break;
                    case "DTEANSWER":
                        if (context.newVal && context.newVal != "") {
                            context.newVal = new Date(context.newVal).toDate();
                        }
                        break;
                }
                break;
            }
    }
    return true;
},

this.refreshHourFields = function (entity, fields, fieldName) {
    //initializations
    var hourFromField = fields.STR_TIME_HOURVISIT;
    var hourToField = fields.STR_TIME_HOURVISITTO;

    var dtevisit = fields.DTEVISIT.getValue();
    var dtevisitto = fields.DTEVISITTO.getValue();

    //cases
    switch (fieldName) {
        case "DTEVISIT":
            if (dtevisit > dtevisitto) {
                dtevisitto = new Date(dtevisit);
                entity.set("DTEVISITTO", dtevisitto);
            }
            break;
        case "DTEVISITTO":
            if (dtevisit > dtevisitto) {
                dtevisit = new Date(dtevisitto);
                entity.set("DTEVISIT", dtevisit);
            }
            break;
        case "STR_TIME_HOURVISIT":
            if (dtevisit < dtevisitto)
                hourToField.setOptions(this._endOptions);
            else {
                var start = hourFromField.getSelectedRecord().data;
                var end = start.add(TimeSpan.fromMinutes(ParametersDefaultsAndStaticData.getInstance().getOrganizerStepMin()));
                var endValue = null;
                var endDifference = Number.MAX_VALUE;
                var options = this._endOptions.filter(function (option) {
                    if (option.data.getMiliseconds() > start.getMiliseconds()) {
                        var diff = Math.abs(option.data.getMiliseconds() - end.getMiliseconds());
                        if (diff < endDifference) {
                            endValue = option.data.toShortTimeString();
                            endDifference = diff;
                        }
                        return true;
                    }
                });

                var f = hourToField.events.change.listeners[0].fn;
                hourToField.un('change', f);
                hourToField.setOptions(options);
                hourToField.setValue(endValue);
                entity.set("STR_TIME_HOURVISITTO", endValue);
                hourToField.on('change', f);
            }
            break;
    }
},

this.onEditEnding = function (ctrl, fieldName, newValue, oldValue) {

    try {
        var entity = ctrl.fieldContext.sectionContext.entity;
        var entityName = ctrl.fieldContext.sectionContext.entityName;
        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;

        switch (entityName) {
            case "MobVisit":
                {
                    switch (fieldName) {
                        // process visit date time on end edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             
                        case "STR_TIME_HOURVISIT":
                        case "STR_TIME_HOURVISITTO":
                        case "DTEVISIT":
                        case "DTEVISITTO":
                            {
                                this.refreshHourFields(entity, ctrl.fieldContext.sectionContext.detailContext.fields, fieldName);
                                var values = this._getDteFromAndTo(fieldName, newValue, entity);
                                SalesExecutionEngine.rescheduleVisit(entity, values.dteVisit, values.from, values.to);

                                if (fieldName == "STR_TIME_HOURVISIT" || fieldName == "STR_TIME_HOURVISITTO")
                                    entity.set(fieldName, newValue);
                                var canSchedule = SalesExecutionEngine.canReSchedule(values.from, values.to, SalesExecutionEngine.getVisibleVisits(), { mobVisit: entity });
                                if (canSchedule.message != null && canSchedule.skipInfoOkWarn) {

                                    var onResult = (function (entity, oldValue) {
                                        return function (buttonCode) {
                                            switch (buttonCode) {
                                                case 'OK':
                                                    // 
                                                    break;
                                                case 'CANCEL':
                                                    entity.set(fieldName, oldValue);
                                                    if (detailContext) {
                                                        detailContext.refreshControls();
                                                        detailContext.setFieldsStatus();
                                                    }
                                                    break;
                                            }
                                        }
                                    })(entity, oldValue);

                                    XUI.showMsgBox({
                                        title: canSchedule.msgPerDay != null ? "[MOB.SCHEDULE]" : entity.get("DESPARTY1"),
                                        msg: canSchedule.message,
                                        icon: canSchedule.messageType,
                                        buttons: 'CANCEL|OK',
                                        onResult: onResult

                                    });
                                }
                                //set modified
                                //   ctrl.fieldContext.sectionContext.gui.setModified(mobVisit);
                                break;
                            }
                    }
                    break;
                }
            case "MVCustomerSurveyRow":
                {
                    var cs = entity.getParentEntity();
                    //validate measures    
                    this._checkControl(ctrl);

                    var surveyMeasure = SalesExecutionEngine.getSurveyMeasureConfigByFieldName({ customerSurvey: cs, fieldName: fieldName });

                    //Replicate measure values
                    if (surveyMeasure && surveyMeasure.FLGSAMEVALUE) {
                        if (newValue != oldValue) {
                            SalesExecutionEngine.replicateMeasureValue(surveyMeasure, cs, entity.get("CODART"), entity.get("CODDIV"), newValue);
                        }
                    }

                    break;
                }
            case "MVCustomerSurvey":
                {
                    var cs = entity;
                    var visit = cs.getParentEntity();
                    if (fieldName == "CODOPP") {
                        if (cs.get("CODTYPSURVEY") == UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST")) {
                            visit.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
                                if (survey.get("CODTYPSURVEY") != SalesExecutionNameSpace.ActivityType.CONTACT
                                    && survey.get("CODTYPSURVEY") != SalesExecutionNameSpace.ActivityType.ATTACHMENTS) {
                                    survey.set("CODOPP", newValue);
                                }
                            });
                        }
                        else {
                            var defaultActivity = SalesExecutionEngine.getDefaultActivity(visit);
                            if (defaultActivity.get("CODOPP") != newValue)
                                defaultActivity.set("CODOPP", "")
                        }
                    }
                    var notes = entity.getNotes();
                    if (notes)
                        entity.set("NOTES", notes);

                    cs.set("FLGMODIFY", true);
                    break;
                }
            case "QuestionnairQuestion":
                //validate changed field
                this._validateQuestion(entity);
                context.detailContext.entity.set("FLGMODIFY", true);
                //show or hide subquestion based on answer
                if (entity.get("NUMSUBQUESTION") == 0) {
                    var code = entity.get(fieldName);
                    var questions = ctrl.fieldContext.sectionContext.detailContext.entity.questionnaireRows;
                    if (questions) {
                        switch (fieldName) {
                            case "BOOLANSWER":
                                for (var iq = 0; iq < questions.getCount() ; iq++) {
                                    var question = questions.getAt(iq);
                                    if (question.get("NUMQUESTION") == entity.get("NUMQUESTION") && question.get("NUMSUBQUESTION") != 0) {
                                        if (code == true && question.get("CODANSWER") == SalesExecutionNameSpace.YesNoQtab.Yes) {
                                            this._showQuestionSectionElement(ctrl, question, true);
                                        } else if (code == false && question.get("CODANSWER") == SalesExecutionNameSpace.YesNoQtab.No) {
                                            this._showQuestionSectionElement(ctrl, question, true);
                                        } else {
                                            this._showQuestionSectionElement(ctrl, question, false);
                                        }
                                    }
                                }
                                break;
                            case "SINGLEANSWER":
                                {
                                    //show or hide subqestions
                                    for (var iq = 0; iq < questions.getCount() ; iq++) {
                                        var question = questions.getAt(iq);
                                        if (question.get("NUMQUESTION") == entity.get("NUMQUESTION") && question.get("NUMSUBQUESTION") != 0) {
                                            if (code == question.get("CODANSWER")) {
                                                this._showQuestionSectionElement(ctrl, question, true);
                                            } else {
                                                this._showQuestionSectionElement(ctrl, question, false);
                                            }
                                        }
                                    }
                                    //clear free text field if there is no select answear that allows freetext
                                    if (!this._questionAnswerAllowsFreetext(entity, entity.get("SINGLEANSWER"))) {
                                        entity.set("ALTRO", "");
                                    }

                                    break;
                                }
                            default:
                                {
                                    //MULTIANSWERS...
                                    if (fieldName.indexOf("MULTIANSWER") == 0) {
                                        var answers = entity.getMultiAnswer();
                                        //show or hide subqestions
                                        for (var iq = 0; iq < questions.getCount() ; iq++) {
                                            var question = questions.getAt(iq);
                                            if (question.get("NUMQUESTION") == entity.get("NUMQUESTION") && question.get("NUMSUBQUESTION") != 0) {
                                                if (answers.indexOf(question.get("CODANSWER")) != -1) {
                                                    this._showQuestionSectionElement(ctrl, question, true);
                                                } else {
                                                    this._showQuestionSectionElement(ctrl, question, false);
                                                }
                                            }
                                        }
                                        //clear free text field if there is no select answear that allows freetext
                                        var allowsFreeText = false;
                                        for (var a = 0; a < entity.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                                            var ans = entity.getSubEntityStore("QuestionnairAnswer").getAt(a);
                                            if (entity.get("MULTIANSWER_" + a.toString()) && ans.get("FLGALLOWFREETEXT")) {
                                                allowsFreeText = true;
                                                break;
                                            }
                                        }
                                        if (!allowsFreeText)
                                            entity.set("ALTRO", "");

                                        break;

                                    }
                                }
                        }
                    }
                }
                break;
        }
    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
},

this.preNewDocument = function (gui, options) {

    try {

        //When user comes back to this document using history  and the document was already stored in temp  cache
        if (gui.openData && !XApp.isEmptyOrWhitespaceString(gui.openData.docKey))
            return false;

    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
    return true;
},

this.afterNewDocument = function (gui, options) {

    try {
        var mobVisit = gui.getDocument();

        mobVisit.initKey();
        gui.docKey = mobVisit.get("DOCUMENTKEY");
        gui.openData.docKey = mobVisit.get("DOCUMENTKEY");

        //region update visit header info
        if (!XApp.isEmptyOrWhitespaceString(options.context.codParty))
            mobVisit.set("CODPARTY", options.context.codParty);
        mobVisit.set("CODSTATUS", SalesExecutionNameSpace.SurveyStatus.PLANNED);
        mobVisit.setTime(options.context.hourVisit, options.context.hourVisitTo);
        mobVisit.set("CONTACTMODE", options.context.contactMode);
        mobVisit.set("CODUSR", UserContext.CodUsr);
        mobVisit.set("CODVISITCAUSE", options.context.codVisitCause);
        mobVisit.set("CODSTRUCTURE", options.context.codStructure);

        //----Check flag(FLGAUTOCREATED) and type(USER/CUST) of survey ---------
        if (XApp.isEmptyOrWhitespaceString(options.context.codParty)) {
            //#region USER SURVEY
            var codTypSurvey = options.context.codTypSurvey;
            if (codTypSurvey && codTypSurvey != null) {
                //create new user survey
                var obj = SalesExecutionEngine.createNewCustomerSurvey(codTypSurvey, null, null, null);
                // plan customer survey in visit (ADDS to current document)
                SalesExecutionEngine.planCustomerSurvey(obj, mobVisit);
            }
            //#endregion
        } else {
            //#region CUSTOMER VISIT

            //create pending surveys
            if (options.context.pendingSurveys && options.context.pendingSurveys != null && options.context.pendingSurveys.length > 0) {
                // plan customer survey in visit (ADDS to current document)
                for (var i = 0; i < options.context.pendingSurveys.length; i++) {
                    var obj = XDocs.loadEntStore("MVCustomerSurvey", options.context.pendingSurveys[i]).getAt(0);
                    obj.set("CONTACTMODE", options.context.contactMode);
                    SalesExecutionEngine.planCustomerSurvey(obj, mobVisit);
                }
            } else {
                //create default survey selected from nav
                if (options.context.selectedSurveyType && options.context.selectedSurveyType != null) {
                    if (SalesExecutionEngine.isSurveyTypeAvailable(SalesExecutionEngine.getSurveyConfig(options.context.selectedSurveyType), mobVisit)) {
                        var obj = SalesExecutionEngine.createNewCustomerSurvey(options.context.selectedSurveyType, options.context.codParty, options.context.contactMode, options.context.flgSubstitute, options.context.codStructure);
                        // plan customer survey in visit (ADDS to current document)
                        SalesExecutionEngine.planCustomerSurvey(obj, mobVisit);
                    }
                }
            }

            //create default surveys
            var allSurveys = XApp.GlobalData["SURVEYS"];
            for (var i = 0; i < allSurveys.length; i++) {
                if (allSurveys[i].CODTYPDETAIL != SalesExecutionNameSpace.SurveyTypeDetail.USER && SalesExecutionEngine.contactModeFLGLOADDEFAULT(allSurveys[i], options.context.contactMode)) {
                    if (SalesExecutionEngine.isSurveyTypeAvailable(allSurveys[i], mobVisit)) {
                        var obj = SalesExecutionEngine.createNewCustomerSurvey(allSurveys[i].CODTYPSURVEY, options.context.codParty, options.context.contactMode, options.context.flgSubstitute, options.context.codStructure);
                        // plan customer survey in visit (ADDS to current document)
                        SalesExecutionEngine.planCustomerSurvey(obj, mobVisit);
                    }
                }
            }
            //#endregion
        }

        // close GUI with no changes if no  survey was added to the visit.
        if (mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() == 0) {
            XUI.showMsgBox({
                title: "[MOB.SCHEDULE]",
                msg: SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.NO_SURVEYS),
                icon: "ERR",
                buttons: 'OK',
                onResult: function (buttonCode) {
                    //go back to nav
                    XHistory.back();
                }
            });
            return;
        }

        gui.setModified(mobVisit);

        this.afterLoadDocument(gui);

    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }

},

this.afterOpenSubDetail = function (context) {

    //var entityName = context.entityName;
    var entity = context.newEntity;
    switch (entity.getEntityName()) {
        case "MVCustomerSurvey":
            {
                //validate survey
                this._validateSurvey(entity);
                break;
            }
        case "MVCustomerSurveyRow":
            {
                //Alter default layout
                //remove cancel  button
                var popup = context.detailContext._popup;
                if (popup._topToolbar)
                    popup._topToolbar.removeAt(1); //remove cancel button

                //Validate data
                var needsRefresh = false;
                var sections = context.detailContext.sections;
                for (section in sections) {
                    if (section.indexOf("CUSTOMERSURVEY.") == 0) {
                        var section = sections[section];
                        if (section && section.sectionContext) {
                            var csr = section.sectionContext.entity;
                            if (csr && !csr.detachedFrom) {
                                this._validateProduct(csr);
                                needsRefresh = true;
                            }

                        }
                    }
                }
                if (needsRefresh)
                    context.detailContext.refreshGui();

                //update title
                popup.setTitle(this._buildRowDetailTitle(context.detailContext.gui, entity));

                break;
            }
    }
};

    this.afterCloseHandler = function (context) {
        //var entityName = context.entityName;
        var detailContext = context.ctrl.parentCtrl;
        var entity = detailContext.entity;
        switch (entity.getEntityName()) {
            case "MVCustomerSurvey":
                {
                    //refresh detail context controls when right popup closes - needed to update calculated header measures
                    setTimeout(function () { detailContext.refreshGui(); }, 100);
                    break;
                }
        }
    };

    this.preCreateLink = function (context) {
        var entity = context.ctrl.entity,
            tabName = context.ctrl.tabName,
            linkName = context.linkRow.code;

        context.canceled = false;

        switch (tabName) {
            case "PHARMASTUDY":
                switch (linkName) {
                    case "PHARMASTUDY_IN_PROGRESS":
                        if (entity.get("PHARMASTUDY_IN_PROGRESS_SUMMARY") == 0) {
                            context.canceled = true;
                        }
                        else {
                            context.linkRow.hcs = SalesExecutionEngine.buildStudyInProgressConstr(entity.get("CODPARTY"));
                        }
                        break;
                    case "PHARMASTUDY_DONE":
                        if (entity.get("PHARMASTUDY_DONE_SUMMARY") == 0) {
                            context.canceled = true;
                        }
                        else {
                            context.linkRow.hcs = SalesExecutionEngine.buildStudyDoneConstr(entity.get("CODPARTY"));
                        }
                        break;
                }
                break;
            case "VISITLINKS":
                switch (linkName) {
                    case "NAV_MOB_VISIT_OPPORTUNITIES":
                    case "NAV_MOB_VISIT_HIER_OPPORTUNITIES":
                        context.canceled = true; // remove opportunity links inside VISITLINKS tab
                        break;
                }
                break;
            case "OPPORTUNITYLINKS":
                context.linkRow.caption = linkName + ".NAV_MOB_OPPORTUNITIES";

                switch (linkName) {
                    case "NAV_MOB_VISIT_OPPORTUNITIES":
                        context.linkRow.hcs.add("CODWFSTATEHARD", SqlRelationalOperator.NotEqual, SalesForceNameSpace.OpportunityWFHardState.Cancelled);
                        context.linkRow.search = context.ctrl.tabConfig.searchFilter;

                        // clear the value from the tab's configuration because after the tab will be rendered 
                        // the filters will be set when clicking on the summary links
                        delete (context.ctrl.tabConfig.searchFilter);
                        break;
                    case "NAV_MOB_VISIT_HIER_OPPORTUNITIES":
                        var codLevel = CommonEngine.getAccountHierLevel(entity.get("CODDIV"), entity.get("CODPARTY"));
                        if (codLevel == null) {
                            context.canceled = true;
                            return;
                        }
                        context.linkRow.hcs = SalesExecutionEngine.buildHierOpportunitiesContr(entity.get("CODDIV"), entity.get("CODPARTY"), codLevel, true);
                        break;
                    default:
                        context.canceled = true; // remove all other links from Opportunity tab besides opportunity links
                        break;
                }
                break;
        }
    };

    //#endregion
    //#region SAVING LOGIC
    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            if (doc) {

                var localExecutionQueue = new ExecutionQueue();
                var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

                var oldDoc = gui.getDocument();
                gui.docStore.clear();

                gui.docStore.add(doc);

                var docKey = doc.get("DOCUMENTKEY");
                //IMPORTANT: change also document key in configuration that opened this document so that if the dockey changes when navigating from this document and back again, the 
                //correct document is reloaded
                gui.openData.docKey = docKey;
                gui.docKey = docKey;

                //remov all detached surveys (removed or transitioned to pending) from the the visit 
                var transitionedSurveys = doc.getSubEntityStore("MVCustomerSurvey").queryBy(function (cs) {
                    return cs.get("CODSTATUS") != doc.get("CODSTATUS");
                });

                f = (function (doc, gui, caller) {
                    return function () {
                        try {
                            var multipleSurvey = doc.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                                return cs.get("FLGMULTIPLE");
                            });
                            if (multipleSurvey != null) {
                                XNavHelper.refreshNav("NAV_MOB_PENDING_ACT", onFailure, function () {
                                    XNavHelper.loadNavData("NAV_MOB_PENDING_ACT", onFailure, successCallback);
                                });
                            }

                            successCallback();
                        } catch (e) {
                            onFailure(e);
                        }
                    };
                })(doc, transitionedSurveys, gui, this);
                localExecutionQueue.pushHandler(this, f);

                //Process transitioned surveys and update cache if needed
                var f = (function (doc, transitionedSurveys) {
                    return function () {
                        try {

                            //write in cache executed and pending surveys so data is available for preload in new activities
                            for (var i = 0; i < doc.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                                SfaCacheManager.updateCache({
                                    entityName: SfaCacheManagerNamespace.CacheObjects.CUSTOMERSURVEYS,
                                    idSurvey: doc.getSubEntityStore("MVCustomerSurvey").getAt(i).get("IDSURVEY"),
                                    data: doc.getSubEntityStore("MVCustomerSurvey").getAt(i).toJsonObject(),
                                    onFailure: onFailure,
                                    onSuccess: Ext.emptyFn
                                });
                            }

                            //This needs to be here and not in the following IF statement because even in full offline mode the   SalesExecutionEngine.updateCache functions need to see that all 
                            //surveys transitioned from the visit or not.
                            for (var i = 0; i < transitionedSurveys.length; i++) {
                                doc.getSubEntityStore("MVCustomerSurvey").remove(transitionedSurveys[i]);
                            }

                            //When online and not full offline mode the document goes to the server and returns.
                            //The returned version can be written in the local cache as saved on server and without the transitioned data.
                            //When working in full offline mode the visit does not go to the server (even if we have connectivitiy)
                            //This means that we need to keep that document in the local cache with the transitioned data so that data is transported and saved on server when this visit will be synchroninzed /uploaded.
                            //!!! BIG NOTE: The transitioned can be re-used by another visit and this will result in a multiple save when documents will be uploaded to the server.
                            if (XApp.isOnline() && !UserContext.isFullOfflineMode() && !doc.offlineVersion) {

                                if (transitionedSurveys.length > 0) {
                                    //refresh the cache --needed in order to keep the visit document without the transitioned surveys.
                                    //  XDocsCache.remove(docKey);
                                    XDocsCache.saveToLocalCache(docKey, doc.toJsonObject(), XDocsCache.getDocInfo(docKey).hash, true, successCallback,
                                        onFailure);
                                } else
                                    successCallback();
                            }
                            else
                                successCallback(); //continue to next op 

                        } catch (e) {
                            onFailure(e);
                        }
                    };
                })(doc, transitionedSurveys);
                localExecutionQueue.pushHandler(this, f);


                //UPDATE NAV_MOB_VISITS && NAV_MOB_PENDING_ACT && NAV_MOB_ACTIVITIES_SE
                f = (function (doc, transitionedSurveys, gui, caller) {
                    return function () {
                        try {
                            //includes opeartions on NAV_MOB_VISITS navigator for new row, update existing, remove row
                            if (gui.openMode == "NEW")
                                SalesExecutionEngine.updateCache(doc, transitionedSurveys, null, "NEW", onFailure, successCallback);
                            else
                                SalesExecutionEngine.updateCache(doc, transitionedSurveys, caller.navRow, "UPDATE", onFailure, successCallback);

                        } catch (e) {
                            onFailure(e);
                        }
                    };
                })(doc, transitionedSurveys, gui, this);
                localExecutionQueue.pushHandler(this, f);

                f = (function (document, onFailure, successCallback) {
                    return function () {
                        CommonEngine.updateNavMobAttachmentsCust(document, onFailure, successCallback);
                    };
                })(doc, onFailure, successCallback);
                localExecutionQueue.pushHandler(this, f);

                localExecutionQueue.pushHandler(function () {
                    //send all the planorama pictures to the server
                    PlanoramaEngine.saveTempCollection(oldDoc, function () {
                        localExecutionQueue.executeNext();
                    });
                });

                localExecutionQueue.pushHandler(this, onSuccess); //continue with operations after

                localExecutionQueue.executeNext();

            } else {
                onSuccess();
            }
        } catch (e) {
            XLog.logEx(e);
            if (onFailure) onFailure(e);
        }
    },

    this.preSaveDocument = function (gui, doc) {

        if (!gui.closedAsEmpty) {

            // Checks orders, ordersurveys and measures
            this._checkAndUpdateOrdersStatuses(gui);

            // Checks encashments, encashment activities and its measures
            this._checkAndUpdateEncashmentsStatuses(gui);

            //re-calculate calculated measures
            this._checkAndUpdateCalculatedMeasures(gui);

            //perform validation on all customer surveys so anmolies blocking save can be found
            this._validateAll(doc);

            if (gui.saveMode == "NO_CONFIRMATION")
                return true;
        }
        //do not stop save
        return true;
    },

    this.onSaveDocument = function (gui, doc, onSuccess) {
        var self = this;

        //stop the counter for visit duration and update the values
        this._stopVisitDurationCounter(gui._selectedActivityContext);

        //call the handler defined for close visit
        if (this._beforeOnSave)
            this._beforeOnSave();

        if (gui.closedAsEmpty) {

            if (gui.closedAsEmpty.data.length) {
                for (var i = 0; i < gui.closedAsEmpty.data.length; i++) {
                    self._doCancelCustomerSurvey(gui, gui.closedAsEmpty.data[i], gui.closedAsEmpty.isCancel, gui.closedAsEmpty.cause, gui.closedAsEmpty.calledForVisit);
                }
            } else
                self._doCancelCustomerSurvey(gui, gui.closedAsEmpty.data, gui.closedAsEmpty.isCancel, gui.closedAsEmpty.cause, gui.closedAsEmpty.calledForVisit);
        }

        this._prepareVisitForSave(doc);

        var saveTemp = function () {
            CspEngine.saveTempCollection(doc, function () {
                var attachments = doc.MVCustomerSurveyDetailsStore.queryBy(function (survey) {
                    return survey.get("CODTYPSURVEY") == SalesExecutionNameSpace.ActivityType.ATTACHMENTS || (survey.m_attachmentsCollection && survey.m_attachmentsCollection.length > 0);
                });

                if (attachments.length > 0) {
                    var exe = new ExecutionQueue();

                    Ext.Array.forEach(attachments, function (survey) {
                        exe.pushHandler(self, function () {
                            AttachmentsEngine.saveTempCollection(survey, function () {
                                exe.executeNext();
                            });
                        });
                    });

                    exe.pushHandler(self, function () { XApp.exec(onSuccess); });
                    exe.executeNext();
                } else {
                    XApp.exec(onSuccess);
                }
            });
        };

        XUI.showWait();

        if (doc.get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.COMPLETED) {
            SalesExecutionEngine.validateSEBudgets(doc, true, function (response) {
                if (response && response["messages"]) {
                    self.m_budgetValidationMsg = response["messages"];

                    var budgetMessage = self.m_budgetValidationMsg.find(function (msg) {
                        return msg.MessageType == 'ERR';
                    });

                    if (budgetMessage) {
                        XUI.showErrorMsgBox({
                            msg: UserContext.tryTranslate(budgetMessage.Message)
                        });
                        XUI.hideWait();
                        return;
                    }
                }
                saveTemp();

            }, function (e) {
                XUI.hideWait();
            });
        }
        else
            saveTemp();
    },

    this.onSaveCanceled = function (gui) {
        self._beforeOnSave = null;
        //in case of invalid document, reset the PLANORAMASTATUS field
        gui.getDocument().MVCustomerSurveyDetailsStore.each(function (cs) {
            if (cs.get("PLANORAMASTATUS") == SalesExecutionNameSpace.PlanoramaSM1ProcessingStatus.REQUESTED)
                cs.set("PLANORAMASTATUS", "");
        });
        if (gui.closedAsEmpty)
            gui.closedAsEmpty = undefined;
        this._beforeOnSave = undefined;
    },

    this.onDiscardDocument = function (gui, doc, onSuccess) {

        //reset beforeOnSave handler
        this._beforeOnSave = undefined;

        //continue with the default behavior
        return true;
    },

    this.validateDocument = function (detailContext) {
        switch (detailContext.docName) {
            case 'MobVisit':
                {
                    if (this._thereAreErrorsNotify(detailContext)) {
                        {
                            return false;
                        }
                    }
                    break;
                }
        }
        return false;
    },

    this.validateEntity = function (detailContext) {
        switch (detailContext.entityName) {
            case 'MobVisit':
                {
                    if (this._thereAreErrorsNotify(detailContext.gui)) {
                        return false;
                    }
                    break;
                }
        }
        return true;
    },

    this._prepareVisitForSave = function (visit) {

        var context = {
            visit: visit,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePrepareVisitForSave', context);
        if (context.canceled)
            return;

        var self = this;

        var allCustomerSurveys = visit.getSubEntityStore("MVCustomerSurvey").toArray();
        if (visit.detachedCustomerSurveys)
            allCustomerSurveys = allCustomerSurveys.concat(visit.detachedCustomerSurveys);
        for (var i = 0; i < allCustomerSurveys.length; i++) {
            try {

                var cs = allCustomerSurveys[i];

                //add fake product detail back  in  mvcutomersurvey collection
                if (cs.getSubEntityStore("MVCustomerSurveyRow").findBy(function (csr) { return csr.isFakeProduct(); }) == null)
                    if (cs.get("HEADER"))
                        cs.getSubEntityStore("MVCustomerSurveyRow").add(cs.get("HEADER"));

                if (visit.contactActivity) {
                    if (SalesExecutionEngine.parseSurveyTypeDetail(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.SurveyTypeDetail.CONTACT) {
                        self._prepareConcatActivityForSave(visit, cs);
                    }
                }

                if (SalesExecutionEngine.parseSurveyTypeDetail(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.SurveyTypeDetail.QUEST && cs.questionnaireInfo && cs.questionnaireRows) {
                    self._prepareQuestActivityForSave(visit, cs);
                }

            } catch (e) {
                XLog.logEx(e);
            }
        }

        //add all detached surveys (removed or transitioned to pending) back in the visit so they can reach server and be saved
        if (visit.detachedCustomerSurveys && visit.detachedCustomerSurveys.length > 0) {
            visit.getSubEntityStore("MVCustomerSurvey").addAll(visit.detachedCustomerSurveys);
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterPrepareVisitForSave', context);

    },
    //Write back in each CONTACT activity details from merged collection  visit.contactActivity 
    this._prepareConcatActivityForSave = function (visit, cs) {

        var context = {
            visit: visit,
            cs: cs,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePrepareConcatActivityForSave', context);
        if (context.canceled)
            return;

        var entityStore = cs.getSubEntityStore("MVCustomerSurveyContact");
        entityStore.clear();

        for (var i = 0; i < visit.contactActivity.getSubEntityStore("MVCustomerSurveyContact").getCount() ; i++) {
            var xrow = visit.contactActivity.getSubEntityStore("MVCustomerSurveyContact").getAt(i);
            if (xrow.get("ASSOCIATED") == true) {
                var csc = new XEntity({ entityName: "MVCustomerSurveyContact" });
                csc.set("IDSURVEY", cs.get("IDSURVEY"));
                csc.set("CODASSOC", xrow.get("CODASSOC"));
                csc.set("CODPER", xrow.get("CODPER"));
                entityStore.add(csc);
            }
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterPrepareConcatActivityForSave', context);

    };

    //Add answers to customerSurvey questionnaire
    this._prepareQuestActivityForSave = function (visit, cs) {

        var context = {
            visit: visit,
            cs: cs,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePrepareQuestActivityForSave', context);
        if (context.canceled)
            return;

        var self = this;
        var store = cs.getSubEntityStore("MVCustomerSurveyQuestionnair");
        store.clear();
        for (var i = 0; i < cs.questionnaireRows.getCount() ; i++) {
            var qq = cs.questionnaireRows.getAt(i);
            //do not save unresponsed questions
            if (qq && !qq.hidden) {
                var custSurveyQuestionnair = new XEntity({ entityName: "MVCustomerSurveyQuestionnair" });
                custSurveyQuestionnair.set("IDSURVEY", cs.get("IDSURVEY"));
                custSurveyQuestionnair.set("IDQUESTIONNAIRE", qq.get("IDQUESTIONNAIRE"));
                custSurveyQuestionnair.set("IDQUESTION", qq.get("IDQUESTION"));

                switch (qq.get("CODTYPEANSWER")) {
                    case "BOOL":
                        {
                            custSurveyQuestionnair.set("CODANSWER", qq.get("BOOLANSWER") ? SalesExecutionNameSpace.YesNoQtab.Yes : SalesExecutionNameSpace.YesNoQtab.No);
                            break;
                        }
                    case "DATE":
                        {
                            custSurveyQuestionnair.set("DTEANSWER", qq.get("DTEANSWER") ? qq.get("DTEANSWER") : Constants.SM1MINDATE);
                            break;
                        }
                    case "NUMBER":
                        {
                            custSurveyQuestionnair.set("NUMANSWER", qq.get("NUMANSWER"));
                            break;
                        }
                    case "STRING":
                        {
                            custSurveyQuestionnair.set("FREEANSWER", qq.get("STRANSWER"));
                            break;
                        }
                    case "SINGLE":
                        {
                            custSurveyQuestionnair.set("CODANSWER", qq.get("SINGLEANSWER"));
                            custSurveyQuestionnair.set("FREEANSWER", "");
                            if (self._questionAnswerAllowsFreetext(qq, qq.get("SINGLEANSWER"))) {
                                custSurveyQuestionnair.set("FREEANSWER", qq.get("ALTRO"));
                            }
                            break;
                        }
                    case "MULTI":
                        {
                            custSurveyQuestionnair.set("FREEANSWER", "");
                            var codAnswer = "";
                            for (var a = 0; a < qq.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                                var ans = qq.getSubEntityStore("QuestionnairAnswer").getAt(a);
                                if (qq.get("MULTIANSWER_" + a.toString())) {
                                    if (codAnswer == "")
                                        codAnswer = ans.get("CODANWSER");
                                    else
                                        codAnswer += ";" + ans.get("CODANWSER");

                                    if (ans.get("FLGALLOWFREETEXT")) {
                                        custSurveyQuestionnair.set("FREEANSWER", qq.get("ALTRO"));
                                    }
                                }
                            }
                            custSurveyQuestionnair.set("CODANSWER", codAnswer);
                            break;
                        }
                }

                if (!custSurveyQuestionnair.get("CODANSWER"))
                    custSurveyQuestionnair.set("CODANSWER", "");
                if (!custSurveyQuestionnair.get("FREEANSWER"))
                    custSurveyQuestionnair.set("FREEANSWER", "");

                store.add(custSurveyQuestionnair);
            }
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterPrepareQuestActivityForSave', context);
    };

    this._cancelEmptySurvey = function (gui, cs, lat, lng) {
        var self = this;
        var context = {
            gui: gui,
            cs: cs,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCancelEmptySurvey', context);
        if (context.canceled)
            return;

        var activityType = SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY"));
        switch (activityType) {
            case SalesExecutionNameSpace.ActivityType.CUSTOMER:
            case SalesExecutionNameSpace.ActivityType.PRODUCT:
                {
                    if (cs.getSubEntityStore("MVCustomerSurveyRow").getCount() == 0 && !cs.get("HEADER")) {
                        self._setCoordinatesInSurvey(cs, lat, lng);
                        if (self._openDayID)
                            cs.set("IDDAY", self._openDayID);
                        this._doCancelCustomerSurvey(gui, cs, true, ParametersDefaultsAndStaticData.getInstance().getDefault_emptysurvey_anncause(), false);
                    }
                    break;
                }
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCancelEmptySurvey', context);
    },

    this.beforeUiRendering = function (context) {

        var gui = context.gui;

        //reset beforeOnSave handler
        this._beforeOnSave = undefined;

        //gui level flags
        this.n_productCsLoaded = 0; //customizer level flag (does not get reset after gui closure)
        //reset beforeOnSave handler
        this._beforeOnSave = undefined;

        gui.closedAsEmpty = undefined;
        gui.uniqueCounter = 0;
        gui.m_previousSurveysCollection = null;
        gui.autoReloadData = (UserContext.getConfigParam("RELOAD_DATA_NO_CONFIRMATION", "0") != 0);
        gui.b_invalidPersistentCalculatedMeasure = false;
        //Queue of Complex calculated measure beeing calculated (if any)
        gui.m_currentComplexCalculation = [];

        //gui flags
        //initialize the number of activity tabs that the user can see
        gui._visibleActivityTabs = 0;
        //initialize the activity context for the selected activity tab
        gui._selectedActivityContext = null;
        //initialize start time for the counter
        gui._surveyStartTime = null;

        if (gui.executedActivities == undefined)
            gui.executedActivities = {};
        gui.saveVisitButton = undefined;
        this.closeVisitButton = undefined;
        this.prepareVisitButton = undefined;
        gui.reloadVisitButton = undefined;
        gui.cancelVisitButton = undefined;
        gui.suspendVisitButton = undefined;
        gui.newOpportunityButton = undefined;
        gui.newActivityButton = undefined;
        gui.newOrderButton = undefined;
        gui.newEncashmentButton = undefined;
        gui.newOrderCartButton = undefined;
        gui.visitCustomerButton = undefined;
        gui.customerExternalUrlButton = undefined;
        gui.previousVisitPicturesButton = undefined;
        gui.cust = undefined;

        gui.m_missions = [];
        gui.m_divisionAssortments = {};
        gui.m_evalPriceListCollection = {};
        gui.m_assetBalance = new XIndexedCollection();
        gui.m_photoSurveys = undefined;
        gui.m_allCustomerSurveyPictures = undefined;
        gui.m_previousSurveysCollection = undefined;
        gui.closedAsEmpty = undefined;
        gui.b_visitReload = undefined;
        gui.m_budgetValidationMsg = [];

        gui.m_appliableObjectives = [];
        gui.recoveryErrorReports = {};

        if (UserContext.checkRight("NAV_MOB_SE_PHARMASTUDY", "NAV_MOB_SE_PHARMASTUDY", "NAVIGATE") ||
            UserContext.checkRight("NAV_MOB_SE_PHARMASTUDY", "NAV_MOB_SE_PHARMASTUDY", "NAVDATA")) {
            //wait for the nav to be loaded in memory cache
            //because it influences visibility of some ui parts
            context.executeNext = false;
            XNavHelper.loadNavData("NAV_MOB_SE_PHARMASTUDY",
                //failure - continue UI rendering as if there are no studies
                function () { context.queue.executeNext(); },
                //success
                function () { context.queue.executeNext(); });
        }

    },

    this.afterLoadDocument = function (gui) {
        //compute state flags
        this._computeStateFlag(gui);
    };

    this.afterLoad = function (gui) {

        var self = this;
        var entity = gui.getDocument();
        //needed for visit duration counter
        self.initDefaultTabs(gui);

        //keep separate all detached surveys (removed or transitioned to pending) from the the visit 
        var transitionedSurveys = entity.getSubEntityStore("MVCustomerSurvey").queryBy(function (cs) {
            return cs.get("CODSTATUS") != entity.get("CODSTATUS");
        });
        entity.getSubEntityStore("MVCustomerSurvey").removeAll(transitionedSurveys);
        if (!entity.detachedCustomerSurveys)//in case the visit is restored from tempDocumentCache
            entity.detachedCustomerSurveys = transitionedSurveys;

        //update all customer surveys notes description and destypsurvey
        for (var i = 0; i < entity.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var customerSurvey = entity.getSubEntityStore("MVCustomerSurvey").getAt(i);
            self._onAfterCustomerSurveyAdded(customerSurvey, gui);
            self._clearCodOpp(customerSurvey, gui);
        }

        //link nav row with gui
        self.navRow = XNavHelper.getFromMemoryCache("NAV_MOB_VISITS").findByKey(entity.get("DOCUMENTKEY"));

        //link client data with gui
        self._loadCustomer(gui);

        //Process the list of survey anomalies and populate the list of measures that can trriger each one of these anomalies
        self._getSurveysAndPopulateTriggeringMeasures();

        self._loadVisit(gui);

        SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
            if (openDay)
                self._openDayID = openDay.get("IDDAY");
        });

        return true; //keep wait.
    };

    this.getDocumentDescription = function (context) {
        var self = this;
        var doc = context.document;
        if (!doc)
            return "";

        var descriptionParts = [];

        var dateDescription = UserContext.dateToString(doc.get("DTEVISIT"));
        var today = (new Date()).toDate();
        if (doc.get("DTEVISIT").getTime() == today.getTime())
            dateDescription = UserContext.tryTranslate("[MOB.TODAY]");
        else if (doc.get("DTEVISIT").getTime() == today.addDays(-1).getTime())
            dateDescription = UserContext.tryTranslate("[MOB.YESTERDAY]");
        else if (doc.get("DTEVISIT").getTime() == today.addDays(1).getTime())
            dateDescription = UserContext.tryTranslate("[MOB.TOMORROW]");

        //it is a customer visit: show customer description
        if (!XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY"))) {
            var isDoctor = CommonEngine.isDoctor(doc.get("CODPARTY"));
            if (isDoctor) {
                var cust = context.gui.cust;
                if (cust && !XApp.isEmptyOrWhitespaceString(cust.get("DESTITLE"))) {
                    descriptionParts.push(cust.get("DESTITLE"));
                }
                if (!XApp.isEmptyOrWhitespaceString(doc.get("DESPARTY1"))) {
                    descriptionParts.push(doc.get("DESPARTY1"));
                }
                descriptionParts.push("( " + doc.get("CODPARTY") + " )");
                if (!XApp.isEmptyOrWhitespaceString(doc.get("DESLOC1"))) {
                    descriptionParts.push("| " + doc.get("DESLOC1"));
                }
            }
            else {
                if (!XApp.isEmptyOrWhitespaceString(doc.get("DESPARTY1"))) {
                    descriptionParts.push(doc.get("DESPARTY1"));
                }

                if (!XApp.isEmptyOrWhitespaceString(doc.get("DESLOC1"))) {
                    descriptionParts.push("( " + doc.get("DESLOC1") + " )");
                }
                descriptionParts.push(dateDescription);
            }

            return descriptionParts.join(" ");
        }

        //it is an user activity: show activity description
        var userActivity = doc.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
            return self._hasPreviewSection(cs);
        });

        if (userActivity)
            descriptionParts.push(userActivity.get("DESTYPSURVEY"));
        descriptionParts.push(dateDescription);
        return descriptionParts.join(" ");
    };

    //#endregion
    this._loadVisit = function (gui) {

        var self = this;
        var f;

        var visit = gui.getDocument();

        XUI.showWait();

        var failureCallback = function (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        };

        var localExecutionQueue = new ExecutionQueue();

        var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

        //Customizer support
        localExecutionQueue.pushHandler(self, function () {
            var context = {
                controller: self,
                gui: gui,
                localExecutionQueue: localExecutionQueue,
                onSuccess: successCallback,
                onFailure: failureCallback,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeLoadVisit', context);
            if (!context.canceled)
                successCallback();
        });

        // Load pending autoincluded surveys
        if (gui.openMode != "VIEW" && visit.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.COMPLETED) {
            f = (function (gui) {
                return function () {
                    self._loadPendingAutoincludedSurveys(gui, failureCallback, successCallback);
                };
            })(gui);
            localExecutionQueue.pushHandler(this, f);
        }

        f = (function (gui) {
            return function () {
                self._cacheMissions(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._cacheAssortments(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._cachePriceList(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._cacheAssets(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._loadContactDetails(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._loadCustomerSurveys(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._loadAllCustomerSurveyPictures(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                SalesExecutionEngine._loadAllNotes(gui.getDocument(), failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._checkAndUpdateCalculatedMeasures(gui);
                localExecutionQueue.executeNext();
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._afterVisitLoaded(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        //start the planorama background process
        localExecutionQueue.pushHandler(this, function () {
            if (gui.openMode == "EDIT" && UserContext.getConfigParam("PLANORAMA_ENABLED", "-1") != 0)
                self._startPlanoramaBackgroundProcess(gui);
            localExecutionQueue.executeNext();
        });

        //Check if mandatory payment must be created
        f = (function (gui) {
            return function () {
                var mandatoryPaymentDocNumber = self._createMandatoryPayment(gui);
                if (!XApp.isEmptyOrWhitespaceString(mandatoryPaymentDocNumber)) {
                    localExecutionQueue.clear();
                    self._createNewEncashmentActivity(gui, mandatoryPaymentDocNumber); //add encashment activity, saves, and redirects to encashment gui
                }
                else
                    localExecutionQueue.executeNext();
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        //add BarcodeScaner listener
        localExecutionQueue.pushHandler(this, function () {
            BarcodeScanner.addListener(this._getBarcodeScannedHandler(gui), this);
            localExecutionQueue.executeNext();
        });

        //Customizer support
        localExecutionQueue.pushHandler(self, function () {
            var context = {
                controller: self,
                gui: gui,
                localExecutionQueue: localExecutionQueue,
                onSuccess: successCallback,
                onFailure: failureCallback,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterLoadVisit', context);
            if (!context.canceled)
                successCallback();
        });

        localExecutionQueue.pushHandler(XUI, XUI.hideWait);
        localExecutionQueue.executeNext();
    },

    this._loadCustomerSurveys = function (gui, failureCallback, endCallback) {

        var self = this;

        var visit = gui.getDocument();
        var localExecutionQueue = new ExecutionQueue();
        var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

        //load or reload data
        for (var i = 0; i < visit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var customerSurvey = visit.getSubEntityStore("MVCustomerSurvey").getAt(i);
            var activityType = SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"));
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
            var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));

            //load objective data - must be done before the customer surveys load data so new detail records take values from objectives
            f = (function (gui, customerSurvey) {
                return function () {
                    self._loadObjectives(customerSurvey, gui, failureCallback, successCallback);
                };
            })(gui, customerSurvey);
            localExecutionQueue.pushHandler(self, f);

            //load data
            switch (activityType) {
                case SalesExecutionNameSpace.ActivityType.CUSTOMER:
                    {
                        if (surveyConfig.length != 0) {
                            //If there are no details reload from product table the fake product for a customer survey
                            if ((customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() == 0 && !customerSurvey.get("HEADER")) || gui.autoReloadData) {
                                f = (function (gui, context, customerSurvey, failureCallback, successCallback) {
                                    return function () {
                                        context._reloadSurveyData(gui, customerSurvey, failureCallback, successCallback);
                                    };
                                })(gui, self, customerSurvey, failureCallback, successCallback);
                                localExecutionQueue.pushHandler(this, f);
                            } else {
                                var completedHandler = (function (gui, context, cs, onSuccess) {
                                    return function () {
                                        context._buildCustomerActivityDetails(cs, gui);
                                        onSuccess();
                                    };
                                })(gui, self, customerSurvey, successCallback);

                                //load all previous surveys needed to populate articles that can be added later by the user 
                                f = (function (gui, context, customerSurvey, failureCallback, completedHandler) {
                                    return function () { context._loadProductOrCustomerSurveyDataAsync(gui, customerSurvey, failureCallback, completedHandler); };
                                })(gui, self, customerSurvey, failureCallback, completedHandler);
                                localExecutionQueue.pushHandler(this, f);
                            }
                        }
                        break;
                    }
                case SalesExecutionNameSpace.ActivityType.PRODUCT:
                    {
                        if ((customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() == 0 && !customerSurvey.get("HEADER")) || gui.autoReloadData || std == SalesExecutionNameSpace.SurveyTypeDetail.PROMO) {
                            var fn = (function (gui, context, customerSurvey, failureCallback, successCallback) {
                                return function () {
                                    context._reloadSurveyData(gui, customerSurvey, failureCallback, successCallback);
                                };
                            })(gui, self, customerSurvey, failureCallback, successCallback);
                            localExecutionQueue.pushHandler(this, fn);
                        } else
                            //If activity is of type asso and we are entering in edit mode with existing details the wee need to re-check the assortment
                            //Enhancement #28307: Reevaluate assortment when editing an activity with existing details
                            if (gui.openMode != "VIEW") {
                                customerSurvey.reloadsAssortment = SalesExecutionEngine.activityReloadsAssortment(std);
                                customerSurvey.reloadsAssets = SalesExecutionEngine.activityReloadsAssets(std);
                            }
                        if (customerSurvey.reloadsAssortment || customerSurvey.reloadsAssets) {
                            var fn = (function (gui, context, customerSurvey, failureCallback, successCallback) {
                                return function () {
                                    context._reloadSurveyData(gui, customerSurvey, failureCallback, successCallback);
                                };
                            })(gui, self, customerSurvey, failureCallback, successCallback);
                            localExecutionQueue.pushHandler(this, fn);
                        }
                        else {
                            var completedHandler = (function (gui, context, cs, onSuccess) {
                                return function () {
                                    context._buildProductActivityDetails(cs);
                                    onSuccess();
                                };
                            })(gui, self, customerSurvey, successCallback);

                            if (self._surveyHasHeaderMeasure(surveyConfig) && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (csr) { return csr.isFakeProduct(); }) == null && !customerSurvey.get("HEADER")) {
                                f = (function (gui, context, customerSurvey, failureCallback, completedHandler) {
                                    return function () { context._reloadFakeProductData(gui, customerSurvey, failureCallback, completedHandler); };
                                })(gui, self, customerSurvey, failureCallback, completedHandler);
                            } else {
                                f = (function (gui, context, customerSurvey, failureCallback, completedHandler) {
                                    return function () { context._loadProductOrCustomerSurveyDataAsync(gui, customerSurvey, failureCallback, completedHandler); };
                                })(gui, self, customerSurvey, failureCallback, completedHandler);
                            }
                            localExecutionQueue.pushHandler(this, f);
                        }
                        break;
                    }
                case SalesExecutionNameSpace.ActivityType.EXPO:
                    {
                        XUI.showMsgBox({
                            title: "[MOB.VISITDETAIL]",
                            msg: UserContext.tryTranslate("[MOB.EXPO_ACTIVITY_NOT_SUPPORTED]"),
                            icon: "WARN",
                            buttons: 'OK',
                            onResult: Ext.emptyFn
                        });
                        break;
                    }
                case SalesExecutionNameSpace.ActivityType.QUEST:
                    {
                        var f = (function (gui, context, cs, failureCallback, onSuccess) {
                            return function () {
                                context._loadQuestionnairActivity(cs, gui, failureCallback, onSuccess);
                            };
                        })(gui, self, customerSurvey, failureCallback, successCallback);
                        localExecutionQueue.pushHandler(this, f);
                        break;
                    }
                case SalesExecutionNameSpace.ActivityType.CONTACT:
                    {
                        var f = (function (gui, context, cs, failureCallback, onSuccess) {
                            return function () {
                                context._mergeContactDetails(cs, gui, failureCallback, onSuccess);
                            };
                        })(gui, self, customerSurvey, failureCallback, successCallback);
                        localExecutionQueue.pushHandler(this, f);
                        break;
                    }
                case SalesExecutionNameSpace.ActivityType.ATTACHMENTS:
                    {
                        //the framework will load the attachments
                        break;
                    }
                    //for other activity types do not enqueue load operation = do nothing
            }
        }

        //continue load for caller process
        localExecutionQueue.pushHandler(this, endCallback);

        localExecutionQueue.executeNext();
    };

    //#region QUESTIONNAIRE ACTIVITY
    this._loadQuestionnairActivity = function (customerSurvey, gui, failureCallback, successCallback) {
        try {

            var context = {
                gui: gui,
                customerSurvey: customerSurvey,
                failureCallback: failureCallback,
                successCallback: successCallback,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeLoadQuestionnairActivity', context);
            if (context.canceled)
                return;

            var self = this;

            var idQuest = customerSurvey.get("IDQUESTIONNAIRE");
            if (XApp.isEmptyOrWhitespaceString(idQuest) || idQuest == 0) {
                XLog.logWarn("Questionnaire activity with ID: " + customerSurvey.get("IDSURVEY") + " has field IDQUESTIONNAIRE empty. Questionnaire will not be loaded");
                successCallback();
            }

            //detail of the questionnaire may be already loaded when coming back to GUI using history navigation
            if (customerSurvey.questionnaireInfo) {
                successCallback();
                return;
            }

            var quest = SalesExecutionEngine.getQuestionnaire(idQuest);
            if (quest == null) {
                XLog.logWarn("Missing data for questionnaire in local cache, id:" + idQuest);
                successCallback(); //continue even if error
                return;
            }
            else {
                customerSurvey.questionnaireInfo = quest;
                self._populateQuestionary(customerSurvey, gui);
                successCallback(quest);
            }

        } catch (e) {
            XLog.logErr("Could not retrive questionnaire from cache: IDQUESTIONNAIRE: " + idQuest);
            successCallback(); //continue even if error
            onFailure(e);
        }
    },

    //Populate questionary details from original questions
    this._populateQuestionary = function (customerSurvey, gui) {

        var context = {
            gui: gui,
            customerSurvey: customerSurvey,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePopulateQuestionary', context);
        if (context.canceled)
            return;

        if (customerSurvey.getSubEntityStore("MVCustomerSurveyQuestionnair") == null || customerSurvey.getSubEntityStore("MVCustomerSurveyQuestionnair").getCount() == 0) {
            //create empty placeholders for all questions in questionnaire
            customerSurvey.questionnaireRows = this._loadTopQuestions(customerSurvey, gui);
        } else {
            //create place holders for all questions in questionnnaire and merge answears with exsiting details in survey
            customerSurvey.questionnaireRows = this._loadQuestionsWithAnswears(customerSurvey, gui);
        }

        //sort questionsStore collection on NUMQUESTION and NUMSUBQUESTION
        customerSurvey.questionnaireRows.sortStore(function (q1, q2) {
            if (q1.get("NUMQUESTION") < q2.get("NUMQUESTION"))
                return -1;
            if (q1.get("NUMQUESTION") > q2.get("NUMQUESTION"))
                return 1;

            //else compare NUMSUBQUESTION
            return q1.get("NUMSUBQUESTION") - q2.get("NUMSUBQUESTION");
        });

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterPopulateQuestionary', context);
    },

    this._loadTopQuestions = function (customerSurvey, gui) {
        try {
            var q = new XStore({ entityName: "QuestionnairQuestion" });

            for (var i = 0; i < customerSurvey.questionnaireInfo.QuestionnairQuestionDetails.length; i++) {
                var question = customerSurvey.questionnaireInfo.QuestionnairQuestionDetails[i];
                var questionRow = this._createQuestionWrapper(question);
                q.add(questionRow);
            }
            return q;
        } catch (e) {
            XLog.logEx(e);
        }

        return null;
    },
    this._createQuestionWrapper = function (question) {
        var questionRow = new XEntity({ entityName: "QuestionnairQuestion" });
        // if (question.NUMSUBQUESTION == 0) {
        questionRow.set("IDQUESTIONNAIRE", question.IDQUESTIONNAIRE);
        questionRow.set("IDQUESTION", question.IDQUESTION);
        questionRow.set("NUMQUESTION", question.NUMQUESTION);
        questionRow.set("NUMSUBQUESTION", question.NUMSUBQUESTION);
        questionRow.set("CODANSWER", question.CODANSWER);
        questionRow.set("CODTYPEANSWER", question.CODTYPEANSWER);
        questionRow.set("DESQUESTION", question.DESQUESTION);
        questionRow.set("MINDATE", new Date(question.MINDATE).toDate());
        questionRow.set("MAXDATE", new Date(question.MAXDATE).toDate());
        questionRow.set("MINNUMBER", question.MINNUMBER);
        questionRow.set("MAXNUMBER", question.MAXNUMBER);

        var sortedAnswers = Ext.Array.sort(question.QuestionnairAnswerDetails, function (a, b) {
            return a.CODANWSER - b.CODANWSER;
        });

        for (var j = 0; j < sortedAnswers.length; j++) {
            var answer = sortedAnswers[j];
            var ansEnt = new XEntity({ entityName: "QuestionnairAnswer" });
            //no error CODANWSER is incorrectl spelt in the db
            ansEnt.set("CODANWSER", answer.CODANWSER);
            ansEnt.set("DESANSWER", answer.DESANSWER);
            ansEnt.set("FLGALLOWFREETEXT", answer.FLGALLOWFREETEXT);
            ansEnt.set("IDQUESTION", answer.IDQUESTION);
            ansEnt.set("IDQUESTIONNAIRE", answer.IDQUESTIONNAIRE);

            questionRow.getSubEntityStore("QuestionnairAnswer").add(ansEnt);
        }

        if (question.CODTYPEANSWER == "MULTI") {

            for (var a = 0; a < questionRow.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                //register model placeholder if not already registered
                questionRow.regMultiAnswer(a);
            }
        }


        questionRow.hidden = (question.NUMSUBQUESTION != 0);
        return questionRow;
    };

    this._questionAnswerAllowsFreetext = function (question, code) {

        var context = {
            question: question,
            code: code,
            canceled: false,
            returnValue: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeQuestionAnswerAllowsFreetext', context);
        if (context.canceled)
            return context.returnValue;

        if (!XApp.isEmptyOrWhitespaceString(code)) {
            for (var ia = 0; ia < question.getSubEntityStore("QuestionnairAnswer").getCount() ; ia++) {
                var answer = question.getSubEntityStore("QuestionnairAnswer").getAt(ia);
                if (answer.get("CODANWSER") == code && answer.get("FLGALLOWFREETEXT")) {
                    return true;
                }
            }
        }

        return false;
    };

    this._loadQuestionsWithAnswears = function (customerSurvey, gui) {
        try {

            var qq = new XStore({ entityName: "QuestionnairQuestion" });

            for (var j = 0; j < customerSurvey.questionnaireInfo.QuestionnairQuestionDetails.length; j++) {
                var question = customerSurvey.questionnaireInfo.QuestionnairQuestionDetails[j];

                var foundAnswer = false;
                for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyQuestionnair").getCount() ; i++) {
                    var answer = customerSurvey.getSubEntityStore("MVCustomerSurveyQuestionnair").getAt(i);

                    if (question.IDQUESTION == answer.get("IDQUESTION")) {

                        var custSurvQuestionnair = new XEntity({ entityName: "QuestionnairQuestion" });
                        custSurvQuestionnair.set("IDQUESTIONNAIRE", answer.get("IDQUESTIONNAIRE"));
                        custSurvQuestionnair.set("IDQUESTION", answer.get("IDQUESTION"));
                        custSurvQuestionnair.set("NUMQUESTION", question.NUMQUESTION);
                        custSurvQuestionnair.set("NUMSUBQUESTION", question.NUMSUBQUESTION);
                        custSurvQuestionnair.set("CODANSWER", question.CODANSWER);
                        custSurvQuestionnair.set("CODTYPEANSWER", question.CODTYPEANSWER);
                        custSurvQuestionnair.set("DESQUESTION", question.DESQUESTION);
                        custSurvQuestionnair.set("MINDATE", new Date(question.MINDATE).toDate());
                        custSurvQuestionnair.set("MAXDATE", new Date(question.MAXDATE).toDate());
                        custSurvQuestionnair.set("MINNUMBER", question.MINNUMBER);
                        custSurvQuestionnair.set("MAXNUMBER", question.MAXNUMBER);

                        var sortedAnswers = Ext.Array.sort(question.QuestionnairAnswerDetails, function (a, b) {
                            return a.CODANWSER - b.CODANWSER;
                        });

                        for (var k = 0; k < sortedAnswers.length; k++) {
                            var a = sortedAnswers[k];
                            var ansEnt = new XEntity({ entityName: "QuestionnairAnswer" });
                            //no error CODANWSER is incorrectl spelt in the db
                            ansEnt.set("CODANWSER", a.CODANWSER);
                            ansEnt.set("DESANSWER", a.DESANSWER);
                            ansEnt.set("FLGALLOWFREETEXT", a.FLGALLOWFREETEXT);
                            ansEnt.set("IDQUESTION", a.IDQUESTION);
                            ansEnt.set("IDQUESTIONNAIRE", a.IDQUESTIONNAIRE);

                            custSurvQuestionnair.getSubEntityStore("QuestionnairAnswer").add(ansEnt);
                        }

                        switch (question.CODTYPEANSWER) {
                            case "BOOL":
                                custSurvQuestionnair.set("BOOLANSWER", answer.get("CODANSWER") == SalesExecutionNameSpace.YesNoQtab.Yes);
                                break;
                            case "DATE":
                                custSurvQuestionnair.set("DTEANSWER", new Date(answer.get("DTEANSWER")).toDate());
                                break;
                            case "NUMBER":
                                //    var xdef = XApp.model.getFieldDef("QuestionnairQuestion", "NUMANSWER");
                                //  var minValue = xdef.MinNumericValue;
                                custSurvQuestionnair.set("NUMANSWER", answer.get("NUMANSWER"));
                                break;
                            case "STRING":
                                custSurvQuestionnair.set("STRANSWER", answer.get("FREEANSWER"));
                                break;
                            case "SINGLE":
                                custSurvQuestionnair.set("SINGLEANSWER", answer.get("CODANSWER"));
                                custSurvQuestionnair.set("ALTRO", answer.get("FREEANSWER"));
                                break;
                            case "MULTI":
                                custSurvQuestionnair.set("ALTRO", answer.get("FREEANSWER"));

                                var codes = [];
                                if (answer.get("CODANSWER"))
                                    codes = answer.get("CODANSWER").toString().split(';');
                                for (var a = 0; a < custSurvQuestionnair.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                                    //register model placeholder if not already registered
                                    custSurvQuestionnair.regMultiAnswer(a);

                                    var ans = custSurvQuestionnair.getSubEntityStore("QuestionnairAnswer").getAt(a);
                                    custSurvQuestionnair.set("MULTIANSWER_" + a.toString(), false); //default
                                    for (var c = 0; c < codes.length; c++) {
                                        var code = codes[c];
                                        if (code != null && code == ans.get("CODANWSER")) {
                                            custSurvQuestionnair.set("MULTIANSWER_" + a.toString(), true);
                                            break;
                                        }
                                    }
                                }

                                break;
                        }
                        custSurvQuestionnair.hidden = false;
                        qq.add(custSurvQuestionnair);
                        foundAnswer = true;
                    }
                }
                if (!foundAnswer) {

                    var custSurvQuestionnair = this._createQuestionWrapper(question);
                    qq.add(custSurvQuestionnair);
                }
            }

            return qq;
        } catch (e) {
            XLog.logEx(e);
        }
        return null;
    },

    //Show or hide section for question
    //question
    //show : show or hide 
    this._showQuestionSectionElement = function (ctrl, question, show) {
        try {
            var element = ctrl.fieldContext.sectionContext.detailContext.sections["QUESTIONNAIREQUESTION." + question.get("IDQUESTION").toString()].element;
            if (element) {
                if (show) {
                    element.show();
                    question.hidden = false;
                } else {
                    element.hide();
                    question.hidden = true;
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    //Validate question and setup error messages for fields
    this._validateQuestion = function (question, silent) {
        try {

            var context = {
                question: question,
                canceled: false,
                returnValue: true,
                silent: silent
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateQuestion', context);
            if (context.canceled)
                return context.returnValue;

            switch (question.get("CODTYPEANSWER")) {
                //No validation needed for boolean answers                                                                                                         
                //case "BOOL":                                                                                                         
                case "NUMBER":
                    delete question.errorMessages["NUMANSWER"];

                    var answer = question.get("NUMANSWER");
                    var errorMessage = null;

                    if (answer == undefined || answer == null) {
                        errorMessage = {
                            targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                            messageType: 'WARN',
                            message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[EMPTY_NOT_ALLOWED]")
                        };

                    } else {
                        var minValue = question.get("MINNUMBER");
                        var maxValue = question.get("MAXNUMBER");
                        if (minValue == maxValue) {
                            if (answer < -999999999 || 999999999 < answer) {
                                errorMessage = {
                                    targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                    messageType: 'WARN',
                                    message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[NUMBER_BETWEEN]") + " " + "-999999999" + " " + UserContext.tryTranslate("[AND]") + " " + "999999999"
                                };
                            }
                        } else {
                            if (answer > maxValue || answer < minValue) {
                                errorMessage = {
                                    targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                    messageType: 'WARN',
                                    message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[NUMBER_BETWEEN]") + " " + minValue.toString() + " " + UserContext.tryTranslate("[AND]") + " " + maxValue.toString()
                                };
                            }
                        }
                    }

                    if (errorMessage) {
                        question.errorMessages["NUMANSWER"] = errorMessage;
                        XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION") + " : " + errorMessage.message);
                        if (!silent) {
                            XUI.showMsgBox({
                                title: "[MOB.WARN]",
                                msg: errorMessage.message,
                                icon: "WARN",
                                buttons: 'OK',
                                onResult: Ext.emptyFn
                            });
                        }
                        return false;
                    }
                    break;
                case "STRING":
                    delete question.errorMessages["STRANSWER"];

                    if (XApp.isEmptyOrWhitespaceString(question.get("STRANSWER"))) {

                        var errorMessage = {
                            targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                            messageType: 'WARN',
                            message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[EMPTY_NOT_ALLOWED]")
                        };

                        question.errorMessages["STRANSWER"] = errorMessage;

                        XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION") + " : " + errorMessage.message);

                        return false;
                    }
                    break;
                case "SINGLE":
                    //include ALTRO / freetext answer validation
                    delete question.errorMessages["SINGLEANSWER"];
                    delete question.errorMessages["ALTRO"];

                    var errorMessage = null;

                    var code = question.get("SINGLEANSWER");
                    if (XApp.isEmptyOrWhitespaceString(code)) {
                        var errorMessage = {
                            targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                            messageType: 'WARN',
                            message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[EMPTY_NOT_ALLOWED]")
                        };
                        question.errorMessages["SINGLEANSWER"] = errorMessage;
                    } else {

                        for (var a = 0; a < question.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                            var answer = question.getSubEntityStore("QuestionnairAnswer").getAt(a);
                            if (answer.get("CODANWSER") == code && answer.get("FLGALLOWFREETEXT")) {
                                if (XApp.isEmptyOrWhitespaceString(question.get("ALTRO"))) {
                                    {
                                        var errorMessage = {
                                            targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                            messageType: 'WARN',
                                            message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[FREETEXT_EMPTY_NOT_ALLOWED]")
                                        };
                                        question.errorMessages["ALTRO"] = errorMessage;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (errorMessage) {
                        XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION") + " : " + errorMessage.message);
                        return false;
                    }
                    break;
                case "DATE":
                    {
                        delete question.errorMessages["DTEANSWER"];

                        var minValue = question.get("MINDATE");
                        var maxValue = question.get("MAXDATE");
                        var value = question.get("DTEANSWER");
                        var errorMessage = null;

                        if (XApp.isEmptyDate(value)) {
                            errorMessage = {
                                targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                messageType: 'WARN',
                                message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[EMPTY_NOT_ALLOWED]")
                            };
                        } else if (!XApp.isEmptyDate(minValue) && !XApp.isEmptyDate(maxValue)) {
                            if (minValue - value > 0 || value - maxValue > 0) {
                                errorMessage = {
                                    targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                    messageType: 'WARN',
                                    message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[DATE_BETWEEN]") + " " + minValue.toDateString() + " " + UserContext.tryTranslate("[AND]") + " " + maxValue.toDateString()
                                };
                            }
                        }

                        if (errorMessage) {
                            question.errorMessages["DTEANSWER"] = errorMessage;
                            XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION") + " : " + errorMessage.message);
                            return false;
                        }
                        break;
                    }
                case "MULTI":
                    //include ALTRO / freetext answer validation
                    {
                        delete question.errorMessages["ALTRO"];

                        var answered = false;

                        for (var a = 0; a < question.getSubEntityStore("QuestionnairAnswer").getCount() ; a++) {
                            var answer = question.getSubEntityStore("QuestionnairAnswer").getAt(a);
                            if (question.get("MULTIANSWER_" + a.toString())) {
                                if (answer.get("FLGALLOWFREETEXT") && (XApp.isEmptyOrWhitespaceString(question.get("ALTRO")))) {
                                    {
                                        var errorMessage = {
                                            targetName: question.get("IDQUESTIONNAIRE") + "|" + question.get("IDQUESTION"),
                                            messageType: 'WARN',
                                            message: UserContext.tryTranslate("[MOBVISIT.QUESTION]") + " " + question.get("DESQUESTION") + " : " + UserContext.tryTranslate("[FREETEXT_EMPTY_NOT_ALLOWED]")
                                        };
                                        question.errorMessages["ALTRO"] = errorMessage;
                                        XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION") + " : " + errorMessage.message);
                                        break;
                                    }
                                }
                                answered = true;
                            }
                        }

                        if (!answered || question.errorMessages["ALTRO"]) {
                            XLog.logInfo("Questionnaire " + question.get("IDQUESTIONNAIRE") + " not valid due to question " + question.get("IDQUESTION"));
                            return false;
                        }
                        break;
                    }
            }

            return true;

        } catch (e) {
            XLog.logEx(e);
            return false;
        }
    };

    this._validateQuestionary = function (cs, silent) {
        try {

            var context = {
                cs: cs,
                canceled: false,
                returnValue: true,
                silent: silent
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateQuestionary', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            if (cs.questionnaireRows)
                for (var i = 0; i < cs.questionnaireRows.getCount() ; i++) {
                    var question = cs.questionnaireRows.getAt(i);
                    //the question may be a subquestion that is not activated (not visible)
                    if (question && (question.hidden === undefined || question.hidden === false))
                        valid = valid && this._validateQuestion(question, silent);
                }

            //if the activity is of type recovery, place a fake anomaly if the questonner is not completed
            if (!XApp.isEmptyOrWhitespaceString(cs.get("IDSURVEYSRC")) && !cs.isNew && !valid) {

                var header = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(cs.getParentEntity());
                header.set("CODART", ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode());
                header.set("CODDIV", UserContext.CodDiv);

                var targetName = this._getTargetName(cs, header, "QUEST_INCOMPLETE");

                var warning = cs.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.COMPLETED && (!this.closeVisitButton || !this.closeVisitButton.b_closeVisitAttempt);

                //Questionnair not completed
                var alertMessage = cs.questionnaireInfo.DESQUESTIONNAIRE + ": " + UserContext.tryTranslate("[MOB.VISIT.QUEST_NOT_COMPLETED]");
                var msg = {
                    "targetName": targetName,
                    "messageType": warning ? "WARN" : "ERROR",
                    "message": alertMessage,
                };
                header.errorMessages[cs.get("IDSURVEY")] = msg;
                cs.set("HEADER", header);
            }
            else if (!XApp.isEmptyOrWhitespaceString(cs.get("IDSURVEYSRC"))) {
                cs.set("HEADER", undefined);
            }
            return valid;

        } catch (e) {
            XLog.logEx(e);
            return false;
        }
    };
    //#endregion

    this._getProductXContraints = function (customerSurvey, gui) {
        var prodContrains = SalesExecutionEngine.getProductXConstraint(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, prodContrains);
        prodContrains = missionFilter.constraints;
        return prodContrains;
    },

    //#region cache loading
    // Load mission if any
    this._cacheMissions = function (gui, onFailure, onSuccess) {
        try {
            var visit = gui.getDocument();
            var localExeQueue = new ExecutionQueue();

            for (var i = 0; i < visit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                var customerSurvey = visit.getSubEntityStore("MVCustomerSurvey").getAt(i);
                var idMission = customerSurvey.get("IDMISSION");
                if (idMission == null || idMission == "")
                    continue;

                var callback = (function (localExeQueue, idMission, gui) {
                    return function () {
                        SfaCacheManager.getFromCache({
                            entityName: SfaCacheManagerNamespace.CacheObjects.MISSIONS,
                            idMission: idMission,
                            onFailure: function (e) {
                                XLog.logErr("Could not retrive mission from cache, idmission:" + idMission);
                                localExeQueue.executeNext(); //continue even if error
                            },
                            onSuccess: function (mission) {
                                try {
                                    if (mission) {
                                        var ent = XDocs.loadEntStore("Mission", mission).getAt(0); //transform to document in order to extract attachments
                                        gui.m_missions.push(ent);
                                    }
                                } catch (e) {
                                    XLog.logErr("Could not retrive mission from cache, idmission:" + idMission);
                                }
                                localExeQueue.executeNext();
                            }
                        });
                    };
                })(localExeQueue, idMission, gui);
                localExeQueue.pushHandler(this, callback);
            }
            localExeQueue.pushHandler(this, onSuccess);
            localExeQueue.executeNext();
        } catch (e) {
            onFailure(e);
        }
    },
    // Cache the assortments for each division of the current customer
    this._cacheAssortments = function (gui, onFailure, onSuccess) {
        try {
            var visit = gui.getDocument();
            var codparty = visit.get("CODPARTY");

            if (!XApp.isEmptyOrWhitespaceString(codparty)) {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS,
                    date: visit.get("DTEVISIT"),
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function (e) {
                        XLog.logErr("Could not retrive assortments from cache.");
                        onSuccess();
                    },
                    onSuccess: function (assortmentDictionary) {
                        try {
                            if (assortmentDictionary) {
                                for (var i = 0; i < assortmentDictionary.length; i++) {
                                    gui.m_divisionAssortments[assortmentDictionary[i].key] = assortmentDictionary[i].value;
                                }
                            }
                        } catch (e) {
                            XLog.logErr("Could not retrive assortments from cache.");
                        }
                        onSuccess();
                    }
                });
            }
            else if (onSuccess)
                onSuccess();
        } catch (e) {
            onFailure(e);
        }
    },
    //Load price lists and store locally
    this._cachePriceList = function (gui, onFailure, onSuccess) {
        try {
            var visit = gui.getDocument();
            var codparty = gui.cust && gui.cust.get('FLGCUSTSALE') && !gui.cust.get('FLGCUSTDELIV') ? gui.cust.get('CODCUSTDELIV') : visit.get('CODPARTY');

            if (!XApp.isEmptyOrWhitespaceString(codparty)) {

                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.PRICELISTS,
                    codparty: codparty,
                    date: visit.get("DTEVISIT"),
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XLog.logErr("Could not retrive price list from cache for customer: " + codparty);
                        if (onSuccess) onSuccess();
                    },
                    onSuccess: function (priceList) {
                        try {
                            if (priceList && priceList.length) {
                                for (var i = 0; i < priceList.length; i++)
                                    gui.m_evalPriceListCollection[priceList[i].CODART + "|" + priceList[i].CODDIV] = priceList[i];
                            }
                        } catch (e) {
                            XLog.logErr("Could not retrive price list from cache for customer: " + codparty);
                        }
                        if (onSuccess) onSuccess();
                    }
                });

            }
            else if (onSuccess)
                onSuccess();
        } catch (e) {
            onFailure(e);
        }
    },
    // Cache the assets present at customer
    this._cacheAssets = function (gui, onFailure, onSuccess) {
        try {
            var visit = gui.getDocument();
            var codparty = visit.get("CODPARTY");

            if (!XApp.isEmptyOrWhitespaceString(codparty)) {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.CUSTOMERASSETBALANCE,
                    date: visit.get("DTEVISIT"),
                    codparty: codparty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function (e) {
                        XLog.logErr("Could not retrive assets from cache.");
                        onSuccess();
                    },
                    onSuccess: function (assets) {
                        try {
                            if (assets && assets.length) {
                                for (var i = 0; i < assets.length; i++) {
                                    var cab = assets[i];
                                    var assetKey = [cab.CODART, cab.CODDIV, cab.IDBATCH].join("|");
                                    gui.m_assetBalance.add(assetKey, cab);
                                }
                            }
                        } catch (e) {
                            XLog.logErr("Could not retrive assets from cache.");
                        }
                        onSuccess();
                    }
                });
            }
            else if (onSuccess)
                onSuccess();
        } catch (e) {
            onFailure(e);
        }
    },
    //#endregion
    //#region Load/Reload data
    // To be used when reloading data as a user action consequence
    this._reloadDataManual = function (gui) {

        var context = {
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeReloadDataManual', context);
        if (context.canceled)
            return;

        var self = this;
        var mobVisit = gui.getDocument();
        //Verify that for this visit there are details already
        var overwritableDetailsExist = (mobVisit.getSubEntityStore('MVCustomerSurvey').findBy(function (cs) { return (cs.getSubEntityStore('MVCustomerSurveyRow').getCount() != 0 || cs.get("HEADER")); }) != null);

        //reload directly
        if (!overwritableDetailsExist) {
            this._reloadData(gui);
        } else {
            //if the user clicked reload data but there are details that can be lost the system should ask again
            XUI.showYESNO({
                title: UserContext.tryTranslate("[ATTENZIONE]"),
                msg: UserContext.tryTranslate("[MOBVISIT.RELOAD_SURVEY_DETAILS]"),
                onResult: function (code) {
                    switch (code) {
                        case 'YES':
                            self._reloadData(gui);
                            break;
                    }
                }
            });
        }


    },

    // Reload data for all the surveys
    this._reloadData = function (gui) {

        var context = {
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeReloadData', context);
        if (context.canceled)
            return;

        XUI.showWait();

        var self = this;
        var mobVisit = gui.getDocument();

        gui.b_visitReload = true;
        this.n_productCsLoaded = 0;

        var failureCallback = function (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        };

        var localExecutionQueue = new ExecutionQueue();

        var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

        var f = (function (gui) {
            return function () {
                self._cacheAssortments(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._cachePriceList(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._cacheAssets(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._loadContactDetails(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        mobVisit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {

            cs.isAtFirstLoad = true;
            cs.reloadsAssortment = false;
            cs.reloadsAssets = false;

            var f = (function (gui, context, customerSurvey, failureCallback, successCallback) {
                return function () {
                    context._reloadSurveyData(gui, customerSurvey, failureCallback, successCallback);
                };
            })(gui, self, cs, failureCallback, successCallback);
            localExecutionQueue.pushHandler(self, f);
        });

        f = (function (gui) {
            return function () {
                SalesExecutionEngine._loadAllNotes(gui.getDocument(), failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui) {
            return function () {
                self._checkAndUpdateCalculatedMeasures(gui);
                //perform validation on all customer surveys so anmolies blocking save can be found
                self._validateAll(gui.getDocument());
                localExecutionQueue.executeNext();
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        //refresh gui
        f = (function (gui, successCallback) {
            return function () {

                //rebind objects
                mobVisit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
                    if (SalesExecutionEngine.isTabVisible(cs))
                        self._refreshTab(gui, cs);
                });


                successCallback();
            };
        })(gui, successCallback);
        localExecutionQueue.pushHandler(this, f);

        f = (function (gui, successCallback) {
            return function () {
                var context = {
                    gui: gui,
                    queue: localExecutionQueue,
                    successCallback: successCallback,
                    canceled: false
                };
                XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterReloadData', context);
                if (context.canceled)
                    return;

                context.successCallback();
            };
        })(gui, successCallback);
        localExecutionQueue.pushHandler(this, f);

        localExecutionQueue.pushHandler(XUI, XUI.hideWait);

        // START
        localExecutionQueue.executeNext();
    },

    //Load pending autoincluded surveys
    this._loadPendingAutoincludedSurveys = function (gui, onFailure, onSuccess) {
        try {

            var context = {
                gui: gui,
                onFailure: onFailure,
                onSuccess: onSuccess,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeLoadPendingAutoincludedSurveys', context);
            if (context.canceled)
                return;

            var self = this;
            var visit = gui.getDocument();
            var allSurveys = XApp.GlobalData["SURVEYS"];
            var surveyTypeCandidates = [];

            for (var i = 0; i < allSurveys.length; i++) {
                if (SalesExecutionEngine.canCreateSurvey(allSurveys[i], visit) && SalesExecutionEngine.contactModeFLGAUTOINCLUDE(allSurveys[i], visit.get("CONTACTMODE"))) {
                    surveyTypeCandidates.push(allSurveys[i].CODTYPSURVEY);
                }
            }

            if (surveyTypeCandidates.length > 0) {
                SalesExecutionEngine.loadNextPending(surveyTypeCandidates, visit, onFailure, function (data) {
                    try {
                        data.each(function (csObj) {
                            //create entity
                            var customerSurvey = XDocs.loadEntStore("MVCustomerSurvey", csObj).getAt(0);

                            //plan in visit
                            SalesExecutionEngine.planCustomerSurvey(customerSurvey, visit, visit.get("CODSTATUS"));
                            //mark for reload
                            customerSurvey.reloadsData = true;

                            //mark entity as modified
                            gui.setModified(visit);

                            //refresh visit context menu
                            self._updateVisitButtonState(gui);

                            //process after events
                            self._onAfterCustomerSurveyAdded(customerSurvey, gui);
                        });
                        onSuccess();
                    } catch (e) {
                        XLog.logErr("Failed to load pending autoinlcuded surveys.");
                        onFailure(e);
                    }
                });
            } else
                onSuccess();

        } catch (e) {
            onFailure(e);
        }
    },
    // Loads all needed previous surveys that may be used when adding new products to this survey. The previous surveys  
    // are determined from measures.
    this._loadProductOrCustomerSurveyDataAsync = function (gui, customerSurvey, onFailure, onSuccess) {
        try {
            if (!gui.m_previousSurveysCollection)
                gui.m_previousSurveysCollection = new PreviousSurveyCollection();

            var activityType = SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"));
            if ((activityType == SalesExecutionNameSpace.ActivityType.PRODUCT || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER) && !gui.m_previousSurveysCollection.get(customerSurvey)) {
                SalesExecutionEngine.loadPreviousSurveys(customerSurvey, onFailure,
                    function (previousSurveys) {
                        //store data per customer survey
                        if (previousSurveys != null) {
                            gui.m_previousSurveysCollection.add(customerSurvey, previousSurveys);
                        }
                        onSuccess();
                    });
            } else
                onSuccess();
        } catch (e) {
            onFailure(e);
        }
    },
    this._reloadFakeProductData = function (gui, customerSurvey, onFailure, onSucess) {
        var self = this;
        SalesExecutionEngine.loadPreviousSurveys(customerSurvey, onFailure, function (previousSurveys) {
            try {
                //store data per customer survey
                if (previousSurveys != null) {
                    if (!gui.m_previousSurveysCollection)
                        gui.m_previousSurveysCollection = new PreviousSurveyCollection();
                    gui.m_previousSurveysCollection.add(customerSurvey, previousSurveys);
                }
                //load fake products
                var constraints = SalesExecutionEngine.getFakeProductXConstraints(customerSurvey);
                var fakeProduct = XNavHelper.getNavRecord("NAV_MOB_PROD", constraints);

                if (fakeProduct) {
                    var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
                    //Create detail also for the fake product if any
                    self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
                } else {
                    XUI.showErrorMsgBox({
                        msg: UserContext.tryTranslate("[MOBVISIT.NO_PRODUCT_FOR_HEADER_MEASURES]") + " " + customerSurvey.get("DesTypSurveyLong")
                    });
                }
                //continue
                onSucess();
            } catch (e) {
                onFailure(e);
            }
        });
    },
    this._reloadSurveyData = function (gui, customerSurvey, onFailure, onSucess) {
        try {
            customerSurvey.reloadsData = true;

            var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));
            switch (std) {
                case SalesExecutionNameSpace.SurveyTypeDetail.CONTACT:
                    var func = (function (caller, customerSurvey, gui, onFailure, onSucess) {
                        return function () { caller._mergeContactDetails(customerSurvey, gui, onFailure, onSucess); };
                    })(this, customerSurvey, gui, onFailure, onSucess);
                    setTimeout(func, 100);
                    break;
                case SalesExecutionNameSpace.SurveyTypeDetail.QUEST:
                    //questionnaire does not reload data
                    onSucess();
                    break;
                case SalesExecutionNameSpace.SurveyTypeDetail.SPACE:
                    XUI.showMsgBox({
                        title: "[MOB.VISITDETAIL]",
                        msg: "[MOB." + std + "_ACTIVITY_NOT_SUPPORTED]",
                        icon: "WARN",
                        buttons: 'OK',
                        onResult: Ext.emptyFn
                    });
                    onSucess();
                    break;
                case SalesExecutionNameSpace.SurveyTypeDetail.ATTACHMENTS:
                    //questionnaire does not reload data
                    onSucess();
                    break;
                default:
                    {
                        var func = (function (caller, gui, customerSurvey, onFailure, onSucess) {
                            return function () { caller._reloadProductOrCustomerSurveyData(gui, customerSurvey, onFailure, onSucess); };
                        })(this, gui, customerSurvey, onFailure, onSucess);
                        setTimeout(func, 100);
                        break;
                    }
            }

            //mark entity as modified
            if (gui.openMode != "VIEW") {
                var mobVisit = gui.getDocument();
                gui.setModified(mobVisit);
            }

        } catch (e) {
            onFailure(e);
        }
    },
    this._reloadProductOrCustomerSurveyData = function (gui, customerSurvey, onFailure, onSuccess) {
        var self = this;

        SalesExecutionEngine.loadPreviousSurveys(customerSurvey, onFailure, function (previousSurveys) {
            try {
                //store data per customer survey
                if (previousSurveys) {
                    if (!gui.m_previousSurveysCollection)
                        gui.m_previousSurveysCollection = new PreviousSurveyCollection();

                    gui.m_previousSurveysCollection.add(customerSurvey, previousSurveys);
                }

                var activityType = SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"));

                var handler;
                if (activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER)
                    handler = (function (context, customerSurvey, gui) {
                        return function () {
                            context._buildCustomerActivityDetails(customerSurvey, gui);
                        };
                    })(self, customerSurvey, gui);
                else
                    handler = (function (context, customerSurvey) {
                        return function () {
                            context._buildProductActivityDetails(customerSurvey);
                        };
                    })(self, customerSurvey);


                var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));

                switch (std) {
                    case SalesExecutionNameSpace.SurveyTypeDetail.PROMO:
                        self._loadPROMOActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.COMP:
                        self._loadCOMPActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.TOP:
                        self._loadTOPActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.ASSO:
                        self._loadASSOActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.ASSOCOMP:
                        self._loadASSOCOMPActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.ART:
                        self._loadARTActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.ASSET:
                        self._loadASSETActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    case SalesExecutionNameSpace.SurveyTypeDetail.CUST:
                    case SalesExecutionNameSpace.SurveyTypeDetail.USER:
                        self._loadClientActivityDetails(customerSurvey, previousSurveys, gui, handler, onFailure, onSuccess);
                        break;
                    default:
                        if (onSuccess)
                            onSuccess();
                }
            } catch (e) {
                onFailure(e);
            }
        });
    };

    //  Load details for ASSO COMP survey type
    this._loadASSOCOMPActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getASSOCOMPProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, true, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    //  Load details for ASSO  survey type
    this._loadASSOActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getASSOProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, true, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    //  Load details for ART  survey type
    this._loadARTActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getARTProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, false, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    // Load details for PROMO survey types
    this._loadPROMOActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getPROMOProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        var filterByAsso = (UserContext.getConfigParam("USEASSO_ON_PROMOSURVEY", -1) != 0);

        this._populateSurveyDetails(constraints, customerSurvey, previous, filterByAsso, false, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    // Load details for COMP survey types
    this._loadCOMPActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {
        var constraints = SalesExecutionEngine.getCOMPProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, true, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    // Load details for TOP survey types
    this._loadTOPActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getTOPProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, true, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    // Load details for ASSET survey types
    this._loadASSETActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getASSETProductXConstraints(customerSurvey);
        var missionFilter = SalesExecutionEngine.addMissionFilterXConstraints(customerSurvey, gui.m_missions, constraints);
        constraints = missionFilter.constraints;
        constraints = SalesExecutionEngine.addFakeProductXConstraints(customerSurvey, constraints);

        this._populateSurveyDetails(constraints, customerSurvey, previous, false, missionFilter.existingMissionFilter, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };
    /// Load client activity details
    this._loadClientActivityDetails = function (customerSurvey, previous, gui, builder, onFailure, onSuccess) {

        var constraints = SalesExecutionEngine.getFakeProductXConstraints(customerSurvey);
        this._populateSurveyDetails(constraints, customerSurvey, previous, false, false, SalesExecutionEngine.getAssortmentType(customerSurvey), builder, gui, onFailure, onSuccess);
    };

    // Load products with constraints and populate the survey details with it
    //constraints: function that filters products
    //customerSurvey: entity that represents a CustomerSurvey object
    //previousSurveys: Ext.util.MixedCollection of CustomerSurvey entity objects
    //filterByAssortment: boolean
    //existingFilterMission:  boolean
    //codAssortmentTypes: list of strings
    //handler: callback function
    //onFailure: failure handler
    //onSuccess: success handler
    this._populateSurveyDetails = function (constraints, customerSurvey, previousSurveys, filterByAssortment, existingFilterMission, codAssortmentTypes, handler, gui, onFailure, onSuccess) {
        try {
            customerSurvey.set("skipNewProducts", !XApp.isEmptyOrWhitespaceString(customerSurvey.get("IDMISSION")) && !existingFilterMission);

            var std = SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY"));

            //load and filter products
            var navData = XNavHelper.getFromMemoryCache("NAV_MOB_PROD");
            var prdList = navData.getFilteredTable({ constraints: constraints });

            var existingDetailsCollection = new Ext.util.MixedCollection();
            //to array
            existingDetailsCollection.addAll(customerSurvey.getSubEntityStore("MVCustomerSurveyRow").toArray());
            existingDetailsCollection = existingDetailsCollection.filterBy(function (record) {
                return (!record.isFakeProduct());
            });

            var fakeProduct = prdList.findByKey(CommonEngine.buildProductKey(ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode(), UserContext.CodDiv));
            if (fakeProduct) {
                XLog.logInfo("Fake product loaded for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                prdList.removeRow(fakeProduct); //remove fake product from product list and keep separate
            }
            else
                XLog.logInfo("Fake product NOT loaded for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);


            XLog.logInfo(prdList.Rows.length.toString() + " products loaded for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);

            var assortmentCollection = new Ext.util.MixedCollection();
            if (filterByAssortment) {
                for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyDiv").getCount() ; i++) {
                    var div = customerSurvey.getSubEntityStore("MVCustomerSurveyDiv").getAt(i);
                    var key = div.get("CODDIV");
                    if (gui.m_divisionAssortments[key] != undefined && gui.m_divisionAssortments[key] != null) {
                        var assortmentsByType = new Ext.util.MixedCollection();
                        assortmentsByType.addAll(gui.m_divisionAssortments[key]);
                        var filterExpr = new Ext.util.Filter({
                            filterFn: function (item) {
                                for (var j = 0; j < codAssortmentTypes.length; j++)
                                    if (codAssortmentTypes[j] == item.CODASSORTMENTTYPE)
                                        return true;
                                return false;
                            }
                        });
                        assortmentsByType = assortmentsByType.filter(filterExpr);
                        for (var j = 0; j < assortmentsByType.length; j++) {
                            if (!assortmentCollection.findBy(function (record) {
                                return (assortmentsByType.getAt(j).IDEVAL == record.IDEVAL && assortmentsByType.getAt(j).CODLOCATION == record.CODLOCATION
                                    && assortmentsByType.getAt(j).CODART == record.CODART && assortmentsByType.getAt(j).CODDIV == record.CODDIV && assortmentsByType.getAt(j).CODASSORTMENTTYPE == record.CODASSORTMENTTYPE);
                            }, this)) {
                                assortmentCollection.add(assortmentsByType.getAt(j));
                            }
                        }
                    }
                } //end for

                XLog.logInfo(assortmentCollection.length.toString() + " assortments loaded for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);

                if (std == SalesExecutionNameSpace.SurveyTypeDetail.ASSO || std == SalesExecutionNameSpace.SurveyTypeDetail.COMP || std == SalesExecutionNameSpace.SurveyTypeDetail.ASSOCOMP) {
                    XLog.logInfo("Filtering " + assortmentCollection.length.toString() + " assortment details with " + prdList.Rows.length.toString() + " products for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                    assortmentCollection = SalesExecutionEngine.filterAssortmentsByProducts(assortmentCollection, prdList);
                } else if (assortmentCollection.length > 0) {
                    if (std == SalesExecutionNameSpace.SurveyTypeDetail.PROMO) {
                        XLog.logInfo("Filtering " + existingDetailsCollection.getCount() + " promo details with " + assortmentCollection.length.toString() + " assortments for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                        existingDetailsCollection = SalesExecutionEngine.filterPromoDetailsByAssortments(customerSurvey, existingDetailsCollection, assortmentCollection, !gui.b_visitReload);
                    } else {
                        XLog.logInfo("Filtering " + prdList.Rows.length.toString() + " product details with " + assortmentCollection.length.toString() + " assortments for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                        prdList = SalesExecutionEngine.filterProductsByAssortments(prdList, assortmentCollection);
                    }
                }
            }

            XLog.logInfo(prdList.Rows.length.toString() + " products after filtering for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
            XLog.logInfo(assortmentCollection.length.toString() + " assortments after filtering for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);

            //Build the survey detail rows 
            switch (std) {
                case SalesExecutionNameSpace.SurveyTypeDetail.ASSO:
                case SalesExecutionNameSpace.SurveyTypeDetail.COMP:
                case SalesExecutionNameSpace.SurveyTypeDetail.ASSOCOMP:
                    //In the special case where the assortment collection is empty and we have a previous survey
                    if (assortmentCollection.length == 0) {
                        //If there are mission filter we use the normal filters to load the products
                        //If there are mission filter we use the normal filters to load the products
                        if (existingFilterMission) {
                            XLog.logInfo("Building ASSO activity details with no assortments loaded but with mission filter. Details will be created from product list for" + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                            this._buildRowDetailsFromProductList(customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui);
                        }
                            //Else simply reload the data from the previous completed survey
                            //we take the list of details from it (just the product list - the measure values fields are empty)
                        else if (previousSurveys && previousSurveys.findBy(function (item) { return customerSurvey.get("CODTYPSURVEY") == item.get("CODTYPSURVEY"); })) {
                            XLog.logInfo("Building ASSO activity details with no assortments loaded, no mission filter but with previous survey loaded. Details will be created from previous survey details for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                            this._buildRowDetailsFromPreviousSurvey(customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui);
                        } else {
                            this._buildRowDetailsFromAssortment(customerSurvey, previousSurveys, assortmentCollection, prdList, fakeProduct, handler, gui);
                        }

                    } else
                        this._buildRowDetailsFromAssortment(customerSurvey, previousSurveys, assortmentCollection, prdList, fakeProduct, handler, gui);
                    break;
                    //for ART tipology try to add all article from previous if it exist otherwise add nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                case SalesExecutionNameSpace.SurveyTypeDetail.ART:
                    if (customerSurvey.get("IDMISSION") != null && customerSurvey.get("IDMISSION") != "") {
                        XLog.logInfo("Building ART activity details with mission. Details will be created from product list for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                        this._buildRowDetailsFromProductList(customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui);
                    } else if (previousSurveys && previousSurveys.findBy(function (item) { return customerSurvey.get("CODTYPSURVEY") == item.get("CODTYPSURVEY"); })) {
                        XLog.logInfo("Building ART activity details with no mission but previous survey loaded. Details will be created from previous survey details for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                        this._buildRowDetailsFromPreviousSurvey(customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui);
                    } else {
                        XLog.logInfo("Building ART activity details with no mission, and no previous survey loaded. Details will not be changed for " + customerSurvey.get("CODTYPSURVEY") + " of type " + std);
                        this._buildRowDetailsForArt(customerSurvey, previousSurveys, fakeProduct, handler, gui);

                        handler(customerSurvey);
                    }
                    break;
                    //For PROMO type activities merge fake product with existing (filtered or not) details in the survey.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           
                case SalesExecutionNameSpace.SurveyTypeDetail.PROMO:
                    this._buildRowDetailsForPromo(customerSurvey, previousSurveys, existingDetailsCollection, fakeProduct, handler, gui);
                    break;
                case SalesExecutionNameSpace.SurveyTypeDetail.ASSET:
                    this._buildRowDetailsFromAssets(customerSurvey, previousSurveys, gui.m_assetBalance, prdList, fakeProduct, handler, gui);
                    break;
                default:
                    this._buildRowDetailsFromProductList(customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui);
                    break;
            }

            onSuccess();

        } catch (e) {
            onFailure(e);
        }

    },
    this._surveyHasHeaderMeasure = function (survey) {
        for (var i = 0; i < survey.SurveyMeasureDetails.length; i++) {
            if (survey.SurveyMeasureDetails[i].FLGHEADER) {
                return true;
            }
        }
        return false;
    },
    // Translate a collection of products into a CustomerSurveyRowDetails
    //customerSurvey: entity that represents a CustomerSurvey object
    //previousSurveys: Ext.util.MixedCollection of CustomerSurvey entity objects
    //prdList:  Ext.util.MixedCollection of <XDataRow>
    //fakeProduct:  XDataRow with fake product data
    //handler: callback function
    this._buildRowDetailsFromProductList = function (customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui) {

        var self = this;
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
        var activityType = SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"));

        //Enhancement #28307: Reevaluate assortment when editing an activity with existing details
        if (customerSurvey.reloadsAssortment) {
            XLog.logInfo("Re-evaluating assortment. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + prdList.length().toString() + " products, " + customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() + " existing details, " + (fakeProduct ? 1 : 0) + " fake product.");
            for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; i++) {
                var csr = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(i);
                //If the visit detail is not present in the assortment "ASSO.XXX" fields should be cleaned up
                SalesExecutionEngine.setAssoMeasure(csr, survey, null);
            }
        }
        else {

            if (customerSurvey.get("skipNewProducts")) {

                customerSurvey.getSubEntityStore('MVCustomerSurveyRow').removeBy(function (csr) { return !csr.isFakeProduct(); });
                customerSurvey.set("HEADER", null);

                if (fakeProduct != null && (this._surveyHasHeaderMeasure(survey) || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER)) {
                    this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
                }

                XLog.logWarn("Skipping products adding due to missing mission filters. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ".");
            }
            else {

                XLog.logInfo("Building activity details from product list. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + prdList.length().toString() + " products, " + (fakeProduct ? 1 : 0) + " fake product.");

                customerSurvey.getSubEntityStore('MVCustomerSurveyRow').removeAll(true); //true = silent 
                customerSurvey.set("HEADER", null);

                if (fakeProduct != null && (this._surveyHasHeaderMeasure(survey) || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER))
                    prdList.addRow(fakeProduct);

                Ext.Array.forEach(prdList.Rows, function (item) {
                    //do not add new row detail if collection already contains one detail for the same assortment
                    if (!survey.FLGALLOWDUPART && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (prod, index, length) {
                            return (item.get("CODART") == prod.get("CODART") && item.get("CODDIV") == prod.get("CODDIV"));
                    }) != null)
                        return;
                    self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, item, gui, false, false);
                });
            }

        }
        //if the fake product was not loaded
        if (activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER && customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() == 0) {
            XLog.logErr("Fake product was not loaded for customer survey with ID:" + customerSurvey.get("IDSURVEY") + ". Check that fake product with CODART: " + ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode() + " is present in products/article navigator");
            XUI.showMsgBox({
                title: "[MOB.VISITDETAIL]",
                msg: UserContext.tryTranslate("[MOB.NO_PRODUCT_FOR_CLIENT_ACTIVITY]"),
                icon: "ERR",
                buttons: 'OK',
                onResult: Ext.emptyFn
            });
        } else if (activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER || activityType == SalesExecutionNameSpace.ActivityType.PRODUCT)
            handler();
    },
    // Translate a collection of products into a CustomerSurveyRowDetails
    //customerSurvey: entity that represents a CustomerSurvey object
    //previousSurveys: Ext.util.MixedCollection of CustomerSurvey entity objects
    //assortmentCollection :  Ext.util.MixedCollection of <EvalAssortment object> representing Assortments that contain the products
    //prdList:  Ext.util.MixedCollection of <XDataRow>
    //fakeProduct:  XDataRow with fake product data
    //handler: callback function
    this._buildRowDetailsFromAssortment = function (customerSurvey, previousSurveys, assortmentCollection, prdList, fakeProduct, handler, gui) {
        var self = this;
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));

        //Enhancement #28307: Reevaluate assortment when editing an activity with existing details
        if (customerSurvey.reloadsAssortment) {
            XLog.logInfo("Re-evaluating assortment. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + assortmentCollection.length.toString() + " assortments, " + prdList.length().toString() + " products, " + customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() + " existing details, " + (fakeProduct ? 1 : 0) + " fake product.");
            for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; i++) {
                var csr = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(i);
                var asso = assortmentCollection.findBy(function (record) {
                    return (csr.get("CODART") == record.CODART && csr.get("CODDIV") == record.CODDIV);
                });
                if (asso) {
                    //For all the product in the visit detail, reset the "ASSO.XXX" measures with the values from the current assortment
                    SalesExecutionEngine.setAssoMeasure(csr, survey, asso);
                    //remove from the collection so at the next step we end up with only the rows that need to be added
                    assortmentCollection.remove(asso);
                } else {

                    //If the visit detail is not present in the assortment "ASSO.XXX" fields should be cleaned up
                    SalesExecutionEngine.setAssoMeasure(csr, survey, null);
                }
            }
            XLog.logInfo("Building activity details from assortment. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + assortmentCollection.length.toString() + " new assortment rows to be added in the activity.");

        } else {
            if (customerSurvey.get("skipNewProducts")) {

                customerSurvey.getSubEntityStore('MVCustomerSurveyRow').removeBy(function (csr) { return !csr.isFakeProduct(); });
                customerSurvey.set("HEADER", null);

                if (fakeProduct != null && this._surveyHasHeaderMeasure(survey)) {
                    this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
                }

                XLog.logWarn("Skipping products adding due to missing mission filters. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ".");
            }
            else {
                XLog.logInfo("Building activity details from assortments. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + assortmentCollection.length.toString() + " assortments, " + prdList.length().toString() + " products, " + (fakeProduct ? 1 : 0) + " fake product.");

                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").removeAll(true); //true = silent 
                customerSurvey.set("HEADER", null);

                //Create detail also for the fake product if any
                if (fakeProduct != null && this._surveyHasHeaderMeasure(survey))
                    self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
            }
        }

        if (!customerSurvey.get("skipNewProducts")) {

            //Build details from assortment
            var codLocation = 0;
            for (var i = 0; i < assortmentCollection.length; i++) {
                var asso = assortmentCollection.getAt(i);

                var codArt = asso.CODART;
                var codDiv = asso.CODDIV;

                //do not add new row detail if collection already contains one detail for the same assortment
                if (!survey.FLGALLOWDUPART && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item, index, length) {
                    return (item.get("CODART") == codArt && item.get("CODDIV") == codDiv);
                }) != null)
                    continue;

                var csr = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(customerSurvey);
                csr.set("CODLOCATION", codLocation);
                codLocation++;

                csr.set("isNewInAssortment", customerSurvey.reloadsAssortment);

                //region Set extra attributes from product
                var product = prdList.findByKey(CommonEngine.buildProductKey(asso.CODART, asso.CODDIV));
                if (!product) {
                    continue;
                }
                csr.copyAttributesFromProduct(product);

                SalesExecutionEngine.setDefaultMeasureValues(csr, survey, false, false);
                SalesExecutionEngine.setAssoMeasure(csr, survey, asso);
                SalesExecutionEngine.setPriceList(csr, survey, gui.m_evalPriceListCollection);
                SalesExecutionEngine.setProductMeasure(csr, survey, product);
                SalesExecutionEngine.setCustomerMeasure(csr, survey, gui.cust);

                //populate details from previous survey
                SalesExecutionEngine.populateDetailsFromPreviousSurveys(csr, previousSurveys, survey);

                SalesExecutionEngine.setObjectiveMeasure(csr, survey, gui.cust, gui.m_appliableObjectives);

                //add and link to customer survey
                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").add(csr);
            }

            //Build details from previous asso activity if assopreload feature is enabled
            if (UserContext.getConfigParam("ASSOPRELOAD_ENABLED", "0") != "0" && !survey.FLGALLOWDUPART) {

                var preloadedActivities = 0;
                var measureName = UserContext.getConfigParam("ASSOPRELOAD_MEASURE", "");
                var valuesToCheck = UserContext.getConfigParam("ASSOPRELOAD_VALUES", "");
                if (!XApp.isEmptyOrWhitespaceString(measureName) && !XApp.isEmptyOrWhitespaceString(valuesToCheck) && previousSurveys) {
                    var measureToCheck = null;
                    for (var jj = 0; jj < survey.SurveyMeasureDetails.length; jj++) {
                        if (survey.SurveyMeasureDetails[jj].CODMEASURE == measureName) {
                            measureToCheck = survey.SurveyMeasureDetails[jj];
                            break;
                        }
                    }
                    if (measureToCheck != null) {
                        //get values to check as array
                        //left and right trim ;

                        var separator = ';';
                        if (valuesToCheck[valuesToCheck.length - 1] == separator)
                            valuesToCheck = valuesToCheck.substring(0, valuesToCheck.length - 1);
                        if (valuesToCheck[0] == separator)
                            valuesToCheck = valuesToCheck.substring(1);

                        var values = valuesToCheck.split(separator);
                        if (values.length > 0) {
                            //get source survey if any
                            var sourceSurvey = previousSurveys.findBy(function (item) { return customerSurvey.get("CODTYPSURVEY") == item.get("CODTYPSURVEY"); });
                            if (sourceSurvey) {
                                for (var ii = 0; ii < sourceSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; ii++) {
                                    var csr = sourceSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(ii);
                                    //store the current view on the products in order to allow multiple (same CODART) articles to come from previous activity, if configuration allows it
                                    var existingDetails = customerSurvey.getSubEntityStore('MVCustomerSurveyRow').toArray();
                                    //check if detail is not alread present in customer survey
                                    //and is present in product collection loaded , so filters get applied also on preloaded articles
                                    var product = prdList.findByKey(CommonEngine.buildProductKey(csr.get("CODART"), csr.get("CODDIV")));
                                    if (product) {
                                        var search = Ext.Array.filter(existingDetails, function (item) { return (item.get("CODART") == csr.get("CODART") && item.get("CODDIV") == csr.get("CODDIV")); });
                                        if (search.length == 0) {
                                            //for each detail check if configured measure has one of configured values
                                            var valid = false;
                                            var valueToCheck = SalesExecutionEngine.getMeasureStringValue(csr, measureToCheck.FIELDNAME);
                                            if (valueToCheck == null) return;

                                            for (var v = 0; v < values.length; v++) {
                                                if (values[v] == valueToCheck) {
                                                    valid = true;
                                                    break;
                                                }
                                            }

                                            if (valid) {
                                                var csrCopy = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(customerSurvey);
                                                //copy codlocation from previous survey
                                                csrCopy.set("CODLOCATION", csr.get("CODLOCATION"));
                                                //region Set extra attributes from product
                                                csrCopy.copyAttributesFromProduct(product);

                                                SalesExecutionEngine.setDefaultMeasureValues(csrCopy, survey, false, false);

                                                //Populate ASSO. measures
                                                //Copy ASSO. measures from previous survey
                                                //Aggiungere la misura che specifica come il prodotto è stato definito nell’assortimento: “Obbligatorio / Facoltativo”. Se la misura è presente nella tipologia di rilevazone, il sistema la deve mostrare in sola lettra. 
                                                for (var sj = 0; sj < survey.SurveyMeasureDetails.length; sj++) {
                                                    if (survey.SurveyMeasureDetails[sj].CODMEASURE.indexOf(ParametersDefaultsAndStaticData.getInstance().getAssortmentMeasurePrefix() + "PRGCLIENT") == 0 && SalesExecutionEngine.shouldApplyMeasure(csrCopy, survey, survey.SurveyMeasureDetails[sj])) {
                                                        try {
                                                            var propValue = csr.get(survey.SurveyMeasureDetails[sj].FIELDNAME);
                                                            if (propValue != null)
                                                                csrCopy.set(survey.SurveyMeasureDetails[sj].FIELDNAME, propValue);
                                                        } catch (e) {
                                                            XLog.logErr("mobGuiVisit._buildRowDetailsFromAssortment - Unable to copy field " + survey.SurveyMeasureDetails[sj].FIELDNAME + "from previous Assortment CustomerSurveyRow object to CustomerSurveyRow object.");
                                                        }
                                                    }
                                                }

                                                SalesExecutionEngine.setPriceList(csrCopy, survey, gui.m_evalPriceListCollection);
                                                SalesExecutionEngine.setProductMeasure(csrCopy, survey, product);
                                                SalesExecutionEngine.setCustomerMeasure(csrCopy, survey, gui.cust);

                                                //populate details from previous survey
                                                SalesExecutionEngine.populateDetailsFromPreviousSurveys(csrCopy, previousSurveys, survey);

                                                SalesExecutionEngine.setObjectiveMeasure(csrCopy, survey, gui.cust, gui.m_appliableObjectives);


                                                //add and link to customer survey
                                                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").add(csrCopy);
                                                preloadedActivities++;

                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                XLog.logInfo("Building activity details from assortments. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + preloadedActivities.toString() + " detail rows imported from previous survey using ASSOPRELOAD feature.");
            }
        }

        handler();
    },
    this._buildRowDetailsFromPreviousSurvey = function (customerSurvey, previousSurveys, prdList, fakeProduct, handler, gui) {
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));

        //Enhancement #28307: Reevaluate assortment when editing an activity with existing details
        if (customerSurvey.reloadsAssortment) {
            XLog.logInfo("Re-evaluating assortment. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + prdList.length().toString() + " products, " + customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() + " existing details, " + (fakeProduct ? 1 : 0) + " fake product.");
            for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; i++) {
                var csr = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(i);
                //If the visit detail is not present in the assortment "ASSO.XXX" fields should be cleaned up
                SalesExecutionEngine.setAssoMeasure(csr, survey, null);
            }
        }
        else {

            if (customerSurvey.get("skipNewProducts")) {

                customerSurvey.getSubEntityStore('MVCustomerSurveyRow').removeBy(function (csr) { return !csr.isFakeProduct(); });
                customerSurvey.set("HEADER", null);

                if (fakeProduct != null && this._surveyHasHeaderMeasure(survey)) {
                    this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
                }

                XLog.logWarn("Skipping products adding due to missing mission filters. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ".");
            }
            else {

                if (previousSurveys) {

                    XLog.logInfo("Building activity details from previous survey. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + prdList.length().toString() + " products, " + (fakeProduct ? 1 : 0) + " fake product.");

                    customerSurvey.getSubEntityStore("MVCustomerSurveyRow").removeAll(true); //true = silent 
                    customerSurvey.set("HEADER", null);

                    if (fakeProduct != null && this._surveyHasHeaderMeasure(survey))
                        prdList.addRow(fakeProduct);

                    var prevSurveyForSameType = previousSurveys.findBy(function (item) { return customerSurvey.get("CODTYPSURVEY") == item.get("CODTYPSURVEY"); });

                    if (prevSurveyForSameType) {

                        var codLocation = 0;

                        var fakeProductFirstDetails = Ext.Array.sort(prevSurveyForSameType.getSubEntityStore('MVCustomerSurveyRow').toArray(), function (a, b) {
                            if (a.get("CODART") == ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode())
                                return -1;
                            if (b.get("CODART") == ParametersDefaultsAndStaticData.getInstance().getCustomerFakeProductCode())
                                return 1;
                            return 0;
                        });

                        for (var i = 0; i < fakeProductFirstDetails.length; i++) {
                            var previousCsr = fakeProductFirstDetails[i];

                            var product;
                            if (prdList != null && (product = prdList.findByKey(CommonEngine.buildProductKey(previousCsr.get("CODART"), previousCsr.get("CODDIV")))) != null) {

                                var csr = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(customerSurvey);
                                csr.set("CODLOCATION", codLocation);
                                codLocation++;

                                //region Set extra attributes from product
                                csr.copyAttributesFromProduct(previousCsr);

                                SalesExecutionEngine.setDefaultMeasureValues(csr, survey, false, false);

                                SalesExecutionEngine.setPriceList(csr, survey, gui.m_evalPriceListCollection);
                                SalesExecutionEngine.setProductMeasure(csr, survey, product);
                                SalesExecutionEngine.setCustomerMeasure(csr, survey, gui.cust);

                                //populate details from previous survey
                                SalesExecutionEngine.populateDetailsFromPreviousSurveys(csr, previousSurveys, survey, previousCsr);

                                SalesExecutionEngine.setObjectiveMeasure(csr, survey, gui.cust, gui.m_appliableObjectives);


                                //add and link to customer survey
                                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").add(csr);
                            }
                        }
                    }
                }
            }
        }

        handler();
    },
    this._buildRowDetailsForArt = function (customerSurvey, previousSurveys, fakeProduct, handler, gui) {
        var self = this;
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));

        XLog.logInfo("Building activity details for ART survey. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + (fakeProduct ? 1 : 0) + " fake product.");

        //ART survey must keep it's details in this case

        //Add the fake product to promo only if it does not already exist;
        if (fakeProduct != null && this._surveyHasHeaderMeasure(survey) && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item) { return item.isFakeProduct(); }) == null)
            self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);

        handler();
    },
    this._buildRowDetailsForPromo = function (customerSurvey, previousSurveys, existingDetailsCollection, fakeProduct, handler, gui) {
        var self = this;
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));

        XLog.logInfo("Building activity details for promo survey. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + existingDetailsCollection.getCount() + " existing promo details, " + (fakeProduct ? 1 : 0) + " fake product.");

        //remove all details except fake product
        var filterFn = function (x) {
            return (x.isFakeProduct());
        };
        customerSurvey.getSubEntityStore("MVCustomerSurveyRow").removeBy(filterFn);

        //Add the fake product to promo only if it does not already exist;
        if (fakeProduct != null && this._surveyHasHeaderMeasure(survey) && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item) { return item.isFakeProduct(); }) == null && customerSurvey.get("HEADER") == null)
            self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);

        //add existing (filtered) details
        customerSurvey.getSubEntityStore("MVCustomerSurveyRow").addAll(existingDetailsCollection.items);

        handler();
    },
    //Build ASSET activity details. Add fake product if it exists and load existing details in the survey if any.
    this._buildRowDetailsFromAssets = function (customerSurvey, previousSurveys, assetsBalance, prdList, fakeProduct, handler, gui) {
        var self = this;
        var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
        var codLocation = 0;
        var csr, assetKey, cab;
        var existingDetails = {};

        if (customerSurvey.reloadsAssets) {
            XLog.logInfo("Re-evaluating assets. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + assetsBalance.getCount().toString() + " assets, " + prdList.length().toString() + " products, " + customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() + " existing details, " + (fakeProduct ? 1 : 0) + " fake product.");

            var idBatchMeasureName = ParametersDefaultsAndStaticData.getInstance().getAssetBatchIdMeasureName();
            var idBatchMeasure = null;
            for (var i = 0; i < survey.SurveyMeasureDetails.length; i++) {
                if (survey.SurveyMeasureDetails[i]["CODMEASURE"] == idBatchMeasureName) {
                    idBatchMeasure = survey.SurveyMeasureDetails[i];
                }
            }
            var idBatchFieldName = idBatchMeasure ? idBatchMeasure.FIELDNAME : "";

            for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; i++) {
                csr = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(i);

                assetKey = [
                    csr.get("CODART"),
                    csr.get("CODDIV"),
                    idBatchFieldName ? csr.get(idBatchFieldName) : ""
                ].join("|");
                cab = assetsBalance.findBy(assetKey);

                if (cab) {
                    //For all the product in the visit detail, reset the "ASSET.XXX" measures with the current ones
                    SalesExecutionEngine.setAssetMeasure(csr, survey, cab);
                    //mark assets already present so at the next step we don't add them again
                    existingDetails[assetKey] = true;
                } else {

                    //If the visit detail is not present any more, "ASSET.XXX" fields should be cleaned up
                    SalesExecutionEngine.setAssetMeasure(csr, survey, null);
                }

                var loc = parseInt(csr.get("CODLOCATION"));
                if (codLocation <= loc && !isNaN(loc))
                    codLocation = loc + 1;
            }
        } else {
            if (customerSurvey.get("skipNewProducts")) {

                customerSurvey.getSubEntityStore('MVCustomerSurveyRow').removeBy(function (csr) { return !csr.isFakeProduct(); });
                customerSurvey.set("HEADER", null);

                if (fakeProduct != null && this._surveyHasHeaderMeasure(survey)) {
                    this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
                }

                XLog.logWarn("Skipping products adding due to missing mission filters. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ".");
            }
            else {
                XLog.logInfo("Building activity details from assets. For " + customerSurvey.get("CODTYPSURVEY") + " of type " + survey.CODTYPDETAIL + ". " + assetsBalance.getCount().toString() + " assets, " + prdList.length().toString() + " products, " + (fakeProduct ? 1 : 0) + " fake product.");

                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").removeAll(true); //true = silent 
                customerSurvey.set("HEADER", null);

                //Create detail also for the fake product if any
                if (fakeProduct != null && this._surveyHasHeaderMeasure(survey))
                    self._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, fakeProduct, gui, false, false);
            }
        }

        if (!customerSurvey.get("skipNewProducts")) {
            //Build details from assets
            assetsBalance.eachKey(function (assetKey, assets) {
                if (existingDetails[assetKey] || assets.length == 0)
                    return;

                //there is one asset balance per key
                cab = assets[0];

                //do not add new row detail if collection already contains one detail for the same asset
                if (!survey.FLGALLOWDUPART && customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item, index, length) {
                    return (item.get("CODART") == cab.CODART && item.get("CODDIV") == cab.CODDIV);
                }) != null)
                    return;

                csr = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(customerSurvey);
                csr.set("CODLOCATION", codLocation);
                codLocation++;

                csr.set("isNewInAssets", customerSurvey.reloadsAssets);

                //region Set extra attributes from product
                var product = prdList.findByKey(CommonEngine.buildProductKey(cab.CODART, cab.CODDIV));
                if (!product) {
                    return;
                }
                csr.copyAttributesFromProduct(product);

                SalesExecutionEngine.setDefaultMeasureValues(csr, survey, false, false);
                SalesExecutionEngine.setAssetMeasure(csr, survey, cab);
                SalesExecutionEngine.setProductMeasure(csr, survey, product);
                SalesExecutionEngine.setCustomerMeasure(csr, survey, gui.cust);

                //populate details from previous survey
                SalesExecutionEngine.populateDetailsFromPreviousSurveys(csr, previousSurveys, survey);

                SalesExecutionEngine.setObjectiveMeasure(csr, survey, gui.cust, gui.m_appliableObjectives);

                //add and link to customer survey
                customerSurvey.getSubEntityStore("MVCustomerSurveyRow").add(csr);
            });
        }

        handler();
    },
    this._buildCustomerActivityDetails = function (customerSurvey, gui) {

        var context = {
            gui: gui,
            customerSurvey: customerSurvey,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeBuildCustomerActivityDetails', context);
        if (context.canceled)
            return;


        // maintain separate details collection with only  fake product
        var fakeProduct = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").findBy(function (item) {
            return item.isFakeProduct();
        });

        if (fakeProduct) {
            customerSurvey.set("HEADER", fakeProduct);
            customerSurvey.getSubEntityStore("MVCustomerSurveyRow").remove(fakeProduct);
            fakeProduct.setParentEntity(customerSurvey);
        }

        // ONLY for ORDER surveys check again if there is a valid order 
        if (customerSurvey.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey())
            this._checkAndUpdateOrderStatus(gui, customerSurvey);

        // ONLY for ENCASHMENT surveys check again if there is a valid order 
        if (customerSurvey.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey())
            this._checkAndUpdateEncashmentStatus(gui, customerSurvey);

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterBuildCustomerActivityDetails', context);
    },
    this._buildProductActivityDetails = function (customerSurvey) {

        var context = {
            customerSurvey: customerSurvey,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeBuildProductActivityDetails', context);
        if (context.canceled)
            return;

        //maintain merged product list
        var visit = customerSurvey.MobVisitBelongsToInstance;

        // maintain separate details collection with only non fake products
        var fakeProduct = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").findBy(function (item) {
            return item.isFakeProduct();
        });

        if (fakeProduct) {
            customerSurvey.set("HEADER", fakeProduct);
            customerSurvey.getSubEntityStore("MVCustomerSurveyRow").remove(fakeProduct);
            fakeProduct.setParentEntity(customerSurvey);
        }

        // Load replicated values
        //  At the first load, even if the measure is marked as FLGSAMEVALUE, the default value for the measure should not be replicated to existing measures. 
        //More than this: if a measure is marked as FLGSAMEVALUE and an activity that contain the measure already exists in the visit, the measure should not be preloaded with the default (or previos value) but with the value set in the existing visit for the same article / measure.
        if (!customerSurvey.isAtFirstLoad && customerSurvey.reloadsData) {
            var details = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").toArray();
            SalesExecutionEngine.loadReplicatedValues({ cs: customerSurvey, "details": details });
            this._checkSurveyAnomaliesFast(customerSurvey);
        } else
            this._notifyProductCSLoaded(visit);


        //Filter details according to measure settings
        //Alters CustomerSurveyRowDetails collection
        SalesExecutionEngine.filterCustomerSurveyRowsByMeasures(customerSurvey);

        //Sort customer survey row details by the order in SORTATTRIBUTE1(2,3) fields.
        SalesExecutionEngine.sortCustomerSurveyRowsBySurveyType(customerSurvey);

        customerSurvey.isAtFirstLoad = false;

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterBuildProductActivityDetails', context);
    },
    //#region CONTACT ACTIVITY
    //Init Linked Contacts
    this._loadContactDetails = function (gui, onFailure, onSuccess) {
        try {

            var context = {
                gui: gui,
                onFailure: onFailure,
                onSuccess: onSuccess,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeLoadContactDetails', context);
            if (context.canceled)
                return;

            var visit = gui.getDocument();
            if (!XApp.isEmptyOrWhitespaceString(visit.get("CODPARTY")));
            {
                if (!visit.contactActivity)
                    visit.contactActivity = new XEntity({ entityName: 'MVCustomerSurvey' });

                var entityStore = visit.contactActivity.getSubEntityStore("MVCustomerSurveyContact");
                entityStore.clear();

                var partyContactTable = XNavHelper.getFromMemoryCache("NAV_MOB_PARTYCONTACT");
                if (!partyContactTable) {
                    XLog.logErr("Unable to find navigator NAV_MOB_PARTYCONTACT. PartyContact detais will be unavailable.");
                    onSuccess();
                    return;
                }

                for (var i = 0; i < partyContactTable.Rows.length; i++) {
                    var row = partyContactTable.Rows[i];
                    if (row.getValueFromName("CODPARTY") == visit.get("CODPARTY")
                        && row.getValueFromName("CODDIV") == UserContext.CodDiv
            && SalesExecutionEngine.trunkDate(row.get("DTEFROM")) - new Date().toDate() <= 0
            && SalesExecutionEngine.trunkDate(row.get("DTETO")) - new Date().toDate() >= 0) {
                        var customerSurveyContact = new XEntity({ entityName: "MVCustomerSurveyContact" });
                        customerSurveyContact.set("ASSOCIATED", false);
                        customerSurveyContact.set("CODPER", row.getValueFromName("CODPER"));
                        customerSurveyContact.set("CODASSOC", row.getValueFromName("CODASSOC"));
                        customerSurveyContact.set("CODTITLE", row.getValueFromName("CODTITLE"));
                        customerSurveyContact.set("DESPARTY2", row.getValueFromName("DESPARTY2"));
                        customerSurveyContact.set("DESPARTY1", row.getValueFromName("DESPARTY1"));
                        customerSurveyContact.set("CODROLE1", row.getValueFromName("CODROLE1"));
                        customerSurveyContact.set("CODROLE2", row.getValueFromName("CODROLE2"));
                        customerSurveyContact.set("CODROLE3", row.getValueFromName("CODROLE3"));
                        customerSurveyContact.set("FLGPRIMARY", (row.getValueFromName("FLGPRIMARY") != "0"));
                        customerSurveyContact.set("DESNOTE", row.getValueFromName("DESNOTE"));
                        customerSurveyContact.set("NUMPHONE1", row.getValueFromName("NUMPHONE1"));
                        customerSurveyContact.set("NUMPHONE2", row.getValueFromName("NUMPHONE2"));
                        customerSurveyContact.set("EMAIL1", row.getValueFromName("EMAIL1"));
                        customerSurveyContact.set("WEBSITE1", row.getValueFromName("WEBSITE1"));
                        customerSurveyContact.set("WEBSITE2", row.getValueFromName("WEBSITE2"));
                        customerSurveyContact.set("DTEFROM", SalesExecutionEngine.trunkDate(row.get("DTEFROM")));
                        customerSurveyContact.set("DTETO", SalesExecutionEngine.trunkDate(row.get("DTETO")));

                        entityStore.add(customerSurveyContact);
                    }
                }

                //rebind stores
                this._refreshContactsGrid(gui);
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterLoadContactDetails', context);

            onSuccess();

        } catch (e) {
            onFailure(e);
        }
    },
    //Merge Linked Contacts
    this._mergeContactDetails = function (cs, gui, failureCallback, onSuccess) {
        try {

            var context = {
                gui: gui,
                cs: cs,
                failureCallback: failureCallback,
                onSuccess: onSuccess,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeMergeContactDetails', context);
            if (context.canceled)
                return;

            var visit = gui.getDocument();
            if (visit.contactActivity) {
                var allContactsStore = visit.contactActivity.getSubEntityStore("MVCustomerSurveyContact");

                var surveyContactsStore = cs.getSubEntityStore("MVCustomerSurveyContact");

                var modified = false;

                for (var i = 0; i < allContactsStore.getCount() ; i++) {
                    var contactA = allContactsStore.getAt(i);
                    var codassoc = contactA.get("CODASSOC");
                    var codper = contactA.get("CODPER");
                    for (var j = 0; j < surveyContactsStore.getCount() ; j++) {
                        var contactB = surveyContactsStore.getAt(j);
                        if (codassoc == contactB.get("CODASSOC") && codper == contactB.get("CODPER")) {
                            contactA.set("ASSOCIATED", true);
                            modified = true;
                            break; //break inner loop
                        }
                    }
                }

                if (modified)
                    this._refreshContactsGrid(gui);
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterMergeContactDetails', context);
            onSuccess();
        } catch (e) {
            onFailure(e);
        }
    };

    this._refreshContactsGrid = function (gui) {
        try {
            var context = {
                gui: gui,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRefreshContactsGrid', context);
            if (context.canceled)
                return;

            var refresh = (function (gui) {
                return function () {

                    var mDetailContext = gui.tabCtrls["CONTACTS"];
                    if (mDetailContext) {
                        if (mDetailContext.sections["CONTACTS_GRID"]) {
                            var gridContacts = mDetailContext.sections["CONTACTS_GRID"].grid.getStore();
                            var rows = gui.getDocument().contactActivity.getSubEntityStore("MVCustomerSurveyContact");
                            rows.rebindSenchaStore(gridContacts);
                        }
                    }

                    XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRefreshContactsGrid', { gui: gui });
                };
            })(gui);
            setTimeout(refresh, 100);
        } catch (e) {
            XLog.logErr("Unable to refresh CONTACTS_GRID");
            XLog.logEx(e);
        }
    };
    //#endregion

    //#region CUSTOMER SURVEY PICTURE - PHOTOS TAB
    this._loadAllCustomerSurveyPictures = function (gui, onFailure, onSuccess) {
        try {
            var context = {
                gui: gui,
                onFailure: onFailure,
                onSuccess: onSuccess,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeLoadAllCustomerSurveyPictures', context);
            if (context.canceled)
                return;

            var self = this;
            var visit = gui.getDocument();
            var finishHandler = function (e) {

                if (e) {
                    XLog.logErr("mobGuiVisit.LoadAllCustomerSurveyPictures finished with errors.");
                    XLog.logEx(e);
                }

                self._refreshPhotosTab(gui);
                XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterLoadAllCustomerSurveyPictures', context);
                onSuccess();
            };
            if (!XApp.isEmptyOrWhitespaceString(visit.get("CODPARTY"))) {
                gui.m_photoSurveys = [];
                gui.m_allCustomerSurveyPictures = [];
                if (!visit.m_customerSurveyPictureUniquePath)
                    visit.m_customerSurveyPictureUniquePath = (new Date()).getTime().toString();

                var sortedSurveys = Ext.Array.sort(visit.getSubEntityStore("MVCustomerSurvey").toArray(), function (a, b) {
                    return SalesExecutionEngine.CompareSurveys(a, b);
                });
                Ext.Array.forEach(sortedSurveys, function (cs) {
                    self._addPhotoSurvey(gui, cs);
                });

                if (gui.m_allCustomerSurveyPictures.length > 0) {
                    var surveyIDs = [];
                    Ext.Array.forEach(gui.m_allCustomerSurveyPictures, function (csp) {
                        if (surveyIDs.indexOf(csp.get("IDSURVEY")) == -1)
                            surveyIDs.push(csp.get("IDSURVEY"));
                    });
                    CspEngine.loadVisitCustomerSurveyPictures(visit, surveyIDs, gui.getDocument().m_customerSurveyPictureUniquePath, finishHandler, finishHandler);
                } else
                    finishHandler();
            } else
                finishHandler();
        } catch (e) {
            onFailure(e);
        }
    },
    this._addImage = function (gui, photosPanel, csp) {
        try {

            var self = this;

            var mDetailContext = gui.tabCtrls["PHOTOS"];
            var section = mDetailContext.sections["CUSTOMERSURVEYPCITURES"];

            var existingRows = photosPanel.getItems();

            var columns = section.sectionContext.config.attrs["columns"];
            columns = columns && !isNaN(columns) ? columns : (XApp.isPhone() ? 2 : 4);

            var imageHeight = section.sectionContext.config.attrs["maxImageHeight"];
            imageHeight = imageHeight ? imageHeight : "100px";

            //if the last row is full then add a new one
            if (existingRows.length == 0 || existingRows.getAt(existingRows.length - 1).getItems().length == columns) {
                var currentRow = Ext.create('Ext.Panel', {
                    layout: {
                        type: 'hbox',
                        pack: 'start'
                    }
                });

                photosPanel.add(currentRow); //append row
            } else
                var currentRow = existingRows.getAt(existingRows.length - 1); //fetch last row

            var options = {
                gui: gui,
                isNewDetail: false,
                entity: csp,
                parentCtrl: mDetailContext
            };

            var picturePanel = Ext.create('XButton', {
                layout: {
                    type: 'fit'
                },
                cls: "se-customersurveypicture",
                html: "<div ALIGN=center class='img'><img style='max-height:" + imageHeight + "' src='' /></div><div ALIGN=center class='imgText'>" + csp.get('DESPICTURE') + "</div>",
                styleHtmlContent: true,
                width: (100 / columns) + "%",
                // height: imageHeight
                SM1Listeners: {
                    onPress: (function (options) {
                        return function () {
                            self._openCustomerSurveyPictureDetail(options);
                        };
                    })(options)
                }
            });

            CspEngine.getFileAsBase64(gui.getDocument(), csp.get("IDFILE"), csp.get("IDFILE"), function (base64) {
                if (!picturePanel.isDestroyed)
                    picturePanel.setHtml("<div ALIGN=center class='img'><img style='max-height:" + imageHeight + "' src='" + base64 + "' /></div><div ALIGN=center class='imgText'>" + csp.get('DESPICTURE') + "</div>");
            }, Ext.emptyFn);

            currentRow.add(picturePanel);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this._removePhotoSurvey = function (gui, cs) {
        var self = this;
        var idx = gui.m_photoSurveys.indexOf(cs);
        if (idx != -1) {
            gui.m_photoSurveys.splice(idx, 1);

            gui.m_allCustomerSurveyPictures = [];
            Ext.Array.forEach(gui.m_photoSurveys, function (cs) {
                cs.getSubEntityStore("MVCustomerSurveyPicture").each(function (csp) {
                    if (csp.get("PICTURESTATUS") != SalesExecutionNameSpace.CustomerSurveyPictureStatus.DELETED)
                        gui.m_allCustomerSurveyPictures.push(csp);
                });
            });


            setTimeout(function () { self._refreshPhotosTab(gui); }, 50);
        }
    };
    this._addPhotoSurvey = function (gui, cs) {
        if (SalesExecutionEngine.isPhotoSurvey(cs)) {
            gui.m_photoSurveys.push(cs);

            cs.getSubEntityStore("MVCustomerSurveyPicture").each(function (csp) {
                if (csp.get("PICTURESTATUS") != SalesExecutionNameSpace.CustomerSurveyPictureStatus.DELETED)
                    gui.m_allCustomerSurveyPictures.push(csp);
            });
        }
    };

    this._refreshPhotosTab = function (gui) {
        var self = this;
        try {
            var context = {
                gui: gui,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRefreshPhotosTab', context);
            if (context.canceled)
                return;

            //add pictures to carousel control
            var photosPanel = self._getPhotosControl(gui);
            if (photosPanel) {
                photosPanel.removeAll(true);

                Ext.Array.forEach(gui.m_allCustomerSurveyPictures, function (csp) {
                    self._addImage(gui, photosPanel, csp);
                });
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRefreshPhotosTab', context);
        } catch (e) {
            XLog.logErr("Unable to refresh photos tab");
        }
    };

    this._getPhotosControl = function (gui) {
        try {
            if (gui.tabCtrls) {
                var mDetailContext = gui.tabCtrls["PHOTOS"];
                if (mDetailContext && mDetailContext.mainPanel && mDetailContext.mainPanel.isRendered()) {
                    return mDetailContext.sections["CUSTOMERSURVEYPCITURES"].getAt(1);
                }
            }
        } catch (e) {
            XLog.logErr("Unable to find carousel control in CUSTOMERSURVEYPCITURES section.");
        }
        return null;
    };

    this._startPlanoramaBackgroundProcess = function (gui) {
        var f = (function (idVisit) {
            return function () {
                if (XApp.isOnline()) {
                    var surveys = [];
                    //for each survey inside the visit, check for planorama jobs
                    gui.getDocument().MVCustomerSurveyDetailsStore.each(function (cs) {
                        if (XApp.isEmptyOrWhitespaceString(cs.get("PLANORAMASTATUS")) || cs.get("PLANORAMASTATUS") == SalesExecutionNameSpace.PlanoramaSM1ProcessingStatus.COMPLETED)
                            return;
                        //if the survey has been already saved, don't add it to the list
                        if (gui.savedPlanoramaSurveys && gui.savedPlanoramaSurveys.indexOf(cs.get("IDSURVEY")) != -1)
                            return;
                        surveys.push(cs.get("IDSURVEY"));
                    });
                    if (surveys.length > 0) {
                        XLog.logInfo("Checking for planorama jobs");
                        XHttpHelper.ExecuteServerOp(
                            {
                                assemblyName: 'Xtel.SM1.Touch',
                                className: 'Xtel.SM1.Touch.SalesExecution.SalesExecutionTouchEngines',
                                methodName: 'CheckPlanoramaJobs',
                                data: {
                                    surveys: surveys
                                }
                            },
                            function (response, textStatus, e) {
                                XUI.showExceptionMsgBox(e);
                            },
                            function (response) {
                                //if mobGuiVisit is still opened
                                if (gui.planoramaBackgroundProcessID && gui.getDocument().get("IDVISIT") == idVisit) {
                                    //on success
                                    if (response.reschedule) {
                                        XLog.logInfo("There are planorama jobs with the status Pending or Uploading. Rescheduling the background process");
                                        gui.planoramaBackgroundProcessID = setTimeout(f, ParametersDefaultsAndStaticData.getInstance().getPlanoramaClientPoolTime());
                                        return;
                                    }
                                    if (response.save) {
                                        XLog.logInfo("There are planorama jobs with the status Processed. Save the document to see the changes");
                                        clearTimeout(gui.planoramaBackgroundProcessID);
                                        XUI.showMsgBox({
                                            title: "[MOB.SCHEDULE]",
                                            msg: UserContext.tryTranslate("[MOBVISIT.PLANORAMA_FINISHED]"),
                                            icon: 'INFO',
                                            buttons: 'OK',
                                            onResult: function () {
                                                gui.setModified(gui.getDocument());
                                                gui.saveDocNoConfirmation(function () {
                                                    //remember which planorama surveys have been saved already
                                                    var savedPlanoramaSurveys = gui.savedPlanoramaSurveys;
                                                    if (!savedPlanoramaSurveys)
                                                        savedPlanoramaSurveys = [];
                                                    gui.reload();
                                                    gui.clearModified();
                                                    //remember that the planorama results have been saved for this CustomerSurvey
                                                    for (var i = 0; i < response.processedSurveys.length; i++) {
                                                        var survey = response.processedSurveys[i];
                                                        if (savedPlanoramaSurveys.indexOf(survey) == -1)
                                                            savedPlanoramaSurveys.push(survey);
                                                    }
                                                    gui.savedPlanoramaSurveys = savedPlanoramaSurveys;
                                                });
                                            }
                                        });
                                    }
                                }
                            }
                        );
                    }
                }
            };
        })(gui.getDocument().get("IDVISIT"));
        gui.planoramaBackgroundProcessID = setTimeout(f, ParametersDefaultsAndStaticData.getInstance().getPlanoramaClientPoolTime());
    };

    this._processPlanoramaPicture = function (gui, detailContext, cs, data) {
        var self = this;
        var visit = gui.getDocument();
        var idSurvey = cs.get("IDSURVEY");
        //increment the planorama images counter
        cs.set("PLANORAMA_IMAGES", cs.get("PLANORAMA_IMAGES") + 1);
        //add the image to the collection
        var idFile = XApp.newGUID();
        PlanoramaEngine.addFileToTempCollection(visit, {
            base64: data.data,
            file: data.file,
            metaData: {
                docKey: idSurvey,
                des: idFile,
                ext: data.ext,
                idFile: idFile
            }
        }, function (file) {
            var base64Image = file.base64;
            //enable the PROCESS_PLANORAMA button
            detailContext.setSectionButtonsStatus();
            //add the picture to TA0194
            var idFile = XApp.newUserGUID();
            var csp = {
                base64: base64Image,
                metaData: {
                    docKey: idFile,
                    des: data.des,
                    ext: data.ext,
                    idFile: idFile,
                    uniquePath: gui.getDocument().m_customerSurveyPictureUniquePath
                }
            };
            CspEngine.addFileToTempCollection(gui.getDocument(), csp, function () {
                //create CSP xentity
                var newCsp = new XEntity({ entityName: 'MVCustomerSurveyPicture' });
                newCsp.set("IDPICTURE", csp.metaData.idFile);
                newCsp.set("IDFILE", csp.metaData.idFile);
                newCsp.set("IDFILEPREVIEW", csp.metaData.idFile);
                newCsp.set("PICTURESTATUS", SalesExecutionNameSpace.CustomerSurveyPictureStatus.NEW);
                newCsp.set("UNIQUEFOLDER", gui.getDocument().m_customerSurveyPictureUniquePath);
                newCsp.set("DESPICTURE", data.des);
                newCsp.set("IDSURVEY", idSurvey);
                //add it to the store and to the pictures list
                cs.MVCustomerSurveyPictureDetailsStore.add(newCsp);
                gui.m_allCustomerSurveyPictures.push(newCsp);
                var photosControl = self._getPhotosControl(gui);
                if (photosControl)
                    self._addImage(gui, photosControl, newCsp);
                XUI.hideWait();
            }, function (e) {
                XUI.hideWait();
                XUI.showExceptionMsgBox(e);
            });
        });
    };

    this._takePlanoramaPicture = function (gui, detailContext, cs) {
        var self = this;
        if (XApp.environment.isChrome)
            XPhotoPicker.takePhoto(
                function (data) {
                    if (data) {
                        XUI.showWait();
                        data.ext = "jpg";
                        self._processPlanoramaPicture(gui, detailContext, cs, data);
                    } else {
                        XUI.hideWait();
                    }
                },
                function (e) {
                    XUI.hideWait();
                    XUI.showExceptionMsgBox(e);
                });
        else {
            this._uploadPlanoramaPicture(gui, detailContext, cs);
        }
    };

    this._uploadPlanoramaPicture = function (gui, detailContext, cs) {
        var self = this;

        XFilePicker.uploadFile(function (data) {
            if (data) {
                var fileName = data.file.name;
                data.ext = fileName.substring(fileName.lastIndexOf('.') + 1, fileName.length);
                self._processPlanoramaPicture(gui, detailContext, cs, data);
            }
        }, function (e) {
            XUI.showErrorMsgBox(e);
        }, '.JPG,.PNG,.JPEG,.GIF');
    };
    /*
    Shoot a picture for a new customer survey picture
     context={
         gui,
         MVCustomerSurvey, //can be null
         CODART,  //can be null
         CODDIV  //can be null
          FLGCOMPETITOR: //can be null
        detailContext
       }
    */
    this._takeCustomerSurveyPicture = function (context) {
        var self = this;

        XPhotoPicker.takePhoto(
            function (data) {
                if (data) {

                    XUI.showWait();
                    var base64Image = data.data;
                    context.description = data.des;
                    context.image = base64Image;

                    var idFile = XApp.newUserGUID();
                    var csp = {
                        base64: base64Image,
                        metaData: {
                            docKey: idFile,
                            des: data.des,
                            ext: "jpg",
                            idFile: idFile,
                            uniquePath: context.gui.getDocument().m_customerSurveyPictureUniquePath
                        }
                    };
                    CspEngine.addFileToTempCollection(context.gui.getDocument(), csp, function () {
                        self._createNewCustomerSurveyPicture(csp.metaData.idFile, context);
                    }, function (e) {
                        XUI.hideWait();
                        XUI.showExceptionMsgBox(e);
                    });
                }
            },
            function (e) {
                XUI.showExceptionMsgBox(e);
            });

    };
    /*
    Upload a picture for a new customer survey picture
    context={
       gui,
       MVCustomerSurvey, //can be null
       CODART,  //can be null
       CODDIV  //can be null
        FLGCOMPETITOR: //can be null
      detailContext
     }
    */
    this._uploadCustomerSurveyPicture = function (context) {
        var self = this;

        XFilePicker.uploadFile(function (data) {
            if (data) {
                XUI.showWait();

                context.description = data.des;
                var fileName = data.file.name;
                var idFile = XApp.newUserGUID();
                var csp = {
                    file: data.file,
                    metaData: {
                        docKey: idFile,
                        des: data.des,
                        ext: fileName.substring(fileName.lastIndexOf('.') + 1, fileName.length),
                        idFile: idFile,
                        uniquePath: context.gui.getDocument().m_customerSurveyPictureUniquePath
                    }
                };
                CspEngine.addFileToTempCollection(context.gui.getDocument(), csp, function () {
                    self._createNewCustomerSurveyPicture(csp.metaData.idFile, context);
                }, function (e) {
                    XUI.hideWait();
                    XUI.showExceptionMsgBox(e);
                });
            }
        }, function (e) {
            XUI.showErrorMsgBox(e);
        }, '.JPG,.PNG,.GIF,.JPEG');
    };

    this._createNewCustomerSurveyPicture = function (idFile, context) {
        try {
            //CREATE CSP xentity
            var visit = context.gui.getDocument();
            var newCsp = new XEntity({ entityName: 'MVCustomerSurveyPicture' });
            newCsp.set("IDPICTURE", idFile);
            newCsp.set("IDFILE", idFile);
            newCsp.set("IDFILEPREVIEW", idFile);
            newCsp.set("PICTURESTATUS", SalesExecutionNameSpace.CustomerSurveyPictureStatus.NEW);
            newCsp.set("UNIQUEFOLDER", context.gui.getDocument().m_customerSurveyPictureUniquePath); //store here temporary the unique path for the user folder


            if (!XApp.isEmptyOrWhitespaceString(context.description))
                newCsp.set("DESPICTURE", context.description);

            if (!XApp.isEmptyOrWhitespaceString(context.CODART) && !XApp.isEmptyOrWhitespaceString(context.CODDIV)) {
                //add photo for survey only.
                newCsp.set("CODART", context.CODART);
                newCsp.set("CODDIV", context.CODDIV);
            }

            if (context.FLGCOMPETITOR != undefined) {
                //add photo for survey only.
                newCsp.set("FLGCOMPETITOR", context.FLGCOMPETITOR != 0);
            }

            if (context.MVCustomerSurvey) {
                newCsp.set("IDSURVEY", context.MVCustomerSurvey.get("IDSURVEY"));
            } else
                newCsp.set("IDSURVEY", context.gui.m_photoSurveys[0].get("IDSURVEY")); //pre populate with id of first photo survey available

            //open popup with new entity
            var options = {
                gui: context.gui,
                isNewDetail: true,
                entity: newCsp,
                parentCtrl: context.gui.tabCtrls["PHOTOS"]
            };

            this._openCustomerSurveyPictureDetail(options);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        } finally {
            XUI.hideWait();
        }
    };

    /*
      option={
        gui,
        isNewDetail,
        entity,
        editable,
        afterCloseHandler,
        parentCtrl,
        hostPanel,
        entityName
      }
    */
    this._openCustomerSurveyPictureDetail = function (options) {
        var self = this;

        var afterCloseHandler = (function (options) {
            return function (opt) {

                var csp = options.entity;
                var visit = options.gui.getDocument();

                if (opt.canceled) {
                    switch (opt.reason) {
                        case "CANCEL":
                            if (options.isNewDetail) {
                                //remove from cache
                                CspEngine.deleteFileFromTempCollection(options.gui.getDocument(), options.entity.get("IDFILE"), options.entity.get("IDFILE"));
                            }
                            return;
                        case "REMOVE":
                            {
                                if (options.isNewDetail) {
                                    break;
                                } else {

                                    //DO NOT Remove from parent. (it needs to reach server with deleted status
                                    //We need to add it back because popup removeDetail function removed it from parent store
                                    var customerSurvey = visit.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                                        return cs.get("IDSURVEY") == csp.get("IDSURVEY");
                                    });
                                    customerSurvey.getSubEntityStore("MVCustomerSurveyPicture").add(csp);

                                    //set status to deleted
                                    csp.set("PICTURESTATUS", SalesExecutionNameSpace.CustomerSurveyPictureStatus.DELETED);

                                    //remove from all surveys list
                                    var idx = options.gui.m_allCustomerSurveyPictures.indexOf(csp);
                                    options.gui.m_allCustomerSurveyPictures.splice(idx, 1);

                                    //refresh survey's tab and pictures control
                                    self._updateCalculatedMeasures(customerSurvey, SalesExecutionNameSpace.CalculationTriggers.SHOW, options.gui, true);
                                    self._validate(customerSurvey);
                                    self._updateSurveyEvalAnomStatus(customerSurvey);
                                    self._refreshPhotosTab(options.gui);
                                }
                                CspEngine.deleteFileFromTempCollection(options.gui.getDocument(), options.entity.get("IDFILE"), options.entity.get("IDFILE"));
                                break;
                            }
                    }
                } else {
                    //if valid
                    if (opt.modified || options.isNewDetail) {

                        var customerSurvey = options.gui.getDocument().getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                            return cs.get("IDSURVEY") == csp.get("IDSURVEY");
                        });

                        //the picture is not new and it's parent has changed
                        if (options.entity.getParentEntity() && options.entity.getParentEntity().get("IDSURVEY") != options.entity.get("IDSURVEY")) {
                            var oldCustSurvey = options.entity.getParentEntity();
                            //remove from old parent
                            oldCustSurvey.getSubEntityStore("MVCustomerSurveyPicture").remove(options.entity);
                            // refresh old customer survey
                            self._updateCalculatedMeasures(oldCustSurvey, SalesExecutionNameSpace.CalculationTriggers.SHOW, options.gui, true);

                            //add in new one
                            customerSurvey.getSubEntityStore("MVCustomerSurveyPicture").add(options.entity);
                        }

                        //refresh pictures control
                        if (options.isNewDetail) {
                            //picture is new and has  no parent - just add                          
                            customerSurvey.getSubEntityStore("MVCustomerSurveyPicture").add(options.entity);

                            options.gui.m_allCustomerSurveyPictures.push(options.entity);
                            self._addImage(options.gui, self._getPhotosControl(options.gui), options.entity);

                        } else
                            self._refreshPhotosTab(options.gui);

                        // refresh new customer survey
                        self._updateCalculatedMeasures(customerSurvey, SalesExecutionNameSpace.CalculationTriggers.SHOW, options.gui, true);
                        self._validate(customerSurvey);
                        self._updateSurveyEvalAnomStatus(customerSurvey);

                        //set document as modified
                        options.gui.setModified();
                    }
                    if (opt.reason == "PREV" || opt.reason == "NEXT") {
                        var idx = options.gui.m_allCustomerSurveyPictures.indexOf(csp);
                        if (opt.reason == "PREV") {
                            if (idx == 0)
                                return;
                            idx--;
                        }
                        if (opt.reason == "NEXT") {
                            if (idx == options.gui.m_allCustomerSurveyPictures.length - 1)
                                return;
                            idx++;
                        }

                        var context = {
                            gui: options.gui,
                            isNewDetail: false,
                            entity: options.gui.m_allCustomerSurveyPictures[idx],
                            parentCtrl: options.parentCtrl
                        };
                        setTimeout(function () { self._openCustomerSurveyPictureDetail(context); }, 50);
                    }
                }


            };
        })(options);

        var options = {
            gui: options.gui,
            isNewDetail: options.isNewDetail,
            newEntity: options.entity,
            parentCtrl: options.parentCtrl,
            entityName: "MVCustomerSurveyPicture",
            afterCloseHandler: afterCloseHandler,
            editable: options.gui.openMode != 'VIEW'
        };

        var context = {
            options: options,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeOpenCustomerSurveyPictureDetail', context);
        if (context.canceled)
            return;

        options.gui.openSubDetail(options);
    };

    //Open full-sized customer survey picture in new page
    this._openCustomerSurveyPicture = function (gui, csp) {
        XUI.showWait();
        CspEngine.getFileAsURL(gui.getDocument(), csp.get("IDFILE"), gui.getDocument().m_customerSurveyPictureUniquePath, function (picUrl) {
            XUI.hideWait();
            XApp.openURL(picUrl);
        }, function (e) {
            XUI.hideWait();
            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOBGUIVISIT.CSP_NOT_CACHED]") });
        });
    };

    //#endregion

    // Create new detail row from product information
    //customerSurvey: entity that represents a CustomerSurvey object
    //previousSurveys: Ext.util.MixedCollection of CustomerSurvey entity objects
    //survey:  surevy type object
    //product:  XDataRow with product data
    this._populateCustomerSurveyRow = function (customerSurvey, csr, previousSurveys, survey, product, gui, manuallyAdded, fromBarcodeScanner) {

        csr.set("CODLOCATION", SalesExecutionEngine.getMaxCodLocation(customerSurvey) + 1);

        //region Set extra attributes from product
        csr.copyAttributesFromProduct(product);

        SalesExecutionEngine.setDefaultMeasureValues(csr, survey, manuallyAdded, fromBarcodeScanner);

        //set price list
        SalesExecutionEngine.setPriceList(csr, survey, gui.m_evalPriceListCollection);

        SalesExecutionEngine.setProductMeasure(csr, survey, product);

        SalesExecutionEngine.setCustomerMeasure(csr, survey, gui.cust);

        //populate details from previous survey
        SalesExecutionEngine.populateDetailsFromPreviousSurveys(csr, previousSurveys, survey);

        SalesExecutionEngine.setObjectiveMeasure(csr, survey, gui.cust, gui.m_appliableObjectives);

    },
    this._tryAddNewCustomerSurveyRow = function (gui, ctrl, prodRow, fromBarcodeScanner) {
        var section = ctrl.sections.GRID_PRODUCTS;
        if (!section)
            return false;

        var customerSurvey = ctrl.entity;
        var codArt = prodRow.get("CODART");
        var codDiv = prodRow.get("CODDIV");
        var surveyConf = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
        var oldCsr = customerSurvey.getSubEntityStore('MVCustomerSurveyRow').findBy(function (item, index, length) {
            return (item.get("CODART") == codArt && item.get("CODDIV") == codDiv);
        });

        //if a MVCustomerSurveyRow popup is already opened
        var popupCtrl = gui.getSubDetailCtrl();
        if (popupCtrl) {
            //if the popup contains the current product 
            if (popupCtrl.entity.get("CODART") == prodRow.get("CODART") && popupCtrl.entity.get("CODDIV") == prodRow.get("CODDIV")) {
                //if the MVCustomerSurveyRow is not present in the store, try to add it
                var sectionName = "CUSTOMERSURVEY." + customerSurvey.uniqueID;
                if (!oldCsr && popupCtrl.sections && popupCtrl.sections[sectionName]) {
                    this._addProductToCustomerSurvey(popupCtrl.sections[sectionName].sectionContext, fromBarcodeScanner);
                    return true;
                } else
                    return false;
            }

            //stop executing if the popup can't be closed
            if (!popupCtrl.closeDetail())
                return false;
        }

        //check if the current MVCustomerSurveyRow is already present
        if (!surveyConf.FLGALLOWDUPART && oldCsr) {
            if (!fromBarcodeScanner) {
                XUI.showMsgBox({
                    title: "[MOB.WARN]",
                    msg: UserContext.tryTranslate("[MOB.PRODUCT_ALREADY_PRESENT]"),
                    icon: "WARN",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
                return false;
            } else {
                //set DEFAULTONSCANNERVALUE even if the product is already present and refresh the grid in order to see the updated fields
                SalesExecutionEngine.setDefaultOnScannerValues(oldCsr, surveyConf);
                this._refreshTab(gui, customerSurvey);
                //open the popup for the existing MVCustomerSurveyRow
                var oldCsrIndex = section.store.findBy(function (record) {
                    if (record.xrec == oldCsr)
                        return true;
                });
                ctrl.openSubDetailFromList(section.store, section.grid, oldCsrIndex, "MVCustomerSurveyRow", section.sectionContext);
                return false;
            }
        }

        //create the new customer survey row
        var previousSurveys = null;
        if (gui.m_previousSurveysCollection && gui.m_previousSurveysCollection.get(customerSurvey))
            previousSurveys = gui.m_previousSurveysCollection.get(customerSurvey);
        var newCsr = this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, surveyConf, prodRow, gui, true, fromBarcodeScanner);
        //replicate values
        SalesExecutionEngine.loadReplicatedValues({ cs: customerSurvey, csr: newCsr });
        //validate product
        this._validateProduct(newCsr);
        //UI
        if (section.store) {
            var senchaEntity = newCsr.toSenchaEntity({ senchaEntityName: section.store.getModel().getName() });
            section.store.add(senchaEntity);
        }

        //open the detail popup if necesary
        if (fromBarcodeScanner)
            ctrl.openSubDetailFromList(section.store, section.grid, section.store.getCount() - 1, "MVCustomerSurveyRow", section.sectionContext);

        //refresh current detail context so changes in calculated measures get updated.
        setTimeout(function () { ctrl.refreshGui(); }, 100);

        return true;
    },
    this._addNewCustomerSurveyRow = function (customerSurvey, previousSurveys, survey, product, gui, manuallyAdded, fromBarcodeScanner) {
        //var docConfig = XDocs.getDocConfig("MobVisit");
        var csr = SalesExecutionEngine.createCustomerSurveyRowWithDefaults(customerSurvey);
        csr.detachedFrom = null;

        this._populateCustomerSurveyRow(customerSurvey, csr, previousSurveys, survey, product, gui, manuallyAdded, fromBarcodeScanner);

        customerSurvey.getSubEntityStore("MVCustomerSurveyRow").add(csr);

        if (manuallyAdded)
            customerSurvey.set("FLGMODIFY", true);

        return csr;
    },
    //#region MEASURE EDIT
    //#region REPLICATE VALUES
    //Barrier that opens only when all product customer surveys loaded.
    //mobVisit : document entity representing current visit
    this._notifyProductCSLoaded = function (mobVisit) {
        try {
            this.n_productCsLoaded = this.n_productCsLoaded + 1;
            var productCs = mobVisit.getSubEntityStore("MVCustomerSurvey").queryBy(function (item) {
                return SalesExecutionEngine.getActivityType(item.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.PRODUCT;
            });
            if (this.n_productCsLoaded == productCs.length) {
                this.n_productCsLoaded = 0;
                SalesExecutionEngine.loadReplicatedValues({ visit: mobVisit });

                //mark problems triggered by anomalies in all surveys
                this._checkSurveyAnomaliesFast({ "mobVisit": mobVisit });
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    //#endregion

    //open PRODUCT GUI when DESART column is clicked
    this._viewArtColumnHyperLinkClick = function (gui) {
        return function (record) {

            gui._storeDocOnTempCache();
            var navId = "NAV_MOB_PROD";
            var editRight = UserContext.checkRight(navId, navId, 'EDIT');
            XHistory.go({
                controller: app.getSM1Controllers().gui,
                action: 'show',
                docKey: CommonEngine.buildProductKey(record.xrec.get("CODART"), record.xrec.get("CODDIV")),
                navId: navId,
                openMode: editRight ? 'EDIT' : 'VIEW'
            });
        };
    },

    //#endregion
    //#region Anomaly Evaluation

    // Process the list of survey anomalies and populate the list of measures that can trriger each one of these anomalies
    //!! ALTERS XApp.GlobalData["SURVEYS"]
    this._getSurveysAndPopulateTriggeringMeasures = function () {
        var allSurveys = XApp.GlobalData["SURVEYS"];
        if (allSurveys != undefined)
            for (var iSrv = 0; iSrv < allSurveys.length; iSrv++) {

                var survey = allSurveys[iSrv];
                if (!survey.SurveyAnomalyDetails)
                    continue;

                for (var iSac = 0; iSac < survey.SurveyAnomalyDetails.length; iSac++) {
                    var anomaly = survey.SurveyAnomalyDetails[iSac];
                    anomaly.triggeringMeasures = [];
                    for (var iConstr = 0; iConstr < anomaly.SurveyAnomalyGroupFilters.length; iConstr++) {
                        var sc = anomaly.SurveyAnomalyGroupFilters[iConstr];
                        if (SalesExecutionEngine.isAnnotatedMeasure(sc.ATTRIBUTENAME))
                            anomaly.triggeringMeasures.push(sc.ATTRIBUTENAME.trimChar("@"));
                        if (SalesExecutionEngine.isAnnotatedMeasure(sc.VALUEDATA))
                            anomaly.triggeringMeasures.push(sc.VALUEDATA.trimChar("@"));
                    }
                }
            }
    },
this._checkCell = function (cell) {
    try {
        var csr = cell.rowEntity;
        var cs = csr.getParentEntity();
        var codMeasure = cell.codMeasure;
        var currentTab = cell.gui.tabPanel.getActiveItem();

        this._onMeasureChange(cs, csr, codMeasure, currentTab);
    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
},
this._checkControl = function (control) {
    try {
        var csr = control.fieldContext.sectionContext.entity;
        var cs = csr.getParentEntity();
        var codMeasure = control.fieldContext.config.codMeasure;

        this._checkMandatoryFields(cs, csr, codMeasure);
        this._checkFixedAnomalies(cs, csr);
        this._checkNewlyTriggeredAnomalies(cs, csr, codMeasure);
        this._updateSurveyEvalAnomStatus(cs);

    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
},
    // Verify only a specific survey row for anomalies
    // This verification will include errors only if a save attempt was made already otherwise it will mark only warnings
    this._checkFixedAnomalies = function (cs, csr) {

        try {
            var anomaliesToCheck = csr.getProblems();
            csr.clearProblems();
            if (anomaliesToCheck) {
                for (var i = 0; i < anomaliesToCheck.length; i++) {
                    this._clearDetailFieldError(csr, anomaliesToCheck[i].ANOMALYMEASURE);
                    this._checkSurveyAnomaly(anomaliesToCheck[i], cs, [csr]);
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    // Verify anmalies that may be triggered by a change on codMeasure measure
    this._checkNewlyTriggeredAnomalies = function (cs, csr, codMeasure) {
        try {
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
            for (var i = 0; i < surveyConfig.SurveyAnomalyDetails.length; i++) {
                var anomaly = surveyConfig.SurveyAnomalyDetails[i];
                if (SalesExecutionEngine.anomalyIsTriggeredByMeasure(anomaly, codMeasure) || anomaly.ANOMALYMEASURE == codMeasure) {
                    this._checkSurveyAnomaly(anomaly, cs, [csr]);
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    this._checkMandatoryFields = function (cs, csr, codMeasure) {
        try {

            var context = {
                cs: cs,
                csr: csr,
                codMeasure: codMeasure,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckMandatoryFields', context);
            if (context.canceled)
                return context.returnValue;

            var sm = SalesExecutionEngine.getSurveyMeasureConfig(cs.get("CODTYPSURVEY"), codMeasure);
            if (sm) {
                if ((sm.FLGMANDATORY) && (sm.FLGVISIBLE) && this._isValueEmpty(csr, sm)) {

                    var targetName = this._getTargetName(cs, csr, sm.CODMEASURE);

                    var message = {
                        "targetName": targetName,
                        messageType: 'WARN',
                        message: csr.isFakeProduct() ?
                            (UserContext.tryTranslate("[MOBVISIT.HEADER_MES]")) : (!csr.get("DESART") ? csr.get("CODART") : csr.get("DESART")) +
                                ", " + UserContext.tryTranslate("[" + sm.CODMEASURE + "]") + " " + UserContext.tryTranslate("[EMPTY_NOT_ALLOWED]")
                    };

                    this._clearDetailFieldError(csr, codMeasure);
                    this._setFieldError(csr, codMeasure, message);
                    return false;
                } else {
                    this._clearDetailFieldError(csr, codMeasure);
                    return true;
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return true;
    },
    //Verify if the measure with the code codMeasure of specified detail row of the cs customer survey has any anomalies
    this._checkCustomerSurveyDetailAnomalies = function (cs, detail, codMeasure) {
        var valid = true;
        try {

            var context = {
                cs: cs,
                detail: detail,
                codMeasure: codMeasure,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckCustomerSurveyDetailAnomalies', context);
            if (context.canceled)
                return context.returnValue;

            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));

            var anomalyMeasures = Ext.Array.filter(surveyConfig.SurveyAnomalyDetails, function (item) { return item.ANOMALYMEASURE == codMeasure; });
            for (var i = 0; i < anomalyMeasures.length; i++) {
                var anomaly = anomalyMeasures[i];
                if (anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY && cs.get("IDANOMALYSRC") != null && cs.get("IDSURVEYSRC") != null)
                    continue;
                else if (!this._checkSurveyAnomaly(anomaly, cs, [detail]))
                    valid = false;
            }

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return valid;
    },
    //Verify the specified detail rows of the cs customer survey for the anomaly 
    this._checkSurveyAnomaly = function (anomaly, cs, detailsToCheck) {
        try {

            var context = {
                cs: cs,
                anomaly: anomaly,
                detailsToCheck: detailsToCheck,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckSurveyAnomaly', context);
            if (context.canceled)
                return context.returnValue;
            var csAnomalies = [];
            var survey = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));

            var anomalyMeasure = Ext.Array.filter(survey.SurveyMeasureDetails, function (item) { return item.CODMEASURE == anomaly.ANOMALYMEASURE && item.CODTYPSURVEY == anomaly.CODTYPSURVEY; })[0];
            //in case the measure is mandatory no need to validate the constraint anymore because the user is forced anyway to fill in the value
            if (anomalyMeasure.FLGMANDATORY || anomaly.FLGHIGHLIGHT || anomaly.FLGREADONLY)
                return true;

            var evaluator = SalesExecutionEngine.translateSavedConstraints(survey, anomaly.SurveyAnomalyGroupFilters);
            if (evaluator) {
                evaluator = SalesExecutionEngine.addFieldEmptyConstraint(anomalyMeasure, evaluator);

                var productNumber = 0;
                var anomalyFound = false;
                for (var iCsr = 0; iCsr < detailsToCheck.length; iCsr++) {
                    var csr = detailsToCheck[iCsr];
                    if (anomalyMeasure.FLGHEADER || SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.CUSTOMER) {
                        if (!csr.isFakeProduct())
                            continue;
                    }
                    else
                        if (csr.isFakeProduct())
                            continue;

                    if (evaluator(csr))//has anomaly
                    {
                        var topPriorityAnomaly = csr.getProblemToDisplay(anomaly.ANOMALYMEASURE);

                        //Compare this new anomaly with the currently top anomaly to see which will be displayed
                        if (!topPriorityAnomaly || (topPriorityAnomaly.FLGCANBESAVED && !anomaly.FLGCANBESAVED))
                            topPriorityAnomaly = anomaly;

                        var isWarning = topPriorityAnomaly.FLGCANBESAVED || (!topPriorityAnomaly.FLGCANBESAVED && cs.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.COMPLETED && (!this.closeVisitButton || !this.closeVisitButton.b_closeVisitAttempt));

                        var hasAnomaly = "";
                        if (!anomaly.FLGSHOWANOMALYPRODUCTS && anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY) {

                            hasAnomaly = csAnomalies.find(function (searchedAnomaly) {
                                return searchedAnomaly === anomaly.IDANOMALY + "|" + csr.get("IDSURVEY");
                            });
                        }

                        var hasGeneratedActivity = (cs.get("IDSURVEY") && cs.getParentEntity() && cs.getParentEntity().checkAlreadyGeneratedActivity(anomaly, cs.get("IDSURVEY"), cs.getParentEntity().getSubEntityStore("MVCustomerSurvey")));

                        if (XApp.isEmptyOrWhitespaceString(hasAnomaly)) {
                            //Add the anomaly to the list of problems existing on the csr row
                            csr.addProblem(anomaly);
                            //do not show more than 20 products for each activity in the popup
                            if (productNumber <= ParametersDefaultsAndStaticData.getInstance().getRecoveryMessagesNumber() && !hasGeneratedActivity)
                                this._markAnomaly(cs, csr, topPriorityAnomaly, isWarning);
                            csAnomalies.push(anomaly.IDANOMALY + "|" + csr.get("IDSURVEY"));
                        }

                        //do not flag the recovery anomaly as an anomaly if it generated an recovery activity
                        //otherwise it will prevent the execution of the activity
                        if (anomaly.CODTYPSURVANOM != SalesExecutionNameSpace.AnomalyTypes.RECOVERY ||
                            (anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY && !hasGeneratedActivity))
                            anomalyFound = true;
                    }
                }

                if (anomalyFound)
                    return false;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return true;
    },
    this._markAnomaly = function (cs, csr, anomaly, isWarning) {
        try {
            var alertMessage = "";
            var targetName = this._getTargetName(cs, csr, anomaly.ANOMALYMEASURE);
            if (anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY) {
                alertMessage = UserContext.translate(anomaly.ALERTMESSAGE);
                if (SalesExecutionEngine.getActivityType(anomaly.RECOVERYSURVEY) == SalesExecutionNameSpace.ActivityType.QUEST && anomaly.RECOVERYQUESTIONNAIRID) {
                    var quest = SalesExecutionEngine.getQuestionnaire(anomaly.RECOVERYQUESTIONNAIRID);
                    alertMessage = alertMessage + ": " + quest.DESQUESTIONNAIRE;
                } else
                    alertMessage = alertMessage + ": " + UserContext.translate(anomaly.RECOVERYSURVEY);
            } else {
                alertMessage = cs.get("DesTypSurveyLong") + ": " + UserContext.translate(anomaly.ALERTMESSAGE);
            }

            if (anomaly.FLGSHOWANOMALYPRODUCTS && anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY
                || anomaly.CODTYPSURVANOM != SalesExecutionNameSpace.AnomalyTypes.RECOVERY && SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.PRODUCT)
                alertMessage = alertMessage + " " + UserContext.tryTranslate("[ON]") + " " + (csr.isFakeProduct() ? (UserContext.tryTranslate("[MOBVISIT.HEADER_MES]")) : (!csr.get("DESART") ? csr.get("CODART") : csr.get("DESART")));

            var msg = {
                "targetName": targetName,
                "messageType": isWarning ? "WARN" : "ERROR",
                "message": alertMessage,
                "isRecovery": anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY ? true : false,
                "idAnomalySrc": anomaly.IDANOMALY,
                "idSurveySrc": csr.get("IDSURVEY")
            };

            this._clearDetailFieldError(csr, anomaly.ANOMALYMEASURE);
            this._setFieldError(csr, anomaly.ANOMALYMEASURE, msg);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    //Check if there are any recovery activities that have it's recovery anomaly solved and cancel them
    this._removeResolvedRecoveryActivities = function (doc, gui, recoveryAnomalies) {
        var self = this;
        var surveysToBeRemoved = [];
        for (var iCs = 0; iCs < doc.getSubEntityStore("MVCustomerSurvey").getCount() ; iCs++) {
            var customerSurvey = doc.getSubEntityStore("MVCustomerSurvey").getAt(iCs);
            if (!XApp.isEmptyOrWhitespaceString(customerSurvey.get("IDANOMALYSRC")) && !XApp.isEmptyOrWhitespaceString(customerSurvey.get("IDSURVEYSRC"))) {
                var reconveryAnomalyPresent = false;
                for (var iAnomaly in recoveryAnomalies) {
                    var anomaly = recoveryAnomalies[iAnomaly];
                    if (customerSurvey.get("IDANOMALYSRC") == anomaly.IDANOMALY && customerSurvey.get("IDSURVEYSRC") == anomaly.IDSURVEYSRC) {
                        reconveryAnomalyPresent = true;
                        break;
                    }
                }
                if (!reconveryAnomalyPresent)
                    surveysToBeRemoved.push(customerSurvey);
            }
        }
        var cause = ParametersDefaultsAndStaticData.getInstance().getDefault_emptysurvey_anncause();
        for (var iSurvey = 0; iSurvey < surveysToBeRemoved.length ; iSurvey++) {
            surveysToBeRemoved[iSurvey].set("FLGANN", true);
            self._doCancelCustomerSurvey(gui, surveysToBeRemoved[iSurvey], true, cause, false);
            self._removeCustomerSurveyTab(surveysToBeRemoved[iSurvey], gui);
        }

        //Refresh visit context menu
        self._updateVisitButtonState(gui);
        //force refresh the summary tab
        self._refreshSummaryTab(gui);
    },

    //Check if there are already generated activities from recovery anomalies
     this._removeAlreadyEvaluatedRecoveryAnomalies = function (recoveryAnomalies, doc) {
         var anomaliesToBeRemoved = [];
         var customerSurveys = doc.getSubEntityStore("MVCustomerSurvey");

         for (var iAnomaly in recoveryAnomalies) {
             var anomaly = recoveryAnomalies[iAnomaly];
             if (doc.checkAlreadyGeneratedActivity(anomaly, anomaly.IDSURVEYSRC, customerSurveys))
                 anomaliesToBeRemoved.push(anomaly);
         }

         for (var iAnom = 0; iAnom < anomaliesToBeRemoved.length ; iAnom++)
             recoveryAnomalies.splice(recoveryAnomalies.indexOf(anomaliesToBeRemoved[iAnom]), 1);
     },

    // Check all anomalies for all survey in the visit but without marking the errors visually
    this._checkSurveyAnomaliesFast = function (context) {
        try {
            var custContext = {
                context: context,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeSurveyAnomaliesFast', custContext);
            if (custContext.canceled)
                return;

            if (context.mobVisit) {
                for (var i = 0; i < context.mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                    this._checkSurveyAnomaliesFast({ cs: context.mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i) });
                }
            } else if (context.cs) {
                var survey = SalesExecutionEngine.getSurveyConfig(context.cs.get("CODTYPSURVEY"));
                if (!survey.SurveyAnomalyDetails)
                    return;

                for (var i = 0; i < survey.SurveyAnomalyDetails.length; i++) {
                    var anomaly = survey.SurveyAnomalyDetails[i];
                    if (anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY && context.cs.get("IDANOMALYSRC") != null && context.cs.get("IDSURVEYSRC") != null)
                        continue;
                    var anomalyMeasure = Ext.Array.filter(survey.SurveyMeasureDetails, function (item) { return item.CODMEASURE == anomaly.ANOMALYMEASURE && item.CODTYPSURVEY == anomaly.CODTYPSURVEY; })[0];

                    var evaluator = SalesExecutionEngine.translateSavedConstraints(survey, anomaly.SurveyAnomalyGroupFilters);
                    if (evaluator) {
                        evaluator = SalesExecutionEngine.addFieldEmptyConstraint(anomalyMeasure, evaluator);
                        var detailsToCheck = context.cs.getSubEntityStore("MVCustomerSurveyRow").toArray();
                        var header = context.cs.get("HEADER");
                        if (header)
                            detailsToCheck.unshift(header);
                        for (var iCsr = 0; iCsr < detailsToCheck.length ; iCsr++) {
                            var csr = detailsToCheck[iCsr];
                            if (!anomalyMeasure.FLGHEADER && SalesExecutionEngine.getActivityType(context.cs.get("CODTYPSURVEY")) != SalesExecutionNameSpace.ActivityType.CUSTOMER) {
                                if (csr.isFakeProduct())
                                    continue;
                            }
                            if (evaluator(csr))//has anomaly
                            {
                                csr.addProblem(anomaly);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    // Check if the value of the measure is  empty
    this._isValueEmpty = function (csr, sm) {
        try {

            var context = {
                csr: csr,
                sm: sm,
                canceled: false,
                returnValue: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeIsValueEmpty', context);
            if (context.canceled)
                return context.returnValue;

            if (!csr || !sm || XApp.isEmptyOrWhitespaceString(sm.FIELDNAME))
                return false;

            var val = csr.get(sm.FIELDNAME);

            if (val == null)
                return true;

            if (sm.FIELDNAME.indexOf("FLGMEASURE") == 0)
                return val == false;
            else if (sm.FIELDNAME.indexOf("LNGMEASURE") == 0 && sm.FORMATSTR == "CHECKBOX") {
                return (val === false || val == 0);
            } else if (sm.FIELDNAME.indexOf("DTEMEASURE") == 0)
                return (XApp.isEmptyDate(val));
            else return XApp.isEmptyOrWhitespaceString(val);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return false;
    },

    // Build a target name for validating a control
    // <param name="cs"></param>
    // <param name="item"></param>
    // <param name="surveyMeasureCode"></param>
    this._getTargetName = function (cs, item, surveyMeasureCode) {
        try {
            return cs.uniqueID + "|" + item.get("CODART") + "|" + surveyMeasureCode;
        } catch (e) {
            XLog.logEx(e);
        }
        return null;
    },

    // Clear any warning associated with this CustomerSurveyRow for the specified measure
    this._clearDetailFieldError = function (detail, surveyMeasureCode) {
        try {
            detail.errorMessages[surveyMeasureCode] = undefined;

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    this._setFieldError = function (detail, surveyMeasureCode, msg) {
        try {
            detail.errorMessages[surveyMeasureCode] = msg;

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    this._setError = function (control, type) {
        try {
            if (control)

                if (Ext.Array.indexOf(control.getCls(), 'x-measure-normal-field', 0) != -1)
                    control.removeCls('x-measure-normal-field');

            switch (type) {
                case "ERROR":
                    control.addCls('x-measure-error-field');
                    break;
                case "WARN":
                    control.addCls('x-measure-warn-field');
                    break;
            }
        } catch (e) {
            XLog.logWarn("Failed to set error on control");
        }
    },
    this._clearError = function (control) {
        try {
            if (control) {
                if (Ext.Array.indexOf(control.getCls(), 'x-measure-error-field', 0) != -1)
                    control.removeCls('x-measure-error-field');

                if (Ext.Array.indexOf(control.getCls(), 'x-measure-warn-field', 0) != -1)
                    control.removeCls('x-measure-warn-field');

                control.addCls('x-measure-normal-field');
            }
        } catch (e) {
            XLog.logWarn("Failed to clear errors on control");
        }
    },

    //grid validator
    /*var cellInfo = {
    grid: this,
    column: column,
    value: value,
    rec: rec,
    isValid: true,
    isWarning: false,
    classNames: []
    };*/
    this._setCellError = function (cellInfo, type) {
        try {
            if (cellInfo)
                switch (type) {
                    case "ERROR":
                        cellInfo.isValid = false; //'x-measure-error-field';
                        break;
                    case "WARN":
                        cellInfo.isWarning = true; //'x-measure-warn-field';
                        break;
                }
        } catch (e) {
            XLog.logWarn("Failed to set error on cell");
        }
    },

    this._canExecuteSurvey = function (survey, doc) {

        var context = {
            survey: survey,
            doc: doc,
            canceled: false,
            returnValue: true
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCanExecuteSurvey', context);
        if (context.canceled)
            return context.returnValue;

        var self = this;
        //check if the survey is valid
        var valid = self._validate(survey);
        //check if the survey is empty
        var surveyNotEmpty = false;
        var activityType = SalesExecutionEngine.getActivityType(survey.get("CODTYPSURVEY"));
        switch (activityType) {
            case SalesExecutionNameSpace.ActivityType.CUSTOMER:
            case SalesExecutionNameSpace.ActivityType.PRODUCT:
                surveyNotEmpty = (survey.getSubEntityStore("MVCustomerSurveyRow").getCount() != 0 || survey.get("HEADER"));
                break;
            case SalesExecutionNameSpace.ActivityType.QUEST:
                surveyNotEmpty = true; //consider questionnaire always as not empty
                break;
        }
        //check if the document is not completed
        //TODO Review this condition. Check is useless
        var docNotCompleted = doc.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.COMPLETED;
        return valid && surveyNotEmpty && docNotCompleted;
    },

    this._validate = function (cs) {
        try {



            switch (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY"))) {
                case SalesExecutionNameSpace.ActivityType.QUEST:
                    {
                        return this._validateQuestionary(cs);
                    }
                case SalesExecutionNameSpace.ActivityType.ATTACHMENTS:
                case SalesExecutionNameSpace.ActivityType.CONTACT:
                    return true;
                    //do not validate contacts survey                                                                                            
                default:
                    return this._validateSurvey(cs);
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },
    this._validateAll = function (mobVisit) {
        try {
            var valid = true;
            for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
                valid = this._validate(cs) && valid;
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },

    this._eachDistinctConsumerQuestActivity = function (gui, mobVisit, countIncompleteQuests, questHandler) {
        try {
            var self = this;
            if (gui.m_missions != null) {
                var customerSurveys = mobVisit.getSubEntityStore("MVCustomerSurvey");
                var usedQuests = [];
                for (var i = 0; i < customerSurveys.getCount() ; i++) {
                    var cs = customerSurveys.getAt(i);
                    var continueLoop = true;
                    //add only the quest activities that haven't been added before
                    if (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.QUEST && !Ext.Array.contains(usedQuests, cs.get("IDMISSION"))) {
                        var nrDoneCs = customerSurveys.filterToStore(function (entity) {
                            return entity.get("IDMISSION") == cs.get("IDMISSION") && (countIncompleteQuests || self._validateQuestionary(entity, true));
                        }).getCount();
                        //search for the mission that generated the questionair
                        var mission = null;
                        for (var j = 0; j < gui.m_missions.length; j++) {
                            if (gui.m_missions[j].get("IDMISSION") == cs.get("IDMISSION")) {
                                mission = gui.m_missions[j];
                                break;
                            }
                        }
                        //if the mission has flgconsumerquest set, then allow the user to add more questionaires of this type
                        if (mission && mission.get("FLGCONSUMERQUEST") && nrDoneCs < mission.get("MAXCONSUMERQUEST")) {
                            usedQuests.push(mission.get("IDMISSION"));
                            if (questHandler)
                                continueLoop = questHandler(mission, cs, nrDoneCs);
                        }
                    }
                    if (continueLoop == false)
                        break;
                }
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    this._checkMinConsumerQuest = function (gui, mobVisit) {
        try {

            var context = {
                gui: gui,
                mobVisit: mobVisit,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckMinConsumerQuest', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var msg = "";
            this._eachDistinctConsumerQuestActivity(gui, mobVisit, false, function (mission, cs, nrDoneCs) {
                if (nrDoneCs < mission.get("MINCONSUMERQUEST")) {
                    msg += cs.get("DesTypSurveyLong") + ": " + UserContext.tryTranslate("[MISSION_VALIDATE_MIN_QUESTIONNAIRES]") + "\n";
                    valid = false;
                }
            });
            if (!valid)
                XUI.showErrorMsgBox({
                    msg: msg
                });
            return valid;

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return false;
    },

    this._checkMandatoryActivities = function (doc) {
        try {
            var missingSurveys = "";
            var surveys = SalesExecutionEngine.getOrderedSurveysConfig();
            var customerSurveys = doc.MVCustomerSurveyDetailsStore;
            for (var i = 0; i < surveys.length; i++) {
                var s = surveys[i];
                if (SalesExecutionEngine.canCreateSurvey(s, doc) && SalesExecutionEngine.contactModeFLGMANDATORY(s, doc.get("CONTACTMODE"))) {
                    //check if the survey is included in the visit
                    var cs = customerSurveys.findBy(function (cs) {
                        return cs.get("CODTYPSURVEY") == s.CODTYPSURVEY;
                    });
                    if (!cs) {
                        missingSurveys += UserContext.tryTranslate("[" + s.CODTYPSURVEY + "]") + "<br>";
                    }
                }
            }
            if (!XApp.isEmptyOrWhitespaceString(missingSurveys)) {
                XUI.showWarnOk({
                    msg: UserContext.tryTranslate("[MOB.VISIT_MANDATORY_ACTIVITY_MISSING]") + "<br>" + missingSurveys
                });
                return false;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return true;
    },

    this._numberDuplicateTabs = function (gui) {

        var visit = gui.getDocument();

        for (var i = 1; i < gui.tabSubDetails.length; i++) {
            var tab = gui.tabSubDetails[i];

            var survey = null;
            if (!XApp.isEmptyOrWhitespaceString(tab.tabName))
                survey = visit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
                    if (tab.tabName == e.uniqueID) {
                        return e;
                    }
                    return null;
                });
            if (!survey) //non survey tab
                continue;

            var firstTime = true;
            for (var j = i + 1; j < gui.tabSubDetails.length; j++) {
                var nextTab = gui.tabSubDetails[j];

                var nextSurvey = null;
                if (!XApp.isEmptyOrWhitespaceString(nextTab.tabName))
                    nextSurvey = visit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
                        if (nextTab.tabName == e.uniqueID)
                            return e;
                        return null;
                    });
                if (nextSurvey && nextSurvey.get("DesTypSurveyLong") == survey.get("DesTypSurveyLong") && nextSurvey.get("IDMISSION") == survey.get("IDMISSION")) {
                    if (firstTime) {
                        firstTime = false;
                        if (!tab.tabNum)
                            tab.tabNum = 1;
                        tab.tabBtn.setText("(" + tab.tabNum + ") " + survey.get("DesTypSurveyLong"));
                        var nextNum = tab.tabNum + 1;
                    }
                    if (nextTab.tabNum)
                        nextNum = nextTab.tabNum + 1;
                    else {
                        nextTab.tabNum = nextNum;
                        nextNum++;
                    }
                    nextTab.tabBtn.setText("(" + nextTab.tabNum + ") " + nextSurvey.get("DesTypSurveyLong"));
                    i++;
                } else {
                    break;
                }
            }
        }
    },

    this._refreshTabs = function (gui) {
        this._sortTabs(gui);
        gui.refreshTabsStatus();
        this._numberDuplicateTabs(gui);

        //if it's not the active tab item, refresh it when it is accessed
        if (gui.tabPanel.getActiveItem().tabName == "VISIT_SUMMARY") {
            this._refreshSummaryTab(gui);
        }
    },
    //cs= customer survey entity
    //csr = customer survey row entity
    //measure = string, measure code
this._onMeasureChange = function (cs, csr, codMeasure, currentTab) {
    try {
        this._checkMandatoryFields(cs, csr, codMeasure);
        this._checkFixedAnomalies(cs, csr);
        this._checkNewlyTriggeredAnomalies(cs, csr, codMeasure);

        if (currentTab.tabName != "VISIT_SUMMARY") {
            this._updateSurveyEvalAnomStatus(cs);
        }
    } catch (e) {
        XUI.showExceptionMsgBox(e);
    }
},
    // Validate completly a survey( missing required fields and anomalies)
    this._validateSurvey = function (cs) {
        var context = {
            cs: cs,
            canceled: false,
            returnValue: true
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateSurvey', context);
        if (context.canceled)
            return context.returnValue;

        var valid;
        this._clearSurveyProblemsNotifications(cs);
        valid = this._compileAnomaliesWarningMessagesForSurvey(cs);
        valid = this._validateSurveyMissingFields(cs) && valid;

        return this._validateSurveyAnomalies(cs) && valid;
    },

    //Change this to work with MVCustomersurveyrow
    this._validateProduct = function (mvCustomerSurveyRow) {
        var context = {
            product: mvCustomerSurveyRow,
            canceled: false,
            returnValue: true
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateProduct', context);
        if (context.canceled)
            return context.returnValue;

        var valid;
        this._clearProductProblemsNotifications(mvCustomerSurveyRow);
        valid = this._compileAnomaliesWarningMessagesForProduct(mvCustomerSurveyRow);
        valid = this._validateProductMissingFields(mvCustomerSurveyRow) && valid;

        return this._validateProductAnomalies(mvCustomerSurveyRow) && valid;
    },
    // Validate survey for missing required fields
    this._validateSurveyMissingFields = function (cs) {
        try {

            var context = {
                cs: cs,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateSurveyMissingFields', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var surveyMeasures;

            if (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.CUSTOMER) {

                var headerCsr = cs.get("HEADER");
                if (headerCsr) {
                    surveyMeasures = SalesExecutionEngine.getOrderedSurveyMeasureConfig(cs.get("CODTYPSURVEY"));

                    if (surveyMeasures) {
                        for (var i = 0; i < surveyMeasures.length; i++) {
                            var sm = surveyMeasures[i];

                            if ((sm.FLGMANDATORY) && (sm.FLGVISIBLE) && this._isValueEmpty(headerCsr, sm)) {

                                var targetName = this._getTargetName(cs, headerCsr, sm.CODMEASURE);

                                var message = {
                                    "targetName": targetName,
                                    messageType: 'WARN',
                                    message: cs.get("DesTypSurveyLong") + ": " + UserContext.tryTranslate("[MOBVISIT.HEADER_MES]") + " " + UserContext.tryTranslate("[MOBVISIT.MANDATORY_FIELDS]")
                                };

                                this._setFieldError(headerCsr, sm.CODMEASURE, message);
                                valid = false;
                            }
                        }
                        if (!valid)
                            return false;
                    }
                }
            } else if (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.PRODUCT) {
                //validate header

                var headerCsr = cs.get("HEADER");
                if (headerCsr) {
                    surveyMeasures = SalesExecutionEngine.getOrderedSurveyMeasureConfig(cs.get("CODTYPSURVEY"));
                    surveyMeasures = Ext.Array.filter(surveyMeasures, function (item) { return item.FLGHEADER == true || item.FLGHEADER != 0; });
                    if (surveyMeasures) {
                        for (var i = 0; i < surveyMeasures.length; i++) {
                            var sm = surveyMeasures[i];

                            if ((sm.FLGMANDATORY) && (sm.FLGVISIBLE) && this._isValueEmpty(headerCsr, sm)) {

                                var targetName = this._getTargetName(cs, headerCsr, sm.CODMEASURE);

                                var message = {
                                    "targetName": targetName,
                                    messageType: 'WARN',
                                    message: cs.get("DesTypSurveyLong") + ": " + UserContext.tryTranslate("[MOBVISIT.HEADER_MES]") + " " + UserContext.tryTranslate("[MOBVISIT.MANDATORY_FIELDS]")
                                };

                                this._setFieldError(headerCsr, sm.CODMEASURE, message);
                                //for product activity type return immediatly after detecting one error
                                valid = false;
                            }
                        }
                        if (!valid)
                            return false;
                    }
                }

                // validate rest of CSR
                surveyMeasures = SalesExecutionEngine.getOrderedSurveyMeasureConfig(cs.get("CODTYPSURVEY"));
                surveyMeasures = Ext.Array.filter(surveyMeasures, function (item) { return item.FLGHEADER == false || item.FLGHEADER == 0; });
                for (var i = 0; i < surveyMeasures.length; i++) {
                    var sm = surveyMeasures[i];
                    if ((sm.FLGMANDATORY) && (sm.FLGVISIBLE)) {
                        for (var j = 0; j < cs.getSubEntityStore("MVCustomerSurveyRow").getCount() ; j++) {
                            var csr = cs.getSubEntityStore("MVCustomerSurveyRow").getAt(j);
                            if (this._isValueEmpty(csr, sm)) {
                                var targetName = this._getTargetName(cs, csr, sm.CODMEASURE);
                                var message = {
                                    "targetName": targetName,
                                    messageType: 'WARN',
                                    message: cs.get("DesTypSurveyLong") + ": " + ((!csr.get("DESART")) ? csr.get("CODART") : csr.get("DESART")) + " " + UserContext.tryTranslate("[MOBVISIT.MANDATORY_FIELDS]")
                                };

                                this._setFieldError(csr, sm.CODMEASURE, message);

                                return false;
                            }
                        }
                    }
                }
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },
    // Validate product for missing required fields
    this._validateProductMissingFields = function (csr) {
        try {

            var context = {
                csr: csr,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateProductMissingFields', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var cs = csr.getParentEntity();
            var surveyMeasures = SalesExecutionEngine.getOrderedSurveyMeasureConfig(cs.get("CODTYPSURVEY"));
            surveyMeasures = Ext.Array.filter(surveyMeasures, function (item) { return item.FLGHEADER == 0 || item.FLGHEADER == false; });
            if (surveyMeasures) {
                for (var i = 0; i < surveyMeasures.length; i++) {
                    var sm = surveyMeasures[i];

                    if ((sm.FLGMANDATORY) && (sm.FLGVISIBLE) && this._isValueEmpty(csr, sm)) {
                        var targetName = this._getTargetName(cs, csr, sm.CODMEASURE);

                        var message = {
                            "targetName": targetName,
                            messageType: 'WARN',
                            message: cs.get("DesTypSurveyLong") + ": " + ((!csr.get("DESART")) ? csr.get("CODART") : csr.get("DESART")) + " " + UserContext.tryTranslate("[MOBVISIT.MANDATORY_FIELDS]")
                        };

                        this._setFieldError(csr, sm.CODMEASURE, message);
                        valid = false;
                    }
                }
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }

    },
    //Validate anomalies. Mark all the blocking/non-blocking anomalies and return false if there are blocking anomalies
    this._validateSurveyAnomalies = function (cs) {
        try {
            var context = {
                cs: cs,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateSurveyAnomalies', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));

            // if (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.CUSTOMER) {
            var surveyAnomalies = surveyConfig.SurveyAnomalyDetails;
            if (surveyAnomalies) {

                var detailsToCheck = cs.getSubEntityStore("MVCustomerSurveyRow").toArray();
                var header = cs.get("HEADER");
                if (header)
                    detailsToCheck.unshift(header);

                for (var i = 0; i < surveyAnomalies.length; i++) {
                    var anomaly = surveyAnomalies[i];
                    if (!anomaly.FLGCANBESAVED && !anomaly.FLGHIGHLIGHT && !anomaly.FLGREADONLY)
                        if (anomaly.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.RECOVERY && !XApp.isEmptyOrWhitespaceString(cs.get("IDANOMALYSRC")) && !XApp.isEmptyOrWhitespaceString(cs.get("IDSURVEYSRC")))
                            continue
                        else if (!this._checkSurveyAnomaly(anomaly, cs, detailsToCheck))
                            valid = false;
                }
            }

            return valid;

        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },

    //Validate anomalies. Mark all the blocking/non-blocking anomalies and return false if there are blocking anomalies
    this._validateProductAnomalies = function (csr) {

        try {
            var context = {
                csr: csr,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateProductAnomalies', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var cs = csr.getParentEntity();
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
            var surveyAnomalies = Ext.Array.filter(surveyConfig.SurveyAnomalyDetails, function (anom) {
                return SalesExecutionEngine.getSurveyMeasureConfig(cs.get("CODTYPSURVEY"), anom.ANOMALYMEASURE).FLGHEADER == 0;
            });
            if (surveyAnomalies) {
                for (var i = 0; i < surveyAnomalies.length; i++) {
                    var anomaly = surveyAnomalies[i];
                    if (!anomaly.FLGCANBESAVED && !anomaly.FLGHIGHLIGHT && !anomaly.FLGREADONLY) {
                        if (!this._checkSurveyAnomaly(anomaly, cs, [csr]))
                            valid = false;
                    }
                }
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },

    //Compile the warning message list for anomalies
    this._compileAnomaliesWarningMessagesForSurvey = function (cs) {
        try {
            var context = {
                cs: cs,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCompileAnomaliesWarningMessagesForSurvey', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
            var customerSurveyRowDeatails = cs.getSubEntityStore("MVCustomerSurveyRow").toArray();
            if (cs.get("HEADER"))
                customerSurveyRowDeatails.unshift(cs.get("HEADER"));

            if (surveyConfig.SurveyAnomalyDetails) {
                for (var i = 0; i < surveyConfig.SurveyAnomalyDetails.length; i++) {
                    var anomaly = surveyConfig.SurveyAnomalyDetails[i];
                    if (anomaly.FLGCANBESAVED && !anomaly.FLGHIGHLIGHT && !anomaly.FLGREADONLY) {//read flag from anomaly not from associated target measure 

                        //stops on first row with problem
                        if (!this._checkSurveyAnomaly(anomaly, cs, customerSurveyRowDeatails))
                            valid = false;
                    }
                }
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },

    //Compile the warning message list for anomalies
    this._compileAnomaliesWarningMessagesForProduct = function (csr) {
        try {

            var context = {
                csr: csr,
                canceled: false,
                returnValue: true
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCompileAnomaliesWarningMessagesForProduct', context);
            if (context.canceled)
                return context.returnValue;

            var valid = true;
            var cs = csr.getParentEntity();
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));

            var surveyAnomalies = Ext.Array.filter(surveyConfig.SurveyAnomalyDetails, function (anom) {
                return !SalesExecutionEngine.getSurveyMeasureConfig(cs.get("CODTYPSURVEY"), anom.ANOMALYMEASURE).FLGHEADER;
            });
            if (surveyAnomalies) {
                for (var i = 0; i < surveyAnomalies.length; i++) {
                    var anomaly = surveyAnomalies[i];
                    if (anomaly.FLGCANBESAVED && !anomaly.FLGHIGHLIGHT && !anomaly.FLGREADONLY) {
                        if (!this._checkSurveyAnomaly(anomaly, cs, [csr]))
                            valid = false;
                    }
                }
            }
            return valid;
        } catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    },

    // Clear all notifications of a survey except for mandatory customer/header fields
    this._clearSurveyProblemsNotifications = function (cs) {
        try {
            var self = this;
            cs.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {
                self._clearProductProblemsNotifications(csr);
                return true;
            });

            var header = cs.get("HEADER");
            if (header) {
                self._clearProductProblemsNotifications(header);

                var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
                for (var i = 0; i < surveyConfig.SurveyMeasureDetails.length; i++) {
                    var sm = surveyConfig.SurveyMeasureDetails[i];
                    if (!sm.FLGMANDATORY) {
                        this._clearDetailFieldError(header, sm.CODMEASURE);
                    }
                }
            }

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    // Clear all notifications of a product except for mandatory customer fields
    this._clearProductProblemsNotifications = function (csr) {
        try {
            if (csr)
                csr.clearProblems();
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

this._updateSurveyEvalAnomStatus = function (survey) {
    survey.set("CODEVALANOM", this.hasBlockingAnomalies(survey) ? SalesExecutionNameSpace.SurveyEvalAnomStatus.Blocked
                                                                : SalesExecutionNameSpace.SurveyEvalAnomStatus.Verified);
},

this._getSequenceIndicatorColor = function (survey) {
    var surveyCodEvalAnom = survey.get("CODEVALANOM");
    switch (surveyCodEvalAnom) {
        case SalesExecutionNameSpace.SurveyEvalAnomStatus.Verified:
            return XSequenceIndicator.colors.GREEN;
        case SalesExecutionNameSpace.SurveyEvalAnomStatus.Blocked:
            return XSequenceIndicator.colors.RED;
        default:
            return XSequenceIndicator.colors.ORANGE;
    }
};
    //#endregion

    this._thereAreErrorsNotify = function (gui) {
        var self = gui;
        var visit = gui.getDocument();
        var thereAreSurveysWithErrors = false;


        //remove error messages for detached surveys
        if (visit.detachedCustomerSurveys)
            for (var i = 0; i < visit.detachedCustomerSurveys.length; i++) {
                var cs = visit.detachedCustomerSurveys[i];
                //clear previous error reports
                for (var n in self.errorReports) {
                    if (n.indexOf(cs.uniqueID) == 0) {
                        delete self.errorReports[n];
                    }
                }
            }

        visit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
            var activityType = SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY"));
            if (activityType == SalesExecutionNameSpace.ActivityType.PRODUCT || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER || activityType == SalesExecutionNameSpace.ActivityType.QUEST) {

                //clear previous error reports
                for (var n in self.errorReports) {
                    if (n.indexOf(cs.uniqueID) == 0) {
                        delete self.errorReports[n];
                    }
                }

                for (var n in self.recoveryErrorReports) {
                    if (n.indexOf(cs.uniqueID) == 0) {
                        delete self.recoveryErrorReports[n];
                    }
                }

                //search for errors in header
                var headerCsr = cs.get("HEADER");
                if (headerCsr != null) {
                    if (headerCsr.errorMessages) {
                        //search for error message to display
                        for (var msg in headerCsr.errorMessages) {
                            if (headerCsr.errorMessages[msg] && headerCsr.errorMessages[msg].isRecovery && headerCsr.errorMessages[msg].isRecovery == true)
                                self.recoveryErrorReports[headerCsr.errorMessages[msg].targetName] = { caption: headerCsr.errorMessages[msg].message, idSurvey: headerCsr.errorMessages[msg].idSurveySrc, idAnomaly: headerCsr.errorMessages[msg].idAnomalySrc };
                            else if (headerCsr.errorMessages[msg] && headerCsr.errorMessages[msg].messageType == 'ERROR') {
                                self.errorReports[headerCsr.errorMessages[msg].targetName] = { caption: headerCsr.errorMessages[msg].message };
                                //return true; //stop search
                                thereAreSurveysWithErrors = true;
                            }
                        }
                    }
                }
                //search for errors in details
                cs.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {
                    if (csr.errorMessages) {
                        //search for error message to display
                        for (var msg in csr.errorMessages) {
                            if (csr.errorMessages[msg] && csr.errorMessages[msg].isRecovery && csr.errorMessages[msg].isRecovery == true)
                                self.recoveryErrorReports[csr.errorMessages[msg].targetName] = { caption: csr.errorMessages[msg].message, idSurvey: csr.errorMessages[msg].idSurveySrc, idAnomaly: csr.errorMessages[msg].idAnomalySrc };
                            else if (csr.errorMessages[msg] && csr.errorMessages[msg].messageType == 'ERROR') {
                                self.errorReports[csr.errorMessages[msg].targetName] = { caption: csr.errorMessages[msg].message };
                                // return true; //stop search
                                thereAreSurveysWithErrors = true;
                            }
                        }
                    }
                });
            }
        });

        return thereAreSurveysWithErrors;
    },

    this._computeStateFlag = function (gui) {

        try {
            var entity = gui.getDocument();

            this.clientValid = this._loadCustomer(gui);

            this.editFuture = (UserContext.getConfigParam("EDIT_FUTURE", "0") != 0);

            this.futureVisit = (entity.get("DTEVISIT").toDate() > (new Date()).toDate());

            this.hasEditRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codFunc);

            this.canEditExecuted = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.EditExecutedAppointments.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditExecutedAppointments.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditExecutedAppointments.codFunc);

            var isExpired = SalesExecutionEngine.appointmentIsExpired({ "mobVisit": entity });

            this.isVisitEditable = !isExpired && (SalesExecutionEngine.appointmentIsEditable({ "mobVisit": entity }));

            this.readOnly = (this.futureVisit && !this.editFuture) || !this.isVisitEditable || !this.hasEditRight || !this.clientValid;

            if (!this.hasEditRight) { // || (!this.canEditExecuted && codStatus == SalesExecutionNameSpace.SurveyStatus.COMPLETED)) {
                XUI.showMsgBox({
                    title: "[MOB.SCHEDULE]",
                    msg: UserContext.tryTranslate("[MOB.NO_VISITDETAIL_EDIT_RIGHT]"),
                    icon: "INFO",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
            } else if (this.futureVisit && !this.editFuture) {
                XUI.showMsgBox({
                    title: "[MOB.SCHEDULE]",
                    msg: UserContext.tryTranslate("[MOB.FUTURE_VISIT_READONLY]"),
                    icon: "INFO",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
            } else if (isExpired) {
                XUI.showMsgBox({
                    title: "[MOB.SCHEDULE]",
                    msg: SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.VISIT_EXPIRED),
                    icon: "INFO",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
            } else if (!this.clientValid)
                XUI.showMsgBox({
                    title: "[MOB.SCHEDULE]",
                    msg: SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.VISIT_NOT_IN_AGENT_RESPONSIBILITY),
                    icon: "INFO",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });

            if (this.readOnly)
                gui.openMode = "VIEW";


            var context = {
                gui: gui
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterComputeStateFlag', context);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }

    },
    this._getDteFromAndTo = function (fieldName, newValue, entity) {

        var dteVisit;
        var dteVisitTo;
        var from;
        var strHourVisit;
        var to;
        var strHourVisitTo;

        if (fieldName == "STR_TIME_HOURVISIT")
            strHourVisit = newValue;
        else
            strHourVisit = entity.get("STR_TIME_HOURVISIT");

        if (fieldName == "STR_TIME_HOURVISITTO")
            strHourVisitTo = newValue;
        else
            strHourVisitTo = entity.get("STR_TIME_HOURVISITTO");

        if (fieldName == "DTEVISIT")
            dteVisit = new Date(newValue);
        else
            dteVisit = entity.get("DTEVISIT");

        if (fieldName == "DTEVISITTO")
            dteVisitTo = new Date(newValue);
        else
            dteVisitTo = entity.get("DTEVISITTO");

        from = new Date(dteVisit);
        var hourMinute = strHourVisit.split(":");
        from.setHours(new Number(hourMinute[0]));
        from.setMinutes(new Number(hourMinute[1]));

        to = new Date(dteVisitTo);
        hourMinute = strHourVisitTo.split(":");
        to.setHours(new Number(hourMinute[0]));
        to.setMinutes(new Number(hourMinute[1]));

        return { "dteVisit": dteVisit, "from": from, "to": to };
    },

    this._onAfterCustomerSurveyAdded = function (customerSurvey, gui) {

        var context = {
            customerSurvey: customerSurvey,
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeOnAfterCustomerSurveyAdded', context);
        if (context.canceled)
            return;

        var self = this;

        customerSurvey.uniqueID = customerSurvey.get("CODTYPSURVEY") + gui.uniqueCounter;
        gui.uniqueCounter = gui.uniqueCounter + 1; //gui level flag

        //state flags
        customerSurvey.isAtFirstLoad = true;

        //calculated measures 
        if (customerSurvey.hasCalculatedMeasures()) {

            //Check exiting details for invalid calculated measures
            if (!gui.autoReloadData && !this._areValidPersistentResults(customerSurvey, gui)) {
                XUI.showMsgBox({
                    title: "[MOB.VISIT]",
                    msg: SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.INVALID_PERSISTENT_CALCULATED_VALUES, customerSurvey),
                    icon: "ERR",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
                gui.b_invalidPersistentCalculatedMeasure = true;
            }

        }
        if (customerSurvey.hasCalculatedMeasures()) {
            //register property change notification handlre for existing details in collection
            customerSurvey.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {

                csr.propertyChanged = (function (context, gui) {
                    return function (entity, args) { context._customerSurveyRowPropertyChanged(entity, args, gui); };
                })(self, gui);

                if (!csr.isFakeProduct() && self._getAgregatedDetailMeasureList(csr.getParentEntity().get("CODTYPSURVEY")).length) {
                    csr.beforePropertyChanged = (function (context, gui) {
                        return function (entity, args) { context._customerSurveyRowBeforePropertyChanged(entity, args, gui); };
                    })(self, gui);
                }
                return true; //continue registration
            });

            //register store change notification handlers
            customerSurvey.getSubEntityStore("MVCustomerSurveyRow").storeChanged = (function (context, gui) {
                return function (store, args) { context._customerSurveyRowDetailsStoreChanged(store, args, gui); };
            })(this, gui);
        }

        // this._initDecodedPropertiesSupport(customerSurvey);

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterOnAfterCustomerSurveyAdded', context);
    },

    this._clearCodOpp = function (customerSurvey, gui) {
        var self = this;

        if (gui.openMode == "VIEW")
            return;
        if (!self._showOpportunities(customerSurvey.get("CODPARTY")))
            return;
        if (XApp.isEmptyOrWhitespaceString(customerSurvey.get("CODOPP")))
            return;

        var opportunityRow = XNavHelper.getFromMemoryCache("NAV_MOB_OPPORTUNITIES").findByKey(SalesForceEngine.buildOpportunityKey(customerSurvey.get("CODOPP"), customerSurvey.get("CODDIV")));

        if (opportunityRow && (opportunityRow.get("CODWFSTATEHARD") == SalesForceNameSpace.OpportunityWFHardState.Cancelled || opportunityRow.get("WFSTATETYPE") == CommonNameSpace.WFStateType.End))
            customerSurvey.set("CODOPP", "")
    },

    this._showOpportunities = function (codParty) {
        var navId = "NAV_MOB_OPPORTUNITIES";

        if ((UserContext.checkRight(navId, navId, "NAVIGATE") || UserContext.checkRight(navId, navId, "NAVDATA"))
            && !XApp.isEmptyOrWhitespaceString(codParty) && CommonEngine.isAccount(codParty))
            return true;
        else
            return false;
    }
    //this._initDecodedPropertiesSupport = function (customerSurvey) {
    //    var surveyConfig = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
    //    if (!surveyConfig) {
    //        XLog.logErr("Invalid survey type: " + customerSurvey.get("CODTYPSURVEY"));
    //        return;
    //    }

    //    //check and warn if there are more than 60 STRMEASURE defined in db schema
    //    if (XApp.model.getFieldDef("MVCustomerSurveyRow", "STRMEASURE61") != null)
    //        XLog.logWarn("CustomerSurveyRow object has more than 60 STRMEASUREs fields defined. Decodes/sorting/filtering for measures that save values in fields over STRMEASURE60 and use qtabs (field CODTAB) will not work properly. Code changes are needed to support the new fields from TA0192 and QSURVEY_CUSTOMERSURVEYDET.");


    //    //group surveyMeasures by fieldName
    //    var surveyMeasuresByFieldName = {};
    //    for (var j = 0; j < surveyConfig.SurveyMeasureDetails.length; j++) {
    //        var sm = surveyConfig.SurveyMeasureDetails[j];
    //        if (sm.FIELDNAME.indexOf("STRMEASURE") != -1 && !sm.FLGHEADER && !XApp.isEmptyOrWhitespaceString(sm.CODTAB)) {
    //            surveyMeasuresByFieldName[sm.FIELDNAME] = sm;
    //        }
    //    }

    //    customerSurvey.customCustomerSurveyRowDecoder = function (strMeasureName, customerSurveyRow) {
    //        try {
    //            if (surveyMeasuresByFieldName[strMeasureName]) {
    //                var sm = surveyMeasuresByFieldName[strMeasureName];
    //                var code = customerSurveyRow.get(strMeasureName);
    //                if (code)
    //                    return UserContext.decode(sm.CODTAB, code);
    //            }
    //        } catch (e) {
    //        }
    //        return "";
    //    };
    //};
    //#region Calculated Measures

    //Change handler for customer survey row/details stores
    //Checks calculated measures for rows
    //Registers property change notification handlers for detail properties
    this._customerSurveyRowDetailsStoreChanged = function (store, args, gui) {
        try {

            var context = {
                gui: gui,
                store: store,
                args: args,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCustomerSurveyRowDetailsStoreChanged', context);
            if (context.canceled)
                return;

            if (!store || ((!args.newItems || !args.newItems.length) && (!args.oldItems || !args.oldItems.length)))
                return;

            var parentCustomerSurvey = store.getParentEntity();

            if (!parentCustomerSurvey)
                return;

            var surveyConfig = SalesExecutionEngine.getSurveyConfig(parentCustomerSurvey.get("CODTYPSURVEY"));

            var fakeProductRow = parentCustomerSurvey.get("HEADER");

            if (args.newItems) {
                for (var i = 0; i < args.newItems.length; i++) {
                    var csr = args.newItems[i];
                    if (csr) {

                        csr.propertyChanged = null;

                        var calculatedMeasures = Ext.Array.sort(surveyConfig.SurveyMeasureDetails, function (s1, s2) {
                            return s1.CALCULATEPRIORITY - s2.CALCULATEPRIORITY;
                        });

                        if (csr != fakeProductRow) {

                            //evaluate product detail calculated measures
                            for (var j = 0; j < calculatedMeasures.length; j++) {
                                var sm = calculatedMeasures[j];

                                // update the calculated measures for all new customer survey rows
                                if (sm.FLGCALCULATED && !sm.FLGHEADER && !sm.FLGCOMPLEXCALCULATED &&
                                    (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE) || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                                    //do not calculate formula if the detail is part of head and measure is not
                                    var expression = this._getFormulaScriptExpr(sm);
                                    this._calculateFormula({
                                        visit: gui.getDocument(),
                                        customerSurvey: parentCustomerSurvey,
                                        calculatedMeasure: sm,
                                        customerSurveyRow: csr,
                                        headerRow: fakeProductRow,
                                        notifyOfChange: false, //false because there is no need to revalidate produce since is not in view( it will be revalidated when displayed).
                                        calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.ROWADD,
                                        expression: expression,
                                        gui: gui
                                    });
                                }
                            }

                            if ((this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY)).length) {
                                csr.beforePropertyChanged = (function (context, gui) {
                                    return function (entity, args) { context._customerSurveyRowBeforePropertyChanged(entity, args, gui); };
                                })(this, gui);
                            }

                            if (fakeProductRow && (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY)).length) {
                                for (var j = 0; j < (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY)).length; j++) {
                                    var sm = (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY))[j];
                                    if (sm && (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE) || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                                        fakeProductRow.set(sm.FIELDNAME, fakeProductRow.get(sm.FIELDNAME) + csr.get(sm.FIELDNAME));
                                    }
                                }
                            }
                        } else {

                            //refresh calculated header measures
                            for (var j = 0; j < calculatedMeasures.length; j++) {
                                var sm = calculatedMeasures[j];

                                // update the calculated measures for all new customer survey rows
                                if (sm.FLGCALCULATED && sm.FLGHEADER && !sm.FLGCOMPLEXCALCULATED && (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE) || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                                    //do not calculate formula if the detail is part of head and measure is not
                                    var expression = this._getFormulaScriptExpr(sm);
                                    this._calculateFormula({
                                        visit: gui.getDocument(),
                                        customerSurvey: parentCustomerSurvey,
                                        calculatedMeasure: sm,
                                        customerSurveyRow: csr, //csr==fakeProductRow
                                        headerRow: fakeProductRow,
                                        notifyOfChange: true,
                                        calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.ROWADD,
                                        expression: expression,
                                        gui: gui
                                    });
                                }
                            }
                        }

                        //attach property changed event handler
                        csr.propertyChanged = (function (context, gui) {
                            return function (entity, args) { context._customerSurveyRowPropertyChanged(entity, args, gui); };
                        })(this, gui);

                    }
                }
            }

            if (args.oldItems) {
                if (fakeProductRow && (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY)).length) {
                    for (var j = 0; j < (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY)).length; j++) {
                        var sm = (this._getAgregatedDetailMeasureList(surveyConfig.CODTYPSURVEY))[j];
                        if (sm && (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE) || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                            var valueToSubstract = 0;
                            for (var i = 0; i < args.oldItems.length; i++) {
                                var csr = args.oldItems[i];
                                if (csr && csr != fakeProductRow) {
                                    valueToSubstract += csr.get(sm.FIELDNAME);
                                }
                            }
                            if (valueToSubstract != 0)
                                fakeProductRow.set(sm.FIELDNAME, fakeProductRow.get(sm.FIELDNAME) - valueToSubstract);
                        }
                    }
                }
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCustomerSurveyRowDetailsStoreChanged', context);

        } catch (e) {
            XLog.logEx(e);
        }
    };
    //Customer survey row/details property change handler
    //Compute calculated measures and trigger validation for detail row.
    this._customerSurveyRowPropertyChanged = function (csr, args, gui) {

        try {
            var context = {
                gui: gui,
                csr: csr,
                args: args,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCustomerSurveyRowPropertyChanged', context);
            if (context.canceled)
                return;


            if (!csr || !args || !args.propertyName)
                return;

            var parentCustomerSurvey = csr.getParentEntity();
            if (!parentCustomerSurvey)
                return;

            if (!parentCustomerSurvey.hasCalculatedMeasures())
                return;

            var surveyConfig = SalesExecutionEngine.getSurveyConfig(parentCustomerSurvey.get("CODTYPSURVEY"));
            for (var i = 0; i < surveyConfig.SurveyMeasureDetails.length; i++) {
                var measure = surveyConfig.SurveyMeasureDetails[i];
                if (measure.FIELDNAME == args.propertyName) {
                    break;
                }
            }

            if (measure) {

                var calculatedMeasures = Ext.Array.sort(surveyConfig.SurveyMeasureDetails, function (s1, s2) {
                    return s1.CALCULATEPRIORITY - s2.CALCULATEPRIORITY;
                });

                if (csr.isFakeProduct()) {

                    for (var j = 0; j < calculatedMeasures.length; j++) {
                        var sm = calculatedMeasures[j];
                        // do not compute complex calculated measures on header
                        if (sm.FLGCALCULATED && sm.FLGHEADER && !sm.FLGCOMPLEXCALCULATED
                            && (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE)
                            || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH
                            || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                            var expression = this._getFormulaScriptExpr(sm);
                            if (expression && expression.isFormulaVariable(measure.CODMEASURE)) {
                                this._calculateFormula({
                                    visit: gui.getDocument(),
                                    customerSurvey: parentCustomerSurvey,
                                    calculatedMeasure: sm,
                                    customerSurveyRow: csr,
                                    headerRow: csr,
                                    notifyOfChange: true,
                                    calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.CHANGE,
                                    expression: expression,
                                    gui: gui
                                }); //revalidate product
                            }
                        }
                    }
                } else {
                    var fakeProductRow = parentCustomerSurvey.get("HEADER");

                    for (var j = 0; j < calculatedMeasures.length; j++) {
                        var sm = calculatedMeasures[j];
                        if (sm.FLGCALCULATED && !sm.FLGHEADER &&
                            (XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE)
                            || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH
                            || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE)) {
                            var expression = this._getFormulaScriptExpr(sm);
                            if (expression) { //&& expression.isFormulaVariable(measure.CODMEASURE)) {
                                //calculate complex measure only if this change was not triggered by the same complex calculated measure
                                if (sm.FLGCOMPLEXCALCULATED) {
                                    //calculated measures can be triggered by itself even if it's name is not used in the formula (thus the second part after the ||)

                                    //m_currentComplexCalculation == surveyMeasure skip this change notification if it was fired during a complex calculation for the same measure beeing changed.
                                    //meaning: calculate only once all values for one complex calculated measure and all rows.
                                    if (expression.isFormulaVariable(measure.CODMEASURE) || sm.CODMEASURE == measure.CODMEASURE)
                                        if (!gui.m_currentComplexCalculation || gui.m_currentComplexCalculation.length == 0 || sm.CODMEASURE != gui.m_currentComplexCalculation[gui.m_currentComplexCalculation.length - 1].CODMEASURE)
                                            this._calculateComplexFormula({
                                                visit: gui.getDocument(),
                                                customerSurvey: parentCustomerSurvey,
                                                calculatedMeasure: sm,
                                                headerRow: fakeProductRow,
                                                notifyOfChange: false,
                                                calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.CHANGE,
                                                expression: expression,
                                                gui: gui
                                            });
                                } else
                                    if (expression.isFormulaVariable(measure.CODMEASURE))
                                        this._calculateFormula({
                                            visit: gui.getDocument(),
                                            customerSurvey: parentCustomerSurvey,
                                            calculatedMeasure: sm,
                                            customerSurveyRow: csr,
                                            headerRow: fakeProductRow,
                                            notifyOfChange: true,
                                            calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.CHANGE,
                                            expression: expression,
                                            gui: gui
                                        });
                            }
                        }
                    }
                }
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCustomerSurveyRowPropertyChanged', context);
        } catch (e) {
            XLog.logEx(e);
        }
    },
    //Customer survey row/details property change handler
    //Compute calculated measures and trigger validation for detail row.
    this._customerSurveyRowBeforePropertyChanged = function (csr, args, gui) {

        try {

            var context = {
                gui: gui,
                csr: csr,
                args: args,
                canceled: false
            };
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCustomerSurveyRowBeforePropertyChanged', context);
            if (context.canceled)
                return;

            if (!csr || !args || !args.propertyName || csr.isFakeProduct())
                return;

            var parentCustomerSurvey = csr.getParentEntity();
            if (!parentCustomerSurvey)
                return;

            var fieldName = args.propertyName;

            var sm = Ext.Array.filter(this._getAgregatedDetailMeasureList(parentCustomerSurvey.get("CODTYPSURVEY")), function (item) {
                return item.FIELDNAME == fieldName;
            })[0];
            if (XApp.isEmptyOrWhitespaceString(fieldName) || !sm || !(XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE) || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.CHANGE))
                return;


            var fakeProduct = parentCustomerSurvey.get("HEADER");
            if (fakeProduct) {
                var oldSum = fakeProduct.get(fieldName);
                var newSum = oldSum - args.oldValue + args.newValue;
                fakeProduct.set(fieldName, newSum);
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCustomerSurveyRowBeforePropertyChanged', context);

        } catch (e) {
            XLog.logEx(e);
        }
    };

    //Check if the persisted value of the calculated measures is different for the first 5 rows
    // (if the calculated measure formula changed)
    this._areValidPersistentResults = function (cs, gui) {
        try {

            var chkPar = ParametersDefaultsAndStaticData.getInstance().getModifiedFormulaChecks();
            if (cs.getSubEntityStore("MVCustomerSurveyRow").getCount() < chkPar)
                chkPar = cs.getSubEntityStore("MVCustomerSurveyRow").getCount();
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));
            if (surveyConfig) {

                var calculatedMeasures = Ext.Array.sort(surveyConfig.SurveyMeasureDetails, function (s1, s2) {
                    return s1.CALCULATEPRIORITY - s2.CALCULATEPRIORITY;
                });
                var fakeProductRow = cs.get("HEADER");

                //calculate measures that are for details
                for (var j = 0; j < chkPar; j++) {
                    var csr = cs.getSubEntityStore("MVCustomerSurveyRow").getAt(j);
                    if (csr.isFakeProduct()) //fakeProductRow may not be detached from MVCustomerSurveyRow store at this point
                        continue;

                    for (var i = 0; i < calculatedMeasures.length; i++) {
                        var sm = calculatedMeasures[i];
                        if (sm.FLGCALCULATED && !sm.FLGHEADER) {
                            var expression = this._getFormulaScriptExpr(sm);
                            var result = this._getResultOfCalculatedFormula({
                                visit: gui.getDocument(),
                                calculatedMeasure: sm,
                                customerSurvey: cs,
                                customerSurveyRow: csr,
                                headerRow: fakeProductRow,
                                calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.INTEGRITYCHECK,
                                expression: expression
                            });
                            //sm, csr, fakeProductRow, expression);
                            var result = this._convertResultOfCalculation(sm, result);
                            if (result != null && result != csr.get(sm.FIELDNAME))
                                return false;
                        }
                    }
                }
                if (fakeProductRow) {

                    //aggregate fields for header measure calculations
                    if (this._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY"))) {
                        for (var i = 0; i < this._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY")).length; i++) {
                            var sm = this._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY"))[i];
                            if (sm) {
                                var sum = this._aggregateMeasure(cs, sm.FIELDNAME);
                                var currentValue = fakeProductRow.get(sm.FIELDNAME);
                                if (sum != currentValue)
                                    return false;
                            }
                        }
                    }

                    //update also for  header product
                    for (var j = 0; j < calculatedMeasures.length; j++) {
                        var sm = calculatedMeasures[j];
                        if (sm.FLGCALCULATED && sm.FLGHEADER) {
                            var expression = this._getFormulaScriptExpr(sm);
                            var result = this._getResultOfCalculatedFormula({
                                visit: gui.getDocument(),
                                calculatedMeasure: sm,
                                customerSurvey: cs,
                                customerSurveyRow: fakeProductRow,
                                headerRow: fakeProductRow,
                                calculationTrigger: SalesExecutionNameSpace.CalculationTriggers.INTEGRITYCHECK,
                                expression: expression
                            });//sm, fakeProductRow, fakeProductRow, expression);
                            var result = this._convertResultOfCalculation(sm, result);
                            if (result != null && result != fakeProductRow.get(sm.FIELDNAME))
                                return false;
                        }
                    }
                }


            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
        return true;
    },

    //Calculate the defined formula
    //checkMeasureChange : triggers a validation of the whole csr.
    this._calculateFormula = function (context) {
        try {
            if (!context.customerSurveyRow || !context.calculatedMeasure)
                return;

            //calculated formula
            var result = this._getResultOfCalculatedFormula(context);

            var convertedResult = this._convertResultOfCalculation(context.calculatedMeasure, result);
            if (convertedResult != null) {
                context.customerSurveyRow.set(context.calculatedMeasure.FIELDNAME, convertedResult);
                if (context.notifyOfChange)
                    this._onMeasureChange(context.customerSurvey, context.customerSurveyRow, context.calculatedMeasure.CODMEASURE,
                                            context.gui.tabPanel.getActiveItem());
            }
        } catch (e) {
            XLog.logErr(SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.INVALID_CALCULATED_MEASURE, { codTypSurvey: context.customerSurvey.get("CODTYPSURVEY"), codMeasure: context.calculatedMeasure.CODMEASURE }));
            XLog.logEx(e);
        }
    },

    /*
    context={
        calculatedMeasure,
        calculationTrigger,
        customerSurvey,
        headerRow,
        notifyOfChange,
        expression,
        visit,
        gui}
    */
    this._calculateComplexFormula = function (context) {
        try {

            context.gui.m_currentComplexCalculation.push(context.calculatedMeasure);

            //create in memory copy to be sorted
            var details = context.customerSurvey.getSubEntityStore("MVCustomerSurveyRow").queryBy(function (csr) {
                return !csr.isFakeProduct();
            });

            //Order details before calculation by CODMEASURESORT
            if (!XApp.isEmptyOrWhitespaceString(context.calculatedMeasure.CODMEASURESORT)) {
                try {
                    var sortFielInfo = SalesExecutionEngine._getFieldNameAndSortOrder(context.calculatedMeasure.CODMEASURESORT);
                    var sortMeasure = SalesExecutionEngine.getSurveyMeasureConfig(context.calculatedMeasure.CODTYPSURVEY, sortFielInfo.fieldName);

                    var sorter = function (csr1, csr2) {
                        var result = 0;

                        if (sortFielInfo.fieldName) {
                            if (sortFielInfo.sortOrder != "ASC")
                                result = -SalesExecutionEngine.compareSortAttributes(csr1, csr2, sortMeasure.FIELDNAME);
                            else
                                result = SalesExecutionEngine.compareSortAttributes(csr1, csr2, sortMeasure.FIELDNAME);
                        }

                        return result;
                    };

                    details = Ext.Array.sort(details, sorter);

                } catch (e1) {
                    XLog.logErr("Sorting " + context.calculatedMeasure.CODMEASURESORT + " could not be applied for calculated measure " + context.calculatedMeasure.CODMEASURE);
                    XLog.logEx(e1);
                }
            }

            //calculate for all details
            for (var i = 0; i < details.length; i++) {
                context.customerSurveyRow = details[i];
                this._calculateFormula(context);
            }

            context.gui.m_currentComplexCalculation.pop();

        } catch (e) {
            XLog.logErr(SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.INVALID_CALCULATED_MEASURE, { codTypSurvey: context.customerSurvey.get("CODTYPSURVEY"), codMeasure: context.calculatedMeasure.CODMEASURE }));
            XLog.logEx(e);
        }

        if (!context.skipUIRefresh)
            //reflect visual change in other rows than the one triggering the calculation
            this._refreshProductsGrid(context.gui, context.customerSurvey, false);
    },

    //return null if conversion fails
    this._convertResultOfCalculation = function (calculatedMeasure, result) {
        if (result != undefined && result != null && (isNaN(result) || isFinite(result))) {
            if (calculatedMeasure.FIELDNAME.indexOf("STRMEASURE") != -1) {
                if (result.toString) {
                    return result.toString();
                }
            } else if (calculatedMeasure.FIELDNAME.indexOf("DTEMEASURE") != -1) {
                var date = new Date(result);
                if (!isNaN(date)) {
                    return date;
                }
            } else if (calculatedMeasure.FIELDNAME.indexOf("LNGMEASURE") != -1) {
                //perform integer rounding
                var num = new Number(result);
                if (num && !isNaN(num) && isFinite(num)) {
                    return Math.round(num.valueOf());
                }
            } else if (calculatedMeasure.FIELDNAME.indexOf("DBLMEASURE") != -1) {
                var num = new Number(result);
                if (num && !isNaN(num) && isFinite(num)) {
                    var prec = XApp.model.getFieldDef("MVCustomerSurveyRow", calculatedMeasure.FIELDNAME).maxVal.toString().split('.')[1].length;
                    return Number(num.toFixed(prec));
                }
            } else {
                return result;
            }
        }
        return null;
    };

    //Calculate the defined formula and return the result
    this._getResultOfCalculatedFormula = function (context) {
        try {
            if (!context.expression || !context.customerSurveyRow || !context.calculatedMeasure)
                return null;

            this._prepareScriptEnvironment(context);

            //calculated formula
            var result = context.expression.eval();
            return this._convertResultOfCalculation(context.calculatedMeasure, result);
        } catch (e) {
            XLog.logErr(SalesExecutionMessages.GetMessage(SalesExecutionNameSpace.SalesExecutionMessagesTypes.INVALID_CALCULATED_MEASURE, { codTypSurvey: context.customerSurvey.get("CODTYPSURVEY"), codMeasure: context.calculatedMeasure.CODMEASURE }));
            XLog.logEx(e);
        }
        return null;
    },

    this._prepareScriptEnvironment = function (context) {

        var context1 = {
            context: context,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforePrepareScriptEnvironment', context1);
        if (context1.canceled)
            return;

        if (!XApp.isEmptyOrWhitespaceString(context.calculatedMeasure.DESFORMULA1)) {
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.VISIT, context.visit);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.ACTIVITY, context.customerSurvey);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.ROW, context.customerSurveyRow);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.HEADER_ROW, context.headerRow);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.CALCULATION_MODE, context.calculationTrigger);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.WINDOW, window);
            context.expression.setEnvVar(SalesExecutionNameSpace.CalculationConstants.SURVEYS, XApp.GlobalData["SURVEYS"]);
        } else {
            //prepare environment
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(context.calculatedMeasure.CODTYPSURVEY);

            //go through all the variables and update the environment
            //the variables are stored as aliases to avoid errors on parsing for measures named  like 'ABC.CD'
            for (var codmeasure in context.expression.getTriggeringMeasureCodes()) {
                for (var i = 0; i < surveyConfig.SurveyMeasureDetails.length; i++) {
                    var sm = surveyConfig.SurveyMeasureDetails[i];
                    if (sm.CODMEASURE == codmeasure) {
                        var fieldName = sm.FIELDNAME;
                        var o;
                        if (sm.FLGHEADER) {
                            if (!context.headerRow) {
                                XLog.logWarn("CalculateFormula: Cannot evaluate header calculated measure " + context.calculatedMeasure.CODMEASURE + ", must retrieve value for " + codmeasure + " - NULL fake product");
                                return;
                            }
                            o = context.headerRow.get(fieldName);
                        } else {
                            o = context.customerSurveyRow.get(fieldName);
                        }
                        if (o != null)
                            context.expression.setEnvVar(codmeasure, o);
                        break;
                    }
                }
            }
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterPrepareScriptEnvironment', context1);
    };

    //Get formula expression for measure. 
    //Caches parsed formulas at customizer level. (This means result is available even after gui closure)
    this._getFormulaScriptExpr = function (sm) {
        try {
            var codMeasure = sm.CODMEASURE;
            //customizer level flag (!does not get reset after gui closure)
            if (!this.m_parsedFormulas) {
                this.m_parsedFormulas = {};
            }
            if (!this.m_parsedFormulas[codMeasure]) {
                //formula factory
                if (!XApp.isEmptyOrWhitespaceString(sm.DESFORMULA1))
                    this.m_parsedFormulas[codMeasure] = Ext.create('SeCodeExpressionWrapper', { "formula": sm.DESFORMULA1 });
                else
                    this.m_parsedFormulas[codMeasure] = Ext.create('SeExpressionWrapper', { "formula": sm.DESFORMULA });
            }
            return this.m_parsedFormulas[codMeasure];

        } catch (e) {
            XLog.logEx(e);
        }
        return null;
    };

    this._checkAndUpdateCalculatedMeasures = function (gui) {
        try {
            var self = this;
            var visit = gui.getDocument();

            visit.getSubEntityStore("MVCustomerSurvey").each(function (cs) {
                self._updateCalculatedMeasures(cs, SalesExecutionNameSpace.CalculationTriggers.SAVE, gui, true);
            });
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    //Rebinds change handlers. Calculates row detail measures. Calculates aggregated header measures.
    //Calculation mode can be omitted. If omitted all calculations are performed.
    this._updateCalculatedMeasures = function (cs, calculationMode, gui, refreshTab) {
        var self = this;

        if (cs && cs.getEntityName() == "MVCustomerSurvey" && cs.hasCalculatedMeasures()) {
            //detach store changed handlers
            cs.getSubEntityStore("MVCustomerSurveyRow").storeChanged = null;
            //detach property changed handlers
            cs.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {
                csr.propertyChanged = null;
                csr.beforePropertyChanged = null;
            });

            //detach property changed from header product detail
            if (cs.get("HEADER"))
                cs.get("HEADER").propertyChanged = null;

            var fakeProduct = cs.get("HEADER");

            //update calculated measures
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(cs.get("CODTYPSURVEY"));


            //calculate if:
            //calculationMode is not specified
            //measure calculation mode is not specified
            //update calculation mode is SAVE
            //measure calculation mode is BOTH
            //measure calculation mode matches update calculation mode
            var calculatedMeasures = Ext.Array.filter(surveyConfig.SurveyMeasureDetails,
            function (item) {
                return item.FLGCALCULATED
                && (XApp.isEmptyOrWhitespaceString(calculationMode)
                    || XApp.isEmptyOrWhitespaceString(item.CODCALCULATIONMODE)
                    || calculationMode == SalesExecutionNameSpace.CalculationTriggers.SAVE
                    || item.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH
                    || item.CODCALCULATIONMODE == calculationMode);
            });
            calculatedMeasures = Ext.Array.sort(calculatedMeasures, function (s1, s2) {
                return s1.CALCULATEPRIORITY - s2.CALCULATEPRIORITY;
            });

            for (var j = 0; j < calculatedMeasures.length; j++) {
                var sm = calculatedMeasures[j];
                if (!sm.FLGHEADER) {
                    var expression = self._getFormulaScriptExpr(sm);

                    if (sm.FLGCOMPLEXCALCULATED) {
                        self._calculateComplexFormula({
                            calculatedMeasure: sm,
                            calculationTrigger: calculationMode,
                            customerSurvey: cs,
                            headerRow: fakeProduct,
                            notifyOfChange: false,
                            expression: expression,
                            visit: gui.getDocument(),
                            gui: gui,
                            skipUIRefresh: true
                        });
                    } else {
                        //calculate for product details
                        cs.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {
                            if (csr == fakeProduct) return;
                            self._calculateFormula({
                                calculatedMeasure: sm,
                                calculationTrigger: calculationMode,
                                customerSurvey: cs,
                                customerSurveyRow: csr,
                                headerRow: fakeProduct,
                                notifyOfChange: false,
                                expression: expression,
                                visit: gui.getDocument(),
                                gui: gui
                            });
                        });
                    }
                }
            }

            if (fakeProduct) {

                //aggregate fields for header measure calculations
                if (self._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY"))) {
                    for (var i = 0; i < self._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY")).length; i++) {
                        var sm = self._getAgregatedDetailMeasureList(cs.get("CODTYPSURVEY"))[i];
                        if (sm &&
                            (XApp.isEmptyOrWhitespaceString(calculationMode)
                            || XApp.isEmptyOrWhitespaceString(sm.CODCALCULATIONMODE)
                        || sm.CODCALCULATIONMODE == SalesExecutionNameSpace.CALCULATIONMODE.BOTH
                            || sm.CODCALCULATIONMODE == calculationMode)) {
                            var sum = self._aggregateMeasure(cs, sm.FIELDNAME);
                            fakeProduct.set(sm.FIELDNAME, sum);
                        }
                    }
                }

                //update also for  header product
                for (var j = 0; j < calculatedMeasures.length; j++) {
                    var sm = calculatedMeasures[j];
                    if (sm.FLGHEADER && !sm.FLGCOMPLEXCALCULATED) {
                        var expression = self._getFormulaScriptExpr(sm);
                        self._calculateFormula({
                            calculatedMeasure: sm,
                            calculationTrigger: calculationMode,
                            customerSurvey: cs,
                            customerSurveyRow: fakeProduct,
                            headerRow: fakeProduct,
                            notifyOfChange: false,
                            expression: expression,
                            visit: gui.getDocument(),
                            gui: gui
                        }); //sm, fakeProduct, fakeProduct, expression, false);
                    }
                }
            }

            //re-attach store changed handlers
            cs.getSubEntityStore("MVCustomerSurveyRow").storeChanged = (function (context, gui) {
                return function (store, args) { context._customerSurveyRowDetailsStoreChanged(store, args, gui); };
            })(self, gui);
            //re-attach property changed handlers
            cs.getSubEntityStore("MVCustomerSurveyRow").each(function (csr) {
                csr.propertyChanged = (function (context, gui) {
                    return function (entity, args) { context._customerSurveyRowPropertyChanged(entity, args, gui); };
                })(self, gui);
                csr.beforePropertyChanged = (function (context, gui) {
                    return function (entity, args) { context._customerSurveyRowBeforePropertyChanged(entity, args, gui); };
                })(self, gui);
            });
            //re-attach property changed from header product detail
            if (fakeProduct) {
                fakeProduct.propertyChanged = (function (context, gui) {
                    return function (entity, args) { context._customerSurveyRowPropertyChanged(entity, args, gui); };
                })(self, gui);
            }

            if (refreshTab) {
                //rebind stores
                self._refreshTab(gui, cs);
            }
        }
    };

    //Return the sum of all product details on the specified fieldName 
    this._aggregateMeasure = function (customerSurvey, fieldName) {

        var sum = 0;
        for (var i = 0; i < customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getCount() ; i++) {
            var csr = customerSurvey.getSubEntityStore("MVCustomerSurveyRow").getAt(i);
            if (!csr.isFakeProduct()) {
                var value = csr.get(fieldName);
                if (value != undefined && value != null) {
                    sum = Number(Number(sum + value).toFixed(12));
                }
            }
        }
        return sum;
    };

    // Dictionary containing the CODTYPSURVEY and list of measures that have to be Aggregated in the fakeProduct  row
    //Stored at extension level so data is kept event after gui closes and reopens. This makes sence since the measure data does not change during this time frame.
    this._getAgregatedDetailMeasureList = function (codTypSurvey) {
        if (this.m_agregatedDetailMeasures && this.m_agregatedDetailMeasures[codTypSurvey])
            return this.m_agregatedDetailMeasures[codTypSurvey];

        if (!this.m_agregatedDetailMeasures)
            this.m_agregatedDetailMeasures = {};

        var survey = SalesExecutionEngine.getSurveyConfig(codTypSurvey);
        var measures = [];
        for (var i = 0; i < survey.SurveyMeasureDetails.length; i++) {
            var sm = survey.SurveyMeasureDetails[i];
            if (sm && sm.FLGCALCULATED && sm.FLGHEADER) {
                var expression = this._getFormulaScriptExpr(sm);
                if (expression) {
                    for (var codmeasure in expression.getTriggeringMeasureCodes()) {
                        for (var j = 0; j < survey.SurveyMeasureDetails.length; j++) {
                            var smProduct = survey.SurveyMeasureDetails[j];
                            if (smProduct.CODMEASURE == codmeasure && !smProduct.FLGHEADER && measures.indexOf(smProduct) == -1) {
                                measures.push(smProduct);
                            }
                        }
                    }
                }
            }
        }
        this.m_agregatedDetailMeasures[codTypSurvey] = measures;
        return measures;
    };
    //#endregion

    //#region OBJECTIVES Management

    this._loadObjectives = function (customerSurvey, gui, onFailure, onSuccess) {
        try {
            var visit = gui.getDocument();

            var surveys = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
            if (!surveys.SurveyMeasureDetails) {
                onSuccess();
                return;
            }

            var measuresToLoadFor = [];
            for (var i = 0; i < surveys.SurveyMeasureDetails.length; i++) {
                var survey = surveys.SurveyMeasureDetails[i];
                if (survey.FLGOBJECTIVE && !XApp.isEmptyOrWhitespaceString(survey.CODOBJMEASURE)) {
                    //not already loaded
                    if (!gui.m_appliableObjectives[survey.CODOBJMEASURE]) {
                        measuresToLoadFor.push(survey.CODOBJMEASURE);
                        gui.m_appliableObjectives[survey.CODOBJMEASURE] = []; //MAKE A DICTIONARY WITH KEY = codobjmeasure AND value = LIST OF OBJECTIVES WITH THAT CODE
                    }
                }
            }
            if (measuresToLoadFor.length) {
                //Load appliable objective collection of current customer survey
                SalesExecutionEngine.getAppliableObjectives(measuresToLoadFor, visit.get("DTEVISIT").toDate(), function (objectives) {
                    if (objectives && objectives.length) {
                        for (var i = 0; i < objectives.length; i++) {
                            var objective = objectives[i];
                            if (gui.m_appliableObjectives[objective.CODOBJMEASURE])
                                gui.m_appliableObjectives[objective.CODOBJMEASURE].push(objective);
                        }
                    }
                    onSuccess();
                });
            }
            else
                onSuccess();
        } catch (e) {
            onFailure(e);
        }
    };

    //#endregion

    this._afterVisitLoaded = function (gui, failureCallBack, successCallback) {
        var self = this;

        try {


            var doc = gui.getDocument();

            // for the customerSurvey with CODTYPSURVEY="ORDER" set the associate order to the customerSurvey
            doc.getSubEntityStore('MVCustomerSurvey').each(function (customerSurvey) {
                if (customerSurvey.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey()) {
                    var orders = SalesForceEngine.getAllOrderNavRows(new XConstraints({
                        logicalOp: 'AND',
                        constraints: [
                            new XConstraint("IDSURVEY", "=", customerSurvey.get("IDSURVEY"))
                        ]
                    }));

                    if (orders && orders.length) {
                        customerSurvey.set("Order", orders[0]);
                        customerSurvey.set("ACTIVITYDESCRIPTION", UserContext.decode("CTORD", orders[0].get("CODTYPORD")));
                    }

                }
            });

            //ADD one tab for each activity
            doc.getSubEntityStore('MVCustomerSurvey').each(function (customerSurvey) {
                if (SalesExecutionEngine.parseSurveyTypeDetail(customerSurvey.get("CODTYPSURVEY")) != SalesExecutionNameSpace.SurveyTypeDetail.CONTACT)
                    self._createCustomerSurveyTab(customerSurvey, gui);
            });

            //SET MODIFIED FLAG IF THERE ARE INVALID CALCULATED MEASURES
            if (gui.openMode != "VIEW" && gui.b_invalidPersistentCalculatedMeasure)
                gui.setModified(doc);

            //Set Sequence break cause if any
            if (gui.openMode == "EDIT" && !XApp.isEmptyOrWhitespaceString(gui.openData.sequenceBreakCause)) {
                doc.set("CODSEQBREAKCAUSE1", gui.openData.sequenceBreakCause);
                gui.setModified(doc);
            }

            gui.refreshGui();
            this._updateVisitButtonState(gui);
            this._refreshTabs(gui);

            //select previously selected tab , if any
            for (var i = 0; i < gui.tabSubDetails.length; i++) {
                var tab = gui.tabSubDetails[i];
                if (tab.tabName && gui.openData.selectedTabName == tab.tabName) {
                    var initialTab = tab;
                    break;
                }
            }
            if (initialTab) {
                gui.tabPanel.setActiveItem(initialTab);
            }

            if (successCallback)
                successCallback();

        } catch (e) {
            if (failureCallBack)
                failureCallBack(e);
        }
    },
    this._getScrollForActiviy = function (customerSurvey) {
        if (this._hasSideTabBar(customerSurvey)) {
            return "false";
        }
        switch (SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"))) {
            case SalesExecutionNameSpace.ActivityType.PRODUCT:
                if (XApp.isPhone())
                    return "true";
                return "auto";
            case SalesExecutionNameSpace.ActivityType.CONTACT:
            case SalesExecutionNameSpace.ActivityType.ATTACHMENTS:
                return "false";
            case SalesExecutionNameSpace.ActivityType.QUEST:
            case SalesExecutionNameSpace.ActivityType.CUSTOMER:
                return "true";
        }

        return "true";
    };
    this._fillCustomerSurveyLayout = function (customerSurvey, customerSurveyLayout, tab) {

        var context = {
            customerSurvey: customerSurvey,
            customerSurveyLayout: customerSurveyLayout,
            tab: tab,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeFillCustomerSurveyLayout', context);
        if (context.canceled)
            return;

        switch (SalesExecutionEngine.getActivityType(customerSurvey.get("CODTYPSURVEY"))) {
            case SalesExecutionNameSpace.ActivityType.PRODUCT:
            case SalesExecutionNameSpace.ActivityType.QUEST:
            case SalesExecutionNameSpace.ActivityType.CUSTOMER:

                //3. Customer Survey Head section
                var section = {
                    elementName: "section",
                    attrs: {
                        type: "CARD",
                        caption: "CUSTOMERSURVEY_HEAD",
                        startExpanded: this._hasSideTabBar(customerSurvey) ? "fixed" : "true",
                        baseObject: "MVCustomerSurvey",
                        icon: SalesExecutionNameSpace.ActivitySectionIcons["CUSTOMERSURVEY_HEAD"]

                    },
                    children: []
                };
                customerSurveyLayout.children.push(section);

                //4. MVCustomerSurveyRow details layout
                var customerSurveyRowLayout = {
                    elementName: "layout",
                    attrs: {
                        baseObject: "MVCustomerSurveyRow"
                    },
                    children: []
                };
                tab.children.push(customerSurveyRowLayout);

                //5. Customer Survey Row Head section
                section = {
                    elementName: "section",
                    attrs: {
                        type: "CARD",
                        caption: "PRODUCT_HEAD",
                        startExpanded: this._hasSideTabBar(customerSurvey) ? "fixed" : "true",
                        baseObject: "MVCustomerSurveyRow",
                        icon: SalesExecutionNameSpace.ActivitySectionIcons["PRODUCT_HEAD"]
                    },
                    children: []
                };
                customerSurveyRowLayout.children.push(section);
                break;
            case SalesExecutionNameSpace.ActivityType.ATTACHMENTS:
                //3. Customer Survey Head section
                var section = {
                    elementName: "section",
                    attrs: {
                        type: "ATTACHMENTS",
                        caption: "ATTACHMENT",
                        startExpanded: "true",
                        baseObject: "MVCustomerSurvey"
                    },
                    children: []
                };
                customerSurveyLayout.children.push(section);
                break;
        }
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterFillCustomerSurveyLayout', context);
    },

    //#region  Tab Management
    this._createCustomerSurveyTab = function (customerSurvey, gui) {
        var self = this;
        if (!gui.tabSubDetailsByName[customerSurvey.uniqueID]) {
            //1. BUILD TAB LAYOUT
            var tab = {
                text: "",
                elementName: "tab",
                attrs: {
                    name: customerSurvey.uniqueID,
                    translatedCaption: customerSurvey.get("DesTypSurveyLong"),
                    useSideTabBar: self._hasSideTabBar(customerSurvey) ? 'true' : 'false'
                },
                children: []
            };
            //2. MAIN MVCustomerSurvey layout
            var customerSurveyLayout = {
                elementName: "layout",
                attrs: {
                    baseObject: "MVCustomerSurvey",
                    scrollable: self._getScrollForActiviy(customerSurvey)
                },
                children: []
            };
            tab.children.push(customerSurveyLayout);

            //If the document was saved, keep the flag status from before saving
            var beforeSavingTab = gui.executedActivities[customerSurvey.getKey()];

            if (beforeSavingTab && !customerSurvey.isNew) {
                tab.canBeExecuted = beforeSavingTab.tabConfig.canBeExecuted;
                tab.wasVisited = beforeSavingTab.tabConfig.wasVisited;
            } else {
                tab.wasVisited = false;
                tab.canBeExecuted = false;
            }
            self._fillCustomerSurveyLayout(customerSurvey, customerSurveyLayout, tab);

            var tabItemPanel = gui.addNewTabPanel(tab);
            //increment the number of visible tabs
            gui._visibleActivityTabs++;



            gui.refreshTabsStatus();

            return tabItemPanel;
        }
    };

    this._onTabPanelShown = function (tabPanel, context) {
        //seems an anomaly. tabPanel.show is called when the gui is closed and all items are remove.
        //the trick here is to check if the panel calling this event is rendered.
        //if it is the it means we are not in the bug condition.
        if (tabPanel.rendered) {
            this._startVisitDurationCounter(context);
            this._updateCalculatedMeasures(context.storeEntity, SalesExecutionNameSpace.CalculationTriggers.SHOW, context.gui);
            this._refreshCustomerSurveyTab(tabPanel, context);
        }
    };

    this._onTabPanelHide = function (tabPanel, context) {
        if (tabPanel.rendered) {
            this._stopVisitDurationCounter(context);
        }
    };

    //Validate survey when tab item is selected
    //tabPanel: tab panel item
    //context: DetailContext for entity
    this._refreshCustomerSurveyTab = function (tabPanel, context) {
        try {

            var context1 = {
                tabPanel: tabPanel,
                context: context,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRefreshCustomerSurveyTab', context1);
            if (context1.canceled)
                return;

            if (context.storeEntity && context.storeEntity.getEntityName() == "MVCustomerSurvey") {
                if (context.gui.openMode != "VIEW") {
                    this._validateSurvey(context.storeEntity);
                    this._updateSurveyEvalAnomStatus(context.storeEntity);
                }
                this._refreshTab(context.gui, context.storeEntity);
            }

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRefreshCustomerSurveyTab', context1);

        } catch (e) {
            XLog.logEx(e);
        }
    };

    //start the counter when the tab is selected
    this._startVisitDurationCounter = function (context) {
        try {
            //measure the time only for the visits that are not executed
            if (context.gui.getDocument().get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.COMPLETED)
                return;

            var entity = context.gui.getDocument();
            var measureTime = (ParametersDefaultsAndStaticData.getInstance().getMeasureFutureVisitSpentTime() || entity.get("DTEVISIT").toDate().getTime() <= new Date().toDate().getTime());
            if (context.gui.openMode != "VIEW" && measureTime) {
                //remember the context to use in preSaveDocument
                context.gui._selectedActivityContext = context;
                //start the timer for this tab
                context.gui._surveyStartTime = new Date().getTime();
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    //stop counter when the tab is unselected
    this._stopVisitDurationCounter = function (context) {
        try {
            if (context && context.gui.openMode != "VIEW" && context.gui._surveyStartTime != null) {
                var gui = context.gui;
                //calculate the time the user has spent on this tab
                var surveyEndTime = new Date().getTime();
                var surveyDiffTime = Math.round((surveyEndTime - gui._surveyStartTime) / 1000);
                if (context.storeEntity && context.storeEntity.getEntityName() == "MVCustomerSurvey" && context.storeEntity.get("CALCULATEDSPENTTIME"))
                    context.storeEntity.set("CALCULATEDSPENTTIME", context.storeEntity.get("CALCULATEDSPENTTIME") + surveyDiffTime, true);
                else {
                    //divide the time spent on generic tabs, equally to the other tabs
                    var genericDuration = Math.round(surveyDiffTime / gui._visibleActivityTabs);
                    var doc = gui.getDocument();
                    doc.getSubEntityStore('MVCustomerSurvey').each(function (customerSurvey) {
                        if (SalesExecutionEngine.isTabVisible(customerSurvey))
                            customerSurvey.set("CALCULATEDSPENTTIME", customerSurvey.get("CALCULATEDSPENTTIME") + genericDuration, true);
                    });
                }
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._refreshVisitDurationCounterOnOpenPopup = function (gui) {
        //count the time spent on the popup as on a default activity
        this._stopVisitDurationCounter(gui._selectedActivityContext);
        this._startVisitDurationCounter({ gui: gui, storeEntity: null });
    };

    this._refreshVisitDurationCounterOnClosePopup = function (gui) {
        //count the time spent on the popup as on a default activity
        this._stopVisitDurationCounter({ gui: gui, storeEntity: null });
        this._startVisitDurationCounter(gui._selectedActivityContext);
    };

    this._sortTabs = function (gui) {
        try {

            var self = this;

            var context = {
                gui: gui,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeSortTabs', context);
            if (context.canceled)
                return;

            gui.tabPanel.setActiveItem(0);


            var tabsArray = [gui.tabSubDetails.length];
            var buttonConfig = {};
            for (var i = 2; i < gui.tabSubDetails.length; i++) {
                tabsArray[i - 2] = gui.tabSubDetails[i];
                buttonConfig[gui.tabSubDetails[i].tabName] = gui.tabSubDetails[i].tabBtn.SM1Config;
                gui.tabPanel.remove(gui.tabSubDetails[i], false);
                gui.tabHeadsDropDownButton.removeButton(gui.tabSubDetails[i].tabBtn, true);
            }

            gui.tabSubDetails.splice(2, tabsArray.length);

            var visit = gui.getDocument();
            var defaultCodTypSurvey = UserContext.getConfigParam("DEFAULT_CODTYPSURVEY", "CHKCUST");
            tabsArray = Ext.Array.sort(tabsArray, function (t1, t2) {

                var a = null;
                if (!XApp.isEmptyOrWhitespaceString(t1.tabName))
                    a = visit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
                        if (t1.tabName == e.uniqueID) {
                            return e;
                        }
                        return null;
                    });
                var b = null;
                if (!XApp.isEmptyOrWhitespaceString(t2.tabName))
                    b = visit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
                        if (t2.tabName == e.uniqueID) {
                            return e;
                        }
                        return null;
                    });

                if (!a && !b) {
                    return 0;
                }
                else {

                    //study tab before first activity
                    if (!a && t1.tabName == "PHARMASTUDY" && !self._hasPreviewSection(b) && b.get("CODTYPSURVEY") != defaultCodTypSurvey)
                        return 1;
                    if (!b && t2.tabName == "PHARMASTUDY" && !self._hasPreviewSection(a) && a.get("CODTYPSURVEY") != defaultCodTypSurvey)
                        return -1;

                    if (!a)
                        return -1;
                    else
                        if (!b)
                            return 1;
                }

                return SalesExecutionEngine.CompareSurveys(a, b);
            });

            for (var i = 0; i < tabsArray.length; i++) {
                gui.tabSubDetails.push(tabsArray[i]);
                gui.tabPanel.add(tabsArray[i]);
                tabsArray[i].tabBtn = gui.tabHeadsDropDownButton.addButton(buttonConfig[tabsArray[i].tabName]);
            }
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterSortTabs', context);
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._removeCustomerSurveyTab = function (customerSurvey, gui) {
        //decrement the number of visible tabs
        gui._visibleActivityTabs--;

        gui.tabCtrls[customerSurvey.uniqueID] = null;
        var tabItemPanel = gui.tabSubDetailsByName[customerSurvey.uniqueID];
        gui.tabHeadsDropDownButton.removeButton(tabItemPanel.tabBtn, true);
        gui.tabSubDetailsByName[customerSurvey.uniqueID] = null;
        var idx = gui.tabSubDetails.indexOf(tabItemPanel);
        gui.tabSubDetails.splice(idx, 1);
        gui.tabPanel.remove(tabItemPanel);
        delete gui.executedActivities[customerSurvey.getKey()];
        tabItemPanel.destroy(); //needed to avod tabPanelShown event beeing fired at close gui.
    };

    this._refreshTab = function (gui, cs) {
        try {

            var context = {
                gui: gui,
                cs: cs,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRefreshTab', context);
            if (context.canceled)
                return;

            var self = this;
            var refresh = (function (gui, cs) {
                return function () {
                    try {

                        if (gui.tabCtrls) {

                            self._refreshProductsGrid(gui, cs, true);

                            var mDetailContext = gui.tabCtrls[cs.uniqueID];
                            if (mDetailContext && mDetailContext.mainPanel && mDetailContext.mainPanel.isRendered()) {
                                if (mDetailContext.sections["HEADER_MEASURES." + cs.uniqueID] && cs.get("HEADER")) {
                                    mDetailContext.sections["HEADER_MEASURES." + cs.uniqueID].sectionContext.entity = cs.get("HEADER");
                                }
                                mDetailContext.refreshGui();
                            }
                        }
                        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRefreshTab', { gui: gui, cs: cs });

                    } catch (e) {
                    }
                };
            })(gui, cs);

            setTimeout(refresh, 100);
        }
        catch (e) {
            XLog.logErr("Unable to refresh tab for customer survey with ID :" + cs.uniqueID);
        }
    };

    this._refreshProductsGrid = function (gui, cs, rebindStore) {
        var context = {
            gui: gui,
            cs: cs,
            rebindStore: rebindStore,
            canceled: false
        };

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRefreshProductsGrid', context);
        if (context.canceled)
            return;

        var mDetailContext = gui.tabCtrls[cs.uniqueID];
        if (mDetailContext && mDetailContext.mainPanel && mDetailContext.mainPanel.isRendered()) {
            if (mDetailContext.sections["GRID_PRODUCTS"]) {
                var gridProducts = mDetailContext.sections["GRID_PRODUCTS"].grid.getStore();

                //if rebindStore is true the whole grid data source will be rebuilt, to be used when refresh is required after rows are added/removed
                if (context.rebindStore) {
                    var rows = cs.getSubEntityStore("MVCustomerSurveyRow");
                    rows.rebindSenchaStore(gridProducts);
                }
                else {
                    //update all existing rows by synching sencha entity with xentity
                    for (var i = 0; i < gridProducts.getCount() ; i++) {
                        var senchaEnt = gridProducts.getAt(i);
                        senchaEnt.xrec.syncSenchaEntity(senchaEnt);
                    }
                }
            }
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRefreshProductsGrid', context);
    };

    this._refreshVisit = function (gui, activeTab, failureCallback, successCallback) {
        var self = this;
        var localExecutionQueue = new ExecutionQueue();

        // load notes
        f = function () {
            SalesExecutionEngine._loadAllNotes(gui.getDocument(), failureCallback, function () { localExecutionQueue.executeNext(); });
        };
        localExecutionQueue.pushHandler(self, f);

        // refresh gui
        var f = function () {
            self._updateVisitButtonState(gui);
            self._refreshTabs(gui);

            if (activeTab && self.canOpenTab(activeTab, gui))
                gui.tabPanel.setActiveItem(activeTab);

            successCallback();
        };
        localExecutionQueue.pushHandler(self, f);

        localExecutionQueue.executeNext();
    };

    /*
     var context = {
                    gui: this,
                    doc: this.getDocument(),
                    enabled: true,
                    visible: true,
                    tabName: tabName,
                    tab: tab,
                    tabHead: tabHead
                };
    */
    this.setTabStatus = function (context) {
        switch (context.tabName) {
            //Hide CONTACTS tab if this is a user type visit or there is no contact activity loaded
            case "CONTACTS":
                var hasContactActivity = (context.doc.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                    return SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.CONTACT;
                }) != null);
                context.visible = context.visible && !XApp.isEmptyOrWhitespaceString(context.doc.get("CODPARTY")) && hasContactActivity;
                break;
            case "VISITLINKS":
            case "YAMMER":
                //Hide links tab if visit is for a USER
                context.visible = context.visible && !XApp.isEmptyOrWhitespaceString(context.doc.get("CODPARTY"));
                break;
        }
    };
    // #endregion

    //#region MVCustomerSurveyRow details button event handlers
    this._addProductToCustomerSurvey = function (sectionContext, fromBarcodeScanner) {
        try {
            var self = this;

            if (sectionContext) {
                //data
                var oldCsr = sectionContext.entity;
                var customerSurvey = oldCsr.detachedFrom;


                var mobVisit = customerSurvey.getParentEntity();
                var survey = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));

                var codArt = sectionContext.config.PRODUCT_ROW.get("CODART");
                var codDiv = sectionContext.config.PRODUCT_ROW.get("CODDIV");
                // var codLocation = context.config.CODLOCATION;
                if (!survey.FLGALLOWDUPART && customerSurvey.getSubEntityStore("MVCustomerSurveyRow").findBy(function (p) {
                    return (p.get("CODART") == codArt && p.get("CODDIV") == codDiv);
                }))
                    return;

                var artRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(codArt, codDiv));

                var previousSurveys = null;
                if (sectionContext.gui.m_previousSurveysCollection && sectionContext.gui.m_previousSurveysCollection.get(customerSurvey))
                    previousSurveys = sectionContext.gui.m_previousSurveysCollection.get(customerSurvey);
                var newCsr = this._addNewCustomerSurveyRow(customerSurvey, previousSurveys, survey, artRow, sectionContext.gui, true, fromBarcodeScanner);



                //replicate values
                SalesExecutionEngine.loadReplicatedValues({ cs: customerSurvey, csr: newCsr });

                //set new entity as sectionContext
                sectionContext.entity = newCsr;
                //validate _validateProduct
                setTimeout(function () { self._validateProduct(newCsr); }, 50);

                //refresh the popups detail context gui
                setTimeout(function () { sectionContext.detailContext.refreshGui(); }, 100);

                //so new products shows up in grid
                self._refreshTab(sectionContext.gui, customerSurvey);

                //expand section
                try {
                    var expandCollapseButton = sectionContext.detailContext.sections["CUSTOMERSURVEY." + customerSurvey.uniqueID].getDockedItems()[0].getComponent(0);
                    var inner = expandCollapseButton.parent.parent.getComponent(1);
                    if (inner.isHidden())
                        inner.show();
                }
                catch (e) {
                    XLog.logErr("Unable to expand section " + sectionContext.detailContext.sections["CUSTOMERSURVEY." + customerSurvey.uniqueID]);
                }

                //set modified flag
                sectionContext.gui.setModified(mobVisit);
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };
    this._removeProductToCustomerSurvey = function (sectionContext) {
        try {

            if (sectionContext) {
                //data
                var csr = sectionContext.entity;
                if (csr != null) {

                    var customerSurvey = csr.getParentEntity();
                    var mobVisit = customerSurvey.getParentEntity();
                    customerSurvey.getSubEntityStore("MVCustomerSurveyRow").remove(csr);
                    customerSurvey.set("FLGMODIFY", true);

                    csr.detachedFrom = customerSurvey;

                    //refresh the popups detail context gui
                    setTimeout(function () { sectionContext.detailContext.refreshGui(); }, 100);

                    //so product row is removed from  grid
                    this._refreshTab(sectionContext.gui, customerSurvey);

                    //collapse section
                    try {
                        var expandCollapseButton = sectionContext.detailContext.sections["CUSTOMERSURVEY." + customerSurvey.uniqueID].getDockedItems()[0].getComponent(0);
                        var inner = expandCollapseButton.parent.parent.getComponent(1);
                        if (!inner.isHidden())
                            inner.hide();
                    } catch (e) {
                        XLog.logErr("Unable to collapse section " + sectionContext.detailContext.sections["CUSTOMERSURVEY." + customerSurvey.uniqueID]);
                    }

                    //modified flag
                    sectionContext.gui.setModified(mobVisit);
                }

            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };
    //#endregion

    //#region Cancel & Suspend surveys

    this._removeCurrentCustomerSurvey = function (gui, customerSurvey, isCancel, cause) {
        try {

            var context = {
                gui: gui,
                customerSurvey: customerSurvey,
                isCancel: isCancel,
                cause: cause,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRemoveCurrentCustomerSurvey', context);
            if (context.canceled)
                return;

            var self = this;
            // close gui if mobvisit will become empty(has no more customer surveys);
            var mobVisit = customerSurvey.getParentEntity();
            //set modified
            gui.setModified(mobVisit);

            if (mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() == 1) {
                gui.closedAsEmpty = { "data": customerSurvey, "isCancel": isCancel, "cause": cause, "calledForVisit": false };
                gui.saveDoc(function () { XHistory.back(); });
            } else {

                self._doCancelCustomerSurvey(gui, customerSurvey, isCancel, cause, false);

                var surveysToBeRemoved = [];
                var customerSurveyCount = mobVisit.getSubEntityStore("MVCustomerSurvey").getCount();
                //When you remove an activity that generated a recovery activity, delete the recovery activity also
                for (var iCs = 0; iCs < customerSurveyCount ; iCs++) {
                    var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(iCs);
                    if (cs.get("IDSURVEYSRC") == customerSurvey.get("IDSURVEY"))
                        surveysToBeRemoved.push(cs);
                }

                for (var iSurvey = 0; iSurvey < surveysToBeRemoved.length ; iSurvey++) {
                    self._doCancelCustomerSurvey(gui, surveysToBeRemoved[iSurvey], true, cause, false);
                    self._removeCustomerSurveyTab(surveysToBeRemoved[iSurvey], gui);
                    self._removePhotoSurvey(gui, surveysToBeRemoved[iSurvey]);
                }
                gui.recoveryErrorReports = {};
                //Close detail GUI with removed activity
                // gui.detailCtrl.lastDetailGui().ctrl.closeDetail(true);

                self._removeCustomerSurveyTab(customerSurvey, gui);

                //remove from photo surveys.
                self._removePhotoSurvey(gui, customerSurvey);

                //Refresh visit context menu
                self._updateVisitButtonState(gui);
            }
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRemoveCurrentCustomerSurvey', context);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    this._removeAllCustomerSurveys = function (gui, isCancel, cause) {
        try {
            var context = {
                gui: gui,
                isCancel: isCancel,
                cause: cause,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeRemoveAllCustomerSurveys', context);
            if (context.canceled)
                return;

            var visit = gui.getDocument();
            //set modified
            gui.setModified(visit);
            var customerSurveys = visit.getSubEntityStore("MVCustomerSurvey").toArray();

            // close gui if mobvisit will become empty(has no more customer surveys);
            gui.closedAsEmpty = { "data": customerSurveys, "isCancel": isCancel, "cause": cause, "calledForVisit": true };
            gui.saveDoc(function () { XHistory.back(); });

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterRemoveAllCustomerSurveys', context);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },
    this._doCancelCustomerSurvey = function (gui, customerSurvey, isCancel, cause, calledForVisit) {
        try {

            var mobVisit = customerSurvey.getParentEntity();

            if (isCancel) { //for cancel
                customerSurvey.cancel(cause);
            } else { //for suspend
                if (SalesExecutionEngine.canMoveToPending({ "customerSurvey": customerSurvey })) {
                    if (!calledForVisit) {
                        //Bug #28920: Suspended activities are automatically readded to the visit, when the visit is saved
                        customerSurvey.set("DTEVISIT_SUSPENDED", mobVisit.get("DTEVISIT"));
                    }
                    customerSurvey.suspend();
                } else {
                    customerSurvey.cancel();
                }
            }

            //detach from visit
            mobVisit.getSubEntityStore("MVCustomerSurvey").remove(customerSurvey);

            //keep in separate collection
            if (!mobVisit.detachedCustomerSurveys)
                mobVisit.detachedCustomerSurveys = [];
            mobVisit.detachedCustomerSurveys.push(customerSurvey);

            //set modified
            gui.setModified(mobVisit);

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    //#endregion

    //#region Layout helpers
    this.__createDefaultSection__ = function (caption, type, forceId, title) {
        //create measures card section
        var cardSection = new Object();
        cardSection.elementName = "section";
        cardSection.attrs = new Object();
        cardSection.attrs.type = (type ? type : "CARD");
        cardSection.attrs.caption = caption;
        if (forceId) {
            cardSection.attrs.caption = forceId;
            //set the title according to the caption sent
            cardSection.attrs.title = title ? title : UserContext.tryTranslate("[" + caption + "]");
        }

        cardSection.attrs.startExpanded = "true";
        if (SalesExecutionNameSpace.ActivitySectionIcons[caption] != null)
            cardSection.attrs.icon = SalesExecutionNameSpace.ActivitySectionIcons[caption];
        else
            cardSection.attrs.icon = SalesExecutionNameSpace.ActivitySectionIcons["CUSTOMERSURVEY_GENERIC"];
        cardSection.children = [];
        return cardSection;
    },
    //cs: customerSurvey entity object
    //surveyMeasure:  SurveyMeasure config object 
    this.__createMeasureField__ = function (surveyMeasure) {

        var newField = new Object();
        newField.elementName = "field";
        newField.attrs = new Object();
        newField.attrs.name = surveyMeasure.FIELDNAME;
        newField.codMeasure = surveyMeasure.CODMEASURE;
        newField.attrs.translation = UserContext.tryTranslate("[MOBVISIT." + surveyMeasure["CODMEASURE"] + "]");
        newField.children = [];

        return newField;

    },
    //#endregion

    //#region UI
    this._createRecoveryPopup = function (gui, doc) {
        var self = this;
        var response = this.validateDocument(gui);
        if (response === "" || response === true)
            return;

        var msg = [];
        var idSurvey = "";
        var idAnomaly = "";

        for (var n in gui.recoveryErrorReports) {
            if (XApp.isEmptyOrWhitespaceString(idSurvey)) {
                idSurvey = gui.recoveryErrorReports[n].idSurvey;
                idAnomaly = gui.recoveryErrorReports[n].idAnomaly;
            }
            if (gui.recoveryErrorReports[n].idSurvey == idSurvey && gui.recoveryErrorReports[n].idAnomaly == idAnomaly)
                msg.push(gui.recoveryErrorReports[n].caption + " <br>");
            else {
                msg.push("<br> " + gui.recoveryErrorReports[n].caption + " <br>");
                idAnomaly = gui.recoveryErrorReports[n].idAnomaly;
                idSurvey = gui.recoveryErrorReports[n].idSurvey;
            }

        }

        if (msg.length > 0) {

            XUI.showMsgBox({
                title: UserContext.tryTranslate("[MOBVISITS.RECOVERY_ANOMALIES]"),
                msg: msg.join(""),
                icon: 'WARN',
                buttons: 'CANCEL|OK',
                onPainted: XApp.isPhone() ? undefined : function () {
                    try {
                        var txtEl = document.getElementsByClassName("sm1-messageBox-text")[0];
                        //auto-adaptive popup height
                        //135 stands for popup toolbars
                        this.setHeight(txtEl.offsetHeight + 135);
                        this.setMaxHeight('90%'); //not too big
                        this.setMinHeight('300px'); //not too small: standard msg box height
                    }
                    catch (ex) {
                        XLog.logEx(ex, undefined, true);
                    }
                },
                onResult: function (buttonCode) {
                    switch (buttonCode) {
                        case 'OK':
                            var recoveryAnomalies = doc.getSurveysRecoveryAnomalies(doc);
                            self._removeResolvedRecoveryActivities(doc, gui, recoveryAnomalies);
                            self._removeAlreadyEvaluatedRecoveryAnomalies(recoveryAnomalies, doc);
                            for (var index in recoveryAnomalies)
                                self._createRecoveryActivity(recoveryAnomalies[index], gui);
                            gui.saveDocNoConfirmation(function () {
                                gui._storeDocOnTempCache();
                                gui.reload();
                            });
                            break;
                        case 'CANCEL':
                            //
                            break;
                    }
                }
            });
        }
    },

    this._createCloseVisitPopup = function (gui) {
        try {
            //check for missing mandatory activities before opening popup
            if (!this._checkMandatoryActivities(gui.getDocument()))
                return;

            var context = {
                gui: gui,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCreateCloseVisitPopup', context);
            if (context.canceled)
                return;

            var self = this;
            var doc = gui.getDocument();
            var customerRow = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
            var invalidDate = false;
            var values = this._getDteFromAndTo("STR_TIME_HOURVISIT", doc.get("STR_TIME_HOURVISIT"), doc);
            var canSchedule = true;
            //calculate next visit date
            var nextVisitDate = null;
            var nextVisit = null;
            var disableNextVisitRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.DisableNextVisitPlanning.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.DisableNextVisitPlanning.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.DisableNextVisitPlanning.codFunc);

            //only for customer activities, try to plan next visit
            if (!disableNextVisitRight && !XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY"))) {
                //search for a visit scheduled in the future
                SalesExecutionEngine.getVisibleVisits().forEach(function (visit) {
                    if (visit.get("CODPARTY") != doc.get("CODPARTY"))
                        return true;
                    //skip visits older then self
                    if (SalesExecutionEngine.getStartMoment(visit).getTime() < SalesExecutionEngine.getStartMoment(doc).getTime())
                        return true;

                    //Do not select next visit if status is not prepared or planned
                    if (visit.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.PREPARED && visit.get("CODSTATUS") != SalesExecutionNameSpace.SurveyStatus.PLANNED)
                        return true;

                    if ((nextVisitDate == null || SalesExecutionEngine.getStartMoment(visit).getTime() < nextVisitDate.getTime()) && visit.get("CONTACTMODE") == doc.get("CONTACTMODE") && visit.get("DOCUMENTKEY") != doc.get("DOCUMENTKEY")) {
                        nextVisitDate = new Date(visit.get("DTEVISIT"));
                        nextVisitDate.setHours(0, 0, 0, 0);
                        values.from.setFullYear(nextVisitDate.getFullYear(), nextVisitDate.getMonth(), nextVisitDate.getDate());
                        values.to.setFullYear(nextVisitDate.getFullYear(), nextVisitDate.getMonth(), nextVisitDate.getDate());

                        nextVisit = visit;
                        return true;
                    }
                    return true; //continue search
                });
                if (!nextVisit) {
                    //no visit scheduled in the future
                    //calculate when to plan the next visit
                    var interval = 1;
                    try {
                        var valFreqVisit = gui.cust.get("VALFREQVISI");
                        interval = 4.0 / valFreqVisit;
                        if (interval < 1 || valFreqVisit == 0)
                            interval = 1;
                        else
                            interval = Math.round(interval);
                    } catch (e) {
                        XLog.logErr("Field VALFREQVISI missing on incorrectly defined.");
                    } finally {
                        nextVisitDate = new Date(doc.get("DTEVISIT"));
                        nextVisitDate.setDate(nextVisitDate.getDate() + 7 * interval);
                        if (nextVisitDate.getTime() < new Date().getTime()) {
                            nextVisitDate = new Date();
                            nextVisitDate.setHours(0, 0, 0, 0);
                        }
                    }
                }
            }
            //date validation function
            var validateNextVisitDate = function () {

                var context1 = {
                    gui: gui,
                    returnValue: false,
                    canceled: false
                };

                XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeValidateNextVisitDate', context1);
                if (context1.canceled) {
                    invalidDate = context1.returnValue;
                    return;
                }

                invalidDate = false;

                var planNextVisit = Ext.getCmp('chkNextVisitPlan').isChecked();
                if (!planNextVisit) {
                    Ext.getCmp('closePopupDtevisit').removeCls('x-error-field');
                    Ext.getCmp('str_hourFrom').removeCls('x-error-field');
                    Ext.getCmp('str_hourTo').removeCls('x-error-field');
                    invalidDate = false;
                    return;
                }

                var date = Ext.getCmp('closePopupDtevisit').getValue();
                var from = Ext.getCmp('appointmentFromToHourPicker').getHourFrom(date);
                var to = Ext.getCmp('appointmentFromToHourPicker').getHourTo(date);

                XUI.showWait();
                SalesExecutionEngine.canScheduleClient(from, to, SalesExecutionEngine.getVisibleVisits(), doc.get("CODPARTY"), doc.get("CONTACTMODE"), true, true, function (canSchedule) {
                    XUI.hideWait();
                    //if it can't be scheduled and it is not the date of the visit proposed by default, show error
                    if (canSchedule.returnValue && date >= doc.get("DTEVISIT")) {
                        Ext.getCmp('closePopupDtevisit').removeCls('x-error-field');
                        Ext.getCmp('str_hourFrom').removeCls('x-error-field');
                        Ext.getCmp('str_hourTo').removeCls('x-error-field');
                        invalidDate = false;
                    } else {
                        Ext.getCmp('closePopupDtevisit').removeCls('x-error-field');
                        Ext.getCmp('str_hourFrom').removeCls('x-error-field');
                        Ext.getCmp('str_hourTo').removeCls('x-error-field');
                        Ext.getCmp('closePopupDtevisit').addCls('x-error-field');
                        Ext.getCmp('str_hourFrom').addCls('x-error-field');
                        Ext.getCmp('str_hourTo').addCls('x-error-field');
                        invalidDate = true;
                        //show the message only if the date is greater then the date of the visit; otherwise the message is irrelevant
                        if (canSchedule.message != null && date >= doc.get("DTEVISIT")) {
                            XUI.showMsgBox({
                                title: "[MOB.SCHEDULE]",
                                msg: canSchedule.message,
                                icon: canSchedule.messageType,
                                buttons: 'OK'
                            });
                        }
                    }
                });
            };

            //#region create popup
            var popup = Ext.create('XBasePopup', {
                topToolbar: true,
                bottomToolbar: true,
                title: UserContext.tryTranslate('[MOBVISIT.CLOSE_VISIT]'),
                modal: true,
                centered: true,
                cls: 'sm1-popup sm1-visitclose-popup',
                scrollable: 'vertical',
                hideOnMaskTap: false,
                items: [{
                    xtype: 'label',
                    id: 'lblVisitConfirmationStatus'
                },
                {
                    xtype: 'fromToHourPicker',
                    id: 'appointmentFromToHourPicker',
                    title: UserContext.tryTranslate("[mobGuiVisit.NEXTVISIT]"),
                    hidden: disableNextVisitRight || XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY")),
                    hourFrom: nextVisit ? SalesExecutionEngine.getStartMoment(nextVisit) : values.from,
                    disabledHourFrom: true,
                    hourTo: nextVisit ? SalesExecutionEngine.getEndMoment(nextVisit) : new Date(values.from.getTime() + SalesExecutionEngine.computeDuration({ customerRow: customerRow }) * 60 * 1000),
                    disabledHourTo: true,
                    onChangeHandler: function () {
                        validateNextVisitDate();
                    },
                    items: [
                        {
                            xtype: 'label',
                            id: 'lblNextVisitPlan',
                            html: ''
                        },
                        {
                            //Checkbox to let user choose if to schedule next visit or not. It is shown only when a next visit does not already exist.
                            //If an existing "next" visit already exists then the sistem will not allow the creation of a new one.
                            xtype: 'xchk',
                            id: 'chkNextVisitPlan',
                            label: UserContext.tryTranslate("[MOBVISIT.PLAN_NEXTVISIT]"),
                            hidden: (nextVisit != null), //hidden if a next visit already exist.
                            listeners: {
                                check: function () {
                                    validateNextVisitDate();
                                    Ext.getCmp('closePopupDtevisit').setDisabled(false);
                                    Ext.getCmp('appointmentFromToHourPicker').setDisabledHourFrom(false);
                                    Ext.getCmp('appointmentFromToHourPicker').setDisabledHourTo(true);

                                },
                                uncheck: function () {
                                    validateNextVisitDate();
                                    Ext.getCmp('closePopupDtevisit').setDisabled(true);
                                    Ext.getCmp('appointmentFromToHourPicker').setDisabledHourFrom(true);
                                    Ext.getCmp('appointmentFromToHourPicker').setDisabledHourTo(true);
                                }
                            }
                        },
                        {
                            xtype: 'xdtp',
                            id: "closePopupDtevisit",
                            label: UserContext.tryTranslate("[MOB.DTEVISIT]"),
                            value: canSchedule ? nextVisitDate : undefined,
                            disabled: true, //disabled by default and enabled only by user demand by checking the checkbox above.
                            picker: {
                                slotOrder: UserContext.getDatePickerSlotOrder(),
                                yearFrom: Constants.SM1MINDATE.getFullYear(),
                                yearTo: Constants.MAX_DATE.getFullYear()
                            },
                            listeners: {
                                change: function () {
                                    validateNextVisitDate();
                                }
                            }
                        }
                    ]
                }],
                SM1Listeners: {
                    onKeyUp: function (event) {
                        switch (event.keyCode) {
                            case 13:
                                confirm();
                                break;
                            case 27:
                                self.cancelVisitPopup(popup, gui);
                                break;
                        }
                        return false;
                    },
                    onCancel: function () {
                        self.cancelVisitPopup(popup, gui);
                    },
                    onConfirm: function () {
                        confirm();
                    }
                }
            });

            var confirm = function () {
                if (doc.get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.COMPLETED) {
                    popup.hide();
                    Ext.Viewport.remove(popup);
                    popup.destroy();
                    XHistory.back();
                }
                else {
                    XUI.showWait();
                    SalesExecutionEngine.validateSEBudgets(doc, false, function (response) {
                        if (response && response["messages"])
                            self.m_budgetValidationMsg = response["messages"];
                        self.confirmVisitPopup(popup, doc, gui, invalidDate);
                    }, function () {
                        XUI.hideWait();
                    });
                }
            };
            //#endregion

            //get possible annulation causes
            var annulationCauses = UserContext.getDecodeEntriesOrdered("MSANN", true);
            var annulationOptions = [];
            annulationOptions.push({
                text: "",
                value: null
            });
            for (var i in annulationCauses) {
                var optInfo = UserContext.getRefdatValue("MSANN", annulationCauses[i].cod, "MSANNTYPE").rtrim();
                if (optInfo == SalesExecutionNameSpace.AnnType.CUSTOMER && XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY")))
                    continue;
                if (optInfo == SalesExecutionNameSpace.AnnType.USER && !XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY")))
                    continue;
                annulationOptions.push({
                    text: annulationCauses[i].des,
                    value: annulationCauses[i].cod
                });
            }

            //for customer visits: if the FORCE_SEQUENCE right is activated, check if the visit is executed in sequence
            var forceSequenceRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.ForceSequenceRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.ForceSequenceRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.ForceSequenceRight.codFunc);
            if (forceSequenceRight && !XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY"))) {
                var visitBreaksSequence = XNavHelper.getFromMemoryCache("NAV_MOB_VISITS").Rows.some(function (row) {
                    return !XApp.isEmptyOrWhitespaceString(row.get("CODPARTY")) && row.get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.COMPLETED && SalesExecutionEngine.getStartMoment(doc) < SalesExecutionEngine.getStartMoment(row);
                });
                if (visitBreaksSequence) {
                    //get the xCombo options
                    var seqBreakOptions = [];
                    var seqBreakCauses = UserContext.getDecodeEntriesOrdered("SEQBREAKCAUSE");
                    if (seqBreakCauses.length == 0)
                        seqBreakOptions.push({
                            text: "",
                            value: ""
                        });
                    else
                        for (var i = 0; i < seqBreakCauses.length; i++)
                            seqBreakOptions.push({
                                text: seqBreakCauses[i].des,
                                value: seqBreakCauses[i].cod
                            });
                    //create the field
                    var seqBreakCauseField = Ext.create('XCombo', {
                        label: UserContext.tryTranslate("[MOBVISIT.SEQBREAKCAUSE]"),
                        options: seqBreakOptions,
                        value: seqBreakOptions[0].value
                    });
                    popup.add({
                        xtype: 'fieldset',
                        title: UserContext.tryTranslate("[MOBVISIT.SEQBREAK]"),
                        items: [
                            seqBreakCauseField
                        ]
                    });
                    doc.seqBreakCauseField = seqBreakCauseField;
                }
            }

            var sortedSurveys = Ext.Array.sort(doc.getSubEntityStore("MVCustomerSurvey").toArray(), function (a, b) {
                return SalesExecutionEngine.CompareSurveys(a, b);
            });

            //create a section for each visible survey
            sortedSurveys.forEach(function (survey) {
                if (!SalesExecutionEngine.isTabVisible(survey))
                    return true;
                var defaultExecuted = ParametersDefaultsAndStaticData.getInstance().getDefaultExecuted();
                var canExecute = self._canExecuteSurvey(survey, doc);

                var surveyConfig = SalesExecutionEngine.getSurveyConfig(survey.get("CODTYPSURVEY"));
                var isMandatoryActivity = SalesExecutionEngine.contactModeFLGMANDATORY(surveyConfig, doc.get("CONTACTMODE"));

                var isRecovery = !XApp.isEmptyOrWhitespaceString(survey.get("IDANOMALYSRC"));
                var canSuspend = !isMandatoryActivity && SalesExecutionEngine.canSuspend({ customerSurvey: survey });
                var canCancel = !isMandatoryActivity;

                var replanRight = !XApp.isEmptyOrWhitespaceString(survey.get("CODPARTY"))
                    && UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.SuspendRight.codFunc);
                var cancelRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.CancelRight.codFunc);


                var setCanceledRecoveryActivity = function (doc, survey) {
                    doc.getSubEntityStore("MVCustomerSurvey").toArray().forEach(function (surveyInStore) {
                        if (surveyInStore.get("IDSURVEYSRC") == survey.get("IDSURVEY")) {
                            surveyInStore.flgExecutedCheckbox.uncheck();
                            surveyInStore.replanCheckbox.uncheck();
                            surveyInStore.annCauseField.setValue(ParametersDefaultsAndStaticData.getInstance().getDefault_emptysurvey_anncause());
                            surveyInStore.annCauseField.disable();
                        }
                    });
                };

                var setExecutedRecoveryActivity = function (doc, survey) {
                    doc.getSubEntityStore("MVCustomerSurvey").toArray().forEach(function (surveyInStore) {
                        if (surveyInStore.get("IDSURVEYSRC") == survey.get("IDSURVEY")) {
                            surveyInStore.flgExecutedCheckbox.check();
                            surveyInStore.annCauseField.disable();
                            surveyInStore.annCauseField.setValue("");
                        }
                    });
                };

                var areRecoveryAnomaliesExecuted = function (doc, survey) {
                    if (!XApp.isEmptyOrWhitespaceString(survey.get("IDANOMALYSRC")))
                        return true;
                    var valid = true;
                    doc.getSubEntityStore("MVCustomerSurvey").toArray().forEach(function (surveyInStore) {
                        if (surveyInStore.get("IDSURVEYSRC") == survey.get("IDSURVEY") && !self._canExecuteSurvey(surveyInStore, doc))
                            valid = false;
                    });
                    return valid;
                };

                var flgExecutedCheckbox = Ext.create('XChk', {
                    label: UserContext.tryTranslate("[MVCUSTOMERSURVEY.FLGEXECUTED]"),
                    disabled: !canExecute || (!replanRight && !cancelRight && defaultExecuted) || (!canCancel && !canSuspend && defaultExecuted),
                    checked: (canExecute && defaultExecuted) && areRecoveryAnomaliesExecuted(doc, survey),
                    listeners: {
                        check: function () {
                            replanCheckbox.uncheck();
                            annCauseField.disable();
                            annCauseField.setValue("");
                            if (!areRecoveryAnomaliesExecuted(doc, survey)) {
                                flgExecutedCheckbox.uncheck();
                                setCanceledRecoveryActivity(doc, survey);
                            }
                            else
                                setExecutedRecoveryActivity(doc, survey);
                        },
                        uncheck: function () {
                            if (!replanCheckbox.getChecked()) {
                                annCauseField.enable();
                                setCanceledRecoveryActivity(doc, survey);
                            }
                        }
                    }
                });
                survey.flgExecutedCheckbox = flgExecutedCheckbox;


                survey.canSuspend = canSuspend;

                //If the next visit date is set, the system should check that the activity is valid in the next visit date planned. 
                var replanCheckbox = Ext.create('XChk', {
                    label: UserContext.tryTranslate("[MVCUSTOMERSURVEY.REPLAN]"),
                    disabled: !canSuspend,
                    checked: (canSuspend && !flgExecutedCheckbox.getChecked() && defaultExecuted),
                    hidden: !replanRight,
                    listeners: {
                        check: function () {
                            annCauseField.enable();
                            flgExecutedCheckbox.uncheck();
                            annCauseField.disable();
                            annCauseField.setValue("");
                            setCanceledRecoveryActivity(doc, survey);
                        },
                        uncheck: function () {
                            annCauseField.enable();
                        }
                    }
                });
                survey.replanCheckbox = replanCheckbox;
                //If not, the system should inform the user that the activity cannot be replanned (showing also the maxium date for the activity).
                var maxDatePicker = Ext.create('XDtp', {
                    label: UserContext.tryTranslate("[MVCUSTOMERSURVEY.DTETO]"),
                    disabled: true,
                    value: survey.get("DTETO")
                });
                if (!canSuspend || XApp.isEmptyDate(survey.get("DTETO")))
                    maxDatePicker.hide();
                survey.maxDatePicker = maxDatePicker;

                //annulation cause picker
                var annCauseField = Ext.create('XCombo', {
                    disabled: !canCancel || (replanCheckbox.getChecked() || flgExecutedCheckbox.getChecked()),
                    label: UserContext.tryTranslate("[MOBVISIT.ANNCAUSE]"),
                    hidden: !cancelRight,
                    options: annulationOptions
                });
                survey.annCauseField = annCauseField;
                //activity note
                var strSize = parseInt(survey.getFieldDef("DESNOTE").size);
                var noteTxtArea = Ext.create('XTextArea', {
                    label: UserContext.tryTranslate("[MVCUSTOMERSURVEY.DESNOTE]"),
                    value: survey.get("DESNOTE"),
                    maxLength: strSize
                });
                survey.noteTxtArea = noteTxtArea;

                //If recovery see the status of activity that generated it and make the fields read-only
                if (isRecovery) {
                    var activity = doc.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                        return cs.get("IDSURVEY") === survey.get("IDSURVEYSRC");
                    });
                    if (!activity.flgExecutedCheckbox.getChecked()) {
                        flgExecutedCheckbox.uncheck();
                        replanCheckbox.uncheck();
                        annCauseField.setValue(ParametersDefaultsAndStaticData.getInstance().getDefault_emptysurvey_anncause());
                    }
                    annCauseField.disable();
                    noteTxtArea.disable();
                    maxDatePicker.disable();
                    flgExecutedCheckbox.disable();
                    replanCheckbox.disable();
                }

                //add fields to popup
                popup.add({
                    xtype: 'fieldset',
                    title: survey.get("DesTypSurveyLong"),
                    items: [
                        {
                            xtype: 'label',
                            id: survey.uniqueID,
                            html: ''
                        },
                        flgExecutedCheckbox,
                        replanCheckbox,
                        maxDatePicker,
                        annCauseField,
                        noteTxtArea
                    ]
                });
                return true;
            });

            popup.init();
            Ext.Viewport.add(popup);

            context.popup = popup;
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCreateCloseVisitPopup', context);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    //reset all budget validation messages 
    this.resetAllMsgAfterBdgValidation = function (doc) {
        var self = this;
        doc.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
            var lblMessage = Ext.getCmp(survey.uniqueID);
            if (!lblMessage || !self.m_budgetValidationMsg)
                return;

            lblMessage.setHtml('');//reset label message

            if (survey.flgExecutedCheckbox.getChecked()) {
                var budgetMessages = Ext.Array.filter(self.m_budgetValidationMsg, function (msg) {
                    return msg.SurveyID == survey.get("IDSURVEY");
                });

                if (budgetMessages.length == 0)
                    return;
                var surveyMessages = self.getMsgAfterBdgValidation(survey, budgetMessages);
                lblMessage.setHtml('<div>' + surveyMessages.join('') + '</div>');
            }
        });
    },

    //get info/error messages for a survey that have attached budget(s) 
    this.getMsgAfterBdgValidation = function (survey, budgetMessages) {
        var surveyMessages = [];
        for (var i = 0; i < budgetMessages.length; i++) {
            var message = UserContext.tryTranslate(budgetMessages[i].Message);
            var cssCls = 'sm1-lbl-message sm1-lbl-info-message';
            var iconCls = 'guis_visit_ic_info_16';
            if (budgetMessages[i] && budgetMessages[i].MessageType == 'ERR') {
                cssCls = 'sm1-lbl-message sm1-lbl-error-message';
                iconCls = 'guis_visit_ic_error_16';
            }
            surveyMessages.push('<div class ="sm1-lbl-bdg-message"><span class="' + iconCls + '"></span><div class = "' + cssCls + '">' + message + '</div></div>');
        }
        return surveyMessages;
    },

    this.setErrorMessageInActivity = function (id, msg) {
        var lblMessage = Ext.getCmp(id);
        var cssCls = 'sm1-lbl-message sm1-lbl-error-message';
        var iconCls = 'guis_visit_ic_error_16';
        lblMessage.setHtml('<div class ="sm1-lbl-bdg-message"><span class="' + iconCls + '"></span><div class = "' + cssCls + '">' + msg + '</div></div>');
    },



    this.cancelVisitPopup = function (popup, gui) {
        popup.hide();
        Ext.Viewport.remove(popup);
        popup.destroy();
        this._refreshVisitDurationCounterOnClosePopup(gui);
    },

    this.confirmVisitPopup = function (popup, doc, gui, invalidDate) {
        var self = this;
        var invalidActivity = null;

        self.resetAllMsgAfterBdgValidation(doc);

        //Validate if there is a message error regarding budget validation        
        var bdgMsgError = false;
        if (self.m_budgetValidationMsg) {
            doc.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
                if (SalesExecutionEngine.isTabVisible(survey) && survey.flgExecutedCheckbox.getChecked()) {
                    var errMessage = self.m_budgetValidationMsg.find(function (msg) {
                        return msg.MessageType == 'ERR' && msg.SurveyID == survey.get("IDSURVEY")
                    });
                    if (errMessage) {
                        bdgMsgError = true;
                        return false;
                    }
                }
            });
        }

        //Validate that at least one option is selected (FLGEXECUTED, FLGREPLAN, or Cancelation reason
        var selectionMissing = false;
        var missingField;
        doc.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
            if (SalesExecutionEngine.isTabVisible(survey)) {
                if (!self.m_budgetValidationMsg)
                    Ext.getCmp(survey.uniqueID).setHtml('');//reset label message, no message regarding budget were added
                if (!survey.flgExecutedCheckbox.getChecked() && !survey.replanCheckbox.getChecked() &&
                    !survey.annCauseField.getValue()) {
                    selectionMissing = true;
                    invalidActivity = survey;
                    missingField = survey.annCauseField;
                    if (selectionMissing) {
                        var msg = UserContext.tryTranslate('[MOBVISIT.SELECT_ACTION]') + ": " + invalidActivity.get("DesTypSurveyLong") + " - " + missingField.getLabel();
                        self.setErrorMessageInActivity(survey.uniqueID, msg);
                    }
                }
            }
        });

        //validate min consumer questionnaires
        var missionQuests = {};
        doc.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
            //for each mission, remember the number of executed consumer quests
            if (SalesExecutionEngine.getActivityType(survey.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.QUEST) {
                idMission = survey.get("IDMISSION");
                if (!missionQuests[idMission])
                    missionQuests[idMission] = { quests: 0, questName: survey.get("DesTypSurveyLong") };
                if (survey.flgExecutedCheckbox.getChecked())
                    missionQuests[idMission].quests++;
            }
        });
        //check if the number of executed consumer quests > min number of quests
        var consumerQuestsErr = "";
        for (var j = 0; j < gui.m_missions.length; j++) {
            var idMission = gui.m_missions[j].get("IDMISSION");
            if (missionQuests[idMission]) {
                var mission = gui.m_missions[j];
                if (missionQuests[idMission].quests < mission.get("MINCONSUMERQUEST")) {
                    consumerQuestsErr += missionQuests[idMission].questName + ": " + UserContext.tryTranslate("[MISSION_VALIDATE_MIN_QUESTIONNAIRES]") + "\n";
                }
                break;
            }
        }
        //if there are errors, show them
        if (!XApp.isEmptyOrWhitespaceString(consumerQuestsErr)) {
            var questSurveys = doc.getSubEntityStore("MVCustomerSurvey").queryBy(function (survey) {
                return SalesExecutionEngine.getActivityType(survey.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.QUEST;
            });
            for (var i = 0; i < questSurveys.length; i++) {
                if (!self.m_budgetValidationMsg)
                    Ext.getCmp(survey.uniqueID).setHtml('');//reset label message, no message regarding budget were added
                if (!questSurveys[i].flgExecutedCheckbox.getChecked())
                    self.setErrorMessageInActivity(questSurveys[i].uniqueID, consumerQuestsErr);
            }
        }

        if (invalidDate) {
            var msg = UserContext.tryTranslate('[MOBVISIT.INVALIDDATE]');
            self.setErrorMessageInActivity('lblNextVisitPlan', msg);
        }
        else
            Ext.getCmp('lblNextVisitPlan').setHtml('');//reset label message

        //if it is valid, save
        var planNextVisit = Ext.getCmp('chkNextVisitPlan').isChecked();
        var date = Ext.getCmp('closePopupDtevisit').getValue();
        var from = Ext.getCmp('appointmentFromToHourPicker').getHourFrom(date);
        var to = Ext.getCmp('appointmentFromToHourPicker').getHourTo(date);

        var scheduleNextVisit = true;
        if (!planNextVisit)
            scheduleNextVisit = false;


        var lblConfirmationStatus = Ext.getCmp('lblVisitConfirmationStatus');

        //check if the visit can be confirmed
        if (!bdgMsgError && !invalidDate && !selectionMissing && XApp.isEmptyOrWhitespaceString(consumerQuestsErr)) {
            self._closeVisit(gui, doc, date, from, to, scheduleNextVisit, function () {
                self.resetAllMsgAfterBdgValidation(doc);
                lblConfirmationStatus.setHtml(UserContext.tryTranslate('[MOBVISIT.VISIT_CORRECTLY_EXECUTED]'));
                lblConfirmationStatus.setCls('sm1-success-close-visit-popup');
                popup.bodyElement.scrollTo('top', 0);
                popup.getConfirmButton().setText("OK");

                if (popup._topToolbar)
                    popup._topToolbar.removeAt(1); //remove cancel button
                XUI.hideWait();
            });
        }
        else {
            lblConfirmationStatus.setHtml(UserContext.tryTranslate('[MOBVISIT.ERRORS_OCCURRED_DURING_CONFIRMATION]'));
            lblConfirmationStatus.setCls('sm1-error-close-visit-popup');
            popup.bodyElement.scrollTo('top', 0);
            XUI.hideWait();
        }
    },

    this._setCoordinatesInSurvey = function (survey, lat, lng) {
        if (lat != null)
            survey.set("GPSVALLATITUDE", lat);
        if (lng != null)
            survey.set("GPSVALLONGITUDE", lng);
    },

    this.disableCloseVisitPopupFields = function (survey) {
        //disable all fields from the close visit popup
        if (survey.flgExecutedCheckbox)
            survey.flgExecutedCheckbox.setDisabled(true);
        if (survey.annCauseField)
            survey.annCauseField.setDisabled(true);
        if (survey.replanCheckbox)
            survey.replanCheckbox.setDisabled(true);
        if (survey.noteTxtArea)
            survey.noteTxtArea.setDisabled(true);
        if (survey.maxDatePicker)
            survey.maxDatePicker.setDisabled(true);
        if (survey.maxDatePicker)
            survey.maxDatePicker.setDisabled(true);
        if (Ext.getCmp('closePopupDtevisit'))
            Ext.getCmp('closePopupDtevisit').setDisabled(true);
        if (Ext.getCmp('chkNextVisitPlan'))
            Ext.getCmp('chkNextVisitPlan').setDisabled(true);
    },

    this._closeVisit = function (gui, doc, date, from, to, scheduleNextVisit, finishHandler) {
        var self = this;
        var lat, lng;

        var finish = function () {
            for (var i = 0; i < doc.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                var survey = doc.getSubEntityStore("MVCustomerSurvey").getAt(i);

                self.disableCloseVisitPopupFields(survey);

                //skip contact activities
                if (!SalesExecutionEngine.isTabVisible(survey)) {
                    if (self._openDayID)
                        survey.set("IDDAY", self._openDayID);
                    self._setCoordinatesInSurvey(survey, lat, lng);
                    continue;
                }
                //update notes
                survey.set("DESNOTE", survey.noteTxtArea.getValue());
                //if the survey is empty, cancel it
                self._cancelEmptySurvey(gui, survey, lat, lng);
                if (survey.get("CODSTATUS") == SalesExecutionNameSpace.SurveyStatus.CANCELED) {
                    i--;
                    continue;
                }

                self._setCoordinatesInSurvey(survey, lat, lng);
                //if FLGEXECUTED is set to true, execute survey
                if (survey.flgExecutedCheckbox.getChecked()) {
                    survey.set("IDVISIT", doc.get("IDVISIT"));
                    if (self._openDayID)
                        survey.set("IDDAY", self._openDayID);
                } else {

                    //if FLGREPLAN is set to true, replan survey
                    if (survey.replanCheckbox.getChecked()) {
                        self._doCancelCustomerSurvey(gui, survey, false, null, true);
                    } else {
                        if (self._openDayID)
                            survey.set("IDDAY", self._openDayID);
                        self._doCancelCustomerSurvey(gui, survey, true, survey.annCauseField.getValue(), true);
                    }
                    i--;
                }
            }
            //execute visit and remained activities. Send the sequence break reason if available
            doc.execute(doc.seqBreakCauseField ? doc.seqBreakCauseField.getValue() : undefined);

        };

        self._beforeOnSave = finish;
        gui.setModified();
        var localExecutionQueue = new ExecutionQueue();

        var f = function () {
            XUI.showWait(undefined, { isContinous: true });
            XApp.getCoordinates(function (latitude, longitude) {

                XUI.hideWait();

                lat = latitude;
                lng = longitude;
                localExecutionQueue.executeNext();
            });
        };
        localExecutionQueue.pushHandler(self, f);

        f = function () {
            gui.saveDocNoConfirmation(function () {
                //clear the document stored in memory
                gui._clearTempDocument();

                //close popup
                if (finishHandler)
                    finishHandler();

                //If the user chose to plan a new visit for this customer , then save that new visit.
                if (scheduleNextVisit && !XApp.isEmptyOrWhitespaceString(doc.get("CODPARTY"))) {
                    XUI.showWait();
                    SalesExecutionEngine.canScheduleClient(from, to, SalesExecutionEngine.getVisibleVisits(), doc.get("CODPARTY"), doc.get("CONTACTMODE"), false, false, function (canSchedule) {
                        var addCustomerSurvey = function (canSchedule) {
                            SalesExecutionEngine.addCustomerToScheduler({
                                dteVisit: date, hourVisit: from, hourVisitTo: to, codParty: doc.get("CODPARTY"), contactMode: doc.get("CONTACTMODE"), engineResponse: canSchedule, flgSubstitute: gui.cust.get("FLGSUBSTITUTE"), codstructure: doc.get("CODSTRUCTURE"), finishHandler: function (newDoc) {
                                    XDocs.saveDocument(newDoc, false,
                                 function (e) {
                                     XUI.hideWait();
                                     XUI.showExceptionMsgBox(e);
                                 },
                                    function (savedDocument) {
                                        if (savedDocument != null) {
                                            //update navigator views
                                            SalesExecutionEngine.updateCache(savedDocument, null, null, "NEW",
                                                function (e) {
                                                    XUI.hideWait();
                                                    XUI.showExceptionMsgBox(e);
                                                },
                                               function () {
                                                   XUI.hideWait();
                                               });
                                        } else {
                                            XUI.hideWait();
                                            XUI.showExceptionMsgBox(UserContext.tryTranslate("[MOB.UNABLE_TO_SAVE_ON_SERVER]"));
                                        }
                                    },
                                    true
                                );
                                }, onFailure: function (e) {
                                    XUI.hideWait();
                                    XUI.showExceptionMsgBox(e);
                                }
                            });
                        };
                        if (canSchedule.returnValue == true) {
                            if (canSchedule.message != null && canSchedule.skipInfoOkWarn) {
                                XUI.showMsgBox({
                                    title: canSchedule.msgPerDay != null ? "[MOB.SCHEDULE]" : doc.get("DESPARTY1"),
                                    msg: canSchedule.message,
                                    icon: canSchedule.messageType,
                                    buttons: 'CANCEL|OK',
                                    onResult: function (buttonCode) {
                                        switch (buttonCode) {
                                            case 'OK':
                                                addCustomerSurvey(canSchedule);
                                                break;
                                            case 'CANCEL':
                                                XUI.hideWait();
                                                break;
                                        }
                                    }
                                });
                            }
                            else
                                addCustomerSurvey(canSchedule);
                        }
                    });
                } else {
                    XUI.hideWait();
                }
            });
        };

        localExecutionQueue.pushHandler(self, f);
        localExecutionQueue.executeNext();
    },

    this._prepareVisit = function (gui, doc, finishHandler) {
        doc.prepare();
        doc.getSubEntityStore("MVCustomerSurvey").each(function (survey) {
            if (!SalesExecutionEngine.isTabVisible(survey))
                return true;
            survey.set("PREPNOTE", survey.noteTxtArea.getValue());
            return true;
        });
        gui.setModified();
        gui.saveDocNoConfirmation(function () {
            gui._clearTempDocument();
            if (finishHandler)
                finishHandler();
            XHistory.back();
        });
    },

    this._createNewSurveyPopup = function (gui) {
        try {

            var context = {
                gui: gui,
                canceled: false
            };

            XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCreateNewSurveyPopup', context);
            if (context.canceled)
                return;

            var self = this;
            var gui = gui;
            var mobVisit = gui.getDocument();
            var surveys = SalesExecutionEngine.getOrderedSurveysConfig();
            var questionnairs = SalesExecutionEngine.getManualQuestionnaires(UserContext.CodDiv, mobVisit.get("DTEVISIT"));
            var options = [];
            for (var i = 0; i < surveys.length; i++) {
                if (surveys[i].FLGBATCHONLY) {
                    XLog.logWarn("mobGuiVisit._createNewSurveyPopup: " + surveys[i].CODTYPSURVEY + ": not allowed to manually add this survey type.");
                    continue;
                }
                if (SalesExecutionEngine.isSurveyTypeAvailable(surveys[i], mobVisit, undefined, true) && SalesExecutionEngine.isJsonTabVisible(surveys[i]))
                    options.push({
                        text: UserContext.tryTranslate("[" + surveys[i].CODTYPSURVEY + "]"),
                        value: { codTypSurvey: surveys[i].CODTYPSURVEY }
                    });
            }

            for (var questIndex in questionnairs) {
                var quest = questionnairs[questIndex];
                var survey = surveys.find(function (item) {
                    return item.CODTYPSURVEY == quest.CODTYPSURVEY;
                });
                if (survey && SalesExecutionEngine.isSurveyTypeAvailable(survey, mobVisit, true, true) && SalesExecutionEngine.isJsonTabVisible(survey))
                    options.push({
                        text: quest.DESQUESTIONNAIRE,
                        value: { codTypSurvey: survey.CODTYPSURVEY, manualQuest: quest },
                    });
            }

            self._eachDistinctConsumerQuestActivity(gui, mobVisit, true, function (mission, cs, nrDoneCs) {
                if (nrDoneCs < mission.get("MAXCONSUMERQUEST")) {
                    options.push({
                        text: cs.get("DesTypSurveyLong") + " - " + UserContext.tryTranslate("[CUSTQUEST.DONE]") + " " +
                            nrDoneCs + " (" + UserContext.tryTranslate("[CUSTQUEST.MIN_SHORT]") + " " + mission.get("MINCONSUMERQUEST") +
                            " - " + UserContext.tryTranslate("[CUSTQUEST.MAX_SHORT]") + " " + mission.get("MAXCONSUMERQUEST") + ")",
                        value: { codTypSurvey: cs.get("CODTYPSURVEY"), cs: cs }
                    });
                }
            });

            //create the combobox with all the activities
            var activityCombo = Ext.create('XCombo', {
                disabled: options.length > 0 ? false : true,
                label: UserContext.tryTranslate("[MOB.SURVEY]"),
                options: options
            });
            activityCombo.setValue(options.length > 0 ? options[0].value : ""); // select first item

            self.newSurveyPopup = Ext.create('XBasePopup', {
                topToolbar: true,
                bottomToolbar: true,
                title: UserContext.tryTranslate("[MOB.NEW_SURVEY]"),
                modal: true,
                centered: true,
                cls: 'sm1-popup sm1-visitgui-popup',
                hideOnMaskTap: true,
                items: [{
                    xtype: 'fieldset',
                    items: [activityCombo]
                }],
                SM1Listeners: {
                    onKeyUp: function (event) {
                        switch (event.keyCode) {
                            case 13:
                                self.confirmSurveyPopup(self.newSurveyPopup, gui, activityCombo);
                                break;
                            case 27:
                                self.cancelSurveyPopup(self.newSurveyPopup);
                                break;
                        }
                        return false;
                    },
                    onCancel: function () {
                        self.cancelSurveyPopup(self.newSurveyPopup);
                    },
                    onConfirm: function () {
                        self.confirmSurveyPopup(self.newSurveyPopup, gui, activityCombo);
                    }
                }
            });

            self.newSurveyPopup.init();
            Ext.Viewport.add(self.newSurveyPopup);

            context.popup = self.newSurveyPopup;
            XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCreateNewSurveyPopup', context);
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },

    this.cancelSurveyPopup = function (newSurveyPopup) {
        newSurveyPopup.hide(true);
        Ext.Viewport.remove(newSurveyPopup);
        newSurveyPopup.destroy();
    },

    this.confirmSurveyPopup = function (newSurveyPopup, gui, activityCombo) {
        try {
            var cmbValue = activityCombo.getValue();
            var codTypSurvey = cmbValue.codTypSurvey;
            var mobVisit = gui.getDocument();

            var survey = SalesExecutionEngine.getSurveyConfig(codTypSurvey);
            if (survey) {

                newSurveyPopup.hide();
                Ext.Viewport.remove(newSurveyPopup);
                newSurveyPopup.destroy();

                XUI.showWait();
                //load data
                var localExecutionQueue = new ExecutionQueue();
                var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);
                var failureCallback = function (e) {
                    XUI.hideWait();
                    XUI.showExceptionMsgBox(e);
                };

                var cs = SalesExecutionEngine.createNewCustomerSurvey(survey.CODTYPSURVEY, mobVisit.get("CODPARTY"), mobVisit.get("CONTACTMODE"), gui.cust.get("FLGSUBSTITUTE"), mobVisit.get("CODSTRUCTURE"));

                //see if the user wants to add a questionnaire
                if (SalesExecutionEngine.getActivityType(codTypSurvey) == SalesExecutionNameSpace.ActivityType.QUEST) {
                    //find that specific questionnaire in the list of customer surveys
                    if (!cmbValue.manualQuest) {
                        var quest = cmbValue.cs;
                        cs.set("IDMISSION", quest.get("IDMISSION"));
                        cs.set("IDQUESTIONNAIRE", quest.get("IDQUESTIONNAIRE"));
                        cs.set("ACTIVITYDESCRIPTION", quest.get("ACTIVITYDESCRIPTION"));
                        cs.set("CODPRIORITY", quest.get("CODPRIORITY"));
                        cs.set("FLGAUTOCREATED", quest.get("FLGAUTOCREATED"));
                        cs.set("DTEFROM", quest.get("DTEFROM"));
                        cs.set("DTETO", quest.get("DTETO"));
                        cs.set("DTECRE", new Date());
                        cs.set("DESHQNOTE", quest.get("DESHQNOTE"));
                        //flags for multiple execution
                        cs.set("FLGMULTIPLE", quest.get("FLGMULTIPLE"));
                        cs.set("MAXEXECUTIONS", quest.get("MAXEXECUTIONS"));
                        //flags for consumer quest
                        cs.set("FLGCONSUMERQUEST", quest.get("FLGCONSUMERQUEST"));
                        cs.set("MINCONSUMERQUEST", quest.get("MINCONSUMERQUEST"));
                        cs.set("MAXCONSUMERQUEST", quest.get("MAXCONSUMERQUEST"));
                    }
                    else {
                        cs.set("IDQUESTIONNAIRE", cmbValue.manualQuest.IDQUESTIONNAIRE);
                        cs.set("ACTIVITYDESCRIPTION", cmbValue.manualQuest.DESQUESTIONNAIRE);
                    }
                }

                f = (function (gui, visit, customerSurvey) {
                    return function () {
                        this._addActivity(gui, visit, customerSurvey, failureCallback, successCallback);
                    };
                })(gui, mobVisit, cs);
                localExecutionQueue.pushHandler(this, f);

                f = (function (gui, visit, customerSurvey) {
                    return function () {
                        this._refreshVisit(gui, gui.tabSubDetailsByName[customerSurvey.uniqueID], failureCallback, successCallback);
                    };
                })(gui, mobVisit, cs);
                localExecutionQueue.pushHandler(this, f);

                // START
                localExecutionQueue.pushHandler(XUI, XUI.hideWait);
                localExecutionQueue.executeNext();
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    },


    this._createOrderActivity = function (gui, onSuccess) {
        try {
            var self = this;

            var entity = gui.getDocument();
            var codParty = entity.get("CODPARTY");
            //search for "empty" order survey
            var orderSurvey = self._getFirstUnusedOrderSurvey(entity);
            //if found then navigate to new order gui and link that UI to this order activity
            //else try to create new order activity
            if (!orderSurvey) {
                //we need to create new order survey
                var surveyConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                if (!surveyConfig) {
                    XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                } else {
                    if (SalesExecutionEngine.canCreateSurvey(surveyConfig, entity)) {

                        var obj = SalesExecutionEngine.createNewCustomerSurvey(surveyConfig.CODTYPSURVEY, codParty, entity.get("CONTACTMODE"), gui.cust.get("FLGSUBSTITUTE"), entity.get("CODSTRUCTURE"));
                        // plan customer survey in visit (ADDS to current document)
                        SalesExecutionEngine.planCustomerSurvey(obj, entity, entity.get("CODSTATUS"));
                        //initializes internal properties
                        self._onAfterCustomerSurveyAdded(obj, gui);
                        gui.setModified(entity);
                        orderSurvey = obj;
                    }
                }
            }

            if (orderSurvey) {
                if (orderSurvey.isModified()) {
                    //save and after open new order gui with info about order activity
                    gui.saveDocNoConfirmation(function () {

                        var mobVisit = gui.getDocument();
                        var orderCs = self._getFirstUnusedOrderSurvey(mobVisit);

                        if (!orderCs.uniqueID && orderSurvey && orderSurvey.uniqueID &&
                            orderSurvey.get("IDSURVEY") == orderCs.get("IDSURVEY"))
                            orderCs.uniqueID = orderSurvey.uniqueID;

                        gui._storeDocOnTempCache();
                        onSuccess(mobVisit.get("CODPARTY"), orderCs.get("IDSURVEY"));
                    });
                    return;
                } else {
                    onSuccess(entity.get("CODPARTY"), orderSurvey.get("IDSURVEY"));
                    return;
                }
            }
            else
                XUI.showErrorMsgBox({
                    msg: UserContext.tryTranslate("[ERR_ACTIVITY_CANNOT_BE_ADDED]") + UserContext.tryTranslate("[" + surveyConfig.CODTYPSURVEY + "]")
                });
        } catch (e) {
            XLog.logErr("Failed to open create new order activity");
            XUI.showExceptionMsgBox(e);
        }
    },

        this._createRecoveryActivity = function (recoveryAnomaly, gui) {
            try {
                var self = this;
                var visit = gui.getDocument();
                var codTypSurvey = recoveryAnomaly.RECOVERYSURVEY;
                var codParty = visit.get("CODPARTY");

                var surveys = SalesExecutionEngine.getOrderedSurveysConfig();
                var cs = surveys.find(function (cs) {
                    return cs.CODTYPSURVEY == codTypSurvey;
                });
                if (SalesExecutionEngine.canCreateSurvey(cs, visit)) {

                    var obj = SalesExecutionEngine.createNewCustomerSurvey(codTypSurvey, codParty, visit.get("CONTACTMODE"), gui.cust.get("FLGSUBSTITUTE"), visit.get("CODSTRUCTURE"));
                    //add anomaly message and product on hqnotes 
                    var productsMessage = "";
                    if (recoveryAnomaly.anomalyProducts)
                        for (var iProd = 0; iProd < recoveryAnomaly.anomalyProducts.length ; iProd++)
                            productsMessage += "\n" + recoveryAnomaly.anomalyProducts[iProd];

                    obj.set("IDANOMALYSRC", recoveryAnomaly.IDANOMALY);
                    obj.set("IDSURVEYSRC", recoveryAnomaly.IDSURVEYSRC);
                    obj.set("IDQUESTIONNAIRE", recoveryAnomaly.RECOVERYQUESTIONNAIRID);

                    var quest = null;
                    var questDescription = "";
                    var failureCallback = function (e) {
                        XUI.hideWait();
                        XUI.showExceptionMsgBox(e);
                    };
                    var successCallback = (function (questionnaire) {
                        questDescription = questionnaire.DESQUESTIONNAIRE;
                        quest = questionnaire;
                    });

                    //load questioner if the activity is of type questionner                  
                    if (SalesExecutionEngine.getActivityType(codTypSurvey) == SalesExecutionNameSpace.ActivityType.QUEST) {
                        self._loadQuestionnairActivity(obj, gui, failureCallback, successCallback);

                        obj.set("IDQUESTIONNAIRE", quest.IDQUESTIONNAIRE);
                        obj.set("ACTIVITYDESCRIPTION", questDescription);
                        obj.set("DTEFROM", quest.DTEFROM);
                        obj.set("DTETO", quest.DTETO);
                        obj.set("DTECRE", new Date());
                    }
                    obj.set("DESHQNOTE", UserContext.translate(recoveryAnomaly.ALERTMESSAGE) + (codTypSurvey == "QUESTIONNAIR" ? (" " + questDescription) : productsMessage));

                    // plan customer survey in visit (ADDS to current document)
                    SalesExecutionEngine.planCustomerSurvey(obj, visit, visit.get("CODSTATUS"));
                    //initializes internal properties
                    self._onAfterCustomerSurveyAdded(obj, gui);
                    gui.setModified(visit);
                }
                else
                    XLog.logErr("Activity " + codTypSurvey + " cannot be added from recovery anomaly.");
            } catch (e) {
                XLog.logErr("Failed to open create new order activity");
                XUI.showExceptionMsgBox(e);
            }
        },

    this._addOrderActivity = function (gui) {
        var self = this;
        var entity = gui.getDocument();
        var codParty = entity.get("CODPARTY");

        SalesForceEngine.showNewOrderPopup(codParty, "", Ext.emptyFn, function (options) {
            self._createOrderActivity(gui, function (codParty, idSurvey) {
                options.idSurvey = idSurvey;
                options.visit = entity;
                XHistory.go(options);

                var actualConfig = XHistory.actualConfig();
                if (actualConfig && actualConfig.guiName != "mobGuiOrder") {
                    //did not transition yet to order ui
                    var orderSurvey = entity.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                        return cs.get("IDSURVEY") == idSurvey;
                    });
                    if (orderSurvey) {
                        var newTab = self._createCustomerSurveyTab(orderSurvey, gui);
                        self._checkOrderMeasures(gui, orderSurvey);
                        self._refreshTab(gui, orderSurvey);
                        if (newTab) {
                            gui.refreshGui();
                            self._refreshTabs(gui);
                            self._updateVisitButtonState(gui);
                            //select the newly added tab
                            if (self.canOpenTab(newTab, gui))
                                gui.tabPanel.setActiveItem(newTab);
                        }
                    }
                }
            });

        });
    },

    this._saveVisitCoordinatesBeforeCancel = function (customerSurveys, onFinish) {
        var self = this;
        var localExecutionQueue = new ExecutionQueue();

        var f = function () {
            XUI.showWait(undefined, { isContinous: true });
            XApp.getCoordinates(function (latitude, longitude) {

                XUI.hideWait();

                customerSurveys.forEach(function (item) {
                    self._setCoordinatesInSurvey(item, latitude, longitude);
                });
                localExecutionQueue.executeNext();
            });
        };
        localExecutionQueue.pushHandler(self, f);
        localExecutionQueue.pushHandler(self, onFinish);
        localExecutionQueue.executeNext();
    },

    this._createAnnCausePopup = function (gui, customerSurvey) {
        try {

            var self = this;
            var onCancel = function (annCause) {
                if (annCause) {
                    if (customerSurvey) {
                        if (self._openDayID)
                            customerSurvey.set("IDDAY", self._openDayID);
                        self._saveVisitCoordinatesBeforeCancel([customerSurvey], function () {
                            self._removeCurrentCustomerSurvey(gui, customerSurvey, true, annCause);
                        });
                    } else {
                        gui.getDocument().setOpenDayId(self._openDayID);
                        self._saveVisitCoordinatesBeforeCancel(gui.getDocument().getSubEntityStore("MVCustomerSurvey").toArray(), function () {
                            //cancel whole visit
                            self._removeAllCustomerSurveys(gui, true, annCause);
                        });
                    }
                }
            };

            SalesExecutionEngine.createAnnCausePopup(customerSurvey, onCancel, function (e) {
                XUI.showExceptionMsgBox(e);
            });

        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    //#endregion

    //#region Order Management

    this._checkAndUpdateOrdersStatuses = function (gui) {

        var context = {
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckAndUpdateOrdersStatuses', context);
        if (context.canceled)
            return;

        var mobVisit = gui.getDocument();
        //continue only if entity store contains at least one ORDER type survey.
        if (!mobVisit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
            return e.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey();
        }))
            return;

        for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
            if (cs.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey())
                continue;

            this._checkOrderMeasures(gui, cs);
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCheckAndUpdateOrdersStatuses', context);
    };

    this._checkAndUpdateOrderStatus = function (gui, orderActivity) {

        var context = {
            gui: gui,
            orderActivity: orderActivity,
            canceled: false
        };

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckAndUpdateOrderStatus', context);
        if (context.canceled)
            return;

        if (orderActivity.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey())
            return;

        this._checkOrderMeasures(gui, orderActivity);

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCheckAndUpdateOrderStatus', context);
    };

    this._checkOrderMeasures = function (gui, cs) {

        try {
            //get the order from the orders navigator
            var orders = SalesForceEngine.getAllOrderNavRows(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("IDSURVEY", "=", cs.get("IDSURVEY"))
                ]
            }));

            var surveyConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
            if (!surveyConfig) {
                XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                return;
            }

            var headerCsr = cs.get("HEADER");
            if (headerCsr) {

                var fieldName = SalesExecutionEngine.getOrderTakenFieldName(surveyConfig);
                var noOrderCauseFieldName = SalesExecutionEngine.getNoOrderCauseFieldName(surveyConfig);

                if (XApp.isEmptyOrWhitespaceString(fieldName) || XApp.isEmptyOrWhitespaceString(noOrderCauseFieldName))
                    return;

                var propValue = headerCsr.get(fieldName);
                if (propValue != undefined) {

                    var order;
                    if (orders && orders.length)
                        order = orders[0];

                    var orderTaken = false;
                    //orders for idsurvey found
                    var mandatoryPaymentFieldName = SalesExecutionEngine.getMandatoryPaymentFieldName(surveyConfig);
                    if (order) {
                        if (order.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO
                            && order.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO_HOST
                            && order.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) {
                            //set ORDERTAKEN to YES
                            headerCsr.set(fieldName, SalesExecutionNameSpace.YesNoQtab.Yes);
                            //clear no order cause field
                            headerCsr.set(SalesExecutionEngine.getNoOrderCauseFieldName(surveyConfig), "");

                            //#32702: Mandatory Encashment activity

                            if (SM1OrderHelper.isMandatoryPayment(order))
                                headerCsr.set(mandatoryPaymentFieldName, true); //set MANDATORY_PAYMENT to true
                            else
                                headerCsr.set(mandatoryPaymentFieldName, false); //set MANDATORY_PAYMENT to false

                            orderTaken = true;
                        }
                    }
                    if (!orderTaken) //no order found for idsurvey
                    {
                        //set ORDERTAKEN to NO
                        headerCsr.set(fieldName, SalesExecutionNameSpace.YesNoQtab.No);

                        //set Mandatory Payment to false
                        headerCsr.set(mandatoryPaymentFieldName, false);

                        var noOrderCauseValue = headerCsr.get(noOrderCauseFieldName);
                        //clear no order cause field
                        if (noOrderCauseValue != undefined && XApp.isEmptyOrWhitespaceString(noOrderCauseValue)) {
                            headerCsr.set(noOrderCauseFieldName, ParametersDefaultsAndStaticData.getInstance().getDefault_order_surv_noordercause());
                        }
                    }
                    this._clearDetailFieldError(headerCsr, ParametersDefaultsAndStaticData.getInstance().getNoOrderCauseMeasureName());
                    this._refreshTab(gui, cs);
                }
            }

        } catch (e) {
            XLog.logEx(e);
        }
    };

    /*Check rights and conditions to create a new encashment*/
    this._canCreateNewEncashment = function (gui) {
        var visit = gui.getDocument();
        var codParty = visit.get("CODPARTY");
        var hasNewEncashmentRight = UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NEW");

        return !XApp.isEmptyOrWhitespaceString(codParty) && hasNewEncashmentRight && gui.cust && !XApp.isEmptyOrWhitespaceString(gui.cust.get("CODCUSTINV"));
    };

    /*Check if there are any orders with MANDATORY PAYMENT measure set and no encashment activity. 
                If there are a new encashment activity will be created
    */
    this._createMandatoryPayment = function (gui) {
        try {

            var mobVisit = gui.getDocument();

            var encSurvey = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
            if (!encSurvey) {
                XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                return null;
            }

            //User has right to create encashment and that activity type can be added to this visit
            if (this._canCreateNewEncashment(gui) && (gui.openMode != "VIEW") && SalesExecutionEngine.canCreateSurvey(encSurvey, mobVisit)) {

                //If there is no encashment activity already present
                if (!mobVisit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
                    return e.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey();
                })) {

                    var orderSrvConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                    if (!orderSrvConfig) {
                        XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey());
                        return null;
                    }

                    var mandatoryPaymentFieldName = SalesExecutionEngine.getMandatoryPaymentFieldName(orderSrvConfig);
                    var mandatoryPaymentDocNumber = null;
                    for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
                        var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
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
                                    mandatoryPaymentDocNumber = SalesForceEngine.getOpenInvoiceNumDoc(order.get("CODUSR"), order.get("CODTYPORD"), order.get("NUMDOC"), order.get("NUMORD"));

                                }
                                break;
                            }
                        }
                    }

                    return mandatoryPaymentDocNumber;
                }
            }

        } catch (e) {
            XLog.logEx(e);
        }
        return null;
    };


    //Search for a ORDER type survey in the visit that has no order associated
    this._getFirstUnusedOrderSurvey = function (mobVisit) {

        for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
            if (cs.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey())
                continue;

            var orders = SalesForceEngine.getAllOrderNavRows(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("IDSURVEY", "=", cs.get("IDSURVEY"))
                ]
            }));
            //orders for idsurvey not found - we can reuse order survey
            if (!orders || !orders.length) {
                return cs;
            }
        }
        return null;
    };

    //#endregion

    //#region Encashment Management

    this._createNewEncashmentActivity = function (gui, mandatoryPaymentDocNumber) {

        try {
            var self = this;
            var entity = gui.getDocument();
            var codcustinv = gui.cust.get("CODCUSTINV");

            //search for "empty" order survey
            var encashmentSurvey = self._getFirstUnusedEncashmentSurvey(entity);
            //if found then navigate to new encashment gui and link that UI to this encashment activity
            //else try to create new encashment activity
            if (!encashmentSurvey) {
                //we need to create new encashment survey
                var surveyConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
                if (!surveyConfig) {
                    XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
                } else {
                    if (SalesExecutionEngine.canCreateSurvey(surveyConfig, entity)) {
                        var obj = SalesExecutionEngine.createNewCustomerSurvey(surveyConfig.CODTYPSURVEY, gui.cust.get("CODPARTY"), entity.get("CONTACTMODE"), gui.cust.get("FLGSUBSTITUTE"), entity.get("CODSTRUCTURE"));
                        // plan customer survey in visit (ADDS to current document)
                        SalesExecutionEngine.planCustomerSurvey(obj, entity, entity.get("CODSTATUS"));
                        //initializes internal properties
                        self._onAfterCustomerSurveyAdded(obj, gui);
                        gui.setModified(entity);
                        encashmentSurvey = obj;
                    }
                }
            }

            if (encashmentSurvey) {

                if (encashmentSurvey.isModified()) { //save and after open new encashment gui with info about encashment activity
                    gui.saveDocNoConfirmation(function () {

                        var mobVisit = gui.getDocument();
                        var codcustinv = gui.cust.get("CODCUSTINV");
                        var encashmentSurvey = self._getFirstUnusedEncashmentSurvey(mobVisit);
                        var numord = null;
                        var codtypord = null;
                        var orderSurvey = mobVisit.getSubEntityStore("MVCustomerSurvey").findBy(function (cs) {
                            return cs.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getOrderCodtypsurvey();
                        });

                        gui._storeDocOnTempCache();

                        SalesForceEngine.openNewAgendaEncashment(codcustinv, encashmentSurvey.get("IDSURVEY"), mandatoryPaymentDocNumber);
                    });
                    return;
                } else {
                    SalesForceEngine.openNewAgendaEncashment(codcustinv, encashmentSurvey.get("IDSURVEY"), mandatoryPaymentDocNumber);
                    return;
                }
            }
            else
                XUI.showErrorMsgBox({
                    msg: UserContext.tryTranslate("[ERR_ACTIVITY_CANNOT_BE_ADDED]") + UserContext.tryTranslate("[" + surveyConfig.CODTYPSURVEY + "]")
                });
        } catch (e) {
            XLog.logErr("Failed to open new encashment");
            XUI.showExceptionMsgBox(e);
        }
    }

    this._checkAndUpdateEncashmentsStatuses = function (gui) {

        var context = {
            gui: gui,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckAndUpdateEncashmentsStatuses', context);
        if (context.canceled)
            return;

        var mobVisit = gui.getDocument();

        //continue only if entity store contains at least one ENCASHMENT type survey.
        if (!mobVisit.getSubEntityStore("MVCustomerSurvey").findBy(function (e) {
            return e.get("CODTYPSURVEY") == ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey();
        }))
            return;


        for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
            if (cs.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey())
                continue;

            this._checkEncashmentMeasures(gui, cs);
        }

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCheckAndUpdateEncashmentsStatuses', context);
    };

    this._checkAndUpdateEncashmentStatus = function (gui, encashmentActivity) {

        var context = {
            gui: gui,
            encashmentActivity: encashmentActivity,
            canceled: false
        };

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeCheckAndUpdateEncashmentStatus', context);
        if (context.canceled)
            return;

        if (encashmentActivity.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey())
            return;

        this._checkEncashmentMeasures(gui, encashmentActivity);

        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterCheckAndUpdateEncashmentStatus', context);
    };

    this._checkEncashmentMeasures = function (gui, cs) {
        //get the encashment from the encashments-blance navigator
        var navData = XNavHelper.getFromMemoryCache('NAV_MOB_ENCBALANCE');
        if (!navData) {
            XLog.logErr("Missing NAV_MOB_ENCBALANCE navigator.");
            return;
        }

        var surveyConfig = SalesExecutionEngine.getSurveyConfig(ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
        if (!surveyConfig) {
            XLog.logWarn("Order survey not configured or cannot be found. Check survey with CODTYPSURVEY=" + ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey());
            return;
        }

        try {
            var headerCsr = cs.get("HEADER");
            if (headerCsr) {

                var fieldName = SalesExecutionEngine.getEncashmentTakenFieldName(surveyConfig);
                var propValue = headerCsr.get(fieldName);
                if (propValue != undefined) {
                    var idSurveyCopy = cs.get("IDSURVEY");

                    var enc = null;
                    for (var o = 0; o < navData.Rows.length; o++) {
                        if (navData.Rows[o].get("IDSURVEY") == idSurveyCopy) {
                            enc = navData.Rows[o];
                            break;
                        }
                    }

                    var encashmentTaken = false;
                    //orders for idsurvey found
                    if (enc) {
                        //set ENCASHMENTTAKEN to YES
                        headerCsr.set(fieldName, SalesExecutionNameSpace.YesNoQtab.Yes);
                        //clear no encashment cause field
                        headerCsr.set(SalesExecutionEngine.getNoEncashmentCauseFieldName(surveyConfig), "");

                        encashmentTaken = true;
                    }
                    if (!encashmentTaken) //no encashment found for idsurvey
                    {
                        //set ENCASHMENTTAKEN to NO
                        headerCsr.set(fieldName, SalesExecutionNameSpace.YesNoQtab.No);
                        //clear no encashment cause field
                        var fn = SalesExecutionEngine.getNoEncashmentCauseFieldName(surveyConfig);
                        var val = headerCsr.get(fn);
                        if (val != undefined && XApp.isEmptyOrWhitespaceString(val)) {
                            headerCsr.set(fn, ParametersDefaultsAndStaticData.getInstance().getDefault_encashment_surv_noencashmentcause());
                        }
                    }
                    this._clearDetailFieldError(headerCsr, ParametersDefaultsAndStaticData.getInstance().getNoEncashmentCauseMeasureName());
                    this._refreshTab(gui, cs);

                }
            }

        } catch (e) {
            XLog.logEx(e);
        }
    };



    //Search for a ENCASHMENT type survey in the visit that has no encashment associated
    this._getFirstUnusedEncashmentSurvey = function (mobVisit) {
        var navData = XNavHelper.getFromMemoryCache('NAV_MOB_ENCBALANCE');
        if (!navData) {
            XLog.logErr("Missing NAV_MOB_ENCBALANCE navigator.");
            return null;
        }

        for (var i = 0; i < mobVisit.getSubEntityStore("MVCustomerSurvey").getCount() ; i++) {
            var cs = mobVisit.getSubEntityStore("MVCustomerSurvey").getAt(i);
            if (cs.get("CODTYPSURVEY") != ParametersDefaultsAndStaticData.getInstance().getEncashmentCodtypsurvey())
                continue;

            var encashments = Ext.Array.filter(navData.Rows, function (row) {
                return row.get("IDSURVEY") == cs.get("IDSURVEY");
            });
            //encashments for idsurvey not found - we can reuse encashment survey
            if (encashments.length == 0) {
                return cs;
            }
        }
        return null;
    };

    //#endregion

    this._onManualMeasureChanged = function (customerSurvey, customerSurveyRow, measure) {

        var context = {
            customerSurvey: customerSurvey,
            customerSurveyRow: customerSurveyRow,
            measure: measure,
            canceled: false
        };
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'beforeOnManualMeasureChanged', context);
        if (context.canceled)
            return;

        customerSurvey.set("FLGMODIFY", true);

        //track manual edit measure
        if (measure.FLGMANUALEDITTRACKING) {
            var surveyConfig = SalesExecutionEngine.getSurveyConfig(customerSurvey.get("CODTYPSURVEY"));
            for (var i = 0; i < surveyConfig.SurveyMeasureDetails.length; i++) {
                var trackingMeasure = surveyConfig.SurveyMeasureDetails[i];
                if (trackingMeasure.CODMEASURE == measure.CODMEAUSRETRACKING) {
                    customerSurveyRow.set(trackingMeasure.FIELDNAME, true);
                    break;
                }
            }
        }
        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterOnManualMeasureChanged', context);
    };

    this.beforeTabControlActiveItemChange = function (context) {
        var tabName = context.newTab.tabName;
        var activity = context.gui.getDocument().getSubEntityStore('MVCustomerSurvey').findBy(function (survey) {
            return tabName === survey.uniqueID;
        });
        if (activity != null)
            context.storeEntity = activity;
    };

    this.onTabControlActiveItemChange = function (context) {
        var self = this;
        if (context && context.newTab) {
            switch (context.newTab.tabName) {
                case "PHOTOS":
                    if (context.isAtFirstLoad) {
                        this._refreshPhotosTab(context.gui);
                    }
                    break;
                case "CONTACTS":
                    if (context.isAtFirstLoad) {
                        this._refreshContactsGrid(context.gui);
                    }
                    break;
                case "VISITINFO":
                    context.gui.tabCtrls[context.newTab.tabName].refreshControls();
                    break;
                case "VISIT_SUMMARY":
                    {
                        if (!context.isAtFirstLoad) {
                            this._refreshSummaryTab(context.gui);
                        }
                    }
                    break;
                default:
                    if (context.isAtFirstLoad) {
                        //add show and hide event on tabs after creation
                        var tab = context.newTab;
                        var tabPanel = context.tabPanel;
                        //call show handler after tab detail context was rendered
                        self._onTabPanelShown(tabPanel, context);
                        tab.on("show", (function (context) {
                            return function (tabPanel) {
                                self._onTabPanelShown(tabPanel, context);
                            };
                        })(context));

                        tab.on("hide", (function (context) {
                            return function (tabPanel) {
                                self._onTabPanelHide(tabPanel, context);
                            };
                        })(context));
                    }
                    break;
            }
        }
    };

    //re-render summary tab, in case surveys were added / removed
    this._refreshSummaryTab = function (gui) {
        var detailContext = gui.tabCtrls["VISIT_SUMMARY"];
        if (!detailContext)
            return;

        detailContext.layoutConfig = gui.callCust("getCustomLayout",
            [detailContext.originalLayout || detailContext.layoutConfig, detailContext]);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    this.beforeCacheDoc = function (gui) {
        this._stopVisitDurationCounter(gui._selectedActivityContext);
        if (XUI.popup && !XUI.popup.destroyed)
            XUI.popup.destroy();
    };

    this._getBarcodeScannedHandler = function (gui) {
        var self = this;
        return function (code) {
            self._onBarcodeScanned(gui, code);
        };
    };

    this._onBarcodeScanned = function (gui, code) {
        var activeTab = gui.tabPanel.getActiveItem();
        var ctrl = gui.tabCtrls[activeTab.tabName];

        //check if the gui is in edit mode
        if (gui.openMode != "EDIT")
            return;

        //check if the current tab is linked to a MVCustomerSurvey entity
        if (!ctrl.entity || ctrl.entity.getEntityName() != "MVCustomerSurvey")
            return;
        var cs = ctrl.entity;

        //check if the current activity is a product activity
        if (SalesExecutionEngine.getActivityType(cs.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.PRODUCT) {
            //check if the barcode should be ignored
            if (!gui.canInterpretBarcode(this))
                return;

            var prod = BarcodeScannerUtils.getProductRowByEanCode(code);
            //check if the product exists in the navigator and if it satisfies the activity constraints
            if (prod && prod.checkConstraints(this._getProductXContraints(cs, gui)))
                this._tryAddNewCustomerSurveyRow(gui, ctrl, prod, true);
            else {
                //If the EAN code is not found in the product master data or the product is filtered out by activity constraints,
                //the product is not added to the activity and an alert message should be shown to the user
                XUI.showMsgBox({
                    title: "[MOB.WARN]",
                    msg: UserContext.tryTranslate("[MOB.PRODUCT_EAN_NOT_FOUND]"),
                    icon: "WARN",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });
            }
        }
    };

    this.beforeNotifyLeave = function (context) {
        clearTimeout(context.ctrl.planoramaBackgroundProcessID);
        context.ctrl.planoramaBackgroundProcessID = undefined;
        context.ctrl.savedPlanoramaSurveys = undefined;
        //remove barcode scanner listener
        BarcodeScanner.removeListener(this._getBarcodeScannedHandler(null), this);

        //cleanup custom preview sections
        if (context.ctrl && context.ctrl.tabCtrls && context.ctrl.tabCtrls["VISIT_SUMMARY"]) {
            var sections = context.ctrl.tabCtrls["VISIT_SUMMARY"].sections;
            for (var sectionName in sections) {
                if (!this._isPreviewSection(sectionName))
                    continue;

                delete sections[sectionName].sequenceIndicator;
                delete sections[sectionName].surveyPreview;
            }
        }
    };

    this.canOpenTab = function (tab, gui) {
        var doc = gui.getDocument();

        var activityExecution = ParametersDefaultsAndStaticData.getInstance().getActivityExecution();
        if (doc.get("DTEVISIT") > new Date().toDate() || gui.openMode == 'VIEW')
            activityExecution = "1";
        var activity = doc.getSubEntityStore('MVCustomerSurvey').findBy(function (survey) {
            return tab.tabName === survey.uniqueID;
        });
        if (!activity)
            return true;

        var isNotExecuted = (tab.tabConfig != undefined && tab.tabConfig.canBeExecuted == false);

        switch (activityExecution) {
            case "1":
                if (tab.tabConfig != undefined) {
                    tab.tabConfig.wasVisited = true;
                    if (!this.hasBlockingAnomalies(activity))
                        tab.tabConfig.canBeExecuted = true;
                }
                break;
            case "2":
                if (isNotExecuted)
                    if (!this._canActivityBeViewed(tab, activity, doc.getSubEntityStore('MVCustomerSurvey'), false)) {
                        XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBVISIT.CANNOT_ACCESS_ACTIVITY]") });
                        return false;
                    }
                break;
            case "3":
                if (isNotExecuted && !XApp.isEmptyOrWhitespaceString(activity.get("IDSURVEYSRC"))) {
                    if (!this._canActivityBeViewed(tab, activity, doc.getSubEntityStore('MVCustomerSurvey'), true)) {
                        XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOBVISIT.CANNOT_ACCESS_ACTIVITY]") });
                        return false;
                    }
                } else if (tab.tabConfig != undefined)
                    tab.tabConfig.wasVisited = true;
                break;
        }

        this._updateCollectionFlags(activity, tab, gui);
        return true;
    };

    this._canActivityBeViewed = function (tabPanel, survey, visitCustomerSurveys, onlyRecovery) {
        if (this._hasPreviewSection(survey)) {
            var sortedSurveys = Ext.Array.sort(visitCustomerSurveys.toArray(), function (a, b) {
                return SalesExecutionEngine.CompareSurveys(a, b);
            });

            if (!this._checkPreviousActivities(tabPanel, sortedSurveys, survey, onlyRecovery))
                return false;

            tabPanel.tabConfig.wasVisited = true;

            if (!this.hasBlockingAnomalies(survey))
                tabPanel.tabConfig.canBeExecuted = true;
        }
        return true;
    };

    this._checkPreviousActivities = function (tabPanel, sortedSurveys, survey, onlyRecovery) {
        for (var i = 0; i < sortedSurveys.length && sortedSurveys[i] != survey; i++) {
            var cs = sortedSurveys[i];
            if (onlyRecovery && XApp.isEmptyOrWhitespaceString(cs.get("IDSURVEYSRC")))
                continue;
            var previousTab = tabPanel.getParent().getItems().items.find(function (tab) {
                return tab.tabName === cs.uniqueID;
            });
            if (previousTab && this._hasPreviewSection(cs) && !previousTab.tabConfig.canBeExecuted)
                return false;
        }
        return true;
    };

    this._updateCollectionFlags = function (customerSurvey, tab, gui) {
        var key = customerSurvey.getKey();
        if (gui.executedActivities[key] == undefined)
            gui.executedActivities[key] = tab;
        else if (gui.executedActivities[key].tabConfig != undefined) {
            gui.executedActivities[key].tabConfig.canBeExecuted = tab.tabConfig.canBeExecuted;
            gui.executedActivities[key].tabConfig.wasVisited = tab.tabConfig.wasVisited;
        }
    };

    this.hasBlockingAnomalies = function (survey) {
        if (SalesExecutionEngine.getActivityType(survey.get("CODTYPSURVEY")) == SalesExecutionNameSpace.ActivityType.QUEST)
            return !this._validateQuestionary(survey, true);
        var rows = survey.getSubEntityStore("MVCustomerSurveyRow").toArray();
        var header = survey.get("HEADER");
        if (header)
            rows.unshift(header);
        for (i = 0 ; i < rows.length ; i++) {
            var problems = rows[i].getProblems();
            if (problems)
                for (j = 0 ; j < problems.length ; j++) {
                    var anom = problems[j];
                    if (anom.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.CANNOT_BE_SAVED
                        || anom.CODTYPSURVANOM == SalesExecutionNameSpace.AnomalyTypes.CAN_BE_SAVED)
                        return true;
                }
        };
        return false;
    };

    this.beforeActivatingTabItem = function (context) {
        var gui = context.gui;
        var tab = context.tab;
        var previousTab = gui.tabSubDetailsByName[gui.getActualTabName()];
        this._checkSolvedAnomaliesOnLeave(previousTab, gui);
        if (!this.canOpenTab(tab, gui))
            context.canceled = true;
    };

    this.beforeTabItemSwipe = function (context) {
        var gui = context.gui;
        var tab = context.tab;
        var nextTab = null;
        this._checkSolvedAnomaliesOnLeave(tab, gui);
        if (context.event.direction == 'left')
            nextTab = gui.tabSubDetails[gui.tabSubDetails.indexOf(tab) + 1];
        else
            nextTab = gui.tabSubDetails[gui.tabSubDetails.indexOf(tab) - 1];

        if (nextTab != undefined && !this.canOpenTab(nextTab, gui))
            context.canceled = true;
    };

    this._checkSolvedAnomaliesOnLeave = function (tab, gui) {
        var activity = null;
        if (tab && !tab.tabConfig.canBeExecuted) {
            activity = gui.getDocument().getSubEntityStore('MVCustomerSurvey').findBy(function (survey) {
                return tab.tabName === survey.uniqueID;
            });
            if (activity) {
                var activityType = SalesExecutionEngine.getActivityType(activity.get("CODTYPSURVEY"))
                if (activityType == SalesExecutionNameSpace.ActivityType.PRODUCT || activityType == SalesExecutionNameSpace.ActivityType.CUSTOMER)
                    this._validateSurvey(activity);

                if (this._hasPreviewSection(activity) && !this.hasBlockingAnomalies(activity)) {
                    tab.tabConfig.canBeExecuted = true;
                    this._updateCollectionFlags(activity, tab, gui);
                }
            }
        }
    }

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;

        //delete class members
        delete this.m_parsedFormulas;
        delete this._endOptions;
        delete this._openDayID;

        //delete cached values
        if (context.actionContext.action == XHistoryAction.Back || context.actionContext.action == XHistoryAction.Clear)
            delete gui.executedActivities;
        delete gui.m_photoSurveys;
        delete gui.m_evalPriceListCollection;
        delete gui.m_divisionAssortments;
        delete gui.m_assetBalance;
        delete gui._selectedActivityContext;
        delete gui.m_barcodeHandler;
        delete gui.recoveryErrorReports;
        delete gui.m_budgetValidationMsg;

        //clear buttons
        delete this.prepareVisitButton;
        delete this.closeVisitButton;
        delete gui.saveVisitButton;
        delete gui.newEncashmentButton;
        delete gui.reloadVisitButton;
        delete gui.cancelVisitButton;
        delete gui.suspendVisitButton;
        delete gui.newOpportunityButton;
        delete gui.newActivityButton;
        delete gui.visitCustomerButton;
        delete gui.previousVisitPicturesButton;
        delete gui.customerExternalUrlButton;
        delete gui.newOrderButton;
        delete gui.newOrderCartButton;
    };

    this._buildRowDetailTitle = function (gui, csr) {
        var context = {
            title: "",
            customerSurveyRow: csr,
            gui: gui,
            canceled: false
        };

        gui.callCust("beforeBuildRowDetailTitle", context);
        if (context.canceled)
            return context.title;

        var codArt = csr.get("CODART");
        var desArt = csr.get("DESART");
        if (XApp.isEmptyOrWhitespaceString(desArt)) {
            var survey = SalesExecutionEngine.getSurveyConfig(csr.getParentEntity().get("CODTYPSURVEY"));
            var measure = Ext.Array.findBy(survey.SurveyMeasureDetails, function (sm) {
                return sm.CODMEASURE == "ART.DESART";
            });
            if (measure)
                desArt = csr.get(measure.FIELDNAME);
        }

        context.title = XApp.isEmptyOrWhitespaceString(desArt) ? codArt : desArt + " | " + codArt;

        gui.callCust("afterBuildRowDetailTitle", context);

        return context.title;
    };

    this._showSurveyDash = function (gui, customerSurvey) {
        //save the document
        gui.saveDocNoConfirmation(function () {
            //get the new doc
            var doc = gui.getDocument();
            //get the new customer survey
            var cs = doc.MVCustomerSurveyDetailsStore.findBy(function (survey) {
                return survey.get("IDSURVEY_OLD") == customerSurvey.get("IDSURVEY") || survey.get("IDSURVEY") == customerSurvey.get("IDSURVEY");
            });
            //navigate to the dashboard
            XHistory.go({
                controller: app.getSM1Controllers().dash2,
                action: 'show',
                dashName: SalesExecutionEngine.getSurveyDashName(customerSurvey.get("CODTYPSURVEY")),
                id: SalesExecutionEngine.getSurveyDashName(customerSurvey.get("CODTYPSURVEY")),
                initVars: { IDSURVEY: cs.get("IDSURVEY") }
            });
        });
    };

    this._getPendingActivitiesConstraints = function (visit) {
        var existingSurveys = [];
        visit.MVCustomerSurveyDetailsStore.each(function (cs) {
            existingSurveys.push(cs.get("IDSURVEY"));
        });
        var visitContactMode = visit.get("CONTACTMODE");
        var isAvailableVisitContactMode = ContactModeHelper.getAvailableContactModes().contains(visitContactMode);

        var constr = new XConstraints({
            logicalOp: 'AND',
            constraints: [
                new XConstraint("CODPARTY", SqlRelationalOperator.Equal, visit.get("CODPARTY")),
                new XConstraint("CODTYPSURVEY", SqlRelationalOperator.NotEqual, "CHKCUST"),
                new XConstraint("IDSURVEY", SqlRelationalOperator.NotIn, existingSurveys),
                new XConstraint("DTEFROM", SqlRelationalOperator.LessOrEqual, visit.get("DTEVISIT")),
                new XConstraint("DTETO", SqlRelationalOperator.GreaterOrEqual, visit.get("DTEVISIT"))
            ]
        });

        var availableContactModeConstr = new XConstraints({
            logicalOp: 'OR',
            constraints: [
                new XConstraint("AVAILABLE_CONTACTMODES", SqlRelationalOperator.Contains, visitContactMode),
            ]
        });

        if (isAvailableVisitContactMode) {
            //an activity with 'empty' available_contactmodes can be planned with any of user's available contact modes
            availableContactModeConstr.Constraints.push(new XConstraint("AVAILABLE_CONTACTMODES", SqlRelationalOperator.Equal, ""))
        }
        constr.Constraints.push(availableContactModeConstr);

        return constr;
    };

    this.getYammerRefNode = function (context) {
        var cust = context.gui.cust;
        if (cust) {
            //the customer reference to be set is the delivery customer linked to the point of sales
            context.codNode = !XApp.isEmptyOrWhitespaceString(cust.get("CODCUSTDELIV")) ? cust.get("CODCUSTDELIV") : cust.get("CODPARTY");
            context.hierLevel = cust.get("IDLEVEL");
        }
    };
};
XApp.registerGuiExtension("mobGuiVisit", new _mobGuiVisitExtension());
//#endregion

