
//salesExecutuionEnginExentsionCust example

function _salesExecutionEngineExtensionCust() {

    this.beforeIsSurveyTypeAvailable = function (context) {
        if (this.base)
            this.base.beforeIsSurveyTypeAvailable(context);


    };

    this.beforecheckNewLimitVisit = function (context) {
        //var isValid = false;
        //var response = new EngineResponse();

        //var user = CommonEngine.getUserNavRow(UserContext.CodUsr, UserContext.CodDiv, UserContext.CodGrp);

        //if (user.get("CODLIMITNEWVISIT") == SalesExecutionNameSpace.LimitNewVisit.NO || Object.keys(SalesExecutionNameSpace.LimitNewVisit).indexOf(user.get("CODLIMITNEWVISIT")) == -1) {
        //    isValid = true;
        //}
        //var route = XNavHelper.getNavRecord("NAV_MOB_USERS", new XConstraint("CODUSR", "=", UserContext.CodUsr));
        //var limitVisit = route.get("CODLIMITNEWVISIT");
        //SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv,
        //    function () {
        //        XUI.hideWait();
        //        XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]') });
        //    },
        //    function (found) {
        //        XUI.hideWait();
        //        if (!found && limitVisit == "YES") {
        //            XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]') });
        //        }
        //        isValid = false;
        //    })
        //return isValid;
    };

    this.beforeCanScheduleClient = function (from, to, appointments, codParty, contactMode, flgCheckLocation, flgNewLimitVisit, onSuccess, context) {
            // code is here....
    }
    /*
  CUSTOMIZATIOn 41227: Customization: Limit users from  creating visits outside of a selling day. MADY 20190627
  */
    this.beforeCanSchedule = function (context) {

        if (window.skipBeforeCanSchedule) {
            delete window.skipBeforeCanSchedule;
            return; //continue base implementation
        }

        var self = this;
        var limitedNewVisitRight = UserContext.checkRight(SalesExecutionNameSpace.CustomerSurveyRights.LimitedNewVisitRight.codDoc, SalesExecutionNameSpace.CustomerSurveyRights.LimitedNewVisitRight.codSubDoc, SalesExecutionNameSpace.CustomerSurveyRights.LimitedNewVisitRight.codFunc);
        if (limitedNewVisitRight) {

            context.canceled = true;

            //Control: it is not possible to open a day if present another record in status "STARTED" and a message will be shown to the user "Close the previous DAY: [specify the DTEDAY or the record in status STARTED]"
            SalesForceEngine.checkOpenDayActivity(UserContext.CodUsr, UserContext.CodDiv, XUI.showExceptionMsgBox, function (found) {
                if (found) {
                    //Set global variable to skip this check next time;
                    window.skipBeforeCanSchedule = true;

                    //re-call base implementation
                    SalesExecutionEngine.canSchedule(context.from, context.to, context.appointments,
               context.customerSurveyRow, context.contactMode, context.flgCheckLocation, context.flgNewLimitVisit,
               context.onSuccess);

                }
                else {

                    //continue with error
                    var response = new EngineResponse();
                    response.returnValue = false;
                    response.message = UserContext.tryTranslate('[MOB.NO_OPEN_DAY_ACTIVITY_STARTED]');
                    response.messageType = "ERR";

                    context.onSuccess(response);
                }
            });

            return;
        }
        //continue  base implementation;
    };

};

XApp.registerExtensionCust("engineCustomizer", "salesExecutionEngine", new _salesExecutionEngineExtensionCust());
