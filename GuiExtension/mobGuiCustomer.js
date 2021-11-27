//#region  _mobGuiCustomerExtension
function _mobGuiCustomerExtension() {
    this.getMenuButtons = function (context) {
        var self = this;

        var custRow = context.ctrl.openData.selectedNavRow;
        var flgPromo = custRow && Boolean(custRow.get("FLGPROMO"));
        var flgOrder = custRow && Boolean(custRow.get("FLGORDER"));

        if (flgOrder) {
            if (UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "NEWORDER"))
                context.buttons.push(SalesForceEngine.getNewOrderButton(context.ctrl, "NAV_MOB_CUST"));

            if (UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "NEWCART"))
                context.buttons.push({
                    iconCls: 'common_navbar_new_cart_23',
                    id: 'mobguicustomer-contextualmenu-new-cart',
                    msg: UserContext.tryTranslate("[MOBGUICUSTOMER.NEWCART]"),
                    handler: (function (ctrl) {
                        return function () {
                            var codParty = ctrl.docStore.getAt(0).get("CODPARTY");
                            var canCreateCart = SalesForceEngine.canCreateOrder(codParty);
                            if (!XApp.isEmptyOrWhitespaceString(canCreateCart)) {
                                XUI.showErrorMsgBox({ msg: canCreateCart });
                            } else {
                                ctrl.saveDoc(function () {
                                    XHistory.go({
                                        controller: app.getSM1Controllers().order_cart,
                                        action: 'show',
                                        codParty: codParty
                                    });
                                });
                            }
                        };
                    })(context.ctrl)
                });
        }

        if (UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "NEWENCASHMENT") != 0 && custRow != undefined) {
            context.buttons.push({
                iconCls: 'guis_visit_navbar_newcollection_23',
                id: 'mobguicustomer-contextualmenu-new-encashment',
                msg: UserContext.tryTranslate("[MOBGUICUSTOMER.NEWENCASHMENT]"),
                enabled: (custRow.get("FLGCUSTINV") != undefined && custRow.get("FLGCUSTINV") != 0),
                handler: (function (codCustInv) {
                return function () {
                        CommonEngine.canAddNewEncashment(
                    function (response) {
                        if (response.length == 0)
                            SalesForceEngine.openNewAgendaEncashment(codCustInv);
                        else
                            XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.ENCASHMENT_CANNOT_BE_ADDED]') });
                    },
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                    });
                };
                })(custRow.get("CODPARTY"))
            });
        }

        self._geocodeManager = new CustomerUiGeocodeManager(context.ctrl);
        self.geoLocateBtn = self._geocodeManager.buildGeocodeCustAddrBtnCfg();
        context.buttons.push(self.geoLocateBtn);
        context.buttons.push(self._geocodeManager.buildGeocodeCurrPosBtnCfg());

        context.buttons.push({
            iconCls: 'common_navbar_map_23',
            id: 'mobguicustomer-contextualmenu-map',
            msg: UserContext.tryTranslate("[MOBGUICUSTOMER.MAP]"),
            enabled: XApp.checkMapsApi(),
            handler: (function (ctrl) {
                return function () {
                    var entity = ctrl.docStore.getAt(0);
                    var addr = entity.getSubEntityStore("CustomerAddr").getAt(0);
                    if (addr) {
                        var lat = addr.get("VALLATITUDE");
                        var lng = addr.get("VALLONGITUDE");
                        if (lat == 0 || lng == 0) {
                            XUI.showInfoOk({
                                msg: UserContext.tryTranslate("[MOB.NO_MAP_POS]")
                            });
                            return;
                        }
                        var tooltip = entity.get("DESPARTY1");
                        var balloon = MapUtils.buildCustomerBalloon({
                            desParty: entity.get("DESPARTY1"),
                            addr: addr.get("DESADDR1") + " " + addr.get("CODZIP") + "  " + addr.get("DESLOC1") + " " + addr.get("CODPRV"),
                            documentKey: entity.get("DOCUMENTKEY")
                        });
                        XHistory.go({
                            markersData: [
                                {
                                    latlng: new google.maps.LatLng(lat, lng),
                                    "tooltip": tooltip,
                                    "balloon": balloon
                                }
                            ],
                            center: new google.maps.LatLng(lat, lng),
                            controller: app.getSM1Controllers().customer_map,
                            action: 'show'
                        });
                    }
                };
            })(context.ctrl)
        });

        if (custRow) {
            // new visit button (creates a visit with the default activity)
            if (SalesExecutionEngine.canCreateVisitForCustomer(custRow, true)) {
                context.buttons.push(SalesExecutionEngine.getNewDefaultVisitButton(custRow, 'navs_visits_navbar_new_visit_23'));
            }

            // plan pending activities button (opens the pending activities navigator or the organizer in split view)
            if (SalesExecutionEngine.canCreateVisitForCustomer(custRow)) {
                context.buttons.push(SalesExecutionEngine.getPlanPendingActivitiesButton({ "CODPARTY": custRow.get("CODPARTY") }));
                }
            }

        if (flgPromo && UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "NEWPROMOACTION")) {
            context.buttons.push({
                msg: UserContext.tryTranslate("[MOB.NEWPROMOACTION]"),
                    id: 'mobguicustomer-contextualmenu-new-promoaction',
                handler: (function (ctrl) {
                    return function () {
                        var codParty = ctrl.docStore.getAt(0).get("CODPARTY");
                        var idLevel = custRow ? custRow.get("IDLEVEL") : SalesPromotionEngine.getCustHierMinLevel();
                        var codResp = custRow ? custRow.get("CODUSR1") : "";
                        XHistory.go({
                                controller: app.getSM1Controllers().gui,
                            action: 'show',
                            docName: 'PromoAction',
                            guiName: 'mobGuiPromoAction',
                            navId: "NAV_MOB_PROMOACTION",
                            openMode: 'NEW',
                            codParty: codParty,
                            idLevel: idLevel,
                            codResp: codResp
                        });
                    };
                })(context.ctrl)
            });
        }

        var customerExternalUrl = ParametersDefaultsAndStaticData.getInstance().getCustomerExternalUrl();
        if (!XApp.isEmptyOrWhitespaceString(customerExternalUrl))
            context.buttons.push({
                    iconCls: 'guis_customer_external-link',
                    id: 'mobguicustomer-contextualmenu-external-link',
                msg: UserContext.tryTranslate("[MOBCUSTOMER.EXTERNAL_LINK]"),
                handler: (function (gui) {
                    return function () {
                        var codParty = gui.getDocument().get("CODPARTY");
                        var url = SalesExecutionEngine.getExternalCustomerUrl(codParty);
                        if (url)
                            XApp.openURL(url);
                        else
                            XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.ERR_EXTERNAL_URL]') });
                    };
                })(context.ctrl)
            });

        if (UserContext.checkRight("NAV_MOB_CUSTVIEW", "NAV_MOB_CUSTVIEW", "VIEW"))
            context.buttons.push({
                    msg: UserContext.tryTranslate("[NAV_MOB_CUSTVIEW]"),
                    id: 'mobguicustomer-contextualmenu-cust-view',
                    handler: (function (gui) {
                    return function () {
                        var codnode = gui.getDocument().get("CODPARTY");
                        var constraints = new XConstraints({ logicalOp: 'AND' });
                        constraints.add(new XConstraint("CODNODE", "=", codnode));

                        var record = XNavHelper.getNavRecord("NAV_MOB_CUSTVIEW", constraints);
                        if (record != null) {
                            XHistory.go({
                                    controller: app.getSM1Controllers().gui,
                                    action: 'show',
                                    docKey: record.get("DOCUMENTKEY"),
                                    navId: 'NAV_MOB_CUSTVIEW',
                                    openMode: 'VIEW',
                                    selectedNavRow: record
                            });
                        } else {
                            XUI.showOk({
                                    title: UserContext.tryTranslate("[CUSTOMER_ERR]"),
                                    msg: UserContext.tryTranslate("[MOB.DOC_UNAVAILABLE]")
                            });
    }
                    };
                    })(context.ctrl)
            });
    };

    this.preNewDocument = function (gui, options) {
        gui.docStore = new XStore({ entityName: 'Customer' });
        //var obj = new XEntity({ entityName: gui.docName, data: options.newCustomerData.newCust });
        gui.docStore.add(options.newCustomerData.newCust);
        this.afterNewDocument(gui, options);
        return false;
    };

    this.getYammerRefNode = function (context) {
        var idLevel;
        //Get the idlevel from the opened row if any
        if (context.gui.openData.selectedNavRow)
            idLevel = context.gui.openData.selectedNavRow.get("IDLEVEL");
        else
            idLevel = XNavHelper.getNavRecord("NAV_MOB_CUST", //get it from the navigator
                new XConstraint("CODPARTY", "=", context.detailGui.entity.get("CODPARTY"))).get("IDLEVEL");

        context.codNode = context.detailGui.entity.get("CODPARTY");
        context.hierLevel = idLevel;
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
            case 'CustomerPdvPdc':
                var codParty = context.selectorKey.split("|")[1];
                var custDiv = context.parentEntity;

                context.newEntity.set("CODPARTY", custDiv.get("CODPARTY"));
                context.newEntity.set("CODCUSTDELIV", codParty);
                context.newEntity.set("DESCUSTDELIV", context.selectorRow.get("DESPARTY1"));
                var d = new Date();
                context.newEntity.set("DTEFROM", new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                context.newEntity.set("DTETO", new Date(2099, 11, 31));
                break;
            case 'CustomerPartyContact':
                var codParty = context.selectorKey.split("|")[1];
                var custDiv = context.parentEntity;
                context.newEntity.set("CODPARTY", custDiv.get("CODPARTY"));
                context.newEntity.set("CODPER", codParty);
                CommonEngine.prepareNewCustomerPartyContact(custDiv, context.newEntity);
                break;
            case 'CustomerPVCategory':
                var codParty = context.parentEntity.get("CODPARTY");
                context.newEntity.set("CODPARTY", codParty);
                if (this._isCodClusterCustFieldVisible(context.gui, false) && !XApp.isEmptyOrWhitespaceString(context.parentEntity.get("CODCLUSTERCUST")))
                    context.newEntity.set("CODCLUSTERCUST", context.parentEntity.get("CODCLUSTERCUST"));
                else
                    context.newEntity.set("CODCLUSTERCUST", 'NULL');

                break;
            case 'CustomerPartyWeek':
                context.newEntity.set("CODPARTY", context.parentEntity.get("CODPARTY"));
                break;
        }
    };
    this.afterDetailChanged = function (context) {
        switch (context.entityName) {
            case "CustomerPdvPdc":
                if (context.entity.get("FLGPRIMARY")) {
                    var doc = context.gui.getDocument();
                    var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
                        return r.get("CODDIV") == UserContext.CodDiv;
                    });
                    var pdcs = cdiv.getSubEntityStore("CustomerPdvPdc");
                    for (var i = 0; i < pdcs.getCount() ; i++) {
                        var c = pdcs.getAt(i);
                        if (c.get("CODCUSTDELIV") == context.entity.get("CODCUSTDELIV"))
                            continue;
                        c.set("FLGPRIMARY", false);
                    }
                }
                break;
            case "CustomerPartyWeek":
                CalendarTypeHelper.rebindCalendarTypeGridStore(context.gui);
                break;
        }
    };

    this.afterCloseHandler = function (context) {
        var ctrl = context.ctrl,
           gui = ctrl.gui,
           detailEntity = ctrl.entity,
           entityName = detailEntity.getEntityName();
        switch (entityName) {
            case "CustomerPartyWeek":
                if (context.opt.modified) {
                    CalendarTypeHelper.rebindCalendarTypeGridStore(gui);
                }
                break;
        }
    };

    this.afterSectionCreated = function (context) {
        var sectionConfig = context.sectionConfig;
        var gui = context.gui;
        var doc = gui.getDocument();
        var panel = context.panel;
        var sectionName = sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "DEL_INFO":
                if (!doc.get("FLGCUSTDELIV")) {
                    panel.setHidden(true);
                }
                break;
            case "FINANCIAL_INFO":
                break;
            case "BANK_INFO":
                break;
            case "INV_INFO_DIV":
                break;
            case "RESP_INFO":
                break;
            case "POS_INFO":
                break;
            case "DIV_INFO":
                break;
            case "ADDR_INFO":
                break;
            case "PDVPDC":
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
        switch (context.entityName) {
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

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;
        delete gui.resetAssoProd;
        delete gui.nrNewProds;
        delete gui.clusterCustVoices;
        delete gui.simpleCategoryCluster;
        delete gui.categoryCluster;
        delete this.geoLocateBtn;
        if (this._geocodeManager) {
            this._geocodeManager.cleanup();
            delete this._geocodeManager;
        }
        if (gui.hierarchyView)
            gui.hierarchyView.destroy();
    }

    this.afterNewDocument = function (gui) {
        var obj = gui.docStore.getAt(0);
        this._initializeDocument(obj);
    };

    this.validateEntity = function (detailContext) {
        var entity = detailContext.entity;
        switch (detailContext.entityName) {
            case "CustomerPVCategory":
                return !XApp.isEmptyOrWhitespaceString(entity.get("CODCATEGORY")) && (!XApp.isEmptyOrWhitespaceString(entity.get("CODCLUSTERCUST") || !this._isCodClusterCustFieldVisible(detailContext.gui, true)));
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
        delete gui.errorReports["PDCPDV_PRIMARY"];

        var doc = gui.getDocument();
        var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });

        CommonEngine.validateCustomerPartyContact(gui, cdiv);

        var primary = false;
        if (doc.get("FLGCUSTSALE")) {

            var pdcs = cdiv.getSubEntityStore("CustomerPdvPdc");
            for (var i = 0; i < pdcs.getCount() ; i++) {
                var c = pdcs.getAt(i);
                if (c.get("FLGPRIMARY"))
                    primary = true;
            }
            if (!primary)
                gui.errorReports["PDCPDV_PRIMARY"] = { caption: UserContext.tryTranslate("[MOBGUICUSTOMER.ERR_NOPRIMARYWAREHOUSE]") };
        }

    };

    this.createListForSection = function (sectionContext) {
        switch (sectionContext.config.attrs.detailObject) {
            case "CustomerPartyContact": {
                var store = sectionContext.listStore;
                CommonEngine.filterCustomerPartyContacts(store);
                break;
            }
            case "CustomerPdvPdc": {
                var store = sectionContext.listStore;
                var d = new Date();
                store.filterBy(function (rec) {
                    if (rec.get("DTETO") < d)
                        return false;
                    return true;
                });
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
            case "CustomerPdvPdc": {
                var gui = context.gui;

                var d = new Date();
                var newDteTo = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
                context.detailEntity.set("DTETO", newDteTo);
                context.detailEntity.set("FLGPRIMARY", false);
                var store = context.gui.parentSectionContext.listStore;
                var codCustDeliv = context.detailEntity.get("CODCUSTDELIV");
                var dteFrom = context.detailEntity.get("DTEFROM");

                if (context.detailEntity.get("DTETO") <= context.detailEntity.get("DTEFROM")) {
                    var doc = gui.gui.getDocument();
                    var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
                        return r.get("CODDIV") == UserContext.CodDiv;
                    });
                    var pdvpdcs = cdiv.getSubEntityStore('CustomerPdvPdc');
                    pdvpdcs.remove(context.detailEntity);

                }
                var p = store.findBy(function (rec) {
                    if (rec.get("CODCUSTDELIV") == codCustDeliv && rec.get("DTEFROM") == dteFrom) {
                        return true;
                    }
                    return false;
                });
                store.removeAt(p);
                gui.gui.setModified(gui.entity);
                gui.doBack(true, true, "REMOVE");
                return true;
            }
        }
        return false;
    };

    var hours = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
    var days = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'];

    this.comboHoursVoices = [];
    this.comboHoursVoices.push({ value: '', text: '' });
    for (var i = 0; i < hours.length; i++) {
        this.comboHoursVoices.push({ value: hours[i] + ":00", text: hours[i] + ":00" });
        this.comboHoursVoices.push({ value: hours[i] + ":30", text: hours[i] + ":30" });
    }

    this.comboDaysVoices = [];
    this.comboDaysVoices.push({ value: '', text: '' });
    for (var i = 0; i < days.length; i++) {
        this.comboDaysVoices.push({ value: days[i], text: days[i] });
    }

    this.updateDaysCombo = function (field, month) {
        //number of days in month. 2004, because it's a year when february had 29 days
        var numDays = new Date(2004, new Number(month), 0).getDate();
        //filter days
        var days = this.comboDaysVoices.filter(function (day, i) {
            return i <= numDays;
        });
        field.setOptions(days);

        //update value in document if needed
        var doc = field.fieldContext.sectionContext.document;
        var property = field.fieldContext.fieldName;
        if (new Number(doc.get(property)) > numDays)
            doc.set(property, "");

    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "CONTACTS":
            case "CALENDAR_GRID":
            case "PDV_PDC":
                sectionContext.entityName = 'CustomerDiv';
                var e = CommonEngine.ensureCustomerDiv(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "FINANCIAL_INFO":
                sectionContext.entityName = 'CustomerAmount';
                var e = CommonEngine.ensureCustomerAmount(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "BANK_INFO":
                sectionContext.entityName = 'CustomerBank';
                var e = CommonEngine.ensureCustomerBank(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "CLUST_GRID":
            case "INV_INFO_DIV":
            case "DEL_INFO":
            case "RESP_INFO":
            case "POS_INFO":
            case "DIV_INFO":
                sectionContext.entityName = 'CustomerDiv';
                var e = CommonEngine.ensureCustomerDiv(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "ADDR_INFO":
                sectionContext.entityName = 'CustomerAddr';
                var e = sectionContext.entity.getSubEntityStore('CustomerAddr').getAt(0);
                if (e == undefined || e == null) {
                    e = new XEntity({ entityName: 'CustomerAddr' });
                    e.set("CODPARTY", sectionContext.entity.get("CODPARTY"));
                    e.set("CODADDR", "1");
                    sectionContext.entity.getSubEntityStore('CustomerAddr').add(e);
                }
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
            case "HIERARCHY_INFO":
                if (sectionContext.gui.hierarchyView)
                    sectionContext.gui.hierarchyView.ensureCustomerHierarchyNode(sectionContext);
                break;
        }
    };
    //#endregion

    //#region Grid customizers
    this.beforeCreateGridColumn = function (fieldContext) {
        var self = this;
        var gridName = fieldContext.sectionContext.config.attrs.caption;
        var fieldName = fieldContext.column.fieldName;
        switch (gridName) {
            case "CLUST_GRID":
                if (fieldName == "CODCLUSTERCUST") {
                    fieldContext.column.renderer = (function (fieldContext) {
                        return function (value, values) {
                            var des = "";
                            var voices = self._getClusterCustVoices(fieldContext.sectionContext.gui, values.CODCATEGORY);
                            for (var i = 0; i < voices.length; i++) {
                                var v = voices[i];
                                if (v.value == value) {
                                    des = v.text;
                                    break;
                                }
                            }
                            return fieldContext.sectionContext.detailContext.sections.CLUST_GRID.grid.formatCell("&nbsp;" + des, fieldContext.column, value, values);
                        };
                    })(fieldContext);
                }
                break;
            case "ASSOGRID":
                switch (fieldName) {
                    case "NUMPRG":
                        fieldContext.column.formatString = "#######";
                        fieldContext.column.minValue = 1;
                        break;
                    case "CODARTCUST":
                        var right = UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "EDITCODARTCUST");
                        if (right)
                            fieldContext.column.editable = true;
                        break;
                    case "FLGEXCLUDE":
                        var right = UserContext.checkRight("NAV_MOB_CUST", "CUSTOMIZATION", "EXCLUDEPRODASSO");
                        if (right)
                            fieldContext.column.editable = true;
                        //show the FLGEXCLUDE column only if it's a PDV/POS customer
                        if (fieldContext.sectionContext.entity.get("FLGCUSTSALE"))
                            fieldContext.column.hidden = false;
                        break;
                }
                break;
        }
    };

    this.gridBeginEdit = function (context) {
        if (context.column.fieldName == "CODCLUSTERCUST") {
            var voices = this._getClusterCustVoices(context.gui, context.rowEntity.get("CODCATEGORY"), context.rowEntity.get("CODCLUSTERCUST"));
            context.voices = voices;
        }
    };
    //#endregion

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        var detailContext = fieldContext.sectionContext.detailContext;
        switch (fieldContext.sectionContext.entityName) {
            case "CustomerPVCategory":
                switch (fieldName) {
                    case "CODCATEGORY":
                        //remove the empty row
                        var voices = fieldContext.voices;
                        voices.splice(0, 1);
                        //remove already used categories
                        var toRemove = [];
                        var selectedCatergory = "";
                        var existingCategories = fieldContext.sectionContext.detailContext.parentCtrl.sections.CLUST_GRID.sectionContext.entity.CustomerPVCategoryDetailsStore;
                        for (var i = 0; i < existingCategories.getCount() ; i++) {
                            var ent = existingCategories.getAt(i);
                            if (fieldContext.sectionContext.entity.get("CODCATEGORY") == ent.get("CODCATEGORY")) {
                                selectedCatergory = fieldContext.sectionContext.entity.get("CODCATEGORY");
                                continue;
                            }
                            toRemove.push(ent.get("CODCATEGORY"));
                        }
                        fieldContext.voices = voices.filter(function (category, i) {
                            return !Ext.Array.contains(toRemove, category.value);
                        });
                        //select the first row if no category is selected
                        if (!XApp.isEmptyOrWhitespaceString(selectedCatergory))
                            fieldContext.sectionContext.entity.set("CODCATEGORY", selectedCatergory);
                        else if (fieldContext.voices[0])
                            fieldContext.sectionContext.entity.set("CODCATEGORY", fieldContext.voices[0].value);
                        break;
                }
                break;
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

    //#region getCustomLayout
    this._editClusterLayout = function (gui, fields) {
        var codClusterFieldVisible = this._isCodClusterCustFieldVisible(gui, true);
        var width = codClusterFieldVisible ? undefined : "20%";
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            switch (field.attrs.name) {
                case "CODCLUSTERCUST":
                    //show/hide
                    if (!codClusterFieldVisible) {
                        fields.splice(i, 1);
                        i--;
                    }
                    break;
                default:
                    if (width && field.elementName == "column")
                        field.attrs.width = width;
                    //set width
                    break;
            }
        }
    };

    this.getCustomLayout = function (layout, detailContext) {
        switch (detailContext.tabName) {
            case "PDV":
                switch (detailContext.entityName) {
                    case "Customer":
                        //the main tab
                        for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                            var section = layout.children[idxSection];
                            if (section.attrs.caption == "CLUST_GRID") {
                                var columns = section.children[0].children;
                                this._editClusterLayout(detailContext.gui, columns);
                            }
                        }
                        break;
                }
                break;
            case "RETAIL_CLUST":
                switch (detailContext.entityName) {
                    case "CustomerPVCategory":
                        //the subdetail for the grid
                        for (var idxSection = 0; idxSection < layout.children.length; idxSection++) {
                            var section = layout.children[idxSection];
                            if (section.attrs.caption == "PVCATEGORY") {
                                var fields = section.children;
                                this._editClusterLayout(detailContext.gui, fields);
                            }
                        }
                        break;
                }
                break;
        }
        return layout;
    };
    //#endregion

    this.beforeOpenSubDetailFromList = function (context) {
        var sectionContext = context.sectionContext;
        var entity = context.entity;
        switch (sectionContext.config.attrs.caption) {
            case "INV_TO_SHIPTO":
            case "SHIPTO_TO_POS":
            case "SHIPTO_TO_INV":
                var codParty = entity.get("CODPARTY");
                var editRight = UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", 'EDIT');
                XHistory.go({
                    controller: app.getSM1Controllers().gui,
                    action: 'show',
                    docName: 'Customer',
                    docKey:  CommonEngine.buildCustomerKey(codParty),
                    navId: 'NAV_MOB_CUST',
                    openMode: editRight ? 'EDIT' : 'VIEW'
                });
                return true;
        }
        return false;
    };

    this._initializeDocument = function (doc) {
        var codParty = doc.get("CODPARTY");

        var st = doc.createSubEntityStore("Customer", "InvToShipTo");
        var rows = XNavHelper.getNavRecords("NAV_MOB_CUST", new XConstraint("CODCUSTINV", "=", codParty));
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var linkedParty = r.get("CODPARTY");
            //if (linkedParty == codParty)
            //    continue;
            var c = new XEntity({ entityName: 'Customer', data: { CODPARTY: r.get("CODPARTY"), DESPARTY1: r.get("DESPARTY1") } });
            st.add(c);
        }

        st = doc.createSubEntityStore("Customer", "ShipToToInv");
        if (doc.get("CODCUSTINV") != '') { // && doc.get("CODCUSTINV") != codParty) {
            r = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(doc.get("CODCUSTINV")));
            if (r) {
                var c = new XEntity({ entityName: 'Customer', data: { CODPARTY: r.get("CODPARTY"), DESPARTY1: r.get("DESPARTY1") } });
                st.add(c);
            }
        }

        var st = doc.createSubEntityStore("Customer", "ShipToToPos");
        var rows = XNavHelper.getNavRecords("NAV_MOB_CUST", new XConstraint("CODCUSTDELIV", "=", codParty));
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var linkedParty = r.get("CODPARTY");
            //if (linkedParty == codParty)
            //    continue;
            var c = new XEntity({ entityName: 'Customer', data: { CODPARTY: r.get("CODPARTY"), DESPARTY1: r.get("DESPARTY1") } });
            st.add(c);
        }
        var customerHierarchyRow = HierarchicalNodeManager.getCustomerHierarchyViewRow(doc.get("CODPARTY"));
        if (customerHierarchyRow != null) {
            st = doc.createSubEntityStore("HierarchicalNode", "CurrentHierarchicalNode");
            st.add(HierarchicalNodeManager.createHierarchicalNodeEntity(customerHierarchyRow));
        }
    };

    this.afterLoadDocument = function (gui) {
        var doc = gui.getDocument();
        this._initializeDocument(doc);
    };

    this.afterLoad = function (gui) {
        this._loadAssortmentsFromCache(gui);
        //keepShowWait
        return true;
    };

    this.beforeUiRendering = function (context) {
        var gui = context.gui;
        try {
            XUI.showWait();
            //create the store for the asso grid
            gui.getDocument().createSubEntityStore("EvalAssoSimulation");
            //reset gui variables
            gui.resetAssoProd = false;
            gui.nrNewProds = 0;
            gui.clusterCustVoices = [];
            gui.simpleCategoryCluster = UserContext.getConfigParam("SIMPLE_CATEGORY_CLUSTER", "-1") != "0";
            gui.categoryCluster = UserContext.getConfigParam("CATEGORY_CLUSTER", "-1") != "0";
            var customer = gui.getDocument();
            var codParty = customer.get("CODPARTY");
            context.executeNext = false;
            var refreshCallback = (function (ui) {
                return function () {
                    //start ui generation
                    ui.exe.executeNext();
                };
            })(gui);

            var load = {};
            load[SfaCacheManagerNamespace.CacheObjects.MOBVISIT] = false;
            load[SfaCacheManagerNamespace.CacheObjects.CUSTOMER] = false;
            SfaCacheManager.syncData({
                loadDefinitions: [
                    {
                        codparty: codParty,
                        date: new Date(),
                        coddiv: UserContext.CodDiv,
                        load: load
                    }
                ],
                //failure
                onFailure: Ext.emptyFn,
                onSuccess: Ext.emptyFn, //if offline cache manager will first call onRefresh and after that onSuccess
                onRefresh: refreshCallback
            });

        } catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
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

    this.afterCardFieldCreation = function (field, context) {
        var doc = context.sectionContext.document;

        switch (context.sectionContext.config.attrs["caption"]) {
            case "VISIT_TIME_INFO":
            case "DELIV_TIME_INFO":
                field.setOptions(this.comboHoursVoices);
                return field;
        }
        switch (context.fieldConfig.attrs['name']) {
            case "SEASON_START_DAY":
                this.updateDaysCombo(field, doc.get("SEASON_START_MONTH"));
                break;
            case "SEASON_END_DAY":
                this.updateDaysCombo(field, doc.get("SEASON_END_MONTH"));
                break;
            case "CLOSE_START_DAY":
                this.updateDaysCombo(field, doc.get("CLOSE_START_MONTH"));
                break;
            case "CLOSE_END_DAY":
                this.updateDaysCombo(field, doc.get("CLOSE_END_MONTH"));
                break;
            case "CODCLUSTERCUST":
                //hide the field depending on the parameters in T010
                var visible = this._isCodClusterCustFieldVisible(context.detailContext.gui, context.detailContext.entityName == "CustomerPVCategory");
                if (!visible)
                    context.fieldConfig.attrs.visible = "false";
                else {
                    //if the field is visible, set the comboBox options
                    var entity = context.detailContext.entity;
                    var voices = this._getClusterCustVoices(context.detailContext.gui, entity.get("CODCATEGORY"), entity.get("CODCLUSTERCUST"));
                    field.setOptions(voices);
                    if (voices[0] && context.detailContext.entityName == "CustomerPVCategory" && XApp.isEmptyOrWhitespaceString(entity.get("CODCLUSTERCUST")))
                        entity.set("CODCLUSTERCUST", voices[0].value);
                }
                break;
        }
        return field;
    };

    this._isCodClusterCustFieldVisible = function (gui, isInGrid) {
        if (!isInGrid)
            return !gui.simpleCategoryCluster && !gui.categoryCluster;
        return gui.simpleCategoryCluster || gui.categoryCluster;
    };

    this._getClusterCustVoices = function (gui, codCategory, selectedCluster) {
        var voices = [];
        var customer = gui.getDocument();
        var clustNav = XNavHelper.getFromMemoryCache("NAV_MOB_CLUST");
        if (!clustNav)
            return voices;

        var hierarchyColumns = ["CODNODEM1", "CODNODE0", "CODNODE1", "CODNODE2", "CODNODE3", "CODNODE4", "CODNODE5", "CODNODE6", "CODNODE7"];
        var codParty = customer.get("CODPARTY");
        var custRow = XNavHelper.getNavRecord("NAV_MOB_CUST", new XConstraint("CODPARTY", "=", codParty));
        if (!custRow)
            return voices;
        var divCustObj = customer.getSubEntityStore("CustomerDiv").findBy(function (div) {
            return div.get("CODDIV") == UserContext.CodDiv;
        });

        var codHierClust = UserContext.getConfigParam("CUSTOMERDEFAULTHIER", "COMM");
        //logic for the 3rd case
        if (!gui.simpleCategoryCluster && gui.categoryCluster) {
            if (!codCategory)
                return voices;
            var codAssortmentTypeClust = codCategory;
        } else {
            //logic for the 1st and 2nd cases
            var codAssortmentTypeClust = divCustObj.get("CODASSORTMENTTYPE_CLUSTER") || UserContext.getConfigParam("ASSORTMENT_TYPE_FOR_CLUSTER", "ORD");
        }

        //try to get the value from cache
        if (gui.clusterCustVoices[codAssortmentTypeClust])
            var voices = gui.clusterCustVoices[codAssortmentTypeClust];
        else {
            //common logic
            for (var idxlev = 0; idxlev < hierarchyColumns.length; idxlev++) {
                var codLev = idxlev - 1;
                var desLev = hierarchyColumns[idxlev];
                if (!XApp.isEmptyOrWhitespaceString(custRow.get(desLev))) {
                    var clustercustrows = XNavHelper.getNavRecords("NAV_MOB_CLUST", new XConstraints({
                        logicalOp: 'AND',
                        constraints: [new XConstraint("CODPARTY", "=", custRow.get(desLev)),
                            new XConstraint("CODLEV", "=", codLev),
                            new XConstraint("CODHIER", "=", codHierClust),
                            new XConstraint("CODASSORTMENTTYPE", "=", codAssortmentTypeClust),
                            new XConstraint("CODDIV", "=", divCustObj.get("CODDIV"))]
                    }));

                    if (clustercustrows.length > 0) {
                        for (var idxclust = 0; idxclust < clustercustrows.length; idxclust++) {
                            var r = clustercustrows[idxclust];
                            voices.push({ value: r.get("NUMFIELD").toString(), text: r.get("DESCLUSTER") });
                        }
                        gui.clusterCustVoices[codAssortmentTypeClust] = voices;
                        break;
                    }
                } else
                    break;
            }
        }
        //filter the values that have already been used
        var r = [];
        if (selectedCluster != null && selectedCluster != undefined)
            for (var i = 0; i < voices.length; i++) {
                if (selectedCluster == voices[i].value) {
                    r.push(voices[i]);
                    continue;
                }
                var clust = divCustObj.CustomerPVCategoryDetailsStore.findBy(function (e) {
                    return e.get("CODCATEGORY") == codCategory && e.get("CODCLUSTERCUST") == voices[i].value;
                });
                if (!clust)
                    r.push(voices[i]);
            }
        else
            r = voices;
        return r;
    };


    this.validateField = function (context) {
        switch (context.field.fieldContext.sectionContext.entityName) {
            case "CustomerPdvPdc":
                var entity = context.field.fieldContext.sectionContext.entity;
                switch (context.field.config.name) {
                    case "FLGPRIMARY":
                        if (context.field.getChecked())
                            entity.set("FLGANN", false);
                        break;
                    case "FLGANN":
                        if (context.field.getChecked())
                            entity.set("FLGPRIMARY", false);
                        break;
                }
                break;
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
    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        switch (fieldName) {
            case "CODZIP":
                //context.valid = false;
                break;
            case "NUMPHONE1":
            case "NUMPHONE2":
            case "NUMFAX1":
            case "NUMFAX2":
                var str = context.field.getValue();
                if (!XApp.isEmptyOrWhitespaceString(str)) {
                    var patt1 = /[0-9+ ]/g;
                    var strMatch = str.match(patt1);
                    if (!strMatch || (strMatch && strMatch.length != str.length))
                        context.valid = false;
                    else {
                        if (str.indexOf("+") !== -1) {
                            var regexp = /[+]/gi;
                            var matches_array = str.match(regexp);
                            if (matches_array.length !== 1)
                                context.valid = false;
                            else
                                if (str.indexOf("+") !== 0)
                                    context.valid = false;
                        }
                    }
                }
                break;
            case "CODCLUSTERCUST":
                //do this validation only in the row subdetail
                if (context.sectionContext.entityName != "CustomerPVCategory")
                    break;
            case "CODCATEGORY":
                context.valid = !XApp.isEmptyOrWhitespaceString(context.field.getValue());
                break;

            case "DESADDR1":
                if (this.geoLocateBtn && this._geocodeManager)
                    this.geoLocateBtn.enabled = this._geocodeManager.canGeocodeCustomerAddress();
                break;
            case "CODROLE1":
                context.valid = !XApp.isEmptyOrWhitespaceString(context.field.getValue());
                break;
            case "CODPLAN":
                //hide calendar info type if the detail is opened from the grid
                context.visible = context.visible && !context.gui.isNewDetail ? false : true;
                break;
            case "CODPRV":
                context.valid = context.valid && SalesForceEngine.validateProvince(context.sectionContext.entity);
                break;
            default:
                if (fieldName.startsWith("STARTEVENING") || fieldName.startsWith("ENDEVENING") ||
                       fieldName.startsWith("START") || fieldName.startsWith("END")) {
                    context.valid = context.valid && CalendarTypeHelper.isCalendarTypeFieldValueValid(fieldName, context);
                }
                break;
        }
    };

    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "EvalAssoSimulation":
                context.visible = false;
                break;
        }
    };

    this._swapProdOrdering = function (gui, prod1, prod2) {
        var assoStore = gui.getDocument().getSubEntityStore("EvalAssoSimulation");
        //get the entities corresponding to the products
        var op1 = assoStore.findBy(function (op) {
            return op.get("CODART") == prod1.get("CODART") && (!prod1.get("CODLOCATION") || op.get("CODLOCATION") == prod1.get("CODLOCATION"));
        });
        var op2 = assoStore.findBy(function (op) {
            return op.get("CODART") == prod2.get("CODART") && (!prod2.get("CODLOCATION") || op.get("CODLOCATION") == prod2.get("CODLOCATION"));
        });
        //swap the products
        var numprg1 = op1.get("NUMPRG");
        var numprg2 = op2.get("NUMPRG");
        op1.set("NUMPRG", numprg2);
        prod1.set("NUMPRG", numprg2);
        op2.set("NUMPRG", numprg1);
        prod2.set("NUMPRG", numprg1);
    };

    this._moveSelectedProduct = function (gui, direction) {
        gui.setModified(true);
        //don't reset the product order
        gui.resetAssoProd = false;
        var assoContext = this._getAssoGridStore(gui);
        if (assoContext.assoGrid.getSelectionCount() == 0) {
            XUI.showWarnOk({
                msg: UserContext.tryTranslate("[MOB.NO_ROWS_SELECTED]")
            });
            return;
        }
        //get the products that will be swapped
        var prod1 = assoContext.assoGrid.getSelection();
        var productIndex = assoContext.assoGridStore.indexOf(prod1);
        if (direction == 'down')
            productIndex++;
        else
            productIndex--;
        if (productIndex < 0 || productIndex >= assoContext.assoGridStore.getCount()) {
            XUI.showWarnOk({
                msg: UserContext.tryTranslate("[MOB.INVALID_SELECTION]")
            });
            return;
        }
        var prod2 = assoContext.assoGridStore.getAt(productIndex);
        //swap the products
        this._swapProdOrdering(gui, prod1, prod2);
    };

    this.getSectionButtons = function (sectionContext) {
        var self = this;
        var sectionName = sectionContext.config.attrs["caption"];
        var subEntityName = sectionContext.config.attrs["detailObject"];
        switch (sectionName) {
            case "ASSOGRID":
                if (UserContext.isFullOfflineMode())
                    return;
                //up button
                var up = {
                    iconCls: 'guis_customer_up',
                    //voicecls: undefined,
                    msg: UserContext.tryTranslate("[MOBCUSTOMER.UP]"),
                    handler: (function (gui) {
                        return function () {
                            try {
                                self._moveSelectedProduct(gui, "up");
                            } catch (e) {
                                XLog.logEx(e);
                                XUI.hideWait();
                            }
                        };
                    })(sectionContext.gui),
                    entityName: subEntityName,
                    id: sectionContext.panel.id + '-assogrid-up',
                    scope: this
                };
                sectionContext.buttons.push(up);

                //down button
                var down = {
                    iconCls: 'guis_customer_down',
                    //' assogrid-arrow-button',
                    //voicecls: undefined,
                    msg: UserContext.tryTranslate("[MOBCUSTOMER.DOWN]"),
                    handler: (function (gui) {
                        return function () {
                            try {
                                self._moveSelectedProduct(gui, "down");
                            } catch (e) {
                                XLog.logEx(e);
                                XUI.hideWait();
                            }
                        };
                    })(sectionContext.gui),
                    entityName: subEntityName,
                    id: sectionContext.panel.id + '-assogrid-down',
                    scope: this
                };
                sectionContext.buttons.push(down);

                //set new sort button
                var setNewSort = {
                    iconCls: 'guis_customer_sort',
                    msg: UserContext.tryTranslate("[MOBCUSTOMER.SET_NEW_SORT]"),
                    handler: (function (gui) {
                        return function () {
                            try {
                                XUI.showWait();
                                //don't reset the product ordering
                                gui.resetAssoProd = false;
                                var assoStore = gui.getDocument().getSubEntityStore("EvalAssoSimulation");
                                //get the sorted items in assoGridStore
                                var assoContext = self._getAssoGridStore(gui);
                                var assoGridStore = assoContext.assoGridStore;
                                for (var i = 0; i < assoGridStore.getCount() ; i++) {
                                    var prod = assoGridStore.getAt(i);
                                    var op = assoStore.findBy(function (op) {
                                        return op.get("CODART") == prod.get("CODART") && (!prod.get("CODLOCATION") || op.get("CODLOCATION") == prod.get("CODLOCATION"));
                                    });
                                    op.set("NUMPRG", i + 1);
                                }
                                gui.setModified(true);
                                assoStore.setModified(true);
                                self._rebindAssoGridStore(gui);
                                assoGridStore.sort("NUMPRG", "ASC");
                                //fire the sort event in order for the sorting arrows to refresh
                                assoContext.assoGrid.fireEvent('sort');
                                XUI.hideWait();
                            } catch (e) {
                                XLog.logEx(e);
                                XUI.hideWait();
                            }
                        };
                    })(sectionContext.gui),
                    entityName: subEntityName,
                    id: sectionContext.panel.id + '-assogrid-sort',
                    scope: this
                };
                sectionContext.buttons.push(setNewSort);

                //reset button
                var reset = {
                    iconCls: 'guis_customer_reset',
                    msg: UserContext.tryTranslate("[MOBCUSTOMER.RESET]"),
                    handler: (function (gui) {
                        return function () {
                            var store = self._getAssoGridStore(gui).assoGridStore;
                            if (store && store.getCount() > 0) {
                                gui.resetAssoProd = true;
                                gui.setModified(true);
                                XUI.showWarnOk({
                                    msg: UserContext.tryTranslate("[MOBVISIT.PROD_ORDER_RESET]"),
                                });
                            }
                        };
                    })(sectionContext.gui),
                    entityName: subEntityName,
                    id: sectionContext.panel.id + '-assogrid-reset',
                    scope: this
                };
                sectionContext.buttons.push(reset);
                break;

            case "PDVPDC":
                {
                    //add go to ship to button
                    var b = {
                        msg: UserContext.tryTranslate('[MOBGUICUSTOMER.GO_SHIPTO]'),
                        handler: (function (detailContext) {
                            return function () {
                                var codParty = detailContext.entity.get("CODCUSTDELIV");

                                var constraints = new XConstraints({ logicalOp: 'AND' });
                                constraints.add(new XConstraint("CODPARTY", "=", codParty));
                                var record = XNavHelper.getNavRecord("NAV_MOB_CUST", constraints);

                                var editRight = UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", 'EDIT');
                                detailContext.entity.doRestore();
                                detailContext.closeDetail(true, true, 'CANCEL');
                                detailContext.gui.saveDocNoConfirmation(
                                    function () {
                                        XHistory.go({
                                            controller: app.getSM1Controllers().gui,
                                            action: 'show',
                                            docName: 'Customer',
                                            docKey: CommonEngine.buildCustomerKey(codParty),
                                            navId: 'NAV_MOB_CUST',
                                            openMode: editRight ? 'EDIT' : 'VIEW',
                                            selectedNavRow: record
                                        });
                                    }
                                );
                            };
                        })(sectionContext.detailContext),
                        entityName: subEntityName,
                        id: sectionContext.panel.id + '-pdvpdc-goshipto',
                        scope: this
                    };
                    sectionContext.buttons.push(b);
                    break;
                }
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

    this.onEndEditEnded = function (ctrl, fieldName, newValue) {
        var detailContext = ctrl.fieldContext.sectionContext.detailContext;
        var sectionContext = ctrl.fieldContext.sectionContext;
        var entity = ctrl.fieldContext.sectionContext.entity;

        switch (fieldName) {
            case "DESPARTY1":         
                var addr = entity.getSubEntityStore("CustomerAddr").getAt(0);

                if (newValue != "") {
                    if (!XApp.isEmptyOrWhitespaceString(addr.get("CODPRV")))
                        CommonEngine.checkCustomerSimilarity(entity.get("CODPARTY"), newValue, addr.get("CODPRV"), function (e) {
                            XLog.logEx(e);
                        },
                        function (response) {
                            if (response && response.similarCust && response.similarCust.length > 0) {
                                XUI.showWait();
                                var simMsg = UserContext.tryTranslate("[MOB.CUSTOMER_WITH_SIMILAR_DESCRIPTION]");
                                for (var i = 0; i < response.similarCust.length; i++) {
                                    simMsg += "<br/>";
                                    simMsg += response.similarCust[i]["CODPARTY"] + ' - ' + response.similarCust[i]["DESPARTY1"];
                                }
                                XUI.showWarnOk({
                                    msg: simMsg
                                });
                            }
                            setTimeout(function () {
                                XUI.hideWait();
                            }, 100);
                        });
                }
                break;
            case "CODPRV":
                var doc = ctrl.fieldContext.sectionContext.document;
                if (newValue != "") {
                    if (!XApp.isEmptyOrWhitespaceString(doc.get("DESPARTY1")))
                        //check similarity
                        CommonEngine.checkCustomerSimilarity(doc.get("CODPARTY"), doc.get("DESPARTY1"), newValue, function (e) {
                            XLog.logEx(e);
                        },
                        function (response) {
                            if (response && response.similarCust && response.similarCust.length > 0) {
                                var simMsg = UserContext.tryTranslate("[MOB.CUSTOMER_WITH_SIMILAR_DESCRIPTION]");
                                for (var i = 0; i < response.similarCust.length; i++) {
                                    simMsg += "<br/>";
                                    simMsg += response.similarCust[i]["CODPARTY"] + ' - ' + response.similarCust[i]["DESPARTY1"];
                                }
                                XUI.showWarnOk({
                                    msg: simMsg
                                });
                            }
                        });


                }
                break;
            case "CODCATEGORY":
                var codClusterField = ctrl.fieldContext.sectionContext.detailContext.fields.CODCLUSTERCUST;
                if (!ctrl.fieldContext.sectionContext.gui.simpleCategoryCluster && ctrl.fieldContext.sectionContext.gui.categoryCluster) {
                    //if we are in the 3rd cluster case set the datasorce for CODCLUSTER
                    var voices = this._getClusterCustVoices(ctrl.fieldContext.sectionContext.gui, newValue);
                    codClusterField.setOptions(voices);
                    if (voices[0]) {
                        codClusterField.updateValue(voices[0].value);
                        codClusterField.fireEvent('change', codClusterField, voices[0].value, codClusterField.getValue());
                    } else {

                        codClusterField.fireEvent('change', codClusterField, "", codClusterField.getValue());
                    }
                }
                break;
            case "FLGPRIMARY":
                CommonEngine.updateCustomerPartyContactFlgPrimary(sectionContext);
                break;
            case "SEASON_START_MONTH":
                this.updateDaysCombo(detailContext.fields["SEASON_START_DAY"], newValue);
                break;
            case "SEASON_END_MONTH":
                this.updateDaysCombo(detailContext.fields["SEASON_END_DAY"], newValue);
                break;
            case "CLOSE_START_MONTH":
                this.updateDaysCombo(detailContext.fields["CLOSE_START_DAY"], newValue);
                break;
            case "CLOSE_END_MONTH":
                this.updateDaysCombo(detailContext.fields["CLOSE_END_DAY"], newValue);
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

    this.beforeCallSelector = function (gui, selName, config) {
        switch (selName) {
            case "NAV_MOB_CONTACTS":
                CommonEngine.filterCustomerPartyContactSelector(gui, selName, config);
                break;
            case "NAV_MOB_CUST":
                var doc = gui.gui.getDocument();
                var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
                    return r.get("CODDIV") == UserContext.CodDiv;
                });
                var cs = new XConstraints();
                config.hiddenConstraints = cs;
                var pdcs = cdiv.getSubEntityStore("CustomerPdvPdc");
                if (pdcs.getCount() > 0) {
                    var values = [];
                    for (var i = 0; i < pdcs.getCount() ; i++) {
                        var pdc = pdcs.getAt(i);
                        var cod = pdc.get("CODCUSTDELIV");
                        values.push(cod);
                    }
                    var c = new XConstraint("CODPARTY", SqlRelationalOperator.NotIn, values);
                    cs.add(c);
                    var c2 = new XConstraint("FLGCUSTDELIV", SqlRelationalOperator.Equal, true);
                    cs.add(c2);
                }
                break;
        }
    };

    //#region assorments

    this._getAssoGridStore = function (gui) {
        //if the model is customized, allow to chose another location for the assoGridStore
        var localcontext = {
            gui: gui,
            assoGrid: null,
            assoGridStore: null
        };
        try {
            XApp.callCust("guiCustomizer", "mobGuiCustomer", 'getAsooGridStore', localcontext);
            if (!localcontext.assoGridStore) {
                localcontext.assoGrid = gui.tabCtrls.ASSORT.sections.ASSOGRID.grid;
                localcontext.assoGridStore = gui.tabCtrls.ASSORT.sections.ASSOGRID.store;
            }
            return localcontext;
        } catch (e) {
            return localcontext;
        }
    };

    this._rebindAssoGridStore = function (gui) {
        try {
            var localcontext = this._getAssoGridStore(gui);
            if (localcontext.assoGridStore) {
                var customer = gui.getDocument();
                var assoStore = customer.getSubEntityStore("EvalAssoSimulation");
                //keep the scroller position after rebinding the sencha store
                var scroller = localcontext.assoGrid.getScrollable();
                var y = scroller.position.y;
                assoStore.rebindSenchaStore(localcontext.assoGridStore);
                scroller.scrollTo(0, y, true);
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    this._initializeOrderingProductsList = function (assoStore, assortmentDictionary) {
        var nrPrg = 1;
        for (var i = 0; i < assortmentDictionary.length; i++) {
            var assoData = assortmentDictionary[i].value;
            for (var n = 0; n < assoData.length; n++) {
                var ev = new XEntity({ entityName: "EvalAssoSimulation", data: assoData[n] });
                ev.setCustomFields();
                ev.set("NUMPRG", nrPrg++);
                assoStore.add(ev);
            }
        }
        XLog.logInfo("Loading Assortments from cache: found  " + assoStore.getCount() + " items");
    };

    this._getTheExistingOrderProducts = function (gui, orderingProductsStore, assoStore, assortmentDictionary) {
        gui.nrNewProds = 0;
        var newProds = [];
        var obsoleteProds = new XStore({ entityName: "OrderingProducts" });
        obsoleteProds.addAll(orderingProductsStore._entities);
        //add the products from the assortment in assoStore
        for (var i = 0; i < assortmentDictionary.length; i++) {
            var assoData = assortmentDictionary[i].value;
            for (var n = 0; n < assoData.length; n++) {
                var prod = orderingProductsStore.findBy(function (prod) {
                    return prod.get("CODART") == assoData[n].CODART;
                });
                if (!prod) {
                    //process the new products that are not in the ordering store
                    var ev = new XEntity({ entityName: "EvalAssoSimulation", data: assoData[n] });
                    ev.setCustomFields();
                    assoStore.add(ev);
                    newProds.push(ev);
                    gui.nrNewProds++;
                } else {
                    //process the products that are in the ordering store
                    var ev = new XEntity({ entityName: "EvalAssoSimulation", data: assoData[n] });
                    ev.setCustomFields();
                    ev.set("NUMPRG", prod.get("NUMPRG"));
                    ev.set("FLGEXCLUDE", prod.get("FLGEXCLUDE"));
                    ev.set("CODARTCUST", prod.get("CODARTCUST"));
                    assoStore.add(ev);
                    obsoleteProds.remove(prod);
                }
            }
        }
        //add the products with FLGEXCLUDE=true in assoStore
        for (var i = 0; i < obsoleteProds.getCount() ; i++) {
            var prod = obsoleteProds.getAt(i);
            if (prod.get("FLGEXCLUDE")) {
                var prodRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(CommonEngine.buildProductKey(prod.get("CODART"), prod.get("CODDIV")));
                if (!prodRow) {
                    orderingProductsStore.remove(prod);
                    continue;
                }
                var ev = new XEntity({ entityName: "EvalAssoSimulation" });
                ev.setCustomFields(prodRow);

                ev.set("CODART", prod.get("CODART"));
                ev.set("CODARTCUST", prod.get("CODARTCUST"));
                ev.set("CODDIV", prod.get("CODDIV"));
                ev.set("CODPARTY", prod.get("CODPARTY"));
                ev.set("CODLOCATION", prod.get("CODLOCATION"));
                ev.set("FLGEXCLUDE", prod.get("FLGEXCLUDE"));
                ev.set("NUMPRG", prod.get("NUMPRG"));

                assoStore.add(ev);
            } else {
                orderingProductsStore.remove(prod);
            }
        }
        //sort the products by NUMPRG
        this._arangeTheOrderByProgressive(assoStore);
    };

    this._arangeTheOrderByProgressive = function (assoStore) {
        var orderedAsso = assoStore.sort(function (a, b) {
            return a.get("NUMPRG") - b.get("NUMPRG");
        });
        for (var i = 0; i < orderedAsso.length; i++) {
            orderedAsso[i].set("NUMPRG", i + 1);
        }
    };


    this._moveProductAt = function (assoStore, oldProd, newNumPrg) {
        var newProd = assoStore.findBy(function (prod) {
            return prod.get("NUMPRG") == newNumPrg;
        });
        while (oldProd) {
            oldProd.set("NUMPRG", newNumPrg++);
            oldProd = newProd;
            newProd = assoStore.findBy(function (prod) {
                return prod.get("NUMPRG") == newNumPrg;
            });
        }
    };

    // Cache the assortments for each division of the current customer
    // The cached data will be saved on the order
    this._loadAssortmentsFromCache = function (gui, onSuccess) {
        var self = this;
        try {


            XUI.showWait();
            var customer = gui.getDocument();
            var codParty = customer.get("CODPARTY");
            //get the store for the ASSO grid
            var assoStore = customer.getSubEntityStore("EvalAssoSimulation");
            SfaCacheManager.waitForCache(function () {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS,
                    date: new Date(),
                    codparty: codParty,
                    coddiv: UserContext.CodDiv,
                    onFailure: function () {
                        XUI.hideWait();
                        XLog.logErr("Could not retrive assortments from cache for customer:" + codParty);
                    },
                    onSuccess: function (assortmentDictionary) {
                        try {
                            if (assortmentDictionary) {
                                //filter assortment products
                                var prods = [];
                                for (var i = 0; i < assortmentDictionary.length; i++) {
                                    var assoData = assortmentDictionary[i].value;
                                    for (var n = 0; n < assoData.length; n++) {
                                        var assoType = assoData[n].CODASSORTMENTTYPE;
                                        if ((UserContext.getRefdatValue("ASSOTYPE", assoType, "ASSOORD") != "1" && UserContext.getRefdatValue("ASSOTYPE", assoType, "ASSOSURVEY") != "1") || prods.indexOf(assoData[n].CODART) != -1) {
                                            assoData.splice(n, 1);
                                            n--;
                                        } else
                                            prods.push(assoData[n].CODART);
                                    }
                                }
                                //initialize asso grid store
                                if (customer.OrderingProductsDetailsStore.getCount() == 0)
                                    self._initializeOrderingProductsList(assoStore, assortmentDictionary);
                                else
                                    self._getTheExistingOrderProducts(gui, customer.OrderingProductsDetailsStore, assoStore, assortmentDictionary);
                                assoStore.setModified(false);
                                //bind and refresh the grid
                                self._rebindAssoGridStore(gui);
                                if (onSuccess)
                                    onSuccess();
                            } else {
                                XLog.logWarn("No assortment cache for customer:" + codParty);
                            }
                            XUI.hideWait();
                        } catch (e) {
                            XUI.hideWait();
                            XLog.logErr("Could not retrive assortments from cache for customer:" + codParty);
                        }
                    }
                });
            });
        } catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
    };

    this._saveProductOrder = function (gui, orderingProductsStore, assoStore) {
        var customer = gui.getDocument();
        if (gui.resetAssoProd) {

            SfaCacheManager.removeFromCache({
                entityName: SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS,
                codparty: customer.get("CODPARTY"),
                date: new Date(),
                coddiv: UserContext.CodDiv,
                onFailure: function (e) {
                    XLog.logErr(UserContext.tryTranslate("[MOBVISIT.UNABLE_PROD_ORDER_RESET]"));
                    XLog.logEx(e);
                },
                onSuccess: Ext.emptyFn

            });


            //reset the ordering by clearing the store
            orderingProductsStore.clear();
            return;
        }
        if (assoStore.getCount() > 0) {
            this._arangeTheOrderByProgressive(assoStore);
            if (orderingProductsStore.getCount() > 0) {
                for (var i = 0; i < assoStore.getCount() ; i++) {
                    var opw = assoStore.getAt(i);
                    var op = orderingProductsStore.findBy(function (prod) {
                        return prod.get("CODART") == opw.get("CODART") && prod.get("CODLOCATION") == opw.get("CODLOCATION");
                    });
                    if (op) {
                        op.set("NUMPRG", opw.get("NUMPRG"));
                        op.set("DTEMOD", new Date());
                        op.set("CODARTCUST", opw.get("CODARTCUST"));
                        op.set("FLGEXCLUDE", opw.get("FLGEXCLUDE"));
                        op.set("CODPARTY", customer.get("CODPARTY"));
                    } else {
                        op = new XEntity({ entityName: "OrderingProducts", data: opw._data });
                        op.set("CODPARTY", customer.get("CODPARTY"));
                        orderingProductsStore.add(op);
                    }
                }
            } else {
                if (assoStore.isModified()) {
                    for (var i = 0; i < assoStore.getCount() ; i++) {
                        var opw = assoStore.getAt(i);
                        op = new XEntity({ entityName: "OrderingProducts", data: opw._data });
                        op.set("CODPARTY", customer.get("CODPARTY"));
                        orderingProductsStore.add(op);
                    }
                }
            }
        }
    };

    //#endregion

    this.preSaveDocument = function (gui, doc) {
        this._saveProductOrder(gui, doc.OrderingProductsDetailsStore, doc.getSubEntityStore("EvalAssoSimulation"));
        //do not stop save
        return true;
    },

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {

        try {

            //update the row in NAV_MOB_CUST
            var cd = doc.CustomerDivDetailsStore.getAt(0);
            if (cd) {
                var codCustDeliv = null;
                if (!XApp.isEmptyOrWhitespaceString(cd.get("CODCUSTDELIV")))
                    codCustDeliv = cd.get("CODCUSTDELIV");
                else
                    codCustDeliv = doc.get("CODPARTY");

                if (!XApp.isEmptyOrWhitespaceString(codCustDeliv)) {
                    var row = XNavHelper.getNavRecord("NAV_MOB_CUST", new XConstraint("CODPARTY", "=", doc.get("CODPARTY")));
                    row.set("CODCUSTDELIV", codCustDeliv);
                    //Write changes to cache for NAV_MOB_CUST
                    var nav = XNavHelper.getFromMemoryCache("NAV_MOB_CUST");
                    var key = UserContext.CodUsr + "\\" + UserContext.CodGrp + "_" + UserContext.CodDiv + "\\NAV_MOB_CUST";
                    XCache.putFile(key, nav.toJsonString(),
                        function (e) {
                            XLog.logEx(e);
                        }, Ext.emptyFn);
                }
            }

            //update PoS - delivery customer association
            if (gui.getDocument().get("FLGCUSTSALE") &&
                (UserContext.checkRight("NAV_MOB_PDV_PDC", "NAV_MOB_PDV_PDC", "NAVIGATE") || UserContext.checkRight("NAV_MOB_PDV_PDC", "NAV_MOB_PDV_PDC", "NAVDATA"))) {
                XNavHelper.refreshNav("NAV_MOB_PDV_PDC", XUI.showExceptionMsgBox, function () {
                    XNavHelper.loadNavData("NAV_MOB_PDV_PDC", XUI.showExceptionMsgBox, Ext.emptyFn);
                });
            }

            CommonEngine.updateNavMobAttachmentsCust(gui.getDocument(), onFailure, function () {
                CommonEngine.updateContactsNavigator(gui.getDocument());

                if (onSuccess)
                    onSuccess();
                                });
        } catch (e) {
            if (onFailure)
                onFailure(e);
            return;
        }
    };

    this.onTabControlActiveItemChange = function (context) {
        if (context) {
            if (context.newTab) {
                if (context.newTab.tabName == "ASSORT" && context.isAtFirstLoad) {
                    this._rebindAssoGridStore(context.gui);
                    var assoContext = this._getAssoGridStore(context.gui);

                    //initially sort the grid by NUMPRG
                    assoContext.assoGridStore.sort("NUMPRG", "ASC");
                    //fire the sort event in order for the sorting arrows to refresh
                    assoContext.assoGrid.fireEvent("sort");
                    //show info if new prods have been added
                    if (context.gui.nrNewProds > 0)
                        XUI.showInfoOk({
                            msg: context.gui.nrNewProds + " " + UserContext.tryTranslate("[MOB.TOP_PRODS_UNSORTED]")
                        });
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

    this.validateGridField = function (context) {
        var self = this;
        if (context.newVal == context.oldVal)
            return;
        var entityName = context.rowEntity.getEntityName();
        switch (entityName) {
            case "EvalAssoSimulation":
                //don't reset the product order
                context.detailContext.gui.resetAssoProd = false;
                var assoStore = context.detailContext.entity.getSubEntityStore("EvalAssoSimulation");
                switch (context.fieldName) {
                    case "CODARTCUST":
                        var op = context.rowEntity;
                        var codArtCust = context.newVal;
                        if (codArtCust != "")
                            var duplicateExists = assoStore.findBy(function (prod) {
                                return prod.get("CODARTCUST") == codArtCust && prod.get("NUMPRG") != op.get("NUMPRG");
                            });
                        if (duplicateExists) {
                            context.newVal = context.oldVal;
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.INVALID_CODARTCUST]") });
                        }
                        break;
                    case "NUMPRG":
                        //set the new NUMPRG and shift the other products iteretively
                        var newNumPrg = context.newVal;
                        this._moveProductAt(assoStore, context.rowEntity, newNumPrg);
                        //rebind the sencha store
                        this._rebindAssoGridStore(context.detailContext.gui);
                        break;
                }
                break;
            case "CustomerPartyWeek": {
                var workInterval = context.newVal;
                if (context.rowEntity.getDescription("CODPLAN") == "CONS" || context.rowEntity.getDescription("CODPLAN") == "VISIT") {
                    if (workInterval.indexOf("/") == -1) { //time interval format is 'hh:mm - hh:mm'
                        if (!XApp.timeIntervalIsValid(workInterval))
                            if (!XApp.isEmptyOrWhitespaceString(workInterval)) {
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.ERR_WRONG_PERIOD_FORMAT_VALID_VALUE_'HH:MM - HH:MM']") });
                            context.newVal = context.oldVal;
                        }
                    }
                    else { //time interval format is 'hh:mm - hh:mm / hh:mm - hh:mm'
                        var firstInterval = workInterval.substr(0, workInterval.indexOf("/") - 1).trim();
                        var secondInterval = workInterval.substr(workInterval.indexOf("/") + 1).trim();
                        if (!XApp.timeIntervalIsValid(firstInterval) || !XApp.timeIntervalIsValid(secondInterval)) {
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.ERR_WRONG_2PERIOD_FORMAT_VALID_VALUE_'HH:MM - HH:MM' / 'HH:MM - HH:MM']") });
                            context.newVal = context.oldVal;
                        }
                    }
                }
                else
                    if (context.rowEntity.getDescription("CODPLAN") == "CHIU") {
                        if (workInterval.toUpperCase() != "Y" || workInterval.toUpperCase() != "N") {
                            XUI.showWarnOk({ msg: UserContext.tryTranslate("[MOB.ERR_WRONG__FORMAT_VALID_VALUE_'Y/N']") });
                            context.newVal = context.oldVal;
                        }
                    }
                break;
            }
        }
    };

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";
        var descriptionParts = [];

        descriptionParts.push(doc.get("DESPARTY1"));
        descriptionParts.push("(" + doc.get("CODPARTY") + ")");

        var customerAddr = doc.getSubEntityStore('CustomerAddr').getAt(0);
        if (customerAddr) {
            descriptionParts.push("| " + customerAddr.get("DESLOC1"));
}

        return descriptionParts.join(" ");
    };

}
XApp.registerGuiExtension("mobGuiCustomer", new _mobGuiCustomerExtension());
//#endregion

//#region Geolocation

//Geolocation manager for customer UIs interactions
CustomerUiGeocodeManager = function (uiCtrl) {
    this._ctrl = uiCtrl;
    this._geocoder = null;
};

//Getter for Customer business document
CustomerUiGeocodeManager.prototype.getDocument = function () {
    return this._ctrl.getDocument ? this._ctrl.getDocument() : null;
};

//Lazy initializer for geocoder
CustomerUiGeocodeManager.prototype.getGeocoder = function () {
    if (this._geocoder)
        return this._geocoder;

    try{
        this._geocoder = new google.maps.Geocoder();
    }
    catch (ex) {
        XLog.logEx(ex);
    }

    return this._geocoder;
};

//Getter for CustomerAddr business entity
CustomerUiGeocodeManager.prototype.getCustomerAddress = function (codAddr) {
    var context = {
        ctrl: this._ctrl,
        codAddr: codAddr,
        customerAddr: null,
        cancel: false
    };

    this._ctrl.callCust('beforeGetCustomerAddress', context);
    if (context.cancel)
        return context.customerAddr;

    var document = this.getDocument();

    if (document) {
        if (!XApp.isEmptyOrWhitespaceString(codAddr)) {
            context.customerAddr = document.getSubEntityStore('CustomerAddr').findBy(function (ca) {
                return ca.get('CODADDR') == codAddr;
            });
        }
        else if (document.getSubEntityStore('CustomerAddr').getCount() > 0) {
            context.customerAddr = document.getSubEntityStore('CustomerAddr').getAt(0);
        }
    }

    this._ctrl.callCust('afterGetCustomerAddress', context);

    return context.customerAddr;
};

//Builds the adress for querying geolocation service
CustomerUiGeocodeManager.prototype.buildQueryAddress = function (codAddr) {
    var context = {
        ctrl: this._ctrl,
        codAddr: codAddr,
        address: '',
        cancel: false
    };

    this._ctrl.callCust('beforeBuildQueryAddress', context);
    if (context.cancel)
        return context.address;

    var customerAddr = this.getCustomerAddress(codAddr);
    if (customerAddr) {
        var addrTokens = [customerAddr.get('DESADDR1')];
        if (!XApp.isEmptyOrWhitespaceString(customerAddr.get('DESLOC1')))
            addrTokens.push(customerAddr.get('DESLOC1'));
        if (!XApp.isEmptyOrWhitespaceString(customerAddr.get('CODZIP')))
            addrTokens.push(customerAddr.get('CODZIP'));
        if (!XApp.isEmptyOrWhitespaceString(customerAddr.get('CODPRV')))
            addrTokens.push(customerAddr.get('CODPRV'));
        if (!XApp.isEmptyOrWhitespaceString(customerAddr.get('CODNATION')))
            addrTokens.push(customerAddr.get('CODNATION'));
        context.address = addrTokens.join(', ');
    }

    this._ctrl.callCust('afterBuildQueryAddress', context);

    return context.address;
};

//Checks whether customer address can be geocoded
CustomerUiGeocodeManager.prototype.canGeocodeCustomerAddress = function (codAddr) {
    if (!XApp.checkMapsApi() || !this._ctrl.isEditable()) {
        return false;
    }

    var custAddr = this.getCustomerAddress(codAddr);
    if (!custAddr || XApp.isEmptyOrWhitespaceString(custAddr.get('DESADDR1')))
        return false;

    return true;
}

//Attempts to update coordinates and address starting from a given customer addr
//codAddr is an optional argument which identifies the business entity to be updated; if not provided, the system will fallback on the first one
CustomerUiGeocodeManager.prototype.geocodeCustomerAddress = function (codAddr) {
    var self = this;
    var request = {
        codAddr: codAddr,
        queryAddr: this.buildQueryAddress(codAddr)
    };

    var geocoder = self.getGeocoder();
    if (geocoder) {
        XUI.showWait();
        geocoder.geocode(
            {
                address: request.queryAddr
            },
            function (results, status) {
                XUI.hideWait();
                switch (status) {
                    case 'OK':
                        self.processGeocodeResult(request, results);
                        break;
                    default:
                        XLog.logWarn('CustomerUiGeocodeManager: returned ' + status + ' for ' + request.queryAddr);
                        XUI.showWarnOk({
                            msg: UserContext.tryTranslate('[MOB.GEO.ADDRESSNOTFOUND]')
                        });
                }
            }
        );
    }
};

//Attempts to update coordinates and address starting from the device's current position
//codAddr is an optional argument which identifies the business entity to be updated; if not provided, the system will fallback on the first one
CustomerUiGeocodeManager.prototype.geocodeCurrentPosition = function (codAddr) {
    var self = this;
    XUI.showWait();
    XApp.getCoordinates(function (lat, lng) {
        XUI.hideWait();
        if (MapServices.areValidCoordinates(lat, lng)) {
            if (!UserContext.isFullOfflineMode() && XApp.isOnline()) {
                self._geocodeCurrentPositionOnline(codAddr, lat, lng)
            }
            else {
                self._geocodeCurrentPositionOffline(codAddr, lat, lng)
            }
        }
        else {
            XUI.showErrorMsgBox({ msg: '[MOB.ERR_GET_LOCATION]' });
        }
    });
};

CustomerUiGeocodeManager.prototype._geocodeCurrentPositionOnline = function (codAddr, lat, lng) {
    var self = this;

    var geocoder = self.getGeocoder();
    if (geocoder) {
        XUI.showWait();
        self._geocoder.geocode(
        {
            location: new google.maps.LatLng(lat, lng)
        },
        function (results, status) {
            XUI.hideWait();
            switch (status) {
                case 'OK':
                    var request = {
                        codAddr: codAddr,
                        queryAddr: self.buildQueryAddress(codAddr)
                    };
                    self.processGeocodeResult(request, results);
                    break;
                default:
                    XLog.logWarn('CustomerUiGeocodeManager: returned ' + status + ' for lat=' + lat + ', lng=' + lng);
                    self.assignGeocodeResult(codAddr, { valLatitude: lat, valLongitude: lng }, true);
                    XUI.showErrorMsgBox({
                        msg: UserContext.tryTranslate((status == 'ZERO_RESULTS' ? '[MOB.GEO.NOTFOUND]' : '[MOB.GEO.ERROR]'))
                    });
            }
        });
    }
};

CustomerUiGeocodeManager.prototype._geocodeCurrentPositionOffline = function (codAddr, lat, lng) {
    var self = this;
    self.assignGeocodeResult(codAddr, { valLatitude: lat, valLongitude: lng }, true);

    XUI.showInfoOk({
        msg: UserContext.tryTranslate('[MOB.GEOLOCATION_NOT_AVAILABLE_CURRENT_COORDINATES]') + '<br/> LAT: ' + lat + '<br/> LONG: ' + lng,
        scope: self,
        onResult: function () {
            var document = this.getDocument();
            if (document) {
                var customerAddress = this.getCustomerAddress(codAddr);
                if (customerAddress) {
                    this.showProximityCustomers(document.get('CODPARTY'), customerAddress.get('CODPRV'), lat, lng);
                }
            }
        }
    });
};

//Displays in a user friendly manner addresses returned by geolocation service
CustomerUiGeocodeManager.prototype.processGeocodeResult = function (request, results) {
    var self = this;

    var document = self.getDocument();
    if (!document) {
        return;
    }

    var choices = [{
        result: null,
        msg: UserContext.tryTranslate('[MOB.SELECT_ADDR_ORIG]') + ': ' + request.queryAddr,
        enabled: false
    }];
    for (var i = 0; i < results.length; i++) {
        var res = results[i];

        var addrResult = self._parseResult(res);

        var duplicateRow  = Ext.Array.findBy(choices, function (c) { return c.msg ===  addrResult.formattedAddress });
       
        if(duplicateRow)   
            continue;

        choices.push({
            result:res,
            msg: addrResult.formattedAddress
        });
    }

    XUI.showSelectionPopup({
        voices: choices,
        title: UserContext.tryTranslate('[MOB.SELECT_ADDR]'),
        handler: function (selection) {
            if (selection != null) {              
                self.assignGeocodeResult(request.codAddr, selection.result);

                //check for other customers in the proximity
                var customerAddress = self.getCustomerAddress(request.codAddr);
                var latlng = selection.result.geometry.location;
                if (customerAddress && MapServices.areValidCoordinates(latlng.lat(), latlng.lng())) {
                    self.showProximityCustomers(document.get('CODPARTY'), customerAddress.get('CODPRV'), latlng.lat(), latlng.lng());
                }
            }
        }
    });
};

CustomerUiGeocodeManager.prototype._getDescriptionFromAddrProp = function (context) {
   
    var propDef = XApp.model.getFieldDef('CustomerAddr', context.prop);
    if (!XApp.isEmptyOrWhitespaceString(propDef.qtabs)) {
        var qtab = UserContext.getDecodeTable(propDef.qtabs);
        if (qtab && qtab.hasOwnProperty(context.value)) 
        {
            context.cod= context.value;
            context.des = UserContext.getDecodeTable(propDef.qtabs)[context.value].des;
        }
    }
};

CustomerUiGeocodeManager.prototype._parseResult = function (res) {
    var self = this;
    var addrComponents = {};
  
    //addrRow format: address, streetNr, place, district, zip, country
    var addrRow =[];

    for (var i = 0; i < res.address_components.length; i++) {
        var comp = res.address_components[i];
        addrComponents[comp.types[0]] = comp.short_name;
    }

    var result = {
        desAddr: addrComponents.route || '',
        streetNr: addrComponents.street_number || '',
        desLoc: addrComponents.administrative_area_level_3 || addrComponents.locality || addrComponents.sublocality || '',
        codPrv: addrComponents.administrative_area_level_2 || '',
        codNation: addrComponents.country || '',
        codZip: addrComponents.postal_code || ''
    };

    if (!XApp.isEmptyOrWhitespaceString(result.streetNr))
        result.desAddr += ', ' + result.streetNr;

    if(!XApp.isEmptyOrWhitespaceString(result.desAddr))
        addrRow.push(result.desAddr);

    if(!XApp.isEmptyOrWhitespaceString(result.desLoc))
        addrRow.push(result.desLoc);

    if (!XApp.isEmptyOrWhitespaceString(result.codZip))
        addrRow.push(result.codZip);

    var context = { value: result.codPrv, prop: "CODPRV", cod: '', des: ''};
    self._getDescriptionFromAddrProp(context);
    result.codPrv = context.cod;
    result.desPrv = context.des;
    if(!XApp.isEmptyOrWhitespaceString(result.desPrv))
        addrRow.push(result.desPrv);
   
    context = { value: result.codNation, prop: "CODNATION", cod: '', des: ''};
    self._getDescriptionFromAddrProp(context);
    result.codNation = context.cod;
    result.desNation= context.des;
    if(!XApp.isEmptyOrWhitespaceString(result.desNation))
        addrRow.push(result.desNation);
   
    //valLatitude && valLongitude
    if (res.geometry && res.geometry.location) {
        result.valLatitude = res.geometry.location.lat();
        result.valLongitude = res.geometry.location.lng();
    }
    result.formattedAddress = addrRow.join(', ');
    return result;
};

//Updates the CustomerAddr coordinates and optionally address fields
CustomerUiGeocodeManager.prototype.assignGeocodeResult = function (codAddr, result, coordsOnly) {
    var context = {
        codAddr: codAddr,
        result: result,
        coordsOnly: coordsOnly,
        cancel: false
    };

    this._ctrl.callCust('beforeAssignGeocodeResult', context);
    if (context.cancel)
        return;

    var customerAddr = this.getCustomerAddress(codAddr);
    if (customerAddr) {
        var addrInfo = coordsOnly ? result : this._parseResult(result);
        context.addrInfo = addrInfo;

        customerAddr.set('VALLATITUDE', addrInfo.valLatitude);
        customerAddr.set('VALLONGITUDE', addrInfo.valLongitude);

        if (!coordsOnly) {
            customerAddr.set('DESADDR1', addrInfo.desAddr);
            customerAddr.set('DESLOC1', addrInfo.desLoc);
            customerAddr.set('CODZIP', addrInfo.codZip);

            customerAddr.set('CODPRV', addrInfo.codPrv);
            customerAddr.set('CODNATION', addrInfo.codNation);
        }

        this._ctrl.setModified(customerAddr);
        this._ctrl.refreshGui();
    }

    this._ctrl.callCust('afterAssignGeocodeResult', context);
};

//Displays geographically close customers in the same region (province)
CustomerUiGeocodeManager.prototype.showProximityCustomers = function (codParty, codPrv, lat, lng) {
    XUI.showWait();
    CommonEngine.checkCustomerProximity(codParty, codPrv, lat, lng,
        function (e) {
            XUI.hideWait();
            XLog.logEx(e);
        },
        function (response) {
            XUI.hideWait();
            if (response && response.length > 0) {

                var msgTokens = [UserContext.tryTranslate('[MOB.CUSTOMER_WITH_GEOGRAPH_PROXIMITY]')];
                for (var i = 0; i < response.length; i++) {
                    var proximityCustInfo = response[i];
                    msgTokens.push(proximityCustInfo.CODPARTY + ' - ' + proximityCustInfo.DESPARTY1);
                }

                XUI.showWarnOk({
                    msg: msgTokens.join('<br />')
                });
            }
        });
};

//Creates button configuration for geocoding customer address
CustomerUiGeocodeManager.prototype.buildGeocodeCustAddrBtnCfg = function (codAddr) {
    return {
        iconCls: 'guis_customer_geolocation-position',
        id: this._ctrl.guiName.toLowerCase() + '-contextualmenu-geolocation',
        msg: UserContext.tryTranslate('[' + this._ctrl.guiName.toUpperCase() + '.GEOLOCATE]'),
        enabled: this.canGeocodeCustomerAddress(),
        handler: (function (self) {
            return function () { self.geocodeCustomerAddress(codAddr); }
        })(this)
    };
};

//Creates button configuration for geocoding current position
CustomerUiGeocodeManager.prototype.buildGeocodeCurrPosBtnCfg = function (codAddr) {
    return {
        iconCls: 'guis_customer_geolocation-address',
        id: this._ctrl.guiName.toLowerCase() + '-contextualmenu-geolocation-address',
        msg: UserContext.tryTranslate('[' + this._ctrl.guiName.toUpperCase() + '.USERLOCATION]'),
        enabled: this._ctrl.isEditable(),
        handler: (function (self) {
            return function () { self.geocodeCurrentPosition(codAddr); }
        })(this)
    };
};

//Releases resources
CustomerUiGeocodeManager.prototype.cleanup = function () {
    delete this._ctrl;
};

//#endregion