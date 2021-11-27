//salesExecutuionEnginExentsionCust 

var CommonNameSpaceCust = {
    //Authorization function (AUTHF qtab)
    AUTHF: {

        //Van inventory
        INVENTORY_2: "INVENTORY_2",
        //Type pallet and basket in open and close day screen
        STKCOR_2: "STKCOR_2",

    }
};



function _commonEngineExtensionCust() {

    this.beforeValidateVAT = function (context) {

        switch (context.nationCode) {
            case "SD":
            case "SDG":
                context.result = true;
                context.canceled = true;
                break;
        }
    };

    this.beforeValidateTaxCode = function (context) {

        switch (context.nationCode) {
            case "SD":
            case "SDG":
                context.result = true;
                context.canceled = true;
                break;
        }

    };

    this.afterValidateNewCustomerRequest = function (context) {
        var newCustRequest = context.newCustomerRequest;
        var newCust = context.newCustomer;
        switch (newCustRequest.customerType) {
            case "CONSUMER":
                newCust.set("FLGCUSTSALE", false);
                newCust.set("FLGCUSTDELIV", false);
                newCust.set("FLGCUSTINV", false);
                newCust.set("DTEBIRTHDAY", Constants.SM1MINDATE);
                newCust.set("CODCUSTINV", "");
                var codDiv = UserContext.CodDiv;
                var customerDiv = newCust.getSubEntityStore("CustomerDiv").findBy(function (r) { return r.get("CODDIV") == codDiv; });

                if (customerDiv) {
                    customerDiv.set("CODCUSTDELIV", "");
                    customerDiv.set("Z_DTECONTACTED", Constants.SM1MINDATE);
                    customerDiv.set("Z_FLGCONSUMER", true);
                }
        }
    };

    //#region Custom methods

    this.calculateOpenInvoicesBalances = function (openInvoices) {
        var openInvoicesBalances = {};
        var encBalances = {};
        var constraints = new XConstraints({
            logicalOp: "AND",
            constraints: [
                new XConstraint("FLGPROCESSED", SqlRelationalOperator.Equal, false),
                new XConstraint("NUMDOC", SqlRelationalOperator.In, Ext.Array.map(openInvoices, function (x) { return x.get("NUMDOC") }))
            ]
        });
        var encBalanceNavRecords = XNavHelper.getNavRecords("NAV_MOB_ENCBALANCE", constraints);
        //unflatten the records into a hashset structure for better search performance
        encBalanceNavRecords.forEach(function (e) {
            var key = e.getValueFromName("NUMDOC");
            var coll = encBalances[key];
            if (!coll) {
                coll = [];
                encBalances[key] = coll;
            }
            coll.push(e);
        });

        openInvoices.forEach(function (openInvoice) {
            var openInvoiceKey = openInvoice.get("NUMDOC");
            var openInvoiceBalances = encBalances[openInvoiceKey];
            var openInvoiceDteDoc = openInvoice.get("DTEDOC");
            var openInvoiceCodTypDoc = openInvoice.get("CODTYPDOC");
            var openInvoiceValRate = openInvoice.get("VALRATEEUR");
            var encBalanceEntity = new XEntity({ entityName: "EncashmentBalance" });
            encBalanceEntity.set("VALABBUONO", openInvoiceValRate);
            if (openInvoiceBalances) {
                var targetBalances = Ext.Array.filter(openInvoiceBalances, function (item) {
                    return (item.get("DTEDOC").getTime() == openInvoiceDteDoc.getTime() && item.get("CODTYPDOC") == openInvoiceCodTypDoc);
                });
                if (targetBalances && targetBalances.length) {
                    for (var i = 0; i < targetBalances.length; i++) {
                        var e = targetBalances[i];
                        if (e.get("FLGCLOSED")) {
                            encBalanceEntity.set("VALABBUONO", 0);
                            break;
                        }
                        else
                            encBalanceEntity.set("VALABBUONO", encBalanceEntity.get("VALABBUONO") - e.get("VALENCDET"));
                    }
                }
            }
            openInvoicesBalances[openInvoiceKey] = encBalanceEntity;
        });
        return openInvoicesBalances;
    };

    

    //#endregion


    /*
   Removes encashment from deposit. 
   Load deposit, removes encashment, updates deposit balance and saves deposit.
   "codUsr" :Key of deposit and encashment
   "idDep": Key of deposit and encashment
   "codParty": Key of encashment
   "codDiv": Key of encashmen
   "dteEnc": Key of encashmen
   Returns True if remove succedded */
    //Customization 41340: CUSTOMIZATION: Allow two cash collection for the same customer in the same day, same deposit
    this.removeEncashmentCust = function (codUsr, idDep, codParty, codDiv, dteEnc, z_idenc, onFailure, onSuccess) {
        XDocs.loadDocument(CommonEngine.buildDepositKey(codUsr, idDep), false, onFailure, function (depositStore) {
            try {
                if (!depositStore || !depositStore.getAt(0)) {
                    if (onFailure)
                        onFailure("Failed to load deposit.");
                } else {
                    var deposit = depositStore.getAt(0);
                    var encashment = deposit.getSubEntityStore("Encashment").findBy(function (enc) {
                        return enc.get("CODPARTY") == codParty &&
                            enc.get("CODDIV") == codDiv &&
                            enc.get("DTEENC") - dteEnc == 0 &&
                            enc.get("IDDEP") == idDep &&
                            enc.get("CODUSR") == codUsr &&
                            enc.get("IDENC") == z_idenc;
                    });
                    deposit.getSubEntityStore("Encashment").remove(encashment);
                    CommonEngine.calculateDeposit(deposit);

                    XDocs.saveDocument(deposit, false, onFailure, function () {
                        var navData = XNavHelper.getFromMemoryCache('NAV_MOB_ENCBALANCE');
                        if (navData) {
                            var row = navData.findByConstraints(new XConstraints({
                                logicalOp: 'AND',
                                constraints: [
                                    { attr: 'CODPARTY', op: '=', value: codParty },
                                    { attr: 'CODDIV', op: '=', value: codDiv },
                                    { attr: 'DTEENC', op: '=', value: dteEnc },
                                    { attr: 'IDDEP', op: '=', value: idDep },
                                    { attr: 'IDENC', op: '=', value: z_idenc },
                                    { attr: 'CODUSR', op: '=', value: codUsr }
                                ]
                            }));

                            if (row) {
                                navData.removeRow(row);
                                XNavHelper.updateCache('NAV_MOB_ENCBALANCE', navData, onFailure,
                                    function () {
                                        if (onSuccess)
                                            onSuccess(true);
                                    });
                                return;
                            }
                        }

                        if (onSuccess)
                            onSuccess(true);
                    }, false);
                }

                return;

            } catch (e) {
                XLog.logEx(e);
            }

            //if we reach this point then something went wrong.
            if (onSuccess)
                onSuccess(false);
        });
    }

    

};

var CommonEngineCust = new _commonEngineExtensionCust();

XApp.registerExtensionCust("engineCustomizer", "commonEngine", new _commonEngineExtensionCust());