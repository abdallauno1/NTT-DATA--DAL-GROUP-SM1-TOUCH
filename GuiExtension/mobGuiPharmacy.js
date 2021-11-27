//#region _mobGuiPharmacyExtension
function _mobGuiPharmacyExtension() {

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

    this.getMenuButtons = function (context) {
        var row = context.ctrl.openData.selectedNavRow;
        if (row) {
            var codParty = row.get("CODPARTY");
            var flgOrder = SalesForceEngine.getCustomerFlgOrder(codParty);

            if (flgOrder && UserContext.checkRight("NAV_MOB_PHARMACIES", "NAV_MOB_PHARMACIES", "NEWORDER")) {
                context.buttons.push(SalesForceEngine.getNewOrderButton(context.ctrl, "NAV_MOB_PHARMACIES"));
            }

            // new visit button (creates a visit with the default activity)
            if (SalesExecutionEngine.canCreateVisitForCustomer(row, true)) {
                context.buttons.push(SalesExecutionEngine.getNewDefaultVisitButton(row, 'navs_visits_navbar_new_visit_23'));
            }

            // plan pending activities button (opens the pending activities navigator or the organizer in split view)
            if (SalesExecutionEngine.canCreateVisitForCustomer(row)) {
                context.buttons.push(SalesExecutionEngine.getPlanPendingActivitiesButton({ "CODPARTY": row.get("CODPARTY") }));
            }
        }

        this._geocodeManager = new CustomerUiGeocodeManager(context.ctrl);
        this.geoLocateBtn = this._geocodeManager.buildGeocodeCustAddrBtnCfg('1');
        context.buttons.push(this.geoLocateBtn);
        context.buttons.push(this._geocodeManager.buildGeocodeCurrPosBtnCfg('1'));
    };

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
            case 'PhWorkPlace':
                newEntity.setParentEntity(parentEntity);
                newEntity.set("CODPARTY", selectorRow.get("CODPARTY"));
                newEntity.set("FULLDESPARTY1", selectorRow.get("FULLDESPARTY1"));
                newEntity.set("DESLOC1", selectorRow.get("DESLOC1"));
                newEntity.set("DESADDR1", selectorRow.get("DESADDR1"));
                newEntity.set("VALLATITUDE", selectorRow.get("VALLATITUDE"));
                newEntity.set("VALLONGITUDE", selectorRow.get("VALLONGITUDE"));
                newEntity.set("CODTYPRELATIONSHIP", CommonNameSpace.CustomerRel.PharmaciesWorkPlaces);
                break
            case 'CustomerPartyWeek':
                newEntity.set("CODPARTY", parentEntity.get("CODPARTY"));
                break;
        }
    };

    this.afterCloseHandler = function (context) {
        var ctrl = context.ctrl,
            gui = ctrl.gui,
            pharmacy = ctrl.gui.getDocument(),
            detailEntity = ctrl.entity,
            entityName = detailEntity.getEntityName(),
            selector = ctrl.gui.selector;
        var compareBy = "CODPARTY";

        switch (entityName) {
            case "PhWorkPlace":
                if (context.ctrl.isNewDetail) {
                    selector.nav.filterOutCollection(pharmacy.getSubEntityStore(entityName), compareBy, function () {
                        XUI.hideWait();
                    });
                }

                if (context.opt.modified) {
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

    this.afterDetailChanged = function (context) {
        switch (context.entityName) {
            case "PhWorkPlace":
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
        var doc = gui.getDocument();
        var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });
        CommonEngine.validateCustomerPartyContact(gui, cdiv);

        if (gui.errorReports["DESPARTY1"])
            gui.errorReports["DESPARTY1"] = { caption: UserContext.tryTranslate("[MOBGUIPHARMACY.CUSTOMER.DESPARTY1]") };


    };

    this.beforeUiRendering = function (context) {
        var doc = context.gui.getDocument();
        this._createWorkPlacesStore(doc);
    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "ADDR_INFO":
                sectionContext.entityName = 'CustomerAddr';
                var entity = sectionContext.entity;
                var address = entity.getSubEntityStore("CustomerAddr").findBy(function (addr) { return addr.get("CODADDR") == "1"; });;
                sectionContext.entity = address;
                break;
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
            case "WORKPLACES_GRID":
                sectionContext.document.getSubEntityStore("PhWorkPlace").sortStore(function (w1, w2) {
                    if (w1.get("HASDIRECTLINK") && !w2.get("HASDIRECTLINK"))
                        return -1;
                    if (!w1.get("HASDIRECTLINK") && w2.get("HASDIRECTLINK"))
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

    this.afterSectionCreated = function (context) {
        var sectionName = context.sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "WORKPLACES_MAP":
                var panel = context.panel;
                var mapPanel = this._createMap(context.gui.getDocument());
                panel.setDocked('');
                panel.mapPanel = panel.add(mapPanel);
                panel.setCls(panel.getCls() + ' sm1-routemapsection');
                break;
            case "CALENDAR_INFO":
                if (!context.detailGui.isNewDetail) {
                    if (context.sectionConfig.children.length == 1)
                        //hide calendar info section if the detail is opened from the grid and the section has only one field
                        context.panel.setHidden(true);
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
            case "CustomerAddr":
                switch (fieldName) {
                    case "CODPRV":
                        fieldContext.voices = SalesForceEngine.getProvincesByNation(fieldContext.sectionContext.entity.get("CODNATION"));
                        break;
                }
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

        var pharmacyWorkplaceLinkLevel = UserContext.getConfigParam("PHWPLINKLEV", "0");
        if (XApp.isEmptyOrWhitespaceString(pharmacyWorkplaceLinkLevel))
            pharmacyWorkplaceLinkLevel = "0";

        switch (selName) {
            case "NAV_MOB_CONTACTS":
                CommonEngine.filterCustomerPartyContactSelector(gui, selName, config);
                break;
            case "NAV_MOB_WORKPLACES":
                cons = new XConstraints({
                    logicalOp: 'AND',
                    constraints: [
                           new XConstraint("CODPARTY", SqlRelationalOperator.NotIn, Ext.Array.map(doc.getSubEntityStore("PhWorkPlace").toArray(), function (wp) {
                               return wp.get("CODPARTY");
                           })),
                        new XConstraint("CODSTATUS", SqlRelationalOperator.NotEqual, CommonNameSpace.CustomerStatus.Cancelled)
                    ]
                });
                if (pharmacyWorkplaceLinkLevel != "0")
                    cons.add("IDWPLEVEL", SqlRelationalOperator.Equal, pharmacyWorkplaceLinkLevel);
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

            CommonEngine.updateContactsNavigator(gui.getDocument());

            //update navigators
            this._updateCache(gui.getDocument(), "NAV_MOB_PHARMACIES", onFailure, function () {
                CommonEngine.updateNavMobPendingAct(gui.getDocument(), onFailure, function () {
                    CommonEngine.updateNavMobPdvPdc(gui.getDocument(), onFailure, function () {
                        CommonEngine.updateNavMobAttachmentsCust(gui.getDocument(), onFailure, onSuccess);
                    });
                });
            });
        } catch (e) {
            if (onFailure)
                onFailure(e);
            return;
        }
    };

    /* Syncs navigator with pharmacy document*/
    this._updateCache = function (doc, navId, onFailure, onSuccess) {
        var nav = XNavHelper.getFromMemoryCache(navId),
            row = nav.findByKey(doc.get("DOCUMENTKEY")),
            newRow = false;


        if (!row) {
            newRow = true;
            row = nav.newRow();
        }

        SalesExecutionEngine._updateRowTemplateProps(doc, row, nav);

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

    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.sectionContext.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (context.fieldConfig.attrs['name']) {
            case "CODPARTY":
            case "DESPARTY1":
            case "CODSTATUS":
                var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                field.setLabel(desField);
                break;

        }
        return field;
    };

    this.onTabControlActiveItemChange = function (context) {
        if (context) {
            if (context.newTab) {
                if (context.newTab.tabName == "WORKPLACES" && context.isAtFirstLoad) {
                    //because the workplaces grid is bound to a dynamic entity we need to manually bind it
                    this._rebindWPGridStore(context.gui);
                }
                if (context.newTab.tabName == "MAP" && !context.isAtFirstLoad) {
                    this._refreshMap(context.gui);
                }
                if (context.newTab.tabName == "HIERARCHIES" && context.isAtFirstLoad) {
                    context.gui.hierarchyView = new Customer.HierarchyPanel({
                        id: 'hierarchy_view_panel',
                        parentTab: context.newTab,
                        gui: context.gui
                    });
                    context.gui.hierarchyView.initializeControl();
                }
            }
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

    this._rebindWPGridStore = function (gui) {
        try {
            if (!gui.tabCtrls.WORKPLACES ||
                !gui.tabCtrls.WORKPLACES.sections.WORKPLACES_GRID) {
                return;
            }

            var wpGridStore = gui.tabCtrls.WORKPLACES.sections.WORKPLACES_GRID.grid.getStore();
            if (wpGridStore) {
                gui.getDocument().getSubEntityStore("PhWorkPlace").rebindSenchaStore(wpGridStore);
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this.onGridEndEditEnded = function (context) {
        var entity = context.rowEntity;
        var fieldName = context.fieldName;
        try {
            switch (entity.getEntityName()) {
                case "PhWorkPlace":
                    switch (fieldName) {
                        case "HASDIRECTLINK":
                            this._afterPharmacyWorkplaceChanged(entity, context.newVal);
                            this._rebindWPGridStore(context.gui);
                            break;
                    }
                    break;
            }
        } catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this._afterPharmacyWorkplaceChanged = function (entity, newVal) {
        if (newVal == true) {
            entity.set("CODTYPRELATIONSHIP", CommonNameSpace.CustomerRel.PharmaciesWorkPlaces);
            entity.set("DISTANCE", 0);
            this._refreshPdvPdcStore(entity, newVal);
        }
        else {
            //no matter if the entity is close or not we keep it in the grid if it was before
            var doc = entity.getParentEntity();
            if (entity.get("DISTANCE") == 0) {

                entity.set("DISTANCE", -1);
                entity.set("CODTYPRELATIONSHIP", "");
                this._refreshPdvPdcStore(entity, newVal);
            }
        }
    };

    this._refreshPdvPdcStore = function (entity, newVal) {
        var self = this;
        var parentEntity = entity.getParentEntity();
        if (parentEntity) {
            var pdvPdcStore = CommonEngine.getCustomerPdvPdcStore(parentEntity);

            var pdvPdcEntity = pdvPdcStore.findBy(function (pdvPdc) {
                return pdvPdc.get("CODCUSTDELIV") == entity.get("CODPARTY");
            });
            var docStoreEntity = parentEntity.getSubEntityStore("PhWorkPlace").findBy(function (workplace) {
                return workplace.get("CODPARTY") == entity.get("CODPARTY");
            });
            if ((!docStoreEntity && pdvPdcEntity) || (docStoreEntity && docStoreEntity.get("DISTANCE") != 0 && pdvPdcEntity)) {
                pdvPdcStore.remove(pdvPdcEntity);
            }
            else if (docStoreEntity && pdvPdcEntity) {
                pdvPdcEntity.set("DTEMOD", new Date());
                pdvPdcEntity.set("CODUSRMOD", UserContext.CodUsr);
            }
            else if (docStoreEntity && (docStoreEntity.get("DISTANCE") == 0 || docStoreEntity.get("DISTANCE") == -1) && !pdvPdcEntity) {
                pdvPdcStore.add(entity.createPdvPdcEntity());
            }
        }
    };

    this.afterOpenSubDetail = function (context) {
        var entity = context.newEntity;
        switch (context.entityName) {
            case "PhWorkPlace":
                if (context.detailContext.removeButtons.length != 0)
                    context.detailContext.removeButtons[0].hide();
                break;
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
                case "CODNATION":
                    SalesForceEngine.initializeProvincesCombo(detailContext.fields["CODPRV"], newValue);
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

    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        var entity = context.field.fieldContext.sectionContext.entity;
        switch (entity.getEntityName()) {
            case "CustomerPartyWeek":
                switch (fieldName) {
                    case "CODPLAN":
                        //hide calendar info type if the detail is opened from the grid
                        context.visible =  context.visible && !context.gui.isNewDetail ? false : true;
                        break;
                    default:
                        if (fieldName.startsWith("STARTEVENING") || fieldName.startsWith("ENDEVENING") ||
                               fieldName.startsWith("START") || fieldName.startsWith("END")) {
                            context.valid = context.valid && CalendarTypeHelper.isCalendarTypeFieldValueValid(fieldName, context);
                        }
                        break;
                }
                break;
            case 'CustomerAddr':
                switch (fieldName) {
                    case 'DESADDR1':
                        if (this.geoLocateBtn && this._geocodeManager)
                            this.geoLocateBtn.enabled = this._geocodeManager.canGeocodeCustomerAddress('1');
                        break;
                    case "CODPRV":
                        context.valid = context.valid && SalesForceEngine.validateProvince(context.sectionContext.entity);
                        break;
                }
                break;
        }
    };

    this._createWorkPlacesStore = function (doc) {
        var store = doc.createSubEntityStore("PhWorkPlace");
        this._loadDirectWorkPlaces(doc);
        this._loadClosestWorkPlaces(doc);

        store.storeChanged = function (store, context) {
            //sync the pdvPdcStore
            var pdvPdcStore = CommonEngine.getCustomerPdvPdcStore(this.getParentEntity());
            if (context.oldItems && context.oldItems.length) {
                var pharmacyWorkPlaces = CommonEngine.getPharmacyWorkPlaces(this.getParentEntity().get("CODPARTY"));
                for (var i = 0; i < context.oldItems.length ; i++) {
                    var toRemove = Ext.Array.findBy(pharmacyWorkPlaces, function (a) {
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

    this._loadDirectWorkPlaces = function (doc) {
        var self = this;
        var cdiv = doc.getSubEntityStore("CustomerDiv").findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });
        var wps = doc.getSubEntityStore("PhWorkPlace");
        if (cdiv) {
            cdiv.getSubEntityStore("CustomerPdvPdc").each(function (wp) {
                if (wp.get("CODTYPRELATIONSHIP") == CommonNameSpace.CustomerRel.PharmaciesWorkPlaces && !wp.get("FLGANN")) {
                    var row = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(wp.get("CODCUSTDELIV")));
                    if (row) {
                        var workPlace = self._buildPharmacyWorkPlace(row);
                        workPlace.set("CODTYPRELATIONSHIP", wp.get("CODTYPRELATIONSHIP"));
                        wps.add(workPlace);
                    }
                }
            });
        }
    };

    this._loadClosestWorkPlaces = function (doc) {
        var self = this;
        var closestWorkPlaces = [];
        var addr = doc.getSubEntityStore("CustomerAddr").findBy(function (addr) {
            return addr.get("CODADDR") == "1";
        });
        var pharmacyNavRow = XNavHelper.getFromMemoryCache("NAV_MOB_PHARMACIES").findByKey(CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
        var closesWorkPlacesNo = UserContext.getConfigParam("CLOSEST_WORKPLACES_NO", "10");
        var closestWpPharmachyField = UserContext.getConfigParam("CLOSEST_WORKPLACES_PHARMACY_FIELD", "CODZIP");
        if (XApp.isEmptyOrWhitespaceString(closestWpPharmachyField))
            closestWpPharmachyField = "CODZIP";
        var wps = doc.getSubEntityStore("PhWorkPlace");

        if (addr) {
            //coordinates of the current pharmacy
            var valLat = addr.get("VALLATITUDE"),
                valLong = addr.get("VALLONGITUDE");
            if (MapServices.areValidCoordinates(valLat, valLong)) {
                var workPlaces = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES");
                if (workPlaces) {
                    //exclude existing workplaces
                    var toExclude = Ext.Array.map(wps.toArray(), function (wp) {
                        return wp.get("CODPARTY");
                    });
                    //Select all customers from the same city and which are not linked directly
                    var sameCity = Ext.Array.filter(workPlaces.Rows, function (row) {
                        return row.get(closestWpPharmachyField).toUpperCase() == addr.get(closestWpPharmachyField).toUpperCase() && !Ext.Array.contains(toExclude, row.get("CODPARTY"));
                    });

                    for (var i = 0; i < sameCity.length; i++) {
                        if (MapServices.areValidCoordinates(sameCity[i].get("VALLATITUDE"), sameCity[i].get("VALLONGITUDE"))) {
                            var distanceInMeters = MapServices.distanceBetweenPlaces(valLat, valLong, sameCity[i].get("VALLATITUDE"), sameCity[i].get("VALLONGITUDE"));
                            var closeWorkPlace = self._buildPharmacyWorkPlace(sameCity[i]);
                            closeWorkPlace.set("DISTANCE", distanceInMeters);
                            closestWorkPlaces.push(closeWorkPlace);
                        }
                    }
                    //need only the first CLOSEST_WORKPLACES_NO
                    Ext.Array.sort(closestWorkPlaces, function (wp1, wp2) {
                        return wp1.get("DISTANCE") - wp2.get("DISTANCE");
                    });
                    closestWorkPlaces = Ext.Array.slice(closestWorkPlaces, 0, closesWorkPlacesNo);

                    wps.addAll(closestWorkPlaces);
                }
            }
        }
    };

    this._buildPharmacyWorkPlace = function (navRow) {
        return new XEntity({
            entityName: 'PhWorkPlace',
            data: {
                CODPARTY: navRow.get("CODPARTY"),
                FULLDESPARTY1: navRow.get("FULLDESPARTY1"),
                DESLOC1: navRow.get("DESLOC1"),
                DESADDR1: navRow.get("DESADDR1"),
                VALLATITUDE: navRow.get("VALLATITUDE"),
                VALLONGITUDE: navRow.get("VALLONGITUDE")
            }
        });
    };

    /* the sorting was not specified in the enhancement
        this._compareContacts = function (record1, record2) {
            // sort by role
            if (record1.get("decodeCODROLE1") < record2.get("decodeCODROLE1"))
                return -1;
            if (record1.get("decodeCODROLE1") > record2.get("decodeCODROLE1"))
                return 1;
            // then by name
            if (record1.get("DESCONTACT") < record2.get("DESCONTACT"))
                return -1;
            if (record1.get("DESCONTACT") > record2.get("DESCONTACT"))
                return 1;
            return 0;
        };*/

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

    this._renderPharmacyOnMap = function (document) {
        var self = this,
             pharmacyMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHARMACY);

        var addr = document.getSubEntityStore("CustomerAddr").findBy(function (addr) {
            return addr.get("CODADDR") == "1";
        });
        if (addr) {
            var valLat = addr.get("VALLATITUDE"),
                valLong = addr.get("VALLONGITUDE");

            if (MapServices.areValidCoordinates(valLat, valLong)) {
                var gpos = new google.maps.LatLng(valLat, valLong);

                XMap.getInstance().createMarker(gpos, null, null, pharmacyMarker.icon, function (addr) {
                    return function (marker) {
                        self._onPharmacyMarkerClick(marker, addr);
                    }
                }(addr));
                XMap.getInstance().extendBounds(gpos);
            }
        }
    };

    this._renderWorkPlacesOnMap = function (workPlacesStore) {
        var self = this,
            directWpMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHDIRECTWP),
            closeWpMaker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHCLOSEWP);

        workPlacesStore.each(function (wp) {
            var valLat = wp.get("VALLATITUDE"),
                valLong = wp.get("VALLONGITUDE");
            if (MapServices.areValidCoordinates(valLat, valLong)) {
                var gpos = new google.maps.LatLng(valLat, valLong),
                    markerIcon = wp.get("HASDIRECTLINK") ? directWpMarker.icon : closeWpMaker.icon;

                XMap.getInstance().createMarker(gpos, null, null, markerIcon, function (wp) {
                    return function (marker) {
                        self._onWorkplaceMarkerClick(marker, wp);
                    }
                }(wp));
                XMap.getInstance().extendBounds(gpos);
            }
        });
    };

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        var descriptionParts = [];

        descriptionParts.push(doc.get("DESPARTY1") + " " + "(" + doc.get("CODPARTY") + ")");

        var caddr = doc.getSubEntityStore('CustomerAddr').findBy(function (r) {
            return r.get("CODADDR") == '1';
        });
        if (caddr) {
            descriptionParts.push(caddr.get("DESLOC1"));
        }

        return descriptionParts.join(" | ");

    };

    this.preCreateLink = function (context) {
        try {
            switch (context.linkRow.type) {
                case "NAVLINK":

                    switch (context.linkRow.code) {
                        case "NAV_MOB_VISITS_PHARMACIES":
                            context.linkRow.implicitFilter = false;
                            break;
                        case "NAV_MOB_PHARMACIES_DOCTORS":
                            var joinedConstraints = new XConstraints({
                                logicalOp: 'OR',
                            });

                            var workplaces = CommonEngine.getPharmacyWorkPlaces(context.ctrl.entity.get("CODPARTY"));

                            for (var i in workplaces) {
                                var codWorkplace = workplaces[i].get("CODCUSTDELIV");
                                var childrenWorplaces = CommonEngine.getChildrenWorkplacesCodes(codWorkplace);
                                childrenWorplaces.push(codWorkplace);

                                var wplConstraints = new XConstraints({
                                    logicalOp: "AND",
                                    constraints: [
                                                new XConstraint("MAINWPCODPARTY", SqlRelationalOperator.In, childrenWorplaces)
                                    ]
                                });
                                joinedConstraints.Constraints.push(wplConstraints);
                            };
                            context.linkRow.hcs = joinedConstraints;
                            break;
                    }
                    break;
            }
        } catch (e) {
            XLog.logEx(e);
        }
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
                break;
        }
    };

    this._refreshMap = function (gui) {
        var self = this;
        var detailContext = gui.tabCtrls["MAP"];
        if (!detailContext)
            return;
        self._fillMap(detailContext.sections["WORKPLACES_MAP"].mapPanel, XMap.getInstance(), gui.getDocument());
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
                map.addLegendControltoGoogleMap([CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHARMACY), CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHDIRECTWP), CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHCLOSEWP)], google.maps.ControlPosition.LEFT_TOP);
                self._renderPharmacyOnMap(document);
                self._renderWorkPlacesOnMap(document.getSubEntityStore("PhWorkPlace"));

                map.fitIfBounded();
                panel.show();
                XUI.hideWait();
            }, 100);
        } else
            panel.hide();
    };

    this._onPharmacyMarkerClick = function (marker, pharmacyAddr) {
        var mainPanel = new Ext.Panel({
            layout: {
                type: 'vbox'
            },
            cls: 'sm1-pharma-cust-balloon',
            items: [
                {
                    xtype: 'component',
                    html: pharmacyAddr.getParentEntity().get("DESPARTY1"),
                    cls: 'sm1-pharma-cust-balloon-title'
                },
                {
                    xtype: 'component',
                    html: pharmacyAddr.get("DESADDR1") + " " + pharmacyAddr.get("DESLOC1")
                }
            ]
        });
        XMap.showMarkerPopup(marker, mainPanel);
    };

    this._onWorkplaceMarkerClick = function (marker, workplace) {
        var self = this;
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
                    html: workplace.get("FULLDESADDR")
                },
                {
                    xtype: 'xbutton',
                    cls: 'sm1-bt sm1-pharma-cust-balloon-btn',
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
                },
                {
                    xtype: 'xbutton',
                    text: workplace.get("HASDIRECTLINK") ?
                        UserContext.tryTranslate("[MOBGUIPHARMACY.WORKPLACES_MAP.UNLINKWORKPLACE]") :
                        UserContext.tryTranslate("[MOBGUIPHARMACY.WORKPLACES_MAP.LINKWORKPLACE]"),
                    cls: 'sm1-bt sm1-pharma-cust-balloon-btn',
                    disabled: !app.getSM1Controllers().gui.isEditable(),
                    SM1Listeners: {
                        onPress: function () {
                            var initialDistance = workplace.get("DISTANCE");
                            self._afterPharmacyWorkplaceChanged(workplace, !workplace.get("HASDIRECTLINK"));
                            self._rebindWPGridStore(app.getSM1Controllers().gui);
                            //refresh marker
                            var currentDistance = workplace.get("DISTANCE");
                            if ((initialDistance != 0 && currentDistance == 0) ||
                                (initialDistance == 0 && currentDistance != 0)) {
                                var markerIcon = (initialDistance == 0 && currentDistance != 0) ?
                                    CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHCLOSEWP) :
                                    CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.PHDIRECTWP);
                                this.setText(workplace.get("HASDIRECTLINK") ?
                                    UserContext.tryTranslate("[MOBGUIPHARMACY.WORKPLACES_MAP.UNLINKWORKPLACE]") :
                                    UserContext.tryTranslate("[MOBGUIPHARMACY.WORKPLACES_MAP.LINKWORKPLACE]"));
                                this.getParent().marker.setIcon(markerIcon.icon);
                            }
                            else {
                                this.getParent().marker.setMap(null);
                                XMap.getInstance().getMarkers().splice(XMap.getInstance().getMarkers().indexOf(this.getParent().marker), 1);
                            }
                            app.getSM1Controllers().gui.docModified = true;
                        }
                    }
                }
            ]
        });
        mainPanel.marker = marker;
        XMap.showMarkerPopup(marker, mainPanel);
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

        delete this.geoLocateBtn;
        if (this._geocodeManager) {
            this._geocodeManager.cleanup();
            delete this._geocodeManager;
        }
    };

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;
        if (gui.hierarchyView)
            gui.hierarchyView.destroy();
    };

    this.getYammerRefNode = function (context) {
        var pharmacy = context.detailGui.entity;
        var idLevel = XNavHelper.getNavRecord("NAV_MOB_CUST", new XConstraint("CODPARTY", SqlRelationalOperator.Equal, pharmacy.get("CODPARTY"))).get("IDLEVEL");

        context.codNode = pharmacy.get("CODPARTY");
        context.hierLevel = idLevel;
    };
};
XApp.registerGuiExtension("mobGuiPharmacy", new _mobGuiPharmacyExtension());
//#endregion