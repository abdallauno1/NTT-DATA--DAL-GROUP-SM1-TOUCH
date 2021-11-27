//#region _mobGuiCustomerExtension 
function _mobGuiDoctorExtension() {

    this.preNewDocument = function (gui, options) {
        gui.docStore = new XStore({ entityName: 'Customer' });
        gui.docStore.add(options.newCustomerData.newCust);
        return false;
    };

    this.afterLoadDocument = function (gui) {
        var doc = gui.getDocument();
        var customerHierarchyRow = HierarchicalNodeManager.getCustomerHierarchyViewRow(doc.get("CODPARTY"));
        if (customerHierarchyRow != null) {
            st = doc.createSubEntityStore("HierarchicalNode", "CurrentHierarchicalNode");
            st.add(HierarchicalNodeManager.createHierarchicalNodeEntity(customerHierarchyRow));
        }
    };

    this.beforeUiRendering = function (context) {
        var doc = context.gui.getDocument();
        this._addWorkplacesStore(doc);
    };

    this.getMenuButtons = function (context) {
        var row = context.ctrl.openData.selectedNavRow;
        if (row) {
            var codParty = row.get("CODPARTY");
            var flgOrder = SalesForceEngine.getCustomerFlgOrder(codParty);

            if (flgOrder && UserContext.checkRight("NAV_MOB_DOCTORS", "NAV_MOB_DOCTORS", "NEWORDER")) {
                context.buttons.push(SalesForceEngine.getNewOrderButton(context.ctrl, "NAV_MOB_DOCTORS"));
            }

            // new visit button (creates a visit with the default activity for the main workplace)
            var custRow = row;
            if (!row.get("FLGPRIMARY")) {
                custRow = XNavHelper.getFromMemoryCache('NAV_MOB_DOCTORS').findByConstraints(new XConstraints({
                    logicalOp: "AND",
                    constraints: [{ attr: "CODPARTY", op: SqlRelationalOperator.Equal, value: row.get("CODPARTY") }]
                }));
            }

            // new visit button (creates a visit with the default activity)
            if (SalesExecutionEngine.canCreateVisitForCustomer(custRow, true, true)) {
                context.buttons.push(SalesExecutionEngine.getNewDefaultVisitButton(custRow, 'navs_visits_navbar_new_visit_23'));
            }

            // plan pending activities button (opens the pending activities navigator or the organizer in split view)
            if (SalesExecutionEngine.canCreateVisitForCustomer(custRow)) {
                context.buttons.push(SalesExecutionEngine.getPlanPendingActivitiesButton({ "CODPARTY": custRow.get("CODPARTY") }));
            }
        }
    },

    this.newDetail = function (context) {
        var newEntity = context.newEntity;
        var parentEntity = context.parentEntity;
        var selectorRow = context.selectorRow;
        switch (context.detailEntityName) {
            case 'CustomerPartyContact':
                var codParty = context.selectorKey.split("|")[1];
                newEntity.set("CODPARTY", parentEntity.get("CODPARTY"));
                newEntity.set("CODPER", codParty);
                CommonEngine.prepareNewCustomerPartyContact(parentEntity, newEntity);
                break;
            case 'WorkplaceAddr':
                newEntity.setParentEntity(parentEntity);
                newEntity.set("CODPARTY", context.selectorKey.split("|")[1]);
                newEntity.set("FULLDESPARTY1", selectorRow.get("FULLDESPARTY1"));
                newEntity.set("IDWPLEVEL", selectorRow.get("IDWPLEVEL"));
                newEntity.set("DESLOC1", selectorRow.get("DESLOC1"));
                newEntity.set("NUMPHONE1", selectorRow.get("NUMPHONE1"));
                newEntity.set("NUMFAX1", selectorRow.get("NUMFAX1"));
                newEntity.set("EMAIL1", selectorRow.get("EMAIL1"));
                newEntity.set("VALLATITUDE", selectorRow.get("VALLATITUDE"));
                newEntity.set("VALLONGITUDE", selectorRow.get("VALLONGITUDE"));
                break
            case 'CustomerPartyWeek':
                newEntity.set("CODPARTY", parentEntity.get("CODPARTY"));
                break;
        }
    };

    this.afterDetailChanged = function (context) {
        switch (context.entityName) {
            case "WorkplaceAddr":
                this._afterDoctorWorkplaceChanged(context.entity);
                this._rebindWPGridStore(context.gui);
                break;
            case "CustomerPartyWeek":
                CalendarTypeHelper.rebindCalendarTypeGridStore(context.gui);
                break;
        }
    };

    this.validateEntity = function (detailContext) {
        var entity = detailContext.entity;
        switch (detailContext.entityName) {
            case "CustomerPartyContact":
                return !XApp.isEmptyOrWhitespaceString(entity.get("CODROLE1"));
            case "CustomerPartyWeek":
                var msg = CalendarTypeHelper.isCalendarEntityValid(entity);
                if (!XApp.isEmptyOrWhitespaceString(msg)) {
                    XUI.showWarnOk({ msg: UserContext.tryTranslate(msg) });
                    return false;
                }
        }
        return true;
    };

    this.validateDocument = function (gui) {
        delete gui.errorReports["NOPRIMARYWP"];
        var doc = gui.getDocument();
        var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });
        CommonEngine.validateCustomerPartyContact(gui, cdiv);

        if (gui.errorReports.CODPARTY)
            gui.errorReports.CODPARTY.caption = UserContext.tryTranslate("[MOBGUIDOCTOR.CUSTOMER.CODPARTY]");
        if (gui.errorReports.CODTITLE)
            gui.errorReports.CODTITLE.caption = UserContext.tryTranslate("[MOBGUIDOCTOR.CUSTOMER.CODTITLE]");
        if (gui.errorReports.DESPARTY1)
            gui.errorReports.DESPARTY1.caption = UserContext.tryTranslate("[MOBGUIDOCTOR.CUSTOMER.DESPARTY1]");
        if (gui.errorReports.DESPARTY2)
            gui.errorReports.DESPARTY2.caption = UserContext.tryTranslate("[MOBGUIDOCTOR.CUSTOMER.DESPARTY2]");

        var mainWp = CommonEngine.getDoctorPrimaryWorkPlaceUsingEntity(doc);
        if (!mainWp) {
            gui.errorReports["NOPRIMARYWP"] = { caption: UserContext.tryTranslate("[MOBGUIDOCTOR.ERR_NOPRIMARYWP]") };
        }
    };

    this.beforeActivatingTabItem = function (context) {
        var activeItem = context.gui.tabPanel.getActiveItem();
        var mapTabName = "MAP";
        if (context.tab.tabName == mapTabName && (activeItem && activeItem.tabName != mapTabName)) {
            //clear before to avoid flickering of map controls
            XMap.getInstance().clear();
        }
    };

    this.onTabControlActiveItemChange = function (context) {
        if (context) {
            if (context.newTab) {
                switch (context.newTab.tabName) {
                    case "WORKPLACES":
                        if (context.isAtFirstLoad) {
                            this._rebindWPGridStore(context.gui);
                        }
                        break;
                    case "MAP":
                        if (!context.isAtFirstLoad) {
                            this._refreshMap(context.gui);
                        }
                        break;
                    case "HIERARCHIES":
                        if (context.isAtFirstLoad) {
                            context.gui.hierarchyView = new Customer.HierarchyPanel({
                                id: 'hierarchy_view_panel',
                                parentTab: context.newTab,
                                gui: context.gui
                            });
                            context.gui.hierarchyView.initializeControl();
                        }
                        break;
                    case "DOCTORLINKS":
                        if (!context.isAtFirstLoad && this._shouldRefreshLinkedNavigators) {
                            var detailContext = context.gui.tabCtrls[context.newTab.tabName];
                            if (!detailContext)
                                return;

                            detailContext.layoutConfig = this.getCustomLayout(
                                detailContext.originalLayout || detailContext.layoutConfig, detailContext);
                            detailContext.renderDetailGui(detailContext.mainPanel);
                            this._shouldRefreshLinkedNavigators = false;
                        }
                        break;
                }
            }
        }
    };

    this._rebindWPGridStore = function (gui) {
        try {
            var wpGridContext = this._getWpGridContext(gui);
            if (!wpGridContext.wpGrid) {
                return;
            }

            var wpGridStore = wpGridContext.wpGrid.getStore();
            if (wpGridStore) {
                gui.getDocument().getSubEntityStore("WorkplaceAddr").rebindSenchaStore(wpGridStore);
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._afterDoctorWorkplaceChanged = function (entity) {
        var doc = entity.getParentEntity();

        if (doc) {
            var workplaces = doc.getSubEntityStore("WorkplaceAddr");
            //only one primary workplace
            if (entity.get("FLGPRIMARY")) {
                for (var i = 0; i < workplaces.getCount() ; i++) {
                    var w = workplaces.getAt(i);
                    if (w.get("CODPARTY") == entity.get("CODPARTY"))
                        continue;
                    if (w.get("FLGPRIMARY"))
                        w.set("FLGPRIMARY", false);
                }
            }
            this._shouldRefreshLinkedNavigators = true;
        }
    };

    this.afterCloseHandler = function (context) {
        var ctrl = context.ctrl,
            gui = ctrl.gui,
            doctor = ctrl.gui.getDocument(),
            detailEntity = ctrl.entity,
            entityName = detailEntity.getEntityName(),
            selector = ctrl.gui.selector;
        var compareBy = "CODPARTY";

        switch (entityName) {
            case "WorkplaceAddr":
                if (context.ctrl.isNewDetail) {
                    selector.nav.filterOutCollection(doctor.getSubEntityStore(entityName), compareBy, function () {
                        XUI.hideWait();
                    });
                }
                if (context.opt.modified) {
                    this._afterDoctorWorkplaceChanged(detailEntity);
                    this._rebindWPGridStore(gui);
                }
                break;
            case "CustomerPartyWeek":
                if (context.opt.modified) {
                    CalendarTypeHelper.rebindCalendarTypeGridStore(gui);
                }
                break;
        }
    };

    this.preCreateLink = function (context) {

        var doctor = context.ctrl.entity;

        switch (context.linkRow.type) {
            case "NAVLINK":

                context.linkRow.caption = context.linkRow.code;

                switch (context.linkRow.code) {
                    case "NAV_MOB_PHARMACIES_DOCTORS":
                        var pharmacies = [];
                        var primaryWorkplace = CommonEngine.getDoctorPrimaryWorkPlace(doctor.get("CODPARTY"));
                        if (primaryWorkplace) {
                            pharmacies = CommonEngine.getPharmaciesLinkedToWpHierarchy(primaryWorkplace.get("CODCUSTDELIV"));
                        }

                        // setting constraints
                        context.linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [
                                        new XConstraint("CODPARTY", SqlRelationalOperator.In, pharmacies)
                            ]
                        });

                        break;

                    case "NAV_MOB_DOCTORS_PHARMAEVENT":
                        context.linkRow.hcs = SalesExecutionEngine.buildDoctorEventConstraints(doctor, "CODPARTY");
                        break;

                    case "NAV_MOB_VISITS_DOCTORS":
                        context.linkRow.implicitFilter = false;
                        break;
                }

                break;
        }
    };

    this._addWorkplacesStore = function (doc) {
        //create the store for the workplace grid
        var store = doc.createSubEntityStore("WorkplaceAddr");
        var doctorWorkPlaces = CommonEngine.getDoctorWorkPlaces(doc);

        for (var i = 0; i < doctorWorkPlaces.length; i++) {
            var doctorWorkPlace = doctorWorkPlaces[i],
                r = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(doctorWorkPlace.get("CODCUSTDELIV")));
            if (r) {
                store.add(new XEntity({
                    entityName: "WorkplaceAddr",
                    data: {
                        CODPARTY: r.get("CODPARTY"),
                        FULLDESPARTY1: r.get("FULLDESPARTY1"),
                        FLGPRIMARY: doctorWorkPlace.get("FLGPRIMARY"),
                        CODNATION: r.get("CODNATION"),
                        CODZIP: r.get("CODZIP"),
                        NUMPHONE1: r.get("NUMPHONE1"),
                        DESLOC1: r.get("DESLOC1"),
                        NUMFAX1: r.get("NUMFAX1"),
                        EMAIL1: r.get("EMAIL1"),
                        IDWPLEVEL: r.get("IDWPLEVEL"),
                        VALLATITUDE: r.get("VALLATITUDE"),
                        VALLONGITUDE: r.get("VALLONGITUDE"),
                        DESADDR1: r.get("DESADDR1"),
                        CODROLE: doctorWorkPlace.get("CODROLE")
                    }
                }));
            }
        }

        store.storeChanged = function (store, context) {
            //sync the pdvPdcStore
            var pdvPdcStore = CommonEngine.getCustomerPdvPdcStore(this.getParentEntity());
            if (context.oldItems && context.oldItems.length) {
                var doctorWorkPlaces = CommonEngine.getDoctorWorkPlaces(this.getParentEntity());
                for (var i = 0; i < context.oldItems.length ; i++) {
                    var toRemove = Ext.Array.findBy(doctorWorkPlaces, function (a) {
                        return a.get("CODCUSTDELIV") == context.oldItems[i].get("CODPARTY");
                    });
                    pdvPdcStore.remove(toRemove);
                }
            }
            else if (context.newItems && context.newItems.length) {
                for (var i = 0; i < context.newItems.length ; i++) {
                    pdvPdcStore.add(context.newItems[i].toPdvPdc());
                }
            }
        };
    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "CONTACTS":
            case "CALENDAR_GRID":
                sectionContext.entityName = 'CustomerDiv';
                var e = CommonEngine.ensureCustomerDiv(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "CONTACT_DETAILS":
                var e = new XEntity({ entityName: "CustomerAddr" });
                var row = XNavHelper.getNavRecord("NAV_MOB_CONTACTS", new XConstraint("CODPER", "=", sectionContext.entity.get("CODPER")));
                if (row) {
                    e.set("NUMPHONE1", row.get("NUM_TELEPHONE"));
                    e.set("NUMPHONE2", row.get("NUM_CELLPHONE"));
                    e.set("EMAIL1", row.get("EMAIL"));
                    e.set("WEBSITE2", row.get("SKYPEID"));
                    e.set("WEBSITE1", row.get("WEBPAGE"));
                    e.set("WEBSITE3", row.get("WEBSITE3"));
                    e.set("WEBSITE4", row.get("WEBSITE4"));
                    e.set("WEBSITE5", row.get("WEBSITE5"));
                    e.set("WEBSITE6", row.get("WEBSITE6"));
                }
                sectionContext.entity = e;
                break;
            case "WORKPLACE_GRID":
                //define sort
                sectionContext.document.getSubEntityStore("WorkplaceAddr").sortStore(function (w1, w2) {
                    if (w1.get("FLGPRIMARY") && !w2.get("FLGPRIMARY"))
                        return -1;
                    if (!w1.get("FLGPRIMARY") && w2.get("FLGPRIMARY"))
                        return 1;
                    if (w1.get("FULLDESPARTY1") < w2.get("FULLDESPARTY1"))
                        return -1;
                    if (w1.get("FULLDESPARTY1") > w2.get("FULLDESPARTY1"))
                        return 1;
                    return 0;
                });
                break;
            case "HIERARCHY_INFO":
                if (sectionContext.gui.hierarchyView)
                    sectionContext.gui.hierarchyView.ensureCustomerHierarchyNode(sectionContext);
                break;
        }
    };


    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.sectionContext.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (context.fieldConfig.attrs['name']) {
            case "CODPARTY":
            case "CODTITLE":
            case "DESPARTY1":
            case "DESPARTY2":
                var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                field.setLabel(desField);
                break;

        }

        if (entityName == 'WorkplaceAddr' && fieldName == 'FLGPRIMARY') {
            var workplaceAddr = context.detailContext.entity;
            context.fieldConfig.attrs.editable = workplaceAddr.get("FLGPRIMARY") ? 'false' : 'true';
        }

        return field;
    };

    this.afterSectionCreated = function (context) {
        var sectionConfig = context.sectionConfig;
        var sectionName = sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "WORKPLACES_MAP":
                var panel = context.panel;
                var mapPanel = this._createMap(context.gui.getDocument());
                panel.setDocked('');
                panel.mapPanel = panel.add(mapPanel);
                panel.setCls(context.panel.getCls() + ' sm1-routemapsection');
                break;
            case "CALENDAR_INFO":
                if (!context.detailGui.isNewDetail) {
                    if (sectionConfig.children.length == 1)
                        //hide calendar info section if the detail is opened from the grid and the section has only one field
                        context.panel.setHidden(true);
                }
                break;
        }
    };

    this.afterOpenSubDetail = function (context) {
        var entity = context.newEntity;

        switch (entity.getEntityName()) {
            case "CustomerPartyWeek":
                var sections = context.detailContext.sections;
                for (section in sections) {
                    switch (section) {
                        case "MON_SECTION":
                        case "TUE_SECTION":
                        case "WED_SECTION":
                        case "THU_SECTION":
                        case "FRI_SECTION":
                        case "SAT_SECTION":
                        case "SUN_SECTION":
                            var fields = sections[section].sectionContext.config.children;
                            var detailContext = context.detailContext;
                            CalendarTypeHelper.updateCalendarTimeIntervalCombo(fields, detailContext);

                            break;
                    }
                }

                if (!XApp.isEmptyOrWhitespaceString(entity.get("CODPLAN"))) {
                    var popup = context.detailContext._popup;
                    //update title
                    popup.setTitle(UserContext.decode("PLANS", entity.get("CODPLAN")));
                }
                break;
        }
    };

    this.createListForSection = function (sectionContext) {
        switch (sectionContext.config.attrs.detailObject) {
            case "CustomerPartyContact": {
                var store = sectionContext.listStore;
                CommonEngine.filterCustomerPartyContacts(store);
                break;
            }
        }
    };

    this.beforeRemoveDetail = function (context) {
        switch (context.detailEntity.getEntityName()) {
            case "CustomerPartyContact": {
                CommonEngine.removeCustomerPartyContact(context);
                return true;
            }
        }
        return false;
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        var detailContext = fieldContext.sectionContext.detailContext;
        switch (fieldContext.sectionContext.entityName) {
            case "CustomerPartyContact":
                switch (fieldName) {
                    case "CODSTATUS":
                        //remove the empty row
                        var voices = fieldContext.voices;
                        voices.splice(0, 1);
                        break;
                }
                break;
            case "CustomerPartyWeek":
                switch (fieldName) {
                    case "CODPLAN":
                        //existing calendar type values
                        var existingValues = detailContext.gui.tabCtrls.CALENDAR.sections.CALENDAR_GRID.grid.getStore();
                        if (existingValues.getCount() > 0)
                            fieldContext.voices = CalendarTypeHelper.getAvailableCalendarTypeValues(existingValues, fieldContext.voices);
                        break;
                }
                break;
        }
    };

    this.onEditEnding = function (ctrl, fieldName, newValue, oldValue) {
        var fieldContext = ctrl.fieldContext;
        var sectionContext = fieldContext.sectionContext;
        var entityName = sectionContext.entityName;
        var gui = sectionContext.gui;

        switch (entityName) {
            case "HierarchicalNode":
                if (gui.hierarchyView)
                    gui.hierarchyView.handleFieldEditEnding(ctrl, fieldName, newValue, oldValue);
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

        switch (fieldName) {
            case "FLGPRIMARY":
                CommonEngine.updateCustomerPartyContactFlgPrimary(sectionContext);
                break;
            case "CODPLAN":
                CalendarTypeHelper.clearCalendarTypeFields(entity);
                //re-render calendar type detail popup
                detailContext.layoutConfig = this.getCustomLayout(
                    detailContext.originalLayout || detailContext.layoutConfig, detailContext);
                detailContext.renderDetailGui(detailContext.mainPanel);
                break;
            default:
                if (fieldName.startsWith("STARTEVENING") || fieldName.startsWith("ENDEVENING") ||
                    fieldName.startsWith("START") || fieldName.startsWith("END"))
                    CalendarTypeHelper.updateCalendarTimeIntervalCombo(sectionContext.config.children, detailContext);
        }
    };

    this.getCustomLayout = function (l, detailContext) {
        if (!detailContext.originalLayout)
            detailContext.originalLayout = l;
        var layout = Ext.clone(detailContext.originalLayout);

        if (layout.children[0].attrs.caption == 'CALENDAR_INFO')
            return CalendarTypeHelper.getCalendarInfoDetailsLayout(layout, detailContext);
        return layout;
    };

    this.gridBeginEdit = function (context) {
        var entity = context.rowEntity;
        switch (entity.getEntityName()) {
            case "WorkplaceAddr":
                switch (context.column.fieldName) {
                    case "FLGPRIMARY":
                        //if the row was already set as primary, keep it
                        context.canceled = context.canceled || (entity.get("FLGPRIMARY") == true);
                        break;
                }
        }
    };

    this.onGridEndEditEnded = function (context) {
        var entity = context.rowEntity;
        var fieldName = context.fieldName;
        try {
            switch (entity.getEntityName()) {
                case "WorkplaceAddr":
                    switch (fieldName) {
                        case "FLGPRIMARY":
                            if (context.newVal == true) {
                                this._afterDoctorWorkplaceChanged(entity);
                                this._rebindWPGridStore(context.gui);
                            }
                            break;
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        switch (entity.getEntityName()) {
            case "CustomerPartyWeek":
                switch (fieldName) {
                    case "CODPLAN":
                        //hide calendar info type if the detail is opened from the grid
                        context.visible = context.visible && (!context.gui.isNewDetail ? false : true);
                        break;
                    default:
                        if (fieldName.startsWith("STARTEVENING") || fieldName.startsWith("ENDEVENING") ||
                               fieldName.startsWith("START") || fieldName.startsWith("END")) {
                            context.valid = context.valid && CalendarTypeHelper.isCalendarTypeFieldValueValid(fieldName, context);
                        }
                        break;
                }
                break;
        }
    };

    this.setNavigateButtonsStatus = function (context) {
        if (context.subGui.isNewDetail) {
            context.visible = false;
        }
    },

    this.setRemoveButtonsStatus = function (context) {
        var doc = context.gui.getDocument();
        var detailEntity = context.subGui.entity;
        switch (context.detailEntityName) {
            case "WorkplaceAddr":
                context.enabled = !(detailEntity.get("FLGPRIMARY") == true);
                break;
        }
    };

    this.beforeGuiCreated = function (gui) {
        var doc = gui.getDocument();

        var backFromNewDocument = gui.openData.backFromNewDocument;
        if (backFromNewDocument) {
            if (backFromNewDocument.guiName.toUpperCase() == "MOBGUICONTACT") {
                CommonEngine.backFromMobGuiContact(gui, backFromNewDocument);
            }
        }
    };

    this.validateField = function (context) {
        switch (context.field.fieldContext.sectionContext.entityName) {
            case "CustomerPartyContact":
                switch (context.field.config.name) {
                    case "DTEFROM":
                        var dteTo = context.field.fieldContext.sectionContext.detailContext.fields.DTETO.getValue();
                        if (dteTo.getTime() < context.newVal.getTime()) {
                            context.newVal = context.oldVal;
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.INVALID_DATE]") });
                        }
                        break;
                    case "DTETO":
                        var dteFrom = context.field.fieldContext.sectionContext.detailContext.fields.DTEFROM.getValue();
                        if (context.newVal.getTime() < dteFrom.getTime()) {
                            context.newVal = context.oldVal;
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.INVALID_DATE]") });
                        }
                        break;
                }
        }
    };

    this.beforeCallSelector = function (gui, selName, config) {
        var detailEntityName = config.detailObjectName;
        var doc = gui.entity;
        var cons = null;
        switch (selName) {
            case "NAV_MOB_CONTACTS":
                CommonEngine.filterCustomerPartyContactSelector(gui, selName, config);
                break;
            case "NAV_MOB_WORKPLACES":
                cons = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                           new XConstraint("CODPARTY", SqlRelationalOperator.NotIn, Ext.Array.map(doc.getSubEntityStore("WorkplaceAddr").toArray(), function (wp) {
                               return wp.get("CODPARTY");
                           })),
                        new XConstraint("CODSTATUS", SqlRelationalOperator.NotEqual, "9")
                    ]
                });
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

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            var self = this;
            var guiDoc = gui.getDocument();
            var doctorWorkPlaces = CommonEngine.getDoctorWorkPlacesRows(guiDoc.get("CODPARTY"));

            CommonEngine.updateContactsNavigator(guiDoc);

            var localExecutionQueue = new ExecutionQueue();
            var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

            var f = (function (document, navigator, onFailure, successCallback) {
                return function () {
                    this._updateNavMobDoctorsWorkPlaces(document, navigator, onFailure, successCallback);
                };
            })(guiDoc, "NAV_MOB_DOCTORS", onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, navigator, onFailure, successCallback) {
                return function () {
                    this._updateNavMobDoctorsWorkPlaces(document, navigator, onFailure, successCallback);
                };
            })(guiDoc, "NAV_MOB_DOCTORS_WORKPLACES", onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    CommonEngine.updateNavMobPendingAct(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    CommonEngine.updateNavMobPdvPdc(document, onFailure, successCallback);
                };
            })(guiDoc, onFailure, successCallback);
            localExecutionQueue.pushHandler(self, f);

            f = (function (document, onFailure, successCallback) {
                return function () {
                    CommonEngine.updateNavMobAttachmentsCust(document, onFailure, successCallback);
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

    /* Syncs NAV_MOB_DOCTORS/NAV_MOB_DOCTORS_WORKPLACES with doctor document*/
    this._updateNavMobDoctorsWorkPlaces = function (customerDoc, navId, onFailure, onSuccess) {
        var doctorsWorkPlacesNav = XNavHelper.getFromMemoryCache(navId);
        if (!doctorsWorkPlacesNav || !(navId == "NAV_MOB_DOCTORS" || navId == "NAV_MOB_DOCTORS_WORKPLACES"))
            onSuccess();

        var doctorsWorkPlacesNavRows,
            doctorWorkPlaces = [],
            doctorMainWp = CommonEngine.getDoctorPrimaryWorkPlaceUsingEntity(customerDoc),
            doctorMainWpRow = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(doctorMainWp.get("CODCUSTDELIV")));

        if (navId == "NAV_MOB_DOCTORS") {
            doctorsWorkPlacesNavRows = doctorsWorkPlacesNav.filterByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("CODPARTY", SqlRelationalOperator.Equal, customerDoc.get("CODPARTY")),
                    new XConstraint("FLGPRIMARY", SqlRelationalOperator.Equal, -1)
                ]
            }));
            doctorWorkPlaces.push(doctorMainWp);
        }
        else {
            doctorsWorkPlacesNavRows = doctorsWorkPlacesNav.filterByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("CODPARTY", SqlRelationalOperator.Equal, customerDoc.get("CODPARTY"))
                ]
            }));
            doctorWorkPlaces = CommonEngine.getDoctorWorkPlacesRows(customerDoc.get("CODPARTY"));
        }

        for (var i = 0; i < doctorWorkPlaces.length; i++) {
            var doctorWorkPlace = doctorWorkPlaces[i];
            var newRow = false;
            var row = Ext.Array.findBy(doctorsWorkPlacesNavRows, function (r) {
                return r.get("WPCODPARTY") == doctorWorkPlace.get("CODCUSTDELIV");
            });
            if (!row) {
                newRow = true;
                row = doctorsWorkPlacesNav.newRow();
            }
            var doctorWpRow = doctorWorkPlace.get("FLGPRIMARY") ? doctorMainWpRow : XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(doctorWorkPlace.get("CODCUSTDELIV")));
            this._updateDoctorRowTemplateProps(customerDoc, row, doctorsWorkPlacesNav, doctorWpRow, doctorMainWpRow);

            //If row is new then append to the navigator
            if (newRow) {
                row.set("YTDSTUDIES", 0);

                var oldRow = XNavHelper.getFromMemoryCache("NAV_MOB_DOCTORS").findByConstraints(new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                        new XConstraint("CODPARTY", SqlRelationalOperator.Equal, row.get('CODPARTY')),
                        new XConstraint("FLGPRIMARY", SqlRelationalOperator.Equal, -1)
                    ]
                }));

                var idx = -1;
                if (oldRow) {
                    row.set("YTDSTUDIES", oldRow.get("YTDSTUDIES"));
                    idx = doctorsWorkPlacesNav.Rows.indexOf(oldRow);
                    doctorsWorkPlacesNav.removeRow(oldRow);
                }

                if (idx > -1) {
                    doctorsWorkPlacesNav.Rows.splice(idx, 0, row);
                    if (doctorsWorkPlacesNav.ColumnsMap["DOCUMENTKEY"])
                        doctorsWorkPlacesNav.KeyMap[row.get("DOCUMENTKEY")] = row;
                } else {
                    // remove empty row added when UI is opened and add the new row at top of navigator list
                    doctorsWorkPlacesNav.removeRow(XNavHelper.getFromMemoryCache("NAV_MOB_DOCTORS").findByKey(CommonEngine.buildCustomerKey(row.get('CODPARTY'))));
                    doctorsWorkPlacesNav.unshiftRow(row);
                }
            }
        }

        //deleted
        for (var i = 0; i < doctorsWorkPlacesNavRows.length; i++) {
            var current = doctorsWorkPlacesNavRows[i];
            var exists = Ext.Array.findBy(doctorWorkPlaces, (function (r) {
                return r.get("CODCUSTDELIV") == current.get("WPCODPARTY");
            }));
            if (!exists) {
                doctorsWorkPlacesNav.removeRow(current);
            }
        }
        XNavHelper.updateCache(navId, doctorsWorkPlacesNav, onFailure, onSuccess);
    };

    /* Syncs doctor nav row with doctor document */
    this._updateDoctorRowTemplateProps = function (customerDoc, navRow, nav, wp, mainWp) {
        SalesExecutionEngine._updateRowTemplateProps(customerDoc, navRow, nav);

        navRow.set("DESTITLE", UserContext.decode("TITLEPER", customerDoc.get("CODTITLE")));
        navRow.set("DESDOCTORSPEC1", UserContext.decode("DOCTSPEC", customerDoc.get("CODDOCTORSPEC1")));
        navRow.set("DESDOCTORSPEC2", UserContext.decode("DOCTSPEC", customerDoc.get("CODDOCTORSPEC2")));
        navRow.set("DESDOCTORSPEC3", UserContext.decode("DOCTSPEC", customerDoc.get("CODDOCTORSPEC3")));
        navRow.set("DESDOCTORSPEC4", UserContext.decode("DOCTSPEC", customerDoc.get("CODDOCTORSPEC4")));
        navRow.set("DESDOCTORSPEC5", UserContext.decode("DOCTSPEC", customerDoc.get("CODDOCTORSPEC5")));
        navRow.set("DESDOCTORQUAL1", UserContext.decode("DOCTQUAL", customerDoc.get("CODDOCTORQUAL1")));
        navRow.set("DESDOCTORQUAL2", UserContext.decode("DOCTQUAL", customerDoc.get("CODDOCTORQUAL2")));
        navRow.set("DESDOCTORQUAL3", UserContext.decode("DOCTQUAL", customerDoc.get("CODDOCTORQUAL3")));
        navRow.set("DESDOCTORQUAL4", UserContext.decode("DOCTQUAL", customerDoc.get("CODDOCTORQUAL4")));
        navRow.set("DESDOCTORQUAL5", UserContext.decode("DOCTQUAL", customerDoc.get("CODDOCTORQUAL5")));

        var customerDiv = customerDoc.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });
        navRow.set("IMPORTANCE", UserContext.decode("IMP", customerDiv.get("CODABC")));
        navRow.set("DESSTATUS", UserContext.decode("STCUS", customerDiv.get("CODSTATUS")));
        var userRow = CommonEngine.getUserNavRow(customerDiv.get("CODUSR1"), customerDiv.get("CODDIV"), null);
        if (XApp.isEmptyOrWhitespaceString(navRow.getValueFromName("DESUSR")))
            navRow.setValueByName("DESUSR", UserContext.DesUsr);

        if (wp) {
            var customerPdvPdc = customerDiv.getSubEntityStore('CustomerPdvPdc').findBy(function (r) {
                return r.get("CODCUSTDELIV") == wp.get("CODPARTY");
            });
            if (customerPdvPdc)
                navRow.set("DESROLE", UserContext.decode("CUSTROLES", customerPdvPdc.get("CODROLE")));

            navRow.set("WPCODPARTY", wp.get("CODPARTY"));
            navRow.set("WPDESPARTY1", wp.get("DESPARTY1"));
            navRow.set("WPROOTDESPARTY1", wp.get("DESPARTYLEV4"));
            navRow.set("WPDESADDR1", wp.get("ADDRESS"));
            navRow.set("WPDESLOC1", wp.get("DESLOC1"));
            navRow.set("WPCODZIP", wp.get("CODZIP"));
            navRow.set("WPCODNATION", wp.get("CODNATION"));

            if (mainWp) {
                navRow.set("MAINWPCODPARTY", mainWp.get("CODPARTY"));
                navRow.set("FLGPRIMARY", wp.get("CODPARTY") == mainWp.get("CODPARTY"));
            }
        }
    };

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";
        var descriptionParts = [];

        var de = UserContext.getDecodeEntry("TITLEPER", doc.get("CODTITLE"));
        var title = de ? de.des : "";

        descriptionParts.push(title);
        descriptionParts.push(doc.get("DESPARTY1"));
        descriptionParts.push(doc.get("DESPARTY2"));
        descriptionParts.push("(" + doc.get("CODPARTY") + ")");

        var mainWP = CommonEngine.getDoctorPrimaryWorkPlaceRow(doc.get("CODPARTY"));
        if (mainWP) {
            descriptionParts.push("| " + mainWP.get("DESLOC1"));
        }

        return descriptionParts.join(" ");
    };

    this.beforeCreateGridColumn = function (fieldContext) {
        var self = this;
        var entityName = fieldContext.sectionContext.entityName;
        var fieldName = fieldContext.column.fieldName;

        switch (fieldName) {
            case "CODPARTY":
                if (fieldContext.config.attrs["presType"] == 'hyperlink') {
                    fieldContext.config.attrs.handler = (function (gui) {
                        return function (record) {

                            var navId = "NAV_MOB_WORKPLACES";
                            var wpViewRight = UserContext.checkRight(navId, navId, 'VIEW');
                            var wpEditRight = UserContext.checkRight(navId, navId, 'EDIT');

                            if (wpViewRight || wpEditRight) {

                                gui._storeDocOnTempCache();
                                XHistory.go({
                                    controller: app.getSM1Controllers().gui,
                                    action: 'show',
                                    docKey: CommonEngine.buildCustomerKey(record.xrec.get("CODPARTY")),
                                    navId: navId,
                                    openMode: wpEditRight ? 'EDIT' : 'VIEW'
                                });
                            }
                        };
                    })(fieldContext.sectionContext.gui);
                }
                break;
        }
    };

    this._refreshMap = function (gui) {
        var self = this;
        var detailContext = gui.tabCtrls["MAP"];
        if (!detailContext)
            return;
        var mapPanel = detailContext.sections["WORKPLACES_MAP"].mapPanel;
        self._fillMap(mapPanel, XMap.getInstance(), gui.getDocument());
    };

    this._createMap = function (document) {
        var self = this;
        var p = new Ext.Panel({
            flex: 1,
            layout: 'fit'
        });
        if (!google || !google.maps || !XApp.isOnline())
            return p;

        var map = XMap.getInstance(true);
        p.on({
            painted: function () {
                self._fillMap(p, map, document);
            }
        });
        p.add(map);
        return p;
    };

    this._fillMap = function (panel, map, document) {
        var self = this;
        if (XApp.isOnline()) {
            setTimeout(function () {
                XUI.showWait();
                map.clear();
                var fitButton = new XButton({
                    cls: 'sm1-bt sm1-bt-distance',
                    text: UserContext.tryTranslate("[MOB.FITMAP]"),
                    SM1Listeners: {
                        onPress: function () {
                            map.fitBounds();
                        }
                    }
                });

                map.addControlToGoogleMap(fitButton, google.maps.ControlPosition.TOP_RIGHT);
                map.addLegendControltoGoogleMap([CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.DOCTMAINWP), CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.DOCTOTHERWP)], google.maps.ControlPosition.LEFT_TOP);
                self._renderWorkPlacesOnMap(document.getSubEntityStore("WorkplaceAddr"));

                map.fitIfBounded();
                XUI.hideWait();
                panel.show();
            }, 100);
        } else
            panel.hide();
    };

    this._renderWorkPlacesOnMap = function (workPlacesStore) {
        var self = this,
            mainWpMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.DOCTMAINWP),
            otherWpMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.DOCTOTHERWP);

        workPlacesStore.each(function (wp) {
            var valLat = wp.get("VALLATITUDE"),
                valLong = wp.get("VALLONGITUDE");
            if (MapServices.areValidCoordinates(valLat, valLong)) {
                var gpos = new google.maps.LatLng(valLat, valLong),
                    markerIcon = wp.get("FLGPRIMARY") ? mainWpMarker.icon : otherWpMarker.icon;

                XMap.getInstance().createMarker(gpos, null, null, markerIcon, function (wp) {
                    return function (marker) {
                        self._onWorkplaceMarkerClick(marker, wp);
                    }
                }(wp));
                XMap.getInstance().extendBounds(gpos);
            }
        });
    };

    this._onWorkplaceMarkerClick = function (marker, workplace) {
        var navId = "NAV_MOB_WORKPLACES";
        var workplaceViewRight = UserContext.checkRight(navId, navId, 'VIEW');
        var workplaceEditRight = UserContext.checkRight(navId, navId, 'EDIT');
        var mainPanel = new Ext.Panel({
            layout: {
                type: 'vbox'
            },
            cls: 'sm1-pharma-cust-balloon',
            items: [
                {
                    xtype: 'component',
                    html: workplace.get("FULLDESPARTY1"),
                    cls: 'sm1-pharma-cust-balloon-title'
                },
                {
                    xtype: 'component',
                    html: workplace.get("DESADDR1") + " " + workplace.get("DESLOC1"),
                },
                {
                    xtype: 'xbutton',
                    cls: 'sm1-pharma-cust-balloon-btn',
                    text: UserContext.tryTranslate("[MOB.OPEN]"),
                    hidden: !(workplaceViewRight || workplaceEditRight),
                    SM1Listeners: {
                        onPress: function () {
                            XMap.cleanMarkerPopup();
                            XHistory.go({
                                controller: app.getSM1Controllers().gui,
                                action: 'show',
                                docKey: CommonEngine.buildCustomerKey(workplace.get("CODPARTY")),
                                navId: navId,
                                openMode: workplaceEditRight ? 'EDIT' : 'VIEW'
                            });
                        }
                    }
                }
            ]
        });
        XMap.showMarkerPopup(marker, mainPanel);
    };

    this._getWpGridContext = function (gui) {
        //if the ui is customized, allow to chose another location for the workplaces grid
        var context = {
            gui: gui,
            wpGrid: null
        };
        try {
            XApp.callCust("guiCustomizer", "mobGuiDoctor", 'getWpGridContext', context);
            if (!context.wpGrid && gui.tabCtrls.WORKPLACES && gui.tabCtrls.WORKPLACES.sections.WORKPLACE_GRID) {
                //default grid from workplaces tab
                context.wpGrid = gui.tabCtrls.WORKPLACES.sections.WORKPLACE_GRID.grid;
            }
            return context;
        } catch (e) {
            return context;
        }
    };

    this.beforeNotifyLeave = function (context) {
        //cleanup map panel
        var tabCtrls = context.ctrl.tabCtrls;
        if (tabCtrls && tabCtrls["MAP"]) {
            var mapSection = tabCtrls["MAP"].sections["WORKPLACES_MAP"];
            if (mapSection) {
                delete mapSection.mapPanel;
            }
        }
        delete this._shouldRefreshLinkedNavigators;
    };

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;
        if (gui.hierarchyView)
            gui.hierarchyView.destroy();
    };
}
XApp.registerGuiExtension("mobGuiDoctor", new _mobGuiDoctorExtension());
//#endregion
