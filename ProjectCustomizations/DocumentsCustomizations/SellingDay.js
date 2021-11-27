function _SellingDayExtensionCust() {
    this.preRegModel = function (fields, model) {

        /* Enh 39324 DSD PROCESS - Customization - In open day required to add multi pallets fields 
        for every pallet category like: pallet a, pallet b, pallet c.  Only for DFI division.
        Add in preRegModel this fields: (Z_NUMPALLETSTART_A, Z_NUMPALLETEND_A, Z_NUMPALLETSTART_B, Z_NUMPALLETEND_B, Z_NUMPALLETSTART_C, Z_NUMPALLETEND_C)
        */
        //call base, product implementation
        if (this.base)
            this.base.preRegModel(fields, model);

        //define fake detail entity for pallets and baskets authorization management
        var palletBasketDef = {
            descriptionTemplate: "@TagString@@Description@@Reference@",
            document: model.entities.SellingDay.document,
            documentName: model.entities.SellingDay.documentName,

            entityName: "PalletBasket",
            fields: {
                //Number of pallets from open day
                "NUMPALLETSTART": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of baskets from open day
                "NUMBASKETSTART": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets from close day
                "NUMPALLETEND": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of  baskets from close day
                "NUMBASKETEND": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets A from open day
                "Z_NUMPALLETSTART_A": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets A from close day
                "Z_NUMPALLETEND_A": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets B from open day
                "Z_NUMPALLETSTART_B": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets B from close day
                "Z_NUMPALLETEND_B": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets C from open day
                "Z_NUMPALLETSTART_C": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
                //Number of pallets C from close day
                "Z_NUMPALLETEND_C": { fldName: "NUMPALLETSTART", fldType: "int", fnGet: model._defFnGet, fnSet: model._defFnSet },
            },
            dynFields: {},
            keys: [],
            parent: model.entities["SellingDay"],
            parentName: "SellingDay",
            subEntities: [],
            useAttachments: false,
            useNotes: false
        };

        var subEntitesCollection = model.entities["SellingDay"].subEntities;
        for (var i = 0; i < subEntitesCollection.length; i++) {
            var subEntity = subEntitesCollection[i];
            if (subEntity.entityName == "PalletBasket")
                model.entities["SellingDay"].subEntities[i] = palletBasketDef;
                model.entities["PalletBasket"] = palletBasketDef;
        }
      
};

this.afterCreateClass = function (entityClass) {

    /* Enh 39324 DSD PROCESS - Customization - In open day required to add multi pallets fields 
        for every pallet category like: pallet a, pallet b, pallet c. */
        //call base, product implementation
        if (this.base)
            this.base.afterCreateClass(entityClass);

        //create fake PalletBasket 
        entityClass.prototype.createPalletBasket = function () {
            var pbStore = this.getSubEntityStore("PalletBasket");
            pbStore.clear();
            pbStore.add(new XEntity({
                entityName: "PalletBasket",
                data: {
                    NUMPALLETSTART: this.get("NUMPALLETSTART"),
                    Z_NUMPALLETSTART_A: this.get("Z_NUMPALLETSTART_A"),
                    Z_NUMPALLETSTART_B: this.get("Z_NUMPALLETSTART_B"),
                    Z_NUMPALLETSTART_C: this.get("Z_NUMPALLETSTART_C"),
                    NUMBASKETSTART: this.get("NUMBASKETSTART"),
                    NUMPALLETEND: this.get("NUMPALLETEND"),
                    Z_NUMPALLETEND_A: this.get("Z_NUMPALLETEND_A"),
                    Z_NUMPALLETEND_B: this.get("Z_NUMPALLETEND_B"),
                    Z_NUMPALLETEND_C: this.get("Z_NUMPALLETEND_C"),
                    NUMBASKETEND: this.get("NUMBASKETEND")
                }
            }));
        };


        //update fake PalletBasket from SellingDay
        entityClass.prototype.writeInPalletBasket = function () {
            var pb = this.getSubEntityStore("PalletBasket").getAt(0);
            pb.set("NUMPALLETSTART", this.get("NUMPALLETSTART"));
            pb.set("Z_NUMPALLETSTART_A", this.get("Z_NUMPALLETSTART_A"));
            pb.set("Z_NUMPALLETSTART_B", this.get("Z_NUMPALLETSTART_B"));
            pb.set("Z_NUMPALLETSTART_C", this.get("Z_NUMPALLETSTART_C"));
            pb.set("NUMBASKETSTART", this.get("NUMBASKETSTART"));
            pb.set("NUMPALLETEND", this.get("NUMPALLETEND"));
            pb.set("Z_NUMPALLETEND_A", this.get("Z_NUMPALLETEND_A"));
            pb.set("Z_NUMPALLETEND_B", this.get("Z_NUMPALLETEND_B"));
            pb.set("Z_NUMPALLETEND_C", this.get("Z_NUMPALLETEND_C"));
            pb.set("NUMBASKETEND", this.get("NUMBASKETEND"));
        };

        //update SellingDay from fake PalletBasket
        entityClass.prototype.readFromPalletBasket = function () {
            var pb = this.getSubEntityStore("PalletBasket").getAt(0);
            this.set("NUMPALLETSTART", pb.get("NUMPALLETSTART"));
            this.set("Z_NUMPALLETSTART_A", pb.get("Z_NUMPALLETSTART_A"));
            this.set("Z_NUMPALLETSTART_B", pb.get("Z_NUMPALLETSTART_B"));
            this.set("Z_NUMPALLETSTART_C", pb.get("Z_NUMPALLETSTART_C"));
            this.set("NUMBASKETSTART", pb.get("NUMBASKETSTART"));
            this.set("NUMPALLETEND", pb.get("NUMPALLETEND"));
            this.set("Z_NUMPALLETEND_A", pb.get("Z_NUMPALLETEND_A"));
            this.set("Z_NUMPALLETEND_B", pb.get("Z_NUMPALLETEND_B"));
            this.set("Z_NUMPALLETEND_C", pb.get("Z_NUMPALLETEND_C"));
            this.set("NUMBASKETEND", pb.get("NUMBASKETEND"));
        };
    };
    
};
XApp.registerDocumentExtensionCust("SellingDay", new _SellingDayExtensionCust());