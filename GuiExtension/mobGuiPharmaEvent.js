//#region _mobGuiPharmaEventExtension
function _mobGuiPharmaEventExtension() {
    this.beforeGuiCreated = function (gui) {
        var event = gui.getDocument();
        var eventTypeConfig = event.getEventTypeConfig();
        for (var i = 0; i < gui.guiConfig.children.length; i++) {
            var tab = gui.guiConfig.children[i];
            switch (tab.attrs.name) {
                case "OTHER_COLLEAGUES":
                    tab.attrs.visible = eventTypeConfig.FLGSHARED ? "true" : "false";
                    break;
                case "SPEAKERS":
                    tab.attrs.visible = eventTypeConfig.FLGSPEAKERS ? "true" : "false";
                    break;
                case "PARTICIPANTS":
                    tab.attrs.visible = eventTypeConfig.FLGPARTICIPANTS ? "true" : "false";
                    break;
            }
        }
    };

    this.beforeUiRendering = function (context) {
        if (context.gui.getDocument().isNew) {
            this._refreshBudgetBalance(context.gui);
        }
        else {
            context.executeNext = false;
            var callback = function () { context.queue.executeNext(); };
            this._forceRefreshBudgetBalance(context.gui, false, callback, callback);
        }
    };

    this.getDocumentDescription = function (context) {
        return context.document.get("NAMEEVENT");
    };

    this.afterLoadDocument = function (gui) {
        try {
            var self = this;
            var event = gui.getDocument();

            if (!UserContext.checkRight('PharmaEvent', 'EVENTTYPES', 'EVENT_' + event.get("CODEVENTTYPE"))) {
                gui.openMode = 'VIEW';
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterNewDocument = function (gui, options) {
        var event = gui.getDocument();
        event.set("IDEVENT", XApp.newGUID());
        event.set('DOCUMENTKEY', 'PharmaEvent|' + event.get("IDEVENT"));
        event.set('CODUSR', UserContext.CodUsr);
        event.set('CODEVENTTYPE', options.eventType);
        event.set('FLGCOMPLIANCE', true);
        WFEngine.initWorkflow(event);

        event.set("CODCUR", CommonEngine.getDefaultCurrency());
        event.addEmptyCostDetails();

        var organizerUser = new XEntity({ entityName: 'PharmaEventUser' });
        organizerUser.set("IDEVENT", event.get("IDEVENT"));
        organizerUser.set("CODUSR", UserContext.CodUsr);
        organizerUser.set("FLGORGANIZER", true);
        organizerUser.set("DESUSR", UserContext.UserData.SM1User.DESUSR);
        organizerUser.set("NUMPHONE", UserContext.UserData.SM1User.NUMPHONE1);
        organizerUser.set("EMAIL", UserContext.UserData.SM1User.EMAIL1);
        event.getSubEntityStore('PharmaEventUser').add(organizerUser);

        if (event.getSubEntityStore("PharmaEventParty") == null)
            event.createSubEntityStore("PharmaEventParty");
        if (event.getSubEntityStore("InitialParticipants") == null)
            event.createSubEntityStore("PharmaEventParty", "InitialParticipants");
    };

    this.beforeCallSelector = function (context, selname, config) {
        var detailEntityName = config.detailObjectName;
        var doc = context.entity;
        var cons = null;
        switch (detailEntityName) {
            case "PharmaEventUser":
                cons = this._getUserSelectorConstraints(doc);
                break;
            case "PharmaEventSpeaker":
                var existingSpeakers = [];
                doc.getSubEntityStore("PharmaEventSpeaker").each(function (speaker) {
                    if (!Ext.Array.contains(existingSpeakers, speaker.get("CODPARTY"))) {
                        existingSpeakers.push(speaker.get("CODPARTY"));
                    }
                });
                cons = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        { attr: 'CODPARTY', op: SqlRelationalOperator.NotIn, value: existingSpeakers },
                        { attr: 'FLGSPEAKER', op: '=', value: -1 },
                        { attr: 'CODSTATUS', op: '!=', value: CommonNameSpace.CustomerStatus.Cancelled }
                    ]
                });
                break;
            case "PharmaEventParty":
                if (!doc.attendancesLoaded) {
                    SalesExecutionEngine.loadDoctorsAttendances(doc,
                    function (ex) {
                        XUI.showExceptionMsgBox(ex);
                    },
                    function () {
                        doc.attendancesLoaded = true;
                    });
                }

                cons = this._getParticipantsSelectorConstraints(doc);
                break;
        }
        if (!cons)
            return;

        if (!config.hiddenConstraints) {
            config.hiddenConstraints = cons;
        }
        else {
            config.hiddenConstraints = new XConstraints({
                logicalOp: "AND",
                constraints: [config.hiddenConstraints, cons]
            });
        }
    };

    this._getUserSelectorConstraints = function (event) {
        var existingUsers = [];
        var organizerUser = "";
        event.getSubEntityStore("PharmaEventUser").each(function (user) {
            if (user.get("FLGORGANIZER"))
                organizerUser = user.get("CODUSR");
            if (!Ext.Array.contains(existingUsers, user.get("CODUSR"))) {
                existingUsers.push(user.get("CODUSR"));
            }
        });
        var cons = new XConstraints('AND');
        cons.add("CODUSR", SqlRelationalOperator.NotIn, existingUsers);
        cons.add("CODDIV", "=", UserContext.CodDiv);
        var userType = event.getLoggedInUserType();
        var organizerUserGroups = [];
        var validUserGroups = [];

        switch (userType) {
            case SalesExecutionNameSpace.PharmaEventUserType.Organizer:
                for (var i = 0; i < UserContext.UserData.Divs.length; i++) {
                    var div = UserContext.UserData.Divs[i];
                    if (div.CodDiv == UserContext.CodDiv)
                        organizerUserGroups.push(div.CodGrp);
                }                
                break;
            case SalesExecutionNameSpace.PharmaEventUserType.Superior:
                var userNavConstraints = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                        new XConstraint("CODUSR", SqlRelationalOperator.Equal, organizerUser),
                        new XConstraint("CODDIV", SqlRelationalOperator.Equal, UserContext.CodDiv)
                    ]
                });
                var userDetails = XNavHelper.getNavRecords("NAV_MOB_USERS", userNavConstraints);

                for (var i = 0; i < userDetails.length; i++) {
                    organizerUserGroups.push(userDetails[i].get("USRGROUP"));
                }
                break;
        }

        for (var i = 0; i < organizerUserGroups.length; i++) {
            var usrGroupInfo = UsrGroup.getGroup(organizerUserGroups[i]);
            if (usrGroupInfo.USRTYPE != "1")
                continue;
            for (var j = 0; j < usrGroupInfo.UsrRightDetails.length; j++) {
                var right = usrGroupInfo.UsrRightDetails[j];
                if (right.CODDOCTYPE == 'PharmaEvent' && right.CODDOCSUBTYPE == 'EVENTTYPES' && right.CODFUNCTION == "EVENT_" + event.get("CODEVENTTYPE")) {
                    validUserGroups.push(organizerUserGroups[i]);
                    break;
                }
            }
        }
        cons.add("USRGROUP", SqlRelationalOperator.In, validUserGroups);
        return cons;
    };

    this._getParticipantsSelectorConstraints = function (event) {
        var cons = new XConstraints({ logicalOp: "AND" });
        var userGroup = UsrGroup.getGroup(UserContext.CodGrp);
        var xconstr = UsrGroup.getRightExprAsConstraints(userGroup, 'NAV_MOB_DOCTORS', "FILTER_" + event.get('CODEVENTTYPE'));
        if (xconstr) {
            cons.Constraints.push(xconstr);
        }

        var existingParticipants = [];
        event.getSubEntityStore("PharmaEventParty").each(function (participant) {
            if (!Ext.Array.contains(existingParticipants, participant.get("CODPARTY"))) {
                existingParticipants.push(participant.get("CODPARTY"));
            }
        });

        cons.add("CODPARTY", SqlRelationalOperator.NotIn, existingParticipants);
        cons.add("FLGRESP", SqlRelationalOperator.Equal, -1);
        cons.add("CODSTATUS", SqlRelationalOperator.NotEqual, CommonNameSpace.CustomerStatus.Cancelled);

        var removedParticipants = [];
        event.InitialParticipantsDetailsStore.each(function (initialParticipant) {
            var existingParticipant = event.getSubEntityStore("PharmaEventParty").findBy(function (participant) {
                return participant.get('DOCUMENTKEY') == initialParticipant.get('DOCUMENTKEY');
            });
            if (!existingParticipant && !Ext.Array.contains(removedParticipants, initialParticipant.get("CODPARTY"))) {
                removedParticipants.push(initialParticipant.get("CODPARTY"));
            }
        });

        var responsibleUserConstraint = new XConstraint("CODUSR", SqlRelationalOperator.Equal, UserContext.CodUsr);
        var userType = event.getLoggedInUserType();
        if (userType == SalesExecutionNameSpace.PharmaEventUserType.Superior) {
            var existingUsers = [];
            event.getSubEntityStore("PharmaEventUser").each(function (user) {
                if (!Ext.Array.contains(existingUsers, user.get("CODUSR"))) {
                    existingUsers.push(user.get("CODUSR"));
                }
            });
            responsibleUserConstraint = new XConstraint("CODUSR", SqlRelationalOperator.In, existingUsers);
        }

        var finalCons = new XConstraints({
            logicalOp: 'AND',
            constraints: [
                responsibleUserConstraint,
                new XConstraints({
                    logicalOp: 'OR',
                    constraints: [
                        cons,
                        new XConstraint("CODPARTY", SqlRelationalOperator.In, removedParticipants)
                    ]
                })
            ]
        });

        return finalCons;
    };

    this.onSaveDocument = function (gui, document, onSuccess) {
        var self = this;

        document.removeEmptyCostDetails();

        var updatedParticipants = [];
        var participants = document.getSubEntityStore('PharmaEventParty');

        document.InitialParticipantsDetailsStore.each(function (initialParticipant) {
            var existingParticipant = participants.findBy(function (participant) {
                return participant.get('DOCUMENTKEY') == initialParticipant.get('DOCUMENTKEY');
            });
            if (!existingParticipant) {
                initialParticipant.set("FLGANN", true);
                updatedParticipants.push(initialParticipant);
            }
        });
        participants.each(function (participant) {
            if (participant.isModified())
                updatedParticipants.push(participant);
        });
        var localExecutionQueue = new ExecutionQueue();
        var unsavedParticipants = [];

        //save participants as separate documents
        for (var i = 0; i < updatedParticipants.length; i++) {
            var pharmaEventParty = updatedParticipants[i];
            localExecutionQueue.pushHandler(self, (function (participant) {
                return function () {
                    XDocs.saveDocument(participant, false,
                        function (e) {
                            XLog.logEx(e);
                            unsavedParticipants.push(pharmaEventParty.get("DESFULLNAME"));
                            localExecutionQueue.executeNext();
                        },
                        function (savedDocument) {
                            // update nav_mob_event_attendances
                            if (savedDocument.get("FLGANN")) {
                                // decrease participant's attendances
                                SalesExecutionEngine.updateNavMobEventAttendances(document, savedDocument, -1,
                                function (ex) {
                                    XUI.showExceptionMsgBox(ex);
                                });
                            }
                            else if (!document.InitialParticipantsDetailsStore.findBy(function (ip) { return ip.get("CODPARTY") == savedDocument.get("CODPARTY"); })) {
                                // increase participant's attendances
                                SalesExecutionEngine.updateNavMobEventAttendances(document, savedDocument, 1,
                                function (ex) {
                                    XUI.showExceptionMsgBox(ex);
                                });
                            }

                            localExecutionQueue.executeNext();
                        },
                        false
                    );
                };
            })(pharmaEventParty));
        }

        //warn the user if some participants were not saved
        localExecutionQueue.pushHandler(self, function () {
            if (unsavedParticipants.length != 0) {
                XUI.showOk({
                    title: UserContext.tryTranslate("[MOB.WARN]"),
                    msg: UserContext.tryTranslate("[MOBGUIPHARMAEVENT.PARTICIPANTS_NOT_SAVED]") + " : " + unsavedParticipants.join(', '),
                    onResult: function () {
                        localExecutionQueue.executeNext();
                    }
                });
            }
            else {
                localExecutionQueue.executeNext();
            }
        });

        //update budget movements
        if (document.getBudgetEvalMode() != SalesExecutionNameSpace.PharmaEventBudgetMode.NONE) {
            localExecutionQueue.pushHandler(self, function () {
                self._budgetContext.updatedBalances = SalesExecutionEngine.updateEventBudgets(document, self._budgetContext.budgets || {});
                self._refreshBudgetBalance(gui, self._budgetContext.updatedBalances);
                localExecutionQueue.executeNext();
            });
        }

        localExecutionQueue.pushHandler(self, onSuccess);
        localExecutionQueue.executeNext();
    };

    this.afterSaveDocument = function (gui, document, onFailure, onSuccess, isWorkflowSave) {
        var self = this;
        var localExecutionQueue = new ExecutionQueue();

        //update events nav
        localExecutionQueue.pushHandler(self, function () {
            SalesExecutionEngine.updateNavMobPharmaEvents(document, gui.openData.selectedNavRow,
                function (ex) {
                    XUI.showExceptionMsgBox(ex, function () { localExecutionQueue.executeNext(); });
                },
                function () {
                    localExecutionQueue.executeNext();
                });
        });

        //update budgets nav
        if (document.getBudgetEvalMode() != SalesExecutionNameSpace.PharmaEventBudgetMode.NONE) {
            localExecutionQueue.pushHandler(self, function () {
                CommonEngine.updateNavBudgetBalance(self._budgetContext.updatedBalances,
                    function () {
                        //if the save is triggered by workflow, the message will be displayed in workflow popup
                        var msg = isWorkflowSave ? "" : self._buildBudgetResultMsg(document);
                        if (!XApp.isEmptyOrWhitespaceString(msg)) {
                            XUI.showInfoOk({
                                msg: msg,
                                onResult: function () { localExecutionQueue.executeNext(); }
                            });
                        }
                        else {
                            localExecutionQueue.executeNext();
                        }
                    },
                    function (ex) {
                        XUI.showExceptionMsgBox(ex, function () { localExecutionQueue.executeNext(); });
                    });
            });
        }

        localExecutionQueue.pushHandler(self, function () {
            if (onSuccess) {
                var msg = isWorkflowSave ? self._buildBudgetResultMsg(document) : "";
                onSuccess(msg);
            }
            self._budgetContext = {};
            if (isWorkflowSave) {
                gui.clearModified();
            }
        });
        localExecutionQueue.executeNext();
    };

    this.beforeCreateGridColumn = function (fieldContext) {
        try {
            var self = this;
            var entityName = fieldContext.sectionContext.entityName;
            var fieldName = fieldContext.column.fieldName;

            switch (entityName) {
                case "PharmaEvent":

                    switch (fieldName) {
                        case "COSTAMOUNT":
                        case "COSTSPEAKER":
                            fieldContext.column.minValue = 0;
                            break;
                        case "DESFULLNAME":
                            if (fieldContext.config.attrs["presType"] == 'hyperlink') {
                                fieldContext.config.attrs.handler = (function (gui) {
                                    return function (record) {

                                        var navId = "NAV_MOB_DOCTORS";
                                        var viewRight = UserContext.checkRight(navId, navId, 'VIEW');
                                        var editRight = UserContext.checkRight(navId, navId, 'EDIT');

                                        if (viewRight || editRight) {

                                            gui._storeDocOnTempCache();
                                            XHistory.go({
                                                controller: app.getSM1Controllers().gui,
                                                action: 'show',
                                                docKey: CommonEngine.buildCustomerKey(record.xrec.get("CODPARTY")),
                                                navId: navId,
                                                openMode: editRight ? 'EDIT' : 'VIEW'
                                            });
                                        }
                                    };
                                })(fieldContext.sectionContext.gui);
                            }
                            break;
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onGridEndEditEnded = function (context) {
        var entity = context.rowEntity;
        var fieldName = context.fieldName;
        try {
            switch (entity.getEntityName()) {
                case "PharmaEventCost":
                    switch (fieldName) {
                        case "COSTAMOUNT":
                            context.detailContext.refreshControls();
                            context.detailContext.setFieldsStatus();
                            break;
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this._rebindParticipantsGridStore = function (gui) {
        if (!gui.tabCtrls.PARTICIPANTS ||
            !gui.tabCtrls.PARTICIPANTS.sections.PARTICIPANTS_GRID) {
            return;
        }

        var event = gui.getDocument();
        var gridStore = gui.tabCtrls.PARTICIPANTS.sections.PARTICIPANTS_GRID.grid.getStore();
        event.getSubEntityStore("PharmaEventParty").rebindSenchaStore(gridStore);
    };

    this.beforeRemoveDetail = function (context) {
        var self = this;
        var gui = context.gui;
        var document = gui.gui.getDocument();
        var detailEntity = context.detailEntity;
        switch (detailEntity.getEntityName()) {
            case "PharmaEventUser":
                XUI.showYESNO({
                    title: UserContext.tryTranslate("[MOB.WARN]"),
                    icon: 'WARN',
                    msg: UserContext.tryTranslate("[MOBGUIPHARMAEVENT.CONFIRM_USER_REMOVE]"),
                    onResult: function (buttonCode) {
                        switch (buttonCode) {
                            case 'YES':
                                var codUsr = gui.entity.get("CODUSR");

                                document.getSubEntityStore("PharmaEventParty").removeBy(function (participant) {
                                    return participant.get("CODUSR") != codUsr;
                                });
                                self._rebindParticipantsGridStore(gui.gui);

                                document.getSubEntityStore("PharmaEventUser").removeBy(function (user) {
                                    return user.get("CODUSR") != codUsr;
                                });

                                if (gui.senchaEntity)
                                    gui.listStore.remove(gui.senchaEntity);
                                gui.gui.setModified(gui.entity);
                                gui.doBack.call(gui, true, true, "REMOVE");
                                break;
                        }
                    }
                });
                return true;
        }
        return false;
    }

    this.afterCloseHandler = function (context) {
        var ctrl = context.ctrl,
            gui = ctrl.gui,
            pharmaevent = ctrl.gui.getDocument(),
            options = context.opt,
            detailEntity = ctrl.entity,
            entityName = detailEntity.getEntityName(),
            parentCtrl = ctrl.parentCtrl,
            selector = ctrl.gui.selector,
            compareBy;

        switch (entityName) {
            case "PharmaEventCost":
                parentCtrl.refreshControls();
                parentCtrl.setFieldsStatus();
                break;
            case "PharmaEventUser":
                if (context.opt.reason == "REMOVE" || context.ctrl.isNewDetail) {
                    this._forceRefreshBudgetBalance(ctrl.gui, true, Ext.emptyFn, Ext.emptyFn);
                    if (context.ctrl.isNewDetail) {
                        compareBy = "CODUSR";
                        selector.nav.filterOutCollection(pharmaevent.getSubEntityStore(entityName), compareBy, function () {
                            XUI.hideWait();
                        });
                    }
                }
                break;
            case "PharmaEventSpeaker":
                if (context.ctrl.isNewDetail) {
                    compareBy = "CODPARTY";
                    selector.nav.filterOutCollection(pharmaevent.getSubEntityStore(entityName), compareBy, function () {
                        XUI.hideWait();
                    });
                }
                break;
            case "PharmaEventParty":
                if (context.ctrl.isNewDetail) {
                    compareBy = "CODPARTY";
                    selector.nav.filterOutCollection(pharmaevent.getSubEntityStore(entityName), compareBy, function () {
                        XUI.hideWait();
                    });
                }
                parentCtrl.refreshControls();
                parentCtrl.setFieldsStatus();
                break;
        }
    };

    this.beforeChangingState = function (context) {
        var self = this;
        var gui = context.gui;
        var event = context.doc;
        var nextState = WFEngine.getWfState(event.get("IDWFMODEL"), context.transition.get("DESTINATIONSTATEID"));
        event.set("CODNEXTWFSTATEHARD", nextState.get("CODSTATEHARD"));
        context.canceled = true;
        context.skipAbortMessageLogging = true;

        gui.saveMode = "WORKFLOW";
        if (!gui.callCust('preSaveDocument', [gui, event, context.doChangeState])) {
            return;
        }

        XApp.exec(context.doChangeState);
    };

    this.afterStateChanged = function (context) {
        var self = this;
        var event = context.gui.getDocument();

        if (event.get("CODWFSTATEHARD") == SalesExecutionNameSpace.StudyWFHardState.Cancelled) {
            event.getSubEntityStore('PharmaEventParty').each(function (participant) {
                SalesExecutionEngine.updateNavMobEventAttendances(event, participant, -1,
                function (ex) {
                    XUI.showExceptionMsgBox(ex);
                });
            });
        }

        //refresh the costs and speakers tab because of the enabled/visibility rules
        self._refreshCostsTab(context.gui);
        self._refreshSpeakersTab(context.gui);
        event.set("CODNEXTWFSTATEHARD", "");
    };

    this._refreshCostsTab = function (gui) {
        var detailContext = gui.tabCtrls["EVENT_COST"];
        if (!detailContext)
            return;
        detailContext.layoutConfig = gui.callCust("getCustomLayout",
            [detailContext.originalLayout || detailContext.layoutConfig, detailContext]);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    this._refreshSpeakersTab = function (gui) {
        var detailContext = gui.tabCtrls["SPEAKERS"];
        if (!detailContext)
            return;
        detailContext.layoutConfig = gui.callCust("getCustomLayout",
            [detailContext.originalLayout || detailContext.layoutConfig, detailContext]);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    this.onTabControlActiveItemChange = function (context) {
        if (context && context.newTab) {
            if (context.newTab.tabName == "PARTICIPANTS") {
                context.gui.tabCtrls[context.newTab.tabName].refreshControls();
            }
        }
    };

    this.validateDocument = function (gui) {
        var event = gui.getDocument();
        var eventTypeConfig = event.getEventTypeConfig();

        delete gui.errorReports["INVALID_DTEFROM"];
        delete gui.errorReports["INVALID_DTETO"];
        delete gui.errorReports["INVALID_NUMPARTICIPANTSFORECAST"];
        delete gui.errorReports["INVALID_ESTIMATEDTOTALCOST"];
        delete gui.errorReports["CONN_REQ"];
        delete gui.errorReports[SalesExecutionNameSpace.PharmaEventBudgetMsg.MISSING_BUDGETS];
        delete gui.errorReports[SalesExecutionNameSpace.PharmaEventBudgetMsg.LOW_BUDGET];

        var isValid = (!gui.errorReports || Object.keys(gui.errorReports).length == 0);

        var eventTypeDteFrom = new Date(eventTypeConfig.DTEFROM).toDate();
        var eventTypeDteTo = new Date(eventTypeConfig.DTETO).toDate();
        var pharmaEventTypeInterval = eventTypeDteFrom.toDateString() + ' - ' + eventTypeDteTo.toDateString();

        if (gui.openMode != "NEW" && event.get("CODNEXTWFSTATEHARD") == SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled) {
            gui.errorReports = [];
            isValid = true;
        }
        else {
            if (event.get("DTEFROM").getTime() < eventTypeDteFrom.getTime() || event.get("DTEFROM").getTime() > eventTypeDteTo.getTime()) {
                gui.errorReports["INVALID_DTEFROM"] = { caption: UserContext.tryTranslate("[MOB.START_DATE_OUTSIDE_EVENT_TYPE_INTERVAL]") + ' (' + pharmaEventTypeInterval + ').' };
                isValid = false;
            }

            if (event.get("DTETO").getTime() < eventTypeDteFrom.getTime() || event.get("DTETO").getTime() > eventTypeDteTo.getTime()) {
                gui.errorReports["INVALID_DTETO"] = { caption: UserContext.tryTranslate("[MOB.END_DATE_OUTSIDE_EVENT_TYPE_INTERVAL]") + ' (' + pharmaEventTypeInterval + ').' };
                isValid = false;
            }

            if (event.get("NUMPARTICIPANTSFORECAST") > eventTypeConfig.MAXPARTICIPANTS) {
                gui.errorReports["INVALID_NUMPARTICIPANTSFORECAST"] = { caption: UserContext.tryTranslate("[MOB.INVALID_NUMBER_OF_PARTICIPANTS]") + ' (' + eventTypeConfig.MAXPARTICIPANTS + ').' };
                isValid = false;
            }

            if (event.get("ESTIMATEDTOTALCOST") > eventTypeConfig.COSTMAX && eventTypeConfig.COSTMAX != 0) {
                gui.errorReports["INVALID_ESTIMATEDTOTALCOST"] = { caption: UserContext.tryTranslate("[MOB.INVALID_ESTIMATEDTOTALCOST]") + ' (' + eventTypeConfig.COSTMAX + ').' };
                isValid = false;
            }

            if (event.getBudgetEvalMode() != SalesExecutionNameSpace.PharmaEventBudgetMode.NONE &&
                !UserContext.isFullOfflineMode() &&
                !XApp.isHomeLocalHost() &&
                !XApp.isOnline()) {
                gui.errorReports["CONN_REQ"] = { caption: UserContext.tryTranslate("[MOBGUIPHARMAEVENT.CONN_REQ]") };
                isValid = false;
            }

            if (this._budgetContext && !XApp.isEmptyOrWhitespaceString(this._budgetContext.msg)) {
                gui.errorReports[this._budgetContext.msg] = { caption: this._buildBudgetValidationMsg(event) };
                isValid = false;
            }
        }

        return isValid;
    };

    this.setNewButtonsStatus = function (context) {
        var event = context.gui.getDocument();
        switch (context.detailEntityName) {
            case "PharmaEventUser":
            case "PharmaEventSpeaker":
                context.enabled = context.enabled
                                 && ([SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(event.get("CODWFSTATEHARD")) == -1)
                                 && PharmaEventHelper.checkFullEditability(event);
                break;
            case "PharmaEventParty":
                context.enabled = context.enabled
                  && ([SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(event.get("CODWFSTATEHARD")) == -1);
                break;
        }
    };

    this.setRemoveButtonsStatus = function (context) {
        var event = context.gui.getDocument();
        var detailEntity = context.subGui.entity;
        switch (context.detailEntityName) {
            case "PharmaEventCost":
                context.enabled = false;
                break;
            case "PharmaEventUser":
                context.enabled = context.enabled && !detailEntity.get("FLGORGANIZER") && [SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(event.get("CODWFSTATEHARD")) == -1
                              && PharmaEventHelper.checkFullEditability(event);
                break;
            case "PharmaEventSpeaker":
                context.enabled = context.enabled && [SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(event.get("CODWFSTATEHARD")) == -1
                                              && PharmaEventHelper.checkFullEditability(event);
                break;
            case "PharmaEventParty":
                context.enabled = context.enabled && PharmaEventHelper.canManageParticipant(detailEntity.get("CODUSR"), detailEntity.get("CODPARTY"), event)
                                && [SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(event.get("CODWFSTATEHARD")) == -1;
                break;
        }
    };

    this.setNavigateButtonsStatus = function (context) {
        if (context.subGui.isNewDetail) {
            context.visible = false;
        }
    };

    this.setFieldStatus = function (context) {
        var self = this;
        var fieldName = context.field.getName();
        var fieldContext = context.field.fieldContext;
        var entity = fieldContext.sectionContext.entity;
        var entityName = fieldContext.sectionContext.entityName;
        var document = context.sectionContext.document;
        var eventTypeConfig = document.getEventTypeConfig();

        switch (entityName) {
            case "PharmaEvent":
                switch (fieldName) {
                    case "DTEFROM":
                    case "DTETO":
                        context.valid = context.valid && entity.get("DTEFROM") <= entity.get("DTETO");
                        break;
                    case "NUMPARTICIPANTSFORECAST":
                        if (eventTypeConfig.FLGPARTICIPANTS) {
                            context.valid = context.valid && entity.get(fieldName) != 0;
                        }
                        break;
                    case "MAXPARTICIPANTS":
                    case "TOTALPARTICIPANTS":
                        context.field.removeCls("x-warn-field");

                        if (entity.get("TOTALPARTICIPANTS") > eventTypeConfig.MAXPARTICIPANTS) {
                            context.field.addCls("x-warn-field");
                        }
                        break;
                    case "DURATION":
                        if (eventTypeConfig.FLGDURATION) {
                            context.valid = context.valid && entity.get(fieldName) != 0;
                        }
                        break;
                    case "CMEPOINTS":
                        if (eventTypeConfig.FLGCMEPOINTS) {
                            context.valid = context.valid && entity.get(fieldName) != 0;
                        }
                        break;
                    case "MAXIMUMCOST":
                    case "FINALTOTALCOST":
                        context.field.removeCls("x-warn-field");
                        if (entity.get("FINALTOTALCOST") > entity.get("MAXIMUMCOST") && entity.get("MAXIMUMCOST") != 0) {
                            context.field.addCls("x-warn-field");
                        }
                        break;
                    case "BUDGETBALANCE":
                        context.supressBaseValidation = true;
                        break;
                }
                break;
        }
    };

    this.newDetail = function (context) {
        var newEntity = context.newEntity;
        var parentEntity = context.parentEntity;
        switch (context.detailEntityName) {
            case "PharmaEventUser":
                newEntity.set("IDEVENT", parentEntity.get("IDEVENT"));
                newEntity.set("CODUSR", context.selectorRow.get("CODUSR"));
                newEntity.set("DESUSR", context.selectorRow.get("DESUSR"));
                newEntity.set("NUMPHONE", context.selectorRow.get("NUMPHONE1"));
                newEntity.set("EMAIL", context.selectorRow.get("EMAIL1"));
                break
            case "PharmaEventSpeaker":
                newEntity.set("IDEVENT", parentEntity.get("IDEVENT"));
                newEntity.set("CODPARTY", context.selectorRow.get("CODPARTY"));
                newEntity.set("TITLE", context.selectorRow.get("DESTITLE"));
                newEntity.set("NAME", [context.selectorRow.get("DESPARTY1"), context.selectorRow.get("DESPARTY2")].join(" "));
                newEntity.set("NUMPHONE", context.selectorRow.get("NUMPHONE1"));
                newEntity.set("EMAIL", context.selectorRow.get("EMAIL1"));
                break;
            case "PharmaEventParty":
                newEntity.set("IDEVENT", parentEntity.get("IDEVENT"));
                newEntity.set("CODPARTY", context.selectorRow.get("CODPARTY"));
                newEntity.set("DESTITLE", context.selectorRow.get("DESTITLE"));
                newEntity.set("DESFULLNAME", [context.selectorRow.get("DESPARTY1"), context.selectorRow.get("DESPARTY2")].join(" "));
                newEntity.set("NUMPHONE", context.selectorRow.get("NUMPHONE1"));
                newEntity.set("EMAIL", context.selectorRow.get("EMAIL1"));
                newEntity.set("DOCUMENTKEY", context.detailEntityName + '|' + newEntity.get("IDEVENT") + '|' + newEntity.get("CODPARTY"));
                newEntity.set("CODUSR", context.selectorRow.get("CODUSR"));
                newEntity.set("DESUSR", context.selectorRow.get("DESUSR"));
                break
        }
    };

    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {
        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;
        var gui = context.gui;
        var entity = context.entity;
        var event = gui.getDocument();

        switch (fieldName) {
            case "DTEFROM":
                if (event.get("DTETO") < newVal) {
                    event.set("DTETO", newVal);
                }
                break;
            case "DTETO":
                if (event.get("DTEFROM") > newVal && newVal != Constants.SM1MINDATE) {
                    event.set("DTEFROM", newVal);
                }
                break;
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName) {
        var gui = ctrl.fieldContext.sectionContext.gui;

        switch (fieldName) {
            case "DTEFROM":
            case "CODCUR":
                this._forceRefreshBudgetBalance(gui, true, Ext.emptyFn, Ext.emptyFn);
                break;
        }
    };

    this.getCustomLayout = function (layout, detailContext) {
        var event = detailContext.gui.getDocument();
        var eventTypeConfig = event.getEventTypeConfig();
        if (!eventTypeConfig)
            return layout;

        switch (detailContext.tabName) {
            case "MAIN":
                for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                    var section = layout.children[idxSection];
                    var sectionFields = section.children;
                    switch (section.attrs.caption) {
                        case "MAIN_INFO":
                            {
                                for (var i = 0; i < sectionFields.length; i++) {
                                    switch (sectionFields[i].attrs.name) {
                                        case "CODLOC":
                                            sectionFields[i].attrs.visible = sectionFields[i].attrs.mandatory = eventTypeConfig.FLGLOCATIONISINSTITUTE ? "true" : "false";
                                            break;
                                        case "DESLOC":
                                            sectionFields[i].attrs.visible = sectionFields[i].attrs.mandatory = !eventTypeConfig.FLGLOCATIONISINSTITUTE ? "true" : "false";
                                            break;
                                        case "NUMPARTICIPANTSFORECAST":
                                            sectionFields[i].attrs.visible = sectionFields[i].attrs.mandatory = eventTypeConfig.FLGPARTICIPANTS ? "true" : "false";
                                            break;
                                    }
                                }
                            }
                            break;
                        case "SERVICES_IN_RETURN":
                            {
                                section.attrs.visible = eventTypeConfig.FLGLOCATIONISINSTITUTE ? "true" : "false";
                                for (var i = 0; i < sectionFields.length; i++) {
                                    switch (sectionFields[i].attrs.name) {
                                        case "SERVICES":
                                            if (eventTypeConfig.FLGLOCATIONISINSTITUTE)
                                                sectionFields[i].attrs.mandatory = sectionFields[i].attrs.visible = "true";
                                            else
                                                sectionFields[i].attrs.mandatory = "false";
                                            break;
                                    }
                                }
                            }
                            break;
                        case "SETTING_DETAILS":
                            {
                                for (var i = 0; i < sectionFields.length; i++) {
                                    switch (sectionFields[i].attrs.name) {
                                        case "DURATION":
                                            sectionFields[i].attrs.mandatory = sectionFields[i].attrs.visible = eventTypeConfig.FLGDURATION ? "true" : "false";
                                            break;
                                        case "AGENDA":
                                            sectionFields[i].attrs.mandatory = sectionFields[i].attrs.visible = eventTypeConfig.FLGAGENDA ? "true" : "false";
                                            break;
                                        case "CMEPOINTS":
                                            sectionFields[i].attrs.mandatory = sectionFields[i].attrs.visible = eventTypeConfig.FLGCMEPOINTS ? "true" : "false";
                                            break;
                                    }
                                }
                            }
                            break;
                    }
                }
                break;
            case "EVENT_COST":
                for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                    var section = layout.children[idxSection];
                    var sectionFields = section.children;
                    switch (section.attrs.caption) {
                        case "SUMMARY":
                            {
                                for (var i = 0; i < sectionFields.length; i++) {
                                    switch (sectionFields[i].attrs.name) {
                                        case "BUDGETBALANCE":
                                            sectionFields[i].attrs.visible = eventTypeConfig.FLGBUDGET ? "true" : "false";
                                            break;
                                    }
                                }
                            }
                            break;
                    }
                }
                break;
        }
        return layout;
    };

    this.afterSectionCreated = function (context) {
        var event = context.gui.getDocument();
        var entityName = context.detailGui.entityName;
        var sectionType = context.sectionConfig.attrs["type"];
        var sectionName = context.sectionConfig.attrs["caption"];

        switch (sectionName) {
            case "ESTIMATED_COST_DETAILS":
            case "FINAL_COST_DETAILS":
                //if (sectionName == "ESTIMATED_COST_DETAILS" &&
                //    [SalesExecutionNameSpace.PharmaEventWFHardState.Closed
                //    , SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled
                //    , SalesExecutionNameSpace.PharmaEventWFHardState.Executed].indexOf(event.get("CODWFSTATEHARD")) >= 0) {
                //    context.sectionConfig.attrs.startExpanded = "false";
                //}

                var costCategory = sectionName == "ESTIMATED_COST_DETAILS" ? SalesExecutionNameSpace.PharmaEventCostCategory.Estimated : SalesExecutionNameSpace.PharmaEventCostCategory.Final;
                //filter each grid section by cost type
                context.panel.grid.getStore().setFilters([
                    Ext.create('Ext.util.Filter',
                    {
                        filterFn: function (item) {
                            return item.get('COSTCATEGORY') == costCategory;
                        },
                        root: 'data'
                    })
                ]);
                context.panel.grid.getStore().setSorters({ property: "CODTYPEVENTCOST" });
                context.panel.grid.refresh();
                break;
        }
    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "OTHER_COLLEAGUES_GRID":
                sectionContext.document.getSubEntityStore("PharmaEventUser").sortStore(function (u1, u2) {
                    if (u1.get("FLGORGANIZER") && !u2.get("FLGORGANIZER"))
                        return -1;
                    if (!u1.get("FLGORGANIZER") && u2.get("FLGORGANIZER"))
                        return 1;
                    if (u1.get("DESUSR") < u2.get("DESUSR"))
                        return -1;
                    if (u1.get("DESUSR") > u2.get("DESUSR"))
                        return 1;
                    return 0;
                });
                break;
            case "SPEAKERS_GRID":
                sectionContext.document.getSubEntityStore("PharmaEventSpeaker").sortStore(function (s1, s2) {
                    if (s1.get("NAME") < s2.get("NAME"))
                        return -1;
                    if (s1.get("NAME") > s2.get("NAME"))
                        return 1;
                    return 0;
                });
                break;
            case "PARTICIPANTS_GRID":
                sectionContext.document.getSubEntityStore("PharmaEventParty").sortStore(function (p1, p2) {
                    if (p1.get("DESFULLNAME") < p2.get("DESFULLNAME"))
                        return -1;
                    if (p1.get("DESFULLNAME") > p2.get("DESFULLNAME"))
                        return 1;
                    return 0;
                });
                break;
        }
    };

    this.gridBeginEdit = function (context) {
        var entity = context.rowEntity;
        var doc = context.gui.getDocument();
        switch (entity.getEntityName()) {
            case "PharmaEventParty":
                switch (context.column.fieldName) {
                    //editability set here because there is no support for rules on grid columns)
                    case "FLGCONFIRMED":
                    case "FLGAUTHORIZED":
                    case "DESNOTE":
                        context.canceled = context.canceled || !((UserContext.CodUsr == entity.get("CODUSR") || PharmaEventHelper.checkUserResponsibility(entity.get("CODPARTY")))
                                                                && [SalesExecutionNameSpace.PharmaEventWFHardState.Closed, SalesExecutionNameSpace.PharmaEventWFHardState.Cancelled].indexOf(doc.get("CODWFSTATEHARD")) == -1);
                        break;
                }
                break;
        }
    };

    this.beforeNotifyLeave = function (context) {
        delete this._savingContext;
        delete this._budgetContext;
    };

    this._forceRefreshBudgetBalance = function (gui, refreshUI, onSuccess, onFailure) {
        try {
            var self = this;
            var event = gui.getDocument();
            var localExeQueue = new ExecutionQueue();

            //init value
            self._refreshBudgetBalance(gui);

            //retrieve budgets
            if (event.getBudgetEvalMode() != SalesExecutionNameSpace.PharmaEventBudgetMode.NONE &&
                event.getBudgetUsers().length > 0) {
                localExeQueue.pushHandler(self, function () {
                    SalesExecutionEngine.getEventBudgets(event, event.getBudgetUsers(),
                        function (response) {
                            self._refreshBudgetBalance(gui, response, refreshUI);
                            localExeQueue.executeNext();
                        },
                        function (err) {
                            XLog.logEx(err);
                            localExeQueue.clear();
                            onFailure()
                        });
                });
            }

            localExeQueue.pushHandler(self, onSuccess);
            localExeQueue.executeNext();
        }
        catch (ex) {
            XLog.logEx(ex);
            onFailure(ex);
        }
    };

    this._refreshBudgetBalance = function (gui, budgets, refreshUI) {
        var event = gui.getDocument();

        if (!budgets || Object.keys(budgets).length != 1) {
            event.set("BUDGETBALANCE", -Infinity);
        }
        else {
            //it's only one
            for (var key in budgets) {
                var budgetInfo = budgets[key];
                var valBalance = budgetInfo.Budget ? budgetInfo.Budget.get("VALBALANCE") : budgetInfo.newBalance;
                event.set("BUDGETBALANCE", valBalance);
            }
        }

        if (refreshUI && gui.tabCtrls && gui.tabCtrls.EVENT_COST) {
            gui.tabCtrls.EVENT_COST.refreshControls();
        }
    };

    this.afterCardFieldCreation = function (f, context) {
        switch (context.fieldConfig.attrs.name) {
            case "BUDGETBALANCE":
                //don't show unavailable balances
                f.config.hideValue = -Infinity;
                break;
        }

        return f;
    };

    this.preSaveDocument = function (gui, doc, onSuccess) {
        var self = this;

        var isWorkflowSave = gui.saveMode == "WORKFLOW";
        if ((gui.docModified || isWorkflowSave) &&
            doc.getBudgetEvalMode() != SalesExecutionNameSpace.PharmaEventBudgetMode.NONE) {

            if (!self._budgetContext) {
                self._budgetContext = {};
            }
            self._budgetContext.users = doc.getBudgetUsers();
            if (self._budgetContext.users.length > 0 && !self._savingContext) {
                //before validating the document, asynchronous calls are needed => suspend saving and call it later
                self._suspendSave(gui, onSuccess);

                self._checkBudgets(gui, function () { self._resumeSave(gui); }, function (ex) { XUI.showExceptionMsgBox(ex); });

                return false;
            }
        }

        return true;
    };

    this._suspendSave = function (gui, onSaveSuccess) {
        this._savingContext = {
            mode: gui.saveMode,
            document: gui.getDocument(),
            onSuccess: onSaveSuccess
        };
    };

    this._resumeSave = function (gui) {
        if (!this._savingContext)
            return;

        switch (this._savingContext.mode) {
            case "NO_CONFIRMATION":
                gui.saveDocNoConfirmation(this._savingContext.onSuccess);
                break;
            case "CONFIRMATION":
                gui.saveDoc(this._savingContext.onSuccess);
                break;
            case "WORKFLOW":
                this._savingContext.onSuccess();
                break;
            default:
                XApp.exec(this._savingContext.onSuccess);
                break;
        }

        delete this._savingContext;
    };

    this._checkBudgets = function (gui, onSuccess, onFailure) {
        try {
            var self = this;

            if (!self._budgetContext) {
                onSuccess();
                return;
            }

            delete self._budgetContext.msg;
            delete self._budgetContext.exceedingUsers;
            delete self._budgetContext.missingUsers;

            var event = gui.getDocument();
            var localExeQueue = new ExecutionQueue();

            //retrieve budgets
            localExeQueue.pushHandler(self, function () {
                SalesExecutionEngine.getEventBudgets(event, self._budgetContext.users,
                    function (response) {
                        self._budgetContext.budgets = response;
                        localExeQueue.executeNext();
                    },
                    function (err) {
                        localExeQueue.clear();
                        onFailure(err);
                    });
            });

            switch (event.getBudgetEvalMode()) {
                case SalesExecutionNameSpace.PharmaEventBudgetMode.ALL:
                case SalesExecutionNameSpace.PharmaEventBudgetMode.PER_USER:

                    //are all budgets present?
                    localExeQueue.pushHandler(self, function () {
                        self._budgetContext.missingUsers = SalesExecutionEngine.checkMissingEventBudgets(self._budgetContext.users, self._budgetContext.budgets);
                        if (self._budgetContext.missingUsers.length > 0) {
                            self._budgetContext.msg = SalesExecutionNameSpace.PharmaEventBudgetMsg.MISSING_BUDGETS;
                            localExeQueue.clear();
                            onSuccess();
                        }
                        else {
                            localExeQueue.executeNext();
                        }
                    });

                    //enough balance?
                    localExeQueue.pushHandler(self, function () {
                        self._budgetContext.exceedingUsers = SalesExecutionEngine.checkExceededEventBudgets(event, self._budgetContext.budgets);
                        if (self._budgetContext.exceedingUsers.length > 0) {
                            self._budgetContext.msg = SalesExecutionNameSpace.PharmaEventBudgetMsg.LOW_BUDGET;
                            localExeQueue.clear();
                            onSuccess();
                        }
                        else {
                            localExeQueue.executeNext();
                        }
                    });

                    break;
            }

            localExeQueue.pushHandler(self, onSuccess);
            localExeQueue.executeNext();
        }
        catch (ex) {
            XLog.logEx(ex);
            onFailure(ex);
        }
    };

    this._buildBudgetValidationMsg = function (event) {
        var msgParts = [], usrInfos = [], desCurrency, balanceFormatString;

        switch (this._budgetContext.msg) {
            case SalesExecutionNameSpace.PharmaEventBudgetMsg.MISSING_BUDGETS:
                msgParts.push(UserContext.tryTranslate("[MOBGUIPHARMAEVENT.MISSING_BUDGETS]"));
                usrInfos = this._budgetContext.missingUsers;
                break;
            case SalesExecutionNameSpace.PharmaEventBudgetMsg.LOW_BUDGET:
                msgParts.push(UserContext.tryTranslate("[MOBGUIPHARMAEVENT.LOW_BUDGET]"));
                usrInfos = this._budgetContext.exceedingUsers;
                desCurrency = event.get("DESCUR");
                balanceFormatString = XApp.model.getFieldDef("Budget", "VALBALANCE").formatString;
                break;
        }

        for (var i = 0; i < usrInfos.length; i++) {
            var usrInfo = usrInfos[i];
            var codUsr = usrInfo.codUsr || usrInfo;
            var user = CommonEngine.getUserNavRow(codUsr, UserContext.CodDiv);

            msgParts.push("<br />")
            msgParts.push(user ? user.get("DESUSR") : updateInfo.codUsr);
            if (usrInfo.val != undefined) {
                msgParts.push(": ");
                msgParts.push(UserContext.formatNumber(usrInfo.val, balanceFormatString) + " " + desCurrency);
            }
        }

        return msgParts.join("");
    };

    this._buildBudgetResultMsg = function (event) {
        var msgParts = [];

        var desCurrency = event.get("DESCUR");
        var balanceFormatString = XApp.model.getFieldDef("Budget", "VALBALANCE").formatString;

        if (this._budgetContext && this._budgetContext.updatedBalances) {
            for (var idBudget in this._budgetContext.updatedBalances) {
                var updateInfo = this._budgetContext.updatedBalances[idBudget];
                var formattedNewBalance = UserContext.formatNumber(updateInfo.newBalance, balanceFormatString) + " " + desCurrency;

                for (var i = 0; i < updateInfo.users.length; i++) {
                    var codUsr = updateInfo.users[i];
                    var user = CommonEngine.getUserNavRow(codUsr, UserContext.CodDiv);

                    msgParts.push("<br />")
                    msgParts.push(user ? user.get("DESUSR") : codUsr);
                    msgParts.push(": ");
                    msgParts.push(formattedNewBalance);
                }
            }
        }

        if (msgParts.length > 0) {
            msgParts = Ext.Array.insert(msgParts, 0, [UserContext.tryTranslate("[MOBGUIPHARMAEVENT.UPDATED_BUDGETS]")]);
        }

        return msgParts.join("");
    };

};
XApp.registerGuiExtension("mobGuiPharmaEvent", new _mobGuiPharmaEventExtension());
//#endregion
