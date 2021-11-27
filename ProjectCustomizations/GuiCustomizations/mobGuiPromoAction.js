

function _mobGuiPromoActionExtensionCust() {
    /*
    Should the list of participants be reset before loading and adding new ones?
    promoAction: Current PromoAction,
    lastCodContractor: Previous contractor code,
    lastLevParticipants: Previous participant level,
    lastDteStartSellin: Previous sellin start date,
    lastDteEndSellin: Previous sellin end date
    */
    this.shouldResetParticipants = function (promoAction, lastCodContractor, lastLevParticipants, lastDteStartSellin, lastDteEndSellin) {
        return promoAction.get("CODCONTRACTOR") != lastCodContractor ||
               promoAction.get("LEVPARTICIPANTS") != lastLevParticipants ||
               promoAction.get("DTESTARTSELLIN").getTime() != lastDteStartSellin.getTime() ||
               promoAction.get("DTEENDSELLIN").getTime() != lastDteEndSellin.getTime();
    };

    /*
    Should the list of delivery points be reset before loading and adding new ones?
    promoAction: Current PromoAction,
    lastCodContractor: Previous contractor code,
    lastDteStartSellin: Previous sellin start date,
    lastDteEndSellin: Previous sellin end date
    */
    this.shouldResetDeliveryPoints = function (promoAction, lastCodContractor, lastDteStartSellin, lastDteEndSellin) {
        return promoAction.get("CODCONTRACTOR") != lastCodContractor ||
               promoAction.get("DTESTARTSELLIN").getTime() != lastDteStartSellin.getTime() ||
               promoAction.get("DTEENDSELLIN").getTime() != lastDteEndSellin.getTime();
    };

    this.fillProductFieldsVisibility = function (promoAction, context) {
        context.visibleFields["QTYESTIMATED"] = 1;
        context.visibleFields["QTYSIMULATED"] = 1;
        context.visibleFields["QTYBASELINE"] = 1;
        context.visibleFields["QTYUPLIFT"] = 1;
        context.visibleFields["TPE_SOURCE"] = 1;
        context.visibleFields["ESTIMATEDDISCOUNTPERCENTAGE1"] = 1;
        context.visibleFields["TOTALESTIMATEDDISCOUNT"] = 1;
        context.visibleFields["INCIDENCEDISCOUNTPERCENTAGE1"] = 1;
        context.visibleFields["TOTALINCIDENCEDISCOUNT"] = 1;
    }
};

XApp.registerGuiExtensionCust("mobGuiPromoAction", new _mobGuiPromoActionExtensionCust());