function _NAV_MOB_VISITSExtensionCust() {

    this.afterCreateRefreshButton = function (context) {
        //Remove "refresh" option on VISIT navigator (39097)
        if (context.button != null && context.button.code == "REFRESH")
            context.button = null;
    };

    this.checkOpenVisitFirst = function (context) {
        var self = this;
        var editRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.EditRight.codFunc);

        SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (openDay) {
            if (!openDay) {

                XUI.showMsgBox({
                    title: "[MOB.WARN]",
                    msg: UserContext.tryTranslate("[MOB.ACTION_OPEN_DAY_FIRST]"),
                    icon: "WARN",
                    buttons: 'OK',
                    onResult: Ext.emptyFn
                });

            }
            else {
                   var row = context.nav.navStore.getAt(index);
                   self.base.openVisit(row.get("DOCUMENTKEY"), editRight ? 'EDIT' : 'VIEW');
                  
            }

        })
    
    };


}
XApp.registerNavigatorExtensionCust("NAV_MOB_VISITS", new _NAV_MOB_VISITSExtensionCust());