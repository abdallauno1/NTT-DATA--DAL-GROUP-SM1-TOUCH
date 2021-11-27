//#region _mobGuiPromoAction
function _mobGuiPromoAction() {

    //#region Custom
    this.afterNewDocument = function (gui) {
        var actualConfig = XHistory.actualConfig();
        var promoAction = gui.getDocument();

        if (actualConfig && actualConfig.codParty) {
            //promo action created from customer UI or navigator 
            var codParty = actualConfig.codParty;
            var idLevel = actualConfig.idLevel;
            var codResp = actualConfig.codResp;

            promoAction.set("CODCONTRACTOR", codParty);
            if (idLevel.substring)
                idLevel = parseInt(idLevel, 10);
            promoAction.set("LEVCONTRACTOR", idLevel);
            promoAction.set("LEVPARTICIPANTS", idLevel);
            promoAction.set("CODRESPONSIBLE", codResp);
        }
        else {
            //init contractor level with hier min level - 1 (instead of zero as default, which probably is a valid level)
            promoAction.set("LEVCONTRACTOR", SalesPromotionEngine.getCustHierMinLevel() - 1);
        }

        var id = promoAction.get("DOCUMENTKEY").split("|")[1];
        promoAction.set("IDACTION", id);

        WFEngine.initWorkflow(promoAction);
    };

    this.afterGuiCreated = function (gui) {
        var self = this;
        if (gui.tabPanel) {
            gui.tabPanel.on('activeitemchange', function (container, currentPanel) {
                if (!currentPanel.tabName)
                    return;

                switch (currentPanel.tabName) {
                    case "PARTICIPANTS":
                        self._onParticipantsTabActivated(gui);
                        break;
                    case "DELIVERY_POINTS":
                        self._onDeliveryPointsTabActivated(gui);
                        break;
                    case "PRODUCTS":
                        self._onProductsTabActivated(gui);
                        break;
                    case "PROFITANDLOSS":
                        self._onProfitAndLossTabActivated(gui, currentPanel);
                        break;
                }
                self._refreshGuiState(gui, XHistory.actualConfig().isSimulationRunning);
            });

            if (XHistory.actualConfig().selectedTabName == "PRODUCTS") {
                self._onProductsTabActivated(gui);
            }
        }

        //store filters for product simulations and pending simulations
        this._simulationFilter = new Ext.util.Filter({
            filterFn: function (item) {
                return !self._isPendingSimulation(item);
            }
        });
        this._pendingSimulationFilter = new Ext.util.Filter({
            filterFn: function (item) {
                return self._isPendingSimulation(item);
            }
        });
    };

    this._getPLSubkeys = function (promoAction) {
        var self = this;
        var allProducts = promoAction.PromoActionProductDetailsStore.toArray();
        var allSubkeys = allProducts.map(function (x) {
            return { value: self._getProductPLKey(x), text: x.get("DESPRODUCT") };
        });
        allSubkeys.push({ value: "ACTION", text: UserContext.translate("MOB.ACTION") });
        return allSubkeys;
    };

    this._getProductPLKey = function (product) {
        return ["PRODUCT", product.get("CODPRODUCT"), product.get("LEVPRODUCT"), product.get("CODDISPLAY")].join("|");
    };

    this._onProfitAndLossTabActivated = function (gui, currentPanel) {
        var self = this;
        var document = gui.getDocument();
        var panel = currentPanel.items.getAt(0).items.getAt(0).items.getAt(0);
        var profitAndLoss = panel.profitAndLoss;
        profitAndLoss.setSubkeys(self._getPLSubkeys(document));
        if (profitAndLoss.getDocument() != document) {
            XUI.showWait();
            this._requestCustomValues(gui, document.getSubEntityStore("PromoActionProduct"),
                function () { },
                function () {
                    self._evaluateActionFormulas(document);
                    profitAndLoss.setDocument(document);
                    profitAndLoss.setEnabled(self._isWorkflowEditable(gui));
                    profitAndLoss.setDefaultSubkeys(["ACTION"]);
                    XUI.hideWait();
                });
        }
    };

    this.afterLoad = function (gui, options) {
        var promoAction = gui.getDocument();
        this._previouslySavedAction = promoAction.clone();
        var editable = this._isWorkflowEditable(gui);

        this._availableCheckSetConstraints = {};
        this._constraintFunds = {};
        this._checkSetList = new XStore({ entityName: "CheckSet" });
        promoAction.set("FLGCHECKSETSALIGN", editable);

        promoAction.set("FLGPARTICIPANTSALIGN", editable);
        promoAction.set("FLGDELIVERYPOINTSALIGN", editable);
        this._setPrevParticipantsValues();
        this._storePreviousParticipants(promoAction);
        this._setPrevDeliveryPointsValues();
        this._storePreviousDeliveryPoints(promoAction);
        this._participantsChange = false;
        this._processKpiDes(promoAction, "\n", "<br />");

        if (options.openMode != 'NEW') {
            this._evaluateActionFormulas(promoAction);
            this._refreshProductValues(gui);
        }
        promoAction.set("FLGCUSTOMPROPSALIGN", editable);

        delete XHistory.actualConfig().selectedTabName;
        delete gui.openData.selectedTabName;
    };

    this.newDetail = function (context) {
        var self = this;
        var newEntity = context.newEntity;
        switch (context.detailEntityName) {
            case "PromoActionProduct":
                var row = context.selectorRow;
                var promoAction = context.parentEntity;
                var codProduct = row.get("CODPRODUCT");
                var levProduct = row.get("LEVPRODUCT");

                if (this._promoActionHasProduct(promoAction, codProduct, levProduct)) {
                    //product already exists
                    XUI.showErrorMsgBox({ msg: UserContext.translate("MOB.DUPLICATE_PROMO_PRODUCT") });
                    return true;
                }
                else {
                    newEntity.set("IDACTION", promoAction.get("IDACTION"));
                    newEntity.set("CODPRODUCT", codProduct);
                    newEntity.set("LEVPRODUCT", levProduct);
                    newEntity.set("CODDISPLAY", "NODISPLAY");
                    newEntity.set("DESPRODUCT", row.get("DESPRODUCT"));
                    newEntity.set("FLGCHECKSETSALIGN", true);
                    newEntity.set("FLGFUNDCONSTRALIGN", true);
                    this._fillProductDetails(promoAction, newEntity);

                    var defaultActivities = this._getDefaultActivities(promoAction);
                    if (defaultActivities.length > 0) {
                        newEntity.set("MULTIACTIVITIES", defaultActivities);
                        newEntity.getSubEntityStore("ProductActivity").each(function (pa) {
                            pa.set("IDACTION", promoAction.get("IDACTION"));
                        });
                    }

                    //if possible, request custom values for the new product from server
                    XUI.showWait();
                    this._requestCustomValues(context.gui, newEntity,
                        function () {
                            self._refreshPromoActionActivities(promoAction, newEntity);
                            self._evaluateProductFormulas(promoAction, newEntity);
                            context.ctrl.openNewDetailFromSelector(context);
                            XUI.hideWait();
                        },
                        function () {
                            self._refreshPromoActionActivities(promoAction, newEntity);
                            self._evaluateProductFormulas(promoAction, newEntity);
                            context.ctrl.openNewDetailFromSelector(context);
                            XUI.hideWait();
                        }
                    );

                    //do not show detail popup until values are retrieved from server
                    return true;
                }
        }
        return false;
    };

    this.afterOpenSubDetail = function (options) {
        this._activeDetailPopup = options.detailContext;
    };

    this.afterCloseHandler = function (context) {
        var ctrl = context.ctrl;
        var entityName = ctrl.entity.getEntityName();
        var gui = ctrl.gui;
        var reason = context.opt.reason;
        var senchaStore;

        var userChangedHisMind = reason == "CANCEL" && ctrl.isNewDetail;
        if (userChangedHisMind /* and did not actually add the product*/) {
            this._clearErrors(gui, ctrl);
            delete this._activeDetailPopup;
            return;
        }

        if (ctrl.parentCtrl && ctrl.parentCtrl.entityName != "PromoAction") {
            this._activeDetailPopup = ctrl.parentCtrl;
        }
        else {
            delete this._activeDetailPopup;
        }

        if (reason == "CANCEL" || reason == "REMOVE") {
            this._clearErrors(gui, ctrl);
        }

        if (!reason && entityName == "PromoActionProduct") {
            this._refreshGridColumns(gui.tabCtrls.PRODUCTS);
            return;
        }

        switch (entityName) {
            case "PromoDummyCluster":
                if (reason != "CANCEL") {
                    //refresh list
                    senchaStore = gui.tabCtrls["SELLOUT_DETAIL"].sections["LIST_CLUSTERS"].innerPanel.list.getStore();
                    var dummyClusters = gui.getDocument().getSubEntityStore(entityName);
                    dummyClusters.rebindSenchaStore(senchaStore);
                }
                break;
            case "PromoActionProduct":
                this._refreshPromoActionActivities(gui.getDocument());
                if (reason != "CANCEL" && ctrl.parentCtrl) {
                    ctrl.parentCtrl.setSectionButtonsStatus();
                }
                break;
            case "ProductSimulation":
                if (context.opt.modified) {
                    if (reason == "CANCEL" && this._prevSelSim && this._prevSelSim != context.ctrl.entity) {
                        //restore previously selected simulation
                        this._prevSelSim.set("FLGSELECTED", true);
                    }
                    //refresh list
                    senchaStore = ctrl.parentCtrl.sections["LIST_SIMULATION"].innerPanel.list.getStore();
                    var simulations = ctrl.parentCtrl.entity.getSubEntityStore(entityName);
                    simulations.rebindSenchaStore(senchaStore);
                }
                delete this._prevSelSim;
                break;
        }

        // Refresh only when the detail popup is actually closed, not just re-rendered
        if (entityName == "PromoActionProduct" && ((reason != 'NEXT' && reason != 'PREV') || context.opt.navigationOutOfBounds)) {
            this._refreshGridColumns(gui.tabCtrls.PRODUCTS);
        }
    };

    this.beforeRemoveDetail = function (context) {
        var entity = context.detailEntity;
        switch (entity.getEntityName()) {
            case "ProductSimulation":
                var self = this;
                var product = entity.getParentEntity();
                var hasSelected = false;
                var simulation;

                product.getSubEntityStore("ProductSimulation").each(function (ps) {
                    if (ps != entity && !self._isPendingSimulation(ps)) {
                        if (ps.get("FLGSELECTED")) {
                            hasSelected = true;
                        }
                        else {
                            if (!simulation || simulation.get("IDSIMULATION") < ps.get("IDSIMULATION")) {
                                simulation = ps;
                            }
                        }
                    }
                });

                //if needed and is possible, update the product with the newest simulation
                if (!hasSelected) {
                    this._updateProductAccordingToSimulation(context.gui.gui.getDocument(), product, simulation, true);
                    if (simulation)
                        simulation.set("FLGSELECTED", true);
                }
                break;
        }
    };

    this.getCustomLayout = function (layout, detailContext) {
        if (layout.children[0].attrs.caption == 'SECTION_PRODUCTS') {
            return this._getProductsGridLayout(layout, detailContext);
        }
        else {
            return this._getProductDetailsLayout(layout, detailContext);
        }
    };

    this.gridBeginEdit = function (context) {

        if (!this._isWorkflowEditable(context.gui)) {
            context.canceled = true;
            return;
        }

        if (this._hasPendingSimulations(context.gui.getDocument())) {
            context.canceled = true;
            return;
        }

        if (context.column.fieldName == "QTYESTIMATED") {
            return;
        }

        if (context.column.fieldName == "QTYSIMULATED" || context.column.fieldName == "QTYUPLIFT" || context.column.fieldName == "TPE_SOURCE") {
            context.canceled = true;
            return;
        }

        var measureFields = SalesPromotionEngine.getMeasureFieldsForProductIncludingEffectiveness(context.rowEntity);
        var isProductField = measureFields.some(function (x) { return context.column.fieldName == x.FIELDNAME; });
        context.canceled = !isProductField;
    };

    this.onGridEndEditEnded = function (context) {
        switch (context.fieldName) {
            case "QTYESTIMATED":
                //dummy sectionContext
                var sectionContext = {
                    detailContext: context.detailContext,
                    entity: context.rowEntity
                };
                this._handleProductNumericFieldEdit(context.rowEntity, sectionContext, context.fieldName, context.oldVal);
                break;
        }
    };

    this.renderDetailGui = function (context) {
        switch (context.detailContext.entityName) {
            case "PromoActionProduct":
                this._renderProductDetail(context);
                return true;
        }
        return false;
    };

    this.setNewButtonsStatus = function (context) {
        var gui = context.gui;
        context.enabled = context.enabled && this._isWorkflowEditable(gui) &&
            !this._simulationRunning && !this._hasPendingSimulations(gui.getDocument());
        switch (context.detailEntityName) {
            case "Participant":
                context.visible = false;
                break;
            case "DeliveryPoint":
                context.visible = false;
                break;
            case "ProductDetail":
                context.visible = false;
                break;
            case "PromoDummyCluster":
                context.visible = false;
                break;
            case "ProductCheckSet":
                context.visible = false;
                break;
            case "ProductSimulation":
                context.visible = false;
                break;
        }
    };

    this.setRemoveButtonsStatus = function (context) {
        var gui = context.gui;
        context.enabled = context.enabled && this._isWorkflowEditable(context.gui) &&
            !this._simulationRunning && !this._hasPendingSimulations(gui.getDocument());
        switch (context.detailEntityName) {
            case "PromoDummyCluster":
                context.visible = false;
                break;
        }
    };

    this.afterCardFieldCreation = function (field, context) {
        var fieldName = context.fieldConfig.attrs["name"];
        var sectionName = context.sectionContext.config.attrs["caption"];

        switch (sectionName) {
            case "CONTRACTOR":
                switch (fieldName) {
                    case "CODCONTRACTOR":
                        //add constraints to customer selector
                        field.hiddenConstraints = new XConstraint({ attr: "FLGPROMO", op: '!=', value: 0 });
                        break;
                }
                break;
            case "MAIN_INFO":
                switch (fieldName) {
                    case "CODCOVERING":
                        this._codCoveringCombo = field;
                        break;
                    case "LEVPARTICIPANTS":
                        this._levParticipantsCombo = field;
                        break;
                }
                break;
            case "PRODUCT_ROW":
                if (context.fieldConfig.attrs.presType == "multiqtabs") {
                    var product = context.detailContext.entity;
                    if (!product.isNew) {
                        var val = product.get(fieldName);
                        if (val.substring) {
                            product.set(fieldName, val.split(";"));
                        }
                    }
                }
                break;
        }

        return field;
    };

    this.preFillSection = function (sectionContext) {
        var detailObjectName = sectionContext.config.attrs["detailObject"];
        switch (detailObjectName) {
            case "PromoActionProduct":
                this._initProductCheckSets(sectionContext.gui, sectionContext.document);
                break;
            case "PromoDummyCluster":
                this._scatterClusters(sectionContext.document);
                break;
            case "ProductCheckSet":
                var codDiv = sectionContext.document.get("CODDIV");
                this._ensureProductCheckSets(sectionContext.entity, codDiv);
                break;
        }
    };

    this.beforeOpenSubDetailFromList = function (context) {
        switch (context.entityName) {
            case "Participant":
            case "DeliveryPoint":
            case "ProductCheckSet":
                context.showWait = false;
                break;
            case "ProductSimulation":
                //don't open pending simulation detail
                if (this._isPendingSimulation(context.entity))
                    return true;
                break;
        }
        return false;
    };

    this.afterSectionCreated = function (context) {
        var sectionName = context.sectionConfig.attrs["caption"];
        var self = this;
        var list;
        switch (sectionName) {
            case "LIST_PARTICIPANTS":
            case "LIST_DELIVERYPOINTS":
                list = context.panel.innerPanel.list;
                list.on('itemtap', function (view, index, target, record) {
                    var gui = context.gui;
                    if (!record.xrec.get("INCLUSIONEDITABLE") || !self._isWorkflowEditable(gui) ||
                        self._simulationRunning || self._hasPendingSimulations(gui.getDocument()))
                        return;

                    record.xrec.set("FLGINCLUSION", !record.xrec.get("FLGINCLUSION"));

                    var subEntityName;
                    if (sectionName == "LIST_PARTICIPANTS") {
                        self._onIncludedParticipantsChanged(gui, true);
                        subEntityName = "Participant";
                    }
                    else if (sectionName == "LIST_DELIVERYPOINTS") {
                        self._onIncludedDeliveryPointsChanged(gui);
                        subEntityName = "DeliveryPoint";
                    }

                    var promoAction = gui.getDocument();
                    //refresh list and set modified
                    var subStore = promoAction.getSubEntityStore(subEntityName);
                    if (subStore.getCount() > 0) {
                        subStore.rebindSenchaStore(list.getStore());
                        gui.setModified(promoAction);
                    }
                });
                break;
            case "LIST_SIMULATION":
            case "LIST_PENDING_SIMULATION":
                list = context.panel.innerPanel.list;
                var f = (sectionName == "LIST_SIMULATION") ? self._simulationFilter : self._pendingSimulationFilter;
                list.getStore().filter(f);
                break;
            case "PARTICIPANTS_BLOCKED":
            case "DELIVERYPOINTS_BLOCKED":
                var sectionItems = context.panel.getItems();
                if (sectionItems.length > 0 && sectionItems.items[0].isXType('toolbar')) {
                    sectionItems.items[0].setHidden(true);
                }
                break;
            case "SECTION_PRODUCTS":
                this._fillAllProductDetails(context.gui.getDocument());
                break;
            case "LIST_PRODUCT_DETAILS":
                list = context.panel.innerPanel.list;
                list.on('itemtap', function (view, index, target, record) {
                    var gui = context.gui;
                    if (!self._isWorkflowEditable(gui) || self._simulationRunning ||
                        self._hasPendingSimulations(gui.getDocument()))
                        return;

                    record.xrec.set("FLGINCLUSION", !record.xrec.get("FLGINCLUSION"));

                    var promoActionProduct = context.detailGui.entity;
                    //refresh list and set modified
                    var subStore = promoActionProduct.getSubEntityStore("ProductDetail");
                    if (subStore.getCount() > 0) {
                        subStore.rebindSenchaStore(list.getStore());
                        gui.setModified(context.gui.getDocument());
                    }
                });
                break;
        }
    };

    this.afterCreateGridColumn = function (fieldContext) {
        switch (fieldContext.sectionContext.config.attrs['caption']) {
            case 'ANOMALIES_REPORT':
                switch (fieldContext.fieldName) {
                    case 'CONFLICTING_ACTION':
                        fieldContext.column.handler = (function (gui) {
                            return function (record) {
                                if (record.get("CODANOMALY") == "PRODUCTDETAILS_CONFLICT")
                                    return;

                                var conflictingAction = record.get('CONFLICTING_ACTION');

                                if (XApp.isEmptyString(conflictingAction))
                                    return;

                                //conflicting action column might not contain promo description
                                var idAction = conflictingAction.indexOf(' ') < 0 ? conflictingAction : conflictingAction.split(' ')[0];

                                var documentKey = 'PromoAction|' + idAction;
                                var navId = 'NAV_MOB_PROMOACTION';
                                var navRow = XNavHelper.getFromMemoryCache(navId).findByKey(documentKey);
                                if (!navRow) {
                                    XUI.showWarnOk({
                                        title: UserContext.tryTranslate('[MOB.PROMO.CONFLICTING_ACTION]'),
                                        msg: UserContext.tryTranslate('[MOB.PROMO.DIFFERENT_RESPONSIBLE]')
                                    });
                                    return;
                                }

                                gui._storeDocOnTempCache();
                                XHistory.go({
                                    controller: app.getSM1Controllers().gui,
                                    action: 'show',
                                    docKey: documentKey,
                                    navId: navId,
                                    openMode: UserContext.checkRight(navId, navId, 'EDIT') ? 'EDIT' : 'VIEW',
                                    selectedNavRow: navRow
                                });
                            };
                        })(fieldContext.sectionContext.gui);
                        break;
                    case 'LIMIT':
                    case 'VALUEANOM':
                        //.net decimal.MinValue
                        fieldContext.column.hideValue = -7.92281625142643e+28;
                        break;
                }
                break;
            case "SECTION_PRODUCTS":
                if (fieldContext.fieldName == "QTYESTIMATED") {
                    fieldContext.column.minValue = 0;
                }
        }
    };

    this.createListForSection = function (sectionContext) {
        if (sectionContext.config.attrs["caption"] == "LIST_CHECKSETS") {
            var self = this;
            var gui = sectionContext.gui;

            sectionContext.listStore.setGroupField("DESCONFIG");

            return new Ext.dataview.List({
                flex: 1,
                itemTpl: sectionContext.itemTemplate,
                store: sectionContext.listStore,
                docked: 'top',
                grouped: true,
                scrollable: null,
                scrollToTopOnRefresh: false,
                listeners: {
                    "itemtap": function (view, index, target, record) {
                        var pcs = record.xrec;

                        if (pcs.get("SELECTED") || pcs.get("IDCHECKSET") == PromoParameters.getInstance().getEmptyCheckSetId() ||
                            !self._isWorkflowEditable(gui) || self._simulationRunning || self._hasPendingSimulations(gui.getDocument()))
                            return;

                        self._tapSelectProductCheckSet(pcs, sectionContext.context);
                    },
                    "painted": function (list) {
                        //force the list to fill the whole available space
                        list.setHeight(list.getParent().getParent().getParent().getHeight());
                    }
                }
            });
        }

        return null;
    };

    //"toolbar" controls
    this.getSectionButtons = function (context) {
        var sectionName = context.config.attrs["caption"];
        var self = this;
        var subEntityName = context.config.attrs["detailObject"];
        var gui = context.gui;
        var promoAction = gui.getDocument();

        switch (sectionName) {
            case "LIST_PARTICIPANTS":
            case "LIST_DELIVERYPOINTS":

                var passButton = {
                    msg: UserContext.tryTranslate("[MOB.PROMO.PASS_NEW_TO_PRESENT]"),
                    handler: (function (promoAction, subEntityName, context, gui) {
                        return function () {
                            self._passNewToPresent(promoAction, subEntityName);
                            //refresh list and set modified
                            var subStore = promoAction.getSubEntityStore(subEntityName);
                            if (subStore.getCount() > 0) {
                                subStore.rebindSenchaStore(context.panel.innerPanel.list.getStore());
                                gui.setModified(promoAction);
                            }
                        };
                    })(promoAction, subEntityName, context, gui),
                    entityName: subEntityName,
                    id: context.panel.id + '-passnewtopresent',
                    scope: this
                };
                context.buttons.push(passButton);

                var excludeAllButton = {
                    msg: UserContext.tryTranslate("[MOB.PROMO.EXCLUDE_ALL]"),
                    handler: (function (promoAction, subEntityName, context, gui) {
                        return function () {
                            self._setInclusion(promoAction, subEntityName, false);
                            if (sectionName == "LIST_PARTICIPANTS") {
                                self._onIncludedParticipantsChanged(gui, true);
                            } else {
                                self._onIncludedDeliveryPointsChanged(gui);
                            }
                            //refresh list and set modified
                            var subStore = promoAction.getSubEntityStore(subEntityName);
                            if (subStore.getCount() > 0) {
                                subStore.rebindSenchaStore(context.panel.innerPanel.list.getStore());
                                gui.setModified(promoAction);
                            }
                        };
                    })(promoAction, subEntityName, context, gui),
                    entityName: subEntityName,
                    id: context.panel.id + '-excludeall',
                    scope: this
                };

                context.buttons.push(excludeAllButton);

                var includeAllButton = {
                    msg: UserContext.tryTranslate("[MOB.PROMO.INCLUDE_ALL]"),
                    handler: (function (promoAction, subEntityName, context, gui) {
                        return function () {
                            self._setInclusion(promoAction, subEntityName, true);
                            if (sectionName == "LIST_PARTICIPANTS") {
                                self._onIncludedParticipantsChanged(gui, true);
                            } else {
                                self._onIncludedDeliveryPointsChanged(gui);
                            }
                            //refresh list and set modified
                            var subStore = promoAction.getSubEntityStore(subEntityName);
                            if (subStore.getCount() > 0) {
                                subStore.rebindSenchaStore(context.panel.innerPanel.list.getStore());
                                gui.setModified(promoAction);
                            }
                        };
                    })(promoAction, subEntityName, context, gui),
                    entityName: subEntityName,
                    id: context.panel.id + '-includeall',
                    scope: this
                };
                context.buttons.push(includeAllButton);
                return;

            case "LIST_SIMULATION":
            case "SECTION_PRODUCTS":
                if (UserContext.checkRight('PROMOACTION', 'SIMULATION', 'UPDT_SIMULATION') &&
                    UserContext.getConfigParam("SALESPROMOTION_ENABLE_EFFECTIVENESS", 0) != false) {
                    var startStopSimulation = {
                        msg: UserContext.tryTranslate("[MOB.PROMO.START_SIMULATION_MEASURES]"),
                        handler: (function (context) {
                            return function () {
                                self._toggleSimulation(context);
                            };
                        })(context),
                        code: "START_STOP_SIMULATION",
                        entityName: subEntityName,
                        id: context.panel.id + '-update-simulation',
                        scope: this
                    };
                    context.buttons.push(startStopSimulation);
                }

                if (UserContext.checkRight('PROMOACTION', 'MEASURES', 'REEVALUATEMEASURES')) {
                    var reevaluateMeasures = {
                        msg: UserContext.tryTranslate("[MOB.PROMO.REEVALUATE_MEASURES]"),
                        handler: (function (gui) {
                            return function () {
                                self._evaluateActionFormulas(promoAction);
                                self._refreshProductValues(gui);
                            };
                        })(gui),
                        code: 'REEVALUATE_MEASURES',
                        entityName: subEntityName,
                        id: context.panel.id + '-reevaluate-measures',

                        scope: this
                    };
                    context.buttons.push(reevaluateMeasures);
                }

                return;

            case "LIST_PRODUCT_DETAILS":
                var excludeAllButton = {
                    msg: UserContext.tryTranslate("[MOB.PROMO.EXCLUDE_ALL]"),
                    code: "PRODUCT_DETAILS_EXCLUDE_ALL",
                    handler: (function (promoAction, context, gui) {
                        return function () {
                            var subStore = context.sectionContext.entity.getSubEntityStore("ProductDetail");
                            self._setProductDetailsInclusion(subStore, false);
                            subStore.rebindSenchaStore(context.panel.innerPanel.list.getStore());
                            gui.setModified(promoAction);
                        };
                    })(promoAction, context, gui),
                    entityName: subEntityName,
                    id: context.panel.id + '-exclude-all',
                    scope: this
                };
                context.buttons.push(excludeAllButton);

                var includeAllButton = {
                    msg: UserContext.tryTranslate("[MOB.PROMO.INCLUDE_ALL]"),
                    handler: (function (promoAction, context, gui) {
                        return function () {
                            var subStore = context.sectionContext.entity.getSubEntityStore("ProductDetail");
                            self._setProductDetailsInclusion(subStore, true);
                            subStore.rebindSenchaStore(context.panel.innerPanel.list.getStore());
                            gui.setModified(promoAction);
                        };
                    })(promoAction, context, gui),
                    code: "PRODUCT_DETAILS_INCLUDE_ALL",
                    entityName: subEntityName,
                    id: context.panel.id + '-include-all',
                    scope: this
                };
                context.buttons.push(includeAllButton);
                return;

        };
    };

    this.setSectionButtonsStatus = function (context) {
        var gui = context.gui;
        var entity = context.subGui.entity;
        var detailEntityName = context.buttonConfig.entityName;

        if (context.buttonConfig.code == "PRODUCT_DETAILS_INCLUDE_ALL" ||
            context.buttonConfig.code == "PRODUCT_DETAILS_EXCLUDE_ALL") {
            context.enabled = this._isWorkflowEditable(gui);
            return;
        }

        switch (detailEntityName) {
            case "Participant":
            case "DeliveryPoint":
                context.enabled = this._isWorkflowEditable(gui) &&
                                  entity.getSubEntityStore(detailEntityName).getCount() > 0 &&
                                  !this._simulationRunning && !this._hasPendingSimulations(gui.getDocument());
                break;
            case "PromoActionProduct":
            case "ProductSimulation":
                if (!XApp.isOnline()) {
                    context.enabled = false;
                    return;
                }

                if (!this._isWorkflowEditable(gui)) {
                    context.enabled = false;
                    return;
                }

                if (!this._isSimulationPossible(context)) {
                    context.enabled = false;
                    return;
                }

                context.enabled = true;
                if (context.buttonConfig.code == "START_STOP_SIMULATION") {
                    var isSimulationRunning = this._simulationRunning || this._hasPendingSimulations(gui.getDocument());
                    if (isSimulationRunning) {
                        if (context.buttonConfig.button) {
                            context.buttonConfig.button.setText(UserContext.tryTranslate("[MOB.PROMO.STOP_SIMULATION_MEASURES]"));
                        } else
                            context.buttonConfig.msg = UserContext.tryTranslate("[MOB.PROMO.STOP_SIMULATION_MEASURES]");
                    }
                    else {
                        if (context.buttonConfig.button) {
                            context.buttonConfig.button.setText(UserContext.tryTranslate("[MOB.PROMO.START_SIMULATION_MEASURES]"));
                        } else
                            context.buttonConfig.msg = UserContext.tryTranslate("[MOB.PROMO.START_SIMULATION_MEASURES]");
                    }
                }
                break;
        }
    };

    this.getQtabsVoices = function (fieldContext) {
        var fieldName = fieldContext.fieldName;
        var promoAction = fieldContext.sectionContext.document;
        var codDiv = promoAction.get("CODDIV");
        var newVoices;
        var levContractor;
        switch (fieldName) {
            case "CODDEVELOPMENT":
                newVoices = this._getDevelopments(codDiv);
                fieldContext["voices"] = newVoices;
                this._setDefaultValue(promoAction, fieldName, newVoices);
                break;
            case "CODCOVERING":
                if (this._isContractorSelected(promoAction)) {
                    levContractor = promoAction.get("LEVCONTRACTOR");
                    newVoices = this._getCoverings(levContractor, codDiv);
                    fieldContext["voices"] = newVoices;
                    this._setDefaultValue(promoAction, fieldName, newVoices);
                }
                break;
            case "LEVPARTICIPANTS":
                if (this._isContractorSelected(promoAction)) {
                    levContractor = promoAction.get("LEVCONTRACTOR");
                    newVoices = this._getParticipantLevelVoices(levContractor);
                    fieldContext["voices"] = newVoices;
                    this._setDefaultValue(promoAction, fieldName, newVoices);
                }
                break;
            case "CODCLUSTER":
                fieldContext["voices"] = this._getClusters();
                break;
            case "MULTIACTIVITIES":
                fieldContext["voices"] = this._getActivities(promoAction);
                break;
            case "MULTISIGNS":
                fieldContext["voices"] = this._getSigns();
                break;
        }
    };

    this.setFieldStatus = function (context) {
        var gui = context.gui.gui;
        context.editable = context.editable && this._isWorkflowEditable(gui) &&
            !this._simulationRunning && !this._hasPendingSimulations(gui.getDocument());
        var tabName = context.sectionContext.detailContext.tabName;
        switch (tabName) {
            case "MAIN":
                this._setMainTabFieldStatus(context);
                break;
            case "PRODUCTS":
                this._setProductsTabFieldStatus(context);
                break;
            case "SELLOUT_DETAIL":
                this._setSelloutTabFieldStatus(context);
                break;
            case "DELIVERY_POINTS":
                this._setDeliveryPointsTabFieldStatus(context);
                break;
        }
    };

    this.validateField = function (context) {
        //convert value, if needed
        var fieldContext = context.field.fieldContext;
        if (fieldContext.xdef.fldType == "DateTime")
            context.newVal = this._convertValue(context.newVal, fieldContext.xdef.fldType);

        var tabName = context.field.fieldContext.sectionContext.detailContext.tabName;
        switch (tabName) {
            case "MAIN":
                return this._validateMainTabField(context);
            case "PRODUCTS":
                return this._validateProductsTabField(context);
        }
        return true;
    };

    this.onEditEnding = function (ctrl, fieldName, newValue, oldValue) {
        var entityName = ctrl.fieldContext.sectionContext.entityName;
        switch (entityName) {
            case "PromoAction":
                this._handlePromoActionFieldEdit(ctrl, fieldName, newValue, oldValue);
                break;
            case "PromoActionProduct":
                this._handlePromoActionProductFieldEdit(ctrl, fieldName, newValue, oldValue);
                break;
            case "PromoDummyCluster":
                this._handlePromoDummyClusterFieldEdit(ctrl, fieldName, newValue);
                break;
            case "ProductSimulation":
                this._handleProductSimulationFieldEdit(ctrl, fieldName, newValue);
                break;
        }
    };

    this.validateEntity = function (detailContext) {
        switch (detailContext.entityName) {
            case "PromoActionProduct":
                return this._validatePromoActionProduct(detailContext);
            case "PromoDummyCluster":
                return this._validatePromoDummyCluster(detailContext);
            case "ProductSimulation":
                return this._validateProductSimulation(detailContext);
        }
        return true;
    };

    this.validateDocument = function (gui) {
        var promoAction = gui.getDocument();

        var isMainValid = this._validateMainTab(gui, promoAction);
        var areParticipantsValid = this._validateParticipantsTab(gui, promoAction);
        var areDeliveryPointsValid = this._validateDeliveryPointsTab(gui, promoAction);
        var areProductsValid = this._validateProductsTab(gui, promoAction);

        return isMainValid && areParticipantsValid && areDeliveryPointsValid && areProductsValid;
    };

    this.onSaveDocument = function (gui, document, onSuccess) {
        var self = this;
        var exeq = gui.exe;
        this._ensureDefaultActivities(document);
        this._processMultiselectionMeasureFields(document);
        this._gatherClusters(document);
        this._clearAllEmptyProductCheckSets(document);
        this._storeKpiDes(document);
        this._processKpiDes(document, "<br />", "\n");
        this._brutallyHandleNoDisplay(document);
        var skipDeliveryPointsAlignment = false;
        //keys of promo products which need checksets alignment
        var checkSetProdKeys = [];

        //attempt to align participants
        exeq.pushHandler(self, function () {
            self._alignParticipants(gui,
                function () {
                    self._failureCallback("MOB.PROMO.ERR_LOAD_PARTICIPANTS", exeq);
                },
                function (serverCall) {
                    self._passNewToPresent(document, "Participant");
                    skipDeliveryPointsAlignment = !serverCall && !document.get("FLGDELIVERYPOINTSALIGN");
                    exeq.executeNext();
                }
            );
        });

        //attempt to align delivery points
        exeq.pushHandler(self, function () {
            if (skipDeliveryPointsAlignment) {
                self._synchronizeWithDeliveryPoints(document);
                exeq.executeNext();
            }
            else {
                self._alignDeliveryPoints(gui, false,
                    function () {
                        self._failureCallback("MOB.PROMO.ERR_LOAD_DELIVERYPOINTS", exeq);
                    },
                    function () {
                        self._synchronizeWithDeliveryPoints(document);
                        self._passNewToPresent(document, "DeliveryPoint");
                        exeq.executeNext();
                    }
                );
            }
        });

        //attempt to align products' CUSTOM values
        exeq.pushHandler(self, function () {
            self._requestCustomValues(gui, document.getSubEntityStore("PromoActionProduct"),
                function () { exeq.executeNext(); },
                function (serverCall) {
                    if (serverCall) {
                        self._evaluateActionFormulas(document);
                    }
                    document.set("FLGCUSTOMPROPSALIGN", false);
                    exeq.executeNext();
                }
            );
        });

        //attempt to align preliminary checksets
        exeq.pushHandler(self, function () {
            checkSetProdKeys = self._getProdKeysToAlignCheckSets(document);
            if (checkSetProdKeys.length <= 0 || !document.get("FLGCHECKSETSALIGN")) {
                exeq.executeNext();
            }
            else {
                self._loadPreliminaryCheckSets(document,
                    function () {
                        self._failureCallback("MOB.PROMO.ERR_LOAD_PRELIMINARY_CHECKSETS", exeq);
                    },
                    function () {
                        document.set("FLGCHECKSETSALIGN", false);
                        exeq.executeNext();
                    }
                );
            }
        });

        //attempt to align product checksets
        exeq.pushHandler(self, function () {
            if (checkSetProdKeys.length <= 0) {
                exeq.executeNext();
            }
            else {
                self._getCheckSetsForProducts(document, checkSetProdKeys,
                    function () {
                        self._failureCallback("MOB.PROMO.ERR_LOAD_PRODUCT_CHECKSETS", exeq);
                    },
                    function () {
                        exeq.executeNext();
                    }
                );
            }
        });

        //attempt to align fund constraint descriptions
        exeq.pushHandler(self, function () {
            var fundProdKeys = self._getProdKeysToAlignFundConstraints(document);
            if (fundProdKeys.length <= 0)
                exeq.executeNext();

            var constraints = new XStore({ entityName: "CheckSetConstraint" });
            var productStore = document.getSubEntityStore("PromoActionProduct");
            for (var i = 0, n = fundProdKeys.length; i < n; i++) {
                var product = productStore.findBy(function (prod) {
                    return prod.getKey() == fundProdKeys[i];
                });

                if (!product)
                    continue;

                var availableConstraints = self._availableCheckSetConstraints[product.getKey()];
                if (!availableConstraints || availableConstraints.length <= 0)
                    continue;

                for (var j = 0, m = availableConstraints.length; j < m; j++) {
                    var constr = availableConstraints[j];
                    if (!constraints.findBy(function (c) {
                        return c.get("IDCHECKSET") == constr.get("IDCHECKSET") &&
                               c.get("IDCONSTRAINT") == constr.get("IDCONSTRAINT");
                    })) {
                        constraints.add(constr);
                    }
                }
            }

            self._getConstraintFunds(document, constraints,
                function () {
                    self._failureCallback("MOB.PROMO.ERR_LOAD_FUND_CONSTR", exeq);
                },
                function () {
                    exeq.executeNext();
                }
            );
        });

        exeq.pushHandler(self, function () {
            self._clearAllEmptyProductCheckSets(document);
            self._storeKpiDes(document);
            self._processKpiDes(document, "<br />", "\n");
            XApp.exec(onSuccess);
        });

        exeq.executeNext();
    };

    this.afterCloseWorkflowPopup = function (context) {
        this._refreshBindings(context.gui);
    };

    this.afterSaveDocument = function (gui, document, onFail, onSuccess) {
        try {
            gui.setDocument(document);
            this._markBindingsBroken();
            var histConfig = XHistory.actualConfig();
            if (!histConfig.docKey) {
                histConfig.docKey = document.get("DOCUMENTKEY");
                histConfig.openMode = gui.isEditable() ? "EDIT" : "VIEW";
            }
            this._restoreKpiDes(document);
            XDocsCache.saveToLocalCache(gui.getDocument().get("DOCUMENTKEY"), gui.getDocument().toJsonObject(), "", XApp.isOnline(), onSuccess, onFail);
        }
        catch (e) {
            onFail();
        }
    };

    this.afterStateChanged = function (context) {
        var doc = context.doc;
        this._previouslySavedAction = doc.clone();

        var stateConf = PromoConfig.getStateConf(doc.get("IDWFSTATE"));
        if (!stateConf || !stateConf.FLGDELEGATION)
            return;

        var devConf = PromoConfig.getDevelopment(doc.get("CODDIV"), doc.get("CODDEVELOPMENT"));
        if (!devConf || !devConf.FLGTOCOMPLETE)
            return;

        //refresh delegates navigator
        XNavHelper.refreshNav('NAV_MOB_SP_DELEGCONTRACTORS', XUI.showExceptionMsgBox, function () { XNavHelper.loadNavData("NAV_MOB_SP_DELEGCONTRACTORS", Ext.emptyFn, Ext.emptyFn); });
    };

    this.beforeEvaluatingAnomalies = function (context) {
        return !this.validateDocument(context.gui);
    };

    this.beforeCreateAnomalyReport = function (context) {
        context.cancel = Boolean(XHistory.actualConfig().selectedTabName) || this._isReloading();
    };

    this.onEvaluatingAnomalies = function (context, evaluateAnomalies, afterAnomaliesEvaluated, onFail) {
        try {
            this.onSaveDocument(context.gui, context.doc, evaluateAnomalies);
        }
        catch (e) {
            onFail(e);
        }

    };

    this.updateIdAction = function (promoAction, newIdAction) {
        promoAction.changeFieldRecursive("IDACTION", newIdAction);
        promoAction.set("DOCUMENTKEY", "PromoAction|" + newIdAction);
        for (var i = 0; i < promoAction.WorkflowStepsStore.getCount() ; i++) {
            promoAction.WorkflowStepsStore.getAt(i).set("PARENTKEY", "PromoAction|" + newIdAction);
        }
    };

    this.afterAnomaliesEvaluated = function (context) {
        var gui = context.gui;
        var promoAction = context.doc;

        //if the current document is new, the id should be updated
        if (context.data && context.data.idAction && context.doc.get("IDACTION") != context.data.idAction) {
            var newIdAction = context.data.idAction;
            this.updateIdAction(promoAction, newIdAction);
            gui.setModified(promoAction);
        }

        if (!gui.docModified) {
            // the evaluation of anomalies should mark the document as modified
            gui.setModified(promoAction);
            return false;
        }

        //evaluating promo action anomalies causes the document to be saved on server, therefore, it should also be saved locally
        XDocsCache.saveToLocalCache(promoAction.get("DOCUMENTKEY"), promoAction.toJsonObject(), "", XApp.isOnline(),
            function () {
                XNavHelper.UpdateNavData(promoAction,
                    function (e) {
                        XUI.showExceptionMsgBox(e);
                        XUI.hideWait();
                    },
                    function () {
                        gui.callCust('afterSaveDocument', [gui, promoAction,
                            function (e) {
                                XUI.hideWait();
                                XUI.showExceptionMsgBox(e);
                            },
                            function () {
                                XUI.hideWait();
                                gui.reload();
                                gui.setModified();
                            },
                            true
                        ]);
                    }
                    );
            },
            function (e) {
                XUI.showExceptionMsgBox(e);
                XUI.hideWait();
            }
        );

        //keep the wait panel
        return true;
    };

    this.setAnomaliesButtonStatus = function (context) {
        var codStateHard = context.doc.get("CODWFSTATEHARD");

        context.enabled = context.gui.isEditable() && XApp.isOnline() && !this._simulationRunning &&
                          codStateHard != SalesPromotionNameSpace.PromoActionHardStates.Ceased &&
                          codStateHard != SalesPromotionNameSpace.PromoActionHardStates.Interrupted;
    };

    this.preOpenLink = function (context) {
        switch (context.linkCode) {
            case "NAV_MOB_PROMOACTION_DELEGCONTRACTORS":
                //entity is not updated after doc save
                context.dataView.context.entity = context.gui.getDocument();
                break;
        }
        return true;
    };

    //#endregion

    //#region Private

    //#region MAIN tab

    //handles onEditEnding for PromoAction
    this._handlePromoActionFieldEdit = function (ctrl, fieldName, newValue, oldValue) {
        var sectionContext = ctrl.fieldContext.sectionContext;
        var entity = sectionContext.entity;

        switch (fieldName) {
            case "CODCONTRACTOR":
                if (newValue != oldValue || entity.get("LEVCONTRACTOR") != ctrl.selectedNavRow.get("IDLEVEL")) {
                    this._onContractorChanged(ctrl, entity, newValue, oldValue);
                }
                break;
            case "LEVPARTICIPANTS":
                this._onParticipantsLevelChanged(sectionContext.detailContext, entity, oldValue);
                break;
            case "DTESTARTSELLIN":
            case "DTEENDSELLIN":
                this._onSellinPeriodChanged(sectionContext.detailContext, entity, oldValue, fieldName);
                break;
            case "CODCOVERING":
                this._onCoveringChanged(sectionContext.detailContext, entity, oldValue);
                break;
            case "DTESTARTSELLOUT":
            case "DTEENDSELLOUT":
                this._onSelloutPeriodChanged(sectionContext.gui, entity);
                break;
            case "FLGPARTICIPANTSBLOCKED":
                this._onParticipantsBlockedChanged(sectionContext.gui, entity, newValue);
                break;
        }
    };

    //status of fields from MAIN tab
    this._setMainTabFieldStatus = function (context) {
        var fieldName = context.fieldName;
        var fieldContext = context.field.fieldContext;
        var entity = context.gui.gui.getDocument();

        switch (fieldName) {
            case "CODCONTRACTOR":
                context.valid = fieldContext.isValid != false;
                break;
            case "DTESTARTSELLIN":
            case "DTEENDSELLIN":
                context.valid = this._isSellinPeriodValid(entity.get("DTESTARTSELLIN"), entity.get("DTEENDSELLIN"));
                break;
            case "DTESTARTSELLOUT":
                context.valid = this._isSelloutPeriodValid(entity.get("DTESTARTSELLOUT"), entity.get("DTEENDSELLOUT"), entity.get("DTESTARTSELLIN"), entity.get("DTEENDSELLIN"));
                break;
            case "DTEENDSELLOUT":
                context.valid = this._isSelloutPeriodValid(entity.get("DTESTARTSELLOUT"), entity.get("DTEENDSELLOUT"));
                break;
            case "CODCOVERING":
                if (!this._isContractorSelected(entity)) {
                    context.editable = false;
                }
                else {
                    context.valid = fieldContext.isValid != false;
                }
                break;
            case "LEVPARTICIPANTS":
                if (!this._isContractorSelected(entity)) {
                    context.editable = false;
                }
                break;
            case "CODDEVELOPMENT":
                context.valid = fieldContext.isValid != false;
                break;
            case "DESACTION":
                context.editable = entity.get("CODWFSTATEHARD") != SalesPromotionNameSpace.PromoActionHardStates.Ceased &&
                                  !this._simulationRunning;
                break;
            case "IDWFSTATE":
                context.editable = entity.get("CODWFSTATEHARD") != SalesPromotionNameSpace.PromoActionHardStates.Ceased &&
                                  !this._simulationRunning;
                break;
        }
    };

    //validates fields from MAIN tab
    this._validateMainTabField = function (context) {
        var fieldContext = context.field.fieldContext;
        var fieldName = fieldContext.fieldName;

        //convert value, if needed
        var newValue = this._convertValue(context.newVal, fieldContext.xdef.fldType);

        switch (fieldName) {
            case "CODCONTRACTOR":
                return !XApp.isEmptyOrWhitespaceString(newValue);
        }

        return true;
    };

    //validate all info from MAIN tab
    this._validateMainTab = function (gui, promoAction) {
        var isValid = true;
        var invalidMainFields = [];
        var minHierLevel = SalesPromotionEngine.getCustHierMinLevel();

        if (XApp.isEmptyOrWhitespaceString(promoAction.get("CODCONTRACTOR"))) {
            isValid = false;
            invalidMainFields.push("CODCONTRACTOR");
        }
        else {
            var levContractor = promoAction.get("LEVCONTRACTOR");
            var levParticipants = promoAction.get("LEVPARTICIPANTS");
            if (levContractor < minHierLevel) {
                isValid = false;
                invalidMainFields.push("LEVCONTRACTOR");
            }
            else
                if (levParticipants < minHierLevel || levParticipants > levContractor) {
                    isValid = false;
                    invalidMainFields.push("LEVPARTICIPANTS");
                }

            if (XApp.isEmptyOrWhitespaceString(promoAction.get("CODCOVERING"))) {
                isValid = false;
                invalidMainFields.push("CODCOVERING");
            }

            if (XApp.isEmptyOrWhitespaceString(promoAction.get("CODDEVELOPMENT"))) {
                isValid = false;
                invalidMainFields.push("CODDEVELOPMENT");
            }
        }

        if (!isValid) {
            var detailContext = gui.getTabDetailContext("MAIN");
            if (detailContext) {
                for (var i = 0, n = invalidMainFields.length; i < n; i++) {
                    var f = detailContext.fields[invalidMainFields[i]];
                    if (f) {
                        f.fieldContext.isValid = false;
                    }
                }
                detailContext.setFieldsStatus();
            }
        }

        return isValid;
    };

    //get development options for combo
    this._getDevelopments = function (codDiv) {
        var promoDevelopmentConfig = PromoConfig.getDevelopments(codDiv);
        var newVoices = [];
        for (var i = 0, l = promoDevelopmentConfig.length; i < l; i++) {
            var promoDev = promoDevelopmentConfig[i];
            newVoices.push({ value: promoDev.CODDEVELOPMENT, text: promoDev.DESDEVELOPMENT });
        }
        return newVoices;
    };

    //get covering options for combo
    this._getCoverings = function (levContractor, codDiv) {
        var promoCoveringConfig = PromoConfig.getCoverings(codDiv);
        var newVoices = [];
        for (var i = 0, l = promoCoveringConfig.length; i < l; i++) {
            var promoCov = promoCoveringConfig[i];
            if (promoCov.LEVCONTRACTOR == levContractor) {
                newVoices.push({ value: promoCov.CODCOVERING, text: promoCov.DESCOVERING });
            }
        }
        return newVoices;
    };

    //get participant hier levels for combo
    this._getParticipantLevelVoices = function (levContractor) {
        var codDim = HierarchyEngine.CustomersCodDim;
        var codHier = PromoParameters.getInstance().getCustHier();
        var codDiv = UserContext.CodDiv;

        var levels = HierarchyEngine.getHierLevelsDescription(codDim, codHier, codDiv);

        var voices = [];

        for (var i = 0, l = levels.length; i < l; i++) {
            var level = levels[i];
            if (level.idLevel <= levContractor) {
                voices.push({ value: level.idLevel, text: level.desLevel });
            }
        }

        return voices;
    };

    //get activities options for combo
    this._getActivities = function (promoAction) {
        var codDiv = promoAction ? promoAction.get("CODDIV") : UserContext.CodDiv;

        var promoActivities = PromoConfig.getActivities(codDiv);

        //find specific activities of covering-level pair
        var specificActivities = "";
        var codCovering = promoAction.get("CODCOVERING");
        var levContractor = promoAction.get("LEVCONTRACTOR");
        if (!XApp.isEmptyString(codCovering) && levContractor >= SalesPromotionEngine.getCustHierMinLevel()) {
            var coveringConfig = PromoConfig.getCovering(codDiv, codCovering, levContractor);
            if (coveringConfig)
                specificActivities = coveringConfig.CODACTIVITIES;
        }

        var newVoices = [];
        for (var i = 0, l = promoActivities.length; i < l; i++) {
            var act = promoActivities[i];
            if (act.ACTIVITYTYPE != SalesPromotionNameSpace.ActivityType.Product)
                continue;
            //if the pair covering-level specifies some activities then the list of possible activities is all "product" activities of the selected pair
            if (!XApp.isEmptyOrWhitespaceString(specificActivities) && specificActivities.indexOf(act.CODACTIVITY) <= -1)
                continue;
            newVoices.push({ value: act.CODACTIVITY, text: PromoConfig.getActivityDescription(act.CODACTIVITY) });
        }
        return newVoices;
    };

    this._getDefaultActivities = function (promoAction) {
        var defaultActivities = PromoConfig.getDefaultProductActivities(promoAction.get("CODDIV"));
        if (defaultActivities.length <= 0)
            return [];

        var currentDefaultActivities = [];
        var availableActivities = this._getActivities(promoAction);
        for (var i = 0, n = availableActivities.length; i < n; i++) {
            var codActivity = availableActivities[i].value;
            if (Ext.Array.contains(defaultActivities, codActivity)) {
                currentDefaultActivities.push(codActivity);
            }
        }

        return currentDefaultActivities;
    };

    this._isContractorSelected = function (promoAction) {
        return !XApp.isEmptyOrWhitespaceString(promoAction.get("CODCONTRACTOR"));
    };

    this._isSellinPeriodValid = function (startSellin, endSellin) {
        if (XApp.isEmptyDate(startSellin) || XApp.isEmptyDate(endSellin))
            return true;

        return startSellin <= endSellin;
    };

    this._isSelloutPeriodValid = function (startSellout, endSellout, startSellin, endSellin) {
        if (XApp.isEmptyDate(startSellout))
            return true;

        if (!XApp.isEmptyDate(endSellout) && startSellout > endSellout)
            return false;

        if (!startSellin && !endSellin)
            return true;

        if (!XApp.isEmptyDate(startSellin) && startSellin > startSellout)
            return false;

        return true;
    };

    this._updateContractorRelatedDetails = function (ctrl, promoAction, newValue) {
        var gui = ctrl.fieldContext.sectionContext.gui;

        var self = this;

        var shouldAlign = false;

        if (!XApp.isEmptyOrWhitespaceString(newValue)) {
            var idLevel = ctrl.selectedNavRow.get("IDLEVEL");
            if (idLevel.substring)
                idLevel = parseInt(idLevel, 10);

            if (promoAction.get("CODCONTRACTOR") != newValue || promoAction.get("LEVCONTRACTOR") != idLevel) {
                promoAction.set("LEVCONTRACTOR", idLevel);
                promoAction.set("LEVPARTICIPANTS", idLevel);
                promoAction.set("CODRESPONSIBLE", ctrl.selectedNavRow.get("CODUSR1"));

                //change available coverings according to contractor level
                var newOptions;
                if (this._codCoveringCombo) {
                    var codDiv = promoAction.get("CODDIV");
                    newOptions = this._getCoverings(idLevel, codDiv);
                    this._codCoveringCombo.setOptions(newOptions);
                    promoAction.set("CODCOVERING", "");
                    this._setDefaultValue(promoAction, "CODCOVERING", newOptions);
                }

                //change available participant levels according to contractor level
                if (this._levParticipantsCombo) {
                    newOptions = this._getParticipantLevelVoices(idLevel);
                    this._levParticipantsCombo.setOptions(newOptions);
                }

                shouldAlign = true;
            }
        }
        else {
            //reset contractor related fields
            promoAction.set("CODRESPONSIBLE", "");
            promoAction.set("CODCOVERING", "");

            var belowMinLevel = SalesPromotionEngine.getCustHierMinLevel() - 1;
            promoAction.set("LEVCONTRACTOR", belowMinLevel);
            promoAction.set("LEVPARTICIPANTS", belowMinLevel);
            if (this._levParticipantsCombo) {
                this._levParticipantsCombo.setOptions([]);
            }

            promoAction.getSubEntityStore("Participant").clear();
            this._afterListAlignment(gui, "Participant", "PARTICIPANTS", "LIST_PARTICIPANTS");

            promoAction.getSubEntityStore("DeliveryPoint").clear();
            this._afterListAlignment(gui, "DeliveryPoint", "DELIVERY_POINTS", "LIST_DELIVERYPOINTS");

            shouldAlign = true;
        }

        if (shouldAlign) {
            promoAction.set("FLGPARTICIPANTSALIGN", true);
            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
            promoAction.set("FLGCHECKSETSALIGN", true);
            promoAction.set("FLGCUSTOMPROPSALIGN", true);

            if (XApp.isEmptyOrWhitespaceString(promoAction.get("CODCONTRACTOR")))
                return;

            var exeq = gui.exe;
            var skipDeliveryPointsAlignment = false;
            //attempt to align participants
            exeq.pushHandler(self, function () {
                self._alignParticipants(gui,
                function () {
                    exeq.executeNext();

                },
                function (serverCall) {
                    self._afterListAlignment(gui, "Participant", "PARTICIPANTS", "LIST_PARTICIPANTS");
                    skipDeliveryPointsAlignment = !serverCall && !promoAction.get("FLGDELIVERYPOINTSALIGN");
                    exeq.executeNext();
                }
            );
            });

            //attempt to align delivery points
            exeq.pushHandler(self, function () {
                if (skipDeliveryPointsAlignment) {
                    exeq.executeNext();
                }
                else {
                    self._alignDeliveryPoints(gui, false,
                    function () {
                        exeq.executeNext();
                    },
                    function () {
                        self._afterListAlignment(gui, "DeliveryPoint", "DELIVERY_POINTS", "LIST_DELIVERYPOINTS");
                        XUI.hideWait();
                        exeq.executeNext();
                    }
                );
                }
            });

            exeq.executeNext();
        }
    };

    this._clearParticipantsAndDeliveryPointsError = function (gui) {
        this._setTabValid(gui, "PARTICIPANTS", true);
        this._setTabValid(gui, "DELIVERY_POINTS", true);
    };

    this._onContractorChanged = function (ctrl, promoAction, newValue, oldValue) {
        var sectionContext = ctrl.fieldContext.sectionContext;
        var gui = sectionContext.gui;
        var self = this;

        var contractorIsCleared = newValue == "" && oldValue == null;
        var contractorIsChanged = !XApp.isEmptyString(oldValue);

        if ((contractorIsCleared || contractorIsChanged) && this._mustClearSimulations(gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_CONTRACTOR]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            self._clearSimulationList(promoAction);
                            self._updateContractorRelatedDetails(ctrl, promoAction, newValue);
                            self._clearParticipantsAndDeliveryPointsError(gui);
                            break;
                        case "NO":
                            promoAction.set("CODCONTRACTOR", oldValue);
                            break;
                    }
                    sectionContext.detailContext.refreshControls();
                }
            });
        }
        else {
            self._updateContractorRelatedDetails(ctrl, promoAction, newValue, oldValue);
            self._clearParticipantsAndDeliveryPointsError(gui);
        }
    };

    this._onParticipantsLevelChanged = function (detailContext, promoAction, oldValue) {
        var self = this;
        if (this._mustClearSimulations(detailContext.gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_PARTICIPANTS_LEVEL]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            promoAction.set("FLGPARTICIPANTSALIGN", true);
                            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
                            self._clearSimulationList(promoAction);
                            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
                            break;
                        case "NO":
                            promoAction.set("LEVPARTICIPANTS", oldValue);
                            detailContext.refreshControls();
                            break;
                    }
                }
            });
        }
        else {
            promoAction.set("FLGPARTICIPANTSALIGN", true);
            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
        }
    };

    this._onCoveringChanged = function (detailContext, promoAction, oldValue) {
        var self = this;
        if (!XApp.isEmptyString(oldValue) && this._mustClearSimulations(detailContext.gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_COVERING]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            self._updateActivitiesAccordingToCovering(detailContext.gui);
                            self._clearSimulationList(promoAction);
                            promoAction.set("FLGCHECKSETSALIGN", true);
                            promoAction.set("FLGCUSTOMPROPSALIGN", true);
                            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
                            break;
                        case "NO":
                            promoAction.set("CODCOVERING", oldValue);
                            detailContext.refreshControls();
                            break;
                    }
                }
            });
        }
        else {
            self._updateActivitiesAccordingToCovering(detailContext.gui);
            promoAction.set("FLGCHECKSETSALIGN", true);
            promoAction.set("FLGCUSTOMPROPSALIGN", true);
            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
        }
    };

    this._onSellinPeriodChanged = function (detailContext, promoAction, oldValue, fieldName) {
        var self = this;

        var otherField = (fieldName == "DTESTARTSELLIN") ? "DTEENDSELLIN" : "DTESTARTSELLIN";
        var otherValue = promoAction.get(otherField);

        if (!XApp.isEmptyDate(oldValue) && !XApp.isEmptyDate(otherValue) && this._mustClearSimulations(detailContext.gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_SELLIN]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            promoAction.set("FLGPARTICIPANTSALIGN", true);
                            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
                            promoAction.set("FLGCHECKSETSALIGN", true);
                            promoAction.set("FLGCUSTOMPROPSALIGN", true);
                            self._applySellinSelloutRule(detailContext.gui, promoAction);
                            self._clearSimulationList(promoAction);
                            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
                            break;
                        case "NO":
                            promoAction.set(fieldName, oldValue);
                            detailContext.refreshControls();
                            detailContext.setFieldsStatus();
                            break;
                    }
                }
            });
        }
        else {
            promoAction.set("FLGPARTICIPANTSALIGN", true);
            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
            promoAction.set("FLGCHECKSETSALIGN", true);
            promoAction.set("FLGCUSTOMPROPSALIGN", true);
            self._clearParticipantsAndDeliveryPointsError(detailContext.gui);
            self._applySellinSelloutRule(detailContext.gui, promoAction);
        }
    };

    this._onSelloutPeriodChanged = function (gui, promoAction) {
        var self = this;
        var modified = false;

        promoAction.getSubEntityStore("PromoDummyCluster").each(function (dummyCluster) {
            modified = self._setClusterSelloutPeriod(dummyCluster) || modified;
        });

        if (modified) {
            var clusters = promoAction.getSubEntityStore("PromoDummyCluster");
            var senchaStore = gui.tabCtrls["SELLOUT_DETAIL"].sections["LIST_CLUSTERS"].innerPanel.list.getStore();
            clusters.rebindSenchaStore(senchaStore);
        }

        promoAction.set("FLGCHECKSETSALIGN", true);
        promoAction.set("FLGCUSTOMPROPSALIGN", true);
        self._clearParticipantsAndDeliveryPointsError(gui);
        self._applySellinSelloutRule(gui, promoAction);
    };

    this._applySellinSelloutRule = function (gui, promoAction) {

        var context = {
            promoAction: promoAction,
            canceled: false
        };

        gui.callCust("applySellinSelloutRule", [context]);

        if (!context.canceled) {
            this._applyDefaultSellinSelloutRule(promoAction);
        };
    };

    this._applyDefaultSellinSelloutRule = function (promoAction) {
        var codContractor = promoAction.get("CODCONTRACTOR");
        if (!codContractor)
            return;

        if (this._datesAlreadySet(promoAction))
            return;

        var sellInSellOutRule = this._getSellInSellOutRule();

        if (!sellInSellOutRule || !sellInSellOutRule.computedPeriod)
            return;

        var referencePeriod = sellInSellOutRule.computedPeriod == "SELLIN" ? "SELLOUT" : "SELLIN";
        if (!this._isPeriodCompletelySet(promoAction, referencePeriod)) {
            return;
        }
        var offset = this._getContractorSellinSelloutOffset(codContractor, sellInSellOutRule.contractorProperty);

        if (referencePeriod == "SELLOUT")
            offset *= -1;

        var referenceStartDate = promoAction.get("DTESTART" + referencePeriod);
        var referenceEndDate = promoAction.get("DTEEND" + referencePeriod);

        promoAction.set("DTESTART" + sellInSellOutRule.computedPeriod, Ext.Date.add(referenceStartDate, Ext.Date.DAY, offset));
        promoAction.set("DTEEND" + sellInSellOutRule.computedPeriod, Ext.Date.add(referenceEndDate, Ext.Date.DAY, offset));
    };

    this._isPeriodCompletelySet = function (promoAction, period) {
        if (XApp.isEmptyDate(promoAction.get("DTESTART" + period)))
            return false;
        if (XApp.isEmptyDate(promoAction.get("DTEEND" + period)))
            return false;
        return true;
    };

    this._getSellInSellOutRule = function () {
        var sellInOutRule = UserContext.getConfigParam("SALESPROMOTION_SELLINSELLOUTRULE", "SELLOUT.CODSIGN");

        var rule = { computedPeriod: "", contractorProperty: "" };

        if (!sellInOutRule)
            return rule;

        if (sellInOutRule.toUpperCase() == "NONE")
            return rule;

        var splitRule = sellInOutRule.split(".");

        if (splitRule.length != 2)
            return rule;

        rule.computedPeriod = splitRule[0];
        rule.contractorProperty = splitRule[1];

        return rule;
    };

    // at least one date of each interval
    this._datesAlreadySet = function (promoAction) {
        return (!XApp.isEmptyDate(promoAction.get("DTESTARTSELLIN")) ||
            !XApp.isEmptyDate(promoAction.get("DTEENDSELLIN"))) &&
            (!XApp.isEmptyDate(promoAction.get("DTESTARTSELLOUT")) ||
            !XApp.isEmptyDate(promoAction.get("DTEENDSELLOUT")));
    };

    this._getContractorSellinSelloutOffset = function (codContractor, attribute) {
        if (!codContractor) return 0;
        if (!attribute) return 0;

        var contractor = XNavHelper.getNavRecord("NAV_MOB_CUST",
            new XConstraint("DOCUMENTKEY", "=", CommonEngine.buildCustomerKey(codContractor)));

        if (!contractor) return 0;

        var codtabrow = contractor.get(attribute);
        if (codtabrow == null)
            return 0;

        var qtab = XApp.model.entities.Customer.fields["CODSIGN"].qtabs;
        if (qtab == null)
            return 0;

        var qtabEntry = UserContext.getDecodeEntry(qtab, codtabrow);

        if (!qtabEntry)
            return 0;

        var offSet = Number(qtabEntry.numOptional);
        if (!offSet)
            return 0;

        return offSet;
    };

    this._onParticipantsBlockedChanged = function (gui, promoAction, newValue) {
        if (!newValue) {
            promoAction.set("FLGDELIVERPOINTSBLOCKED", false);
        }
        var deliveryPointsDetailContext = gui.getTabDetailContext("DELIVERY_POINTS");
        if (deliveryPointsDetailContext) {
            deliveryPointsDetailContext.refreshControls();
            deliveryPointsDetailContext.setFieldsStatus();
        }
    };

    //#endregion

    //#region PRODUCTS tab

    //#region Product Fields
    this._onProductsTabActivated = function (gui) {
        this._setTabValid(gui, "PRODUCTS", true);
        if (!this._isWorkflowEditable(gui))
            return;

        var exeq = gui.exe;
        var self = this;
        var promoAction = gui.getDocument();
        var skipDeliveryPointsAlignment = false;

        XUI.showWait();

        exeq.pushHandler(self, function () {
            self._requestCustomValues(gui, promoAction.getSubEntityStore("PromoActionProduct"),
            function () {
                exeq.executeNext();
            },
                function (serverCall) {
                    if (serverCall) {
                        self._evaluateActionFormulas(promoAction);
                        self._refreshProductValues(gui);
                        promoAction.set("FLGCUSTOMPROPSALIGN", false);
                    }
                    exeq.executeNext();
                }
        );
        });

        exeq.pushHandler(self, function () {
            if (!promoAction.get("FLGCHECKSETSALIGN")) {
                exeq.executeNext();
            }
            else {
                self._loadPreliminaryCheckSets(promoAction,
                    function () {
                        exeq.executeNext();
                    },
                    function () {
                        promoAction.set("FLGCHECKSETSALIGN", false);
                        exeq.executeNext();
                    });
            }
        });

        //attempt to align participants
        exeq.pushHandler(self, function () {
            self._alignParticipants(gui,
                function () {
                    exeq.executeNext();
                },
                function (serverCall) {
                    skipDeliveryPointsAlignment = !serverCall && !promoAction.get("FLGDELIVERYPOINTSALIGN");
                    exeq.executeNext();
                }
            );
        });

        //attempt to align delivery points
        exeq.pushHandler(self, function () {
            if (skipDeliveryPointsAlignment) {
                exeq.executeNext();
            }
            else {
                self._alignDeliveryPoints(gui, false,
                    function () {
                        exeq.executeNext();
                    },
                    function () {
                        exeq.executeNext();
                    }
                );
            }
        });

        exeq.pushHandler(self, function () {
            this._refreshGridColumns(gui.tabCtrls.PRODUCTS);
            XUI.hideWait();
            exeq.executeNext();
        });

        exeq.pushHandler(self, function () {
            if (!self._isReloading())
                return;

            var reloadContext = this._getReloadContext();
            if (reloadContext.reloadSection == "LIST_SIMULATION") {
                var index = reloadContext.promoActionProductIndex;
                gui.tabCtrls.PRODUCTS.openSubDetailFromList(
                    gui.tabCtrls.PRODUCTS.sections.SECTION_PRODUCTS.store,
                    gui.tabCtrls.PRODUCTS.sections.SECTION_PRODUCTS.grid,
                    index,
                    "PromoActionProduct",
                    gui.tabCtrls.PRODUCTS.sections.SECTION_PRODUCTS.sectionContext);
            }
        });

        exeq.executeNext();
    };

    //status of fields from PRODUCTS tab
    this._setProductsTabFieldStatus = function (context) {
        var fieldName = context.fieldName;
        var fieldContext = context.field.fieldContext;
        var entity = context.sectionContext.entity;
        var entityName = entity.getEntityName();

        switch (entityName) {
            case "PromoActionProduct":
                switch (fieldName) {
                    case "QTYESTIMATED":
                        context.valid = fieldContext.isValid != false;
                        break;
                    case "QTYSIMULATED":
                    case "QTYBASELINE":
                    case "QTYUPLIFT":
                    case "TPE_SOURCE":
                        context.visible = PromoParameters.getInstance().getEnableEffectiveness();
                        break;
                    case "MULTIACTIVITIES":
                        if (this._noActivities)
                            context.valid = (entity.getSubEntityStore("ProductActivity").getCount() != 0);
                        break;
                    default:
                        //validate mandatory measure fields
                        if (fieldContext.config.mandatory)
                            context.valid = fieldContext.isValid != false;
                        break;
                }
                break;
            case "ProductSimulation":
                switch (fieldName) {
                    case "QTYSIMULATED":
                    case "QTYBASELINE":
                    case "QTYUPLIFT":
                        context.visible = PromoParameters.getInstance().getEnableEffectiveness();
                        break;
                    case "FLGSELECTED":
                        context.valid = this._isSimulationSelectionValid(entity.getParentEntity());
                        break;
                }
                break;
        }
    };

    //validates fields from PRODUCTS tab
    this._validateProductsTabField = function (context) {
        var fieldContext = context.field.fieldContext;
        var fieldName = fieldContext.fieldName;
        var entity = fieldContext.sectionContext.entity;
        var entityName = entity.getEntityName();

        //convert value, if needed
        var newValue = this._convertValue(context.newVal, fieldContext.xdef.fldType);

        switch (entityName) {
            case "PromoActionProduct":
                switch (fieldName) {
                    case "QTYESTIMATED":
                        return this._isEstimatedQtyValid(newValue);
                    default:
                        //validate mandatory dynamic measure fields
                        if (fieldContext.config.mandatory)
                            return newValue != 0;
                        break;
                }
                break;
        }

        return true;
    };

    //validate all info from PRODUCTS tab
    this._validateProductsTab = function (gui, promoAction) {
        var hasProducts, hasActivities = true;
        var products = promoAction.getSubEntityStore("PromoActionProduct");

        if (products.getCount() <= 0) {
            hasProducts = false;
            this._setTabValid(gui, "PRODUCTS", false, UserContext.translate("MOB.PROMO.ERR_NO_PRODUCTS"));
        }
        else {
            hasProducts = true;
            for (var i = 0, n = products.getCount() ; i < n; i++) {
                if (products.getAt(i).getSubEntityStore("ProductActivity").getCount() <= 0) {
                    hasActivities = false;
                    this._setTabValid(gui, "PRODUCTS", false, UserContext.translate("MOB.PROMO.MISSING_PRODUCT_ACTIVITIES"));
                    break;
                }
            }
        }

        return hasProducts && hasActivities;
    };

    //validates the entity
    this._validatePromoActionProduct = function (detailContext) {
        var entity = detailContext.entity;

        //check for activities
        var productActivities = entity.getSubEntityStore("ProductActivity");
        var result = productActivities.getCount() > 0;
        this._noActivities = !result;

        var validatedFields = [];

        //check QTYESTIMATED
        var field = detailContext.fields["QTYESTIMATED"];
        if (field) {
            var isEstimatedQtyValid = this._isEstimatedQtyValid(entity.get("QTYESTIMATED"));
            field.fieldContext.isValid = isEstimatedQtyValid;
            result = result && isEstimatedQtyValid && entity.isFieldValid("QTYESTIMATED");
            validatedFields.push("QTYESTIMATED");
        }

        for (var f in detailContext.fields) {
            var fieldContext = detailContext.fields[f].fieldContext;
            if (fieldContext.config.mandatory) {
                //check mandatory dynamic measure fields
                fieldContext.isValid = entity.get(fieldContext.fieldName) != 0;
                result = result && fieldContext.isValid;
            }
            result = result && entity.isFieldValid(fieldContext.fieldName);
            validatedFields.push(fieldContext.fieldName);
        }

        //check values of not visible fields within range
        var overflowFields = [];
        var productDef = XApp.model.getEntityDef(entity.getEntityName());
        if (productDef) {
            for (f in productDef.fields) {
                if (Ext.Array.contains(validatedFields, f))
                    continue;

                var fieldDef = productDef.fields[f];
                switch (fieldDef.fldType) {
                    case "decimal":
                    case "float":
                    case "int":
                    case "long":
                        if (result && fieldDef.minVal && entity.get(f) < fieldDef.minVal) {
                            entity.set(f, fieldDef.minVal);
                            overflowFields.push(f);
                        }
                        if (result && fieldDef.maxVal && entity.get(f) > fieldDef.maxVal) {
                            entity.set(f, fieldDef.maxVal);
                            overflowFields.push(f);
                        }
                        break;
                }
            }
        }

        if (overflowFields.length > 0) {
            var m = "";
            for (var i = 0; i < overflowFields.length; i++) {
                m += UserContext.tryTranslate("[" + overflowFields[i] + "]") + "<br>";
            }
            setTimeout(
            XUI.showMsgBox({
                title: UserContext.tryTranslate("[MOB.TRIMMED_FIELDS]"),
                msg: m,
                buttons: "OK",
                icon: 'WARN'
            }), 500);
        }

        if (!result)
            detailContext.setFieldsStatus();

        return result;
    };

    this._isEstimatedQtyValid = function (qtyEstimated) {
        return PromoParameters.getInstance().getEstimatedQtyMandatory() ?
               qtyEstimated > 0 :
               qtyEstimated >= 0;
    };

    //creates fields for layout configuration of PromoActionProduct according to promo configuration
    this._getFieldsForProduct = function (promoActionProduct) {
        var measureFields = SalesPromotionEngine.getMeasureFieldsForProduct(promoActionProduct);

        var fields = [];
        for (var i = 0, l = measureFields.length; i < l; i++) {
            var measureField = measureFields[i];

            if (!measureField.FLGVISIBLE)
                continue;

            var field = {
                attrs: {
                    editable: measureField.FLGREADONLY ? "false" : "true",
                    name: measureField.FIELDNAME
                },
                children: [],
                elementName: "field",
                mandatory: measureField.FLGMANDATORY && !measureField.FLGREADONLY && !measureField.FLGDIVIDEDONPRODUCTS
            };

            if (!XApp.isEmptyOrWhitespaceString(measureField.FORMATSTR))
                field.attrs.formatString = PromoConfig.processFormatStr(measureField.FORMATSTR);

            if (!XApp.isEmptyOrWhitespaceString(measureField.CODTAB)) {
                if (UserContext.getDecodeTable(measureField.CODTAB) != null) {
                    field.attrs.presType = measureField.FLGMULTISELECTION ? "multiqtabs" : "qtabs";
                }
                field.attrs.qtabs = measureField.CODTAB;
            }

            if (["decimal", "int"].indexOf(promoActionProduct.getFieldDef(measureField.FIELDNAME).fldType) >= 0) {
                field.attrs.minVal = "0";
            };

            fields.push(field);
        }

        return fields;
    };

    //custom render for Product detail popup
    //each section has its own carousel panel... with some exception, ofcourse
    this._renderProductDetail = function (context) {
        var self = this;
        var detailContext = context.detailContext;
        var scrollable;

        //reset them, because the UI layout may change for the same detail context
        detailContext.fields = {};
        detailContext.sections = {};
        //detailContext.newButtons = [];
        detailContext.sectionButtons = [];
        //detailContext.removeButtons = [];

        var carousel = Ext.create('Ext.Carousel', {
            listeners: {
                activeitemchange: function (c, value, oldValue) {
                    if (value && oldValue && !this._simulationRunning &&
                        value.caption == "LIST_CHECKSETS" &&
                        oldValue.caption == "PRODUCT_ROW") {
                        //change from product fields panel to product checksets panel
                        self._onCheckSetPanelActivated(detailContext);
                    }
                }
            }
        });
        context.hostPanel.add(carousel);
        detailContext.carousel = carousel;

        for (var iSect = 0, n = detailContext.layoutConfig.children.length; iSect < n; iSect++) {
            var sectionConfig = detailContext.layoutConfig.children[iSect];
            if (sectionConfig["elementName"] == "section") {
                var sectType = sectionConfig.attrs["type"];
                if (sectType == 'newSelector')
                    continue;

                if (!this._shouldDisplayProductSubDetail(sectionConfig.attrs["caption"]))
                    continue;

                scrollable = (sectionConfig.attrs["caption"] == "LIST_CHECKSETS") ? false : context.scrollable;

                var scrollPanel = new Ext.Panel({
                    scrollable: (scrollable ? 'vertical' : null),
                    flex: 1,
                    layout: {
                        type: (scrollable ? 'vbox' : 'fit')
                    },
                    cls: 'sm1-gui-scrollpane sm1-gui-subDetail',
                    items: []
                });

                var s = detailContext.createSection(sectionConfig);
                scrollPanel.add(s);
                scrollPanel.caption = sectionConfig.attrs["caption"];

                //the ProductSimulation and pending simulation lists belong in the same panel
                if (iSect + 1 < n && detailContext.layoutConfig.children[iSect + 1].attrs["caption"] == "LIST_PENDING_SIMULATION") {
                    iSect++;
                    sectionConfig = detailContext.layoutConfig.children[iSect];
                    s = detailContext.createSection(sectionConfig);
                    scrollPanel.add(s);
                }

                carousel.add(scrollPanel);
            }
        }
        if (this._isReloading() && this._getReloadContext().reloadSection == "LIST_SIMULATION") {
            carousel.setActiveItem(2);
            this._clearReloadContext();
        }
    };

    this._shouldDisplayProductSubDetail = function (sectionName) {
        if (sectionName == 'LIST_SIMULATION' || sectionName == 'LIST_PENDING_SIMULATION') {
            return UserContext.getConfigParam("SALESPROMOTION_ENABLE_EFFECTIVENESS", 0) != false;
        }
        return true;
    };

    this._getProductsGridLayout = function (layout, detailContext) {
        var modifiedLayout = Ext.clone(layout);
        var allMeasureFields = SalesPromotionEngine.getMeasureFieldsForAction(detailContext.entity);

        var context = {
            gui: this,
            visibleFields: {}
        };

        for (var i = 0; i < allMeasureFields.length; i++) {
            context.visibleFields[allMeasureFields[i].FIELDNAME] = 0;
        }

        detailContext.gui.callCust("fillProductFieldsVisibility", [detailContext.gui.getDocument(), context]);


        var visibleFieldsCount = 0;
        for (var i = 0; i < allMeasureFields.length; i++) {
            if (context.visibleFields[allMeasureFields[i].FIELDNAME])
                visibleFieldsCount += 1;
        }

        var columnEditable = this._isWorkflowEditable(detailContext.gui);

        var gridSize = 70 / visibleFieldsCount;

        var productsGrid = modifiedLayout.children[0].children[1];

        productsGrid.children.push({
            elementName: "column",
            attrs: {
                name: "DESPRODUCT",
                width: "10%",
                editable: "false"
            },
            children: {}
        });

        productsGrid.children.push({
            elementName: "column",
            attrs: {
                name: "DESACTIVITIES",
                width: "10%",
                editable: "false"
            },
            children: {}
        });

        productsGrid.children.push({
            elementName: "column",
            attrs: {
                name: "QTYESTIMATED",
                width: "10%",
                editable: String(columnEditable)
            },
            children: {}
        });

        var initialGridColumns = productsGrid.children.length;
        for (var i = 0; i < allMeasureFields.length; i++) {
            var currentField = allMeasureFields[i];

            // if field is not visible in configuration, don't add a column
            if (!currentField.FLGVISIBLE)
                continue;

            // if the field is hidden because there's not enough space, don't add column
            if (!context.visibleFields[currentField.FIELDNAME])
                continue;

            if (Boolean(allMeasureFields[i].FLGREADONLY)) {
                columnEditable = false;
            }
            var columnWidth = gridSize + "%";
            productsGrid.children.push({
                elementName: "column",
                attrs: {
                    name: allMeasureFields[i].FIELDNAME,
                    width: columnWidth,
                    editable: String(columnEditable)
                },
                children: {}
            });
        }

        return modifiedLayout;
    };

    this._getProductDetailsLayout = function (layout, detailContext) {
        var fields = layout.children[0].children;
        var dynamicFields = [];

        switch (detailContext.entityName) {
            case "PromoActionProduct":
                if (!this._productFixedFieldsCount) {
                    //store the number of default fields; other fields can be added dynamically
                    this._productFixedFieldsCount = fields.length;
                }
                else {
                    //remove dynamic fields added previously
                    fields.splice(this._productFixedFieldsCount, fields.length - this._productFixedFieldsCount);
                }

                dynamicFields = this._getFieldsForProduct(detailContext.entity);
                break;
            case "ProductSimulation":
                //these fields don't depend on the entity, therefore it is enough to add them only once
                if (!this._simulationFieldsAdded) {
                    dynamicFields = this._getFieldsForSimulation();
                    this._simulationFieldsAdded = true;
                }
                break;
        }

        //add dynamic fields (according to promo config)
        if (dynamicFields && dynamicFields.length > 0)
            layout.children[0].children = fields.concat(dynamicFields);

        return layout;
    };

    this._refreshProductFieldsLayout = function (detailContext) {
        detailContext.layoutConfig = this.getCustomLayout(detailContext.layoutConfig, detailContext);
        detailContext.renderDetailGui(detailContext.mainPanel);
    };

    this._refreshGridColumns = function (productsTab) {
        productsTab.gui.tabCtrls[productsTab.tabName] = null;
        productsTab.gui.tabSubDetailsByName[productsTab.tabName].removeAll();

        var context = new DetailContext({
            masterGui: productsTab.gui,
            tabName: productsTab.tabName,
            storeEntity: productsTab.gui.docStore.getAt(0),
            isRootContext: true,
            tabConfig: productsTab.tabConfig
        });

        productsTab.gui.tabCtrls[productsTab.tabName] = context;
        var p = context.renderDetailGui();
        if (p == null) return;
        productsTab.gui.tabSubDetailsByName["PRODUCTS"].add(p);
        //refresh grid scroller
        var grid = p.ctrl.sections.SECTION_PRODUCTS.grid;
        grid.refreshScroller();
    };

    //handles onEditEnding for PromoActionProduct entity
    this._handlePromoActionProductFieldEdit = function (ctrl, fieldName, newValue, oldValue) {
        if (!ctrl.fieldContext.isValid)
            return;

        var sectionContext = ctrl.fieldContext.sectionContext;
        var entity = sectionContext.entity;

        switch (fieldName) {
            case "MULTIACTIVITIES":
                var detailContext = sectionContext.detailContext;
                var removedActivities = Ext.Array.difference(oldValue, newValue);
                var promoAction = detailContext.gui.getDocument();
                if (removedActivities.length > 0) {
                    this._resetRemovedProductActivityMeasures(entity, removedActivities, promoAction.get("CODDIV"));
                }

                this._refreshProductFieldsLayout(detailContext);

                //refresh activities and recalculate formulas                
                this._refreshPromoActionActivities(promoAction, entity);
                this._evaluateActionFormulas(promoAction);
                this._refreshProductValues(detailContext.gui);
                if (entity.isNew) {
                    // it is not yet added to store evaluated above
                    this._evaluateProductFormulas(promoAction, entity);

                    var idAction = promoAction.get("IDACTION");
                    entity.getSubEntityStore("ProductActivity").each(function (pa) {
                        pa.set("IDACTION", idAction);
                    });
                }

                entity.set("FLGCHECKSETSALIGN", true);
                break;
            default:
                this._handleProductNumericFieldEdit(entity, sectionContext, fieldName, oldValue);
                break;
        }
    };

    this._handleProductNumericFieldEdit = function (product, sectionContext, fieldName, oldValue) {
        var fieldDef = product.getFieldDef(fieldName);
        if (!fieldDef)
            return;
        var fldType = fieldDef.fldType;

        if (fldType == "decimal" || fldType == "float" || fldType == "int" || fldType == "long") {
            this._onProductMeasureFieldUpdated(sectionContext, fieldName, oldValue);
        }
    };

    //handles measure evaluation when a field changes
    this._onProductMeasureFieldUpdated = function (sectionContext, fieldName, oldValue) {
        var detailContext = sectionContext.detailContext;
        var action = detailContext.gui.getDocument();
        var product = sectionContext.entity;

        //create copy, in case evaluation fails and the values need to be restored
        var backupProduct = product.clone();
        backupProduct.set(fieldName, oldValue);

        var excludedFields = [fieldName];
        var valid = this._evaluateProductFormulas(action, product, excludedFields);
        if (!valid) {
            //restore values
            sectionContext.entity = backupProduct;
            if (!entity.isNew) {
                var products = action.getSubEntityStore("PromoActionProduct");
                var index = products.findIndex(product);
                if (index >= 0) {
                    products.setAt(index, backupProduct);
                }
            }
        }
        else {
            product.set("FLGFUNDCONSTRALIGN", true);
        }
    };

    //asks server for custom product values
    this._requestCustomValues = function (gui, products, onFail, onSuccess) {
        var promoAction = gui.getDocument();
        var addProduct = (products instanceof XBaseEntity);
        if (addProduct) {
            var product = products;
            products = new XStore({ entityName: product.getEntityName() });
            products.add(product);
        }

        if (!XApp.isOnline() || !this._isWorkflowEditable(gui) ||
            (!promoAction.get("FLGCUSTOMPROPSALIGN") && !addProduct) ||
            XApp.isEmptyString(promoAction.get("CODCONTRACTOR")) ||
            XApp.isEmptyDate(promoAction.get("DTESTARTSELLIN")) ||
            XApp.isEmptyDate(promoAction.get("DTEENDSELLIN")) ||
            products.getCount() <= 0) {
            onSuccess(false);
            return;
        }

        XHttpHelper.ExecuteServerOp(
            {
                assemblyName: 'Xtel.SM1.Touch',
                className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                methodName: 'GetCustomValues',
                data: {
                    "codDiv": promoAction.get("CODDIV"),
                    "codContractor": promoAction.get("CODCONTRACTOR"),
                    "levContractor": promoAction.get("LEVCONTRACTOR"),
                    "products": products.toJsonObject(),
                    "startSellIn": promoAction.get("DTESTARTSELLIN"),
                    "endSellIn": promoAction.get("DTEENDSELLIN")
                }
            },
            function (response, textStatus, e) {
                XUI.showExceptionMsgBox(e);
                XLog.logEx(e);
                onFail();
            },
            function (data) {
                for (var i = 0, n = products.getCount() ; i < n; i++) {
                    var prod = products.getAt(i);
                    var propVals = data[prod.get("CODPRODUCT") + "|" + prod.get("LEVPRODUCT")];
                    if (!propVals) {
                        continue;
                    }

                    var custFields = prod.getSubEntityStore("ProductCustomField");

                    for (var j = 0, m = propVals.length; j < m; j++) {
                        var propVal = propVals[j];
                        var propName = propVal.key;

                        var custField = custFields.findBy(function (pcf) {
                            return pcf.get("CUSTOMFIELDNAME") == propName;
                        });

                        if (custField) {
                            custField.set("NUMCUSTOMFIELDVALUE", propVal.val);
                        }
                        else {
                            custField = new XEntity({ entityName: "ProductCustomField" });
                            custField.set("IDACTION", prod.get("IDACTION"));
                            custField.set("CODPRODUCT", prod.get("CODPRODUCT"));
                            custField.set("LEVPRODUCT", prod.get("LEVPRODUCT"));
                            custField.set("CUSTOMFIELDNAME", propName);
                            if (Ext.isNumber(propVal.val)) {
                                custField.set("NUMCUSTOMFIELDVALUE", propVal.val);
                            } else {
                                custField.set("STRCUSTOMFIELDVALUE", propVal.val);
                            }
                            custFields.add(custField);
                        }
                    }
                }

                onSuccess(true);
            }
        );
    };

    //populate the list of product measures for all promo products
    this._evaluateActionFormulas = function (promoAction) {
        var products = promoAction.getSubEntityStore("PromoActionProduct");
        if (products.getCount() <= 0)
            return;

        //var excludedFields = SalesPromotionEngine.getExcludedFields(promoAction);
        var self = this;
        products.each(function (product) {
            self._evaluateProductFormulas(promoAction, product);
        });
    };

    this._refreshProductValues = function (gui) {
        var promoAction = gui.getDocument();
        var products = promoAction.getSubEntityStore("PromoActionProduct");

        if (gui.tabCtrls["PRODUCTS"]) {
            //refresh products list
            var senchaStore = gui.tabCtrls["PRODUCTS"].sections["SECTION_PRODUCTS"].store;
            products.rebindSenchaStore(senchaStore);
        }
    };

    this._getProductMeasureFields = function (product, codDiv) {
        var measureFields = this._getDefaultMeasureFields();
        var productActivities = this._getActivitiesWithProductType(product);
        measureFields = measureFields.concat(this._getMeasureFieldsForActivities(productActivities, codDiv));
        return measureFields.sort(PromoConfig.fnSortNumPrg);
    };

    this._getActivitiesWithProductType = function (product) {
        var activities = [];
        var productActivities = product.getSubEntityStore("ProductActivity");

        for (var i = 0, l = productActivities.getCount() ; i < l; i++) {
            var currentActivityCode = productActivities.getAt(i).get("CODACTIVITY");
            var promoActivity = PromoConfig.getPromoActivity(currentActivityCode);
            if (promoActivity && promoActivity.ACTIVITYTYPE == SalesPromotionNameSpace.ActivityType.Product) {
                activities.push(currentActivityCode);
            }
        }

        return activities;
    };

    this._getDefaultMeasureFields = function () {
        var defaultMeasureCodes = PromoConfig.getDefaultMeasures();
        var measureFields = this._getFieldsForMeasures(defaultMeasureCodes);
        return measureFields;
    };

    this._getMeasureFieldsForActivities = function (activities, codDiv) {
        var measureFields = [];
        for (var i = 0; i < activities.length; i++) {
            var currentActivity = activities[i];
            measureFields = measureFields.concat(this._getActivityMeasureFields(currentActivity, codDiv));
        }
        return measureFields;
    };

    this._getActivityMeasureFields = function (activity, codDiv) {
        var measureCodes = PromoConfig.getMeasureCodesForActivity(activity, false, SalesPromotionNameSpace.PromoSource.PromoAction, codDiv);
        var measureFields = this._getFieldsForMeasures(measureCodes);
        return measureFields;
    };

    this._getFieldsForMeasures = function (measureCodes) {
        var measureFields = [];
        for (var i = 0; i < measureCodes.length; i++) {
            var currentMeasureCode = measureCodes[i];
            measureFields = measureFields.concat(PromoConfig.getFieldsForMeasure(currentMeasureCode));
        }
        return measureFields;
    };

    this._evaluateProductFormulas = function (promoAction, product, excludedFields) {
        var valid = true;

        var allExcludedFields = SalesPromotionEngine.getExcludedFields(promoAction);
        if (excludedFields)
            allExcludedFields = allExcludedFields.concat(excludedFields);

        var codDiv = promoAction.get("CODDIV");
        var fields = this._getProductMeasureFields(product, codDiv);

        //fields to be evaluated based on corresponding formula
        var evaluatedFields = [];
        for (var j = 0, k = fields.length; j < k; j++) {
            var promoField = fields[j];
            if (!promoField.FORMULA || (allExcludedFields && Ext.Array.contains(allExcludedFields, promoField.FIELDNAME)))
                continue;

            var result = SalesPromotionEngine.evalFormula(promoField, product);
            product.set(promoField.FIELDNAME, result);
            valid = product.isFieldValid(promoField.FIELDNAME) && valid;
        }

        return valid;
    };

    //find distinct activities from all products and refresh PromoActionActivities
    //if the product is not yet added to promo action products store, take it into consideration separatelly
    this._refreshPromoActionActivities = function (promoAction, product) {
        var codActivity;
        var productActivities;
        var promoActionActivities = promoAction.getSubEntityStore("PromoActionActivity");
        promoActionActivities.clear();

        var isProductHandled = false;
        var products = promoAction.getSubEntityStore("PromoActionProduct");
        if (products.getCount() > 0 || product) {
            var idAction = promoAction.get("IDACTION");
            var distinctActivities = {};
            var activity;
            products.each(function (prod) {
                if (product && prod == product)
                    isProductHandled = true;

                productActivities = prod.getSubEntityStore("ProductActivity");
                productActivities.each(function (pa) {
                    codActivity = pa.get("CODACTIVITY");
                    distinctActivities[codActivity] = codActivity;
                });
            });

            if (product && !isProductHandled) {
                productActivities = product.getSubEntityStore("ProductActivity");
                productActivities.each(function (pa) {
                    codActivity = pa.get("CODACTIVITY");
                    distinctActivities[codActivity] = codActivity;
                });
            }

            for (codActivity in distinctActivities) {
                activity = new XEntity({ entityName: "PromoActionActivity" });
                activity.set("IDACTION", idAction);
                activity.set("CODACTIVITY", distinctActivities[codActivity]);
                promoActionActivities.add(activity);
            }
        }
    };

    //adds missing default activities at promo action level
    this._ensureDefaultActivities = function (promoAction) {
        var defaultActivities = this._getDefaultActivities(promoAction);
        if (defaultActivities.length <= 0)
            return;

        var existingDefaultActivities = [];
        var paActivities = promoAction.getSubEntityStore("PromoActionActivity");
        paActivities.each(function (paa) {
            if (Ext.Array.contains(defaultActivities, paa.get("CODACTIVITY"))) {
                existingDefaultActivities.push(paa.get("CODACTIVITY"));
            }
        });

        if (defaultActivities.length > existingDefaultActivities.length) {
            var missingDefaultActivities = Ext.Array.difference(defaultActivities, existingDefaultActivities);

            var idAction = promoAction.get("IDACTION");
            for (var i = 0, n = missingDefaultActivities.length; i < n; i++) {
                var activity = new XEntity({ entityName: "PromoActionActivity" });
                activity.set("IDACTION", idAction);
                activity.set("CODACTIVITY", missingDefaultActivities[i]);
            }
        }
    };

    //a promo action cannot contain more products with the same codProduct and levProduct
    this._promoActionHasProduct = function (promoAction, codProduct, levProduct) {
        var products = promoAction.getSubEntityStore("PromoActionProduct");
        for (var i = 0, l = products.getCount() ; i < l; i++) {
            var product = products.getAt(i);
            if (product.get("CODPRODUCT") == codProduct && product.get("LEVPRODUCT") == levProduct)
                return true;
        }

        return false;
    };

    //removes obsolete activities
    this._updateActivitiesAccordingToCovering = function (gui) {
        var promoAction = gui.getDocument();
        var availableActivities = this._getActivities(promoAction);
        var products = promoAction.getSubEntityStore("PromoActionProduct");
        var self = this;

        var modified = false;
        products.each(function (product) {
            var productActivities = product.getSubEntityStore("ProductActivity");
            var toRemove = [];

            productActivities.each(function (productActivity) {
                var isAllowed = false;
                var codActivity = productActivity.get("CODACTIVITY");
                for (var i = 0, n = availableActivities.length; i < n; i++) {
                    if (availableActivities[i].value == codActivity) {
                        isAllowed = true;
                        break;
                    }
                }
                if (!isAllowed) {
                    toRemove.push(productActivity);
                    modified = true;
                }
            });

            if (toRemove.length > 0) {
                productActivities.removeAll(toRemove);
                self._resetRemovedProductActivityMeasures(product, toRemove, promoAction.get("CODDIV"));
                self._evaluateProductFormulas(product);
            }
        });

        if (modified) {
            XUI.showInfoOk({ msg: UserContext.translate("PRODUCT_ACTIVITIES_UPDATED_ACCORDING_COVERING_SELECTION") });

            this._refreshPromoActionActivities(promoAction);

            if (gui.tabCtrls["PRODUCTS"]) {
                var senchaStore = gui.tabCtrls["PRODUCTS"].sections["SECTION_PRODUCTS"].store;
                products.rebindSenchaStore(senchaStore);
            }
        }
    };

    //reset values for measures from activities removed from product
    this._resetRemovedProductActivityMeasures = function (product, removedActivities, codDiv) {
        for (var i = 0, n = removedActivities.length; i < n; i++) {
            var removedActivity = removedActivities[i];
            var codActivity = removedActivity.substring ? removedActivity : removedActivity.get("CODACTIVITY");
            var measures = PromoConfig.getMeasureCodesForActivity(codActivity, false,
                                                                  SalesPromotionNameSpace.PromoSource.PromoAction, codDiv);
            for (var j = 0, m = measures.length; j < m; j++) {
                var fields = PromoConfig.getFieldsForMeasure(measures[j], false);
                for (var k = 0, l = fields.length; k < l; k++) {
                    var fieldName = fields[k].FIELDNAME;
                    var fieldDef = product.getFieldDef(fieldName);
                    if (!fieldDef)
                        continue;
                    switch (fieldDef.fldType) {
                        case "decimal":
                        case "float":
                        case "int":
                        case "long":
                            product.set(fieldName, 0);
                            break;
                        case "string":
                        case "qtabs":
                            product.set(fieldName, "");
                            break;
                        case "bool":
                            product.set(fieldName, false);
                            break;
                        case "DateTime":
                            product.set(fieldName, Constants.SM1MINDATE);
                            break;
                    }
                }
            }
        }
    };

    //convert value of multiselection promo measure string fields from array to concatenation
    this._processMultiselectionMeasureFields = function (promoAction) {
        var xdef = XApp.model.getEntityDef("PromoActionProduct");
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            for (var fieldName in xdef.fields) {
                if (xdef.fields[fieldName].fldType != "string")
                    continue;

                var val = product.get(fieldName);
                if (!val.splice)
                    continue;

                product.set(fieldName, val.join(";"));
            }
        });
    };

    this._brutallyHandleNoDisplay = function (entity) {

        if (entity.getFieldDef("CODDISPLAY")) {
            entity.set("CODDISPLAY", "NODISPLAY");
        }

        for (var prop in entity) {
            if (prop.endsWith("DetailsStore") && entity[prop].getCount) {
                for (var i = 0; i < entity[prop].getCount() ; i++) {
                    this._brutallyHandleNoDisplay(entity[prop].getAt(i));
                }
            }
        }
    };

    this._fillAllProductDetails = function (promoAction) {
        var self = this;
        promoAction.getSubEntityStore("PromoActionProduct").each(function (currentProduct) {
            self._fillProductDetails(promoAction, currentProduct);
        });
        this._brutallyHandleNoDisplay(promoAction);
    };

    this._fillProductDetails = function (promoAction, product) {
        var self = this;
        var articles = this._getCachedArticlesForProduct(promoAction, product);
        var savedProductDetails = product.getSubEntityStore("ProductDetail").toArray();
        var newProductDetails = product.getSubEntityStore("ProductDetail");
        newProductDetails.clear();

        articles.forEach(function (promoArticle) {
            self._addNewProductDetail(promoAction, product, promoArticle);
        });
        this._restoreSavedDetailsInclusionState(newProductDetails, savedProductDetails);
    };

    this._getCachedArticlesForProduct = function (promoAction, product) {
        var codDiv = promoAction.get("CODDIV");
        var articleLevel = "CODNODE" + this._getIdFromLevelName(product.get("LEVPRODUCT"));
        var articles = XNavHelper.getFromMemoryCache("NAV_MOB_SP_PROMOARTICLES")
            .Rows.filter(function (x) { return x.get("CODDIV") == codDiv && x.get(articleLevel) == product.get("CODPRODUCT"); });
        return articles;
    };

    this._getIdFromLevelName = function (levelName) {
        return UserContext.getDecodeEntry("SP_PRODHIERLEV", levelName).numOptional;
    };

    this._restoreSavedDetailsInclusionState = function (newDetails, savedDetails) {
        savedDetails.forEach(function (savedDetail) {
            var newDetail = newDetails.findBy(function (x) {
                return x.get("CODNODE0") == savedDetail.get("CODNODE0");
            });
            if (newDetail)
                newDetail.set("FLGINCLUSION", savedDetail.get("FLGINCLUSION"));
        });
    };

    this._addNewProductDetail = function (promoAction, product, promoArticle) {
        var newDetail = new XEntity({ entityName: "ProductDetail" });
        newDetail.set("CODDISPLAY", "NODISPLAY");
        newDetail.set("CODNODE0", promoArticle.get("CODNODE0"));
        newDetail.set("CODNODE1", promoArticle.get("CODNODE1"));
        newDetail.set("CODNODE2", promoArticle.get("CODNODE2"));
        newDetail.set("CODNODE3", promoArticle.get("CODNODE3"));
        newDetail.set("CODNODE4", promoArticle.get("CODNODE4"));
        newDetail.set("CODNODE5", promoArticle.get("CODNODE5"));
        newDetail.set("CODNODE6", promoArticle.get("CODNODE6"));
        newDetail.set("CODNODE7", promoArticle.get("CODNODE7"));
        newDetail.set("DESNODE0", promoArticle.get("DESNODE0"));
        newDetail.set("CODDIV", promoAction.get("CODDIV"));
        newDetail.set("CODPRODUCT", product.get("CODPRODUCT"));
        newDetail.set("LEVPRODUCT", product.get("LEVPRODUCT"));
        newDetail.set("IDACTION", promoAction.get("IDACTION"));
        newDetail.set("FLGINCLUSION", true);

        product.getSubEntityStore("ProductDetail").add(newDetail);

        this._brutallyHandleNoDisplay(promoAction);
    };

    this._initReload = function (reloadContext) {
        XHistory.actualConfig().reloadContext = reloadContext;
    };

    this._isReloading = function () {
        return Boolean(XHistory.actualConfig().reloadContext);
    };

    this._getReloadContext = function () {
        return XHistory.actualConfig().reloadContext;
    };

    this._clearReloadContext = function () {
        delete XHistory.actualConfig().reloadContext;
    };

    this._markBindingsBroken = function () {
        this._needsRebindings = true;
    };

    this._refreshBindings = function (gui) {
        if (this._needsRebindings) {
            gui.reload();
            this._needsRebindings = false;
        }
    };

    this._isSimulationPossible = function (context) {
        var detailContext = context.subGui;
        switch (detailContext.entityName) {
            case "PromoActionProduct":
                return !detailContext.entity.isNew;
            case "PromoAction":
                return detailContext.entity.getSubEntityStore("PromoActionProduct").getCount() > 0;
        }
        return false;
    };

    this._toggleSimulation = function (context) {
        var sectionName = context.config.attrs["caption"];
        var self = this;
        var subEntityName = context.config.attrs["detailObject"];
        var gui = context.gui;
        var promoAction = gui.getDocument();

        var isSimulationRunning = this._simulationRunning || this._hasPendingSimulations(gui.getDocument());

        if (!isSimulationRunning) {
            var product = sectionName == "LIST_SIMULATION" ? context.detailContext.entity : null;
            self._startSimulation(gui, product);
        }
    };

    //#endregion

    //#region CheckSets

    this._backupProductChecksets = function (product) {
        if (product._backup) {
            product._backup.ProductCheckSetDetails = product.getSubEntityStore("ProductCheckSet").toJsonObject();
        }
    };

    this._onCheckSetPanelActivated = function (detailContext) {
        if (!this._isWorkflowEditable(detailContext.gui) ||
            !(detailContext.entity.get("FLGCHECKSETSALIGN") && detailContext.entity.get("FLGFUNDCONSTRALIGN")) ||
            !XApp.isOnline())
            return;

        var product = detailContext.entity;
        var promoAction = detailContext.gui.getDocument();
        var self = this;


        var callback = function () {
            self._afterListAlignment(detailContext, "ProductCheckSet", "PRODUCTS", "LIST_CHECKSETS");
            //backup only productchecksets, not the entire product
            self._backupProductChecksets(product);
            XUI.hideWait();
        };

        if (product.get("FLGCHECKSETSALIGN")) {
            XUI.showWait();
            this._getCheckSetsForProduct(promoAction, product, callback, callback);
        }
        else
            if (product.get("FLGFUNDCONSTRALIGN")) {
                var availableConstraints = this._availableCheckSetConstraints[product.getKey()];
                if (availableConstraints && availableConstraints.length > 0) {
                    XUI.showWait();
                    var constraints = new XStore({ entityName: "CheckSetConstraint" });
                    constraints.addAll(availableConstraints);
                    this._getConstraintFunds(promoAction, constraints, callback, callback);
                }
            }
    };

    this._initProductCheckSets = function (gui, promoAction) {
        var editable = this._isWorkflowEditable(gui);

        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            product.set("FLGCHECKSETSALIGN", editable);
            product.set("FLGFUNDCONSTRALIGN", editable);
            product.getSubEntityStore("ProductCheckSet").each(function (pcs) {
                // Mark as selected all checksets saved for this promo action.
                if (pcs.get("SELECTED") == undefined) {
                    pcs.set("SELECTED", true);
                }
                var idCheckSet = pcs.get("IDCHECKSET");
                var csInfo = SalesPromotionEngine.getCheckSetInfo(idCheckSet);
                if (csInfo) {
                    pcs.set("IDCONFIG", csInfo.idConfig);
                    pcs.set("DESCONFIG", [csInfo.idConfig, csInfo.desConfig].join(" - "));
                    pcs.set("DESCHECKSET", csInfo.desCheckSet);
                }
            });
        });
    };

    this._loadPreliminaryCheckSets = function (promoAction, onFail, onSuccess) {
        var respMandatory = PromoParameters.getInstance().getResponsibleMandatory();
        if (XApp.isOnline() &&
            !XApp.isEmptyString(promoAction.get("CODCONTRACTOR")) &&
            !XApp.isEmptyDate(promoAction.get("DTESTARTSELLIN")) &&
            !XApp.isEmptyDate(promoAction.get("DTEENDSELLIN")) &&
            !XApp.isEmptyDate(promoAction.get("DTESTARTSELLOUT")) &&
            !XApp.isEmptyDate(promoAction.get("DTEENDSELLOUT")) &&
           (!XApp.isEmptyString(promoAction.get("CODCONTRACTOR")) || !respMandatory)) {
            var self = this;
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'GetPreliminaryListOfChecksetForPromoAction',
                    data: promoAction.toJsonObject()
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    self._checkSetList.clear();

                    var checkSets = data["checkSets"];
                    for (var i = 0, l = checkSets.length; i < l; i++) {
                        self._checkSetList.add(new XEntity({ entityName: "CheckSet", data: checkSets[i] }));
                    }

                    onSuccess();
                }
            );
        }
        else {
            onSuccess();
        }
    };

    //load checksets and constraint fund details for several products
    this._getCheckSetsForProducts = function (promoAction, prodKeys, onFail, onSuccess) {
        if (XApp.isOnline()) {
            var self = this;
            this._clearAllEmptyProductCheckSets(promoAction);
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'GetCheckSetListForProducts',
                    data: {
                        promoAction: promoAction.toJsonObject(),
                        checkSetList: self._checkSetList.toJsonObject(),
                        productKeys: prodKeys
                    }
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    self._setConstrFunds(data["constraintFunds"]);

                    var productsStore = promoAction.getSubEntityStore("PromoActionProduct");
                    var productCheckSets = data["productCheckSets"];
                    for (key in productCheckSets) {
                        var tokens = key.split("|");
                        if (tokens.length < 2)
                            continue;

                        var product = productsStore.findBy(function (prod) {
                            return prod.get("LEVPRODUCT") == tokens[3] && prod.get("CODPRODUCT") == tokens[2];
                        });

                        if (!product)
                            continue;

                        self._buildProductCheckSets(product, productCheckSets[key]);
                    }
                    self._ensureAllProductCheckSets(promoAction);
                    self._brutallyHandleNoDisplay(promoAction);
                    onSuccess();
                }
            );
        }
        else {
            onSuccess();
        }
    };

    //load checksets and constraint fund details for a specific product
    this._getCheckSetsForProduct = function (promoAction, product, onFail, onSuccess) {
        if (XApp.isOnline() && product.get("FLGCHECKSETSALIGN")) {
            var self = this;
            var paCopy = promoAction.clone();
            if (product.isNew)
                paCopy.getSubEntityStore("PromoActionProduct").add(product.clone());
            this._clearAllEmptyProductCheckSets(paCopy);
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'GetChecksetForPromoActionProduct',
                    data: {
                        promoAction: paCopy.toJsonObject(),
                        checkSetList: self._checkSetList.toJsonObject(),
                        productKey: product.getKey()
                    }
                },
                function (response, textStatus, e) {
                    if (product.isNew) {
                        self._ensureProductCheckSets(product, promoAction.get("CODDIV"));
                    }
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    self._setConstrFunds(data["constraintFunds"]);
                    self._buildProductCheckSets(product, data["productCheckSets"], promoAction.get("IDACTION"));
                    self._ensureProductCheckSets(product, promoAction.get("CODDIV"));
                    product.set("FLGCHECKSETSALIGN", false);
                    product.set("FLGFUNDCONSTRALIGN", false);
                    onSuccess();
                }
            );
        }
        else {
            onSuccess();
        }
    };

    this._getConstraintFunds = function (promoAction, constraints, onFail, onSuccess) {
        if (XApp.isOnline() && constraints.getCount() > 0) {
            var self = this;
            var paCopy = promoAction.clone();
            this._clearAllEmptyProductCheckSets(paCopy);
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'GetPromoActionFundsDetailsForConstraints',
                    data: {
                        promoAction: paCopy.toJsonObject(),
                        constraints: constraints.toJsonObject()
                    }
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    self._updateFundConstraintDescriptions(data["constraintFunds"]);
                    onSuccess(true);
                }
            );
        }
        else {
            onSuccess(false);
        }
    };

    //selects a product checkset by tapping the list item
    this._tapSelectProductCheckSet = function (pcs, context) {
        var pcsStore = pcs.getParentStore();
        var idConfig = pcs.get("IDCONFIG");
        var sameConfigProductCheckSets = pcsStore.queryBy(function (productCheckSet) {
            return productCheckSet.get("IDCONFIG") == idConfig;
        });

        //unselect checksets from same config
        for (var i = 0, n = sameConfigProductCheckSets.length; i < n; i++) {
            sameConfigProductCheckSets[i].set("SELECTED", false);
        }

        pcs.set("SELECTED", true);
        context.detailGui.setModified(pcs);

        //compute constraint fund details
        var prodKey = context.detailGui.entity.getKey();
        var availableConstraints = this._availableCheckSetConstraints[prodKey];
        var sameConfigConstraints = [];
        for (i = 0, n = availableConstraints.length; i < n; i++) {
            var constr = availableConstraints[i];
            if (constr.getParentEntity().get("IDCONFIG") == idConfig) {
                sameConfigConstraints.push(constr);
            }
        }

        var list = context.detailGui.sections["LIST_CHECKSETS"].innerPanel.list;
        var scroller = list.getScrollable().getScroller();
        var offset = scroller.position.y;

        var senchaStore = list.getStore();
        if (sameConfigConstraints.length > 0) {
            var promoAction = context.gui.getDocument();
            var constrStore = new XStore({ entityName: "CheckSetConstraint" });
            constrStore.addAll(sameConfigConstraints);
            XUI.showWait();
            this._getConstraintFunds(promoAction, constrStore,
                function () {
                    XUI.hideWait();
                },
                function () {
                    pcsStore.rebindSenchaStore(senchaStore);
                    //maintain scroller's position
                    scroller.scrollTo(0, offset);
                    list.refresh();
                    XUI.hideWait();
                }
            );
        }
        else {
            pcsStore.rebindSenchaStore(senchaStore);
            //maintain scroller's position
            scroller.scrollTo(0, offset);
            list.refresh();
        }
    };

    //gets a list of product keys for which check sets should be aligned
    this._getProdKeysToAlignCheckSets = function (promoAction) {
        var keys = [];

        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            if (product.get("FLGCHECKSETSALIGN"))
                keys.push(product.getKey());
        });

        return keys;
    };

    //gets a list of product keys for which fund constraint descriptions should be aligned
    this._getProdKeysToAlignFundConstraints = function (promoAction) {
        var keys = [];

        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            if (product.get("FLGFUNDCONSTRALIGN"))
                keys.push(product.getKey());
        });

        return keys;
    };

    //create product checksets from json response and handle selection
    this._buildProductCheckSets = function (product, jsonCheckSets, idAction) {
        var self = this;
        if (!idAction)
            idAction = product.getParentEntity().get("IDACTION");

        var productCheckSets = product.getSubEntityStore("ProductCheckSet");
        var selectedPcs = {};
        var emtpyCheckSetId = PromoParameters.getInstance().getEmptyCheckSetId();
        productCheckSets.each(function (prodCheckSet) {
            if (prodCheckSet.get("IDCHECKSET") != emtpyCheckSetId &&
                prodCheckSet.get("SELECTED") && prodCheckSet.get("DESCONFIG")) {
                selectedPcs[prodCheckSet.get("DESCONFIG")] = {
                    idCheckSet: prodCheckSet.get("IDCHECKSET"),
                    idConstraint: prodCheckSet.get("IDCONSTRAINT")
                };
            }
        });
        productCheckSets.clear();

        var groupedPcs = {};
        var pcs;
        var allConstraints = [];
        for (var i = 0, n = jsonCheckSets.length; i < n; i++) {
            var checkSet = new XEntity({ entityName: "CheckSet", data: jsonCheckSets[i] });
            var idCheckSet = checkSet.get("IDCHECKSET");
            var desCheckSet = checkSet.get("DESCHECKSET");
            var csConfig = PromoConfig.getCheckSetConfig(checkSet.get("CODDIV"), checkSet.get("IDCONFIG"));
            var desConfig = csConfig ? [csConfig.IDCONFIG, csConfig.DESCONFIG].join(" - ") : "";
            var idConfig = csConfig ? csConfig.IDCONFIG : -1;

            if (!groupedPcs[desConfig])
                groupedPcs[desConfig] = [];


            var constraints = checkSet.getSubEntityStore("CheckSetConstraint");
            allConstraints = allConstraints.concat(constraints.toArray());

            constraints.each(function (constraint) {
                pcs = new XEntity({ entityName: "ProductCheckSet" });
                pcs.set("IDACTION", idAction);
                pcs.set("CODPRODUCT", product.get("CODPRODUCT"));
                pcs.set("LEVPRODUCT", product.get("LEVPRODUCT"));
                pcs.set("IDCHECKSET", idCheckSet);
                pcs.set("DESCHECKSET", desCheckSet);
                pcs.set("IDCONSTRAINT", constraint.get("IDCONSTRAINT"));
                pcs.set("SELECTED", false);
                pcs.set("DESCONFIG", desConfig);
                pcs.set("IDCONFIG", idConfig);
                pcs.set("KPI", self._getConstraintDescription(checkSet, constraint));
                productCheckSets.add(pcs);
                groupedPcs[desConfig].push(pcs);
            });
        }

        this._availableCheckSetConstraints[product.getKey()] = allConstraints;

        for (var cfg in groupedPcs) {
            var prevSelection = selectedPcs[cfg];
            var selectDefault = true;
            var pcsGroup = groupedPcs[cfg];
            if (prevSelection) {
                for (i = 0, n = pcsGroup.length; i < n; i++) {
                    pcs = pcsGroup[i];
                    if (pcs.get("IDCHECKSET") == prevSelection.idCheckSet &&
                        pcs.get("IDCONSTRAINT") == prevSelection.idConstraint) {
                        pcs.set("SELECTED", true);
                        selectDefault = false;
                    }
                }
            }

            if (selectDefault) {
                pcsGroup[0].set("SELECTED", true);
            }
        }
    };

    //adds product checksets for missing configuration (for UI purpose only)
    this._ensureProductCheckSets = function (product, codDiv) {
        codDiv = codDiv || product.getParentEntity().get("CODDIV");
        var csConfigs = PromoConfig.getChecksetConfigs(codDiv);
        var allConfigs = [];
        for (var i = 0, n = csConfigs.length; i < n; i++) {
            allConfigs.push(csConfigs[i].IDCONFIG);
        }
        var usedConfigs = [];
        var productCheckSets = product.getSubEntityStore("ProductCheckSet");
        productCheckSets.each(function (prodCheckSet) {
            if (!Ext.Array.contains(usedConfigs, prodCheckSet.get("IDCONFIG")))
                usedConfigs.push(prodCheckSet.get("IDCONFIG"));
        });

        var unusedConfigs = Ext.Array.difference(allConfigs, usedConfigs);
        for (i = 0, n = unusedConfigs.length; i < n; i++) {
            var csConfig = PromoConfig.getCheckSetConfig(codDiv, unusedConfigs[i]);
            if (!csConfigs)
                continue;
            var pcs = new XEntity({ entityName: "ProductCheckSet" });
            pcs.set("IDCONSTRAINT", i);
            pcs.set("IDCHECKSET", PromoParameters.getInstance().getEmptyCheckSetId());
            pcs.set("DESCHECKSET", UserContext.translate("NO_AVAILABLE_CHECKSETS"));
            pcs.set("IDCONFIG", csConfig.IDCONFIG);
            pcs.set("DESCONFIG", [csConfig.IDCONFIG, csConfig.DESCONFIG].join(" - "));
            productCheckSets.add(pcs);
        }
    };

    //adds product checksets to all products for missing configuration (for UI purpose only)
    this._ensureAllProductCheckSets = function (promoAction) {
        var codDiv = promoAction.get("CODDIV");
        var self = this;
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            self._ensureProductCheckSets(product, codDiv);
        });
    };

    //removes fake productchecksets for all products
    this._clearAllEmptyProductCheckSets = function (promoAction) {
        var emtpyCheckSetId = PromoParameters.getInstance().getEmptyCheckSetId();
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            product.getSubEntityStore("ProductCheckSet").removeBy(function (pcs) {
                return (!(pcs.get("IDCHECKSET") == emtpyCheckSetId || pcs.get("SELECTED") == false));
            });

        });
    };

    //stores contraint fund details (in order to determine description)
    this._setConstrFunds = function (constrFunds) {
        var fundConstraints = {};
        for (var key in constrFunds) {
            var tokens = key.split("|");
            var idCheckSet = parseInt(tokens[0]);
            var idConstraint = parseInt(tokens[1]);
            var fcs = fundConstraints[tokens[0]];
            var checkSet;
            if (!fcs) {
                checkSet = this._checkSetList.findBy(function (cs) {
                    return cs.get("IDCHECKSET") == idCheckSet;
                });
                if (!checkSet)
                    continue;
                var checkSetConfig = PromoConfig.getCheckSetConfig(checkSet.get("CODDIV"), checkSet.get("IDCONFIG"));
                if (!checkSetConfig || checkSetConfig.CONFIGTYPE == SalesPromotionNameSpace.CheckSetConfigType.GuideLines)
                    continue;

                fcs = {
                    checkSet: checkSet,
                    constraints: []
                };

                fundConstraints[tokens[0]] = fcs;
            }
            else {
                checkSet = fcs.checkSet;
            }

            var constraint = checkSet.getSubEntityStore("CheckSetConstraint").findBy(function (csc) {
                return csc.get("IDCONSTRAINT") == idConstraint;
            });

            if (!constraint)
                continue;

            fcs.constraints.push(constraint);

            var constrFundResults = constrFunds[key];
            this._constraintFunds[key] = {
                fundRemainder: constrFundResults[0],
                oldMovementTotal: constrFundResults[1],
                newMovementDelta: constrFundResults[2]
            };
        }

        return fundConstraints;
    };

    this._updateFundConstraintDescriptions = function (promoActio, jsonConstraintFunds) {
        var fundConstraints = this._setConstrFunds(jsonConstraintFunds);
        for (var key in fundConstraints) {
            var checkSet = fundConstraints[key].checkSet;
            var constrs = fundConstraints[key].constraints;
            for (var i = 0, n = constrs.length; i < n; i++) {
                var constraint = constrs[i];
                promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
                    product.getSubEntityStore("ProductCheckSet").each(function (pcs) {
                        if (pcs.get("IDCHECKSET") == checkSet.get("IDCHECKSET") &&
                            pcs.get("IDCONSTRAINT") == constraint.get("IDCONSTRAINT")) {
                            var description = self._getFundConstraintDescription(checkSet, constraint);
                            pcs.set("DESCHECKSET", description);
                            product.set("FLGFUNDCONSTRALIGN", false);
                        }
                    });
                });
            }
        }
    };

    this._getFundConstraintDescription = function (checkSet, constraint) {
        var csConfig = PromoConfig.getCheckSetConfig(checkSet.get("CODDIV"), checkSet.get("IDCONFIG"));
        if (csConfig.CONFIGTYPE == SalesPromotionNameSpace.CheckSetConfigType.MoneyFunds ||
            csConfig.CONFIGTYPE == SalesPromotionNameSpace.CheckSetConfigType.QtyFunds ||
            csConfig.CONFIGTYPE == SalesPromotionNameSpace.CheckSetConfigType.Allotments) {
            var key = constraint.get("IDCHECKSET").toString() + "|" + constraint.get("IDCONSTRAINT").toString();
            var fundValues = this._constraintFunds[key];
            if (!fundValues)
                return "";

            return UserContext.translate("FUNDREMAINDER") + ": " + UserContext.formatNumber(fundValues.fundRemainder, "0.00") + " " +
                    UserContext.translate(constraint.get("FUNDUM")) + "(" + UserContext.formatNumber(fundValues.oldMovementTotal, "0.00") + " + " +
                    UserContext.formatNumber(fundValues.newMovementDelta, "0.00") + ")" + UserContext.translate(constraint.get("FUNDUM")) +
                    UserContext.translate("MOVEMENT") + ";";
        }
        return "";
    };

    this._getKpiConstraintDescription = function (csKpis, checkSet, constraint) {
        var kpiDes = [];
        for (var i = 0, n = csKpis.length; i < n; i++) {
            var codMeasure = csKpis[i].CODMEASURE;
            var fields = PromoConfig.getFieldsForMeasure(codMeasure, true);
            var isEmptyMeasure = true;
            var isFirst = true;

            var desVal = [];
            for (var j = 0, m = fields.length; j < m; j++) {
                var val = constraint.get(fields[j].FIELDNAME);
                var fieldEmpty = (val == -1);
                isEmptyMeasure = isEmptyMeasure && fieldEmpty;
                if (fieldEmpty) {
                    if (isFirst)
                        desVal.push("0");
                    else
                        desVal.push("\u221e"); //infinity
                }
                else {
                    desVal.push(UserContext.formatNumber(val, PromoConfig.processFormatStr(fields[j].FORMATSTR)));
                }

                if (isFirst) {
                    if (m > 1)
                        desVal.push(" - ");
                    isFirst = false;
                }
            }

            var measDes = isEmptyMeasure ? "NO_" + codMeasure : codMeasure;
            measDes = UserContext.translate(measDes);
            if (!isEmptyMeasure) {
                measDes = measDes + ": " + desVal.join("");
                if (codMeasure == "INCIDENCE")
                    measDes = measDes + "%";
            }

            kpiDes.push(measDes + ";");
        }

        return kpiDes.join("<br />");
    };

    //builds a description for checkset constraint
    this._getConstraintDescription = function (checkSet, constraint) {
        var csKpis = PromoConfig.getChecksetConfigKpis(checkSet.get("IDCONFIG"), true);
        if (csKpis.length <= 0)
            return this._getFundConstraintDescription(checkSet, constraint);
        else
            return this._getKpiConstraintDescription(csKpis, checkSet, constraint);
    };

    this._processKpiDes = function (promoAction, toReplace, replacement) {
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            product.getSubEntityStore("ProductCheckSet").each(function (pcs) {
                var kpi = pcs.get("KPI");
                if (!XApp.isEmptyString(kpi)) {
                    while (kpi.indexOf(toReplace) > -1) {
                        kpi = kpi.replace(toReplace, replacement);
                    }
                    pcs.set("KPI", kpi);
                }
            });
        });
    };

    this._storeKpiDes = function (promoAction) {
        if (!XHistory._promoActionkpiDes) {
            XHistory._promoActionkpiDes = {};
        }

        var self = this;
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            product.getSubEntityStore("ProductCheckSet").each(function (pcs) {
                if (!XApp.isEmptyOrWhitespaceString(pcs.get("KPI"))) {
                    XHistory._promoActionkpiDes[pcs.get("IDCHECKSET") + "|" + pcs.get("IDCONSTRAINT")] = pcs.get("KPI");
                }
            });
        });
    };

    this._restoreKpiDes = function (promoAction) {
        var self = this;
        promoAction.getSubEntityStore("PromoActionProduct").each(function (product) {
            product.getSubEntityStore("ProductCheckSet").each(function (pcs) {
                var kpi = XHistory._promoActionkpiDes[pcs.get("IDCHECKSET") + "|" + pcs.get("IDCONSTRAINT")];
                if (!kpi)
                    return;

                pcs.set("KPI", kpi);
            });
        });
        delete XHistory._promoActionkpiDes;
    };

    //#endregion

    //#region Product Simulation

    //handles onEditEnding for ProductSimulation entity
    this._handleProductSimulationFieldEdit = function (ctrl, fieldName, newValue) {
        if (!ctrl.fieldContext.isValid)
            return;

        switch (fieldName) {
            case "FLGSELECTED":
                if (newValue) {
                    var self = this;
                    var prodSim = ctrl.fieldContext.sectionContext.entity;
                    var product = prodSim.getParentEntity();
                    //unselect other simulations
                    product.getSubEntityStore("ProductSimulation").each(function (ps) {
                        if (ps != prodSim && !self._isPendingSimulation(ps)) {
                            if (ps.get("FLGSELECTED")) {
                                self._prevSelSim = ps;
                            }
                            ps.set("FLGSELECTED", false);
                        }
                    });

                    //update product
                    var sectionContext = ctrl.fieldContext.sectionContext;
                    var promoAction = sectionContext.gui.getDocument();
                    this._updateProductAccordingToSimulation(promoAction, product, prodSim, true);
                }
                break;
        }
    };

    this._validateProductSimulation = function (detailContext) {
        var result = this._isSimulationSelectionValid(detailContext.entity.getParentEntity());

        if (!result) {
            detailContext.setFieldsStatus();
        }

        return result;
    };

    this._isSimulationSelectionValid = function (product) {
        var self = this;
        var realSimulations = 0;
        var selectedSimulations = 0;

        product.getSubEntityStore("ProductSimulation").each(function (ps) {
            if (!self._isPendingSimulation(ps)) {
                realSimulations++;
                if (ps.get("FLGSELECTED")) {
                    selectedSimulations++;
                }
            }
        });

        return realSimulations == 0 || selectedSimulations == 1;
    };

    //creates a new simulation initialized with product's values
    this._initProductSimulation = function (product) {
        var ps = new XEntity({ entityName: "ProductSimulation" });
        ps.set("SIMULATIONJOB", "-1");
        ps.set("IDACTION", product.get("IDACTION"));
        ps.set("CODPRODUCT", product.get("CODPRODUCT"));
        ps.set("LEVPRODUCT", product.get("LEVPRODUCT"));
        ps.set("CODDISPLAY", product.get("CODDISPLAY"));
        ps.set("QTYESTIMATED", product.get("QTYESTIMATED"));

        var activities = [];
        product.getSubEntityStore("ProductActivity").each(function (pa) {
            activities.push(pa.get("CODACTIVITY"));
        });
        ps.set("CODACTIVITIES", activities.join(" ; "));

        var measureFields = PromoConfig.getAllMeasureFields();
        for (var i = 0, n = measureFields.length; i < n; i++) {
            var fieldName = measureFields[i];
            if (product.getFieldDef(fieldName) && ps.getFieldDef(fieldName)) {
                var val = product.get(fieldName);
                if (Array.isArray(val)) {
                    //handle multiselection fields
                    ps.set(fieldName, val.join(";"));
                }
                else {
                    ps.set(fieldName, val);
                }
            }
        }

        return ps;
    };

    //copies data from result row to simulation
    this._copyCommonFields = function (simulation, row) {
        var columnNames = [];
        for (i = 0; i < row.Table.Columns.length; i++) {
            columnNames.push(row.Table.Columns[i].Name);
        }

        var predefinedFields = ["IDACTION", "CODPRODUCT", "LEVPRODUCT", "CODDISPLAY"];
        for (var index in columnNames) {
            property = columnNames[index];
            if (predefinedFields.indexOf(property) > -1)
                continue;

            if (simulation._data.hasOwnProperty(property)) {
                simulation.set(property, row.getValueFromName(property));
            }
        }
    };

    //copies measures from simulation to product
    this._updateProductAccordingToSimulation = function (promoAction, product, simulation, handleWait) {
        if (handleWait)
            XUI.showWait();

        var activitiesChanged = false;
        var self = this;
        var productDetailContext;

        if (!simulation) {
            product.set("QTYSIMULATED", 0);
            product.set("QTYBASELINE", 0);
            product.set("QTYUPLIFT", 0);
        }
        else {
            var activCodes = simulation.get("CODACTIVITIES").split(" ; ");
            var removedActivities = Ext.Array.difference(product.get("MULTIACTIVITIES"), activCodes);
            var addedActivities = Ext.Array.difference(activCodes, product.get("MULTIACTIVITIES"));

            activitiesChanged = removedActivities.length > 0 || addedActivities.length > 0;

            if (activitiesChanged) {
                product.set("MULTIACTIVITIES", activCodes);
                this._refreshPromoActionActivities(promoAction);
            }

            var measureFields = PromoConfig.getAllMeasureFields();
            for (var i = 0, n = measureFields.length; i < n; i++) {
                var fieldName = measureFields[i];
                if (product.getFieldDef(fieldName) && simulation.getFieldDef(fieldName)) {
                    product.set(fieldName, simulation.get(fieldName));
                }
            }

            product.set("QTYSIMULATED", simulation.get("QTYSIMULATED"));
            product.set("QTYBASELINE", simulation.get("QTYBASELINE"));
            product.set("QTYUPLIFT", simulation.get("QTYUPLIFT"));

            if (removedActivities.length > 0) {
                this._resetRemovedProductActivityMeasures(product, removedActivities, promoAction.get("CODDIV"));
            }
        }

        this._evaluateProductFormulas(promoAction, product);

        productDetailContext = this._matchActiveDetailPopup(product, true);
        if (productDetailContext) {
            if (activitiesChanged) {
                //refresh product layout and maintain carousel's active item
                var activeItem = productDetailContext.carousel ? productDetailContext.carousel.getActiveIndex() : null;
                this._refreshProductFieldsLayout(productDetailContext);
                if (activeItem && productDetailContext.carousel)
                    productDetailContext.carousel.setActiveItem(activeItem);
            }
            else {
                //just refresh the fields
                productDetailContext.refreshControls();
                productDetailContext.setFieldsStatus();
            }
        }

        this._getCheckSetsForProduct(promoAction, product,
            function () { if (handleWait) XUI.hideWait(); },
            function () {
                productDetailContext = self._matchActiveDetailPopup(product);
                //refresh list
                if (productDetailContext) {
                    var senchaStore = productDetailContext.sections["LIST_CHECKSETS"].innerPanel.list.getStore();
                    product.getSubEntityStore("ProductCheckSet").rebindSenchaStore(senchaStore);
                }

                if (handleWait)
                    XUI.hideWait();
            }
        );
    };

    //creates fields for layout configuration of PromoActionProduct according to promo configuration
    this._getFieldsForSimulation = function () {
        var measureFields = PromoConfig.getSimulationFields();

        var fields = [];
        for (var i = 0, l = measureFields.length; i < l; i++) {
            var measureField = measureFields[i];

            var field = {
                attrs: {
                    editable: "false",
                    name: measureField.FIELDNAME
                },
                children: [],
                elementName: "field"
            };

            if (!XApp.isEmptyOrWhitespaceString(measureField.FORMATSTR))
                field.attrs.formatString = PromoConfig.processFormatStr(measureField.FORMATSTR);

            fields.push(field);
        }

        return fields;
    };

    //check if simulations must be cleared in case of relevant details change
    this._mustClearSimulations = function (gui) {
        if (!gui.isEditable() || !PromoParameters.getInstance().getEnableEffectiveness())
            return false;

        var self = this;

        var simulationExists = gui.getDocument().getSubEntityStore("PromoActionProduct").findBy(function (product) {
            var simulation = product.getSubEntityStore("ProductSimulation").findBy(function (ps) {
                return !self._isPendingSimulation(ps);
            });

            return simulation != null;
        });

        return simulationExists != null;
    };

    //remove simulations when relevant details change
    this._clearSimulationList = function (promoAction) {
        promoAction.getSubEntityStore("PromoActionProduct").each(function (prod) {
            prod.getSubEntityStore("ProductSimulation").clear();
            prod.set("QTYSIMULATED", 0);
            prod.set("QTYBASELINE", 0);
            prod.set("QTYUPLIFT", 0);
            prod.set("TPE_SOURCE", "");
        });
    };

    this._isPendingSimulation = function (productSimulation) {
        return !XApp.isEmptyString(productSimulation.get("SIMULATIONJOB"));
    };

    this._createPendingSimulations = function (promoAction, product) {
        var ps, pendingSimulations = [];
        var self = this;

        //simulation for a specific product
        if (product) {
            if (product.getSubEntityStore("ProductActivity").getCount() > 0) {
                ps = this._checkSimulations(product);
                if (!ps) {
                    XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.PROMO.EXISTINGSIMULATIONFORPRODUCT]") + " " + product.get("DESPRODUCT") });
                }
                else {
                    this._productsToSimulate.add(product);
                    pendingSimulations.push(ps);
                }
            }
        }
            //all products with unexpired simulations
        else {
            var existingSimulations = [];
            promoAction.getSubEntityStore("PromoActionProduct").each(function (prod) {
                if (prod.getSubEntityStore("ProductActivity").getCount() <= 0)
                    return;

                ps = self._checkSimulations(prod);
                if (!ps) {
                    existingSimulations.push(prod.get("DESPRODUCT"));
                }
                else {
                    self._productsToSimulate.add(prod);
                    pendingSimulations.push(ps);
                }
            });

            if (existingSimulations.length > 0) {
                XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.PROMO.EXISTINGSIMULATIONFORPRODUCT]") + " " + existingSimulations.join(", ") });
            }
        }

        return pendingSimulations;
    };

    this._startSimulation = function (gui, product) {
        var self = this;
        var exeq = gui.exe;
        var promoAction = gui.getDocument();

        this._productsToSimulate = new XStore({ entityName: "PromoActionProduct" });
        var pendingSimulations = this._createPendingSimulations(promoAction, product);
        this._clearAllEmptyProductCheckSets(promoAction);

        var selectedDeliveryPoints = new XStore({ entityName: "DeliveryPoint" });
        promoAction.getSubEntityStore("DeliveryPoint").each(function (delivPoint) {
            if (delivPoint.get("FLGINCLUSION") != false)
                selectedDeliveryPoints.add(delivPoint);
        });

        if (this._productsToSimulate.getCount() == 0)
            return;

        XUI.showWait();

        gui.validateDocument(function (response) {
            switch (response) {
                case "EDIT":
                    gui.callCust('onSaveCanceled', [gui]);
                    XUI.hideWait();
                    break;
                case "OK":
                    //attempt to align delivery points
                    exeq.pushHandler(self, function () {
                        self._alignDeliveryPoints(gui, false,
                            function () {
                                self._failureCallback("MOB.PROMO.ERR_LOAD_DELIVERYPOINTS", exeq);
                            },
                            function () {
                                exeq.executeNext();
                            }
                        );
                    });

                    //launch job
                    exeq.pushHandler(self, function () {
                        promoAction = gui.getDocument();
                        self._launchDWHSimulation(gui, self._productsToSimulate, selectedDeliveryPoints,
                            function () {
                                XUI.hideWait();
                                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[MOB.PROMO.ERR_LAUNCH_DWH_JOB]") });
                            },
                            function (gui, results) {
                                var senchaStore;
                                //disable UI
                                self._refreshGuiState(gui, true);
                                XHistory.actualConfig().isSimulationRunning = true;

                                var now = new Date().toUTCDateTime();
                                var refresh = false;

                                self._processSimulationResults(gui, results, pendingSimulations);

                                //refresh lists
                                if (refresh) {
                                    if (self._activeDetailPopup && self._activeDetailPopup.entityName == "PromoActionProduct") {
                                        //refresh the popup only if it displays a product currently affected by the simulation
                                        var activeProduct = self._productsToSimulate.findBy(function (p) {
                                            return p == self._activeDetailPopup.entity;
                                        });
                                        if (activeProduct) {
                                            senchaStore = self._activeDetailPopup.sections["LIST_PENDING_SIMULATION"].innerPanel.list.getStore();
                                            activeProduct.getSubEntityStore("ProductSimulation").rebindSenchaStore(senchaStore);
                                        }
                                    }
                                    if (gui.tabCtrls["PRODUCTS"]) {
                                        senchaStore = gui.tabCtrls["PRODUCTS"].sections["SECTION_PRODUCTS"].store;
                                        promoAction.getSubEntityStore("PromoActionProduct").rebindSenchaStore(senchaStore);
                                    }
                                }

                                //save the document if needed
                                if (gui.docModified) {
                                    gui.saveDocNoConfirmation(function () {
                                        self._ensureAllProductCheckSets(promoAction);
                                        gui.clearModified();

                                        if (product != null) {
                                            var index = promoAction.PromoActionProductDetailsStore.findIndex(product);
                                            self._initReload({ reloadSection: "LIST_SIMULATION", promoActionProductIndex: index });
                                        }
                                        else {
                                            self._initReload({ reloadSection: "SECTION_PRODUCTS" });
                                        }
                                        gui.reload();
                                    });
                                }

                                XUI.hideWait();
                            }
                        );
                    });

                    exeq.executeNext();
                    break;
            }
        }, "EDIT");
    };


    this._launchDWHSimulation = function (gui, products, deliveryPoints, onFail, onSuccess) {
        if (XApp.isOnline()) {
            var self = this;

            var promoAction = gui.getDocument();
            var paClone = promoAction.clone();
            this._clearAllEmptyProductCheckSets(paClone);
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'LaunchDWHSimulation',
                    data: {
                        promoAction: promoAction.toJsonObject(),
                        products: products.toJsonObject(),
                        deliveryPoints: deliveryPoints.toJsonObject()
                    }
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    var idsRetrieved = false;

                    if (data["simulationResults"]) {
                        var results = new XDataTable();
                        results.fromJsonData(data["simulationResults"]);
                        onSuccess(gui, results);
                    }
                }
            );
        }
        else {
            onSuccess(false);
        }
    };

    this._getSimulationMeasures = function (promoAction, products, IDT, onFail, onSuccess) {
        if (XApp.isOnline()) {
            XHttpHelper.ExecuteServerOp(
                {
                    assemblyName: 'Xtel.SM1.Touch',
                    className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                    methodName: 'GetSimulationMeasures',
                    data: {
                        promoAction: promoAction.toJsonObject(),
                        products: products.toJsonObject(),
                        IDT: IDT
                    }
                },
                function (response, textStatus, e) {
                    XLog.logEx(e);
                    onFail();
                },
                function (data) {
                    if (data["results"]) {
                        var results = new XDataTable();
                        results.fromJsonData(data["results"]);
                        onSuccess(results);
                    } else {
                        onSuccess();
                    }
                }
            );
        }
        else {
            onSuccess();
        }
    };

    //updates the apropriate products with simulation results
    //refreshes the UI, optionally
    this._processSimulationResults = function (gui, results, pendingSimulations) {
        if (!results || results.Rows.length == 0) {
            XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.PROMO.DWH_NO_RESULTS]") });
            this._removePendingSimulations(gui);
            this._refreshGuiState(gui, false);
            XHistory.actualConfig().isSimulationRunning = false;
            return;
        }

        XLog.logInfo("Start processing simulations results...");
        XUI.showWait();

        var self = this;
        var now = new Date().toUTCDateTime();
        var promoAction = gui.getDocument();
        var products = promoAction.getSubEntityStore("PromoActionProduct");
        var senchaStore, simulations;

        for (var i = 0, n = results.Rows.length; i < n; i++) {
            var row = results.Rows[i];

            var product = self._productsToSimulate.findBy(function (prod) {
                return prod.get("CODPRODUCT") == row.getValueFromName("CODPRODUCT") &&
                       prod.get("LEVPRODUCT") == row.getValueFromName("LEVPRODUCT") &&
                       prod.get("CODDISPLAY") == row.getValueFromName("CODDISPLAY");
            });

            //find the pending simulation corresponding to product
            var ps = this._getPendingSimulation(pendingSimulations, row);

            var selectedSimulation = null;

            simulations = product.getSubEntityStore("ProductSimulation");
            var existingSimulation = simulations.findBy(function (sim) {
                return !self._isPendingSimulation(sim) &&
                        sim.get("SimulationHashKey") == ps.get("SimulationHashKey");
            });

            if (existingSimulation) {
                var expireDate = new Date(existingSimulation.get("DTECALL"));
                expireDate.setDate(expireDate.getDate() + PromoParameters.getInstance().getSimulationExpireDays());

                if (expireDate < now) {
                    selectedSimulation = existingSimulation;
                }
            }
            else {
                var idSimulation = self._getNextSimulationId(product);
                ps.set("IDSIMULATION", idSimulation);
                ps.set("DESSIMULATION", idSimulation + "." + product.get("DESPRODUCT") + " - " + ps.get("DESACTIVITIESWITHMEASURES"));
                ps.set("DTECALL", now);
                ps.set("SIMULATIONJOB", "");
                product.getSubEntityStore("ProductSimulation").add(ps);
                gui.setModified(promoAction);
                refresh = true;

                selectedSimulation = ps;
            }

            //update current simulation
            if (selectedSimulation) {
                this._copyCommonFields(selectedSimulation, row);
                product.set("TPE_SOURCE", row.getValueFromName("TPE_SOURCE"));

                //update product according to selected simulation and unselect the others
                selectedSimulation.set("FLGSELECTED", true);
                this._updateProductAccordingToSimulation(promoAction, product, selectedSimulation, false);
                simulations.each(function (ps) {
                    if (ps != selectedSimulation) {
                        ps.set("FLGSELECTED", false);
                    }
                });

                gui.setModified(promoAction);
            }

            var productDetailContext = this._matchActiveDetailPopup(product);
            //refresh lists
            if (productDetailContext) {
                senchaStore = productDetailContext.sections["LIST_SIMULATION"].sectionContext.listStore;
                simulations = product.getSubEntityStore("ProductSimulation");
                simulations.rebindSenchaStore(senchaStore);

                senchaStore = productDetailContext.sections["LIST_PENDING_SIMULATION"].innerPanel.list.getStore();
                simulations.rebindSenchaStore(senchaStore);
            }
        }

        //ui refresh
        if (gui.tabCtrls["PRODUCTS"]) {
            senchaStore = gui.tabCtrls["PRODUCTS"].sections["SECTION_PRODUCTS"].store;
            products.rebindSenchaStore(senchaStore);
        }
        self._refreshGuiState(gui, false);
        XHistory.actualConfig().isSimulationRunning = false;

        XUI.showInfoOk({ msg: UserContext.tryTranslate("[MOB.PROMO.DWH_SIMULATIONS_PROCESSED]") });
        XLog.logInfo("Simulations processed.");
        XUI.hideWait();
    };

    this._getPendingSimulation = function (simulations, row) {
        var self = this;
        for (index in simulations) {
            simulation = simulations[index];
            if (simulation.get("CODPRODUCT") == row.getValueFromName("CODPRODUCT") &&
                   simulation.get("LEVPRODUCT") == row.getValueFromName("LEVPRODUCT") &&
                   simulation.get("CODDISPLAY") == row.getValueFromName("CODDISPLAY") && self._isPendingSimulation(simulation))
                return simulation;
        }
        return null;
    }

    //simulation progressive 
    this._getNextSimulationId = function (product) {
        var idSimulation = 1, id;

        product.getSubEntityStore("ProductSimulation").each(function (ps) {
            id = ps.get("IDSIMULATION");
            if (id.substring) {
                id = parseInt(id);
            }
            if (id >= idSimulation) {
                idSimulation = id + 1;
            }
        });

        return idSimulation;
    };

    //checks the simulations of a product
    //if a new pending simulation can be created, it is returned
    this._checkSimulations = function (product) {
        var simulation = this._initProductSimulation(product);
        var now = new Date().toUTCDateTime();

        var existingSimulation = product.getSubEntityStore("ProductSimulation").findBy(function (ps) {
            var expireDate = new Date(ps.get("DTECALL"));
            expireDate.setDate(expireDate.getDate() + PromoParameters.getInstance().getSimulationExpireDays());

            return ps.get("SimulationHashKey") == simulation.get("SimulationHashKey") && expireDate >= now;
        });

        return existingSimulation ? null : simulation;
    };

    //removes all pending simulations
    this._removePendingSimulations = function (gui) {
        if (!this._productsToSimulate || this._productsToSimulate.getCount() <= 0)
            return;

        var self = this;
        this._productsToSimulate.each(function (product) {
            product.getSubEntityStore("ProductSimulation").removeBy(function (ps) {
                return !self._isPendingSimulation(ps);
            });
        });

        gui.setModified(gui.getDocument());
    };

    //checks if there is at least one pending simulation
    this._hasPendingSimulations = function (promoAction) {
        var product = promoAction.getSubEntityStore("PromoActionProduct").findBy(function (prod) {
            return !XApp.isEmptyString(prod.get("PENDINGSIMULATION"));
        });

        return product != null;
    };

    //#endregion

    //#endregion

    //#region SELLOUT_DETAIL tab

    //status of fields from SELLOUT_DETAIL tab
    this._setSelloutTabFieldStatus = function (context) {
        var fieldName = context.fieldName;
        var entity = context.sectionContext.entity;
        var entityName = entity.getEntityName();

        switch (entityName) {
            case "PromoDummyCluster":
                var dteStartSellout;
                var dteEndSellout;
                switch (fieldName) {
                    case "DTESTARTSELLOUT":
                        dteStartSellout = entity.get("DTESTARTSELLOUT");
                        if (XApp.isEmptyDate(dteStartSellout)) {
                            if (this._clusterPeriodError) {
                                context.valid = false;
                            }
                        }
                        else {
                            if (!this._isClusterDateInsideSelloutPeriod(entity.getParentEntity(), dteStartSellout)) {
                                context.valid = false;
                            }
                            else {
                                dteEndSellout = entity.get("DTEENDSELLOUT");
                                if (!XApp.isEmptyDate(dteEndSellout) && dteStartSellout > dteEndSellout) {
                                    context.valid = false;
                                }
                            }
                        }

                        context.editable = context.editable && entity.getSubEntityStore("PromoDummySign").getCount() > 0;
                        break;
                    case "DTEENDSELLOUT":
                        dteEndSellout = entity.get("DTEENDSELLOUT");
                        if (XApp.isEmptyDate(dteEndSellout)) {
                            if (this._clusterPeriodError) {
                                context.valid = false;
                            }
                        }
                        else {
                            if (!this._isClusterDateInsideSelloutPeriod(entity.getParentEntity(), dteEndSellout)) {
                                context.valid = false;
                            }
                            else {
                                dteStartSellout = entity.get("DTESTARTSELLOUT");
                                if (!XApp.isEmptyDate(dteStartSellout) && dteEndSellout < dteStartSellout) {
                                    context.valid = false;
                                }
                            }
                        }

                        context.editable = context.editable && entity.getSubEntityStore("PromoDummySign").getCount() > 0;
                        break;
                    case "WEIGHTEDVALUE":
                        context.editable = context.editable && entity.getSubEntityStore("PromoDummySign").getCount() > 0;
                        break;
                }
                break;
        }
    };

    //handles onEditEnding for PromoDummyCluster entity
    this._handlePromoDummyClusterFieldEdit = function (ctrl, fieldName, newValue) {
        if (!ctrl.fieldContext.isValid)
            return;

        var sectionContext = ctrl.fieldContext.sectionContext;
        var entity = sectionContext.entity;

        switch (fieldName) {
            case "MULTISIGNS":
                var modified;

                if (!newValue.length || newValue.length <= 0) {
                    entity.set("DTESTARTSELLOUT", Constants.SM1MINDATE);
                    entity.set("DTEENDSELLOUT", Constants.SM1MINDATE);
                    entity.set("WEIGHTEDVALUE", 0);
                    modified = true;
                }
                else {
                    modified = this._setClusterSelloutPeriod(entity);
                }

                if (modified) {
                    var clusters = sectionContext.document.getSubEntityStore("PromoDummyCluster");
                    var senchaStore = sectionContext.gui.tabCtrls["SELLOUT_DETAIL"].sections["LIST_CLUSTERS"].innerPanel.list.getStore();
                    clusters.rebindSenchaStore(senchaStore);
                }
                break;
        }
    };

    this._validatePromoDummyCluster = function (detailContext) {
        var entity = detailContext.entity;
        if (entity.getSubEntityStore("PromoDummySign").getCount() <= 0)
            return true;

        var promoAction = entity.getParentEntity();
        var clusterStart = entity.get("DTESTARTSELLOUT");
        var promoStart = promoAction.get("DTESTARTSELLOUT");
        var clusterEnd = entity.get("DTEENDSELLOUT");
        var promoEnd = promoAction.get("DTEENDSELLOUT");
        var weightedValCfg = entity.getFieldDef("WEIGHTEDVALUE");
        var weightedVal = entity.get("WEIGHTEDVALUE");
        var result = true;

        var isStartDateEmpty = XApp.isEmptyDate(clusterStart);
        var isEndDateEmpty = XApp.isEmptyDate(clusterEnd);

        if (isStartDateEmpty || (!XApp.isEmptyDate(promoStart) && clusterStart < promoStart)) {
            result = false;
        }

        if (isEndDateEmpty || (!XApp.isEmptyDate(promoEnd) && clusterEnd > promoEnd)) {
            result = false;
        }

        if (!isStartDateEmpty && !isEndDateEmpty && clusterStart > clusterEnd) {
            result = false;
        }

        if (weightedVal < weightedValCfg.minVal || weightedVal > weightedValCfg.maxVal) {
            result = false;
        }

        if (!result) {
            this._clusterPeriodError = true;
            detailContext.setFieldsStatus();
            this._clusterPeriodError = false;
        }

        return result;
    };

    //updates cluster sellout period according to promo action sellout period
    this._setClusterSelloutPeriod = function (dummyCluster) {
        if (dummyCluster.getSubEntityStore("PromoDummySign").getCount() <= 0) {
            return false;
        }

        var promoAction = dummyCluster.getParentEntity();
        var promoStartDate = promoAction.get("DTESTARTSELLOUT");
        var promoEndDate = promoAction.get("DTEENDSELLOUT");
        var dummyStartDate = dummyCluster.get("DTESTARTSELLOUT");
        var dummyEndDate = dummyCluster.get("DTEENDSELLOUT");
        var modified = false;

        if (promoStartDate > dummyStartDate) {
            dummyCluster.set("DTESTARTSELLOUT", promoStartDate);

            if (promoStartDate > dummyEndDate) {
                dummyEndDate = promoEndDate;
                dummyCluster.set("DTEENDSELLOUT", promoEndDate);
            }

            modified = true;
        }

        if (XApp.isEmptyDate(dummyEndDate) || promoEndDate < dummyEndDate) {
            dummyCluster.set("DTEENDSELLOUT", promoEndDate);

            if (dummyStartDate > promoEndDate) {
                dummyCluster.set("DTESTARTSELLOUT", promoStartDate);
            }

            modified = true;
        }

        return modified;
    };

    this._isClusterDateInsideSelloutPeriod = function (promoAction, clusterDate) {
        var promoStartSellout = promoAction.get("DTESTARTSELLOUT");
        if (!XApp.isEmptyDate(promoStartSellout) && clusterDate < promoStartSellout)
            return false;

        var promoEndSellout = promoAction.get("DTEENDSELLOUT");
        if (!XApp.isEmptyDate(promoEndSellout) && clusterDate > promoEndSellout)
            return false;

        return true;
    };

    //group clusters according to CODCLUSTER
    this._scatterClusters = function (promoAction) {
        var dummyClusters = promoAction.getSubEntityStore("PromoDummyCluster");
        var realClusters = promoAction.getSubEntityStore("ClusterSellOut");
        var actionStartSellout = promoAction.get("DTESTARTSELLOUT");
        var actionEndSellout = promoAction.get("DTEENDSELLOUT");

        dummyClusters.each(function (dummyCluster) {
            var codCluster = dummyCluster.get("CODCLUSTER");
            var dteStartSellout = dummyCluster.get("DTESTARTSELLOUT");
            var dteEndSellout = dummyCluster.get("DTEENDSELLOUT");
            var signStore = dummyCluster.getSubEntityStore("PromoDummySign");
            signStore.clear();

            realClusters.each(function (realCluster) {
                if (realCluster.get("CODCLUSTER") == codCluster) {
                    if (XApp.isEmptyDate(dteStartSellout)) {
                        dummyCluster.set("DTESTARTSELLOUT", realCluster.get("DTESTARTSELLOUT"));
                        dteStartSellout = realCluster.get("DTESTARTSELLOUT");
                        dummyCluster.set("DTEENDSELLOUT", realCluster.get("DTEENDSELLOUT"));
                        dteEndSellout = realCluster.get("DTEENDSELLOUT");
                        dummyCluster.set("WEIGHTEDVALUE", realCluster.get("WEIGHTEDVALUE"));
                    }

                    var sign = new XEntity({ entityName: "PromoDummySign" });
                    sign.set("CODSIGN", realCluster.get("CODSIGN"));
                    signStore.add(sign);
                }
            });

            //set default dates, if needed
            if (signStore.getCount() > 0) {
                if (XApp.isEmptyDate(dteStartSellout) && !XApp.isEmptyDate(actionStartSellout))
                    dummyCluster.set("DTESTARTSELLOUT", actionStartSellout);
                if (XApp.isEmptyDate(dteEndSellout) && !XApp.isEmptyDate(actionEndSellout))
                    dummyCluster.set("DTEENDSELLOUT", actionEndSellout);
            }
        });

        return dummyClusters;
    };

    //rebuild cluster sellout collection from grouped dummy clusters
    this._gatherClusters = function (promoAction) {
        var dummyClusters = promoAction.getSubEntityStore("PromoDummyCluster");
        var realClusters = promoAction.getSubEntityStore("ClusterSellOut");
        realClusters.clear();
        var idAction = promoAction.get("IDACTION");

        dummyClusters.each(function (dummyCluster) {
            var codCluster = dummyCluster.get("CODCLUSTER");
            var dteStartSellout = dummyCluster.get("DTESTARTSELLOUT");
            var dteEndSellout = dummyCluster.get("DTEENDSELLOUT");
            var weightedValue = dummyCluster.get("WEIGHTEDVALUE");
            var signStore = dummyCluster.getSubEntityStore("PromoDummySign");

            signStore.each(function (sign) {
                var realCluster = new XEntity({ entityName: "ClusterSellOut" });
                realCluster.set("IDACTION", idAction);
                realCluster.set("CODCLUSTER", codCluster);
                realCluster.set("CODSIGN", sign.get("CODSIGN"));
                realCluster.set("DTESTARTSELLOUT", dteStartSellout);
                realCluster.set("DTEENDSELLOUT", dteEndSellout);
                realCluster.set("WEIGHTEDVALUE", weightedValue);
                realClusters.add(realCluster);
            });
        });
    };

    this._getClusters = function () {
        if (!this._clusters) {
            this._clusters = [];
            var rows = UserContext.getDecodeEntriesOrdered(PromoParameters.getInstance().getClusterQtab());
            for (var i in rows) {
                var row = rows[i];
                this._clusters.push({ value: row.cod, text: row.des });
            }
        }

        return this._clusters;
    };

    this._getSigns = function () {
        if (!this._signs) {
            this._signs = [];
            var rows = UserContext.getDecodeEntriesOrdered(PromoParameters.getInstance().getSignQtab());
            for (var i in rows) {
                var row = rows[i];
                this._signs.push({ value: row.cod, text: row.des });
            }
        }

        return this._signs;
    };

    //#endregion

    //#region PARTICIPANTS & DELIVERY POINTS tabs

    //status of fields from DELIVERY POINTS tab
    this._setDeliveryPointsTabFieldStatus = function (context) {
        var fieldName = context.fieldName;
        var entity = context.sectionContext.entity;
        var entityName = entity.getEntityName();

        switch (entityName) {
            case "PromoAction":
                switch (fieldName) {
                    case "FLGDELIVERPOINTSBLOCKED":
                        context.editable = context.editable && entity.get("FLGPARTICIPANTSBLOCKED");
                        break;
                }
                break;
        }
    };

    this._onParticipantsTabActivated = function (gui) {
        this._setTabValid(gui, "PARTICIPANTS", true);
        if (!this._isWorkflowEditable(gui) || this._simulationRunning)
            return;

        var self = this;
        this._alignParticipants(gui,
            function () {
                self._failureCallback("MOB.PROMO.ERR_LOAD_PARTICIPANTS");
            },
            function (serverCall) {
                if (!serverCall)
                    return;

                self._propagateAlignmentModification(gui, "Participant");
                self._afterListAlignment(gui, "Participant", "PARTICIPANTS", "LIST_PARTICIPANTS");
                XUI.hideWait();
            });
    };

    this._onDeliveryPointsTabActivated = function (gui) {
        this._setTabValid(gui, "DELIVERY_POINTS", true);
        if (!this._isWorkflowEditable(gui) || this._simulationRunning)
            return;

        var self = this;
        var exeq = gui.exe;
        var promoAction = gui.getDocument();
        var skipDeliveryPointsAlignment = false;

        //attempt to align participants
        exeq.pushHandler(self, function () {
            self._alignParticipants(gui,
                function () {
                    self._failureCallback("MOB.PROMO.ERR_LOAD_PARTICIPANTS", exeq);
                },
                function (serverCall) {
                    skipDeliveryPointsAlignment = !serverCall && !promoAction.get("FLGDELIVERYPOINTSALIGN");
                    if (serverCall) {
                        self._propagateAlignmentModification(gui, "Participant");
                        self._afterListAlignment(gui, "Participant", "PARTICIPANTS", "LIST_PARTICIPANTS");
                    }
                    exeq.executeNext();
                });
        });

        //attempt to align delivery points
        exeq.pushHandler(self, function () {
            if (skipDeliveryPointsAlignment) {
                XUI.hideWait();
            }
            else {
                self._alignDeliveryPoints(gui, self._participantsChange,
                    function () {
                        self._failureCallback("MOB.PROMO.ERR_LOAD_DELIVERYPOINTS", exeq);
                    },
                    function (serverCall) {
                        if (serverCall) {
                            self._propagateAlignmentModification(gui, "DeliveryPoint");
                            self._afterListAlignment(gui, "DeliveryPoint", "DELIVERY_POINTS", "LIST_DELIVERYPOINTS");
                        }
                        XUI.hideWait();
                    }
                );
                self._participantsChange = false;
            }
        });

        exeq.executeNext();
    };

    //attempts to align the participants
    //the parameter of success method shows if a server call has been made
    this._alignParticipants = function (gui, onFail, onSuccess) {
        if (!XApp.isOnline()) {
            onSuccess(false);
            return;
        }

        var promoAction = gui.getDocument();

        if (!promoAction.get("FLGPARTICIPANTSALIGN") ||
            XApp.isEmptyDate(promoAction.get("DTESTARTSELLIN")) ||
            XApp.isEmptyDate(promoAction.get("DTEENDSELLIN")) ||
            promoAction.get("LEVPARTICIPANTS") < SalesPromotionEngine.getCustHierMinLevel()) {
            onSuccess(false);
            return;
        }

        XUI.showWait();
        var shouldResetParticipants = this._shouldResetParticipants(gui);
        this._loadParticipants(promoAction, this._isWorkflowEditable(gui), shouldResetParticipants, onFail, onSuccess);
    };

    this._loadParticipants = function (promoAction, isEditable, shouldResetParticipants, onFail, onSuccess) {
        var self = this;

        XHttpHelper.ExecuteServerOp(
            {
                assemblyName: 'Xtel.SM1.Touch',
                className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                methodName: 'LoadParticipants',
                data: {
                    "promoAction": promoAction.toJsonObject(),
                    "isEditable": isEditable,
                    "shouldResetParticipants": shouldResetParticipants
                }
            },
            function (response, textStatus, e) {
                XLog.logEx(e);
                onFail();
            },
            function (data) {
                var participants = promoAction.getSubEntityStore("Participant");
                var prevParticipants = new XStore({ entityName: "Participant" });
                prevParticipants.addAll(participants.toArray());
                participants.clear();

                //create new participants from json response
                var newParticipants = data["newParticipants"];
                for (var i = 0, l = newParticipants.length; i < l; i++) {
                    participants.add(new XEntity({ entityName: "Participant", data: newParticipants[i] }));
                }

                var areParticipantsEquivalent = self._areStoresEquivalent(prevParticipants, participants);
                participants.setModified(!areParticipantsEquivalent);
                self._synchronizeDeliveryPoints(promoAction, isEditable, !areParticipantsEquivalent);

                promoAction.set("FLGPARTICIPANTSALIGN", false);
                promoAction.set("FLGDELIVERYPOINTSALIGN", true);

                self._setPrevParticipantsValues(promoAction);

                onSuccess(true);
            }
        );
    };

    //stores values relevant to participants alignment from last refresh
    this._setPrevParticipantsValues = function (promoAction) {
        if (!promoAction) {
            this._prevParticipantsVals = {};
            return;
        }

        this._prevParticipantsVals.codContractor = promoAction.get("CODCONTRACTOR");
        this._prevParticipantsVals.levParticipants = promoAction.get("LEVPARTICIPANTS");
        this._prevParticipantsVals.dteStartSellin = promoAction.get("DTESTARTSELLIN");
        this._prevParticipantsVals.dteEndSellin = promoAction.get("DTEENDSELLIN");
    };

    //maintains a separate store of participants for comparison purposes
    this._storePreviousParticipants = function (promoAction) {
        if (!this._previousParticipants) {
            this._previousParticipants = new XStore({ entityName: "Participant" });
        }
        this._copyStore(promoAction.getSubEntityStore("Participant"), this._previousParticipants);
    };

    this._restorePreviousParticipants = function (gui, promoAction) {
        this._copyStore(this._previousParticipants, promoAction.getSubEntityStore("Participant"));
        gui.setModified(promoAction);
    };

    //checks if a correlation of participants' last saved statuses are relevant for the current values of promo action
    this._shouldResetParticipants = function (gui) {
        if (!this._prevParticipantsVals.codContractor &&
            !this._prevParticipantsVals.levParticipants &&
            !this._prevParticipantsVals.dteStartSellin &&
            !this._prevParticipantsVals.dteEndSellin) {

            if (!this._previouslySavedAction)
                return true;

            this._setPrevParticipantsValues(this._previouslySavedAction);
        }

        var custResult = gui.callCust("shouldResetParticipants",
            [
                gui.getDocument(),
                this._prevParticipantsVals.codContractor,
                this._prevParticipantsVals.levParticipants,
                this._prevParticipantsVals.dteStartSellin,
                this._prevParticipantsVals.dteEndSellin
            ]
        );
        return (custResult == undefined) ? true : custResult;
    };

    //attempts to align the delivery points
    //the parameter of success method shows if a server call has been made
    this._alignDeliveryPoints = function (gui, updateInclusionFlag, onFail, onSuccess) {
        if (!XApp.isOnline()) {
            onSuccess(false);
            return;
        }

        var promoAction = gui.getDocument();

        if (!promoAction.get("FLGDELIVERYPOINTSALIGN")) {
            onSuccess(false);
            return;
        }

        XUI.showWait();
        var shouldResetDeliveryPoints = this._shouldResetDeliveryPoints(gui);
        this._loadDeliveryPoints(promoAction, shouldResetDeliveryPoints, this._isWorkflowEditable(gui),
                                 updateInclusionFlag, onFail, onSuccess);
    };

    this._loadDeliveryPoints = function (promoAction, shouldResetDeliveryPoints, isEditable, updateInclusionFlag,
        onFail, onSuccess) {
        var self = this;

        XHttpHelper.ExecuteServerOp(
            {
                assemblyName: 'Xtel.SM1.Touch',
                className: 'Xtel.SM1.Touch.SalesPromotion.SalesPromotionTouchEngines',
                methodName: 'LoadDeliveryPoints',
                data: {
                    "promoAction": promoAction.toJsonObject(),
                    "shouldResetDeliveryPoints": shouldResetDeliveryPoints
                }
            },
            function (response, textStatus, e) {
                XLog.logEx(e);
                onFail();
            },
            function (data) {
                var deliveryPoints = promoAction.getSubEntityStore("DeliveryPoint");
                var prevDeliveryPoints = new XStore({ entityName: "DeliveryPoint" });
                prevDeliveryPoints.addAll(deliveryPoints.toArray());
                deliveryPoints.clear();

                //create new deliveryPoints from json response
                var newDeliveryPoints = data["newDeliveryPoints"];
                for (var i = 0, l = newDeliveryPoints.length; i < l; i++) {
                    deliveryPoints.add(new XEntity({ entityName: "DeliveryPoint", data: newDeliveryPoints[i] }));
                }

                self._synchronizeDeliveryPoints(promoAction, isEditable, updateInclusionFlag);
                var areDeliveryPointsEquivalent = self._areStoresEquivalent(prevDeliveryPoints, deliveryPoints);
                deliveryPoints.setModified(!areDeliveryPointsEquivalent);

                promoAction.set("FLGDELIVERYPOINTSALIGN", false);
                self._setPrevDeliveryPointsValues(promoAction);

                onSuccess(true);
            }
        );
    };

    //stores values relevant to delivery points alignment from last refresh
    this._setPrevDeliveryPointsValues = function (promoAction) {
        if (!promoAction) {
            this._prevDeliveryPointsVals = {};
            return;
        }

        this._prevDeliveryPointsVals.codContractor = promoAction.get("CODCONTRACTOR");
        this._prevDeliveryPointsVals.dteStartSellin = promoAction.get("DTESTARTSELLIN");
        this._prevDeliveryPointsVals.dteEndSellin = promoAction.get("DTEENDSELLIN");
    };

    //maintains a separate store of delivery points for comparison purposes
    this._storePreviousDeliveryPoints = function (promoAction) {
        if (!this._previousDeliveryPoints) {
            this._previousDeliveryPoints = new XStore({ entityName: "DeliveryPoint" });
        }
        this._copyStore(promoAction.getSubEntityStore("DeliveryPoint"), this._previousDeliveryPoints);
    };

    this._restorePreviousDeliveryPoints = function (gui, promoAction) {
        this._copyStore(this._previousDeliveryPoints, promoAction.getSubEntityStore("DeliveryPoint"));
        gui.setModified(promoAction);
    };

    //checks if a correlation of delivery points' last saved statuses are relevant for the current values of promo action
    this._shouldResetDeliveryPoints = function (gui) {
        if (!this._prevDeliveryPointsVals.codContractor &&
            !this._prevDeliveryPointsVals.dteStartSellin &&
            !this._prevDeliveryPointsVals.dteEndSellin) {

            if (!this._previouslySavedAction)
                return true;

            this._setPrevDeliveryPointsValues(this._previouslySavedAction);
        }

        var custResult = gui.callCust("shouldResetDeliveryPoints",
            [
                gui.getDocument(),
                this._prevDeliveryPointsVals.codContractor,
                this._prevDeliveryPointsVals.dteStartSellin,
                this._prevDeliveryPointsVals.dteEndSellin
            ]
        );
        return (custResult == undefined) ? true : custResult;
    };

    //check for missing participants only if the client is online;
    //otherwise, fetching them from server is not possible
    this._validateParticipantsTab = function (gui, promoAction) {
        var isValid = false;

        if (XApp.isOnline()) {
            var participants = promoAction.getSubEntityStore("Participant");
            for (var i = 0, n = participants.getCount() ; i < n; i++) {
                var participant = participants.getAt(i);
                if (participant.get("FLGINCLUSION") && participant.get("CODLASTSAVEDSTATUS") != SalesPromotionNameSpace.LastSavedStatus.Missing) {
                    isValid = true;
                    break;
                }
            }

            if (!isValid) {
                this._setTabValid(gui, "PARTICIPANTS", false, UserContext.translate("MOB.PROMO.ERR_NO_PARTICIPANTS"));
            }
        }
        else {
            isValid = true;
        }

        return isValid;
    };

    //check for missing delivery points only if the client is online;
    //otherwise, fetching them from server is not possible
    this._validateDeliveryPointsTab = function (gui, promoAction) {
        var isValid = false;

        if (XApp.isOnline()) {
            var deliveryPoints = promoAction.getSubEntityStore("DeliveryPoint");
            for (var i = 0, n = deliveryPoints.getCount() ; i < n; i++) {
                var delivPoint = deliveryPoints.getAt(i);
                if (delivPoint.get("FLGINCLUSION") && delivPoint.get("CODLASTSAVEDSTATUS") != SalesPromotionNameSpace.LastSavedStatus.Missing) {
                    isValid = true;
                    break;
                }
            }

            if (!isValid) {
                this._setTabValid(gui, "DELIVERY_POINTS", false, UserContext.translate("MOB.PROMO.ERR_NO_DELIVERYPOINTS"));
            }
        }
        else {
            isValid = true;
        }

        return isValid;
    };

    /*
    * automatically excludes the delivery points of excluded participants
    * isEditable: shows whether the UI is editable
    * updateInclusionFlag: controls whether to update FLGINCLUSION or not
    * returns true if at least one entity was modified
    */
    this._synchronizeDeliveryPoints = function (promoAction, isEditable, updateInclusionFlag) {
        var participants = promoAction.getSubEntityStore("Participant");
        var deliveryPoints = promoAction.getSubEntityStore("DeliveryPoint");
        var modified = false;

        deliveryPoints.each(function (delivPoint) {
            var participant = participants.findBy(function (p) {
                return p.get("CODPARTICIPANT") == delivPoint.get("PARTICIPANTCODE");
            });

            if (!participant)
                return;

            if (!participant.get("FLGINCLUSION") && delivPoint.get("FLGINCLUSION") != false) {
                modified = true;
                delivPoint.set("FLGINCLUSION", false);
            }
            var inclusionEditable = participant.get("FLGINCLUSION") && isEditable &&
                                    delivPoint.get("CODLASTSAVEDSTATUS") != SalesPromotionNameSpace.LastSavedStatus.Missing;
            delivPoint.set("INCLUSIONEDITABLE", inclusionEditable);
            if (updateInclusionFlag) {
                var newInclusion = delivPoint.get("FLGINCLUSION") || delivPoint.get("INCLUSIONEDITABLE");
                if (delivPoint.get("FLGINCLUSION") != newInclusion) {
                    modified = true;
                    delivPoint.set("FLGINCLUSION", newInclusion);
                }
            }
        });

        return modified;
    };

    this._synchronizeWithDeliveryPoints = function (promoAction) {
        var participants = promoAction.getSubEntityStore("Participant");
        var deliveryPoints = promoAction.getSubEntityStore("DeliveryPoint");
        var participantsLevel = promoAction.get("LEVPARTICIPANTS");
        var participantCodeField = participantsLevel == -1 ? "CODDELIVERYPOINT" : "CODNODE" + participantsLevel;

        var modified = false;

        participants.each(function (currentParticipant) {
            var presentDeliveryPointsCount = deliveryPoints.toArray().filter(
                function (currentDeliveryPoint) {
                    return currentParticipant.get("CODPARTICIPANT") == currentDeliveryPoint.get(participantCodeField)
                        && currentDeliveryPoint.get("FLGINCLUSION");
                }
            ).length;
            if (currentParticipant.get("FLGINCLUSION") && presentDeliveryPointsCount == 0) {
                currentParticipant.set("FLGINCLUSION", false);
                currentParticipant.set("CODLASTSAVEDSTATUS", SalesPromotionNameSpace.LastSavedStatus.Missing);
                modified = true;
            }
        });
        if (modified) {
            XUI.showInfoOk({ msg: "[MOB.PROMO.PARTICIPANTSNODELIVERYPOINT]" });
        }
    };

    this._onIncludedParticipantsChanged = function (gui, updateInclusionFlag) {
        this._setTabValid(gui, "PARTICIPANTS", true);
        this._setTabValid(gui, "DELIVERY_POINTS", true);
        var self = this;
        var senchaStore;
        var promoAction = gui.getDocument();
        this._participantsChange = !this._areStoresEquivalent(this._previousParticipants, promoAction.getSubEntityStore("Participant"));

        var changeCallback = function () {
            self._storePreviousParticipants(promoAction);

            promoAction.set("FLGDELIVERYPOINTSALIGN", true);

            var modified = self._synchronizeDeliveryPoints(promoAction, self._isWorkflowEditable(gui), updateInclusionFlag);
            if (modified) {
                gui.setModified(promoAction);
                if (gui.tabCtrls["DELIVERY_POINTS"]) {
                    senchaStore = gui.tabCtrls["DELIVERY_POINTS"].sections["LIST_DELIVERYPOINTS"].innerPanel.list.getStore();
                    promoAction.getSubEntityStore("DeliveryPoint").rebindSenchaStore(senchaStore);
                }
            }
        };

        if (this._participantsChange && this._mustClearSimulations(gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_PARTICIPANTS]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            changeCallback();
                            self._clearSimulationList(promoAction);
                            break;
                        case "NO":
                            self._restorePreviousParticipants(gui, promoAction);
                            senchaStore = gui.tabCtrls["PARTICIPANTS"].sections["LIST_PARTICIPANTS"].innerPanel.list.getStore();
                            promoAction.getSubEntityStore("Participant").rebindSenchaStore(senchaStore);
                            break;
                    }
                }
            });
        }
        else {
            changeCallback();
        }
    };

    this._onIncludedDeliveryPointsChanged = function (gui) {
        this._setTabValid(gui, "DELIVERY_POINTS", true);
        var self = this;
        var promoAction = gui.getDocument();
        var delivPointsChange = !this._areStoresEquivalent(this._previousDeliveryPoints, promoAction.getSubEntityStore("DeliveryPoint"));

        if (delivPointsChange && this._mustClearSimulations(gui)) {
            XUI.showYESNO({
                title: UserContext.tryTranslate("[MOB.PROMO.ASK_CHANGE_DELIVERY_POINTS]"),
                msg: UserContext.tryTranslate("[MOB.PROMO.SIMULATIONS_ALREADY_ADDED_WILL_BE_LOST]"),
                onResult: function (btnCode) {
                    switch (btnCode) {
                        case "YES":
                            self._clearSimulationList(promoAction);
                            self._storePreviousDeliveryPoints(promoAction);
                            break;
                        case "NO":
                            self._restorePreviousDeliveryPoints(gui, promoAction);
                            promoAction.set("FLGDELIVERYPOINTSALIGN", true);
                            var senchaStore = gui.tabCtrls["DELIVERY_POINTS"].sections["LIST_DELIVERYPOINTS"].innerPanel.list.getStore();
                            promoAction.getSubEntityStore("DeliveryPoint").rebindSenchaStore(senchaStore);
                            break;
                    }
                }
            });
        }
        else {
            this._storePreviousDeliveryPoints(promoAction);
        }
    };

    //sets the inclusion flag
    this._setInclusion = function (promoAction, subEntityName, include) {
        promoAction.getSubEntityStore(subEntityName).each(function (subEntity) {
            if (subEntity.get("INCLUSIONEDITABLE"))
                subEntity.set("FLGINCLUSION", include);
        });
    };

    this._setProductDetailsInclusion = function (store, include) {
        store.each(function (productDetail) {
            productDetail.set("FLGINCLUSION", include);
        });
    };

    //changes the status of participants/delivery points from NEW to PRESENT
    this._passNewToPresent = function (promoAction, subEntityName) {
        promoAction.getSubEntityStore(subEntityName).each(function (subEntity) {
            if (subEntity.get("CODLASTSAVEDSTATUS") == SalesPromotionNameSpace.LastSavedStatus.New)
                subEntity.set("CODLASTSAVEDSTATUS", SalesPromotionNameSpace.LastSavedStatus.Present);
        });
    };

    //propagates modification flag only if the new subEntities are not equivalent to old ones
    this._propagateAlignmentModification = function (gui, subEntityName) {
        var promoAction = gui.getDocument();
        var store = promoAction.getSubEntityStore(subEntityName);
        if (store.isModified()) {
            gui.setModified(promoAction);
        }
    };
    //#endregion

    //#region Common

    //automatically sets the value for combos with only one option
    //or resets it if the selected value is no longer an available option
    this._setDefaultValue = function (entity, fieldName, options) {
        if (options.length == 1) {
            entity.set(fieldName, options[0].value);
            return;
        }

        var selectedValue = entity.get(fieldName);
        if (!selectedValue)
            return;
        for (var i = 0, l = options.length; i < l; i++) {
            if (options[i].value == selectedValue)
                return;
        }

        entity.set(fieldName, "");
    };

    //convert value represented as string to appropriate type
    this._convertValue = function (newVal, fldType) {
        var newValue = newVal;
        if (newValue.indexOf) {
            switch (fldType) {
                case "decimal":
                case "float":
                    newValue = UserContext.stringToNumber(newValue);
                    break;
                case "DateTime":
                    newValue = UserContext.stringToDate(newValue);
                    break;
            }
        }
        return newValue;
    };

    //sets the qtab of a field from ui configuration
    this._setFieldQtabs = function (fields, fieldName, qtabs) {
        for (var i = 0, l = fields.length; i < l; i++) {
            var field = fields[i];
            if (field.attrs.name == fieldName) {
                field.attrs.qtabs = qtabs;
                break;
            }
        }
    };

    //sets or removes errors on tabs
    this._setTabValid = function (gui, tabName, tabValid, message) {
        var tabBar = gui.tabPanel.getTabBar();
        var n = tabBar.getItems().getCount();
        for (var i = 0; i < n; i++) {
            var tabHead = tabBar.getItems().getAt(i);

            if (gui.tabSubDetails[i].tabName == tabName) {
                if (tabValid) {
                    tabHead.removeCls("sm1-tab-error");
                    delete gui.errorReports[tabName];
                }
                else {
                    tabHead.addCls("sm1-tab-error");
                    if (message) {
                        gui.errorReports[tabName] = { caption: message };
                    }
                }
                break;
            }
        }
    };

    this._clearErrors = function (gui, detailContext) {
        //clear field errors
        for (var f in detailContext.fields) {
            delete gui.errorReports[f];
            var field = detailContext.fields[f];
            field.removeCls('x-error-field');
            field.fieldContext.isValid = true;
        }

        //clear tab error
        var currentTabName = gui.getActualTabName();
        if (currentTabName == "PRODUCTS") {
            this._noActivities = false;
        }
        this._setTabValid(gui, currentTabName, true);
    };

    //compares the head values of entities
    this._areEntityHeadsEqual = function (a, b) {
        if (!a || !b)
            return false;

        if (a.getEntityName() != b.getEntityName())
            return false;

        var entityDef = XApp.model.getEntityDef(a.getEntityName());
        if (!entityDef)
            return false;

        var fields = Ext.merge({}, entityDef.fields, entityDef.dynFields);
        var fa, fb;
        for (var fieldName in fields) {
            fa = (fields[fieldName].fldType == "DateTime") ? a.get(fieldName).getTime() : a.get(fieldName);
            fb = (fields[fieldName].fldType == "DateTime") ? b.get(fieldName).getTime() : b.get(fieldName);

            if (fa != fb)
                return false;
        }

        return true;
    };

    //checks if two stores are the same, based on entities' head values equality
    this._areStoresEquivalent = function (a, b) {
        if (a.getCount() != b.getCount())
            return false;

        for (var i = 0, n = a.getCount() ; i < n; i++) {
            var entityA = a.getAt(i);
            var found = false;

            for (var j = 0, m = b.getCount() ; j < m; j++) {
                var entityB = b.getAt(j);
                if (this._areEntityHeadsEqual(entityA, entityB)) {
                    found = true;
                    break;
                }
            }

            if (!found)
                return false;
        }

        return true;
    };

    //refresh sencha list
    this._afterListAlignment = function (gui, entityName, tabName, listName) {
        var detailContext = gui.tabCtrls ? gui.tabCtrls[tabName] : gui;
        if (!detailContext) {
            //tab not rendered yet
            return;
        }
        var entityStore = detailContext.entity.getSubEntityStore(entityName);
        var senchaStore = detailContext.sections[listName].innerPanel.list.getStore();
        entityStore.rebindSenchaStore(senchaStore);
        detailContext.setSectionButtonsStatus();
    };

    this._failureCallback = function (message, exeq) {
        if (exeq)
            exeq.clear();
        XUI.hideWait();
        XUI.showErrorMsgBox(UserContext.translate(message));
    };

    this._isWorkflowEditable = function (gui) {
        return gui.isEditable() &&
               gui.getDocument().get("CODWFSTATEHARD") == SalesPromotionNameSpace.PromoActionHardStates.Draft;
    };

    this._copyStore = function (source, destination) {
        destination.clear();

        source.each(function (entity) {
            destination.add(entity.clone());
        });
    };

    //refreshes the UI and optionally the opened popup
    this._refreshGuiState = function (gui, disable) {
        if (disable != undefined)
            this._simulationRunning = disable;

        gui.setFieldsStatus();
        gui.setNewButtonsStatus();
        gui.setSectionButtonsStatus();

        if (this._activeDetailPopup) {
            this._activeDetailPopup.setFieldsStatus();
            this._activeDetailPopup.setNewButtonsStatus();
            this._activeDetailPopup.setSectionButtonsStatus();
            this._activeDetailPopup.setRemoveButtonsStatus();
        }
    };

    //returns the detail context if the currently opened popup or a parent corresponds to the provided entity
    this._matchActiveDetailPopup = function (entity, checkParent) {
        if (!this._activeDetailPopup)
            return null;

        if (this._activeDetailPopup.entity.getKey() == entity.getKey())
            return this._activeDetailPopup;

        if (checkParent) {
            var context = this._activeDetailPopup.parentCtrl;
            while (context && context.entityName != "PromoAction") {
                if (context.entity == entity)
                    return context;

                context = context.parentCtrl;
            }
        }

        return null;
    };

    //#endregion

    //#endregion

};
XApp.registerGuiExtension("mobGuiPromoAction", new _mobGuiPromoAction());
//#endregion
