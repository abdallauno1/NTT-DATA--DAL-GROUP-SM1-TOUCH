function _CustomerAddrExtensionCust() {
    this.preRegModel = function (fields, model) {

        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, model);

        //set "Z_ACCURACY" field (Enh #39101 - DSD customization GPS)
        fields.push({
            name: "VALLATITUDE",
            type: "float",
            fnGet: function (v, rec)
            {
                return rec._data["VALLATITUDE"];
            },
            fnSet: function (v, rec, value) {

                rec._data["VALLATITUDE"] = value;

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

        if (entity._data["VALLATITUDE"] == undefined)
            entity._data["VALLATITUDE"] = 0;
    };
}
XApp.registerDocumentExtensionCust("CustomerAddr", new _CustomerAddrExtensionCust());