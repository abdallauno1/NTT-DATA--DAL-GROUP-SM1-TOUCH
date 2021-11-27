function _mobGuiVanInventoryReport() {

    //#region init
    this.afterNewDocument = function (gui, options) {
        var doc = gui.getDocument();
        //set the default selected value for the main combo
        doc.set("CODTYPROW", SalesForceNameSpace.OrdProdWhsBalance.ALLDELIVERY);
    };

    this.afterLoad = function (gui) {
        var self = this;
        var doc = gui.getDocument();
        
        //create a dictionary to store all the CODTYPROWS returned by the procedure
        var availableCodTypRows = {};
        //create an object containing the conversion data
        gui.CacheData = {
            m_prodConv: SalesForceEngine.getProductConversions(UserContext.CodDiv)
        };
        
        //get the Report data and populate the grid store
        SalesForceEngine.calculateWarehouseBalance(gui.openData.currentUserRow.get("CODWHSSALES"), '', gui.CacheData,
            function (response) {
                //success
                if (response) {
                    for (var prodBalKey in response.OrdProdWhsBalances) {
                        var prodWhsBalance = response.OrdProdWhsBalances[prodBalKey];
                        var prodKey = CommonEngine.buildProductKey(prodWhsBalance.CODART, prodWhsBalance.CODDIV);
                        var prodRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(prodKey);
                        if (prodRow) {
                            var codTypRow = prodWhsBalance.CODTYPROW;
                            if (!availableCodTypRows[codTypRow] && 
                                codTypRow != SalesForceNameSpace.OrdProdWhsBalance.ALLSELLABLE && 
                                codTypRow != SalesForceNameSpace.OrdProdWhsBalance.ALLDELIVERY)
                                availableCodTypRows[codTypRow] = codTypRow.toString();
                            //add the header row
                            var codArt = prodWhsBalance.CODART;
                            var desArt = prodRow.get("DESART");
                            var desUM = UserContext.decode("UMART", prodWhsBalance.UMORD);
                            var header = new XEntity({
                                entityName: 'WarehouseBalanceRow',
                                data: {
                                    FLGHEADER: true,
                                    PRODUCTKEY: prodBalKey,
                                    CODART: codArt,
                                    CODTYPROW: codTypRow,
                                    DESART: desArt,
                                    SEARCH: desArt,
                                    HEADERCODART: codArt,
                                    UMORD: prodWhsBalance.UMORD,
                                    DESUM: desUM,
                                    QTY: prodWhsBalance.QTYORD,
                                    QTYINV: prodWhsBalance.QTYINV
                                }
                            });
                            self._splitQty(prodRow, header, prodWhsBalance.UMORD, gui.CacheData);
                            doc.WarehouseBalanceRowDetailsStore.add(header);
                            for (var batchKey in prodWhsBalance.OrdBatchWhsBalances) {
                                var batchWhsBalance = prodWhsBalance.OrdBatchWhsBalances[batchKey];
                                if (batchWhsBalance.QTYORD >= 0) {
                                    //add the detail rows
                                    var desBatch = batchWhsBalance.IDBATCH + " - " + batchWhsBalance.DTEEXPIRE.toDateString();
                                    var row = new XEntity({
                                        entityName: 'WarehouseBalanceRow',
                                        data: {
                                            FLGHEADER: false,
                                            PRODUCTKEY: prodBalKey,
                                            IDBATCH: batchWhsBalance.IDBATCH,
                                            CODART: "",
                                            CODTYPROW: codTypRow,
                                            DESART: desBatch,
                                            HEADERCODART: codArt,
                                            SEARCH: desArt,
                                            UMORD: prodWhsBalance.UMORD,
                                            DESUM: desUM,
                                            QTY: batchWhsBalance.QTYORD,
                                            QTYINV: batchWhsBalance.QTYINV
                                        }
                                    });
                                    self._splitQty(prodRow, row, prodWhsBalance.UMORD, gui.CacheData);
                                    doc.WarehouseBalanceRowDetailsStore.add(row);
                                }
                            }
                        }
                    }
                    gui.CacheData.m_warehouseBalances = response.OrdProdWhsBalances;
                }
                self._refreshInventoryGrid(gui);
                self._buildCodTypRowQtabs(gui, availableCodTypRows);
                XUI.hideWait();
            },
            function() {
                //failure
                XUI.showErrorMsgBox({ msg: '[MOBGUIVANINVENTORYREPORT.ERROR_ON_LOAD_WHS_BALANCE]' });
                self._buildCodTypRowQtabs(gui, availableCodTypRows);
                XUI.hideWait();
            });
        return true;
    };
    //#endregion

    //#region main section customizers

    this.onEndEditEnded = function(ctrl, fieldName, newValue, oldValue) {
        var sectionContext = ctrl.fieldContext.sectionContext;
        var gui = sectionContext.gui;
        var entity = sectionContext.entity;

        switch (entity.getEntityName()) {
        case "WarehouseBalance":
            switch (fieldName) {
                case "CODTYPROW":
                    var inventoryGridStore = this._getInventoryGridStore(gui);
                    inventoryGridStore.clearFilter();
                    inventoryGridStore.filter("CODTYPROW", newValue);
                    break;
            }
        }
    };
    
    //#endregion

    //#region grid customizers
    this.setNewButtonsStatus = function (context) {
        switch (context.detailEntityName) {
            case "WarehouseBalanceRow":
                context.visible = false;
                break;
        }
    };
    
    this.beforeCreateGridColumn = function (fieldContext) {
        var gridName = fieldContext.sectionContext.config.attrs.caption;
        switch (gridName) {
            case "INVENTORY_GRID":
                fieldContext.column.sortable = false;
                fieldContext.column.validator = (function (fieldContext) {
                    return function (opt) {
                        var row = opt.rec;
                        if (opt.grid.getCls().indexOf("inventory-grid") == -1)
                            opt.grid.addCls("inventory-grid");
                        if (row.get("FLGHEADER"))
                            opt.classNames.push("inventory-grid-header-column");
                        else
                            opt.classNames.push("inventory-grid-detail-column");
                    };
                })(fieldContext);
                if (fieldContext.column.fieldName == "QTY" || fieldContext.column.fieldName == "QTYREMAINDER")
                    fieldContext.column.renderer = (function (fldContext) {
                        return function (value, values) {
                            var gui = fldContext.sectionContext.gui;
                            var doc = gui.getDocument();
                            var column = fldContext.column;

                            var productWhsBalanceKey = fldContext.column.grid.getStore().getById(values.id).xrec.get("PRODUCTKEY");
                            var productWhsBalance = gui.CacheData.m_warehouseBalances[productWhsBalanceKey];

                            var fs = fldContext.column.formatString;
                            switch (fieldContext.column.fieldName) {
                                case "QTY":
                                    fs = CommonEngine.buildNumDecimalFormat(productWhsBalance.UMORD);
                                    break;
                                case "QTYREMAINDER":
                                    var prodKey = CommonEngine.buildProductKey(productWhsBalance.CODART, productWhsBalance.CODDIV);
                                    var prodRow = XNavHelper.getFromMemoryCache("NAV_MOB_PROD").findByKey(prodKey);
                                    var remainderUm = OrderParameters.getInstance().getUmRemainder();
                                    if (!prodRow.Table.isColumn(remainderUm))
                                        remainderUm = "";
                                    remainderUm = prodRow.get(remainderUm);
                                    fs = CommonEngine.buildNumDecimalFormat(remainderUm);
                                    break;
                            }
                            var strValue = (column.hideValue && column.hideValue == value) ? '&nbsp;' : UserContext.formatNumber(value, fs);
                            return column.grid ? column.grid.formatCell(strValue, column, value, values) : '&nbsp;';
                        };
                    })(fieldContext);
                break;
        }
    };
    
    this.afterSectionCreated = function (context) {
        var sectionConfig = context.sectionConfig;
        var sectionName = sectionConfig.attrs["caption"];
        switch (sectionName) {
            case "INVENTORY_GRID":
                var searchField = context.panel.searchField;
                searchField.searchFields = ["HEADERCODART", "SEARCH"];
                break;
        }
    };
    //#endregion

    //#region others
    this.preSaveDocument = function (gui, doc) {
        //prevent saving
        gui.clearModified(false);
        return true;
    };

    this.afterNotifyLeave = function(context) {
        var gui = context.ctrl;
        delete gui.CacheData;
    };

    this._getInventoryGridStore = function(gui) {
        var localcontext = {
            gui: gui,
            inventoryGridStore: null
        };
        XApp.callCust("guiCustomizer", "mobGuiVanInventoryReport", 'getInventoryGridStore', localcontext);
        if (!localcontext.inventoryGridStore) {
            localcontext.inventoryGridStore = gui.detailCtrl.sections.INVENTORY_GRID.store;
        }
        return localcontext.inventoryGridStore;
    };

    this._refreshInventoryGrid = function(gui) {
        var doc = gui.getDocument();
        //if the model is customized, allow to chose another location for the inventoryGridStore
        var inventoryGridStore = this._getInventoryGridStore(gui);
        doc.WarehouseBalanceRowDetailsStore.rebindSenchaStore(inventoryGridStore);
    };

    this._splitQty = function (prodRow, row, um, cacheData) {
        row.set("QTYINTEGER", 0);
        row.set("QTYREMAINDER", 0);

        if (!prodRow)
            return;

        var integerUmColumn = OrderParameters.getInstance().getUmInteger();
        var remainderUmColumn = OrderParameters.getInstance().getUmRemainder();

        if (prodRow.Table.isColumn(integerUmColumn)) {
            var integerUm = prodRow.get(integerUmColumn);
            var remainderUm = "";
            if (prodRow.Table.isColumn(remainderUmColumn))
                remainderUm = prodRow.get(remainderUmColumn);
            var qty = SalesForceEngine.splitQuantity(prodRow.get("CODART"), row.get("QTY"), um, integerUm, remainderUm, cacheData);
            row.set("QTYINTEGER", qty.qtyInteger);
            row.set("QTYREMAINDER", qty.qtyRemainder);
        }
    };
    
    this._buildQtabsFromDictionary = function (dictionary, translate) {
        var voices = [];
        for (var key in dictionary) {
            var text = dictionary[key];
            if (translate)
                text = UserContext.tryTranslate("[MOBGUIVANINVENTORYREPORT." + text + "]");
            voices.push({ value: key, text: text });
        }
        return voices;
    };

    this._buildCodTypRowQtabs = function (gui, rowTypes) {
        var f = gui.detailCtrl.fields.CODTYPROW;
        if (!f)
            return;

        //add translations
        UserContext.getDecodeEntriesOrdered("TYROW").forEach(function(row) {
            if (rowTypes[row.cod])
                rowTypes[row.cod] = row.des;
        });
        //build qtab
        var voices = [
            { value: SalesForceNameSpace.OrdProdWhsBalance.ALLSELLABLE, text: UserContext.tryTranslate("[MOBGUIVANINVENTORYREPORT.ALLSELLABLE]") },
            { value: SalesForceNameSpace.OrdProdWhsBalance.ALLDELIVERY, text: UserContext.tryTranslate("[MOBGUIVANINVENTORYREPORT.ALLDELIVERY]") }
        ];
        voices = voices.concat(this._buildQtabsFromDictionary(rowTypes));
        //set voices
        f.setOptions(voices);
    };
    //#endregion
}

XApp.registerGuiExtension("mobGuiVanInventoryReport", new _mobGuiVanInventoryReport());