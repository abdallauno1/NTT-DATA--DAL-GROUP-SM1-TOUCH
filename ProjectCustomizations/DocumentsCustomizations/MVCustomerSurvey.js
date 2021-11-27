function _MVCustomerSurveyExtensionCust() {
    this.afterCreateClass = function (entityClass) {
        //Call 
        if (this.base)
            this.base.afterCreateClass(entityClass);


        //Customization ENH 34409: Capture timestamp on first visit opening &
        //Customization ENH 34408: Capture coordinates on first visit opening
        //Override suspend to clear Z_OPENTIME field
        if (entityClass.prototype.suspend) {
            entityClass.prototype.orig_suspend = entityClass.prototype.suspend;
            entityClass.prototype.suspend = function () {
                this.orig_suspend();
                //reset Z_OPENTIME field
                this.set("Z_OPENTIME", Constants.SM1MINDATE);
                //reset Z_GPSOPENLATITUDE,Z_GPSOPENLONGITUDE, Z_ACCURACYOPENVISIT fields
                this.set("Z_GPSOPENLATITUDE", 0);
                this.set("Z_GPSOPENLONGITUDE", 0);
                this.set("Z_ACCURACYOPENVISIT", 0);
            };
        }
    };
    this.preRegModel = function (fields, associations) {
        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, associations);

        //set "Z_ACCURACYOPENVISIST" field (Enh #39101 - DSD customization GPS)
        fields.push({
            name: "Z_GPSOPENLATITUDE",
            type: "float",
            fnGet: function (v, rec) {
                return rec._data["Z_GPSOPENLATITUDE"];
            },
            fnSet: function (v, rec, value) {
                rec._data["Z_GPSOPENLATITUDE"] = value;
                var key = value.toString();
                var accuracy = window.globalAccuracyVariable[key];
                if (window.globalAccuracyVariable && key in window.globalAccuracyVariable)
                    rec.set("Z_ACCURACYOPENVISIT", window.globalAccuracyVariable[key]);
            }
        });

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

        if (entity._data["Z_GPSOPENLATITUDE"] == undefined)
            entity._data["Z_GPSOPENLATITUDE"] = 0;


    };
};
XApp.registerDocumentExtensionCust("MVCustomerSurvey", new _MVCustomerSurveyExtensionCust());