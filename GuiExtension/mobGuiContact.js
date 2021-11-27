//#region _mobGuiContactExtension
function _mobGuiContactExtension() {
    this.preFillSection = function (sectionContext) {
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "ADDR_INFO":
                sectionContext.entityName = 'CustomerAddr';
                var e = sectionContext.entity.getSubEntityStore('CustomerAddr').getAt(0);
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

        return descriptionParts.join(" ");
    };

    this.afterNewDocument = function (gui) {
        var doc = gui.getDocument();
        var d = new Date();
        var code = UserContext.CodUsr + "_" + d.toUTCCompactDate().substring(2);
        code = code.substring(0,30);
        doc.set("CODPARTY", code);
        doc.set("DOCUMENTKEY", CommonEngine.buildCustomerKey(doc.get("CODPARTY")));
        doc.set("FLGPERSON", true);
        var c = new XEntity({ entityName: 'CustomerDiv', data: { CODPARTY: code, CODDIV: UserContext.CodDiv } });
        var cdiv = doc.getSubEntityStore("CustomerDiv");
        c.set("IDWPLEVEL", 0);
        cdiv.add(c);
    };
    this.setFieldStatus = function(context) {
        switch (context.fieldName) {
            case "NUMFAX1":
            case "NUMFAX2":
                if (XUtils.isValidEmail(context.field.getValue())) {
                    break;
                }
            case "NUMPHONE1":
            case "NUMPHONE2":
                var str = context.field.getValue();
                if (!XApp.isEmptyOrWhitespaceString(str)) {
                    var patt1 = /[0-9+ ]/g;
                    var strMatch = str.match(patt1);
                    if (!strMatch || (strMatch && strMatch.length != str.length))
                        context.valid = false;
                    else {
                        if (str.indexOf("+") !== -1) {
                            var regexp = /[+]/gi;
                            var matchesArray = str.match(regexp);
                            if (matchesArray.length !== 1)
                                context.valid = false;
                            else if (str.indexOf("+") !== 0)
                                context.valid = false;
                        }
                    }
                }
                break;
            case "DTEBIRTHDAY":
                if (context.field.getValue().getTime() > new Date().toDate().getTime())
                    context.valid = false;
        }
    };
    this.preCreateLink = function (context) {
        try {
            var codParty = context.ctrl.entity.get("CODPARTY");
            context.linkRow.hcs = new XConstraints({
                logicalOp: "AND",
                constraints: [
                    //if the contact has been canceled, don't show anything
                    context.ctrl.entity.get("FLGANN") ? new XConstraint("CODSTATUS", "=", "2") : new XConstraint("CODPER", "=", codParty),
                    new XConstraint("CODDIV", "=", UserContext.CodDiv),
                    new XConstraint("CODSTATUS", "=", "1")
                ]
        });
        } catch(e) {
            XLog.logEx(e);
        }
    };

    this.afterSaveDocument = function (gui, doc, onFailure, onSuccess) {
        try {
            var self = this;
            var guiDoc = gui.getDocument();
            var localExecutionQueue = new ExecutionQueue();
            var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

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
}
XApp.registerGuiExtension("mobGuiContact", new _mobGuiContactExtension());
//#endregion