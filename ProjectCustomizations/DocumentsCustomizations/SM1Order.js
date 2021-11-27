function _SM1OrderExtensionCust() {


    this.preRegModel = function (fields, model) {
        var self = this;

        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, model);

        //set "Z_ACCURACY" field (Enh #39101 - DSD customization GPS)
        fields.push({
            name: "GPSVALLATITUDE",
            type: "float",
            fnGet: function (v, rec) {
                return rec._data["GPSVALLATITUDE"];
            },
            fnSet: function (v, rec, value) {

                rec._data["GPSVALLATITUDE"] = value;
                var key = value.toString();
                var accuracy = window.globalAccuracyVariable[key];
                if (window.globalAccuracyVariable && key in window.globalAccuracyVariable)
                    rec.set("Z_ACCURACY", window.globalAccuracyVariable[key]);
            }
        });
    };

    this.postCreation = function (entity) {
        if (this.base && this.base.postCreation)
            this.base.postCreation(entity);

        if (entity._data["GPSVALLATITUDE"] == undefined)
            entity._data["GPSVALLATITUDE"] = 0;
    };


    this.beforeCalculateDelivDate = function (context) {

        /*Customization : ENH 36698: DCODE - URGENT order DTEDELIVERY calculation */
        //if urgent order then DTEDELIV should be today.
        if (context.order.get("TYPDELIV")) {
            context.cancel = true;
            context.dteDeliv = context.order.get("DTEORD");
            return;
        }

        var deliveryDays = SM1OrderHelper.getDedicatedIntParameter("ORDER_DTEDELIV_CUST", context.order.get("CODTYPORD"), -999); //Do not use Number.MIN_VALUE as default value because getDedicatedIntParameter will change the value
        if (deliveryDays == -999)
            return;

        context.cancel = true;

        // calculation starts from DTEORD, but must be at least today
        var now = new Date().toDate();
        var dteOrd = context.order.get("DTEORD");
        var oneDay = 24 * 60 * 60 * 1000;
        var delivDate = ((dteOrd - now) > 0) ? dteOrd : now;

        var calendar = XApp.GlobalData.CALENDARS[UserContext.CodDiv];
        if (!calendar) {
            delivDate = new Date(delivDate.getTime() + (oneDay * deliveryDays));
            return;
        }

        var i = 0;
        while (true) {

            var day = calendar.findByConstraints(new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    new XConstraint("NUMYEAR", "=", delivDate.getFullYear()),
                    new XConstraint("NUMMONTH", "=", delivDate.getMonth() + 1),
                    new XConstraint("DAYOFMONTH", "=", delivDate.getDate())
                ]
            }));

            if (!day) {
                XLog.logWarn("Calendar missing value for " + delivDate.toDateString());
                break;
            }

            if (i >= deliveryDays && day.getValueFromName("WORKDAY") != 0)
                break;

            delivDate = new Date(delivDate.getTime() + oneDay); // add one day
            if (day.getValueFromName("WORKDAY") != 0)
                i++;
        };

        context.dteDeliv = delivDate;
    };

}
XApp.registerDocumentExtensionCust("SM1Order", new _SM1OrderExtensionCust());