//#region _mobGuiCustomerView
function _mobGuiCustomerViewExtension() {
    //#region Public methods (customizers)

    //Initialization of the Hierarchical node fake entity
    this.preLoadDocument = function (context) {
        var gui = context.gui;
        var docStore = new XStore({ entityName: "HierarchicalNode" }); //fake store
        var document = new XEntity({ entityName: "HierarchicalNode" }); //fake entity

        //get the entry from the navigator
        this._navData = context.gui.openData.selectedNavRow;

        //update the background entity document
        this._initalizeDocumentData(document);

        //add the entity to the store
        docStore.add(document);
        gui.docStore = docStore;

        this._currentNodeListFunction = XHistory.actualConfig().lastFunction;
        return false;
    };

    //create the custom layout for the main tab and import the assortments grid
    //from the customer
    this.getCustomLayout = function (layout, detailContext) {
        var type = layout.children[0].attrs["caption"];

        switch (type) {
            case "ASSORT": //This configuration is duplicate in the DB now for the customer view
                //var guiConfig = XDocs.getGuiConfig("mobGuiCustomer", null);
                //for (var iChild = 0 ; iChild < guiConfig.children.length; iChild++)
                //{
                //    if (guiConfig.children[iChild].attrs["name"] == "ASSORT")
                //        return  guiConfig.children[iChild].children[1];

                //}
                //return layout;
        }
        return layout;
    }

    //manage the behavoiur of the reference field and the assortments filter
    this.onEditEnding = function (ctrl, fieldName, newValue, oldValue) {
        var fieldContext = ctrl.fieldContext;
        var sectionContext = fieldContext.sectionContext;
        var gui = sectionContext.gui;
        var refDate = gui.getDocument().get("REFFIELD");

        switch (fieldName) {
            case "REFFIELD": //Reference Field
                {
                    var constraints = new XConstraints({ logicalOp: 'AND' });
                    constraints.add(new XConstraint("CODNODE", "=", this._navData.get("CODNODE")));
                    constraints.add(new XConstraint("DTEEND", ">", refDate));
                    constraints.add(new XConstraint("DTESTART", "<", refDate));
                    constraints.add(new XConstraint("IDLEVEL", "=", this._navData.get("IDLEVEL")));

                    //get node with the same codenode valid at selected date
                    var nodeData = XNavHelper.getNavRecord("NAV_MOB_CUSTVIEW", constraints);

                    if (!nodeData) {
                        //if no node is found reject as invalid date
                        gui.getDocument().set("REFFIELD", oldValue);
                        XUI.showErrorMsgBox("Invalid reference, no node is valid at this date!"); //TODO: change to constant                 
                    } else {
                        //compare the dtestart-dteend        
                        if (nodeData.get("DTESTART") == this._navData.get("DTESTART") && nodeData.get("DTEEND") == this._navData.get("DTEEND")) {
                            //if the dates are the same update the selector
                            gui.getDocument().getSubEntityStore("HierarchicalNode").clear();
                            this._currentNodeListFunction(sectionContext, this._getListStore(ctrl.fieldContext.sectionContext.gui).listStore, this);
                        }
                        else {
                            var constraints = new XConstraints({ logicalOp: 'AND' });
                            constraints.add(new XConstraint("CODNODE", "=", nodeData.get("CODNODE")));
                            constraints.add(new XConstraint("DTEEND", "=", nodeData.get("DTEEND")));
                            constraints.add(new XConstraint("DTESTART", "=", nodeData.get("DTESTART")));


                            //get the entry from the navigator
                            XHistory.actualConfig().selectedNavRow = XNavHelper.getNavRecord("NAV_MOB_CUSTVIEW", constraints);
                            XHistory.again();
                        }
                    }
                    break;
                }
            case "ASSOTYPE":
                //var type = ctrl.getRecord();
                var type = ctrl.getValue();


                var customer = gui.getDocument();
                //get the unfiltered store from the entity
                var unfilteredStore = customer.getSubEntityStore('EvalAssoSimulationUnfiltered');
                var filteredStore = customer.getSubEntityStore('EvalAssoSimulation');
                var assortStore;
                if (!XApp.isEmptyOrWhitespaceString(type)) { //if the empty filter is not selected, execute the filter
                    assortStore = unfilteredStore.filterToStore(function (filter) { //filter function
                        return function (record) {
                            var result = false;

                            if (record.get("CODASSORTMENTTYPE") == filter)
                                result = true;
                            return result;
                        };
                    }(type)).toArray(); //obtain the entity array                 
                    filteredStore.removeAll();
                } else {
                    filteredStore.removeAll();
                    assortStore = unfilteredStore.toArray(); //add all the values
                }

                filteredStore.addAll(assortStore);

                this._rebindAssoGridStore(gui); //update the sencha store


                break;
        }
    }


    //Initialize the sub-entities and fill the assortments list
    this.beforeUiRendering = function (context) {

        try {
            // this._fillHierNodeList(context);
            var document = context.gui.getDocument();
            document.createSubEntityStore("HierarchicalNode");
            this._fillAssortmentList(context);
        } catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
    };


    //create the navigators constraints
    this.preCreateLink = function (context) {
        var linkCode = context.linkRow.code;
        var codNode = context.ctrl.entity.get("CODNODE");
        var self = this;

        switch (linkCode) {
            case "NAV_MOB_CUSTVIEW_CLUST":
                context.linkRow.hcs = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                        new XConstraint("CODPARTY", "=", codNode)
                    ]
                });
                break;
            case "NAV_MOB_CUSTVIEW_PROMO":
                context.linkRow.hcs = new XConstraints({
                    logicalOp: "AND",
                    constraints: [

                        new XConstraint("CODCONTRACTOR", "=", codNode)
                    ]
                });
                break;
            case "NAV_MOB_PDV_PDC_CUSTVIEW":
                context.linkRow.hcs = new XConstraints({
                    logicalOp: "AND",
                    constraints: [
                        new XConstraint("CODCUSTDELIV", "=", codNode)
                    ]
                });
                break;
        }
    }

    //After the framework rendered the section it is required that the sections should be 
    //populated with data from the navigator
    this.afterSectionCreated = function (sectionContext) {

        //Get data from navigator
        var documentData = this._navData;
        var self = sectionContext;
        var custDoc = self.gui.getDocument()

        switch (sectionContext.sectionConfig.attrs["caption"]) {
            case "MAIN_INFO":
                var fields = sectionContext.sectionConfig.children;
                if (!custDoc.get("REFFIELD")) documentDcustDocata.set("REFFIELD", new Date());
                app.viewport.setApplicationToolbarTitle(documentData.get("DESLEVEL") + " - " + documentData.get("CODNODE") + " - " + documentData.get("DESNODE"));
                break;
        }
    }


    //initalize the CODHIER values by current configuration and the ASSOTYPE filter
    this.getQtabsVoices = function (fieldContext) {
        switch (fieldContext.fieldName) {
            case "CODHIER":
                //get the hier configurations by this dim and division code
                var hierarchyCollection = HierarchyEngine.getDimConfig(HierarchyEngine.CustomersCodDim, UserContext.CodDiv).HierConfigDetailsStore;
                var qtabs = "AUTO";
                var voices = [];
                voices.push({ value: "", text: "" });
                for (var iHiers = 0 ; iHiers < hierarchyCollection.getCount() ; iHiers++) { //populate the "voices"
                    var hier = hierarchyCollection.getAt(iHiers);
                    var hierConfig = HierarchyEngine.getHierConfig(HierarchyEngine.CustomersCodDim, hier.get("CODHIER"), UserContext.CodDiv);
                    voices.push({ text: hier.get("DESHIER"), value: hier.get("CODHIER") });
                }
                fieldContext["voices"] = voices;
                fieldContext["qtabs"] = "AUTO";
                break;

            case "ASSOTYPE":
                var assoTypes = UserContext.getDecodeTable("ASSOTYPE");
                var assoTypesArray = Object.keys(assoTypes).map(function (k) { return assoTypes[k] }); // get assotypes as array
                var qtabs = "AUTO";
                var voices = [];
                voices.push({ value: "", text: "" });

                for (var key in assoTypes) {
                    var item = assoTypes[key];
                    voices.push({ value: item["cod"], text: item["des"] });
                }

                fieldContext["voices"] = voices;
                fieldContext["qtabs"] = "AUTO";
                break;
        }


    }


    //this is a non-document gui so it's opened in "VIEW" mode 
    //we need to make some fields editable for filtering purposes
    this.setFieldStatus = function (context) {
        var fieldName = context.field.getName();
        switch (fieldName) {
            case "REFFIELD":
            case "ASSOTYPE":
                context.editable = true;
                break;
        }

    }


    //after the gui inialized we populate the assortments list
    this.afterLoad = function (gui) {
        this._loadAssortmentsFromCache(gui);

        var sectionContext = {};
        sectionContext.gui = gui;

        if (this._currentNodeListFunction)
            this._updateNodeList(sectionContext, this._currentNodeListFunction);
        else
            this._updateNodeList(sectionContext, this._fillParentsNodeList);
        //keepShowWait
        return true;
    };

    //remove the add buttons for the lists
    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "EvalAssoSimulation":
                context.visible = false;
                break;
            case "HierarchicalNode":
                context.visible = false;
                break;
        }
    };


    //insert the hierarchy navigation buttos
    this.getSectionButtons = function (sectionContext) {
        //HIERLIST
        var self = this;
        var sectionName = sectionContext.config.attrs["caption"];
        var subEntityName = sectionContext.config.attrs["detailObject"];


        switch (sectionName) {
            case "HIERLIST":

                var setParentList = { //upper levels
                    msg: UserContext.tryTranslate("[ANCESTORS]"),
                    docked: "right",
                    entityName: subEntityName,
                    handler: function (x) {
                        self._updateNodeList(sectionContext, self._fillParentsNodeList);
                    },
                    id:  sectionContext.panel.id + '-ancestors',
                    scope: this
                };
                var setSiblingList = { //same levels
                    msg: UserContext.tryTranslate("[SIBLINGS]"),
                    docked: "right",
                    handler: function (x) {
                        self._updateNodeList(sectionContext, self._fillSibblingsNodeList);
                    },
                    entityName: subEntityName,
                    id:  sectionContext.panel.id + '-siblings',
                    scope: this
                };
                var setChildrenList = { // lower levels
                    msg: UserContext.tryTranslate("[CHILDREN]"),
                    docked: "right",
                    handler: function (x) {
                        self._updateNodeList(sectionContext, self._fillChildrensNodeList);

                    },
                    entityName: subEntityName,
                    id:  sectionContext.panel.id + '-children',
                    scope: this
                };
                sectionContext.buttons.push(setParentList);
                sectionContext.buttons.push(setSiblingList);
                sectionContext.buttons.push(setChildrenList);
                break;
        }


    }


    //reset the gui with the selected node
    this.beforeOpenSubDetailFromList = function (context) {
        var constraints = new XConstraints({ logicalOp: 'AND' });
        constraints.add(new XConstraint("CODNODE", "=", context.entity.get("CODNODE")));
        constraints.add(new XConstraint("DTEEND", ">=", this._navData.get("DTEEND")));
        constraints.add(new XConstraint("DTESTART", "<=", this._navData.get("DTESTART")));
        constraints.add(new XConstraint("IDLEVEL", "=", context.entity.get("IDLEVEL")));
        var documentData = XNavHelper.getNavRecord("NAV_MOB_CUSTVIEW", constraints);

        if (!documentData) { //this is not an error that should happen 
            XUI.showOk({
                title: UserContext.tryTranslate("[CUSTOMER_ERR]"),
                msg: UserContext.tryTranslate("[MOB.DOC_UNAVAILABLE]")
            });

        }
        else { //reset the GUI with the selected node

            var constraints = new XConstraints({ logicalOp: 'AND' });
            constraints.add(new XConstraint("CODNODE", "=", documentData.get("CODNODE")));
            constraints.add(new XConstraint("DTEEND", "=", documentData.get("DTEEND")));
            constraints.add(new XConstraint("DTESTART", "=", documentData.get("DTESTART")));
            constraints.add(new XConstraint("IDLEVEL", "=", documentData.get("IDLEVEL")));


            //get the entry from the navigator
            XHistory.actualConfig().selectedNavRow = XNavHelper.getNavRecord("NAV_MOB_CUSTVIEW", constraints);
            XHistory.actualConfig().lastFunction = this._currentNodeListFunction;
            XHistory.again();
        }
        return true;
    }

    //add link to the customer gui
    this.getMenuButtons = function (context) {
        var self = this;
        if (UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "VIEW"))
            var openType = UserContext.checkRight("NAV_MOB_CUST", "NAV_MOB_CUST", "EDIT") ? 'EDIT' : 'VIEW';
        context.buttons.push({
            msg: UserContext.tryTranslate("[GO_TO_CUSTOMER]"),
            id: 'mobguicustomerview-contextualmenu-go-to-customer',
            handler: (function (ctrl) {
                return function () {
                    if (!XNavHelper.getFromMemoryCache(self._navData.get("DOCUMENTKEY"))) {
                        XHistory.go({
                            controller: app.getSM1Controllers().gui,
                            action: 'show',
                            docKey: self._navData.get("DOCUMENTKEY"),
                            navId: "NAV_MOB_CUST",
                            openMode: openType
                        });
                    }
                    else {
                        XUI.showOk({
                            title: UserContext.tryTranslate("[CUSTOMER_ERR]"),
                            msg: UserContext.tryTranslate("[MOB.DOC_UNAVAILABLE]")
                        });
                    }
                };
            })(context.ctrl)
        });
    }

    //restrict the save
    this.preSaveDocument = function (context) {
        //prevent saving
        context.clearModified(false);
        return true;
    }

    //#endregion

    //#region Private methods

    //initialize the 
    this._initalizeDocumentData = function (entity) {
        if (this._navData) {
            entity.set("DOCUMENTKEY", this._navData.get("DOCUMENTKEY"));
            entity.set("CODHIER", this._navData.get("CODHIER"));
            entity.set("DTESTART", this._navData.get("DTESTART"));
            entity.set("DTEEND", this._navData.get("DTEEND"));
            entity.set("CODNODE", this._navData.get("CODNODE"));
            entity.set("REFFIELD", new Date());
        }
    }

    this._getListStore = function (gui) {

        //if the model is customized, allow to chose another location for the assoGridStore
        var localcontext = {
            gui: gui,
            list: null,
            listStore: null
        };
        try {
            XApp.callCust("guiCustomizer", "mobGuiCustomerView", 'getListStore', localcontext);
            if (!localcontext.assoGridStore) {
                localcontext.list = gui.tabCtrls.MAIN.sections.HIERLIST.innerPanel.list
                localcontext.listStore = gui.tabCtrls.MAIN.sections.HIERLIST.innerPanel.list.getStore()
            }
            return localcontext;
        } catch (e) {
            return localcontext;
        }
    }

    //update the node list with the supperiors in the hierarchy
    this._fillParentsNodeList = function (context, currentListStore, guiExtension) {
        var documentData = guiExtension._navData;
        var gui = context.gui;
        var maxNoNodes = 15;
        var document = gui.getDocument();
        var lvlDescriptions = HierarchyEngine.getHierLevelsDescription(HierarchyEngine.CustomersCodDim, documentData.get("CODHIER"), UserContext.CodDiv);

        var listStore = document.HierarchicalNodeDetailsStore;

        for (var iNode = maxNoNodes; iNode >= 0 ; iNode--) {
            var codNode = documentData.get("CODNODE" + iNode);
            if (codNode) {
                var nodeEntity = new XEntity({ entityName: "HierarchicalNode" });
                var nodeCodeLevel = HierarchyEngine.getLevelCode(HierarchyEngine.CustomersCodDim, documentData.get("CODHIER"), UserContext.CodDiv, iNode);
                nodeEntity.set("CODNODE", codNode);
                nodeEntity.set("DESNODE", documentData.get("DESNODE" + iNode));
                nodeEntity.set("IDLEVEL", iNode);
                nodeEntity.set("DESLEVEL", lvlDescriptions.filter(function (v) { return v["idLevel"] == nodeCodeLevel })[0].desLevel);

                if (codNode == documentData.get("CODNODE")) {
                    nodeEntity.set("IDLEVEL", documentData.get("IDLEVEL"));
                    nodeEntity.set("DESNODE", documentData.get("DESNODE"));
                    nodeEntity.set("DESLEVEL", documentData.get("DESLEVEL"));
                }

                listStore.add(nodeEntity);
            }
        }

        listStore.rebindSenchaStore(currentListStore);
        context.gui.tabCtrls.MAIN.sections.HIERLIST.sectionToolbar.setTitle(UserContext.tryTranslate("[ANCESTORS]"));


    }

    //update the node list with the nodes on the same level and that have the same parent
    this._fillSibblingsNodeList = function (context, currentListStore, guiExtension) {

        //get curent level
        //iterate the level
        //check who is the next level
        //the next lvl id is CODENODE<lvlid>
        //add constraint
        var documentData = guiExtension._navData;
        var curentLevel = documentData.get("IDLEVEL");
        var parentLevel = curentLevel + 1;
        var parentCodLevel = HierarchyEngine.getLevelCode(HierarchyEngine.CustomersCodDim, documentData.get("CODHIER"), UserContext.CodDiv, parentLevel);
        if (!parentCodLevel) parentCodLevel = documentData.get("CODLEVEL");
        var parentName = "CODNODE" + parentCodLevel;
        var custDoc = context.gui.getDocument();
        var referenceDate = custDoc.get("REFFIELD") ? custDoc.get("REFFIELD") : new Date();


        var constraints = new XConstraints({ logicalOp: 'AND' });
        constraints.add(new XConstraint(parentName, "=", documentData.get(parentName))); //have the same parent
        constraints.add(new XConstraint("IDLEVEL", "=", documentData.get("IDLEVEL"))); //be on the same level
        constraints.add(new XConstraint("CODNODE", "<>", documentData.get("CODNODE")));//other nodes
        constraints.add(new XConstraint("DTEEND", ">", referenceDate));//valid reference date
        constraints.add(new XConstraint("DTESTART", "<", referenceDate));

        var siblings = XNavHelper.getNavRecords("NAV_MOB_CUSTVIEW", constraints);
        guiExtension._createListFromEntities(siblings, context.gui.getDocument(), currentListStore);
        context.gui.tabCtrls.MAIN.sections.HIERLIST.sectionToolbar.setTitle(UserContext.tryTranslate("[SIBLINGS]"));
    }

    //update the node list with the nodes that are on a lower level and have the current node
    //as parrent
    this._fillChildrensNodeList = function (context, currentListStore, guiExtension) {
        var documentData = guiExtension._navData;
        var curentLevel = documentData.get("CODLEVEL");
        var custDoc = context.gui.getDocument();
        var referenceDate = custDoc.get("REFFIELD") ? custDoc.get("REFFIELD") : new Date();
        var childLevel = curentLevel - 1;
        var children = [];
        if (curentLevel >= 0) {
            var constraints = new XConstraints({ logicalOp: 'AND' });
            constraints.add(new XConstraint("CODNODE" + curentLevel, "=", documentData.get("CODNODE"))); //have the same parent
            constraints.add(new XConstraint("DTEEND", ">", referenceDate));//valid reference date
            constraints.add(new XConstraint("DTESTART", "<", referenceDate));
            constraints.add(new XConstraint("IDLEVEL", "=", childLevel));
            children = XNavHelper.getNavRecords("NAV_MOB_CUSTVIEW", constraints);
        }
        guiExtension._createListFromEntities(children, context.gui.getDocument(), currentListStore);
        context.gui.tabCtrls.MAIN.sections.HIERLIST.sectionToolbar.setTitle(UserContext.tryTranslate("[CHILDREN]"));
    }

    //dupplicate from the cutomer navigator
    this._createListFromEntities = function (records, document, currentListStore) {
        var listStore = document.getSubEntityStore("HierarchicalNode");

        for (var iEntity = 0 ; iEntity < records.length; iEntity++) {

            var nodeEntity = new XEntity({ entityName: "HierarchicalNode" });

            var nodeCodeLevel = HierarchyEngine.getLevelCode(HierarchyEngine.CustomersCodDim, records[iEntity].get("CODHIER"), UserContext.CodDiv, iEntity);
            nodeEntity.set("CODNODE", records[iEntity].get("CODNODE"));
            nodeEntity.set("DESNODE", records[iEntity].get("DESNODE"));
            nodeEntity.set("IDLEVEL", records[iEntity].get("IDLEVEL"));
            nodeEntity.set("DESLEVEL", records[iEntity].get("DESLEVEL"));

            listStore.add(nodeEntity);
        }

        listStore.rebindSenchaStore(currentListStore);
    }

    this._updateNodeList = function (context, fillFunction) {
        var self = this;
        var listContext = self._getListStore(context.gui)
        context.gui.getDocument().getSubEntityStore("HierarchicalNode").clear();
        fillFunction(context, listContext.list.getStore(), self); //update the list 
        this._currentNodeListFunction = fillFunction; //update the last method used for the reffield to use
    }

    this.afterNotifyLeave = function (context) {
        var gui = context.ctrl;
        delete this._navData;
        delete this._currentNodeListFunction;

        delete gui.resetAssoProd;
        delete gui.nrNewProds;
        delete gui.clusterCustVoices;
        delete gui.simpleCategoryCluster;
        delete gui.categoryCluster;
    }



    //#region Assorments
    // Cache the assortments for each division of the current customer
    // The cached data will be saved on the order

    //duplicate from cutomer view
    this._fillAssortmentList = function (context) {
        var gui = context.gui;
        XUI.showWait();
        //create the store for the asso grid
        gui.getDocument().createSubEntityStore("EvalAssoSimulation");
        gui.getDocument().createSubEntityStore("EvalAssoSimulationUnfiltered");

        //reset gui variables
        gui.resetAssoProd = false;
        gui.nrNewProds = 0;
        gui.clusterCustVoices = [];
        gui.simpleCategoryCluster = UserContext.getConfigParam("SIMPLE_CATEGORY_CLUSTER", "-1") != "0";
        gui.categoryCluster = UserContext.getConfigParam("CATEGORY_CLUSTER", "-1") != "0";
        var customer = gui.getDocument();
        var codParty = customer.get("CODNODE");
        context.executeNext = false;
        var refreshCallback = function (ui) {

            ui.exe.executeNext();
        }(gui);

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
    }

    this._loadAssortmentsFromCache = function (gui, onSuccess) {
        var self = this;
        try {


            XUI.showWait();
            var customer = gui.getDocument();
            var codParty = customer.get("CODNODE");
            //get the store for the ASSO grid
            var assoStore = customer.getSubEntityStore("EvalAssoSimulation");
            var assoStoreUnfiltered = customer.getSubEntityStore("EvalAssoSimulationUnfiltered");
            SfaCacheManager.waitForCache(function () {
                SfaCacheManager.getFromCache({
                    entityName: SfaCacheManagerNamespace.CacheObjects.ASSORTMENTS,
                    date: new Date(),
                    codparty: codParty,
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
                                self._initializeOrderingProductsList(assoStore, assoStoreUnfiltered, assortmentDictionary);

                                assoStore.setModified(false);
                                //bind and refresh the grid if the grid is rendered
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

    this._getAssoGridStore = function (gui) {
        //if the model is customized, allow to chose another location for the assoGridStore
        var localcontext = {
            gui: gui,
            assoGrid: null,
            assoGridStore: null
        };
        try {
            XApp.callCust("guiCustomizer", "mobGuiCustomerView", 'getAsooGridStore', localcontext);
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

    this._initializeOrderingProductsList = function (assoStore, assoStoreUnfiltered, assortmentDictionary) {
        var nrPrg = 1;
        for (var i = 0; i < assortmentDictionary.length; i++) {
            var assoData = assortmentDictionary[i].value;
            for (var n = 0; n < assoData.length; n++) {
                var ev = new XEntity({ entityName: "EvalAssoSimulation", data: assoData[n] });
                ev.setCustomFields();
                ev.set("NUMPRG", nrPrg++);
                assoStore.add(ev);
                assoStoreUnfiltered.add(ev);
            }
        }
        XLog.logInfo("Loading Assortments from cache: found  " + assoStore.getCount() + " items");
    };
    //#endregion

    //#endregion
}
XApp.registerGuiExtension("mobGuiCustomerView", new _mobGuiCustomerViewExtension());
//#endregion