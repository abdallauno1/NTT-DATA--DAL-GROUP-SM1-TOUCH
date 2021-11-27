function _mobGuiVanInventoryReportExtensionCust() {

    //override base function
    //for populating additional custom fields
    //from warehouse balance calculation
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
                                    QTYINV: prodWhsBalance.QTYINV,
                                    //customization
                                    QTYSTART: prodWhsBalance.QTYSTART,
                                    QTYSELL: prodWhsBalance.QTYSELL,
                                    QTYRETURN: prodWhsBalance.QTYRETURN,
                                    QTYMISS: prodWhsBalance.QTYMISS,
                                    QTYSPOIL: prodWhsBalance.QTYSPOIL
                                }
                            });
                            self.base._splitQty(prodRow, header, prodWhsBalance.UMORD, gui.CacheData);
                            doc.WarehouseBalanceRowDetailsStore.add(header);
                            for (var batchKey in prodWhsBalance.OrdBatchWhsBalances) {
                                var batchWhsBalance = prodWhsBalance.OrdBatchWhsBalances[batchKey];
                                if (batchWhsBalance.QTYORD > 0) {
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
                                            QTYINV: batchWhsBalance.QTYINV,
                                            //customization
                                            QTYSTART: batchWhsBalance.QTYSTART,
                                            QTYSELL: batchWhsBalance.QTYSELL,
                                            QTYRETURN: batchWhsBalance.QTYRETURN,
                                            QTYMISS: batchWhsBalance.QTYMISS,
                                            QTYSPOIL: batchWhsBalance.QTYSPOIL
                                        }
                                    });
                                    self.base._splitQty(prodRow, row, prodWhsBalance.UMORD, gui.CacheData);
                                    doc.WarehouseBalanceRowDetailsStore.add(row);
                                }
                            }
                        }
                    }
                    gui.CacheData.m_warehouseBalances = response.OrdProdWhsBalances;
                }
                self.base._refreshInventoryGrid(gui);
                self.base._buildCodTypRowQtabs(gui, availableCodTypRows);
                XUI.hideWait();
            },
            function () {
                //failure
                XUI.showErrorMsgBox({ msg: '[MOBGUIVANINVENTORYREPORT.ERROR_ON_LOAD_WHS_BALANCE]' });
                self.base._buildCodTypRowQtabs(gui, availableCodTypRows);
                XUI.hideWait();
            });
        return true;
    };

};

XApp.registerGuiExtensionCust("mobGuiVanInventoryReport", new _mobGuiVanInventoryReportExtensionCust());