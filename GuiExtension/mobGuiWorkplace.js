//#region _mobGuiWorkplaceExtension
function _mobGuiWorkplaceExtension() {
    this._showPharma = false;
    this.linksWaitCounter = 0;

    this.getMenuButtons = function (context) {
        this._geocodeManager = new CustomerUiGeocodeManager(context.ctrl);
        this.geoLocateBtn = this._geocodeManager.buildGeocodeCustAddrBtnCfg('1');
        context.buttons.push(this.geoLocateBtn);
        context.buttons.push(this._geocodeManager.buildGeocodeCurrPosBtnCfg('1'));
    };

    this.preNewDocument = function (gui, options) {
        gui.docStore = new XStore({ entityName: 'Customer' });
        gui.docStore.add(options.newCustomerData.newCust);
        return false;
    };

    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "MAIN_INFO":
                var e = sectionContext.entity.getSubEntityStore("CustomerDiv").findBy(function (e) {
                    return e.get("CODDIV") == UserContext.CodDiv;
                });

                if (sectionContext.gui.openMode == "NEW") {
                    var parentWpCode = e.get("CODWPPARENTLEVEL");
                    if (!XApp.isEmptyOrWhitespaceString(parentWpCode)) {
                        var parentWp = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(parentWpCode));
                        var wplevel = parentWp.get("IDWPLEVEL") - 1;
                        e.set("IDWPLEVEL", wplevel);
                    }
                }
                break;
            case "ADDR_INFO":
                var e = sectionContext.entity.getSubEntityStore("CustomerAddr").findBy(function (e) {
                    return e.get("CODADDR") == "1";
                });

                if (e == undefined) {
                    e = new XEntity({ entityName: 'CustomerAddr' });
                    e.set("CODPARTY", sectionContext.entity.get("CODPARTY"));
                    e.set("CODADDR", "1");
                    sectionContext.entity.getSubEntityStore('CustomerAddr').add(e);
                }
                sectionContext.entity = e;
                break;
        }
    };

    this.preCreateLink = function (context) {
        this._createLinkedDocsHiddenConstraints(context.ctrl.entity, context.linkRow);
    };

    this._createLinkedDocsHiddenConstraints = function (workplace, linkRow) {

        switch (linkRow.type) {
            case "NAVLINK":

                linkRow.caption = linkRow.code;
                var doctors = CommonEngine.getDoctorsLinkedToWorkplace(workplace.get("CODPARTY"), true);

                switch (linkRow.code) {
                    case "NAV_MOB_WORKPLACE_DOCTORS":
                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [
                                new XConstraint("CODPARTY", SqlRelationalOperator.In, doctors),
                                new XConstraint("FLGPRIMARY", SqlRelationalOperator.Equal, true)
                            ]
                        });
                        break;
                    case "NAV_MOB_WORKPLACE_PHARMACIES":
                        var pharmacies = CommonEngine.getPharmaciesLinkedToWpHierarchy(workplace.get("CODPARTY"));

                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [new XConstraint("CODPARTY", SqlRelationalOperator.In, pharmacies)]
                        });
                        break;
                    case "NAV_MOB_WORKPLACE_VISITS":
                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [new XConstraint("CODSTRUCTURE", SqlRelationalOperator.Equal, workplace.get("CODPARTY")),
                                          new XConstraint("CODUSR", SqlRelationalOperator.Equal, UserContext.CodUsr)]
                        });
                        linkRow.implicitFilter = false;
                        break;
                    case "NAV_MOB_WORKPLACE_SAMPLEORDERS":
                        var ordersDoctors = CommonEngine.getDoctorsLinkedToWorkplace(workplace.get("CODPARTY"), false);

                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [new XConstraint("CODCUSTDELIV", SqlRelationalOperator.In, ordersDoctors),
                                          new XConstraint("FLGANN", SqlRelationalOperator.NotEqual, true),
                                          new XConstraint("CODTYPORD", SqlRelationalOperator.Equal, SalesForceNameSpace.OrderCTORD.SAMPLE)]
                        });
                        break;
                    case "NAV_MOB_WORKPLACE_PHARMAEVENTS_ON_WORKPLACE":
                        var wpHierarchy = CommonEngine.getChildrenWorkplacesCodes(workplace.get("CODPARTY"));
                        wpHierarchy.push(workplace.get("CODPARTY"));

                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [new XConstraint("CODLOC", SqlRelationalOperator.In, wpHierarchy)]
                        });
                        break;
                    case "NAV_MOB_WORKPLACE_PHARMAEVENTS_ON_DOCTORS":
                        var constraints = new XConstraints({
                            logicalOp: "OR"
                        });

                        for (var item in doctors) {
                            var doctor = XNavHelper.getFromMemoryCache("NAV_MOB_DOCTORS").findByKey(CommonEngine.buildCustomerKey(doctors[item]));
                            if (doctor)
                                constraints.Constraints.push(SalesExecutionEngine.buildDoctorEventConstraints(doctor, "CODPARTY"));
                        }

                        //if there are no constraints force it to display nothing
                        if (constraints.Constraints.length == 0)
                            constraints.Constraints.push(new XConstraint("IDEVENT", SqlRelationalOperator.In, []));
                        linkRow.hcs = constraints;
                        break;
                    case "NAV_MOB_WORKPLACE_STUDIES":
                        linkRow.hcs = new XConstraints({
                            logicalOp: "AND",
                            constraints: [new XConstraint("CODPARTY", SqlRelationalOperator.In, doctors)]
                        });
                        break;
                }
                break;

            case "NAVLINKDASH":
                // setting initVars for the 'MOB_WP_PH_SALES_DASHBOARD' dashboard
                if (linkRow.dashName == "MOB_WP_PH_SALES_DASHBOARD") {
                    linkRow.filters = {
                        "CODPARTY": workplace.get("CODPARTY")
                    };
                }
                break;
        }
    };

    this._createWorkplaceTree = function (hierarchyNodes, rootCode) {
        var childrenByCode = {}; // for each node we store the codes of all children
        var nodes = {};          // the actual store for all nodes of the tree
        var i, workplace;
        var root = {};

        //build child arrays and initial nodes array
        for (i = 0; i < hierarchyNodes.length; i++) {
            workplace = hierarchyNodes[i];

            nodes[workplace.get("CODPARTY")] = { text: workplace.get("DESPARTY1"), name: workplace.get("CODPARTY"), children: [] };
            if (workplace.get("IDWPLEVEL") == "1")
                nodes[workplace.get("CODPARTY")].isLastLevel = true;

            if (workplace.get("CODPARTY") == rootCode) {
                root = nodes[workplace.get("CODPARTY")];
            }
            else if (childrenByCode[workplace.get("CODWPPARENTLEVEL")] === undefined) {
                childrenByCode[workplace.get("CODWPPARENTLEVEL")] = [workplace.get("CODPARTY")];
            } else {
                childrenByCode[workplace.get("CODWPPARENTLEVEL")].push(workplace.get("CODPARTY"));
            }
        }
        //the actual build of the tree
        function expand(code) {
            if (childrenByCode[code] !== undefined) {
                for (var i = 0; i < childrenByCode[code].length; i++) {
                    var childId = childrenByCode[code][i];
                    nodes[code].children.push(expand(childId));
                }
            }
            else {
                nodes[code].leaf = true;
                delete nodes[code].children;
            }
            return nodes[code];
        }
        return expand(root.name);
    };

    this.afterSectionCreated = function (context) {
        var self = this;
        try {
            var sectionName = context.sectionConfig.attrs["caption"];
            switch (sectionName) {
                case "MAP":
                    var panel = context.panel;
                    var mapPanel = this._createMap(context.gui.getDocument());
                    panel.setDocked('');
                    panel.mapPanel = panel.add(mapPanel);
                    panel.setCls(panel.getCls() + ' sm1-routemapsection');
                    break;
                case "HIERARCHY": {
                    var currentWorkplace = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(context.gui.getDocument().get("DOCUMENTKEY"));
                    if (currentWorkplace != undefined) {
                        var rootCode = currentWorkplace.get("CODWPLEV4");

                        var hierarchyNodes = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").filterByConstraints(new XConstraints({
                            constraints: [new XConstraint("CODWPLEV4", "=", rootCode)]
                        }));

                        var docKeyChildWP = "";
                        if (context.gui.openData.backFromNewDocument != undefined && context.gui.openData.backFromNewDocument.guiName.toUpperCase() == "MOBGUIWORKPLACE") {
                            docKeyChildWP = context.gui.openData.backFromNewDocument.docKey;
                            var workplace = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(docKeyChildWP);
                            var parentWpCode = workplace.get("CODWPPARENTLEVEL");
                        }

                        var selNode = this._isWpInHierarchy(rootCode, parentWpCode) ? parentWpCode : context.gui.getDocument().get("CODPARTY");

                        //add the treeStore used for workplace hierarchy
                        this.treeStore = Ext.create('Ext.data.TreeStore', { root: this._createWorkplaceTree(hierarchyNodes, rootCode) });
                        var breadCrumb = Ext.create('Ext.ux.XBreadcrumb', {
                            store: this.treeStore,
                            selection: this.treeStore.findNode("name", selNode),
                            collapsed: !XApp.isEmptyOrWhitespaceString(parentWpCode) ? false : true,
                            title: UserContext.tryTranslate("[MOBGUIWORKPLACE.HIERARCHY]"),
                            newButtonListeners: {
                                onPress: function (btn, ev) {
                                    var selectedNode = this.getSelection();
                                    var codparty = selectedNode.getData().name;

                                    XHistory.go({
                                        controller: app.getSM1Controllers().newCustomer,
                                        action: 'show',
                                        navId: "NAV_MOB_WORKPLACES",
                                        parentWorkplace: codparty,
                                        skipNewCustPopup: true,
                                    });
                                }
                            },
                            selectionChanged: function (selectedNode) {
                                if (this.getParent()) {
                                    var links = this.getParent().sectionContext.linkData;
                                    var workplace = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(selectedNode.getData().name));

                                    //refresh links hidden constraints on selection change
                                    var linkCtrls = this.getParent().sectionContext.ctrls;
                                    var waitCounter = 0;
                                    XUI.showWait();
                                    for (var linkName in linkCtrls) {
                                        if (linkCtrls.hasOwnProperty(linkName)) {
                                            var link;
                                            var linkCtrl = linkCtrls[linkName];
                                            var isDashboard = linkCtrl.showMode == "dash";

                                            self.linksWaitCounter = Ext.Object.getSize(linkCtrls);

                                            if (isDashboard) {
                                                link = links.find(function (item) { return item.dashName == linkName });
                                            } else {
                                                link = links.find(function (item) { return item.code == linkName });
                                            }

                                            self._createLinkedDocsHiddenConstraints(workplace, link);
                                            linkCtrl.hiddenConstraints = link.hcs;
                                            //resetting dashboard's initial variables
                                            if (isDashboard && linkCtrl.dashParams)
                                                linkCtrl.dashParams.initVars = link.filters;

                                            linkCtrl.refresh(function (control, isDashboard, workplace, context) {
                                                return function () {
                                                    if (!isDashboard)
                                                        context.createCustomSorters(control, workplace);
                                                }
                                            }(linkCtrl, isDashboard, workplace, self));
                                        }
                                    }
                                }
                            }
                        });
                        breadCrumb._newButton.setDisabled(UserContext.checkRight("NAV_MOB_WORKPLACES", "NAV_MOB_WORKPLACES", "NEW") == false);
                        context.panel.add(breadCrumb);

                        var linkCtrls = context.panel.sectionContext.ctrls;
                        for (var linkName in linkCtrls) {
                            if (linkCtrls.hasOwnProperty(linkName) && linkCtrls[linkName].navType == "NAV") {
                                self.createCustomSorters(linkCtrls[linkName], currentWorkplace);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            XLog.logErr("Error in afterSectionCreated for section " + sectionName);
            XUI.showExceptionMsgBox(e);
        }

    };

    this.createCustomSorters = function (control, workplace) {
        var self = this;
        if (control.navStore.sorters)
            control.navStore.sorters.removeAll();

        switch (control.navId) {
            case "NAV_MOB_DOCTORS":
                control.navStore.setSorters([
                    Ext.create('Ext.util.Sorter', {
                        sorterFn: function (record1, record2) {
                            if (record1.get("MAINWPCODPARTY") == workplace.get("CODPARTY"))
                                return 1;
                            else if (record2.get("MAINWPCODPARTY") == workplace.get("CODPARTY"))
                                return -1;
                        },
                        direction: 'DESC'
                    })
                ]);
                break;
            case "NAV_MOB_PHARMACIES":
                var table = [];
                Ext.Array.each(XNavHelper.getFromMemoryCache("NAV_MOB_PDV_PDC").Rows, function (item) {
                    if (item.get("CODCUSTDELIV") == workplace.get("CODPARTY") &&
                        item.get("CODTYPRELATIONSHIP") == CommonNameSpace.CustomerRel.PharmaciesWorkPlaces &&
                        !item.get("FLGANN"))
                        table.push(item.get("CODPARTY"));
                });

                if (table.length < 0)
                    return;

                control.navStore.setSorters([
                    Ext.create('Ext.util.Sorter', {
                        sorterFn: function (record1, record2) {
                            if (table.indexOf(record1.get("CODPARTY")) >= 0)
                                return 1;
                            else if (table.indexOf(record2.get("CODPARTY")) >= 0)
                                return -1;
                        },
                        direction: 'DESC'
                    })
                ]);
                break;
            case "NAV_MOB_PHARMA_EVENTS":
                if (control.options.caption == "NAV_MOB_WORKPLACE_PHARMAEVENTS_ON_WORKPLACE")
                    control.navStore.setSorters([
                       Ext.create('Ext.util.Sorter', {
                           sorterFn: function (record1, record2) {
                               if (record1.get("CODLOC") == workplace.get("CODPARTY"))
                                   return 1;
                               else if (record2.get("CODLOC") == workplace.get("CODPARTY"))
                                   return -1;
                           },
                           direction: 'DESC'
                       })
                    ]);
                else {
                    var table = [];
                    Ext.Array.each(XNavHelper.getFromMemoryCache("NAV_MOB_PDV_PDC").Rows, function (item) {
                        if (item.get("CODCUSTDELIV") == workplace.get("CODPARTY") &&
                            item.get("CODTYPRELATIONSHIP") == CommonNameSpace.CustomerRel.DoctorsWorkplaces &&
                            item.get("FLGPRIMARY") &&
                            !item.get("FLGANN"))
                            table.push(item.get("CODPARTY"));
                    });

                    var doctors = XNavHelper.getFromMemoryCache("NAV_MOB_PHARMAEVENTPARTY");
                    if (!doctors)
                        return;

                    var events = [];
                    Ext.Array.each(doctors.Rows, function (item) {
                        if (table.indexOf(item.get("CODPARTY")) >= 0)
                            events.push(item.get("IDEVENT"));
                    });

                    control.navStore.setSorters([
                    Ext.create('Ext.util.Sorter', {
                        sorterFn: function (record1, record2) {
                            if (events.indexOf(record1.get("IDEVENT")) >= 0)
                                return 1;
                            else if (events.indexOf(record2.get("IDEVENT")) >= 0)
                                return -1;
                        },
                        direction: 'DESC'
                    })
                    ]);
                }
                break;
        }
        //need to refresh the navList so the sorters are applied
        control.navList.refresh();
        if (--self.linksWaitCounter == 0)
            XUI.hideWait();
    };

    this._isWpInHierarchy = function (rootCode, parentWpCode) {

        var wpHierarchy = CommonEngine.getChildrenWorkplacesCodes(rootCode);
        wpHierarchy.push(rootCode);

        if (!XApp.isEmptyOrWhitespaceString(parentWpCode)) {
            var isInHierarchy = (wpHierarchy.indexOf(parentWpCode) > -1);

            if (isInHierarchy)
                return true;
            else
                return false;
        }
        else
            return false;

    };

    this.onSaveDocument = function (gui, doc, onSuccess) {
        this._populateWpHierarchy(gui);
        // skip New Workplace pop-up
        if (XHistory.hist.length > 2) {
            for (var i = 0; i < XHistory.hist.length - 1; i++) {
                if (XHistory.hist[i].skipNewCustPopup == true) {
                    XHistory.hist.splice(i, 1);
                    i--;
                }
            }
        }

        onSuccess(); //continue save
    };

    this._populateWpHierarchy = function (gui) {

        var workplace = gui.getDocument();
        var codParty = workplace.get("CODPARTY");
        var wplevel = workplace.get("IDWPLEVEL");
        var parentWPcode = workplace.get("CODWPPARENTLEVEL");

        var parentWP = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(parentWPcode));

        var cdiv = CommonEngine.ensureCustomerDiv(workplace);
        for (var i = 1 ; i <= 4; i++) {
            var codwplev = parentWP != undefined ? parentWP.get("CODWPLEV" + i) : "";
            cdiv.set("CODWPLEV" + i, codwplev);
        }
        cdiv.set("CODWPLEV" + wplevel, codParty);
    };

    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.sectionContext.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (context.fieldConfig.attrs['name']) {
            case "CODPARTY":
            case "DESPARTY1":
                var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                field.setLabel(desField);
                break;
            case "CODWPPARENTLEVEL":
                field.hiddenConstraints = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                    new XConstraint("CODPARTY", SqlRelationalOperator.NotEqual, context.detailContext.entity.get("CODPARTY")),
                    new XConstraint("IDWPLEVEL", SqlRelationalOperator.Greater, 1),
                    ]
                });
                break;

        }
        return field;
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        var detailContext = fieldContext.sectionContext.detailContext;
        switch (fieldContext.sectionContext.entityName) {
            case "CustomerAddr":
                switch (fieldName) {
                    case "CODPRV":
                        fieldContext.voices = SalesForceEngine.getProvincesByNation(fieldContext.sectionContext.entity.get("CODNATION"));
                        break;
                }
                break;
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
                if (context.newTab.tabName == "MAP" && !context.isAtFirstLoad) {
                    this._refreshMap(context.gui);
                }
            }
        }
    };

    this.onEditEnding = function (ctrl, fieldName, newVal, oldVal) {
        var context = ctrl.fieldContext.sectionContext;
        var detailContext = context.detailContext;
        var gui = context.gui;
        var entity = context.entity;
        var workplace = gui.getDocument();

        switch (fieldName) {
            case "CODWPPARENTLEVEL":
                var parentWp = detailContext.fields.CODWPPARENTLEVEL.selectedNavRow.get("CODPARTY");
                var selectedWp = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(parentWp));
                var wplevel = selectedWp.get("IDWPLEVEL") - 1;
                workplace.set("IDWPLEVEL", wplevel);
                break;
            case "IDWPLEVEL":
                var parentLevel = parseInt(workplace.get("IDWPLEVEL")) + 1;
                var cs = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                    new XConstraint("CODPARTY", SqlRelationalOperator.NotEqual, workplace.get("CODPARTY")),
                    new XConstraint("IDWPLEVEL", SqlRelationalOperator.Greater, 1),
                    ]
                });

                if (!isNaN(parentLevel) || parentLevel === 0) {
                    var c = new XConstraint("IDWPLEVEL", SqlRelationalOperator.Equal, parentLevel);
                    cs.add(c);
                }
                detailContext.fields.CODWPPARENTLEVEL.hiddenConstraints = cs;

                workplace.set("CODWPPARENTLEVEL", "");
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
        }
    };

    this.afterLoadDocument = function (gui) {
        var doc = gui.getDocument();
        this._addPharmaciesStore(doc);
    };

    this.setFieldStatus = function (context) {
        var isWorkplaceNew = context.gui.gui.openMode == "NEW" ? true : false;
        switch (context.fieldName) {
            case "IDWPLEVEL":
                context.editable = isWorkplaceNew;
                break;
            case "CODWPPARENTLEVEL":
                context.editable = isWorkplaceNew && context.gui.entity.get("IDWPLEVEL") != 4;
                context.valid = context.gui.entity.get("CODWPPARENTLEVEL") != 0 || context.gui.entity.get("IDWPLEVEL") == 4;
                break;
            case 'DESADDR1':
                if (this.geoLocateBtn && this._geocodeManager)
                    this.geoLocateBtn.enabled = this._geocodeManager.canGeocodeCustomerAddress('1');
                break;
            case "CODPRV":
                context.valid = context.valid && SalesForceEngine.validateProvince(context.sectionContext.entity);
                break;
        }
    };

    this.validateDocument = function (gui) {
        if (gui.errorReports.CODPARTY)
            gui.errorReports.CODPARTY.caption = UserContext.tryTranslate("[MOBGUIWORKPLACE.CUSTOMER.CODPARTY]");
        if (gui.errorReports.DESPARTY1)
            gui.errorReports.DESPARTY1.caption = UserContext.tryTranslate("[MOBGUIWORKPLACE.CUSTOMER.DESPARTY1]");
    };

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            var self = this;
            var guiDoc = gui.getDocument();

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

    /* Syncs NAV_MOB_DOCTORS/NAV_MOB_DOCTORS_WORKPLACES with workplace document*/
    this._updateNavMobDoctorsWorkPlaces = function (workplaceDoc, navId, onFailure, onSuccess) {
        var doctorsWorkPlacesNav = XNavHelper.getFromMemoryCache(navId);
        if (!doctorsWorkPlacesNav || !(navId == "NAV_MOB_DOCTORS" || navId == "NAV_MOB_DOCTORS_WORKPLACES"))
            onSuccess();

        var doctorsWorkPlacesNavRows = [];

        if (navId == "NAV_MOB_DOCTORS") {
            doctorsWorkPlacesNavRows = doctorsWorkPlacesNav.filterByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("WPCODPARTY", SqlRelationalOperator.Equal, workplaceDoc.get("CODPARTY")),
                    new XConstraint("FLGPRIMARY", SqlRelationalOperator.Equal, -1)
                ]
            }));
        }
        else {
            doctorsWorkPlacesNavRows = doctorsWorkPlacesNav.filterByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("WPCODPARTY", SqlRelationalOperator.Equal, workplaceDoc.get("CODPARTY"))
                ]
            }));
        }

        var cdiv = workplaceDoc.getSubEntityStore("CustomerDiv").getAt(0);
        var addr = workplaceDoc.getSubEntityStore("CustomerAddr").getAt(0);

        var wp = XNavHelper.getFromMemoryCache("NAV_MOB_WORKPLACES").findByKey(CommonEngine.buildCustomerKey(cdiv.get("CODWPLEV4")));
        if (wp) {
            var rootDesparty = wp.get("DESPARTY1");
        }

        for (var i = 0; i < doctorsWorkPlacesNavRows.length; i++) {
            var navRow = doctorsWorkPlacesNavRows[i];

            navRow.set("WPCODPARTY", workplaceDoc.get("CODPARTY"));
            navRow.set("WPDESPARTY1", workplaceDoc.get("DESPARTY1"));
            navRow.set("WPROOTDESPARTY1", rootDesparty);
            navRow.set("WPDESADDR1", addr.get("DESADDR1"));
            navRow.set("WPDESLOC1", addr.get("DESLOC1"));
            navRow.set("WPCODZIP", addr.get("CODZIP"));
            navRow.set("WPCODNATION", addr.get("CODNATION"));
        }
        XNavHelper.updateCache(navId, doctorsWorkPlacesNav, onFailure, onSuccess);
    };

    this._addPharmaciesStore = function (doc) {

        var codParty = doc.get("CODPARTY");

        var st = doc.createSubEntityStore("Customer", "WorkplaceToPharma");

        var rows = XNavHelper.getNavRecords("NAV_MOB_PDV_PDC", new XConstraints({
            logicalOp: "AND",
            constraints: [
                new XConstraint("CODDIV", "=", UserContext.CodDiv),
                new XConstraint("CODCUSTDELIV", "=", codParty),
                new XConstraint("CODTYPRELATIONSHIP", "=", CommonNameSpace.CustomerRel.PharmaciesWorkPlaces),
            ]
        }));

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var c = new XEntity({ entityName: 'Customer', data: { CODPARTY: r.get("CODPARTY") } });
            st.add(c);
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

                var leftPanel = new Ext.Panel({
                    layout: {
                        type: 'vbox'
                    },
                    items: [
                        new XChk({
                            cls: 'sm1-workplace-pharma-chk',
                            checked: self._showPharma,
                            label: UserContext.tryTranslate("[MOB.WORKPLACE.SHOW_PHARMA]"),
                            listeners: {
                                check: function () {
                                    self._showPharma = true;
                                    self._renderCustomersOnMap(document);
                                    map.fitIfBounded();
                                },
                                uncheck: function () {
                                    self._showPharma = false;
                                    self._renderCustomersOnMap(document);
                                    map.fitIfBounded();
                                }
                            }
                        }),
                        map.createLegendControl([CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.WORKPLACE), CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.WPPHARMACY)])
                    ]
                });
                map.addControlToGoogleMap(leftPanel, google.maps.ControlPosition.LEFT_TOP);

                self._renderCustomersOnMap(document);

                map.fitIfBounded();
                panel.show();
                XUI.hideWait();
            }, 100);
        } else
            panel.hide();
    };

    this._renderCustomersOnMap = function (entity) {

        var self = this;
        XMap.getInstance().clearMarkers();

        self._renderWorkplaceOnMap(entity);

        if (self._showPharma) {
            self._renderPharmaciesOnMap(entity);
        }

    };

    this._renderWorkplaceOnMap = function (entity) {
        var self = this,
            wpMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.WORKPLACE);
        var addr = entity.getSubEntityStore("CustomerAddr").findBy(function (addr) {
            return addr.get("CODADDR") == "1";
        });
        if (addr) {
            var valLat = addr.get("VALLATITUDE"),
                valLong = addr.get("VALLONGITUDE");
            if (MapServices.areValidCoordinates(valLat, valLong)) {
                var gpos = new google.maps.LatLng(valLat, valLong);
                XMap.getInstance().createMarker(gpos, null, null, wpMarker.icon, function (addr) {
                    return function (marker) {
                        self._onWorkplaceMarkerClick(marker, addr);
                    }
                }(addr));
                XMap.getInstance().extendBounds(gpos);
            }
        }
    };

    this._renderPharmaciesOnMap = function (entity) {
        var self = this,
            pharmacyMarker = CommonEngine.getMarkerInfo(CommonNameSpace.MarkerType.WPPHARMACY);

        if (!entity.WorkplaceToPharmaDetailsStore)
            return;

        entity.WorkplaceToPharmaDetailsStore.each(function (cust) {
            var codParty = cust.get("CODPARTY");
            var customerRow = XNavHelper.getFromMemoryCache("NAV_MOB_PHARMACIES").findByKey(CommonEngine.buildCustomerKey(codParty));
            if (customerRow) {
                var valLat = customerRow.get("VALLATITUDE"),
                    valLong = customerRow.get("VALLONGITUDE");
                if (MapServices.areValidCoordinates(valLat, valLong)) {
                    var gpos = new google.maps.LatLng(valLat, valLong);

                    XMap.getInstance().createMarker(gpos, null, null, pharmacyMarker.icon, function (customerRow) {
                        return function (marker) {
                            self._onPharmacyMarkerClick(marker, customerRow);
                        }
                    }(customerRow));
                    XMap.getInstance().extendBounds(gpos);
                }
            }
        });
    };

    this._onWorkplaceMarkerClick = function (marker, workplaceAddr) {
        var doc = workplaceAddr.getParentEntity();
        var workplaceFullDesparty = doc.get("CODWPLEV4") != doc.get("CODPARTY") ? doc.get("DESPARTYLEV4") + " \\ " + doc.get("DESPARTY1") : doc.get("DESPARTY1");
        var mainPanel = new Ext.Panel({
            layout: {
                type: 'vbox'
            },
            cls: 'sm1-pharma-cust-balloon',
            items: [
                {
                    xtype: 'component',
                    html: workplaceFullDesparty,
                    cls: 'sm1-pharma-cust-balloon-title'
                },
                {
                    xtype: 'component',
                    html: workplaceAddr.get("DESADDR1") + " " + workplaceAddr.get("DESLOC1")
                }
            ]
        });
        XMap.showMarkerPopup(marker, mainPanel);
    };

    this._onPharmacyMarkerClick = function (marker, pharmacy) {
        var navId = "NAV_MOB_PHARMACIES";
        var pharmacyViewRight = UserContext.checkRight(navId, navId, 'VIEW');
        var pharmacyEditRight = UserContext.checkRight(navId, navId, 'EDIT');
        var mainPanel = new Ext.Panel({
            layout: {
                type: 'vbox'
            },
            cls: 'sm1-pharma-cust-balloon',
            items: [
                {
                    xtype: 'component',
                    html: pharmacy.get("DESPARTY1"),
                    cls: 'sm1-pharma-cust-balloon-title'
                },
                {
                    xtype: 'component',
                    html: pharmacy.get("DESADDR1") + " " + pharmacy.get("DESLOC1")
                },
                {
                    xtype: 'xbutton',
                    cls: 'sm1-bt sm1-pharma-cust-balloon-btn',
                    text: UserContext.tryTranslate("[MOB.OPEN]"),
                    hidden: !(pharmacyViewRight || pharmacyEditRight),
                    SM1Listeners: {
                        onPress: function () {
                            XMap.cleanMarkerPopup();
                            XHistory.go({
                                controller: app.getSM1Controllers().gui,
                                action: 'show',
                                docKey: CommonEngine.buildCustomerKey(pharmacy.get("CODPARTY")),
                                navId: navId,
                                openMode: pharmacyEditRight ? 'EDIT' : 'VIEW'
                            });
                        }
                    }
                }
            ]
        });
        XMap.showMarkerPopup(marker, mainPanel);
    };

    this.afterNotifyLeave = function (context) {
        delete this.treeStore;
        delete this.linksWaitCounter;
    }

    this.beforeNotifyLeave = function (context) {
        //cleanup map panel
        var tabCtrls = context.ctrl.tabCtrls;
        if (tabCtrls && tabCtrls["MAP"]) {
            var mapSection = tabCtrls["MAP"].sections["MAP"];
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

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";

        var descriptionParts = [];

        if (doc.get("CODWPLEV4") != doc.get("CODPARTY")) {
            descriptionParts.push(doc.get("DESPARTYLEV4"));
        }
        descriptionParts.push(doc.get("DESPARTY1") + " " + "(" + doc.get("CODPARTY") + ")");

        var addr = doc.getSubEntityStore("CustomerAddr").findBy(function (addr) {
            return addr.get("CODADDR") == "1";
        });
        if (addr) {
            descriptionParts.push(addr.get("DESLOC1"));
        }

        return descriptionParts.join(" | ");
    };

    this._refreshMap = function (gui) {
        var self = this;
        var detailContext = gui.tabCtrls["MAP"];
        if (!detailContext)
            return;
        self._fillMap(detailContext.sections["MAP"].mapPanel, XMap.getInstance(), gui.getDocument());
    };
}
XApp.registerGuiExtension("mobGuiWorkplace", new _mobGuiWorkplaceExtension());
//#endregion