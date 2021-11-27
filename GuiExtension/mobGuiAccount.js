//#region _mobGuiAccountExtension
function _mobGuiAccountExtension() {

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "CONTACTS":
            case "DIV_INFO":
            case "RESP_INFO":
                sectionContext.entityName = 'CustomerDiv';
                var e = CommonEngine.ensureCustomerDiv(sectionContext.entity);
                sectionContext.entity = e;
                break;
            case "ADDR_INFO":
                sectionContext.entityName = 'CustomerAddr';

                var entity = sectionContext.entity;
                var address = entity.getSubEntityStore("CustomerAddr").findBy(function (addr) { return addr.get("CODADDR") == "1"; });;
                sectionContext.entity = address;
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
                }
                sectionContext.entity = e;
            case "HIERARCHY_INFO":
                if (sectionContext.gui.hierarchyView)
                    sectionContext.gui.hierarchyView.ensureCustomerHierarchyNode(sectionContext);
                break;
        }
    };

    this.preCreateLink = function (context) {
        var entity = context.ctrl.entity,
            tabName = context.ctrl.tabName,
            linkName = context.linkRow.code,
            codLevel = CommonEngine.getAccountHierLevel(UserContext.CodDiv, entity.get("CODPARTY")),
            codHier = UserContext.getConfigParam("CUSTOMERDEFAULTHIER", "COMM");

        switch (tabName) {
            case "ACCOUNTLINKS":
               
                switch (linkName) {
                    case "NAV_MOB_ACCOUNT_OTHEROPPORTUNITIES":
                        context.linkRow.caption = linkName + ".NAV_MOB_OPPORTUNITIES";
                        context.linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [
                            new XConstraint("CODDIV", SqlRelationalOperator.Equal, UserContext.CodDiv),
                            new XConstraint("CODHIER", SqlRelationalOperator.Equal, codHier),
                            new XConstraint("CODPARTY", SqlRelationalOperator.Equal, entity.get("CODPARTY")),
                            new XConstraint("CODLEVEL", SqlRelationalOperator.Equal, codLevel)
                            ]
                        });
                        break;
                    case "NAV_MOB_ACCOUNT_OTHERHIEROPPORTUNITIES":
                        context.linkRow.caption = linkName + ".NAV_MOB_OPPORTUNITIES";
                        if (XApp.isEmptyOrWhitespaceString(codLevel)) {
                            context.canceled = true;
                           return;
                        }

                        context.linkRow.hcs = SalesExecutionEngine.buildHierOpportunitiesContr(UserContext.CodDiv, entity.get("CODPARTY"), codLevel);
                        break;
                }
                break;
        }
    };

    this.afterLoadDocument = function (gui) {
        var doc = gui.getDocument();
        var customerHierarchyRow = HierarchicalNodeManager.getCustomerHierarchyViewRow(doc.get("CODPARTY"));
        if (customerHierarchyRow != null) {
            st = doc.createSubEntityStore("HierarchicalNode", "CurrentHierarchicalNode");
            st.add(HierarchicalNodeManager.createHierarchicalNodeEntity(customerHierarchyRow));
        }
    };


    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        var descriptionParts = [];

        descriptionParts.push(doc.get("DESPARTY1") + " " + "(" + doc.get("CODPARTY") + ")");

        var cAddr = doc.getSubEntityStore('CustomerAddr').findBy(function (r) {
            return r.get("CODADDR") == '1';
        });
        if (cAddr) {
            descriptionParts.push(cAddr.get("DESLOC1"));
        }

        return descriptionParts.join(" | ");

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
        }
    };

    this.validateEntity = function (detailContext) {
        var entity = detailContext.entity;
        switch (detailContext.entityName) {
            case "CustomerPartyContact":
                return !XApp.isEmptyOrWhitespaceString(entity.get("CODROLE1"));
        }
        return true;
    };

    this.validateDocument = function (gui) {
        var doc = gui.getDocument();
        var cdiv = doc.getSubEntityStore('CustomerDiv').findBy(function (r) {
            return r.get("CODDIV") == UserContext.CodDiv;
        });
        CommonEngine.validateCustomerPartyContact(gui, cdiv);
    };

    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.sectionContext.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (context.fieldConfig.attrs['name']) {
            case "CODPARTY":
            case "DESPARTY1":
            case "CODCATDIV1":
            case "CODCATDIV2":
            case "CODCATDIV3":
            case "CODABC":
                var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                field.setLabel(desField);
                break;
        }
        return field;
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
            case "CustomerAddr":
                switch (fieldName) {
                    case "CODPRV":
                        fieldContext.voices = SalesForceEngine.getProvincesByNation(fieldContext.sectionContext.entity.get("CODNATION"));
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
        switch (selName) {
            case "NAV_MOB_CONTACTS":
                CommonEngine.filterCustomerPartyContactSelector(gui, selName, config);
                break;
        }
    };

    this.afterSectionCreated = function (context) {
        var sectionConfig = context.sectionConfig;
        var sectionName = sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "MAP":
                var panel = context.panel;
                var mapPanel = this._createMap(context.gui.getDocument());
                panel.setDocked('');
                panel.mapPanel = panel.add(mapPanel);
                panel.setCls(context.panel.getCls() + ' sm1-routemapsection');
                break;
        }
    };

    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        switch (fieldName) {
            case "CODPRV":
                context.valid = context.valid && SalesForceEngine.validateProvince(context.sectionContext.entity);
                break;
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newValue) {
        var detailContext = ctrl.fieldContext.sectionContext.detailContext;
        var sectionContext = ctrl.fieldContext.sectionContext;
        var entity = ctrl.fieldContext.sectionContext.entity;

        switch (fieldName) {
            case "CODNATION":
                SalesForceEngine.initializeProvincesCombo(detailContext.fields["CODPRV"], newValue);
                break;
            case "FLGPRIMARY":
                CommonEngine.updateCustomerPartyContactFlgPrimary(sectionContext);
                break;
        }
    };

    /* Syncs navigator with account document*/
    this._updateNavMobAccount = function (doc, onFailure, onSuccess) {

        var navId = "NAV_MOB_ACCOUNTS";

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

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            this._updateNavMobAccount(doc, onFailure, function () {
                CommonEngine.updateNavMobAttachmentsCust(doc, onFailure, function () {
                    CommonEngine.updateContactsNavigator(doc);
                    if (onSuccess)
                        onSuccess();
                });
            });
        } catch (e) {
            if (onFailure)
                onFailure(e);
            return;
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
                }
            }
        }
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
                self._renderAccountOnMap(document);

                map.fitIfBounded();
                XUI.hideWait();
                panel.show();
            }, 100);
        } else
            panel.hide();
    };

    this._refreshMap = function (gui) {
        var self = this;
        var detailContext = gui.tabCtrls["MAP"];
        if (!detailContext)
            return;
        self._fillMap(detailContext.sections["MAP"].mapPanel, XMap.getInstance(), gui.getDocument());
    };

    this._renderAccountOnMap = function (entity) {

        var self = this,
            customerMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.ACCOUNT);
        XMap.getInstance().clearMarkers();

        var addr = entity.getSubEntityStore("CustomerAddr").getAt(0);
        if (addr) {
            var valLat = addr.get("VALLATITUDE");
            var valLong = addr.get("VALLONGITUDE");
        }

        if (MapServices.areValidCoordinates(valLat, valLong)) {
            var gpos = new google.maps.LatLng(valLat, valLong);

            XMap.getInstance().createMarker(gpos, null, null, customerMarker.icon, function (entity) {
                return function (marker) {
                    self._onAccountMarkerClick(marker, entity);
                }
            }(entity));
            XMap.getInstance().extendBounds(gpos);
        }
    }

    this._onAccountMarkerClick = function (marker, document) {
        //default address for current account
        var addr = document.getSubEntityStore("CustomerAddr").getAt(0);

        var mainPanel = new Ext.Panel({
            layout: {
                type: 'vbox'
            },
            cls: 'sm1-pharma-cust-balloon',
            items: [
                {
                    xtype: 'component',
                    html: document.get("DESPARTY1"),
                    cls: 'sm1-pharma-cust-balloon-title'
                },
                {
                    xtype: 'component',
                    html: addr ? addr.get("DESADDR1") + " " + addr.get("DESLOC1") : "",
                }
            ]
        });
        XMap.showMarkerPopup(marker, mainPanel);
    };

    this.getMenuButtons = function (context) {
        var self = this;

        var custRow = context.ctrl.openData.selectedNavRow;
        var ctrl = context.ctrl;

        self._geocodeManager = new CustomerUiGeocodeManager(context.ctrl);
        self.geoLocateBtn = self._geocodeManager.buildGeocodeCustAddrBtnCfg();
        context.buttons.push(self.geoLocateBtn);
        context.buttons.push(self._geocodeManager.buildGeocodeCurrPosBtnCfg());

        //new opportunity
        var hasNewOpportunityRight = UserContext.checkRight("NAV_MOB_OPPORTUNITIES", "NAV_MOB_OPPORTUNITIES", "NEW");
        if (hasNewOpportunityRight) {
            context.buttons.push({
                msg: UserContext.tryTranslate("[MOB.NEW_OPPORTUNITY]"),
                id: 'mobguiaccount-contextualmenu-new-opportunity',
                iconCls: 'navs_opportunities_navbar_newopportunity_23',
                handler: (function (ctrl) {
                    return function () {
                        var context = {
                            ctrl: ctrl,
                            canceled: false
                        };

                        XApp.callCust("guiCustomizer", "mobGuiAccount", 'beforeNewOpportunity', context);
                        if (context.canceled)
                            return;

                        var doc = ctrl.docStore.getAt(0);

                        XHistory.go({
                            controller: app.getSM1Controllers().gui,
                            action: 'show',
                            docName: 'Opportunity',
                            guiName: 'mobGuiOpportunity',
                            navId: "NAV_MOB_OPPORTUNITIES",
                            openMode: 'NEW',
                            codHier: UserContext.getConfigParam("CUSTOMERDEFAULTHIER", "COMM"),
                            codAccount: doc.get("CODPARTY"),
                            codLevel: CommonEngine.getAccountHierLevel(doc.get("CODDIV"), doc.get("CODPARTY"))
                        });

                        XApp.callCust("guiCustomizer", "mobGuiVisit", 'afterNewOpportunity', context);
                    };
                })(ctrl)
            });
        }
        
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
    };

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;

        if (gui.hierarchyView)
            gui.hierarchyView.destroy();
    };


    this.getYammerRefNode = function (context) {
        var account = context.detailGui.entity;
        var idLevel = CommonEngine.getAccountHierLevel(account.get("CODDIV"), account.get("CODPARTY"))
        //if the account is not in the hierarchy, set a value in order to display the current account yammer feed       
        if (XApp.isEmptyOrWhitespaceString(idLevel))
            idLevel = -1;
        
        context.codNode = account.get("CODPARTY");
        context.hierLevel = idLevel;
    };

}
XApp.registerGuiExtension("mobGuiAccount", new _mobGuiAccountExtension());
//#endregion