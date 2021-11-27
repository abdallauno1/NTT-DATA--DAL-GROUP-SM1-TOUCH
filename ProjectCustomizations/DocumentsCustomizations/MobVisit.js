function _MobVisitExtensionCust() {
    this.preRegModel = function (fields, associations) {
        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, associations);

        //Customization ENH 34409: Capture timestamp on first visit opening
        fields.push({
            name: "Z_OPENTIME",
            type: "DateTime",
            fnGet: function (v, rec) {
                if (rec.getSubEntityStore("MVCustomerSurvey").getCount() > 0) {
                    return rec.getSubEntityStore("MVCustomerSurvey").getAt(0).get("Z_OPENTIME"); 
                }
                return Constants.SM1MINDATE;
            }
        });

        //Customization ENH 34408: Capture coordinates on first visit opening
        fields.push({
            name: "Z_GPSOPENLATITUDE",
            type: "float",
            fnGet: function (v, rec) {
                if (rec.getSubEntityStore("MVCustomerSurvey").getCount() > 0) {
                    return rec.getSubEntityStore("MVCustomerSurvey").getAt(0).get("Z_GPSOPENLATITUDE");
                }
                return 0;
            }
        });
        fields.push({
            name: "Z_GPSOPENLONGITUDE",
            type: "float",
            fnGet: function (v, rec) {
                if (rec.getSubEntityStore("MVCustomerSurvey").getCount() > 0) {
                    return rec.getSubEntityStore("MVCustomerSurvey").getAt(0).get("Z_GPSOPENLONGITUDE");
                }
                return 0;
            }
        });
    };
};

XApp.registerDocumentExtensionCust("MobVisit", new _MobVisitExtensionCust());