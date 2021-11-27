//#region _mobGuiOpportunityExtension
function _mobGuiOpportunityExtension() {

    this.getYammerRefNode = function (context) {
        var opportunity = context.detailGui.entity;
        var idLevel = opportunity.get("CODLEVEL");
        //if the opportunity is not in the hierarchy, set a value in order to display the current account yammer feed
        if (XApp.isEmptyOrWhitespaceString(idLevel))
            idLevel = -1;

        context.codNode = opportunity.get("CODPARTY");
        context.hierLevel = idLevel;
    };

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        var descriptionParts = [doc.get("DESOPP")];
        var accountRow = XNavHelper.getFromMemoryCache("NAV_MOB_ACCOUNTS").findByKey(CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
        if (accountRow)
            descriptionParts.push(accountRow.getValueFromName("DESPARTY1"));

        return descriptionParts.join(" | ");
    };

    this.afterNewDocument = function (gui, options) {
        var self = this;
        var constraints = new XConstraint({
            attr: "CODPARTY",
            op: SqlRelationalOperator.Equal,
            value: options.codAccount
        });

        var opportunity = gui.getDocument();
        opportunity.set("CODOPP", XApp.newGUID());
        opportunity.set("CODDIV", UserContext.CodDiv);
        opportunity.set('DOCUMENTKEY', SalesForceEngine.buildOpportunityKey(opportunity.get("CODOPP"), opportunity.get("CODDIV")));

        opportunity.set('CODPARTY', options.codAccount);
        opportunity.set('CODHIER', options.codHier);
        opportunity.set('CODLEVEL', options.codLevel);

        opportunity.set("CODCUR", CommonEngine.getDefaultCurrency());
        opportunity.set("CODCUR2", UserContext.getConfigParam("OPP_COMPANY_DEF_CUR", "DOL"));
        WFEngine.initWorkflow(opportunity);

        var opportunityOwner = new XEntity({ entityName: 'OpportunityMember' });
        opportunityOwner.set("CODUSR", UserContext.CodUsr);
        opportunityOwner.set("CODDIV", opportunity.get("CODDIV"));
        opportunityOwner.set("CODOPP", opportunity.get("CODOPP"));
        opportunityOwner.set("FLGOWNER", true);

        opportunity.getSubEntityStore('OpportunityMember').add(opportunityOwner);

        self._possibleTeamMembers = [];
    };

    this.afterLoadDocument = function (gui) {
        var opportunity = gui.getDocument();
        //keep if the opportunity is win/lost at the first load
        opportunity.isWon = opportunity.get("FLGWIN");
        SalesForceEngine.addOpportunityInvoiceStore(opportunity);

        opportunity.calculateOpportunityAmounts();
        opportunity.calculateOpportunityBilledAmount(opportunity);
        opportunity.updateOpportunityArtInvoicesAmounts();
    };

    this.afterLoad = function (gui) {
        var self = this;
        var opportunity = gui.getDocument();

        SalesForceEngine.addInitialContactsStore(opportunity);
        self._loadPossibleTeamMembers(opportunity, XUI.showExceptionMsgBox, function (possibleMembers) {
            if (possibleMembers)
                self._possibleTeamMembers = possibleMembers;
            XUI.hideWait();
        });

        //keep wait popup open
        return true;
    };

    this.preCreateLink = function (context) {
        var entity = context.ctrl.entity,
            tabName = context.ctrl.tabName,
            linkName = context.linkRow.code;

        context.canceled = false;

        switch (tabName) {
            case "OTHEROPPORTUNITIES":
                context.linkRow.caption = linkName + ".NAV_MOB_OPPORTUNITIES";

                switch (linkName) {
                    case "NAV_MOB_OTHEROPPORTUNITIES":
                        context.linkRow.hcs.add("CODWFSTATEHARD", SqlRelationalOperator.NotEqual, SalesForceNameSpace.OpportunityWFHardState.Cancelled);
                        context.linkRow.hcs.add("CODOPP", SqlRelationalOperator.NotEqual, entity.get("CODOPP"));
                        break;
                    case "NAV_MOB_OTHERHIEROPPORTUNITIES":
                        if (XApp.isEmptyOrWhitespaceString(entity.get("CODLEVEL"))) {
                            context.canceled = true;
                            return;
                        }

                        context.linkRow.hcs = SalesExecutionEngine.buildHierOpportunitiesContr(entity.get("CODDIV"), entity.get("CODPARTY"), Number(entity.get("CODLEVEL")), true);
                        break;
                    default:
                        context.canceled = true; // remove all other links from Other Opportunities tab besides opportunity links
                        break;
                }
                break;
        }
    };

    this.onSaveDocument = function (gui, doc, onSuccess) {
        this._prepareOpportunityContactForSave(doc);
        onSuccess();
    };

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            var self = this;
            var guiDoc = gui.getDocument();

            var localExecutionQueue = new ExecutionQueue();
            var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

            var f = (function (document, onFailure, successCallback) {
                return function () {
                    this._updateNavMobOppMembers(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    this._updateOpportunitiesActivities(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    CommonEngine.updateNavMobAttachmentsCust(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    this._updateNavMobOpportunity(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            localExecutionQueue.pushHandler(this, onSuccess);

            localExecutionQueue.executeNext();

        } catch (e) {
            if (onFailure)
                onFailure(e);
            return;
        }
    };

    /* Syncs navigator with opportunity document*/
    this._updateNavMobOpportunity = function (doc, onFailure, onSuccess) {

        var navId = "NAV_MOB_OPPORTUNITIES";

        var nav = XNavHelper.getFromMemoryCache(navId),
            row = nav.findByKey(doc.get("DOCUMENTKEY")),
            newRow = false;

        if (!row) {
            newRow = true;
            row = nav.newRow();
        }
        this._updateOpportunityRowTemplateProps(doc, row, nav);
        //If row is new then append to the navigator
        if (newRow) {
            nav.Rows.unshift(row);
        }

        XApp.callCust("navCustomizer", navId, "afterUpdateRow", {
            "doc": doc,
            "navRow": row,
            "navId": navId
        });

        XNavHelper.updateCache(navId, nav, onFailure, onSuccess);
    };

    this._updateOpportunityRowTemplateProps = function (doc, row, nav) {

        SalesExecutionEngine._updateRowTemplateProps(doc, row, nav);

        var accountRow = XNavHelper.getFromMemoryCache("NAV_MOB_ACCOUNTS").findByKey(CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
        if (accountRow) {
            row.set("CODLEVEL0", accountRow.get("CODNODE0"));
            row.set("DESLEVEL0", accountRow.get("DESNODE0"));
            row.set("CODLEVEL1", accountRow.get("CODNODE1"));
            row.set("DESLEVEL1", accountRow.get("DESNODE1"));
            row.set("CODLEVEL2", accountRow.get("CODNODE2"));
            row.set("DESLEVEL2", accountRow.get("DESNODE2"));
            row.set("CODLEVEL3", accountRow.get("CODNODE3"));
            row.set("DESLEVEL3", accountRow.get("DESNODE3"));
        }
        var accountKey = doc.get("CODPARTY") + "|" + doc.get("CODDIV") + "|" + doc.get("CODHIER") + "|" + doc.get("CODLEVEL");
        row.set("ACCOUNTKEY", accountKey);
    };

    /* Updates NAV_MOB_OPPORTUNITYMEMBERS by taking into consideration added/modified/deleted rows from the OpportunityMember store */
    this._updateNavMobOppMembers = function (doc, onFailure, onSuccess) {
        var opportunityMembersStore = doc.getSubEntityStore("OpportunityMember");
        if (opportunityMembersStore && opportunityMembersStore.isModified()) {
            var oppMembersNav = XNavHelper.getFromMemoryCache("NAV_MOB_OPPORTUNITYMEMBERS"),
                oppMembersNavRows = oppMembersNav.filterByConstraints(new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODOPP", SqlRelationalOperator.Equal, doc.get("CODOPP"))
                    ]
                }));

            //modified + added
            opportunityMembersStore.each(function (opportunityMember) {
                var newRow = false;
                var row = Ext.Array.findBy(oppMembersNavRows, function (r) {
                    return r.get("CODUSR") == opportunityMember.get("CODUSR");
                });
                if (!row) {
                    newRow = true;
                    row = oppMembersNav.newRow();
                }
                //Update properties of navigator row
                SalesExecutionEngine._updateRowTemplateProps(opportunityMember, row, oppMembersNav);

                //If row is new then append to the navigator
                if (newRow) {
                    oppMembersNav.Rows.unshift(row);
                }
            });

            //deleted
            for (var i = 0; i < oppMembersNavRows.length; i++) {
                var current = oppMembersNavRows[i];
                var exists = opportunityMembersStore.findBy(function (r) {
                    return r.get("CODUSR") == current.get("CODUSR");
                });
                if (!exists) {
                    oppMembersNav.removeRow(current);
                }
            }

            XNavHelper.updateCache("NAV_MOB_OPPORTUNITYMEMBERS", oppMembersNav, onFailure, onSuccess);
        }
        else
            if (onSuccess)
                onSuccess();
    };

    /* Updates NAV_MOB_OPPORT_ACT by taking into consideration added/modified/deleted opportunity document*/
    this._updateOpportunitiesActivities = function (doc, onFailure, onSuccess) {
        if (doc && doc.isModified()) {
            var opportActNav = XNavHelper.getFromMemoryCache("NAV_MOB_OPPORT_ACT");
            //modified + added
            var newRow = false;
            var row = XNavHelper.getFromMemoryCache("NAV_MOB_OPPORT_ACT").findByKey(doc.get("DOCUMENTKEY"));
            if (!row) {
                newRow = true;
                row = opportActNav.newRow();
            }
            //Update properties of navigator row
            SalesExecutionEngine._updateRowTemplateProps(doc, row, opportActNav);
            row.setValueByName("DOCUMENTSOURCE", "Opportunity");
            row.setValueByName("DESTYPOPP", UserContext.decode("TYOPP", doc.get("CODTYPOPP")));
            var fdef = doc.getFieldDef("IDWFSTATE");
            if (fdef && fdef.qtabs) {
                var state = WFEngine.getActualWFState(doc);
                row.setValueByName("WFSTATETYPE", state.get("TYPE"));
                row.setValueByName("DESWFSTATE", UserContext.decode(fdef.qtabs, doc.get("IDWFSTATE")));
            }

            //If row is new then append to the navigator
            if (newRow) {
                var accountRow = XNavHelper.getFromMemoryCache("NAV_MOB_ACCOUNTS").findByKey(CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
                if (accountRow)
                    row.setValueByName("DESPARTY1", accountRow.get("DESPARTY1"));
                row.setValueByName("CODUSR", "");
                opportActNav.Rows.unshift(row);
            };

            XNavHelper.updateCache("NAV_MOB_OPPORT_ACT", opportActNav, onFailure, onSuccess);
        }
        else
            if (onSuccess)
                onSuccess();
    };

    this.afterNotifyLeave = function (context) {
        delete this._possibleTeamMembers;
    };

    this.afterSectionCreated = function (context) {
        var self = this;
        var opportunity = context.gui.getDocument();
        var sectionName = context.sectionConfig.attrs["caption"];

        try {
            switch (sectionName) {
                case "CONTACTS_GRID":
                    {
                        var initialContactsStore = opportunity.getSubEntityStore("InitialOpportunityContacts");
                        if (initialContactsStore) {
                            initialContactsStore.sortStore(function (record1, record2) {
                                //  selected records come first
                                var sort = (record1.get("SELECTED")).localeCompare(record2.get("SELECTED"));
                                if (sort != 0) {
                                    return -sort;
                                }
                                //  then sort by current CODPARTY 
                                if (record1.get("CODPARTY") == opportunity.get("CODPARTY") && record2.get("CODPARTY") != opportunity.get("CODPARTY")) {
                                    return -1;
                                }
                                if (record1.get("CODPARTY") != opportunity.get("CODPARTY") && record2.get("CODPARTY") == opportunity.get("CODPARTY")) {

                                    return 1;
                                }
                                sort = record1.get("CODLEVEL") - record2.get("CODLEVEL");
                                if (sort != 0) {
                                    return -sort;
                                }
                                sort = (record1.get("DESPARTY1")).localeCompare(record2.get("DESPARTY1"));
                                if (sort != 0) {
                                    return sort;
                                }
                                sort = (record1.get("DESPARTY2")).localeCompare(record2.get("DESPARTY2"));
                                if (sort != 0) {
                                    return sort;
                                }
                            });
                        }
                    }
                    break;
            }

        } catch (e) {
            XLog.logErr("Error in afterSectionCreated for section " + sectionName);
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onTabControlActiveItemChange = function (context) {

        if (context && context.newTab) {
            switch (context.newTab.tabName) {
                case "TURNOVER":
                    if (context.isAtFirstLoad) {
                        this._rebindInvGridStore(context.gui);
                    }
                    break;
                case "CONTACTS":
                    if (context.isAtFirstLoad) {
                        this._rebindContactsGridStore(context.gui);
                        var selectedStringSearch = UserContext.tryTranslate("[MOBGUIOPPORTUNITY.SELECTED]");
                        var contactTab = context.gui.tabCtrls.CONTACTS;
                        if (contactTab && contactTab.sections.CONTACTS_GRID) {
                            if (context.storeEntity.getSubEntityStore("InitialOpportunityContacts")) {
                                var selectedContact = context.storeEntity.getSubEntityStore("InitialOpportunityContacts").findBy(function (contact) {
                                    return contact.get("SELECTED") == selectedStringSearch;
                                });
                                //set search field
                                if (selectedContact) {
                                    var section = contactTab.sections.CONTACTS_GRID;
                                    section.searchField.setValue(selectedStringSearch);
                                    section.sectionToolbar.toggleSearchBar();
                                    contactTab.search.call(contactTab, section.store, selectedStringSearch, section.searchField.searchFields);
                                }
                            }
                        }
                    }
                    break;
            }
        }
    };

    this.setTabStatus = function (context) {
        switch (context.tabName) {
            /*
                Hide TURNOVER tab if the opportunity is lost (only when you load the UI first time)
                Turnover tab is not shown for opportunity in status Cancelled ( in 7.1 will be fixed with 70643 US)
            */
            case "TURNOVER":
                context.visible = context.visible && context.doc.isWon && context.doc.get("CODWFSTATEHARD") != SalesForceNameSpace.OpportunityWFHardState.Cancelled;
                break;
        }
    };

    this.getQtabsVoices = function (fieldContext) {
        var self = this,
            fieldName = fieldContext.fieldName,
            sectionContext = fieldContext.sectionContext;

        switch (sectionContext.entityName) {
            case "Opportunity":
                switch (fieldName) {
                    case "WINLOSTREASONS":
                        fieldContext.voices = this._filterWLReasons(sectionContext.entity);
                        break;

                    case "CODCOMPETITORWON":
                        var competitors = sectionContext.entity.getSubEntityStore("OpportunityCompetitor");
                        if (competitors.getCount() > 0) {
                            var voices = [];
                            competitors.toArray().forEach(function (item) {
                                var competitor = UserContext.decode("OPPCOMP", item.get("CODCOMPETITOR"));
                                voices.push({ value: item.get("CODCOMPETITOR"), text: competitor });
                            })
                            fieldContext.voices = voices;
                        }
                        break;
                }
                break;

            case "OpportunityMember":
                switch (fieldName) {
                    case "CODUSR":
                        var voices = [];
                        var selectedUser = sectionContext.entity.get("CODUSR");
                        var gui = sectionContext.gui;
                        var existingMembers = sectionContext.document.getSubEntityStore("OpportunityMember");
                        var possibleMembers = self._possibleTeamMembers;
                        Ext.Array.each(possibleMembers, function (codUsr) {
                            var existingMember = existingMembers.findBy(function (member) {
                                return member.get("CODUSR") == codUsr;
                            });
                            if (existingMember == null || selectedUser == codUsr) {
                                var desUsr = UserContext.decode("USRDIV", codUsr);
                                voices.push({ value: codUsr, text: desUsr });
                            }
                        });
                        fieldContext.voices = voices;
                        break;
                }
                break;

            case "OpportunityPartner":
                switch (fieldName) {
                    case "CODPARTNER":
                        var voices = [];
                        var selectedPartner = sectionContext.entity.get("CODPARTNER");
                        var existingPartners = sectionContext.document.getSubEntityStore("OpportunityPartner");

                        var decodes = UserContext.getDecodeEntriesOrdered(fieldContext.qtabs, true);
                        for (var i in decodes) {
                            var row = decodes[i];
                            var existingPartner = existingPartners.findBy(function (partner) {
                                return partner.get("CODPARTNER") == row.cod;
                            });
                            if (existingPartner == null || selectedPartner == row.cod) {
                                voices.push({ value: row.cod, text: row.des });
                            }
                        }
                        fieldContext.voices = voices;
                        break;
                }
                break;

            case "OpportunityCompetitor":
                switch (fieldName) {
                    case "CODCOMPETITOR":
                        var voices = [];
                        var selectedCompetitor = sectionContext.entity.get("CODCOMPETITOR");
                        var existingCompetitors = sectionContext.document.getSubEntityStore("OpportunityCompetitor");

                        var decodes = UserContext.getDecodeEntriesOrdered(fieldContext.qtabs, true);
                        for (var i in decodes) {
                            var row = decodes[i];
                            var existingCompetitor = existingCompetitors.findBy(function (competitor) {
                                return competitor.get("CODCOMPETITOR") == row.cod;
                            });
                            if (existingCompetitor == null || selectedCompetitor == row.cod) {
                                voices.push({ value: row.cod, text: row.des });
                            }
                        }
                        fieldContext.voices = voices;
                        break;
                }
                break;
        }
    };

    this.getSectionButtons = function (context) {
        var entityName = context.entityName;
        var tabName = context.detailContext.tabName;

        switch (entityName) {
            case "Opportunity":
                if (tabName == "PRODUCTS") {
                    var addBtn = context.buttons.find(function (btn) { return btn.code == "GRID.ADD"; });
                    if (addBtn) {
                        addBtn.iconCls = "guis_order_sectionmenu_add_30x17";
                    }
                }
                break;
        }
    };

    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (entityName) {
            case "Opportunity":
                switch (fieldName) {
                    case "CODPARTY":
                        var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                        field.setLabel(desField);
                        break;

                }
                break;

            case "OpportunityArticle":
                var opportunity = context.gui.getDocument();
                switch (fieldName) {
                    case "AMOUNT":
                        field.setLabel(opportunity.getOpportunityCurrencyDescription());
                        break;

                    case "AMOUNT2":
                        if (!XApp.isEmptyOrWhitespaceString(opportunity.get("CODCUR2"))) {
                            context.fieldConfig.attrs["mandatory"] = "true";
                            field.setLabel(opportunity.getCompanyCurrencyDescription());
                        }
                        break;
                }
                break;

            case "OpportunityArtInvoicePlan":
                switch (fieldName) {
                    case "PERCBILLEDAMOUNT":
                        var invoice = context.detailContext.entity;
                        var opportunityProduct = context.detailContext.parentSectionContext.entity;

                        field.config.maxValue = opportunityProduct.getRemainingPercentBilledAmount(invoice.getKey());
                        break;
                }
                break;
            case "OpportunityMember":
                switch (fieldName) {
                    case "FLGOWNER":
                        var member = context.detailContext.entity;
                        context.fieldConfig.attrs.editable = member.get("FLGOWNER") ? 'false' : 'true';
                        break;

                }
                break;
        }

        return field;
    };

    this.setFieldStatus = function (context) {
        var self = this,
            entityName = context.sectionContext.entityName,
            fieldName = context.fieldName;

        switch (entityName) {
            case "Opportunity":
                switch (fieldName) {
                    case "CODCOMPETITORWON":
                        context.editable = context.editable && !context.gui.entity.get("FLGWIN");
                        break;
                }
                break;

            case "OpportunityArticle":
                var opportunityProduct = context.sectionContext.entity;
                switch (fieldName) {
                    case "AMOUNT":
                        context.valid = self._isOpportunityCurrencyValid(opportunityProduct);
                        break;
                    case "AMOUNT2":
                        var opportunity = context.sectionContext.gui.getDocument();
                        context.valid = self._isCompanyCurrencyValid(opportunity, opportunityProduct);
                        context.editable = context.editable && opportunity.get("CODCUR2") != opportunity.get("CODCUR")
                        break;
                }
                break;

            case "OpportunityArtInvoicePlan":
                var invoice = context.sectionContext.entity;
                switch (fieldName) {
                    case "DTEBILLED":
                        context.editable = context.editable && !invoice.get("FLGGAPDAYS");
                        break;
                    case "NUMDAYSBILLED":
                        context.editable = context.editable && invoice.get("FLGGAPDAYS");
                        break;
                    case "PERCBILLEDAMOUNT":
                        context.valid = self._isPercentBilledAmountValdid(invoice);
                        break;
                }
                break;

            case "OpportunityMember":
                switch (fieldName) {
                    case "CODUSR":
                        context.editable = context.editable && context.gui.isNewDetail;
                        break;
                }
                break;

            case "OpportunityPartner":
                switch (fieldName) {
                    case "CODPARTNER":
                        context.editable = context.editable && context.gui.isNewDetail;
                        break;
                }
                break;

            case "OpportunityCompetitor":
                switch (fieldName) {
                    case "CODCOMPETITOR":
                        context.editable = context.editable && context.gui.isNewDetail;
                        break;
                }
                break;
        }
    };

    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {
        var self = this,
            context = ctrl.fieldContext.sectionContext,
            detailContext = context.detailContext,
            entityName = context.entityName,
            opportunity = context.gui.getDocument();

        switch (entityName) {
            case "Opportunity":
                switch (fieldName) {
                    case "FLGWIN":
                        detailContext.fields.WINLOSTREASONS.config.options = this._filterWLReasons(opportunity);
                        opportunity.set("CODCOMPETITORWON", "");
                        opportunity.set("CODWLREASONS", "");
                        XApp.exec(context.gui.reevaluateAnomalies, undefined, context.gui);
                        break;

                    case "DTEDECISION":
                        if (opportunity.get('DTEDECISION') != Constants.SM1MINDATE)
                            opportunity.set("CLOSEDAYS", Math.ceil((opportunity.get('DTEDECISION').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
                        break;

                    case "DTESTART":
                        opportunity.recalculateInvoicePlanBilledDates();
                        break;

                    case "CODCUR":
                        //copy amount into amount2  or reset the amount2                      
                        opportunity.getSubEntityStore("OpportunityArticle").each(function (product) {
                            if (opportunity.get("CODCUR") == opportunity.get("CODCUR2"))
                                product.set("AMOUNT2", product.get("AMOUNT"));
                            else
                                product.set("AMOUNT2", 0);
                        });
                        opportunity.calculateOpportunityAmounts();
                        var detailContext = context.gui.tabCtrls["PRODUCTS"];
                        if (detailContext) {
                            var gridPanel = detailContext.sections["OPPPRODGRID"];
                            if (gridPanel) {
                                var gridConfig = gridPanel.sectionContext.config.children[1];

                                for (i in gridConfig.children) {
                                    var columnName = gridConfig.children[i].attrs.name;
                                    if (columnName == "AMOUNT") {
                                        gridConfig.children[i].attrs.caption = opportunity.getOpportunityCurrencyDescription();
                                        break;
                                    }
                                }
                                detailContext.renderDetailGui(detailContext.mainPanel);
                            }
                        }
                        break;
                }
                break;

            case "OpportunityArticle":
                switch (fieldName) {
                    case "AMOUNT":
                        detailContext.entity.recalculateInvoicePlanBilledAmounts();
                        if (opportunity.get("CODCUR") == opportunity.get("CODCUR2")) {
                            detailContext.entity.set("AMOUNT2", newVal);
                        }

                        self._refreshInvoicePlan(detailContext);
                        break;
                }
                break;

            case "OpportunityArtInvoicePlan":
                var invoice = context.entity;
                switch (fieldName) {
                    case "FLGGAPDAYS":
                        if (invoice.get("FLGGAPDAYS")) {
                            invoice.set("DTEBILLED", opportunity.getInvoiceBilledDate(invoice));
                        } else {
                            // reset NUMDAYSBILLED
                            invoice.set("NUMDAYSBILLED", 0);
                        }
                        break;

                    case "NUMDAYSBILLED":
                        invoice.set("DTEBILLED", opportunity.getInvoiceBilledDate(invoice));
                        break;

                    case "PERCBILLEDAMOUNT":
                        invoice.updateInvoiceBilledAmount();
                        break;
                }
                break;
        }
    };

    this.beforeCallSelector = function (gui, selName, config) {
        var opportunity = gui.entity;
        var cons = null;

        switch (selName) {
            case "NAV_MOB_OPPORTUNITY_PROD":
                var allowDuplicatedProducts = parseInt(UserContext.getConfigParam("ALLOW_DUPLICATED_OPPORTUNITY_PRODUCTS", "0")) != 0 ? true : false;

                cons = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                        { attr: "CODDIV", op: SqlRelationalOperator.Equal, value: UserContext.CodDiv },
                        { attr: "CODSTATUS", op: SqlRelationalOperator.Equal, value: CommonNameSpace.ProductStatus.Active },
                        { attr: "DTEORDFROM", op: SqlRelationalOperator.LessOrEqual, value: XApp.today() },
                        { attr: "DTEORDTO", op: SqlRelationalOperator.GreaterOrEqual, value: XApp.today() }
                    ]
                });

                if (!allowDuplicatedProducts && opportunity.getSubEntityStore("OpportunityArticle").getCount() > 0) {
                    // exclude already added products
                    var existingProducts = [];
                    opportunity.getSubEntityStore("OpportunityArticle").each(function (product) {
                        if (existingProducts.indexOf(product.get("CODART") < 0))
                            existingProducts.push(product.get("CODART"));
                    });

                    cons.add("CODART", SqlRelationalOperator.NotIn, existingProducts);
                }

                break;
        }

        if (!cons)
            return;

        if (!config.hiddenConstraints) {
            config.hiddenConstraints = cons;
        } else {
            config.hiddenConstraints = new XConstraints({
                logicalOp: "AND",
                constraints: [config.hiddenConstraints, cons]
            });
        }
    };

    this.newDetail = function (context) {
        var newEntity = context.newEntity,
            parentEntity = context.parentEntity,
            entityName = context.detailEntityName;

        switch (entityName) {
            case "OpportunityArticle":
                // parentEntity is the oppotunity
                var selectedProd = context.selectorRow;
                newEntity.set("CODOPP", parentEntity.get("CODOPP"));
                newEntity.set("CODDIV", parentEntity.get("CODDIV"));
                newEntity.set("CODART", selectedProd.get("CODART"));
                newEntity.set("DESART", selectedProd.get("DESART"));
                newEntity.set("CODLINMER", selectedProd.get("CODLINMER"));
                newEntity.set("QTYORD", 1);
                newEntity.set("NUMROWARTICLE", parentEntity.getNextProductNumRow());
                newEntity.addDefaultInvoice(parentEntity.get("DTESTART"));
                break;

            case "OpportunityArtInvoicePlan":
                // parentEntity is the opportunityProduct
                newEntity.setParentEntity(parentEntity);
                newEntity.set("CODOPP", parentEntity.get("CODOPP"));
                newEntity.set("CODDIV", parentEntity.get("CODDIV"));
                newEntity.set("CODART", parentEntity.get("CODART"));
                newEntity.set("NUMROWARTICLE", parentEntity.get("NUMROWARTICLE"));
                newEntity.set("PERCBILLEDAMOUNT", parentEntity.getRemainingPercentBilledAmount());
                newEntity.set("NUMROWINVOICEPLAN", parentEntity.getNextInvoiceNumRow());
                newEntity.updateInvoiceBilledAmount();
                break;

            case "OpportunityMember":
                newEntity.set("CODOPP", parentEntity.get("CODOPP"));
                newEntity.set("CODUSR", "");
                break

            case "OpportunityPartner":
                newEntity.set("CODOPP", parentEntity.get("CODOPP"));
                break;

            case "OpportunityCompetitor":
                newEntity.set("CODOPP", parentEntity.get("CODOPP"));
                break
        }
    };

    this.afterCloseHandler = function (context) {
        var self = this,
            ctrl = context.ctrl,
            detailEntity = ctrl.entity,
            entityName = detailEntity.getEntityName();

        switch (entityName) {
            case "OpportunityArticle":
                var allowDuplicatedProducts = parseInt(UserContext.getConfigParam("ALLOW_DUPLICATED_OPPORTUNITY_PRODUCTS", "0")) != 0 ? true : false;
                var opportunity = ctrl.gui.getDocument();

                if (!allowDuplicatedProducts && ctrl.isNewDetail) {
                    var selector = ctrl.gui.selector;
                    var compareBy = "CODART";

                    selector.nav.filterOutCollection(opportunity.getSubEntityStore(entityName), compareBy, function () {
                        XUI.hideWait();
                    });
                }

                if (ctrl.isNewDetail || ctrl.isModified || context.opt.reason == "REMOVE") {
                    opportunity.calculateOpportunityAmounts();
                    self._refreshMainTab(ctrl.gui);
                }
                break;

            case "OpportunityArtInvoicePlan":
                if (context.opt.reason != "CANCEL") {
                    // when closing the invoice, refresh the add button
                    ctrl.parentSectionContext.detailContext.refreshGui();
                }
                break;

            case "OpportunityMember":
                if (context.opt.modified && detailEntity.get("FLGOWNER") == true) {
                    var memberGridStore = ctrl.parentSectionContext.detailContext.sections.TEAM_MEMBERS.grid.getStore()
                    self._removePreviousOwnerFlag(detailEntity, memberGridStore);
                }
                break;
        }
    };

    this.beforeChangingState = function (context) {
        var self = this;

        var isValid = self.validateDocument(context.gui);
        if (!isValid) {
            context.canceled = true;
        }
    };

    this.afterStateChanged = function (context) {
        var self = this;
        var opportunity = context.gui.getDocument();

        if (opportunity.get("DTEEND").getTime() == Constants.SM1MINDATE.getTime() && opportunity.get("CODWFSTATEHARD") == SalesForceNameSpace.OpportunityWFHardState.Closed) {
            opportunity.set(("DTEEND"), new Date());
        }

        self._refreshMainTab(context.gui);
        self._refreshInvolvedPartiesTab(context.gui);
    };


    this.setRemoveButtonsStatus = function (context) {
        var doc = context.gui.getDocument(),
            detailEntity = context.subGui.entity;

        switch (context.detailEntityName) {
            case "OpportunityInvoice":
                //opportunity invoice cannot be removed
                context.visible = false;
                break;
            case "OpportunityArticle":
            case "OpportunityPartner":
            case "OpportunityCompetitor":
                context.enabled = context.enabled && OpportunityHelper.checkOpportunityEditability(doc);
                break;
            case "OpportunityMember":
                context.enabled = context.enabled && OpportunityHelper.checkOpportunityEditability(doc)
                && detailEntity.get("FLGOWNER") != true;
                break;
        }
    };

    this.setNewButtonsStatus = function (context) {
        var opportunity = context.gui.docStore.getAt(0);
        var entityName = context.detailEntityName;

        switch (entityName) {
            case "OpportunityArticle":
            case "OpportunityMember":
            case "OpportunityPartner":
            case "OpportunityCompetitor":
                context.enabled = context.enabled && OpportunityHelper.checkOpportunityEditability(context.subGui.entity);
                break;
            case "OpportunityArtInvoicePlan":
                var opportunityProduct = context.subGui.entity;
                context.enabled = context.enabled && OpportunityHelper.checkOpportunityEditability(opportunity)
                && opportunityProduct.getRemainingPercentBilledAmount() > 0;
                break;
        }
    };

    this.beforeCreateGridColumn = function (fieldContext) {
        var self = this;
        var column = fieldContext.column;
        var entityName = fieldContext.sectionContext.entityName;

        switch (entityName) {
            case "Opportunity":
                var opportunity = fieldContext.sectionContext.document;

                switch (column.fieldName) {
                    case "DESART":
                        fieldContext.config.attrs.handler = (function (gui) {
                            return function (record) {
                                var viewRight = UserContext.checkRight("NAV_MOB_OPPORTUNITY_PROD", "NAV_MOB_OPPORTUNITY_PROD", "VIEW");
                                var editRight = UserContext.checkRight("NAV_MOB_OPPORTUNITY_PROD", "NAV_MOB_OPPORTUNITY_PROD", "EDIT");

                                if (viewRight || editRight) {
                                    gui._storeDocOnTempCache();
                                    XHistory.go({
                                        controller: app.getSM1Controllers().gui,
                                        action: "show",
                                        docKey: CommonEngine.buildProductKey(record.xrec.get("CODART"), record.xrec.get("CODDIV")),
                                        navId: "NAV_MOB_OPPORTUNITY_PROD",
                                        openMode: editRight ? "EDIT" : "VIEW"
                                    });
                                }
                            };
                        })(fieldContext.sectionContext.gui);
                        break;

                    case "QTYORD":
                    case "NUMDURATION":
                        column.minValue = 0;
                        break;

                    case "AMOUNT":
                        column.minValue = 0;
                        column.header = opportunity.getOpportunityCurrencyDescription();
                        break;

                    case "AMOUNT2":
                        column.minValue = 0;
                        if (!XApp.isEmptyOrWhitespaceString(opportunity.get("CODCUR2")))
                            column.header = opportunity.getCompanyCurrencyDescription();
                        column.editable = column.editable && !(opportunity.get("CODCUR") == opportunity.get("CODCUR2"));
                        break;
                }
                break;
        }
    };

    this.afterCreateGridColumn = function (fieldContext) {
        var self = this;
        var entityName = fieldContext.sectionContext.entityName;
        var column = fieldContext.fieldName;

        switch (entityName) {
            case "Opportunity":
                switch (column) {
                    case "AMOUNT":
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                context.isValid = self._isOpportunityCurrencyValid(context.rec.xrec);
                            };
                        })(fieldContext);
                        break;

                    case "AMOUNT2":
                        var opportunity = fieldContext.sectionContext.gui.getDocument();
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                context.isValid = self._isCompanyCurrencyValid(opportunity, context.rec.xrec);
                            };
                        })(fieldContext);
                        break;
                    case "CODROLE":
                        var opportunity = fieldContext.sectionContext.gui.getDocument();
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                if (context.rec.get("FLGSELECTED")) {
                                    context.isValid = !XApp.isEmptyOrWhitespaceString(context.rec.get("CODROLE"));
                                }
                            };
                        })(fieldContext);
                        break;
                }
                break;

            case "OpportunityArticle":
                switch (column) {
                    case "PERCBILLEDAMOUNT":
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                context.isValid = self._isPercentBilledAmountValdid(context.rec.xrec);
                            };
                        })(fieldContext);
                        break;

                    case "DTEBILLED":
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                context.isValid = self._isBilledDateValid(context.rec.xrec);
                            };
                        })(fieldContext);
                        break;

                    case "CODREASON":
                        fieldContext.column.validator = (function (fieldContext) {
                            return function (context) {
                                context.isValid = self._isInvoiceReasonValid(context.rec.xrec);
                            };
                        })(fieldContext);
                        break;
                }
                break;
        }
    };

    this.gridBeginEdit = function (context) {
        var entityName = context.rowEntity.getEntityName();
        var columnName = context.column.fieldName;

        switch (entityName) {
            case "OpportunityArtInvoicePlan":
                var opportunityProduct = context.detailContext.entity;
                var invoice = context.rowEntity;

                switch (columnName) {
                    case "NUMDAYSBILLED":
                        context.canceled = !invoice.get("FLGGAPDAYS");
                        break;

                    case "DTEBILLED":
                        context.canceled = invoice.get("FLGGAPDAYS");
                        break;

                    case "PERCBILLEDAMOUNT":
                        context.maxValue = opportunityProduct.getRemainingPercentBilledAmount(invoice.getKey());
                        break;
                }
                break;

            case "OpportunityContact":
                switch (columnName) {
                    case "CODROLE":
                    case "FLGPRIMARY":
                    case "DESNOTE":
                        context.canceled = !context.rowEntity.get("FLGSELECTED");
                        break;
                }
                break;

            case "OpportunityMember":
                switch (context.column.fieldName) {
                    case "FLGOWNER":
                        //the only way to remove the owner flag from a row should be to switch it to another user
                        context.canceled = context.canceled || (context.rowEntity.get("FLGOWNER") == true);
                        break;
                }
                break;
        }
    };

    this.onGridEndEditEnded = function (context) {
        var self = this,
            entityName = context.rowEntity.getEntityName(),
            columnName = context.fieldName,
            opportunity = context.gui.getDocument(),
            row = context.rowEntity;

        switch (entityName) {
            case "OpportunityArticle":
                switch (columnName) {
                    case "AMOUNT":
                        row.recalculateInvoicePlanBilledAmounts();
                        if (opportunity.get("CODCUR") == opportunity.get("CODCUR2")) {
                            row.set("AMOUNT2", context.newVal);
                            row.syncSenchaEntity(context.record);
                        }

                        opportunity.calculateOpportunityAmounts();
                        self._refreshMainTab(context.gui);
                        break;
                    case "AMOUNT2":
                        opportunity.calculateOpportunityAmounts();
                        self._refreshMainTab(context.gui);
                        break;
                }
                break;

            case "OpportunityArtInvoicePlan":
                switch (columnName) {
                    case "FLGGAPDAYS":
                        if (row.get("FLGGAPDAYS")) {
                            row.set("DTEBILLED", opportunity.getInvoiceBilledDate(row));
                        } else {
                            // reset NUMDAYSBILLED
                            row.set("NUMDAYSBILLED", 0);
                        }
                        break;

                    case "NUMDAYSBILLED":
                        row.set("DTEBILLED", opportunity.getInvoiceBilledDate(row));
                        break;

                    case "PERCBILLEDAMOUNT":
                        row.updateInvoiceBilledAmount();
                        context.detailContext.refreshGui();
                        break;
                }

                self._refreshInvoicePlan(context.detailContext);

                break;

            case "OpportunityContact":
                switch (columnName) {
                    case "FLGSELECTED":
                        var opportunityContactGridStore = context.detailContext.sections.CONTACTS_GRID.grid.getStore();
                        var currentRow = Ext.Array.findBy(opportunityContactGridStore.getData().items, function (item) {
                            return item.get("CODPER") == row.get("CODPER") && item.get("CODPARTY") == row.get("CODPARTY") && item.get("CODROLE") == row.get("CODROLE");
                        });
                        if (currentRow != null) {
                            currentContact = currentRow.xrec;
                            if (context.newVal == true) {
                                currentContact.set("SELECTED", UserContext.tryTranslate("[MOBGUIOPPORTUNITY.SELECTED]"));
                            }
                            else {
                                // reset fields
                                currentContact.set("SELECTED", "");
                                currentContact.set("CODROLE", "");
                                currentContact.set("FLGPRIMARY", false);
                                currentContact.set("DESNOTE", "");
                            }
                            currentContact.syncSenchaEntity(currentRow);
                        }
                        break;
                }
                break;

            case "OpportunityMember":
                switch (columnName) {
                    case "FLGOWNER":
                        if (context.newVal == true) {
                            var memberGridStore = context.detailContext.sections.TEAM_MEMBERS.grid.getStore();
                            this._removePreviousOwnerFlag(row, memberGridStore);
                        }
                        break;
                }
                break;
        }
    };

    this.validateEntity = function (detailContext) {
        var self = this,
            isValid = detailContext.detailValid,
            entity = detailContext.entity,
            entityName = detailContext.entityName;

        switch (entityName) {
            case "OpportunityArticle":
                var opportunityProduct = detailContext.entity;
                opportunityProduct.getSubEntityStore("OpportunityArtInvoicePlan").each(function (invoice) {
                    if (!self._isPercentBilledAmountValdid(invoice)
                        || !self._isBilledDateValid(invoice)
                        || !self._isInvoiceReasonValid(invoice)) {
                        isValid = false;
                        return;
                    }
                });
                break;

            case "OpportunityMember":
                isValid = isValid && !XApp.isEmptyOrWhitespaceString(entity.get("CODUSR"));
                break;

            case "OpportunityPartner":
                isValid = isValid && !XApp.isEmptyOrWhitespaceString(entity.get("CODPARTNER"));
                break;

            case "OpportunityCompetitor":
                isValid = isValid && !XApp.isEmptyOrWhitespaceString(entity.get("CODCOMPETITOR"));
                break;
        }

        return isValid;
    };

    this.validateDocument = function (gui) {
        var self = this,
            opportunity = gui.getDocument();

        delete gui.errorReports["INVALID_OPPORTUNITY_AMOUNT"];
        delete gui.errorReports["INVALID_COMPANY_AMOUNT"];
        delete gui.errorReports["INCOMPLETE_INVOICE_PLAN"];
        delete gui.errorReports["CODROLE_MANDATORY"];

        var isValid = (!gui.errorReports || Object.keys(gui.errorReports).length == 0);

        // validate invoice plan and opportunity products amount
        opportunity.getSubEntityStore("OpportunityArticle").each(function (opportunityProduct) {
            if (!self._isOpportunityCurrencyValid(opportunityProduct)) {
                self._addProductValidationErrorMessage(gui, "INVALID_OPPORTUNITY_AMOUNT", opportunityProduct);
                isValid = false;
            }
            if (!self._isCompanyCurrencyValid(opportunity, opportunityProduct)) {
                self._addProductValidationErrorMessage(gui, "INVALID_COMPANY_AMOUNT", opportunityProduct);
                isValid = false;
            }
            if (opportunityProduct.getRemainingPercentBilledAmount() > 0) {
                self._addProductValidationErrorMessage(gui, "INCOMPLETE_INVOICE_PLAN", opportunityProduct);
                isValid = false;
            }
        });

        var initialContactsStore = opportunity.getSubEntityStore("InitialOpportunityContacts");
        if (initialContactsStore) {
            initialContactsStore.each(function (opportunityContact) {
                if (opportunityContact.get("FLGSELECTED") && XApp.isEmptyOrWhitespaceString(opportunityContact.get("CODROLE"))) {
                    self._addContactValidationErrorMessage(gui, "CODROLE_MANDATORY", opportunityContact);
                    isValid = false;
                }
            })
        }

        return isValid;
    };

    //re-render main tab
    this._refreshMainTab = function (gui) {
        var detailContext = gui.tabCtrls["MAIN"];
        if (!detailContext)
            return;

        detailContext.layoutConfig = gui.callCust("getCustomLayout",
            [detailContext.originalLayout || detailContext.layoutConfig, detailContext]);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    this._refreshInvolvedPartiesTab = function (gui) {
        var detailContext = gui.tabCtrls["INVOLVED_PARTIES"];
        if (!detailContext)
            return;

        detailContext.layoutConfig = gui.callCust("getCustomLayout",
            [detailContext.originalLayout || detailContext.layoutConfig, detailContext]);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    //Write each selected CONTACT in Opportunity contact subentity
    this._prepareOpportunityContactForSave = function (opportunity) {
        var entityStore = opportunity.getSubEntityStore('OpportunityContact');
        var initialContactsStore = opportunity.getSubEntityStore('InitialOpportunityContacts');
        if (initialContactsStore) {
            entityStore.clear();

            for (var i = 0; i < opportunity.getSubEntityStore('InitialOpportunityContacts').getCount() ; i++) {
                var initialOpportunityContact = opportunity.getSubEntityStore('InitialOpportunityContacts').getAt(i);
                if (initialOpportunityContact.get("FLGSELECTED") == true) {
                    entityStore.add(initialOpportunityContact);
                }
            }
        }
    };

    this._filterWLReasons = function (entity) {
        var decTable = UserContext.getDecodeTable("OPPWLREASON");
        var voices = [];
        if (decTable != null) {
            for (var codTabRow in decTable) {
                voices.push({ value: decTable[codTabRow].cod, text: decTable[codTabRow].des });
            }
        }
        if (entity.get("FLGWIN")) {
            voices = voices.filter(function (row) {
                return row.value != "WLREA2";
            });
        }
        else {
            voices = voices.filter(function (row) {
                return row.value != "WLREA1";
            });
        }
        return voices;
    };

    this._isOpportunityCurrencyValid = function (opportunityProduct) {
        return opportunityProduct.get("AMOUNT") > 0;
    };

    this._isCompanyCurrencyValid = function (opportunity, opportunityProduct) {
        return XApp.isEmptyOrWhitespaceString(opportunity.get("CODCUR2")) || opportunityProduct.get("AMOUNT2") > 0;
    };

    this._isPercentBilledAmountValdid = function (invoice) {
        return invoice.get("PERCBILLEDAMOUNT") > 0;
    };

    this._isBilledDateValid = function (invoice) {
        return !XApp.isEmptyDate(invoice.get("DTEBILLED"));
    };

    this._isInvoiceReasonValid = function (invoice) {
        return !XApp.isEmptyOrWhitespaceString(invoice.get("CODREASON"));
    };

    this._addProductValidationErrorMessage = function (gui, errorGroup, opportunityProduct) {
        var errorReport;

        if (!gui.errorReports[errorGroup])
            gui.errorReports[errorGroup] = { caption: "" };

        errorReport = gui.errorReports[errorGroup];
        errorReport.caption += "<br/>"
                    + opportunityProduct.get("CODART") + " - " + opportunityProduct.get("DESART") + ": "
                    + UserContext.tryTranslate("[GUIOPPORTUNITY." + errorGroup + "]");
    };

    this._addContactValidationErrorMessage = function (gui, errorGroup, opportunityContact) {
        var errorReport;

        if (!gui.errorReports[errorGroup])
            gui.errorReports[errorGroup] = { caption: "" };

        errorReport = gui.errorReports[errorGroup];
        errorReport.caption += "<br/>"
                    + opportunityContact.get("DESPARTY1") + " - " + opportunityContact.get("DESPARTY2") + ": "
                    + UserContext.tryTranslate("[GUIOPPORTUNITY." + errorGroup + "]");
    };

    this._rebindContactsGridStore = function (gui) {
        try {
            var contactsGridStore = gui.tabCtrls.CONTACTS.sections.CONTACTS_GRID.store;
            var initialContactsStore = gui.getDocument().getSubEntityStore("InitialOpportunityContacts");
            if (contactsGridStore && initialContactsStore) {
                initialContactsStore.rebindSenchaStore(contactsGridStore);
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._refreshInvoicePlan = function (context) {
        var invoices = context.entity.getSubEntityStore("OpportunityArtInvoicePlan");
        if (context.sections["INVOICEPLAN"]) {
            var grid = context.sections["INVOICEPLAN"].grid;
            invoices.rebindSenchaStore(grid.getStore());
        }
    };

    this._rebindInvGridStore = function (gui) {
        try {
            var invGridStore = gui.tabCtrls.TURNOVER.sections.TURNOVER_GRID.store;
            if (invGridStore) {
                var opportunity = gui.getDocument();
                var invStore = opportunity.getSubEntityStore("OpportunityInvoice");
                invStore.rebindSenchaStore(invGridStore);
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._loadPossibleTeamMembers = function (opportunity, onFail, onSuccess) {
        var self = this;
        if (XApp.isOnline()) {
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesForce.OpportunityTouchEngine',
                    methodName: 'LoadPossibleTeamMembers',
                    data: {
                        accountCode: opportunity.get("CODPARTY"),
                        codDiv: opportunity.get("CODDIV")
                    }
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    XApp.exec(onFail, [e]);
                },
                function (response) {
                    XApp.exec(onSuccess, [response.possibleTeamMembers]);
                }
            );
        }
        else {
            XApp.exec(onSuccess, []);
        }
    };

    this._removePreviousOwnerFlag = function (newOwner, memberGridStore) {
        var previousOwnerRow = Ext.Array.findBy(memberGridStore.getData().items, function (item) {
            return item.get("FLGOWNER") == true && item.get("CODUSR") != newOwner.get("CODUSR");
        });
        if (previousOwnerRow != null) {
            var previousOwner = previousOwnerRow.xrec;
            previousOwner.set("FLGOWNER", false);
            previousOwner.syncSenchaEntity(previousOwnerRow);
        }
    };
};
XApp.registerGuiExtension("mobGuiOpportunity", new _mobGuiOpportunityExtension());
//#endregion
