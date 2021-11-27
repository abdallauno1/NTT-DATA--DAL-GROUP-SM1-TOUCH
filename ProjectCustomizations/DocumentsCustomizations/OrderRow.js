function _OrderRowExtensionCust() {
    this.preRegModel = function (fields, model) {
        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, model);


        /*CUSTOMIZATION ENH 34428: Van inventory - Accept only complete empty product*/
        fields.push({
            name: "Z_ISREADONLYEMPTY",
            type: "bool"
        });


        fields.push({
            name: "Z_EMPTYGROUP",
            type: "string"
        });
    };
};

XApp.registerDocumentExtensionCust("OrderRow", new _OrderRowExtensionCust());